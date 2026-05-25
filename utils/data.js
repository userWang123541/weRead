const stats = {
  books: 96,
  notes: 292,
  highlights: 2401,
  readingDays: 259,
  readingHours: 187,
  dailyTime: '23:41',
  score: 68
};

const books = [
  { id: 'influence', title: '影响力（全新升级版）', author: '罗伯特·西奥迪尼', progress: 68, notes: 12, palette: 'dark', readTime: '6h 32m', lastRead: '昨天 22:15' },
  { id: 'time-friend', title: '把时间当作朋友', author: '李笑来', progress: 55, notes: 36, palette: 'orange', readTime: '8h 10m', lastRead: '05/21 17:21' },
  { id: 'thinking', title: '思考，快与慢', author: '丹尼尔·卡尼曼', progress: 45, notes: 24, palette: '', readTime: '4h 28m', lastRead: '05/21 17:20' },
  { id: 'atomic', title: '原子习惯', author: '詹姆斯·克利尔', progress: 42, notes: 18, palette: 'orange', readTime: '5h 06m', lastRead: '05/19 21:30' },
  { id: 'sapiens', title: '人类简史', author: '尤瓦尔·赫拉利', progress: 31, notes: 24, palette: 'blue', readTime: '3h 42m', lastRead: '05/18 08:22' },
  { id: 'cognitive', title: '认知觉醒', author: '周岭', progress: 37, notes: 21, palette: 'blue', readTime: '4h 01m', lastRead: '05/17 23:10' }
];

const notes = [
  {
    id: 'n1',
    bookId: 'influence',
    book: '影响力（全新升级版）',
    title: '人们并不总是理性地做决定，他们往往受到环境和他人的影响。',
    body: '很多时候我们以为是自己选择的，其实是被设计好的场景影响了。',
    tags: ['认知偏差', '社会心理'],
    comments: 12,
    likes: 32
  },
  {
    id: 'n2',
    bookId: 'time-friend',
    book: '把时间当作朋友（第3版）',
    title: '一定要尽量给出时间详细地图，答案来自你一遍遍确认过的事实。',
    body: '真正的解决方案不是凭感觉，而是把过程和结果都记录下来。',
    tags: ['时间管理', '方法论'],
    comments: 8,
    likes: 21
  },
  {
    id: 'n3',
    bookId: 'thinking',
    book: '思考，快与慢',
    title: '快系统给出直觉，慢系统负责校准。',
    body: '读到这里时我意识到，很多所谓效率问题其实是判断问题。',
    tags: ['心理认知'],
    comments: 5,
    likes: 18
  }
];

const categories = [
  { name: '个人成长', count: 38 },
  { name: '时间管理', count: 28 },
  { name: '心理认知', count: 24 },
  { name: '历史传记', count: 18 },
  { name: '社会文化', count: 16 },
  { name: '商业经济', count: 14 },
  { name: '文学小说', count: 12 },
  { name: '科学技术', count: 10 }
];

const reports = [
  { id: 'persona', title: '阅读人格', subtitle: '系统建筑师 INTJ', score: 88 },
  { id: 'overview', title: '阅读数据总览', subtitle: '年度 2024 全部', score: 96 },
  { id: 'cognitive', title: '认知茧房指数', subtitle: '中等偏窄 68/100', score: 68 },
  { id: 'breakout', title: '破圈书单推荐', subtitle: '舒适区延展、认知破圈、盲区补全', score: 91 }
];

const timeline = [
  { date: '05/12', action: '阅读到第3章', tag: '社会认同的力量' },
  { date: '05/15', action: '划线2条', tag: '' },
  { date: '05/18', action: '写下想法1条', tag: '' }
];

const questions = [
  '我最近为什么总读社会学？',
  '我的阅读质量提升了什么维度？',
  '我最快失效的知识结构是什么？',
  '我是不是陷入认知茧房？',
  '脚本书跟改变实践？'
];

function getBook(id) {
  return books.find(item => item.id === id) || books[0];
}

function bookNotes(id) {
  return notes.filter(item => item.bookId === id);
}

module.exports = {
  stats,
  books,
  notes,
  categories,
  reports,
  timeline,
  questions,
  getBook,
  bookNotes
};
