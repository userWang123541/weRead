import DashboardPage from './pages/DashboardPage.js';
import CardsPage from './pages/CardsPage.js';
import CategoryPage from './pages/CategoryPage.js';
import RecallPage from './pages/RecallPage.js';
import BookshelfPage from './pages/BookshelfPage.js';
import ReportListPage from './pages/ReportListPage.js';
import ReportDetailPage from './pages/ReportDetailPage.js';
import SettingsPage from './pages/SettingsPage.js';

const { createRouter, createWebHashHistory } = VueRouter;

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: DashboardPage },
    { path: '/bookshelf', component: BookshelfPage },
    { path: '/notes', component: CardsPage },
    { path: '/cards', redirect: '/notes' },
    { path: '/recall', component: RecallPage },
    { path: '/categories', component: CategoryPage },
    { path: '/reports', component: ReportListPage },
    { path: '/reports/:id', component: ReportDetailPage },
    { path: '/settings', component: SettingsPage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
