/*
 * The engine of the monthly header scenes (Олеся + Нитка / AI), ported from
 * the shared part of header-animations/*.html in the workspace (2026-11-18).
 * The scenes themselves (./scenes/*.js) are copied from those files
 * unchanged; this file gives them the same helpers the previews gave them.
 *
 * In the app (Olesia, 2026-11-18, the brief «Шапка головної — сезонні
 * ASCII-анімації», «Як вносити в код»): the font is the app's Noto Sans Mono,
 * the plate is the dark theme's page colour in both themes, and on screens
 * wider than 430 px the whole scene scales up instead of standing in the
 * middle. The canvas covers the top 40 px band and the 270 px scene; January,
 * February, March and June draw into the band (branches, icicles, rainbow),
 * the other months are clipped below it, as in their previews.
 */

export type RGB = readonly [number, number, number];

/** One character of a scene; scenes add their own fields (sway, phase, depth…). */
export type Cell = { x: number; y: number; c: string; col: RGB; a: number; z?: number } & Record<string, any>;

/** What a cell turns into for one frame: moved, faded, recoloured, another glyph; false hides it. */
export type CellFx = (cell: Cell) => false | null | undefined | { dx?: number; dy?: number; a?: number; col?: RGB; c?: string };

export interface Stage {
  /** the scene's width and height in design px (up to 430 × 270) */
  W: number;
  H: number;
  /** one cell, px */
  cw: number;
  ch: number;
  cols: number;
  rows: number;
  /** px of the top band the scene draws into (40 or 0) */
  PT: number;
}

interface TreeOptions {
  col: RGB;
  a: number;
  spread?: number;
  jitter?: number;
  tips?: { x: number; y: number; s: number }[];
  baseY?: number;
  height?: number;
}

/** What a scene gets, as in the previews (`A`). Scenes may also keep their own things on it. */
export interface SceneApi {
  S: Stage;
  ctx: CanvasRenderingContext2D;
  font: string;
  bg: string;
  [own: string]: unknown;
}

export interface SceneParts {
  build(): void;
  render(t: number, dt: number): void;
}

export type SceneMaker = (api: SceneApi) => SceneParts;

export interface HeroScene {
  /** the canvas is `w` × `h` CSS px at `dpr` */
  resize(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number): void;
  render(ctx: CanvasRenderingContext2D, t: number, dt: number): void;
}

export const FONT_PX = 9;
/** The previews are at most 430 px wide; a wider header scales the scene up. */
export const DESIGN_W = 430;
/** The empty band above the scene, which four months draw into. */
export const BAND = 40;
/** The header block: 40 px band, 270 px scene, 90 px for the phrase. */
export const HEADER_H = 400;
export const CANVAS_H = 310;

/** The scene `make` on a canvas; `pt` = 40 when it draws into the top band. */
export function heroScene(make: SceneMaker, pt: number, family: string, bg: string): HeroScene {
  const font = `${FONT_PX}px ${family}`;
  const S: Stage = { W: 0, H: 0, cw: 5.4, ch: 9, cols: 0, rows: 0, PT: pt };
  let ctx = null as unknown as CanvasRenderingContext2D;
  let seed = 1;
  let scale = 1;
  let dpr = 1;
  let full = { w: 0, h: 0 };
  let parts: SceneParts | null = null;

  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const reseed = (s: number) => {
    seed = s;
  };
  const pick = <T>(a: readonly T[]): T => a[(rnd() * a.length) | 0]!;
  const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
  const smooth = (a: number, b: number, x: number) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a, 0, 1).toFixed(3)})`;

  /** The character for a direction in pixel space. */
  function dirChar(ang: number): string {
    const a = (((ang * 180) / Math.PI) % 180 + 180) % 180;
    if (a < 22 || a > 158) return '_';
    if (a < 68) return '\\';
    if (a < 112) return '|';
    return '/';
  }

  /** A segment as cells. */
  function seg(arr: Cell[], x1: number, y1: number, x2: number, y2: number, col: RGB, a: number, extra?: Partial<Cell>): void {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.ceil(len / (Math.min(S.cw, S.ch) * 0.5)));
    const c = extra?.c || dirChar(ang);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      arr.push(Object.assign({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, c, col, a }, extra ?? {}, { c }));
    }
  }

  /** A polyline through `pts`. */
  function poly(arr: Cell[], pts: readonly (readonly [number, number])[], col: RGB, a: number, extra?: Partial<Cell>): void {
    for (let i = 0; i < pts.length - 1; i++) seg(arr, pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], col, a, extra);
  }

  /** The outline of an ellipse; the characters follow the tangent. */
  function ell(arr: Cell[], cx: number, cy: number, rx: number, ry: number, col: RGB, a: number, extra?: Partial<Cell>, a0 = 0, a1 = Math.PI * 2): void {
    const n = Math.max(8, Math.ceil(((rx + ry) * Math.PI) / (S.cw * 0.6)));
    for (let i = 0; i <= n; i++) {
      const t = a0 + ((a1 - a0) * i) / n;
      const x = cx + Math.cos(t) * rx;
      const y = cy + Math.sin(t) * ry;
      const tang = Math.atan2(Math.cos(t) * ry, -Math.sin(t) * rx);
      let c = dirChar(tang);
      if (c === '_' && Math.sin(t) < 0) c = '-';
      arr.push(Object.assign({ x, y, c, col, a }, extra ?? {}, { c: extra?.c || c }));
    }
  }

  /** Snaps cells to the grid; in a taken cell the higher z wins, then the brighter one. */
  function snap(arr: readonly Cell[]): Cell[] {
    const m = new Map<string, Cell>();
    for (const c of arr) {
      const gx = Math.round(c.x / S.cw);
      const gy = Math.round(c.y / S.ch);
      if (gy < -Math.ceil(S.PT / S.ch) - 1 || gy > S.rows || gx < -1 || gx > S.cols) continue;
      const k = `${gx},${gy}`;
      const p = m.get(k);
      const z = c.z || 0;
      const pz = p ? p.z || 0 : -1;
      if (!p || z > pz || (z === pz && c.a > p.a)) m.set(k, Object.assign({}, c, { x: gx * S.cw, y: gy * S.ch }));
    }
    return [...m.values()];
  }

  /** The cells of `arr` outside `test`. */
  const cut = (arr: readonly Cell[], test: (x: number, y: number) => boolean) => arr.filter((c) => !test(c.x + S.cw / 2, c.y + S.ch / 2));

  function draw(cells: readonly Cell[], fx?: CellFx): void {
    for (const cell of cells) {
      let { x, y, a, col, c: ch } = cell;
      if (fx) {
        const r = fx(cell);
        if (r === false) continue;
        if (r) {
          if (r.dx) x += r.dx;
          if (r.dy) y += r.dy;
          if (r.a !== undefined) a = r.a;
          if (r.col) col = r.col;
          if (r.c) ch = r.c;
        }
      }
      if (a <= 0.004) continue;
      ctx.fillStyle = rgba(col, a);
      ctx.fillText(ch, x, y);
    }
  }

  function glyph(ch: string, x: number, y: number, col: RGB, a: number, rot?: number): void {
    if (a <= 0.004) return;
    ctx.fillStyle = rgba(col, a);
    if (rot) {
      ctx.save();
      ctx.translate(x + S.cw / 2, y + S.ch / 2);
      ctx.rotate(rot);
      ctx.fillText(ch, -S.cw / 2, -S.ch / 2);
      ctx.restore();
    } else ctx.fillText(ch, x, y);
  }

  /** A bare tree, recursively; returns its tips. Cells get s = sway weight (0 at the base). */
  function tree(arr: Cell[], x: number, y: number, ang: number, len: number, w: number, depth: number, o: TreeOptions): { x: number; y: number; s: number }[] {
    const tips = o.tips || (o.tips = []);
    const baseY = o.baseY !== undefined ? o.baseY : (o.baseY = y);
    const height = o.height || (o.height = len * 3.2);
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    const steps = Math.max(2, Math.ceil(len / (Math.min(S.cw, S.ch) * 0.45)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x + (x2 - x) * t;
      const py = y + (y2 - y) * t;
      const ww = w * (1 - t * 0.25);
      const s = clamp((baseY - py) / height, 0, 1) ** 1.5;
      if (ww > S.cw * 1.6) {
        const nx = -Math.sin(ang);
        const ny = Math.cos(ang);
        const sA = nx > 0 ? 1 : -1;
        const vert = Math.abs(Math.cos(ang)) < 0.35;
        const d = dirChar(ang);
        arr.push({ x: px - (sA * nx * ww) / 2, y: py - (sA * ny * ww) / 2, c: vert ? '(' : d, col: o.col, a: o.a * 0.95, s, z: 1, top: false, ang });
        arr.push({ x: px + (sA * nx * ww) / 2, y: py + (sA * ny * ww) / 2, c: vert ? ')' : d, col: o.col, a: o.a * 0.7, s, z: 1, ang });
        if (i % 2 === 0) {
          for (let k = -ww / 2 + S.cw; k < ww / 2 - S.cw * 0.5; k += S.cw) {
            if (rnd() < 0.3) arr.push({ x: px + nx * k, y: py + ny * k, c: pick(['|', ':', "'"]), col: o.col, a: o.a * 0.35, s, z: 0 });
          }
        }
      } else arr.push({ x: px, y: py, c: dirChar(ang), col: o.col, a: o.a * clamp(0.45 + w / (S.cw * 3), 0.45, 0.9), s, z: 1, ang, w });
    }
    if (depth <= 0 || len < S.ch * 0.7) {
      tips.push({ x: x2, y: y2, s: clamp((baseY - y2) / height, 0, 1) });
      return tips;
    }
    const n = depth > 3 ? 2 : rnd() < 0.3 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const spread = (n === 2 ? (i ? 1 : -1) : i - 1) * ((o.spread || 0.38) + rnd() * 0.26);
      const na = clamp(ang + spread * 0.8 + (rnd() - 0.5) * (o.jitter || 0.2), -Math.PI + 0.4, -0.4);
      tree(arr, x2, y2, na, len * (0.68 + rnd() * 0.1), w * 0.6, depth - 1, o);
    }
    return tips;
  }

  /** A wavy ground line across the width at y = fy(x). */
  function ground(arr: Cell[], fy: (x: number) => number, col: RGB, a: number, chars?: readonly string[]): void {
    for (let x = 0; x < S.W + S.cw; x += S.cw * 0.5) {
      const y = fy(x);
      const y2 = fy(x + S.cw * 0.5);
      const ang = Math.atan2(y2 - y, S.cw * 0.5);
      const c = Math.abs(ang) < 0.25 ? (chars ? pick(chars) : '_') : dirChar(ang);
      arr.push({ x, y, c, col, a, z: 2 });
    }
  }

  const api: SceneApi = {
    S, ctx, font, bg, rnd, reseed, pick, clamp, smooth, mix, rgba, dirChar, seg, poly, ell, snap, cut, draw, glyph, tree, ground,
  };

  return {
    resize(context, w, h, ratio) {
      ctx = context;
      api.ctx = context;
      dpr = ratio;
      full = { w, h };
      scale = Math.max(1, w / DESIGN_W);
      S.W = w / scale;
      S.H = h / scale - BAND;
      ctx.font = font;
      ctx.textBaseline = 'top';
      S.cw = ctx.measureText('M').width;
      S.ch = FONT_PX * 1.05;
      S.cols = Math.ceil(S.W / S.cw) + 1;
      S.rows = Math.ceil(S.H / S.ch) + 1;
      parts = make(api);
      parts.build();
    },
    render(context, t, dt) {
      if (!parts) return;
      ctx = context;
      api.ctx = context;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, full.w, full.h);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, dpr * scale * BAND);
      ctx.save();
      if (!S.PT) {
        // the months without a band start under it, as in their previews
        ctx.beginPath();
        ctx.rect(0, 0, S.W, S.H);
        ctx.clip();
      }
      ctx.font = font;
      ctx.textBaseline = 'top';
      parts.render(t, dt);
      ctx.restore();
    },
  };
}
