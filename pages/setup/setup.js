var store = require('../../utils/store');
var auth = require('../../utils/auth');

function normalizeStats(stats) {
  var source = stats || {};
  return Object.assign({}, source, {
    books: source.books || source.totalBooks || 0,
    highlights: source.highlights || source.totalHighlights || 0,
    notes: source.notes || source.totalReviews || 0
  });
}

Page({
  data: {
    step: 'input',
    apiKey: '',
    showKey: false,
    errorMsg: '',
    statusText: '',
    detailText: '',
    stats: {}
  },

  onLoad: function (opts) {
    if (opts.status === 'syncing' || opts.status === 'classifying') {
      this.setData({ step: 'syncing', statusText: '数据同步中...', detailText: '正在拉取你的微信读书数据' });
      this._pollUntilDone();
    } else if (opts.status === 'error') {
      this.setData({ step: 'error', errorMsg: decodeURIComponent(opts.msg || '未知错误') });
    }
  },

  onUnload: function () {
    this._stopPoll();
  },

  onInput: function (e) {
    this.setData({ apiKey: e.detail.value, errorMsg: '' });
  },

  toggleShowKey: function () {
    this.setData({ showKey: !this.data.showKey });
  },

  showTutorial: function () {
    wx.showModal({
      title: '获取 API Key',
      content: '1. 打开微信读书 App\n2. 点击底部「我的」\n3. 点击「设置」\n4. 点击「微信读书 Skill」\n5. 点击「获取 API Key」并复制',
      showCancel: false
    });
  },

  startSync: function () {
    var key = (this.data.apiKey || '').trim();
    if (!key) return;

    this.setData({ step: 'syncing', statusText: '正在同步...', detailText: '正在拉取你的微信读书数据', errorMsg: '' });

    var self = this;
    wx.cloud.callFunction({
      name: 'syncData',
      data: { apiKey: key },
      config: { timeout: 180000 }
    }).then(function (res) {
      var result = res.result || {};
      console.log('syncData result:', JSON.stringify(result));
      if (result.success) {
        store.invalidateCache();
        getApp().globalData.userStatus = {
          hasKey: true,
          syncStatus: 'idle',
          hasData: true,
          stats: normalizeStats(result.stats),
          syncedAt: new Date().toISOString()
        };
        // 同步成功，直接进入首页（分类在后台自动进行）
        self.setData({
          step: 'done',
          stats: normalizeStats(result.stats),
          statusText: '同步完成',
          detailText: '分类将在后台自动进行'
        });
      } else {
        self.setData({ step: 'error', errorMsg: result.error || '同步失败' });
      }
    }).catch(function (err) {
      console.log('syncData error:', err.message);
      self.setData({ step: 'error', errorMsg: err.message || '网络错误，请重试' });
    });
  },

  _pollUntilDone: function () {
    var self = this;
    this._stopPoll();

    function poll() {
      wx.cloud.callFunction({ name: 'checkUser', data: {}, config: { timeout: 10000 } }).then(function (res) {
        var r = res.result || {};
        if (r.syncStatus === 'idle' && r.hasData) {
          self._stopPoll();
          getApp().globalData.userStatus = r;
          self.setData({ step: 'done', stats: normalizeStats(r.stats) });
        } else if (r.syncStatus === 'error') {
          self._stopPoll();
          self.setData({ step: 'error', errorMsg: r.syncError || '处理失败' });
        }
      }).catch(function () {});
    }

    poll();
    this.data._pollTimer = setInterval(poll, 3000);
  },

  _stopPoll: function () {
    if (this.data._pollTimer) {
      clearInterval(this.data._pollTimer);
      this.data._pollTimer = null;
    }
  },

  retry: function () {
    this.setData({ step: 'input', errorMsg: '' });
  },

  goHome: function () {
    auth.fetchStatus().then(function (status) {
      if (status.hasKey) {
        wx.switchTab({ url: '/pages/home/home' });
      } else {
        wx.reLaunch({ url: '/pages/setup/setup' });
      }
    });
  }
});
