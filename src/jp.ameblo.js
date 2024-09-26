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
  interval: 3000,
};
//
const init = () => {
  allConfig = setting.get();
  siteConfig = allConfig.site['jp.ameblo'];
};

const getUrl = (textWithUrl = '') => {
  if (check.not.string(textWithUrl)) {
    return '';
  }
  let url = utils.urlRegex.exec(textWithUrl)?.[0] || '';
  let valid = /\/([\S]+\.|)ameblo.jp\/([\S]+)\/entry-([0-9]+)\.html/.exec(url);
  if (valid) {
    url = url.split('?')[0];
    url = url.split('#')[0];
    return `https://ameblo.jp/${valid[2]}/entry-${valid[3]}.html`;
  }
  valid = /\/([\S]+\.|)ameblo.jp\/([\S]+)\/image-([0-9]+)-([0-9]+)\.html/.exec(url);
  if (valid) {
    url = url.split('?')[0];
    url = url.split('#')[0];
    return `https://ameblo.jp/${valid[2]}/entry-${valid[3]}.html`;
  }
  return '';
};

const save = async ({ textWithUrl }) => {
  // get note url
  const url = getUrl(textWithUrl);
  if (check.emptyString(url)) {
    throw Error(`jp.ameblo | invalid text with url | textWithUrl = ${textWithUrl}`);
  }
  if (allConfig.runtime.collected[url]) {
    throw new Error('jp.ameblo | already collected');
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
  const html = await utils.getHtmlByFetch({ ...opt, url });
  let $ = cheerio.load(html);
  const headScript = $('head script[type="application/ld+json"]:eq(0)');
  if (headScript.length <= 0) {
    throw Error('jp.ameblo | invalid blog format | element "<script type="application/ld+json" />" not found');
  }
  //
  const entryBody = $('#entryBody:eq(0)');
  if (entryBody.length <= 0) {
    throw Error('jp.ameblo | invalid blog format | element "<div id="entryBody" />" not found');
  }
  let entryBodyHtml = entryBody.prop('outerHTML');
  $ = cheerio.load(entryBodyHtml);
  // validate data
  const metaText = headScript.text();
  let meta;
  try {
    meta = JSON.parse(metaText);
  } catch (error) {
    throw Error('jp.ameblo | invalid blog format | element "<script type="application/ld+json" />" | invalid JSON string');
  }
  if (check.not.string(meta.dateModified) || check.emptyString(meta.dateModified)) {
    throw Error(`jp.ameblo | invalid blog format | element "<script type="application/ld+json" />" | .dateModified | ${metaText}`);
  }
  if (check.not.string(meta.headline) || check.emptyString(meta.headline)) {
    throw Error(`jp.ameblo | invalid blog format | element "<script type="application/ld+json" />" | .headline | ${metaText}`);
  }
  // common
  const loggedIn = false;
  const [ , , amebloId, blogId ] = /\/(www\.|)ameblo.jp\/([\S]+)\/entry-([0-9]+)\.html/.exec(url);
  const modifiedTime = new Date(meta.dateModified);
  const modifiedTimestampMs = modifiedTime.getTime();
  const description = $.text().replaceAll(/\n[\f\r\t\v\u0020\u00A0\u2028\u2029]*(?=\n)/g, '\n').replaceAll(/\n{2,}/g, '\n');
  const image = $('img');
  const imageUrlList = [];
  for (let i = 0; i < image.length; i++) {
    let imgUrl = image.eq(i).attr('src');
    if (!imgUrl) {
      continue;
    }
    imgUrl = imgUrl.split('?')[0];
    if (/\/user_images\//.test(imgUrl)) {
      imageUrlList.push(imgUrl);
    }
  }
  const mediaCount = imageUrlList.length;
  //
  const tagList = [
    `_login=${loggedIn}`,
    '_source=ameblo.jp',
  ];
  const annotation = {
    creator: {
      ameblo_id: amebloId,
    },
    title: meta.headline,
    description: description,
    media_count: mediaCount,
  };
  // folder
  const folder = await utils.createEagleFolder({
    parentName: '.ameblo.jp',
    name: blogId,
    summary: meta.headline || undefined,
    mediaCount,
    source: `${eagle.generateTitle(modifiedTime)}`,
    url,
  });
  // meta
  entryBodyHtml = entryBodyHtml.replace('</div>', `<date_modified_timestamp_ms value="${modifiedTimestampMs}" />\n</div>`);
  entryBodyHtml = entryBodyHtml.replace('</div>', `<headline value="${meta.headline.replace('"', '&#34').replace('\'', '&#39')}" />\n</div>`);
  entryBodyHtml = entryBodyHtml.replace('</div>', `<description value="${description.replace('"', '&#34').replace('\'', '&#39')}"/>\n</div>`);
  //
  const metaFile = path.resolve(allConfig.runtime.wkdir, `${Date.now()}.jp.ameblo.${blogId}.meta.html`);
  fs.writeFileSync(metaFile, entryBodyHtml);
  if (check.not.string(allConfig.eagle.stage) || check.emptyString(allConfig.eagle.stage) || !utils.urlRegex.test(allConfig.eagle.stage)) {
    // local
    await eagle.post('/api/item/addFromPaths', {
      items: [
        {
          path: path.resolve(metaFile),
          name: `${eagle.generateTitle(modifiedTime)}`,
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
    await eagle.post('/api/item/addFromURLs', {
      items: [
        {
          url: `${allConfig.eagle.stage}/${metaFile}`,
          name: `${eagle.generateTitle(modifiedTime)}`,
          website: url,
          tags: tagList,
          annotation: JSON.stringify(annotation),
        },
      ],
      folderId: folder.id,
    });
  }
  if (!allConfig?.meta?.keepMetaFile) {
    fs.unlinkSync(metaFile);
  }
  // image
  const payload = {
    items: imageUrlList.map((mediaUrl, idx) => {
      return {
        url: mediaUrl,
        name: `${eagle.generateTitle(modifiedTimestampMs + 1 + idx)}`,
        website: url,
        tags: tagList,
        annotation: JSON.stringify({ ...annotation, media_url: mediaUrl }),
      };
    }),
    folderId: folder.id,
  };
  // add to eagle
  await eagle.post('/api/item/addFromURLs', payload);
  allConfig.runtime.collected[url] = true;
  // interval
  await utils.sleep(siteConfig.interval);
  //
  return `jp.ameblo | ok${loggedIn ? ' | login' : ' | non-login'}`;
};

export { init, getUrl, save };
