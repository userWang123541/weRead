import {
  store,
  getters,
  saveCategory,
  editCategoryNode,
  startCreateRoot,
  deleteCategoryNode,
  resetCategoryForm,
} from '../store.js';

export default {
  name: 'CategoryPage',
  setup() {
    const searchQuery = Vue.ref('');
    const dialogVisible = Vue.ref(false);
    const expandedPaths = Vue.ref(new Set());

    // 构建完整树结构
    const categoryTree = Vue.computed(() => {
      const cats = store.taxonomy?.categories || [];
      const stats = store.classified?.stats || {};
      const nodeMap = new Map();

      // 创建所有节点
      cats.forEach(cat => {
        const parts = cat.path.split('/');
        nodeMap.set(cat.path, {
          id: cat.id,
          path: cat.path,
          name: parts[parts.length - 1],
          description: cat.description || '',
          depth: parts.length - 1,
          children: [],
          noteCount: stats[cat.path] || 0,
        });
      });

      // 建立父子关系
      const roots = [];
      cats.forEach(cat => {
        const node = nodeMap.get(cat.path);
        const parts = cat.path.split('/');
        if (parts.length === 1) {
          roots.push(node);
        } else {
          const parentPath = parts.slice(0, -1).join('/');
          let parent = nodeMap.get(parentPath);
          if (!parent) {
            // 自动创建缺失的父节点
            parent = {
              id: 'auto_' + parentPath,
              path: parentPath,
              name: parts[parts.length - 2],
              description: '',
              depth: parts.length - 2,
              children: [],
              noteCount: 0,
            };
            nodeMap.set(parentPath, parent);
            // 递归挂载
            if (parent.depth === 0) {
              roots.push(parent);
            } else {
              const grandPath = parts.slice(0, -2).join('/');
              let grand = nodeMap.get(grandPath);
              if (!grand) {
                grand = {
                  id: 'auto_' + grandPath,
                  path: grandPath,
                  name: parts[parts.length - 3],
                  description: '',
                  depth: 0,
                  children: [],
                  noteCount: 0,
                };
                nodeMap.set(grandPath, grand);
                roots.push(grand);
              }
              grand.children.push(parent);
            }
          }
          parent.children.push(node);
        }
      });

      // 递归排序 + 计算子级笔记总数
      function enrich(node) {
        let total = node.noteCount;
        node.children.sort((a, b) => a.path.localeCompare(b.path, 'zh'));
        node.children.forEach(child => {
          enrich(child);
          total += child.childNoteCount;
        });
        node.childNoteCount = total;
        node.hasChildren = node.children.length > 0;
      }
      roots.sort((a, b) => a.path.localeCompare(b.path, 'zh'));
      roots.forEach(enrich);

      return roots;
    });

    // 展开状态控制
    function isExpanded(path) {
      return effectiveExpanded.value.has(path);
    }

    function toggleExpand(path) {
      const next = new Set(expandedPaths.value);
      if (next.has(path)) {
        // 收起时也收起所有子级
        next.forEach(p => { if (p.startsWith(path + '/')) next.delete(p); });
        next.delete(path);
      } else {
        next.add(path);
      }
      expandedPaths.value = next;
    }

    function expandToLevel(level) {
      const next = new Set();
      function walk(nodes) {
        nodes.forEach(node => {
          if (node.depth < level && node.hasChildren) {
            next.add(node.path);
          }
          walk(node.children);
        });
      }
      walk(categoryTree.value);
      expandedPaths.value = next;
    }

    function expandAll() {
      const next = new Set();
      function walk(nodes) {
        nodes.forEach(node => {
          if (node.hasChildren) next.add(node.path);
          walk(node.children);
        });
      }
      walk(categoryTree.value);
      expandedPaths.value = next;
    }

    function collapseAll() {
      expandedPaths.value = new Set();
    }

    // 搜索时自动展开匹配项的祖先路径
    const searchExpandedPaths = Vue.computed(() => {
      const q = searchQuery.value.trim().toLowerCase();
      if (!q) return null; // null 表示非搜索模式
      const extra = new Set();
      function walk(nodes) {
        nodes.forEach(node => {
          const hit = node.path.toLowerCase().includes(q) || (node.description || '').toLowerCase().includes(q);
          if (hit) {
            // 展开所有祖先
            const parts = node.path.split('/');
            for (let i = 1; i < parts.length; i++) {
              extra.add(parts.slice(0, i).join('/'));
            }
          }
          walk(node.children);
        });
      }
      walk(categoryTree.value);
      return extra;
    });

    // 最终有效展开集合 = 手动展开 + 搜索自动展开
    const effectiveExpanded = Vue.computed(() => {
      const base = expandedPaths.value;
      const extra = searchExpandedPaths.value;
      if (!extra) return base;
      return new Set([...base, ...extra]);
    });

    // 将树展开为可见的扁平列表
    const filteredRows = Vue.computed(() => {
      const result = [];
      const q = searchQuery.value.trim().toLowerCase();
      const expanded = effectiveExpanded.value;

      function walk(nodes) {
        nodes.forEach(node => {
          const matchesSearch = !q || node.path.toLowerCase().includes(q) || (node.description || '').toLowerCase().includes(q);
          const hasMatchedDescendant = q && hasDescendantMatch(node, q);
          if (!q || matchesSearch || hasMatchedDescendant) {
            result.push(node);
          }
          if (node.hasChildren && expanded.has(node.path)) {
            walk(node.children);
          }
        });
      }

      function hasDescendantMatch(node, q) {
        for (const child of node.children) {
          if (child.path.toLowerCase().includes(q) || (child.description || '').toLowerCase().includes(q)) return true;
          if (hasDescendantMatch(child, q)) return true;
        }
        return false;
      }

      walk(categoryTree.value);
      return result;
    });

    // CRUD 操作
    function onAdd() {
      startCreateRoot();
      dialogVisible.value = true;
    }

    function onEdit(row) {
      editCategoryNode(row);
      dialogVisible.value = true;
    }

    async function onDelete(row) {
      try {
        await ElementPlus.ElMessageBox.confirm(
          `确定删除「${row.path}」及其所有子分类？已分类的笔记不会自动改动。`,
          '确认删除',
          { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
        );
      } catch { return; }
      await deleteCategoryNode(row);
    }

    async function onSave() {
      await saveCategory();
      dialogVisible.value = false;
    }

    function onCloseDialog() {
      dialogVisible.value = false;
      resetCategoryForm();
    }

    function onAddChild(parentPath) {
      store.categoryForm = {
        mode: 'create',
        path: '',
        originalPath: '',
        parentPath,
        name: '',
        description: '',
      };
      dialogVisible.value = true;
    }

    return {
      store,
      searchQuery,
      dialogVisible,
      filteredRows,
      categoryTree,
      effectiveExpanded,
      isExpanded,
      toggleExpand,
      expandToLevel,
      expandAll,
      onAdd,
      onEdit,
      onDelete,
      onSave,
      onCloseDialog,
      onAddChild,
    };
  },
  template: `
    <div class="page-container">
      <div class="catm-header">
        <h1 class="catm-title">分类管理</h1>
        <div class="catm-header-actions">
          <el-input
            v-model="searchQuery"
            placeholder="搜索分类…"
            clearable
            prefix-icon="Search"
            style="width: 200px"
          />
          <el-button type="primary" @click="onAdd">
            <el-icon style="margin-right:4px"><Plus /></el-icon>新增分类
          </el-button>
        </div>
      </div>

      <!-- 展开控制栏 -->
      <div class="cat-expand-bar">
        <span class="cat-expand-label">展开</span>
        <el-button size="small" @click="expandToLevel(0)">一级</el-button>
        <el-button size="small" @click="expandToLevel(1)">二级</el-button>
        <el-button size="small" @click="expandAll">全部</el-button>
      </div>

      <div class="cat-table-card">
        <el-table
          :data="filteredRows"
          stripe
          style="width: 100%"
          empty-text="还没有分类，点击「新增分类」开始创建"
          :header-cell-style="{ background: 'var(--accent-light)', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '12px', letterSpacing: '.5px' }"
          :row-class-name="({ row }) => row.hasChildren ? 'cat-parent-row' : 'cat-leaf-row'"
        >
          <el-table-column label="分类名称" min-width="180">
            <template #default="{ row }">
              <span class="cat-name-cell" :style="{ paddingLeft: row.depth * 20 + 'px' }">
                <span
                  v-if="row.hasChildren"
                  class="cat-toggle"
                  :class="{ expanded: isExpanded(row.path) }"
                  @click.stop="toggleExpand(row.path)"
                >▸</span>
                <span v-else class="cat-toggle cat-leaf">–</span>
                <span class="cat-name-text" :class="'cat-depth-' + row.depth">{{ row.name }}</span>
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="path" label="完整路径" min-width="200">
            <template #default="{ row }">
              <span class="cat-path-text">{{ row.path }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="说明" min-width="140">
            <template #default="{ row }">
              <span class="cat-desc-text">{{ row.description || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="笔记" width="70" align="center">
            <template #default="{ row }">
              <span class="cat-count-badge" :class="{ active: row.childNoteCount > 0 }">
                {{ row.childNoteCount }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="操作" align="right" fixed="right" width="190">
            <template #default="{ row }">
              <span class="cat-actions">
                <el-button size="small" text @click="onEdit(row)">编辑</el-button>
                <el-button size="small" text @click="onAddChild(row.path)">子级</el-button>
                <el-button size="small" text type="danger" @click="onDelete(row)">删除</el-button>
              </span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 新增/编辑弹窗 -->
      <el-dialog
        v-model="dialogVisible"
        :title="store.categoryForm.mode === 'edit' ? '编辑分类' : '新增分类'"
        width="480px"
        :close-on-click-modal="false"
        class="cat-dialog"
        @close="onCloseDialog"
      >
        <el-form label-position="top" class="cat-dialog-form">
          <el-form-item label="父级分类">
            <el-input
              :model-value="store.categoryForm.parentPath || '（一级分类）'"
              disabled
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="分类名称">
            <el-input
              v-model="store.categoryForm.name"
              placeholder="输入分类名称"
              clearable
              autofocus
            />
          </el-form-item>
          <el-form-item label="说明">
            <el-input
              v-model="store.categoryForm.description"
              type="textarea"
              :rows="3"
              placeholder="用于向量分类时匹配语义（可选）"
            />
          </el-form-item>
          <div v-if="store.categoryForm.name.trim()" class="cat-preview">
            完整路径：{{ store.categoryForm.parentPath ? store.categoryForm.parentPath + '/' + store.categoryForm.name.trim() : store.categoryForm.name.trim() }}
          </div>
          <div v-if="store.categoryStatus" class="cat-status">{{ store.categoryStatus }}</div>
        </el-form>
        <template #footer>
          <el-button @click="onCloseDialog">取消</el-button>
          <el-button type="primary" :disabled="store.loading || !store.categoryForm.name.trim()" @click="onSave">保存</el-button>
        </template>
      </el-dialog>
    </div>
  `,
};
