<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { compareRefs } from '../api';
import DiffView from '../components/DiffView.vue';
import RefSelector from '../components/RefSelector.vue';
import { useAsync } from '../composables/useAsync';
import { useRepo } from '../composables/useRepo';
import { commitUrl } from '../lib/paths';
import { plural } from '../lib/text';
import { relativeTime } from '../lib/time';

const route = useRoute();
const router = useRouter();
const { name: repo, info } = useRepo();

const base = computed(
  () => (route.query.base as string | undefined) ?? info.value?.defaultBranch ?? 'HEAD',
);
const head = computed(() => (route.query.head as string | undefined) ?? base.value);

const result = useAsync(
  () => compareRefs(repo.value, base.value, head.value),
  () => [repo.value, base.value, head.value],
);

function update(query: { base?: string; head?: string }) {
  void router.replace({ query: { base: base.value, head: head.value, ...query } });
}
</script>

<template>
  <div class="compare-view">
    <div class="compare-bar panel">
      <span class="muted">base</span>
      <RefSelector :repo="repo" :current="base" @select="(r) => update({ base: r })" />
      <button
        class="button button--small"
        type="button"
        title="Swap base and compare"
        @click="update({ base: head, head: base })"
      >
        ⇄
      </button>
      <span class="muted">compare</span>
      <RefSelector :repo="repo" :current="head" @select="(r) => update({ head: r })" />
    </div>

    <div v-if="result.error.value" class="alert alert--error">{{ result.error.value.message }}</div>
    <p v-else-if="result.loading.value && !result.data.value" class="muted">Comparing…</p>

    <template v-if="result.data.value">
      <div v-if="result.data.value.aheadBy === 0" class="panel empty">
        <h2>Nothing to compare</h2>
        <p class="muted">
          <code>{{ head }}</code> has no commits that <code>{{ base }}</code> doesn't have.
        </p>
      </div>

      <template v-else>
        <p class="diff-summary">
          <strong>{{ plural(result.data.value.aheadBy, 'commit') }}</strong> ahead of
          <code>{{ base }}</code
          ><template v-if="result.data.value.behindBy">
            and {{ plural(result.data.value.behindBy, 'commit') }} behind</template
          >, {{ plural(result.data.value.stats.files, 'file') }} changed
          <span class="added">+{{ result.data.value.stats.additions }}</span>
          <span class="deleted">−{{ result.data.value.stats.deletions }}</span>
        </p>

        <ul class="panel commit-list compare-commits">
          <li v-for="commit in result.data.value.commits" :key="commit.sha" class="commit-row">
            <div class="commit-row__main">
              <RouterLink :to="commitUrl(repo, commit.sha)" class="commit-row__subject">
                {{ commit.subject }}
              </RouterLink>
              <div class="commit-row__meta muted">
                {{ commit.author.name }} · {{ relativeTime(commit.author.date) }}
              </div>
            </div>
            <RouterLink :to="commitUrl(repo, commit.sha)" class="sha">{{
              commit.shortSha
            }}</RouterLink>
          </li>
          <li v-if="result.data.value.truncated" class="commit-row muted">
            Only the first {{ result.data.value.commits.length }} commits are shown.
          </li>
        </ul>

        <DiffView v-for="file in result.data.value.files" :key="file.path" :file="file" />
      </template>
    </template>
  </div>
</template>
