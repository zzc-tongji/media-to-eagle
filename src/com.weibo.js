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
  headerMap: {},
  interval: 3000,
};
//
const cache = {
  loggedIn: null, // null, false, true
};
const init = () => {
  allConfig = setting.get();
  siteConfig = allConfig.site['com.weibo'];
};

const callback = (response) => {
  return new Promise((resolve) => {
    if (![ 'GET', 'POST' ].includes(response.request().method().toUpperCase()) || !/weibo.com\/ajax\/statuses\/show/.test(response.url()) || !response.ok()) {
      resolve(null);
      return;
    }
    resolve(response.json());
    return;
  });
};

const getUrl = async (textWithUrl = '') => {
  if (check.not.string(textWithUrl)) {
    return null;
  }
  let url = utils.urlRegex.exec(textWithUrl)?.[0] || '';
  if (check.emptyString(url)) {
    return null;
  }
  //
  url = /t.cn\/[0-9A-Za-z]+\/?/.test(url) ? (await utils.getRedirectByFetch({ url })) : url;
  let temp;
  if ((temp = /weibo.com\/([0-9]+)\/([0-9A-Za-z]+)\/?/.exec(url))) {
    return { url: `https://weibo.com/${temp[1]}/${temp[2]}`, userId: temp[1], weiboId: temp[2] };
  }
  if ((temp = /m.weibo.cn\/(status|detail)\/([0-9A-Za-z]+)\/?/.exec(url))) {
    return { url: `https://m.weibo.com/status/${temp[2]}`, weiboId: temp[2] };
  }
  return null;
};

const save = async ({ textWithUrl }) => {
  // get weibo url
  let temp = await getUrl(textWithUrl);
  if (!temp) {
    throw Error(`com.weibo | invalid text with url | textWithUrl = ${textWithUrl}`);
  }
  // prepare option
  const opt = {};
  if (check.object(siteConfig.headerMap)) {
    opt.headerMap = siteConfig.headerMap;
  }
  // login status
  if (cache.loggedIn === null) {
    const html = await utils.getHtmlByPuppeteer({ ...opt, url: 'https://weibo.com/' });
    const $ = cheerio.load(html);
    const hrefList = [];
    $('.woo-tab-nav a').map((_, el) => {
      hrefList.push(el.attribs['href']);
    });
    cache.loggedIn = hrefList.reduce((prev, curr) => prev || /^\/u\/(.*)$/.test(curr), false);
  }
  // filter duplicate (general)
  if (collection.has(temp.url)) {
    throw new Error('com.weibo | already collected');
  }
  if (!temp.userId) {
    // mobile url without user ID => mobile weibo handler
    return handle27004({ weiboId: temp.weiboId, opt });
  }
  // get and validate data
  const url = `https://weibo.com/${temp.userId}/${temp.weiboId}`;
  const weibo = await utils.getDataFromResponseByPuppeteer({ ...opt, url, callback });
  if (!weibo) {
    throw new Error(`com.weibo | weibo non-existent | url = ${url}`);
  }
  if (check.not.object(weibo) || weibo.error_code) {
    if (weibo.error_code === 27004) {
      // error 27004 as "weibo accessed from mobile only" => mobile weibo handler
      return handle27004({ weiboId: temp.weiboId, opt });
    }
    throw new Error(`com.weibo | weibo non-existent | url = ${url} | ${JSON.stringify(weibo)}`);
  }
  if (check.not.string(weibo?.idstr) || check.emptyString(weibo?.idstr)) {
    throw new Error(`com.weibo | invalid weibo format | weibo?.idstr | ${JSON.stringify(weibo)}`);
  }
  if (check.not.string(weibo?.user?.idstr) || check.emptyString(weibo?.user?.idstr)) {
    throw new Error(`com.weibo | invalid weibo format | weibo?.user?.idstr | ${JSON.stringify(weibo)}`);
  }
  if (check.not.string(weibo?.user?.screen_name) || check.emptyString(weibo?.user?.screen_name)) {
    throw new Error(`com.weibo | invalid weibo format | weibo?.user?.screen_name | ${JSON.stringify(weibo)}`);
  }
  if (check.not.string(weibo?.text)) {
    throw new Error(`com.weibo | invalid weibo format | weibo?.text | ${JSON.stringify(weibo)}`);
  }
  if (check.not.string(weibo?.text_raw)) {
    throw new Error(`com.weibo | invalid weibo format | weibo?.text_raw | ${JSON.stringify(weibo)}`);
  }
  if (check.not.string(weibo?.created_at)) {
    throw new Error(`com.weibo | invalid weibo format | weibo?.created_at | ${JSON.stringify(weibo)}`);
  }
  if (weibo?.page_info?.object_type === 'story') {
    // video
    if (check.not.object(weibo?.page_info?.pic_info?.pic_big)) {
      throw new Error(`com.weibo | invalid weibo format | weibo?.page_info?.pic_info?.pic_big | ${JSON.stringify(weibo)}`);
    }
    if (check.not.array(weibo?.page_info?.slide_cover?.playback_list)) {
      throw new Error(`com.weibo | invalid weibo format | weibo?.page_info?.slide_cover?.playback_list | ${JSON.stringify(weibo)}`);
    }
  } else if (weibo?.page_info?.object_type === 'video') {
    // video
    if (check.not.object(weibo?.page_info?.media_info?.big_pic_info)) {
      throw new Error(`com.weibo | invalid weibo format | weibo?.page_info?.media_info?.big_pic_info | ${JSON.stringify(weibo)}`);
    }
    if (check.not.array(weibo?.page_info?.media_info?.playback_list) || check.emptyArray(weibo.page_info.media_info.playback_list)) {
      throw new Error(`com.weibo | invalid weibo format | weibo?.page_info?.media_info?.playback_list | ${JSON.stringify(weibo)}`);
    }
  } else {
    // image
    if (check.not.array(weibo?.pic_ids)) {
      throw new Error(`com.weibo | invalid weibo format | weibo?.pic_ids | ${JSON.stringify(weibo)}`);
    }
    if (check.not.object(weibo?.pic_infos)) {
      throw new Error(`com.weibo | invalid weibo format | weibo?.pic_infos | ${JSON.stringify(weibo)}`);
    }
    if (check.not.number(weibo?.pic_num)) {
      throw new Error(`com.weibo | invalid weibo format | weibo?.pic_num | ${JSON.stringify(weibo)}`);
    }
  }
  // filter duplicate (short id)
  const weiboUrl = `https://weibo.com/${weibo.user.idstr}/${weibo.idstr}`;
  const weiboShortUrl = `https://weibo.com/${weibo.user.idstr}/${weibo.mblogid}`;
  if (collection.has(weiboUrl) || collection.has(weiboShortUrl)) {
    throw new Error('com.weibo | already collected');
  }
  // common
  const createdAtDate = new Date(weibo.created_at);
  const createdAtTimestampMs = createdAtDate.getTime();
  weibo.created_at_timestamp_ms = createdAtTimestampMs;
  //
  const atUserScreenNameList = weibo.text.split('</a>').map((t) => {
    return /\u003ca[\s\S]*\u003e@([\S]+)$/.exec(t)?.[1] || null;
  }).filter(name => name);
  weibo.at_user_screen_name_list = atUserScreenNameList;
  // The video will be counted as 2 media (1 video + 1 cover image).
  const mediaCount = weibo?.page_info?.object_type === 'video' ? 2 : weibo.pic_num;
  //
  const tagList = [
    `_login=${cache.loggedIn}`,
    '_source=weibo.com',
    `_user_id=weibo.com/${weibo.user.idstr}`,
    ...(weibo?.topic_struct || []).filter(t => t?.topic_title || null).map(t => `_tag=weibo.com/${t.topic_title}`),
    ...(weibo?.url_struct || []).filter(u => u?.url_title || null).map(u => `_tag=weibo.com/${u.url_title}`),
    ...(weibo?.topic_struct || []).filter(t => t?.topic_title || null).map(t => `_union_tag=${t.topic_title}`),
    ...(weibo?.url_struct || []).filter(u => u?.url_title || null).map(u => `_union_tag=${u.url_title}`),
  ];
  const annotation = {
    creator: {
      name: weibo.user.screen_name,
      weibo_id: weibo.user.idstr,
    },
    description: weibo.text_raw,
    media_count: mediaCount,
    at_user_list: atUserScreenNameList.length > 0 ? atUserScreenNameList.map((name) => {
      return { name };
    }) : undefined,
  };
  // folder
  const folder = await utils.createEagleFolder({
    parentName: '.weibo.com',
    name: weibo.idstr,
    summary: weibo.text_raw,
    mediaCount,
    source: `${eagle.generateTitle(createdAtDate)}`,
    url: weiboUrl,
  });
  // meta
  const metaFile = path.resolve(allConfig.runtime.wkdir, `${Date.now()}.com.weibo.${weibo.idstr}.meta.json`);
  fs.writeFileSync(metaFile, JSON.stringify(weibo, null, 2));
  await eagle.post('/api/item/addFromPaths', {
    items: [
      {
        path: path.resolve(metaFile),
        name: `${eagle.generateTitle(createdAtDate)}`,
        website: weiboUrl,
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
  let payload = {};
  if (weibo?.page_info?.object_type === 'story') {
    // video
    const image_url = Object.values(weibo.page_info.pic_info.pic_big).sort((a, b) => b.width - a.width)?.[0]?.url;
    const video_url = weibo.page_info.slide_cover.playback_list.sort((a, b) => b.play_info.size - a.play_info.size)?.[0]?.play_info?.url;
    payload = {
      items: [ image_url, video_url ].filter(url => url).map((url, idx) => {
        return {
          url,
          name: eagle.generateTitle(createdAtTimestampMs + 1 + idx),
          website: weiboUrl,
          tags: tagList,
          annotation: JSON.stringify({ ...annotation, media_url: url }),
        };
      }),
      folderId: folder.id,
    };
  } else if (weibo?.page_info?.object_type === 'video') {
    // video
    const image_url = Object.values(weibo.page_info.media_info.big_pic_info).sort((a, b) => b.width - a.width)?.[0]?.url;
    const video_url = weibo.page_info.media_info.playback_list.sort((a, b) => b.play_info.size - a.play_info.size)?.[0]?.play_info?.url;
    payload = {
      items: [ image_url, video_url ].filter(url => url).map((url, idx) => {
        return {
          url,
          name: eagle.generateTitle(createdAtTimestampMs + 1 + idx),
          website: weiboUrl,
          tags: tagList,
          annotation: JSON.stringify({ ...annotation, media_url: url }),
        };
      }),
      folderId: folder.id,
    };
  } else {
    // image
    payload = {
      items: weibo.pic_ids.map((picId, idx) => {
        const mediaUrl = Object.values(weibo.pic_infos[picId]).sort((a, b) => b.width - a.width)?.[0]?.url;
        return mediaUrl ? {
          url: mediaUrl,
          name: eagle.generateTitle(createdAtTimestampMs + 1 + idx),
          website: weiboUrl,
          tags: tagList,
          annotation: JSON.stringify({ ...annotation, media_url: mediaUrl }),
        } : null;
      }).filter(item => item),
      folderId: folder.id,
    };
  }
  // add to eagle
  await eagle.post('/api/item/addFromURLs', payload);
  collection.add(weiboUrl);
  // interval
  await utils.sleep(siteConfig.interval);
  //
  return `com.weibo | ok${cache.loggedIn ? ' | login' : ' | non-login'}`;
};

const handle27004 = async ({ weiboId, opt }) => {
  // parse data
  const url = `https://m.weibo.cn/status/${weiboId}`;
  const html = await utils.getHtmlByPuppeteer({ ...opt, url });
  const $ = cheerio.load(html);
  let data = $('html body script:contains("$render_data")').text();
  if (!data) {
    throw new Error(`com.weibo | weibo non-existent | url = ${url}`);
  }
  data = data.replaceAll(/var[\s]+\$render_data[\s]+/g, 'data');
  eval(data);
  data = data.status;
  // validate data
  if (check.not.object(data)) {
    throw new Error(`com.weibo | handle27004 | weibo non-existent | url = ${url}`);
  }
  if (check.not.string(data?.id) || check.emptyString(data?.id)) {
    throw new Error(`com.weibo | handle27004 | invalid weibo format | data?.id | ${JSON.stringify(data)}`);
  }
  if (check.not.number(data?.user?.id)) {
    throw new Error(`com.weibo | handle27004 | invalid weibo format | data?.user?.id | ${JSON.stringify(data)}`);
  }
  if (check.not.string(data?.user?.screen_name) || check.emptyString(data?.user?.screen_name)) {
    throw new Error(`com.weibo | handle27004 | invalid weibo format | data?.user?.screen_name | ${JSON.stringify(data)}`);
  }
  if (check.not.string(data?.text)) {
    throw new Error(`com.weibo | handle27004 | invalid weibo format | data?.text | ${JSON.stringify(data)}`);
  }
  if (check.not.string(data?.created_at)) {
    throw new Error(`com.weibo | handle27004 | invalid weibo format | data?.created_at | ${JSON.stringify(data)}`);
  }
  if (data?.page_info?.type === 'video') {
    // video
    if (check.not.string(data?.page_info?.page_pic?.url) || check.emptyString(data?.page_info?.page_pic?.url)) {
      throw new Error(`com.weibo | handle27004 | invalid weibo format | data?.page_info?.page_pic?.url | ${JSON.stringify(data)}`);
    }
    if (check.not.object(data?.page_info?.media_info)) {
      throw new Error(`com.weibo | handle27004 | invalid weibo format | data?.page_info?.media_info | ${JSON.stringify(data)}`);
    }
  } else {
    // image
    if (check.not.array(data?.pics)) {
      throw new Error(`com.weibo | handle27004 | invalid weibo format | data?.pics | ${JSON.stringify(data)}`);
    }
  }
  // filter duplicate (short id)
  const weiboUrl = `https://weibo.com/${data.user.id}/${data.id}`;
  const weiboShortUrl = `https://weibo.com/${data.user.id}/${data.bid}`;
  if (collection.has(weiboUrl) || collection.has(weiboShortUrl)) {
    throw new Error('com.weibo | already collected');
  }
  // common
  const createdAtDate = new Date(data.created_at);
  const createdAtTimestampMs = createdAtDate.getTime();
  data.created_at_timestamp_ms = createdAtTimestampMs;
  //
  const textRaw = data.text.replaceAll('\u003cbr /\u003e', '\n').replaceAll(/\u003c([\s\S]*?)\u003e/g, '');
  data.text_raw = textRaw;
  //
  const atUserScreenNameList = data.text.split('</a>').map((t) => {
    return /\u003ca[\s\S]*\u003e@([\S]+)$/.exec(t)?.[1] || null;
  }).filter(name => name);
  data.at_user_screen_name_list = atUserScreenNameList;
  //
  const topicList = data.text.split('</span></a>').map((t) => {
    return /\u003cspan[\s]*class="surl-text"\u003e(#?)([\s\S]+?)(#?)$/.exec(t)?.[2] || null;
  }).filter(tag => tag);
  data.topic_list = topicList;
  //
  const mediaCount = data?.page_info?.type === 'video' ? 2 : data.pics.length;
  //
  const tagList = [
    `_login=${cache.loggedIn}`,
    '_source=weibo.com',
    `_user_id=weibo.com/${data.user.id}`,
    ...topicList.map(t => `_tag=weibo.com/${t}`),
    ...topicList.map(t => `_union_tag=${t}`),
  ];
  const annotation = {
    creator: {
      name: data.user.screen_name,
      weibo_id: `${data.user.id}`,
    },
    description: textRaw,
    media_count: mediaCount,
    at_user_list: atUserScreenNameList.length > 0 ? atUserScreenNameList.map((name) => {
      return { name };
    }) : undefined,
  };
  // folder
  const folder = await utils.createEagleFolder({
    parentName: '.weibo.com',
    name: `${data.id}`,
    summary: textRaw,
    mediaCount,
    source: `${eagle.generateTitle(createdAtDate)}`,
    url: weiboUrl,
  });
  // meta
  const metaFile = path.resolve(allConfig.runtime.wkdir, `${Date.now()}.com.weibo.${data.id}.meta.json`);
  fs.writeFileSync(metaFile, JSON.stringify(data, null, 2));
  await eagle.post('/api/item/addFromPaths', {
    items: [
      {
        path: path.resolve(metaFile),
        name: `${eagle.generateTitle(createdAtDate)}`,
        website: weiboUrl,
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
  let payload = {};
  if (data?.page_info?.type === 'video') {
    // video
    const image_url = data?.page_info?.page_pic?.url;
    const video_url = data?.page_info?.media_info?.stream_url_hd || data?.page_info?.media_info?.stream_url;
    payload = {
      items: [ image_url, video_url ].filter(url => url).map((url, idx) => {
        return {
          url,
          name: eagle.generateTitle(createdAtTimestampMs + 1 + idx),
          website: weiboUrl,
          tags: tagList,
          annotation: JSON.stringify({ ...annotation, media_url: url }),
        };
      }),
      folderId: folder.id,
    };
  } else {
    // image
    payload = {
      items: data.pics.map((pic, idx) => {
        const mediaUrl = pic?.large?.url || pic?.url || null;
        return mediaUrl ? {
          url: mediaUrl,
          name: eagle.generateTitle(createdAtTimestampMs + 1 + idx),
          website: weiboUrl,
          tags: tagList,
          annotation: JSON.stringify({ ...annotation, media_url: mediaUrl }),
        } : null;
      }).filter(item => item),
      folderId: folder.id,
    };
  }
  // add to eagle
  await eagle.post('/api/item/addFromURLs', payload);
  collection.add(weiboUrl);
  // interval
  await utils.sleep(siteConfig.interval);
  //
  return `com.weibo | ok${cache.loggedIn ? ' | login' : ' | non-login'}`;
};

export { init, getUrl, save };
