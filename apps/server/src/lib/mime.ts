/**
 * Content types for raw files. Files come from repositories and are served
 * from the app's own origin, so anything a browser would execute (HTML,
 * JavaScript, XML) is sent as plain text. Images are the only content shown
 * as what they are; SVG is allowed because responses also carry a sandboxing
 * CSP (see RAW_FILE_HEADERS) that stops scripts inside it.
 */
const INLINE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
};

export function contentTypeFor(fileName: string, binary: boolean): string {
  const dot = fileName.lastIndexOf('.');
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  return INLINE_TYPES[ext] ?? (binary ? 'application/octet-stream' : 'text/plain; charset=utf-8');
}

/** Sent with every raw file: no sniffing, and no scripts even if the browser renders it. */
export const RAW_FILE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy':
    "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
} as const;
