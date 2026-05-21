import { store, getters, loadData, syncData, rebuildCards, classifyData } from '../store.js';

export default {
  name: 'AppSidebar',
  setup() {
    const views = [
      { path: '/', label: '资料卡' },
      { path: '/taxonomy', label: '分类管理' },
      { path: '/pack', label: '素材包' },
      { path: '/mapping', label: '接口' },
    ];

    function selectTag(tag) {
      store.selectedTag = store.selectedTag === tag ? '' : tag;
    }

    return {
      store,
      views,
      filteredTags: getters.filteredTags,
      loadData,
      syncData,
      rebuildCards,
      classifyData,
      selectTag,
    };
  },
  template: `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">阅</div>
        <h1>微信读书资料夹工作台</h1>
        <p>同步划线、想法与书籍信息，按主题生成可检索、可引用的资料卡。</p>
      </div>

      <div class="sync-box">
        <label class="label" for="apiKey">微信读书 API Key</label>
        <el-input id="apiKey" v-model="store.apiKey" type="password" show-password placeholder="wrk-xxxxxxxx，留空则使用服务端环境变量" />
        <div class="button-row">
          <el-button type="primary" :disabled="store.loading" @click="syncData">同步数据</el-button>
          <el-button :disabled="store.loading" @click="rebuildCards">重建卡片</el-button>
          <el-button :disabled="store.loading" @click="classifyData">向量分类</el-button>
          <el-button :disabled="store.loading" @click="loadData">刷新</el-button>
        </div>
        <div class="status">{{ store.status }}</div>
      </div>

      <nav class="nav">
        <router-link v-for="item in views" :key="item.path" :to="item.path">{{ item.label }}</router-link>
      </nav>

      <div class="tag-panel">
        <label class="label" for="tagSearch">细分类</label>
        <el-input id="tagSearch" v-model="store.tagSearch" placeholder="搜索标签" clearable />
        <div class="tag-list">
          <button
            v-for="item in filteredTags"
            :key="item.tag"
            class="tag-btn"
            :class="{ active: store.selectedTag === item.tag }"
            @click="selectTag(item.tag)"
          >
            <span :title="item.tag">{{ item.tag }}</span>
            <span class="count-pill">{{ item.count }}</span>
          </button>
          <div v-if="!filteredTags.length" class="empty">暂无分类。点击“向量分类”生成。</div>
        </div>
      </div>
    </aside>
  `,
};
