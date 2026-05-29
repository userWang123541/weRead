var store = require('../../utils/store');
var auth = require('../../utils/auth');

Page({
  data: {
    stats: {},
    userName: '沉思的读者',
    syncStatusText: '已开启'
  },

  onShow: function () {
    var that = this;
    store.getStats().then(function (stats) {
      that.setData({ stats: stats });
    });
    store.getUserDoc().then(function (user) {
      if (user && user.name) {
        that.setData({ userName: user.name });
      }
    });
  },

  goCategories: function () {
    wx.navigateTo({ url: '/pages/categories/categories' });
  },

  goSettings: function () {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  goSync: function () {
    wx.navigateTo({ url: '/pages/sync/sync' });
  },

  openAbout: function () {
    wx.showModal({
      title: '关于微读工作室',
      content: '微读工作室 v1.0\n基于微信读书数据的个人阅读知识管理工具。',
      showCancel: false
    });
  },

  logout: function () {
    wx.showModal({
      title: '确认退出',
      content: '退出后需要重新设置 API Key 才能同步数据。',
      success: function (res) {
        if (res.confirm) {
          wx.showLoading({ title: '退出中...' });
          wx.cloud.callFunction({
            name: 'categoryCRUD',
            data: { action: 'resetUser' },
            config: { timeout: 10000 }
          }).catch(function () {}).then(function () {
            wx.hideLoading();
            store.invalidateCache();
            auth.setLoggedOutStatus();
            wx.removeStorageSync('weread_api_key');
            wx.reLaunch({ url: '/pages/setup/setup' });
          });
        }
      }
    });
  }
});
