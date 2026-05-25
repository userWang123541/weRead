const fs = require('fs/promises');
const path = require('path');
const { getUserFilePath } = require('./user-data');

const API_BASE = 'https://i.weread.qq.com/api/agent/gateway';
const SKILL_VERSION = process.env.WEREAD_SKILL_VERSION || '1.0.3';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getApiKey(req) {
  return (
    req?.headers?.['x-weread-key'] ||
    req?.body?.apiKey ||
    process.env.WEREAD_API_KEY ||
    ''
  ).trim();
}

async function callWeread(apiName, params = {}, apiKey = process.env.WEREAD_API_KEY || '') {
  if (!apiKey) {
    const err = new Error('Missing WEREAD_API_KEY');
    err.statusCode = 401;
    throw err;
  }

  const body = {
    api_name: apiName,
    skill_version: SKILL_VERSION,
    ...params,
  };

  const response = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (err) {
    const parseErr = new Error(`WeRead returned non-JSON response: ${text.slice(0, 120)}`);
    parseErr.statusCode = response.status;
    throw parseErr;
  }

  if (!response.ok) {
    const err = new Error(data.errmsg || `WeRead HTTP ${response.status}`);
    err.statusCode = response.status;
    err.payload = data;
    throw err;
  }

  if (data.upgrade_info) {
    const err = new Error(data.upgrade_info.message || 'WeRead skill requires upgrade');
    err.statusCode = 426;
    err.payload = data;
    throw err;
  }

  return data;
}

async function fetchAllNotebooks(apiKey, options = {}) {
  const books = [];
  const count = options.count || 50;
  let lastSort = 0;
  let hasMore = true;

  while (hasMore) {
    const params = { count };
    if (lastSort) params.lastSort = lastSort;

    const data = await callWeread('/user/notebooks', params, apiKey);
    if (data.errcode) {
      throw new Error(data.errmsg || `WeRead error ${data.errcode}`);
    }

    const pageBooks = data.books || [];
    books.push(...pageBooks);
    hasMore = data.hasMore === 1;
    if (hasMore && pageBooks.length) {
      lastSort = pageBooks[pageBooks.length - 1].sort;
    } else {
      hasMore = false;
    }

    await sleep(options.pageDelayMs || 250);
  }

  return books;
}

async function fetchBookReviews(apiKey, bookId, options = {}) {
  const reviews = [];
  const count = options.count || 100;
  let synckey = 0;
  let hasMore = true;
  let guard = 0;

  while (hasMore && guard < 50) {
    const params = { bookid: bookId, count };
    if (synckey) params.synckey = synckey;

    const data = await callWeread('/review/list/mine', params, apiKey);
    if (data.errcode) {
      throw new Error(data.errmsg || `WeRead review error ${data.errcode}`);
    }

    reviews.push(...((data.reviews || []).map(item => item.review || item).filter(Boolean)));
    hasMore = data.hasMore === 1 && data.synckey && data.synckey !== synckey;
    synckey = data.synckey || synckey;
    guard += 1;

    if (hasMore) await sleep(options.pageDelayMs || 160);
  }

  return reviews;
}

async function fetchBookNotes(apiKey, bookId, options = {}) {
  const [bookmarks, reviews] = await Promise.all([
    callWeread('/book/bookmarklist', { bookId }, apiKey),
    fetchBookReviews(apiKey, bookId, options),
  ]);

  return {
    highlights: bookmarks.updated || [],
    chapters: bookmarks.chapters || [],
    book: bookmarks.book || null,
    reviews,
  };
}

async function syncWereadData(apiKey, options = {}) {
  const startedAt = new Date().toISOString();
  const notebooks = await fetchAllNotebooks(apiKey, options);
  const maxBooks = options.maxBooks ? Math.min(options.maxBooks, notebooks.length) : notebooks.length;
  const books = [];

  for (let i = 0; i < maxBooks; i += 1) {
    const notebook = notebooks[i];
    const bookId = notebook.bookId;

    try {
      const detail = await fetchBookNotes(apiKey, bookId, options);
      books.push({
        bookId,
        book: detail.book || notebook.book,
        noteCount: notebook.noteCount || 0,
        reviewCount: notebook.reviewCount || 0,
        bookmarkCount: notebook.bookmarkCount || 0,
        readingProgress: notebook.readingProgress || 0,
        markedStatus: notebook.markedStatus,
        sort: notebook.sort,
        highlights: detail.highlights,
        chapters: detail.chapters,
        reviews: detail.reviews,
      });
    } catch (err) {
      books.push({
        bookId,
        book: notebook.book,
        noteCount: notebook.noteCount || 0,
        reviewCount: notebook.reviewCount || 0,
        bookmarkCount: notebook.bookmarkCount || 0,
        readingProgress: notebook.readingProgress || 0,
        markedStatus: notebook.markedStatus,
        sort: notebook.sort,
        highlights: [],
        chapters: [],
        reviews: [],
        error: err.message,
      });
    }

    await sleep(options.bookDelayMs || 200);
  }

  return {
    fetchedAt: new Date().toISOString(),
    startedAt,
    skillVersion: SKILL_VERSION,
    totalBooks: books.length,
    sourceBookCount: notebooks.length,
    books,
  };
}

async function readJsonIfExists(filePath, fallback = null) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function readJson(apiKey, name, fallback = null) {
  const filePath = getUserFilePath(apiKey, name);
  return readJsonIfExists(filePath, fallback);
}

async function writeJsonByKey(apiKey, name, data) {
  const filePath = getUserFilePath(apiKey, name);
  await writeJson(filePath, data);
}

module.exports = {
  API_BASE,
  SKILL_VERSION,
  callWeread,
  getApiKey,
  readJsonIfExists,
  readJson,
  syncWereadData,
  writeJson,
  writeJsonByKey,
};
