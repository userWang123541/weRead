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
    classifiedCount: 0,
    hasData: false,
    classifyStatus: 'idle'
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
        getApp().globalData.userStatus = status;
      }

      if (status.syncStatus === 'error') {
        wx.reLaunch({ url: '/pages/setup/setup?status=error' });
        return;
      }

      self.setData({ ready: true, classifyStatus: status.syncStatus || 'idle' });
      self._loadData();
      self._startQuoteRotation();

      var syncedAt = status.syncedAt ? new Date(status.syncedAt).getTime() : 0;
      if (syncedAt && Date.now() - syncedAt > 3600000) {
        self._backgroundRefresh();
      }

      // 如果正在分类，定期检查状态
      if (status.syncStatus === 'classifying') {
        self._runClassification(status.classifyBatch || 0);
      }
    });
  },

  onPullDownRefresh: function () {
    var self = this;
    store.invalidateCache();
    self._loadData();
    wx.stopPullDownRefresh();
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
        self._runClassification(0);
      }
    }).catch(function () {});
  },

  _runClassification: function (startBatch) {
    var self = this;
    self.setData({ classifyStatus: 'classifying' });
    wx.cloud.callFunction({
      name: 'classifyData',
      data: { startBatch: startBatch || 0 },
      config: { timeout: 180000 }
    }).then(function (res) {
      var result = res.result || {};
      if (result.success && result.done === false && typeof result.nextBatch === 'number') {
        self._runClassification(result.nextBatch);
        return;
      }
      store.invalidateCache();
      self.setData({ classifyStatus: result.success ? 'idle' : 'error' });
      self._loadData();
    }).catch(function () {
      self.setData({ classifyStatus: 'error' });
    });
  },

  _pollClassifyStatus: function () {
    var self = this;
    var timer = setInterval(function () {
      wx.cloud.callFunction({ name: 'checkUser', data: {}, config: { timeout: 10000 } }).then(function (res) {
        var r = res.result || {};
        if (r.syncStatus !== 'classifying') {
          clearInterval(timer);
          self.setData({ classifyStatus: r.syncStatus || 'idle' });
          if (r.syncStatus === 'idle') {
            store.invalidateCache();
            self._loadData();
          }
        }
      }).catch(function () {});
    }, 5000);
    // 5分钟后停止轮询
    setTimeout(function () { clearInterval(timer); }, 300000);
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

      var hasData = (stats && (stats.books > 0 || stats.highlights > 0));

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

        var classifiedCount = (stats && stats.classified) || 0;

      var readingDays = stats.readingDays || 0;

        self.setData({
          stats: Object.assign({}, stats || {}, { readingDays: readingDays }),
          recentCards: recentCards,
          topCategories: topCategories.slice(0, 5),
          topicCount: domains.length,
          classifiedCount: classifiedCount,
          hasData: hasData
        });
      });
    }).catch(function () {});
  },

  _startQuoteRotation: function () {
    var self = this;
    if (this._quoteTimer) clearInterval(this._quoteTimer);
    var quoteInterval = wx.getStorageSync('quote_interval') || 5000;
    this._quoteTimer = setInterval(function () {
      self.setData({ quote: store.getRandomQuote() });
    }, quoteInterval);
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

  goSetup: function () {
    wx.reLaunch({ url: '/pages/setup/setup' });
  }
});
