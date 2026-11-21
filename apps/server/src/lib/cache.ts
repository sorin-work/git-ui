/**
 * Roughly how much memory a value holds: two bytes per string character,
 * eight per number or boolean, a little per key and object, and the bytes
 * of a Buffer. Walks the value once; it is only an estimate for the cache
 * budget, never exact.
 */
export function roughSize(value: unknown): number {
  let bytes = 0;
  const stack: unknown[] = [value];
  const seen = new Set<object>();
  while (stack.length > 0) {
    const item = stack.pop();
    if (typeof item === 'string') bytes += 2 * item.length + 16;
    else if (typeof item === 'number' || typeof item === 'boolean') bytes += 8;
    else if (Buffer.isBuffer(item)) bytes += item.length + 32;
    else if (item !== null && typeof item === 'object') {
      if (seen.has(item)) continue;
      seen.add(item);
      bytes += 32;
      if (Array.isArray(item)) {
        for (const element of item) stack.push(element);
      } else {
        for (const [key, element] of Object.entries(item)) {
          bytes += 2 * key.length + 16;
          stack.push(element);
        }
      }
    }
  }
  return bytes;
}

interface Entry<T> {
  promise: Promise<T>;
  /** Estimated bytes; 0 while the promise is still pending. */
  size: number;
}

/**
 * A small least-recently-used cache for promises. Everything git returns for
 * a full commit sha (trees, files, diffs, blame) never changes, so it can be
 * kept as long as there is room. Room is counted in entries and in
 * (estimated) bytes, because one diff can be many megabytes. Rejected
 * promises are not kept, and neither is a value bigger than the whole byte
 * budget.
 */
export class LruCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private bytes = 0;

  constructor(
    private readonly maxEntries: number,
    public maxBytes = Infinity,
    private readonly sizeOf: (value: T) => number = roughSize,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  /** Estimated bytes held by settled entries. */
  get byteSize(): number {
    return this.bytes;
  }

  get(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.entries.get(key);
    if (existing) {
      // Re-insert to mark as most recently used.
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing.promise;
    }

    const promise = load();
    const entry: Entry<T> = { promise, size: 0 };
    this.entries.set(key, entry);
    promise.then(
      (value) => {
        if (this.entries.get(key) !== entry) return;
        const size = this.sizeOf(value);
        if (size > this.maxBytes) {
          this.entries.delete(key);
          return;
        }
        entry.size = size;
        this.bytes += size;
        this.evict();
      },
      () => {
        if (this.entries.get(key) === entry) this.entries.delete(key);
      },
    );
    this.evict();
    return promise;
  }

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.bytes -= entry.size;
    this.entries.delete(key);
  }

  private evict() {
    for (const key of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries && this.bytes <= this.maxBytes) break;
      this.remove(key);
    }
  }

  clear() {
    this.entries.clear();
    this.bytes = 0;
  }
}

/** Shared cache for git results keyed by repository path, commit sha and more. */
export const gitCache = new LruCache<unknown>(500, 256 * 1024 * 1024);

/** Sets the byte budget of the shared cache (CACHE_MAX_MB). */
export function configureCache(maxMegabytes: number) {
  gitCache.maxBytes = maxMegabytes * 1024 * 1024;
}

/** Caches `load` under a key made of `parts`; only use for immutable (sha-addressed) data. */
export function cached<T>(parts: readonly (string | number)[], load: () => Promise<T>): Promise<T> {
  return gitCache.get(JSON.stringify(parts), load) as Promise<T>;
}
