var store = require('../../utils/store');
var auth = require('../../utils/auth');
var fmt = require('../../utils/format');

var TYPE_FILTERS = ['全部', '划线', '想法'];
var TYPE_VALUES = [-1, 'highlight', 'review'];

Page({
  data: {
    allCards: [],
    cards: [],
    typeFilters: TYPE_FILTERS,
    activeType: 0,
    tagFilters: ['全部'],
    activeTag: 0,
    searchQuery: '',
    loading: true,
    skip: 0,
    hasMore: true,
    loadingMore: false,
    categoryOptions: [],
    categorySheetVisible: false,
    editingCard: null
  },

  noop: function () {},

  processCard: function (c) {
    return {
      id: c.id || c._id,
      cardId: c.cardId || c.id || c._id,
      type: c.type || 'highlight',
      bookId: c.bookId,
      bookTitle: c.bookTitle || '',
      author: c.author || '',
      chapter: c.chapter || '',
      quote: c.quote || '',
      note: c.note || '',
      category: c.category || '未分类',
      categoryId: c.categoryId || '',
      url: c.url || '',
      tags: (c.tags || []).map(function (t) {
        var parts = t.split('/');
        return parts[parts.length - 1] || t;
      }),
      rawTags: c.tags || [],
      timeStr: fmt.timeAgo(c.time),
      time: c.time
    };
  },

  onShow: function () {
    var that = this;
    auth.ensureHasKey(function () {
      that._loadData();
    });
  },

  _loadData: function () {
    var that = this;
    that.setData({ loading: true });
    Promise.all([
      store.getTopCategories(),
      store.getRecentCards(100),
      wx.cloud.callFunction({ name: 'categoryCRUD', data: { action: 'list' } })
    ]).then(function (results) {
      var topCats = results[0].slice(0, 6);
      var processed = (results[1] || []).map(that.processCard);
      var catResult = (results[2] && results[2].result) || {};
      var seenCategories = {};
      var categoryOptions = (catResult.categories || []).map(function (cat) {
        seenCategories[cat.path] = true;
        return { id: cat.id || cat.path, path: cat.path, name: cat.path };
      });

      processed.forEach(function (card) {
        if (card.category && card.category !== '未分类' && !seenCategories[card.category]) {
          seenCategories[card.category] = true;
          categoryOptions.push({ id: card.categoryId || card.category, path: card.category, name: card.category });
        }
        (card.rawTags || []).forEach(function (tag) {
          if (tag && tag !== '待分类/未归档' && !seenCategories[tag]) {
            seenCategories[tag] = true;
            categoryOptions.push({ id: tag, path: tag, name: tag });
          }
        });
      });

      topCats.forEach(function (tag) {
        if (tag && !seenCategories[tag]) {
          seenCategories[tag] = true;
          categoryOptions.push({ id: tag, path: tag, name: tag });
        }
      });

      categoryOptions.sort(function (a, b) {
        if (a.path === '未分类') return -1;
        if (b.path === '未分类') return 1;
        return a.path.localeCompare(b.path, 'zh');
      });
      categoryOptions.unshift({ id: 'unclassified', path: '未分类', name: '未分类' });

      that.setData({
        allCards: processed,
        tagFilters: ['全部'].concat(topCats),
        categoryOptions: categoryOptions,
        loading: false
      });
      that.applyFilters();
    }).catch(function () {
      that.setData({ loading: false });
    });
  },

  applyFilters: function () {
    var activeType = this.data.activeType;
    var activeTag = this.data.activeTag;
    var query = this.data.searchQuery.trim().toLowerCase();
    var typeVal = TYPE_VALUES[activeType];
    var tagFilters = this.data.tagFilters;
    var activeTagName = activeTag > 0 ? tagFilters[activeTag] : '';
    var filtered = this.data.allCards.filter(function (c) {
      if (typeVal !== -1) {
        if (typeVal === 'highlight' && c.type === 'review') return false;
        if (typeVal === 'review' && c.type !== 'review' && !c.note) return false;
      }
      if (activeTagName) {
        var hasTag = c.rawTags.some(function (t) { return t.indexOf(activeTagName) >= 0; });
        if (!hasTag && c.category.indexOf(activeTagName) < 0) return false;
      }
      if (query) {
        var text = (c.quote + ' ' + c.note + ' ' + c.bookTitle + ' ' + c.category).toLowerCase();
        if (text.indexOf(query) < 0) return false;
      }
      return true;
    });
    this.setData({ cards: filtered });
  },

  setTypeFilter: function (e) {
    this.setData({ activeType: Number(e.currentTarget.dataset.index) });
    this.applyFilters();
  },

  setTagFilter: function (e) {
    this.setData({ activeTag: Number(e.currentTarget.dataset.index) });
    this.applyFilters();
  },

  onSearch: function (e) {
    this.setData({ searchQuery: e.detail.value || '' });
    this.applyFilters();
  },

  openCategorySheet: function (e) {
    var cardId = e.currentTarget.dataset.cardid;
    var card = this.data.allCards.find(function (item) {
      return item.cardId === cardId || item.id === cardId;
    });
    if (!card) return;
    this.setData({ editingCard: card, categorySheetVisible: true });
  },

  closeCategorySheet: function () {
    this.setData({ categorySheetVisible: false, editingCard: null });
  },

  selectCategory: function (e) {
    var self = this;
    var path = e.currentTarget.dataset.path;
    var id = e.currentTarget.dataset.id || '';
    var card = this.data.editingCard;
    if (!card || !card.cardId || !path) return;

    wx.showLoading({ title: '保存中...' });
    wx.cloud.callFunction({
      name: 'categoryCRUD',
      data: {
        action: 'updateCardCategory',
        cardId: card.cardId,
        category: path,
        categoryId: id === 'unclassified' ? '' : id
      },
      config: { timeout: 10000 }
    }).then(function (res) {
      wx.hideLoading();
      var result = (res && res.result) || {};
      if (!result.success) {
        wx.showToast({ title: result.error || '保存失败', icon: 'none' });
        return;
      }

      function patch(list) {
        return list.map(function (item) {
          if (item.cardId === card.cardId) {
            return Object.assign({}, item, {
              category: path,
              categoryId: id === 'unclassified' ? '' : id
            });
          }
          return item;
        });
      }

      self.setData({
        allCards: patch(self.data.allCards),
        cards: patch(self.data.cards),
        categorySheetVisible: false,
        editingCard: null
      });
      store.invalidateCache();
      wx.showToast({ title: '分类已更新', icon: 'success' });
    }).catch(function (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    });
  },

  goSearch: function () {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  goProfile: function () {
    wx.switchTab({ url: '/pages/profile/profile' });
  }
});
