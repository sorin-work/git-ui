/** "1 branch", "3 branches". Pass the plural when adding "s" is not enough. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`;
}
