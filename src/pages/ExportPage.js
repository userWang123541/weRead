import { store, getters } from '../store.js';
import { compact, formatDate, typeLabel } from '../utils.js';

export default {
  name: 'ExportPage',
  setup() {
    const exportScope = Vue.ref('all');
    const exportFormat = Vue.ref('markdown');
    const selectedBook = Vue.ref('');
    const selectedCategory = Vue.ref('');
    const preview = Vue.ref('');

    const filteredCards = Vue.computed(() => {
      let cards = store.cardsData.cards || [];
      if (exportScope.value === 'book' && selectedBook.value) {
        cards = cards.filter(c => c.bookTitle === selectedBook.value);
      } else if (exportScope.value === 'category' && selectedCategory.value) {
        const tag = selectedCategory.value;
        cards = cards.filter(c => (c.tags || []).includes(tag));
      }
      return cards;
    });

    function generateMarkdown(cards) {
      const groups = new Map();
      cards.forEach(card => {
        const key = card.bookTitle || '未知书籍';
        if (!groups.has(key)) groups.set(key, { title: key, author: card.author, cards: [] });
        groups.get(key).cards.push(card);
      });
      let md = '';
      for (const book of groups.values()) {
        md += `## ${book.title}`;
        if (book.author) md += ` — ${book.author}`;
        md += '\n\n';
        for (const card of book.cards) {
          if (card.quote) md += `> ${card.quote}\n\n`;
          if (card.note) md += `${card.note}\n\n`;
          md += `_${formatDate(card.createTime)} · ${typeLabel(card.type)}_\n\n---\n\n`;
        }
      }
      return md;
    }

    function generateJSON(cards) {
      return JSON.stringify(cards, null, 2);
    }

    function updatePreview() {
      const cards = filteredCards.value;
      const content = exportFormat.value === 'markdown'
        ? generateMarkdown(cards)
        : generateJSON(cards);
      preview.value = content.slice(0, 800) + (content.length > 800 ? '\n...' : '');
    }

    function download() {
      const cards = filteredCards.value;
      const content = exportFormat.value === 'markdown'
        ? generateMarkdown(cards)
        : generateJSON(cards);
      const ext = exportFormat.value === 'markdown' ? 'md' : 'json';
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `weread-export.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    Vue.watch([exportScope, exportFormat, selectedBook, selectedCategory], updatePreview, { immediate: true });

    return {
      store,
      exportScope,
      exportFormat,
      selectedBook,
      selectedCategory,
      preview,
      filteredCards,
      download,
      bookOptions: getters.bookOptions,
      categoryOptions: getters.categoryOptions,
    };
  },
  template: `
    <div class="page-container">
      <div class="page-title">导出</div>

      <div class="export-options">
        <div class="export-section">
          <label class="export-label">导出范围</label>
          <el-radio-group v-model="exportScope" class="mag-radio-group">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button value="book">按书籍</el-radio-button>
            <el-radio-button value="category">按分类</el-radio-button>
          </el-radio-group>
          <el-select v-if="exportScope === 'book'" v-model="selectedBook" placeholder="选择书籍" filterable clearable style="width: 200px; margin-left: 10px" popper-class="book-dropdown">
            <el-option v-for="b in bookOptions" :key="b" :label="b" :value="b" class="book-option" />
          </el-select>
          <el-select v-if="exportScope === 'category'" v-model="selectedCategory" placeholder="选择分类" filterable clearable style="width: 200px; margin-left: 10px" popper-class="book-dropdown">
            <el-option v-for="c in categoryOptions" :key="c" :label="c" :value="c" class="book-option" />
          </el-select>
        </div>

        <div class="export-section">
          <label class="export-label">导出格式</label>
          <el-radio-group v-model="exportFormat" class="mag-radio-group">
            <el-radio-button value="markdown">Markdown</el-radio-button>
            <el-radio-button value="json">JSON</el-radio-button>
          </el-radio-group>
        </div>

        <div class="export-section">
          <span class="export-count">共 {{ filteredCards.length }} 条记录</span>
          <el-button type="primary" @click="download" :disabled="!filteredCards.length">下载</el-button>
        </div>
      </div>

      <div class="export-preview-card">
        <div class="export-preview-head">预览</div>
        <pre class="export-preview-content">{{ preview || '暂无内容' }}</pre>
      </div>
    </div>
  `,
};
