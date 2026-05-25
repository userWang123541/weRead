var store = require('../../utils/store');
var fmt = require('../../utils/format');

var TYPE_FILTERS = ['全部', '划线', '想法'];
var TYPE_VALUES = [-1, 0, 1];

Page({
  data: {
    allCards: [],
    cards: [],
    typeFilters: TYPE_FILTERS,
    activeType: 0,
    tagFilters: ['全部'],
    activeTag: 0,
    searchQuery: '',
    loading: true,
    skip: 0,
    hasMore: true,
    loadingMore: false
  },

  processCard: function (c) {
    return {
      id: c.id || c._id,
      type: c.type || 0,
      bookId: c.bookId,
      bookTitle: c.bookTitle || '',
      author: c.author || '',
      chapter: c.chapter || '',
      quote: c.quote || '',
      note: c.note || '',
      tags: (c.tags || []).map(function (t) {
        var parts = t.split('/');
        return parts[parts.length - 1] || t;
      }),
      rawTags: c.tags || [],
      timeStr: fmt.timeAgo(c.time),
      time: c.time
    };
  },

  onLoad: function () {
    var that = this;
    Promise.all([store.getTopCategories(), store.getRecentCards(100)]).then(function (results) {
      var topCats = results[0].slice(0, 6);
      var processed = (results[1] || []).map(that.processCard);
      that.setData({
        allCards: processed,
        tagFilters: ['全部'].concat(topCats),
        loading: false
      });
      that.applyFilters();
    });
  },

  applyFilters: function () {
    var activeType = this.data.activeType;
    var activeTag = this.data.activeTag;
    var query = this.data.searchQuery.trim().toLowerCase();
    var typeVal = TYPE_VALUES[activeType];
    var tagFilters = this.data.tagFilters;
    var activeTagName = activeTag > 0 ? tagFilters[activeTag] : '';
    var filtered = this.data.allCards.filter(function (c) {
      if (typeVal >= 0 && c.type !== typeVal) return false;
      if (activeTagName) {
        var hasTag = c.rawTags.some(function (t) { return t.indexOf(activeTagName) >= 0; });
        if (!hasTag) return false;
      }
      if (query) {
        var text = (c.quote + ' ' + c.note + ' ' + c.bookTitle).toLowerCase();
        if (text.indexOf(query) < 0) return false;
      }
      return true;
    });
    this.setData({ cards: filtered });
  },

  setTypeFilter: function (e) {
    this.setData({ activeType: Number(e.currentTarget.dataset.index) });
    this.applyFilters();
  },

  setTagFilter: function (e) {
    this.setData({ activeTag: Number(e.currentTarget.dataset.index) });
    this.applyFilters();
  },

  onSearch: function (e) {
    this.setData({ searchQuery: e.detail.value || '' });
    this.applyFilters();
  },

  goSearch: function () {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  goProfile: function () {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  goBook: function (e) {
    var bookId = e.currentTarget.dataset.bookid;
    if (bookId) wx.navigateTo({ url: '/pages/book-detail/book-detail?id=' + bookId });
  }
});
