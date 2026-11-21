/* global document */
// Apply the saved theme before the first paint. A file rather than an inline
// script, so the Content-Security-Policy can forbid inline scripts.
try {
  const theme = localStorage.getItem('git-ui:theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // Storage can be blocked; the default theme is fine then.
}
