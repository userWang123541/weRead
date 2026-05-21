const fs = require('fs');
const path = require('path');

const TAXONOMY_PATH = path.join(__dirname, '..', 'config', 'taxonomy.json');

function loadTaxonomy() {
  return JSON.parse(fs.readFileSync(TAXONOMY_PATH, 'utf-8'));
}

const DEFAULT_BASE_URL = 'https://api.siliconflow.cn/v1';
const DEFAULT_EMBEDDING_MODEL = 'BAAI/bge-large-zh-v1.5';

function getConfig() {
  return {
    baseUrl: (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    apiKey: process.env.LLM_API_KEY || '',
    embeddingModel: process.env.LLM_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
  };
}

async function getEmbeddings(texts, config) {
  const { baseUrl, apiKey, embeddingModel } = config;
  const maxBatch = 32;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += maxBatch) {
    const batch = texts.slice(i, i + maxBatch);
    let res;
    for (let retry = 0; retry < 3; retry++) {
      res = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: embeddingModel,
          input: batch,
        }),
      });
      if (res.ok) break;
      if (retry < 2) await new Promise(r => setTimeout(r, 1000 * (retry + 1)));
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Embedding API error ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const sorted = data.data.sort((a, b) => a.index - b.index);
    allEmbeddings.push(...sorted.map(d => d.embedding));
  }

  return allEmbeddings;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function findBestCategory(noteEmbedding, categoryEmbeddings, taxonomy, threshold = 0.45) {
  let bestIdx = -1;
  let bestScore = -1;

  for (let i = 0; i < categoryEmbeddings.length; i++) {
    const score = cosineSimilarity(noteEmbedding, categoryEmbeddings[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestScore >= threshold) {
    return {
      categoryId: taxonomy.categories[bestIdx].id,
      categoryPath: taxonomy.categories[bestIdx].path,
      score: bestScore,
    };
  }

  return {
    categoryId: 'unclassified',
    categoryPath: '未分类',
    score: bestScore,
  };
}

async function classifyNotes(notes, options = {}) {
  const config = getConfig();
  if (!config.apiKey) {
    throw new Error('Missing LLM_API_KEY in environment');
  }

  const taxonomy = loadTaxonomy();
  const threshold = options.threshold || 0.45;
  const batchSize = options.batchSize || 32;

  // 1. Embed all category descriptions
  console.log(`Embedding ${taxonomy.categories.length} categories...`);
  const categoryTexts = taxonomy.categories.map(c => `${c.path}: ${c.description}`);
  const categoryEmbeddings = await getEmbeddings(categoryTexts, config);
  console.log('Categories embedded.');

  // 2. Embed notes in batches
  const results = [];
  const totalBatches = Math.ceil(notes.length / batchSize);

  for (let i = 0; i < notes.length; i += batchSize) {
    const batch = notes.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    process.stdout.write(`\r  Embedding notes: batch ${batchNum}/${totalBatches}`);

    // Truncate to ~200 chars to stay under 512 token limit
    const texts = batch.map(n => (n.text || '').slice(0, 200));
    const embeddings = await getEmbeddings(texts, config);

    for (let j = 0; j < batch.length; j++) {
      const match = findBestCategory(embeddings[j], categoryEmbeddings, taxonomy, threshold);
      results.push({
        ...batch[j],
        category: match.categoryPath,
        categoryId: match.categoryId,
        categoryScore: Math.round(match.score * 1000) / 1000,
      });
    }
  }

  console.log('\nClassification complete.');

  // 3. Stats
  const stats = {};
  for (const r of results) {
    stats[r.category] = (stats[r.category] || 0) + 1;
  }

  return { results, stats };
}

module.exports = { classifyNotes, getEmbeddings, cosineSimilarity, getConfig };
