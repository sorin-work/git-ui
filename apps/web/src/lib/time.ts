const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

/**
 * "3 days ago", "last month"… Commit dates come from the committer's clock,
 * which can be a little ahead of ours, so anything from the last 45 seconds
 * or the near future reads "just now", and dates further ahead are shown as
 * a plain date rather than "in 3 days".
 */
export function relativeTime(date: string, now: Date = new Date(), locale?: string): string {
  const seconds = Math.round((new Date(date).getTime() - now.getTime()) / 1000);
  if (seconds > -45 && seconds < 5 * 60) return 'just now';
  if (seconds >= 5 * 60) return formatDate(date, locale);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === 'second') {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return '';
}

/** "Dec 19, 2025, 7:30 PM" in the viewer's locale and timezone. */
export function formatDateTime(date: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(date),
  );
}

export function formatDate(date: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(date));
}
