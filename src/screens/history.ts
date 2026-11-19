import { formatLong, type DayKey } from '../domain/dates';
import { emptyDay, hasData, type Day } from '../domain/day';
import type { Diary } from '../domain/diary';
import { dayBlocks, dayMeta, monthDays, monthSummary, searchNotes, type DayBlock, type ValueRow } from '../domain/journal';
import { weekGoal } from '../domain/progress';
import type { Settings } from '../domain/settings';
import { monthOf, shiftMonth, type MonthKey } from '../domain/stats';
import { calendarMarkup, PERIOD_TIP, periodName, type Period, type Picking } from '../home/calendar';
import { mountCarousels, wireCarousels, type CarouselMemory } from '../home/carousel';
import { wireMonthSwipe } from '../home/month-swipe';
import type { TipMemory } from '../storage/store';
import { announce } from '../ui/announce';
import { goalLine } from '../home/home-view';
import { wireAccordions } from '../ui/accordion';
import { esc } from '../ui/html';
import { emoticonsHtml } from '../ui/emoticons';
import { iconSvg } from '../ui/icons';
import { smallUnits } from '../ui/units';
import type { ToastMessage } from '../ui/toast';
import { pagesBarMarkup, TO_TOP, wirePagesBar, wireScroll } from './bar';
import { FOOTER, part } from './parts';
import { openSearch } from './search';

/*
 * «історія» (Figma screen/log-history 165:2758): the week line and the month
 * line (history/period-summary 233:4769), the calendar block as on home, but
 * counting the month open or the period chosen (wave 9: the cards and the
 * carousel of averages, which took the place of «середнє за період»), the day cards
 * (history/day-card 234:4872), the footer and the bar ≡ 🔍 ✕. 🔍 opens the
 * search panel over the bar. Behaviour as in «бета 0.81»; texts: COPY.md «History».
 */

export interface HistoryState {
  readonly settings: Settings;
  readonly days: Diary['days'];
  readonly today: DayKey;
  /** The day home shows: its week and month open first. */
  readonly date: DayKey;
  /** Open with the search panel (menu → «пошук у нотатках», 🔍 on other pages). */
  readonly search: boolean;
}

export interface HistoryActions {
  menu(): void;
  close(): void;
  /** Home on that day. */
  goTo(date: DayKey): void;
  toast(message: ToastMessage): void;
  /** Tips for newcomers: the long tap that chooses a period (wave 9). */
  tips?: TipMemory | undefined;
}

/* «бета 0.81»'s words for a calendar day with nothing in it. */
const NO_RECORDS: ToastMessage = { message: 'за цей день записів немає' };

/* ---- one day card ---- */

function valueRow({ label, value, unit, text }: ValueRow): string {
  return `
      <li class="value-row${text ? ' value-row--text' : ''}"><span class="value-row__label t-2nd-regular">${esc(label)}</span><span class="muted" aria-hidden="true">·</span>${
  text ? `<span class="value-row__text t-2nd-regular">${esc(value)}</span>` : `<b class="value-row__value t-1st-bold">${smallUnits(esc(value))}</b>`
}${unit ? `<span class="value-row__unit t-3rd-regular muted">${esc(unit)}</span>` : ''}</li>`;
}

function blockBody(block: DayBlock): string {
  if (block.kind === 'text') return `<p class="day-block__text t-2nd-regular">${esc(block.text)}</p>`;
  if (block.kind === 'values') return `<ul class="day-block__rows" role="list">${block.rows.map(valueRow).join('')}</ul>`;
  return block.groups.map((group) => `
      <p class="day-block__group t-2nd-bold">${esc(group.title)}</p>
      <ul class="day-block__checks" role="list">${group.items.map(({ name, times }) => `
        <li class="day-check t-1st-semibold"><span class="checkbox__box day-check__box" aria-hidden="true"></span><span>${esc(name)}${
  times ? ` <span class="t-3rd-regular muted">· ${esc(times)}</span>` : ''}</span></li>`).join('')}</ul>`).join('');
}

const block = (item: DayBlock) => `
    <section class="day-block">
      <h3 class="day-block__title t-h6">${esc(item.title)}</h3>
      ${blockBody(item)}
    </section>`;

function card(day: Day, open: boolean, state: HistoryState): string {
  const id = `card-${day.date}`;
  return `
  <article class="day-card" id="${id}">
    <h2 class="day-card__heading">
      <button type="button" class="ctl accordion accordion--group day-card__trigger" data-card="${day.date}" aria-expanded="${open}" aria-controls="${id}-body">
        <span class="accordion__title">${formatLong(day.date)}</span><span class="accordion__icon">${iconSvg(open ? 'remove' : 'add')}</span>
        <span class="accordion__meta">${esc(dayMeta(day, state.settings))}</span>
      </button>
    </h2>
    <div class="day-card__body" id="${id}-body"${open ? '' : ' hidden'}>
      ${dayBlocks(day, state.days, state.settings).map(block).join('')}
      <button type="button" class="ctl btn btn--tertiary day-card__edit" data-edit="${day.date}">редагувати цей день</button>
    </div>
  </article>`;
}

/* ---- the screen ---- */

interface View {
  date: DayKey;
  month: MonthKey;
  open: Set<DayKey>;
  /** Wave 9: the period chosen, and the choosing under way. */
  period: Period | null;
  picking: Picking | null;
  readonly carousel: CarouselMemory;
  /** The tip was hidden by a tap; it comes back when the history is opened again. */
  tipQuiet: boolean;
}

/**
 * A-11: where the history was when it gave the screen to a day opened from
 * it, so «назад» brings back the same month, the same open cards and scroll.
 */
export interface HistoryMemory {
  view?: View;
  y?: number;
}

/** The first card of a month is open (0.81). */
const firstOpen = (state: HistoryState, month: MonthKey) => new Set(monthDays(state.days, month, state.today).slice(0, 1));

function content(state: HistoryState, view: View, tips: TipMemory | undefined): string {
  const dayAt = (key: DayKey): Day => state.days[key] ?? emptyDay(key);
  const goal = goalLine(weekGoal(view.date, state.today, dayAt, state.settings));
  const summary = monthSummary(view.month, state.today, Object.values(state.days), state.settings);
  const keys = monthDays(state.days, view.month, state.today);
  const calendar = calendarMarkup({
    settings: state.settings, date: view.date, today: state.today, month: view.month, dayAt, place: 'history',
    card: view.carousel.card, period: view.period, picking: view.picking, periodTip: !view.tipQuiet && (tips?.open(PERIOD_TIP) ?? false),
  });
  return `
    <section class="screen__section history__period" aria-label="період">
      <div class="history__lines">
        ${goal === null ? '' : `<p class="history__goal t-3rd-bold">${goal}</p>`}
        ${summary === null ? '' : `<p class="history__summary t-3rd-regular">${summary}</p>`}
      </div>
    </section>
    <section class="cal-block" data-place="history" aria-label="календар">${calendar}</section>
    <section class="history__days" aria-label="дні">
      ${keys.length
    ? keys.map((key) => card(dayAt(key), view.open.has(key), state)).join('')
    : `<p class="history__empty t-2nd-regular muted">${emoticonsHtml('цього місяця записів немає. зате попереду ще купа днів :3')}</p>`}
    </section>`;
}

/** Shows the history; returns what to undo when another screen takes its place. */
export function showHistory(host: HTMLElement, state: HistoryState, actions: HistoryActions, memory: HistoryMemory = {}): () => void {
  const view: View = memory.view ?? {
    date: state.date, month: monthOf(state.date), open: firstOpen(state, monthOf(state.date)), period: null, picking: null, carousel: { card: 0 }, tipQuiet: false,
  };
  const listeners = new AbortController();
  host.innerHTML = `
    <div class="screen page history">
      <section class="screen__section" aria-labelledby="page-title">
        <h1 id="page-title" class="t-h3">історія</h1>
      </section>
      <div class="history__content"></div>
      ${FOOTER}
    </div>
    ${pagesBarMarkup(false)}${TO_TOP}`;
  const root = part<HTMLElement>(host, '.history__content');
  const render = () => {
    root.innerHTML = content(state, view, actions.tips);
    mountCarousels(root, view.carousel);
  };
  const focus = (selector: string) => root.querySelector<HTMLElement>(selector)!.focus({ preventScroll: true });

  function showDay(date: DayKey): void {
    view.date = date;
    if (!hasData(state.days[date] ?? emptyDay(date))) {
      render();
      focus(`[data-cal="day"][data-day="${date}"]`);
      actions.toast(NO_RECORDS);
      return;
    }
    view.open.add(date);
    render();
    focus(`[data-card="${date}"]`);
    root.querySelector(`#card-${date}`)!.scrollIntoView?.({ block: 'start' });
  }

  function showMonth(by: string): void {
    turnMonth(Number(by));
    focus(`[data-cal="month"][data-by="${by}"]`);
  }

  /** The month `by` away (arrows and the swipe); returns the calendar drawn. */
  function turnMonth(by: number): HTMLElement | null {
    view.month = shiftMonth(view.month, by);
    view.open = firstOpen(state, view.month);
    render();
    return root.querySelector<HTMLElement>('.cal-block');
  }

  /* ---- «обрати період» (wave 9): the button or a long tap on the first day, then a tap on the last ---- */

  function choose(date: DayKey): void {
    view.picking = { from: date };
    render();
    focus(`[data-cal="day"][data-day="${date}"]`);
  }

  function finish(date: DayKey): void {
    const [from, to] = [view.picking?.from ?? date, date].sort() as [DayKey, DayKey];
    view.period = { from, to };
    view.picking = null;
    actions.tips?.succeed?.(PERIOD_TIP);
    render();
    focus('[data-cal="period-reset"]');
    announce(`обрано період ${periodName(view.period)}`);
  }

  function tapDay(date: DayKey): void {
    if (!view.picking) showDay(date);
    else if (view.picking.from === null) choose(date);
    else finish(date);
  }

  function holdDay(date: DayKey): void {
    if (view.picking?.from) finish(date);
    else choose(date);
  }

  function periodButton(action: string): void {
    if (action === 'period-pick') {
      view.picking = { from: null };
      render();
      (root.querySelector<HTMLElement>('[data-cal="day"][aria-current="date"]') ?? root.querySelector<HTMLElement>('[data-cal="day"]'))?.focus({ preventScroll: true });
      return;
    }
    view.picking = null;
    if (action === 'period-reset') {
      view.period = null;
      announce('період скинуто');
    }
    render();
    focus('[data-cal="period-pick"]');
  }

  const held = holdOnDays(root, holdDay, listeners.signal);
  root.addEventListener('click', (event) => {
    if (held()) return;
    onTap(actions.goTo, tapDay, showMonth, periodButton)(event);
  });
  wireCarousels(root, view.carousel, listeners.signal);
  wireMonthSwipe(root, (_block, by) => turnMonth(by), listeners.signal);
  // the tip is a bubble that a tap anywhere hides (as on home, wave 5c)
  const hush = () => {
    const bubble = root.querySelector('.tip');
    if (!bubble) return;
    view.tipQuiet = true;
    bubble.closest('.tip-anchor')?.remove();
  };
  document.addEventListener('pointerdown', hush, { capture: true, signal: listeners.signal });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hush();
  }, { signal: listeners.signal });
  wireAccordions(root, (trigger, open) => {
    const date = trigger.dataset.card as DayKey;
    if (open) view.open.add(date);
    else view.open.delete(date);
  });

  const search = searchSwitch(host, state, actions.goTo);
  wirePagesBar(host, { menu: actions.menu, close: actions.close, search: search.toggle });

  wireScroll(host, listeners.signal, search.isOpen);
  render();
  if (state.search) search.toggle();
  return () => {
    listeners.abort();
    memory.view = view;
    memory.y = scrollY;
  };
}

/** Days and arrows of the calendar, the period's buttons, «редагувати цей день». */
function onTap(edit: (date: DayKey) => void, day: (date: DayKey) => void, month: (by: string) => void, period: (action: string) => void) {
  return (event: Event) => {
    const target = (event.target as Element).closest<HTMLElement>('[data-cal], [data-edit]');
    if (!target) return;
    if (target.dataset.edit) edit(target.dataset.edit as DayKey);
    else if (target.dataset.cal === 'day') day(target.dataset.day as DayKey);
    else if (target.dataset.cal === 'month') month(String(target.dataset.by));
    else period(String(target.dataset.cal));
  };
}

/** How long a finger stays on a day before it starts a period. */
export const HOLD_MS = 500;

/**
 * A long tap on a day (wave 9): the finger stays still for HOLD_MS. The
 * phone's own long-press menu doesn't open on the days. Returns whether the
 * click that follows a long tap is to be swallowed.
 */
function holdOnDays(root: HTMLElement, hold: (date: DayKey) => void, signal: AbortSignal): () => boolean {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number } | null = null;
  let fired = false;
  const stop = () => {
    clearTimeout(timer);
    start = null;
  };
  root.addEventListener('pointerdown', (event) => {
    const day = (event.target as Element).closest<HTMLElement>('[data-cal="day"]');
    fired = false;
    if (!day) return;
    start = { x: event.clientX, y: event.clientY };
    timer = setTimeout(() => {
      start = null;
      fired = true;
      hold(day.dataset.day as DayKey);
    }, HOLD_MS);
  }, { signal });
  root.addEventListener('pointermove', (event) => {
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) stop();
  }, { signal });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) root.addEventListener(type, stop, { signal });
  root.addEventListener('contextmenu', (event) => {
    if ((event.target as Element).closest('[data-cal="day"]')) event.preventDefault();
  }, { signal });
  return () => {
    const was = fired;
    fired = false;
    return was;
  };
}

/** search/panel over the bar: 🔍 opens and closes it and shows which it is. */
function searchSwitch(host: HTMLElement, state: HistoryState, pick: (date: DayKey) => void) {
  const button = part<HTMLButtonElement>(host, '.bar__search');
  let close: (() => void) | null = null;
  const closed = () => {
    close = null;
    button.setAttribute('aria-pressed', 'false');
    button.focus();
  };
  return {
    isOpen: () => close !== null,
    toggle(): void {
      if (close) {
        close();
        return;
      }
      button.setAttribute('aria-pressed', 'true');
      close = openSearch(host, { find: (query) => searchNotes(state.days, state.settings, query), pick, closed });
    },
  };
}
