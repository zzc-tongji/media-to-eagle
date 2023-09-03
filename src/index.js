import * as fs from 'node:fs';
import 'node:readline';
//
import check from 'check-types';
import argsparser from 'args-parser';
//
import * as instagram from './instagram.js';
import * as xiaohongshu from './xiaohongshu.js';
import * as utils from './utils.js';

const main = async ({ argv }) => {
  // --cookie-instagram={}
  const cookie = {};
  cookie.instagram = argv['cookie-instagram'].toString() || '';
  // --cookie-xiaohongshu={}
  cookie.xiaohongshu = argv['cookie-xiaohongshu'].toString() || '';
  // --interval={}
  const minimalInterval = 3000;
  const interval = {};
  interval[''] = parseInt(argv.interval);
  if (isNaN(interval['']) || interval[''] < minimalInterval) {
    interval[''] = minimalInterval;
  }
  // --interval-instagram={}
  interval.instagram = parseInt(argv['interval-instagram']);
  if (isNaN(interval.instagram) || interval.instagram < interval['']) {
    interval.instagram = interval[''];
  }
  // --interval-xiaohongshu={}
  interval.xiaohongshu = parseInt(argv['interval-xiaohongshu']);
  if (isNaN(interval.xiaohongshu) || interval.xiaohongshu < interval['']) {
    interval.xiaohongshu = interval[''];
  }
  // --list={}
  const urlList = [];
  if (argv.list) {
    try {
      urlList.push(...fs.readFileSync(argv.list, { encoding: 'utf-8' }).split(/\r?\n/).filter(url => url));
    } catch {
      console.error(`invalid parameter | --list="${argv.list}" | no such text file`);
      return 1;
    }
  }
  // --proxy={}
  const proxy = argv.proxy || '';
  // --url={}
  if (argv.url) {
    urlList.push(argv.url);
  }
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
            headerMap: cookie[key] ? { Cookie: cookie[key] } : {},
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

main({
  argv: argsparser(process.argv),
}).then((exitCode) => {
  process.exit(exitCode);
});
