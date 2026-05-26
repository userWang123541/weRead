import { store, loadAllCards } from '../store.js';
import { compact, formatDate, typeLabel } from '../utils.js';

export default {
  name: 'ReviewPage',
  setup() {
    const REVIEW_KEY = 'weread_reviewed_ids';
    const reviewCards = Vue.ref([]);
    const reviewedSet = Vue.ref(new Set());

    function loadReviewed() {
      try {
        const arr = JSON.parse(localStorage.getItem(REVIEW_KEY) || '[]');
        reviewedSet.value = new Set(arr);
      } catch { reviewedSet.value = new Set(); }
    }

    function saveReviewed() {
      localStorage.setItem(REVIEW_KEY, JSON.stringify([...reviewedSet.value]));
    }

    function pickRandom() {
      const all = store.cardsData.cards || [];
      const unreviewed = all.filter(c => !reviewedSet.value.has(c.cardId));
      const pool = unreviewed.length >= 5 ? unreviewed : all;
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      reviewCards.value = shuffled.slice(0, 5);
    }

    function markReviewed(card) {
      const s = new Set(reviewedSet.value);
      s.add(card.cardId);
      reviewedSet.value = s;
      saveReviewed();
    }

    Vue.onMounted(() => {
      loadReviewed();
      if (!(store.cardsData.cards?.length > 10)) {
        loadAllCards().then(() => pickRandom());
      } else {
        pickRandom();
      }
    });

    const totalCards = Vue.computed(() => (store.cardsData.cards || []).length);
    const reviewedCount = Vue.computed(() => reviewedSet.value.size);
    const progress = Vue.computed(() => totalCards.value ? Math.round(reviewedCount.value / totalCards.value * 100) : 0);

    return { store, reviewCards, pickRandom, markReviewed, reviewedSet, totalCards, reviewedCount, progress, compact, formatDate, typeLabel };
  },
  template: `
    <div class="page-container">
      <div class="page-title">划线回顾</div>

      <div class="rv-header">
        <div class="rv-progress">
          <span>已复习 {{ reviewedCount }} / {{ totalCards }}</span>
          <div class="rv-progress-bar">
            <div class="rv-progress-fill" :style="{ width: progress + '%' }"></div>
          </div>
          <span class="rv-progress-pct">{{ progress }}%</span>
        </div>
        <el-button @click="pickRandom">换一批</el-button>
      </div>

      <div v-if="!reviewCards.length" class="empty-state">暂无资料卡，请先同步微信读书。</div>

      <div v-else class="rv-list">
        <div v-for="card in reviewCards" :key="card.cardId" class="rv-card">
          <div class="rv-card-header">
            <span class="rv-card-book">{{ card.bookTitle }}</span>
            <span class="card-type" :class="card.type">{{ typeLabel(card.type) }}</span>
          </div>
          <div v-if="card.chapterTitle" class="rv-card-chapter">{{ card.chapterTitle }}</div>
          <blockquote v-if="card.quote" class="card-quote">{{ compact(card.quote, 300) }}</blockquote>
          <div v-if="card.note" class="card-note-text">{{ compact(card.note, 200) }}</div>
          <div class="rv-card-footer">
            <span>{{ formatDate(card.createTime) }}</span>
            <el-button
              size="small"
              :type="reviewedSet.has(card.cardId) ? 'success' : 'default'"
              @click="markReviewed(card)"
            >
              {{ reviewedSet.has(card.cardId) ? '已复习' : '标为已复习' }}
            </el-button>
          </div>
        </div>
      </div>
    </div>
  `,
};
