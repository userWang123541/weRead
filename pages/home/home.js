var store = require('../../utils/store');
var fmt = require('../../utils/format');

Page({
  data: {
    loading: true,
    hasApiKey: false,
    hasData: false,
    avatarUrl: '',
    greeting: '',
    stats: {},
    quote: {},
    recentCards: []
  },
  _quoteTimer: null,

  onShow: function () {
    var app = getApp();
    var hasKey = !!wx.getStorageSync('weread_api_key');
    var avatarUrl = wx.getStorageSync('user_avatar') || app.globalData.user.avatar || '';
    this.setData({ hasApiKey: hasKey, avatarUrl: avatarUrl });

    if (hasKey) {
      this._loadData();
      this._startQuoteRotation();
    } else {
      this.setData({ loading: false });
    }
  },

  onHide: function () {
    this._stopQuoteRotation();
  },

  onUnload: function () {
    this._stopQuoteRotation();
  },

  _loadData: function () {
    var self = this;
    var greeting = store.getTimeGreeting();
    var quote = store.getRandomQuote();
    self.setData({ greeting: greeting, quote: quote });

    Promise.all([
      store.getStats(),
      store.getRecentCards(3)
    ]).then(function (results) {
      var stats = results[0];
      var rawCards = results[1];

      var bookPromises = rawCards.map(function (card) {
        if (card.bookId) {
          return store.getBook(card.bookId).then(function (b) {
            return (b && b.palette) || '';
          });
        }
        return Promise.resolve('');
      });

      return Promise.all(bookPromises).then(function (palettes) {
        var recentCards = rawCards.map(function (card, i) {
          return {
            id: card.id,
            bookId: card.bookId,
            bookTitle: card.bookTitle || '',
            quote: fmt.truncate(card.quote || '', 60),
            timeAgo: fmt.timeAgo(card.time),
            firstTag: (card.tags && card.tags.length > 0) ? card.tags[0] : '',
            palette: palettes[i]
          };
        });

        self.setData({
          loading: false,
          hasData: !!(stats && stats.books),
          stats: stats || {},
          recentCards: recentCards
        });
      });
    }).catch(function () {
      self.setData({ loading: false });
    });
  },

  goSetup: function () {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  _startQuoteRotation: function () {
    var self = this;
    this._quoteTimer = setInterval(function () {
      self.setData({ quote: store.getRandomQuote() });
    }, 3000);
  },

  _stopQuoteRotation: function () {
    if (this._quoteTimer) {
      clearInterval(this._quoteTimer);
      this._quoteTimer = null;
    }
  },

  goBookshelf: function () {
    wx.switchTab({ url: '/pages/bookshelf/bookshelf' });
  },

  goNotes: function () {
    wx.switchTab({ url: '/pages/notes/notes' });
  },

  goSearch: function () {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  goProfile: function () {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  goAi: function () {
    wx.navigateTo({ url: '/pages/ai/ai' });
  },

  goCategories: function () {
    wx.switchTab({ url: '/pages/categories/categories' });
  }
});
