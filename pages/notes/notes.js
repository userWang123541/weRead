const { notes } = require('../../utils/data');

Page({
  data: {
    filters: ['自由意志', '时间管理', '策略关系', '认知偏差'],
    active: 0,
    notes
  },
  setFilter(event) {
    this.setData({ active: Number(event.currentTarget.dataset.index) });
  },
  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  }
});
