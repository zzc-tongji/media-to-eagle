import check from 'check-types';
import cheerio from 'cheerio';
//
import * as eagle from './eagle.js';
import * as utils from './utils.js';
const redIdMap = {};

const getRedIdFromUserId = async ({ userId, opt }) => {
  // cache get
  if (redIdMap[userId]) {
    return redIdMap[userId];
  }
  // parse data
  const html = await utils.getHtml({ ...opt, url: `https://www.xiaohongshu.com/user/profile/${userId}` });
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

const save = async ({ textWithUrl, headerMap, proxy }) => {
  // get note url
  const url = getUrl(textWithUrl);
  if (check.emptyString(url)) {
    throw Error(`com.xiaohongshu | invalid text with url | textWithUrl = ${textWithUrl}`);
  }
  // parse data
  const opt = {};
  opt.timeoutMs = 10000;
  if (check.string(proxy)) {
    opt.proxy = proxy;
  }
  opt.fetchOption = {};
  if (check.object(headerMap)) {
    opt.fetchOption.headers = headerMap;
  }
  if (
    (check.string(headerMap['User-Agent']) && check.not.emptyArray(headerMap['User-Agent'])) ||
    (check.string(headerMap['user-agent']) && check.not.emptyArray(headerMap['user-agent']))
  ) {
    opt.randomUserAgent = false;
  }
  //
  const html = await utils.getHtml({ ...opt, url });
  const $ = cheerio.load(html);
  let data = $('html body script:contains("window.__INITIAL_STATE__")').text();
  data = data.replace('window.__INITIAL_STATE__', 'data');
  eval(data);
  // validate data
  const loggedIn = data?.user?.loggedIn || false;
  const id = data?.note?.firstNoteId || '';
  const note = data?.note?.noteDetailMap[id]?.note || null;
  if (!(note instanceof Object) || Object.keys(note) <= 0) {
    throw new Error(`com.xiaohongshu | note non-existent | url = ${url}`);
  }
  // common
  if (
    typeof note?.user?.userId !== 'string' ||
    typeof note?.user?.nickname !== 'string' ||
    typeof note?.title !== 'string' ||
    typeof note?.desc !== 'string' ||
    typeof note?.time !== 'number' ||
    (!(note.tagList instanceof Array)) ||
    (!(note.atUserList instanceof Array))
  ) {
    throw new Error(`com.xiaohongshu | invalid note format | note = ${JSON.stringify(note)}`);
  }
  const redIdList = (await Promise.all(
    [ note.user, ...note.atUserList ].map(user => getRedIdFromUserId({ userId: user.userId, opt })),
  ));
  const tagList = [
    `_login=${loggedIn}`,
    '_source=xiaohongshu.com',
    `_user_id=xiaohongshu.com/${note.user.userId}`,
    ...note.atUserList.filter(atUser => atUser?.userId || null).map(atUser => `_user_id=xiaohongshu.com/${atUser.userId}`),
    ...note.tagList.filter(tag => tag?.name || null).map(tag => `_tag=xiaohongshu.com/${tag.name}`),
    ...note.tagList.filter(tag => tag?.name || null).map(tag => `_union_tag=${tag.name}`),
  ];
  const noteMediaCount = note.imageList.length + (note.video ? 1 : 0);
  const annotation = {
    creator: {
      name: note.user.nickname,
      red_id: redIdList[0],
    },
    title: note.title || undefined,
    description: note.desc || undefined,
    note_media_count: noteMediaCount,
    at_user_list: note.atUserList.length > 0 ? note.atUserList.map((u, i) => {
      return { name: u.nickname, red_id: redIdList[i] };
    }) : undefined,
  };
  // folder
  await eagle.updateFolder({ name: '.import' });
  await eagle.updateFolder({ name: '.xiaohongshu.com', parentName: '.import' });
  const folder = await eagle.updateFolder({
    name: id,
    parentName: '.xiaohongshu.com',
    description: JSON.stringify({ name: note.title || note.desc.split('\n')[0], note_media_count: noteMediaCount }),
  });
  // image
  const payload = {
    items: note.imageList.map((image, idx) => {
      const mediaUrl = (loggedIn ? image.infoList.find(info => info.imageScene === 'CRD_WM_JPG').url : image.url).replace('\\u002F', '/');
      return {
        url: mediaUrl,
        name: `${eagle.generateTitle(note.time + idx)}`,
        website: `https://www.xiaohongshu.com/explore/${id}`,
        annotation: JSON.stringify({ ...annotation, media_url: mediaUrl }),
        tags: tagList,
      };
    }),
    folderId: folder.id,
  };
  // video
  if (note.video) {
    const video = [
      note?.video?.media?.stream?.h264 || [],
      note?.video?.media?.stream?.h265 || [],
      note?.video?.media?.stream?.av1 || [],
    ].filter(v => v.length > 0)?.['0']?.['0'] || null;
    if (!video) {
      throw new Error(`com.xiaohongshu | invalid note format | note.video = ${JSON.stringify(note)}`);
    }
    if (
      typeof video.masterUrl != 'string' ||
      !(video.backupUrls instanceof Array)
    ) {
      throw new Error(`com.xiaohongshu | invalid note format | video = ${JSON.stringify(video)}`);
    }
    payload.items.push({
      url: video.masterUrl,
      name: `${eagle.generateTitle(note.time + payload.items.length)}`,
      website: `https://www.xiaohongshu.com/explore/${id}`,
      annotation: JSON.stringify({ ...annotation, media_url_list: [ video.masterUrl, ...video.backupUrls ] }),
      tags: tagList,
    });
  }
  // add to eagle
  await eagle.post('/api/item/addFromURLs', payload);
  return `com.xiaohongshu | ok${loggedIn ? ' | login' : ''}`;
};

export { getUrl, save };
