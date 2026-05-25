const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    const res = await db.collection('users').where({ _openid: openid }).limit(1).get();

    if (res.data.length === 0) {
      // 新用户，创建空文档
      await db.collection('users').add({
        data: { _openid: openid, syncStatus: 'idle', apiKey: '', stats: {}, syncedAt: '' }
      });
      return { exists: false, hasKey: false, syncStatus: 'idle', hasData: false, stats: {} };
    }

    const user = res.data[0];
    const hasKey = !!user.apiKey;
    const stats = user.stats || {};
    const hasData = !!(stats.books || stats.totalBooks || stats.cards || stats.totalCards);

    return {
      exists: true,
      hasKey: hasKey,
      syncStatus: user.syncStatus || 'idle',
      syncError: user.syncError || '',
      hasData: hasData,
      stats: stats,
      classifyBatch: user.classifyBatch || 0,
      syncedAt: user.syncedAt || ''
    };
  } catch (err) {
    console.error('checkUser error:', err);
    return { exists: false, hasKey: false, syncStatus: 'idle', hasData: false, stats: {} };
  }
};
