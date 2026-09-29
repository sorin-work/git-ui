import type { RepoLocation } from './repos.js';
import { git } from './run.js';

interface LanguageInfo {
  name: string;
  color: string;
}

const LANGUAGES: Record<string, LanguageInfo> = {
  ts: { name: 'TypeScript', color: '#3178c6' },
  tsx: { name: 'TypeScript', color: '#3178c6' },
  mts: { name: 'TypeScript', color: '#3178c6' },
  js: { name: 'JavaScript', color: '#e9c400' },
  jsx: { name: 'JavaScript', color: '#e9c400' },
  mjs: { name: 'JavaScript', color: '#e9c400' },
  cjs: { name: 'JavaScript', color: '#e9c400' },
  vue: { name: 'Vue', color: '#41b883' },
  py: { name: 'Python', color: '#3572a5' },
  go: { name: 'Go', color: '#00add8' },
  rs: { name: 'Rust', color: '#c86f3a' },
  java: { name: 'Java', color: '#b07219' },
  kt: { name: 'Kotlin', color: '#a97bff' },
  rb: { name: 'Ruby', color: '#cc342d' },
  php: { name: 'PHP', color: '#4f5d95' },
  c: { name: 'C', color: '#555555' },
  h: { name: 'C', color: '#555555' },
  cpp: { name: 'C++', color: '#f34b7d' },
  cc: { name: 'C++', color: '#f34b7d' },
  hpp: { name: 'C++', color: '#f34b7d' },
  cs: { name: 'C#', color: '#178600' },
  swift: { name: 'Swift', color: '#f05138' },
  sh: { name: 'Shell', color: '#89e051' },
  bash: { name: 'Shell', color: '#89e051' },
  html: { name: 'HTML', color: '#e34c26' },
  css: { name: 'CSS', color: '#663399' },
  scss: { name: 'SCSS', color: '#c6538c' },
  sql: { name: 'SQL', color: '#e38c00' },
  md: { name: 'Markdown', color: '#6b7280' },
  dockerfile: { name: 'Dockerfile', color: '#384d54' },
};

/** Generated or third-party files that would otherwise dominate the numbers. */
const IGNORED = [
  /(^|\/)(node_modules|vendor|dist|build|coverage)\//,
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|go\.sum)$/,
  /\.min\.(js|css)$/,
];

export interface LanguageShare {
  name: string;
  color: string;
  bytes: number;
  /** Share of all counted bytes, one decimal. */
  percent: number;
}

export function languageOf(path: string): LanguageInfo | null {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  if (name === 'dockerfile') return LANGUAGES['dockerfile']!;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? (LANGUAGES[name.slice(dot + 1)] ?? null) : null;
}

/** Adds up file sizes per language. Languages under 1% are grouped as "Other". */
export function languageShares(files: { path: string; size: number }[]): LanguageShare[] {
  const totals = new Map<string, { color: string; bytes: number }>();
  for (const file of files) {
    if (IGNORED.some((pattern) => pattern.test(file.path))) continue;
    const language = languageOf(file.path);
    if (!language) continue;
    const entry = totals.get(language.name) ?? { color: language.color, bytes: 0 };
    entry.bytes += file.size;
    totals.set(language.name, entry);
  }

  const total = [...totals.values()].reduce((sum, t) => sum + t.bytes, 0);
  if (total === 0) return [];

  const shares = [...totals.entries()]
    .map(([name, { color, bytes }]) => ({ name, color, bytes, percent: (bytes / total) * 100 }))
    .sort((a, b) => b.bytes - a.bytes);
  const main = shares.filter((s) => s.percent >= 1);
  const rest = shares.filter((s) => s.percent < 1);
  if (rest.length) {
    const bytes = rest.reduce((sum, s) => sum + s.bytes, 0);
    main.push({ name: 'Other', color: '#9ca3af', bytes, percent: (bytes / total) * 100 });
  }
  return main.map((s) => ({ ...s, percent: Math.round(s.percent * 10) / 10 }));
}

export async function repositoryLanguages(
  repo: RepoLocation,
  commit: string,
): Promise<LanguageShare[]> {
  const out = await git(repo.path, ['ls-tree', '-r', '-z', '--long', commit]);
  const files = out
    .split('\0')
    .map((record) => /^\d+ blob [0-9a-f]+ +(\d+)\t(.*)$/s.exec(record))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ size: Number(m[1]), path: m[2]! }));
  return languageShares(files);
}
