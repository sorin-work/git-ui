export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = 'error') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export type Query = Record<string, string | number | null | undefined>;

/** `?a=1&b=2` without empty values, or '' when nothing is set. */
export function toQuery(params: Query = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export async function get<T>(path: string, query?: Query): Promise<T> {
  const res = await fetch(`/api${path}${toQuery(query)}`, {
    headers: { Accept: 'application/json' },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.message ?? `Request failed (${res.status})`,
      data?.error?.code,
    );
  }
  return data as T;
}

/** Repository names are plain directory names but encode them anyway. */
export const repoPath = (repo: string) => `/repos/${encodeURIComponent(repo)}`;
