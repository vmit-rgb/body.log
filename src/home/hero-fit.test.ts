import { describe, expect, it } from 'vitest';
import { heroStyle, type HeroStyle } from './hero-fit';

const heights = (byStyle: Record<HeroStyle, number>) => (style: HeroStyle) => byStyle[style];

describe('heroStyle', () => {
  it('keeps header 1 when the phrase fits in the empty space under the scene', () => {
    expect(heroStyle(heights({ 't-h1': 60, 't-h2': 50, 't-h3': 42, 't-h4': 38 }), 78)).toBe('t-h1');
  });
  it('steps down to the largest style that fits', () => {
    expect(heroStyle(heights({ 't-h1': 120, 't-h2': 101, 't-h3': 84, 't-h4': 75 }), 78)).toBe('t-h4');
    expect(heroStyle(heights({ 't-h1': 120, 't-h2': 101, 't-h3': 42, 't-h4': 38 }), 78)).toBe('t-h3');
  });
  it('falls back to header 4 when nothing fits', () => {
    expect(heroStyle(heights({ 't-h1': 240, 't-h2': 202, 't-h3': 168, 't-h4': 113 }), 78)).toBe('t-h4');
  });
});
