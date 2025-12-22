import { inject, type ComputedRef, type InjectionKey, type Ref } from 'vue';
import type { Repo } from '../api';

export interface RepoContext {
  name: ComputedRef<string>;
  info: Ref<Repo | undefined>;
  /** Branch, tag or sha currently being browsed. */
  currentRef: ComputedRef<string>;
}

export const REPO_KEY: InjectionKey<RepoContext> = Symbol('repo');

/** The repository the current page belongs to (provided by RepoLayout). */
export function useRepo(): RepoContext {
  const context = inject(REPO_KEY);
  if (!context) throw new Error('useRepo() must be used inside RepoLayout');
  return context;
}
