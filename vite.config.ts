import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin, Rollup } from 'vite';
import { defineConfig } from 'vitest/config';
import { fillWorker, precacheList } from './src/pwa/cache';
import { withCsp } from './src/pwa/csp';

const PUBLIC_DIR = 'public';

function filesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(PUBLIC_DIR, join(entry.parentPath, entry.name)).split(sep).join('/'));
}

function isChunk(file: Rollup.OutputAsset | Rollup.OutputChunk | undefined): file is Rollup.OutputChunk {
  return file?.type === 'chunk';
}

/**
 * A hash of every file the worker caches, so any change makes a new worker.
 * The start page counts too: built files carry their hash in the name, but
 * index.html doesn't, and a change only there (the CSP) must still arrive.
 */
function versionOf(list: readonly string[], staticFiles: readonly string[], page: string | Uint8Array): string {
  const hash = createHash('sha256').update(list.join('\n')).update(page);
  staticFiles.forEach((file) => hash.update(readFileSync(join(PUBLIC_DIR, file))));
  return hash.digest('hex').slice(0, 12);
}

/**
 * Writes the offline file list and the version into sw.js, so a new build
 * makes the app offer «є нова версія :)».
 */
function serviceWorkerManifest(): Plugin {
  return {
    name: 'service-worker-manifest',
    apply: 'build',
    // post: after Vite has written the final index.html (with the CSP) into the bundle
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const worker = bundle['sw.js'];
        if (!isChunk(worker)) throw new Error('sw.js is missing from the build');
        const page = bundle['index.html'];
        if (page?.type !== 'asset') throw new Error('index.html is missing from the build');
        const staticFiles = filesIn(PUBLIC_DIR);
        const list = precacheList(Object.keys(bundle), staticFiles);
        worker.code = fillWorker(worker.code, list, versionOf(list, staticFiles, page.source));
      },
    },
  };
}

/**
 * Puts the Content-Security-Policy into every built page (src/pwa/csp.ts),
 * hashing the inline scripts as they are in the final HTML. Build only:
 * the dev server injects its own client and talks to it over a socket.
 */
function contentSecurityPolicy(): Plugin {
  const sha256 = (text: string) => createHash('sha256').update(text).digest('base64');
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: { order: 'post', handler: (html) => withCsp(html, sha256) },
  };
}

// GitHub Pages serves the app from /<repo-name>/ (the repo is body.log since 2026-11-17).
export default defineConfig({
  base: '/body.log/',
  plugins: [serviceWorkerManifest(), contentSecurityPolicy()],
  build: {
    // older phones too: iOS 15.4+ (iPhone 6s and newer), Chrome 105+
    target: ['safari15.4', 'chrome105', 'firefox110'],
    sourcemap: false,
    rollupOptions: {
      // components.html: the living component sheet, to check the build on a phone
      input: {
        app: 'index.html',
        components: 'components.html',
        sw: 'src/pwa/sw.ts',
      },
      output: {
        // the worker keeps a fixed name next to the page, so its scope is the whole app
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    // the test phone speaks Ukrainian, so the app starts in Ukrainian (i18n/lang.ts reads the phone's language)
    setupFiles: ['src/i18n/test-phone.ts'],
    // these stylesheets are read as text by tests; other CSS stays out of the tests
    css: { include: [/\/styles\/[\w-]+\.css/] },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/components-page.ts', 'src/pwa/sw.ts'],
    },
  },
});
