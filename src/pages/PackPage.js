import { store, generatePack } from '../store.js';

export default {
  name: 'PackPage',
  setup() {
    return { store, generatePack };
  },
  template: `
    <div class="workspace">
      <div class="content">
        <div class="pack-layout">
          <div class="pack-side">
            <label class="label" for="packQuery">写作主题</label>
            <el-input
              id="packQuery"
              v-model="store.packQuery"
              type="textarea"
              :rows="6"
              placeholder="例如：为什么读书不能只靠记忆，而要建立资料系统"
            />
            <div class="button-row">
              <el-button type="primary" class="btn full" :disabled="store.loading" @click="generatePack">生成素材包</el-button>
            </div>
            <div class="status">{{ store.packStatus }}</div>
          </div>

          <div>
            <div v-if="!store.materialPack" class="empty">输入主题后，会生成可引用原文、个人想法和写作提纲。</div>
            <template v-else>
              <div class="pack-section">
                <h3 class="section-title">焦点标签</h3>
                <div class="tags">
                  <span v-for="tag in store.materialPack.focusTags || []" :key="tag" class="tag">{{ tag }}</span>
                </div>
              </div>
              <div class="pack-section">
                <h3 class="section-title">可引用原文</h3>
                <div v-if="!(store.materialPack.quotes || []).length" class="empty">没有匹配原文。</div>
                <div v-for="item in store.materialPack.quotes || []" :key="item.cardId" class="quote-item">
                  {{ item.quote }}
                  <div class="source">《{{ item.bookTitle }}》{{ item.chapterTitle ? \` / \${item.chapterTitle}\` : '' }}</div>
                </div>
              </div>
              <div class="pack-section">
                <h3 class="section-title">个人想法</h3>
                <div v-if="!(store.materialPack.notes || []).length" class="empty">没有匹配想法。</div>
                <div v-for="item in store.materialPack.notes || []" :key="item.cardId" class="note-item">
                  {{ item.note }}
                  <div class="source">《{{ item.bookTitle }}》</div>
                </div>
              </div>
              <div class="pack-section">
                <h3 class="section-title">写作提纲</h3>
                <div v-for="item in store.materialPack.outline || []" :key="item" class="outline-item">{{ item }}</div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  `,
};
