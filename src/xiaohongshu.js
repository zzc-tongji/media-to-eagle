import cheerio from 'cheerio';
import fetch from 'node-fetch';

import * as eagle from './eagle.js';
import * as utils from './utils.js';

const f = async (resource, options) => {
  if (!(options instanceof Object)) {
    options = {};
  }
  options.redirect = 'manual';
  if (!(options.headers instanceof Object)) {
    options.headers = {};
  }
  options.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36';
  //
  return fetch(resource, options)
    .catch(() => {
      throw new Error('xiaohongshu | network issue');
    })
    .then((response) => {
      if (response.status <= 199 || response.status > 400) {
        throw new Error(`xiaohongshu | incorrect http status code | response.status = ${response.status}`);
      }
      return response.text();
    });
};

const check = (textWithUrl) => {
  return typeof textWithUrl === 'string' ? [
    'xhslink.com',
    'xiaohongshu.com/discovery/item',
    'xiaohongshu.com/explore',
  ].reduce((prev, curr) => {
    return prev || textWithUrl.includes(curr);
  }, true) : false;
};

const save = async (textWithUrl = '') => {
  let url = utils.urlRegex.exec(textWithUrl)?.[0] || '';
  if (url.includes('xhslink.com')) {
    url = await f(url).then((html) => {
      return utils.urlRegex.exec(html)?.[0] || '';
    });
  }
  if (url.includes('xiaohongshu.com/discovery/item')) {
    url = url.replace('/discovery/item', '/explore');
  }
  if (!url.includes('xiaohongshu.com/explore')) {
    throw Error(`xiaohongshu | invalid url | url = ${url}`);
  }
  url = url.split('?')[0];
  const result = await f(url).then((html) => {
    const $ = cheerio.load(html);
    let data = $('html body script:contains("window.__INITIAL_STATE__")').text();
    data = data.replace('window.__INITIAL_STATE__', 'data');
    eval(data);
    return data;
  }).then(async (data) => {
    const id = data?.note?.firstNoteId || '';
    const note = data?.note?.noteDetailMap[id]?.note || null;
    if (!(note instanceof Object) || Object.keys(note) <= 0) {
      throw new Error(`xiaohongshu | note non-existent | url = ${url}`);
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
      throw new Error(`xiaohongshu | invalid note format | note = ${JSON.stringify(note)}`);
    }
    // folder
    await eagle.updateFolder({ name: 'xiaohongshu.com', description: '小红书' });
    await eagle.updateFolder({ name: note.user.userId, parentName: 'xiaohongshu.com', description: note.user.nickname });
    const folder = await eagle.updateFolder({ name: id, parentName: note.user.userId, description: note.title });
    //
    const atUserNicknameList = note.atUserList.map(atUser => atUser.nickname ? atUser.nickname : '').filter(s => s);
    const annotation = `<author v="${note.user.nickname}" /><title v="${note.title}" /><desc v="${note.desc}" />${atUserNicknameList.length > 0 ? `<atUser>${atUserNicknameList.map(v => `<i v="${v}" />`).join('')}</atUser>` : ''}`;
    const tagList = [
      `userId:xiaohongshu.com/${note.user.userId}`,
      ...note.atUserList.map(atUser => atUser.userId ? `userId:xiaohongshu.com/${atUser.userId}` : '').filter(s => s),
      ...note.tagList.map(tag => tag.name ? `tag:${tag.name}` : '').filter(t => t),
    ];
    // image
    const payload = {
      items: note.imageList.map((image, idx) => {
        const pngUrl = image.url.replace('\\u002F', '/');
        return {
          url: pngUrl,
          name: `${eagle.generateTitle(note.time + idx)}`,
          website: url,
          annotation: `<d>${annotation}<url v="${pngUrl}" /></d>`,
          tags: tagList,
        };
      }),
      folderId: folder.id,
    };
    if (note.video) {
      // video
      const video = [
        note?.video?.media?.stream?.h264 || [],
        note?.video?.media?.stream?.h265 || [],
        note?.video?.media?.stream?.av1 || [],
      ].filter(v => v.length > 0)?.['0']?.['0'] || null;
      if (!video) {
        throw new Error(`xiaohongshu | invalid note format | note.video = ${JSON.stringify(note)}`);
      }
      if (
        typeof video.masterUrl != 'string' ||
        !(video.backupUrls instanceof Array)
      ) {
        throw new Error(`xiaohongshu | invalid note format | video = ${JSON.stringify(video)}`);
      }
      const backupUrlsList = video.backupUrls.filter(s => s);
      payload.items.push({
        url: video.masterUrl,
        name: `${eagle.generateTitle(note.time + payload.items.length)}`,
        website: url,
        annotation: `<d>${annotation}<masterUrl v="${video.masterUrl}" />${backupUrlsList.length > 0 ? `<backupUrls>${backupUrlsList.map(v => `<i v="${v}" />`).join('')}</backupUrls>` : ''}</d>`,
        tags: tagList,
      });
    }
    return payload;
  }).then((payload) => {
    return eagle.post('/api/item/addFromURLs', payload);
  });
  console.log(JSON.stringify(result));
  return 0;
};

export { check, save };


