import { createRouter, createWebHistory } from 'vue-router';
import BlamePage from './pages/BlamePage.vue';
import BlobPage from './pages/BlobPage.vue';
import BranchesPage from './pages/BranchesPage.vue';
import CommitPage from './pages/CommitPage.vue';
import CommitsPage from './pages/CommitsPage.vue';
import ComparePage from './pages/ComparePage.vue';
import HomePage from './pages/HomePage.vue';
import InsightsPage from './pages/InsightsPage.vue';
import RepoLayout from './pages/RepoLayout.vue';
import SearchPage from './pages/SearchPage.vue';
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
        { path: 'blame/:ref/:path(.*)*', name: 'blame', component: BlamePage },
        { path: 'commits/:ref', name: 'commits', component: CommitsPage },
        { path: 'commit/:sha', name: 'commit', component: CommitPage },
        { path: 'branches', name: 'branches', component: BranchesPage },
        { path: 'compare', name: 'compare', component: ComparePage },
        { path: 'tags', name: 'tags', component: TagsPage },
        { path: 'search/:ref', name: 'search', component: SearchPage },
        { path: 'insights/:ref', name: 'insights', component: InsightsPage },
      ],
    },
  ],
});
