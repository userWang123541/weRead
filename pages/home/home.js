const { stats, books, notes } = require('../../utils/data');

Page({
  data: {
    stats,
    recentBooks: books.slice(0, 2),
    recentNotes: notes.slice(0, 2)
  },
  goBookshelf() {
    wx.switchTab({ url: '/pages/bookshelf/bookshelf' });
  },
  goNotes() {
    wx.switchTab({ url: '/pages/notes/notes' });
  },
  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },
  goProfile() {
    wx.navigateTo({ url: '/pages/profile/profile' });
  }
});
