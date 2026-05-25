var store = require('../../utils/store');
var auth = require('../../utils/auth');
var fmt = require('../../utils/format');

Page({
  data: {
    ready: false,
    syncing: false,
    stats: {},
    quote: {},
    recentCards: [],
    topCategories: [],
    topicCount: 0,
    classifiedCount: 0
  },
  _quoteTimer: null,

  onShow: function () {
    var self = this;
    self.setData({ ready: false });

    auth.fetchStatus().then(function (status) {
      if (!status.hasKey) {
        wx.reLaunch({ url: '/pages/setup/setup' });
        return;
      }

      if (status.syncStatus === 'syncing' || status.syncStatus === 'classifying') {
        if (!status.hasData) {
          wx.reLaunch({ url: '/pages/setup/setup?status=' + status.syncStatus });
          return;
        }
        status.syncStatus = 'idle';
        getApp().globalData.userStatus = status;
      }

      if (status.syncStatus === 'error') {
        wx.reLaunch({ url: '/pages/setup/setup?status=error' });
        return;
      }

      self.setData({ ready: true });
      self._loadData();
      self._startQuoteRotation();

      var syncedAt = status.syncedAt ? new Date(status.syncedAt).getTime() : 0;
      if (syncedAt && Date.now() - syncedAt > 3600000) {
        self._backgroundRefresh();
      }
    });
  },

  _backgroundRefresh: function () {
    var self = this;
    wx.cloud.callFunction({
      name: 'syncData',
      data: {},
      config: { timeout: 180000 }
    }).then(function (res) {
      var result = res.result || {};
      if (result.success) {
        store.invalidateCache();
        self._loadData();
      }
    }).catch(function () {});
  },

  _loadData: function () {
    var self = this;
    self.setData({ quote: store.getRandomQuote() });

    Promise.all([
      store.getStats(),
      store.getRecentCards(3),
      store.getCategories(),
      store.getTopCategories()
    ]).then(function (results) {
      var stats = results[0];
      var rawCards = results[1];
      var taxonomy = results[2];
      var topCategories = results[3];
      var domains = (taxonomy && taxonomy.domains) || [];

      var bookPromises = rawCards.map(function (card) {
        if (card.bookId) {
          return store.getBook(card.bookId).then(function (b) {
            return (b && b.palette) || '';
          });
        }
        return Promise.resolve('');
      });

      return Promise.all(bookPromises).then(function (palettes) {
        var recentCards = rawCards.map(function (card, i) {
          return {
            id: card.id,
            bookId: card.bookId,
            bookTitle: card.bookTitle || '',
            quote: fmt.truncate(card.quote || '', 60),
            timeAgo: fmt.timeAgo(card.time),
            palette: palettes[i]
          };
        });

        var classifiedCount = 0;
        domains.forEach(function (d) {
          classifiedCount += (d.subs ? d.subs.length : 0);
        });

        self.setData({
          stats: stats || {},
          recentCards: recentCards,
          topCategories: topCategories.slice(0, 5),
          topicCount: domains.length,
          classifiedCount: classifiedCount
        });
      });
    }).catch(function () {});
  },

  _startQuoteRotation: function () {
    var self = this;
    if (this._quoteTimer) clearInterval(this._quoteTimer);
    this._quoteTimer = setInterval(function () {
      self.setData({ quote: store.getRandomQuote() });
    }, 3000);
  },

  onHide: function () {
    if (this._quoteTimer) { clearInterval(this._quoteTimer); this._quoteTimer = null; }
  },

  onUnload: function () {
    if (this._quoteTimer) { clearInterval(this._quoteTimer); this._quoteTimer = null; }
  },

  goNotes: function () {
    wx.switchTab({ url: '/pages/notes/notes' });
  },

  goSearch: function () {
    wx.navigateTo({ url: '/pages/search/search' });
  }
});
