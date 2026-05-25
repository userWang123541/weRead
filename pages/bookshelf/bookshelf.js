const { books } = require('../../utils/data');

Page({
  data: {
    tabs: ['在读 50', '已读 36', '想读 10'],
    active: 0,
    books
  },
  setTab(event) {
    this.setData({ active: Number(event.currentTarget.dataset.index) });
  },
  openBook(event) {
    wx.navigateTo({ url: `/pages/book-detail/book-detail?id=${event.currentTarget.dataset.id}` });
  },
  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  }
});
