import DashboardPage from './pages/DashboardPage.js';
import CardsPage from './pages/CardsPage.js';
import CategoryPage from './pages/CategoryPage.js';
import TopicRadarPage from './pages/TopicRadarPage.js';
import StudioPage from './pages/StudioPage.js';
import KnowledgeGraphPage from './pages/KnowledgeGraphPage.js';
import ExportPage from './pages/ExportPage.js';

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
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
