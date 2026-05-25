var _msgId = 0;
var auth = require('../../utils/auth');

function md2html(md) {
  if (!md) return '';
  var html = md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // headings
    .replace(/^### (.+)$/gm, '<h4 style="font-size:28rpx;font-weight:700;margin:20rpx 0 8rpx;color:#050505;">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="font-size:30rpx;font-weight:700;margin:24rpx 0 10rpx;color:#050505;">$1</h3>')
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // blockquote
    .replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:4rpx solid #d4c5b0;padding:8rpx 20rpx;margin:12rpx 0;color:#6b6560;font-size:26rpx;background:#f8f4ef;border-radius:0 12rpx 12rpx 0;">$1</blockquote>')
    // unordered list
    .replace(/^[*\-] (.+)$/gm, '<div style="padding-left:20rpx;margin:4rpx 0;">• $1</div>')
    // ordered list
    .replace(/^\d+\. (.+)$/gm, function (m, p1, offset, str) {
      return '<div style="padding-left:20rpx;margin:4rpx 0;">' + m.replace(/</g, '&lt;') + '</div>';
    })
    // inline code
    .replace(/`([^`]+)`/g, '<code style="background:#f0e8dd;padding:2rpx 10rpx;border-radius:6rpx;font-size:25rpx;">$1</code>')
    // paragraphs: double newline
    .replace(/\n\n/g, '</p><p style="margin:12rpx 0;line-height:1.7;">')
    // single newline to <br>
    .replace(/\n/g, '<br/>');

  return '<div style="font-size:28rpx;line-height:1.75;color:#2d2a26;">' + html + '</div>';
}

Page({
  data: {
    messages: [],
    inputValue: '',
    sending: false,
    scrollToId: ''
  },

  onShow: function () {
    auth.ensureHasKey();
  },

  onInput: function (e) {
    this.setData({ inputValue: e.detail.value });
  },

  sendMessage: function () {
    var self = this;
    var text = (this.data.inputValue || '').trim();
    if (!text || this.data.sending) return;

    var userMsg = { id: ++_msgId, role: 'user', content: text };
    var loadingMsg = { id: ++_msgId, role: 'assistant', content: '', loading: true, html: '', sources: [] };

    var msgs = this.data.messages.concat([userMsg, loadingMsg]);
    this.setData({
      messages: msgs,
      inputValue: '',
      sending: true,
      scrollToId: 'msg-' + loadingMsg.id
    });

    wx.cloud.callFunction({
      name: 'aiChat',
      data: { question: text },
      config: { timeout: 60000 }
    }).then(function (res) {
      var result = res.result || {};
      var answer = result.answer || result.error || '未能获取回答';
      var sources = result.sources || [];
      var html = md2html(answer);

      var updated = self.data.messages.map(function (m) {
        if (m.id === loadingMsg.id) {
          return { id: m.id, role: 'assistant', content: answer, html: html, sources: sources, loading: false };
        }
        return m;
      });

      self.setData({
        messages: updated,
        sending: false,
        scrollToId: 'chat-bottom'
      });
    }).catch(function (err) {
      var updated = self.data.messages.map(function (m) {
        if (m.id === loadingMsg.id) {
          var errMsg = '请求失败：' + (err.message || '网络错误');
          return { id: m.id, role: 'assistant', content: errMsg, html: md2html(errMsg), sources: [], loading: false };
        }
        return m;
      });
      self.setData({ messages: updated, sending: false });
    });
  }
});
