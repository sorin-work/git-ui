<script setup lang="ts">
import { archiveUrl } from '../api';

defineProps<{ repo: string; gitRef: string }>();
</script>

<template>
  <details class="download-menu">
    <summary class="button">Download</summary>
    <div class="download-menu__panel panel">
      <a :href="archiveUrl(repo, gitRef, 'zip')" download>ZIP archive</a>
      <a :href="archiveUrl(repo, gitRef, 'tar.gz')" download>tar.gz archive</a>
    </div>
  </details>
</template>
