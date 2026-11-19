import { describe, expect, it } from 'vitest';
import css from '../styles/home.css?raw';
import tokens from '../styles/tokens.css?raw';
import type { DayKey } from '../domain/dates';
import { SCENES, sceneFor } from './hero-scene';

/** A canvas context that only records what is drawn and where it is clipped. */
function fakeCtx() {
  const drawn: { text: string; x: number; y: number }[] = [];
  const fills: string[] = [];
  let clips = 0;
  const ctx = {
    font: '', textBaseline: '', fillStyle: '',
    measureText: () => ({ width: 5.4 }),
    setTransform: () => {}, save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
    beginPath: () => {}, rect: () => {}, clip: () => { clips++; },
    fillRect(this: { fillStyle: string }) { fills.push(this.fillStyle); },
    fillText: (text: string, x: number, y: number) => drawn.push({ text, x, y }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, drawn, fills, clips: () => clips };
}

const day = (month: number) => `2026-${String(month).padStart(2, '0')}-15` as DayKey;
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** `seconds` of a scene at 30 fps on a `w` px wide header, then one more frame. */
function play(month: number, w: number, seconds = 8) {
  const scale = Math.max(1, w / 430);
  const scene = sceneFor(day(month), 'monospace', '#161616');
  const { ctx, drawn, fills, clips } = fakeCtx();
  scene.resize(ctx, w, 310 * scale, 2);
  for (let i = 0; i < seconds * 30; i++) scene.render(ctx, i / 30, 1 / 30);
  drawn.length = 0;
  fills.length = 0;
  scene.render(ctx, seconds, 0);
  return { drawn, fills, clips };
}

describe('the month\'s scene in the header', () => {
  it('every month has its own scene', () => {
    expect(Object.keys(SCENES).map(Number)).toEqual(MONTHS);
    expect(new Set(MONTHS.map((m) => SCENES[m]!.make)).size).toBe(12);
  });

  it.each(MONTHS)('month %i draws a full scene of characters on the plate and keeps drawing', (month) => {
    const { drawn, fills } = play(month, 360);
    expect(drawn.length).toBeGreaterThan(300);
    expect(fills[0]).toBe('#161616');
    // the scene stays inside the header: 360 px wide, the band (-40) to the bottom of the scene
    // (snow and leaves just off the edge are drawn too and cut by the canvas, as in the previews)
    const inside = drawn.filter((d) => d.x > -20 && d.x < 380 && d.y > -60 && d.y < 290);
    expect(inside.length / drawn.length).toBeGreaterThan(0.9);
  });

  it('January, February, March and June draw into the top band; the others are clipped under it', () => {
    const band = MONTHS.filter((m) => SCENES[m]!.band === 40);
    expect(band).toEqual([1, 2, 3, 6]);
    expect(play(4, 360, 1).clips()).toBeGreaterThan(0);
    expect(play(1, 360, 1).clips()).toBe(0);
  });

  it('is the same scene every time (seeded)', () => {
    expect(play(11, 412, 2).drawn).toEqual(play(11, 412, 2).drawn);
    expect(play(3, 412, 2).drawn).toEqual(play(3, 412, 2).drawn);
  });

  it('wider than 430 px it draws the 430 px picture, scaled', () => {
    const narrow = play(9, 430, 0);
    const wide = play(9, 560, 0);
    const round = (all: typeof wide.drawn) => all.map((d) => `${d.text} ${d.x.toFixed(6)} ${d.y.toFixed(6)}`);
    expect(round(wide.drawn)).toEqual(round(narrow.drawn));
  });
});

describe('the header block', () => {
  it('is 400 px: the scene in the top 310, 90 px for the phrase; it scales above 430 px', () => {
    expect(css).toMatch(/\.home \{[^}]*--hero-h: 400px;/);
    expect(css).toMatch(/--hero-h: max\(400px, 100cqw \* 400 \/ 430\)/);
    expect(css).toMatch(/\.hero__scene \{[^}]*height: calc\(var\(--hero-h\) \* 310 \/ 400\)/);
    expect(css).toMatch(/\.hero__words \{[^}]*height: calc\(var\(--hero-h\) \* 90 \/ 400\)/);
  });

  it('sits on the dark page colour in both themes, fades out below, and nothing veils the scene', () => {
    expect(tokens).toMatch(/:root \{[^}]*--scene-bg: #161616;/);
    expect(tokens.match(/--scene-bg:/g)).toHaveLength(1);
    expect(css).toMatch(/\.hero \{[^}]*background: var\(--scene-bg\)/);
    expect(css).toMatch(/\.home__fade \{[^}]*z-index: -1;[^}]*linear-gradient\(\s*to bottom/);
    expect(css).not.toMatch(/hero__scene::(before|after)|mask-image/);
  });

  describe('the fade below it (wave 11, item 5)', () => {
    const fade = css.slice(css.indexOf('.home__fade {'), css.indexOf('}', css.indexOf('.home__fade {')));
    const stops = [...fade.matchAll(/rgb\(var\(--scene-rgb\) \/ ([\d.]+)%\) (\d+)%/g)].map(([, alpha, at]) => [Number(alpha), Number(at)]);

    it('is the header colour, 112 px long', () => {
      const [r, g, b] = tokens.match(/--scene-rgb: (\d+) (\d+) (\d+);/)!.slice(1).map(Number);
      expect(`#${[r, g, b].map((c) => c!.toString(16).padStart(2, '0')).join('')}`).toBe('#161616');
      expect(css).toMatch(/\.home \{[^}]*--hero-fade: 112px;/);
      expect(fade).toMatch(/height: var\(--hero-fade\);/);
    });

    it('follows an S-curve every 10 %, so neither end shows as a line', () => {
      expect(stops.map(([, at]) => at)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
      for (const [alpha, at] of stops) {
        const t = at! / 100;
        expect(alpha! / 100).toBeCloseTo(1 - (3 * t ** 2 - 2 * t ** 3), 3);
      }
    });

    it('has room of its own in the light theme only', () => {
      expect(css).toMatch(/:root\[data-theme='light'\] \.hero \{\s*margin-bottom: calc\(var\(--hero-fade\) - 40px\);/);
      expect(css).not.toMatch(/(^|\n)\.hero \{[^}]*margin-bottom/);
    });
  });

  it('the phrase is white with a dark shadow in both themes', () => {
    expect(css).toMatch(/\.hero__text \{[^}]*color: #e9e9e9;[^}]*text-shadow: 0 0 2px #000/);
    expect(css).not.toMatch(/data-theme='light'\][^{]*hero__text/);
  });
});
