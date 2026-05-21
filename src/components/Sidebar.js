import { store } from '../store.js';

export default {
  name: 'AppSidebar',
  setup() {
    const route = VueRouter.useRoute();

    const menuItems = [
      { path: '/', icon: 'Odometer', label: '仪表盘' },
      { path: '/cards', icon: 'Document', label: '资料卡' },
      { path: '/categories', icon: 'FolderOpened', label: '分类管理' },
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
        WeRead Workbench v1.0
      </div>
    </div>
  `,
};
