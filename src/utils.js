import fs from 'node:fs';
import path from 'node:path';
//
import check from 'check-types';
import fetch, { FormData, Blob } from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import randomUseragent from 'random-useragent';
//
import * as eagle from './eagle.js';
import * as setting from './setting.js';

const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/;

let allConfig = null;

const createEagleFolder = async ({ parentName, name, summary, mediaCount, source, url }) => {
  if (check.not.string(parentName) || check.emptyString(parentName)) {
    throw Error('utils | createEagleFolder | parameter "parentName" should be non-empty "string"');
  }
  if (check.not.string(name) || check.emptyString(name)) {
    throw Error('utils | createEagleFolder | parameter "name" should be non-empty "string"');
  }
  if (check.not.number(mediaCount)) {
    throw Error('utils | createEagleFolder | parameter "mediaCount" should be "number"');
  }
  if (check.not.string(source) || check.emptyString(source)) {
    throw Error('utils | createEagleFolder | parameter "source" should be non-empty "string"');
  }
  if (check.not.string(url) || !urlRegex.test(url)) {
    throw Error('utils | createEagleFolder | parameter "url" should be url "string"');
  }
  await eagle.updateFolder({ name: '.import' });
  await eagle.updateFolder({ name: parentName, parentName: '.import' });
  return await eagle.updateFolder({
    name,
    parentName,
    description: JSON.stringify({ summary, media_count: mediaCount, source, url }),
  });
};

const formatDateTime = (input, style) => {
  // format as 'yyyyMMdd_HHmmss_SSS'
  if (check.not.number(style)) {
    style = 0;
  }
  let dateTime;
  if (check.number(input) || check.string(input)) {
    dateTime = new Date(input);
  } else if (input instanceof Date) {
    dateTime = input;
  } else {
    dateTime = new Date();
  }
  const year = String(dateTime.getUTCFullYear()).padStart(4, 0);
  const month = String(dateTime.getUTCMonth() + 1).padStart(2, 0);
  const day = String(dateTime.getUTCDate()).padStart(2, 0);
  const hour = String(dateTime.getUTCHours()).padStart(2, 0);
  const minute = String(dateTime.getMinutes()).padStart(2, 0);
  const second = String(dateTime.getSeconds()).padStart(2, 0);
  const milliSecond = String(dateTime.getMilliseconds()).padStart(3, 0);
  if (style === 0) {
    return `${year}${month}${day}_${hour}${minute}${second}_${milliSecond}`;
  }
  return dateTime.toString();
};

const getHtmlByFetch = ({ url, fetchOption = {}, randomUserAgent = true }) => {
  // setting
  if (!allConfig) {
    allConfig = setting.get();
  }
  // parameter
  if (check.not.string(url) || !urlRegex.exec(url)) {
    throw Error('utils | getHtml | parameter "url" should be "string" of valid url');
  }
  if (check.not.boolean(randomUserAgent)) {
    throw Error('utils | getHtml | parameter "randomUserAgent" should be "bool"');
  }
  // fetch option
  if (check.not.object(fetchOption)) {
    fetchOption = {};
  }
  if (check.not.object(fetchOption.headers)) {
    fetchOption.headers = {};
  }
  if (randomUserAgent) {
    fetchOption.headers['User-Agent'] = getRandomUsarAgent();
  }
  // other option
  if (check.string(allConfig.browser.fetch.proxy) && urlRegex.exec(allConfig.browser.fetch.proxy)) {
    let proxyAgent;
    try {
      proxyAgent = new HttpsProxyAgent(allConfig.browser.fetch.proxy);
    } catch (error) {
      throw new Error(`utils | getHtml | fetch ${url} | proxy issue | proxy = ${allConfig.browser.fetch.proxy} | ${error.message}`);
    }
    fetchOption.agent = proxyAgent;
  }
  // fetch
  return Promise.race([
    fetch(url, fetchOption)
      .catch((error) => {
        throw new Error(`utils | getHtml | fetch ${url} | network issue | ${error.message}`);
      })
      .then((response) => {
        if (response.status <= 199 || response.status >= 400) {
          throw new Error(`utils | getHtml | fetch ${url} | incorrect http status code | response.status = ${response.status}`);
        }
        return response.text();
      }),
    sleep(allConfig.browser.fetch.timeoutMs)
      .then(() => {
        throw new Error(`utils | getHtml | fetch ${url} | network issue | timeout after ${allConfig.browser.fetch.timeoutMs} ms`);
      }),
  ]).then((html) => {
    // debug
    if (allConfig.browser.fetch.debug.enable) {
      const file = path.resolve(allConfig.runtime.wkdir, `${Date.now()}.html`);
      console.log(`HTML content of "${url}" is saved to "${file}".`);
      fs.writeFileSync(file, JSON.stringify(html, null, 2));
    }
    //
    return html;
  });
};

const getRedirectByFetch = ({ url, fetchOption = {}, randomUserAgent = true }) => {
  // setting
  if (!allConfig) {
    allConfig = setting.get();
  }
  // parameter
  if (check.not.string(url) || !urlRegex.exec(url)) {
    throw Error('utils | getHtml | parameter "url" should be "string" of valid url');
  }
  if (check.not.boolean(randomUserAgent)) {
    throw Error('utils | getHtml | parameter "randomUserAgent" should be "bool"');
  }
  // fetch option
  if (check.not.object(fetchOption)) {
    fetchOption = {};
  }
  if (check.not.object(fetchOption.headers)) {
    fetchOption.headers = {};
  }
  if (randomUserAgent) {
    fetchOption.headers['User-Agent'] = getRandomUsarAgent();
  }
  fetchOption.redirect = 'manual';
  // other option
  if (check.string(allConfig.browser.fetch.proxy) && urlRegex.exec(allConfig.browser.fetch.proxy)) {
    let proxyAgent;
    try {
      proxyAgent = new HttpsProxyAgent(allConfig.browser.fetch.proxy);
    } catch (error) {
      throw new Error(`utils | getRedirect | fetch ${url} | proxy issue | proxy = ${allConfig.browser.fetch.proxy} | ${error.message}`);
    }
    fetchOption.agent = proxyAgent;
  }
  // fetch
  return Promise.race([
    fetch(url, fetchOption)
      .catch((error) => {
        throw new Error(`utils | getRedirect | fetch ${url} | network issue | ${error.message}`);
      })
      .then((response) => {
        return response.headers.get('Location') || response.headers.get('location') || '';
      }),
    sleep(allConfig.browser.fetch.timeoutMs)
      .then(() => {
        throw new Error(`utils | getRedirect | fetch ${url} | network issue | timeout after ${allConfig.browser.fetch.timeoutMs} ms`);
      }),
  ]);
};

puppeteer.use(StealthPlugin());

const pptr = {
  browser: null,
  page: null,
  cookie: null,
};

const getHtmlByPuppeteer = async ({ url, headerMap = {}, blockUrlList = [], randomUserAgent = true, cookieParam = [] }) => {
  // setting
  if (!allConfig) {
    allConfig = setting.get();
  }
  // parameter
  if (check.not.string(url) || !urlRegex.exec(url)) {
    throw Error('utils | getHtmlByPuppeteer | parameter "url" should be "string" of valid url');
  }
  if (check.not.object.of.string(headerMap)) {
    throw Error('utils | getHtmlByPuppeteer | parameter "headerMap" should be "Object<String>"');
  }
  if (check.not.array.of.string(blockUrlList)) {
    throw Error('utils | getHtmlByPuppeteer | parameter "blockUrlList" should be "Array<String>"');
  }
  if (check.not.boolean(randomUserAgent)) {
    throw Error('utils | getHtmlByPuppeteer | parameter "randomUserAgent" should be "bool"');
  }
  // brower
  const browserOption = {
    args: [ '--window-size=1920,1080' ],
    defaultViewport: null,
    devtools: allConfig.browser.puppeteer.debug.enable,
    headless: allConfig.browser.puppeteer.debug.enable ? false : 'new',
  };
  if (check.string(allConfig.browser.puppeteer.proxy) && urlRegex.exec(allConfig.browser.puppeteer.proxy)) {
    browserOption.args.push(`--proxy-server=${allConfig.browser.puppeteer.proxy}`);
  }
  if (!pptr.browser) {
    pptr.browser = await puppeteer.launch(browserOption);
  }
  const browser = pptr.browser;
  // page
  if (!pptr.page) {
    pptr.page = await browser.newPage();
    // blocked url
    if (check.nonEmptyArray(blockUrlList)) {
      await pptr.page.setRequestInterception(true);
      pptr.page.on('request', (request) => {
        const url = request.url();
        const needBlock = blockUrlList.reduce((prev, curr) => {
          return prev || url.includes(curr);
        }, false);
        if (needBlock) {
          request.abort();
          return;
        }
        request.continue();
      });
    }
  }
  // cookie
  if (!check.array(pptr.cookie)) {
    pptr.cookie = [];
  }
  const isCookieLoaded = pptr.cookie.reduce((prev, curr) => {
    return prev || (curr === cookieParam);
  }, false);
  if (!isCookieLoaded) {
    for (let i = 0; i < cookieParam.length; i++) {
      await pptr.page.setCookie(cookieParam[i]);
    }
    pptr.cookie.push(cookieParam);
  }
  //
  const page = pptr.page;
  if (check.not.emptyObject(headerMap)) {
    await page.setExtraHTTPHeaders(headerMap);
  }
  if (randomUserAgent) {
    await page.setUserAgent(getRandomUsarAgent());
  }
  // html
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: allConfig.browser.puppeteer.timeoutMs });
  } catch (e) {
    throw Error(`utils | getHtmlByPuppeteer | goto "${url}" | ${e.message}`);
  }
  // eslint-disable-next-line no-undef
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  // debug
  if (allConfig.browser.puppeteer.debug.enable) {
    const timestampMs = Date.now();
    const htmlFile = path.resolve(allConfig.runtime.wkdir, `${timestampMs}.html`);
    console.log(`HTML content of "${url}" is saved to "${htmlFile}".`);
    fs.writeFileSync(htmlFile, html);
    const screenshotFile = path.resolve(allConfig.runtime.wkdir, `${timestampMs}.png`);
    await page.screenshot({ path: screenshotFile, fullPage: true });
    console.log(`Screenshot of "${url}" is saved to "${htmlFile}".`);
  }
  //
  return html;
};

const getCookieByPuppeteer = async ({ url, headerMap = {}, blockUrlList = [], randomUserAgent = true }) => {
  // setting
  if (!allConfig) {
    allConfig = setting.get();
  }
  // parameter
  if (check.not.string(url) || !urlRegex.exec(url)) {
    throw Error('utils | getHtmlByPuppeteer | parameter "url" should be "string" of valid url');
  }
  if (check.not.object.of.string(headerMap)) {
    throw Error('utils | getHtmlByPuppeteer | parameter "headerMap" should be "Object<String>"');
  }
  if (check.not.array.of.string(blockUrlList)) {
    throw Error('utils | getHtmlByPuppeteer | parameter "blockUrlList" should be "Array<String>"');
  }
  if (check.not.boolean(randomUserAgent)) {
    throw Error('utils | getHtmlByPuppeteer | parameter "randomUserAgent" should be "bool"');
  }
  // brower
  const browserOption = {
    args: [ '--window-size=1920,1080' ],
    defaultViewport: null,
    devtools: allConfig.browser.puppeteer.debug.enable,
    headless: allConfig.browser.puppeteer.debug.enable ? false : 'new',
  };
  if (check.string(allConfig.browser.puppeteer.proxy) && urlRegex.exec(allConfig.browser.puppeteer.proxy)) {
    browserOption.args.push(`--proxy-server=${allConfig.browser.puppeteer.proxy}`);
  }
  if (!pptr.browser) {
    pptr.browser = await puppeteer.launch(browserOption);
  }
  const browser = pptr.browser;
  // page
  if (!pptr.page) {
    pptr.page = await browser.newPage();
    // blocked url
    if (check.nonEmptyArray(blockUrlList)) {
      await pptr.page.setRequestInterception(true);
      pptr.page.on('request', (request) => {
        const url = request.url();
        const needBlock = blockUrlList.reduce((prev, curr) => {
          return prev || url.includes(curr);
        }, false);
        if (needBlock) {
          request.abort();
          return;
        }
        request.continue();
      });
    }
  }
  //
  const page = pptr.page;
  if (check.not.emptyObject(headerMap)) {
    await page.setExtraHTTPHeaders(headerMap);
  }
  if (randomUserAgent) {
    await page.setUserAgent(getRandomUsarAgent());
  }
  // html
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: allConfig.browser.puppeteer.timeoutMs });
  } catch (e) {
    throw Error(`utils | getCookieByPuppeteer | goto "${url}" | ${e.message}`);
  }
  return await page.cookies();
};

const getRandomUsarAgent = () => {
  return randomUseragent.getRandom((ua) => {
    const ualc = ua.userAgent.toLowerCase();
    return (
      (
        ualc.includes('firefox') ||
        ualc.includes('chrome') ||
        ualc.includes('edge') ||
        ualc.includes('safari')
      ) &&
      (
        ualc.includes('windows') ||
        ualc.includes('mac')
      ) &&
      !(
        ualc.includes('mobile') ||
        ualc.includes('arm') ||
        ualc.includes('linux') ||
        ualc.includes('firefox/29')
      )
    );
  });
};

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const uploadViaHttp = ({ filePath, url }) => {
  const formData = new FormData();
  formData.append('file', new Blob([ fs.readFileSync(filePath) ]), path.basename(filePath));
  const text = fetch(url, {
    method: 'POST',
    body: formData,
  }).catch((error) => {
    throw new Error(`utils | uploadViaHttp | fetch ${url} | network issue | ${error.message}`);
  }).then((response) => {
    if (response.status <= 199 || response.status >= 400) {
      throw new Error(`utils | uploadViaHttp | fetch ${url} | incorrect http status code | response.status = ${response.status}`);
    }
    return response.text();
  });
  return text;
};

export {
  urlRegex,
  createEagleFolder,
  getHtmlByFetch,
  getRedirectByFetch,
  getHtmlByPuppeteer,
  getCookieByPuppeteer,
  formatDateTime,
  sleep,
  uploadViaHttp,
  pptr,
};
