import { store } from '../store.js';

export default {
  name: 'AppSidebar',
  setup() {
    const route = VueRouter.useRoute();

    const menuItems = [
      { path: '/', icon: 'Reading', label: '概览' },
      { path: '/notes', icon: 'Document', label: '笔记管家' },
      { path: '/categories', icon: 'Folder', label: '分类管理' },
      { path: '/reports', icon: 'DataAnalysis', label: '阅读报告' },
    ];

    return { store, route, menuItems };
  },
  template: `
    <div class="sidebar-inner">
      <el-menu
        :default-active="route.path"
        class="side-menu"
        router
      >
        <el-menu-item
          v-for="item in menuItems"
          :key="item.path"
          :index="item.path"
        >
          <el-icon class="menu-icon"><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>
      <div class="side-footer">
        阅读工作室 v1.0
      </div>
    </div>
  `,
};
