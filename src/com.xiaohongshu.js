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
const redIdMap = {};
const init = () => {
  allConfig = setting.get();
  siteConfig = allConfig.site['com.xiaohongshu'];
};

const getRedIdFromUserId = async ({ userId, opt }) => {
  // cache get
  if (redIdMap[userId]) {
    return redIdMap[userId];
  }
  // parse data
  const html = await utils.getHtmlByFetch({ ...opt, url: `https://www.xiaohongshu.com/user/profile/${userId}` });
  const $ = cheerio.load(html);
  let data = $('html body script:contains("window.__INITIAL_STATE__")').text();
  data = data.replace('window.__INITIAL_STATE__', 'data');
  eval(data);
  const redId = data?.user?.userPageData?.basicInfo?.redId.toString() || '';
  // cache set
  if (redId) {
    redIdMap[userId] = redId;
  }
  return redId;
};

const getUrl = (textWithUrl = '') => {
  if (check.not.string(textWithUrl)) {
    return '';
  }
  let url = utils.urlRegex.exec(textWithUrl)?.[0] || '';
  const valid = [
    '/xhslink.com/',
    '/www.xiaohongshu.com/discovery/item/',
    '/www.xiaohongshu.com/explore/',
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

const save = async ({ textWithUrl }) => {
  // get note url
  const url = getUrl(textWithUrl);
  if (check.emptyString(url)) {
    throw Error(`com.xiaohongshu | invalid text with url | textWithUrl = ${textWithUrl}`);
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
  const $ = cheerio.load(html);
  let data = $('html body script:contains("window.__INITIAL_STATE__")').text();
  data = data.replace('window.__INITIAL_STATE__', 'data');
  eval(data);
  // validate data
  const loggedIn = data?.user?.loggedIn || false;
  const id = data?.note?.firstNoteId || '';
  const note = data?.note?.noteDetailMap[id]?.note || null;
  if (check.not.object(note) || check.emptyObject(note)) {
    throw new Error(`com.xiaohongshu | note non-existent OR human verification | url = ${url}`);
  }
  if (check.not.string(note?.user?.userId) || check.emptyString(note?.user?.userId)) {
    throw new Error(`com.xiaohongshu | invalid note format | note?.user?.userId | ${JSON.stringify(note)}`);
  }
  if (check.not.string(note?.user?.nickname) || check.emptyString(note?.user?.nickname)) {
    throw new Error(`com.xiaohongshu | invalid note format | note?.user?.nickname | ${JSON.stringify(note)}`);
  }
  if (check.not.string(note?.title)) {
    throw new Error(`com.xiaohongshu | invalid note format | note?.title | ${JSON.stringify(note)}`);
  }
  if (check.not.string(note?.desc)) {
    throw new Error(`com.xiaohongshu | invalid note format | note?.desc | ${JSON.stringify(note)}`);
  }
  if (check.not.number(note?.time)) {
    throw new Error(`com.xiaohongshu | invalid note format | note?.time | ${JSON.stringify(note)}`);
  }
  if (check.not.array(note?.tagList)) {
    throw new Error(`com.xiaohongshu | invalid note format | note?.tagList | ${JSON.stringify(note)}`);
  }
  if (check.not.array(note?.atUserList)) {
    throw new Error(`com.xiaohongshu | invalid note format | note?.atUserList | ${JSON.stringify(note)}`);
  }
  // get red id
  note.user.redId = await getRedIdFromUserId({ userId: note.user.userId, opt });
  for (const u of note.atUserList) {
    u.redId = await getRedIdFromUserId({ userId: u.userId, opt });
  }
  // common
  const tagList = [
    `_login=${loggedIn}`,
    '_source=xiaohongshu.com',
    `_user_id=xiaohongshu.com/${note.user.userId}`,
    ...note.atUserList.filter(atUser => atUser?.userId || null).map(atUser => `_user_id=xiaohongshu.com/${atUser.userId}`),
    ...note.tagList.filter(tag => tag?.name || null).map(tag => `_tag=xiaohongshu.com/${tag.name}`),
    ...note.tagList.filter(tag => tag?.name || null).map(tag => `_union_tag=${tag.name}`),
  ];
  const mediaCount = note.imageList.length + (note.video ? 1 : 0);
  const annotation = {
    creator: {
      name: note.user.nickname,
      red_id: note.user.redId,
    },
    title: note.title || undefined,
    description: note.desc || undefined,
    media_count: mediaCount,
    at_user_list: note.atUserList.length > 0 ? note.atUserList.map((u) => {
      return { name: u.nickname, red_id: u.redId };
    }) : undefined,
  };
  // folder
  const website = `https://www.xiaohongshu.com/explore/${id}`;
  const folder = await utils.createEagleFolder({
    parentName: '.xiaohongshu.com',
    name: id,
    summary: note.title || note.desc.split('\n')[0] || undefined,
    mediaCount,
    source: `${eagle.generateTitle(note.time)}`,
    url: website,
  });
  // meta
  const metaFile = path.resolve(allConfig.runtime.wkdir, `${Date.now()}.com.xiaohongshu.${id}.meta.json`);
  fs.writeFileSync(metaFile, JSON.stringify(note, null, 2));
  if (check.not.string(allConfig.eagle.stage) || check.emptyString(allConfig.eagle.stage) || !utils.urlRegex.test(allConfig.eagle.stage)) {
    // local
    await eagle.post('/api/item/addFromPaths', {
      items: [
        {
          path: path.resolve(metaFile),
          name: `${eagle.generateTitle(note.time)}`,
          website,
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
          name: `${eagle.generateTitle(note.time)}`,
          website,
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
  const payload = {
    items: note.imageList.map((image, idx) => {
      const mediaUrl = image.urlDefault.replace('\\u002F', '/');
      return {
        url: mediaUrl,
        name: `${eagle.generateTitle(note.time + 1 + idx)}`,
        website,
        tags: tagList,
        annotation: JSON.stringify({ ...annotation, media_url: mediaUrl }),
      };
    }),
    folderId: folder.id,
  };
  // video
  if (check.object(note?.video)) {
    const video = [
      note?.video?.media?.stream?.h264 || [],
      note?.video?.media?.stream?.h265 || [],
      note?.video?.media?.stream?.av1 || [],
    ].filter(v => v.length > 0)?.['0']?.['0'] || null;
    if (check.not.object(video)) {
      throw new Error(`com.xiaohongshu | invalid note format | note?.video = ${JSON.stringify(note?.video)}`);
    }
    if (check.not.string(video?.masterUrl) || !utils.urlRegex.test(video?.masterUrl)) {
      throw new Error(`com.xiaohongshu | invalid note format | note?.video?.masterUrl = ${JSON.stringify(video)}`);
    }
    payload.items.push({
      url: video.masterUrl,
      name: `${eagle.generateTitle(note.time + 1 + payload.items.length)}`,
      website,
      annotation: JSON.stringify({ ...annotation, media_url: video.masterUrl }),
      tags: tagList,
    });
  }
  // add to eagle
  await eagle.post('/api/item/addFromURLs', payload);
  // interval
  await utils.sleep(siteConfig.interval);
  //
  return `com.xiaohongshu | ok${loggedIn ? ' | login' : ' | non-login'}`;
};

export { init, getUrl, save };
