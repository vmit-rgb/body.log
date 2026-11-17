import { describe, expect, it } from 'vitest';
import css from '../styles/home.css?raw';
import type { DayKey } from '../domain/dates';
import { hasScene } from './hero-scene';
import { november } from './november';

/** A canvas context that only counts what is drawn. */
function fakeCtx() {
  const drawn: { text: string; x: number; y: number }[] = [];
  const ctx = {
    font: '', textBaseline: '', fillStyle: '',
    measureText: () => ({ width: 5.4 }),
    fillRect: () => {}, save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
    fillText: (text: string, x: number, y: number) => drawn.push({ text, x, y }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, drawn };
}

describe('the month\'s scene in the hero', () => {
  it('November has one; the other months keep the hero empty for now', () => {
    expect(hasScene('2026-11-17' as DayKey)).toBe(true);
    expect(hasScene('2026-11-01' as DayKey)).toBe(true);
    expect(hasScene('2026-10-31' as DayKey)).toBe(false);
    expect(hasScene('2026-12-01' as DayKey)).toBe(false);
  });

  it('draws the November scene inside the hero and keeps the leaves in check', () => {
    const scene = november('monospace');
    const { ctx, drawn } = fakeCtx();
    scene.resize(ctx, 360, 299);
    for (let i = 0; i < 30 * 40; i++) scene.render(ctx, i / 30, 1 / 30);
    // 40 s with gusts: new leaves come, old ones leave; never a pile-up
    expect(scene.leaves()).toBeGreaterThan(0);
    expect(scene.leaves()).toBeLessThanOrEqual(80);
    drawn.length = 0;
    scene.render(ctx, 40, 0);
    expect(drawn.length).toBeGreaterThan(300);
    expect(drawn.some((d) => d.text === '@')).toBe(true); // the lamp
  });

  it('is the same scene after every resize (seeded)', () => {
    const a = fakeCtx();
    const b = fakeCtx();
    const one = november('monospace');
    const two = november('monospace');
    one.resize(a.ctx, 412, 299);
    two.resize(b.ctx, 412, 299);
    one.render(a.ctx, 0, 0);
    two.render(b.ctx, 0, 0);
    expect(a.drawn).toEqual(b.drawn);
  });

  it('never lets the hero scene and «Політ символів» overlap: a cover in the page colour over the background', () => {
    expect(css).toMatch(/\.home__cover\s*\{[^}]*z-index: -1;[^}]*linear-gradient\(to bottom, var\(--bg\) calc\(100% - 80px\), transparent\)/);
    expect(css).toMatch(/\.home__cover\s*\{[^}]*height: calc\(var\(--hero-h\) \+ 16px \+ 80px\)/);
    expect(css).toMatch(/\.hero__scene::before\s*\{[^}]*rgb\(0 0 0 \/ 50%\)/);
  });
});
