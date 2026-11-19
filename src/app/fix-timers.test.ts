import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DayKey } from '../domain/dates';
import { parseDiary, serializeDiary, type Diary, type JsonObject } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';
import { withMoved, withOwnLevelExercises } from '../domain/sections-edit';
import { checkProfile } from '../format/profile-check';
import example from '../format/example-profile.json';
import { stopwatchTime } from '../home/session';
import { readPaste } from '../paste/read';
import { PROMPT } from '../prompt/prompt';
import { BEFORE_SPLIT_KEY, DIARY_KEY, diaryStore, type DiaryStore } from '../storage/store';
import { mountToast } from '../ui/toast';
import { SAVE_DELAY_MS, startApp } from './app';
import { fakeDevice, openSections } from './test-env';

/*
 * Wave 6 (ux-audit/FIXES-PLAN.md): F-05 «3 · 2 · 1» before a stopwatch,
 * then the count up as before; F-06 the start with vibration, sound and the
 * flash; F-07 one exercise id in one morning level only. The pulse timer's
 * new row is in home/calendar.test.ts. Invented data only.
 */

const TODAY = '2026-11-11' as DayKey;

const profile = {
  morningWarmup: { enabled: true, levels: [{ id: 'l1', name: 'рівень 1', items: [{ exercise: 't', seconds: 30 }] }] },
  workout: { enabled: true, sessions: [{ id: 's', name: 'а', items: [{ exercise: 'p', fields: ['seconds'] }] }] },
  exercises: [{ id: 't', name: 'планка' }, { id: 'p', name: 'стійка' }],
  trackers: [],
};

let host: HTMLElement;
let store: DiaryStore;
let vibrate: ReturnType<typeof vi.fn>;

function start(settings: Diary['profile'] = profile): void {
  document.body.innerHTML = '<main id="app"></main>';
  host = document.querySelector<HTMLElement>('#app')!;
  localStorage.clear();
  store = diaryStore(localStorage, () => new Date('2026-11-11T08:00:00Z'));
  store.save({ profile: settings, days: {} });
  startApp({
    host,
    store,
    browser: { chosen: () => true, choose: () => {} },
    platform: 'android',
    installed: true,
    toast: mountToast(document.body),
    today: () => TODAY,
    sections: openSections,
    ...fakeDevice().env,
    onDiary: () => {},
    whenHidden: () => {},
  });
}

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => {
  const element = host.querySelector<T>(selector);
  if (!element) throw new Error(`not on screen: ${selector}`);
  return element;
};
const round = () => $('.ex-check .sw');
const button = () => $<HTMLButtonElement>('.ex-check .sw__btn');
const time = () => $('.ex-check [data-sw-time]').textContent;
const heard = () => document.querySelector('#announcer')?.textContent;
const flashes = () => document.body.querySelectorAll('.flash').length;
const stored = () => {
  vi.advanceTimersByTime(SAVE_DELAY_MS);
  return store.load()!.days[TODAY];
};

beforeEach(() => {
  vi.useFakeTimers();
  vibrate = vi.fn(() => true);
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
  start();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('F-05: a stopwatch starts with «3 · 2 · 1», then counts up as before', () => {
  it('shows 3, 2, 1, then counts up from zero; ■ saves whole seconds', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    button().click();
    expect(round().dataset.state).toBe('running');
    expect(time()).toBe('3');
    expect(button().getAttribute('aria-label')).toBe('зупинити відлік і не запускати, 1');
    expect(heard()).toBe('приготуйся');
    now.mockReturnValue(2_100);
    vi.advanceTimersByTime(100);
    expect(time()).toBe('2');
    now.mockReturnValue(4_000);
    vi.advanceTimersByTime(2_900);
    expect(time()).toBe('00.00.00');
    expect(button().getAttribute('aria-label')).toBe('зупинити й зберегти, 1');
    expect(heard()).toBe('почали');
    now.mockReturnValue(16_000);
    vi.advanceTimersByTime(100);
    expect(time()).toBe('00.12.00');
    button().click();
    expect(stored()!.mw.times.t).toEqual([12]);
  });

  it('■ during «3 · 2 · 1» calls the start off: nothing saved, no start signal, back to ▶', () => {
    button().click();
    vi.advanceTimersByTime(1_500);
    button().click();
    expect(round().dataset.state).toBe('default');
    expect(time()).toBe('00.00.00');
    vi.advanceTimersByTime(5_000);
    expect(vibrate).not.toHaveBeenCalled();
    expect(flashes()).toBe(0);
    expect(stored()).toBeUndefined();
  });

  it('a stopwatch called off and started again signals once, 3 s after the second ▶', () => {
    button().click();
    vi.advanceTimersByTime(1_000);
    button().click();
    button().click();
    vi.advanceTimersByTime(2_500);
    expect(vibrate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('a timed workout set does the same', () => {
    $('.sec-pick, [data-act="pick"]').click();
    $<HTMLButtonElement>('.wo-ex [aria-label="запустити секундомір, 1"]').click();
    expect($('.wo-ex [data-sw-time]').textContent).toBe('3');
    vi.advanceTimersByTime(3_000);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('counts the time as «3», «2», «1» before the start and as the stopwatch after it', () => {
    expect(stopwatchTime(3_000, 0)).toBe('3');
    expect(stopwatchTime(3_000, 1)).toBe('3');
    expect(stopwatchTime(3_000, 1_000)).toBe('2');
    expect(stopwatchTime(3_000, 2_999)).toBe('1');
    expect(stopwatchTime(3_000, 3_000)).toBe('00.00.00');
    expect(stopwatchTime(3_000, 4_250)).toBe('00.01.25');
  });
});

describe('F-06: the start of a stopwatch with vibration, sound and the flash', () => {
  it('buzzes and flashes when the count starts, not at ▶', () => {
    button().click();
    expect(vibrate).not.toHaveBeenCalled();
    expect(flashes()).toBe(0);
    vi.advanceTimersByTime(3_000);
    expect(vibrate).toHaveBeenCalledWith(150);
    expect(flashes()).toBe(1);
  });

  it('with «вимкнути вібрацію» and «вимкнути звук» the flash still shows the start', () => {
    start({ ...profile, accessibility: { noVibration: true, noSound: true } });
    button().click();
    vi.advanceTimersByTime(3_000);
    expect(vibrate).not.toHaveBeenCalled();
    expect(flashes()).toBe(1);
  });
});

describe('F-07: one exercise in one morning level only', () => {
  const levels = (items: readonly (readonly string[])[]) => ({
    ...example,
    morningWarmup: { ...example.morningWarmup, levels: items.map((ids, i) => ({ id: `l${i}`, name: `рівень ${i + 1}`, items: ids.map((exercise) => ({ exercise, reps: '5' })) })) },
  });

  it('the strict check refuses the same exercise in two levels and twice in one', () => {
    expect(checkProfile(levels([['plank'], ['plank']])).issues).toEqual([
      { kind: 'sharedExercise', path: ['morningWarmup', 'levels', 1, 'items', 0, 'exercise'], id: 'plank', level: 1 },
    ]);
    expect(checkProfile(levels([['neck-rolls', 'neck-rolls']])).issues.map((issue) => issue.kind)).toEqual(['sharedExercise']);
    expect(checkProfile(levels([['plank'], ['neck-rolls']])).issues).toEqual([]);
  });

  it('says it in words for the person and with the place for the AI', () => {
    const read = readPaste(JSON.stringify(levels([['plank'], ['plank']])));
    expect(read.kind).toBe('refused');
    expect(JSON.stringify(read)).toContain('"errors"');
    const text = JSON.stringify(read);
    expect(text).toContain('вправа \\"plank\\" вже є в рівні 1. у кожного рівня свої вправи: заведи в каталозі окрему вправу з іншим id (наприклад \\"plank-2\\")');
    expect(text).toContain('morningWarmup.levels[1].items[0].exercise');
  });

  it('the same exercise in the daytime warm-up and a workout is still fine', () => {
    const shared = { ...example, daytimeWarmup: { ...example.daytimeWarmup, groups: [{ id: 'g', name: 'зона', items: [{ exercise: 'plank', seconds: 20 }] }] } };
    expect(checkProfile(shared).issues).toEqual([]);
  });

  it('«почати без ШІ» gives each level its own exercises, under the same names', () => {
    expect(checkProfile(EXAMPLE_DIARY.profile).issues).toEqual([]);
    const settings = EXAMPLE_DIARY.profile as { exercises: { id: string; name: string }[]; morningWarmup: { levels: { items: { exercise: string }[] }[] } };
    const [one, two] = settings.morningWarmup.levels.map((level) => level.items.map((item) => item.exercise));
    expect(one!.filter((id) => two!.includes(id))).toEqual([]);
    const name = (id: string) => settings.exercises.find((exercise) => exercise.id === id)!.name;
    expect(two!.slice(0, 2).map(name)).toEqual(one!.map(name));
  });

  it('the prompt tells the AI, through the schema it carries', () => {
    expect(PROMPT.text).toContain('Одна вправа (id з каталогу) може бути лише в одному рівні й лише раз');
  });

  describe('in the settings: an exercise taken to another level becomes that level\'s own', () => {
    const settings = {
      morningWarmup: { enabled: true, levels: [
        { id: 'l1', name: 'рівень 1', items: [{ exercise: 'squat', reps: '10' }] },
        { id: 'l2', name: 'рівень 2', items: [{ exercise: 'neck', reps: '5' }] },
      ] },
      exercises: [{ id: 'squat', name: 'присід', how: 'спина рівна', source: { type: 'user' } }, { id: 'neck', name: 'шия', how: '', source: { type: 'user' } }],
    } as unknown as JsonObject;
    type Moved = { exercises: { id: string; name: string; how: string }[]; morningWarmup: { levels: { items: { exercise: string; reps: string }[] }[] } };

    it('gets a new id with the same name, «як робити» and reps; the old id stays for old days', () => {
      const moved = withMoved({ list: 'morningWarmup.levels.0.items', index: 0 }, { list: 'morningWarmup.levels.1.items', before: null })(settings) as unknown as Moved;
      expect(moved.morningWarmup.levels[0]!.items).toEqual([]);
      const item = moved.morningWarmup.levels[1]!.items[1]!;
      expect(item.exercise).not.toBe('squat');
      expect(item.reps).toBe('10');
      expect(moved.exercises.find((exercise) => exercise.id === item.exercise)).toMatchObject({ name: 'присід', how: 'спина рівна' });
      expect(moved.exercises.some((exercise) => exercise.id === 'squat')).toBe(true);
    });

    it('keeps its id when it moves inside its level', () => {
      const twice = { ...settings, morningWarmup: { enabled: true, levels: [{ id: 'l1', items: [{ exercise: 'squat' }, { exercise: 'neck' }] }] } } as unknown as JsonObject;
      const moved = withMoved({ list: 'morningWarmup.levels.0.items', index: 1 }, { list: 'morningWarmup.levels.0.items', before: 0 })(twice) as unknown as Moved;
      expect(moved.morningWarmup.levels[0]!.items.map((item) => item.exercise)).toEqual(['neck', 'squat']);
      expect(moved.exercises).toHaveLength(2);
    });
  });
});

describe('F-07 once at launch: exercises shared by morning levels are split (Olesia, 2026-11-17)', () => {
  const shared = {
    morningWarmup: { enabled: true, levels: [
      { id: 'l1', name: 'рівень 1', items: [{ exercise: 'squat', reps: '10' }, { exercise: 'neck', reps: '5' }] },
      { id: 'l2', name: 'рівень 2', items: [{ exercise: 'squat', reps: '15' }, { exercise: 'plank', seconds: 30 }, { exercise: 'squat', reps: '5' }] },
    ] },
    daytimeWarmup: { enabled: true, groups: [{ id: 'g', name: 'зона', items: [{ exercise: 'squat', reps: '3' }] }] },
    exercises: [
      { id: 'squat', name: 'присід', how: 'спина рівна', source: { type: 'user' } },
      { id: 'neck', name: 'шия', how: '', source: { type: 'user' } },
      { id: 'plank', name: 'планка', how: '', source: { type: 'user' } },
    ],
  } as unknown as JsonObject;
  type Split = { exercises: { id: string; name: string; how: string }[]; morningWarmup: { levels: { items: { exercise: string; reps?: string }[] }[] }; daytimeWarmup: { groups: { items: { exercise: string }[] }[] } };

  it('keeps the first place of an exercise and gives every next one its own copy', () => {
    const split = withOwnLevelExercises(shared) as unknown as Split;
    const ids = split.morningWarmup.levels.map((level) => level.items.map((item) => item.exercise));
    expect(ids[0]).toEqual(['squat', 'neck']);
    expect(ids[1]![0]).not.toBe('squat');
    expect(ids[1]![1]).toBe('plank');
    expect(ids[1]![2]).not.toBe('squat');
    expect(new Set(ids.flat()).size).toBe(5);
    for (const id of [ids[1]![0]!, ids[1]![2]!]) {
      expect(split.exercises.find((exercise) => exercise.id === id)).toMatchObject({ name: 'присід', how: 'спина рівна' });
    }
    expect(split.morningWarmup.levels[1]!.items[0]!.reps).toBe('15');
    // only the morning levels: the daytime warm-up keeps its exercise
    expect(split.daytimeWarmup.groups[0]!.items[0]!.exercise).toBe('squat');
    expect(checkProfile(split).issues.filter((issue) => issue.kind === 'sharedExercise')).toEqual([]);
  });

  it('changes nothing when every level already has its own exercises', () => {
    expect(withOwnLevelExercises(EXAMPLE_DIARY.profile)).toBeNull();
    expect(withOwnLevelExercises({} as JsonObject)).toBeNull();
  });

  it('stores the split once, keeps the diary as it was aside, and leaves the old days as they are', () => {
    const day = '2026-11-01' as DayKey;
    const before = { profile: shared, days: { [day]: { mw: { ticks: ['squat'] } } } };
    localStorage.clear();
    localStorage.setItem(DIARY_KEY, JSON.stringify({ ...JSON.parse(serializeDiary({ profile: shared, days: {} }, new Date())), days: before.days }));
    const original = localStorage.getItem(DIARY_KEY);
    const phone = diaryStore(localStorage, () => new Date('2026-11-17T20:00:00Z'));
    const loaded = phone.load()!;
    const levels = (loaded.profile as unknown as Split).morningWarmup.levels;
    expect(levels[1]!.items[0]!.exercise).not.toBe('squat');
    expect(localStorage.getItem(BEFORE_SPLIT_KEY)).toBe(original);
    const stored = localStorage.getItem(DIARY_KEY)!;
    expect(stored).not.toBe(original);
    expect(phone.load()!.days[day]!.mw.ticks).toEqual(['squat']);
    // a second launch has nothing to split and writes nothing
    expect(localStorage.getItem(DIARY_KEY)).toBe(stored);
  });

  it('a copy restored from before wave 6 comes in split as well', () => {
    const copy = parseDiary(serializeDiary({ profile: shared, days: {} }, new Date()))!;
    const ids = (copy.profile as unknown as Split).morningWarmup.levels.flatMap((level) => level.items.map((item) => item.exercise));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
