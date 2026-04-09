<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { highlightLines } from '../lib/highlight';
import { lineHash, parseLineHash } from '../lib/lines';

const props = defineProps<{ content: string; language: string | null }>();
const route = useRoute();
const router = useRouter();
const root = ref<HTMLElement>();

// highlightLines escapes everything highlight.js does not wrap in its own spans,
// so the result is safe to render with v-html.
const lines = computed(() => highlightLines(props.content, props.language));
const selection = computed(() => parseLineHash(route.hash));

/** Click selects a line; shift-click extends the selection into a range. */
function select(line: number, extend: boolean) {
  const current = selection.value;
  const range =
    extend && current
      ? { start: Math.min(current.start, line), end: Math.max(current.end, line) }
      : { start: line, end: line };
  void router.replace({ query: route.query, hash: lineHash(range) });
}

function isSelected(line: number) {
  const range = selection.value;
  return range !== null && line >= range.start && line <= range.end;
}

// Bring the selected lines into view when the page opens with a #L anchor.
watch(
  [lines, () => route.hash],
  async () => {
    const range = selection.value;
    if (!range) return;
    await nextTick();
    root.value
      ?.querySelector(`#L${range.start}`)
      ?.scrollIntoView({ block: range.start === range.end ? 'center' : 'start' });
  },
  { immediate: true },
);
</script>

<template>
  <div ref="root" class="code">
    <table class="code__table">
      <tbody>
        <tr
          v-for="(line, index) in lines"
          :id="`L${index + 1}`"
          :key="index"
          :class="{ 'code__row--selected': isSelected(index + 1) }"
        >
          <td class="code__number">
            <a
              :href="`#L${index + 1}`"
              :data-line="index + 1"
              :aria-label="`Line ${index + 1}`"
              @click.prevent="select(index + 1, $event.shiftKey)"
            ></a>
          </td>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <td class="code__line hljs" v-html="line || ' '"></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
