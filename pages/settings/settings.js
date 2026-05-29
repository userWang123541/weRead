var store = require('../../utils/store');

var QUOTE_OPTIONS = [
  { label: '3秒', value: 3000 },
  { label: '5秒', value: 5000 },
  { label: '8秒', value: 8000 },
  { label: '10秒', value: 10000 },
  { label: '15秒', value: 15000 }
];

function normalizeStats(stats) {
  var source = stats || {};
  return Object.assign({}, source, {
    books: source.books || source.totalBooks || 0,
    highlights: source.highlights || source.totalHighlights || 0,
    notes: source.notes || source.totalReviews || 0,
    cards: source.cards || source.totalCards || 0
  });
}

Page({
  data: {
    apiKey: '',
    showKeyInput: false,
    hasData: false,
    syncStatus: 'idle',
    syncing: false,
    stats: {},
    quoteIntervalLabel: '5秒'
  },

  onLoad: function () {
    var that = this;
    var key = wx.getStorageSync('weread_api_key') || '';
    that.setData({ apiKey: key });

    store.getUserDoc().then(function(doc) {
      if (doc) {
        var stats = normalizeStats(doc.stats);
        that.setData({
          hasData: !!stats.books,
          syncStatus: doc.syncStatus || 'idle',
          stats: stats
        });
      }
    });

    var interval = wx.getStorageSync('quote_interval') || 5000;
    var label = '5秒';
    for (var i = 0; i < QUOTE_OPTIONS.length; i++) {
      if (QUOTE_OPTIONS[i].value === interval) {
        label = QUOTE_OPTIONS[i].label;
        break;
      }
    }
    that.setData({ quoteIntervalLabel: label });
  },

  onShow: function () {
    this.checkSyncStatus();
  },

  onApiKeyInput: function (e) {
    this.setData({ apiKey: e.detail.value });
  },

  toggleKeyInput: function () {
    this.setData({ showKeyInput: !this.data.showKeyInput });
  },

  saveAndSync: function () {
    var that = this;
    var key = this.data.apiKey.trim();
    if (!key) {
      wx.showToast({ title: '请输入 API Key', icon: 'none' });
      return;
    }

    wx.setStorageSync('weread_api_key', key);
    that.setData({ syncing: true, syncStatus: 'syncing', showKeyInput: false });
    wx.showLoading({ title: '正在同步数据...', mask: true });

    wx.cloud.callFunction({
      name: 'syncData',
      data: { apiKey: key },
      config: { timeout: 120000 }
    }).then(function(res) {
      wx.hideLoading();
      var result = res.result || {};
      if (result.success) {
        that.setData({ syncing: true, syncStatus: 'classifying', hasData: true, stats: normalizeStats(result.stats) });
        store.invalidateCache();
        that._runClassification(0);
      } else {
        that.setData({ syncing: false, syncStatus: 'error' });
        wx.showModal({ title: '同步失败', content: result.error || '未知错误', showCancel: false });
      }
    }).catch(function(err) {
      wx.hideLoading();
      that.setData({ syncing: false, syncStatus: 'error' });
      wx.showModal({ title: '同步失败', content: err.message || '网络错误', showCancel: false });
    });
  },

  _runClassification: function (startBatch) {
    var that = this;
    wx.showLoading({ title: '正在分类...', mask: true });
    wx.cloud.callFunction({
      name: 'classifyData',
      data: { startBatch: startBatch || 0 },
      config: { timeout: 180000 }
    }).then(function(res) {
      var result = res.result || {};
      if (!result.success) {
        wx.hideLoading();
        that.setData({ syncing: false, syncStatus: 'error' });
        wx.showModal({ title: '分类失败', content: result.error || '未知错误', showCancel: false });
        return;
      }

      if (result.done === false && typeof result.nextBatch === 'number') {
        that._runClassification(result.nextBatch);
        return;
      }

      wx.hideLoading();
      store.invalidateCache();
      that.setData({ syncing: false, syncStatus: 'idle' });
      wx.showToast({ title: '同步完成', icon: 'success' });
      setTimeout(function() {
        wx.switchTab({ url: '/pages/home/home' });
      }, 1200);
    }).catch(function(err) {
      wx.hideLoading();
      that.setData({ syncing: false, syncStatus: 'error' });
      wx.showModal({ title: '分类失败', content: err.message || '网络错误', showCancel: false });
    });
  },

  triggerSync: function () {
    var key = this.data.apiKey.trim();
    if (!key) {
      wx.showToast({ title: '请先设置 API Key', icon: 'none' });
      return;
    }
    this.saveAndSync();
  },

  clearApiKey: function () {
    wx.removeStorageSync('weread_api_key');
    this.setData({ apiKey: '', showKeyInput: false, hasData: false });
    wx.showToast({ title: '已清除', icon: 'success' });
  },

  changeQuoteInterval: function () {
    var that = this;
    var labels = QUOTE_OPTIONS.map(function (o) { return o.label; });
    wx.showActionSheet({
      itemList: labels,
      success: function (res) {
        var selected = QUOTE_OPTIONS[res.tapIndex];
        wx.setStorageSync('quote_interval', selected.value);
        that.setData({ quoteIntervalLabel: selected.label });
        wx.showToast({ title: '已设置为' + selected.label, icon: 'success' });
      }
    });
  },

  checkSyncStatus: function () {
    var that = this;
    store.getUserDoc().then(function(doc) {
      if (doc) {
        var stats = normalizeStats(doc.stats);
        that.setData({
          syncStatus: doc.syncStatus || 'idle',
          hasData: !!stats.books,
          stats: stats
        });
      }
    });
  },

  openAbout: function () {
    wx.showModal({
      title: '关于微读工作室',
      content: '微读工作室 v1.0.0\n基于微信读书数据的个人阅读知识管理工具。\n数据存储在微信云开发环境中。',
      showCancel: false
    });
  }
});
