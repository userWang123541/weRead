import ManageCategoryNode from '../components/ManageCategoryNode.js';
import {
  store,
  getters,
  saveCategory,
  editCategoryNode,
  startCreateChild,
  startCreateRoot,
  deleteCategoryNode,
} from '../store.js';

export default {
  name: 'CategoryPage',
  components: { ManageCategoryNode },
  setup() {
    function selectTagAndGoToCards(tag) {
      store.selectedTag = store.selectedTag === tag ? '' : tag;
      window.location.hash = '#/cards';
    }

    return {
      store,
      manageCategoryTree: getters.manageCategoryTree,
      taxonomyRows: getters.taxonomyRows,
      saveCategory,
      editCategoryNode,
      startCreateChild,
      startCreateRoot,
      deleteCategoryNode,
      selectTagAndGoToCards,
    };
  },
  template: `
    <div class="page-container">
      <div class="page-title">分类管理</div>

      <div class="category-page-layout">
        <div class="category-form-panel">
          <div class="panel-title">编辑分类</div>
          <div class="category-form">
            <div>
              <div class="form-label">分类名称</div>
              <el-input v-model="store.categoryForm.name" placeholder="分类名称" clearable />
            </div>
            <div>
              <div class="form-label">父级路径</div>
              <el-input v-model="store.categoryForm.parentPath" placeholder="留空为一级分类" readonly />
            </div>
            <div>
              <div class="form-label">分类说明</div>
              <el-input
                v-model="store.categoryForm.description"
                type="textarea"
                :rows="4"
                placeholder="分类说明，用于向量分类时匹配语义"
              />
            </div>
            <div class="category-form-actions">
              <el-button type="primary" :disabled="store.loading" @click="saveCategory">保存分类</el-button>
              <el-button @click="startCreateRoot">新增一级</el-button>
            </div>
            <div class="category-status">{{ store.categoryStatus }}</div>
          </div>
        </div>

        <div class="category-tree-panel">
          <div class="category-tree-header">
            <h3 class="category-tree-title">分类树</h3>
            <el-button size="small" @click="startCreateRoot">新增一级</el-button>
          </div>
          <div v-if="!manageCategoryTree.children.length" class="empty-state">还没有可管理的分类。</div>
          <manage-category-node
            v-for="node in manageCategoryTree.children"
            :key="node.path"
            :node="node"
            :selected-path="store.categoryForm.path"
            @edit="editCategoryNode"
            @add-child="startCreateChild"
            @delete="deleteCategoryNode"
          ></manage-category-node>
        </div>
      </div>

      <div class="section-header" style="margin-top: 8px;">
        <h3 class="section-title">分类统计</h3>
      </div>
      <div v-if="!taxonomyRows.length" class="empty-state">暂无分类统计。请先在仪表盘运行"向量分类"。</div>
      <div v-else class="taxonomy-stats">
        <div
          v-for="item in taxonomyRows"
          :key="item.tag"
          class="tax-row"
          @click="selectTagAndGoToCards(item.tag)"
        >
          <div>
            <b>{{ item.tag }}</b><br>
            <small>{{ item.bookCount ? \`覆盖 \${item.bookCount} 本书\` : \`\${item.depth} 级分类\` }}</small>
          </div>
          <span class="count-pill">{{ item.count }}</span>
        </div>
      </div>
    </div>
  `,
};
