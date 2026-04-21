/**
 * A small least-recently-used cache for promises. Everything git returns for
 * a full commit sha (trees, files, diffs, blame) never changes, so it can be
 * kept as long as there is room. Rejected promises are not kept.
 */
export class LruCache<T> {
  private readonly entries = new Map<string, Promise<T>>();

  constructor(private readonly maxEntries: number) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing) {
      // Re-insert to mark as most recently used.
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing;
    }

    const promise = load();
    this.entries.set(key, promise);
    promise.catch(() => {
      if (this.entries.get(key) === promise) this.entries.delete(key);
    });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
    return promise;
  }

  clear() {
    this.entries.clear();
  }
}

/** Shared cache for git results keyed by repository path, commit sha and more. */
export const gitCache = new LruCache<unknown>(500);

/** Caches `load` under a key made of `parts`; only use for immutable (sha-addressed) data. */
export function cached<T>(parts: readonly (string | number)[], load: () => Promise<T>): Promise<T> {
  return gitCache.get(JSON.stringify(parts), load) as Promise<T>;
}
