import { daysBetween, type DayKey } from './dates';
import { t } from '../i18n/lang';
import { plural } from './numbers';

/*
 * The copy in the menu (COPY.md, Menu; «бета 0.81» `backupLine`, `needBackup`).
 * The day of the last copy is kept on this phone only, not in the copy itself.
 */

/**
 * The reminder shows from this many days after the last copy: 1 (D-03;
 * Olesia, 2026-11-08 and again 2026-11-14: «воно ненав'язливо і легко
 * ігнорується»). It was 3 until then.
 */
export const REMIND_AFTER_DAYS = 1;

/** «1 день», «3 дні», «5 днів», «21 день»… */
const dayWord = (n: number): string => plural(n, ['день', 'дні', 'днів']);

/** Days since the copy; a copy dated after today (the clock moved back) counts as today. */
const daysSince = (saved: DayKey, today: DayKey) => Math.max(0, daysBetween(saved, today));

export function backupLine(saved: DayKey | null, today: DayKey): string {
  if (saved === null) return t('копії ще немає');
  const n = daysSince(saved, today);
  return n === 0 ? t('остання копія — сьогодні') : t('остання копія — {n} {days} тому', { n, days: dayWord(n) });
}

/** Remind when there are records and no copy, or the copy is from yesterday or older. */
export function needsBackup(saved: DayKey | null, today: DayKey, hasRecords: boolean): boolean {
  return saved === null ? hasRecords : daysSince(saved, today) >= REMIND_AFTER_DAYS;
}

/** The same name «бета 0.81» gives its copies. */
export function copyFileName(today: DayKey): string {
  return `trekr-kopiya-${today}.json`;
}

/** What the phone stores but the app can't read, saved as it is (D-02); not a copy, so not named as one. */
export function unreadableFileName(today: DayKey): string {
  return `trekr-nechytani-zapysy-${today}.json`;
}
