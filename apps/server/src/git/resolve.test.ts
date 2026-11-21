import { describe, expect, it } from 'vitest';
import { refCandidates } from './resolve.js';

describe('refCandidates', () => {
  const sha = 'a'.repeat(40);

  it('tries branches before tags, and short shas last', () => {
    expect(refCandidates('main')).toEqual([
      ['refs/heads/main', 'branch'],
      ['refs/tags/main', 'tag'],
    ]);
    expect(refCandidates('deadbeef')).toEqual([
      ['refs/heads/deadbeef', 'branch'],
      ['refs/tags/deadbeef', 'tag'],
      ['deadbeef', 'commit'],
    ]);
  });

  it('takes a full sha as a commit first', () => {
    expect(refCandidates(sha)[0]).toEqual([sha, 'commit']);
  });

  it('accepts full branch and tag names, HEAD, and nothing else under refs/', () => {
    expect(refCandidates('refs/tags/v1')).toEqual([['refs/tags/v1', 'tag']]);
    expect(refCandidates('refs/heads/v1')).toEqual([['refs/heads/v1', 'branch']]);
    expect(refCandidates('HEAD')).toEqual([['HEAD', 'commit']]);
    expect(refCandidates('refs/stash')).toEqual([]);
    expect(refCandidates('refs/remotes/origin/main')).toEqual([]);
  });

  it('does not take short hex strings as shas', () => {
    expect(refCandidates('abc12')).toHaveLength(2);
  });
});
