import { describe, expect, it } from 'vitest';
import type { JsonObject } from './diary';
import { EXAMPLE_DIARY } from './examples';
import { cleanForSave, withAccent, withAccessibility, withEncouragement, withGoal, withPulseTimer } from './profile-edit';
import { readAccessibility, readSettings } from './settings';

// Invented data only.
const PROFILE: JsonObject = { ...EXAMPLE_DIARY.profile, unknownField: { kept: true } };

describe('profile edits keep what they don’t touch', () => {
  it('changes the goal and keeps the rest of it', () => {
    const next = withGoal({ days: 6 })({ ...PROFILE, goal: { enabled: true, days: 5, done: ['workout'], note: 'з ШІ' } });
    expect(next.goal).toEqual({ enabled: true, days: 6, done: ['workout'], note: 'з ШІ' });
    expect(next.unknownField).toEqual({ kept: true });
  });

  it('a missing goal is off; switching it on starts at 5 days, and the days stay within 0–7', () => {
    const { goal: _goal, ...noGoal } = PROFILE;
    expect(withGoal({ enabled: true })(noGoal).goal).toEqual({ enabled: true, days: 5, done: [], any: true });
    expect(withGoal({ days: 9 })(noGoal).goal).toEqual({ enabled: false, days: 7, done: [], any: true });
    expect(withGoal({ days: -1, enabled: false })(noGoal).goal).toEqual({ enabled: false, days: 0, done: [], any: true });
  });

  it('sets the phrases, the accent and the pulse timer', () => {
    expect(withEncouragement(['а', 'б'])(PROFILE).encouragement).toEqual(['а', 'б']);
    expect(withAccent('mint')({ ...PROFILE, theme: { accent: 'pink', other: 1 } }).theme).toEqual({ accent: 'mint', other: 1 });
    const timed = withPulseTimer('pulse', false, 60)(PROFILE);
    const trackers = timed.trackers as JsonObject[];
    expect(trackers.find((t) => t.id === 'pulse')!.timer).toEqual({ enabled: false, seconds: 60 });
    expect(trackers.find((t) => t.id === 'energy')).toEqual((PROFILE.trackers as JsonObject[]).find((t) => t.id === 'energy'));
    expect(withPulseTimer('pulse', true, 15)({ ...PROFILE, trackers: undefined }).trackers).toEqual([]);
  });

  it('writes «доступність» whole and leaves the theme alone', () => {
    const next = withAccessibility('largerText', true)({ ...PROFILE, accessibility: { noMotion: true } });
    expect(next.theme).toEqual(PROFILE.theme);
    expect(next.accessibility).toEqual({
      noMotion: true, noBackgroundMotion: false, noVibration: false, noSound: false, largerTargets: false, largerText: true, mirrored: false,
      keepToasts: false, showDots: false,
    });
  });

  it('drops empty phrases before saving and leaves a profile without phrases alone', () => {
    expect(cleanForSave({ ...PROFILE, encouragement: ['а', ' ', '', 3] }).encouragement).toEqual(['а', 3]);
    const { encouragement: _e, ...none } = PROFILE;
    expect(cleanForSave(none)).toBe(none);
  });
});

describe('readAccessibility', () => {
  it('is all off by default', () => {
    expect(Object.values(readSettings({}).accessibility).every((on) => on === false)).toBe(true);
  });

  it('no longer reads the old `theme.motion` (converted when old settings are read: format/profile-upgrade.test.ts)', () => {
    expect(readAccessibility({ theme: { motion: false } }).noMotion).toBe(false);
  });

  it('reads only true as on', () => {
    const a = readAccessibility({ accessibility: { noBackgroundMotion: false, mirrored: true, noSound: 'так' } });
    expect(a.noBackgroundMotion).toBe(false);
    expect(a.mirrored).toBe(true);
    expect(a.noSound).toBe(false);
  });
});

describe('profile edits on odd stored values', () => {
  it('treats a goal or theme that is a list or null as missing', () => {
    expect(withGoal({ days: 3 })({ goal: ['x'] }).goal).toEqual({ enabled: false, days: 3, done: [], any: true });
    expect(withAccent('gray')({ theme: null }).theme).toEqual({ accent: 'gray' });
    expect(withAccent('gray')({ theme: ['blue'] }).theme).toEqual({ accent: 'gray' });
  });
});

describe('withGoal and «будь-яка активність» (Olesia, 2026-11-19)', () => {
  it('a stored goal without `any` keeps counting all and gets no `any` from other edits', () => {
    const next = withGoal({ days: 4 })({ goal: { enabled: true, days: 5, done: ['workout', 'movement'] } });
    expect(next.goal).toEqual({ enabled: true, days: 4, done: ['workout', 'movement'] });
    expect(withGoal({ enabled: false })({ goal: { enabled: true, days: 5, done: [] } }).goal).not.toHaveProperty('any');
  });

  it('the checkbox writes `any`, and unticking it keeps an explicit false', () => {
    const on = withGoal({ any: true })({ goal: { enabled: true, days: 5, done: ['workout', 'movement'] } });
    expect(on.goal).toMatchObject({ any: true });
    expect(withGoal({ any: false })(on).goal).toMatchObject({ any: false });
    expect(withGoal({ days: 2 })(on).goal).toMatchObject({ any: true, days: 2 });
  });
});
