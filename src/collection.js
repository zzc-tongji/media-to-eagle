import * as fs from 'node:fs';

let path = './collection.txt';
let collection = null;

const load = (p = path) => {
  if (!fs.existsSync(p)) {
    collection = {};
    fs.writeFileSync(p, '', { encoding: 'utf-8' });
    return;
  }
  if (!fs.lstatSync(p).isFile()) {
    throw new Error(`collection.js | path "${p}" should be a file`);
  }
  const content = fs.readFileSync(p, { encoding: 'utf-8' });
  content.split(/\r?\n/).map((line) => {
    if (!collection) {
      collection = {};
    }
    collection[line] = true;
  });
  if (p !== path) {
    path = p;
  }
};

const has = (url) => {
  return collection[url] || false;
};

const add = (url) => {
  if (has(url)) {
    return;
  }
  collection[url] = true;
  fs.appendFileSync(path, `\n${url}`, { encoding: 'utf-8' });
};

export { load, has, add };
