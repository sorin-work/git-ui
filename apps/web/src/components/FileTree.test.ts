import { mount, RouterLinkStub } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { TreeEntry } from '../api';
import FileTree from './FileTree.vue';

const entries: TreeEntry[] = [
  { name: 'src', path: 'docs/src', type: 'tree', mode: '040000', sha: 'a'.repeat(40), size: null },
  {
    name: 'vendor',
    path: 'docs/vendor',
    type: 'commit',
    mode: '160000',
    sha: 'b'.repeat(40),
    size: null,
  },
  {
    name: 'C# notes.md',
    path: 'docs/C# notes.md',
    type: 'blob',
    mode: '100644',
    sha: 'c'.repeat(40),
    size: 2048,
  },
];

function render(path = 'docs', gitRef = 'feature/x') {
  return mount(FileTree, {
    props: { repo: 'demo', gitRef, path, entries },
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
}

describe('FileTree', () => {
  it('links folders to the tree and files to the blob view', () => {
    const links = render()
      .findAllComponents(RouterLinkStub)
      .map((l) => l.props('to'));
    expect(links).toEqual([
      '/demo/tree/feature%2Fx',
      '/demo/tree/feature%2Fx/docs/src',
      '/demo/blob/feature%2Fx/docs/C%23%20notes.md',
    ]);
  });

  it('shows submodules with their commit and file sizes', () => {
    const wrapper = render();
    expect(wrapper.text()).toContain('vendor @ bbbbbbb');
    expect(wrapper.text()).toContain('2.0 KB');
  });

  it('has no parent link at the repository root', () => {
    const wrapper = render('');
    expect(wrapper.find('[aria-label="Parent folder"]').exists()).toBe(false);
  });
});
