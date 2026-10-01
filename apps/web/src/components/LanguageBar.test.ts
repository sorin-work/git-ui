import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import LanguageBar from './LanguageBar.vue';

const languages = [
  { name: 'TypeScript', color: '#3178c6', bytes: 7000, percent: 70 },
  { name: 'Vue', color: '#41b883', bytes: 2500, percent: 25 },
  { name: 'Other', color: '#9ca3af', bytes: 500, percent: 5 },
];

describe('LanguageBar', () => {
  it('draws one segment per language, sized by its share', () => {
    const segments = mount(LanguageBar, { props: { languages } }).findAll('.languages__segment');
    expect(segments.map((s) => s.attributes('style'))).toEqual([
      expect.stringContaining('width: 70%'),
      expect.stringContaining('width: 25%'),
      expect.stringContaining('width: 5%'),
    ]);
  });

  it('lists names and percentages, and describes the bar for screen readers', () => {
    const wrapper = mount(LanguageBar, { props: { languages } });
    expect(wrapper.findAll('li').map((li) => li.text())).toEqual([
      'TypeScript70.0%',
      'Vue25.0%',
      'Other5.0%',
    ]);
    expect(wrapper.find('[role="img"]').attributes('aria-label')).toBe(
      'TypeScript 70.0%, Vue 25.0%, Other 5.0%',
    );
  });
});
