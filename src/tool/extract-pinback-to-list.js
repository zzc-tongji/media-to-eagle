import * as fs from 'node:fs';
import * as path from 'node:path';
//
import { ArgumentParser } from 'argparse';
import check from 'check-types';
import * as cheerio from 'cheerio';
//
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
  // Before start, locate pinback file (generated by tool https://pinbackit.github.io/ from https://www.pinterest.com/) as `<wkdir>/pinback.html`.
  //
  const pinbackPath = path.resolve(allConfig.runtime.wkdir, 'pinback.html');
  const listPath = path.resolve(allConfig.runtime.wkdir, 'list.media-to-eagle.txt');
  //
  const html = fs.readFileSync(pinbackPath, { encoding: 'utf-8' });
  const $ = cheerio.load(html);
  const selector = $('DT A');
  const urlList = [];
  for (let i = 0; i < selector.length; i++) {
    const url = selector.eq(i).attr('origlink');
    if (check.not.string(url) || check.emptyString(url)) {
      continue;
    }
    urlList.unshift(url);
  }
  if (urlList.length <= 0) {
    console.log(`Pinback file "${pinbackPath}" contains no pin.`);
    return;
  }
  fs.writeFileSync(listPath, urlList.join('\n'), { encoding: 'utf-8' });
  console.log(`Pinback file "${pinbackPath}" has been extracted to list file "${listPath}".`);
};

main();
