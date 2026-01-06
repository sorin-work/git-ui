<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { listTags } from '../api';
import { useAsync } from '../composables/useAsync';
import { useRepo } from '../composables/useRepo';
import { commitUrl, treeUrl } from '../lib/paths';
import { formatDate } from '../lib/time';

const { name: repo } = useRepo();
const tags = useAsync(
  () => listTags(repo.value),
  () => repo.value,
);
</script>

<template>
  <div class="tags-view">
    <div v-if="tags.error.value" class="alert alert--error">{{ tags.error.value.message }}</div>

    <div v-if="tags.data.value && tags.data.value.length === 0" class="panel empty">
      <h2>No tags yet</h2>
      <p class="muted">Tags mark releases and other important points in history.</p>
    </div>

    <ul v-if="tags.data.value?.length" class="panel ref-list">
      <li v-for="tag in tags.data.value" :key="tag.name" class="ref-row">
        <div class="ref-row__main">
          <RouterLink :to="treeUrl(repo, tag.name)" class="ref-row__name">{{
            tag.name
          }}</RouterLink>
          <span v-if="tag.annotated" class="badge">annotated</span>
          <div class="ref-row__meta muted">
            {{ tag.subject }} ·
            <time :datetime="tag.date">{{ formatDate(tag.date) }}</time>
          </div>
        </div>
        <RouterLink :to="commitUrl(repo, tag.sha)" class="sha">{{
          tag.sha.slice(0, 7)
        }}</RouterLink>
      </li>
    </ul>
  </div>
</template>
