/*
 * Content-Security-Policy for the built pages (FIXES-PLAN wave 12). GitHub
 * Pages can't send headers, so the policy goes into a <meta> tag the build
 * writes. Pure, so the build and the tests share one decision; the build
 * passes the hash function (node:crypto).
 *
 * What it guarantees: the page only talks to its own address (connect-src),
 * so even a bug can't send the diary anywhere, and only the app's own
 * scripts run (script-src). Inline styles stay allowed: the markup uses
 * style="…" and the loading screen a <style>; the risk there is small.
 * A meta tag can't set frame-ancestors; for a diary on a phone that's fine.
 */

/** base64 SHA-256 of a text, as CSP hashes want it. */
export type Sha256 = (text: string) => string;

/** The bodies of the inline classic scripts (no src), in page order. */
export function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]!);
}

/** The policy for a page whose inline scripts have these hashes. */
export function policy(scriptHashes: readonly string[]): string {
  const scripts = ["'self'", ...scriptHashes.map((hash) => `'sha256-${hash}'`)];
  return [
    "default-src 'self'",
    `script-src ${scripts.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    // data: — the noise and the hatch masks are SVG inside the CSS
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
}

/** The page with the policy as the first thing after <meta charset>, before any script or style. */
export function withCsp(html: string, sha256: Sha256): string {
  const charset = /<meta charset="[^"]*"\s*\/?>/i.exec(html);
  if (!charset) throw new Error('CSP: the page has no <meta charset> to put the policy after');
  const tag = `<meta http-equiv="Content-Security-Policy" content="${policy(inlineScripts(html).map(sha256))}" />`;
  const at = charset.index + charset[0].length;
  return `${html.slice(0, at)}\n    ${tag}${html.slice(at)}`;
}
