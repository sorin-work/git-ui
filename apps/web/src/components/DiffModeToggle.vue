<script setup lang="ts">
import type { DiffMode } from '../lib/diff';

defineProps<{ modelValue: DiffMode }>();
const emit = defineEmits<{ 'update:modelValue': [mode: DiffMode] }>();
</script>

<template>
  <div class="segmented" role="radiogroup" aria-label="Diff layout">
    <button
      v-for="mode in ['unified', 'split'] as const"
      :key="mode"
      type="button"
      role="radio"
      :aria-checked="modelValue === mode"
      :class="{ active: modelValue === mode }"
      @click="emit('update:modelValue', mode)"
    >
      {{ mode === 'unified' ? 'Unified' : 'Split' }}
    </button>
  </div>
</template>
