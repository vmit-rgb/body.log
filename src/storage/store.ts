import { isDayKey, type DayKey } from '../domain/dates';
import { parseDiary, readDiary, serializeDiary, type Diary } from '../domain/diary';

/** The part of `localStorage` the app uses; a test can pass its own. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The keys keep the app's first name on purpose: the app is body.log since
 * 2026-11-17, but renaming the keys would hide the diaries already on phones.
 */
export const DIARY_KEY = 'phys-activity-tracking-app/diary';
const UNREADABLE_KEY = `${DIARY_KEY}/unreadable`;
/** The diary as it was stored before its settings were converted to format 0.1. */
export const BEFORE_FORMAT_KEY = `${DIARY_KEY}/before-format-0.1`;
/** The diary as it was stored before its morning levels got their own exercises (F-07, wave 6). */
export const BEFORE_SPLIT_KEY = `${DIARY_KEY}/before-own-level-exercises`;
const BROWSER_KEY = 'phys-activity-tracking-app/browser-chosen';
const WELCOME_KEY = 'phys-activity-tracking-app/installed-welcome';
const SECTION_KEY = 'phys-activity-tracking-app/section-closed/';
const TIP_KEY = 'phys-activity-tracking-app/tip-closed/';
const TIP_DONE_KEY = 'phys-activity-tracking-app/tip-done/';
/** Where wave 5b kept «закінчити тренування» per day, before it moved into the day (wave 5c). */
export const FINISHED_KEY = 'phys-activity-tracking-app/workout-finished/';
const THEME_KEY = 'phys-activity-tracking-app/theme';
const BACKUP_KEY = 'phys-activity-tracking-app/last-copy';

export interface DiaryStore {
  /**
   * The diary on this phone. Settings older than format 0.1 come back
   * converted and are stored that way once; the entry as it was is kept
   * aside first; so are settings whose morning levels shared exercises
   * (F-07, split once). When the phone has no room for that, the conversion
   * lives in memory only and is tried again on the next launch.
   */
  load(): Diary | null;
  /**
   * What is stored when the app can't read it as a diary (D-02): the text as
   * it is, so the person can keep it as a file. Null with no entry, an empty
   * one, or one that reads fine.
   */
  unreadable(): string | null;
  /** Throws when the phone refuses to store it (e.g. storage full). */
  save(diary: Diary): void;
  /** «стерти все»: no diary on this phone; an entry set aside as unreadable stays. */
  clear(): void;
}

/**
 * The diary on this phone only, kept in the same format as a copy file.
 * An entry the app can't read is never lost: it is set aside before the
 * first write over it.
 */
export function diaryStore(storage: KeyValue, now: () => Date): DiaryStore {
  return {
    load() {
      const stored = storage.getItem(DIARY_KEY);
      const read = readDiary(stored ?? '');
      if (!read) return null;
      const moved = withFinished(storage, read.diary);
      if (read.converted || read.split || moved.dates.length > 0) {
        try {
          if (read.converted) storage.setItem(BEFORE_FORMAT_KEY, stored!);
          if (read.split && storage.getItem(BEFORE_SPLIT_KEY) === null) storage.setItem(BEFORE_SPLIT_KEY, stored!);
          storage.setItem(DIARY_KEY, serializeDiary(moved.diary, now()));
          for (const date of moved.dates) storage.removeItem(FINISHED_KEY + date);
        } catch {
          // no room: the stored diary stays as it was, the marks too; tried again on the next launch
        }
      }
      return moved.diary;
    },
    unreadable() {
      const stored = storage.getItem(DIARY_KEY);
      return stored === null || stored.trim() === '' || parseDiary(stored) !== null ? null : stored;
    },
    save(diary) {
      const previous = storage.getItem(DIARY_KEY);
      if (previous !== null && parseDiary(previous) === null) storage.setItem(UNREADABLE_KEY, previous);
      storage.setItem(DIARY_KEY, serializeDiary(diary, now()));
    },
    clear: () => storage.removeItem(DIARY_KEY),
  };
}

/** Whether the person chose to use the app in the phone's browser without installing it. */
export function browserChoice(storage: KeyValue): { chosen(): boolean; choose(): void } {
  return {
    chosen: () => storage.getItem(BROWSER_KEY) === 'yes',
    choose: () => storage.setItem(BROWSER_KEY, 'yes'),
  };
}

/** Whether the installed app already said «встановлено :)» (or had no need to: FIXES-1.0.1.md, A2a). */
export function welcomeMemory(storage: KeyValue): { seen(): boolean; mark(): void } {
  return {
    seen: () => storage.getItem(WELCOME_KEY) === 'yes',
    mark: () => storage.setItem(WELCOME_KEY, 'yes'),
  };
}

/**
 * Which home sections the person opened; a section is closed until then (Olesia, 2026-11-11, as Figma's home).
 * Stored as «closed?» = yes / no. Kept on this phone only, not in the copy.
 */
export function sectionMemory(storage: KeyValue): { open(id: string): boolean; remember(id: string, open: boolean): void } {
  return {
    open: (id) => storage.getItem(SECTION_KEY + id) === 'no',
    remember: (id, open) => setQuietly(storage, SECTION_KEY + id, open ? 'no' : 'yes'),
  };
}

/** Writes what only makes the app nicer: a full phone just forgets it. */
function setQuietly(storage: KeyValue, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // nothing is lost but the remembered choice
  }
}

/** Tips for newcomers: what a tip needs from the phone. */
export interface TipMemory {
  open(id: string): boolean;
  close(id: string): void;
  /** The person did what the tip explains, and it worked. */
  succeed?(id: string): void;
}

/** After this many successes a tip doesn't show again (Olesia, 2026-11-17: «помічники в онбордингу»). */
export const TIP_SUCCESSES = 3;

/**
 * Tips for newcomers (waves 5, 5b): a tip shows until the person closes it
 * with «зрозуміло» or has done what it explains three times. On this phone
 * only, not in the copy.
 */
export function tipMemory(storage: KeyValue): Required<TipMemory> {
  const done = (id: string) => Number(storage.getItem(TIP_DONE_KEY + id)) || 0;
  return {
    open: (id) => storage.getItem(TIP_KEY + id) !== 'closed' && done(id) < TIP_SUCCESSES,
    close: (id) => setQuietly(storage, TIP_KEY + id, 'closed'),
    succeed(id) {
      if (done(id) < TIP_SUCCESSES) setQuietly(storage, TIP_DONE_KEY + id, String(done(id) + 1));
    },
  };
}

/**
 * Wave 5b kept «закінчити тренування» on the phone (`workout-finished/<date>`);
 * since wave 5c it is `wo.done` in the day, so the copy has it (Olesia,
 * 2026-11-17). Moves the old marks into the days once: `dates` are the marks
 * found, to remove after the diary is stored. A mark of a day with no
 * workout picked any more means nothing and goes too.
 */
function withFinished(storage: KeyValue, diary: Diary): { readonly diary: Diary; readonly dates: DayKey[] } {
  const dates = (Object.keys(diary.days) as DayKey[]).filter((date) => storage.getItem(FINISHED_KEY + date) === 'yes');
  if (dates.length === 0) return { diary, dates };
  const days = { ...diary.days };
  for (const date of dates) {
    const day = days[date]!;
    if (day.wo && !day.wo.done) days[date] = { ...day, wo: { ...day.wo, done: true } };
  }
  return { diary: { ...diary, days }, dates };
}

export type ThemeChoice = 'dark' | 'light';

/** The theme chosen with ☼ / ☾ in the menu; light and dark belong to the phone, not the profile (PROFILE-FORMAT.md). */
export function themeMemory(storage: KeyValue): { chosen(): ThemeChoice | null; choose(theme: ThemeChoice): void } {
  return {
    chosen() {
      const theme = storage.getItem(THEME_KEY);
      return theme === 'dark' || theme === 'light' ? theme : null;
    },
    choose: (theme) => setQuietly(storage, THEME_KEY, theme),
  };
}

/** The day of the last «зберегти копію», for «остання копія — …» (on this phone only, as in «бета 0.81»). */
export function backupMemory(storage: KeyValue): { last(): DayKey | null; remember(day: DayKey): void } {
  return {
    last() {
      const day = storage.getItem(BACKUP_KEY);
      return isDayKey(day) ? day : null;
    },
    remember: (day) => setQuietly(storage, BACKUP_KEY, day),
  };
}

/**
 * Where the app keeps everything (Olesia, 2026-11-09): the installed app on
 * the phone; a browser tab only in that tab, so a new tab starts from the
 * first screen. The tab never reads or writes the phone's storage: on Android
 * the installed app shares it with Chrome, and the tab must not touch that diary.
 */
export function storageFor<T extends KeyValue>(installed: boolean, storages: { local: T; session: T }): T {
  return installed ? storages.local : storages.session;
}
