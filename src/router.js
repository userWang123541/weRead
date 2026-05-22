import DashboardPage from './pages/DashboardPage.js';
import CardsPage from './pages/CardsPage.js';
import CategoryPage from './pages/CategoryPage.js';
import TopicRadarPage from './pages/TopicRadarPage.js';
import StudioPage from './pages/StudioPage.js';
import KnowledgeGraphPage from './pages/KnowledgeGraphPage.js';
import ExportPage from './pages/ExportPage.js';
import ReportListPage from './pages/ReportListPage.js';
import ReportDetailPage from './pages/ReportDetailPage.js';

const { createRouter, createWebHashHistory } = VueRouter;

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: DashboardPage },
    { path: '/notes', component: CardsPage },
    { path: '/cards', redirect: '/notes' },
    { path: '/radar', component: TopicRadarPage },
    { path: '/studio', component: StudioPage },
    { path: '/graph', component: KnowledgeGraphPage },
    { path: '/categories', component: CategoryPage },
    { path: '/export', component: ExportPage },
    { path: '/reports', component: ReportListPage },
    { path: '/reports/:id', component: ReportDetailPage },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
