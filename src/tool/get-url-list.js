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
    throw new Error(`get-url-list.js | eagle | GET /api/library/info | ${info.message}`);
  }
  const folderNameList = [
    // '.xiaohongshu.com',
    // '.instagram.com',
    // '.weibo.com',
    // '.x.com',
    // '.ameblo.jp',
    // '.pinterest.com',
    // '.blog.livedoor.jp',
    // '.blog.goo.ne.jp',
    //
    'xiaohongshu.com',
    'instagram.com',
    'weibo.com',
    'x.com',
    'ameblo.jp',
    'pinterest.com',
    'blog.livedoor.jp',
    'blog.goo.ne.jp',
  ];
  folderNameList.map((folderName) => {
    const folder = eagle.searchFolderPreOrder({ name: folderName, data: { children: info.data.folders } });
    if (!folder) {
      return;
    }
    if (folderName.includes('pinterest.com')) {
      eagle.get('/api/item/list', `limit=1000000&folders=${folder.id}`).then((response) => {
        if (!check.array(response.data)) {
          return;
        }
        const pinterestList = [];
        const referenceList = [];
        response.data.map((item) => (item.url.includes('www.pinterest.com') ? pinterestList : referenceList).push(item.url));
        fs.writeFileSync(path.resolve(argv.wkdir, `url-list.${folderName}.txt`), pinterestList.join('\n'), { encoding: 'utf-8' });
        fs.writeFileSync(path.resolve(argv.wkdir, `url-list.${folderName}.reference.txt`), referenceList.sort().join('\n'), { encoding: 'utf-8' });
        return;
      });
      return;
    }
    const text = folder.children.map((f) => {
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
      return description.url || '(blank)';
    }).join('\n');
    if (text === '\n') {
      return;
    }
    fs.writeFileSync(path.resolve(argv.wkdir, `url-list.${folderName}.txt`), text, { encoding: 'utf-8' });
  });
  console.log(`Result is located at "${path.resolve(argv.wkdir, 'url-list.*.txt')}".`);
};

main();
