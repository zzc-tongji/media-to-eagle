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
  parser.add_argument('--interval-instagram', { help: 'wait time (ms) after fetching from "instagram.com"', dest: 'interval-instagram' });
  parser.add_argument('--interval-xiaohongshu', { help: 'wait time (ms) after fetching from "xiaohongshu.com"', dest: 'interval-xiaohongshu' });
  const argv = parser.parse_args();
  // url list
  const urlList = [];
  if (argv.url) {
    urlList.push(argv.url);
  }
  if (argv.list) {
    try {
      urlList.push(...fs.readFileSync(argv.list, { encoding: 'utf-8' }).split(/\r?\n/).map((url) => {
        return url.trim();
      }).filter((url) => {
        return check.not.emptyString(url) && !url.startsWith('#');
      }));
    } catch {
      console.error(`invalid parameter | --list="${argv.list}" | no such text file`);
      return 1;
    }
  }
  // setting
  let setting = {};
  if (argv.setting) {
    try {
      setting = JSON.parse(fs.readFileSync(argv.setting, { encoding: 'utf-8' }));
    } catch (error) {
      console.error(`invalid parameter | --setting="${argv.setting}" | ${error.message}`);
      return 1;
    }
  }
  // proxy
  const proxy = argv.proxy || '';
  // interval
  const minimalInterval = 3000;
  const i = parseInt(argv.interval);
  const interval = i > minimalInterval ? i : minimalInterval;
  //
  // handle url
  //
  const handlerList = {
    com_instagram,
    com_xiaohongshu,
  };
  for (const url of urlList) {
    for (const key in handlerList) {
      const handler = handlerList[key];
      if (handler.getUrl(url)) {
        const s = setting[key.replace('_', '.')] || {};
        let success = false;
        try {
          await handler.save({
            textWithUrl: url,
            headerMap: s.headerMap || {},
            proxy: s.proxy || proxy || '',
          });
          console.log(`${url} | ${key} | ok`);
        } catch (error) {
          console.error(`${url} | ${key} | ${error.message}`);
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
