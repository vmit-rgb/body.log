import { describe, expect, it } from 'vitest';
import { ACCENTS, DEFAULT_ACCENT, parseAccent, randomAccent } from './accents';

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

  it('picks any of the eleven at random, each with the same share', () => {
    expect(randomAccent(() => 0)).toBe('gray');
    expect(randomAccent(() => 0.5)).toBe('violet');
    expect(randomAccent(() => 0.999999)).toBe('green');
    // Math.random never gives 1, but nothing outside the list even then
    expect(randomAccent(() => 1)).toBe('green');
    const seen = new Set(ACCENTS.map((_, i) => randomAccent(() => (i + 0.5) / ACCENTS.length)));
    expect(seen.size).toBe(ACCENTS.length);
  });

  // removed accents (red, lime…) are moved when old settings are converted: format/profile-upgrade.test.ts
  it.each([42, 'turquoise', 'red', 'lime', '', null, {}, 'toString'])('falls back to pink for %j', (value) => {
    expect(parseAccent(value)).toBe('pink');
  });
});
