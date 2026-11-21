import { describe, expect, it } from 'vitest';
import { BusyError, Semaphore } from './semaphore.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('Semaphore', () => {
  it('runs up to the limit at once and the rest in order', async () => {
    const slots = new Semaphore(2, 1000);
    const order: number[] = [];
    const releases = await Promise.all([slots.acquire(), slots.acquire()]);
    const third = slots.acquire().then((release) => {
      order.push(3);
      return release;
    });
    const fourth = slots.acquire().then((release) => {
      order.push(4);
      return release;
    });
    await tick();
    expect(slots.stats).toEqual({ running: 2, waiting: 2 });
    releases[0]!();
    releases[1]!();
    (await third)();
    (await fourth)();
    expect(order).toEqual([3, 4]);
    expect(slots.stats).toEqual({ running: 0, waiting: 0 });
  });

  it('ignores a second release of the same slot', async () => {
    const slots = new Semaphore(1, 1000);
    const release = await slots.acquire();
    release();
    release();
    expect(slots.stats.running).toBe(0);
    const again = await slots.acquire();
    expect(slots.stats.running).toBe(1);
    again();
  });

  it('gives the slot back when the task fails', async () => {
    const slots = new Semaphore(1, 1000);
    await expect(slots.run(() => Promise.reject(new Error('no')))).rejects.toThrow('no');
    expect(slots.stats.running).toBe(0);
  });

  it('fails with BusyError when no slot frees up in time', async () => {
    const slots = new Semaphore(1, 20);
    const release = await slots.acquire();
    await expect(slots.acquire()).rejects.toBeInstanceOf(BusyError);
    expect(slots.stats).toEqual({ running: 1, waiting: 0 });
    release();
    (await slots.acquire())();
  });

  it('lets a waiting caller leave the queue when its signal aborts', async () => {
    const slots = new Semaphore(1, 10_000);
    const release = await slots.acquire();
    const controller = new AbortController();
    const waiting = slots.acquire(controller.signal);
    await tick();
    expect(slots.stats.waiting).toBe(1);
    controller.abort(new Error('gone'));
    await expect(waiting).rejects.toThrow('gone');
    expect(slots.stats).toEqual({ running: 1, waiting: 0 });
    release();
    await expect(slots.acquire(controller.signal)).rejects.toThrow('gone');
  });
});
