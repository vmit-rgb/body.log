/*
 * The month's ASCII scene in the hero (Olesia, 2026-11-17: «задній фон
 * постійно один, в залежності від місяця змінюється тільки шапка»). One
 * scene per month; a month without one keeps the hero empty over «Політ
 * символів». The scene is picked by today's month, not by the day shown.
 *
 * Home is drawn anew on every change, so the scene lives here, outside the
 * screen: a new canvas takes over the running scene and its leaves don't
 * start again. Moves only while the hero is on screen and the app is shown;
 * one still frame with the phone's «reduce motion», «вимкнути всі анімації»
 * or «вимкнути фонові анімації (ASCII)». Decor: hidden from screen readers.
 */

import type { DayKey } from '../domain/dates';
import { flightMoves } from './flight';
import { november } from './november';

export interface HeroScene {
  resize(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  render(ctx: CanvasRenderingContext2D, t: number, dt: number): void;
  /** leaves in the air, for the tests */
  leaves(): number;
}

/** Scenes by month number (1–12). */
const SCENES: Readonly<Record<number, (family: string) => HeroScene>> = {
  11: november,
};

/** Whether the month of `today` has a scene. */
export function hasScene(today: DayKey): boolean {
  return monthOf(today) in SCENES;
}

const monthOf = (day: DayKey) => Number(day.slice(5, 7));

/** At most 30 frames a second: the scene is calm, the battery is not. */
const FRAME = 1 / 30;

let running: { month: number; scene: HeroScene; w: number; h: number; t: number } | null = null;

export interface SceneHost {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly today: DayKey;
  readonly reducedMotion: { matches: boolean; addEventListener(type: 'change', listener: () => void, options?: { signal: AbortSignal }): void };
}

/** Starts today's scene on `canvas`; returns what stops it. */
export function mountHeroScene({ root, canvas, today, reducedMotion }: SceneHost): () => void {
  const make = SCENES[monthOf(today)];
  const ctx = make ? canvas.getContext('2d', { alpha: false }) : null;
  if (!make || !ctx) return () => {};
  const family = getComputedStyle(root).getPropertyValue('--font').trim() || 'monospace';
  const month = monthOf(today);
  if (running?.month !== month) running = { month, scene: make(family), w: 0, h: 0, t: 0 };
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (scene.w !== width || scene.h !== height) {
      scene.w = width;
      scene.h = height;
      scene.scene.resize(ctx, width, height);
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
