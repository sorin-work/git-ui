<script setup lang="ts">
import { computed, provide } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { getRepo } from '../api';
import DownloadMenu from '../components/DownloadMenu.vue';
import RefSelector from '../components/RefSelector.vue';
import { useAsync } from '../composables/useAsync';
import { REPO_KEY } from '../composables/useRepo';
import { commitsUrl, repoUrl, treeUrl } from '../lib/paths';
import { plural } from '../lib/text';

const props = defineProps<{ repo: string }>();
const route = useRoute();
const router = useRouter();

const repoInfo = useAsync(
  () => getRepo(props.repo),
  () => props.repo,
);

/** The ref in the URL, or the default branch on the repository's landing page. */
const currentRef = computed(
  () => (route.params.ref as string | undefined) ?? repoInfo.data.value?.defaultBranch ?? 'HEAD',
);

provide(REPO_KEY, { name: computed(() => props.repo), info: repoInfo.data, currentRef });

const tabs = computed(() => [
  {
    label: 'Code',
    to: treeUrl(props.repo, currentRef.value),
    match: ['repo', 'tree', 'blob', 'blame'],
  },
  { label: 'Commits', to: commitsUrl(props.repo, currentRef.value), match: ['commits', 'commit'] },
  { label: 'Branches', to: repoUrl(props.repo, 'branches'), match: ['branches', 'compare'] },
  { label: 'Tags', to: repoUrl(props.repo, 'tags'), match: ['tags'] },
  { label: 'Search', to: repoUrl(props.repo, 'search', currentRef.value), match: ['search'] },
  {
    label: 'Insights',
    to: repoUrl(props.repo, 'insights', currentRef.value),
    match: ['insights'],
  },
]);

const isCodeView = computed(() => ['repo', 'tree', 'blob', 'blame'].includes(String(route.name)));

/** The ref picker only makes sense on pages that show one ref. */
const showRefSelector = computed(
  () => !['branches', 'tags', 'compare'].includes(String(route.name)),
);

function selectRef(name: string) {
  if (route.name === 'search' || route.name === 'insights') {
    void router.push({ path: repoUrl(props.repo, String(route.name), name), query: route.query });
    return;
  }
  const view = route.name === 'commits' ? commitsUrl : treeUrl;
  void router.push(view(props.repo, name));
}
</script>

<template>
  <section class="repo">
    <div v-if="repoInfo.error.value" class="alert alert--error">
      {{ repoInfo.error.value.message }}
    </div>

    <header class="repo__header">
      <div>
        <h1>
          <RouterLink to="/" class="muted">repos</RouterLink>
          <span class="muted"> / </span>
          <RouterLink :to="{ name: 'repo', params: { repo } }">{{ repo }}</RouterLink>
        </h1>
        <p v-if="repoInfo.data.value?.description" class="muted">
          {{ repoInfo.data.value.description }}
        </p>
      </div>
      <div v-if="repoInfo.data.value" class="repo__counts muted">
        {{ plural(repoInfo.data.value.branches, 'branch', 'branches') }} ·
        {{ plural(repoInfo.data.value.tags, 'tag') }}
      </div>
    </header>

    <nav class="tabs" aria-label="Repository">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.label"
        :to="tab.to"
        class="tabs__item"
        :class="{ active: tab.match.includes(String(route.name)) }"
      >
        {{ tab.label }}
      </RouterLink>
    </nav>

    <div v-if="showRefSelector" class="toolbar">
      <RefSelector :repo="repo" :current="currentRef" @select="selectRef" />
      <DownloadMenu v-if="isCodeView" :repo="repo" :git-ref="currentRef" />
    </div>

    <RouterView />
  </section>
</template>
