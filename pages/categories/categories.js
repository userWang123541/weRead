var store = require('../../utils/store');
var auth = require('../../utils/auth');

Page({
  data: {
    categories: [],
    docId: '',
    noteCounts: {},
    rows: [],
    searchQuery: '',
    expandLevel: 1,
    extraExpanded: {},
    loading: true,
    dialogVisible: false,
    form: { mode: 'create', parentPath: '', originalPath: '', name: '', description: '' }
  },

  onLoad: function () {
  },

  onShow: function () {
    var self = this;
    auth.ensureHasKey(function () {
      self._loadData();
    });
  },

  _loadData: function () {
    var self = this;
    self.setData({ loading: true });
    Promise.all([
      wx.cloud.callFunction({ name: 'categoryCRUD', data: { action: 'list' } }),
      wx.cloud.callFunction({ name: 'categoryCRUD', data: { action: 'countNotes' } })
    ]).then(function (results) {
      var catResult = (results[0] && results[0].result) || {};
      var countResult = (results[1] && results[1].result) || {};
      var categories = catResult.categories || [];
      var docId = catResult.docId || '';
      var noteCounts = countResult.counts || {};

      // 递归计算子级笔记总数
      var tree = self._buildTree(categories, noteCounts);
      var rows = self._flatten(tree, self.data.expandLevel, self.data.extraExpanded, self.data.searchQuery);
      self.setData({ categories: categories, docId: docId, noteCounts: noteCounts, rows: rows, loading: false });
    }).catch(function () {
      self.setData({ loading: false });
    });
  },

  _buildTree: function (categories, noteCounts) {
    var nodeMap = {};
    var roots = [];

    categories.forEach(function (cat) {
      var parts = cat.path.split('/');
      nodeMap[cat.path] = {
        id: cat.id, path: cat.path, name: parts[parts.length - 1],
        description: cat.description || '', depth: parts.length - 1,
        children: [], noteCount: noteCounts[cat.path] || 0, childNoteCount: 0, hasChildren: false
      };
    });

    categories.forEach(function (cat) {
      var node = nodeMap[cat.path];
      var parts = cat.path.split('/');
      if (parts.length === 1) {
        roots.push(node);
      } else {
        var parentPath = parts.slice(0, -1).join('/');
        var parent = nodeMap[parentPath];
        if (!parent) {
          parent = { id: 'auto_' + parentPath, path: parentPath, name: parts[parts.length - 2], description: '', depth: parts.length - 2, children: [], noteCount: 0, childNoteCount: 0, hasChildren: false };
          nodeMap[parentPath] = parent;
          if (parent.depth === 0) roots.push(parent);
          else {
            var grandPath = parts.slice(0, -2).join('/');
            var grand = nodeMap[grandPath];
            if (!grand) {
              grand = { id: 'auto_' + grandPath, path: grandPath, name: parts[parts.length - 3], description: '', depth: 0, children: [], noteCount: 0, childNoteCount: 0, hasChildren: false };
              nodeMap[grandPath] = grand;
              roots.push(grand);
            }
            grand.children.push(parent);
          }
        }
        parent.children.push(node);
      }
    });

    function enrich(node) {
      var total = node.noteCount;
      node.children.sort(function (a, b) { return a.path.localeCompare(b.path, 'zh'); });
      node.children.forEach(function (child) { enrich(child); total += child.childNoteCount; });
      node.childNoteCount = total;
      node.hasChildren = node.children.length > 0;
    }
    roots.sort(function (a, b) { return a.path.localeCompare(b.path, 'zh'); });
    roots.forEach(enrich);
    return roots;
  },

  _flatten: function (nodes, expandLevel, extraExpanded, query) {
    var self = this;
    var result = [];

    function shouldShow(node) {
      if (!query) return true;
      var q = query.toLowerCase();
      if (node.name.toLowerCase().indexOf(q) >= 0) return true;
      if (node.path.toLowerCase().indexOf(q) >= 0) return true;
      if ((node.description || '').toLowerCase().indexOf(q) >= 0) return true;
      return node.children.some(function (c) { return shouldShow(c); });
    }

    function walk(list) {
      list.forEach(function (node) {
        if (!shouldShow(node)) return;
        var expanded = node.depth < expandLevel || !!extraExpanded[node.path];
        result.push({
          path: node.path, name: node.name, description: node.description,
          depth: node.depth, hasChildren: node.hasChildren,
          childNoteCount: node.childNoteCount, expanded: expanded
        });
        if (node.hasChildren && expanded) walk(node.children);
      });
    }
    walk(nodes);
    return result;
  },

  toggleExpand: function (e) {
    var path = e.currentTarget.dataset.path;
    var row = null;
    for (var i = 0; i < this.data.rows.length; i++) {
      if (this.data.rows[i].path === path) { row = this.data.rows[i]; break; }
    }
    if (!row || !row.hasChildren) return;

    var extra = Object.assign({}, this.data.extraExpanded);
    if (row.expanded && this.data.expandLevel > row.depth) {
      // 在 expandLevel 控制下的展开，切换为手动收起
      extra[path] = false;
    } else if (extra[path] === false || (extra[path] === undefined && !row.expanded)) {
      extra[path] = true;
    } else {
      delete extra[path];
    }

    var tree = this._buildTree(this.data.categories, this.data.noteCounts);
    var rows = this._flatten(tree, this.data.expandLevel, extra, this.data.searchQuery);
    this.setData({ extraExpanded: extra, rows: rows });
  },

  expandToLevel: function (e) {
    var level = Number(e.currentTarget.dataset.level);
    var tree = this._buildTree(this.data.categories, this.data.noteCounts);
    var rows = this._flatten(tree, level, {}, this.data.searchQuery);
    this.setData({ expandLevel: level, extraExpanded: {}, rows: rows });
  },

  expandAll: function () {
    var tree = this._buildTree(this.data.categories, this.data.noteCounts);
    var rows = this._flatten(tree, 2, {}, this.data.searchQuery);
    this.setData({ expandLevel: 2, extraExpanded: {}, rows: rows });
  },

  onSearch: function (e) {
    var q = (e.detail.value || '').trim();
    var tree = this._buildTree(this.data.categories, this.data.noteCounts);
    var rows = this._flatten(tree, this.data.expandLevel, this.data.extraExpanded, q);
    this.setData({ searchQuery: q, rows: rows });
  },

  onAdd: function () {
    this.setData({
      dialogVisible: true,
      form: { mode: 'create', parentPath: '', originalPath: '', name: '', description: '' }
    });
  },

  onAddChild: function (e) {
    var parentPath = e.currentTarget.dataset.path;
    this.setData({
      dialogVisible: true,
      form: { mode: 'create', parentPath: parentPath, originalPath: '', name: '', description: '' }
    });
  },

  onEdit: function (e) {
    var path = e.currentTarget.dataset.path;
    var cat = null;
    for (var i = 0; i < this.data.categories.length; i++) {
      if (this.data.categories[i].path === path) { cat = this.data.categories[i]; break; }
    }
    if (!cat) return;
    var parts = path.split('/');
    var parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    this.setData({
      dialogVisible: true,
      form: { mode: 'edit', parentPath: parentPath, originalPath: path, name: parts[parts.length - 1], description: cat.description || '' }
    });
  },

  onDelete: function (e) {
    var path = e.currentTarget.dataset.path;
    var self = this;
    wx.showModal({
      title: '确认删除',
      content: '确定删除「' + path + '」及其所有子分类？已分类的笔记不会自动改动。',
      success: function (res) {
        if (!res.confirm) return;
        var categories = self.data.categories.filter(function (c) {
          return c.path !== path && c.path.indexOf(path + '/') !== 0;
        });
        self._saveCategories(categories);
      }
    });
  },

  onFormName: function (e) { this.setData({ 'form.name': e.detail.value }); },
  onFormDesc: function (e) { this.setData({ 'form.description': e.detail.value }); },

  onSave: function () {
    var form = this.data.form;
    var name = (form.name || '').trim();
    if (!name) return;

    var fullPath = form.parentPath ? form.parentPath + '/' + name : name;
    var categories = this.data.categories.slice();

    if (form.mode === 'edit' && form.originalPath) {
      // 编辑：更新该节点及其子节点的 path
      var oldPath = form.originalPath;
      categories = categories.map(function (c) {
        if (c.path === oldPath) {
          return { id: c.id, path: fullPath, description: form.description };
        }
        if (c.path.indexOf(oldPath + '/') === 0) {
          return { id: c.id, path: fullPath + c.path.slice(oldPath.length), description: c.description };
        }
        return c;
      });
    } else {
      // 新增
      categories.push({ id: 'cat_' + Date.now(), path: fullPath, description: form.description });
    }

    this.setData({ dialogVisible: false });
    this._saveCategories(categories);
  },

  closeDialog: function () {
    this.setData({ dialogVisible: false });
  },

  _saveCategories: function (categories) {
    var self = this;
    wx.showLoading({ title: '保存中...' });
    wx.cloud.callFunction({
      name: 'categoryCRUD',
      data: { action: 'save', categories: categories, docId: self.data.docId }
    }).then(function () {
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
      self._loadData();
      store.invalidateCache();
    }).catch(function (err) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  }
});
