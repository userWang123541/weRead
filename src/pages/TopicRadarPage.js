import { store } from '../store.js';
import { compact, formatDate } from '../utils.js';

export default {
  name: 'TopicRadarPage',
  setup() {
    const topTopics = Vue.computed(() => Object.entries(store.classified?.stats || {})
      .filter(([tag]) => tag !== '未分类')
      .map(([tag, count]) => {
        const bookSet = new Set((store.classified?.notes || [])
          .filter(note => note.category === tag)
          .map(note => note.bookTitle)
          .filter(Boolean));
        return {
          tag,
          count,
          books: bookSet.size,
          heat: Math.min(100, Math.round(count / Math.max(store.classified?.totalNotes || 1, 1) * 800)),
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 12));

    const candidateTopics = Vue.computed(() => topTopics.value.slice(0, 6).map((item, index) => ({
      ...item,
      title: item.tag.split('/').slice(-1)[0],
      signal: index < 2 ? '持续升温' : index < 4 ? '稳定关注' : '长尾潜力',
      advice: index < 2 ? '适合做专题文章或选题策划' : '适合沉淀为素材卡',
    })));

    const painPoints = Vue.computed(() => {
      const cards = (store.cardsData.cards || []).filter(card => card.note || card.quote).slice(0, 8);
      return cards.map(card => ({
        title: card.bookTitle || '未知书籍',
        text: compact(card.note || card.quote, 120),
        date: formatDate(card.createTime),
      }));
    });

    return { store, topTopics, candidateTopics, painPoints };
  },
  template: `
    <div class="page-container">
      <div class="page-title">选题雷达</div>
      <p class="page-lead">用真实阅读行为数据替代直觉，发现热度、缺口和趋势信号。</p>

      <section class="radar-layout">
        <div class="radar-main-card">
          <div class="section-header">
            <h3 class="section-title">主题热度</h3>
            <span class="section-note">来自已分类笔记统计</span>
          </div>
          <div v-if="!topTopics.length" class="empty-state">暂无分类数据，请先运行向量分类。</div>
          <div v-else class="heat-list">
            <div v-for="item in topTopics" :key="item.tag" class="heat-row">
              <div>
                <b>{{ item.tag }}</b>
                <span>{{ item.books }} 本书 · {{ item.count }} 条笔记</span>
              </div>
              <div class="heat-track"><i :style="{ width: item.heat + '%' }"></i></div>
            </div>
          </div>
        </div>

        <div class="radar-side-card">
          <h3>判断框架</h3>
          <div class="signal-box"><b>热度挖掘</b><span>高频划线和跨书重复出现的主题。</span></div>
          <div class="signal-box"><b>市场缺口</b><span>笔记/想法中反复出现的困惑与吐槽。</span></div>
          <div class="signal-box"><b>趋势判断</b><span>近期新增频率更高的主题优先处理。</span></div>
        </div>
      </section>

      <section class="candidate-grid">
        <article v-for="item in candidateTopics" :key="item.tag" class="candidate-card">
          <span>{{ item.signal }}</span>
          <h3>{{ item.title }}</h3>
          <p>{{ item.tag }}</p>
          <b>{{ item.advice }}</b>
        </article>
      </section>

      <section class="home-panel">
        <div class="section-header">
          <h3 class="section-title">痛点素材池</h3>
          <span class="section-note">从个人想法和划线中抽样，用于选题判断</span>
        </div>
        <div class="pain-list">
          <div v-for="item in painPoints" :key="item.title + item.text" class="pain-row">
            <b>{{ item.title }}</b>
            <p>{{ item.text }}</p>
            <span>{{ item.date }}</span>
          </div>
        </div>
      </section>
    </div>
  `,
};
