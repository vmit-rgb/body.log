import { describe, expect, it } from 'vitest';

/*
 * The app has to start on the oldest browsers it promises (vite.config.ts
 * build.target: Safari 15.4). The build can't rewrite regex syntax, so a
 * regex feature newer than that stops the whole app before it starts: a
 * lookbehind `(?<=…)` did that on iOS 16.3 (Safari has it only since 16.4;
 * the D-10 screen on Olesia's iPhone 12 mini, 2026-11-21).
 */
describe('the source only uses regex syntax old Safari can parse', () => {
  const code = import.meta.glob<string>(['./**/*.ts', '!./**/*.test.ts'], { query: '?raw', import: 'default', eager: true });

  it('reads the source files', () => {
    expect(Object.keys(code).length).toBeGreaterThan(50);
  });

  it('has no lookbehind', () => {
    const found = Object.entries(code)
      .filter(([, text]) => /\(\?<[=!]/.test(text))
      .map(([path]) => path);
    expect(found).toEqual([]);
  });
});
