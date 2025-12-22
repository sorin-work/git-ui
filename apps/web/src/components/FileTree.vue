<script setup lang="ts">
import { RouterLink } from 'vue-router';
import type { TreeEntry } from '../api';
import { blobUrl, formatBytes, parentPath, treeUrl } from '../lib/paths';
import AppIcon from './AppIcon.vue';

defineProps<{ repo: string; gitRef: string; path: string; entries: TreeEntry[] }>();
</script>

<template>
  <table class="file-tree panel">
    <tbody>
      <tr v-if="path">
        <td class="file-tree__icon"><AppIcon name="folder" /></td>
        <td colspan="2">
          <RouterLink :to="treeUrl(repo, gitRef, parentPath(path))" aria-label="Parent folder">
            ..
          </RouterLink>
        </td>
      </tr>
      <tr v-for="entry in entries" :key="entry.path">
        <td class="file-tree__icon" :class="`file-tree__icon--${entry.type}`">
          <AppIcon
            :name="
              entry.type === 'tree' ? 'folder' : entry.type === 'commit' ? 'submodule' : 'file'
            "
          />
        </td>
        <td class="file-tree__name">
          <RouterLink v-if="entry.type === 'tree'" :to="treeUrl(repo, gitRef, entry.path)">
            {{ entry.name }}
          </RouterLink>
          <RouterLink v-else-if="entry.type === 'blob'" :to="blobUrl(repo, gitRef, entry.path)">
            {{ entry.name }}
          </RouterLink>
          <span v-else :title="`Submodule at ${entry.sha.slice(0, 7)}`">
            {{ entry.name }} <span class="muted">@ {{ entry.sha.slice(0, 7) }}</span>
          </span>
        </td>
        <td class="file-tree__size muted">
          {{ entry.size === null ? '' : formatBytes(entry.size) }}
        </td>
      </tr>
    </tbody>
  </table>
</template>
