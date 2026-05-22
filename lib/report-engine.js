const path = require('path');
const fs = require('fs');
const { readJsonIfExists, writeJson } = require('./weread-service');
const {
  buildPersonaPrompt,
  buildMbtiPrompt,
  buildCocoonPrompt,
  buildBreakoutPrompt,
} = require('./report-prompts');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RAW_DATA_FILE = path.join(DATA_DIR, 'weread-data.json');
const CARDS_FILE = path.join(DATA_DIR, 'cards.json');
const CLASSIFIED_FILE = path.join(DATA_DIR, 'classified.json');
const TAXONOMY_FILE = path.join(__dirname, '..', 'config', 'taxonomy.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');

const DEFAULT_BASE_URL = 'https://api.siliconflow.cn/v1';
const DEFAULT_CHAT_MODEL = 'Qwen/Qwen2.5-72B-Instruct';

// ── LLM 配置 ──

function getChatConfig() {
  return {
    baseUrl: (process.env.LLM_CHAT_BASE_URL || process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    apiKey: process.env.LLM_CHAT_API_KEY || process.env.LLM_API_KEY || '',
    chatModel: process.env.LLM_CHAT_MODEL || DEFAULT_CHAT_MODEL,
  };
}

// ── LLM 调用 ──

async function chatCompletion(systemPrompt, userPrompt, { json = true } = {}) {
  const config = getChatConfig();
  if (!config.apiKey) {
    throw Object.assign(new Error('请先配置 LLM_CHAT_API_KEY 环境变量'), { statusCode: 400 });
  }

  const OpenAI = require('openai');
  const client = new OpenAI({ baseURL: config.baseUrl, apiKey: config.apiKey });

  const response = await client.chat.completions.create({
    model: config.chatModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 8000,
  });

  const content = response.choices?.[0]?.message?.content || '';
  if (!json) return content;

  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw Object.assign(new Error('LLM 返回格式异常，请重试'), { statusCode: 502 });
  }
}

// ── 数据加载 ──

async function loadAllData() {
  const [raw, cardsData, classified, taxonomy] = await Promise.all([
    readJsonIfExists(RAW_DATA_FILE, { fetchedAt: '', totalBooks: 0, books: [] }),
    readJsonIfExists(CARDS_FILE, { cards: [], taxonomy: [] }),
    readJsonIfExists(CLASSIFIED_FILE, { notes: [], stats: {} }),
    readJsonIfExists(TAXONOMY_FILE, { categories: [] }),
  ]);
  return { raw, cardsData, classified, taxonomy };
}

function computeDataHash(raw, cardsData, classified) {
  return `${raw.fetchedAt || ''}_${cardsData.cards?.length || 0}_${classified.notes?.length || 0}`;
}

// ── 数据上下文构建 ──

function buildDataContext(raw, cardsData, classified, taxonomy) {
  const books = raw.books || [];
  const cards = cardsData.cards || [];
  const notes = classified.notes || [];

  // 基础统计
  const totalBooks = books.length;
  const totalHighlights = books.reduce((s, b) => s + (b.highlights?.length || 0), 0);
  const totalReviews = books.reduce((s, b) => s + (b.reviews?.length || 0), 0);
  const completedBooks = books.filter(b => (b.readingProgress || 0) >= 90).length;
  const completionRate = totalBooks ? Math.round(completedBooks / totalBooks * 100) : 0;
  const avgNotesPerBook = totalBooks ? Math.round(cards.length / totalBooks * 10) / 10 : 0;
  const highlightToReviewRatio = totalReviews ? Math.round(totalHighlights / totalReviews * 10) / 10 : totalHighlights;

  // 活跃天数
  const activeDates = new Set();
  books.forEach(book => {
    (book.highlights || []).forEach(h => {
      if (h.createTime) {
        const d = new Date(h.createTime * 1000);
        activeDates.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      }
    });
  });

  // 分类分布
  const catMap = new Map();
  notes.forEach(n => {
    if (n.category && n.category !== '未分类') {
      const topDomain = n.category.split('/')[0];
      catMap.set(topDomain, (catMap.get(topDomain) || 0) + 1);
    }
  });
  const totalClassified = [...catMap.values()].reduce((s, c) => s + c, 0) || 1;
  const categoryDistribution = [...catMap.entries()]
    .map(([category, count]) => ({ category, count, percentage: Math.round(count / totalClassified * 100) }))
    .sort((a, b) => b.count - a.count);

  // Top books
  const bookMap = new Map();
  cards.forEach(c => {
    const key = c.bookTitle;
    if (!key) return;
    if (!bookMap.has(key)) bookMap.set(key, { title: key, author: c.author || '', highlightCount: 0, reviewCount: 0 });
    const entry = bookMap.get(key);
    if (c.type === 'review') entry.reviewCount++;
    else entry.highlightCount++;
  });
  const topBooks = [...bookMap.values()]
    .sort((a, b) => (b.highlightCount + b.reviewCount) - (a.highlightCount + a.reviewCount));

  // 虚构/非虚构
  const fictionDomains = new Set(['文学小说', '写作创作']);
  let fictionCount = 0, nonFictionCount = 0;
  categoryDistribution.forEach(c => {
    if (fictionDomains.has(c.category)) fictionCount += c.count;
    else nonFictionCount += c.count;
  });
  const totalFnf = fictionCount + nonFictionCount || 1;

  // 代表性笔记
  const reviewNotes = cards.filter(c => c.type === 'review' && c.note).slice(0, 15);
  const highlightNotes = cards.filter(c => c.type === 'highlight' && c.quote).slice(0, 15);
  const sampleNotes = [...reviewNotes, ...highlightNotes].map(c => ({
    text: c.note || c.quote || '',
    bookTitle: c.bookTitle || '',
    category: (notes.find(n => n.bookId === c.bookId)?.category) || '',
    type: c.type,
  }));

  // 活跃时段
  const hourMap = new Array(24).fill(0);
  books.forEach(book => {
    (book.highlights || []).forEach(h => {
      if (h.createTime) hourMap[new Date(h.createTime * 1000).getHours()]++;
    });
  });
  const peakHour = hourMap.indexOf(Math.max(...hourMap));

  return {
    stats: {
      totalBooks,
      totalHighlights,
      totalReviews,
      totalCards: cards.length,
      completionRate,
      avgNotesPerBook,
      highlightToReviewRatio,
      activeDays: activeDates.size,
      peakHour,
    },
    categoryDistribution,
    topBooks: topBooks.slice(0, 10),
    sampleNotes,
    readingPatterns: {
      fictionPercent: Math.round(fictionCount / totalFnf * 100),
      nonFictionPercent: Math.round(nonFictionCount / totalFnf * 100),
      topDomains: categoryDistribution.slice(0, 5).map(c => c.category),
    },
  };
}

// ── 缓存 ──

async function readCache() {
  return readJsonIfExists(REPORTS_FILE, { generatedAt: '', reports: {} });
}

async function writeCacheEntry(reportId, content, dataHash) {
  const cache = await readCache();
  cache.generatedAt = new Date().toISOString();
  cache.reports[reportId] = {
    generatedAt: new Date().toISOString(),
    dataHash,
    content,
  };
  await writeJson(REPORTS_FILE, cache);
}

// ── 本地报告计算 ──

function computeStatsOverview(raw, cardsData, classified) {
  const books = raw.books || [];
  const cards = cardsData.cards || [];
  const notes = classified.notes || [];

  const totalBooks = books.length;
  const totalHighlights = books.reduce((s, b) => s + (b.highlights?.length || 0), 0);
  const totalReviews = books.reduce((s, b) => s + (b.reviews?.length || 0), 0);
  const completedBooks = books.filter(b => (b.readingProgress || 0) >= 90).length;
  const completionRate = totalBooks ? Math.round(completedBooks / totalBooks * 100) : 0;

  // 月度趋势
  const monthMap = new Map();
  cards.forEach(c => {
    if (!c.createTime) return;
    const d = new Date(c.createTime * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthMap.set(key, (monthMap.get(key) || 0) + 1);
  });
  const monthlyTrend = [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([month, count]) => ({ month, count }));

  // Top books
  const bookMap = new Map();
  cards.forEach(c => {
    const key = c.bookTitle;
    if (!key) return;
    if (!bookMap.has(key)) bookMap.set(key, { title: key, author: c.author || '', count: 0 });
    bookMap.get(key).count++;
  });
  const topBooks = [...bookMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);

  // 分类分布
  const catMap = new Map();
  notes.forEach(n => {
    if (n.category && n.category !== '未分类') {
      const top = n.category.split('/')[0];
      catMap.set(top, (catMap.get(top) || 0) + 1);
    }
  });
  const categoryDist = [...catMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    type: 'stats-overview',
    stats: {
      totalBooks,
      totalHighlights,
      totalReviews,
      totalCards: cards.length,
      classifiedNotes: notes.length,
      completionRate,
      avgNotesPerBook: totalBooks ? Math.round(cards.length / totalBooks * 10) / 10 : 0,
    },
    monthlyTrend,
    topBooks,
    categoryDistribution: categoryDist,
  };
}

function computePreferenceAnalysis(raw, cardsData, classified) {
  const books = raw.books || [];
  const cards = cardsData.cards || [];
  const notes = classified.notes || [];

  // 分类分布（二级）
  const domainMap = new Map();
  notes.forEach(n => {
    if (n.category && n.category !== '未分类') {
      const parts = n.category.split('/');
      const domain = parts[0];
      const sub = parts.slice(0, 2).join('/');
      domainMap.set(domain, (domainMap.get(domain) || 0) + 1);
    }
  });

  const fictionDomains = new Set(['文学小说', '写作创作']);
  let fiction = 0, nonFiction = 0;
  domainMap.forEach((count, domain) => {
    if (fictionDomains.has(domain)) fiction += count;
    else nonFiction += count;
  });
  const total = fiction + nonFiction || 1;

  // 深度指标
  const reviewCards = cards.filter(c => c.type === 'review' && c.note);
  const highlightCards = cards.filter(c => c.type === 'highlight');
  const avgHighlightLength = highlightCards.length
    ? Math.round(highlightCards.reduce((s, c) => s + (c.quote?.length || 0), 0) / highlightCards.length)
    : 0;

  // 作者偏好
  const authorMap = new Map();
  books.forEach(b => {
    const author = b.book?.author;
    if (author) authorMap.set(author, (authorMap.get(author) || 0) + 1);
  });
  const topAuthors = [...authorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    type: 'preference-analysis',
    fictionPercent: Math.round(fiction / total * 100),
    nonFictionPercent: Math.round(nonFiction / total * 100),
    domainDistribution: [...domainMap.entries()]
      .map(([name, count]) => ({ name, count, percent: Math.round(count / total * 100) }))
      .sort((a, b) => b.count - a.count),
    depthMetrics: {
      avgNotesPerBook: books.length ? Math.round(cards.length / books.length * 10) / 10 : 0,
      reviewToHighlightRatio: highlightCards.length
        ? Math.round(reviewCards.length / highlightCards.length * 100) : 0,
      avgHighlightLength,
      totalReviewWords: reviewCards.reduce((s, c) => s + (c.note?.length || 0), 0),
    },
    topAuthors,
    readingStyle: reviewCards.length > highlightCards.length * 0.3 ? '反思型' : '摘抄型',
  };
}

// ── 报告生成主函数 ──

const REPORT_TYPES = new Set([
  'stats-overview',
  'preference-analysis',
  'reading-persona',
  'mbti-reading',
  'cognitive-cocoon',
  'breakout-books',
]);

async function generateReport(reportId) {
  if (!REPORT_TYPES.has(reportId)) {
    throw Object.assign(new Error(`未知报告类型：${reportId}`), { statusCode: 400 });
  }

  const { raw, cardsData, classified, taxonomy } = await loadAllData();
  if (!raw?.books?.length) {
    throw Object.assign(new Error('没有数据，请先同步微信读书'), { statusCode: 400 });
  }

  const dataHash = computeDataHash(raw, cardsData, classified);

  // 检查缓存
  const cache = await readCache();
  const cached = cache.reports?.[reportId];
  if (cached && cached.dataHash === dataHash) {
    return cached.content;
  }

  let result;

  // 本地报告
  if (reportId === 'stats-overview') {
    result = computeStatsOverview(raw, cardsData, classified);
  } else if (reportId === 'preference-analysis') {
    result = computePreferenceAnalysis(raw, cardsData, classified);
  } else {
    // LLM 报告
    const context = buildDataContext(raw, cardsData, classified, taxonomy);
    let prompt;
    switch (reportId) {
      case 'reading-persona': prompt = buildPersonaPrompt(context); break;
      case 'mbti-reading': prompt = buildMbtiPrompt(context); break;
      case 'cognitive-cocoon': prompt = buildCocoonPrompt(context); break;
      case 'breakout-books': prompt = buildBreakoutPrompt(context); break;
    }
    result = await chatCompletion(prompt.system, prompt.user);
    result.type = reportId;
  }

  // 写入缓存
  await writeCacheEntry(reportId, result, dataHash);
  return result;
}

async function getCachedReports() {
  return readCache();
}

module.exports = { generateReport, getCachedReports, chatCompletion };
