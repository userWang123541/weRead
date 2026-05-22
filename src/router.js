import DashboardPage from './pages/DashboardPage.js';
import CardsPage from './pages/CardsPage.js';
import CategoryPage from './pages/CategoryPage.js';
import ReportListPage from './pages/ReportListPage.js';
import ReportDetailPage from './pages/ReportDetailPage.js';

const { createRouter, createWebHashHistory } = VueRouter;

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: DashboardPage },
    { path: '/notes', component: CardsPage },
    { path: '/cards', redirect: '/notes' },
    { path: '/categories', component: CategoryPage },
    { path: '/reports', component: ReportListPage },
    { path: '/reports/:id', component: ReportDetailPage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
