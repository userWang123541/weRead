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

// Element Plus 用 defer 加载，可能还没准备好
if (typeof ElementPlus !== 'undefined') {
  mountApp();
} else {
  const scripts = document.querySelectorAll('script[src*="element-plus"]');
  let loaded = 0;
  scripts.forEach(s => s.addEventListener('load', () => {
    if (++loaded >= scripts.length) mountApp();
  }));
}
