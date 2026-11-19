import { trackerCards, weekTo } from '../domain/cards';
import { formatLong, type DayKey } from '../domain/dates';
import type { Day } from '../domain/day';
import { plural } from '../domain/numbers';
import {
  dayMarks, daysFrom, MAX_DOTS, monthCells, monthName, monthOf, periodStats, weekStats, type DayMarks, type MonthKey, type WeekStat,
} from '../domain/stats';
import type { Settings } from '../domain/settings';
import { tip } from './sections';
import { carouselMarkup, daysCount } from './carousel';
import { iconSvg } from '../ui/icons';

/*
 * The calendar block (Figma `calendar/month` 131:2314, `calendar/stat-card`,
 * `calendar/legend`, `calendar/day` 131:1588), as HTML: on home under the
 * sections, in the sheet from the date (`example/home-calendar-sheet`) and in
 * the history. No scene next to the month (removed in Figma, Olesia 2026-11-08).
 * Days and arrows say what they do in data-cal; the screens listen.
 *
 * Wave 9 (Olesia, 2026-11-18; FIXES-PLAN «Хвиля 9», «Рішення за макетом»):
 * - a day's marks are shapes: dots under the number for morning levels done,
 *   above it for daytime groups (a number from 6), movement left of the number
 *   and workout right of it; today is a faint accent, the day shown a frame;
 * - «середнє за 7 днів» is a carousel (home/carousel.ts);
 * - in the history the week cards and the carousel count the month open, or
 *   the period chosen there («обрати період» or a long tap on a day).
 */

/** A period chosen in the history, both days included. */
export interface Period { readonly from: DayKey; readonly to: DayKey }

/** Choosing a period: nothing tapped yet, or its first day. */
export interface Picking { readonly from: DayKey | null }

export interface CalendarView {
  readonly settings: Settings;
  readonly date: DayKey;
  readonly today: DayKey;
  readonly month: MonthKey;
  readonly dayAt: (key: DayKey) => Day;
  /** Tells the copies apart (home, sheet, history) for their heading ids. */
  readonly place: string;
  /** The card the carousel shows. */
  readonly card?: number;
  /** History only: the period chosen, and the choosing under way. */
  readonly period?: Period | null;
  readonly picking?: Picking | null;
  /** History only: the tip about the long tap under «обрати період». */
  readonly periodTip?: boolean;
}

/** «12.11» */
const dayMonth = (key: DayKey) => `${key.slice(8)}.${key.slice(5, 7)}`;
export const periodName = (period: Period) => `${dayMonth(period.from)}–${dayMonth(period.to)}`;

/** «з 1 дня», «з 5 днів»: the genitive after «з». */
const days = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'дня' : 'днів');

function statCard({ label, done, target }: WeekStat, of: string): string {
  const goal = of ? ` <span class="stat__goal t-3rd-regular">${of}</span>` : target > 0 ? ` <span class="stat__goal t-3rd-regular">з ${target} ${days(target)}</span>` : '';
  return `
    <li class="stat">
      <span class="stat__label t-3rd-semibold">${label}</span>
      <span class="stat__value"><b class="t-1st-bold">${done}</b>${goal}</span>
    </li>`;
}

/** What the cards and the carousel count: on home this week and 7 days; in the history the month or the period. */
interface Scope {
  readonly stats: WeekStat[];
  readonly statsHeading: string;
  /** «за 18 днів» instead of the weekly target; empty on home. */
  readonly of: string;
  readonly keys: readonly DayKey[];
  readonly averagesHeading: string;
}

function scope(view: CalendarView): Scope {
  if (view.place !== 'history') {
    return {
      stats: weekStats(view.date, view.today, view.dayAt, view.settings),
      statsHeading: 'цей тиждень',
      of: '',
      keys: weekTo(view.date),
      averagesHeading: 'середнє за 7 днів',
    };
  }
  const keys = view.period
    ? daysFrom(view.period.from, view.period.to)
    : monthCells(view.month).filter((cell) => cell.inMonth && cell.key <= view.today).map((cell) => cell.key);
  const name = view.period ? periodName(view.period) : monthName(view.month, view.today);
  return {
    stats: periodStats(keys, view.dayAt, view.settings),
    statsHeading: `за ${name}`,
    of: `за ${daysCount(keys.length)}`,
    keys,
    averagesHeading: `середнє за ${name}`,
  };
}

function summary(view: CalendarView): string {
  const counted = scope(view);
  const week = counted.stats.length
    ? `<h3 class="t-h5">${counted.statsHeading}</h3><ul class="stats" role="list">${counted.stats.map((stat) => statCard(stat, counted.of)).join('')}</ul>`
    : '';
  const cards = trackerCards(counted.keys, view.dayAt, view.settings);
  return week + carouselMarkup(cards, counted.averagesHeading, `avg-${view.place}`, view.card ?? 0);
}

/* ---- the month ---- */

const dots = (n: number) => (n > MAX_DOTS ? `<b class="cal-day__count">${n}</b>` : '<i></i>'.repeat(n));

function legend(view: CalendarView): string {
  const { settings } = view;
  const sample = (where: string, n: number) => `<span class="legend__key legend__key--${where}" aria-hidden="true">${'<i></i>'.repeat(n)}</span>`;
  const items = [
    ...(settings.morningWarmup.enabled ? [`<li>${sample('bottom', 3)}під числом: виконані рівні ранкової розминки, з ${MAX_DOTS + 1} — число</li>`] : []),
    ...(settings.daytimeWarmup.enabled ? [`<li>${sample('top', 2)}над числом: виконані групи денної розминки</li>`] : []),
    ...(settings.workout.enabled ? ['<li><span class="legend__key"><span class="marker marker--workout" aria-hidden="true"></span></span>тренування</li>'] : []),
    ...(settings.movement.enabled ? ['<li><span class="legend__key"><span class="marker marker--movement" aria-hidden="true"></span></span>рух</li>'] : []),
    ...(view.period ? ['<li><span class="legend__key legend__key--period" aria-hidden="true"></span>обраний період</li>'] : []),
  ];
  return `<ul class="legend t-3rd-regular" role="list" aria-label="позначки">${items.join('')}</ul>`;
}

const LEVELS = ['рівень', 'рівні', 'рівнів'] as const;
const GROUPS = ['група', 'групи', 'груп'] as const;

function dayLabel(key: DayKey, marks: DayMarks, inPeriod: boolean): string {
  return [
    formatLong(key),
    ...(marks.morning ? [`ранкова розминка: ${marks.morning} ${plural(marks.morning, LEVELS)}`] : []),
    ...(marks.daytime ? [`денна розминка: ${marks.daytime} ${plural(marks.daytime, GROUPS)}`] : []),
    ...(marks.workout ? ['тренування'] : []),
    ...(marks.movement ? ['рух'] : []),
    ...(inPeriod ? ['у періоді'] : []),
  ].join(', ');
}

function inPeriod(view: CalendarView, key: DayKey): boolean {
  if (view.period) return key >= view.period.from && key <= view.period.to;
  return view.picking?.from === key;
}

function dayCell(view: CalendarView, key: DayKey, inMonth: boolean): string {
  const number = String(Number(key.slice(8)));
  if (!inMonth) return `<span class="cal-day cal-day--out" aria-hidden="true">${number}</span>`;
  if (key > view.today) return `<span class="cal-day cal-day--future" aria-hidden="true">${number}</span>`;
  const marks = dayMarks(view.dayAt(key), view.settings);
  const chosen = inPeriod(view, key);
  const classes = [
    'cal-day',
    ...(key === view.today ? ['cal-day--today'] : []),
    ...(key === view.date ? ['cal-day--shown'] : []),
    ...(chosen ? ['cal-day--period'] : []),
  ];
  const inside = [
    marks.daytime ? `<span class="cal-day__dots cal-day__dots--top" aria-hidden="true">${dots(marks.daytime)}</span>` : '',
    `<span class="cal-day__n">${number}</span>`,
    marks.morning ? `<span class="cal-day__dots cal-day__dots--bottom" aria-hidden="true">${dots(marks.morning)}</span>` : '',
    marks.movement ? '<span class="cal-day__mark cal-day__mark--movement" aria-hidden="true"></span>' : '',
    marks.workout ? '<span class="cal-day__mark cal-day__mark--workout" aria-hidden="true"></span>' : '',
  ].join('');
  return `<button type="button" class="ctl ${classes.join(' ')}" data-cal="day" data-day="${key}" aria-label="${dayLabel(key, marks, chosen)}"${
    key === view.date ? ' aria-current="date"' : ''}>${inside}</button>`;
}

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд'];
/** The most weeks a month spans. */
const WEEKS = 6;

/** The tip about the long tap; it stops after three periods chosen. */
export const PERIOD_TIP = 'period';
const PERIOD_TIP_TEXT = 'швидше: затисни перший день періоду, а потім натисни останній.';

/** History only: «обрати період», what to tap while choosing, the period and «скинути період». */
function periodRow(view: CalendarView): string {
  if (view.place !== 'history') return '';
  if (view.picking) {
    const says = view.picking.from ? `від ${dayMonth(view.picking.from)}: натисни останній день` : 'натисни перший день періоду';
    return `<div class="cal__period"><p class="t-2nd-regular" role="status">${says}</p><button type="button" class="ctl btn btn--tertiary" data-cal="period-cancel">скасувати</button></div>`;
  }
  if (view.period) {
    return `<div class="cal__period"><p class="t-2nd-regular">період ${periodName(view.period)}</p><button type="button" class="ctl btn btn--tertiary" data-cal="period-reset">скинути період</button></div>`;
  }
  return `<div class="cal__period"><button type="button" class="ctl btn btn--tertiary" data-cal="period-pick">обрати період</button>${
    view.periodTip ? tip(PERIOD_TIP, PERIOD_TIP_TEXT) : ''}</div>`;
}

function month(view: CalendarView): string {
  const heading = `cal-${view.place}-month`;
  const days = monthCells(view.month);
  // every month takes six weeks of room, so the page doesn't jump when a 5-week month follows a 6-week one (Olesia, 2026-11-18: the last row empty)
  const cells = days.map(({ key, inMonth }) => dayCell(view, key, inMonth)).join('')
    + '<span class="cal-day cal-day--blank" aria-hidden="true"></span>'.repeat(Math.max(0, WEEKS * 7 - days.length));
  const last = view.month >= monthOf(view.today);
  return `
    <h3 class="t-h5 cal__month" id="${heading}">${monthName(view.month, view.today)}</h3>
    <div class="cal${view.picking ? ' cal--picking' : ''}">
      <div class="cal__body">
        <div class="cal__scroll">
          <div class="cal__weekdays t-3rd-semibold" aria-hidden="true">${WEEKDAYS.map((day) => `<span>${day}</span>`).join('')}</div>
          <div class="cal__grid" role="group" aria-labelledby="${heading}">${cells}</div>
        </div>
        <div class="cal__nav">
          <button type="button" class="ctl icon-btn icon-btn--secondary" data-cal="month" data-by="-1" aria-label="попередній місяць">${iconSvg('chevron-left')}</button>
          <button type="button" class="ctl icon-btn icon-btn--secondary" data-cal="month" data-by="1" aria-label="наступний місяць"${last ? ' disabled' : ''}>${iconSvg('chevron-right')}</button>
        </div>
      </div>
      <div class="cal__info">${legend(view)}</div>
      ${periodRow(view)}
    </div>`;
}

/** The whole block: this week, the averages, the month. */
export function calendarMarkup(view: CalendarView): string {
  return summary(view) + month(view);
}
