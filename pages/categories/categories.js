var store = require('../../utils/store');
var auth = require('../../utils/auth');

Page({
  data: {
    rows: [],
    searchQuery: '',
    expandLevel: 1,
    extraExpanded: {},
    loading: true,
    error: '',
    dialogVisible: false,
    form: { mode: 'create', parentPath: '', originalPath: '', name: '', description: '' },
    totalCount: 0,
    docId: ''
  },

  noop: function () {},
  _loadTimer: null,

  onLoad: function () {},

  onShow: function () {
    var self = this;
    auth.ensureHasKey(function () {
      self._loadData();
    });
  },

  onPullDownRefresh: function () {
    this._loadData();
  },

  _loadData: function () {
    var self = this;
    if (self._loadTimer) { clearTimeout(self._loadTimer); self._loadTimer = null; }
    self.setData({ loading: true, error: '' });

    self._loadTimer = setTimeout(function () {
      self._loadTimer = null;
      if (self.data.loading) {
        self.setData({ loading: false, error: '加载超时，请检查网络后重试' });
        wx.stopPullDownRefresh();
      }
    }, 15000);

    Promise.all([
      store.getCategories(),
      wx.cloud.callFunction({ name: 'categoryCRUD', data: { action: 'countNotes' }, config: { timeout: 30000 } })
    ]).then(function (results) {
      if (self._loadTimer) { clearTimeout(self._loadTimer); self._loadTimer = null; }

      var taxonomy = results[0] || { domains: [] };
      var countResult = (results[1] && results[1].result) || {};
      var noteCounts = countResult.counts || {};

      var domains = taxonomy.domains || [];
      var query = (self.data.searchQuery || '').trim().toLowerCase();
      var totalCount = 0;
      var rows = [];

      function countByPath(path) {
        var count = 0;
        Object.keys(noteCounts).forEach(function (key) {
          if (key === path || key.indexOf(path + '/') === 0) {
            count += noteCounts[key] || 0;
          }
        });
        return count;
      }

      function matchesQuery(row) {
        if (!query) return true;
        return (row.name || '').toLowerCase().indexOf(query) >= 0 ||
          (row.path || '').toLowerCase().indexOf(query) >= 0 ||
          (row.description || '').toLowerCase().indexOf(query) >= 0;
      }

      // 最多显示两级：一级分类 + 二级分类。
      domains.forEach(function (domain) {
        var children = domain.children || domain.subs || [];
        var domainCount = countByPath(domain.path);
        var domainRow = {
          path: domain.path,
          name: domain.name,
          depth: 0,
          hasChildren: children.length > 0,
          expanded: self.data.expandLevel >= 1 || self.data.extraExpanded[domain.path] || !!query,
          childNoteCount: domainCount,
          description: domain.description || ''
        };
        var childRows = [];

        if (domainRow.expanded) {
          children.forEach(function (sub) {
            var subRow = {
              path: sub.path,
              name: sub.name || sub.path.split('/').pop(),
              depth: 1,
              hasChildren: false,
              expanded: false,
              childNoteCount: countByPath(sub.path),
              description: sub.description || ''
            };

            if (matchesQuery(subRow)) childRows.push(subRow);
          });
        }

        if (matchesQuery(domainRow) || childRows.length) {
          totalCount += domainCount;
          rows.push(domainRow);
          Array.prototype.push.apply(rows, childRows);
        }
      });

      self.setData({
        rows: rows,
        totalCount: totalCount,
        loading: false,
        error: ''
      });
      wx.stopPullDownRefresh();
    }).catch(function (err) {
      if (self._loadTimer) { clearTimeout(self._loadTimer); self._loadTimer = null; }
      self.setData({ loading: false, error: '加载分类失败：' + (err.message || '请稍后重试') });
      wx.stopPullDownRefresh();
    });
  },

  onRetry: function () {
    this._loadData();
  },

  onSearch: function (e) {
    var q = (e.detail.value || '').trim();
    this.setData({ searchQuery: q });
    this._loadData();
  },

  toggleExpand: function (e) {
    var path = e.currentTarget.dataset.path;
    var extra = Object.assign({}, this.data.extraExpanded);
    if (extra[path]) {
      delete extra[path];
    } else {
      extra[path] = true;
    }
    this.setData({ extraExpanded: extra });
    this._loadData();
  },

  expandToLevel: function (e) {
    var level = Number(e.currentTarget.dataset.level);
    this.setData({ expandLevel: level, extraExpanded: {} });
    this._loadData();
  },

  expandAll: function () {
    this.setData({ expandLevel: 1, extraExpanded: {} });
    this._loadData();
  },

  onAdd: function () {
    this.setData({
      dialogVisible: true,
      form: { mode: 'create', parentPath: '', originalPath: '', name: '', description: '' }
    });
  },

  onAddChild: function (e) {
    var parentPath = e.currentTarget.dataset.path;
    var depth = Number(e.currentTarget.dataset.depth || 0);
    if (depth > 0 || parentPath.indexOf('/') >= 0) {
      wx.showToast({ title: '最多支持两级分类', icon: 'none' });
      return;
    }
    this.setData({
      dialogVisible: true,
      form: { mode: 'create', parentPath: parentPath, originalPath: '', name: '', description: '' }
    });
  },

  onEdit: function (e) {
    var path = e.currentTarget.dataset.path;
    var parts = path.split('/');
    var parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    this.setData({
      dialogVisible: true,
      form: { mode: 'edit', parentPath: parentPath, originalPath: path, name: parts[parts.length - 1], description: '' }
    });
  },

  onDelete: function (e) {
    var path = e.currentTarget.dataset.path;
    var self = this;
    wx.showModal({
      title: '确认删除',
      content: '确定删除「' + path + '」及其所有子分类？',
      success: function (res) {
        if (!res.confirm) return;
        self._deleteCategory(path);
      }
    });
  },

  _deleteCategory: function (path) {
    var self = this;
    wx.showLoading({ title: '删除中...' });
    wx.cloud.callFunction({
      name: 'categoryCRUD',
      data: { action: 'list' },
      config: { timeout: 10000 }
    }).then(function (res) {
      var catResult = (res && res.result) || {};
      var categories = (catResult.categories || []).filter(function (c) {
        return c.path !== path && c.path.indexOf(path + '/') !== 0;
      });
      return wx.cloud.callFunction({
        name: 'categoryCRUD',
        data: { action: 'save', categories: categories, docId: catResult.docId || '' },
        config: { timeout: 10000 }
      });
    }).then(function () {
      wx.hideLoading();
      store.invalidateCache();
      wx.showToast({ title: '已删除', icon: 'success' });
      self._loadData();
    }).catch(function () {
      wx.hideLoading();
      wx.showToast({ title: '删除失败', icon: 'none' });
    });
  },

  onFormName: function (e) { this.setData({ 'form.name': e.detail.value }); },
  onFormDesc: function (e) { this.setData({ 'form.description': e.detail.value }); },

  onSave: function () {
    var form = this.data.form;
    var name = (form.name || '').trim();
    if (!name) return;

    var fullPath = form.parentPath ? form.parentPath + '/' + name : name;
    var self = this;
    if (form.parentPath && form.parentPath.indexOf('/') >= 0) {
      wx.showToast({ title: '最多支持两级分类', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });
    wx.cloud.callFunction({
      name: 'categoryCRUD',
      data: { action: 'list' },
      config: { timeout: 10000 }
    }).then(function (res) {
      var catResult = (res && res.result) || {};
      var categories = catResult.categories || [];

      if (form.mode === 'edit' && form.originalPath) {
        var oldPath = form.originalPath;
        categories = categories.map(function (c) {
          if (c.path === oldPath) {
            return { id: c.id, path: fullPath, description: form.description || c.description };
          }
          if (c.path.indexOf(oldPath + '/') === 0) {
            return { id: c.id, path: fullPath + c.path.slice(oldPath.length), description: c.description };
          }
          return c;
        });
      } else {
        categories.push({ id: 'cat_' + Date.now(), path: fullPath, description: form.description });
      }

      return wx.cloud.callFunction({
        name: 'categoryCRUD',
        data: { action: 'save', categories: categories, docId: catResult.docId || '' },
        config: { timeout: 10000 }
      });
    }).then(function () {
      wx.hideLoading();
      self.setData({ dialogVisible: false });
      store.invalidateCache();
      wx.showToast({ title: '已保存', icon: 'success' });
      self._loadData();
    }).catch(function () {
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  closeDialog: function () {
    this.setData({ dialogVisible: false });
  }
});
