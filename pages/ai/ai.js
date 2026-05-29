var _msgId = 0;
var auth = require('../../utils/auth');

function md2html(md) {
  if (!md) return '';
  // First encode HTML entities in the raw text
  var safe = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Block-level patterns first (before inline)
  // headings
  safe = safe
    .replace(/^#{1} (.+)$/gm, '<h2 style="font-size:32rpx;font-weight:700;margin:28rpx 0 12rpx;color:#050505;">$1</h2>')
    .replace(/^#{2} (.+)$/gm, '<h3 style="font-size:30rpx;font-weight:700;margin:24rpx 0 10rpx;color:#050505;">$1</h3>')
    .replace(/^#{3} (.+)$/gm, '<h4 style="font-size:28rpx;font-weight:700;margin:20rpx 0 8rpx;color:#050505;">$1</h4>');

  // Horizontal rule
  safe = safe.replace(/^---$/gm, '<hr style="border:none;border-top:1rpx solid #e0d8ce;margin:20rpx 0;"/>');

  // Blockquote
  safe = safe.replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:4rpx solid #d4c5b0;padding:8rpx 20rpx;margin:12rpx 0;color:#6b6560;font-size:26rpx;background:#f8f4ef;border-radius:0 12rpx 12rpx 0;">$1</blockquote>');

  // Unordered list items
  safe = safe.replace(/^[\*\-] (.+)$/gm, '<div style="padding-left:20rpx;margin:4rpx 0;">• $1</div>');

  // Ordered list items
  safe = safe.replace(/^\d+\. (.+)$/gm, '<div style="padding-left:20rpx;margin:4rpx 0;">$1</div>');

  // Inline patterns
  // Bold
  safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  safe = safe.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  safe = safe.replace(/`([^`]+)`/g, '<code style="background:#f0e8dd;padding:2rpx 10rpx;border-radius:6rpx;font-size:25rpx;">$1</code>');

  // Split into paragraphs by double newlines
  var blocks = safe.split(/\n\n+/);
  var html = '';
  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i].trim();
    if (!block) continue;
    // If block already starts with an HTML block element, don't wrap in <p>
    if (/^<(h[2-4]|hr|blockquote|div|ul|ol)/.test(block)) {
      html += block;
    } else {
      // Replace single newlines with <br/> within the block
      block = block.replace(/\n/g, '<br/>');
      html += '<p style="margin:12rpx 0;line-height:1.7;">' + block + '</p>';
    }
  }

  return '<div style="font-size:28rpx;line-height:1.75;color:#2d2a26;">' + html + '</div>';
}

var STARTER_QUESTIONS = [
  '我最近在读什么书？',
  '关于时间管理，我记了哪些笔记？',
  '帮我总结一下我的阅读偏好',
  '我有哪些关于心理学的划线？'
];

Page({
  data: {
    messages: [],
    inputValue: '',
    sending: false,
    scrollToId: '',
    starterQuestions: STARTER_QUESTIONS
  },

  onShow: function () {
    auth.ensureHasKey();
  },

  onInput: function (e) {
    this.setData({ inputValue: e.detail.value });
  },

  askQuestion: function (e) {
    var question = e.currentTarget.dataset.question;
    this.setData({ inputValue: question });
    this.sendMessage();
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
  },

  copyMessage: function (e) {
    var content = e.currentTarget.dataset.content || '';
    wx.setClipboardData({
      data: content,
      success: function () {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  }
});
