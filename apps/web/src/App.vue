<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import ThemeToggle from './components/ThemeToggle.vue';
</script>

<template>
  <header class="topbar">
    <RouterLink to="/" class="brand">
      <img src="/favicon.svg" alt="" width="24" height="24" />
      <span>git-ui</span>
    </RouterLink>
    <ThemeToggle />
  </header>
  <main class="container">
    <RouterView />
  </main>
</template>
