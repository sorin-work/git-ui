import { describe, expect, it } from 'vitest';
import { parseCoAuthors } from './commit.js';

describe('parseCoAuthors', () => {
  it('reads Co-authored-by trailers in any case, once per email', () => {
    const body = [
      'Pairing session.',
      '',
      'Co-authored-by: Ana Pop <ana@example.com>',
      'co-authored-by: Ben Ode <ben@example.com>',
      'Co-Authored-By: Ana P. <ANA@example.com>',
      'Signed-off-by: Cleo Ray <cleo@example.com>',
    ].join('\n');
    expect(parseCoAuthors(body)).toEqual([
      { name: 'Ana Pop', email: 'ana@example.com' },
      { name: 'Ben Ode', email: 'ben@example.com' },
    ]);
  });

  it('ignores mentions that are not trailers', () => {
    expect(parseCoAuthors('Thanks to Co-authored-by: nobody')).toEqual([]);
  });
});
