import { rubber, swipeMonths } from './gestures';
import { decode, EASE, moving, MS, play, whenDone } from '../ui/motion';

/*
 * Swipe on the calendar turns the month (Olesia, 2026-11-18), on home, in the
 * sheet from the date and in the history. Its own motion, not the heap of the
 * arrows: the days follow the finger, then slide out to that side and fade;
 * the new month slides in from the other side, the month name re-forms.
 * Let go too early and the days spring back. The weekdays stay put.
 *
 * Touch and pen only: a mouse has the arrows. Not with «більші зони», where
 * the month already scrolls sideways (wave 4). A mostly vertical move is
 * the page's scroll and is left alone.
 */

/** `turn` draws the month `by` away and returns the calendar block drawn. */
export type TurnMonth = (block: HTMLElement, by: -1 | 1) => HTMLElement | null;

/** How far the finger goes before the move counts as sideways or as a scroll. */
const SLOP = 10;

interface Drag {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly t: number;
  readonly block: HTMLElement;
  readonly grid: HTMLElement;
  /** null until the move is clearly sideways (true) or a scroll (false). */
  sideways: boolean | null;
  dx: number;
}

const gridOf = (block: ParentNode) => block.querySelector<HTMLElement>('.cal__grid');
/** The days are cut at the calendar's edge only while they move. */
const clipped = (grid: Element | null, on: boolean) => grid?.parentElement?.classList.toggle('cal__scroll--turning', on);
const canNext = (block: ParentNode) => block.querySelector<HTMLButtonElement>('[data-cal="month"][data-by="1"]')?.disabled !== true;

function follow(grid: HTMLElement, dx: number): void {
  if (!moving()) return;
  grid.style.transform = `translateX(${dx}px)`;
  grid.style.opacity = String(1 - Math.min(Math.abs(dx) / grid.offsetWidth, 1) * 0.5);
}

function release(grid: HTMLElement): void {
  grid.style.transform = '';
  grid.style.opacity = '';
}

/** Plays, then lets the edge go. */
function slide(grid: HTMLElement | null, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation | null {
  const run = play(grid, keyframes, options);
  if (run) whenDone(run, () => clipped(grid, false));
  else clipped(grid, false);
  return run;
}

export function wireMonthSwipe(root: HTMLElement, turn: TurnMonth, signal: AbortSignal): void {
  let drag: Drag | null = null;
  /** The click after a swipe opens no day. */
  let swallow = false;
  let busy = false;

  function springBack(grid: HTMLElement, dx: number): void {
    release(grid);
    slide(grid, [{ transform: `translateX(${dx}px)`, opacity: 1 - Math.min(Math.abs(dx) / grid.offsetWidth, 1) * 0.5 }, { transform: 'none', opacity: 1 }], {
      duration: MS.s, easing: EASE.spring,
    });
  }

  function turnTo(block: HTMLElement, grid: HTMLElement, by: -1 | 1, dx: number): void {
    const width = grid.offsetWidth;
    const away = by === 1 ? -width : width;
    release(grid);
    busy = true;
    const out = play(grid, [{ transform: `translateX(${dx}px)`, opacity: 1 - Math.min(Math.abs(dx) / width, 1) * 0.5 }, { transform: `translateX(${away * 0.6}px)`, opacity: 0 }], {
      duration: MS.xs, easing: EASE.in, fill: 'forwards',
    });
    whenDone(out, () => {
      busy = false;
      const drawn = turn(block, by);
      if (!drawn) return;
      const arriving = gridOf(drawn);
      if (moving()) clipped(arriving, true);
      slide(arriving, [{ transform: `translateX(${-away * 0.4}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], {
        duration: MS.m, easing: EASE.out, fill: 'backwards',
      });
      if (moving()) decode(drawn.querySelector<HTMLElement>('.cal__month'));
    });
  }

  root.addEventListener('pointerdown', (event) => {
    if (busy || drag || event.pointerType === 'mouse' || !event.isPrimary) return;
    if (document.documentElement.hasAttribute('data-larger-targets')) return;
    const grid = (event.target as Element).closest<HTMLElement>('.cal__grid');
    const block = grid?.closest<HTMLElement>('.cal-block');
    if (!grid || !block) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp, block, grid, sideways: null, dx: 0 };
  }, { signal });

  root.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (drag.sideways === null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP) return;
      drag.sideways = Math.abs(dx) > Math.abs(dy);
      if (!drag.sideways) {
        drag = null;
        return;
      }
      drag.grid.setPointerCapture?.(event.pointerId);
      if (moving()) clipped(drag.grid, true);
    }
    drag.dx = dx < 0 && !canNext(drag.block) ? rubber(dx) : dx;
    follow(drag.grid, drag.dx);
  }, { signal });

  const end = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { block, grid, dx, sideways, t } = drag;
    drag = null;
    if (!sideways) return;
    swallow = true;
    setTimeout(() => (swallow = false), 0);
    const by = event.type === 'pointerup' ? swipeMonths(dx, grid.offsetWidth, event.timeStamp - t) : 0;
    if (by === 0 || (by === 1 && !canNext(block))) springBack(grid, dx);
    else turnTo(block, grid, by, dx);
  };
  root.addEventListener('pointerup', end, { signal });
  root.addEventListener('pointercancel', end, { signal });

  root.addEventListener('click', (event) => {
    if (!swallow) return;
    swallow = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, signal });
}
