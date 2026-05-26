import AppSidebar from './components/Sidebar.js';
import { store, loadBooks } from './store.js';

export default {
  name: 'App',
  components: { AppSidebar },
  setup() {
    // 有 key 才加载，新用户不加载别人的数据
    if (store.apiKey.trim()) {
      loadBooks();
    } else {
      store.status = '请先在设置页输入 API Key。';
    }
    return { store };
  },
  template: `
    <el-container class="app-container" v-cloak>
      <el-header class="app-header" height="52px">
        <div class="header-left">
          <div class="brand-mark">阅</div>
          <h1 class="header-title">微读 Read</h1>
        </div>
        <div class="header-right">
          <span class="header-status">{{ store.status }}</span>
          <el-input
            v-model="store.apiKey"
            type="password"
            show-password
            placeholder="API Key"
            size="small"
            style="width: 200px"
          />
        </div>
      </el-header>
      <el-container>
        <el-aside width="220px" class="app-aside">
          <app-sidebar />
        </el-aside>
        <el-main class="app-main">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  `,
};
