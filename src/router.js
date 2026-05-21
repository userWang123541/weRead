import CardsPage from './pages/CardsPage.js';
import TaxonomyPage from './pages/TaxonomyPage.js';
import PackPage from './pages/PackPage.js';
import MappingPage from './pages/MappingPage.js';

const { createRouter, createWebHashHistory } = VueRouter;

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: CardsPage },
    { path: '/taxonomy', component: TaxonomyPage },
    { path: '/pack', component: PackPage },
    { path: '/mapping', component: MappingPage },
  ],
});
