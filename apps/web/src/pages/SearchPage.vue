<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { searchCode, type SearchMatch } from '../api';
import { useAsync } from '../composables/useAsync';
import { useRepo } from '../composables/useRepo';
import { blobUrl } from '../lib/paths';
import { splitMatches } from '../lib/search';
import { plural } from '../lib/text';

const route = useRoute();
const router = useRouter();
const { name: repo, currentRef } = useRepo();

const query = computed(() => (route.query.q as string | undefined) ?? '');
const caseSensitive = computed(() => route.query.case === '1');

const input = ref(query.value);
const caseInput = ref(caseSensitive.value);
watch(query, (q) => (input.value = q));

const result = useAsync(
  async () =>
    query.value.trim().length >= 2
      ? searchCode(repo.value, currentRef.value, query.value, caseSensitive.value)
      : null,
  () => [repo.value, currentRef.value, query.value, caseSensitive.value],
);

const byFile = computed(() => {
  const groups = new Map<string, SearchMatch[]>();
  for (const match of result.data.value?.matches ?? []) {
    groups.set(match.path, [...(groups.get(match.path) ?? []), match]);
  }
  return [...groups.entries()].map(([path, matches]) => ({ path, matches }));
});

function submit() {
  void router.replace({
    query: { q: input.value.trim() || undefined, case: caseInput.value ? '1' : undefined },
  });
}
</script>

<template>
  <div class="search-view">
    <form class="filters" @submit.prevent="submit">
      <input
        v-model="input"
        class="input"
        type="search"
        placeholder="Search code…"
        aria-label="Search code"
        autofocus
      />
      <label class="checkbox">
        <input v-model="caseInput" type="checkbox" />
        Match case
      </label>
      <button class="button" type="submit">Search</button>
    </form>

    <div v-if="result.error.value" class="alert alert--error">{{ result.error.value.message }}</div>
    <p v-else-if="result.loading.value" class="muted">Searching…</p>

    <template v-if="result.data.value && !result.loading.value">
      <p class="muted">
        {{ plural(result.data.value.matches.length, 'match', 'matches') }} in
        {{ plural(byFile.length, 'file') }}
        <template v-if="result.data.value.truncated"> (showing the first results only)</template>
      </p>

      <section v-for="file in byFile" :key="file.path" class="panel search-file">
        <header class="search-file__header">
          <RouterLink :to="blobUrl(repo, currentRef, file.path)">{{ file.path }}</RouterLink>
        </header>
        <table class="code__table">
          <tbody>
            <tr v-for="match in file.matches" :key="match.line">
              <td class="code__number">
                <RouterLink
                  :to="`${blobUrl(repo, currentRef, file.path)}#L${match.line}`"
                  class="search-file__line"
                  >{{ match.line }}</RouterLink
                >
              </td>
              <td class="code__line">
                <template
                  v-for="(part, i) in splitMatches(match.text, query, caseSensitive)"
                  :key="i"
                >
                  <mark v-if="part.match">{{ part.text }}</mark>
                  <template v-else>{{ part.text }}</template>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>
