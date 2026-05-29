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

      // Store key locally for faster access
      if (r.hasKey && r.apiKey) {
        wx.setStorageSync('weread_api_key', r.apiKey);
      }

      if (!r.hasKey) {
        wx.reLaunch({ url: '/pages/setup/setup' });
      } else if (r.syncStatus === 'syncing' || r.syncStatus === 'classifying') {
        wx.reLaunch({ url: '/pages/setup/setup?status=' + r.syncStatus });
      } else if (r.syncStatus === 'error') {
        wx.reLaunch({ url: '/pages/setup/setup?status=error' });
      }
      // If hasKey and status is idle, stay on current page (home tab)
    }).catch(function (err) {
      console.error('checkUser failed:', err);
      // Try local storage fallback
      var localKey = wx.getStorageSync('weread_api_key');
      if (localKey) {
        self.globalData.userStatus = { hasKey: true, syncStatus: 'idle', hasData: true };
      }
    });
  },

  globalData: {
    userStatus: null,
    notesFilterBookId: '',
    notesFilterBookTitle: '',
    user: {
      name: '沉思的读者',
      avatar: ''
    }
  }
});
