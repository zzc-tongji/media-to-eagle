import check from 'check-types';
import fetch from 'node-fetch';
//
import * as setting from './setting.js';
import * as utils from './utils.js';

// tool

const generateTitle = (input) => {
  return utils.formatDateTime(input);
};

// API

let eagleConfig = {};

const init = () => {
  eagleConfig = setting.get().eagle;
};

const get = async (path, queryString = '') => {
  const { host, token } = eagleConfig;
  if (check.not.string(path) || check.emptyString(path)) {
    throw Error('eagle | get | parameter "path" should be non-empty "string"');
  }
  let response = null;
  for (let reconnect = 3, success = false; !success && reconnect >= 0; reconnect -= 1)
    try {
      response = await fetch(`${host}${path}?token=${token}${queryString.startsWith('&') ? '' : '&'}${queryString}`, {
        method: 'GET',
        redirect: 'follow',
      });
      success = true;
    } catch (e) {
      if (reconnect <= 0) {
        throw new Error(`eagle | not running | ${e.message}`);
      }
    }
  if (!response.ok) {
    throw new Error(`eagle | invalid path | path = ${path}`);
  }
  return await response.json();
};

const post = async (path, payload) => {
  const { host, token } = eagleConfig;
  if (check.not.string(path) || check.emptyString(path)) {
    throw Error('eagle | post | parameter "path" should be non-empty "string"');
  }
  if (check.not.object(payload)) {
    throw Error('eagle | post | parameter "payload" should be "object"');
  }
  payload.token = token;
  let response = null;
  for (let reconnect = 3, success = false; !success && reconnect >= 0; reconnect -= 1)
    try {
      response = await fetch(`${host}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
        },
        body: JSON.stringify(payload),
      });
      success = true;
    } catch (e) {
      if (reconnect <= 0) {
        throw new Error(`eagle | not running | ${e.message}`);
      }
    }
  if (!response.ok) {
    throw new Error(`eagle | invalid path | path = ${path}`);
  }
  const data = await response.json();
  if (typeof data === 'string') {
    throw new Error(`eagle | invalid payload | payload = ${JSON.stringify(payload)} | response = ${data}`);
  }
  return data;
};

const searchFolderPreOrder = ({ name, data, depth = Number.MAX_SAFE_INTEGER }) => {
  if (data.name && data.name === name) {
    return data;
  }
  if (depth > 0) {
    for (const child of data.children) {
      const d = searchFolderPreOrder({ name, data: child, depth: depth - 1 });
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
    folder = searchFolderPreOrder({ name, data: root, depth: 1 });
    if (check.not.object(folder)) {
      folder = (await post('/api/folder/create', {
        folderName: name,
      })).data;
    }
  } else {
    let parentFolder = searchFolderPreOrder({ name: parentName, data: root });
    if (check.not.object(parentFolder)) {
      throw new Error(`eagle | update folder | folder "${parentName}" not existent`);
    }
    folder = searchFolderPreOrder({ name, data: parentFolder, depth: 1 });
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

export {
  generateTitle,
  init,
  get,
  post,
  searchFolderPreOrder,
  updateFolder,
};
