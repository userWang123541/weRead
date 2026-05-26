require('dotenv').config();
const express = require('express');
const compression = require('compression');
const path = require('path');

const {
  callWeread,
  getApiKey,
  readJsonIfExists,
  readJson,
  syncWereadData,
  writeJsonByKey,
} = require('./lib/weread-service');
const {
  buildCards,
  buildMaterialPack,
} = require('./lib/card-engine');
const { classifyNotes, getEmbeddings, cosineSimilarity, getConfig } = require('./lib/classifier');
const { generateReport, getCachedReports, chatCompletion } = require('./lib/report-engine');
const { isPostgres, initDatabase } = require('./lib/postgres');

const app = express();
app.use(compression({
  filter: (req, res) => {
    if (req.path.startsWith('/vendor/')) return false;
    return compression.filter(req, res);
  },
}));
const TAXONOMY_FILE_DEFAULT = path.join(__dirname, 'config', 'taxonomy.json');

app.use(express.json({ limit: '2mb' }));

// 安全：只暴露前端静态资源，不暴露 .env / server.js / lib/ 等敏感文件
app.use(express.static(__dirname, {
  dotfiles: 'deny',
  index: 'index.html',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// 拦截敏感路径
const BLOCKED_PATHS = /^\/(\.env|\.git|server\.js|lib\/|config\/|node_modules\/|package|deploy|fix-nginx|ecosystem|README|vendor\/chunk)/;
app.use((req, res, next) => {
  if (BLOCKED_PATHS.test(req.path)) return res.status(404).end();
  next();
});

function sendError(res, err) {
  const status = err.statusCode || 500;
  const message = status >= 500 ? '服务器内部错误' : err.message;
  res.status(status).json({ error: message });
}

// 缓存控制：GET 请求允许浏览器和 Cloudflare 边缘缓存
const CACHE_HEADERS = {
  books: 'public, max-age=60, stale-while-revalidate=300',
  data: 'public, max-age=120, stale-while-revalidate=600',
  classified: 'public, max-age=300, stale-while-revalidate=600',
  taxonomy: 'public, max-age=3600',
  cards: 'public, max-age=60, stale-while-revalidate=300',
  reports: 'public, max-age=300',
  health: 'public, max-age=10',
};

function setCacheHeaders(res, type) {
  const header = CACHE_HEADERS[type];
  if (header) res.setHeader('Cache-Control', header);
}

async function loadRawData(apiKey) {
  return readJson(apiKey, 'weread-data.json', {
    fetchedAt: '',
    totalBooks: 0,
    books: [],
  });
}

async function loadCardsData(apiKey, rawData) {
  const existing = await readJson(apiKey, 'cards.json', null);
  if (existing?.cards?.length) return existing;
  return buildCards(rawData);
}

function stableId(input) {
  let hash = 0;
  const text = String(input || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizeCategoryPath(categoryPath) {
  return String(categoryPath || '')
    .split('/')
    .map(part => part.trim())
    .filter(Boolean)
    .join('/');
}

function normalizeTaxonomy(taxonomy) {
  const seen = new Set();
  const categories = [];
  for (const item of taxonomy.categories || []) {
    const categoryPath = normalizeCategoryPath(item.path);
    if (!categoryPath || seen.has(categoryPath)) continue;
    seen.add(categoryPath);
    categories.push({
      id: item.id || `cat_${stableId(categoryPath)}`,
      path: categoryPath,
      description: String(item.description || '').trim(),
    });
  }
  categories.sort((a, b) => a.path.localeCompare(b.path, 'zh'));
  return {
    version: taxonomy.version || '1.0.0',
    description: taxonomy.description || '预建分类体系',
    categories,
  };
}

async function loadTaxonomyData(apiKey) {
  const userTaxonomy = await readJson(apiKey, 'taxonomy.json', null);
  if (userTaxonomy) return normalizeTaxonomy(userTaxonomy);
  // 首次使用，从默认配置复制
  const defaultTaxonomy = await readJsonIfExists(TAXONOMY_FILE_DEFAULT, {
    version: '1.0.0',
    description: '预建分类体系',
    categories: [],
  });
  return normalizeTaxonomy(defaultTaxonomy);
}

async function saveTaxonomyData(apiKey, taxonomy) {
  await writeJsonByKey(apiKey, 'taxonomy.json', normalizeTaxonomy(taxonomy));
}

// 白名单：只允许调用这几个微信读书 API
const WEREAD_API_ALLOWLIST = new Set(['/user/notebooks', '/book/bookmarklist', '/review/list/mine']);

app.post('/api/gateway', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const { api_name: apiName, skill_version: _skillVersion, apiKey: _apiKey, ...params } = req.body || {};
    if (!apiName || !WEREAD_API_ALLOWLIST.has(apiName)) {
      res.status(400).json({ error: '不支持的 API 调用' });
      return;
    }
    const data = await callWeread(apiName, params, apiKey);
    res.json(data);
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/data', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const raw = await loadRawData(apiKey);
    const cards = await loadCardsData(apiKey, raw);
    setCacheHeaders(res, 'data');
    res.json({
      raw,
      cards,
      stats: summarize(raw, cards),
    });
  } catch (err) {
    sendError(res, err);
  }
});

// 轻量书籍接口：不含 highlights/reviews/chapters 大数组，预计算 readingDays
app.get('/api/books', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const raw = await loadRawData(apiKey);
    const cardsData = await loadCardsData(apiKey, raw);

    const books = (raw.books || []).map(b => ({
      bookId: b.bookId,
      book: b.book || {},
      noteCount: b.noteCount || 0,
      reviewCount: b.reviewCount || 0,
      bookmarkCount: b.bookmarkCount || 0,
      readingProgress: b.readingProgress || 0,
      markedStatus: b.markedStatus,
      sort: b.sort,
    }));

    const dates = new Set();
    for (const b of raw.books || []) {
      for (const h of b.highlights || []) {
        if (h.createTime) {
          const d = new Date(h.createTime * 1000);
          dates.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
        }
      }
      for (const r of b.reviews || []) {
        if (r.createTime) {
          const d = new Date(r.createTime * 1000);
          dates.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
        }
      }
    }

    const allCards = cardsData.cards || [];
    const recentCards = allCards.slice(0, 3).map(c => ({
      cardId: c.cardId, type: c.type, bookTitle: c.bookTitle,
      author: c.author, quote: c.quote, note: c.note, createTime: c.createTime,
    }));
    const quotable = allCards.filter(c => c.quote && c.quote.length > 15);
    const rq = quotable.length ? quotable[Math.floor(Math.random() * quotable.length)] : null;

    // 合并 classified stats + taxonomy，前端只需 1 次请求
    // classified 完整数据按需通过 /api/classified 加载
    const [classifiedFull, taxonomy] = await Promise.all([
      readJson(apiKey, 'classified.json', null),
      loadTaxonomyData(apiKey),
    ]);
    const classified = classifiedFull
      ? { totalNotes: classifiedFull.totalNotes || 0, stats: classifiedFull.stats || {}, classifiedAt: classifiedFull.classifiedAt || '' }
      : null;

    setCacheHeaders(res, 'books');
    res.json({
      fetchedAt: raw.fetchedAt || '',
      totalBooks: books.length,
      books,
      stats: { ...summarize(raw, cardsData), readingDays: dates.size },
      recentCards,
      randomQuote: rq ? { text: rq.quote.slice(0, 120), book: rq.bookTitle || '' } : { text: '', book: '' },
      classified,
      taxonomy,
    });
  } catch (err) {
    sendError(res, err);
  }
});

// 分页卡片接口：服务端过滤 + 分页，去掉冗余字段
app.get('/api/cards', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const raw = await loadRawData(apiKey);
    const cardsData = await loadCardsData(apiKey, raw);
    let cards = cardsData.cards || [];

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const search = String(req.query.search || '').trim().toLowerCase();
    const typeFilter = String(req.query.type || '').trim();
    const bookFilter = String(req.query.book || '').trim();
    const tagFilter = String(req.query.tag || '').trim();

    if (typeFilter) cards = cards.filter(c => c.type === typeFilter);
    if (bookFilter) cards = cards.filter(c => c.bookTitle === bookFilter);
    if (tagFilter) cards = cards.filter(c => (c.tags || []).includes(tagFilter));
    if (search) {
      cards = cards.filter(c => {
        const haystack = [c.quote, c.note, c.bookTitle, c.author, c.chapterTitle,
          ...(c.tags || []), ...(c.keywords || [])].join('\n').toLowerCase();
        return haystack.includes(search);
      });
    }

    const total = cards.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const pageCards = cards.slice(offset, offset + limit).map(({ text, summary, keywords, ...rest }) => rest);

    setCacheHeaders(res, 'cards');
    res.json({ cards: pageCards, total, page, limit, totalPages });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/health', (_req, res) => {
  setCacheHeaders(res, 'health');
  res.json({
    ok: true,
    storage: isPostgres() ? 'postgres' : 'file',
    time: new Date().toISOString(),
  });
});

app.post('/api/sync', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const maxBooks = Number(req.body?.maxBooks || 0) || undefined;
    const concurrency = Number(req.body?.concurrency || process.env.WEREAD_SYNC_CONCURRENCY || 4);
    const raw = await syncWereadData(apiKey, { maxBooks, concurrency });
    const cards = buildCards(raw);
    await writeJsonByKey(apiKey, 'weread-data.json', raw);
    await writeJsonByKey(apiKey, 'cards.json', cards);
    res.json({
      ok: true,
      raw,
      cards,
      stats: summarize(raw, cards),
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/sync/start', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const maxBooks = Number(req.body?.maxBooks || 0) || undefined;
    const concurrency = Number(req.body?.concurrency || process.env.WEREAD_SYNC_CONCURRENCY || 4);
    const job = createSyncJob(apiKey, { maxBooks, concurrency });
    res.status(202).json(publicSyncJob(job));
  } catch (err) {
    console.error('Failed to start sync job:', err);
    sendError(res, err);
  }
});

app.get('/api/sync/status/:jobId', async (req, res) => {
  const job = syncJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: '同步任务不存在或已过期' });
    return;
  }
  res.json(publicSyncJob(job));
});

app.post('/api/cards/rebuild', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const raw = await loadRawData(apiKey);
    const cards = buildCards(raw);
    await writeJsonByKey(apiKey, 'cards.json', cards);
    res.json({
      ok: true,
      cards,
      stats: summarize(raw, cards),
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/material-pack', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const raw = await loadRawData(apiKey);
    const cardsData = await loadCardsData(apiKey, raw);
    const pack = buildMaterialPack(cardsData.cards || [], req.body?.query || '', {
      tags: req.body?.tags || [],
      limit: req.body?.limit || 24,
    });
    res.json(pack);
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/taxonomy', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    setCacheHeaders(res, 'taxonomy');
    res.json(await loadTaxonomyData(apiKey));
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/api/taxonomy', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const taxonomy = normalizeTaxonomy({
      version: req.body?.version,
      description: req.body?.description,
      categories: req.body?.categories || [],
    });
    await saveTaxonomyData(apiKey, taxonomy);
    res.json(await loadTaxonomyData(apiKey));
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/taxonomy/categories', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const categoryPath = normalizeCategoryPath(req.body?.path);
    if (!categoryPath) {
      res.status(400).json({ error: '分类路径不能为空' });
      return;
    }
    const taxonomy = await loadTaxonomyData(apiKey);
    if (taxonomy.categories.some(item => item.path === categoryPath)) {
      res.status(409).json({ error: '分类已存在' });
      return;
    }
    taxonomy.categories.push({
      id: `cat_${stableId(categoryPath)}`,
      path: categoryPath,
      description: String(req.body?.description || '').trim(),
    });
    await saveTaxonomyData(apiKey, taxonomy);
    res.json(await loadTaxonomyData(apiKey));
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/api/taxonomy/categories/:id', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const categoryPath = normalizeCategoryPath(req.body?.path);
    if (!categoryPath) {
      res.status(400).json({ error: '分类路径不能为空' });
      return;
    }
    const taxonomy = await loadTaxonomyData(apiKey);
    const category = taxonomy.categories.find(item => item.id === req.params.id);
    if (!category) {
      res.status(404).json({ error: '分类不存在' });
      return;
    }
    if (taxonomy.categories.some(item => item.id !== category.id && item.path === categoryPath)) {
      res.status(409).json({ error: '分类已存在' });
      return;
    }
    category.path = categoryPath;
    category.description = String(req.body?.description || '').trim();
    await saveTaxonomyData(apiKey, taxonomy);
    res.json(await loadTaxonomyData(apiKey));
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/taxonomy/categories/:id', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const taxonomy = await loadTaxonomyData(apiKey);
    const nextCategories = taxonomy.categories.filter(item => item.id !== req.params.id);
    if (nextCategories.length === taxonomy.categories.length) {
      res.status(404).json({ error: '分类不存在' });
      return;
    }
    taxonomy.categories = nextCategories;
    await saveTaxonomyData(apiKey, taxonomy);
    res.json(await loadTaxonomyData(apiKey));
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/classify', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const raw = await loadRawData(apiKey);
    if (!raw?.books?.length) {
      res.status(400).json({ error: '没有数据，请先同步' });
      return;
    }

    const notes = [];
    for (const book of raw.books) {
      const chapterMap = {};
      for (const ch of book.chapters || []) chapterMap[ch.chapterUid] = ch.title;
      for (const h of book.highlights || []) {
        if (h.markText?.trim()) {
          notes.push({ type: 'highlight', text: h.markText, bookId: book.bookId, bookTitle: book.book?.title || '', chapter: chapterMap[h.chapterUid] || '', createTime: h.createTime });
        }
      }
      for (const r of book.reviews || []) {
        if (r.content?.trim()) {
          notes.push({ type: 'review', text: r.content, bookId: book.bookId, bookTitle: book.book?.title || '', chapter: r.chapterName || '', createTime: r.createTime });
        }
      }
    }

    const { results, stats } = await classifyNotes(notes);
    await writeJsonByKey(apiKey, 'classified.json', { classifiedAt: new Date().toISOString(), totalNotes: results.length, notes: results, stats });
    res.json({ ok: true, totalNotes: results.length, stats });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/classified', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const data = await readJson(apiKey, 'classified.json', { notes: [], stats: {} });
    setCacheHeaders(res, 'classified');
    res.json(data);
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/classified/update', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const { noteIndex, category, card } = req.body;
    const idx = Number(noteIndex);
    if (!Number.isInteger(idx) || !category || typeof category !== 'string') {
      res.status(400).json({ error: '参数无效' });
      return;
    }
    const safeCategory = category.trim().slice(0, 200);
    const data = await readJson(apiKey, 'classified.json', { notes: [], stats: {} });
    let updatedNote;
    if (idx < 0 && card) {
      updatedNote = {
        type: card.type === 'linked' ? (card.note ? 'review' : 'highlight') : card.type,
        text: card.quote || card.note || card.text || '',
        bookId: card.bookId || '',
        bookTitle: card.bookTitle || '',
        chapter: card.chapterTitle || '',
        createTime: card.createTime || null,
        category: safeCategory,
        categoryId: '',
        categoryScore: 1,
        userEdited: true,
      };
      data.notes.push(updatedNote);
      data.totalNotes = data.notes.length;
    } else if (idx < 0 || idx >= data.notes.length) {
      res.status(400).json({ error: 'noteIndex out of range' });
      return;
    } else {
      data.notes[idx].category = safeCategory;
      data.notes[idx].userEdited = true;
      updatedNote = data.notes[idx];
    }
    // Recalculate stats
    const stats = {};
    for (const note of data.notes) {
      stats[note.category] = (stats[note.category] || 0) + 1;
    }
    data.stats = stats;
    await writeJsonByKey(apiKey, 'classified.json', data);
    res.json({ ok: true, stats, note: updatedNote });
  } catch (err) {
    sendError(res, err);
  }
});

function summarize(raw, cardsData) {
  const books = raw.books || [];
  const cards = cardsData.cards || [];
  const totalHighlights = books.reduce((sum, book) => sum + (book.highlights?.length || 0), 0);
  const totalReviews = books.reduce((sum, book) => sum + (book.reviews?.length || 0), 0);
  const linkedCards = cards.filter(card => card.type === 'linked').length;

  return {
    fetchedAt: raw.fetchedAt || '',
    generatedAt: cardsData.generatedAt || '',
    totalBooks: books.length,
    totalHighlights,
    totalReviews,
    totalCards: cards.length,
    linkedCards,
    taxonomyCount: cardsData.taxonomy?.length || 0,
  };
}

// ── 阅读报告 API ──

app.get('/api/reports', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const data = await getCachedReports(apiKey);
    setCacheHeaders(res, 'reports');
    res.json(data);
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/reports/generate', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const { reportId } = req.body || {};
    if (!reportId) {
      res.status(400).json({ error: 'reportId is required' });
      return;
    }
    const result = await generateReport(apiKey, reportId);
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
});

// ── 内容工坊 AI 文案 ──

app.post('/api/studio/generate', async (req, res) => {
  try {
    const { topic, tone, cards } = req.body || {};
    if (!cards?.length) {
      res.status(400).json({ error: '没有素材卡片' });
      return;
    }

    const cardTexts = cards.slice(0, 12).map((c, i) => {
      const parts = [];
      if (c.bookTitle) parts.push(`《${c.bookTitle}》`);
      if (c.author) parts.push(c.author);
      if (c.quote) parts.push(`划线："${c.quote.slice(0, 120)}"`);
      if (c.note) parts.push(`想法："${c.note.slice(0, 120)}"`);
      return `${i + 1}. ${parts.join(' | ')}`;
    }).join('\n');

    const toneMap = {
      '种草风': '像朋友推荐好物一样，语气亲切、有感染力，适合小红书种草笔记',
      '学术风': '严谨、有条理、逻辑清晰，适合知识类公众号或读书笔记',
      '吐槽风': '轻松幽默、带点自嘲，像和朋友聊天，有反差感和真实感',
      '编辑推荐风': '专业、有洞察力，像资深编辑写推荐语，有策划感',
    };

    const systemPrompt = '你是一位资深内容创作者和阅读推广人。你会根据用户的真实阅读笔记和划线，生成有温度、有洞察的内容文案。文案必须基于提供的真实素材，不要编造。语言自然真实，不要像AI写的套话。直接输出文案内容，不要加多余说明。';

    const userPrompt = `主题：${topic || '阅读感悟'}
风格：${toneMap[tone] || toneMap['种草风']}

以下是用户在微信读书中的真实笔记素材：
${cardTexts}

请基于以上真实素材，生成一篇 200-350 字的内容文案。要求：
1. 必须引用至少 2 条素材中的原文（用引号标注）
2. 有真实的观点和感悟，不要空洞的套话
3. 语言风格符合所选风格
4. 结构：开头引入 → 素材引用和解读 → 个人观点 → 结尾金句`;

    const result = await chatCompletion(systemPrompt, userPrompt, { json: false });
    const content = typeof result === 'string' ? result : String(result);
    res.json({ content });
  } catch (err) {
    sendError(res, err);
  }
});

// ── RAG 笔记召回 ──

// 关键词提取（简单中文分词）
function extractKeywords(text) {
  if (!text) return [];
  const keywords = new Set();
  const chinese = text.match(/[一-鿿]{2,6}/g) || [];
  const english = text.match(/[a-zA-Z]{2,}/g) || [];
  chinese.forEach(w => keywords.add(w));
  english.forEach(w => keywords.add(w.toLowerCase()));
  const chars = text.match(/[一-鿿]/g) || [];
  chars.forEach(c => keywords.add(c));
  return [...keywords];
}

// 关键词匹配打分
function keywordScore(queryKeywords, text) {
  if (!text || !queryKeywords.length) return 0;
  let score = 0;
  const textLower = text.toLowerCase();
  queryKeywords.forEach(kw => {
    if (textLower.includes(kw)) {
      score += kw.length >= 2 ? 3 : 1;
    }
  });
  return score;
}

app.post('/api/recall', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const { query } = req.body || {};
    if (!query?.trim()) {
      res.status(400).json({ error: '请输入问题' });
      return;
    }

    const raw = await loadRawData(apiKey);
    if (!raw?.books?.length) {
      res.status(400).json({ error: '没有数据，请先同步' });
      return;
    }

    const cardsData = await loadCardsData(apiKey, raw);
    const cards = (cardsData.cards || []).filter(c => c.text || c.quote || c.note);

    if (!cards.length) {
      res.status(400).json({ error: '没有笔记素材' });
      return;
    }

    const queryText = query.trim();
    const queryKeywords = extractKeywords(queryText);
    let topNotes;

    // 尝试用 embedding API 做向量召回
    try {
      const embConfig = getConfig();
      if (embConfig.apiKey && embConfig.baseUrl) {
        const noteTexts = cards.map(c => (c.text || c.quote || c.note || '').slice(0, 200));
        const [queryEmb, ...noteEmbs] = await getEmbeddings([queryText, ...noteTexts], embConfig);
        const scored = noteEmbs.map((emb, i) => ({
          index: i,
          score: cosineSimilarity(queryEmb, emb),
        })).sort((a, b) => b.score - a.score);

        topNotes = scored.slice(0, 10).map(s => {
          const card = cards[s.index];
          return {
            bookTitle: card.bookTitle || '未知书籍',
            author: card.author || '',
            quote: (card.quote || '').slice(0, 200),
            note: (card.note || '').slice(0, 200),
            category: card.tags?.[0] || '',
            score: Math.round(s.score * 100),
            method: 'vector',
          };
        });
      }
    } catch (embErr) {
      // embedding 失败，降级到关键词匹配
    }

    // 降级：关键词匹配
    if (!topNotes) {
      const scored = cards.map((card, i) => {
        const text = [card.quote, card.note, card.bookTitle, card.chapterTitle, ...(card.tags || [])].join(' ');
        return { index: i, score: keywordScore(queryKeywords, text) };
      }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

      if (!scored.length) {
        const qLower = queryText.toLowerCase();
        cards.forEach((card, i) => {
          const text = [card.quote, card.note, card.bookTitle].join(' ').toLowerCase();
          if (text.includes(qLower) || qLower.split('').some(c => c.length > 1 && text.includes(c))) {
            scored.push({ index: i, score: 1 });
          }
        });
      }

      topNotes = scored.slice(0, 10).map(s => {
        const card = cards[s.index];
        return {
          bookTitle: card.bookTitle || '未知书籍',
          author: card.author || '',
          quote: (card.quote || '').slice(0, 200),
          note: (card.note || '').slice(0, 200),
          category: card.tags?.[0] || '',
          score: Math.min(99, Math.round(s.score * 10)),
          method: 'keyword',
        };
      });
    }

    if (!topNotes?.length) {
      res.json({ answer: '没有找到与你描述相关的笔记。试试换个关键词？', sources: [] });
      return;
    }

    // 用 LLM 生成回答
    const contextText = topNotes.map((n, i) =>
      `[${i + 1}]《${n.bookTitle}》${n.author}\n${n.quote ? '划线：' + n.quote : ''}${n.note ? '\n想法：' + n.note : ''}`
    ).join('\n\n');

    const systemPrompt = '你是一位阅读助手。用户会提出关于阅读内容的问题，你需要根据提供的笔记素材回答。回答要求：1. 基于提供的素材，不要编造；2. 引用具体笔记时用[1][2]等标注来源；3. 语言自然、有洞察力；4. 如果素材中没有相关信息，如实说明。';

    const userPrompt = `用户的问题：${queryText}\n\n以下是相关的阅读笔记：\n\n${contextText}\n\n请基于以上笔记回答用户的问题。`;

    const answer = await chatCompletion(systemPrompt, userPrompt, { json: false });

    res.json({ answer, sources: topNotes });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3456;
const syncJobs = new Map();
const activeSyncJobsByUser = new Map();

function createSyncJob(apiKey, options = {}) {
  const userSyncKey = stableId(apiKey || '_default');
  const activeJobId = activeSyncJobsByUser.get(userSyncKey);
  const activeJob = activeJobId ? syncJobs.get(activeJobId) : null;
  if (activeJob?.status === 'running') return activeJob;

  const jobId = `sync_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id: jobId,
    status: 'running',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedBooks: 0,
    totalBooks: 0,
    sourceBookCount: 0,
    currentBookTitle: '',
    error: '',
    result: null,
  };
  syncJobs.set(jobId, job);
  activeSyncJobsByUser.set(userSyncKey, jobId);

  setImmediate(() => {
    runSyncJob(job, userSyncKey, apiKey, options)
      .catch((err) => {
        console.error('Unhandled sync job failure:', err);
        job.status = 'failed';
        job.error = err.message;
        job.updatedAt = new Date().toISOString();
      });
  });

  return job;
}

async function runSyncJob(job, userSyncKey, apiKey, options) {
  try {
    const raw = await syncWereadData(apiKey, {
      ...options,
      onProgress(progress) {
        job.completedBooks = progress.completedBooks || 0;
        job.totalBooks = progress.totalBooks || 0;
        job.sourceBookCount = progress.sourceBookCount || 0;
        job.currentBookTitle = progress.currentBookTitle || '';
        job.updatedAt = new Date().toISOString();
      },
    });
    const cards = buildCards(raw);
    await writeJsonByKey(apiKey, 'weread-data.json', raw);
    await writeJsonByKey(apiKey, 'cards.json', cards);
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    job.completedBooks = raw.totalBooks || job.completedBooks;
    job.totalBooks = raw.totalBooks || job.totalBooks;
    job.sourceBookCount = raw.sourceBookCount || job.sourceBookCount;
    job.result = {
      ok: true,
      raw,
      cards,
      stats: summarize(raw, cards),
    };
  } catch (err) {
    job.status = 'failed';
    job.error = err.message;
    job.updatedAt = new Date().toISOString();
  } finally {
    activeSyncJobsByUser.delete(userSyncKey);
    setTimeout(() => {
      job.result = null; // 释放内存
      syncJobs.delete(job.id);
    }, 10 * 60 * 1000);
    // 防止内存泄漏：超限时清理最旧的 job
    if (syncJobs.size > 20) {
      const oldest = syncJobs.keys().next().value;
      syncJobs.delete(oldest);
    }
  }
}

function publicSyncJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    completedBooks: job.completedBooks,
    totalBooks: job.totalBooks,
    sourceBookCount: job.sourceBookCount,
    currentBookTitle: job.currentBookTitle,
    error: job.error,
    result: job.result,
  };
}

if (require.main === module) {
  startServer(Number(PORT));
}

async function startServer(port) {
  if (isPostgres()) {
    try {
      await initDatabase();
    } catch (err) {
      console.error('Failed to initialize PostgreSQL:', err.message);
      process.exit(1);
    }
  } else {
    console.log('No DATABASE_URL found, using file storage.');
  }

  const server = app.listen(port, () => {
    const mode = isPostgres() ? 'PostgreSQL' : 'file storage';
    console.log(`WeRead Knowledge Workbench running at http://localhost:${port} [${mode}]`);
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE' && port < Number(PORT) + 20) {
      startServer(port + 1);
      return;
    }
    throw err;
  });
}

// 全局错误处理
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

module.exports = {
  app,
  summarize,
  startServer,
};
