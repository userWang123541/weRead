var store = require('../../utils/store');

Page({
  data: {
    domains: [],
    filteredDomains: null,
    expandedDomain: -1,
    searchQuery: '',
    loading: true
  },

  onLoad: function () {
    var that = this;
    store.getCategories().then(function (taxonomy) {
      var domains = (taxonomy.domains || []).map(function (d) {
        return {
          name: d.name,
          count: d.count,
          subs: d.subs || []
        };
      });
      that.setData({ domains: domains, loading: false });
    }).catch(function () {
      that.setData({ loading: false });
    });
  },

  toggleDomain: function (e) {
    var index = Number(e.currentTarget.dataset.index);
    if (this.data.expandedDomain === index) {
      this.setData({ expandedDomain: -1 });
    } else {
      this.setData({ expandedDomain: index });
    }
  },

  onSearch: function (e) {
    var query = (e.detail.value || '').trim().toLowerCase();
    this.setData({ searchQuery: query });

    if (!query) {
      this.setData({ filteredDomains: null, expandedDomain: -1 });
      return;
    }

    var domains = this.data.domains;
    var filtered = [];

    for (var i = 0; i < domains.length; i++) {
      var d = domains[i];
      var domainMatch = d.name.toLowerCase().indexOf(query) >= 0;
      var matchedSubs = [];

      for (var j = 0; j < d.subs.length; j++) {
        var sub = d.subs[j];
        if (domainMatch || sub.name.toLowerCase().indexOf(query) >= 0 ||
            (sub.description && sub.description.toLowerCase().indexOf(query) >= 0)) {
          matchedSubs.push(sub);
        }
      }

      if (domainMatch || matchedSubs.length > 0) {
        filtered.push({
          name: d.name,
          count: d.count,
          subs: domainMatch ? d.subs : matchedSubs,
          matchedCount: matchedSubs.length
        });
      }
    }

    this.setData({ filteredDomains: filtered, expandedDomain: filtered.length > 0 ? 0 : -1 });
  },

  tapCategory: function (e) {
    var id = e.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({ url: '/pages/notes/notes?category=' + id });
    }
  },

  back: function () {
    wx.navigateBack();
  }
});
