import * as fs from 'node:fs';
import * as path from 'node:path';
//
import check from 'check-types';
import * as cheerio from 'cheerio';
//
import * as eagle from './eagle.js';
import * as setting from './setting.js';
import * as utils from './utils.js';

let allConfig = {};
let siteConfig = {
  headerMap: {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
  },
  interval: 10000,
};
//
const cache = {
  userXIdMap: {},
};
const init = () => {
  allConfig = setting.get();
  siteConfig = allConfig.site['com.x'];
};

const getUrl = (textWithUrl = '') => {
  if (check.not.string(textWithUrl)) {
    return '';
  }
  const url = utils.urlRegex.exec(textWithUrl)?.[0] || '';
  if (check.emptyString(url)) {
    return '';
  }
  //
  if (/x.com\/([\S]+)\/status\/([\d]+)/.test(url)) {
    return url;
  }
  return '';
};

const getUserInfo = async (userXId) => {
  if (cache.userXIdMap[userXId]) {
    return cache.userXIdMap[userXId];
  }
  // get html
  const opt = {};
  if (check.object(siteConfig.headerMap)) {
    opt.headerMap = siteConfig.headerMap;
  }
  if (
    (check.string(siteConfig.headerMap['User-Agent']) && check.not.emptyArray(siteConfig.headerMap['User-Agent'])) ||
    (check.string(siteConfig.headerMap['user-agent']) && check.not.emptyArray(siteConfig.headerMap['user-agent']))
  ) {
    opt.randomUserAgent = false;
  }
  opt.blockUrlList = [];
  opt.cookieParam = siteConfig.cookieParam;
  const html = await utils.getHtmlByPuppeteer({ ...opt, url: `https://x.com/${userXId}` });
  //
  const $ = cheerio.load(html);
  const jsonElement =  $('head>script[data-testid="UserProfileSchema-test"]:eq(0)');
  if (jsonElement.length <= 0) {
    return null;
  }
  cache.userXIdMap[userXId] = JSON.parse(jsonElement.text()).author;
  return cache.userXIdMap[userXId];
};

const save = async ({ textWithUrl }) => {
  // get url
  let url = await getUrl(textWithUrl);
  if (check.emptyString(url)) {
    throw Error(`com.x | invalid text with url | textWithUrl = ${textWithUrl}`);
  }
  const [ , userXId, tweetId ] = /x.com\/([\S]+)\/status\/([\d]+)/.exec(url);
  // get html
  const opt = {};
  if (check.object(siteConfig.headerMap)) {
    opt.headerMap = siteConfig.headerMap;
  }
  if (
    (check.string(siteConfig.headerMap['User-Agent']) && check.not.emptyArray(siteConfig.headerMap['User-Agent'])) ||
    (check.string(siteConfig.headerMap['user-agent']) && check.not.emptyArray(siteConfig.headerMap['user-agent']))
  ) {
    opt.randomUserAgent = false;
  }
  opt.blockUrlList = [];
  opt.cookieParam = siteConfig.cookieParam;
  const html = await utils.getHtmlByPuppeteer({ ...opt, url });
  // parse data
  let $ = cheerio.load(html);
  const loggedIn = $('body header button[aria-label="Account menu"]').length > 0;
  const previousArticleElementCount = $('body main article div.r-m5arl1.r-16y2uox').length;
  let article = $('body main article').eq(previousArticleElementCount);
  if (article.length <= 0) {
    throw Error('com.x | tweet not found | element "<article />" not found');
  }
  let articleHtml = article.prop('outerHTML');
  $ = cheerio.load(articleHtml);
  // validate data
  const videoElement = $('video:eq(0)');
  const isVideo = videoElement.length > 0;
  const createdAtString = $('time:eq(0)').prop('datetime');
  if (check.not.string(createdAtString) || check.emptyString(createdAtString)) {
    throw new Error(`com.x | invalid tweet format | $('time:eq(0)').prop('datetime') | ${articleHtml}`);
  }
  const textElement = $('div[data-testid="tweetText"]:eq(0)');
  const imageElementList = $('div[aria-label="Image"] img');
  // common
  const createdAtDate = new Date(createdAtString);
  const createdAtTimestampMs = createdAtDate.getTime();
  const mediaCount = isVideo ? 2 : imageElementList.length;
  const text = (textElement.length > 0 ? textElement.text() : '');
  //
  let atUserXIdList = [];
  let hashtagList = [];
  if (textElement.length > 0) {
    textElement.prop('innerHTML').split('</a>').map((t) => {
      let temp = /@([\S]+?)\u003c\/span\u003e$/.exec(t);
      if (temp) {
        atUserXIdList.push(temp[1]);
      }
      temp = /#([\S]+?)$/.exec(t);
      if (temp) {
        hashtagList.push(temp[1]);
      }
    });
  }
  atUserXIdList = Array.from(new Set(atUserXIdList));
  hashtagList = Array.from(new Set(hashtagList));
  //
  await getUserInfo(userXId);
  for (let i = 0; i < atUserXIdList.length; i++) {
    await getUserInfo(atUserXIdList[i]);
  }
  //
  const tagList = [
    `_login=${loggedIn}`,
    '_source=x.com',
    `_user_id=x.com/${cache.userXIdMap[userXId].identifier}`,
    ...atUserXIdList.map(xId => `_user_id=x.com/${cache.userXIdMap[xId].identifier}`),
    ...hashtagList.map(h => `_tag=x.com/${h}`),
    ...hashtagList.map(h => `_union_tag=${h}`),
  ];
  if (isVideo) {
    tagList.push('_todo=true');
  }
  const annotation = {
    creator: {
      name: cache.userXIdMap[userXId].givenName,
      x_id: userXId,
    },
    description: text,
    media_count: mediaCount,
    at_user_list: atUserXIdList.length > 0 ? atUserXIdList.map(xId => {
      return {
        name: cache.userXIdMap[xId].givenName,
        x_id: xId,
      };
    }) : undefined,
  };
  // folder
  const folder = await utils.createEagleFolder({
    parentName: '.x.com',
    name: tweetId,
    summary: text,
    mediaCount,
    source: `${eagle.generateTitle(createdAtDate)}`,
    url,
  });
  // meta
  const metaFile = path.resolve(allConfig.runtime.wkdir, `${Date.now()}.com.x.${tweetId}.meta.html`);
  fs.writeFileSync(metaFile, articleHtml);
  if (check.not.string(allConfig.eagle.stage) || check.emptyString(allConfig.eagle.stage) || !utils.urlRegex.test(allConfig.eagle.stage)) {
    // local
    await eagle.post('/api/item/addFromPaths', {
      items: [
        {
          path: path.resolve(metaFile),
          name: `${eagle.generateTitle(createdAtDate)}`,
          website: url,
          tags: tagList,
          annotation: JSON.stringify(annotation),
        },
      ],
      folderId: folder.id,
    });
    await utils.sleep(1000);
  } else {
    // http upload and download via stage
    await utils.uploadViaHttp({ filePath: metaFile, url: allConfig.eagle.stage });
    await eagle.post('/api/item/addFromPaths', {
      items: [
        {
          path: path.resolve(metaFile),
          name: `${eagle.generateTitle(createdAtDate)}`,
          website: url,
          tags: tagList,
          annotation: JSON.stringify(annotation),
        },
      ],
      folderId: folder.id,
    });
  }
  if (!allConfig.keepMetaFile) {
    fs.unlinkSync(metaFile);
  }
  let payload;
  let rtn;
  if (isVideo) {
    // video
    const mediaUrl = videoElement.prop('poster');
    payload = {
      items: [ {
        url: mediaUrl,
        name: eagle.generateTitle(createdAtTimestampMs + 1),
        website: url,
        tags: tagList,
        annotation: JSON.stringify({ ...annotation, media_url: mediaUrl }),
      } ],
      folderId: folder.id,
    };
    rtn = `com.x | video tweet not supported | tag "_todo=true" added${loggedIn ? ' | login' : ' | non-login'}`;
  } else {
    // image
    payload = {
      items: [],
      folderId: folder.id,
    };
    for (let i = 0; i < imageElementList.length; i++) {
      const mediaUrl = imageElementList.eq(i).prop('src').replaceAll(/\?[\S]*$/g, '?format=jpg');
      if (check.emptyString(mediaUrl)) {
        continue;
      }
      payload.items.push({
        url: mediaUrl,
        name: eagle.generateTitle(createdAtTimestampMs + 1 + i),
        website: url,
        tags: tagList,
        annotation: JSON.stringify({ ...annotation, media_url: mediaUrl }),
      });
    }
    rtn = `com.x | ok${loggedIn ? ' | login' : ' | non-login'}`;
  }
  // add to eagle
  await eagle.post('/api/item/addFromURLs', payload);
  // interval
  await utils.sleep(siteConfig.interval);
  //
  return rtn;
};

export { init, getUrl, save };
