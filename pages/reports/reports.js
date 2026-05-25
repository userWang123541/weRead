const { reports } = require('../../utils/data');

Page({
  data: { reports },
  openReport(event) {
    const id = event.currentTarget.dataset.id;
    if (id === 'breakout') {
      wx.navigateTo({ url: '/pages/breakout/breakout' });
      return;
    }
    wx.navigateTo({ url: `/pages/report-detail/report-detail?id=${id}` });
  },
  makePoster() {
    wx.navigateTo({ url: '/pages/poster/poster' });
  }
});
