<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { listFiles } from '../api';
import { useAsync } from '../composables/useAsync';
import { fuzzyFilter } from '../lib/fuzzy';
import { blobUrl } from '../lib/paths';

const props = defineProps<{ repo: string; gitRef: string }>();
const emit = defineEmits<{ close: [] }>();
const router = useRouter();

const query = ref('');
const selected = ref(0);
const input = ref<HTMLInputElement>();
const list = ref<HTMLElement>();

const files = useAsync(
  () => listFiles(props.repo, props.gitRef),
  () => [props.repo, props.gitRef],
);

const results = computed(() => fuzzyFilter(query.value, files.data.value?.files ?? [], 50));

watch(query, () => (selected.value = 0));
onMounted(() => input.value?.focus());

/** The path split into plain and matched characters, for highlighting. */
function parts(path: string, positions: number[]) {
  const hit = new Set(positions);
  return [...path].map((char, i) => ({ char, match: hit.has(i) }));
}

function open(path: string) {
  emit('close');
  void router.push(blobUrl(props.repo, props.gitRef, path));
}

async function move(delta: number) {
  const count = results.value.length;
  if (!count) return;
  selected.value = (selected.value + delta + count) % count;
  await nextTick();
  list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    void move(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    void move(-1);
  } else if (event.key === 'Enter') {
    const result = results.value[selected.value];
    if (result) open(result.item);
  } else if (event.key === 'Escape') {
    emit('close');
  }
}
</script>

<template>
  <div class="finder-backdrop" @mousedown.self="emit('close')">
    <div class="finder panel" role="dialog" aria-modal="true" aria-label="Go to file">
      <input
        ref="input"
        v-model="query"
        class="input finder__input"
        placeholder="Go to file…"
        role="combobox"
        aria-controls="finder-results"
        :aria-expanded="results.length > 0"
        @keydown="onKeydown"
      />
      <ul id="finder-results" ref="list" class="finder__results" role="listbox">
        <li v-if="files.loading.value" class="muted finder__empty">Loading files…</li>
        <li
          v-for="(result, i) in results"
          :key="result.item"
          role="option"
          :aria-selected="i === selected"
          :class="{ selected: i === selected }"
          @mouseenter="selected = i"
          @click="open(result.item)"
        >
          <template v-for="(part, k) in parts(result.item, result.match.positions)" :key="k">
            <b v-if="part.match">{{ part.char }}</b>
            <template v-else>{{ part.char }}</template>
          </template>
        </li>
        <li v-if="files.data.value && query && results.length === 0" class="muted finder__empty">
          No files match “{{ query }}”
        </li>
      </ul>
      <footer class="finder__footer muted">↑↓ to choose · Enter to open · Esc to close</footer>
    </div>
  </div>
</template>
