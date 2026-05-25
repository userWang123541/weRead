const crypto = require('crypto');

const STOP_WORDS = new Set([
  '一个', '一种', '一些', '这个', '那个', '这些', '那些', '自己', '我们', '他们', '你们',
  '因为', '所以', '但是', '如果', '虽然', '可以', '不是', '没有', '什么', '时候',
  '进行', '通过', '对于', '以及', '就是', '还是', '已经', '可能', '应该', '需要',
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'your', 'their',
]);

const TAG_RULES = [
  {
    tag: '读书方法/资料管理/分类法',
    keywords: ['分类', '资料', '夹子', '标签', '目录', '索引', '归档', '整理', '卡片', '资料库'],
  },
  {
    tag: '读书方法/记忆/长期记忆',
    keywords: ['记忆', '忘掉', '记住', '训练', '标题', '复习', '回忆', '背诵'],
  },
  {
    tag: '写作方法/素材调用/观点生成',
    keywords: ['写作', '文章', '小说', '发表', '素材', '观点', '评论', '新闻', '选题'],
  },
  {
    tag: '知识管理/检索/复用',
    keywords: ['检索', '搜索', '调用', '复用', '系统', '数据库', '知识库', '挂钩', '召回'],
  },
  {
    tag: '个人成长/行动/自我驱动',
    keywords: ['成长', '行动', '自律', '拖延', '目标', '改变', '努力', '习惯', '选择'],
  },
  {
    tag: '心理认知/判断/偏见',
    keywords: ['心理', '认知', '判断', '偏见', '情绪', '恐惧', '焦虑', '欲望', '动机'],
  },
  {
    tag: '社会观察/制度/权力',
    keywords: ['社会', '制度', '权力', '政治', '国家', '法律', '阶层', '组织', '治理'],
  },
  {
    tag: '商业管理/战略/组织',
    keywords: ['商业', '公司', '管理', '战略', '组织', '产品', '市场', '客户', '竞争'],
  },
  {
    tag: '经济金融/投资/周期',
    keywords: ['经济', '金融', '投资', '股票', '货币', '债务', '周期', '通胀', '资产'],
  },
  {
    tag: '技术工具/AI/自动化',
    keywords: ['AI', '人工智能', '模型', '算法', '自动化', '工具', '数据', '编程', '软件'],
  },
  {
    tag: '历史人物/传记/经验',
    keywords: ['历史', '人物', '传记', '皇帝', '战争', '时代', '经验', '事件'],
  },
  {
    tag: '宗教思想/组织/伦理',
    keywords: ['宗教', '佛教', '道教', '天主教', '基督教', '神父', '修女', '伦理', '信仰'],
  },
  {
    tag: '关系生活/家庭/沟通',
    keywords: ['家庭', '婚姻', '亲密', '朋友', '沟通', '关系', '父母', '孩子', '生活'],
  },
];

function stableId(parts) {
  return crypto
    .createHash('sha1')
    .update(parts.filter(Boolean).join('|'))
    .digest('hex')
    .slice(0, 16);
}

function compactText(value, length = 140) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function getBookCategory(book) {
  const categories = book?.categories || [];
  if (categories[0]?.title) return categories[0].title;
  if (book?.category) return book.category;
  return '';
}

function tokenize(text) {
  return String(text || '')
    .match(/[一-龥]{2,6}|[A-Za-z][A-Za-z0-9_-]{2,}/g) || [];
}

function extractKeywords(text, limit = 8) {
  const freq = new Map();
  for (const raw of tokenize(text)) {
    const token = raw.trim();
    if (token.length < 2 || STOP_WORDS.has(token)) continue;
    freq.set(token, (freq.get(token) || 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'))
    .slice(0, limit)
    .map(([word]) => word);
}

function classifyCard(card) {
  const haystack = [
    card.quote,
    card.note,
    card.bookTitle,
    card.author,
    card.chapterTitle,
    card.bookCategory,
  ].join('\n');

  const tags = [];
  for (const rule of TAG_RULES) {
    if (rule.keywords.some(keyword => haystack.includes(keyword))) {
      tags.push(rule.tag);
    }
  }

  if (card.bookCategory) {
    tags.push(`微信读书分类/${card.bookCategory}`);
  }

  if (!tags.length) {
    tags.push('待分类/未归档');
  }

  return [...new Set(tags)];
}

function chapterMapFor(bookEntry) {
  const map = new Map();
  for (const chapter of bookEntry.chapters || []) {
    map.set(String(chapter.chapterUid), chapter.title || '');
  }
  return map;
}

function reviewKey(review) {
  return `${review.chapterUid || ''}|${review.range || ''}`;
}

function highlightKey(highlight) {
  return `${highlight.chapterUid || ''}|${highlight.range || ''}`;
}

function buildCardBase(bookEntry, chapterMap, source) {
  const book = bookEntry.book || {};
  return {
    source: 'weread',
    type: source.type,
    bookId: bookEntry.bookId || book.bookId || source.bookId || '',
    bookTitle: book.title || '',
    author: book.author || '',
    bookCategory: getBookCategory(book),
    chapterUid: source.chapterUid || '',
    chapterIdx: source.chapterIdx,
    chapterTitle: source.chapterName || chapterMap.get(String(source.chapterUid || '')) || '',
    range: source.range || '',
    createTime: source.createTime || 0,
    openUrl: buildOpenUrl(bookEntry.bookId || book.bookId || source.bookId, source.chapterUid, source.range),
  };
}

function buildOpenUrl(bookId, chapterUid, range) {
  if (!bookId) return '';
  let url = `weread://reading?bId=${bookId}`;
  if (chapterUid) url += `&chapterUid=${chapterUid}`;
  if (range) {
    const [rangeStart, rangeEnd] = String(range).split('-');
    if (rangeStart && rangeEnd) {
      url = `weread://bestbookmark?bookId=${bookId}&chapterUid=${chapterUid || ''}&rangeStart=${rangeStart}&rangeEnd=${rangeEnd}`;
    }
  }
  return url;
}

function finalizeCard(card) {
  const sourceKey = [
    card.type,
    card.bookId,
    card.chapterUid,
    card.range,
    card.reviewId,
    card.quote,
    card.note,
  ];
  card.cardId = `card_${stableId(sourceKey)}`;
  card.text = [card.quote, card.note].filter(Boolean).join('\n');
  card.summary = compactText(card.note || card.quote, 110);
  card.keywords = extractKeywords(card.text);
  card.tags = classifyCard(card);
  return card;
}

function buildCards(rawData) {
  const cards = [];

  for (const bookEntry of rawData?.books || []) {
    const chapterMap = chapterMapFor(bookEntry);
    const reviews = bookEntry.reviews || [];
    const reviewsByHighlight = new Map();
    const consumedReviews = new Set();

    reviews.forEach((review, index) => {
      const key = reviewKey(review);
      if (!review.range) return;
      if (!reviewsByHighlight.has(key)) reviewsByHighlight.set(key, []);
      reviewsByHighlight.get(key).push({ review, index });
    });

    for (const highlight of bookEntry.highlights || []) {
      const linkedReviews = reviewsByHighlight.get(highlightKey(highlight)) || [];
      linkedReviews.forEach(({ index }) => consumedReviews.add(index));

      const card = finalizeCard({
        ...buildCardBase(bookEntry, chapterMap, { ...highlight, type: linkedReviews.length ? 'linked' : 'highlight' }),
        quote: highlight.markText || '',
        note: linkedReviews.map(({ review }) => review.content).filter(Boolean).join('\n'),
        reviewIds: linkedReviews.map(({ review }) => review.reviewId).filter(Boolean),
        highlightId: highlight.bookmarkId,
      });

      if (card.quote || card.note) cards.push(card);
    }

    reviews.forEach((review, index) => {
      if (consumedReviews.has(index)) return;

      const quote = review.abstract || review.contextAbstract || '';
      const card = finalizeCard({
        ...buildCardBase(bookEntry, chapterMap, { ...review, type: 'review' }),
        quote,
        note: review.content || review.htmlContent || '',
        reviewId: review.reviewId,
        star: review.star,
      });

      if (card.quote || card.note) cards.push(card);
    });
  }

  cards.sort((a, b) => (b.createTime || 0) - (a.createTime || 0));

  return {
    generatedAt: new Date().toISOString(),
    sourceFetchedAt: rawData?.fetchedAt || '',
    totalCards: cards.length,
    cards,
    taxonomy: buildTaxonomy(cards),
  };
}

function buildTaxonomy(cards) {
  const map = new Map();
  for (const card of cards) {
    for (const tag of card.tags || []) {
      if (!map.has(tag)) {
        map.set(tag, { tag, count: 0, books: new Set() });
      }
      const entry = map.get(tag);
      entry.count += 1;
      if (card.bookTitle) entry.books.add(card.bookTitle);
    }
  }

  return [...map.values()]
    .map(entry => ({
      tag: entry.tag,
      count: entry.count,
      bookCount: entry.books.size,
      depth: entry.tag.split('/').length,
    }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh'));
}

function rankCards(cards, query, options = {}) {
  const q = String(query || '').trim();
  const terms = extractKeywords(q, 12);
  const queryLower = q.toLowerCase();
  const selectedTags = new Set(options.tags || []);

  return cards
    .map(card => {
      const haystack = [
        card.bookTitle,
        card.author,
        card.chapterTitle,
        card.quote,
        card.note,
        ...(card.tags || []),
        ...(card.keywords || []),
      ].join('\n');
      const lower = haystack.toLowerCase();
      let score = 0;

      if (q && lower.includes(queryLower)) score += 12;
      for (const term of terms) {
        if (haystack.includes(term)) score += 4;
      }
      for (const tag of card.tags || []) {
        if (q && tag.includes(q)) score += 8;
        if (selectedTags.has(tag)) score += 10;
      }
      if (card.type === 'linked') score += 2;
      if (card.note) score += 1;
      if (card.createTime) score += Math.min(1, card.createTime / 2000000000);

      return { ...card, score };
    })
    .filter(card => card.score > 0 || !q)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit || 24);
}

function buildMaterialPack(cards, query, options = {}) {
  const ranked = rankCards(cards, query, options);
  const quoteCards = ranked.filter(card => card.quote).slice(0, 8);
  const noteCards = ranked.filter(card => card.note).slice(0, 8);
  const tagCounts = new Map();

  ranked.forEach(card => {
    (card.tags || []).forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
  });

  const focusTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag]) => tag);

  return {
    query,
    generatedAt: new Date().toISOString(),
    totalMatched: ranked.length,
    focusTags,
    quotes: quoteCards.map(card => ({
      cardId: card.cardId,
      quote: card.quote,
      bookTitle: card.bookTitle,
      author: card.author,
      chapterTitle: card.chapterTitle,
      openUrl: card.openUrl,
    })),
    notes: noteCards.map(card => ({
      cardId: card.cardId,
      note: card.note,
      quote: card.quote,
      bookTitle: card.bookTitle,
      tags: card.tags,
    })),
    outline: [
      `从“${query || '当前主题'}”切入，先给出一个明确判断。`,
      '引用 2-3 条原文作为证据，不要只写感想。',
      '把不同书里的相似材料合并，形成一个可复用观点。',
      '最后补一个现实场景：新闻评论、项目复盘、公众号文章或个人决策。',
    ],
    cards: ranked,
  };
}

module.exports = {
  buildCards,
  buildMaterialPack,
  buildTaxonomy,
  rankCards,
};
