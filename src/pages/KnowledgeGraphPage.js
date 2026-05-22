import { store } from '../store.js';
import { compact } from '../utils.js';

export default {
  name: 'KnowledgeGraphPage',
  setup() {
    const groups = Vue.computed(() => {
      const notes = store.classified?.notes || [];
      const map = new Map();
      notes.forEach(note => {
        const category = note.category || '未分类';
        if (category === '未分类') return;
        if (!map.has(category)) map.set(category, { category, notes: [], books: new Map() });
        const group = map.get(category);
        group.notes.push(note);
        const book = note.bookTitle || '未知书籍';
        if (!group.books.has(book)) group.books.set(book, []);
        group.books.get(book).push(note);
      });
      return [...map.values()]
        .map(group => ({
          ...group,
          bookList: [...group.books.entries()]
            .map(([title, notes]) => ({ title, notes: notes.slice(0, 2), count: notes.length }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 4),
        }))
        .sort((a, b) => b.notes.length - a.notes.length)
        .slice(0, 8);
    });

    const graphNodes = Vue.computed(() => groups.value.slice(0, 7).map((group, index) => ({
      name: group.category.split('/').slice(-1)[0],
      full: group.category,
      count: group.notes.length,
      size: 72 + Math.min(70, group.notes.length * 4),
      x: 16 + (index % 3) * 31,
      y: 20 + Math.floor(index / 3) * 28,
    })));

    const hardChapters = Vue.computed(() => groups.value
      .filter(group => group.notes.length >= 2)
      .slice(0, 5)
      .map(group => ({
        title: group.category,
        desc: `${group.bookList.length} 本书反复出现，适合作为学习难点或专题入口。`,
        sample: compact(group.notes[0]?.text || group.notes[0]?.quote || '', 100),
      })));

    return { store, groups, graphNodes, hardChapters, compact };
  },
  template: `
    <div class="page-container graph-page">
      <div class="page-title">知识图谱</div>
      <p class="page-lead">把跨书划线按主题连接起来，形成个人研究知识库和学习难点预警。</p>

      <section class="graph-layout">
        <div class="graph-canvas">
          <div class="section-header">
            <h3 class="section-title">主题网络</h3>
            <span class="section-note">按分类频次映射节点大小</span>
          </div>
          <div v-if="!graphNodes.length" class="empty-state">暂无分类数据，请先运行向量分类。</div>
          <div v-else class="node-stage">
            <div
              v-for="node in graphNodes"
              :key="node.full"
              class="topic-node"
              :style="{ width: node.size + 'px', height: node.size + 'px', left: node.x + '%', top: node.y + '%' }"
            >
              <b>{{ node.name }}</b>
              <span>{{ node.count }}</span>
            </div>
          </div>
        </div>

        <aside class="warning-card">
          <h3>难点预警</h3>
          <div v-for="item in hardChapters" :key="item.title" class="warning-row">
            <b>{{ item.title }}</b>
            <span>{{ item.desc }}</span>
            <p>{{ item.sample }}</p>
          </div>
        </aside>
      </section>

      <section class="graph-groups">
        <article v-for="group in groups" :key="group.category" class="graph-group">
          <div class="graph-group-head">
            <h3>{{ group.category }}</h3>
            <span>{{ group.notes.length }} 条笔记 · {{ group.bookList.length }} 本书</span>
          </div>
          <div class="graph-book-grid">
            <div v-for="book in group.bookList" :key="book.title" class="graph-book">
              <b>{{ book.title }}</b>
              <p v-for="note in book.notes" :key="note.text">{{ compact(note.text || note.quote, 100) }}</p>
            </div>
          </div>
        </article>
      </section>
    </div>
  `,
};
