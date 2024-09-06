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
const userNameMap = {};

const init = () => {
  allConfig = setting.get();
  siteConfig = allConfig.site['com.instagram'];
};

const searchObjectWithKeyValue = (full, key, value) => {
  if (check.not.object(full) && check.not.array(full)) {
    return [];
  }
  const result = [];
  for (const k of Object.keys(full)) {
    const v = full[k];
    if (k === key && v === value) {
      result.push(full);
    }
    const res = searchObjectWithKeyValue(v, key, value);
    if (res) {
      result.push(...res);
    }
  }
  return result;
};

const getUserFromUserName = async ({ userName, opt }) => {
  // cache get
  if (userNameMap[userName]) {
    return userNameMap[userName];
  }
  // parse data
  const html = await utils.getHtmlByPuppeteer({ ...opt, url: `https://www.instagram.com/${userName}` });
  const $ = cheerio.load(html);
  //
  const title = $('head>meta[property="og:title"]')?.attr('content') || '';
  const temp = /^(.*)\(@(.*)\)(.*)$/.exec(title);
  if (check.not.array(temp)) {
    throw new Error(`com.instagram | invalid user format | title = ${title}`);
  }
  const user = {
    fullName: temp[1],
    userName: temp[2],
  };
  //
  const full = Array.from(
    $('body>script[type="application/json"]').map((_, el) => {
      return el.children?.[0]?.data || '';
    }),
  ).sort((a, b) => {
    return Math.sign(b.length - a.length);
  }).map((s) => {
    return JSON.parse(s);
  });
  user.userId = searchObjectWithKeyValue(full, 'content_type', 'PROFILE')[0].target_id;
  // cache set
  userNameMap[userName] = user;
  return user;
};

const getUrl = (textWithUrl = '') => {
  if (check.not.string(textWithUrl)) {
    return '';
  }
  let url = utils.urlRegex.exec(textWithUrl)?.[0] || '';
  const valid = [
    '/instagram.com/p/',
    '/instagram.com/reel/',
    '/www.instagram.com/p/',
    '/www.instagram.com/reel/',
  ].reduce((prev, curr) => {
    return prev || url.includes(curr);
  }, false);
  if (!valid) {
    return '';
  }
  url = url.replace('/instagram.com/', '/www.instagram.com/');
  url = url.split('?')[0];
  url = url.split('#')[0];
  return url;
};

const save = async ({ textWithUrl }) => {
  // get note url
  const inputUrl = getUrl(textWithUrl);
  if (check.emptyString(inputUrl)) {
    throw Error(`com.instagram | invalid text with url | textWithUrl = ${textWithUrl}`);
  }
  // parse data
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
  opt.blockUrlList = [
    'https://edge-chat.instagram.com/',
    'https://www.facebook.com/',
  ];
  opt.cookieParam = siteConfig.cookieParam;
  //
  const html = await utils.getHtmlByPuppeteer({ ...opt, url: inputUrl });
  // get raw data of post (1)
  const $ = cheerio.load(html);
  const url = $('head>meta[property="og:url"]')?.attr('content') || '';
  const code = url.split('/').filter(s => s).pop() || '';
  if (!code) {
    throw new Error(`com.instagram | invalid post format | code = ${code}`);
  }
  //
  const full = Array.from(
    $('body>script[type="application/json"]').map((_, el) => {
      return el.children?.[0]?.data || '';
    }),
  ).sort((a, b) => {
    return Math.sign(b.length - a.length);
  }).map((s) => {
    return JSON.parse(s);
  });
  let loggedIn = false;
  let rawLogin = searchObjectWithKeyValue(full, '0', 'PolarisViewer');
  if (check.not.emptyArray(rawLogin.length)) {
    rawLogin = rawLogin[0];
    if (check.array(rawLogin) && rawLogin.length > 2) {
      rawLogin = rawLogin[2];
      loggedIn = rawLogin.data ? true : false;
    }
  }
  if (!loggedIn) {
    throw Error('com.instagram | login required');
  }
  const raw = searchObjectWithKeyValue(full, 'code', code).find(r => check.number(r.taken_at));
  // validate data
  if (check.not.object(raw)) {
    throw new Error(`com.instagram | invalid post format | raw = ${raw}`);
  }
  const singleImage = (check.not.array(raw.carousel_media) || check.emptyArray(raw.carousel_media));
  const video = check.array(raw.video_versions) && check.not.emptyArray(raw.video_versions);
  if (
    singleImage && (
      check.not.object(raw.image_versions2) ||
      check.not.array(raw.image_versions2.candidates) ||
      check.emptyArray(raw.image_versions2.candidates) ||
      check.not.string(raw.image_versions2.candidates[0].url) ||
      !utils.urlRegex.test(raw.image_versions2.candidates[0].url)
    )
  ) {
    throw new Error(`com.instagram | invalid post format | raw.image_versions2 = ${JSON.stringify(raw.image_versions2)}`);
  }
  if (
    !singleImage &&
    raw.carousel_media.reduce((prev, media) => {
      let curr = false;
      if (
        check.not.object(media) ||
        check.not.object(media.image_versions2) ||
        check.not.array(media.image_versions2.candidates) ||
        check.emptyArray(media.image_versions2.candidates) ||
        check.not.string(media.image_versions2.candidates[0].url) ||
        check.emptyArray(utils.urlRegex.exec(media.image_versions2.candidates[0].url)?.[0] || '')
      ) {
        curr = true;
      }
      return prev || curr;
    }, false)
  ) {
    throw new Error(`com.instagram | invalid post format | raw.carousel_media = ${JSON.stringify(raw.carousel_media)}`);
  }
  if (check.not.integer(raw.taken_at)) {
    throw new Error(`com.instagram | invalid post format | raw.taken_at = ${JSON.stringify(raw.taken_at)}`);
  }
  // get user list
  if (check.not.object(raw.user)) {
    throw new Error(`com.instagram | invalid post format | raw.user = ${raw.user}`);
  }
  const creator = {
    fullName: raw.user.full_name,
    userId: raw.user.pk,
    userName: raw.user.username,
  };
  userNameMap[raw.user.username] = creator;
  //
  const atUserMap = {};
  if (check.object(raw.usertags) && check.array(raw.usertags.in)) {
    for (const { user } of raw.usertags.in) {
      if (user.pk && user.full_name) {
        atUserMap[user.pk] = {
          fullName: user.full_name,
          userId: user.pk,
          userName: user.username,
        };
        userNameMap[user.username] = atUserMap[user.pk];
      } else {
        const u = await getUserFromUserName({ userName: user.username, opt });
        atUserMap[u.userId] = u;
        //
        user.full_name = u.fullName;
        user.pk = u.userId;
      }
    }
  }
  if (!singleImage) {
    for (const media of raw.carousel_media) {
      if (check.object(media.usertags) && check.array(media.usertags.in)) {
        for (const { user } of media.usertags.in) {
          if (user.pk && user.full_name) {
            atUserMap[user.pk] = {
              fullName: user.full_name,
              userId: user.pk,
              userName: user.username,
            };
            userNameMap[user.username] = atUserMap[user.pk];
          } else {
            const u = await getUserFromUserName({ userName: user.username, opt });
            atUserMap[u.userId] = u;
            //
            user.full_name = u.fullName;
            user.pk = u.userId;
          }
          userNameMap[user.username] = atUserMap[user.pk];
        }
      }
    }
  }
  // get raw data of post (2)
  const userAndTagList = Array.from(
    $('body main span.x193iq5w.xeuugli.x1fj9vlw.x13faqbe.x1vvkbs.xt0psk2.x1i0vuye.xvs91rp.xo1l8bm.x5n08af.x10wh9bi.x1wdrske.x8viiok.x18hxmgj a').map((_, el) => {
      return el.children?.[0]?.data || '';
    }),
  ).filter(s => s);
  raw.html_at_user_list = [];
  raw.html_tag_list = [];
  for (const item of userAndTagList) {
    if (item.startsWith('@')) {
      raw.html_at_user_list.push(await getUserFromUserName({ userName: item.split('@').pop(), opt }));
    }
    if (item.startsWith('#')) {
      raw.html_tag_list.push(item.split('#').pop());
    }
  }
  const descriptionRegex = /"([\s\S]*)"/.exec($('head>meta[property="og:title"]')?.attr('content') || '""');
  raw.description = descriptionRegex ? descriptionRegex[1] : undefined;
  // common
  const tagList = [
    `_login=${loggedIn}`,
    '_source=instagram.com',
    `_user_id=instagram.com/${creator.userId}`,
    ...Object.keys(atUserMap).map(id => `_user_id=instagram.com/${id}`),
    ...raw.html_tag_list.map(tag => `_tag=instagram.com/${tag}`),
    ...raw.html_tag_list.map(tag => `_union_tag=${tag}`),
  ];
  const atUserList = Object.values(atUserMap).map(({ fullName, userName }) => {
    return { name: fullName, instagram_id: userName };
  });
  // The video cover has been counted 'raw.carousel_media.length'.
  // The video itself counted as 1.
  // As a result, a video will be counted as 2 media.
  const mediaCount = (singleImage ? 1 : raw.carousel_media.length) + (video ? 1 : 0);
  const annotation = {
    creator: {
      name: creator.fullName,
      instagram_id: creator.userName,
    },
    description: raw.description,
    media_count: mediaCount,
    at_user_list: atUserList.length > 0 ? atUserList : undefined,
  };
  // folder
  const folder = await utils.createEagleFolder({
    parentName: '.instagram.com',
    name: raw.code,
    summary: raw.description,
    mediaCount,
    source: `${eagle.generateTitle(raw.taken_at * 1000)}`,
    url,
  });
  // meta
  const metaFile = path.resolve(allConfig.runtime.wkdir, `com.instagram.${code}.meta.json`);
  fs.writeFileSync(metaFile, JSON.stringify(raw, null, 2));
  if (check.not.string(allConfig.eagle.stage) || check.emptyString(allConfig.eagle.stage) || !utils.urlRegex.test(allConfig.eagle.stage)) {
    // local
    await eagle.post('/api/item/addFromPaths', {
      items: [
        {
          path: path.resolve(metaFile),
          name: `${eagle.generateTitle(raw.taken_at * 1000)}`,
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
          name: `${eagle.generateTitle(raw.taken_at * 1000)}`,
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
  // image
  let payload;
  if (singleImage) {
    const mediaUrl = raw.image_versions2.candidates[0].url;
    payload = {
      items: [
        {
          url: mediaUrl,
          name: `${eagle.generateTitle(raw.taken_at * 1000 + 1)}`,
          website: url,
          annotation: JSON.stringify({ ...annotation, media_url: mediaUrl }),
          tags: tagList,
        },
      ],
      folderId: folder.id,
    };
  } else {
    payload = {
      items: raw.carousel_media.map((media, idx) => {
        const mediaUrl = media.image_versions2.candidates[0].url;
        return {
          url: mediaUrl,
          name: `${eagle.generateTitle(raw.taken_at * 1000 + 1 + idx)}`,
          website: url,
          annotation: JSON.stringify({ ...annotation, media_url: mediaUrl }),
          tags: tagList,
        };
      }),
      folderId: folder.id,
    };
  }
  if (video) {
    const urlList = raw.video_versions.filter(({ url }) => {
      return check.string(url) && utils.urlRegex.test(url);
    }).map(video => video.url);
    if (check.not.emptyArray(urlList)) {
      payload.items.push({
        url: urlList[0],
        name: `${eagle.generateTitle(raw.taken_at * 1000 + 1 + payload.items.length)}`,
        website: url,
        annotation: JSON.stringify({ ...annotation, media_url: urlList[0] }),
        tags: tagList,
      });
    }
  }
  await eagle.post('/api/item/addFromURLs', payload);
  // interval
  await utils.sleep(siteConfig.interval);
  //
  return `com.instagram | ok${loggedIn ? ' | login' : ''}`;
};

export { init, getUrl, save };
