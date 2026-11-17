import { describe, expect, it } from 'vitest';
import { barFit, barHeight, pageEnd, wireBarFit } from './bar-fit';

describe('the bottom bar fits what it holds (C-01)', () => {
  it('stays one row while ≡, the gap and the date with its arrows fit', () => {
    expect(barFit({ inner: 328, menu: 75, gap: 8, nav: 245 })).toBe(0);
    expect(barFit({ inner: 328, menu: 75, gap: 8, nav: 245.4 })).toBe(0);
  });

  it('puts the date row under ≡ when it doesn’t fit beside it', () => {
    expect(barFit({ inner: 288, menu: 75, gap: 8, nav: 245 })).toBe(1);
    expect(barFit({ inner: 288, menu: 75, gap: 8, nav: 288 })).toBe(1);
  });

  it('puts the date on top and the arrows under it when even that row is too narrow', () => {
    expect(barFit({ inner: 288, menu: 75, gap: 8, nav: 340 })).toBe(2);
  });

  it('counts its height without the safe area, and the end of a page 3 px less, as 80 to 83', () => {
    expect(barHeight(91.2, 8)).toBe(84);
    expect(barHeight(139, 8)).toBe(131);
    expect(pageEnd(83)).toBe(80);
  });

  it('does nothing where there is no layout to measure', () => {
    const root = document.createElement('div');
    const stop = wireBarFit(root, document.createElement('div'));
    expect(root.style.getPropertyValue('--bar-h')).toBe('');
    stop();
  });
});
