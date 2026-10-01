<script setup lang="ts">
import type { LanguageShare } from '../api';

defineProps<{ languages: LanguageShare[] }>();

function label(language: LanguageShare): string {
  return `${language.name} ${language.percent.toFixed(1)}%`;
}
</script>

<template>
  <section class="languages panel" aria-labelledby="languages-heading">
    <h2 id="languages-heading" class="languages__heading">Languages</h2>
    <div class="languages__bar" role="img" :aria-label="languages.map(label).join(', ')">
      <span
        v-for="language in languages"
        :key="language.name"
        class="languages__segment"
        :style="{ width: `${language.percent}%`, background: language.color }"
        :title="label(language)"
      />
    </div>
    <ul class="languages__list">
      <li v-for="language in languages" :key="language.name">
        <span class="languages__dot" :style="{ background: language.color }" />
        <span class="languages__name">{{ language.name }}</span>
        <span class="muted">{{ language.percent.toFixed(1) }}%</span>
      </li>
    </ul>
  </section>
</template>
