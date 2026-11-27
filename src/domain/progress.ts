import { addDays, mondayOf, type DayKey } from './dates';
import { hasLap, hasSet, type Day } from './day';
import type { ActivityKind, Level, Settings } from './settings';

/*
 * Counting rules (Olesia, 2026-10-29; PROFILE-FORMAT.md):
 * - a warm-up level counts only when all its exercises are ticked;
 * - a day is «зроблено» when every activity kind ticked in the main goal is done,
 *   or, with `goal.any` (Olesia, 2026-11-19), when any one of them is;
 * - the week starts on Monday and counts days up to today.
 */

export function levelDone(day: Day, level: Level): boolean {
  return level.items.length > 0 && level.items.every((item) => day.mw.ticks.includes(item.exercise));
}

/** The warm-up levels a day was lived with: its own once the settings changed after it, else the settings'. */
export const levelsOf = (day: Day, settings: Settings): readonly Level[] => day.mw.lv ?? settings.morningWarmup.levels;

/** The settings as `day` sees them: its own warm-up levels, if it kept them (home on a past day). */
export function settingsOn(day: Day, settings: Settings): Settings {
  return day.mw.lv ? { ...settings, morningWarmup: { ...settings.morningWarmup, levels: day.mw.lv } } : settings;
}

/** What makes a level count: its id and the exercises in it, in order. */
const levelShape = (levels: readonly Level[]) => JSON.stringify(levels.map((level) => [level.id, level.items.map((item) => item.exercise)]));

/**
 * Before the warm-up levels change in the settings (an exercise added, moved, a level removed),
 * the past days that follow the settings keep the levels they were lived with, so what was done
 * stays done (Olesia, 2026-11-27). Today follows the new levels. Days with nothing ticked, and
 * days that already keep their own, stay as they are.
 */
export function keepPastLevels(days: Readonly<Record<DayKey, Day>>, before: Settings, after: Settings, today: DayKey): Readonly<Record<DayKey, Day>> {
  const levels = before.morningWarmup.levels;
  if (levelShape(levels) === levelShape(after.morningWarmup.levels)) return days;
  const keeps = (day: Day) => day.date < today && day.mw.lv === undefined && day.mw.ticks.length > 0;
  if (!Object.values(days).some(keeps)) return days;
  return Object.fromEntries(Object.entries(days).map(([key, day]) => [key, keeps(day) ? { ...day, mw: { ...day.mw, lv: levels } } : day]));
}

const hasSets = (day: Day) => day.wo !== null && Object.values(day.wo.ex).some((sets) => sets.some(hasSet));

export function kindDone(day: Day, kind: ActivityKind, settings: Settings): boolean {
  switch (kind) {
    case 'morningWarmup': return levelsOf(day, settings).some((level) => levelDone(day, level));
    case 'daytimeWarmup': return day.dw.length > 0;
    case 'workout': return hasSets(day);
    case 'movement': return Object.values(day.mv).some((laps) => laps.some(hasLap));
  }
}

/** The kinds that make a day count: ticked in the goal and switched on. */
export function goalKinds(settings: Settings): ActivityKind[] {
  return settings.goal.done.filter((kind) => settings[kind].enabled);
}

export function dayDone(day: Day, settings: Settings): boolean {
  const kinds = goalKinds(settings);
  const done = (kind: ActivityKind) => kindDone(day, kind, settings);
  return kinds.length > 0 && (settings.goal.any ? kinds.some(done) : kinds.every(done));
}

/** Days of the week of `date`, Monday first, up to today. */
export function weekSoFar(date: DayKey, today: DayKey): DayKey[] {
  const monday = mondayOf(date);
  return [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(monday, n)).filter((key) => key <= today);
}

export interface WeekGoal { readonly done: number; readonly target: number }

/** «цей тиждень: 3 з 5 днів», or null when there is no goal to show. */
export function weekGoal(date: DayKey, today: DayKey, dayAt: (key: DayKey) => Day, settings: Settings): WeekGoal | null {
  if (!settings.goal.enabled || goalKinds(settings).length === 0) return null;
  const done = weekSoFar(date, today).filter((key) => dayDone(dayAt(key), settings)).length;
  return { done, target: settings.goal.days };
}

/** What an edit of a day finished: warm-up levels that just got done, and whether the day just counted for the goal. */
export interface Completed {
  readonly levels: readonly string[];
  readonly day: boolean;
}

export function completed(before: Day, after: Day, settings: Settings): Completed {
  const levels = levelsOf(after, settings).filter((level) => levelDone(after, level) && !levelDone(before, level)).map((level) => level.id);
  const day = settings.goal.enabled && dayDone(after, settings) && !dayDone(before, settings);
  return { levels, day };
}
