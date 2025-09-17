import * as fs from 'node:fs';
import * as path from 'node:path';
//
import check from 'check-types';
import * as cheerio from 'cheerio';
//
import * as collection from './collection.js';
import * as eagle from './eagle.js';
import * as setting from './setting.js';
import * as utils from './utils.js';

let allConfig = {};
let siteConfig = {
  headerMap: {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
  },
  interval: 3000,
};
//
const init = () => {
  allConfig = setting.get();
  siteConfig = allConfig.site['jp.ne.goo.blog'];
};

const getUrl = (textWithUrl = '') => {
  if (check.not.string(textWithUrl)) {
    return null;
  }
  let url = utils.urlRegex.exec(textWithUrl)?.[0] || '';
  let valid = /\/([\S]+\.|)blog.goo.ne.jp\/([\S]+)\/e\/([a-f0-9]+)/.exec(url);
  if (valid) {
    const u = `https://blog.goo.ne.jp/${valid[2]}/e/${valid[3]}`;
    return { url, fetchUrl: u, collectUrl: u, gooId: valid[2], blogId: valid[3] };
  }
  return null;
};

const save = async ({ textWithUrl }) => {
  // get note url
  let temp = getUrl(textWithUrl);
  if (!temp) {
    throw Error(`jp.ne.goo.blog | invalid text with url | textWithUrl = ${textWithUrl}`);
  }
  const { fetchUrl, collectUrl, gooId, blogId } = temp;
  if (collection.has(collectUrl)) {
    throw new Error('jp.ne.goo.blog | already collected');
  }
  // parse data
  const opt = {};
  opt.fetchOption = {};
  if (check.object(siteConfig.headerMap)) {
    opt.fetchOption.headers = siteConfig.headerMap;
  }
  if (
    (check.string(siteConfig.headerMap['User-Agent']) && check.not.emptyArray(siteConfig.headerMap['User-Agent'])) ||
    (check.string(siteConfig.headerMap['user-agent']) && check.not.emptyArray(siteConfig.headerMap['user-agent']))
  ) {
    opt.randomUserAgent = false;
  }
  //
  const html = await utils.getHtmlByFetch({ ...opt, url: fetchUrl });
  let $ = cheerio.load(html);
  const entryList = $('div.entry');
  let entry = null;
  for (let i = 0; i < entryList.length; i++) {
    const $_ = cheerio.load(entryList.eq(i).prop('outerHTML'));
    const entryTitle = $_('div.entry-top h3 a');
    const entryTime = $_('div.entry-top span.entry-top-info-time');
    const entryBody = $_('div.entry-body');
    if (entryTitle.length > 0 && entryTime.length > 0 && entryBody.length > 0) {
      entry = $(`div.entry:eq(${i})`);
    }
  }
  if (!entry) {
    throw Error('jp.ne.goo.blog | invalid blog format | element "<div class="entry" />" not found');
  }
  const entryHtml = entry.prop('outerHTML');
  $ = cheerio.load(entryHtml);
  // validate data
  const entryTitle = $('div.entry-top h3 a');
  const entryTime = $('div.entry-top span.entry-top-info-time');
  const entryBody = $('div.entry-body');
  // common
  const loggedIn = false;
  const entryTimeText = entryTime.prop('innerText');
  let blogTime = new Date(entryTimeText);
  if (isNaN(blogTime.getTime())) {
    let temp;
    if ((temp = /([\d]+)年([\d]+)月([\d]+)日 ([\d]+)時([\d]+)分([\d]+)秒/.exec(entryTimeText))) {
      blogTime = new Date(`${temp[1]}-${temp[2]}-${temp[3]} ${temp[4]}:${temp[5]}:${temp[6]}`);
    } else if ((temp = /([\d]+)年([\d]+)月([\d]+)日/.exec(entryTimeText))) {
      blogTime = new Date(`${temp[1]}-${temp[2]}-${temp[3]}`);
    } else {
      throw Error(`jp.ne.goo.blog | blog time not recognized | ${entryTimeText}`);
    }
  }
  const blogTimestampMs = blogTime.getTime();
  const description = entryBody.prop('innerText').replaceAll(/\n[\f\r\t\v\u0020\u00A0\u2028\u2029]*(?=\n)/g, '\n').replaceAll(/\n{2,}/g, '\n');
  const image = $('.entry-body img');
  const imageUrlList = [];
  for (let i = 0; i < image.length; i++) {
    let imgUrl = image.eq(i).attr('src');
    if (!imgUrl) {
      continue;
    }
    imgUrl = imgUrl.split('?')[0];
    if (/\/user_image\//.test(imgUrl)) {
      imageUrlList.push(imgUrl);
    }
  }
  const mediaCount = imageUrlList.length;
  //
  const title = entryTitle.prop('innerText') || undefined;
  const tagList = [
    `_login=${loggedIn}`,
    '_source=blog.goo.ne.jp',
  ];
  const annotation = {
    creator: {
      livedoor_id: gooId,
    },
    title,
    description,
    media_count: mediaCount,
  };
  // folder
  const folder = await utils.createEagleFolder({
    parentName: '.blog.goo.ne.jp',
    name: blogId,
    summary: title,
    mediaCount,
    source: `${eagle.generateTitle(blogTime)}`,
    url: collectUrl,
  });
  // meta
  const metaFile = path.resolve(allConfig.runtime.wkdir, `${Date.now()}.jp.ne.goo.blog.${blogId}.meta.html`);
  fs.writeFileSync(metaFile, entryHtml);
  await eagle.post('/api/item/addFromPaths', {
    items: [
      {
        path: path.resolve(metaFile),
        name: `${eagle.generateTitle(blogTime)}`,
        website: collectUrl,
        tags: tagList,
        annotation: JSON.stringify(annotation),
      },
    ],
    folderId: folder.id,
  });
  await utils.sleep(1000);
  // image
  const payload = {
    items: imageUrlList.map((mediaUrl, idx) => {
      return {
        url: mediaUrl,
        name: `${eagle.generateTitle(blogTimestampMs + 1 + idx)}`,
        website: collectUrl,
        tags: tagList,
        annotation: JSON.stringify({ ...annotation, media_url: mediaUrl }),
      };
    }),
    folderId: folder.id,
  };
  // add to eagle
  await eagle.post('/api/item/addFromURLs', payload);
  collection.add(collectUrl);
  // interval
  await utils.sleep(siteConfig.interval);
  //
  return `jp.ne.goo.blog | ok${loggedIn ? ' | login' : ' | non-login'}`;
};

export { init, getUrl, save };
