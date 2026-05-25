const { stats } = require('../../utils/data');

Page({
  data: { stats },
  back() {
    wx.navigateBack();
  }
});
