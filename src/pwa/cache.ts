/*
 * What the service worker keeps for offline use. Pure, so the build (which
 * writes the list) and the worker (which uses it) share one decision.
 */

const PREFIX = 'tracker-';

/** Files that belong only to the component sheet stay out of the app's offline copy. */
function belongsToApp(file: string): boolean {
  return !file.startsWith('components') && !file.startsWith('assets/components-') && !file.endsWith('.map');
}

/**
 * Everything the app needs offline, relative to the worker: the start page
 * as `./`, the built files and the static ones (fonts, icons, manifest).
 */
export function precacheList(builtFiles: readonly string[], staticFiles: readonly string[]): string[] {
  const files = [...builtFiles, ...staticFiles]
    .filter((file) => file !== 'sw.js' && file !== 'index.html' && belongsToApp(file))
    .sort();
  return ['./', ...new Set(files)];
}

/**
 * How the worker fetches the offline copy: past the browser's own cache.
 * GitHub Pages lets a browser keep a page for 10 minutes; a worker that took
 * the start page from there after a new deploy kept an old page whose files
 * were gone, and the app stayed on «щось пішло не так» for good (Pixel,
 * 2026-11-17). With `reload` the page and its files come from one deploy.
 */
export const PRECACHE_FETCH = { cache: 'reload' } as const;

export function cacheName(version: string): string {
  return `${PREFIX}${version}`;
}

/** Caches of older versions, to delete once the new version takes over. */
export function staleCaches(names: readonly string[], version: string): string[] {
  return names.filter((name) => name.startsWith(PREFIX) && name !== cacheName(version));
}

/** Only the app's own GET requests are answered from the cache. */
export function servesFromCache(request: { method: string; url: string }, scope: string): boolean {
  return request.method === 'GET' && request.url.startsWith(scope);
}

/** Writes the offline list and the version into the built worker; a placeholder left over fails the build. */
export function fillWorker(code: string, list: readonly string[], version: string): string {
  const filled = code
    .replaceAll('__PRECACHE__', JSON.stringify(list))
    .replaceAll('__VERSION__', JSON.stringify(version));
  if (/__[A-Z]+__/.test(filled)) throw new Error('sw.js still has a placeholder');
  return filled;
}
