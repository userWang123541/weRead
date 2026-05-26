import App from './App.js';
import { router } from './router.js';

const { createApp } = Vue;

function mountApp() {
  const app = createApp(App);
  app.use(router);
  app.use(ElementPlus);

  if (window.ElementPlusIconsVue) {
    for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
      app.component(key, component);
    }
  }

  app.mount('#app');
}

// 所有 vendor 已用 defer 加载，此处必定可用
mountApp();
