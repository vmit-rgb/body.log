import { addDays, formatBar, formatLong, type DayKey } from '../domain/dates';
import { emptyDay, type Day } from '../domain/day';
import type { Diary } from '../domain/diary';
import { weekGoal } from '../domain/progress';
import type { Settings } from '../domain/settings';
import { barShown, swipeDays, toTopShown, type Point } from '../home/gestures';
import { goalLine } from '../home/home-view';
import { iconSvg } from '../ui/icons';
import { fadeShown, moving } from '../ui/motion';
import { part } from './parts';
import { t } from '../i18n/lang';

/*
 * The bottom bar (Figma `navigation` 189:6748): ≡ on home, ✕ in the menu
 * (variants `home` and `menu`); the week line and the date with its arrows
 * on the right in both.
 */

export interface BarState {
  readonly settings: Settings;
  readonly days: Diary['days'];
  readonly date: DayKey;
  readonly today: DayKey;
}

const LEFT = {
  menu: `<button type="button" class="ctl icon-btn icon-btn--secondary bar__menu" aria-label="${t('меню')}">${iconSvg('menu')}</button>`,
  close: `<button type="button" class="ctl icon-btn icon-btn--secondary bar__menu" aria-label="${t('закрити меню')}">${iconSvg('close')}</button>`,
};

export function barMarkup(left: keyof typeof LEFT): string {
  return `
  <nav class="bar" aria-label="${t('навігація')}">
    ${LEFT[left]}
    <div class="bar__right">
      <p class="bar__goal t-3rd-semibold"></p>
      <div class="date-nav">
        <button type="button" class="ctl icon-btn icon-btn--secondary date-nav__step" data-step="-1" aria-label="${t('попередній день')}">${iconSvg('chevron-left')}</button>
        <button type="button" class="ctl date-nav__date" aria-haspopup="dialog" aria-expanded="false"><span aria-hidden="true"></span><span class="visually-hidden"></span></button>
        <button type="button" class="ctl icon-btn icon-btn--secondary date-nav__step" data-step="1" aria-label="${t('наступний день')}">${iconSvg('chevron-right')}</button>
      </div>
    </div>
  </nav>`;
}

/**
 * The bar over the pages (navigation `history`): ≡ 🔍 ✕, each with `data-page`.
 * `searchOpen` marks 🔍 as a switch where it opens the search in place.
 */
export function pagesBarMarkup(searchOpen?: boolean): string {
  const pressed = searchOpen === undefined ? '' : ` aria-pressed="${searchOpen}"`;
  return `
  <nav class="bar bar--pages" aria-label="${t('навігація')}">
    <button type="button" class="ctl icon-btn icon-btn--secondary bar__menu" data-page="menu" aria-label="${t('меню')}">${iconSvg('menu')}</button>
    <button type="button" class="ctl icon-btn icon-btn--secondary bar__menu bar__search" data-page="search" aria-label="${t('пошук у нотатках')}"${pressed}>${iconSvg('search')}</button>
    <button type="button" class="ctl icon-btn icon-btn--secondary bar__menu" data-page="close" aria-label="${t('закрити')}">${iconSvg('close')}</button>
  </nav>`;
}

/** ≡ 🔍 ✕ call the action of the same name. */
export function wirePagesBar(host: HTMLElement, actions: Record<'menu' | 'search' | 'close', () => void>): void {
  part(host, '.bar').addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-page]');
    if (button) actions[button.dataset.page as 'menu' | 'search' | 'close']();
  });
}

/** «цей тиждень: 2 з 5 днів»; null without a weekly goal. */
export function goalText(state: BarState): string | null {
  const dayAt = (key: DayKey): Day => state.days[key] ?? emptyDay(key);
  return goalLine(weekGoal(state.date, state.today, dayAt, state.settings));
}

/**
 * The week line and the date. Neither is a live region (B-02): the bar is
 * drawn anew with the screen, so home says what changed through the announcer.
 */
export function fillBar(host: HTMLElement, state: BarState): void {
  const goal = goalText(state);
  const line = part<HTMLElement>(host, '.bar__goal');
  line.textContent = goal ?? '';
  line.hidden = goal === null;
  const date = part<HTMLElement>(host, '.date-nav__date');
  // without the goal line the date takes header 4 (Olesia, 2026-10-29)
  date.className = `ctl date-nav__date ${goal === null ? 't-h4' : 't-h5'}`;
  date.firstElementChild!.textContent = formatBar(state.date, state.today);
  date.lastElementChild!.textContent = formatLong(state.date);
  part<HTMLButtonElement>(host, '.date-nav [data-step="1"]').disabled = state.date >= state.today;
}

/** «вгору» (Figma button/to-top 288:10620), on home and in the history. */
export const TO_TOP = `
  <button type="button" class="ctl icon-btn icon-btn--primary to-top" aria-label="${t('вгору')}" hidden>${iconSvg('arrow-up')}</button>`;

/**
 * The bar hides on scroll down; «вгору» shows once scrolled. `pinned` keeps the
 * bar out, e.g. while the search panel sits on it.
 */
export function wireScroll(host: HTMLElement, signal: AbortSignal, pinned: () => boolean = () => false): void {
  const bar = part<HTMLElement>(host, '.bar');
  const toTop = part<HTMLButtonElement>(host, '.to-top');
  toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: moving() ? 'smooth' : 'auto' }));
  let lastY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY;
    const shown = barShown({
      y, lastY, maxY: document.documentElement.scrollHeight - innerHeight,
      barFocused: pinned() || keyboardFocusIn(bar), barShown: !bar.classList.contains('bar--hidden'),
    });
    bar.classList.toggle('bar--hidden', !shown);
    fadeShown(toTop, !pinned() && toTopShown(y, shown));
    if (Math.abs(y - lastY) > 6) lastY = y;
  }, { passive: true, signal });
  bar.addEventListener('focusin', () => bar.classList.remove('bar--hidden'), { signal });
}

/**
 * The bar holds a focus someone moves with a keyboard or a switch. A focus
 * given back after a tap (B-01, B-04) shows no ring and doesn't keep the bar out.
 */
function keyboardFocusIn(bar: HTMLElement): boolean {
  try {
    return bar.querySelector(':focus-visible') !== null;
  } catch {
    return bar.contains(document.activeElement);
  }
}

/** Arrows and a swipe on the date go to the day before or after, never past today. */
export function wireDateNav(host: HTMLElement, state: BarState, go: (date: DayKey) => void, signal: AbortSignal): void {
  const step = (days: number) => {
    const next = addDays(state.date, days);
    if (days !== 0 && next <= state.today) go(next);
  };
  for (const button of host.querySelectorAll<HTMLButtonElement>('.date-nav__step')) {
    button.addEventListener('click', () => {
      step(Number(button.dataset.step));
      // B-01: the screen is drawn anew for that day; the focus stays on the same arrow, or the date once it can't go further
      const again = host.querySelector<HTMLButtonElement>(`.date-nav [data-step="${button.dataset.step}"]`);
      (again && !again.disabled ? again : host.querySelector<HTMLElement>('.date-nav__date'))?.focus({ preventScroll: true });
    });
  }
  const dateNav = part<HTMLElement>(host, '.date-nav');
  let start: Point | null = null;
  dateNav.addEventListener('touchstart', (event) => {
    const touch = event.touches[0];
    start = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null;
  }, { passive: true, signal });
  dateNav.addEventListener('touchend', (event) => {
    const touch = event.changedTouches[0];
    if (start && touch) step(swipeDays(start, { x: touch.clientX, y: touch.clientY }));
    start = null;
  }, { passive: true, signal });
}
