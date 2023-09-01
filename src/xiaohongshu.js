import cheerio from 'cheerio';
import fetch from 'node-fetch';
//
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
  }, false) : false;
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
  await f(url).then((html) => {
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
    const mediaCount = note.imageList.length + (note.video ? 1 : 0);
    // folder
    await eagle.updateFolder({ name: '.import', description: '小红书' });
    await eagle.updateFolder({ name: '.xiaohongshu.com', parentName: '.import', description: '小红书' });
    const folder = await eagle.updateFolder({
      name: id,
      parentName: '.xiaohongshu.com',
      description: `<d>${[
        utils.generateXml({ key: 'title', value: note.title }),
        utils.generateXml({ key: 'media_count', value: mediaCount }),
      ].join('')}</d>`,
    });
    //
    const annotation = [
      utils.generateXml({ key: 'creator', value: note.user.nickname }),
      utils.generateXml({ key: 'title', value: note.title }),
      utils.generateXml({ key: 'description', value: note.desc }),
      utils.generateXml({ key: 'media_count', value: mediaCount }),
      utils.generateXmlList({ data: note.atUserList, selector: '?.nickname || null', tagName: 'at_user_list' }),
    ].join('');
    const tagList = [
      '_source=xiaohongshu.com',
      `_user_id=xiaohongshu.com/${note.user.userId}`,
      ...note.atUserList.filter(atUser => atUser?.userId || null).map(atUser => `_user_id=xiaohongshu.com/${atUser.userId}`),
      ...note.tagList.filter(tag => tag?.name || null).map(tag => `_tag=xiaohongshu.com/${tag.name}`),
      ...note.tagList.filter(tag => tag?.name || null).map(tag => `_union_tag=${tag.name}`),
    ];
    // image
    const payload = {
      items: note.imageList.map((image, idx) => {
        const pngUrl = image.url.replace('\\u002F', '/');
        return {
          url: pngUrl,
          name: `${eagle.generateTitle(note.time + idx)}`,
          website: url,
          annotation: `<d>${annotation}${utils.generateXml({ key: 'url', value: pngUrl })}</d>`,
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
      payload.items.push({
        url: video.masterUrl,
        name: `${eagle.generateTitle(note.time + payload.items.length)}`,
        website: url,
        annotation: `<d>${annotation}${utils.generateXmlList({ data: [ video.masterUrl, ...video.backupUrls ], tagName: 'url_list' })}</d>`,
        tags: tagList,
      });
    }
    return payload;
  }).then((payload) => {
    return eagle.post('/api/item/addFromURLs', payload);
  });
};

export { check, save };


