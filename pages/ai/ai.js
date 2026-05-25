Page({
  data: {
    questions: [
      '我之前读过哪些关于“认知偏差”的内容？',
      '关于时间管理，我做过哪些笔记？',
      '有没有关于亲密关系的划线？',
      '我在哪些书里读到过“自由意志”？',
      '帮我回忆一下关于“习惯养成”的读书笔记'
    ]
  },
  ask: function (event) {
    var question = event.currentTarget.dataset.question;
    wx.showToast({ title: question.slice(0, 10), icon: 'none' });
  }
});
