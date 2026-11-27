import { addDays, type DayKey } from './dates';
import { hasData, type Answer, type Day } from './day';
import { kindDone } from './progress';
import { MOMENTS, type ActivityKind, type Moment, type Settings, type Tracker } from './settings';
import { MOMENT_SHORT } from './stats';
import { t } from '../i18n/lang';
import { healthAverages, HEALTH_NAME } from '../health/health';
import { foodCards, type FoodCard } from '../food/food-cards';

/*
 * The carousel «середнє за 7 днів» (wave 9, Olesia 2026-11-18; FIXES-PLAN
 * «Хвиля 9» and «Рішення за макетом»): one card per question, notes left out.
 * - a slider or a number: the average per moment it is asked, and a chart
 *   with a line per moment (the first 5 with answers), a point per day; over
 *   31 days a point per week. A day without an answer breaks the line;
 * - two numbers (blood pressure): every record, newest last;
 * - yes / no: «так у 3 з 20 ранкових розминок» per moment (2026-11-27; was «з 6 записів»);
 * - no answers at all: «записів немає».
 * No DOM here: home/carousel.ts draws it.
 */

/** At most this many lines on a chart (Olesia: «щоб не було каші»). */
export const MAX_LINES = 5;
/** Up to this many days a point is a day; over it, a week. */
export const DAILY_UP_TO = 31;

/** `moment` is missing on the card «зі Здоровʼя», whose rows are steps and km. */
export interface AverageRow { readonly moment?: Moment; readonly label: string; readonly value: number | null }
/** What a yes / no answer is counted out of: the days with an activity done, or all days. */
export type YesNoOf = ActivityKind | 'day';
export interface YesNoRow { readonly label: string; readonly yes: number; readonly total: number; readonly of: YesNoOf }
export interface PairEntry { readonly date: DayKey; readonly label: string; readonly a: number | null; readonly b: number | null }

export interface ChartLine { readonly label: string; readonly points: readonly (number | null)[] }

export interface Chart {
  /** One per point: the day, or the first day of the week. */
  readonly starts: readonly DayKey[];
  /** The last day counted, for the label at the end of the axis. */
  readonly end: DayKey;
  readonly weekly: boolean;
  readonly min: number;
  readonly max: number;
  readonly lines: readonly ChartLine[];
}

interface CardBase { readonly id: string; readonly name: string }

export type TrackerCard = CardBase & (
  | { readonly kind: 'empty' }
  | { readonly kind: 'averages'; readonly rows: readonly AverageRow[]; readonly chart: Chart | null }
  | { readonly kind: 'pairs'; readonly entries: readonly PairEntry[]; readonly units: readonly [string, string] }
  | { readonly kind: 'yesno'; readonly rows: readonly YesNoRow[] }
) | FoodCard;

const round = (value: number) => Math.round(value * 10) / 10;
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

const answerAt = (day: Day, moment: Moment, tracker: Tracker): Answer | undefined => day.t[moment]?.[tracker.id];

function numbersAt(days: readonly Day[], moment: Moment, tracker: Tracker): number[] {
  return days.map((day) => answerAt(day, moment, tracker)).filter((value): value is number => typeof value === 'number');
}

/** Points of the chart: each day, or each 7 days from the first one. */
function buckets(keys: readonly DayKey[]): DayKey[][] {
  if (keys.length <= DAILY_UP_TO) return keys.map((key) => [key]);
  return Array.from({ length: Math.ceil(keys.length / 7) }, (_, i) => keys.slice(i * 7, i * 7 + 7));
}

/** A number's scale: from the data, to whole fives, so the lines don't sit on the edges. */
function numberRange(values: readonly number[]): [number, number] {
  const min = Math.floor(Math.min(...values) / 5) * 5;
  const max = Math.ceil(Math.max(...values) / 5) * 5;
  return [min, max === min ? min + 5 : max];
}

function chartOf(tracker: Tracker, moments: readonly Moment[], keys: readonly DayKey[], dayAt: (key: DayKey) => Day): Chart | null {
  if (keys.length === 0) return null;
  const groups = buckets(keys);
  const lines = moments.slice(0, MAX_LINES).map((moment) => ({
    label: MOMENT_SHORT[moment],
    points: groups.map((group) => {
      const values = numbersAt(group.map(dayAt), moment, tracker);
      return values.length ? round(mean(values)) : null;
    }),
  }));
  const all = lines.flatMap((line) => line.points).filter((value): value is number => value !== null);
  if (all.length === 0) return null;
  const [min, max] = tracker.kind === 'scale' ? [tracker.min, tracker.max] : numberRange(all);
  return { starts: groups.map((group) => group[0]!), end: keys[keys.length - 1]!, weekly: groups.length !== keys.length, min, max, lines };
}

/** The activity a moment comes with; morning and evening come every day. */
const MOMENT_KIND: Record<Moment, YesNoOf> = {
  morning: 'day',
  afterMorningWarmup: 'morningWarmup',
  beforeDaytimeWarmup: 'daytimeWarmup',
  afterDaytimeWarmup: 'daytimeWarmup',
  beforeWorkout: 'workout',
  afterWorkout: 'workout',
  beforeMovement: 'movement',
  afterMovement: 'movement',
  evening: 'day',
};

/**
 * A yes / no question is a checkbox on home: «yes» is ticked, «no» is never stored. So it counts out
 * of the times the moment came (the days with that activity done; for morning and evening, the days
 * with anything logged), not out of the answers (Olesia, 2026-11-27: «так у 3 з 3» when there were 20 warm-ups).
 */
function yesNoCard(base: CardBase, tracker: Tracker, asked: readonly Moment[], days: readonly Day[], settings: Settings): TrackerCard {
  const rows = asked.flatMap((moment) => {
    const of = MOMENT_KIND[moment];
    const came = days.filter((day) => answerAt(day, moment, tracker) !== undefined || (of === 'day' ? hasData(day) : kindDone(day, of, settings)));
    if (came.length === 0) return [];
    const yes = came.filter((day) => answerAt(day, moment, tracker) === 'yes').length;
    return [{ label: MOMENT_SHORT[moment], yes, total: came.length, of }];
  });
  return rows.length ? { ...base, kind: 'yesno', rows } : { ...base, kind: 'empty' };
}

function card(tracker: Tracker, keys: readonly DayKey[], dayAt: (key: DayKey) => Day, settings: Settings): TrackerCard {
  const base = { id: tracker.id, name: tracker.name || t('без назви') };
  const days = keys.map(dayAt);
  const asked = MOMENTS.filter((moment) => tracker.ask.includes(moment));
  if (tracker.kind === 'yesno') return yesNoCard(base, tracker, asked, days, settings);
  const answered = asked.filter((moment) => days.some((day) => answerAt(day, moment, tracker) !== undefined));
  if (answered.length === 0) return { ...base, kind: 'empty' };

  if (tracker.kind === 'numbers') {
    const entries = keys.flatMap((date) => answered.flatMap((moment) => {
      const value = answerAt(dayAt(date), moment, tracker);
      if (!Array.isArray(value)) return [];
      const [a = null, b = null] = value as readonly (number | null)[];
      return [{ date, label: MOMENT_SHORT[moment], a, b }];
    }));
    return entries.length ? { ...base, kind: 'pairs', entries, units: tracker.units } : { ...base, kind: 'empty' };
  }
  // a slider or a number
  const rows = asked.map((moment) => {
    const values = numbersAt(days, moment, tracker);
    return { moment, label: MOMENT_SHORT[moment], value: values.length ? round(mean(values)) : null };
  });
  if (rows.every((row) => row.value === null)) return { ...base, kind: 'empty' };
  const withData = rows.filter((row) => row.value !== null).map((row) => row.moment!);
  return { ...base, kind: 'averages', rows, chart: chartOf(tracker, withData, keys, dayAt) };
}

/**
 * Beta 1.1.1 (HEALTH-IMPORT.md, A5): average steps and km from «Здоровʼя»
 * over the days that have them; no card when none of the days has any.
 */
function healthCard(keys: readonly DayKey[], dayAt: (key: DayKey) => Day): TrackerCard[] {
  const { steps, km } = healthAverages(keys, dayAt);
  if (steps === null && km === null) return [];
  return [{ id: 'health', name: HEALTH_NAME, kind: 'averages', rows: [{ label: t('кроки'), value: steps }, { label: t('км'), value: km }], chart: null }];
}

/** A card for every question but the notes, in the order of the settings; «зі Здоровʼя», then «їжа» last. */
export function trackerCards(keys: readonly DayKey[], dayAt: (key: DayKey) => Day, settings: Settings): TrackerCard[] {
  return [
    ...settings.trackers.filter((tracker) => tracker.kind !== 'note').map((tracker) => card(tracker, keys, dayAt, settings)),
    ...healthCard(keys, dayAt),
    ...foodCards(keys, dayAt, settings.food),
  ];
}

/** The day shown and the six before it, oldest first: the points of the chart on home. */
export function weekTo(date: DayKey): DayKey[] {
  return [6, 5, 4, 3, 2, 1, 0].map((n) => addDays(date, -n));
}
