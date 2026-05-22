/**
 * 阅读报告 — LLM 提示词模块
 * 每个函数接收结构化阅读数据，返回 { system, user } 提示词对
 */

function formatStats(data) {
  return [
    `## 阅读统计`,
    `- 总书籍：${data.stats.totalBooks} 本`,
    `- 总划线：${data.stats.totalHighlights} 条`,
    `- 总想法：${data.stats.totalReviews} 条`,
    `- 完读率：${data.stats.completionRate}%`,
    `- 平均每本笔记数：${data.stats.avgNotesPerBook}`,
    `- 划线/想法比：${data.stats.highlightToReviewRatio}:1`,
    `- 活跃阅读天数：${data.stats.activeDays} 天`,
  ].join('\n');
}

function formatCategories(data) {
  const lines = ['## 知识分类分布（Top 10）'];
  data.categoryDistribution.slice(0, 10).forEach((c, i) => {
    lines.push(`${i + 1}. ${c.category}：${c.count} 条（${c.percentage}%）`);
  });
  return lines.join('\n');
}

function formatBooks(data) {
  const lines = ['## 最常阅读的书（Top 10）'];
  data.topBooks.slice(0, 10).forEach((b, i) => {
    lines.push(`${i + 1}.《${b.title}》${b.author} — 划线 ${b.highlightCount}，想法 ${b.reviewCount}`);
  });
  return lines.join('\n');
}

function formatNotes(data) {
  const lines = ['## 代表性笔记摘录（最多30条）'];
  data.sampleNotes.slice(0, 30).forEach((n, i) => {
    const tag = n.type === 'review' ? '[想法]' : '[划线]';
    lines.push(`${i + 1}. ${tag}《${n.bookTitle}》${n.category || ''}`);
    lines.push(`   "${n.text.slice(0, 120)}"`);
  });
  return lines.join('\n');
}

function formatPatterns(data) {
  const p = data.readingPatterns;
  return [
    '## 阅读行为模式',
    `- 虚构/非虚构比：${p.fictionPercent}% / ${p.nonFictionPercent}%`,
    `- 最活跃领域：${p.topDomains.join('、')}`,
    `- 阅读深度指标：平均${data.stats.avgNotesPerBook}条笔记/书`,
  ].join('\n');
}

function buildFullContext(data) {
  return [formatStats(data), formatCategories(data), formatBooks(data), formatNotes(data), formatPatterns(data)].join('\n\n');
}

// ── 阅读人格画像 ──

function buildPersonaPrompt(data) {
  return {
    system: '你是一位专业的阅读行为分析师和人格洞察专家。基于用户的微信读书阅读数据（书架、划线、想法、分类），你需要生成一份有深度、有温度的阅读人格画像。语言风格：温暖、洞察、有文学感。始终返回合法的JSON。',
    user: `${buildFullContext(data)}

请生成阅读人格画像报告。返回以下JSON格式：
{
  "title": "阅读人格名称（4-8字，有创意，如'深夜型思想采集者'）",
  "subtitle": "一句话概括（15字内）",
  "description": "3段详细描述，每段100-150字。第一段描述阅读风格，第二段描述思维特征，第三段描述成长方向。",
  "traits": [
    {"name": "特质名", "score": 0到100的整数, "description": "一句话说明"}
  ],
  "traits数组包含5-6个维度": "如：知识广度、思维深度、情感共鸣、行动导向、审美偏好、探索欲",
  "signatureQuote": "从用户笔记中选一句最能代表其阅读人格的话（原文引用）",
  "summary": "50字以内的总结金句"
}`,
  };
}

// ── MBTI 阅读倾向 ──

function buildMbtiPrompt(data) {
  return {
    system: '你是一位精通MBTI人格理论的阅读行为分析师。基于用户的阅读数据，推断其"阅读型MBTI"。注意：不是判断用户的人格类型，而是分析其阅读行为更接近哪种认知倾向。始终返回合法的JSON。',
    user: `${buildFullContext(data)}

请推断用户的"阅读型MBTI"。分析逻辑：
- E/I（外向/内向）：社交类、表达类、故事类书多→E；独处哲学、系统类书多→I
- S/N（感觉/直觉）：实用经验、方法论书多→S；抽象理论、未来趋势→N
- T/F（思维/情感）：逻辑、商业、科技→T；文学、心理、情绪→F
- J/P（判断/感知）：稳定完读、集中阅读→J；兴趣跳跃、同时多本→P

返回JSON格式：
{
  "type": "4个字母的MBTI类型代码如INTJ",
  "typeName": "类型名称如'建筑师'",
  "readingTypeName": "阅读型人格名称（有创意的8字内描述）",
  "axes": [
    {
      "dimension": "E/I",
      "leftLabel": "外向探索",
      "rightLabel": "内向深潜",
      "leftPercent": 25,
      "rightPercent": 75,
      "chosen": "I",
      "description": "一段话解释为什么偏向这个方向"
    }
  ],
  "axes数组必须包含4个维度": "E/I, S/N, T/F, J/P",
  "summary": "100字以内的阅读人格总结",
  "keywords": ["关键词1", "关键词2", "关键词3", "关键词4"]
}`,
  };
}

// ── 认知茧房指数 ──

function buildCocoonPrompt(data) {
  return {
    system: '你是一位认知科学专家和阅读顾问。你需要评估用户的"认知茧房指数"——即用户的阅读是否过度集中在某些领域，缺乏多样性。评估要客观、有建设性，不是批评而是帮助。始终返回合法的JSON。',
    user: `${buildFullContext(data)}

请评估用户的认知茧房指数。评估维度：
1. 类型集中度：某一类书占比是否过高
2. 领域覆盖度：是否覆盖了人文/科技/社科/艺术/自然科学
3. 虚构非虚构比例：是否严重失衡
4. 观点多样性：是否缺少对立观点的书
5. 笔记关键词重复度：是否高度重复

返回JSON格式：
{
  "score": 0到100的整数（100=最严重的茧房）,
  "level": "等级描述如'轻度集中'",
  "levelDescription": "一段话解释这个等级意味着什么",
  "topDomains": [
    {"domain": "领域名", "percent": 占比百分比, "count": 笔记数}
  ],
  "topDomains包含前5个领域": "",
  "blindSpots": [
    {"domain": "未触及的领域", "reason": "为什么建议补充", "impact": "补充后能获得什么"}
  ],
  "blindSpots包含3-5个盲区": "",
  "diversityScore": 多样性评分0-100,
  "depthScore": 深度评分0-100,
  "recommendation": "200字以内的改善建议，语气温暖有建设性"
}`,
  };
}

// ── 破圈书单推荐 ──

function buildBreakoutPrompt(data) {
  return {
    system: '你是一位资深阅读顾问和书单策展人。基于用户的阅读偏好，你需要推荐能帮助用户突破认知边界、拓展知识面的书籍。推荐要具体（真实书名），有理由，分层次。始终返回合法的JSON。',
    user: `${buildFullContext(data)}

请为用户生成破圈书单。分三个层次：
1. 舒适区延展：和用户已有偏好相关但能稍微拓宽的书
2. 认知破壁：和用户原有偏好不同的书，挑战现有认知
3. 盲区补全：用户完全没有涉猎但非常有价值的领域

推荐原则：
- 必须是真实存在的书籍
- 每本书要有推荐理由（50字内）
- 要说明这本书能为用户带来什么新视角

返回JSON格式：
{
  "comfortZone": [
    {"title": "书名", "author": "作者", "reason": "推荐理由", "domain": "所属领域", "difficulty": "易/中/难"}
  ],
  "comfortZone推荐3-4本": "",
  "breakthrough": [
    {"title": "书名", "author": "作者", "reason": "推荐理由", "domain": "所属领域", "difficulty": "易/中/难"}
  ],
  "breakthrough推荐3-4本": "",
  "blindSpot": [
    {"title": "书名", "author": "作者", "reason": "推荐理由", "domain": "所属领域", "difficulty": "易/中/难"}
  ],
  "blindSpot推荐3-4本": "",
  "summary": "150字以内的阅读建议总结，语气鼓励且有洞察力"
}`,
  };
}

module.exports = {
  buildPersonaPrompt,
  buildMbtiPrompt,
  buildCocoonPrompt,
  buildBreakoutPrompt,
};
