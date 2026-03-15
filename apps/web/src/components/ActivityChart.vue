<script setup lang="ts">
import { computed } from 'vue';
import type { WeekActivity } from '../api';
import { formatDate } from '../lib/time';

const props = defineProps<{ weeks: WeekActivity[] }>();

const WIDTH = 1040;
const HEIGHT = 140;
const GAP = 3;

const max = computed(() => Math.max(1, ...props.weeks.map((w) => w.commits)));
const barWidth = computed(() => (WIDTH - GAP * (props.weeks.length - 1)) / props.weeks.length);

const bars = computed(() =>
  props.weeks.map((week, i) => {
    const height = week.commits === 0 ? 2 : Math.max(4, (week.commits / max.value) * HEIGHT);
    return {
      ...week,
      x: i * (barWidth.value + GAP),
      y: HEIGHT - height,
      height,
      label: `${week.commits} commit${week.commits === 1 ? '' : 's'}, week of ${formatDate(week.start)}`,
    };
  }),
);

const firstLabel = computed(() => (props.weeks[0] ? formatDate(props.weeks[0].start) : ''));
const lastLabel = computed(() => {
  const last = props.weeks.at(-1);
  return last ? formatDate(last.start) : '';
});
</script>

<template>
  <figure class="activity">
    <svg
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      preserveAspectRatio="none"
      role="img"
      :aria-label="`Weekly commits from ${firstLabel} to ${lastLabel}`"
    >
      <rect
        v-for="bar in bars"
        :key="bar.start"
        :x="bar.x"
        :y="bar.y"
        :width="barWidth"
        :height="bar.height"
        rx="2"
        :class="bar.commits ? 'activity__bar' : 'activity__bar activity__bar--empty'"
      >
        <title>{{ bar.label }}</title>
      </rect>
    </svg>
    <figcaption class="activity__axis muted">
      <span>{{ firstLabel }}</span>
      <span>{{ lastLabel }}</span>
    </figcaption>
  </figure>
</template>
