<script setup lang="ts">
import { computed } from 'vue';
import { highlightLines } from '../lib/highlight';

const props = defineProps<{ content: string; language: string | null }>();

// highlightLines escapes everything highlight.js does not wrap in its own spans,
// so the result is safe to render with v-html.
const lines = computed(() => highlightLines(props.content, props.language));
</script>

<template>
  <div class="code">
    <table class="code__table">
      <tbody>
        <tr v-for="(line, index) in lines" :id="`L${index + 1}`" :key="index">
          <td class="code__number" :data-line="index + 1"></td>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <td class="code__line hljs" v-html="line || ' '"></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
