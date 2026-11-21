/** Thrown when a slot did not free up in time. */
export class BusyError extends Error {
  constructor(message = 'The server is busy') {
    super(message);
    this.name = 'BusyError';
  }
}

interface Waiter {
  grant: () => void;
  timer: NodeJS.Timeout;
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

/**
 * Limits how many things run at once. `acquire` waits (first come, first
 * served) for a free slot and resolves with a function that gives it back;
 * calling that function more than once is harmless.
 */
export class Semaphore {
  private running = 0;
  private readonly waiting: Waiter[] = [];

  constructor(
    public limit: number,
    public waitMs: number,
  ) {}

  /** Slots in use and callers waiting, for tests and metrics. */
  get stats() {
    return { running: this.running, waiting: this.waiting.length };
  }

  /** With a `signal`, a caller that gives up leaves the queue at once. */
  acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(abortError(signal));
    if (this.running < this.limit) {
      this.running += 1;
      return Promise.resolve(this.releaser());
    }
    return new Promise((resolve, reject) => {
      const leave = (error: Error) => {
        clearTimeout(waiter.timer);
        signal?.removeEventListener('abort', onAbort);
        const index = this.waiting.indexOf(waiter);
        if (index !== -1) this.waiting.splice(index, 1);
        reject(error);
      };
      const onAbort = () => leave(abortError(signal!));
      const waiter: Waiter = {
        grant: () => {
          clearTimeout(waiter.timer);
          signal?.removeEventListener('abort', onAbort);
          this.running += 1;
          resolve(this.releaser());
        },
        timer: setTimeout(() => leave(new BusyError()), this.waitMs),
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiting.push(waiter);
    });
  }

  /** Runs `task` in a slot and gives the slot back however it ends. */
  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire(signal);
    try {
      return await task();
    } finally {
      release();
    }
  }

  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.running -= 1;
      if (this.running < this.limit) this.waiting.shift()?.grant();
    };
  }
}
