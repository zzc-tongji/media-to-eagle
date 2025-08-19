import * as fs from 'node:fs';
import * as path from 'node:path';
//
import { ArgumentParser } from 'argparse';
import check from 'check-types';
//
import * as eagle from '../eagle.js';
import * as setting from '../setting.js';

const main = async () => {
  const parser = new ArgumentParser({
    description: 'Get URL List',
  });
  parser.add_argument('--setting', '-s', { help: 'setting for fetching, absolute path OR relative path based on "--wkdir"', default: './setting.media-to-eagle.json' });
  parser.add_argument('--wkdir', '-w', { help: 'working directory', required: true });
  const argv = parser.parse_args();
  //
  let allConfig = null;
  try {
    const w = path.resolve(argv.wkdir);
    const s = path.isAbsolute(argv.setting) ? argv.setting : path.resolve(w, argv.setting);
    setting.post(JSON.parse(fs.readFileSync(s, { encoding: 'utf-8' })));
    allConfig = setting.get();
    allConfig.runtime = { wkdir: w, setting: s };
  } catch (error) {
    console.log(`invalid parameter | --setting="${argv.setting}" --wkdir="${argv.wkdir}" | ${error.message}`);
    return 1;
  }
  //
  eagle.init();
  //
  const info = await eagle.get('/api/library/info');
  if (!info.data || check.not.object(info.data)) {
    throw new Error(`check-library.js | eagle | GET /api/library/info | ${info.message}`);
  }
  const errorList = [];
  const folderNameList = [
    '.xiaohongshu.com',
    '.instagram.com',
    '.weibo.com',
    '.x.com',
    '.ameblo.jp',
    '.blog.livedoor.jp',
    //
    'xiaohongshu.com',
    'instagram.com',
    'weibo.com',
    'x.com',
    'ameblo.jp',
    'blog.livedoor.jp',
  ];
  for (let i = 0; i < folderNameList.length; i++) {
    const folderName = folderNameList[i];
    const folder = eagle.searchFolderPreOrder({ name: folderName, data: { children: info.data.folders } });
    if (!folder) {
      continue;
    }
    const obj = {};
    for (let i = 0; i < folder.children.length; i++) {
      const f = folder.children[i];
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
      if (!check.number(description.media_count)) {
        continue;
      }
      const item = await eagle.get('/api/item/list', `folders=${f.id}&orderBy=NAME`);
      if (!item.data || check.not.array(item.data)) {
        throw new Error(`check-library.js | eagle | GET /api/item/list | ${info.message}`);
      }
      // duplicate
      if (obj[f.name]) {
        errorList.push(`${description.url} | ${folderName} | ${f.name} | duplicate`);
      }
      obj[f.name] = true;
      // empty folder
      if (item.data.length <= 0) {
        errorList.push(`${description.url} | ${folderName} | ${f.name} | empty folder`);
        continue;
      }
      // skip todo
      if (item.data[0].tags && (item.data[0].tags.includes('_todo=true') || item.data[0].tags.includes('todo'))) {
        continue;
      }
      // folder count
      const meta_count = item.data.filter(i => [ 'json', 'html' ].includes(i.ext)).length;
      if (meta_count !== 1) {
        errorList.push(`${description.url} | ${folderName} | ${f.name} | meta file (json/html) not unique | meta_count = ${meta_count}`);
      }
      if (description.media_count <= 0) {
        errorList.push(`${description.url} | ${folderName} | ${f.name} | media_count = ${description.media_count}`);
      }
      const image_count = item.data.filter(i => [ 'jpg', 'png', 'heic', 'webp' ].includes(i.ext)).length;
      const video_count = item.data.filter(i => [ 'mp4' ].includes(i.ext)).length;
      if (description.media_count !== image_count + video_count) {
        errorList.push(`${description.url} | ${folderName} | ${f.name} | media_count !== image_count + video_count | media_count = ${description.media_count} | image_count = ${image_count} | video_count = ${video_count}`);
      }
    }
  }
  fs.writeFileSync(path.resolve(argv.wkdir, 'library.error.txt'), errorList.join('\n'), { encoding: 'utf-8' });
  console.log(`finished with ${errorList.length} error(s) found => "${path.resolve(argv.wkdir, 'library.error.txt')}"`);
};

main();
