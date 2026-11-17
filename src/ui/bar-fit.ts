/*
 * C-01 (Olesia, MY-FIXES): the bottom bar changes its layout when something
 * doesn't fit, and may grow.
 *   0 · one row: ≡ on one side, the week line and the date with ‹ › on the other;
 *   1 · the date with its arrows doesn't fit beside ≡: it goes to a row under ≡;
 *   2 · it doesn't fit in that row either: the date on top, the arrows under it.
 * Whatever sits above the bar (the toast, «вгору», the search panel) and the
 * space at the end of a page follow its height through --bar-h.
 */

export type BarFit = 0 | 1 | 2;

export interface BarWidths {
  /** The bar's width inside its side padding. */
  readonly inner: number;
  /** ≡ (or ✕ in the menu). */
  readonly menu: number;
  /** The date with both arrows, on one line. */
  readonly nav: number;
  /** The gap between ≡ and the date. */
  readonly gap: number;
}

export function barFit({ inner, menu, nav, gap }: BarWidths): BarFit {
  // half a pixel of rounding is not an overflow
  if (menu + gap + nav <= inner + 0.5) return 0;
  if (nav <= inner + 0.5) return 1;
  return 2;
}

/** The height of a bar without its bottom padding (the safe area), as --bar-h counts it. */
export function barHeight(height: number, paddingBottom: number): number {
  return Math.ceil(height - paddingBottom);
}

/** The space at the end of a page: the bar's height, as 80 px was to 83 before. */
export const pageEnd = (barH: number): number => barH - 3;

/**
 * Keeps every bar that appears under `host` fitted, and --bar-h on `root` in
 * step with the one on screen. Returns the way to stop.
 */
export function wireBarFit(root: HTMLElement, host: HTMLElement): () => void {
  // no layout to measure (tests in jsdom): the bar keeps its CSS layout
  if (typeof ResizeObserver === 'undefined') return () => {};
  let bar: HTMLElement | null = null;
  const sizes = new ResizeObserver(() => fit());
  const fit = () => {
    if (!bar?.isConnected) return;
    const nav = bar.querySelector<HTMLElement>('.date-nav');
    const menu = bar.querySelector<HTMLElement>('.bar__menu');
    if (nav && menu) {
      // measured in one row, then set: all in one frame, so nothing flickers
      delete bar.dataset.fit;
      const style = getComputedStyle(bar);
      const inner = bar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const navWidth = [...nav.children].reduce((sum, child) => sum + (child as HTMLElement).getBoundingClientRect().width, 0)
        + parseFloat(getComputedStyle(nav).columnGap || '0') * Math.max(0, nav.children.length - 1);
      const level = barFit({ inner, menu: menu.getBoundingClientRect().width, nav: navWidth, gap: parseFloat(style.columnGap) || 8 });
      if (level > 0) bar.dataset.fit = String(level);
    }
    const height = barHeight(bar.getBoundingClientRect().height, parseFloat(getComputedStyle(bar).paddingBottom));
    root.style.setProperty('--bar-h', `${height}px`);
    root.style.setProperty('--pad-bottom-bar', `${pageEnd(height)}px`);
  };
  const follow = () => {
    const next = host.querySelector<HTMLElement>('.bar');
    if (next === bar) return;
    sizes.disconnect();
    bar = next;
    if (!bar) {
      root.style.removeProperty('--bar-h');
      root.style.removeProperty('--pad-bottom-bar');
      return;
    }
    sizes.observe(bar);
    // the date's text changes with the day; its size is what tells
    for (const part of bar.querySelectorAll('.date-nav, .date-nav__date, .bar__goal, .bar__menu')) sizes.observe(part);
    fit();
  };
  const screens = new MutationObserver(follow);
  screens.observe(host, { childList: true, subtree: true });
  // larger text and the mirror are switched on the root
  const looks = new MutationObserver(fit);
  looks.observe(root, { attributes: true, attributeFilter: ['data-larger-text', 'data-larger-targets', 'data-mirrored'] });
  follow();
  return () => {
    sizes.disconnect();
    screens.disconnect();
    looks.disconnect();
  };
}
