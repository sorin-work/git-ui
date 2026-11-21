import { describe, expect, it, vi } from 'vitest';
import { LruCache, roughSize } from './cache.js';

describe('LruCache', () => {
  it('loads each key once', async () => {
    const cache = new LruCache<number>(10);
    const load = vi.fn(async () => 42);
    expect(await cache.get('a', load)).toBe(42);
    expect(await cache.get('a', load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('shares a load that is still in flight', async () => {
    const cache = new LruCache<number>(10);
    const load = vi.fn(() => new Promise<number>((resolve) => setTimeout(() => resolve(1), 5)));
    const [a, b] = await Promise.all([cache.get('k', load), cache.get('k', load)]);
    expect([a, b]).toEqual([1, 1]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('evicts the least recently used entry', async () => {
    const cache = new LruCache<string>(2);
    await cache.get('a', async () => 'a');
    await cache.get('b', async () => 'b');
    await cache.get('a', async () => 'never'); // touch a
    await cache.get('c', async () => 'c'); // evicts b

    expect(await cache.get('a', async () => 'never')).toBe('a');
    expect(await cache.get('c', async () => 'never')).toBe('c');
    const reload = vi.fn(async () => 'b2');
    expect(await cache.get('b', reload)).toBe('b2');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(2);
  });

  it('does not keep failures', async () => {
    const cache = new LruCache<number>(10);
    await expect(cache.get('x', async () => Promise.reject(new Error('boom')))).rejects.toThrow();
    await Promise.resolve();
    expect(await cache.get('x', async () => 7)).toBe(7);
  });

  it('evicts the oldest entries when the byte budget is used up', async () => {
    const cache = new LruCache<string>(100, 25, (value) => value.length);
    await cache.get('a', async () => 'x'.repeat(10));
    await cache.get('b', async () => 'x'.repeat(10));
    await cache.get('c', async () => 'x'.repeat(10)); // 30 > 25: a goes
    await Promise.resolve();
    expect(cache.size).toBe(2);
    expect(cache.byteSize).toBe(20);
    const reload = vi.fn(async () => 'a');
    await cache.get('a', reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not keep a value bigger than the whole budget', async () => {
    const cache = new LruCache<string>(100, 25, (value) => value.length);
    await cache.get('small', async () => 'x');
    await cache.get('huge', async () => 'x'.repeat(100));
    await Promise.resolve();
    expect(cache.size).toBe(1);
    expect(cache.byteSize).toBe(1);
  });

  it('counts pending loads as nothing until they settle', async () => {
    const cache = new LruCache<string>(100, 25, (value) => value.length);
    let resolve!: (value: string) => void;
    const pending = cache.get('slow', () => new Promise<string>((r) => (resolve = r)));
    expect(cache.byteSize).toBe(0);
    resolve('x'.repeat(5));
    await pending;
    await Promise.resolve();
    expect(cache.byteSize).toBe(5);
  });
});

describe('roughSize', () => {
  it('grows with the content and copes with shared and nested values', () => {
    const small = roughSize({ path: 'a', lines: [1, 2] });
    const big = roughSize({ path: 'a', lines: Array.from({ length: 1000 }, (_, i) => i) });
    expect(big).toBeGreaterThan(small * 10);
    expect(roughSize('x'.repeat(1000))).toBeGreaterThanOrEqual(2000);
    expect(roughSize(Buffer.alloc(4096))).toBeGreaterThanOrEqual(4096);
    const shared = { a: 'x'.repeat(100) };
    expect(roughSize([shared, shared])).toBeLessThan(2 * roughSize(shared));
  });
});
