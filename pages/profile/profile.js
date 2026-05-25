const { stats } = require('../../utils/data');

Page({
  data: { stats },
  goSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  }
});
