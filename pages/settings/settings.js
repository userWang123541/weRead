Page({
  data: {
    items: ['API Key 管理', '数据同步', '通知设置', '隐私与安全', '关于微信读书工作室']
  },
  openSync(event) {
    if (event.currentTarget.dataset.item === '数据同步') {
      wx.navigateTo({ url: '/pages/sync/sync' });
    }
  },
  back() {
    wx.navigateBack();
  }
});
