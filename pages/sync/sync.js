var store = require('../../utils/store');
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
    errorMsg: '',
    polling: false
  },

  onLoad: function () {
    this.refresh();
  },

  onShow: function () {
    this.startPolling();
  },

  onHide: function () {
    this.stopPolling();
  },

  onUnload: function () {
    this.stopPolling();
  },

  startPolling: function () {
    var that = this;
    this.stopPolling();
    this.setData({ polling: true });
    this._pollTimer = setInterval(function () {
      that.refresh();
    }, 3000);
  },

  stopPolling: function () {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    this.setData({ polling: false });
  },

  refresh: function () {
    var that = this;
    store.getUserDoc().then(function (userDoc) {
      if (!userDoc) return;
      var stats = userDoc.stats || {};
      var fetchedAt = userDoc.fetchedAt || '';
      var status = userDoc.syncStatus || 'idle';

      that.setData({
        stats: stats,
        syncTime: fetchedAt ? fmt.formatDateTime(fetchedAt) : '未知',
        books: stats.books || 0,
        highlights: stats.highlights || 0,
        notes: stats.notes || 0,
        cards: stats.cards || 0,
        classified: stats.classified || 0,
        syncStatus: status,
        errorMsg: status === 'error' ? (userDoc.syncError || '同步失败，请重试') : ''
      });

      if (status === 'idle' || status === 'error') {
        that.stopPolling();
      }
    });

    var d = wx.cloud.database();
    d.collection('sync_status').limit(1).get().then(function (res) {
      if (res.data && res.data.length > 0) {
        var s = res.data[0];
        var status = s.status || 'idle';
        that.setData({
          syncStatus: status,
          syncTime: s.updatedAt ? fmt.formatDateTime(s.updatedAt) : that.data.syncTime,
          errorMsg: status === 'error' ? (s.error || '同步失败，请重试') : ''
        });
      }
    });
  },

  doSync: function () {
    var that = this;
    this.setData({ syncStatus: 'syncing', errorMsg: '' });
    this.startPolling();

    wx.cloud.callFunction({
      name: 'syncData'
    }).then(function () {
      that.refresh();
    }).catch(function (err) {
      console.error('sync error:', err);
      that.setData({
        syncStatus: 'error',
        errorMsg: err.message || '同步请求失败'
      });
      that.stopPolling();
    });
  },

  back: function () {
    wx.navigateBack();
  }
});
