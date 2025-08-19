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
  siteConfig = allConfig.site['jp.livedoor.blog'];
};

const getUrl = (textWithUrl = '') => {
  if (check.not.string(textWithUrl)) {
    return null;
  }
  let url = utils.urlRegex.exec(textWithUrl)?.[0] || '';
  let valid = /\/([\S]+\.|)blog.livedoor.jp\/([\S]+)\/archives\/([0-9]+)\.html/.exec(url);
  if (valid) {
    const u = `http://blog.livedoor.jp/${valid[2]}/archives/${valid[3]}.html`;
    return { url, fetchUrl: u, collectUrl: u, livedoorId: valid[2], blogId: valid[3] };
  }
  return null;
};

const save = async ({ textWithUrl }) => {
  // get note url
  let temp = getUrl(textWithUrl);
  if (!temp) {
    throw Error(`jp.livedoor.blog | invalid text with url | textWithUrl = ${textWithUrl}`);
  }
  const { fetchUrl, collectUrl, livedoorId, blogId } = temp;
  if (collection.has(collectUrl)) {
    throw new Error('jp.livedoor.blog | already collected');
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
  const article = $('article.article');
  if (article.length <= 0) {
    throw Error('jp.livedoor.blog | invalid blog format | element "<article class="article" />" not found');
  }
  const articleHtml = article.prop('outerHTML');
  $ = cheerio.load(articleHtml);
  // validate data
  const articleTitle = $('.article-title a');
  if (articleTitle.length <= 0) {
    throw Error('jp.livedoor.blog | invalid blog format | element "<article>...<class="article-title">...<a />...</>...</article>" not found');
  }
  const articleTime = $('.article-header time');
  if (articleTime.length <= 0) {
    throw Error('jp.livedoor.blog | invalid blog format | element "<article>...<class="article-header">...<time />...</>...</article>" not found');
  }
  const articleBody = $('.article-body');
  if (articleBody.length <= 0) {
    throw Error('jp.livedoor.blog | invalid blog format | element "<article>...<class="article-body" />...</article>" not found');
  }
  // common
  const loggedIn = false;
  const blogTime = new Date(articleTime.attr('datetime'));
  const blogTimestampMs = blogTime.getTime();
  const description = articleBody.prop('innerText').replaceAll(/\n[\f\r\t\v\u0020\u00A0\u2028\u2029]*(?=\n)/g, '\n').replaceAll(/\n{2,}/g, '\n');
  const image = $('.article-body img');
  const imageUrlList = [];
  for (let i = 0; i < image.length; i++) {
    let imgUrl = image.eq(i).attr('src');
    if (!imgUrl) {
      continue;
    }
    if (!imgUrl.includes('livedoor.blogimg.jp')) {
      continue;
    }
    imgUrl = imgUrl.replace('-s', '');
    imageUrlList.push(imgUrl);
  }
  const mediaCount = imageUrlList.length;
  //
  const title = articleTitle.prop('innerText') || undefined;
  const tagList = [
    `_login=${loggedIn}`,
    '_source=blog.livedoor.jp',
  ];
  const annotation = {
    creator: {
      livedoor_id: livedoorId,
    },
    title,
    description,
    media_count: mediaCount,
  };
  // folder
  const folder = await utils.createEagleFolder({
    parentName: '.blog.livedoor.jp',
    name: blogId,
    summary: title,
    mediaCount,
    source: `${eagle.generateTitle(blogTime)}`,
    url: collectUrl,
  });
  // meta
  const metaFile = path.resolve(allConfig.runtime.wkdir, `${Date.now()}.jp.livedoor.blog.${blogId}.meta.html`);
  fs.writeFileSync(metaFile, articleHtml);
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
  if (!allConfig?.meta?.keepMetaFile) {
    fs.unlinkSync(metaFile);
  }
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
  return `jp.livedoor.blog | ok${loggedIn ? ' | login' : ' | non-login'}`;
};

export { init, getUrl, save };
