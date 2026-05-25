/**
 * Lightweight classifier subset for cloud functions.
 * Provides embedding retrieval and cosine similarity only.
 */

const DEFAULT_BASE_URL = 'https://api.siliconflow.cn/v1';
const DEFAULT_EMBEDDING_MODEL = 'BAAI/bge-large-zh-v1.5';

/**
 * Retrieve embeddings for an array of texts via SiliconFlow API (OpenAI-compatible).
 * Batches requests in groups of 32 with exponential backoff retry.
 *
 * @param {string[]} texts - Array of text strings to embed.
 * @param {object} config - { baseUrl, apiKey, model }
 * @returns {Promise<number[][]>} Array of embedding vectors.
 */
async function getEmbeddings(texts, config) {
  const baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const apiKey = config.apiKey || '';
  const model = config.model || config.embeddingModel || DEFAULT_EMBEDDING_MODEL;
  const maxBatch = 32;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += maxBatch) {
    const batch = texts.slice(i, i + maxBatch);
    let res;

    for (let retry = 0; retry < 3; retry++) {
      try {
        res = await fetch(`${baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model,
            input: batch,
          }),
        });
        if (res.ok) break;
      } catch (networkErr) {
        // Network-level error (timeout, DNS, etc.)
        if (retry === 2) throw networkErr;
      }

      if (retry < 2) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retry)));
      }
    }

    if (!res || !res.ok) {
      const status = res ? res.status : 'NETWORK_ERROR';
      const body = res ? await res.text().catch(() => '') : '';
      throw new Error(`Embedding API error ${status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    // Sort by original index to preserve ordering
    const sorted = data.data.sort((a, b) => a.index - b.index);
    allEmbeddings.push(...sorted.map(d => d.embedding));
  }

  return allEmbeddings;
}

/**
 * Compute cosine similarity between two vectors.
 *
 * @param {number[]} a - First vector.
 * @param {number[]} b - Second vector.
 * @returns {number} Similarity score in [-1, 1].
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

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dot / denominator;
}

module.exports = { getEmbeddings, cosineSimilarity };
