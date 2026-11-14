import schemaFile from './profile.schema.json';
import { checkSchema, type Issue, type Path, type Schema } from './schema';

/*
 * The strict check of settings that come from outside (the paste):
 * profile.schema.json first (shape, kinds, limits), then what a schema
 * can't say: ids that repeat, an exercise that isn't in the catalogue, a
 * scale that ends before it starts. PROFILE-FORMAT.md describes the same
 * in words; the schema is the one source for the check and for the prompt.
 */

export const PROFILE_SCHEMA = schemaFile as unknown as Schema;

export const PROFILE_FORMAT = 'phys-activity-profile';
/** The format's version now; a text, so the old number 1 (before 0.1) is never taken for the release «1». */
export const PROFILE_VERSION = '0.1';
/** The whole pasted text, in bytes of UTF-8 (PROFILE-FORMAT.md, Limits). */
export const MAX_PASTE_BYTES = 200_000;

export type ProfileIssue =
  | Issue
  /** The same id twice in one list. */
  | { readonly kind: 'duplicateId'; readonly path: Path; readonly id: string }
  /** An item names an exercise the catalogue doesn't have. */
  | { readonly kind: 'missingExercise'; readonly path: Path; readonly id: string }
  /** A scale's `min` is not below its `max`. */
  | { readonly kind: 'minNotBelowMax'; readonly path: Path };

export interface ProfileChecked {
  readonly issues: readonly ProfileIssue[];
  readonly unknown: readonly Path[];
}

type Obj = { readonly [key: string]: unknown };

const isObj = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value);
const obj = (value: unknown): Obj => (isObj(value) ? value : {});
const arr = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** The lists whose entries carry an id, as paths from the top. */
const ID_LISTS: readonly Path[] = [
  ['exercises'], ['trackers'], ['morningWarmup', 'levels'], ['daytimeWarmup', 'groups'], ['workout', 'sessions'], ['movement', 'kinds'],
];

const at = (profile: Obj, path: Path): unknown => path.reduce<unknown>((value, key) => obj(value)[key as string], profile);

function repeatedIds(profile: Obj): ProfileIssue[] {
  return ID_LISTS.flatMap((list) => {
    const seen = new Set<unknown>();
    return arr(at(profile, list)).flatMap((entry, index): ProfileIssue[] => {
      const id = obj(entry).id;
      if (typeof id !== 'string') return [];
      if (seen.has(id)) return [{ kind: 'duplicateId', path: [...list, index, 'id'], id }];
      seen.add(id);
      return [];
    });
  });
}

/** Every place an exercise is named: the two warm-ups, the workouts and their groups. */
function exerciseUses(profile: Obj): { path: Path; id: unknown }[] {
  const uses: { path: Path; id: unknown }[] = [];
  const items = (list: Path, key: string) => arr(at(profile, list)).forEach((owner, i) => {
    arr(obj(owner).items).forEach((item, j) => {
      const here: Path = [...list, i, key, j];
      const set = obj(item).set;
      if (Array.isArray(set)) set.forEach((inner, k) => uses.push({ path: [...here, 'set', k, 'exercise'], id: obj(inner).exercise }));
      else uses.push({ path: [...here, 'exercise'], id: obj(item).exercise });
    });
  });
  items(['morningWarmup', 'levels'], 'items');
  items(['daytimeWarmup', 'groups'], 'items');
  items(['workout', 'sessions'], 'items');
  return uses;
}

function missingExercises(profile: Obj): ProfileIssue[] {
  // a catalogue that isn't a list is one error already, not one per exercise
  if (!Array.isArray(profile.exercises)) return [];
  const known = new Set(profile.exercises.map((exercise) => obj(exercise).id));
  return exerciseUses(profile).flatMap(({ path, id }): ProfileIssue[] =>
    (typeof id === 'string' && id !== '' && !known.has(id) ? [{ kind: 'missingExercise', path, id }] : []));
}

function scales(profile: Obj): ProfileIssue[] {
  return arr(profile.trackers).flatMap((tracker, index): ProfileIssue[] => {
    const { kind, min = 0, max = 10 } = obj(tracker) as { kind?: unknown; min?: unknown; max?: unknown };
    if (kind !== 'scale' || typeof min !== 'number' || typeof max !== 'number' || min < max) return [];
    return [{ kind: 'minNotBelowMax', path: ['trackers', index] }];
  });
}

/** Checks settings from outside; nothing wrong and nothing unknown means they can be kept as they are. */
export function checkProfile(value: unknown): ProfileChecked {
  const { issues, unknown } = checkSchema(PROFILE_SCHEMA, value);
  if (!isObj(value)) return { issues, unknown };
  return { issues: [...issues, ...repeatedIds(value), ...missingExercises(value), ...scales(value)], unknown };
}
