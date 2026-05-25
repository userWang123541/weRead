var store = require('../../utils/store');

Page({
  data: {
    stats: {},
    user: {}
  },
  onLoad: function () {
    var that = this;
    var app = getApp();
    this.setData({ user: app.globalData.user || {} });

    store.getStats().then(function (stats) {
      that.setData({ stats: stats });
    });
  },
  goSettings: function () {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },
  goSync: function () {
    wx.navigateTo({ url: '/pages/sync/sync' });
  },
  goCategories: function () {
    wx.switchTab({ url: '/pages/categories/categories' });
  },
  goSearch: function () {
    wx.navigateTo({ url: '/pages/search/search' });
  }
});
