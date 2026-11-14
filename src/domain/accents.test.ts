import { describe, expect, it } from 'vitest';
import { ACCENTS, DEFAULT_ACCENT, parseAccent } from './accents';

describe('accents', () => {
  it('offers eleven accents around the hue circle (Olesia, 2026-11-12)', () => {
    expect(ACCENTS).toEqual([
      'gray', 'orange', 'pink', 'magenta', 'purple', 'violet', 'blue', 'sky', 'cyan', 'mint', 'green',
    ]);
  });

  it('uses pink when nothing is chosen', () => {
    expect(DEFAULT_ACCENT).toBe('pink');
    expect(parseAccent(undefined)).toBe('pink');
  });

  it.each(['cyan', 'sky', 'green'])('keeps a current accent %s as it is', (accent) => {
    expect(parseAccent(accent)).toBe(accent);
  });

  // removed accents (red, lime…) are moved when old settings are converted: format/profile-upgrade.test.ts
  it.each([42, 'turquoise', 'red', 'lime', '', null, {}, 'toString'])('falls back to pink for %j', (value) => {
    expect(parseAccent(value)).toBe('pink');
  });
});
