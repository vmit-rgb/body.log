import type { Accent } from './accents';
import type { JsonObject } from './diary';
import { readAccessibility, readSettings, type AccessibilityKey, type ActivityKind, type PulseSeconds } from './settings';

/*
 * Changes the settings screen makes to the stored profile (PROFILE-FORMAT.md).
 * Each one returns a new profile and keeps every field it doesn't touch, also
 * the ones this app doesn't know yet, so a profile from the AI loses nothing.
 */

export type ProfileEdit = (profile: JsonObject) => JsonObject;

const raw = (value: unknown): JsonObject => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : {});

export interface GoalChange {
  readonly enabled?: boolean;
  readonly days?: number;
  readonly done?: readonly ActivityKind[];
  readonly any?: boolean;
}

/**
 * The main goal: counted or not, days per week (0–7), what makes a day «зроблено»,
 * any one of those sections or all of them. A goal made here from nothing starts
 * with «будь-яка активність» on (Olesia, 2026-11-19); a stored goal without `any`
 * keeps counting all sections and gets no `any` until the checkbox is touched.
 */
export const withGoal = (change: GoalChange): ProfileEdit => (profile) => {
  const stored = raw(profile.goal);
  const fresh = typeof profile.goal !== 'object' || profile.goal === null || Array.isArray(profile.goal);
  const goal = { ...readSettings(profile).goal, ...(fresh ? { any: true } : {}), ...change };
  const any = goal.any || 'any' in stored ? { any: goal.any } : {};
  return { ...profile, goal: { ...stored, enabled: goal.enabled, days: Math.min(7, Math.max(0, goal.days)), done: goal.done, ...any } };
};

/** The encouraging phrases, in order; empty ones are dropped when saved (see `cleanForSave`). */
export const withEncouragement = (phrases: readonly string[]): ProfileEdit => (profile) => ({ ...profile, encouragement: [...phrases] });

export const withAccent = (accent: Accent): ProfileEdit => (profile) => ({ ...profile, theme: { ...raw(profile.theme), accent } });

/** One «доступність» checkbox. */
export const withAccessibility = (key: AccessibilityKey, on: boolean): ProfileEdit => (profile) =>
  ({ ...profile, accessibility: { ...readAccessibility(profile), [key]: on } });

/** The pulse timer on a one-number tracker: `timer: { enabled, seconds }`. */
export const withPulseTimer = (trackerId: string, enabled: boolean, seconds: PulseSeconds): ProfileEdit => (profile) => ({
  ...profile,
  trackers: (Array.isArray(profile.trackers) ? profile.trackers : []).map((tracker: unknown) =>
    raw(tracker).id === trackerId ? { ...raw(tracker), timer: { enabled, seconds } } : tracker),
});

/** Before saving: phrases left empty (e.g. «додати фразу» and nothing typed) are not kept. */
export const cleanForSave: ProfileEdit = (profile) => Array.isArray(profile.encouragement)
  ? { ...profile, encouragement: profile.encouragement.filter((phrase) => typeof phrase !== 'string' || phrase.trim() !== '') }
  : profile;
