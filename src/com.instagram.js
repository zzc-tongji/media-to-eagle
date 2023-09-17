import * as fs from 'node:fs';
import * as path from 'node:path';
//
import check from 'check-types';
import cheerio from 'cheerio';
//
import * as eagle from './eagle.js';
import * as utils from './utils.js';

const searchObjectWithKeyValue = (full, key, value) => {
  if (!(full instanceof Object)) {
    return null;
  }
  for (const k of Object.keys(full)) {
    const v = full[k];
    if (k === key && v === value) {
      return full;
    }
    const res = searchObjectWithKeyValue(v, key, value);
    if (res) {
      return res;
    }
  }
  return null;
};

const userNameMap = {};

const getUserFromUserName = async ({ userName, opt }) => {
  // cache get
  if (userNameMap[userName]) {
    return userNameMap[userName];
  }
  // parse data
  const html = await utils.getHtmlByPuppeteer({ ...opt, url: `https://www.instagram.com/${userName}` });
  const $ = cheerio.load(html);
  //
  fs.writeFileSync('1.htm', html);
  const title = $('head>meta[property="og:title"]')?.attr('content') || '';
  const temp = /^(.*)\(@(.*)\)(.*)$/.exec(title);
  if (!temp) {
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
  user.userId = searchObjectWithKeyValue(full, 'content_type', 'PROFILE').target_id;
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
    '/www.instagram.com/p/',
  ].reduce((prev, curr) => {
    return prev || url.includes(curr);
  }, false);
  if (!valid) {
    return '';
  }
  url = url.split('?')[0];
  url = url.split('#')[0];
  return url;
};

const save = async ({ textWithUrl, headerMap, proxy, debug }) => {
  // get note url
  const inputUrl = getUrl(textWithUrl);
  if (check.emptyString(inputUrl)) {
    throw Error(`com.instagram | invalid text with url | textWithUrl = ${textWithUrl}`);
  }
  // parse data
  const opt = {};
  opt.timeoutMs = 60000;
  if (check.string(proxy)) {
    opt.proxy = proxy;
  }
  if (check.object(headerMap)) {
    opt.headerMap = headerMap;
  }
  if (
    (check.string(headerMap['User-Agent']) && check.not.emptyArray(headerMap['User-Agent'])) ||
    (check.string(headerMap['user-agent']) && check.not.emptyArray(headerMap['user-agent']))
  ) {
    opt.randomUserAgent = false;
  }
  opt.blockUrlList = [
    'https://edge-chat.instagram.com/',
    'https://www.facebook.com/',
  ];
  if (debug) {
    opt.debug = true;
  }
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
  const rawLogin = searchObjectWithKeyValue(full, '0', 'XIGSharedData');
  let loggedIn = false;
  if (check.array(rawLogin) && rawLogin.length > 2 && check.string(rawLogin[2].raw)) {
    try {
      loggedIn = check.object(JSON.parse(rawLogin[2].raw)?.config?.viewer || null);
    } catch {
      //
    }
  }
  if (!loggedIn) {
    throw Error(`com.instagram | login required | headerMap.cookie = ${headerMap.cookie}`);
  }
  const raw = searchObjectWithKeyValue(full, 'code', code);
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
  const descriptionReges = /"([\s\S]*)"/.exec($('head>meta[property="og:title"]')?.attr('content') || '""');
  raw.description = descriptionReges ? descriptionReges[1] : '';
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
    return { full_name: fullName, user_name: userName };
  });
  const mediaCount = singleImage ? 1 : raw.carousel_media.length;
  const annotation = {
    creator: {
      full_name: creator.fullName,
      user_name: creator.userName,
    },
    description: raw.description,
    media_count: mediaCount,
    at_user_list: atUserList.length > 0 ? atUserList : undefined,
  };
  // folder
  await eagle.updateFolder({ name: '.import' });
  await eagle.updateFolder({ name: '.instagram.com', parentName: '.import' });
  const folder = await eagle.updateFolder({
    name: raw.code,
    parentName: '.instagram.com',
    description: JSON.stringify({ media_count: mediaCount, name: raw.description }),
  });
  // meta
  const metaFile = `com.instagram.${code}.json`;
  fs.writeFileSync(metaFile, JSON.stringify(raw, null, 2));
  await eagle.post('/api/item/addFromPath', {
    path: path.resolve(metaFile),
    name: `${eagle.generateTitle(raw.taken_at * 1000)}`,
    website: url,
    tags: tagList,
    annotation: JSON.stringify(annotation),
    folderId: folder.id,
  });
  await utils.sleep(1000);
  if (!debug) {
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
  return `com.instagram | ok${loggedIn ? ' | login' : ''}`;
};

export { getUrl, save };