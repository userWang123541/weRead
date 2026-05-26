const fs = require('fs/promises');
const path = require('path');
const { pool, isPostgres } = require('./postgres');
const { userIdFromKey, getUserFilePath } = require('./user-data');

const API_BASE = 'https://i.weread.qq.com/api/agent/gateway';
const SKILL_VERSION = process.env.WEREAD_SKILL_VERSION || '1.0.3';
const DEFAULT_TIMEOUT_MS = Number(process.env.WEREAD_REQUEST_TIMEOUT_MS || 15000);
const DEFAULT_RETRIES = Number(process.env.WEREAD_REQUEST_RETRIES || 2);
const DEFAULT_SYNC_CONCURRENCY = Number(process.env.WEREAD_SYNC_CONCURRENCY || 4);

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

function shouldRetryStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function normalizeLimit(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

async function callWeread(apiName, params = {}, apiKey = process.env.WEREAD_API_KEY || '', options = {}) {
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

  const timeoutMs = normalizeLimit(options.timeoutMs, DEFAULT_TIMEOUT_MS, 3000, 60000);
  const retries = normalizeLimit(options.retries, DEFAULT_RETRIES, 0, 4);
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
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
    } catch (err) {
      lastErr = err.name === 'AbortError'
        ? Object.assign(new Error(`WeRead request timed out after ${timeoutMs}ms`), { statusCode: 504 })
        : err;
      const retryable = lastErr.statusCode === 504 || shouldRetryStatus(lastErr.statusCode || 0);
      if (!retryable || attempt >= retries) throw lastErr;
      await sleep(Math.min(800 * (attempt + 1), 2400));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastErr;
}

async function fetchAllNotebooks(apiKey, options = {}) {
  const books = [];
  const count = options.count || 50;
  let lastSort = 0;
  let hasMore = true;
  let pages = 0;

  while (hasMore && pages < 50) {
    const params = { count };
    if (lastSort) params.lastSort = lastSort;

    const data = await callWeread('/user/notebooks', params, apiKey, options);
    if (data.errcode) {
      throw new Error(data.errmsg || `WeRead error ${data.errcode}`);
    }

    const pageBooks = data.books || [];
    books.push(...pageBooks);
    hasMore = data.hasMore === 1;
    pages += 1;
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

    const data = await callWeread('/review/list/mine', params, apiKey, options);
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
    callWeread('/book/bookmarklist', { bookId }, apiKey, options),
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
  const startedMs = Date.now();
  const notebooks = await fetchAllNotebooks(apiKey, options);
  const maxBooks = options.maxBooks ? Math.min(options.maxBooks, notebooks.length) : notebooks.length;
  const selectedNotebooks = notebooks.slice(0, maxBooks);
  const concurrency = normalizeLimit(options.concurrency, DEFAULT_SYNC_CONCURRENCY, 1, 8);

  let completedBooks = 0;
  const books = await mapWithConcurrency(selectedNotebooks, concurrency, async (notebook) => {
    const bookId = notebook.bookId;
    let result;

    try {
      const shouldFetchDetail = hasNotebookNotes(notebook);
      const detail = shouldFetchDetail
        ? await fetchBookNotes(apiKey, bookId, options)
        : { highlights: [], chapters: [], book: notebook.book, reviews: [] };
      result = {
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
      };
    } catch (err) {
      result = {
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
      };
    }
    completedBooks += 1;
    if (typeof options.onProgress === 'function') {
      options.onProgress({
        completedBooks,
        totalBooks: selectedNotebooks.length,
        sourceBookCount: notebooks.length,
        currentBookTitle: notebook.book?.title || '',
      });
    }
    return result;
  });

  return {
    fetchedAt: new Date().toISOString(),
    startedAt,
    skillVersion: SKILL_VERSION,
    syncDurationMs: Date.now() - startedMs,
    syncConcurrency: concurrency,
    totalBooks: books.length,
    sourceBookCount: notebooks.length,
    errorBookCount: books.filter(book => book.error).length,
    books,
  };
}

function hasNotebookNotes(notebook) {
  const counts = [notebook.noteCount, notebook.reviewCount, notebook.bookmarkCount];
  if (counts.every(value => value === undefined || value === null)) return true;
  return counts.some(value => Number(value || 0) > 0);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length || 1) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
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
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

async function readJson(apiKey, name, fallback = null) {
  if (isPostgres() && apiKey) {
    const userId = userIdFromKey(apiKey);
    const { rows } = await pool.query(
      'SELECT data FROM user_data WHERE user_id = $1 AND file_key = $2',
      [userId, name]
    );
    return rows.length ? rows[0].data : fallback;
  }
  const filePath = getUserFilePath(apiKey, name);
  return readJsonIfExists(filePath, fallback);
}

async function writeJsonByKey(apiKey, name, data) {
  if (isPostgres() && apiKey) {
    const userId = userIdFromKey(apiKey);
    await pool.query(
      `INSERT INTO user_data (user_id, file_key, data, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (user_id, file_key)
       DO UPDATE SET data = $3::jsonb, updated_at = NOW()`,
      [userId, name, JSON.stringify(data)]
    );
    return;
  }
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
