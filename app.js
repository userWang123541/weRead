App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      env: 'cloud1-2gzd9tcxd9bb65db',
      traceUser: true
    });

    // 检查是否有 API Key，没有则跳转设置页
    var apiKey = wx.getStorageSync('weread_api_key');
    this.globalData.hasApiKey = !!apiKey;
  },

  onShow: function () {
    // 每次显示时刷新状态
    var apiKey = wx.getStorageSync('weread_api_key');
    this.globalData.hasApiKey = !!apiKey;
  },

  globalData: {
    hasApiKey: false,
    user: {
      name: 'Jafar',
      studio: '微信读书工作室',
      avatar: ''
    }
  }
});
