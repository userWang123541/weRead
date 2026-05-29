const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { getEmbeddings, cosineSimilarity, findBestCategory } = require('./classifier');
const defaultTaxonomy = require('./taxonomy.json');

// Cloud function env vars for SiliconFlow API
const EMBEDDING_BASE_URL = process.env.LLM_EMBEDDING_BASE_URL || 'https://api.siliconflow.cn/v1';
const EMBEDDING_API_KEY = process.env.LLM_EMBEDDING_API_KEY || '';
const EMBEDDING_MODEL = process.env.LLM_EMBEDDING_MODEL || 'BAAI/bge-large-zh-v1.5';

/**
 * Upsert a user document — create if it doesn't exist, update fields if it does.
 */
async function upsertUser(database, openid, data) {
  try {
    const existing = await database.collection('users').where({ _openid: openid }).get();
    if (existing.data.length > 0) {
      await database.collection('users').doc(existing.data[0]._id).update({ data });
    } else {
      await database.collection('users').add({ data: { _openid: openid, ...data } });
    }
  } catch (err) {
    console.error('upsertUser failed:', err.message);
  }
}

async function getUserCategories(openid) {
  const taxDoc = await db.collection('taxonomy').where({ _openid: openid }).limit(1).get();
  if (taxDoc.data[0] && (taxDoc.data[0].categories || []).length) {
    const doc = taxDoc.data[0];
    if (doc.version !== defaultTaxonomy.version && doc.source !== 'user') {
      const categories = defaultTaxonomy.categories || [];
      await db.collection('taxonomy').doc(doc._id).update({
        data: { categories, version: defaultTaxonomy.version || '2.0.0', source: 'default', updatedAt: new Date().toISOString() }
      });
      return categories;
    }
    return doc.categories || [];
  }

  const categories = defaultTaxonomy.categories || [];
  if (categories.length) {
    await db.collection('taxonomy').add({
      data: {
        _openid: openid,
        categories,
        version: defaultTaxonomy.version || '1.0.0',
        createdAt: new Date().toISOString(),
        source: 'default'
      }
    });
  }
  return categories;
}

async function updateClassifyStats(openid) {
  const cards = [];
  const pageSize = 1000;
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const cardsRes = await db.collection('cards')
      .where({ _openid: openid })
      .field({ category: true })
      .skip(skip)
      .limit(pageSize)
      .get();
    const data = cardsRes.data || [];
    cards.push(...data);
    hasMore = data.length === pageSize;
    skip += pageSize;
  }

  const classified = cards.filter(card => card.category && card.category !== '未分类').length;
  const unclassified = Math.max(0, cards.length - classified);

  const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get();
  const user = userRes.data[0];
  const stats = Object.assign({}, (user && user.stats) || {}, {
    classified,
    unclassified
  });
  await upsertUser(db, openid, { stats });
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    console.log('classifyData started, EMBEDDING_API_KEY configured:', !!EMBEDDING_API_KEY);

    if (!EMBEDDING_API_KEY) {
      console.error('EMBEDDING_API_KEY is empty');
      return { success: false, error: '未配置向量化 API Key' };
    }

    const config = {
      baseUrl: EMBEDDING_BASE_URL,
      apiKey: EMBEDDING_API_KEY,
      model: EMBEDDING_MODEL,
    };

    // Update status to classifying
    await upsertUser(db, openid, { syncStatus: 'classifying' });

    const categories = await getUserCategories(openid);
    if (!categories.length) {
      await upsertUser(db, openid, { syncStatus: 'idle', syncError: '分类体系未初始化' });
      return { success: false, error: '分类体系未初始化' };
    }

    // Build category descriptions for embedding
    const catTexts = categories.map(c => `${c.path}: ${c.description}`);
    console.log('Embedding', catTexts.length, 'categories, first:', catTexts[0]);
    const catEmbeddings = await getEmbeddings(catTexts, config);
    console.log('Category embeddings complete, dimension:', catEmbeddings[0] ? catEmbeddings[0].length : 0);

    // Chunked processing with resume support
    const startBatch = event.startBatch || 0;
    const BATCH_SIZE = 50;
    const MAX_BATCHES = 20; // Process up to 1000 cards per invocation

    let processed = 0;
    let totalCards = 0;

    // Get total card count for this user
    const countResult = await db.collection('cards').where({ _openid: openid }).count();
    totalCards = countResult.total;
    console.log('Total cards to classify:', totalCards);

    const totalBatches = Math.ceil(totalCards / BATCH_SIZE);

    for (let batch = startBatch; batch < totalBatches; batch++) {
      // Check if we've hit the per-invocation limit
      if (batch - startBatch >= MAX_BATCHES) {
        // Save resume position and return
        await upsertUser(db, openid, { syncStatus: 'classifying', classifyBatch: batch });
        return {
          success: true,
          done: false,
          processed,
          total: totalCards,
          nextBatch: batch,
        };
      }

      // Load batch of cards
      const cardsRes = await db.collection('cards')
        .where({ _openid: openid })
        .orderBy('createTime', 'desc')
        .skip(batch * BATCH_SIZE)
        .limit(BATCH_SIZE)
        .get();

      if (!cardsRes.data.length) break;

      // Prepare texts for embedding (truncate to ~200 chars for token limits)
      const texts = cardsRes.data
        .map(c => (c.text || c.quote || '').slice(0, 200))
        .filter(t => t.length > 0);

      if (texts.length > 0) {
        const embeddings = await getEmbeddings(texts, config);

        // Classify each card and update
        const updatePromises = [];
        let textIdx = 0;

        for (const card of cardsRes.data) {
          const cardText = (card.text || card.quote || '').slice(0, 200);
          if (!cardText) continue;

          const result = findBestCategory(embeddings[textIdx], catEmbeddings, categories, 0.45);
          textIdx++;

          updatePromises.push(
            db.collection('cards').doc(card._id).update({
              data: {
                category: result.category || '未分类',
                categoryId: result.categoryId || '',
                categoryScore: result.score || 0,
              },
            })
          );
        }

        await Promise.all(updatePromises);
      }

      processed += cardsRes.data.length;
    }

    await updateClassifyStats(openid);

    // All batches done — mark complete
    await upsertUser(db, openid, {
      syncStatus: 'idle',
      classifyAt: new Date().toISOString(),
      classifyBatch: 0,
    });

    return { success: true, done: true, processed, total: totalCards };

  } catch (err) {
    console.error('classifyData error:', err.message, err.stack);
    await upsertUser(db, openid, { syncStatus: 'error', syncError: err.message });
    return { success: false, error: err.message };
  }
};
