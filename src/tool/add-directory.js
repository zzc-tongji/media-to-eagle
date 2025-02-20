import * as fs from 'node:fs';
import * as path from 'node:path';
//
import { ArgumentParser } from 'argparse';
//
import * as eagle from '../eagle.js';
import * as setting from '../setting.js';
import * as utils from '../utils.js';

const main = async () => {
  const parser = new ArgumentParser({
    description: 'Add Directory',
  });
  parser.add_argument('--setting', '-s', { help: 'setting for fetching, absolute path OR relative path based on "--wkdir"', default: './setting.media-to-eagle.json' });
  parser.add_argument('--wkdir', '-w', { help: 'working directory', required: true });
  parser.add_argument('--directory', '-d', { help: 'directory with object(s) into Eagle, absolute path OR relative path based on "--wkdir"', required: true });
  parser.add_argument('--name', '-n', { help: 'first file name, should be UTC time matched regex /^(\\d{4})(\\d{2})(\\d{2})_(\\d{2})(\\d{2})(\\d{2})_(\\d{3})$/', required: true });
  const argv = parser.parse_args();
  //
  let allConfig = null;
  try {
    const w = path.resolve(argv.wkdir);
    const s = path.isAbsolute(argv.setting) ? argv.setting : path.resolve(w, argv.setting);
    const d = path.isAbsolute(argv.directory) ? argv.directory : path.resolve(w, argv.directory);
    //
    const temp = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_(\d{3})$/.exec(argv.name);
    if (!temp) {
      console.log(`invalid parameter | --name="${argv.name}" | not match `);
      return 1;
    }
    temp.shift();
    temp[1] = `${parseInt(temp[1]) - 1}`;
    //
    setting.post(JSON.parse(fs.readFileSync(s, { encoding: 'utf-8' })));
    allConfig = setting.get();
    allConfig.runtime = { wkdir: w, setting: s, directory: d };
    //
    const date = new Date(...temp);
    allConfig.runtime.timestampMs = date.valueOf() - date.getTimezoneOffset() * 60 * 1000;
  } catch (error) {
    console.log(`invalid parameter | --setting="${argv.setting}" --wkdir="${argv.wkdir}" --directory="${argv.directory}" --name="${argv.name}" | ${error.message}`);
    return 1;
  }
  //
  eagle.init();
  //
  const nameList = fs.readdirSync(allConfig.runtime.directory).sort();
  if (nameList.length > 0) {
    const pathList = nameList.map(p => `${allConfig.runtime.directory}${path.sep}${p}`);
    const folder = await utils.createEagleFolder({ parentName: '.import', name: path.basename(allConfig.runtime.directory) });
    await eagle.post('/api/item/addFromPaths', {
      items: pathList.map((p, i) => {
        return {
          path: p,
          name: eagle.generateTitle(allConfig.runtime.timestampMs + i),
          annotation: JSON.stringify({ file_name: nameList[i] }),
        };
      }),
      folderId: folder.id,
    });
  }
  console.log(`${nameList.length} file(s) in directory ${allConfig.runtime.directory} have been added to Eagle.`);
};

main();
