import { store } from '../store.js';
import { formatDate, compact, typeLabel } from '../utils.js';

export default {
  name: 'TimelinePage',
  setup() {
    const timelineData = Vue.computed(() => {
      const cards = store.cardsData.cards || [];
      const groups = new Map();
      cards.forEach(card => {
        if (!card.createTime) return;
        const d = new Date(card.createTime * 1000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!groups.has(key)) groups.set(key, { key, label: `${d.getFullYear()}年${d.getMonth() + 1}月`, cards: [] });
        groups.get(key).cards.push(card);
      });
      return [...groups.values()].reverse().slice(0, 12);
    });

    return { store, timelineData, formatDate, compact, typeLabel };
  },
  template: `
    <div class="page-container">
      <div class="page-title">阅读时间线</div>

      <div v-if="!timelineData.length" class="empty-state">暂无数据，请先同步微信读书。</div>

      <div v-else class="tl-list">
        <div v-for="group in timelineData" :key="group.key" class="tl-month">
          <div class="tl-month-header">
            <span class="tl-month-label">{{ group.label }}</span>
            <span class="tl-month-count">{{ group.cards.length }} 条记录</span>
          </div>
          <div class="tl-month-cards">
            <div v-for="card in group.cards.slice(0, 6)" :key="card.cardId" class="tl-card">
              <div class="tl-card-top">
                <span class="tl-card-book">{{ card.bookTitle }}</span>
                <span class="card-type" :class="card.type">{{ typeLabel(card.type) }}</span>
              </div>
              <blockquote v-if="card.quote" class="tl-card-quote">{{ compact(card.quote, 120) }}</blockquote>
              <div v-if="card.note" class="tl-card-note">{{ compact(card.note, 100) }}</div>
              <div class="tl-card-date">{{ formatDate(card.createTime) }}</div>
            </div>
            <div v-if="group.cards.length > 6" class="tl-more">
              还有 {{ group.cards.length - 6 }} 条...
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
};
