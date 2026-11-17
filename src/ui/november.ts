/*
 * «Шапка · листопад» (Олеся + Нитка / AI): the November hero scene, ported
 * from the artifact «Шапка · листопад v1» (https://claude.ai/artifact/VYWAHYFZb19zR96TyjbmX5,
 * 2026-11-17) with its drawing unchanged. A streetlight, a bare tree and a
 * pile of leaves; leaves fall, gusts carry them and lift them off the pile,
 * and in the cone of light they turn bright. Only characters, on a near-black
 * plate. Its colours are its own, the same in both themes (as the scenes of
 * the betas: the band is a dark plate under a veil, see .hero__scene).
 */

import type { HeroScene } from './hero-scene';

type RGB = readonly [number, number, number];

interface Cell { x: number; y: number; c: string }
interface PoleCell extends Cell { k: number; dedupe?: boolean }
interface ConeCell extends Cell { L: number; ph: number }
interface SkyCell extends Cell { a: number; ph: number }
interface GroundCell extends Cell { L: number }
interface PileCell extends Cell { col: RGB; L: number; ph: number }
interface TreeCell extends Cell { k: number; s: number; L: number }
interface Leaf {
  x: number; y: number; vx: number; vy: number; rot: number; vr: number; c: string; col: RGB;
  fl: number; fs: number; state: 'fall' | 'rest'; life: number; a: number; mass: number; rt: number;
}
interface Lamp { x: number; y: number; half: number; poolR: number; tips: { x: number; y: number }[] }

const FONT_PX = 9;
export const NOVEMBER_BG = '#0c0c14';

const LIGHT: RGB = [255, 206, 120];
const HOT: RGB = [255, 240, 200];
const BARK: RGB = [118, 108, 130];
const BARK_DIM: RGB = [70, 64, 84];
const LEAF_BASE: readonly RGB[] = [[190, 86, 40], [204, 140, 46], [170, 58, 42], [150, 96, 48], [214, 112, 36]];
const LEAF_GLYPHS = ['*', ',', '`', '~', "'", '%', '&', '"'];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (c1: RGB, c2: RGB, t: number): RGB => [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
const dim = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** A new November scene; `font` is the family (the app's mono font). */
export function november(family: string): HeroScene {
  const FONT = `${FONT_PX}px ${family}`;
  let W = 0, H = 0, cw = 5.4, ch = 9, cols = 0, rows = 0;
  let groundY = 0;
  let lamp: Lamp = { x: 0, y: 0, half: 0.42, poolR: 0, tips: [] };
  let treeCells: TreeCell[] = [], pileCells: PileCell[] = [], coneCells: ConeCell[] = [], skyCells: SkyCell[] = [];
  let poleCells: PoleCell[] = [], haloCells: Cell[] = [], groundCells: GroundCell[] = [];
  let leaves: Leaf[] = [];

  // seeded random, so the scene is the same after a resize
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const pick = <T>(a: readonly T[]): T => a[(rnd() * a.length) | 0]!;

  // light from the streetlight: cone + pool on the ground + halo
  function lightAt(x: number, y: number): number {
    const dx = x - lamp.x, dy = y - lamp.y;
    const d = Math.hypot(dx, dy);
    const halo = Math.exp(-d / (ch * 2.2)) * 0.9;
    if (dy <= 0) return clamp(halo, 0, 1);
    const ang = Math.abs(Math.atan2(dx, dy)); // 0 = straight down
    const edge = 1 - smooth(lamp.half * 0.82, lamp.half * 1.08, ang);
    const fall = 1 / (1 + (d / (H * 0.9)) ** 2 * 1.6);
    const cone = edge * fall * 0.75;
    const pool = Math.exp(-(((x - lamp.x) / lamp.poolR) ** 2) - (((y - groundY) / (ch * 2.2)) ** 2));
    return clamp(Math.max(cone, halo) + pool * 0.5 * edge, 0, 1);
  }

  function build(): void {
    seed = 7;
    groundY = H - ch * 2.2;
    // streetlight on the right, its arm reaching left
    const poleX = W * 0.8;
    lamp = { x: W * 0.64, y: H * 0.17, half: 0.42, poolR: W * 0.24, tips: [] };
    poleCells = []; haloCells = []; coneCells = []; skyCells = []; groundCells = []; pileCells = [];

    // pole: two thin contours
    const poleTop = lamp.y - ch * 1.6;
    for (let y = poleTop + ch * 1.2; y < groundY; y += ch) {
      poleCells.push({ x: poleX - cw * 0.5, y, c: '|', k: 0.55 });
      poleCells.push({ x: poleX + cw * 0.5, y, c: '|', k: 0.35 });
    }
    poleCells.push({ x: poleX - cw, y: groundY, c: '[', k: 0.5 }, { x: poleX, y: groundY, c: '_', k: 0.5 }, { x: poleX + cw, y: groundY, c: ']', k: 0.5 });
    // arm: from the pole top to the lamp head
    const ay = Math.round((lamp.y - ch * 1.6) / ch) * ch;
    poleCells.push({ x: Math.round(poleX / cw) * cw - cw * 0.5, y: ay + ch, c: '/', k: 0.6 });
    for (let x = Math.round((lamp.x + cw * 3) / cw) * cw; x < poleX - cw; x += cw) poleCells.push({ x, y: ay, c: '_', k: 0.6, dedupe: true });
    // lamp head
    const hx = lamp.x, hy = lamp.y;
    ([['/', -3, -0.6], ['=', -2, -0.6], ['=', -1, -0.6], ['=', 0, -0.6], ['=', 1, -0.6], ['=', 2, -0.6], ['\\', 3, -0.6]] as const)
      .forEach(([c, i, j]) => poleCells.push({ x: hx + i * cw, y: hy + j * ch, c, k: 0.75 }));
    ([['(', -2, 0.4], ['o', -1, 0.4], ['@', 0, 0.4], ['o', 1, 0.4], [')', 2, 0.4]] as const)
      .forEach(([c, i, j]) => haloCells.push({ x: hx + i * cw, y: hy + j * ch, c }));
    const seen = new Set<string>();
    poleCells = poleCells.filter((p) => {
      if (!p.dedupe) return true;
      const k = `${p.x}_${p.y}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // cone + sky dust on the cell grid, with a stable random
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw, y = r * ch, rr = rnd(), r2 = rnd();
        if (y >= groundY - ch * 0.2) continue;
        const L = lightAt(x + cw / 2, y + ch / 2);
        const below = y + ch / 2 > lamp.y + ch * 0.6;
        if (below && L > 0.05 && rr < 0.18 + L * 0.75) {
          const g = L > 0.55 ? ':' : L > 0.3 ? '.' : '·';
          coneCells.push({ x, y, c: rr < 0.08 && L > 0.4 ? "'" : g, L, ph: r2 * 6.28 });
        } else if (L < 0.05 && rr < 0.018 && y < H * 0.55) {
          skyCells.push({ x, y, c: r2 < 0.7 ? '.' : '·', a: 0.1 + r2 * 0.12, ph: rr * 6.28 });
        }
      }
    }

    // ground line + road texture
    for (let c = 0; c < cols; c++) {
      const x = c * cw;
      const L = lightAt(x + cw / 2, groundY);
      groundCells.push({ x, y: groundY, c: rnd() < 0.75 ? '_' : '.', L });
      if (rnd() < 0.35 + L * 0.5) groundCells.push({ x, y: groundY + ch, c: pick(['.', ',', '·', "'"]), L: L * 0.8 });
    }

    // leaf pile: a mound left of the pole, partly in the light
    const pcx = W * 0.47, pw = W * 0.3, ph = ch * 3.3;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw / 2, y = r * ch + ch / 2;
        const nx = (x - pcx) / (pw / 2);
        if (Math.abs(nx) > 1) continue;
        const top = groundY - ph * (1 - nx * nx) ** 0.8;
        if (y < top - ch * 0.2 || y > groundY + ch * 0.4) continue;
        const depth = (y - top) / ph;
        if (rnd() < 0.62 - depth * 0.18) {
          pileCells.push({ x: c * cw, y: r * ch, c: pick(LEAF_GLYPHS), col: pick(LEAF_BASE), L: lightAt(x, y), ph: rnd() * 6.28 });
        }
      }
    }

    // bare tree on the left: recursive branches as line art
    const raw: Omit<TreeCell, 'L'>[] = [];
    const tips: { x: number; y: number }[] = [];
    const branch = (x: number, y: number, ang: number, len: number, w: number, depth: number): void => {
      const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      const steps = Math.max(2, Math.ceil(len / (Math.min(cw, ch) * 0.45)));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, px = x + (x2 - x) * t, py = y + (y2 - y) * t;
        const ww = w * (1 - t * 0.25);
        const sway = clamp((groundY - py) / (H * 0.85), 0, 1) ** 1.6;
        if (ww > cw * 1.6) {
          // thick: two contours + sparse grain inside
          const nx = -Math.sin(ang), ny = Math.cos(ang);
          const dir = Math.abs(Math.cos(ang)) < 0.35 ? '|' : Math.cos(ang) * Math.sin(ang) < 0 ? '/' : '\\';
          const lc = dir === '|' ? '(' : dir, rc = dir === '|' ? ')' : dir;
          const sA = nx > 0 ? 1 : -1;
          raw.push({ x: px - sA * nx * ww / 2, y: py - sA * ny * ww / 2, c: lc, k: 0.85, s: sway });
          raw.push({ x: px + sA * nx * ww / 2, y: py + sA * ny * ww / 2, c: rc, k: 0.6, s: sway });
          if (i % 2 === 0) {
            for (let o = -ww / 2 + cw; o < ww / 2 - cw * 0.5; o += cw) {
              if (rnd() < 0.35) raw.push({ x: px + nx * o, y: py + ny * o, c: pick(['|', ':', "'", '|']), k: 0.28, s: sway });
            }
          }
        } else {
          const a = ((ang * 180) / Math.PI + 360) % 180; // 0…180, pixel space
          const c = a < 22 || a > 158 ? '_' : a < 68 ? '\\' : a < 112 ? '|' : '/';
          raw.push({ x: px, y: py, c, k: clamp(0.35 + w / (cw * 3), 0.35, 0.8), s: sway });
        }
      }
      if (depth <= 0 || len < ch * 0.7) {
        tips.push({ x: x2, y: y2 });
        return;
      }
      const n = depth > 3 ? 2 : rnd() < 0.3 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const spread = (n === 2 ? (i ? 1 : -1) : i - 1) * (0.32 + rnd() * 0.28);
        const na = clamp(ang + spread * 0.8 + (rnd() - 0.5) * 0.18, -Math.PI + 0.45, -0.45);
        branch(x2, y2, na, len * (0.68 + rnd() * 0.1), w * 0.6, depth - 1);
      }
    };
    branch(W * 0.21, groundY + ch * 0.3, -Math.PI / 2 + 0.03, H * 0.24, cw * 3.2, 6);
    // root flare
    ([['/', -4], ['_', -3], ['_', 3], ['\\', 4]] as const).forEach(([c, i]) => raw.push({ x: W * 0.21 + i * cw, y: groundY, c, k: 0.55, s: 0 }));
    // snap to the grid, keep the strongest per cell
    const map = new Map<string, Omit<TreeCell, 'L'>>();
    for (const t of raw) {
      const gx = Math.round(t.x / cw), gy = Math.round(t.y / ch);
      if (gy < 0 || gy >= rows) continue;
      const key = `${gx},${gy}`, prev = map.get(key);
      if (!prev || prev.k < t.k) map.set(key, { ...t, x: gx * cw, y: gy * ch });
    }
    treeCells = [...map.values()].map((t) => ({ ...t, L: lightAt(t.x + cw / 2, t.y + ch / 2) }));
    lamp.tips = tips;
  }

  // ------- wind -------
  let gust = 0, gustTarget = 0, nextGust = 1.5, gustT = 0;
  function wind(t: number, dt: number): number {
    nextGust -= dt;
    if (nextGust <= 0) {
      gustTarget = 0.6 + rnd() * 0.9;
      gustT = 0;
      nextGust = 3 + rnd() * 5;
    }
    gustT += dt;
    const env = gustTarget * (gustT < 0.7 ? smooth(0, 0.7, gustT) : Math.exp(-(gustT - 0.7) / 1.6));
    gust += (env - gust) * Math.min(1, dt * 3);
    return 14 + gust * 130 + Math.sin(t * 0.7) * 6;
  }

  function spawnLeaf(fromTree: boolean): Leaf {
    let x: number, y: number;
    if (fromTree && lamp.tips.length) {
      const tp = pick(lamp.tips);
      x = tp.x;
      y = tp.y;
    } else {
      x = -cw * 2;
      y = rnd() * H * 0.6;
    }
    const leaf: Leaf = {
      x, y, vx: 0, vy: 10, rot: rnd() * 6.28, vr: (rnd() - 0.5) * 4, c: pick(LEAF_GLYPHS),
      col: pick(LEAF_BASE), fl: rnd() * 6.28, fs: 1.5 + rnd() * 2, state: 'fall', life: 0, a: 0, mass: 0.7 + rnd() * 0.6, rt: 0,
    };
    leaves.push(leaf);
    return leaf;
  }

  // a gust kicks leaves up from the pile
  function lift(): void {
    const p = pileCells.filter((c) => c.y < groundY);
    if (!p.length) return;
    const from = pick(p);
    leaves.push({
      x: from.x, y: from.y, vx: 20, vy: -40 - rnd() * 40, rot: 0, vr: (rnd() - 0.5) * 8, c: from.c, col: from.col,
      fl: rnd() * 6.28, fs: 2 + rnd() * 2, state: 'fall', life: 0, a: 1, mass: 0.6 + rnd() * 0.5, rt: 0,
    });
  }

  function resize(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    W = w;
    H = h;
    ctx.font = FONT;
    ctx.textBaseline = 'top';
    cw = ctx.measureText('M').width || FONT_PX * 0.6;
    ch = FONT_PX * 1.05;
    cols = Math.ceil(W / cw) + 1;
    rows = Math.ceil(H / ch) + 1;
    build();
    leaves = [];
    for (let i = 0; i < 14; i++) {
      const leaf = spawnLeaf(rnd() < 0.6);
      leaf.x = rnd() * W;
      leaf.y = rnd() * groundY;
    }
  }

  function render(ctx: CanvasRenderingContext2D, t: number, dt: number): void {
    const wv = wind(t, dt);
    ctx.fillStyle = NOVEMBER_BG;
    ctx.fillRect(0, 0, W, H);
    ctx.font = FONT;
    ctx.textBaseline = 'top';

    // sky dust
    for (const s of skyCells) {
      ctx.fillStyle = rgba([150, 150, 185], s.a * (0.75 + 0.25 * Math.sin(t * 0.6 + s.ph)));
      ctx.fillText(s.c, s.x, s.y);
    }
    // light cone (slow breathing, no glyph swaps)
    const flick = 0.93 + 0.05 * Math.sin(t * 1.3) + 0.02 * Math.sin(t * 7.1);
    for (const c of coneCells) {
      const a = (0.12 + c.L * 0.85) * flick * (0.85 + 0.15 * Math.sin(t * 0.8 + c.ph));
      ctx.fillStyle = rgba(mix(LIGHT, HOT, c.L * 0.6), a);
      ctx.fillText(c.c, c.x, c.y);
    }
    // tree (sways with the wind, more at the top)
    const sw = gust * 7 + Math.sin(t * 1.1) * 1.2;
    for (const b of treeCells) {
      const lit = mix(mix(BARK_DIM, BARK, b.k), LIGHT, b.L * 0.75);
      ctx.fillStyle = rgba(lit, clamp(0.35 + b.k * 0.6 + b.L * 0.4, 0, 1));
      ctx.fillText(b.c, b.x + sw * b.s + Math.sin(t * 2.3 + b.y * 0.05) * b.s * gust * 1.5, b.y);
    }
    // pole + head
    for (const p of poleCells) {
      const L = lightAt(p.x, p.y);
      ctx.fillStyle = rgba(mix([105, 105, 125], LIGHT, L * 0.5), p.k + L * 0.3);
      ctx.fillText(p.c, p.x, p.y);
    }
    for (const h of haloCells) {
      ctx.fillStyle = rgba(HOT, 0.92 * flick);
      ctx.fillText(h.c, h.x, h.y);
    }
    // ground
    for (const g of groundCells) {
      ctx.fillStyle = rgba(mix([80, 78, 98], LIGHT, g.L * 0.8), 0.35 + g.L * 0.6);
      ctx.fillText(g.c, g.x, g.y);
    }
    // pile
    for (const p of pileCells) {
      const col = mix(dim(p.col, 0.5), mix(p.col, HOT, 0.35), p.L);
      ctx.fillStyle = rgba(col, 0.5 + p.L * 0.5 + 0.04 * Math.sin(t * 0.9 + p.ph));
      ctx.fillText(p.c, p.x, p.y);
    }

    if (leaves.length < 60) {
      if (rnd() < dt * (1.6 + gust * 5)) spawnLeaf(rnd() < 0.55);
      if (gust > 0.5 && rnd() < dt * gust * 3) lift();
    }
    // leaves: one leaf = one character, turning smoothly
    for (const l of leaves) {
      l.life += dt;
      if (l.state === 'fall') {
        l.a = Math.min(1, l.a + dt * 2);
        const target = wv * (0.75 + 0.5 / l.mass);
        l.vx += (target - l.vx) * Math.min(1, (dt * 1.8) / l.mass);
        const termV = 22 * l.mass - gust * 14;
        l.vy += (termV - l.vy) * Math.min(1, dt * 1.5);
        l.x += (l.vx + Math.sin(l.life * l.fs + l.fl) * 14) * dt;
        l.y += (l.vy + Math.cos(l.life * l.fs * 0.8 + l.fl) * 8) * dt;
        l.rot += (l.vr + l.vx * 0.03) * dt;
        if (l.y >= groundY - ch * 0.1) {
          l.y = groundY - ch * 0.1;
          l.state = 'rest';
          l.rt = 0;
        }
      } else {
        l.rt += dt;
        l.rot *= 0.9;
        if (gust > 0.75 && rnd() < dt * 2) {
          l.state = 'fall';
          l.vy = -30 - rnd() * 40;
          l.vx = wv;
        }
        if (l.rt > 2.5) l.a -= dt * 0.6;
        l.x += wv * 0.08 * dt;
      }
      const L = lightAt(l.x, l.y);
      const col = mix(dim(l.col, 0.55), mix(l.col, HOT, 0.45), Math.min(1, L * 2));
      ctx.save();
      ctx.translate(l.x + cw / 2, l.y + ch / 2);
      ctx.rotate(l.rot);
      ctx.fillStyle = rgba(col, clamp(l.a, 0, 1) * (0.75 + 0.25 * Math.min(1, L * 2)));
      ctx.fillText(l.c, -cw / 2, -ch / 2);
      ctx.restore();
    }
    leaves = leaves.filter((l) => l.a > 0 && l.x < W + cw * 3 && l.y > -H);
  }

  return { resize, render, leaves: () => leaves.length };
}
