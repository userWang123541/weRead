import {
  store,
  getters,
  saveCategory,
  editCategoryNode,
  startCreateChild,
  startCreateRoot,
  deleteCategoryNode,
} from '../store.js';

const { ref, computed, watch } = Vue;

export default {
  name: 'CategoryPage',
  setup() {
    const selectedPath = ref('');
    const categoryTreeRef = ref(null);
    const treeProps = { label: 'name', children: 'children' };

    const selectedNode = computed(() => {
      if (!selectedPath.value) return null;
      const walk = nodes => {
        for (const node of nodes || []) {
          if (node.path === selectedPath.value) return node;
          const hit = walk(node.children);
          if (hit) return hit;
        }
        return null;
      };
      return walk(getters.manageCategoryTree.value.children);
    });

    function selectNode(node) {
      selectedPath.value = node.path;
    }

    const previewPath = computed(() => {
      const name = store.categoryForm.name.trim();
      const parent = store.categoryForm.parentPath;
      if (!name && !parent) return '';
      if (!name) return parent;
      return parent ? `${parent}/${name}` : name;
    });

    function editSelected() {
      if (selectedNode.value) editCategoryNode(selectedNode.value);
    }

    function addChildToSelected() {
      if (selectedNode.value) startCreateChild(selectedNode.value);
    }

    function deleteSelected() {
      if (selectedNode.value) deleteCategoryNode(selectedNode.value);
    }

    function addRoot() {
      selectedPath.value = '';
      startCreateRoot();
    }

    watch(() => store.tagSearch, value => {
      categoryTreeRef.value?.filter(value);
    });

    return {
      store,
      treeProps,
      categoryTreeRef,
      selectedPath,
      selectedNode,
      manageCategoryTree: getters.manageCategoryTree,
      previewPath,
      saveCategory,
      editSelected,
      addChildToSelected,
      addRoot,
      deleteSelected,
      selectNode,
    };
  },
  template: `
    <div class="page-container">
      <div class="page-title">分类管理</div>

      <div class="category-manager">
        <section class="category-tree-card">
          <div class="category-panel-head">
            <div>
              <h3>分类树</h3>
              <p>先选中分类，再在右侧编辑或新增下级。</p>
            </div>
            <el-button type="primary" size="small" @click="addRoot">新增一级</el-button>
          </div>

          <el-input v-model="store.tagSearch" placeholder="搜索分类" clearable class="category-tree-search" />

          <el-tree
            class="category-manage-tree"
            :data="manageCategoryTree.children"
            node-key="path"
            :props="treeProps"
            :filter-node-method="(value, data) => !value || data.path.includes(value)"
            :default-expand-all="false"
            highlight-current
            @node-click="selectNode"
            ref="categoryTreeRef"
          >
            <template #default="{ data }">
              <span class="category-tree-node">
                <span class="category-tree-name">{{ data.name }}</span>
                <span v-if="data.children?.length" class="category-tree-count">{{ data.children.length }}</span>
              </span>
            </template>
          </el-tree>
        </section>

        <section class="category-detail-card">
          <div class="category-panel-head">
            <div>
              <h3>{{ selectedNode ? selectedNode.name : '选择一个分类' }}</h3>
              <p>{{ selectedNode ? selectedNode.path : '也可以直接新增一级分类。' }}</p>
            </div>
            <div class="category-detail-actions">
              <el-button :disabled="!selectedNode" @click="addChildToSelected">新增下级</el-button>
              <el-button :disabled="!selectedNode" @click="editSelected">编辑</el-button>
              <el-button :disabled="!selectedNode" type="danger" plain @click="deleteSelected">删除</el-button>
            </div>
          </div>

          <div class="category-detail-grid">
            <div class="category-info-box">
              <span>层级</span>
              <b>{{ selectedNode ? selectedNode.path.split('/').length : '-' }}</b>
            </div>
            <div class="category-info-box">
              <span>下级</span>
              <b>{{ selectedNode?.children?.length || 0 }}</b>
            </div>
            <div class="category-info-box wide">
              <span>说明</span>
              <b>{{ selectedNode?.description || '暂无说明' }}</b>
            </div>
          </div>

          <div class="category-editor">
            <h3>{{ store.categoryForm.mode === 'edit' ? '编辑分类' : '新增分类' }}</h3>
            <el-form label-position="top">
              <el-form-item label="父级分类">
                <el-tree-select
                  v-model="store.categoryForm.parentPath"
                  :data="manageCategoryTree.children"
                  :props="{ label: 'name', value: 'path', children: 'children' }"
                  check-strictly
                  clearable
                  filterable
                  placeholder="留空为一级分类"
                  style="width: 100%"
                >
                  <template #default="{ data }">
                    <span>{{ data.name }}</span>
                  </template>
                </el-tree-select>
              </el-form-item>
              <el-form-item label="分类名称">
                <el-input v-model="store.categoryForm.name" placeholder="分类名称" clearable />
              </el-form-item>
              <el-form-item label="完整路径">
                <el-input :model-value="previewPath" readonly />
              </el-form-item>
              <el-form-item label="分类说明">
                <el-input
                  v-model="store.categoryForm.description"
                  type="textarea"
                  :rows="3"
                  placeholder="分类说明，用于向量分类时匹配语义"
                />
              </el-form-item>
              <div class="category-form-actions">
                <el-button type="primary" :disabled="store.loading" @click="saveCategory">保存分类</el-button>
                <el-button @click="addRoot">新增一级</el-button>
              </div>
              <div class="category-status">{{ store.categoryStatus }}</div>
            </el-form>
          </div>
        </section>
      </div>
    </div>
  `,
};
