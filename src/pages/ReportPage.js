import { store, getters } from '../store.js';
import { formatDate } from '../utils.js';

export default {
  name: 'ReportPage',
  setup() {
    const selectedYear = Vue.ref(new Date().getFullYear());

    const yearOptions = Vue.computed(() => {
      const cards = store.cardsData.cards || [];
      const years = new Set();
      cards.forEach(c => {
        if (c.createTime) years.add(new Date(c.createTime * 1000).getFullYear());
      });
      years.add(new Date().getFullYear());
      return [...years].sort((a, b) => b - a);
    });

    const yearCards = Vue.computed(() => {
      const y = selectedYear.value;
      return (store.cardsData.cards || []).filter(c => {
        if (!c.createTime) return false;
        return new Date(c.createTime * 1000).getFullYear() === y;
      });
    });

    const yearStats = Vue.computed(() => {
      const cards = yearCards.value;
      const books = new Set(cards.map(c => c.bookId));
      const highlights = cards.filter(c => c.type === 'highlight').length;
      const reviews = cards.filter(c => c.type === 'review' || c.type === 'linked').length;
      const days = new Set(cards.map(c => {
        const d = new Date(c.createTime * 1000);
        return `${d.getMonth()}-${d.getDate()}`;
      }));
      return { books: books.size, highlights, reviews, cards: cards.length, activeDays: days.size };
    });

    const monthlyData = Vue.computed(() => {
      const months = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        label: `${i + 1}月`,
        count: 0,
      }));
      yearCards.value.forEach(c => {
        const m = new Date(c.createTime * 1000).getMonth();
        months[m].count += 1;
      });
      const max = Math.max(...months.map(m => m.count), 1);
      return months.map(m => ({ ...m, pct: Math.round(m.count / max * 100) }));
    });

    const topCategories = Vue.computed(() => {
      const map = new Map();
      yearCards.value.forEach(card => {
        const cls = store.classified?.notes;
        if (!cls) return;
        const key = `${card.bookId}|${card.type === 'linked' ? 'highlight' : card.type}|${(card.quote || card.note || '').slice(0, 60)}`;
        for (const note of cls) {
          const noteKey = `${note.bookId}|${note.type || ''}|${(note.text || '').slice(0, 60)}`;
          if (noteKey === key && note.category && note.category !== '未分类') {
            map.set(note.category, (map.get(note.category) || 0) + 1);
            break;
          }
        }
      });
      return [...map.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    });

    const topBooks = Vue.computed(() => {
      const map = new Map();
      yearCards.value.forEach(c => {
        const key = c.bookTitle || '未知';
        if (!map.has(key)) map.set(key, { title: key, author: c.author, count: 0 });
        map.get(key).count += 1;
      });
      return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 8);
    });

    return { selectedYear, yearOptions, yearStats, monthlyData, topCategories, topBooks };
  },
  template: `
    <div class="page-container">
      <div class="rpt-header">
        <div class="page-title">阅读报告</div>
        <el-select v-model="selectedYear" style="width: 100px">
          <el-option v-for="y in yearOptions" :key="y" :label="y + '年'" :value="y" />
        </el-select>
      </div>

      <!-- 统计概览 -->
      <div class="rpt-stats">
        <div class="rpt-stat"><div class="rpt-stat-val">{{ yearStats.books }}</div><div class="rpt-stat-label">本书</div></div>
        <div class="rpt-stat"><div class="rpt-stat-val">{{ yearStats.cards }}</div><div class="rpt-stat-label">条记录</div></div>
        <div class="rpt-stat"><div class="rpt-stat-val">{{ yearStats.highlights }}</div><div class="rpt-stat-label">条划线</div></div>
        <div class="rpt-stat"><div class="rpt-stat-val">{{ yearStats.reviews }}</div><div class="rpt-stat-label">条想法</div></div>
        <div class="rpt-stat"><div class="rpt-stat-val">{{ yearStats.activeDays }}</div><div class="rpt-stat-label">个活跃日</div></div>
      </div>

      <!-- 月度趋势 -->
      <div class="rpt-section">
        <h3 class="section-title">月度趋势</h3>
        <div class="rpt-chart">
          <div v-for="m in monthlyData" :key="m.month" class="rpt-bar-col">
            <div class="rpt-bar-val">{{ m.count || '' }}</div>
            <div class="rpt-bar-track">
              <div class="rpt-bar-fill" :style="{ height: m.pct + '%' }"></div>
            </div>
            <div class="rpt-bar-label">{{ m.label }}</div>
          </div>
        </div>
      </div>

      <div class="rpt-two-col">
        <!-- 主题分布 -->
        <div class="rpt-section">
          <h3 class="section-title">主题分布</h3>
          <div v-if="!topCategories.length" class="empty-state" style="padding: 20px">暂无分类数据，请先运行向量分类。</div>
          <div v-else class="rpt-rank">
            <div v-for="(item, i) in topCategories" :key="item.tag" class="rpt-rank-item">
              <span class="rpt-rank-idx">{{ i + 1 }}</span>
              <span class="rpt-rank-name">{{ item.tag }}</span>
              <span class="rpt-rank-count">{{ item.count }}</span>
            </div>
          </div>
        </div>

        <!-- 热门书籍 -->
        <div class="rpt-section">
          <h3 class="section-title">热门书籍</h3>
          <div v-if="!topBooks.length" class="empty-state" style="padding: 20px">暂无数据。</div>
          <div v-else class="rpt-rank">
            <div v-for="(item, i) in topBooks" :key="item.title" class="rpt-rank-item">
              <span class="rpt-rank-idx">{{ i + 1 }}</span>
              <div class="rpt-rank-book">
                <span class="rpt-rank-name">{{ item.title }}</span>
                <span class="rpt-rank-author" v-if="item.author">{{ item.author }}</span>
              </div>
              <span class="rpt-rank-count">{{ item.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
};
