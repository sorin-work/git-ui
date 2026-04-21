import { describe, expect, it, vi } from 'vitest';
import { LruCache } from './cache.js';

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
});
