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

const app = express();
const DATA_DIR = path.join(__dirname, 'data');
const RAW_DATA_FILE = path.join(DATA_DIR, 'weread-data.json');
const CARDS_FILE = path.join(DATA_DIR, 'cards.json');

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
