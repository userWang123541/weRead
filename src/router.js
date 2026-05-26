import DashboardPage from './pages/DashboardPage.js';
import CardsPage from './pages/CardsPage.js';
import CategoryPage from './pages/CategoryPage.js';
import RecallPage from './pages/RecallPage.js';
import BookshelfPage from './pages/BookshelfPage.js';
import ReportListPage from './pages/ReportListPage.js';
import ReportDetailPage from './pages/ReportDetailPage.js';
import SettingsPage from './pages/SettingsPage.js';
import ExportPage from './pages/ExportPage.js';
import ReviewPage from './pages/ReviewPage.js';
import StudioPage from './pages/StudioPage.js';
import TimelinePage from './pages/TimelinePage.js';
import ConnectionsPage from './pages/ConnectionsPage.js';
import TopicRadarPage from './pages/TopicRadarPage.js';
import ReportPage from './pages/ReportPage.js';

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
    { path: '/report', component: ReportPage },
    { path: '/export', component: ExportPage },
    { path: '/review', component: ReviewPage },
    { path: '/studio', component: StudioPage },
    { path: '/timeline', component: TimelinePage },
    { path: '/connections', component: ConnectionsPage },
    { path: '/radar', component: TopicRadarPage },
    { path: '/settings', component: SettingsPage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

// 未设置 Key 时跳转设置页
router.beforeEach((to) => {
  const hasKey = !!localStorage.getItem('weread_api_key');
  if (!hasKey && to.path !== '/settings') {
    return '/settings';
  }
});
