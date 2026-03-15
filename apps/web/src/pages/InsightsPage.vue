<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { getInsights } from '../api';
import ActivityChart from '../components/ActivityChart.vue';
import { useAsync } from '../composables/useAsync';
import { useRepo } from '../composables/useRepo';
import { plural } from '../lib/text';

const { name: repo, currentRef } = useRepo();

const insights = useAsync(
  () => getInsights(repo.value, currentRef.value),
  () => [repo.value, currentRef.value],
);

const total = computed(
  () => insights.data.value?.contributors.reduce((sum, c) => sum + c.commits, 0) ?? 0,
);
const yearTotal = computed(
  () => insights.data.value?.activity.reduce((sum, w) => sum + w.commits, 0) ?? 0,
);
const top = computed(() => insights.data.value?.contributors[0]?.commits ?? 1);
</script>

<template>
  <div class="insights-view">
    <div v-if="insights.error.value" class="alert alert--error">
      {{ insights.error.value.message }}
    </div>
    <p v-else-if="insights.loading.value && !insights.data.value" class="muted">Loading…</p>

    <template v-if="insights.data.value">
      <section class="panel insights-section">
        <header class="insights-section__header">
          <h2>Commit activity</h2>
          <span class="muted">{{ plural(yearTotal, 'commit') }} in the last active year</span>
        </header>
        <ActivityChart :weeks="insights.data.value.activity" />
      </section>

      <section class="panel insights-section">
        <header class="insights-section__header">
          <h2>Contributors</h2>
          <span class="muted"
            >{{ plural(insights.data.value.contributors.length, 'person', 'people') }} ·
            {{ plural(total, 'commit') }}</span
          >
        </header>
        <ol class="contributors">
          <li v-for="person in insights.data.value.contributors" :key="person.email + person.name">
            <span class="contributors__name">
              <strong>{{ person.name }}</strong>
              <span class="muted">{{ person.email }}</span>
            </span>
            <span class="contributors__bar">
              <span :style="{ width: `${(person.commits / top) * 100}%` }"></span>
            </span>
            <RouterLink
              :to="{
                name: 'commits',
                params: { repo, ref: currentRef },
                query: { author: person.email || person.name },
              }"
              class="contributors__count"
            >
              {{ plural(person.commits, 'commit') }}
            </RouterLink>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>
