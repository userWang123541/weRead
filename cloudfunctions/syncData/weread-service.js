const https = require('https');
const API_BASE = 'https://i.weread.qq.com/api/agent/gateway';
const SKILL_VERSION = process.env.WEREAD_SKILL_VERSION || '1.0.3';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpPost(urlStr, body, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      timeout: 30000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function callWeread(apiName, params = {}, apiKey = '') {
  if (!apiKey) {
    const err = new Error('Missing WEREAD_API_KEY');
    err.statusCode = 401;
    throw err;
  }
  const body = { api_name: apiName, skill_version: SKILL_VERSION, ...params };
  const resp = await httpPost(API_BASE, body, { Authorization: 'Bearer ' + apiKey });
  let data;
  try { data = resp.body ? JSON.parse(resp.body) : {}; } catch (err) {
    const parseErr = new Error('WeRead returned non-JSON: ' + resp.body.slice(0, 120));
    parseErr.statusCode = resp.status;
    throw parseErr;
  }
  if (resp.status !== 200) {
    const err = new Error(data.errmsg || 'WeRead HTTP ' + resp.status);
    err.statusCode = resp.status; err.payload = data; throw err;
  }
  if (data.upgrade_info) {
    const err = new Error(data.upgrade_info.message || 'WeRead skill requires upgrade');
    err.statusCode = 426; err.payload = data; throw err;
  }
  return data;
}

async function fetchAllNotebooks(apiKey, options = {}) {
  const books = []; const count = options.count || 50; let lastSort = 0; let hasMore = true;
  while (hasMore) {
    const params = { count }; if (lastSort) params.lastSort = lastSort;
    const resp = await callWeread('/user/notebooks', params, apiKey);
    console.log('WeRead response keys:', Object.keys(resp));
    // 兼容两种格式：resp.data.books 或 resp.books
    const payload = resp.data || resp;
    if (payload.errcode) throw new Error(payload.errmsg || 'WeRead error ' + payload.errcode);
    const pageBooks = payload.books || [];
    books.push(...pageBooks);
    hasMore = payload.hasMore === 1;
    if (hasMore && pageBooks.length) { lastSort = pageBooks[pageBooks.length - 1].sort; } else { hasMore = false; }
    await sleep(options.pageDelayMs || 250);
  }
  console.log('Total notebooks fetched:', books.length);
  return books;
}

async function fetchBookReviews(apiKey, bookId, options = {}) {
  const reviews = []; const count = options.count || 100; let synckey = 0; let hasMore = true; let guard = 0;
  while (hasMore && guard < 50) {
    const params = { bookid: bookId, count }; if (synckey) params.synckey = synckey;
    const resp = await callWeread('/review/list/mine', params, apiKey);
    const payload = resp.data || resp;
    if (payload.errcode) throw new Error(payload.errmsg || 'WeRead review error ' + payload.errcode);
    reviews.push(...((payload.reviews || []).map(item => item.review || item).filter(Boolean)));
    hasMore = payload.hasMore === 1 && payload.synckey && payload.synckey !== synckey;
    synckey = payload.synckey || synckey; guard += 1;
    if (hasMore) await sleep(options.pageDelayMs || 160);
  }
  return reviews;
}

async function fetchBookNotes(apiKey, bookId, options = {}) {
  const [bookmarksResp, reviews] = await Promise.all([
    callWeread('/book/bookmarklist', { bookId }, apiKey),
    fetchBookReviews(apiKey, bookId, options),
  ]);
  const bm = bookmarksResp.data || bookmarksResp;
  return { highlights: bm.updated || [], chapters: bm.chapters || [], book: bm.book || null, reviews };
}

async function syncWereadData(apiKey, options = {}) {
  const startedAt = new Date().toISOString();
  const notebooks = await fetchAllNotebooks(apiKey, options);
  const maxBooks = options.maxBooks ? Math.min(options.maxBooks, notebooks.length) : notebooks.length;
  const books = [];
  for (let i = 0; i < maxBooks; i += 1) {
    const notebook = notebooks[i]; const bookId = notebook.bookId;
    try {
      const detail = await fetchBookNotes(apiKey, bookId, options);
      books.push({ bookId, book: detail.book || notebook.book, noteCount: notebook.noteCount || 0, reviewCount: notebook.reviewCount || 0, bookmarkCount: notebook.bookmarkCount || 0, readingProgress: notebook.readingProgress || 0, markedStatus: notebook.markedStatus, sort: notebook.sort, highlights: detail.highlights, chapters: detail.chapters, reviews: detail.reviews });
    } catch (err) {
      books.push({ bookId, book: notebook.book, noteCount: notebook.noteCount || 0, reviewCount: notebook.reviewCount || 0, bookmarkCount: notebook.bookmarkCount || 0, readingProgress: notebook.readingProgress || 0, markedStatus: notebook.markedStatus, sort: notebook.sort, highlights: [], chapters: [], reviews: [], error: err.message });
    }
    await sleep(options.bookDelayMs || 200);
  }
  return { fetchedAt: new Date().toISOString(), startedAt, skillVersion: SKILL_VERSION, totalBooks: books.length, sourceBookCount: notebooks.length, books };
}

module.exports = { callWeread, fetchAllNotebooks, syncWereadData };
