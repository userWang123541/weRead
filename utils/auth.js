function getFallbackStatus() {
  return { hasKey: false, syncStatus: 'idle', hasData: false, stats: {} };
}

function setLoggedOutStatus() {
  var app = getApp();
  app.globalData.userStatus = getFallbackStatus();
  return app.globalData.userStatus;
}

function fetchStatus() {
  return wx.cloud.callFunction({
    name: 'checkUser',
    data: {},
    config: { timeout: 10000 }
  }).then(function (res) {
    var status = (res && res.result) || getFallbackStatus();
    getApp().globalData.userStatus = status;
    return status;
  }).catch(function () {
    return getFallbackStatus();
  });
}

function ensureHasKey(onReady) {
  return fetchStatus().then(function (status) {
    if (!status.hasKey) {
      wx.reLaunch({ url: '/pages/setup/setup' });
      return false;
    }
    if (typeof onReady === 'function') onReady(status);
    return true;
  });
}

module.exports = {
  ensureHasKey: ensureHasKey,
  fetchStatus: fetchStatus,
  setLoggedOutStatus: setLoggedOutStatus
};
