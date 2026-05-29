const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { getEmbeddings, cosineSimilarity } = require('./classifier');

const EMBEDDING_BASE_URL = process.env.LLM_EMBEDDING_BASE_URL || 'https://api.siliconflow.cn/v1';
const EMBEDDING_API_KEY = process.env.LLM_EMBEDDING_API_KEY || '';
const EMBEDDING_MODEL = process.env.LLM_EMBEDDING_MODEL || 'BAAI/bge-large-zh-v1.5';
const RESULT_LIMIT = 50;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const query = (event.query || '').trim();

  if (!query) return { results: [], total: 0 };

  try {
    const config = {
      baseUrl: EMBEDDING_BASE_URL,
      apiKey: EMBEDDING_API_KEY,
      model: EMBEDDING_MODEL,
    };

    // Phase 1: Keyword pre-filter using cloud DB
    const candidates = await keywordSearch(db, openid, query);

    // If no keyword results, fall back to recent cards
    let searchPool = candidates;
    if (!searchPool.length) {
      const recentRes = await db.collection('cards')
        .where({ _openid: openid })
        .orderBy('createTime', 'desc')
        .limit(100)
        .get();
      searchPool = recentRes.data;
    }

    if (!searchPool.length) return { results: [], total: 0 };

    // Phase 2: Vector re-ranking (if API key available)
    if (EMBEDDING_API_KEY && searchPool.length > 0) {
      try {
        const results = await vectorRerank(query, searchPool, config);
        return { results: results.slice(0, RESULT_LIMIT), total: results.length, query };
      } catch (e) {
        // Fall back to keyword-only results
        return {
          results: rankKeywordResults(query, searchPool).slice(0, RESULT_LIMIT).map(formatResult),
          total: searchPool.length,
          query,
          warning: e.message,
        };
      }
    }

    // No embedding available, return keyword results
    return {
      results: rankKeywordResults(query, searchPool).slice(0, RESULT_LIMIT).map(formatResult),
      total: searchPool.length,
      query,
    };
  } catch (err) {
    return { results: [], total: 0, error: err.message };
  }
};

// ---------------------------------------------------------------------------
// Phase 1: Keyword pre-filter via cloud DB
// ---------------------------------------------------------------------------

/**
 * Search cards by keyword using cloud DB regex matching.
 * Splits query into terms and matches against text, bookTitle, tags.
 *
 * @param {object} db - Cloud database instance.
 * @param {string} openid - Current user openid.
 * @param {string} query - Search query string.
 * @returns {Promise<Array>} Matching card documents.
 */
async function keywordSearch(db, openid, query) {
  const terms = query
    .split(/[\s,，、;；]+/)
    .map(t => t.trim())
    .filter(Boolean);

  if (!terms.length) return [];

  const fields = ['text', 'quote', 'note', 'bookTitle', 'author', 'chapterTitle', 'category', 'bookCategory', 'tags', 'keywords'];
  const conditions = [];

  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = db.RegExp({ regexp: escaped, options: 'i' });
    fields.forEach(field => {
      const condition = {};
      condition[field] = regex;
      conditions.push(condition);
    });
  }

  try {
    const res = await db.collection('cards')
      .where(_.and([
        { _openid: openid },
        _.or(conditions),
      ]))
      .limit(200)
      .get();

    return res.data || [];
  } catch (e) {
    return fallbackKeywordSearch(db, openid, terms, fields);
  }
}

async function fallbackKeywordSearch(db, openid, terms, fields) {
  const seen = {};
  const results = [];

  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = db.RegExp({ regexp: escaped, options: 'i' });

    for (const field of fields) {
      const where = { _openid: openid };
      where[field] = regex;
      try {
        const res = await db.collection('cards').where(where).limit(100).get();
        (res.data || []).forEach(card => {
          const id = card._id || card.cardId;
          if (!seen[id]) {
            seen[id] = true;
            results.push(card);
          }
        });
      } catch (err) {}
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Phase 2: Vector re-ranking
// ---------------------------------------------------------------------------

/**
 * Embed query and candidates, compute combined vector + keyword score, and sort.
 *
 * @param {string} query - Original search query.
 * @param {Array} candidates - Array of card objects from keyword search.
 * @param {object} config - Embedding API config { baseUrl, apiKey, model }.
 * @returns {Promise<Array>} Sorted array of formatted result objects.
 */
async function vectorRerank(query, candidates, config) {
  const truncatedQuery = query.slice(0, 200);

  // Embed the query
  const [queryEmbedding] = await getEmbeddings([truncatedQuery], config);

  // Embed all candidates in batches of 32
  const candidateTexts = candidates.map(c =>
    (c.text || c.note || c.quote || '').slice(0, 200)
  );
  const candidateEmbeddings = await getEmbeddings(candidateTexts, config);

  // Compute scores
  const scored = candidates.map((card, i) => {
    const vectorScore = cosineSimilarity(queryEmbedding, candidateEmbeddings[i] || []);
    const keywordScore = computeKeywordScore(query, searchableText(card));
    const finalScore = vectorScore * 0.6 + keywordScore * 0.4;

    return {
      ...card,
      _score: Math.round(finalScore * 1000) / 1000,
      _vectorScore: Math.round(vectorScore * 1000) / 1000,
      _keywordScore: Math.round(keywordScore * 1000) / 1000,
    };
  });

  // Sort by final score descending
  scored.sort((a, b) => b._score - a._score);

  return scored.map(formatResult);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute a simple keyword relevance score.
 * Splits the query into terms and counts how many appear in the text.
 *
 * @param {string} query - Search query.
 * @param {string} text - Text to search within.
 * @returns {number} Score in [0, 1].
 */
function computeKeywordScore(query, text) {
  const terms = query
    .split(/[\s,，、;；]+/)
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);

  if (!terms.length || !text) return 0;

  const lowerText = text.toLowerCase();
  let matched = 0;

  for (const term of terms) {
    if (lowerText.includes(term)) {
      matched++;
    }
  }

  return matched / terms.length;
}

function searchableText(card) {
  return [
    card.text,
    card.quote,
    card.note,
    card.bookTitle,
    card.author,
    card.chapterTitle,
    card.category,
    card.bookCategory,
    ...(card.tags || []),
    ...(card.keywords || []),
  ].filter(Boolean).join('\n');
}

function rankKeywordResults(query, candidates) {
  return (candidates || []).slice().map(card => {
    return {
      ...card,
      _score: computeKeywordScore(query, searchableText(card)),
    };
  }).sort((a, b) => {
    if ((b._score || 0) !== (a._score || 0)) return (b._score || 0) - (a._score || 0);
    return (b.createTime || 0) - (a.createTime || 0);
  });
}

/**
 * Format a card document for API response.
 *
 * @param {object} card - Raw card document from DB.
 * @returns {object} Formatted result object.
 */
function formatResult(card) {
  return {
    id: card._id || card.cardId,
    cardId: card.cardId,
    type: card.type,
    bookId: card.bookId,
    bookTitle: card.bookTitle || '',
    author: card.author || '',
    chapter: card.chapterTitle || '',
    quote: (card.quote || '').slice(0, 200),
    note: (card.note || '').slice(0, 150),
    tags: card.tags || [],
    category: card.category || '',
    time: card.createTime || 0,
    url: card.openUrl || '',
    score: card._score || 0,
  };
}
