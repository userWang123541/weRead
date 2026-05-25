const { questions } = require('../../utils/data');

Page({
  data: { questions },
  ask(event) {
    const question = event.currentTarget.dataset.question;
    wx.showToast({ title: question.slice(0, 8), icon: 'none' });
  }
});
