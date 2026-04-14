<script setup lang="ts">
import { computed, ref } from 'vue';
import type { FileDiff } from '../api';
import { splitRows, type DiffMode } from '../lib/diff';

const props = withDefaults(defineProps<{ file: FileDiff; mode?: DiffMode }>(), {
  mode: 'unified',
});

/** Very large diffs start collapsed so the page stays responsive. */
const LARGE_DIFF_LINES = 400;

const lineCount = computed(() => props.file.hunks.reduce((sum, h) => sum + h.lines.length, 0));
const collapsed = ref(lineCount.value > LARGE_DIFF_LINES);

const STATUS_LABEL: Record<FileDiff['status'], string> = {
  added: 'Added',
  deleted: 'Deleted',
  modified: 'Modified',
  renamed: 'Renamed',
  copied: 'Copied',
};

const anchor = computed(() => `diff-${encodeURIComponent(props.file.path)}`);

const splitHunks = computed(() =>
  props.mode === 'split' ? props.file.hunks.map((hunk) => splitRows(hunk)) : [],
);
</script>

<template>
  <section :id="anchor" class="panel diff">
    <header class="diff__header">
      <button
        class="diff__toggle"
        type="button"
        :aria-expanded="!collapsed"
        :aria-label="collapsed ? 'Expand diff' : 'Collapse diff'"
        @click="collapsed = !collapsed"
      >
        {{ collapsed ? '▸' : '▾' }}
      </button>
      <span class="status-badge" :class="`status-badge--${file.status}`">
        {{ STATUS_LABEL[file.status] }}
      </span>
      <span class="diff__path">
        <template v-if="file.oldPath && file.oldPath !== file.path">
          <span class="muted">{{ file.oldPath }} → </span>
        </template>
        {{ file.path }}
      </span>
      <span class="diff__counts">
        <span class="added">+{{ file.additions }}</span>
        <span class="deleted">−{{ file.deletions }}</span>
      </span>
    </header>

    <div v-if="!collapsed" class="diff__body">
      <p v-if="file.binary" class="diff__notice muted">Binary file changed.</p>
      <p v-else-if="file.hunks.length === 0" class="diff__notice muted">
        <template v-if="file.status === 'renamed'">File renamed without changes.</template>
        <template v-else-if="file.oldMode !== file.newMode && file.newMode">
          File mode changed from {{ file.oldMode }} to {{ file.newMode }}.
        </template>
        <template v-else>No content changes.</template>
      </p>
      <table v-else-if="mode === 'split'" class="diff__table diff__table--split">
        <colgroup>
          <col class="diff__col-number" />
          <col />
          <col class="diff__col-number" />
          <col />
        </colgroup>
        <tbody v-for="(hunk, h) in file.hunks" :key="h">
          <tr class="diff__hunk">
            <td colspan="4">{{ hunk.header }}</td>
          </tr>
          <tr v-for="(row, i) in splitHunks[h]" :key="i" class="diff__line">
            <td class="diff__number" :data-line="row.left?.oldLine ?? ''"></td>
            <td
              class="diff__code"
              :class="row.left ? `diff__cell--${row.left.type}` : 'diff__cell--empty'"
            >
              {{ row.left?.content }}
            </td>
            <td class="diff__number" :data-line="row.right?.newLine ?? ''"></td>
            <td
              class="diff__code"
              :class="row.right ? `diff__cell--${row.right.type}` : 'diff__cell--empty'"
            >
              {{ row.right?.content }}
            </td>
          </tr>
        </tbody>
      </table>
      <table v-else class="diff__table">
        <tbody v-for="(hunk, h) in file.hunks" :key="h">
          <tr class="diff__hunk">
            <td colspan="3">{{ hunk.header }}</td>
          </tr>
          <tr
            v-for="(line, i) in hunk.lines"
            :key="i"
            :class="`diff__line diff__line--${line.type}`"
          >
            <td class="diff__number" :data-line="line.oldLine ?? ''"></td>
            <td class="diff__number" :data-line="line.newLine ?? ''"></td>
            <td class="diff__code">
              <span class="diff__marker" aria-hidden="true">{{
                line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '
              }}</span
              >{{ line.content
              }}<span v-if="line.noNewline" class="diff__eof" title="No newline at end of file"
                >⏎̸</span
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <button v-else class="diff__expand" type="button" @click="collapsed = false">
      Show {{ lineCount }} changed lines
    </button>
  </section>
</template>
