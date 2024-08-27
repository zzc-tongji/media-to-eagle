import * as fs from 'node:fs';
import * as path from 'node:path';
import 'node:readline';
//
import { ArgumentParser } from 'argparse';
import check from 'check-types';
//
import * as com_instagram from './com.instagram.js';
import * as com_xiaohongshu from './com.xiaohongshu.js';
import * as eagle from './eagle.js';
import * as setting from './setting.js';

const main = async () => {
  //
  // get parameter
  //
  const parser = new ArgumentParser({
    description: 'Media to Eagle',
  });
  parser.add_argument('--url', '-u', { help: 'url for fetching' });
  parser.add_argument('--list', '-l', { help: 'url list for fetching, splitted by linebreak', default: './list.txt' });
  parser.add_argument('--setting', '-s', { help: 'setting for fetching', default: './setting.json' });
  parser.add_argument('--wkdir', '-w', { help: 'working directory', default: '.' });
  parser.add_argument('--debug', '-d', { help: 'debug mode', default: 'false' });
  parser.add_argument('--browser', '-b', { help: 'time (ms) of keeping browser open, only available when "--debug=true"', default: '' });
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
  // setting
  try {
    const w = path.resolve(argv.wkdir);
    const s = path.isAbsolute(argv.setting) ? argv.setting : path.resolve(w, argv.setting);
    setting.post(JSON.parse(fs.readFileSync(s, { encoding: 'utf-8' })));
    const allConfig = setting.get();
    allConfig.runtime = { wkdir: w, setting: s };
    if (argv.debug.toLowerCase() === 'true') {
      allConfig.debug.enable = true;
    }
    if (argv.browser) {
      allConfig.debug.keepBrowserMs = Math.max(parseInt(argv.browser), 10000);
    }
    if (allConfig.debug.enable) {
      console.log(JSON.stringify(allConfig, null, 2));
    }
  } catch (error) {
    console.log(`invalid parameter | --setting="${argv.setting}" --wkdir="${argv.wkdir}" | ${error.message}`);
    return 1;
  }
  //
  // init
  //
  eagle.init();
  const handlerList = {
    com_instagram,
    com_xiaohongshu,
  };
  for (const key in handlerList) {
    const handler = handlerList[key];
    handler.init();
  }
  //
  // handle url
  //
  for (const url of urlList) {
    for (const key in handlerList) {
      const handler = handlerList[key];
      if (handler.getUrl(url)) {
        try {
          const message = await handler.save({ textWithUrl: url });
          console.log(`${url} | ${message}`);
          break;
        } catch (error) {
          console.log(`${url} | ${error.message}`);
        }
      }
    }
  }
};

main().then((exitCode) => {
  process.exit(exitCode);
});
