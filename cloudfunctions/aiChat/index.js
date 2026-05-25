const cloud = require('wx-server-sdk');
const https = require('https');
const http = require('http');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const CHAT_BASE_URL = process.env.LLM_CHAT_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1';
const CHAT_API_KEY = process.env.LLM_CHAT_API_KEY || '';
const CHAT_MODEL = process.env.LLM_CHAT_MODEL || 'mimo-v2.5-pro';

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const question = (event.question || '').trim();

  if (!question) return { error: '请输入问题' };

  try {
    const notes = await searchNotes(db, openid, question);
    const answer = await callLLM(question, notes);
    return {
      answer: answer,
      sources: notes.slice(0, 5).map(n => ({
        bookTitle: n.bookTitle || '',
        quote: (n.quote || n.text || '').slice(0, 120)
      }))
    };
  } catch (err) {
    console.error('aiChat error:', err);
    return { error: err.message || 'AI 回答失败，请稍后重试' };
  }
};

async function searchNotes(db, openid, query) {
  const terms = query.split(/[\s,，、;；]+/).map(t => t.trim()).filter(Boolean);
  if (!terms.length) return [];

  const escaped = terms[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = db.RegExp({ regexp: escaped, options: 'i' });

  try {
    const res = await db.collection('cards')
      .where({ _openid: openid, text: regex })
      .limit(30)
      .get();
    return res.data || [];
  } catch (e) {
    console.error('searchNotes error:', e);
    return [];
  }
}

function httpPost(urlStr, body, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      timeout: 50000
    };
    const req = lib.request(options, (res) => {
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

async function callLLM(question, notes) {
  if (!CHAT_API_KEY) {
    return 'AI 对话功能未配置，请在云函数环境变量中设置 LLM_CHAT_API_KEY。';
  }

  const contextText = notes.slice(0, 15).map((n, i) => {
    const parts = [];
    if (n.bookTitle) parts.push('【' + n.bookTitle + '】');
    if (n.chapterTitle) parts.push(n.chapterTitle);
    if (n.quote || n.text) parts.push((n.quote || n.text).slice(0, 300));
    if (n.note) parts.push('想法：' + n.note.slice(0, 200));
    return (i + 1) + '. ' + parts.join(' | ');
  }).join('\n');

  const systemPrompt = '你是"拾光"，一个阅读笔记 AI 助手。基于用户在微信读书中的划线、想法和笔记来回答问题。\n' +
    '规则：只基于提供的笔记内容回答；如果笔记中没有相关内容，诚实说明；回答简洁有条理，使用 markdown；引用原文用 > 引用格式并标注书名；用中文回答。';

  const userPrompt = (contextText
    ? '以下是我的阅读笔记摘录：\n\n' + contextText + '\n\n'
    : '（未找到相关笔记）\n\n')
    + '我的问题：' + question;

  const resp = await httpPost(CHAT_BASE_URL + '/chat/completions', {
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 1500
  }, {
    'Authorization': 'Bearer ' + CHAT_API_KEY
  });

  if (resp.status !== 200) {
    throw new Error('LLM API 返回错误 (' + resp.status + '): ' + resp.body.slice(0, 200));
  }

  const data = JSON.parse(resp.body);
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '未能生成回答';
}
