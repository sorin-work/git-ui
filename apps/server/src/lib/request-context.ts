import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request state that git calls deep inside src/git/ can see without
 * every function taking it as an argument. `signal` aborts when the client
 * goes away or when the request failed, so queued and running git calls
 * for that request stop instead of finishing for nobody.
 */
export interface RequestContext {
  signal: AbortSignal;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
