require('dotenv').config();
const express = require('express');
const { pipeline, env } = require('@huggingface/transformers');

// Use local cache, don't show progress bars
env.localModelPath = require('path').join(__dirname, 'models');
env.progressCallback = null;

const MODEL_ID = process.env.LLM_EMBEDDING_MODEL || 'BAAI/bge-large-zh-v1.5';
const PORT = process.env.EMBED_PORT || 3457;

let embedder = null;

async function getEmbedder() {
  if (!embedder) {
    console.log(`Loading model ${MODEL_ID} (first run downloads ~1.2GB)...`);
    embedder = await pipeline('feature-extraction', MODEL_ID, {
      dtype: 'fp32',
      device: 'cpu',
    });
    console.log('Model loaded.');
  }
  return embedder;
}

const app = express();
app.use(express.json({ limit: '10mb' }));

// OpenAI-compatible embedding endpoint
app.post('/v1/embeddings', async (req, res) => {
  try {
    const input = req.body.input;
    const texts = Array.isArray(input) ? input : [input];
    const pipe = await getEmbedder();

    const embeddings = [];
    for (const text of texts) {
      const output = await pipe(text, { pooling: 'cls', normalize: true });
      embeddings.push(Array.from(output.data));
    }

    res.json({
      object: 'list',
      model: MODEL_ID,
      data: embeddings.map((embedding, index) => ({
        object: 'embedding',
        embedding,
        index,
      })),
      usage: { prompt_tokens: 0, total_tokens: 0 },
    });
  } catch (err) {
    console.error('Embedding error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true, model: MODEL_ID }));

app.listen(PORT, () => {
  console.log(`Local Embedding Server running at http://localhost:${PORT}`);
  console.log(`Model: ${MODEL_ID}`);
  console.log(`Endpoint: POST http://localhost:${PORT}/v1/embeddings`);
  console.log('\nAdd to .env:');
  console.log(`  LLM_BASE_URL=http://localhost:${PORT}/v1`);
  console.log(`  LLM_API_KEY=local`);
  console.log(`  LLM_EMBEDDING_MODEL=${MODEL_ID}`);
  // Pre-load model
  getEmbedder();
});
