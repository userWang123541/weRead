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
      .slice(0, 5));

    const recentCards = Vue.computed(() => (store.cardsData.cards || []).slice(0, 3));

    const todayTopic = Vue.computed(() => {
      const cats = topCategories.value;
      return cats.length ? cats[0].tag : '等待分类数据';
    });

    const topicCount = Vue.computed(() => {
      return Object.keys(store.classified?.stats || {}).filter(k => k !== '未分类').length;
    });

    const readingDays = Vue.computed(() => {
      const books = store.raw?.books || [];
      if (!books.length) return 0;
      const dates = new Set();
      books.forEach(book => {
        (book.bookmarks || []).forEach(b => {
          if (b.createTime) {
            const d = new Date(b.createTime * 1000);
            dates.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
          }
        });
      });
      return dates.size;
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
      topicCount,
      readingDays,
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
        <h1 class="mg-slogan">阅读不是记录，是再组织</h1>
        <p class="mg-sub">把微信读书的划线、想法、书评，变成可检索、可判断、可创作的生产力素材。</p>
      </section>

      <!-- 核心数据 -->
      <section class="mg-stats">
        <div class="mg-stat">
          <div class="mg-stat-val">{{ (store.stats.totalBooks || 0).toLocaleString() }}</div>
          <div class="mg-stat-label">书籍</div>
        </div>
        <div class="mg-stat">
          <div class="mg-stat-val">{{ (store.stats.totalHighlights || 0).toLocaleString() }}</div>
          <div class="mg-stat-label">划线</div>
        </div>
        <div class="mg-stat">
          <div class="mg-stat-val">{{ (store.stats.totalReviews || 0).toLocaleString() }}</div>
          <div class="mg-stat-label">想法</div>
        </div>
        <div class="mg-stat">
          <div class="mg-stat-val">{{ (store.stats.totalCards || 0).toLocaleString() }}</div>
          <div class="mg-stat-label">资料卡</div>
        </div>
        <div class="mg-stat">
          <div class="mg-stat-val">{{ (store.classified?.totalNotes || 0).toLocaleString() }}</div>
          <div class="mg-stat-label">已分类</div>
        </div>
        <div class="mg-stat">
          <div class="mg-stat-val">{{ readingDays }}</div>
          <div class="mg-stat-label">阅读日</div>
        </div>
      </section>

      <!-- 今日主题 + 金句 -->
      <section class="mg-hero-row">
        <div class="mg-topic-card">
          <div class="mg-card-label">今日主题</div>
          <div class="mg-topic-tags">
            <span v-for="item in topCategories" :key="item.tag" class="mg-tag">
              {{ item.tag.split('/').pop() }}
            </span>
            <span v-if="!topCategories.length" class="mg-tag">等待分类数据</span>
          </div>
          <div class="mg-topic-count">{{ topicCount }} 个知识主题 · {{ store.classified?.totalNotes || 0 }} 条已归类笔记</div>
          <div class="mg-actions">
            <el-button :disabled="store.loading" @click="syncData">
              同步微信读书
            </el-button>
            <el-button :disabled="store.loading" @click="classifyData">
              向量分类
            </el-button>
            <el-button :disabled="store.loading" @click="loadData">
              刷新数据
            </el-button>
          </div>
        </div>
        <div class="mg-quote-card">
          <div class="mg-quote-icon">&ldquo;</div>
          <blockquote class="mg-quote-text">真正改变人的，不是读过多少书，而是你如何重新组织自己。</blockquote>
          <div class="mg-quote-source">&mdash; 阅读工作室</div>
        </div>
      </section>

      <!-- 功能入口 -->
      <section class="mg-scenes">
        <article class="mg-scene" @click="go('/notes')">
          <div class="mg-scene-num">{{ (store.stats.totalCards || 0).toLocaleString() }}</div>
          <h3>笔记管家</h3>
          <p>跨书检索、分类管理、查看原文</p>
        </article>
        <article class="mg-scene" @click="go('/recall')">
          <div class="mg-scene-num">AI</div>
          <h3>笔记召回</h3>
          <p>描述你想找的内容，AI 从笔记中召回</p>
        </article>
        <article class="mg-scene" @click="go('/reports')">
          <div class="mg-scene-num">6</div>
          <h3>阅读报告</h3>
          <p>阅读人格、MBTI 倾向、认知茧房分析</p>
        </article>
        <article class="mg-scene" @click="go('/categories')">
          <div class="mg-scene-num">{{ topicCount }}</div>
          <h3>分类管理</h3>
          <p>管理知识分类体系，调整归类</p>
        </article>
      </section>

      <!-- 最近素材 -->
      <section class="mg-recent">
        <div class="mg-section-head">
          <h2>最近素材</h2>
          <el-button text @click="go('/notes')">查看全部 &rarr;</el-button>
        </div>
        <div v-if="!recentCards.length" class="empty-state">暂无资料卡，请先同步微信读书数据。</div>
        <div v-else class="mg-recent-list">
          <div v-for="card in recentCards" :key="card.cardId" class="mg-recent-item">
            <div class="mg-recent-meta">
              <span class="mg-recent-book">{{ card.bookTitle || '未知书籍' }}</span>
              <span class="mg-recent-date">{{ formatDate(card.createTime) }}</span>
            </div>
            <blockquote v-if="card.quote" class="mg-recent-quote">{{ compact(card.quote, 200) }}</blockquote>
            <div v-if="card.note" class="mg-recent-note">{{ compact(card.note, 160) }}</div>
          </div>
        </div>
      </section>

    </div>
  `,
};
