const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function deleteCollection(openid, collectionName) {
  const col = db.collection(collectionName);
  const batchSize = 100;
  let hasMore = true;
  while (hasMore) {
    const res = await col.where({ _openid: openid }).limit(batchSize).get();
    const data = res.data || [];
    if (!data.length) {
      hasMore = false;
      break;
    }
    await Promise.all(data.map(doc => col.doc(doc._id).remove()));
  }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action;

  if (action === 'list') {
    const res = await db.collection('taxonomy').where({ _openid: openid }).limit(1).get();
    return { categories: (res.data[0] && res.data[0].categories) || [], docId: (res.data[0] && res.data[0]._id) || '' };
  }

  if (action === 'save') {
    const categories = event.categories || [];
    const docId = event.docId;
    if (docId) {
      await db.collection('taxonomy').doc(docId).update({ data: { categories } });
    } else {
      await db.collection('taxonomy').add({ data: { _openid: openid, categories } });
    }
    return { success: true };
  }

  if (action === 'countNotes') {
    const cards = await db.collection('cards').where({ _openid: openid }).field({ category: true }).limit(1000).get();
    const counts = {};
    (cards.data || []).forEach(c => {
      const cat = c.category || '';
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    });
    return { counts };
  }

  if (action === 'updateCardCategory') {
    const cardId = event.cardId;
    const category = event.category || '未分类';
    const categoryId = event.categoryId || '';
    if (!cardId) return { success: false, error: 'cardId is required' };

    const cardRes = await db.collection('cards').where({ _openid: openid, cardId }).limit(1).get();
    let cardDoc = cardRes.data[0];
    if (!cardDoc) {
      try {
        const byId = await db.collection('cards').doc(cardId).get();
        if (byId.data && byId.data._openid === openid) cardDoc = byId.data;
      } catch (err) {}
    }
    if (!cardDoc) return { success: false, error: 'card not found' };

    await db.collection('cards').doc(cardDoc._id).update({
      data: { category, categoryId, userEdited: true }
    });
    return { success: true, cardId, category, categoryId };
  }

  if (action === 'resetUser') {
    const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get();
    if (userRes.data.length > 0) {
      await db.collection('users').doc(userRes.data[0]._id).update({
        data: { apiKey: '', syncStatus: 'idle', syncError: '', stats: {}, quotes: [], fetchedAt: '', syncedAt: '' }
      });
    }
    await deleteCollection(openid, 'books');
    await deleteCollection(openid, 'cards');
    await deleteCollection(openid, 'taxonomy');
    return { success: true };
  }

  return { error: 'unknown action' };
};
