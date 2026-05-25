Page({
  data: {
    tabs: ['舒适区延展', '认知破圈', '盲区补全'],
    books: [
      { rank: '01', title: '人类简史', author: '尤瓦尔·赫拉利', tag: '历史视角', palette: 'blue' },
      { rank: '02', title: '乡土中国', author: '费孝通', tag: '社会学', palette: 'orange' },
      { rank: '03', title: '枪炮、病菌与钢铁', author: '贾雷德·戴蒙德', tag: '全球视野', palette: 'dark' },
      { rank: '04', title: '被讨厌的勇气', author: '岸见一郎', tag: '心理学', palette: 'blue' }
    ]
  },
  back() {
    wx.navigateBack();
  }
});
