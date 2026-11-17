import { describe, expect, it } from 'vitest';
import base from '../styles/base.css?raw';
import html from '../../index.html?raw';
import { PLANES, advance, flightMoves, makeRun, populate, readColours } from './flight';

/** The same «random» every run, so the tests don't flicker. */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('«Політ символів», the ASCII background', () => {
  it('fills a phone screen with runs on all three planes, more far ones than near', () => {
    const runs = populate(360, 780, seeded());
    const count = (p: number) => runs.filter((r) => r.p === p).length;
    expect(count(0)).toBe(Math.round((360 * 780 / 10000) * PLANES[0]!.dens));
    expect(count(0)).toBeGreaterThan(count(1));
    expect(count(1)).toBeGreaterThan(count(2));
    expect(count(2)).toBeGreaterThan(0);
  });

  it('keeps every run inside its plane: its length, its row on the screen, its speed', () => {
    for (const run of populate(412, 900, seeded(3))) {
      const plane = PLANES[run.p]!;
      expect(run.chars.length).toBeGreaterThanOrEqual(plane.len[0]);
      expect(run.chars.length).toBeLessThanOrEqual(plane.len[1]);
      expect(run.y).toBeLessThanOrEqual(900);
      expect(run.v).toBeGreaterThanOrEqual(plane.speed * 0.8);
      expect(run.v).toBeLessThanOrEqual(plane.speed * 1.25);
    }
  });

  it('flies left to right, and a run gone past the right edge waits off the left one', () => {
    const random = seeded(11);
    const runs = [makeRun(2, true, 360, 780, [], random)];
    const before = runs[0]!.x;
    advance(runs, 0.05, 360, 780, random);
    expect(runs[0]!.x).toBeGreaterThan(before);
    runs[0]!.x = 360 + runs[0]!.chars.length * runs[0]!.cw + 1;
    advance(runs, 0, 360, 780, random);
    expect(runs[0]!.x).toBeLessThan(0);
  });

  it('stands still with «reduce motion», «вимкнути всі анімації» or «вимкнути фонові анімації (ASCII)»', () => {
    const root = document.createElement('html');
    expect(flightMoves(root, false)).toBe(true);
    expect(flightMoves(root, true)).toBe(false);
    root.setAttribute('data-no-motion', '');
    expect(flightMoves(root, false)).toBe(false);
    root.removeAttribute('data-no-motion');
    root.setAttribute('data-no-background-motion', '');
    expect(flightMoves(root, false)).toBe(false);
  });

  it('takes its colours from the tokens: page, accent and its shades, muted text', () => {
    const root = document.createElement('div');
    root.style.setProperty('--bg', '#f6f5f7');
    root.style.setProperty('--accent-rgb', '6 128 102');
    root.style.setProperty('--accent-mid', '#499780');
    root.style.setProperty('--accent-quiet', '#c6e0d7');
    root.style.setProperty('--muted', '#556862');
    document.body.append(root);
    expect(readColours(root)).toEqual({ bg: '#f6f5f7', primary: 'rgb(6 128 102)', mid: '#499780', quiet: '#c6e0d7', muted: '#556862' });
    root.remove();
  });

  it('sits behind every screen, hidden from screen readers and from taps', () => {
    expect(html).toMatch(/<canvas class="flight" aria-hidden="true"><\/canvas>\s*<main id="app">/);
    const rule = /\.flight \{([^}]*)\}/.exec(base)?.[1] ?? '';
    expect(rule).toContain('position: fixed;');
    expect(rule).toContain('z-index: -1;');
    expect(rule).toContain('pointer-events: none;');
  });
});
