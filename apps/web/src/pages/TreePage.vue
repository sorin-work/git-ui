<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { getLanguages, getLatestCommits, getTree } from '../api';
import FileTree from '../components/FileTree.vue';
import LanguageBar from '../components/LanguageBar.vue';
import PathBreadcrumbs from '../components/PathBreadcrumbs.vue';
import ReadmePanel from '../components/ReadmePanel.vue';
import { useAsync } from '../composables/useAsync';
import { useRepo } from '../composables/useRepo';
import { findReadme } from '../lib/markdown';
import { joinPathParam } from '../lib/paths';

const route = useRoute();
const { name: repo, currentRef } = useRepo();

const path = computed(() => joinPathParam(route.params.path as string | string[] | undefined));
const explicitRef = computed(() => route.params.ref as string | undefined);

const tree = useAsync(
  () => getTree(repo.value, explicitRef.value, path.value),
  () => [repo.value, explicitRef.value, path.value],
);

// Last commits come from a slower request, so the listing shows first.
const latest = useAsync(
  async () =>
    tree.data.value ? getLatestCommits(repo.value, tree.data.value.commit, path.value) : {},
  () => tree.data.value?.commit + ':' + path.value,
);

// Only the repository root shows the language breakdown.
const languages = useAsync(
  async () =>
    tree.data.value && !path.value ? getLanguages(repo.value, tree.data.value.commit) : [],
  () => (path.value ? '' : tree.data.value?.commit),
);

const readme = computed(() => (tree.data.value ? findReadme(tree.data.value.entries) : null));
</script>

<template>
  <div class="code-view">
    <PathBreadcrumbs v-if="path" :repo="repo" :git-ref="currentRef" :path="path" />

    <div v-if="tree.error.value" class="alert alert--error">{{ tree.error.value.message }}</div>
    <p v-else-if="tree.loading.value && !tree.data.value" class="muted">Loading…</p>

    <template v-if="tree.data.value">
      <div v-if="tree.data.value.entries.length === 0" class="panel empty">
        <h2>This repository is empty</h2>
        <p class="muted">Push a first commit to see files here.</p>
      </div>
      <FileTree
        v-else
        :repo="repo"
        :git-ref="currentRef"
        :path="path"
        :entries="tree.data.value.entries"
        :latest="latest.data.value"
      />
      <LanguageBar v-if="!path && languages.data.value?.length" :languages="languages.data.value" />
      <ReadmePanel
        v-if="readme"
        :key="readme.path"
        :repo="repo"
        :git-ref="tree.data.value.commit"
        :path="readme.path"
        :name="readme.name"
      />
    </template>
  </div>
</template>
