var store = require('../../utils/store');
var auth = require('../../utils/auth');

var ONBOARDING_KEY = 'wxread_onboarding_done';

var introSlides = [
  {
    icon: '📖',
    title: '同步微信读书',
    desc: '一键导入你的微信读书划线和想法，所有笔记集中管理，随时随地查阅。'
  },
  {
    icon: '🤖',
    title: 'AI 智能问答',
    desc: '基于你的阅读内容，与 AI 对话，深入理解书中观点，激发新的思考。'
  },
  {
    icon: '🗂️',
    title: '知识分类',
    desc: '自动将你的笔记按主题归类，构建清晰的知识体系，快速找到需要的内容。'
  },
  {
    icon: '⌘',
    title: '知识资产',
    desc: '把分散的划线、想法和书评沉淀成可检索、可复用的个人知识库。'
  }
];

var syncFeatures = [
  { icon: '📚', text: '正在同步你的微信读书数据...' },
  { icon: '✨', text: '整理划线与想法，建立知识卡片...' },
  { icon: '🗂️', text: 'AI 向量分类，构建知识体系...' },
  { icon: '🧠', text: '用嵌入模型计算语义相似度...' },
  { icon: '⌘', text: '建立可检索的个人知识资产...' }
];

function normalizeStats(stats) {
  var source = stats || {};
  return Object.assign({}, source, {
    books: source.books || source.totalBooks || 0,
    highlights: source.highlights || source.totalHighlights || 0,
    notes: source.notes || source.totalReviews || 0,
    cards: source.cards || source.totalCards || 0,
    classified: source.classified || 0
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
    stats: {},
    valueCards: [
      { mark: '01', title: '真实同步', desc: '通过微信读书 Skill 导入你的书籍、划线和想法' },
      { mark: '02', title: '智能归类', desc: '用向量分类把笔记放进两级知识体系' },
      { mark: '03', title: '快速找回', desc: '按书籍、分类和关键词检索所有笔记' }
    ],

    /* onboarding */
    introSlides: introSlides,
    currentSlide: 0,
    totalSlides: introSlides.length,

    /* syncing carousel */
    syncFeatures: syncFeatures,
    syncFeatureIndex: 0,
    syncProgress: 0,
    _featureTimer: null,
    _progressTimer: null
  },

  onLoad: function (opts) {
    var onboarded = wx.getStorageSync(ONBOARDING_KEY);
    if (!onboarded && !opts.status) {
      this.setData({ step: 'intro' });
      return;
    }
    this._handleStatus(opts);
  },

  onUnload: function () {
    this._stopPoll();
    this._stopSyncCarousel();
  },

  /* ---- onboarding ---- */

  onIntroSwiperChange: function (e) {
    var idx = e.detail.current;
    this.setData({ currentSlide: idx });
  },

  skipIntro: function () {
    this._finishIntro();
  },

  nextSlide: function () {
    var next = this.data.currentSlide + 1;
    if (next >= this.data.totalSlides) {
      this._finishIntro();
      return;
    }
    this.setData({ currentSlide: next });
  },

  _finishIntro: function () {
    wx.setStorageSync(ONBOARDING_KEY, true);
    this.setData({ step: 'input' });
  },

  /* ---- API key input ---- */

  _handleStatus: function (opts) {
    if (opts.status === 'syncing' || opts.status === 'classifying') {
      this.setData({ step: 'syncing', statusText: '数据同步中...', detailText: '正在拉取你的微信读书数据' });
      this._startSyncCarousel();
      if (opts.status === 'classifying') {
        this._runClassification(0);
      } else {
        this._pollUntilDone();
      }
    } else if (opts.status === 'error') {
      this.setData({ step: 'error', errorMsg: decodeURIComponent(opts.msg || '未知错误') });
    }
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

    this.setData({
      step: 'syncing',
      statusText: '正在同步...',
      detailText: '正在拉取你的微信读书数据',
      errorMsg: '',
      syncProgress: 0,
      syncFeatureIndex: 0
    });
    this._startSyncCarousel();

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
        // Store key locally for auto-login
        wx.setStorageSync('weread_api_key', key);
        getApp().globalData.userStatus = {
          hasKey: true,
          syncStatus: 'classifying',
          hasData: true,
          stats: normalizeStats(result.stats),
          syncedAt: new Date().toISOString()
        };
        self.setData({
          step: 'syncing',
          stats: normalizeStats(result.stats),
          statusText: 'AI 分类中...',
          detailText: '正在用向量算法对笔记进行智能分类',
          syncProgress: 95
        });
        self._runClassification(0);
      } else {
        self._stopSyncCarousel();
        self.setData({ step: 'error', errorMsg: result.error || '同步失败' });
      }
    }).catch(function (err) {
      console.log('syncData error:', err.message);
      self._stopSyncCarousel();
      self.setData({ step: 'error', errorMsg: err.message || '网络错误，请重试' });
    });
  },

  /* ---- syncing carousel ---- */

  _startSyncCarousel: function () {
    var self = this;
    this._stopSyncCarousel();

    var featureTimer = setInterval(function () {
      var idx = (self.data.syncFeatureIndex + 1) % syncFeatures.length;
      self.setData({ syncFeatureIndex: idx });
    }, 3000);
    this.data._featureTimer = featureTimer;

    var progress = 0;
    var progressTimer = setInterval(function () {
      if (progress < 90) {
        progress += Math.random() * 3 + 1;
        if (progress > 90) progress = 90;
        self.setData({ syncProgress: Math.round(progress) });
      }
    }, 800);
    this.data._progressTimer = progressTimer;
  },

  _stopSyncCarousel: function () {
    if (this.data._featureTimer) {
      clearInterval(this.data._featureTimer);
      this.data._featureTimer = null;
    }
    if (this.data._progressTimer) {
      clearInterval(this.data._progressTimer);
      this.data._progressTimer = null;
    }
  },

  _runClassification: function (startBatch) {
    var self = this;
    wx.cloud.callFunction({
      name: 'classifyData',
      data: { startBatch: startBatch || 0 },
      config: { timeout: 180000 }
    }).then(function (res) {
      var result = res.result || {};
      if (!result.success) {
        self._stopSyncCarousel();
        self.setData({ step: 'error', errorMsg: result.error || '分类失败' });
        return;
      }

      if (result.done === false && typeof result.nextBatch === 'number') {
        self.setData({
          statusText: 'AI 分类中...',
          detailText: '已处理 ' + (result.processed || 0) + ' / ' + (result.total || 0) + ' 条，本轮继续',
          syncProgress: 95
        });
        self._runClassification(result.nextBatch);
        return;
      }

      self._stopSyncCarousel();
      store.invalidateCache();
      auth.fetchStatus().then(function (status) {
        getApp().globalData.userStatus = status;
        self.setData({
          step: 'done',
          stats: normalizeStats(status.stats),
          syncProgress: 100,
          statusText: '同步完成',
          detailText: '分类已完成'
        });
      });
    }).catch(function (err) {
      self._stopSyncCarousel();
      self.setData({ step: 'error', errorMsg: err.message || '分类请求失败' });
    });
  },

  /* ---- polling ---- */

  _pollUntilDone: function () {
    var self = this;
    this._stopPoll();

    function poll() {
      wx.cloud.callFunction({ name: 'checkUser', data: {}, config: { timeout: 10000 } }).then(function (res) {
        var r = res.result || {};
        if (r.syncStatus === 'classifying') {
          // 分类进行中
          self.setData({
            statusText: 'AI 分类中...',
            detailText: '正在用向量算法对笔记进行智能分类',
            syncProgress: 95
          });
        } else if (r.syncStatus === 'idle' && r.hasData) {
          self._stopPoll();
          self._stopSyncCarousel();
          getApp().globalData.userStatus = r;
          var classifyCount = r.classifyBatch || 0;
          self.setData({
            step: 'done',
            stats: normalizeStats(r.stats),
            syncProgress: 100,
            statusText: '同步完成',
            detailText: classifyCount > 0 ? '已完成 ' + classifyCount + ' 条笔记分类' : '分类将在后台自动进行'
          });
        } else if (r.syncStatus === 'error') {
          self._stopPoll();
          self._stopSyncCarousel();
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

  /* ---- navigation ---- */

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
