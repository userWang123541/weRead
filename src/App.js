import AppSidebar from './components/Sidebar.js';
import { getters, loadData } from './store.js';

export default {
  name: 'App',
  components: { AppSidebar },
  setup() {
    loadData();
    return {
      subtitle: getters.subtitle,
      statItems: getters.statItems,
    };
  },
  template: `
    <div class="app-shell" v-cloak>
      <app-sidebar />
      <main class="main">
        <div class="topline">
          <div>
            <h2>资料不是靠记，是靠扣住</h2>
            <p>{{ subtitle }}</p>
          </div>
        </div>

        <section class="stats">
          <div v-for="item in statItems" :key="item.label" class="stat">
            <strong>{{ item.value.toLocaleString() }}</strong>
            <span>{{ item.label }}</span>
          </div>
        </section>

        <router-view />
      </main>
    </div>
  `,
};
