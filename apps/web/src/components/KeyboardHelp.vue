<script setup lang="ts">
import { onMounted, ref } from 'vue';

const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLElement>();

const SHORTCUTS = [
  { keys: ['t'], action: 'Go to a file in this repository' },
  { keys: ['/'], action: 'Focus the search or filter box on the page' },
  { keys: ['Shift', 'Click'], action: 'Select a range of lines in a file' },
  { keys: ['Esc'], action: 'Close dialogs and menus' },
  { keys: ['?'], action: 'Show this help' },
];

onMounted(() => dialog.value?.focus());
</script>

<template>
  <div class="finder-backdrop" @mousedown.self="emit('close')" @keydown.esc="emit('close')">
    <div
      ref="dialog"
      class="panel help-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
      tabindex="-1"
    >
      <header class="help-dialog__header">
        <h2 id="help-title">Keyboard shortcuts</h2>
        <button class="button button--small" type="button" @click="emit('close')">Close</button>
      </header>
      <dl class="help-dialog__list">
        <template v-for="shortcut in SHORTCUTS" :key="shortcut.action">
          <dt>
            <template v-for="(key, i) in shortcut.keys" :key="key">
              <kbd>{{ key }}</kbd
              ><span v-if="i < shortcut.keys.length - 1"> + </span>
            </template>
          </dt>
          <dd>{{ shortcut.action }}</dd>
        </template>
      </dl>
    </div>
  </div>
</template>
