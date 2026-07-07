<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import KeyboardHelp from './components/KeyboardHelp.vue';
import ThemeToggle from './components/ThemeToggle.vue';

const helpOpen = ref(false);

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
}

/** Shortcuts that work on every page ("t" is handled by the repository layout). */
function onKeydown(event: KeyboardEvent) {
  if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === '?') {
    event.preventDefault();
    helpOpen.value = true;
  } else if (event.key === '/') {
    const search = document.querySelector<HTMLInputElement>('main input[type="search"]');
    if (search) {
      event.preventDefault();
      search.focus();
      search.select();
    }
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <header class="topbar">
    <RouterLink to="/" class="brand">
      <img src="/favicon.svg" alt="" width="24" height="24" />
      <span>git-ui</span>
    </RouterLink>
    <button
      class="help-button"
      type="button"
      title="Keyboard shortcuts (?)"
      @click="helpOpen = true"
    >
      ?
    </button>
    <ThemeToggle />
  </header>
  <main class="container">
    <RouterView />
  </main>
  <KeyboardHelp v-if="helpOpen" @close="helpOpen = false" />
</template>
