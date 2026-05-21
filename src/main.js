import App from './App.js';
import { router } from './router.js';

const { createApp } = Vue;

createApp(App)
  .use(router)
  .use(ElementPlus)
  .mount('#app');
