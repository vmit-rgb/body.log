/*
 * «Політ символів», the ASCII background of the tracker (Олеся + Нитка / AI).
 * The small version for the app (background-animations/flight-small-app.html
 * in the workspace, 2026-11-18, preview controls left out); the big one stays
 * on the landing. Glyphs fly left → right on three planes of one size, 9 px
 * like the header scenes: far = slow, the accent's quiet shade; mid = its mid
 * shade; near = faster, muted text. Depth comes from colour, brightness and
 * speed. About one run in five is lit in the accent, its tail fading to mid
 * and quiet. The colours are read from tokens.css, so the theme, the accent
 * and the accent flicker reach the background by themselves.
 *
 * Where (Olesia, 2026-11-18): behind the tracker screens, history and
 * settings; the menu has no background (data-no-flight on the root).
 *
 * Stands still (one frame) with the phone's «reduce motion», «вимкнути всі
 * анімації» or «вимкнути фонові анімації (ASCII)»; pauses while the app is
 * hidden. Decor only: the canvas is hidden from screen readers.
 */

/** Glyphs picked by shape: horizontal and light ones read as motion and fill tails. */
const TAIL = ['-', '-', '·', '.', '_', '~', '=', ':', '‐'];
const BODY = ['-', '=', '~', '+', '*', ':', '/', '\\', '<', '>', '0', '1', 'x', 'o', '·', '"', "'", '^'];
/** The denser ones are kept for heads on the nearer planes. */
const HEAD = ['>', '»', '*', '+', '#', '%', '@', '&', '0', 'o', 'x', '=', '≡', '›'];

type Tone = 'quiet' | 'mid' | 'muted';

export interface Plane {
  /** font size, px */
  readonly size: number;
  /** px per second */
  readonly speed: number;
  /** runs per 10 000 px² of screen */
  readonly dens: number;
  /** shortest and longest run, glyphs */
  readonly len: readonly [number, number];
  readonly tone: Tone;
  readonly litChance: number;
  /** a run's brightness, lowest and highest */
  readonly alpha: readonly [number, number];
}

export const PLANES: readonly Plane[] = [
  { size: 9, speed: 14, dens: 3.2, len: [2, 6], tone: 'quiet', litChance: 0.1, alpha: [0.5, 0.9] },
  { size: 9, speed: 30, dens: 1.6, len: [3, 9], tone: 'mid', litChance: 0.18, alpha: [0.55, 0.95] },
  { size: 9, speed: 58, dens: 0.6, len: [4, 13], tone: 'muted', litChance: 0.24, alpha: [0.7, 1] },
];

/** One row: 9 px × 1.05, as the header scenes. */
const LH = 9 * 1.05;

export interface Run {
  readonly p: number;
  /** index 0 is the head (rightmost, flies first); the rest trail to the left */
  readonly chars: readonly string[];
  readonly lit: boolean;
  /** one glyph's width, px */
  readonly cw: number;
  readonly row: number;
  readonly size: number;
  readonly y: number;
  x: number;
  readonly v: number;
  readonly alpha: number;
}

export interface Colours {
  readonly bg: string;
  readonly primary: string;
  readonly mid: string;
  readonly quiet: string;
  readonly muted: string;
}

type Random = () => number;

/** Noto Sans Mono's advance is about 0.6 em. */
const ADVANCE = 0.6;

/** A new run on plane `p`: anywhere on the screen (`anywhere`), or waiting off its left edge. */
export function makeRun(p: number, anywhere: boolean, w: number, h: number, others: readonly Run[], random: Random = Math.random): Run {
  const plane = PLANES[p]!;
  const rand = (a: number, b: number) => a + random() * (b - a);
  const pick = (from: readonly string[]) => from[Math.floor(random() * from.length)]!;
  const cw = plane.size * ADVANCE;
  const lh = LH;
  const rows = Math.max(1, Math.floor(h / lh));
  const n = Math.max(1, Math.round(rand(plane.len[0], plane.len[1] + 1) - 0.5));
  const lit = random() < plane.litChance;
  const chars: string[] = [];
  for (let i = 0; i < n; i++) chars.push(i === 0 ? pick(p === 0 ? BODY : HEAD) : i > n * 0.35 ? pick(TAIL) : pick(BODY));
  const width = n * cw;
  // one speed per row, so runs on a row never overtake each other and pile up
  let row = 0;
  let x = 0;
  for (let tries = 0; tries < 12; tries++) {
    row = Math.floor(random() * rows);
    x = anywhere ? rand(-width, w + width) : rand(-w * 0.35, 0) - width;
    const free = others.every((o) => o.p !== p || o.row !== row
      || x + cw * 2 < o.x - o.chars.length * o.cw || x - width > o.x + cw * 2);
    if (free) break;
  }
  const rowHash = (((Math.sin(row * 12.9898 + p * 78.233) * 43758.5453) % 1) + 1) % 1;
  return { p, chars, lit, cw, row, size: plane.size, y: (row + 0.85) * lh, x, v: plane.speed * (0.8 + 0.45 * rowHash), alpha: rand(plane.alpha[0], plane.alpha[1]) };
}

/** Fills a screen of `w` × `h` px with runs on every plane. */
export function populate(w: number, h: number, random: Random = Math.random): Run[] {
  const runs: Run[] = [];
  PLANES.forEach((plane, p) => {
    const count = Math.round(((w * h) / 10000) * plane.dens);
    for (let i = 0; i < count; i++) runs.push(makeRun(p, true, w, h, runs, random));
  });
  return runs;
}

/** Moves every run by `dt` seconds; a run gone past the right edge comes back from the left. */
export function advance(runs: Run[], dt: number, w: number, h: number, random: Random = Math.random): void {
  for (let k = 0; k < runs.length; k++) {
    const run = runs[k]!;
    run.x += run.v * dt;
    if (run.x - run.chars.length * run.cw > w) runs[k] = makeRun(run.p, false, w, h, runs, random);
  }
}

/** The tracker's tokens as colours a canvas takes. */
export function readColours(root: Element): Colours {
  const style = getComputedStyle(root);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    bg: token('--bg', '#161616'),
    primary: `rgb(${token('--accent-rgb', '245 115 187')})`,
    mid: token('--accent-mid', '#bb7e9d'),
    quiet: token('--accent-quiet', '#5b4851'),
    muted: token('--muted', '#c4b1ba'),
  };
}

/** Whether the background may move: the phone and both «вимкнути … анімації» say yes. */
export function flightMoves(root: Element, reducedMotion: boolean): boolean {
  return !reducedMotion && !root.hasAttribute('data-no-motion') && !root.hasAttribute('data-no-background-motion');
}

/** A screen without the background (the menu, Olesia 2026-11-18): hidden and still while it is shown. */
export function hideFlight(hidden: boolean, root: Element = document.documentElement): void {
  root.toggleAttribute('data-no-flight', hidden);
}

export function drawFlight(ctx: CanvasRenderingContext2D, runs: readonly Run[], c: Colours, w: number, h: number, font: string): void {
  ctx.globalAlpha = 1;
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = 'alphabetic';
  PLANES.forEach((plane, p) => {
    ctx.font = `400 ${plane.size}px ${font}`;
    const base = c[plane.tone];
    for (const run of runs) {
      if (run.p !== p) continue;
      const n = run.chars.length;
      for (let i = 0; i < n; i++) {
        const x = run.x - i * run.cw;
        if (x < -run.cw || x > w) continue;
        const t = n > 1 ? i / (n - 1) : 0; // 0 head → 1 tail end
        let colour = base;
        let alpha = run.alpha * (1 - t * 0.75);
        if (run.lit) {
          // accent run: bright head, the tail fades through mid to quiet
          colour = t < 0.25 ? c.primary : t < 0.6 ? c.mid : c.quiet;
          alpha = Math.min(1, run.alpha + 0.3) * (1 - t * 0.5);
        }
        if (p > 0) {
          // nearer planes cut a cell out of what is behind them, so overlap reads as depth
          ctx.globalAlpha = 1;
          ctx.fillStyle = c.bg;
          ctx.fillRect(x, run.y - LH * 0.85, run.cw, LH);
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = colour;
        ctx.fillText(run.chars[i]!, x, run.y);
      }
    }
  });
  ctx.globalAlpha = 1;
}

export interface FlightHost {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  /** the phone's «reduce motion» */
  readonly reducedMotion: { matches: boolean; addEventListener(type: 'change', listener: () => void): void };
}

/** Starts the background on `canvas`; it follows the root's theme, accent and motion settings. */
export function startFlight({ root, canvas, reducedMotion }: FlightHost): void {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  const font = getComputedStyle(root).getPropertyValue('--font').trim() || 'monospace';
  let w = 0;
  let h = 0;
  let runs: Run[] = [];
  let colours = readColours(root);
  let frame = 0;
  let last = 0;

  const draw = () => drawFlight(ctx, runs, colours, w, h, font);
  const moves = () => flightMoves(root, reducedMotion.matches) && !root.hasAttribute('data-no-flight') && document.visibilityState !== 'hidden';
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    advance(runs, dt, w, h);
    draw();
    frame = requestAnimationFrame(tick);
  };
  const run = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    draw();
    if (moves()) {
      frame = requestAnimationFrame((now) => {
        last = now;
        frame = requestAnimationFrame(tick);
      });
    }
  };
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    runs = populate(w, h);
    draw();
  };

  // theme, accent (also its flicker, which writes --accent-rgb on the root), the two «вимкнути … анімації» and the menu
  new MutationObserver(() => {
    colours = readColours(root);
    run();
  }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-accent', 'data-no-motion', 'data-no-background-motion', 'data-no-flight', 'style'] });
  reducedMotion.addEventListener('change', run);
  document.addEventListener('visibilitychange', run);
  addEventListener('resize', resize);

  const begin = () => {
    resize();
    run();
  };
  const fonts = document.fonts;
  if (fonts) void fonts.load(`9px ${font}`).catch(() => undefined).finally(begin);
  else begin();
}
