const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/;

const formatDateTime = (input, style = 0) => {
  // format as 'yyyyMMdd_HHmmss_SSS'
  let dateTime;
  if (typeof input == 'number' || typeof input == 'string') {
    dateTime = new Date(input);
  } else if (input instanceof Date) {
    dateTime = input;
  } else {
    dateTime = new Date();
  }
  const year = String(dateTime.getUTCFullYear()).padStart(4, 0);
  const month = String(dateTime.getUTCMonth() + 1).padStart(2, 0);
  const day = String(dateTime.getUTCDate()).padStart(2, 0);
  const hour = String(dateTime.getUTCHours()).padStart(2, 0);
  const minute = String(dateTime.getMinutes()).padStart(2, 0);
  const second = String(dateTime.getSeconds()).padStart(2, 0);
  const milliSecond = String(dateTime.getMilliseconds()).padStart(3, 0);
  if (style === 0) {
    return `${year}${month}${day}_${hour}${minute}${second}_${milliSecond}`;
  }
  return dateTime.toString();
};

const generateXml = ({ key, value }) => {
  if (typeof key !== 'string' || key === '') {
    throw Error('parameter [key]: type of [string], non-empty, required');
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw Error('parameter [value]: type of [string], default as [""]');
  }
  if (!value) {
    return '';
  }
  return `<${key} v="${value}" />`;
};

const generateXmlList = ({ data, selector = '', tagName = '' }) => {
  if (!(data instanceof Array)) {
    throw Error('parameter [data]: type of [string], required');
  }
  if (typeof selector !== 'string') {
    throw Error('parameter [selector]: type of [string], default as [""]');
  }
  if (typeof tagName !== 'string') {
    throw Error('parameter [tagName]: type of [string], default as [""]');
  }
  // eslint-disable-next-line no-unused-vars
  const itemList = data.map((d) => {
    return eval(`d${selector}`).toString();
  }).filter(v => v);
  if (itemList.length <= 0) {
    return '';
  }
  return `<${tagName}>${itemList.map(i => `<i v="${i}">`).join('')}</${tagName}>`;
};

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export { urlRegex, formatDateTime, generateXml, generateXmlList, sleep };
