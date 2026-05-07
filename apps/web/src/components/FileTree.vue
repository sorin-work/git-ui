<script setup lang="ts">
import { RouterLink } from 'vue-router';
import type { CommitBrief, TreeEntry } from '../api';
import { blobUrl, commitUrl, formatBytes, parentPath, treeUrl } from '../lib/paths';
import { formatDateTime, relativeTime } from '../lib/time';
import AppIcon from './AppIcon.vue';

defineProps<{
  repo: string;
  gitRef: string;
  path: string;
  entries: TreeEntry[];
  /** Last commit per entry name; loaded after the listing, so it may be missing. */
  latest?: Record<string, CommitBrief>;
}>();
</script>

<template>
  <table class="file-tree panel">
    <tbody>
      <tr v-if="path">
        <td class="file-tree__icon"><AppIcon name="folder" /></td>
        <td colspan="4">
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
        <td class="file-tree__commit">
          <RouterLink
            v-if="latest?.[entry.name]"
            :to="commitUrl(repo, latest[entry.name]!.sha)"
            class="muted"
          >
            {{ latest[entry.name]!.subject }}
          </RouterLink>
        </td>
        <td class="file-tree__date muted">
          <time
            v-if="latest?.[entry.name]"
            :datetime="latest[entry.name]!.date"
            :title="formatDateTime(latest[entry.name]!.date)"
          >
            {{ relativeTime(latest[entry.name]!.date) }}
          </time>
        </td>
        <td class="file-tree__size muted">
          {{ entry.size === null ? '' : formatBytes(entry.size) }}
        </td>
      </tr>
    </tbody>
  </table>
</template>
