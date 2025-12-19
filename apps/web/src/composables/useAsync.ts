import { ref, shallowRef, watch, type Ref, type WatchSource } from 'vue';

export interface AsyncState<T> {
  data: Ref<T | undefined>;
  error: Ref<Error | null>;
  loading: Ref<boolean>;
  reload: () => Promise<void>;
}

/**
 * Runs `load` now and again whenever `source` changes. Responses that arrive
 * after a newer request was started are ignored, so fast navigation never
 * shows stale data.
 */
export function useAsync<T>(load: () => Promise<T>, source?: WatchSource | WatchSource[]) {
  const data = shallowRef<T>();
  const error = ref<Error | null>(null);
  const loading = ref(false);
  let latest = 0;

  async function run() {
    const id = ++latest;
    loading.value = true;
    error.value = null;
    try {
      const result = await load();
      if (id === latest) data.value = result;
    } catch (err) {
      if (id === latest) {
        error.value = err instanceof Error ? err : new Error(String(err));
        data.value = undefined;
      }
    } finally {
      if (id === latest) loading.value = false;
    }
  }

  if (source) watch(source, run, { immediate: true });
  else void run();

  return { data, error, loading, reload: run } as AsyncState<T>;
}
