import * as fs from 'node:fs';

let path = './collection.txt';
let collection = null;

const load = (p = path) => {
  if (p !== path) {
    path = p;
  }
  if (!fs.existsSync(path)) {
    collection = {};
    fs.writeFileSync(path, '', { encoding: 'utf-8' });
    return;
  }
  if (!fs.lstatSync(path).isFile()) {
    throw new Error(`collection.js | path "${path}" should be a file`);
  }
  const content = fs.readFileSync(path, { encoding: 'utf-8' });
  content.split(/\r?\n/).map((line) => {
    if (!collection) {
      collection = {};
    }
    collection[line] = true;
  });
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
