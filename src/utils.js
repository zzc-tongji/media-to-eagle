import check from 'check-types';
import fs from 'fs';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import puppeteer from 'puppeteer';

const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/;

const getHtml = async ({ url, fetchOption = {}, proxy = '', timeoutMs = 10000, debug = false }) => {
  // parameter
  if (check.not.string(url) || !urlRegex.exec(url)) {
    throw Error('utils | getHtml | parameter "url" should be "string" of valid url');
  }
  if ((check.not.string(proxy)) || (check.nonEmptyString(proxy) && !urlRegex.exec(proxy))) {
    throw Error('utils | getHtml | parameter "proxy" should be "string" of valid url OR empty string');
  }
  if (check.not.greaterOrEqual(timeoutMs, 10000)) {
    throw Error('utils | getHtml | parameter "timeout" should be "number" greator than 10000');
  }
  if (check.not.boolean(debug)) {
    throw Error('utils | getHtml | parameter "debug" should be "bool"');
  }
  // fetch option
  if (check.not.object(fetchOption)) {
    fetchOption = {};
  }
  if (check.not.object(fetchOption.headers)) {
    fetchOption.headers = {};
  }
  fetchOption.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36';
  // other option
  if (check.not.emptyString(proxy)) {
    let proxyAgent;
    try {
      proxyAgent = new HttpsProxyAgent(proxy);
    } catch (error) {
      throw new Error(`utils | getHtml | fetch ${url} | proxy issue | proxy = ${proxy} | ${error.message}`);
    }
    fetchOption.agent = proxyAgent;
  }
  // fetch
  const html = Promise.race([
    fetch(url, fetchOption)
      .catch((error) => {
        throw new Error(`utils | getHtml | fetch ${url} | network issue | ${error.message}`);
      })
      .then((response) => {
        if (response.status <= 199 || response.status > 400) {
          throw new Error(`utils | getHtml | fetch ${url} | incorrect http status code | response.status = ${response.status}`);
        }
        return response.text();
      }),
    sleep(timeoutMs)
      .then(() => {
        throw new Error(`utils | getHtml | fetch ${url} | network issue | timeout after ${timeoutMs} ms`);
      }),
  ]);
  if (debug) {
    const file = 'get-html.html';
    console.log(`HTML content of "${url}" is saved to "${file}".`);
    fs.writeFileSync(file, html);
  }
  return html;
};

const getHtmlByPuppeteer = async ({ url, header = {}, blockUrlList = [], timeoutMs = 10000, proxy = '', debug = false }) => {
  // parameter
  if (check.not.string(url) || !urlRegex.exec(url)) {
    throw Error('utils | getHtmlByPuppeteer | parameter "url" should be "string" of valid url');
  }
  if (check.not.object.of.string(header)) {
    throw Error('utils | getHtmlByPuppeteer | parameter "header" should be "Object<String>"');
  }
  if (check.not.array.of.string(blockUrlList)) {
    throw Error('utils | getHtmlByPuppeteer | parameter "blockUrlList" should be "Array<String>"');
  }
  if ((check.not.string(proxy)) || (check.nonEmptyString(proxy) && !urlRegex.exec(proxy))) {
    throw Error('utils | getHtmlByPuppeteer | parameter "proxy" should be "string" of valid url OR empty string');
  }
  if (check.not.greaterOrEqual(timeoutMs, 10000)) {
    throw Error('utils | getHtmlByPuppeteer | parameter "timeout" should be "number" greator than 10000');
  }
  if (check.not.boolean(debug)) {
    throw Error('utils | getHtmlByPuppeteer | parameter "debug" should be "bool"');
  }
  // brower
  const browserOption = {
    args: [],
    defaultViewport: null,
    devtools: debug,
    headless: debug ? false : 'new',
  };
  if (check.nonEmptyString(proxy)) {
    browserOption.args.push(`--proxy-server=${proxy}`);
  }
  const browser = await puppeteer.launch(browserOption);
  // page
  const page = (await browser.pages())[0] || await browser.newPage();
  if (check.not.emptyObject(header)) {
    await page.setExtraHTTPHeaders(header);
  }
  if (check.nonEmptyArray(blockUrlList)) {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
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
  // html
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: timeoutMs });
  } catch (e) {
    throw Error(`utils | getHtmlByPuppeteer | goto "${url}" | ${e.message}`);
  }
  // eslint-disable-next-line no-undef
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  if (debug) {
    const file = 'get-html-by-puppeteer.html';
    console.log(`HTML content of "${url}" is saved to "${file}".`);
    fs.writeFileSync(file, html);
    await sleep(10000);
  }
  await browser.close();
  return html;
};

const formatDateTime = (input, style = 0) => {
  // format as 'yyyyMMdd_HHmmss_SSS'
  let dateTime;
  if (typeof input == 'number' || typeof input == 'string') {
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

const generateXml = ({ key, value }) => {
  if (typeof key !== 'string' || key === '') {
    throw Error('parameter [key]: type of [string], non-empty, required');
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw Error('parameter [value]: type of [string], default as [""]');
  }
  if (!value) {
    return '';
  }
  return `<${key} v="${value}" />`;
};

const generateXmlList = ({ data, selector = '', tagName = '' }) => {
  if (!(data instanceof Array)) {
    throw Error('parameter [data]: type of [string], required');
  }
  if (typeof selector !== 'string') {
    throw Error('parameter [selector]: type of [string], default as [""]');
  }
  if (typeof tagName !== 'string') {
    throw Error('parameter [tagName]: type of [string], default as [""]');
  }
  // eslint-disable-next-line no-unused-vars
  const itemList = data.map((d) => {
    return eval(`d${selector}`).toString();
  }).filter(v => v);
  if (itemList.length <= 0) {
    return '';
  }
  return `<${tagName}>${itemList.map(i => `<i v="${i}">`).join('')}</${tagName}>`;
};

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export { urlRegex, getHtml, getHtmlByPuppeteer, formatDateTime, generateXml, generateXmlList, sleep };
