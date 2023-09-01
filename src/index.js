import * as fs from 'node:fs';
import 'node:readline';
//
import argsparser from 'args-parser';
//
import * as xiaohongshu from './xiaohongshu.js';
import * as utils from './utils.js';

const main = async ({ argv }) => {
  const urlList = [];
  // --interval={}
  let interval = parseInt(argv.interval);
  if (isNaN(interval) || interval < 1000) {
    interval = 1000;
  }
  // --list={}
  if (argv.list) {
    try {
      urlList.push(...fs.readFileSync(argv.list, { encoding: 'utf-8' }).split(/\r?\n/).filter(url => url));
    } catch {
      console.error(`invalid parameter | --list="${argv.list}" | no such text file`);
      return 1;
    }
  }
  // --url={}
  if (argv.url) {
    urlList.push(argv.url);
  }
  //
  for (const url of urlList) {
    if (xiaohongshu.check(url)) {
      try {
        await xiaohongshu.save(url);
        console.log(`${url} | xiaohongshu | ok`);
      } catch (error) {
        console.log(`${url} | ${error.message}`);
      }
      await utils.sleep(interval);
    }
  }
};

main({
  argv: argsparser(process.argv),
}).then((exitCode) => {
  process.exit(exitCode);
});
