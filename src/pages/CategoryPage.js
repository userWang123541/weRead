import {
  store,
  getters,
  saveCategory,
  editCategoryNode,
  startCreateChild,
  startCreateRoot,
  deleteCategoryNode,
  resetCategoryForm,
} from '../store.js';

const { ref, computed, watch, nextTick } = Vue;

export default {
  name: 'CategoryPage',
  setup() {
    const categoryTreeRef = ref(null);
    const selectedPath = ref('');
    const showEditor = ref(false);
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

    const previewPath = computed(() => {
      const name = store.categoryForm.name.trim();
      const parent = store.categoryForm.parentPath;
      if (!name && !parent) return '';
      if (!name) return parent;
      return parent ? `${parent}/${name}` : name;
    });

    function selectNode(node) {
      selectedPath.value = node.path;
    }

    function onAddRoot() {
      selectedPath.value = '';
      startCreateRoot();
      showEditor.value = true;
      nextTick(() => categoryTreeRef.value?.setCurrentKey(null));
    }

    function onEdit() {
      if (!selectedNode.value) return;
      editCategoryNode(selectedNode.value);
      showEditor.value = true;
    }

    function onAddChild() {
      if (!selectedNode.value) return;
      startCreateChild(selectedNode.value);
      showEditor.value = true;
    }

    async function onDelete() {
      if (!selectedNode.value) return;
      await deleteCategoryNode(selectedNode.value);
      selectedPath.value = '';
      showEditor.value = false;
    }

    async function onSave() {
      await saveCategory();
      showEditor.value = false;
    }

    function onCloseEditor() {
      showEditor.value = false;
      resetCategoryForm();
    }

    watch(() => store.tagSearch, value => {
      categoryTreeRef.value?.filter(value);
    });

    watch(selectedPath, () => {
      showEditor.value = false;
    });

    return {
      store,
      treeProps,
      categoryTreeRef,
      selectedPath,
      selectedNode,
      showEditor,
      manageCategoryTree: getters.manageCategoryTree,
      previewPath,
      selectNode,
      onAddRoot,
      onEdit,
      onAddChild,
      onDelete,
      onSave,
      onCloseEditor,
    };
  },
  template: `
    <div class="page-container">
      <div class="catm-header">
        <h1 class="catm-title">分类管理</h1>
        <div class="catm-header-actions">
          <el-input
            v-model="store.tagSearch"
            placeholder="搜索分类…"
            clearable
            prefix-icon="Search"
            class="catm-search"
          />
          <el-button type="primary" @click="onAddRoot">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新增一级
          </el-button>
        </div>
      </div>

      <div class="catm-tree-card">
        <el-tree
          ref="categoryTreeRef"
          class="catm-tree"
          :data="manageCategoryTree.children"
          node-key="path"
          :props="treeProps"
          :filter-node-method="(value, data) => !value || data.path.includes(value)"
          :default-expand-all="false"
          highlight-current
          @node-click="selectNode"
        >
          <template #default="{ data }">
            <div class="catm-node" :class="{ 'is-selected': selectedPath === data.path }">
              <span class="catm-node-name">{{ data.name }}</span>
              <span v-if="data.description" class="catm-node-desc" :title="data.description">{{ data.description }}</span>
              <span v-if="data.children?.length" class="catm-node-count">{{ data.children.length }}</span>
              <div class="catm-node-actions" v-if="selectedPath === data.path">
                <el-button size="small" text @click.stop="onEdit">编辑</el-button>
                <el-button size="small" text @click.stop="onAddChild">新增下级</el-button>
                <el-button size="small" text type="danger" @click.stop="onDelete">删除</el-button>
              </div>
            </div>
          </template>
        </el-tree>

        <div v-if="!manageCategoryTree.children?.length" class="catm-empty">
          还没有分类。点击「新增一级」开始创建。
        </div>
      </div>

      <transition name="catm-slide">
        <div v-if="showEditor" class="catm-editor-card">
          <div class="catm-editor-head">
            <span>{{ store.categoryForm.mode === 'edit' ? '编辑分类' : '新增分类' }}</span>
            <el-button text @click="onCloseEditor">
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
          <el-form label-position="top" class="catm-editor-form">
            <el-form-item label="父级分类">
              <el-tree-select
                v-model="store.categoryForm.parentPath"
                :data="manageCategoryTree.children"
                :props="{ label: 'name', value: 'path', children: 'children' }"
                check-strictly
                clearable
                filterable
                placeholder="无（一级分类）"
                style="width:100%"
              />
              <div v-if="previewPath" class="catm-preview">→ {{ previewPath }}</div>
            </el-form-item>
            <el-form-item label="分类名称">
              <el-input v-model="store.categoryForm.name" placeholder="输入分类名称" clearable />
            </el-form-item>
            <el-form-item label="说明">
              <el-input
                v-model="store.categoryForm.description"
                type="textarea"
                :rows="2"
                placeholder="用于向量分类时匹配语义"
              />
            </el-form-item>
            <div class="catm-editor-footer">
              <el-button @click="onCloseEditor">取消</el-button>
              <el-button type="primary" :disabled="store.loading" @click="onSave">保存</el-button>
            </div>
            <div v-if="store.categoryStatus" class="catm-status">{{ store.categoryStatus }}</div>
          </el-form>
        </div>
      </transition>
    </div>
  `,
};
