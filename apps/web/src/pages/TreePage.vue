<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { getTree } from '../api';
import FileTree from '../components/FileTree.vue';
import PathBreadcrumbs from '../components/PathBreadcrumbs.vue';
import { useAsync } from '../composables/useAsync';
import { useRepo } from '../composables/useRepo';
import { joinPathParam } from '../lib/paths';

const route = useRoute();
const { name: repo, currentRef } = useRepo();

const path = computed(() => joinPathParam(route.params.path as string | string[] | undefined));
const explicitRef = computed(() => route.params.ref as string | undefined);

const tree = useAsync(
  () => getTree(repo.value, explicitRef.value, path.value),
  () => [repo.value, explicitRef.value, path.value],
);
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
      />
    </template>
  </div>
</template>
