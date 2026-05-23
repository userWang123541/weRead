import { store } from '../store.js';

export default {
  name: 'AppSidebar',
  setup() {
    const route = VueRouter.useRoute();

    const menuItems = [
      { path: '/', icon: 'Reading', label: '概览' },
      { path: '/bookshelf', icon: 'Collection', label: '书架' },
      { path: '/notes', icon: 'Document', label: '笔记管家' },
      { path: '/recall', icon: 'ChatDotRound', label: '拾光' },
      { path: '/categories', icon: 'Folder', label: '分类管理' },
      { path: '/reports', icon: 'DataAnalysis', label: '阅读报告' },
      { path: '/settings', icon: 'Setting', label: '设置' },
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
        微读 Read v1.0
      </div>
    </div>
  `,
};
