import * as fs from 'node:fs';
import 'node:readline';
//
import { ArgumentParser } from 'argparse';
import check from 'check-types';
//
import * as com_instagram from './com.instagram.js';
import * as com_xiaohongshu from './com.xiaohongshu.js';
import * as utils from './utils.js';

const main = async () => {
  //
  // get parameter
  //
  const parser = new ArgumentParser({
    description: 'Media to Eagle',
  });
  parser.add_argument('--url', '-u', { help: 'url for fetching' });
  parser.add_argument('--list', '-l', { help: 'url list for fetching, splitted by linebreak' });
  parser.add_argument('--setting', '-s', { help: 'setting for fetching' });
  parser.add_argument('--proxy', '-p', { help: 'proxy server' });
  parser.add_argument('--interval', '-i', { help: 'wait time (ms) after fetching' });
  parser.add_argument('--debug', '-d', { help: 'debug mode' });
  parser.add_argument('--browser', '-b', { help: 'time (ms) of keeping browser open, only available when "--debug=true"' });
  const argv = parser.parse_args();
  // url list
  const urlList = [];
  if (argv.url) {
    urlList.push(argv.url);
  }
  if (argv.list) {
    try {
      urlList.push(...fs.readFileSync(argv.list, { encoding: 'utf-8' }).split(/\r?\n|\s/).map((url) => {
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
  let setting = {};
  if (argv.setting) {
    try {
      setting = JSON.parse(fs.readFileSync(argv.setting, { encoding: 'utf-8' }));
    } catch (error) {
      console.log(`invalid parameter | --setting="${argv.setting}" | ${error.message}`);
      return 1;
    }
  }
  // proxy
  const proxy = argv.proxy || '';
  // interval
  const minimalInterval = 3000;
  const i = parseInt(argv.interval);
  const interval = i > minimalInterval ? i : minimalInterval;
  // keep browser
  const minimalBrowser = 10000;
  const b = parseInt(argv.browser);
  const browser = b > minimalBrowser ? b : minimalBrowser;
  //
  // handle url
  //
  const handlerList = {
    com_instagram,
    com_xiaohongshu,
  };
  for (const url of urlList) {
    for (const key in handlerList) {
      const k = key.replace('_', '.');
      const handler = handlerList[key];
      if (handler.getUrl(url)) {
        const s = setting[k] || {};
        let success = false;
        try {
          const message = await handler.save({
            textWithUrl: url,
            headerMap: s.headerMap || {},
            proxy: s.proxy || proxy || '',
            debug: argv.debug ? true : false,
            keepBrowserMs: browser,
          });
          console.log(`${url} | ${message}`);
        } catch (error) {
          console.log(`${url} | ${error.message}`);
        }
        if (success) {
          await utils.sleep(s.interval || interval);
          break;
        } else {
          await utils.sleep(s.interval || interval);
        }
      }
    }
  }
};

main().then((exitCode) => {
  process.exit(exitCode);
});
