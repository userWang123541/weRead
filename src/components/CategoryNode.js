export default {
  name: 'CategoryNode',
  props: {
    node: { type: Object, required: true },
    current: { type: String, default: '' },
  },
  emits: ['choose'],
  data() {
    const current = this.current || '';
    return {
      open: current === this.node.path || current.startsWith(`${this.node.path}/`),
    };
  },
  computed: {
    hasChildren() {
      return (this.node.children || []).length > 0;
    },
    isCurrent() {
      return this.current === this.node.path;
    },
  },
  template: `
    <div class="category-node" :class="{ open }">
      <button v-if="hasChildren" class="category-toggle" type="button" @click="open = !open">
        <span class="category-arrow">&gt;</span><span>{{ node.name }}</span><span class="category-path">{{ node.children.length }}</span>
      </button>
      <button v-else class="category-choice" :class="{ active: isCurrent }" @click="$emit('choose', node.path)">
        <span></span><span>{{ node.name }}</span><span class="category-path">{{ isCurrent ? '当前' : '' }}</span>
      </button>
      <div v-if="hasChildren" class="category-children">
        <button class="category-choice" :class="{ active: isCurrent }" @click="$emit('choose', node.path)">
          <span></span><span>选中此级</span><span class="category-path">{{ node.path }}</span>
        </button>
        <category-node
          v-for="child in node.children"
          :key="child.path"
          :node="child"
          :current="current"
          @choose="$emit('choose', $event)"
        ></category-node>
      </div>
    </div>
  `,
};
