const { categories } = require('../../utils/data');

Page({
  data: { categories },
  back() {
    wx.navigateBack();
  }
});
