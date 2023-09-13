import * as fs from 'node:fs';
import 'node:readline';
//
import { ArgumentParser } from 'argparse';
//
import * as instagram from './instagram.js';
import * as xiaohongshu from './xiaohongshu.js';
import * as utils from './utils.js';

const main = async () => {
  //
  // get parameter
  //
  const parser = new ArgumentParser({
    description: 'Media to Eagle',
  });
  parser.add_argument('--url', { help: 'url for fetching' });
  parser.add_argument('--list', { help: 'url list for fetching, splityed by linebreak' });
  parser.add_argument('--proxy', { help: 'proxy server' });
  parser.add_argument('--interval', { help: 'wait time (ms) after fetching' });
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
      urlList.push(...fs.readFileSync(argv.list, { encoding: 'utf-8' }).split(/\r?\n/).filter(url => url));
    } catch {
      console.error(`invalid parameter | --list="${argv.list}" | no such text file`);
      return 1;
    }
  }
  // proxy
  const proxy = argv.proxy || '';
  // interval
  const minimalInterval = 3000;
  const interval = {};
  interval[''] = parseInt(argv.interval);
  if (isNaN(interval['']) || interval[''] < minimalInterval) {
    interval[''] = minimalInterval;
  }
  interval.instagram = parseInt(argv['interval-instagram']);
  if (isNaN(interval.instagram) || interval.instagram < interval['']) {
    interval.instagram = interval[''];
  }
  interval.xiaohongshu = parseInt(argv['interval-xiaohongshu']);
  if (isNaN(interval.xiaohongshu) || interval.xiaohongshu < interval['']) {
    interval.xiaohongshu = interval[''];
  }
  //
  // handle url
  //
  const handlerList = {
    instagram,
    xiaohongshu,
  };
  for (const url of urlList) {
    for (const key in handlerList) {
      const handler = handlerList[key];
      if (handler.getUrl(url)) {
        let success = false;
        try {
          await handler.save({
            textWithUrl: url,
            proxy,
          });
          console.log(`${url} | ${key} | ok`);
        } catch (error) {
          console.error(`${url} | ${key} | ${error.message}`);
        }
        if (success) {
          await utils.sleep(interval[key]);
          break;
        } else {
          await utils.sleep(interval['']);
        }
      }
    }
  }
};

main().then((exitCode) => {
  process.exit(exitCode);
});
