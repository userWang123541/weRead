/**
 * classifier.js — Embedding-based classification utilities
 * Adapted from lib/classifier.js for cloud function use.
 * Config is passed as a parameter instead of reading from env/file.
 */

const https = require('https');
const MAX_BATCH = 32;
const MAX_RETRIES = 3;

function httpPost(urlStr, body, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname, port: 443,
      path: url.pathname + url.search, method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      timeout: 30000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function getEmbeddings(texts, config) {
  const { baseUrl, apiKey, model } = config;
  const url = baseUrl.replace(/\/+$/, '') + '/embeddings';
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH);
    let resp;

    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      try {
        resp = await httpPost(url, { model: model, input: batch }, { Authorization: 'Bearer ' + apiKey });
        if (resp.status === 200) break;
        if (retry < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retry)));
        }
      } catch (err) {
        if (retry < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retry)));
        } else {
          throw err;
        }
      }
    }

    if (!resp || resp.status !== 200) {
      throw new Error('Embedding API error ' + (resp ? resp.status : 'NETWORK') + ': ' + (resp ? resp.body.slice(0, 200) : ''));
    }

    const data = JSON.parse(resp.body);
    const sorted = data.data.sort((a, b) => a.index - b.index);
    allEmbeddings.push(...sorted.map(d => d.embedding));
  }

  return allEmbeddings;
}

/**
 * Cosine similarity between two vectors.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find the best matching category for a single note embedding.
 *
 * @param {number[]} noteEmbedding
 * @param {number[][]} categoryEmbeddings
 * @param {Array<{id: string, path: string, description: string}>} categories
 * @param {number} [threshold=0.45]
 * @returns {{ categoryId: string, category: string, score: number }}
 */
function findBestCategory(noteEmbedding, categoryEmbeddings, categories, threshold = 0.45) {
  let bestIdx = -1;
  let bestScore = -1;

  for (let i = 0; i < categoryEmbeddings.length; i++) {
    const score = cosineSimilarity(noteEmbedding, categoryEmbeddings[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx >= 0 && bestScore >= threshold) {
    return {
      categoryId: categories[bestIdx].id,
      category: categories[bestIdx].path,
      score: Math.round(bestScore * 1000) / 1000,
    };
  }

  return {
    categoryId: '',
    category: '未分类',
    score: bestIdx >= 0 ? Math.round(bestScore * 1000) / 1000 : 0,
  };
}

module.exports = { getEmbeddings, cosineSimilarity, findBestCategory };
