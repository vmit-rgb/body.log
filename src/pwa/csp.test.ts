import { describe, expect, it } from 'vitest';
import index from '../../index.html?raw';
import components from '../../components.html?raw';
import { inlineScripts, policy, withCsp } from './csp';

const fakeHash = (text: string) => `hash-of-${text.length}`;
const directives = (csp: string) => new Map(csp.split('; ').map((part) => {
  const [name, ...values] = part.split(' ');
  return [name!, values] as const;
}));
const cspOf = (html: string) => /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1];

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

describe('content security policy', () => {
  it('lets the page talk only to its own address and run only its own scripts', () => {
    const csp = directives(policy(['abc']));
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('connect-src')).toEqual(["'self'"]);
    expect(csp.get('script-src')).toEqual(["'self'", "'sha256-abc'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('form-action')).toEqual(["'none'"]);
  });

  it('never allows inline or eval’d scripts wholesale', () => {
    const csp = policy(['abc']);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    expect(csp).not.toMatch(/\*|https?:/);
  });

  it('keeps what the app needs: inline styles, SVG backgrounds in the CSS, its fonts, worker and manifest', () => {
    const csp = directives(policy([]));
    expect(csp.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp.get('img-src')).toEqual(["'self'", 'data:']);
    expect(csp.get('font-src')).toEqual(["'self'"]);
    expect(csp.get('worker-src')).toEqual(["'self'"]);
    expect(csp.get('manifest-src')).toEqual(["'self'"]);
  });

  it('finds inline scripts but not the ones loaded from a file', () => {
    const html = '<script>a()</script><script type="module" src="/x.js"></script><script type="text/javascript">b()</script>';
    expect(inlineScripts(html)).toEqual(['a()', 'b()']);
  });

  it('hashes the loading guard (D-10) of the app page, the only inline script', async () => {
    const scripts = inlineScripts(index);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toContain('data-stuck');
    const hash = await sha256(scripts[0]!);
    const csp = cspOf(withCsp(index, () => hash));
    expect(directives(csp!).get('script-src')).toEqual(["'self'", `'sha256-${hash}'`]);
  });

  it('puts the policy before any script or style, right after the charset', () => {
    for (const page of [index, components]) {
      const html = withCsp(page, fakeHash);
      const at = html.indexOf('http-equiv="Content-Security-Policy"');
      expect(at).toBeGreaterThan(html.indexOf('<meta charset'));
      for (const tag of ['<script', '<style', '<link']) {
        const first = html.indexOf(tag);
        if (first >= 0) expect(at).toBeLessThan(first);
      }
    }
  });

  it('leaves the inline scripts untouched, so their hashes still match', () => {
    expect(inlineScripts(withCsp(index, fakeHash))).toEqual(inlineScripts(index));
  });

  it('refuses a page without a charset rather than ship it without a policy', () => {
    expect(() => withCsp('<html><head></head></html>', fakeHash)).toThrow(/charset/);
  });
});
