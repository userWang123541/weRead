import { store, request } from '../store.js';
import { compact, formatDate } from '../utils.js';

export default {
  name: 'StudioPage',
  setup() {
    const query = Vue.ref('');
    const tone = Vue.ref('种草风');
    const generatedCopy = Vue.ref('');
    const generating = Vue.ref(false);
    const sourceCards = Vue.ref([]);

    const toneOptions = ['种草风', '学术风', '吐槽风', '编辑推荐风'];

    async function searchCards() {
      const keyword = query.value.trim();
      const params = new URLSearchParams({ page: '1', limit: '18' });
      if (keyword) params.set('search', keyword);
      const data = await request(`/api/cards?${params.toString()}`);
      sourceCards.value = (data.cards || []).filter(card => card.quote || card.note);
    }

    let searchTimer = null;
    Vue.watch(query, () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(searchCards, 300);
    });

    Vue.onMounted(() => searchCards());

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

    const readingDna = Vue.computed(() => [
      { label: '主导主题', value: focusTags.value[0] || '待分类' },
      { label: '素材数量', value: sourceCards.value.length },
      { label: '书籍覆盖', value: new Set(sourceCards.value.map(card => card.bookTitle).filter(Boolean)).size },
      { label: '更新时间', value: formatDate(store.stats.generatedAt || store.stats.fetchedAt) },
    ]);

    async function onGenerate() {
      if (generating.value || !sourceCards.value.length) return;
      generating.value = true;
      try {
        const topic = query.value.trim() || focusTags.value[0] || '阅读感悟';
        const result = await request('/api/studio/generate', {
          method: 'POST',
          body: JSON.stringify({
            topic,
            tone: tone.value,
            cards: sourceCards.value,
          }),
        });
        generatedCopy.value = result.content || '生成失败，请重试。';
      } catch (err) {
        generatedCopy.value = '生成失败：' + err.message;
      } finally {
        generating.value = false;
      }
    }

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
      generating,
      readingDna,
      onGenerate,
      copyText,
    };
  },
  template: `
    <div class="page-container studio-page">
      <div class="page-title">内容工坊</div>
      <p class="page-lead">基于你的真实阅读笔记，用 AI 生成有温度的内容文案。</p>

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
          <el-button
            type="primary"
            :loading="generating"
            :disabled="generating || !sourceCards.length"
            @click="onGenerate"
            style="margin-top: 12px; width: 100%"
          >
            {{ generating ? 'AI 正在创作...' : 'AI 生成文案' }}
          </el-button>
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
            <el-button v-if="generatedCopy" type="primary" @click="copyText">复制文案</el-button>
          </div>
          <pre v-if="generatedCopy">{{ generatedCopy }}</pre>
          <div v-else class="empty-state" style="min-height: 220px; display: flex; align-items: center; justify-content: center;">
            输入关键词，选择风格，点击「AI 生成文案」
          </div>
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
