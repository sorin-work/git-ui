import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { FileDiff } from '../api';
import DiffView from './DiffView.vue';

function file(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    path: 'src/app.ts',
    oldPath: null,
    status: 'modified',
    binary: false,
    additions: 1,
    deletions: 1,
    similarity: null,
    oldMode: null,
    newMode: null,
    hunks: [
      {
        header: '@@ -1,2 +1,2 @@',
        oldStart: 1,
        oldLines: 2,
        newStart: 1,
        newLines: 2,
        section: '',
        lines: [
          { type: 'context', content: 'const a = 1;', oldLine: 1, newLine: 1 },
          { type: 'del', content: '<b>old</b>', oldLine: 2, newLine: null },
          { type: 'add', content: 'const b = 2;', oldLine: null, newLine: 2, noNewline: true },
        ],
      },
    ],
    ...overrides,
  };
}

describe('DiffView', () => {
  it('renders every line with its numbers and change type', () => {
    const wrapper = mount(DiffView, { props: { file: file() } });
    const rows = wrapper.findAll('tr.diff__line');
    expect(rows.map((r) => r.classes().find((c) => c.startsWith('diff__line--')))).toEqual([
      'diff__line--context',
      'diff__line--del',
      'diff__line--add',
    ]);
    const numbers = rows[2]!.findAll('.diff__number').map((td) => td.attributes('data-line'));
    expect(numbers).toEqual(['', '2']);
    expect(wrapper.find('.diff__eof').exists()).toBe(true);
  });

  it('shows code as text, never as HTML', () => {
    const wrapper = mount(DiffView, { props: { file: file() } });
    expect(wrapper.find('.diff__line--del b').exists()).toBe(false);
    expect(wrapper.find('.diff__line--del').text()).toContain('<b>old</b>');
  });

  it('shows renames and binary changes without a table', () => {
    const wrapper = mount(DiffView, {
      props: {
        file: file({
          status: 'renamed',
          oldPath: 'old.png',
          path: 'new.png',
          binary: true,
          hunks: [],
        }),
      },
    });
    expect(wrapper.find('.diff__path').text().replace(/\s+/g, ' ')).toBe('old.png → new.png');
    expect(wrapper.text()).toContain('Binary file changed.');
    expect(wrapper.find('table').exists()).toBe(false);
  });

  it('collapses and expands', async () => {
    const wrapper = mount(DiffView, { props: { file: file() } });
    await wrapper.find('.diff__toggle').trigger('click');
    expect(wrapper.find('table').exists()).toBe(false);
    await wrapper.find('.diff__expand').trigger('click');
    expect(wrapper.find('table').exists()).toBe(true);
  });

  it('lays lines out side by side in split mode', () => {
    const wrapper = mount(DiffView, { props: { file: file(), mode: 'split' } });
    const rows = wrapper.findAll('.diff__table--split tr.diff__line');
    expect(rows).toHaveLength(2);
    expect(rows[1]!.find('.diff__cell--del').text()).toBe('<b>old</b>');
    expect(rows[1]!.find('.diff__cell--add').text()).toBe('const b = 2;');
  });
});
