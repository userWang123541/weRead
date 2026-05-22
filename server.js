require('dotenv').config();
const express = require('express');
const path = require('path');

const {
  callWeread,
  getApiKey,
  readJsonIfExists,
  syncWereadData,
  writeJson,
} = require('./lib/weread-service');
const {
  buildCards,
  buildMaterialPack,
} = require('./lib/card-engine');
const { classifyNotes } = require('./lib/classifier');
const { generateReport, getCachedReports, chatCompletion } = require('./lib/report-engine');

const app = express();
const DATA_DIR = path.join(__dirname, 'data');
const RAW_DATA_FILE = path.join(DATA_DIR, 'weread-data.json');
const CARDS_FILE = path.join(DATA_DIR, 'cards.json');
const CLASSIFIED_FILE = path.join(DATA_DIR, 'classified.json');
const TAXONOMY_FILE = path.join(__dirname, 'config', 'taxonomy.json');

app.use(express.json({ limit: '20mb' }));
app.use(express.static(__dirname));

function sendError(res, err) {
  res.status(err.statusCode || 500).json({
    error: err.message,
    payload: err.payload,
  });
}

async function loadRawData() {
  return readJsonIfExists(RAW_DATA_FILE, {
    fetchedAt: '',
    totalBooks: 0,
    books: [],
  });
}

async function loadCardsData(rawData) {
  const existing = await readJsonIfExists(CARDS_FILE, null);
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

async function loadTaxonomyData() {
  return normalizeTaxonomy(await readJsonIfExists(TAXONOMY_FILE, {
    version: '1.0.0',
    description: '预建分类体系',
    categories: [],
  }));
}

async function saveTaxonomyData(taxonomy) {
  await writeJson(TAXONOMY_FILE, normalizeTaxonomy(taxonomy));
}

app.post('/api/gateway', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const { api_name: apiName, skill_version: _skillVersion, apiKey: _apiKey, ...params } = req.body || {};
    if (!apiName) {
      res.status(400).json({ error: 'api_name is required' });
      return;
    }
    const data = await callWeread(apiName, params, apiKey);
    res.json(data);
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/data', async (_req, res) => {
  try {
    const raw = await loadRawData();
    const cards = await loadCardsData(raw);
    res.json({
      raw,
      cards,
      stats: summarize(raw, cards),
    });
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/sync', async (req, res) => {
  try {
    const apiKey = getApiKey(req);
    const maxBooks = Number(req.body?.maxBooks || 0) || undefined;
    const raw = await syncWereadData(apiKey, { maxBooks });
    const cards = buildCards(raw);
    await writeJson(RAW_DATA_FILE, raw);
    await writeJson(CARDS_FILE, cards);
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

app.post('/api/cards/rebuild', async (_req, res) => {
  try {
    const raw = await loadRawData();
    const cards = buildCards(raw);
    await writeJson(CARDS_FILE, cards);
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
    const raw = await loadRawData();
    const cardsData = await loadCardsData(raw);
    const pack = buildMaterialPack(cardsData.cards || [], req.body?.query || '', {
      tags: req.body?.tags || [],
      limit: req.body?.limit || 24,
    });
    res.json(pack);
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/taxonomy', async (_req, res) => {
  try {
    res.json(await loadTaxonomyData());
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/api/taxonomy', async (req, res) => {
  try {
    const taxonomy = normalizeTaxonomy({
      version: req.body?.version,
      description: req.body?.description,
      categories: req.body?.categories || [],
    });
    await saveTaxonomyData(taxonomy);
    res.json(await loadTaxonomyData());
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/taxonomy/categories', async (req, res) => {
  try {
    const categoryPath = normalizeCategoryPath(req.body?.path);
    if (!categoryPath) {
      res.status(400).json({ error: '分类路径不能为空' });
      return;
    }
    const taxonomy = await loadTaxonomyData();
    if (taxonomy.categories.some(item => item.path === categoryPath)) {
      res.status(409).json({ error: '分类已存在' });
      return;
    }
    taxonomy.categories.push({
      id: `cat_${stableId(categoryPath)}`,
      path: categoryPath,
      description: String(req.body?.description || '').trim(),
    });
    await saveTaxonomyData(taxonomy);
    res.json(await loadTaxonomyData());
  } catch (err) {
    sendError(res, err);
  }
});

app.put('/api/taxonomy/categories/:id', async (req, res) => {
  try {
    const categoryPath = normalizeCategoryPath(req.body?.path);
    if (!categoryPath) {
      res.status(400).json({ error: '分类路径不能为空' });
      return;
    }
    const taxonomy = await loadTaxonomyData();
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
    await saveTaxonomyData(taxonomy);
    res.json(await loadTaxonomyData());
  } catch (err) {
    sendError(res, err);
  }
});

app.delete('/api/taxonomy/categories/:id', async (req, res) => {
  try {
    const taxonomy = await loadTaxonomyData();
    const nextCategories = taxonomy.categories.filter(item => item.id !== req.params.id);
    if (nextCategories.length === taxonomy.categories.length) {
      res.status(404).json({ error: '分类不存在' });
      return;
    }
    taxonomy.categories = nextCategories;
    await saveTaxonomyData(taxonomy);
    res.json(await loadTaxonomyData());
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/classify', async (req, res) => {
  try {
    const raw = await loadRawData();
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
    await writeJson(CLASSIFIED_FILE, { classifiedAt: new Date().toISOString(), totalNotes: results.length, notes: results, stats });
    res.json({ ok: true, totalNotes: results.length, stats });
  } catch (err) {
    sendError(res, err);
  }
});

app.get('/api/classified', async (_req, res) => {
  try {
    const data = await readJsonIfExists(CLASSIFIED_FILE, { notes: [], stats: {} });
    res.json(data);
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/classified/update', async (req, res) => {
  try {
    const { noteIndex, category, card } = req.body;
    if (noteIndex === undefined || !category) {
      res.status(400).json({ error: 'noteIndex and category are required' });
      return;
    }
    const data = await readJsonIfExists(CLASSIFIED_FILE, { notes: [], stats: {} });
    let updatedNote;
    if (noteIndex < 0 && card) {
      updatedNote = {
        type: card.type === 'linked' ? (card.note ? 'review' : 'highlight') : card.type,
        text: card.quote || card.note || card.text || '',
        bookId: card.bookId || '',
        bookTitle: card.bookTitle || '',
        chapter: card.chapterTitle || '',
        createTime: card.createTime || null,
        category,
        categoryId: '',
        categoryScore: 1,
        userEdited: true,
      };
      data.notes.push(updatedNote);
      data.totalNotes = data.notes.length;
    } else if (noteIndex < 0 || noteIndex >= data.notes.length) {
      res.status(400).json({ error: 'noteIndex out of range' });
      return;
    } else {
      data.notes[noteIndex].category = category;
      data.notes[noteIndex].userEdited = true;
      updatedNote = data.notes[noteIndex];
    }
    // Recalculate stats
    const stats = {};
    for (const note of data.notes) {
      stats[note.category] = (stats[note.category] || 0) + 1;
    }
    data.stats = stats;
    await writeJson(CLASSIFIED_FILE, data);
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

app.get('/api/reports', async (_req, res) => {
  try {
    const data = await getCachedReports();
    res.json(data);
  } catch (err) {
    sendError(res, err);
  }
});

app.post('/api/reports/generate', async (req, res) => {
  try {
    const { reportId } = req.body || {};
    if (!reportId) {
      res.status(400).json({ error: 'reportId is required' });
      return;
    }
    const result = await generateReport(reportId);
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

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3456;

if (require.main === module) {
  startServer(Number(PORT));
}

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`WeRead Knowledge Workbench running at http://localhost:${port}`);
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE' && port < Number(PORT) + 20) {
      startServer(port + 1);
      return;
    }
    throw err;
  });
}

module.exports = {
  app,
  summarize,
  startServer,
};
