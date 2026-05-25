var fmt = require('./format');

var db = null;
var _cache = {
  stats: null,
  books: null,
  bookMap: {},
  cards: [],
  taxonomy: null,
  topCategories: [],
  quotes: [],
  userDoc: null,
  lastLoad: 0
};
var CACHE_TTL = 60000;
var _loading = null;

function normalizeStats(stats) {
  var source = stats || {};
  return Object.assign({}, source, {
    books: source.books || source.totalBooks || 0,
    cards: source.cards || source.totalCards || 0,
    highlights: source.highlights || source.totalHighlights || 0,
    notes: source.notes || source.totalReviews || 0,
    reviews: source.reviews || source.totalReviews || 0,
    classified: source.classified || 0,
    unclassified: source.unclassified || source.totalCards || source.cards || 0,
    readingDays: source.readingDays || 0
  });
}

function getDb() {
  if (!db) db = wx.cloud.database();
  return db;
}

function _ensureLoaded() {
  if (_cache.lastLoad && Date.now() - _cache.lastLoad < CACHE_TTL && _cache.stats) {
    return Promise.resolve();
  }
  if (_loading) return _loading;

  _loading = _doLoad().then(function() {
    _loading = null;
  }).catch(function(err) {
    _loading = null;
    console.error('store load error:', err);
  });
  return _loading;
}

function _doLoad() {
  var d = getDb();
  return Promise.all([
    d.collection('users').where({}).limit(1).get(),
    d.collection('books').where({}).orderBy('sort', 'desc').limit(100).get(),
    d.collection('cards').where({}).orderBy('createTime', 'desc').limit(100).get(),
    d.collection('taxonomy').limit(1).get()
  ]).then(function(results) {
    var userRes = results[0];
    var booksRes = results[1];
    var cardsRes = results[2];
    var taxRes = results[3];

    if (userRes.data.length > 0) {
      var user = userRes.data[0];
      _cache.userDoc = user;
      _cache.stats = normalizeStats(user.stats);
      _cache.quotes = user.quotes || [];
      _cache.fetchedAt = user.fetchedAt || '';
    } else {
      _cache.stats = normalizeStats({});
      _cache.quotes = [];
    }

    _cache.books = booksRes.data || [];
    _cache.bookMap = {};
    _cache.books.forEach(function(b) { _cache.bookMap[b.bookId] = b; });

    _cache.cards = (cardsRes.data || []).map(function(c) {
      return {
        id: c.cardId || c._id,
        cardId: c.cardId,
        type: c.type || 0,
        bookId: c.bookId,
        bookTitle: c.bookTitle || '',
        author: c.author || '',
        chapter: c.chapterTitle || '',
        quote: c.quote || '',
        note: c.note || '',
        tags: c.tags || [],
        category: c.category || '',
        categoryId: c.categoryId || '',
        time: c.createTime || 0,
        url: c.openUrl || ''
      };
    });

    if (taxRes.data.length > 0) {
      var tax = taxRes.data[0];
      _cache.taxonomy = buildTaxonomyTree(tax.categories || []);
    } else {
      _cache.taxonomy = { domains: [] };
    }

    _cache.topCategories = _cache.taxonomy.domains.slice(0, 8).map(function(d) { return d.name; });
    _cache.lastLoad = Date.now();
  });
}

function buildTaxonomyTree(categories) {
  var catMap = {};
  categories.forEach(function(c) {
    var parts = c.path.split('/');
    var domain = parts[0];
    if (!catMap[domain]) catMap[domain] = { name: domain, count: 0, subs: [] };
    catMap[domain].subs.push({
      name: parts[parts.length - 1],
      id: c.id,
      path: c.path,
      description: c.description,
      count: 0
    });
  });
  var domains = Object.keys(catMap).map(function(k) { return catMap[k]; });
  domains.sort(function(a, b) { return b.count - a.count; });
  return { domains: domains };
}

function getStats() {
  return _ensureLoaded().then(function() { return _cache.stats || {}; });
}

function getBooks(status) {
  return _ensureLoaded().then(function() {
    if (!status || status === 'all') return _cache.books;
    return _cache.books.filter(function(b) { return b.status === status; });
  });
}

function getBook(id) {
  return _ensureLoaded().then(function() { return _cache.bookMap[id] || null; });
}

function getBookCards(bookId) {
  return _ensureLoaded().then(function() {
    return _cache.cards.filter(function(c) { return c.bookId === bookId; });
  });
}

function getBookCardsAll(bookId) {
  var d = getDb();
  return d.collection('cards')
    .where({ bookId: bookId })
    .orderBy('createTime', 'desc')
    .limit(200)
    .get()
    .then(function(res) {
      return (res.data || []).map(function(c) {
        return {
          id: c.cardId || c._id, type: c.type || 0, bookId: c.bookId,
          bookTitle: c.bookTitle || '', author: c.author || '',
          chapter: c.chapterTitle || '', quote: c.quote || '',
          note: c.note || '', tags: c.tags || [],
          category: c.category || '', time: c.createTime || 0, url: c.openUrl || ''
        };
      });
    });
}

function getRecentCards(n) {
  return _ensureLoaded().then(function() { return _cache.cards.slice(0, n || 20); });
}

function getRandomQuote() {
  if (!_cache.quotes.length) return { text: '', book: '', bookId: '' };
  var quote = _cache.quotes[Math.floor(Math.random() * _cache.quotes.length)] || {};
  return Object.assign({}, quote, {
    book: quote.book || quote.bookTitle || ''
  });
}

function searchCards(query) {
  if (!query) return Promise.resolve([]);
  var d = getDb();
  return wx.cloud.callFunction({
    name: 'searchNotes',
    data: { query: query }
  }).then(function(res) {
    return (res.result && res.result.results) || [];
  }).catch(function() {
    return [];
  });
}

function getCategories() {
  return _ensureLoaded().then(function() { return _cache.taxonomy || { domains: [] }; });
}

function getTopCategories() {
  return _ensureLoaded().then(function() { return _cache.topCategories; });
}

function getTimeGreeting() {
  var h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function getCardsByTag(tag) {
  return _ensureLoaded().then(function() {
    if (!tag) return _cache.cards;
    return _cache.cards.filter(function(c) {
      return c.tags && c.tags.some(function(t) { return t.indexOf(tag) >= 0; });
    });
  });
}

function getUserDoc() {
  return _ensureLoaded().then(function() { return _cache.userDoc; });
}

function invalidateCache() {
  _cache.stats = null;
  _cache.books = null;
  _cache.bookMap = {};
  _cache.cards = [];
  _cache.taxonomy = null;
  _cache.topCategories = [];
  _cache.quotes = [];
  _cache.userDoc = null;
  _cache.lastLoad = 0;
}

module.exports = {
  getStats: getStats,
  getBooks: getBooks,
  getBook: getBook,
  getBookCards: getBookCards,
  getBookCardsAll: getBookCardsAll,
  getRecentCards: getRecentCards,
  getRandomQuote: getRandomQuote,
  searchCards: searchCards,
  getCategories: getCategories,
  getTopCategories: getTopCategories,
  getTimeGreeting: getTimeGreeting,
  getCardsByTag: getCardsByTag,
  getUserDoc: getUserDoc,
  invalidateCache: invalidateCache
};
