var store = require('../../utils/store');
var fmt = require('../../utils/format');

Page({
  data: {
    loading: true,
    book: null,
    statusText: '',
    highlights: [],
    reviews: [],
    timeline: [],
    highlightCount: 0,
    reviewCount: 0
  },

  onLoad: function (query) {
    if (!query.id) {
      wx.showToast({ title: '未找到书籍', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 1200);
      return;
    }

    var self = this;
    var bookId = query.id;

    store.getBook(bookId).then(function (book) {
      if (!book) {
        wx.showToast({ title: '未找到书籍', icon: 'none' });
        setTimeout(function () { wx.navigateBack(); }, 1200);
        return;
      }

      var statusText = '';
      if (book.status === 'reading') statusText = '在读中';
      else if (book.status === 'completed') statusText = '已读完';
      else if (book.status === 'unread') statusText = '想读';

      return store.getBookCardsAll(bookId).then(function (allCards) {
        allCards = allCards || [];
        var highlights = [];
        var reviews = [];

        for (var i = 0; i < allCards.length; i++) {
          var card = allCards[i];
          if (card.type === 0) {
            highlights.push({
              text: fmt.truncate(card.quote || '', 80),
              chapter: card.chapter || '',
              timeAgo: fmt.timeAgo(card.time)
            });
          } else if (card.type === 1) {
            reviews.push({
              text: fmt.truncate(card.note || card.quote || '', 80),
              chapter: card.chapter || '',
              timeAgo: fmt.timeAgo(card.time)
            });
          }
        }

        var timeline = self._buildTimeline(allCards);

        self.setData({
          loading: false,
          book: book,
          statusText: statusText,
          highlights: highlights.slice(0, 5),
          reviews: reviews.slice(0, 3),
          timeline: timeline,
          highlightCount: highlights.length,
          reviewCount: reviews.length
        });
      });
    });
  },

  _buildTimeline: function (cards) {
    if (!cards || cards.length === 0) return [];

    var sorted = cards.slice().sort(function (a, b) {
      return (b.time || 0) - (a.time || 0);
    });

    var groups = {};
    var order = [];
    for (var i = 0; i < sorted.length; i++) {
      var t = sorted[i].time;
      var dateKey = fmt.formatDate(t);
      if (!groups[dateKey]) {
        groups[dateKey] = [];
        order.push(dateKey);
      }
      groups[dateKey].push(sorted[i]);
    }

    var timeline = [];
    var maxItems = 5;
    for (var j = 0; j < order.length && timeline.length < maxItems; j++) {
      var date = order[j];
      var items = groups[date];
      var summary = '';
      var hlCount = 0;
      var rvCount = 0;
      for (var k = 0; k < items.length; k++) {
        if (items[k].type === 0) hlCount++;
        if (items[k].type === 1) rvCount++;
      }
      if (hlCount > 0 && rvCount > 0) {
        summary = '添加了 ' + hlCount + ' 条划线和 ' + rvCount + ' 条想法';
      } else if (hlCount > 0) {
        summary = '添加了 ' + hlCount + ' 条划线';
      } else if (rvCount > 0) {
        summary = '添加了 ' + rvCount + ' 条想法';
      } else {
        summary = '记录了 ' + items.length + ' 条内容';
      }
      timeline.push({ date: date, action: summary });
    }

    return timeline;
  },

  back: function () {
    wx.navigateBack();
  },

  goNotes: function () {
    wx.switchTab({ url: '/pages/notes/notes' });
  }
});
