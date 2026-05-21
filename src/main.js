import App from './App.js';
import { router } from './router.js';

const { createApp } = Vue;

const app = createApp(App);
app.use(router);
app.use(ElementPlus);

// 注册 Element Plus 图标组件
if (window.ElementPlusIconsVue) {
  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component);
  }
}

app.mount('#app');
