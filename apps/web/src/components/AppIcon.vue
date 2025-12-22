<script setup lang="ts">
const PATHS = {
  folder:
    'M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2h9A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z',
  file: 'M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 0v5h5',
  submodule: 'M4 4h16v16H4zM9 4v16M4 9h16',
  branch:
    'M7 4v12m0 0a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm10-8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm0 0c0 5-6 4-10 8',
  tag: 'M3 12V4h8l9 9-8 8zM7.5 7.5h.01',
  commit: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3 12h6m6 0h6',
  code: 'm8 7-5 5 5 5m8-10 5 5-5 5',
  chevron: 'm6 9 6 6 6-6',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  search: 'm20 20-4.5-4.5M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12z',
} as const;

defineProps<{ name: keyof typeof PATHS; size?: number }>();
</script>

<template>
  <svg
    :width="size ?? 16"
    :height="size ?? 16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="icon"
  >
    <path :d="PATHS[name]" />
  </svg>
</template>
