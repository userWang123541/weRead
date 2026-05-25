var store = require('../../utils/store');

Page({
  data: {
    loading: true,
    tabs: ['在读', '已读完', '未读'],
    active: 0,
    allBooks: [],
    filteredBooks: [],
    readingCount: 0,
    completedCount: 0,
    unreadCount: 0
  },

  onLoad: function () {
    var self = this;
    Promise.all([
      store.getBooks('all'),
      store.getBooks('reading'),
      store.getBooks('completed'),
      store.getBooks('unread')
    ]).then(function (results) {
      var allBooks = results[0] || [];
      self.setData({
        loading: false,
        allBooks: allBooks,
        readingCount: (results[1] || []).length,
        completedCount: (results[2] || []).length,
        unreadCount: (results[3] || []).length
      });
      self._filterBooks(0);
    });
  },

  setTab: function (event) {
    var index = Number(event.currentTarget.dataset.index);
    this.setData({ active: index });
    this._filterBooks(index);
  },

  _filterBooks: function (tabIndex) {
    var statusMap = ['reading', 'completed', 'unread'];
    var status = statusMap[tabIndex] || 'reading';
    var filtered = this.data.allBooks.filter(function (b) {
      return b.status === status;
    });
    this.setData({ filteredBooks: filtered });
  },

  openBook: function (event) {
    var id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/book-detail/book-detail?id=' + id });
  },

  goSearch: function () {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  goProfile: function () {
    wx.switchTab({ url: '/pages/profile/profile' });
  }
});
