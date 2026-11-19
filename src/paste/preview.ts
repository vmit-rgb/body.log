import type { Accent } from '../domain/accents';
import type { JsonObject } from '../domain/diary';
import { goalKinds } from '../domain/progress';
import { ACCESSIBILITY_KEYS, ACTIVITY_KINDS, readSettings, type AccessibilityKey, type ActivityKind, type Settings } from '../domain/settings';
import { t } from '../i18n/lang';

/*
 * «ось що зміниться»: what a paste adds, changes and removes, by the names
 * the person knows (COPY.md «Pasting settings»). Entries are matched by
 * id, so a renamed exercise is «змінено», not removed and added. The
 * first settings on a phone have nothing to compare with: they get a
 * short summary instead. Texts: Нитка's drafts.
 */

export interface Changes {
  /** The first settings on this phone: `added` is a summary, the other two are empty. */
  readonly first: boolean;
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
}

/** Names the screens already use (screens/settings.ts), handed in so this module stays free of screens. */
export interface PreviewNames {
  readonly accents: Readonly<Record<Accent, string>>;
  readonly accessibility: Readonly<Record<AccessibilityKey, string>>;
}

/** How many lines one group lists before «і ще N». */
export const GROUP_LINES = 12;

const KIND_NAMES: Record<ActivityKind, string> = {
  morningWarmup: t('ранкова розминка'), daytimeWarmup: t('денна розминка'), workout: t('тренування'), movement: t('рух'),
};

interface Entry { readonly id: string; readonly name: string }
type ListOf = readonly [what: string, many: string, read: (settings: Settings) => readonly Entry[], ordered: boolean];

const LISTS: readonly ListOf[] = [
  [t('вправа'), t('вправ у каталозі'), (s) => s.exercises, false],
  [t('питання про самопочуття'), t('питань про самопочуття'), (s) => s.trackers, true],
  [t('рівень ранкової розминки'), t('рівнів ранкової розминки'), (s) => s.morningWarmup.levels, true],
  [t('зона денної розминки'), t('зон денної розминки'), (s) => s.daytimeWarmup.groups, true],
  [t('тренування'), t('тренувань'), (s) => s.workout.sessions, true],
  [t('рух'), t('видів руху'), (s) => s.movement.kinds, true],
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const label = (what: string, entry: Entry) => `${what}: ${entry.name || entry.id}`;
const capped = (lines: string[]) => (lines.length > GROUP_LINES ? [...lines.slice(0, GROUP_LINES), t('і ще {n}', { n: lines.length - GROUP_LINES })] : lines);

/** With two or more sections in the goal, the line says how a day counts (Olesia, 2026-11-19: the AI promised «any» while the app counted «all»). */
const goalMode = (settings: Settings) => (goalKinds(settings).length > 1 ? (settings.goal.any ? t(', будь-яка активність') : t(', усе обране')) : '');
const goalLine = (settings: Settings) => `${t('тижнева ціль: днів на тиждень —')} ${settings.goal.days}${goalMode(settings)}`;
const activityLine = (settings: Settings, kind: ActivityKind) =>
  `${KIND_NAMES[kind]}: ${settings[kind].enabled ? `${t('показується, ціль днів на тиждень —')} ${settings[kind].weeklyTarget}` : t('вимкнено')}`;

function accessibilityLine(settings: Settings, names: PreviewNames): string {
  const on = ACCESSIBILITY_KEYS.filter((key) => settings.accessibility[key]).map((key) => names.accessibility[key]);
  return `${t('доступність:')} ${on.length ? on.join(', ') : t('стандартно')}`;
}

function summary(after: Settings, names: PreviewNames): string[] {
  const lines = ACTIVITY_KINDS.filter((kind) => after[kind].enabled).map((kind) => activityLine(after, kind));
  for (const [, many, read] of LISTS) {
    if (read(after).length) lines.push(`${many}: ${read(after).length}`);
  }
  lines.push(after.goal.enabled ? goalLine(after) : t('без тижневої цілі'));
  lines.push(`${t('акцентний колір:')} ${names.accents[after.accent]}`);
  if (ACCESSIBILITY_KEYS.some((key) => after.accessibility[key])) lines.push(accessibilityLine(after, names));
  return lines;
}

/** The order of the entries both lists have. */
const sharedOrder = (list: readonly Entry[], other: readonly Entry[]) =>
  list.map((entry) => entry.id).filter((id) => other.some((entry) => entry.id === id)).join('\n');

export function describeChanges(beforeProfile: JsonObject | null, afterProfile: JsonObject, names: PreviewNames): Changes {
  const after = readSettings(afterProfile);
  if (!beforeProfile) return { first: true, added: summary(after, names), changed: [], removed: [] };
  const before = readSettings(beforeProfile);
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];

  if (before.goal.enabled !== after.goal.enabled) (after.goal.enabled ? added : removed).push(after.goal.enabled ? goalLine(after) : t('тижнева ціль'));
  else if (after.goal.enabled && !same(before.goal, after.goal)) changed.push(goalLine(after));
  if (!same(before.encouragement, after.encouragement)) changed.push(t('підбадьорливі фрази'));
  if (before.accent !== after.accent) changed.push(`${t('акцентний колір:')} ${names.accents[after.accent]}`);
  if (!same(before.accessibility, after.accessibility)) changed.push(accessibilityLine(after, names));
  for (const kind of ACTIVITY_KINDS) {
    if (before[kind].enabled !== after[kind].enabled || before[kind].weeklyTarget !== after[kind].weeklyTarget) changed.push(activityLine(after, kind));
    else if (before[kind].hint !== after[kind].hint) changed.push(`${KIND_NAMES[kind]}${t(': підказка')}`);
  }

  for (const [what, many, read, ordered] of LISTS) {
    const was = read(before);
    const now = read(after);
    for (const entry of now) {
      const old = was.find((other) => other.id === entry.id);
      if (!old) added.push(label(what, entry));
      else if (!same(old, entry)) changed.push(label(what, entry));
    }
    for (const entry of was) {
      if (!now.some((other) => other.id === entry.id)) removed.push(label(what, entry));
    }
    if (ordered && sharedOrder(was, now) !== sharedOrder(now, was)) changed.push(`${t('порядок:')} ${many}`);
  }
  return { first: false, added: capped(added), changed: capped(changed), removed: capped(removed) };
}

/** Whether the paste would change anything at all. */
export const changesNothing = (changes: Changes) =>
  !changes.first && !changes.added.length && !changes.changed.length && !changes.removed.length;
