const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { callWeread, syncWereadData } = require('./weread-service');
const { buildCards } = require('./card-engine');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function upsertUser(db, openid, data) {
  const users = db.collection('users');
  const { data: existing } = await users.where({ _openid: openid }).limit(1).get();
  if (existing.length) {
    await users.doc(existing[0]._id).update({ data });
  } else {
    await users.add({ data: { _openid: openid, ...data } });
  }
}

async function deleteCollection(db, openid, collectionName) {
  const col = db.collection(collectionName);
  const batchSize = 100;
  let hasMore = true;
  while (hasMore) {
    const { data } = await col.where({ _openid: openid }).limit(batchSize).get();
    if (!data.length) { hasMore = false; break; }
    const tasks = data.map(doc => col.doc(doc._id).remove());
    await Promise.all(tasks);
  }
}

async function batchInsert(db, openid, collectionName, items) {
  const col = db.collection(collectionName);
  const batchSize = 50;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const tasks = batch.map(item => col.add({ data: { _openid: openid, ...item } }));
    await Promise.all(tasks);
  }
}

function truncate(str, len) {
  const text = String(str || '').replace(/\s+/g, ' ').trim();
  return text.length > len ? text.slice(0, len) + '...' : text;
}

function derivePalette(book) {
  const colors = book?.coverBoxInfo?.colorsPure;
  if (!colors || !colors[0]) return '';
  const hex = String(colors[0]).toLowerCase();
  if (hex.startsWith('#00') || /^[#][1-4]/.test(hex)) return 'dark';
  if (/^[#][d]/.test(hex)) return 'orange';
  return '';
}

function processBook(bookEntry) {
  const book = bookEntry.book || {};
  const progress = bookEntry.readingProgress || 0;
  const markedStatus = bookEntry.markedStatus;

  let status = 'reading';
  if (markedStatus === 1) status = 'unread';
  else if (markedStatus === 2 || progress >= 90) status = 'completed';

  const highlights = (bookEntry.highlights || [])
    .slice(0, 5)
    .map(h => ({
      chapterUid: h.chapterUid,
      range: h.range,
      markText: truncate(h.markText, 120),
      createTime: h.createTime,
    }));

  const chapters = (bookEntry.chapters || [])
    .slice(0, 20)
    .map(c => ({
      chapterUid: c.chapterUid,
      title: c.title || '',
      level: c.level,
    }));

  const reviews = (bookEntry.reviews || [])
    .slice(0, 3)
    .map(r => ({
      reviewId: r.reviewId,
      content: truncate(r.content || r.htmlContent || '', 160),
      chapterUid: r.chapterUid,
      range: r.range,
      createTime: r.createTime,
    }));

  return {
    id: bookEntry.bookId,
    title: book.title || '',
    author: book.author || '',
    cover: book.cover || '',
    palette: derivePalette(book),
    progress,
    status,
    noteCount: bookEntry.noteCount || 0,
    reviewCount: bookEntry.reviewCount || 0,
    sort: bookEntry.sort || 0,
    highlights,
    chapters,
    reviews,
  };
}

function computeStats(rawData, cardsResult) {
  const books = rawData.books || [];
  const cards = cardsResult.cards || [];

  const totalHighlights = books.reduce((sum, b) => sum + (b.highlights || []).length, 0);
  const totalReviews = books.reduce((sum, b) => sum + (b.reviews || []).length, 0);
  const completedBooks = books.filter(b => {
    const progress = b.readingProgress || 0;
    return b.markedStatus === 2 || progress >= 90;
  }).length;
  const readingBooks = books.filter(b => b.markedStatus !== 1 && b.markedStatus !== 2 && (b.readingProgress || 0) < 90).length;

  const taxonomy = cardsResult.taxonomy || [];
  const topTags = taxonomy.slice(0, 10).map(t => ({ tag: t.tag, count: t.count }));

  return {
    totalBooks: books.length,
    totalCards: cards.length,
    totalHighlights,
    totalReviews,
    completedBooks,
    readingBooks,
    topTags,
    fetchedAt: rawData.fetchedAt,
  };
}

function buildQuotes(cards) {
  const allHighlights = cards
    .filter(c => c.quote && c.quote.trim().length >= 10)
    .map(c => ({
      text: c.quote.trim(),
      bookTitle: c.bookTitle || '',
      author: c.author || '',
    }));

  // Shuffle (Fisher-Yates) and pick up to 40
  for (let i = allHighlights.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allHighlights[i], allHighlights[j]] = [allHighlights[j], allHighlights[i]];
  }

  return allHighlights.slice(0, 40);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // 1. Get API key
    const apiKey = event.apiKey;
    if (!apiKey) {
      return { success: false, error: '请提供 API Key' };
    }

    // 2. Validate API key with a lightweight call
    try {
      await callWeread('/user/notebooks', { count: 1 }, apiKey);
    } catch (e) {
      return { success: false, error: 'API Key 无效，请检查后重试' };
    }

    // 3. Update sync status
    await upsertUser(db, openid, { syncStatus: 'syncing', syncError: '', apiKey });

    // 4. Fetch all WeRead data
    const rawData = await syncWereadData(apiKey, { maxBooks: event.maxBooks || 0 });

    // 5. Build cards
    const cardsResult = buildCards(rawData);

    // 6. Process books for storage
    const books = rawData.books.map(b => processBook(b));

    // 7. Delete old data and insert new
    await deleteCollection(db, openid, 'books');
    await deleteCollection(db, openid, 'cards');
    await batchInsert(db, openid, 'books', books);
    await batchInsert(db, openid, 'cards', cardsResult.cards);

    // 8. Compute stats and quotes
    const stats = computeStats(rawData, cardsResult);
    const quotes = buildQuotes(cardsResult.cards);

    // 9. Update user doc
    await upsertUser(db, openid, {
      syncStatus: 'idle',
      syncedAt: new Date().toISOString(),
      fetchedAt: rawData.fetchedAt,
      stats,
      quotes,
    });

    // 10. Trigger classification (async, don't await)
    cloud.callFunction({ name: 'classifyData', data: {} }).catch(() => {});

    return { success: true, stats, bookCount: books.length, cardCount: cardsResult.cards.length };

  } catch (err) {
    await upsertUser(db, openid, { syncStatus: 'error', syncError: err.message });
    return { success: false, error: err.message };
  }
};
