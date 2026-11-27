import type { DayKey } from './dates';
import { hasData, hasLap, hasSet, type Answer, type Day, type SetLog } from './day';
import { formatLaps } from './history';
import { formatNumber, plural } from './numbers';
import { kindDone, levelDone, levelsOf } from './progress';
import { MOMENTS, type Moment, type Settings, type Tracker } from './settings';
import { monthName, monthOf, type MonthKey } from './stats';
import { t } from '../i18n/lang';
import { daySummary, hasNumbers, mealLine } from '../food/food';
import { formatHealth, hasHealth, HEALTH_NAME } from '../health/health';

/*
 * The diary read back (stage 6b): what a day card in «історія» shows
 * (Figma history/day-card 234:4872, history/day-block 233:4824), the month
 * line above the calendar (history/period-summary 233:4769) and search in
 * notes (search/panel 210:4110). Rules follow «бета 0.81»'s history.
 */

export const MOMENT_TITLES: Record<Moment, string> = {
  morning: t('самопочуття зранку'),
  afterMorningWarmup: t('самопочуття після ранкової розминки'),
  beforeDaytimeWarmup: t('самопочуття до денної розминки'),
  afterDaytimeWarmup: t('самопочуття після денної розминки'),
  beforeWorkout: t('самопочуття до тренування'),
  afterWorkout: t('самопочуття після тренування'),
  beforeMovement: t('самопочуття до руху'),
  afterMovement: t('самопочуття після руху'),
  evening: t('самопочуття ввечері'),
};

/** From the settings, else a name kept with any of `days` (as 0.81 did). */
export function exerciseName(settings: Settings, days: Iterable<Day>, id: string): string {
  const exercise = settings.exercises.find((x) => x.id === id);
  if (exercise) return exercise.name || t('вправа без назви');
  for (const day of days) {
    const kept = day.names[id];
    if (kept !== undefined) return kept;
  }
  return t('вправа, якої вже немає');
}

export function sessionName(name: string): string {
  return /^тренування/i.test(name) ? name : `${t('тренування')} ${name.toUpperCase()}`;
}

/* ---- sets: «3 × 12 повт. · 10 кг» (COPY.md History) ---- */

const setText = (set: SetLog) => [
  ...(set.r === null ? [] : [`${formatNumber(set.r)} ${t('повт.')}`]),
  ...(set.w === null ? [] : [`${formatNumber(set.w)} ${t('кг')}`]),
  ...(set.s === null ? [] : [`${formatNumber(set.s)} ${t('с')}`]),
].join(' · ');

/** The same set done several times in a row is written once, with «n ×». */
export function formatSetRuns(sets: readonly SetLog[]): string {
  const runs = sets.map(setText).reduce<{ text: string; count: number }[]>((all, text) => {
    const last = all.at(-1);
    return last?.text === text ? [...all.slice(0, -1), { text, count: last.count + 1 }] : [...all, { text, count: 1 }];
  }, []);
  return runs.map(({ text, count }) => (count > 1 ? `${count} × ${text}` : text)).join(', ');
}

/* ---- the line under the date ---- */

/** The last warm-up level done, counted from 1 (not capped, unlike the calendar). */
const levelReached = (day: Day, settings: Settings) =>
  levelsOf(day, settings).reduce((reached, level, i) => (levelDone(day, level) ? i + 1 : reached), 0);

function warmupMeta(day: Day, settings: Settings): string[] {
  if (!settings.morningWarmup.enabled) return [];
  // «розминка» alone only when it is the one warm-up, as in the stat cards (stats.ts)
  const name = settings.daytimeWarmup.enabled ? t('ранкова розминка') : t('розминка');
  const level = levelReached(day, settings);
  if (level) return [`${name}${t(': рівень')} ${level}`];
  return day.mw.ticks.length ? [`${name}${t(': частково')}`] : [];
}

/** «розминка: рівень 2 · тренування · нотатка» */
export function dayMeta(day: Day, settings: Settings): string {
  const parts = [
    ...warmupMeta(day, settings),
    ...(day.dw.length ? [t('денна розминка')] : []),
    ...(kindDone(day, 'workout', settings) ? [t('тренування')] : []),
    ...(kindDone(day, 'movement', settings) ? [t('рух')] : []),
    ...(day.note ? [t('нотатка')] : []),
  ];
  if (parts.length === 0 && Object.keys(day.t).length > 0) parts.push(t('самопочуття'));
  return parts.join(' · ');
}

/* ---- the blocks of an open card ---- */

export interface ValueRow {
  readonly label: string;
  readonly value: string;
  /** Muted after the value (Figma data/value-row `showUnit`). */
  readonly unit: string;
  /** Words someone typed: may wrap. */
  readonly text: boolean;
}

export interface CheckGroup {
  readonly title: string;
  readonly items: readonly { readonly name: string; readonly times: string }[];
}

export type DayBlock =
  | { readonly kind: 'values'; readonly title: string; readonly rows: readonly ValueRow[] }
  | { readonly kind: 'checklist'; readonly title: string; readonly groups: readonly CheckGroup[] }
  | { readonly kind: 'text'; readonly title: string; readonly text: string };

const GONE_QUESTION = t('питання, якого вже немає');

const numbers = (values: readonly (number | null)[]) => values.map((x) => (x === null ? '—' : formatNumber(x))).join('/');

function unitOf(tracker: Tracker | undefined): string {
  if (tracker?.kind === 'number') return tracker.unit;
  if (tracker?.kind !== 'numbers') return '';
  const [a, b] = tracker.units;
  return a === b ? a : `${a}/${b}`;
}

export function answerRow(tracker: Tracker | undefined, answer: Answer): ValueRow {
  const label = tracker ? tracker.name || t('без назви') : GONE_QUESTION;
  const unit = unitOf(tracker);
  if (Array.isArray(answer)) return { label, value: numbers(answer), unit, text: false };
  if (typeof answer === 'number') return { label, value: formatNumber(answer), unit, text: false };
  if (tracker?.kind === 'yesno') return { label, value: answer === 'yes' ? t('так') : t('ні'), unit, text: false };
  return { label, value: String(answer), unit, text: true };
}

function checkIn(day: Day, settings: Settings, moment: Moment): DayBlock[] {
  const answers = Object.entries(day.t[moment] ?? {});
  if (answers.length === 0) return [];
  const rows = answers.map(([id, answer]) => answerRow(settings.trackers.find((t) => t.id === id), answer));
  return [{ kind: 'values', title: MOMENT_TITLES[moment], rows }];
}

const seconds = (times: readonly (number | null)[] = []) =>
  times.filter((x) => x !== null).map((x) => `${formatNumber(x)} ${t('с')}`).join(', ');

/** The ticked warm-up exercises, by level, then those no level has any more. */
export function warmupGroups(day: Day, days: readonly Day[], settings: Settings): CheckGroup[] {
  const ticked = (id: string) => day.mw.ticks.includes(id);
  const item = (id: string) => ({ name: exerciseName(settings, days, id), times: seconds(day.mw.times[id]) });
  const levels = levelsOf(day, settings);
  const groups: CheckGroup[] = levels.flatMap((level, i) => {
    const items = level.items.filter((x) => ticked(x.exercise)).map((x) => item(x.exercise));
    const title = `${level.name || `${t('рівень')} ${i + 1}`}${levelDone(day, level) ? t(' · готово') : ''}`;
    return items.length ? [{ title, items }] : [];
  });
  const inLevels = new Set(levels.flatMap((level) => level.items.map((x) => x.exercise)));
  const other = day.mw.ticks.filter((id) => !inLevels.has(id)).map(item);
  if (other.length) groups.push({ title: t('інші вправи'), items: other });
  return groups;
}

function morningWarmup(day: Day, days: readonly Day[], settings: Settings): DayBlock[] {
  const groups = warmupGroups(day, days, settings);
  return groups.length ? [{ kind: 'checklist', title: t('ранкова розминка'), groups }] : [];
}

/** The daytime warm-up zones done, by name. */
export function zoneNames(day: Day, settings: Settings): string[] {
  return day.dw.map((id) => {
    const group = settings.daytimeWarmup.groups.find((g) => g.id === id);
    return group ? group.name || t('без назви') : t('зона, якої вже немає');
  });
}

function daytimeWarmup(day: Day, settings: Settings): DayBlock[] {
  if (day.dw.length === 0) return [];
  return [{ kind: 'text', title: t('денна розминка'), text: zoneNames(day, settings).join(', ') }];
}

function workout(day: Day, days: readonly Day[], settings: Settings): DayBlock[] {
  if (!day.wo) return [];
  const rows = Object.entries(day.wo.ex).flatMap(([id, sets]) => {
    const filled = sets.filter(hasSet);
    return filled.length ? [{ label: exerciseName(settings, days, id), value: formatSetRuns(filled), unit: '', text: false }] : [];
  });
  if (rows.length === 0) return [];
  const session = settings.workout.sessions.find((s) => s.id === day.wo!.session);
  return [{ kind: 'values', title: session ? sessionName(session.name) : t('тренування'), rows }];
}

function movement(day: Day, settings: Settings): DayBlock[] {
  // a stored kind always has a filled lap (readDay drops the rest)
  const rows = Object.entries(day.mv).map(([id, laps]) => {
    const kind = settings.movement.kinds.find((k) => k.id === id);
    const label = kind ? kind.name || t('без назви') : t('рух, якого вже немає');
    return { label, value: formatLaps(laps.filter(hasLap)), unit: '', text: false };
  });
  // beta 1.1.1: «Здоровʼя» first, as on home
  const health = hasHealth(day.hl) ? [{ label: HEALTH_NAME, value: formatHealth(day.hl), unit: '', text: false }] : [];
  return rows.length || health.length ? [{ kind: 'values', title: t('рух'), rows: [...health, ...rows] }] : [];
}

/** «їжа»: a row per meal, its time and what was in it; the day's sum last (FOOD-SECTION.md). */
function food(day: Day, settings: Settings): DayBlock[] {
  const meals = day.food ?? [];
  if (meals.length === 0) return [];
  const rows: ValueRow[] = meals.map((meal) => ({ label: meal.t, value: mealLine(meal, settings.food) || '—', unit: '', text: false }));
  const sum = settings.food.macros && meals.length > 1 && meals.some(hasNumbers)
    ? [{ label: t('за день'), value: daySummary(meals, settings.food), unit: '', text: false }] : [];
  return [{ kind: 'values', title: t('їжа'), rows: [...rows, ...sum] }];
}

/** Every block of the day in the order it was lived; `days` holds names of deleted exercises. */
export function dayBlocks(day: Day, days: Readonly<Record<DayKey, Day>>, settings: Settings): DayBlock[] {
  const all = [day, ...Object.values(days)];
  const at = (moment: Moment) => checkIn(day, settings, moment);
  return [
    ...at('morning'),
    ...morningWarmup(day, all, settings),
    ...at('afterMorningWarmup'),
    ...at('beforeDaytimeWarmup'),
    ...daytimeWarmup(day, settings),
    ...at('afterDaytimeWarmup'),
    ...at('beforeWorkout'),
    ...workout(day, all, settings),
    ...at('afterWorkout'),
    ...at('beforeMovement'),
    ...movement(day, settings),
    ...at('afterMovement'),
    ...food(day, settings),
    ...at('evening'),
    ...(day.note ? [{ kind: 'text' as const, title: t('нотатка'), text: day.note }] : []),
  ];
}

/* ---- the month ---- */

/** Days of the month with something logged, up to today, newest first. */
export function monthDays(days: Readonly<Record<DayKey, Day>>, month: MonthKey, today: DayKey): DayKey[] {
  return Object.values(days)
    .filter((day) => monthOf(day.date) === month && day.date <= today && hasData(day))
    .map((day) => day.date)
    .sort()
    .reverse();
}

const DAYS = ['день', 'дні', 'днів'] as const;
const WORKOUTS = ['тренування', 'тренування', 'тренувань'] as const;

/** «жовтень: 18 днів з розминкою, 6 тренувань»; only kinds that are on, null with none. */
export function monthSummary(month: MonthKey, today: DayKey, days: readonly Day[], settings: Settings): string | null {
  const shown = days.filter((day) => monthOf(day.date) === month && day.date <= today);
  const count = (kind: 'morningWarmup' | 'workout') => shown.filter((day) => kindDone(day, kind, settings)).length;
  const warmups = count('morningWarmup');
  const workouts = count('workout');
  const parts = [
    ...(settings.morningWarmup.enabled ? [`${warmups} ${plural(warmups, DAYS)} ${t('з розминкою')}`] : []),
    ...(settings.workout.enabled ? [`${workouts} ${plural(workouts, WORKOUTS)}`] : []),
  ];
  return parts.length ? `${monthName(month, today)}: ${parts.join(', ')}` : null;
}

/* ---- search in notes ---- */

export interface SearchHit {
  readonly date: DayKey;
  /** Up to 20 letters before the word, with «…» when cut. */
  readonly before: string;
  readonly match: string;
  /** Up to 80 letters after it. */
  readonly after: string;
}

function noteTexts(day: Day, settings: Settings): string[] {
  const notes = new Set(settings.trackers.filter((t) => t.kind === 'note').map((t) => t.id));
  const answers = MOMENTS.flatMap((moment) => Object.entries(day.t[moment] ?? {}))
    .filter(([id, answer]) => notes.has(id) && typeof answer === 'string')
    .map(([, answer]) => answer as string);
  return [...(day.note ? [day.note] : []), ...answers];
}

/** The day's note and answers to note questions that hold `query`, newest day first. */
export function searchNotes(days: Readonly<Record<DayKey, Day>>, settings: Settings, query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const newest = Object.values(days).sort((a, b) => b.date.localeCompare(a.date));
  return newest.flatMap((day) => noteTexts(day, settings).flatMap((text) => {
    const at = text.toLowerCase().indexOf(q);
    if (at < 0) return [];
    const from = Math.max(0, at - 20);
    return [{
      date: day.date,
      before: `${from > 0 ? '…' : ''}${text.slice(from, at)}`,
      match: text.slice(at, at + q.length),
      after: text.slice(at + q.length, at + q.length + 80),
    }];
  }));
}
