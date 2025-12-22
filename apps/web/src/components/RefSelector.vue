<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { listBranches, listTags } from '../api';
import { useAsync } from '../composables/useAsync';
import AppIcon from './AppIcon.vue';

const props = defineProps<{ repo: string; current: string }>();
const emit = defineEmits<{ select: [ref: string] }>();

const open = ref(false);
const tab = ref<'branches' | 'tags'>('branches');
const filter = ref('');
const root = ref<HTMLElement>();

const refs = useAsync(
  async () => {
    const [branches, tags] = await Promise.all([listBranches(props.repo), listTags(props.repo)]);
    return { branches: branches.branches.map((b) => b.name), tags: tags.map((t) => t.name) };
  },
  () => props.repo,
);

const options = computed(() => {
  const names = refs.data.value?.[tab.value] ?? [];
  const needle = filter.value.trim().toLowerCase();
  return needle ? names.filter((n) => n.toLowerCase().includes(needle)) : names;
});

const label = computed(() =>
  /^[0-9a-f]{40}$/.test(props.current) ? props.current.slice(0, 7) : props.current,
);

function choose(name: string) {
  open.value = false;
  filter.value = '';
  emit('select', name);
}

function onDocumentClick(event: MouseEvent) {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false;
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick));
</script>

<template>
  <div ref="root" class="ref-selector">
    <button
      class="button"
      type="button"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="open = !open"
    >
      <AppIcon name="branch" />
      <span class="ref-selector__label">{{ label }}</span>
      <AppIcon name="chevron" :size="14" />
    </button>

    <div v-if="open" class="ref-selector__menu panel" @keydown.esc="open = false">
      <input
        v-model="filter"
        class="input"
        placeholder="Find a branch or tag…"
        aria-label="Find a branch or tag"
        autofocus
      />
      <div class="ref-selector__tabs" role="tablist">
        <button
          v-for="name in ['branches', 'tags'] as const"
          :key="name"
          type="button"
          role="tab"
          :aria-selected="tab === name"
          :class="{ active: tab === name }"
          @click="tab = name"
        >
          {{ name === 'branches' ? 'Branches' : 'Tags' }}
        </button>
      </div>
      <ul role="listbox" class="ref-selector__list">
        <li
          v-for="name in options"
          :key="name"
          role="option"
          :aria-selected="name === current"
          :class="{ current: name === current }"
          @click="choose(name)"
        >
          {{ name }}
        </li>
        <li v-if="refs.data.value && options.length === 0" class="muted empty-option">
          Nothing found
        </li>
      </ul>
    </div>
  </div>
</template>
