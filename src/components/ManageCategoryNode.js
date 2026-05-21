export default {
  name: 'ManageCategoryNode',
  props: {
    node: { type: Object, required: true },
    selectedPath: { type: String, default: '' },
  },
  emits: ['edit', 'add-child', 'delete'],
  data() {
    return { open: false };
  },
  computed: {
    hasChildren() {
      return (this.node.children || []).length > 0;
    },
    isSelected() {
      return this.selectedPath === this.node.path;
    },
  },
  template: `
    <div class="manage-node">
      <div class="manage-node-row" :class="{ active: isSelected }">
        <button v-if="hasChildren" class="mini-btn manage-node-toggle" type="button" @click="open = !open">{{ open ? '收起' : '展开' }}</button>
        <span v-else class="manage-node-toggle-spacer"></span>
        <button class="manage-node-name" type="button" :title="node.path" @click="$emit('edit', node)">{{ node.name }}</button>
        <el-button size="small" @click="$emit('add-child', node)">下级</el-button>
        <el-button size="small" @click="$emit('edit', node)">编辑</el-button>
        <el-button size="small" type="danger" plain @click="$emit('delete', node)">删除</el-button>
      </div>
      <div v-if="hasChildren && open" class="manage-node-children">
        <manage-category-node
          v-for="child in node.children"
          :key="child.path"
          :node="child"
          :selected-path="selectedPath"
          @edit="$emit('edit', $event)"
          @add-child="$emit('add-child', $event)"
          @delete="$emit('delete', $event)"
        ></manage-category-node>
      </div>
    </div>
  `,
};
