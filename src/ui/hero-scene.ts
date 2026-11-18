/*
 * The month's ASCII scene in the header of home (Olesia, 2026-11-17: «задній
 * фон постійно один, в залежності від місяця змінюється тільки шапка»;
 * 2026-11-18: a scene for every month, header-animations/ in the workspace).
 * The scene is picked by today's month, not by the day shown.
 *
 * Home is drawn anew on every change, so the scene lives here, outside the
 * screen: a new canvas takes over the running scene and its leaves don't
 * start again. Moves only while the header is on screen and the app is shown,
 * at most 30 frames a second; one still frame with the phone's «reduce
 * motion», «вимкнути всі анімації» or «вимкнути фонові анімації (ASCII)».
 * Decor: hidden from screen readers.
 */

import type { DayKey } from '../domain/dates';
import { flightMoves } from './flight';
import { heroScene, type HeroScene, type SceneMaker } from './hero/engine';
import { scene as sichen } from './hero/scenes/01-sichen.js';
import { scene as lyutyi } from './hero/scenes/02-lyutyi.js';
import { scene as berezen } from './hero/scenes/03-berezen.js';
import { scene as kviten } from './hero/scenes/04-kviten.js';
import { scene as traven } from './hero/scenes/05-traven.js';
import { scene as cherven } from './hero/scenes/06-cherven.js';
import { scene as lypen } from './hero/scenes/07-lypen.js';
import { scene as serpen } from './hero/scenes/08-serpen.js';
import { scene as veresen } from './hero/scenes/09-veresen.js';
import { scene as zhovten } from './hero/scenes/10-zhovten.js';
import { scene as lystopad } from './hero/scenes/11-lystopad.js';
import { scene as hruden } from './hero/scenes/12-hruden.js';

interface Month {
  readonly make: SceneMaker;
  /** 40 when the scene fills the top band too (branches, icicles, the rainbow) */
  readonly band: number;
}

/** Scenes by month number (1–12). */
export const SCENES: Readonly<Record<number, Month>> = {
  1: { make: sichen, band: 40 },
  2: { make: lyutyi, band: 40 },
  3: { make: berezen, band: 40 },
  4: { make: kviten, band: 0 },
  5: { make: traven, band: 0 },
  6: { make: cherven, band: 40 },
  7: { make: lypen, band: 0 },
  8: { make: serpen, band: 0 },
  9: { make: veresen, band: 0 },
  10: { make: zhovten, band: 0 },
  11: { make: lystopad, band: 0 },
  12: { make: hruden, band: 0 },
};

const monthOf = (day: DayKey) => Number(day.slice(5, 7));

/** The scene of the month of `today`, drawn in `family` on `bg`. */
export function sceneFor(today: DayKey, family: string, bg: string): HeroScene {
  const month = SCENES[monthOf(today)] ?? SCENES[1]!;
  return heroScene(month.make, month.band, family, bg);
}

/** At most 30 frames a second: the scene is calm, the battery is not. */
const FRAME = 1 / 30;

let running: { month: number; scene: HeroScene; w: number; h: number; dpr: number; t: number } | null = null;

export interface SceneHost {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly today: DayKey;
  readonly reducedMotion: { matches: boolean; addEventListener(type: 'change', listener: () => void, options?: { signal: AbortSignal }): void };
}

/** Starts today's scene on `canvas`; returns what stops it. */
export function mountHeroScene({ root, canvas, today, reducedMotion }: SceneHost): () => void {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return () => {};
  const style = getComputedStyle(root);
  const family = style.getPropertyValue('--font').trim() || 'monospace';
  // the dark theme's page colour, in both themes (Olesia, 2026-11-18)
  const bg = style.getPropertyValue('--scene-bg').trim() || '#161616';
  const month = monthOf(today);
  if (running?.month !== month) running = { month, scene: sceneFor(today, family, bg), w: 0, h: 0, dpr: 0, t: 0 };
  const scene = running;
  const stop = new AbortController();
  let frame = 0;
  let last = 0;
  let onScreen = true;

  const fit = () => {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (scene.w !== width || scene.h !== height || scene.dpr !== dpr) {
      scene.w = width;
      scene.h = height;
      scene.dpr = dpr;
      scene.scene.resize(ctx, width, height, dpr);
    }
  };
  const moves = () => onScreen && flightMoves(root, reducedMotion.matches) && document.visibilityState !== 'hidden';
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    if (dt >= FRAME - 0.002) {
      last = now;
      scene.t += dt;
      scene.scene.render(ctx, scene.t, dt);
    }
    frame = requestAnimationFrame(tick);
  };
  const run = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!scene.w) return;
    scene.scene.render(ctx, scene.t, 0);
    if (moves()) {
      frame = requestAnimationFrame((now) => {
        last = now;
        frame = requestAnimationFrame(tick);
      });
    }
  };
  const refit = () => {
    fit();
    run();
  };

  const watch = new MutationObserver(run);
  watch.observe(root, { attributes: true, attributeFilter: ['data-no-motion', 'data-no-background-motion'] });
  reducedMotion.addEventListener('change', run, { signal: stop.signal });
  document.addEventListener('visibilitychange', run, { signal: stop.signal });
  addEventListener('resize', refit, { signal: stop.signal });
  const seen = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      run();
    })
    : null;
  seen?.observe(canvas);

  // a running scene goes on at once on the new canvas; a new one waits for the font
  const fonts = document.fonts;
  if (scene.w) refit();
  else if (fonts) void fonts.load(`9px ${family}`).catch(() => undefined).finally(() => !stop.signal.aborted && refit());
  else refit();

  return () => {
    stop.abort();
    watch.disconnect();
    seen?.disconnect();
    cancelAnimationFrame(frame);
  };
}
