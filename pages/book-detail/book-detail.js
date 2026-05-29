var store = require('../../utils/store');
var fmt = require('../../utils/format');

Page({
  data: {
    loading: true,
    book: null,
    statusText: '',
    highlights: [],
    reviews: [],
    allHighlights: [],
    allReviews: [],
    timeline: [],
    highlightCount: 0,
    reviewCount: 0,
    showAllHighlights: false,
    showAllReviews: false
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
              fullText: card.quote || '',
              chapter: card.chapter || '',
              timeAgo: fmt.timeAgo(card.time)
            });
          } else if (card.type === 1) {
            reviews.push({
              text: fmt.truncate(card.note || card.quote || '', 80),
              fullText: card.note || card.quote || '',
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
          allHighlights: highlights,
          allReviews: reviews,
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

  toggleHighlights: function () {
    var show = !this.data.showAllHighlights;
    this.setData({
      showAllHighlights: show,
      highlights: show ? this.data.allHighlights : this.data.allHighlights.slice(0, 5)
    });
  },

  toggleReviews: function () {
    var show = !this.data.showAllReviews;
    this.setData({
      showAllReviews: show,
      reviews: show ? this.data.allReviews : this.data.allReviews.slice(0, 3)
    });
  },

  continueReading: function () {
    var book = this.data.book;
    if (!book) return;
    var openUrl = book.openUrl || '';
    if (openUrl) {
      // Copy URL to clipboard so user can open it in WeChat Read
      wx.setClipboardData({
        data: openUrl,
        success: function () {
          wx.showModal({
            title: '链接已复制',
            content: '书籍链接已复制到剪贴板，请打开微信读书App粘贴链接继续阅读。',
            confirmText: '我知道了',
            showCancel: false
          });
        }
      });
    } else {
      wx.showModal({
        title: '无法直接打开',
        content: '暂无该书的阅读链接，请在微信读书App中搜索此书继续阅读。',
        confirmText: '我知道了',
        showCancel: false
      });
    }
  },

  back: function () {
    wx.navigateBack();
  },

  goNotes: function () {
    var book = this.data.book;
    if (!book) {
      wx.switchTab({ url: '/pages/notes/notes' });
      return;
    }
    // Store book filter info in globalData for notes page to pick up
    var app = getApp();
    app.globalData.notesFilterBookId = book.bookId || book.id || '';
    app.globalData.notesFilterBookTitle = book.title || '';
    wx.switchTab({
      url: '/pages/notes/notes',
      success: function () {
        // Clear the filter after switching (notes page reads it on show)
        setTimeout(function () {
          delete app.globalData.notesFilterBookId;
          delete app.globalData.notesFilterBookTitle;
        }, 500);
      }
    });
  }
});
