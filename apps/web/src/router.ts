import { createRouter, createWebHistory } from 'vue-router';
import HomePage from './pages/HomePage.vue';
import RepoLayout from './pages/RepoLayout.vue';

// Repository pages are loaded on demand. Syntax highlighting and markdown are
// the bulk of the bundle and only the code views need them.
const TreePage = () => import('./pages/TreePage.vue');

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
        {
          path: 'blob/:ref/:path(.*)*',
          name: 'blob',
          component: () => import('./pages/BlobPage.vue'),
        },
        {
          path: 'blame/:ref/:path(.*)*',
          name: 'blame',
          component: () => import('./pages/BlamePage.vue'),
        },
        {
          path: 'commits/:ref',
          name: 'commits',
          component: () => import('./pages/CommitsPage.vue'),
        },
        { path: 'commit/:sha', name: 'commit', component: () => import('./pages/CommitPage.vue') },
        { path: 'branches', name: 'branches', component: () => import('./pages/BranchesPage.vue') },
        { path: 'compare', name: 'compare', component: () => import('./pages/ComparePage.vue') },
        { path: 'tags', name: 'tags', component: () => import('./pages/TagsPage.vue') },
        {
          path: 'search/:ref',
          name: 'search',
          component: () => import('./pages/SearchPage.vue'),
        },
        {
          path: 'insights/:ref',
          name: 'insights',
          component: () => import('./pages/InsightsPage.vue'),
        },
      ],
    },
  ],
});
