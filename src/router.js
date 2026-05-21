import DashboardPage from './pages/DashboardPage.js';
import CardsPage from './pages/CardsPage.js';
import CategoryPage from './pages/CategoryPage.js';

const { createRouter, createWebHashHistory } = VueRouter;

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: DashboardPage },
    { path: '/cards', component: CardsPage },
    { path: '/categories', component: CategoryPage },
  ],
});
