import * as com_instagram from './com.instagram.js';
import * as com_xiaohongshu from './com.xiaohongshu.js';
import * as com_weibo from './com.weibo.js';
import * as com_x from './com.x.js';
import * as jp_ameblo from './jp.ameblo.js';
import * as jp_livedoor_blog from './jp.livedoor.blog.js';
import * as jp_ne_goo_blog from './jp.ne.goo.blog.js';
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
  siteConfig = allConfig.site['com.pinterest'];
};

const getUrl = (textWithUrl = '') => {
  if (check.not.string(textWithUrl)) {
    return '';
  }
  const valid = /\/(www\.|)pinterest.com\/pin\/([0-9]+)/.exec(utils.urlRegex.exec(textWithUrl)?.[0] || '');
  if (!valid) {
    return '';
  }
  const u = `https://www.pinterest.com/pin/${valid[2]}/`;
  return { url: u, fetchUrl: u };
};

const save = async ({ textWithUrl }) => {
  // get pin url
  let temp = getUrl(textWithUrl);
  if (!temp) {
    throw Error(`com.pinterest | invalid text with url | textWithUrl = ${textWithUrl}`);
  }
  const { url, fetchUrl } = temp;
  if (collection.has(url)) {
    throw new Error('com.pinterest | already collected');
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
  const selector = $('script[data-relay-response="true"]');
  if (selector.length < 0) {
    throw Error('com.pinterest | invalid pin format | element "<script data-relay-response="true" />" | not found');
  }
  let data = null;
  for (let i = 0; i < selector.length; i++) {
    try {
      const json = JSON.parse(selector.eq(i).text());
      if (json?.requestParameters?.name === 'CloseupDetailQuery') {
        data = json?.response?.data?.v3GetPinQuery?.data;
        break;
      }
    } catch {
      continue;
    }
  }
  if (!data) {
    throw Error('com.pinterest | invalid pin format | element "<script data-relay-response="true" />" | should be (1) JSON string (2) .requestParameters.name = "CloseupDetailQuery"');
  }
  // handle
  if (data.link) {
    // handle referenced site
    const handlerList = {
      com_instagram,
      com_xiaohongshu,
      com_weibo,
      com_x,
      jp_ameblo,
      jp_livedoor_blog,
      jp_ne_goo_blog,
    };
    for (const key in handlerList) {
      const handler = handlerList[key];
      if (await handler.getUrl(data.link)) {
        try {
          const message = await handler.save({ textWithUrl: data.link });
          collection.add(url);
          console.log(`✅ [ref] ${data.link} | ${message}`);
        } catch (error) {
          if (error?.message?.includes('collected')) {
            collection.add(url);
            console.log(`☑️ [ref] ${data.link} | ${error.message}`);
          } else {
            console.log(`🛑 [ref] ${data.link} | ${error.message}`);
          }
        }
        throw new Error('com.pinterest | reference collected');
      }
    }
  }
  // validate data
  if (data?.originPinner) {
    if (check.not.string(data?.originPinner?.id) || check.emptyString(data?.originPinner?.id)) {
      throw new Error(`com.pinterest | invalid pin format | data?.originPinner?.id | ${JSON.stringify(data)}`);
    }
    if (check.not.string(data?.originPinner?.username) || check.emptyString(data?.originPinner?.username)) {
      throw new Error(`com.pinterest | invalid pin format | data?.originPinner?.username | ${JSON.stringify(data)}`);
    }
    if (check.not.string(data?.originPinner?.fullName) || check.emptyString(data?.originPinner?.fullName)) {
      throw new Error(`com.pinterest | invalid pin format | data?.originPinner?.fullName | ${JSON.stringify(data)}`);
    }
  }
  if (data?.pinner) {
    if (check.not.string(data?.pinner?.id) || check.emptyString(data?.pinner?.id)) {
      throw new Error(`com.pinterest | invalid pin format | data?.pinner?.id | ${JSON.stringify(data)}`);
    }
    if (check.not.string(data?.pinner?.username) || check.emptyString(data?.pinner?.username)) {
      throw new Error(`com.pinterest | invalid pin format | data?.pinner?.username | ${JSON.stringify(data)}`);
    }
    if (check.not.string(data?.pinner?.fullName) || check.emptyString(data?.pinner?.fullName)) {
      throw new Error(`com.pinterest | invalid pin format | data?.pinner?.fullName | ${JSON.stringify(data)}`);
    }
  }
  if (check.not.string(data?.title)) {
    throw new Error(`com.pinterest | invalid pin format | data?.title | ${JSON.stringify(data)}`);
  }
  if (check.not.string(data?.description)) {
    throw new Error(`com.pinterest | invalid pin format | data?.description | ${JSON.stringify(data)}`);
  }
  if (check.not.string(data?.createdAt) || check.emptyString(data?.createdAt)) {
    throw new Error(`com.pinterest | invalid pin format | data?.createdAt | ${JSON.stringify(data)}`);
  }
  if (check.not.array(data?.pinJoin?.visualAnnotation)) {
    throw new Error(`com.pinterest | invalid pin format | data?.pinJoin?.visualAnnotation | ${JSON.stringify(data)}`);
  }
  if (check.not.array(data?.pinJoin?.visualAnnotation)) {
    throw new Error(`com.pinterest | invalid pin format | data?.pinJoin?.visualAnnotation | ${JSON.stringify(data)}`);
  }
  if (check.not.array(data?.visualObjects)) {
    throw new Error(`com.pinterest | invalid pin format | data?.visualObjects | ${JSON.stringify(data)}`);
  }
  if (data?.videos) {
    if (check.not.string(data?.videos?.videoList?.v720P?.url) || check.emptyString(data?.videos?.videoList?.v720P?.url)) {
      throw new Error(`com.pinterest | invalid pin format | data?.videos?.videoList?.v720P?.url | ${JSON.stringify(data)}`);
    }
  } else {
    if (check.not.string(data?.imageSpec_orig?.url) || check.emptyString(data?.imageSpec_orig?.url)) {
      throw new Error(`com.pinterest | invalid pin format | data?.imageSpec_orig?.url | ${JSON.stringify(data)}`);
    }
  }
  //
  const mediaUrl = data.videos ? data.videos.videoList.v720P.url : data.imageSpec_orig.url;
  if (collection.has(mediaUrl)) {
    throw new Error('com.pinterest | already collected');
  }
  const loggedIn = false;
  const tagList = [
    `_login=${loggedIn}`,
    '_source=pinterest.com',
    data.originPinner ? `_user_id=pinterest.com/${data.originPinner.id}` : null,
    data.pinner ? `_user_id=pinterest.com/${data.pinner.id}` : null,
    ...data.pinJoin.visualAnnotation.map(a => `_tag=pinterest.com/${a}`),
    ...data.visualObjects.map(o => o.label ? `_tag=pinterest.com/${o.label}` : null).filter(t => t),
    ...data.pinJoin.visualAnnotation.map(a => `_union_tag=${a}`),
    ...data.visualObjects.map(o => o.label ? `_union_tag=${o.label}` : null).filter(t => t),
    data.link ? '_reference=true' : undefined,
  ].filter(t => t);
  const annotation = {
    pinner: [
      data.originPinner ? { name: data.originPinner.fullName, pinterest_id: data.originPinner.username } : null,
      data.pinner ? { name: data.pinner.fullName, pinterest_id: data.pinner.username } : null,
    ].filter(t => t),
    title: data?.richMetadata?.title?.trim() || data.title.trim() || undefined,
    description: data?.richMetadata?.description?.trim() || data.description.trim() || undefined,
  };
  // folder
  const folder = await eagle.updateFolder({ name: '.pinterest.com', parentName: '.import' });
  const website = data.link ? data.link : url;
  const payload = {
    items: [ {
      url: mediaUrl,
      name: `${eagle.generateTitle(new Date(data.createdAt))}`,
      website,
      tags: tagList,
      annotation: JSON.stringify({ ...annotation, media_url: mediaUrl }),
    } ],
    folderId: folder.id,
  };
  // add to eagle
  await eagle.post('/api/item/addFromURLs', payload);
  collection.add(website);
  collection.add(mediaUrl);
  // interval
  await utils.sleep(siteConfig.interval);
  //
  return `com.pinterest | ok${loggedIn ? ' | login' : ' | non-login'}`;
};

export { init, getUrl, save };