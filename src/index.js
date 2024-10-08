import * as fs from 'node:fs';
import * as path from 'node:path';
//
import { ArgumentParser } from 'argparse';
import check from 'check-types';
//
import * as com_instagram from './com.instagram.js';
import * as com_xiaohongshu from './com.xiaohongshu.js';
import * as com_weibo from './com.weibo.js';
import * as com_x from './com.x.js';
import * as jp_ameblo from './jp.ameblo.js';
import * as com_pinterest from './com.pinterest.js';
//
import * as collection from './collection.js';
import * as eagle from './eagle.js';
import * as setting from './setting.js';
import { pptr } from './utils.js';

const main = async () => {
  //
  // get parameter
  //
  const parser = new ArgumentParser({
    description: 'Media to Eagle',
  });
  parser.add_argument('--url', '-u', { help: 'url for fetching' });
  parser.add_argument('--list', '-l', { help: 'url list for fetching, splitted by linebreak, absolute path OR relative path based on "--wkdir"', default: './list.txt' });
  parser.add_argument('--setting', '-s', { help: 'setting for fetching, absolute path OR relative path based on "--wkdir"', default: './setting.json' });
  parser.add_argument('--collection', '-c', { help: 'setting for fetching, absolute path OR relative path based on "--wkdir"', default: './collection.txt' });
  parser.add_argument('--wkdir', '-w', { help: 'working directory', required: true });
  const argv = parser.parse_args();
  // url list
  const urlList = [];
  if (argv.url) {
    urlList.push(argv.url);
  }
  if (argv.list) {
    try {
      const l = path.isAbsolute(argv.list) ? argv.list : path.resolve(`${argv.wkdir}${path.sep}${argv.list}`);
      urlList.push(...fs.readFileSync(l, { encoding: 'utf-8' }).split(/\r?\n|\s/).map((url) => {
        return url.trim();
      }).filter((url) => {
        return check.not.emptyString(url) && !url.startsWith('#') && !url.startsWith(';') && !url.startsWith('//');
      }));
    } catch {
      console.log(`invalid parameter | --list="${argv.list}" --wkdir="${argv.wkdir}" | no such text file`);
    }
  }
  // setting & collection
  let allConfig = null;
  try {
    const w = path.resolve(argv.wkdir);
    const s = path.isAbsolute(argv.setting) ? argv.setting : path.resolve(w, argv.setting);
    const c = path.isAbsolute(argv.collection) ? argv.collection : path.resolve(w, argv.collection);
    //
    setting.post(JSON.parse(fs.readFileSync(s, { encoding: 'utf-8' })));
    allConfig = setting.get();
    allConfig.runtime = { wkdir: w, setting: s, collection: c };
    //
    collection.load(c);
  } catch (error) {
    console.log(error.message);
    console.log(`invalid parameter | --setting="${argv.setting}" --collection="${argv.collection}" --wkdir="${argv.wkdir}" | ${error.message}`);
    return 1;
  }
  //
  // init
  //
  eagle.init();
  const handlerList = {
    com_pinterest,
    //
    com_instagram,
    com_xiaohongshu,
    com_weibo,
    com_x,
    jp_ameblo,
  };
  for (const key in handlerList) {
    const handler = handlerList[key];
    handler.init();
  }
  //
  // prepare
  //
  if (allConfig?.meta?.cleanBeforeStart) {
    const fileList = fs.readdirSync(allConfig.runtime.wkdir, { withFileTypes: true });
    fileList.map((file) => {
      if (!file.isFile()) {
        return;
      }
      if (/.meta.(json|html)$/.test(file.name)) {
        fs.unlinkSync(`${file.path || file.parentPath}${path.sep}${file.name}`);
      }
    });
  }
  //
  const info = await eagle.get('/api/library/info');
  const folderNameList = [
    '.xiaohongshu.com',
    '.instagram.com',
    '.weibo.com',
    '.x.com',
    '.ameblo.jp',
    //
    'xiaohongshu.com',
    'instagram.com',
    'weibo.com',
    'x.com',
    'ameblo.jp',
  ];
  folderNameList.map((folderName) => {
    const folder = eagle.searchFolderPreOrder({ name: folderName, data: { children: info.data.folders } });
    if (!folder) {
      return;
    }
    folder.children.map((f) => {
      let description;
      try {
        description = JSON.parse(f.description);
      } catch (error) {
        if (check.emptyString(f.description)) {
          description = {};
        } else {
          const d = f.description.replaceAll(/\u003ca[\s]+?[\s\S]*?\u003e/g, '').replaceAll(/\u003c\/a\u003e/g, '');
          description = JSON.parse(d);
        }
      }
      //
      if (description.url) {
        collection.add(description.url);
      }
    });
  });
  {
    // pinterest
    const [ { id: p0 }, { id: p1 } ] = [
      await eagle.updateFolder({ name: 'pinterest.com' }),
      await eagle.updateFolder({ name: '.pinterest.com', parentName: '.import' }),
    ];
    const { data } = await eagle.get('/api/item/list', `orderBy=NAME&folders=${p0},${p1}&limit=1000000`);
    data.map(d => {
      // URL
      collection.add(d.url);
      // media ID
      let annotation;
      try {
        annotation = JSON.parse(d.annotation);
      } catch (error) {
        if (check.emptyString(d.annotation)) {
          annotation = {};
        } else {
          const j = d.annotation.replaceAll(/\u003ca[\s]+?[\s\S]*?\u003e/g, '').replaceAll(/\u003c\/a\u003e/g, '');
          annotation = JSON.parse(j);
        }
      }
      //
      if (annotation.media_url) {
        collection.add(annotation.media_url);
      }
    });
  }
  //
  fs.writeFileSync(path.resolve(allConfig.runtime.wkdir, 'setting.runtime.json'), JSON.stringify(allConfig, null, 2), { encoding: 'utf-8' });
  //
  // handle url
  //
  for (const url of urlList) {
    let hit = false;
    for (const key in handlerList) {
      const handler = handlerList[key];
      if (await handler.getUrl(url)) {
        hit = true;
        try {
          const message = await handler.save({ textWithUrl: url });
          console.log(`${url} | ${message}`);
          break;
        } catch (error) {
          console.log(`${url} | ${error.message}`);
        }
      }
    }
    if (!hit) { console.log(`${url} | handler not found`); }
  }
  //
  // clean
  //
  if (pptr.browser) {
    if (!allConfig.browser.puppeteer.debug.enable) {
      await pptr.browser.close();
      pptr.browser = null;
      pptr.page = null;
      pptr.cookie = null;
    } else {
      console.log('Close browser window to exit.');
    }
  }
  console.log('Finish.');
};

main();
