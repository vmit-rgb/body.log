import { PROFILE_VERSION } from './profile-check';

/*
 * Settings written before format 0.1 («бета 0.76–0.81», «бета 0.9» until
 * 2026-11-15) say `"version": 1` as a number, or nothing. They are turned
 * into 0.1 once, where a diary is read from the phone or from a copy; the
 * rest of the app then knows the new keys only (PROFILE-FORMAT.md,
 * «Converting older settings»).
 *
 * What changes, and nothing else:
 * - `version` → "0.1";
 * - warm-up exercise `timed: true` with the seconds in `reps` → `seconds`;
 * - workout exercise `side` → the end of `reps` («10» + «на кожну ногу»);
 * - `reps` as a number → text;
 * - `theme.motion` → `accessibility`;
 * - an accent that no longer exists → the nearest one that does;
 * - no `goal` used to mean «5 days a week»: that is written down, because
 *   from 0.1 on no `goal` means no weekly goal;
 * - `ui: null` goes (the app never read it).
 * Everything else stays as it was, also keys the app doesn't know.
 */

type Obj = { readonly [key: string]: unknown };
type Mutable = Record<string, unknown>;

const isObj = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value);
const obj = (value: unknown): Obj => (isObj(value) ? value : {});
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : isNumber(value) ? String(value) : '');

/** Whether these settings are older than format 0.1. */
export function isLegacyProfile(profile: Obj): boolean {
  return typeof profile.version !== 'string';
}

function withTextReps(item: Mutable): Mutable {
  if (isNumber(item.reps)) item.reps = String(item.reps);
  return item;
}

/** 0.81: `timed: true` and the seconds in `reps`. An exercise by time has `seconds` and no `reps`. */
function warmupItem(entry: unknown): unknown {
  if (!isObj(entry)) return entry;
  const { timed, ...item }: Mutable = { ...entry };
  if (timed === true && !isNumber(item.seconds)) {
    const seconds = Number(text(item.reps).replace(',', '.'));
    if (text(item.reps).trim() !== '' && Number.isFinite(seconds)) item.seconds = seconds;
  }
  if (isNumber(item.seconds)) delete item.reps;
  return withTextReps(item);
}

/**
 * `side` («на кожну ногу») was shown after the count; it moves into `reps`,
 * which is text. Where there is no count to join (an exercise by time
 * only), it is dropped.
 */
function workoutItem(entry: unknown): unknown {
  if (!isObj(entry)) return entry;
  if (Array.isArray(entry.set)) return { ...entry, set: entry.set.map(workoutItem) };
  const { side, timed: _timed, ...item }: Mutable = { ...entry };
  withTextReps(item);
  const fields = Array.isArray(item.fields) ? item.fields : [];
  const byTimeOnly = fields.includes('seconds') && !fields.includes('reps');
  if (text(side).trim() !== '' && text(item.reps) !== '' && !byTimeOnly) item.reps = `${text(item.reps)} ${text(side).trim()}`;
  return item;
}

function section(value: unknown, list: string, item: (entry: unknown) => unknown): unknown {
  if (!isObj(value) || !Array.isArray(value[list])) return value;
  return {
    ...value,
    [list]: value[list].map((owner: unknown) =>
      (isObj(owner) && Array.isArray(owner.items) ? { ...owner, items: owner.items.map(item) } : owner)),
  };
}

/** Accents removed on 2026-11-08 and 2026-11-12, each moved to the nearest one that remains. */
const REMOVED_ACCENTS: ReadonlyMap<unknown, string> = new Map([['red', 'orange'], ['amber', 'orange'], ['yellow', 'orange'], ['lime', 'green']]);

const ACCESSIBILITY_KEYS = ['noMotion', 'noBackgroundMotion', 'noVibration', 'noSound', 'largerTargets', 'largerText', 'mirrored'] as const;

/**
 * `theme.motion` of «бета 0.76–0.81»: a boolean, or `{ ui, ascii, vibration }`.
 * A stored `accessibility` key wins over it.
 */
function accessibility(profile: Obj): Obj | undefined {
  const motion = obj(profile.theme).motion;
  if (motion === undefined) return isObj(profile.accessibility) ? profile.accessibility : undefined;
  const parts = obj(motion);
  const old: Obj = motion === false
    ? { noMotion: true }
    : { noMotion: parts.ui === false, noBackgroundMotion: parts.ascii === false, noVibration: parts.vibration === false };
  const stored = obj(profile.accessibility);
  return Object.fromEntries(ACCESSIBILITY_KEYS.map((key) => [key, typeof stored[key] === 'boolean' ? stored[key] : old[key] === true]));
}

function theme(profile: Obj): unknown {
  if (!isObj(profile.theme)) return profile.theme;
  const { motion: _motion, ...rest }: Mutable = { ...profile.theme };
  rest.accent = REMOVED_ACCENTS.get(rest.accent) ?? rest.accent;
  if (rest.accent === undefined) delete rest.accent;
  return rest;
}

/** Before 0.1 a profile without a goal counted 5 days a week; an unfinished one was filled the same way. */
function goal(profile: Obj): Obj {
  const stored = obj(profile.goal);
  return {
    ...stored,
    enabled: stored.enabled !== false,
    days: isNumber(stored.days) ? stored.days : 5,
    done: Array.isArray(stored.done) ? stored.done : [],
  };
}

/** Settings in format 0.1; the same object when they already are. */
export function upgradeProfile<T extends Obj>(profile: T): T | Obj {
  if (!isLegacyProfile(profile)) return profile;
  const { ui, ...rest }: Mutable = { ...profile };
  const next: Mutable = {
    ...rest,
    ...(ui === null || ui === undefined ? {} : { ui }),
    version: PROFILE_VERSION,
    goal: goal(profile),
    morningWarmup: section(profile.morningWarmup, 'levels', warmupItem),
    daytimeWarmup: section(profile.daytimeWarmup, 'groups', warmupItem),
    workout: section(profile.workout, 'sessions', workoutItem),
  };
  if (profile.theme !== undefined) next.theme = theme(profile);
  const access = accessibility(profile);
  if (access) next.accessibility = access;
  for (const key of ['morningWarmup', 'daytimeWarmup', 'workout']) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
}
