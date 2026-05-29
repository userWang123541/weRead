var store = require('../../utils/store');
var auth = require('../../utils/auth');
var fmt = require('../../utils/format');

var TYPE_FILTERS = ['全部', '划线', '想法'];
var TYPE_VALUES = [-1, 0, 1];
var PAGE_SIZE = 20;

Page({
  data: {
    cards: [],
    typeFilters: TYPE_FILTERS,
    activeType: 0,
    searchQuery: '',
    loading: true,
    pageLoading: false,
    cardCount: 0,
    bookNames: ['全部书籍'],
    bookValues: [''],
    activeBookIdx: 0,
    activeCatPath: '',
    activeCatLabel: '全部分类',
    showBookPicker: false,
    showCatPicker: false,
    filterCatCol1: [],
    filterCatCol2: [],
    filterCat1: '',
    filterCat2: '',
    categorySheetVisible: false,
    editingCard: null,
    catCol1: [],
    catCol2: [],
    catPick1: 0,
    catPick2: 0,
    taxonomy: null,
    categoryOptions: [],
    visibleCount: 0,
    filteredCount: 0,
    currentPage: 1,
    totalPages: 1,
    hasPrevPage: false,
    hasNextPage: false
  },

  _searchTimer: null,

  noop: function () {},

  processCard: function (c) {
    var typeNum = typeof c.type === 'number' ? c.type : 0;
    return {
      id: c.id || c._id,
      cardId: c.cardId || c.id || c._id,
      type: typeNum,
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
    var app = getApp();
    var filterBookTitle = app.globalData.notesFilterBookTitle || '';
    app.globalData.notesFilterBookId = '';
    app.globalData.notesFilterBookTitle = '';

    auth.ensureHasKey(function () {
      that._loadData(function () {
        if (!filterBookTitle) return;
        var idx = that.data.bookNames.indexOf(filterBookTitle);
        if (idx > 0) {
          that.setData({ activeBookIdx: idx });
        }
      });
    });
  },

  onPullDownRefresh: function () {
    store.invalidateCache();
    this._loadData();
    wx.stopPullDownRefresh();
  },

  _loadData: function (callback) {
    var that = this;
    that.setData({ loading: true, pageLoading: true, cards: [] });
    store.getNotesMeta().then(function (meta) {
      var books = (meta && meta.books) || [];
      var taxonomy = (meta && meta.taxonomy) || { domains: [] };
      var domains = taxonomy.domains || [];

      var bookNames = ['全部书籍'];
      var bookValues = [''];
      books.forEach(function (book) {
        if (!book || !book.bookId || !book.title) return;
        bookNames.push(book.title);
        bookValues.push(book.bookId);
      });

      var categoryOptions = [];
      domains.forEach(function (d) {
        categoryOptions.push({ id: d.name, path: d.name });
        (d.children || d.subs || []).forEach(function (s) {
          categoryOptions.push({ id: s.path, path: s.path });
        });
      });

      var catCol1 = domains.map(function (d) { return d.name; });

      that.setData({
        bookNames: bookNames,
        bookValues: bookValues,
        taxonomy: taxonomy,
        catCol1: catCol1,
        categoryOptions: categoryOptions,
        filterCatCol1: that._withAll(domains.map(function (d) {
          return { name: d.name, path: d.name };
        }), '全部分类'),
        filterCatCol2: [],
        currentPage: 1,
        totalPages: 1,
        visibleCount: 0,
        filteredCount: 0,
        cardCount: 0,
        hasPrevPage: false,
        hasNextPage: false
      });
      if (typeof callback === 'function') callback();
      that.loadCardsPage(1);
    }).catch(function () {
      that.setData({ loading: false, pageLoading: false });
    });
  },

  _currentFilters: function () {
    var activeType = this.data.activeType;
    return {
      type: TYPE_VALUES[activeType],
      bookId: this.data.activeBookIdx > 0 ? this.data.bookValues[this.data.activeBookIdx] : '',
      category: this.data.activeCatPath || ''
    };
  },

  _filterSearchResults: function (cards) {
    var filters = this._currentFilters();
    return (cards || []).map(this.processCard).filter(function (c) {
      if (filters.type !== -1 && c.type !== filters.type) return false;
      if (filters.bookId && c.bookId !== filters.bookId) return false;
      if (filters.category) {
        if (!(c.category === filters.category || c.category.indexOf(filters.category + '/') === 0)) {
          return false;
        }
      }
      return true;
    });
  },

  loadCardsPage: function (page) {
    var that = this;
    var targetPage = Math.max(1, Number(page) || 1);
    var query = (that.data.searchQuery || '').trim();

    that.setData({ pageLoading: true });

    if (query) {
      return store.searchCards(query).then(function (results) {
        var filtered = that._filterSearchResults(results);
        var total = filtered.length;
        var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        targetPage = Math.min(targetPage, totalPages);
        var start = (targetPage - 1) * PAGE_SIZE;
        var pageCards = filtered.slice(start, start + PAGE_SIZE);
        that.setData({
          cards: pageCards,
          loading: false,
          pageLoading: false,
          cardCount: total,
          filteredCount: total,
          visibleCount: pageCards.length,
          currentPage: targetPage,
          totalPages: totalPages,
          hasPrevPage: targetPage > 1,
          hasNextPage: targetPage < totalPages
        });
      }).catch(function () {
        that.setData({ loading: false, pageLoading: false });
      });
    }

    return store.queryCardsPage({
      page: targetPage,
      pageSize: PAGE_SIZE,
      filters: that._currentFilters()
    }).then(function (res) {
      var pageCards = (res.cards || []).map(that.processCard);
      var total = res.total || 0;
      var totalPages = res.totalPages || 1;
      if (total > 0 && targetPage > totalPages) {
        return that.loadCardsPage(totalPages);
      }
      that.setData({
        cards: pageCards,
        loading: false,
        pageLoading: false,
        cardCount: total,
        filteredCount: total,
        visibleCount: pageCards.length,
        currentPage: res.page || targetPage,
        totalPages: totalPages,
        hasPrevPage: (res.page || targetPage) > 1,
        hasNextPage: (res.page || targetPage) < totalPages
      });
    }).catch(function () {
      that.setData({ loading: false, pageLoading: false });
    });
  },

  applyFilters: function () {
    this.loadCardsPage(1);
  },

  prevPage: function () {
    if (!this.data.hasPrevPage || this.data.pageLoading) return;
    this.loadCardsPage(this.data.currentPage - 1);
  },

  nextPage: function () {
    if (!this.data.hasNextPage || this.data.pageLoading) return;
    this.loadCardsPage(this.data.currentPage + 1);
  },

  setTypeFilter: function (e) {
    this.setData({ activeType: Number(e.currentTarget.dataset.index) });
    this.applyFilters();
  },

  toggleBookPicker: function () {
    this.setData({ showBookPicker: !this.data.showBookPicker, showCatPicker: false });
  },

  pickBook: function (e) {
    var idx = Number(e.currentTarget.dataset.index);
    this.setData({ activeBookIdx: idx, showBookPicker: false });
    this.applyFilters();
  },

  toggleCatPicker: function () {
    this.setData({ showCatPicker: !this.data.showCatPicker, showBookPicker: false });
  },

  _withAll: function (items, label) {
    return [{ name: label, path: '' }].concat(items || []);
  },

  pickFilterCat1: function (e) {
    var path = e.currentTarget.dataset.path || '';
    var name = e.currentTarget.dataset.name || '全部分类';
    var taxonomy = this.data.taxonomy;
    var domains = (taxonomy && taxonomy.domains) || [];
    var col2 = [];

    domains.forEach(function (d) {
      if ((d.path || d.name) === path) {
        col2 = (d.children || d.subs || []).map(function (child) {
          return { name: child.name, path: child.path };
        });
      }
    });

    this.setData({
      filterCat1: path,
      filterCat2: '',
      activeCatPath: path,
      activeCatLabel: name,
      filterCatCol2: path ? this._withAll(col2, '全部二级') : [],
      showCatPicker: path && col2.length ? this.data.showCatPicker : false
    });
    this.applyFilters();
  },

  pickFilterCat2: function (e) {
    var path = e.currentTarget.dataset.path || '';
    var name = e.currentTarget.dataset.name || this.data.activeCatLabel;

    this.setData({
      filterCat2: path,
      activeCatPath: path || this.data.filterCat1,
      activeCatLabel: path ? name : this._catNameByPath(this.data.filterCat1),
      showCatPicker: false
    });
    this.applyFilters();
  },

  clearCategoryFilter: function () {
    this.setData({
      activeCatPath: '',
      activeCatLabel: '全部分类',
      filterCat1: '',
      filterCat2: '',
      filterCatCol2: [],
      showCatPicker: false
    });
    this.applyFilters();
  },

  clearAllFilters: function () {
    this.setData({
      activeType: 0,
      activeBookIdx: 0,
      activeCatPath: '',
      activeCatLabel: '全部分类',
      searchQuery: '',
      filterCat1: '',
      filterCat2: '',
      filterCatCol2: []
    });
    this.applyFilters();
  },

  _catNameByPath: function (path) {
    if (!path) return '全部分类';
    var last = path.split('/').pop();
    return last || '全部分类';
  },

  onSearch: function (e) {
    var that = this;
    this.setData({ searchQuery: e.detail.value || '' });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(function () {
      that.applyFilters();
    }, 300);
  },

  clearSearch: function () {
    clearTimeout(this._searchTimer);
    this.setData({ searchQuery: '' });
    this.applyFilters();
  },

  closePickers: function () {
    this.setData({ showBookPicker: false, showCatPicker: false });
  },

  openCategorySheet: function (e) {
    var cardId = e.currentTarget.dataset.cardid;
    var card = (this.data.cards || []).find(function (item) {
      return item.cardId === cardId || item.id === cardId;
    });
    if (!card) return;

    var parts = (card.category || '未分类').split('/');
    var catCol1 = this.data.catCol1.slice();
    if (catCol1.indexOf('未分类') < 0) catCol1.unshift('未分类');

    var pick1 = 0;
    for (var i = 0; i < catCol1.length; i++) {
      if (catCol1[i] === parts[0]) {
        pick1 = i;
        break;
      }
    }

    this.setData({
      editingCard: card,
      categorySheetVisible: true,
      catCol1: catCol1,
      catPick1: pick1,
      catPick2: 0,
      catCol2: []
    });
    this._refreshCatCol2(pick1);
    if (parts.length > 1) {
      var that = this;
      setTimeout(function () {
        var col2 = that.data.catCol2;
        for (var j = 0; j < col2.length; j++) {
          if (col2[j] === parts[1]) {
            that.setData({ catPick2: j });
            break;
          }
        }
      }, 50);
    }
  },

  closeCategorySheet: function () {
    this.setData({ categorySheetVisible: false, editingCard: null });
  },

  onCatPickerChange: function (e) {
    var values = e.detail.value || [0, 0];
    var pick1 = Number(values[0] || 0);
    var pick2 = Number(values[1] || 0);

    if (pick1 !== this.data.catPick1) {
      this.setData({ catPick1: pick1, catPick2: 0 });
      this._refreshCatCol2(pick1);
      return;
    }

    if (pick2 !== this.data.catPick2) {
      this.setData({ catPick2: pick2 });
    }
  },

  _refreshCatCol2: function (col1Idx) {
    var domain = this.data.catCol1[col1Idx];
    var taxonomy = this.data.taxonomy;
    var domains = (taxonomy && taxonomy.domains) || [];
    var col2 = [];
    for (var i = 0; i < domains.length; i++) {
      if (domains[i].name === domain || domains[i].path === domain) {
        (domains[i].children || domains[i].subs || []).forEach(function (s) {
          col2.push(s.name);
        });
        break;
      }
    }
    this.setData({ catCol2: col2 });
  },

  confirmCategory: function () {
    var self = this;
    var card = this.data.editingCard;
    if (!card || !card.cardId) return;

    var domain = this.data.catCol1[this.data.catPick1] || '';
    var path = '未分类';
    var id = '';
    if (domain && domain !== '未分类') {
      path = domain;
      if (this.data.catCol2.length > 0) {
        path += '/' + this.data.catCol2[this.data.catPick2];
      }
      id = path;
    }

    wx.showLoading({ title: '保存中...' });
    wx.cloud.callFunction({
      name: 'categoryCRUD',
      data: {
        action: 'updateCardCategory',
        cardId: card.cardId,
        category: path,
        categoryId: id
      },
      config: { timeout: 10000 }
    }).then(function (res) {
      wx.hideLoading();
      var result = (res && res.result) || {};
      if (!result.success) {
        wx.showToast({ title: result.error || '保存失败', icon: 'none' });
        return;
      }
      self.setData({ categorySheetVisible: false, editingCard: null });
      store.invalidateCache();
      self.loadCardsPage(self.data.currentPage);
      wx.showToast({ title: '分类已更新', icon: 'success' });
    }).catch(function (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    });
  }
});
