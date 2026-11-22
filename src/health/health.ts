import { addDays, isDayKey, type DayKey } from '../domain/dates';
import type { Day, HealthLog, HealthWorkout } from '../domain/day';
import type { Edit } from '../domain/log';
import { formatNumber, plural } from '../domain/numbers';
import { t } from '../i18n/lang';

/*
 * Beta 1.1.1 (HEALTH-IMPORT.md, A1): «Здоров'я» on an iPhone. A web app has
 * no way into HealthKit, so the shortcut «body.log health» reads the last
 * 7 days and copies them as text; the app reads that text from the clipboard.
 *
 * The text (section C of the plan; real output from Olesia's iPhone 12 mini,
 * iOS 16.3.1, 2026-11-22):
 *
 *   body.log health 1
 *   2026-11-19 steps 2841
 *   2026-11-19 km 2.15974999998603
 *
 * - the header is required; a repeated one is skipped (an early build pasted it twice);
 * - a line is `date key value`; numbers with a comma or a dot, spaces between thousands allowed;
 * - the same day and key twice: the last one counts;
 * - `workout <min> [km] <name>` is read too, though iOS 16 has no workouts in Shortcuts;
 * - unknown keys are skipped (a later shortcut may send more); future days
 *   and days older than 31 days are not taken.
 */

export const HEALTH_HEADER = 'body.log health 1';

/** The shortcut's name: the app runs it by name, so it must be exactly this. */
export const SHORTCUT_NAME = 'body.log health';

/** The shortcut v1 (steps, km), shared from Olesia's iPhone on 2026-11-22 (HEALTH-IMPORT.md, C). */
export const SHORTCUT_LINK = 'https://www.icloud.com/shortcuts/f253cfa88cfd41aa923ff3d01c16e90b';

/** Runs the shortcut from the app (Shortcuts URL scheme). */
export const SHORTCUT_RUN = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;

/** Days older than this are not taken from a paste. */
export const OLDEST_DAYS = 31;

type NumberKey = Exclude<keyof HealthLog, 'workouts'>;

/** Decimals kept per key: the shortcut sends km as `2.15974999998603`. */
const NUMBER_KEYS: Readonly<Record<NumberKey, number>> = { steps: 0, km: 2, exmin: 0, kcal: 0, floors: 0 };

const isNumberKey = (key: string): key is NumberKey => Object.hasOwn(NUMBER_KEYS, key);

/** «8432», «8 432», «2.15», «2,15»; null for anything else (a minus too). */
export function healthNumber(text: string): number | null {
  const typed = text.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(typed)) return null;
  const value = Number(typed);
  return Number.isFinite(value) ? value : null;
}

const rounded = (value: number, decimals: number) => Math.round(value * 10 ** decimals) / 10 ** decimals;

export const EMPTY_HEALTH: HealthLog = { steps: null, km: null, exmin: null, kcal: null, floors: null, workouts: [] };

/** `<min> [km] <name>`: the name may be missing too. */
function readWorkout(parts: readonly string[]): HealthWorkout | null {
  const min = healthNumber(parts[0] ?? '');
  if (min === null) return null;
  const km = healthNumber(parts[1] ?? '');
  const name = parts.slice(km === null ? 1 : 2).join(' ').trim();
  return { min: Math.round(min), km: km === null ? null : rounded(km, 2), name };
}

const sameWorkout = (a: HealthWorkout, b: HealthWorkout) => a.min === b.min && a.km === b.km && a.name === b.name;

export type HealthPaste =
  /** Not the shortcut's text at all. */
  | { readonly kind: 'not-ours' }
  /** The shortcut's text, by day; may be empty (no data in «Здоров'я» for the 7 days). */
  | { readonly kind: 'days'; readonly days: Readonly<Record<DayKey, HealthLog>> };

/** Reads the text the shortcut copied; `today` sets which days are taken. */
export function parseHealth(text: string, today: DayKey): HealthPaste {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== HEALTH_HEADER) return { kind: 'not-ours' };
  const oldest = addDays(today, -OLDEST_DAYS);
  const days: Record<DayKey, HealthLog> = {};
  for (const line of lines.slice(1)) {
    const [date, key = '', ...rest] = line.split(/\s+/);
    if (!isDayKey(date) || date > today || date < oldest) continue;
    const day = days[date] ?? EMPTY_HEALTH;
    if (isNumberKey(key)) {
      // «8 432»: the spaces between thousands split the value into parts
      const value = healthNumber(rest.join(''));
      if (value !== null) days[date] = { ...day, [key]: rounded(value, NUMBER_KEYS[key]) };
    } else if (key === 'workout') {
      const workout = readWorkout(rest);
      if (workout && !day.workouts.some((w) => sameWorkout(w, workout))) days[date] = { ...day, workouts: [...day.workouts, workout] };
    }
  }
  return { kind: 'days', days };
}

/** Whether a day's «Здоров'я» has anything to show. */
export function hasHealth(log: HealthLog | undefined): log is HealthLog {
  if (log === undefined) return false;
  return (Object.keys(NUMBER_KEYS) as NumberKey[]).some((key) => log[key] !== null) || log.workouts.length > 0;
}

/**
 * A sync replaces «Здоров'я» of the days that came (HEALTH-IMPORT.md, decision 4);
 * whatever the person logged by hand stays as it was.
 */
export const withHealth = (log: HealthLog): Edit => (day: Day) => ({ ...day, hl: log });

/** The dates a paste brings, oldest first. */
export const healthDates = (days: Readonly<Record<DayKey, HealthLog>>): DayKey[] => (Object.keys(days) as DayKey[]).sort();

/** The name of the record on screen, in the history and in the PDF (Olesia: «окремий вид руху з власною назвою»; Нитка's draft). */
export const HEALTH_NAME = t('зі Здоровʼя');

const STEPS = ['крок', 'кроки', 'кроків'] as const;
const FLOORS = ['проліт', 'прольоти', 'прольотів'] as const;

/** What a day's record holds, in the plan's order: «2841 крок», «2,16 км», then the rest. */
export function healthParts(log: HealthLog): string[] {
  const number = (value: number | null, unit: string) => (value === null ? [] : [`${formatNumber(value)} ${unit}`]);
  return [
    ...(log.steps === null ? [] : [`${formatNumber(log.steps)} ${plural(log.steps, STEPS)}`]),
    ...number(log.km, t('км')),
    ...number(log.exmin, t('хв активності')),
    ...number(log.kcal, t('ккал')),
    ...(log.floors === null ? [] : [`${formatNumber(log.floors)} ${plural(log.floors, FLOORS)}`]),
    ...log.workouts.map((w) => [w.name || t('тренування'), `${formatNumber(w.min)} ${t('хв')}`, ...number(w.km, t('км'))].join(' ')),
  ];
}

/** «2841 крок · 2,16 км» */
export const formatHealth = (log: HealthLog) => healthParts(log).join(' · ');

/** Days of the 7 shown on home that have steps or km, for «середнє за 7 днів». */
export function healthAverages(keys: readonly DayKey[], dayAt: (key: DayKey) => Day): { readonly steps: number | null; readonly km: number | null } {
  const logs = keys.map((key) => dayAt(key).hl).filter(hasHealth);
  const mean = (key: 'steps' | 'km', decimals: number) => {
    const values = logs.map((log) => log[key]).filter((value): value is number => value !== null);
    return values.length ? rounded(values.reduce((sum, value) => sum + value, 0) / values.length, decimals) : null;
  };
  return { steps: mean('steps', 0), km: mean('km', 1) };
}
