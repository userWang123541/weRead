import { store } from '../store.js';
import { compact, formatDate } from '../utils.js';

export default {
  name: 'StudioPage',
  setup() {
    const query = Vue.ref('');
    const tone = Vue.ref('种草风');

    const toneOptions = ['种草风', '学术风', '吐槽风', '编辑推荐风'];

    const sourceCards = Vue.computed(() => {
      const keyword = query.value.trim().toLowerCase();
      const cards = store.cardsData.cards || [];
      const filtered = keyword
        ? cards.filter(card => [card.quote, card.note, card.bookTitle, card.author, ...(card.tags || [])]
          .join('\n')
          .toLowerCase()
          .includes(keyword))
        : cards;
      return filtered.filter(card => card.quote || card.note).slice(0, 18);
    });

    const quoteCards = Vue.computed(() => sourceCards.value
      .filter(card => card.quote)
      .slice(0, 6)
      .map(card => ({
        title: card.bookTitle || '未知书籍',
        quote: compact(card.quote, 150),
        note: compact(card.note || '', 80),
      })));

    const focusTags = Vue.computed(() => Object.entries(store.classified?.stats || {})
      .filter(([tag]) => tag !== '未分类')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag.split('/').slice(-1)[0]));

    const generatedCopy = Vue.computed(() => {
      const topic = query.value.trim() || focusTags.value[0] || '最近的阅读主题';
      const count = sourceCards.value.length;
      const firstQuote = quoteCards.value[0]?.quote || '我重新整理了这批阅读划线，发现真正有价值的是反复出现的主题。';
      const map = {
        '种草风': `最近整理「${topic}」相关读书笔记，发现 ${count} 条值得反复看的素材。\n\n最打动我的是这句：${firstQuote}\n\n它适合写成一组读书卡片：先用一个生活场景切入，再给出书中观点，最后落到一个可执行的小建议。`,
        '学术风': `围绕「${topic}」形成的阅读材料共 ${count} 条，可归纳为概念界定、现象解释和行动策略三个层次。\n\n代表性文本：${firstQuote}\n\n建议后续将这些材料按论点、证据和反例拆分，形成一篇结构化综述。`,
        '吐槽风': `本来只是想随手查「${topic}」，结果翻出 ${count} 条笔记，越看越像是在给自己开会。\n\n比如这句：${firstQuote}\n\n适合写成“我以前怎么没看懂这件事”的反差型内容，轻一点，别太像读书报告。`,
        '编辑推荐风': `「${topic}」具备明确的内容延展价值：素材数量 ${count} 条，覆盖多本书的重复关注点。\n\n核心引文：${firstQuote}\n\n可以策划为系列内容：概念入门、案例拆解、行动清单、书单推荐。`,
      };
      return map[tone.value];
    });

    const readingDna = Vue.computed(() => [
      { label: '主导主题', value: focusTags.value[0] || '待分类' },
      { label: '素材数量', value: sourceCards.value.length },
      { label: '书籍覆盖', value: new Set(sourceCards.value.map(card => card.bookTitle).filter(Boolean)).size },
      { label: '更新时间', value: formatDate(store.stats.generatedAt || store.stats.fetchedAt) },
    ]);

    function copyText() {
      navigator.clipboard?.writeText(generatedCopy.value).catch(() => {});
      window.ElementPlus?.ElMessage?.success('文案已复制。');
    }

    return {
      store,
      query,
      tone,
      toneOptions,
      sourceCards,
      quoteCards,
      focusTags,
      generatedCopy,
      readingDna,
      copyText,
    };
  },
  template: `
    <div class="page-container studio-page">
      <div class="page-title">内容工坊</div>
      <p class="page-lead">把微信读书划线、个人想法和主题统计整理成可发布的小红书素材。</p>

      <section class="studio-compose">
        <div class="studio-control">
          <div class="eyebrow">素材条件</div>
          <el-input
            v-model="query"
            type="textarea"
            :rows="4"
            resize="none"
            placeholder="输入主题关键词，例如：认知偏差、亲密关系、时间管理"
          />
          <el-segmented v-model="tone" :options="toneOptions" class="studio-tone" />
          <div class="studio-dna">
            <div v-for="item in readingDna" :key="item.label">
              <span>{{ item.label }}</span>
              <b>{{ item.value }}</b>
            </div>
          </div>
        </div>

        <div class="studio-output">
          <div class="section-header">
            <h3 class="section-title">成稿预览</h3>
            <el-button type="primary" @click="copyText">复制文案</el-button>
          </div>
          <pre>{{ generatedCopy }}</pre>
        </div>
      </section>

      <section class="quote-board">
        <div class="section-header">
          <h3 class="section-title">金句卡片</h3>
          <span class="section-note">{{ sourceCards.length }} 条候选素材</span>
        </div>
        <div v-if="!quoteCards.length" class="empty-state">暂无匹配划线，请换一个关键词或先同步数据。</div>
        <div v-else class="quote-card-grid">
          <article v-for="card in quoteCards" :key="card.title + card.quote" class="quote-piece">
            <span>{{ card.title }}</span>
            <p>{{ card.quote }}</p>
            <b v-if="card.note">{{ card.note }}</b>
          </article>
        </div>
      </section>
    </div>
  `,
};
