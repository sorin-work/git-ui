<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { listBranches } from '../api';
import { useAsync } from '../composables/useAsync';
import { useRepo } from '../composables/useRepo';
import { commitUrl, treeUrl } from '../lib/paths';
import { relativeTime } from '../lib/time';

const { name: repo } = useRepo();
const result = useAsync(
  () => listBranches(repo.value),
  () => repo.value,
);
const filter = ref('');

const branches = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  return (result.data.value?.branches ?? []).filter(
    (b) => !needle || b.name.toLowerCase().includes(needle),
  );
});

/** Width of the ahead/behind bars relative to the most diverged branch. */
const scale = computed(() => Math.max(1, ...branches.value.flatMap((b) => [b.ahead, b.behind])));
</script>

<template>
  <div class="branches-view">
    <input
      v-model="filter"
      class="input search-input"
      type="search"
      placeholder="Filter branches…"
      aria-label="Filter branches"
    />

    <div v-if="result.error.value" class="alert alert--error">{{ result.error.value.message }}</div>

    <ul v-if="branches.length" class="panel ref-list">
      <li v-for="branch in branches" :key="branch.name" class="ref-row">
        <div class="ref-row__main">
          <RouterLink :to="treeUrl(repo, branch.name)" class="ref-row__name">{{
            branch.name
          }}</RouterLink>
          <span v-if="branch.isDefault" class="badge badge--branch">default</span>
          <div class="ref-row__meta muted">
            <RouterLink :to="commitUrl(repo, branch.sha)">{{ branch.subject }}</RouterLink>
            · {{ branch.author }} ·
            <time :datetime="branch.date">{{ relativeTime(branch.date) }}</time>
          </div>
        </div>
        <div
          v-if="!branch.isDefault && result.data.value?.defaultBranch"
          class="divergence"
          :title="`${branch.behind} behind, ${branch.ahead} ahead of ${result.data.value.defaultBranch}`"
        >
          <span class="divergence__count">{{ branch.behind }}</span>
          <span class="divergence__bar divergence__bar--behind">
            <span :style="{ width: `${(branch.behind / scale) * 100}%` }"></span>
          </span>
          <span class="divergence__bar divergence__bar--ahead">
            <span :style="{ width: `${(branch.ahead / scale) * 100}%` }"></span>
          </span>
          <span class="divergence__count">{{ branch.ahead }}</span>
        </div>
        <RouterLink
          v-if="!branch.isDefault && result.data.value?.defaultBranch"
          :to="{
            name: 'compare',
            params: { repo },
            query: { base: result.data.value.defaultBranch, head: branch.name },
          }"
          class="button button--small"
        >
          Compare
        </RouterLink>
      </li>
    </ul>
    <p v-else-if="result.data.value" class="muted">No branches match.</p>
  </div>
</template>
