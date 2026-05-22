import { store, openOriginal } from '../store.js';

export default {
  name: 'BookshelfPage',
  setup() {
    const activeTab = Vue.ref('reading');

    const bookshelf = Vue.computed(() => {
      const books = store.raw?.books || [];
      const completed = [], reading = [], unread = [];
      books.forEach(b => {
        const info = b.book || {};
        const item = {
          bookId: b.bookId,
          title: info.title || '未知书名',
          author: info.author || '',
          cover: info.cover || '',
          progress: b.readingProgress || 0,
          highlights: b.noteCount || 0,
          reviews: b.reviewCount || 0,
          notes: (b.noteCount || 0) + (b.reviewCount || 0),
          lastActive: b.sort || 0,
        };
        if (item.progress >= 90) completed.push(item);
        else if (item.progress > 0) reading.push(item);
        else unread.push(item);
      });
      return {
        reading: reading.sort((a, b) => b.progress - a.progress),
        completed: completed.sort((a, b) => b.notes - a.notes),
        unread: unread.sort((a, b) => b.lastActive - a.lastActive),
      };
    });

    const tabs = [
      { key: 'reading', label: '在读' },
      { key: 'completed', label: '已读完' },
      { key: 'unread', label: '未读' },
    ];

    const currentBooks = Vue.computed(() => bookshelf.value[activeTab.value] || []);

    const tabCounts = Vue.computed(() => ({
      reading: bookshelf.value.reading.length,
      completed: bookshelf.value.completed.length,
      unread: bookshelf.value.unread.length,
    }));

    return {
      activeTab,
      tabs,
      currentBooks,
      tabCounts,
      openOriginal,
    };
  },
  template: `
    <div class="page-container shelf-page">
      <h1 class="page-title">书架</h1>
      <p class="page-lead">你的微信读书书架，按阅读状态分类展示。</p>

      <div class="shelf-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="shelf-tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span class="shelf-tab-count">{{ tabCounts[tab.key] }}</span>
        </button>
      </div>

      <div v-if="!currentBooks.length" class="empty-state">
        {{ activeTab === 'reading' ? '暂无在读书籍' : activeTab === 'completed' ? '暂无已读完书籍' : '暂无未读书籍' }}
      </div>

      <div v-else class="shelf-grid">
        <article v-for="book in currentBooks" :key="book.bookId" class="shelf-card shelf-card-clickable" @click="openOriginal('', book.bookId)">
          <div class="shelf-cover" :style="book.cover ? { backgroundImage: 'url(' + book.cover + ')' } : {}">
            <span v-if="!book.cover" class="shelf-cover-text">{{ book.title.slice(0, 4) }}</span>
          </div>
          <div class="shelf-card-body">
            <h3 class="shelf-card-title">{{ book.title }}</h3>
            <p class="shelf-card-author">{{ book.author }}</p>
            <div v-if="activeTab === 'reading'" class="shelf-card-progress">
              <div class="shelf-progress-track">
                <div class="shelf-progress-fill" :style="{ width: book.progress + '%' }"></div>
              </div>
              <span class="shelf-progress-text">{{ book.progress }}%</span>
            </div>
            <div v-if="activeTab === 'completed'" class="shelf-card-stats">
              {{ book.highlights }} 条划线 · {{ book.reviews }} 条想法
            </div>
          </div>
        </article>
      </div>
    </div>
  `,
};
