var store = require('../../utils/store');
var auth = require('../../utils/auth');
var fmt = require('../../utils/format');

Page({
  data: {
    stats: {},
    syncTime: '',
    books: 0,
    highlights: 0,
    notes: 0,
    cards: 0,
    classified: 0,
    syncStatus: 'idle',
    errorMsg: ''
  },

  _normalizeStats: function (stats) {
    var source = stats || {};
    return Object.assign({}, source, {
      books: source.books || source.totalBooks || 0,
      highlights: source.highlights || source.totalHighlights || 0,
      notes: source.notes || source.totalReviews || 0,
      cards: source.cards || source.totalCards || 0,
      classified: source.classified || 0
    });
  },

  onLoad: function () {
    this.refresh();
  },

  onShow: function () {
    var self = this;
    auth.ensureHasKey(function () {
      self.refresh();
      self._startPoll();
    });
  },

  onHide: function () {
    this._stopPoll();
  },

  onUnload: function () {
    this._stopPoll();
  },

  _startPoll: function () {
    var self = this;
    this._stopPoll();
    this._pollTimer = setInterval(function () {
      self.refresh();
    }, 3000);
  },

  _stopPoll: function () {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  refresh: function () {
    var self = this;
    store.getUserDoc().then(function (userDoc) {
      if (!userDoc) return;
      var stats = self._normalizeStats(userDoc.stats);
      var status = userDoc.syncStatus || 'idle';

      self.setData({
        stats: stats,
        syncTime: userDoc.syncedAt ? fmt.formatDateTime(userDoc.syncedAt) : '未知',
        books: stats.books || 0,
        highlights: stats.highlights || 0,
        notes: stats.notes || 0,
        cards: stats.cards || 0,
        classified: stats.classified || 0,
        syncStatus: status,
        errorMsg: status === 'error' ? (userDoc.syncError || '同步失败，请重试') : ''
      });

      if (status === 'idle' || status === 'error') {
        self._stopPoll();
      }
    });
  },

  doSync: function () {
    var self = this;
    self.setData({ syncStatus: 'syncing', errorMsg: '' });
    self._startPoll();

    store.invalidateCache();
    wx.cloud.callFunction({
      name: 'syncData',
      data: {},
      config: { timeout: 180000 }
    }).then(function (res) {
      var result = res.result || {};
      if (result.success) {
        store.invalidateCache();
        self.refresh();
      } else {
        self.setData({ syncStatus: 'error', errorMsg: result.error || '同步失败' });
        self._stopPoll();
      }
    }).catch(function (err) {
      self.setData({ syncStatus: 'error', errorMsg: err.message || '同步请求失败' });
      self._stopPoll();
    });
  },

  back: function () {
    wx.navigateBack();
  }
});
