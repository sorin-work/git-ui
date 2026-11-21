import type { RepoLocation } from './repos.js';
import { git } from './run.js';

export interface Contributor {
  name: string;
  email: string;
  commits: number;
}

export interface WeekActivity {
  /** Monday of the week, YYYY-MM-DD (UTC). */
  start: string;
  commits: number;
}

const DAY = 24 * 60 * 60 * 1000;

/** Parses `git shortlog -sne` output: "   12\tName <email>". */
export function parseShortlog(output: string): Contributor[] {
  const contributors: Contributor[] = [];
  for (const line of output.split('\n')) {
    const match = /^\s*(\d+)\t(.*?)(?: <([^>]*)>)?$/.exec(line);
    if (!match) continue;
    contributors.push({ commits: Number(match[1]), name: match[2]!, email: match[3] ?? '' });
  }
  return contributors.sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name));
}

export async function contributors(repo: RepoLocation, commit: string): Promise<Contributor[]> {
  return parseShortlog(await git(repo, ['shortlog', '-sne', '--end-of-options', commit, '--']));
}

function mondayOf(time: number): number {
  const date = new Date(time);
  const day = (date.getUTCDay() + 6) % 7; // 0 = Monday
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day);
}

/**
 * Commits per week for the `weeks` weeks up to and including the week of
 * `until` (a Unix time in ms). Weeks start on Monday, in UTC.
 */
export function bucketByWeek(timestamps: number[], until: number, weeks = 52): WeekActivity[] {
  const lastWeek = mondayOf(until);
  const firstWeek = lastWeek - (weeks - 1) * 7 * DAY;
  const counts = new Array<number>(weeks).fill(0);
  for (const time of timestamps) {
    const index = Math.floor((mondayOf(time) - firstWeek) / (7 * DAY));
    if (index >= 0 && index < weeks) counts[index]! += 1;
  }
  return counts.map((commits, i) => ({
    start: new Date(firstWeek + i * 7 * DAY).toISOString().slice(0, 10),
    commits,
  }));
}

/** The largest number in a list of any length (spreading a long list into Math.max throws). */
export function newest(times: number[]): number {
  let max = -Infinity;
  for (const time of times) if (time > max) max = time;
  return max;
}

const WEEK_SECONDS = 7 * 24 * 60 * 60;

/**
 * Weekly commit counts for the year leading up to the newest commit, so a
 * repository that has been quiet for a while still shows its last active year.
 * Only that year is read: the tip's commit date stands in for the newest
 * one, and `--max-age` stops the walk there instead of going through the
 * whole history.
 */
export async function weeklyActivity(
  repo: RepoLocation,
  commit: string,
  weeks = 52,
): Promise<WeekActivity[]> {
  const tip = Number(
    (await git(repo, ['log', '-1', '--format=%ct', '--end-of-options', commit, '--'])).trim(),
  );
  if (!Number.isFinite(tip)) return bucketByWeek([], Date.now(), weeks);
  const out = await git(repo, [
    'log',
    '--format=%ct',
    // One week of slack for the bucket the year starts in.
    `--max-age=${tip - (weeks + 1) * WEEK_SECONDS}`,
    '--end-of-options',
    commit,
    '--',
  ]);
  const times = out
    .split('\n')
    .filter(Boolean)
    .map((t) => Number(t) * 1000);
  // A commit dated after the tip (a skewed clock) still moves the year.
  return bucketByWeek(times, Math.max(tip * 1000, newest(times)), weeks);
}
