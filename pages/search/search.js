const { notes } = require('../../utils/data');

Page({
  data: {
    keywords: ['自由意志', '认知偏差', '时间管理', '策略关系', '社会结构', '成长'],
    notes
  },
  back() {
    wx.navigateBack();
  }
});
