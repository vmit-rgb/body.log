import { describe, expect, it } from 'vitest';
import { heroStyle, type HeroStyle } from './hero-fit';

const heights = (byStyle: Partial<Record<HeroStyle, number>>) => (style: HeroStyle) => byStyle[style] ?? 999;

describe('heroStyle', () => {
  it('keeps header 1 when the phrase fits in the empty space under the scene', () => {
    expect(heroStyle(heights({ 't-h1': 60 }), 78)).toBe('t-h1');
  });
  it('steps down to the largest style that fits, past header 4 if it has to', () => {
    expect(heroStyle(heights({ 't-h3': 42 }), 78)).toBe('t-h3');
    expect(heroStyle(heights({ 't-h4': 113, 't-h5': 94, 't-h6': 78 }), 78)).toBe('t-h6');
    expect(heroStyle(heights({ 't-h6': 104, 't-1st-bold': 66 }), 78)).toBe('t-1st-bold');
  });
  it('never goes below 17 px (first-order body text): then it goes over the scene', () => {
    expect(heroStyle(heights({}), 78)).toBe('t-1st-bold');
  });
});
