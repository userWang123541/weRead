const { stats } = require('../../utils/data');

Page({
  data: { stats },
  goSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },
  goSync() {
    wx.navigateTo({ url: '/pages/sync/sync' });
  },
  goCategories() {
    wx.navigateTo({ url: '/pages/categories/categories' });
  }
});
