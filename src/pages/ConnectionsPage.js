import { store, getters } from '../store.js';
import { compact, formatDate } from '../utils.js';

export default {
  name: 'ConnectionsPage',
  setup() {
    const connectionGroups = Vue.computed(() => {
      const map = new Map();
      const notes = store.classified?.notes;
      const cards = store.cardsData.cards || [];
      if (!notes) return [];

      notes.forEach(note => {
        if (!note.category || note.category === '未分类') return;
        if (!map.has(note.category)) map.set(note.category, new Map());
        const bookMap = map.get(note.category);
        const bookKey = note.bookId;
        if (!bookMap.has(bookKey)) bookMap.set(bookKey, { bookTitle: note.bookTitle, texts: [] });
        if (bookMap.get(bookKey).texts.length < 2) {
          bookMap.get(bookKey).texts.push(note.text);
        }
      });

      return [...map.entries()]
        .map(([category, bookMap]) => {
          const books = [...bookMap.values()];
          if (books.length < 2) return null;
          return { category, books, bookCount: books.length, totalNotes: books.reduce((s, b) => s + b.texts.length, 0) };
        })
        .filter(Boolean)
        .sort((a, b) => b.bookCount - a.bookCount || b.totalNotes - a.totalNotes);
    });

    function goToCards(tag) {
      store.selectedTag = tag;
      window.location.hash = '#/cards';
    }

    return { connectionGroups, goToCards, compact };
  },
  template: `
    <div class="page-container">
      <div class="page-title">跨书关联</div>
      <p class="cn-subtitle">同一个主题下不同书的划线对比，帮你发现知识连接。</p>

      <div v-if="!connectionGroups.length" class="empty-state">
        暂无跨书关联数据。请先在仪表盘运行「向量分类」。
      </div>

      <div v-else class="cn-list">
        <div v-for="group in connectionGroups" :key="group.category" class="cn-group">
          <div class="cn-group-header">
            <span class="cn-group-title">{{ group.category }}</span>
            <span class="cn-group-meta">{{ group.bookCount }} 本书 · {{ group.totalNotes }} 条笔记</span>
            <el-button text type="primary" size="small" @click="goToCards(group.category)">查看全部</el-button>
          </div>
          <div class="cn-books">
            <div v-for="book in group.books" :key="book.bookTitle" class="cn-book">
              <div class="cn-book-title">{{ book.bookTitle }}</div>
              <div v-for="(text, i) in book.texts" :key="i" class="cn-book-text">
                {{ compact(text, 160) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
};
