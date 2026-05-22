import { store, getters, loadData, syncData, rebuildCards, classifyData } from '../store.js';
import { compact, formatDate } from '../utils.js';

export default {
  name: 'DashboardPage',
  setup() {
    const router = VueRouter.useRouter();

    const topCategories = Vue.computed(() => Object.entries(store.classified?.stats || {})
      .filter(([tag]) => tag !== '未分类')
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3));

    const recentCards = Vue.computed(() => (store.cardsData.cards || []).slice(0, 3));

    const todayTopic = Vue.computed(() => {
      const cats = topCategories.value;
      return cats.length ? cats[0].tag : '等待分类数据';
    });

    function go(route) {
      router.push(route);
    }

    return {
      store,
      subtitle: getters.subtitle,
      statItems: getters.statItems,
      topCategories,
      recentCards,
      todayTopic,
      go,
      loadData,
      syncData,
      rebuildCards,
      classifyData,
      compact,
      formatDate,
    };
  },
  template: `
    <div class="magazine-home">

      <!-- Slogan Hero -->
      <section class="mg-hero">
        <div class="mg-hero-inner">
          <h1 class="mg-slogan">阅读不是记录，是再组织</h1>
          <p class="mg-sub">把划线、想法、书评变成可检索、可判断、可创作的生产力素材。</p>
        </div>
      </section>

      <!-- 核心数据 -->
      <section class="mg-stats">
        <div v-for="item in statItems" :key="item.label" class="mg-stat">
          <div class="mg-stat-val">{{ item.value.toLocaleString() }}</div>
          <div class="mg-stat-label">{{ item.label }}</div>
        </div>
      </section>

      <!-- 今日主题 + 金句 -->
      <section class="mg-hero-row">
        <div class="mg-topic-card">
          <div class="mg-card-label">今日主题</div>
          <div class="mg-topic-tags">
            <span v-for="item in topCategories" :key="item.tag" class="mg-tag">{{ item.tag }}</span>
            <span v-if="!topCategories.length" class="mg-tag">等待分类数据</span>
          </div>
          <div class="mg-topic-count">{{ topCategories.length }} 个高频主题</div>
          <div class="mg-actions">
            <el-button :disabled="store.loading" @click="syncData">同步数据</el-button>
            <el-button :disabled="store.loading" @click="classifyData">向量分类</el-button>
            <el-button :disabled="store.loading" @click="loadData">刷新</el-button>
          </div>
        </div>
        <div class="mg-quote-card">
          <div class="mg-quote-icon">"</div>
          <blockquote class="mg-quote-text">真正改变人的，不是读过多少书，而是你如何重新组织自己。</blockquote>
          <div class="mg-quote-source">— 阅读工作室</div>
        </div>
      </section>

      <!-- 功能入口 -->
      <section class="mg-scenes">
        <article class="mg-scene" @click="go('/notes')">
          <div class="mg-scene-num">{{ store.stats.totalCards || 0 }}</div>
          <h3>笔记管家</h3>
          <p>跨书检索、主题聚类、划线管理</p>
        </article>
        <article class="mg-scene" @click="go('/radar')">
          <div class="mg-scene-num">{{ topCategories.length }}</div>
          <h3>选题雷达</h3>
          <p>热度分析、缺口发现、趋势判断</p>
        </article>
        <article class="mg-scene" @click="go('/studio')">
          <div class="mg-scene-num">—</div>
          <h3>内容工坊</h3>
          <p>金句卡片、文案生成、阅读 DNA</p>
        </article>
        <article class="mg-scene" @click="go('/graph')">
          <div class="mg-scene-num">{{ Object.keys(store.classified?.stats || {}).length }}</div>
          <h3>知识图谱</h3>
          <p>跨书关联、观点对比、难点预警</p>
        </article>
      </section>

      <!-- 最近素材 -->
      <section class="mg-recent">
        <div class="mg-section-head">
          <h2>最近素材</h2>
          <el-button text @click="go('/notes')">查看全部</el-button>
        </div>
        <div v-if="!recentCards.length" class="empty-state">暂无资料卡，请先同步微信读书。</div>
        <div v-else class="mg-recent-list">
          <div v-for="card in recentCards" :key="card.cardId" class="mg-recent-item">
            <div class="mg-recent-meta">
              <span class="mg-recent-book">{{ card.bookTitle || '未知书籍' }}</span>
              <span class="mg-recent-date">{{ formatDate(card.createTime) }}</span>
            </div>
            <blockquote v-if="card.quote" class="mg-recent-quote">{{ compact(card.quote, 180) }}</blockquote>
            <div v-if="card.note" class="mg-recent-note">{{ compact(card.note, 140) }}</div>
          </div>
        </div>
      </section>

    </div>
  `,
};
