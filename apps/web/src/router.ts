import { createRouter, createWebHistory } from 'vue-router';
import HomePage from './pages/HomePage.vue';
import RepoLayout from './pages/RepoLayout.vue';
import TreePage from './pages/TreePage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    {
      path: '/:repo',
      component: RepoLayout,
      props: true,
      children: [
        { path: '', name: 'repo', component: TreePage },
        { path: 'tree/:ref/:path(.*)*', name: 'tree', component: TreePage },
      ],
    },
  ],
});
