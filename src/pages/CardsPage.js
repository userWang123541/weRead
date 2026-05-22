import { store, getters, cardClassification, updateNoteCategory, openOriginal } from '../store.js';
import { compact, formatDate, typeLabel } from '../utils.js';

export default {
  name: 'CardsPage',
  setup() {
    const categoryPanelStyle = Vue.ref({});

    function clearFilters() {
      store.selectedTag = '';
      store.searchInput = '';
      store.typeFilter = '';
      store.bookFilter = '';
    }

    function openCategoryEditor(noteIndex, event) {
      const main = document.querySelector('.app-main');
      const scrollTop = main?.scrollTop || 0;
      if (store.activeCategoryEdit === noteIndex) {
        store.activeCategoryEdit = null;
        return;
      }

      const rect = event?.currentTarget?.getBoundingClientRect();
      const panelWidth = 320;
      const panelHeight = 330;
      let left = rect ? rect.right + 8 : 280;
      let top = rect ? rect.top : 120;
      if (left + panelWidth > window.innerWidth - 12 && rect) {
        left = rect.left - panelWidth - 8;
      }
      top = Math.max(12, Math.min(top, window.innerHeight - panelHeight - 12));
      categoryPanelStyle.value = {
        left: `${Math.max(12, left)}px`,
        top: `${top}px`,
        width: `${panelWidth}px`,
      };

      store.activeCategoryEdit = noteIndex;
      [0, 30, 100, 220].forEach(delay => {
        setTimeout(() => {
          if (main) main.scrollTo({ top: scrollTop, behavior: 'auto' });
        }, delay);
      });
    }

    function selectTag(tag) {
      store.selectedTag = store.selectedTag === tag ? '' : tag;
    }

    function categoryAncestors(category) {
      if (!category || category === '未分类') return [];
      const parts = category.split('/');
      return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
    }

    return {
      store,
      filteredCards: getters.filteredCards,
      filteredTags: getters.filteredTags,
      bookOptions: getters.bookOptions,
      classificationMap: getters.classificationMap,
      categoryTree: getters.categoryTree,
      currentEditCategory: getters.currentEditCategory,
      categoryPanelStyle,
      cardClassification,
      updateNoteCategory,
      openOriginal,
      clearFilters,
      openCategoryEditor,
      selectTag,
      categoryAncestors,
      compact,
      formatDate,
      typeLabel,
    };
  },
  template: `
    <div class="page-container">
      <div class="cards-toolbar">
        <el-input
          v-model="store.searchInput"
          placeholder="搜原文、想法、书名、标签"
          clearable
          style="flex: 1; min-width: 200px"
        />
        <el-select v-model="store.typeFilter" placeholder="全部类型" clearable style="width: 130px">
          <el-option label="只看划线" value="highlight" />
          <el-option label="只看想法" value="review" />
          <el-option label="划线+想法" value="linked" />
        </el-select>
        <el-select v-model="store.bookFilter" placeholder="全部书籍" clearable filterable style="width: 200px">
          <el-option v-for="book in bookOptions" :key="book" :label="book" :value="book" />
        </el-select>
        <el-button @click="clearFilters">清空筛选</el-button>
      </div>

      <div class="cards-layout">
        <div class="cards-main">
          <div v-if="!filteredCards.length" class="no-cards-msg">
            没有匹配的资料卡。可以清空筛选，或先同步微信读书数据。
          </div>
          <div v-else class="cards-grid">
            <article
              v-for="card in filteredCards"
              :key="card.cardId"
              class="card-item"
            >
              <div class="card-meta">
                <span class="card-book" :title="card.bookTitle">{{ card.bookTitle || '未知书籍' }}</span>
                <span class="card-type" :class="card.type">{{ typeLabel(card.type) }}</span>
              </div>
              <div v-if="card.chapterTitle" class="card-chapter">{{ card.chapterTitle }}</div>
              <blockquote v-if="card.quote" class="card-quote">{{ compact(card.quote, 260) }}</blockquote>
              <div v-if="card.note" class="card-note-text">{{ compact(card.note, 220) }}</div>
              <div class="card-tags">
                <span
                  v-if="cardClassification(card)?.category && cardClassification(card)?.category !== '未分类'"
                  class="card-tag"
                  :class="{ 'user-edited': cardClassification(card)?.userEdited }"
                >
                  {{ cardClassification(card).category }}
                </span>
                <template v-if="!classificationMap">
                  <span v-for="tag in (card.tags || []).slice(0, 4)" :key="tag" class="card-tag">{{ tag }}</span>
                </template>
              </div>
              <div class="card-footer">
                <span>{{ formatDate(card.createTime) }}</span>
                <div class="card-actions">
                  <span
                    v-if="cardClassification(card)"
                    class="text-btn"
                    @pointerdown.prevent
                    @mousedown.prevent
                    @mouseup.prevent
                    @click.stop="openCategoryEditor(cardClassification(card)._index, $event)"
                  >
                    修改分类
                  </span>
                  <el-button v-if="card.openUrl" link type="primary" size="small" @click="openOriginal(card.openUrl, card.bookId)">查看原文</el-button>
                </div>
              </div>
            </article>
          </div>
        </div>

        <aside class="tag-sidebar">
          <div class="tag-sidebar-header">
            <span>分类标签</span>
            <span class="tag-count">{{ (filteredTags || []).length }} 个</span>
          </div>
          <div class="tag-sidebar-search">
            <el-input v-model="store.tagSearch" placeholder="搜索标签" clearable size="small" />
          </div>
          <div class="tag-sidebar-list">
            <div
              v-for="item in filteredTags"
              :key="item.tag"
              class="tag-sidebar-item"
              :class="{ active: store.selectedTag === item.tag }"
              @click="selectTag(item.tag)"
            >
              <span class="tag-name" :title="item.tag">{{ item.tag }}</span>
              <span class="tag-count-pill">{{ item.count }}</span>
            </div>
            <div v-if="!filteredTags.length" class="tag-empty">暂无分类。先在仪表盘运行"向量分类"。</div>
          </div>
        </aside>
      </div>

      <teleport to="body">
        <div
          v-if="store.activeCategoryEdit !== null"
          class="category-fixed-panel"
          :style="categoryPanelStyle"
          @click.stop
        >
          <div class="category-select-head">
            <span>选择分类</span>
            <el-button link type="primary" size="small" @click="store.activeCategoryEdit = null">关闭</el-button>
          </div>
          <el-button
            class="category-unclassified"
            :type="currentEditCategory === '未分类' ? 'primary' : 'default'"
            size="small"
            @click="updateNoteCategory('未分类')"
          >
            未分类
          </el-button>
          <el-tree
            class="category-select-tree"
            :data="categoryTree.children"
            node-key="path"
            :props="{ label: 'name', children: 'children' }"
            :default-expanded-keys="categoryAncestors(currentEditCategory)"
            :current-node-key="currentEditCategory"
            highlight-current
            @node-click="node => updateNoteCategory(node.path)"
          />
        </div>
      </teleport>
    </div>
  `,
};
