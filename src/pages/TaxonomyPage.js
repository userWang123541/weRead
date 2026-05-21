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
  name: 'TaxonomyPage',
  components: { ManageCategoryNode },
  setup() {
    function selectTagAndShowCards(tag) {
      store.selectedTag = store.selectedTag === tag ? '' : tag;
      window.location.hash = '#/';
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
      selectTagAndShowCards,
    };
  },
  template: `
    <div class="workspace">
      <div class="content">
        <div class="taxonomy-admin">
          <div class="taxonomy-form">
            <label class="label" for="categoryName">分类管理</label>
            <el-input id="categoryName" v-model="store.categoryForm.name" placeholder="分类名称" clearable />
            <el-input v-model="store.categoryForm.parentPath" placeholder="父级路径，留空为一级分类" readonly />
            <el-input
              v-model="store.categoryForm.description"
              type="textarea"
              :rows="5"
              placeholder="分类说明，用于向量分类时匹配语义"
            />
            <div class="taxonomy-form-actions">
              <el-button type="primary" :disabled="store.loading" @click="saveCategory">保存分类</el-button>
              <el-button @click="startCreateRoot">新增一级</el-button>
            </div>
            <div class="status">{{ store.categoryStatus }}</div>
          </div>

          <div class="taxonomy-tree">
            <div class="taxonomy-tree-head">
              <span>分类树</span>
              <el-button size="small" @click="startCreateRoot">新增一级</el-button>
            </div>
            <div v-if="!manageCategoryTree.children.length" class="empty">还没有可管理的分类。</div>
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

        <div v-if="!taxonomyRows.length" class="empty">暂无分类。点击“向量分类”生成。</div>
        <div v-else class="taxonomy">
          <div v-for="item in taxonomyRows" :key="item.tag" class="tax-row" @click="selectTagAndShowCards(item.tag)">
            <div>
              <b>{{ item.tag }}</b><br>
              <small>{{ item.bookCount ? \`覆盖 \${item.bookCount} 本书\` : \`\${item.depth} 级分类\` }}</small>
            </div>
            <span class="count-pill">{{ item.count }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
};
