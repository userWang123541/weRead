var store = require('../../utils/store');
var fmt = require('../../utils/format');

var HISTORY_KEY = 'search_history';
var MAX_HISTORY = 10;

Page({
  data: {
    query: '',
    results: [],
    hasResults: false,
    searched: false,
    searching: false,
    hotKeywords: [],
    searchHistory: [],
    typeLabels: ['划线', '想法', '链接']
  },

  onLoad: function () {
    var that = this;
    var history = wx.getStorageSync(HISTORY_KEY) || [];

    store.getTopCategories().then(function (topCats) {
      that.setData({
        hotKeywords: topCats.slice(0, 6),
        searchHistory: history
      });
    });
  },

  onInput: function (e) {
    this.setData({ query: e.detail.value || '' });
  },

  onSearch: function () {
    var query = this.data.query.trim();
    if (!query || this.data.searching) return;

    this.setData({ searching: true });

    var that = this;

    store.searchCards(query).then(function (results) {
      // Process results for display
      var processed = results.map(function (c) {
        return {
          id: c.id,
          type: c.type || 0,
          bookId: c.bookId,
          bookTitle: c.bookTitle || '',
          chapter: c.chapter || '',
          quote: fmt.truncate(c.quote || '', 120),
          note: c.note ? fmt.truncate(c.note, 80) : '',
          timeStr: fmt.timeAgo(c.time)
        };
      });

      // Save to search history
      var history = that.data.searchHistory.slice();
      var existIdx = history.indexOf(query);
      if (existIdx >= 0) history.splice(existIdx, 1);
      history.unshift(query);
      if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
      wx.setStorageSync(HISTORY_KEY, history);

      that.setData({
        results: processed,
        hasResults: processed.length > 0,
        searched: true,
        searching: false,
        searchHistory: history
      });
    }).catch(function () {
      that.setData({
        results: [],
        hasResults: false,
        searched: true,
        searching: false
      });
    });
  },

  tapKeyword: function (e) {
    var keyword = e.currentTarget.dataset.keyword;
    this.setData({ query: keyword });
    this.onSearch();
  },

  tapHistory: function (e) {
    var keyword = e.currentTarget.dataset.keyword;
    this.setData({ query: keyword });
    this.onSearch();
  },

  clearHistory: function () {
    wx.removeStorageSync(HISTORY_KEY);
    this.setData({ searchHistory: [] });
  },

  back: function () {
    wx.navigateBack();
  },

  goBook: function (e) {
    var bookId = e.currentTarget.dataset.bookid;
    if (bookId) {
      wx.navigateTo({ url: '/pages/book-detail/book-detail?id=' + bookId });
    }
  }
});
