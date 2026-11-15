import { describe, expect, it } from 'vitest';
import { EXAMPLE_DIARY } from '../domain/examples';
import example from './example-profile.json';
import { checkProfile, PROFILE_VERSION } from './profile-check';

// Invented data only.
type Obj = Record<string, unknown>;

/** The example with one place changed; the path is like «workout.sessions.0.items.0.sets». */
function withAt(path: string, value: unknown): Obj {
  const copy = structuredClone(example) as Obj;
  const keys = path.split('.');
  const last = keys.pop()!;
  const owner = keys.reduce<Obj>((node, key) => node[key] as Obj, copy);
  if (value === undefined) delete owner[last];
  else owner[last] = value;
  return copy;
}

const issuesAt = (path: string, value: unknown) => checkProfile(withAt(path, value)).issues;
const long = (n: number) => 'а'.repeat(n);
const many = (n: number, make: (i: number) => unknown) => Array.from({ length: n }, (_, i) => make(i));

describe('checkProfile: what passes', () => {
  it('passes the example of PROFILE-FORMAT.md', () => {
    expect(checkProfile(example)).toEqual({ issues: [], unknown: [] });
  });

  it('passes the «почати без ШІ» settings', () => {
    expect(checkProfile(EXAMPLE_DIARY.profile)).toEqual({ issues: [], unknown: [] });
  });

  it('passes settings without a goal, phrases, a language, a colour or «доступність»', () => {
    const { goal: _g, encouragement: _e, lang: _l, theme: _th, ...rest } = example;
    expect(checkProfile(rest)).toEqual({ issues: [], unknown: [] });
    expect(checkProfile({ ...rest, accessibility: { largerText: true } })).toEqual({ issues: [], unknown: [] });
  });

  it('knows «вимкнути зникання повідомлень» as the eighth switch of «доступність», true or false only', () => {
    expect(checkProfile({ ...example, accessibility: { keepToasts: true } })).toEqual({ issues: [], unknown: [] });
    expect(checkProfile({ ...example, accessibility: { keepToasts: 'так' } }).issues).toHaveLength(1);
  });

  it('takes `reps` as text or as a whole number', () => {
    expect(issuesAt('morningWarmup.levels.0.items.0.reps', 10)).toEqual([]);
    expect(issuesAt('morningWarmup.levels.0.items.0.reps', '8–12 на кожну ногу')).toEqual([]);
    expect(issuesAt('morningWarmup.levels.0.items.0.reps', 1.5)[0]).toMatchObject({ kind: 'type' });
  });
});

describe('checkProfile: the version', () => {
  it(`is the text "${PROFILE_VERSION}"; the old number 1 is not it`, () => {
    expect(issuesAt('version', 1)).toEqual([{ kind: 'enum', path: ['version'], allowed: ['0.1'] }]);
    expect(issuesAt('version', '1')).toEqual([{ kind: 'enum', path: ['version'], allowed: ['0.1'] }]);
  });
});

describe('checkProfile: a part of the settings', () => {
  it('names every missing section', () => {
    const { workout: _w, trackers: _t, ...part } = example;
    expect(checkProfile(part).issues).toEqual([
      { kind: 'required', path: [], key: 'workout' },
      { kind: 'required', path: [], key: 'trackers' },
    ]);
  });
});

describe('checkProfile: unknown keys', () => {
  it('lists them and does not call them errors, also the old `side`, `timed` and `theme.motion`', () => {
    const checked = checkProfile({
      ...withAt('workout.sessions.0.items.0.side', 'на кожну ногу'),
      ui: null,
      theme: { accent: 'blue', motion: false },
    });
    expect(checked.issues).toEqual([]);
    expect(checked.unknown).toEqual([['theme', 'motion'], ['workout', 'sessions', 0, 'items', 0, 'side'], ['ui']]);
    expect(checkProfile(withAt('morningWarmup.levels.0.items.0.timed', true)).unknown).toEqual([['morningWarmup', 'levels', 0, 'items', 0, 'timed']]);
  });
});

describe('checkProfile: limits (PROFILE-FORMAT.md)', () => {
  it.each([
    ['exercises.0.name', long(61), 'maxLength'],
    ['exercises.0.name', '', 'minLength'],
    ['exercises.0.how', long(501), 'maxLength'],
    ['exercises.3.source.url', `https://example.com/${long(500)}`, 'maxLength'],
    ['trackers.0.hint', long(121), 'maxLength'],
    ['morningWarmup.levels.0.duration', long(121), 'maxLength'],
    ['trackers.2.units.0', long(121), 'maxLength'],
    ['encouragement.0', long(81), 'maxLength'],
    ['morningWarmup.weeklyTarget', 8, 'maximum'],
    ['morningWarmup.weeklyTarget', -1, 'minimum'],
    ['goal.days', -1, 'minimum'],
    ['goal.days', 8, 'maximum'],
    ['workout.sessions.0.items.0.sets', 11, 'maximum'],
    ['workout.sessions.0.items.0.sets', 0, 'minimum'],
    ['workout.sessions.0.items.0.weight', 501, 'maximum'],
    ['workout.sessions.0.items.0.weight', -1, 'minimum'],
    ['morningWarmup.levels.0.items.1.seconds', 3601, 'maximum'],
    ['morningWarmup.levels.0.items.1.seconds', 0, 'minimum'],
    ['trackers.0.max', 101, 'maximum'],
    ['trackers.0.min', -1, 'minimum'],
  ])('%s = %j → %s', (path, value, kind) => {
    expect(issuesAt(path, value).map((issue) => issue.kind)).toEqual([kind]);
  });

  it.each([
    ['morningWarmup.levels', 11, (i: number) => ({ id: `l${i}`, name: 'рівень', items: [] })],
    ['daytimeWarmup.groups', 11, (i: number) => ({ id: `g${i}`, name: 'зона', items: [] })],
    ['workout.sessions', 11, (i: number) => ({ id: `s${i}`, name: 'тренування', items: [] })],
    ['movement.kinds', 11, (i: number) => ({ id: `m${i}`, name: 'рух', fields: ['minutes'] })],
    ['morningWarmup.levels.0.items', 31, () => ({ exercise: 'plank', seconds: 30 })],
    ['workout.sessions.0.items', 31, () => ({ exercise: 'plank', fields: ['seconds'] })],
    ['exercises', 151, (i: number) => ({ id: i < 5 ? example.exercises[i]!.id : `e${i}`, name: 'вправа' })],
    ['trackers', 21, (i: number) => ({ id: `t${i}`, name: 'питання', kind: 'yesno', ask: ['morning'] })],
    ['encouragement', 11, () => 'фраза'],
  ])('%s: %i entries are one too many', (path, n, make) => {
    expect(issuesAt(path, many(n, make))).toEqual([{ kind: 'maxItems', path: path.split('.').map((key) => (/^\d+$/.test(key) ? Number(key) : key)), limit: n - 1, actual: n }]);
  });

  it('keeps a group of exercises at 2–3', () => {
    const item = { exercise: 'plank', fields: ['seconds'] };
    expect(issuesAt('workout.sessions.0.items.1.set', [item]).map((issue) => issue.kind)).toEqual(['minItems']);
    expect(issuesAt('workout.sessions.0.items.1.set', [item, item, item, item]).map((issue) => issue.kind)).toEqual(['maxItems']);
    // no group inside a group
    expect(checkProfile(withAt('workout.sessions.0.items.1.set', [item, { set: [item, item] }])).issues.map((issue) => issue.kind)).toEqual(['required', 'required']);
  });

  it('wants a scale to start below its end, also with the defaults 0 and 10', () => {
    expect(issuesAt('trackers.0.min', 10)).toEqual([{ kind: 'minNotBelowMax', path: ['trackers', 0] }]);
    expect(checkProfile(withAt('trackers.0.max', 0)).issues).toEqual([{ kind: 'minNotBelowMax', path: ['trackers', 0] }]);
    const { max: _max, ...noMax } = example.trackers[0]!;
    expect(issuesAt('trackers.0', { ...noMax, min: 10 })).toEqual([{ kind: 'minNotBelowMax', path: ['trackers', 0] }]);
    expect(issuesAt('trackers.0', { ...noMax, min: 9 })).toEqual([]);
  });
});

describe('checkProfile: kinds and links', () => {
  it('names every kind of question when the kind is not one of them', () => {
    expect(issuesAt('trackers.0.kind', 'mood')).toEqual([
      { kind: 'enum', path: ['trackers', 0, 'kind'], allowed: ['scale', 'yesno', 'number', 'numbers', 'note'] },
    ]);
  });

  it('wants two units for two numbers, and a timer of 15, 30 or 60 s', () => {
    expect(issuesAt('trackers.2.units', ['мм рт. ст.']).map((issue) => issue.kind)).toEqual(['minItems']);
    expect(issuesAt('trackers.3.timer.seconds', 45)).toEqual([{ kind: 'enum', path: ['trackers', 3, 'timer', 'seconds'], allowed: [15, 30, 60] }]);
  });

  it('takes only web addresses as links, and wants to know who gave them', () => {
    expect(issuesAt('exercises.3.source.url', 'javascript:alert(1)').map((issue) => issue.kind)).toEqual(['pattern']);
    expect(issuesAt('exercises.3.source.by', undefined)).toEqual([{ kind: 'required', path: ['exercises', 3, 'source'], key: 'by' }]);
  });

  it('takes only the eleven accents and the nine moments', () => {
    expect(issuesAt('theme.accent', 'red').map((issue) => issue.kind)).toEqual(['enum']);
    expect(issuesAt('trackers.0.ask', ['night']).map((issue) => issue.kind)).toEqual(['enum']);
    expect(issuesAt('trackers.0.ask', []).map((issue) => issue.kind)).toEqual(['minItems']);
  });
});

describe('checkProfile: ids', () => {
  it('refuses an id that repeats in its list', () => {
    expect(issuesAt('exercises.1.id', 'neck-rolls')).toContainEqual({ kind: 'duplicateId', path: ['exercises', 1, 'id'], id: 'neck-rolls' });
    expect(issuesAt('trackers.1.id', 'neck-pain')).toEqual([{ kind: 'duplicateId', path: ['trackers', 1, 'id'], id: 'neck-pain' }]);
  });

  it('lets the same id live in different lists (a level «a» and a workout «a»)', () => {
    expect(issuesAt('morningWarmup.levels.0.id', 'a')).toEqual([]);
  });

  it('refuses an exercise that is not in the catalogue, also inside a group', () => {
    expect(issuesAt('morningWarmup.levels.0.items.0.exercise', 'ghost')).toEqual([
      { kind: 'missingExercise', path: ['morningWarmup', 'levels', 0, 'items', 0, 'exercise'], id: 'ghost' },
    ]);
    expect(issuesAt('daytimeWarmup.groups.0.items.0.exercise', 'ghost')).toHaveLength(1);
    expect(issuesAt('workout.sessions.0.items.1.set.0.exercise', 'ghost')).toEqual([
      { kind: 'missingExercise', path: ['workout', 'sessions', 0, 'items', 1, 'set', 0, 'exercise'], id: 'ghost' },
    ]);
  });

  it('wants ids in small latin letters, digits and hyphens', () => {
    expect(issuesAt('trackers.0.id', 'Біль').map((issue) => issue.kind)).toEqual(['pattern']);
    expect(issuesAt('trackers.0.id', 'neck_pain-2')).toEqual([]);
  });

  it('says only that it is not an object for something that is not', () => {
    expect(checkProfile('текст').issues).toEqual([{ kind: 'type', path: [], expected: ['object'] }]);
    expect(checkProfile({ ...example, exercises: 'немає', trackers: [null] }).issues.map((issue) => issue.kind)).toEqual(
      expect.arrayContaining(['type']),
    );
  });
});
