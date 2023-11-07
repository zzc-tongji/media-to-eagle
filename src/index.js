import * as fs from 'node:fs';
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
  parser.add_argument('--list', '-l', { help: 'url list for fetching, splitted by linebreak' });
  parser.add_argument('--setting', '-s', { help: 'setting for fetching', required: true });
  parser.add_argument('--debug', '-d', { help: 'debug mode', default: 'true' });
  parser.add_argument('--browser', '-b', { help: 'time (ms) of keeping browser open, only available when "--debug=true"', default: '10000' });
  const argv = parser.parse_args();
  // url list
  const urlList = [];
  if (argv.url) {
    urlList.push(argv.url);
  }
  if (argv.list) {
    try {
      urlList.push(...fs.readFileSync(argv.list, { encoding: 'utf-8' }).split(/\r?\n|\siteConfig/).map((url) => {
        return url.trim();
      }).filter((url) => {
        return check.not.emptyString(url) && !url.startsWith('#') && !url.startsWith(';') && !url.startsWith('//');
      }));
    } catch {
      console.log(`invalid parameter | --list="${argv.list}" | no such text file`);
      return 1;
    }
  }
  // setting
  if (argv.setting) {
    try {
      setting.post(JSON.parse(fs.readFileSync(argv.setting, { encoding: 'utf-8' })));
    } catch (error) {
      console.log(`invalid parameter | --setting="${argv.setting}" | ${error.message}`);
      return 1;
    }
  }
  //
  const allConfig = setting.get();
  if (argv.debug.toLowerCase === 'true') {
    allConfig.debug.enable = true;
  }
  if (argv.browser) {
    allConfig.debug.keepBrowserMs = Math.max(parseInt(argv.browser), 10000);
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
