import { addDays, mondayOf, type DayKey } from './dates';
import type { Day } from './day';
import { plural } from './numbers';
import { kindDone, levelDone, levelsOf, weekSoFar } from './progress';
import { ACTIVITY_KINDS, MOMENTS, type ActivityKind, type Moment, type Settings } from './settings';
import { t } from '../i18n/lang';

/*
 * The calendar block (Figma `calendar/month` 131:2314): «цей тиждень»,
 * «середнє за 7 днів» and the month. Rules from «бета 0.81»: each kind counts
 * on its own, Monday to today. Since wave 9 (Olesia, 2026-11-18) a day shows
 * dots for warm-ups and markers for workout and movement, and the averages
 * are a carousel of cards (domain/cards.ts).
 */

export interface WeekStat {
  readonly kind: ActivityKind;
  readonly label: string;
  readonly done: number;
  /** Days a week the person aims for; 0 shows the number alone. */
  readonly target: number;
}

/** Figma names the morning warm-up «розминка»; with both warm-ups on they need their full names. */
function kindLabel(kind: ActivityKind, settings: Settings): string {
  const bothWarmups = settings.morningWarmup.enabled && settings.daytimeWarmup.enabled;
  const labels: Record<ActivityKind, string> = {
    morningWarmup: bothWarmups ? t('ранкова розминка') : t('розминка'),
    daytimeWarmup: bothWarmups ? t('денна розминка') : t('розминка'),
    workout: t('тренування'),
    movement: t('рух'),
  };
  return labels[kind];
}

export function weekStats(date: DayKey, today: DayKey, dayAt: (key: DayKey) => Day, settings: Settings): WeekStat[] {
  const week = weekSoFar(date, today).map(dayAt);
  return ACTIVITY_KINDS.filter((kind) => settings[kind].enabled).map((kind) => ({
    kind,
    label: kindLabel(kind, settings),
    done: week.filter((day) => kindDone(day, kind, settings)).length,
    target: settings[kind].weeklyTarget,
  }));
}

/** The day shown and the six before it (0.81 `last7`). */
export function lastSevenDays(date: DayKey, today: DayKey): DayKey[] {
  return [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(date, -n)).filter((key) => key <= today);
}

export const MOMENT_SHORT: Record<Moment, string> = {
  morning: t('зранку'),
  afterMorningWarmup: t('після ранкової'),
  beforeDaytimeWarmup: t('до денної'),
  afterDaytimeWarmup: t('після денної'),
  beforeWorkout: t('до тренування'),
  afterWorkout: t('після тренування'),
  beforeMovement: t('до руху'),
  afterMovement: t('після руху'),
  evening: t('ввечері'),
};

export interface Average { readonly label: string; readonly value: number }

/** «біль · зранку 2,7»: every slider at every moment it is asked; none without answers. */
export function averages(keys: readonly DayKey[], dayAt: (key: DayKey) => Day, settings: Settings): Average[] {
  const sliders = settings.trackers.filter((tracker) => tracker.kind === 'scale');
  return sliders.flatMap((tracker) => MOMENTS.filter((moment) => tracker.ask.includes(moment)).flatMap((moment) => {
    const values = keys.map((key) => dayAt(key).t[moment]?.[tracker.id]).filter((value) => typeof value === 'number');
    if (values.length === 0) return [];
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return [{ label: `${tracker.name || t('без назви')} · ${MOMENT_SHORT[moment]}`, value: Math.round(mean * 10) / 10 }];
  }));
}

export interface DayMarks {
  /** Morning warm-up levels done that day: dots under the number, a number from 6 on (wave 9). */
  readonly morning: number;
  /** Daytime warm-up groups («для чого») done: dots above the number. */
  readonly daytime: number;
  readonly workout: boolean;
  readonly movement: boolean;
}

/**
 * What a calendar day shows (wave 9, Olesia 2026-11-18): every mark is a
 * shape, not a colour. Levels are counted, not the highest one; daytime
 * groups count once each.
 */
export function dayMarks(day: Day, settings: Settings): DayMarks {
  const morning = settings.morningWarmup.enabled ? levelsOf(day, settings).filter((level) => levelDone(day, level)).length : 0;
  const daytime = settings.daytimeWarmup.enabled ? new Set(day.dw).size : 0;
  return { morning, daytime, workout: kindDone(day, 'workout', settings), movement: kindDone(day, 'movement', settings) };
}

/** Up to 5 the marks are dots; from 6 a number stands instead (Olesia, 2026-11-18). */
export const MAX_DOTS = 5;

/**
 * The cards of «цей тиждень» counted over any run of days (wave 9): the
 * history counts the month open in the calendar or the period chosen, so
 * there is no weekly target to show.
 */
export function periodStats(keys: readonly DayKey[], dayAt: (key: DayKey) => Day, settings: Settings): WeekStat[] {
  const period = keys.map(dayAt);
  return ACTIVITY_KINDS.filter((kind) => settings[kind].enabled).map((kind) => ({
    kind,
    label: kindLabel(kind, settings),
    done: period.filter((day) => kindDone(day, kind, settings)).length,
    target: 0,
  }));
}

/** Every day from `from` to `to`, both included, oldest first. */
export function daysFrom(from: DayKey, to: DayKey): DayKey[] {
  const out: DayKey[] = [];
  for (let key = from; key <= to; key = addDays(key, 1)) out.push(key);
  return out;
}

/** A month as `YYYY-MM`. */
export type MonthKey = string & { readonly brand: 'MonthKey' };

export const monthOf = (key: DayKey) => key.slice(0, 7) as MonthKey;

export function shiftMonth(month: MonthKey, by: number): MonthKey {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const total = year * 12 + m - 1 + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}` as MonthKey;
}

export interface MonthCell { readonly key: DayKey; readonly inMonth: boolean }

/** Whole weeks around the month, Monday first; days of other months are only shown. */
export function monthCells(month: MonthKey): MonthCell[] {
  const first = `${month}-01` as DayKey;
  const start = mondayOf(first);
  const next = `${shiftMonth(month, 1)}-01` as DayKey;
  const weeks = Math.ceil((Date.parse(next) - Date.parse(start)) / (7 * 86_400_000));
  return Array.from({ length: weeks * 7 }, (_, n) => {
    const key = addDays(start, n);
    return { key, inMonth: monthOf(key) === month };
  });
}

const MONTHS = [t('січень'), t('лютий'), t('березень'), t('квітень'), t('травень'), t('червень'), t('липень'), t('серпень'), t('вересень'), t('жовтень'), t('листопад'), t('грудень')];

export function monthName(month: MonthKey, today: DayKey): string {
  const [year, m] = month.split('-');
  const name = MONTHS[Number(m) - 1]!;
  return year === today.slice(0, 4) ? name : `${name} ${year}`;
}

/* ---- pulse timer (ACCESSIBILITY.md; COPY.md «Pulse timer») ---- */

export const bpm = (beats: number, seconds: number) => Math.round((beats * 60) / seconds);

const BEATS = ['удар', 'удари', 'ударів'] as const;

/** «42 удари за 30 с × 2» */
export function beatsLine(beats: number, seconds: number): string {
  const times = 60 / seconds;
  return `${beats} ${plural(beats, BEATS)} ${t('за')} ${seconds} ${t('с')}${times === 1 ? '' : ` × ${times}`}`;
}
