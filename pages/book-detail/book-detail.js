const { getBook, bookNotes, timeline } = require('../../utils/data');

Page({
  data: {
    book: {},
    notes: [],
    timeline
  },
  onLoad(query) {
    const book = getBook(query.id);
    this.setData({ book, notes: bookNotes(book.id) });
  },
  back() {
    wx.navigateBack();
  },
  addNote() {
    wx.switchTab({ url: '/pages/notes/notes' });
  }
});
