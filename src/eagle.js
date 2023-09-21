import check from 'check-types';
import fetch from 'node-fetch';
//
import * as utils from './utils.js';

// tool

const generateTitle = (input) => {
  return utils.formatDateTime(input);
};

// API

const host = 'http://localhost:41595';
const token = 'fcf9d2cf-b484-43ca-a1cc-2e71223f9ed1';

const get = (path) => {
  if (check.not.string(path) || check.emptyString(path)) {
    throw Error('eagle | get | parameter "path" should be non-empty "string"');
  }
  return fetch(`${host}${path}`, {
    method: 'GET',
    redirect: 'follow',
  }).catch(() => {
    throw new Error('eagle | not running');
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`eagle | invalid path | path = ${path}`);
    }
    return response.json();
  });
};

const post = (path, payload) => {
  if (check.not.string(path) || check.emptyString(path)) {
    throw Error('eagle | post | parameter "path" should be non-empty "string"');
  }
  if (check.not.object(payload)) {
    throw Error('eagle | post | parameter "payload" should be "object"');
  }
  payload.token = token;
  return fetch(`${host}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    throw new Error('eagle | not running');
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`eagle | invalid payload | payload = ${JSON.stringify(payload)}`);
    }
    return response.json();
  });
};

const searchPreOrder = ({ name, data, depth = Number.MAX_SAFE_INTEGER }) => {
  if (data.name && data.name === name) {
    return data;
  }
  if (depth > 0) {
    for (const child of data.children) {
      const d = searchPreOrder({ name, data: child, depth: depth - 1 });
      if (d) {
        return d;
      }
    }
  }
  return null;
};

const updateFolder = async ({ name, parentName = '', description = '' }) => {
  if (check.not.string(name) || check.emptyString(name)) {
    throw Error('eagle | updateFolder | parameter "name" should be non-empty "string"');
  }
  const root = { children: (await get('/api/folder/list')).data };
  let folder;
  // create or get folder
  if (check.not.string(parentName) || check.emptyString(parentName)) {
    folder = searchPreOrder({ name, data: root, depth: 1 });
    if (check.not.object(folder)) {
      folder = (await post('/api/folder/create', {
        folderName: name,
      })).data;
    }
  } else {
    let parentFolder = searchPreOrder({ name: parentName, data: root });
    if (check.not.object(parentFolder)) {
      throw new Error(`eagle | update folder | folder "${parentName}" not existent`);
    }
    folder = searchPreOrder({ name, data: parentFolder, depth: 1 });
    if (check.not.object(folder)) {
      folder = (await post('/api/folder/create', {
        folderName: name,
        parent: parentFolder.id,
      })).data;
    }
  }
  // update description
  if (check.string(description) && check.not.emptyString(description)) {
    folder = (await post('/api/folder/update', {
      folderId: folder.id,
      newDescription: description,
    })).data;
  }
  return folder;
};

export { generateTitle, get, post, updateFolder };