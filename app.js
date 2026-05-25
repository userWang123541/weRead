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

    this._checkUser();
  },

  _checkUser: function () {
    var self = this;
    wx.cloud.callFunction({ name: 'checkUser', data: {}, config: { timeout: 10000 } }).then(function (res) {
      var r = res.result || {};
      self.globalData.userStatus = r;

      if (!r.hasKey) {
        wx.redirectTo({ url: '/pages/setup/setup' });
      } else if (r.syncStatus === 'syncing' || r.syncStatus === 'classifying' || r.syncStatus === 'error') {
        wx.redirectTo({ url: '/pages/setup/setup' });
      }
    }).catch(function (err) {
      console.error('checkUser failed:', err);
    });
  },

  globalData: {
    userStatus: null,
    user: {
      name: '沉思的读者',
      avatar: ''
    }
  }
});
