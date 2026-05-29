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
var CACHE_TTL = 300000; // 5 minutes cache
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

function computeReadingDays(cards) {
  var dates = {};
  (cards || []).forEach(function(card) {
    var ts = Number(card.time || card.createTime || 0);
    if (!ts) return;
    var date = new Date(ts * 1000).toISOString().slice(0, 10);
    dates[date] = true;
  });
  return Object.keys(dates).length;
}

function getDb() {
  if (!db) db = wx.cloud.database();
  return db;
}

function loadCollection(d, name, orderField, orderDirection, max) {
  var pageSize = 20;
  var all = [];
  var limit = max || 1000;

  function load(skip) {
    var query = d.collection(name).where({});
    if (orderField) query = query.orderBy(orderField, orderDirection || 'desc');
    return query
      .skip(skip)
      .limit(pageSize)
      .get()
      .then(function(res) {
        var data = res.data || [];
        all = all.concat(data);
        if (data.length === pageSize && all.length < limit) {
          return load(skip + pageSize);
        }
        return all;
      });
  }

  return load(0);
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
    loadCollection(d, 'books', 'sort', 'desc', 1000),
    loadCollection(d, 'cards', 'createTime', 'desc', 100),
    d.collection('taxonomy').limit(1).get()
  ]).then(function(results) {
    var userRes = results[0];
    var booksData = results[1] || [];
    var cardsData = results[2] || [];
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

    _cache.books = booksData;
    _cache.bookMap = {};
    _cache.books.forEach(function(b) { _cache.bookMap[b.bookId] = b; });

    _cache.cards = cardsData.map(normalizeCard);

    if (!_cache.stats.readingDays) {
      _cache.stats = Object.assign({}, _cache.stats, {
        readingDays: computeReadingDays(_cache.cards)
      });
    }

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

function normalizeCard(c) {
  return {
    id: c.cardId || c._id,
    cardId: c.cardId || c._id,
    type: c.type || 0,
    bookId: c.bookId,
    bookTitle: c.bookTitle || '',
    author: c.author || '',
    chapter: c.chapterTitle || c.chapter || '',
    quote: c.quote || '',
    note: c.note || '',
    tags: c.tags || [],
    category: c.category || '',
    categoryId: c.categoryId || '',
    time: c.createTime || c.time || 0,
    url: c.openUrl || c.url || ''
  };
}

function buildTaxonomyTree(categories) {
  var nodeMap = {};
  var domains = [];

  function ensureNode(parts, source) {
    var path = parts.join('/');
    if (!nodeMap[path]) {
      nodeMap[path] = {
        id: (source && source.id) || path,
        name: parts[parts.length - 1],
        path: path,
        description: (source && source.description) || '',
        count: 0,
        children: [],
        subs: []
      };
    } else if (source) {
      nodeMap[path].id = source.id || nodeMap[path].id;
      nodeMap[path].description = source.description || nodeMap[path].description;
    }
    return nodeMap[path];
  }

  categories.forEach(function(c) {
    if (!c || !c.path) return;
    var parts = c.path.split('/').filter(Boolean);
    for (var i = 1; i <= parts.length; i++) {
      var node = ensureNode(parts.slice(0, i), i === parts.length ? c : null);
      if (i === 1 && domains.indexOf(node) < 0) {
        domains.push(node);
      }
      if (i > 1) {
        var parent = ensureNode(parts.slice(0, i - 1), null);
        if (parent.children.indexOf(node) < 0) {
          parent.children.push(node);
          parent.subs = parent.children;
        }
      }
    }
  });

  function sortNode(node) {
    node.children.sort(function(a, b) { return a.path.localeCompare(b.path, 'zh'); });
    node.subs = node.children;
    node.children.forEach(sortNode);
  }
  domains.sort(function(a, b) { return b.count - a.count; });
  domains.forEach(sortNode);
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
  var pageSize = 20;
  var max = 200;
  var all = [];

  function load(skip) {
    return d.collection('cards')
      .where({ bookId: bookId })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()
      .then(function(res) {
        var data = res.data || [];
        all = all.concat(data.map(normalizeCard));
        if (data.length === pageSize && all.length < max) {
          return load(skip + pageSize);
        }
        return all;
      });
  }

  return load(0);
}

function getRecentCards(n) {
  return _ensureLoaded().then(function() { return _cache.cards.slice(0, n || 20); });
}

function getAllCards(limit) {
  var d = getDb();
  var batchSize = 20;
  var max = limit || 1000;
  var all = [];

  function load(skip) {
    return d.collection('cards')
      .where({})
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(Math.min(batchSize, max - all.length))
      .get()
      .then(function(res) {
        var data = res.data || [];
        all = all.concat(data.map(normalizeCard));
        if (data.length === batchSize && all.length < max) {
          return load(skip + batchSize);
        }
        return all;
      });
  }

  return load(0);
}

function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildCardQuery(d, filters) {
  var where = {};
  var source = filters || {};

  if (typeof source.type === 'number' && source.type >= 0) {
    where.type = source.type;
  }
  if (source.bookId) {
    where.bookId = source.bookId;
  }
  if (source.category) {
    where.category = d.RegExp({
      regexp: '^' + escapeRegExp(source.category) + '(/|$)',
      options: ''
    });
  }

  return d.collection('cards').where(where);
}

function queryCardsPage(options) {
  var d = getDb();
  var source = options || {};
  var pageSize = Math.max(1, Math.min(Number(source.pageSize) || 20, 20));
  var page = Math.max(1, Number(source.page) || 1);
  var skip = (page - 1) * pageSize;
  var query = buildCardQuery(d, source.filters || {});

  return Promise.all([
    query.count(),
    query.orderBy('createTime', 'desc').skip(skip).limit(pageSize).get()
  ]).then(function(results) {
    var countRes = results[0] || {};
    var dataRes = results[1] || {};
    var total = countRes.total || 0;
    return {
      cards: (dataRes.data || []).map(normalizeCard),
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    };
  });
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

function getNotesMeta() {
  var d = getDb();
  return Promise.all([
    loadCollection(d, 'books', 'sort', 'desc', 1000),
    d.collection('taxonomy').limit(1).get()
  ]).then(function(results) {
    var taxRes = results[1] || {};
    var taxonomy = { domains: [] };
    if (taxRes.data && taxRes.data.length > 0) {
      taxonomy = buildTaxonomyTree(taxRes.data[0].categories || []);
    }
    return {
      books: results[0] || [],
      taxonomy: taxonomy
    };
  });
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
  getAllCards: getAllCards,
  queryCardsPage: queryCardsPage,
  getRecentCards: getRecentCards,
  getRandomQuote: getRandomQuote,
  searchCards: searchCards,
  getCategories: getCategories,
  getNotesMeta: getNotesMeta,
  getTopCategories: getTopCategories,
  getTimeGreeting: getTimeGreeting,
  getCardsByTag: getCardsByTag,
  getUserDoc: getUserDoc,
  invalidateCache: invalidateCache,

};
