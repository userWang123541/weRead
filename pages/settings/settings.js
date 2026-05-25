var store = require('../../utils/store');

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
    stats: {}
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
        that.setData({ syncing: false, syncStatus: 'idle', hasData: true, stats: normalizeStats(result.stats) });
        store.invalidateCache();
        wx.showToast({ title: '同步成功！', icon: 'success' });
        // 同步成功后 1.5 秒自动跳转首页
        setTimeout(function() {
          wx.switchTab({ url: '/pages/home/home' });
        }, 1500);
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

  saveApiKey: function () {
    var key = this.data.apiKey.trim();
    if (!key) {
      wx.showToast({ title: '请输入 API Key', icon: 'none' });
      return;
    }
    wx.setStorageSync('weread_api_key', key);
    wx.showToast({ title: '已保存', icon: 'success' });
    this.setData({ showKeyInput: false });
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

  openSync: function () {
    wx.navigateTo({ url: '/pages/sync/sync' });
  },

  openAbout: function () {
    wx.showModal({
      title: '关于微读工作室',
      content: '微读工作室 v1.0.0\n基于微信读书数据的个人阅读知识管理工具。\n数据存储在微信云开发环境中。',
      showCancel: false
    });
  },

  openPrivacy: function () {
    wx.showModal({
      title: '隐私与安全',
      content: '数据存储在微信云开发环境中，仅你本人可访问。API Key 通过云函数调用微信读书接口，不会暴露给第三方。',
      showCancel: false
    });
  },

  openNotify: function () {
    wx.showToast({ title: '暂未开放', icon: 'none' });
  },

  goSyncPage: function () {
    wx.navigateTo({ url: '/pages/sync/sync' });
  },

  back: function () {
    wx.navigateBack();
  }
});
