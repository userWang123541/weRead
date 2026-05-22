import AppSidebar from './components/Sidebar.js';
import { store, loadData } from './store.js';

export default {
  name: 'App',
  components: { AppSidebar },
  setup() {
    loadData();
    return { store };
  },
  template: `
    <el-container class="app-container" v-cloak>
      <el-header class="app-header" height="52px">
        <div class="header-left">
          <div class="brand-mark">阅</div>
          <div>
            <h1 class="header-title">微信读书阅读工作室</h1>
            <div class="header-subtitle">Skill API 数据生产力</div>
          </div>
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
        <el-aside width="200px" class="app-aside">
          <app-sidebar />
        </el-aside>
        <el-main class="app-main">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  `,
};
