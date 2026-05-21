import { store, getters, loadData, syncData, rebuildCards, classifyData, openOriginal } from '../store.js';
import { compact, formatDate, typeLabel } from '../utils.js';

export default {
  name: 'DashboardPage',
  setup() {
    const recentCards = Vue.computed(() => (store.cardsData.cards || []).slice(0, 8));

    function goToCards() {
      window.location.hash = '#/cards';
    }

    return {
      store,
      subtitle: getters.subtitle,
      statItems: getters.statItems,
      recentCards,
      loadData,
      syncData,
      rebuildCards,
      classifyData,
      openOriginal,
      goToCards,
      compact,
      formatDate,
      typeLabel,
    };
  },
  template: `
    <div class="page-container">
      <div class="page-title">仪表盘</div>
      <p style="color: var(--text-secondary); margin: -12px 0 20px; font-size: 13px;">{{ subtitle }}</p>

      <div class="dashboard-stats">
        <div v-for="item in statItems" :key="item.label" class="stat-card"
          :class="{
            accent: item.label === '书籍' || item.label === '资料卡',
            gold: item.label === '划线',
            blue: item.label === '想法',
            red: item.label === '未分类'
          }"
        >
          <div class="stat-value">{{ item.value.toLocaleString() }}</div>
          <div class="stat-label">{{ item.label }}</div>
        </div>
      </div>

      <div class="dashboard-section">
        <div class="section-header">
          <h3 class="section-title">快捷操作</h3>
        </div>
        <div class="quick-actions">
          <div class="action-row">
            <el-button type="primary" :disabled="store.loading" @click="syncData">
              <el-icon style="margin-right: 6px"><Refresh /></el-icon>同步数据
            </el-button>
            <el-button :disabled="store.loading" @click="rebuildCards">重建卡片</el-button>
            <el-button :disabled="store.loading" @click="classifyData">向量分类</el-button>
            <el-button :disabled="store.loading" @click="loadData">刷新数据</el-button>
          </div>
          <div class="action-status">{{ store.status }}</div>
        </div>
      </div>

      <div class="dashboard-section">
        <div class="section-header">
          <h3 class="section-title">最近资料卡</h3>
          <el-button text type="primary" @click="goToCards">查看全部 &rarr;</el-button>
        </div>
        <div v-if="!recentCards.length" class="empty-state">暂无资料卡，请先同步微信读书数据。</div>
        <div v-else class="recent-cards">
          <div
            v-for="card in recentCards"
            :key="card.cardId"
            class="recent-card"
            @click="goToCards"
          >
            <div class="rc-book">{{ card.bookTitle || '未知书籍' }}</div>
            <blockquote v-if="card.quote" class="rc-quote">{{ compact(card.quote, 160) }}</blockquote>
            <div v-if="card.note" class="rc-note">{{ compact(card.note, 120) }}</div>
            <div class="rc-meta">
              <span>{{ formatDate(card.createTime) }}</span>
              <span class="card-type" :class="card.type">{{ typeLabel(card.type) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
};
