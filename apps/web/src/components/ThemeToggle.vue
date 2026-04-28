<script setup lang="ts">
import { ref, watchEffect } from 'vue';

type Theme = 'system' | 'light' | 'dark';
const KEY = 'git-ui:theme';
const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<Theme, string> = { system: '◐ System', light: '☀ Light', dark: '☾ Dark' };

function stored(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

const theme = ref<Theme>(stored());

watchEffect(() => {
  if (theme.value === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme.value;
  try {
    if (theme.value === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme.value);
  } catch {
    // Storage disabled: the choice lasts until the page is closed.
  }
});
</script>

<template>
  <button
    class="theme-toggle"
    type="button"
    :title="`Theme: ${theme}. Click to change.`"
    @click="theme = NEXT[theme]"
  >
    {{ LABEL[theme] }}
  </button>
</template>
