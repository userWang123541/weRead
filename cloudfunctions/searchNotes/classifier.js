/**
 * Lightweight classifier subset for cloud functions.
 * Provides embedding retrieval and cosine similarity only.
 */

const https = require('https');
const DEFAULT_BASE_URL = 'https://api.siliconflow.cn/v1';
const DEFAULT_EMBEDDING_MODEL = 'BAAI/bge-large-zh-v1.5';

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
  const baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const apiKey = config.apiKey || '';
  const model = config.model || config.embeddingModel || DEFAULT_EMBEDDING_MODEL;
  const maxBatch = 32;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += maxBatch) {
    const batch = texts.slice(i, i + maxBatch);
    let resp;

    for (let retry = 0; retry < 3; retry++) {
      try {
        resp = await httpPost(baseUrl + '/embeddings', { model: model, input: batch }, { Authorization: 'Bearer ' + apiKey });
        if (resp.status === 200) break;
      } catch (networkErr) {
        if (retry === 2) throw networkErr;
      }
      if (retry < 2) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retry)));
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

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i];
  }
  const d = Math.sqrt(normA) * Math.sqrt(normB);
  return d === 0 ? 0 : dot / d;
}

module.exports = { getEmbeddings, cosineSimilarity };
