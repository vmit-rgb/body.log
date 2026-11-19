import { describe, expect, it } from 'vitest';
import { readSettings } from '../domain/settings';
import { checkProfile } from './profile-check';
import { isLegacyProfile, upgradeProfile } from './profile-upgrade';

// Invented data only: the shape «бета 0.81» writes, never a real diary.
const OLD = {
  format: 'phys-activity-profile',
  version: 1,
  lang: 'uk',
  ui: null,
  theme: { accent: 'red', motion: { ui: false, ascii: true, vibration: false } },
  encouragement: ['вперед'],
  morningWarmup: {
    enabled: true,
    weeklyTarget: 5,
    levels: [{ id: 'l1', name: 'рівень 1', duration: '5 хв', items: [
      { exercise: 'plank', reps: '40', timed: true },
      { exercise: 'bridge', reps: '1,5', timed: true },
      { exercise: 'squat', reps: 10 },
      { exercise: 'lunge', reps: '8–10', timed: false },
      { exercise: 'squat', reps: 'довго', timed: true },
      { exercise: 'plank', reps: '', timed: true },
      { exercise: 'plank', reps: '99', timed: true, seconds: 20 },
    ] }],
  },
  daytimeWarmup: { enabled: true, weeklyTarget: 3, groups: [{ id: 'back', name: 'для спини', items: [{ exercise: 'bridge', reps: '30', timed: true }] }] },
  workout: {
    enabled: true,
    weeklyTarget: 2,
    sessions: [{ id: 'a', name: 'а', items: [
      { exercise: 'lunge', sets: 3, reps: 10, side: 'на кожну ногу', fields: ['reps'] },
      { set: [
        { exercise: 'squat', reps: '12', side: '', fields: ['weight', 'reps'], weight: 5 },
        { exercise: 'plank', seconds: 30, side: 'на кожен бік', fields: ['seconds'] },
      ] },
    ] }],
  },
  movement: { enabled: true, weeklyTarget: 3, kinds: [{ id: 'walk', name: 'прогулянка', fields: ['minutes'] }] },
  exercises: [
    { id: 'plank', name: 'планка' }, { id: 'bridge', name: 'місток' }, { id: 'squat', name: 'присід' }, { id: 'lunge', name: 'випад' },
  ],
  trackers: [{ id: 'energy', name: 'енергія', kind: 'scale', ask: ['morning'] }],
  somethingNew: { kept: true },
};

const upgraded = upgradeProfile(OLD) as typeof OLD & Record<string, unknown>;

describe('upgradeProfile: settings older than format 0.1', () => {
  it('knows them by a version that is not a text', () => {
    expect(isLegacyProfile({ version: 1 })).toBe(true);
    expect(isLegacyProfile({})).toBe(true);
    expect(isLegacyProfile({ version: '0.1' })).toBe(false);
    // the release «1» will be a text, so it is never taken for the old number
    expect(isLegacyProfile({ version: '1' })).toBe(false);
  });

  it('writes the version as "0.1" and drops the empty `ui`', () => {
    expect(upgraded.version).toBe('0.1');
    expect('ui' in upgraded).toBe(false);
    expect(upgradeProfile({ version: 1, ui: { save: 'зберегти' } })).toMatchObject({ ui: { save: 'зберегти' } });
  });

  it('turns `timed` + seconds in `reps` into `seconds`, in both warm-ups', () => {
    expect(upgraded.morningWarmup.levels[0]!.items).toEqual([
      { exercise: 'plank', seconds: 40 },
      { exercise: 'bridge', seconds: 1.5 },
      { exercise: 'squat', reps: '10' },
      { exercise: 'lunge', reps: '8–10' },
      // seconds that are not a number: the text stays as a count, as it was shown
      { exercise: 'squat', reps: 'довго' },
      { exercise: 'plank', reps: '' },
      // `seconds` already there wins
      { exercise: 'plank', seconds: 20 },
    ]);
    expect(upgraded.daytimeWarmup.groups[0]!.items).toEqual([{ exercise: 'bridge', seconds: 30 }]);
  });

  it('shows a converted timed exercise as before: «40 с»', () => {
    const before = { exercise: 'plank', reps: '', seconds: 40 };
    expect(readSettings(upgraded).morningWarmup.levels[0]!.items[0]).toEqual(before);
  });

  it('moves `side` to the end of `reps`, also inside a group; where there is no count it goes', () => {
    expect(upgraded.workout.sessions[0]!.items).toEqual([
      { exercise: 'lunge', sets: 3, reps: '10 на кожну ногу', fields: ['reps'] },
      { set: [
        { exercise: 'squat', reps: '12', fields: ['weight', 'reps'], weight: 5 },
        { exercise: 'plank', seconds: 30, fields: ['seconds'] },
      ] },
    ]);
  });

  it('turns the old `theme.motion` into «доступність» and moves a removed accent', () => {
    expect(upgraded.theme).toEqual({ accent: 'orange' });
    expect(upgraded.accessibility).toEqual({
      noMotion: true, noBackgroundMotion: false, noVibration: true, noSound: false, largerTargets: false, largerText: false, mirrored: false,
    });
    expect(upgradeProfile({ theme: { motion: false } })).toMatchObject({ theme: {}, accessibility: { noMotion: true, noVibration: false } });
    expect(upgradeProfile({ theme: { motion: true, accent: 'lime' } })).toMatchObject({ theme: { accent: 'green' }, accessibility: { noMotion: false } });
    expect(upgradeProfile({ theme: { accent: 'amber' } })).toMatchObject({ theme: { accent: 'orange' } });
    expect(upgradeProfile({ theme: { accent: 'yellow' } })).toMatchObject({ theme: { accent: 'orange' } });
    expect(upgradeProfile({ theme: { accent: 'toString' } })).toMatchObject({ theme: { accent: 'toString' } });
  });

  it('lets a stored «доступність» win over the old switch, and adds none where there was neither', () => {
    const both = upgradeProfile({ theme: { motion: { ascii: false } }, accessibility: { noBackgroundMotion: false, mirrored: true } });
    expect(both.accessibility).toMatchObject({ noBackgroundMotion: false, mirrored: true });
    expect('accessibility' in upgradeProfile({ theme: { accent: 'pink' } })).toBe(false);
    expect(upgradeProfile({ accessibility: { largerText: true } }).accessibility).toEqual({ largerText: true });
  });

  it('writes down the goal that used to be implied: on, 5 days', () => {
    expect(upgraded.goal).toEqual({ enabled: true, days: 5, done: [] });
    expect(upgradeProfile({ goal: { enabled: false, days: 3, done: ['workout'], note: 'x' } }).goal).toEqual({ enabled: false, days: 3, done: ['workout'], note: 'x' });
    expect(upgradeProfile({ goal: { days: 'п’ять' } }).goal).toEqual({ enabled: true, days: 5, done: [] });
    expect(readSettings(upgradeProfile({})).goal).toEqual({ enabled: true, days: 5, done: [], any: false });
  });

  it('keeps everything else, also what the app does not know', () => {
    expect(upgraded.somethingNew).toEqual({ kept: true });
    expect(upgraded.exercises).toBe(OLD.exercises);
    expect(upgraded.trackers).toBe(OLD.trackers);
    expect(upgraded.movement).toBe(OLD.movement);
    expect(upgraded.encouragement).toBe(OLD.encouragement);
  });

  it('does not change the settings it was given', () => {
    expect(OLD.version).toBe(1);
    expect(OLD.morningWarmup.levels[0]!.items[0]).toEqual({ exercise: 'plank', reps: '40', timed: true });
    expect(OLD.workout.sessions[0]!.items[0]).toMatchObject({ side: 'на кожну ногу', reps: 10 });
  });

  it('gives settings the strict check accepts, apart from keys it never knew and exercises shared by levels', () => {
    // F-07 is for settings pasted from now on: old settings keep their shared exercises, so old days read as before
    const checked = checkProfile(upgraded);
    expect(checked.unknown).toEqual([['somethingNew']]);
    expect(new Set(checked.issues.map((issue) => issue.kind))).toEqual(new Set(['sharedExercise']));
  });

  it('survives settings with holes and odd values', () => {
    expect(upgradeProfile({ version: 1, morningWarmup: null, workout: { sessions: 'немає' }, daytimeWarmup: { groups: [null, { items: [null, 5] }] } })).toEqual({
      version: '0.1',
      goal: { enabled: true, days: 5, done: [] },
      morningWarmup: null,
      workout: { sessions: 'немає' },
      daytimeWarmup: { groups: [null, { items: [null, 5] }] },
    });
    expect(upgradeProfile({ theme: 'темна' })).toMatchObject({ theme: 'темна' });
  });
});

describe('upgradeProfile: settings already in format 0.1', () => {
  it('returns them untouched, the same object', () => {
    const now = { version: '0.1', theme: { motion: false }, morningWarmup: { levels: [{ items: [{ exercise: 'a', timed: true }] }] } };
    expect(upgradeProfile(now)).toBe(now);
  });

  it('is done once: converting the result again changes nothing', () => {
    expect(upgradeProfile(upgraded)).toBe(upgraded);
  });
});
