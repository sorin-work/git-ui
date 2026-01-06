import { createRouter, createWebHistory } from 'vue-router';
import BlobPage from './pages/BlobPage.vue';
import BranchesPage from './pages/BranchesPage.vue';
import CommitPage from './pages/CommitPage.vue';
import CommitsPage from './pages/CommitsPage.vue';
import HomePage from './pages/HomePage.vue';
import RepoLayout from './pages/RepoLayout.vue';
import TagsPage from './pages/TagsPage.vue';
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
        { path: 'blob/:ref/:path(.*)*', name: 'blob', component: BlobPage },
        { path: 'commits/:ref', name: 'commits', component: CommitsPage },
        { path: 'commit/:sha', name: 'commit', component: CommitPage },
        { path: 'branches', name: 'branches', component: BranchesPage },
        { path: 'tags', name: 'tags', component: TagsPage },
      ],
    },
  ],
});
