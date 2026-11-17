import { beforeEach, describe, expect, it } from 'vitest';
import { readDay } from '../domain/day';
import { parseDiary, serializeDiary } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';
import type { DayKey } from '../domain/dates';
import { backupMemory, BEFORE_FORMAT_KEY, browserChoice, diaryStore, DIARY_KEY, FINISHED_KEY, sectionMemory, storageFor, themeMemory, tipMemory, type KeyValue } from './store';

const now = () => new Date('2026-11-09T08:00:00.000Z');

describe('diaryStore', () => {
  beforeEach(() => localStorage.clear());

  it('has nothing on the first launch', () => {
    expect(diaryStore(localStorage, now).load()).toBeNull();
  });

  it('gives back what it saved', () => {
    const store = diaryStore(localStorage, now);
    store.save(EXAMPLE_DIARY);
    expect(diaryStore(localStorage, now).load()).toEqual(EXAMPLE_DIARY);
  });

  it('keeps the diary as a copy that «бета 0.81» can restore', () => {
    diaryStore(localStorage, now).save(EXAMPLE_DIARY);
    expect(JSON.parse(localStorage.getItem(DIARY_KEY)!)).toMatchObject({ format: 'phys-activity-backup', version: 1 });
  });

  it('reads a broken entry as nothing, and keeps it aside before writing over it', () => {
    localStorage.setItem(DIARY_KEY, '{ broken');
    const store = diaryStore(localStorage, now);
    expect(store.load()).toBeNull();
    store.save(EXAMPLE_DIARY);
    expect(localStorage.getItem(`${DIARY_KEY}/unreadable`)).toBe('{ broken');
    expect(store.load()).toEqual(EXAMPLE_DIARY);
  });

  it('hands out an entry it cannot read, as it is stored (D-02)', () => {
    const store = diaryStore(localStorage, now);
    expect(store.unreadable()).toBeNull();
    localStorage.setItem(DIARY_KEY, '   ');
    expect(store.unreadable()).toBeNull();
    localStorage.setItem(DIARY_KEY, '{ broken');
    expect(store.unreadable()).toBe('{ broken');
    // a copy from a format this app doesn't know yet is not a first start either
    localStorage.setItem(DIARY_KEY, '{"format":"phys-activity-backup","version":2,"profile":{},"days":{}}');
    expect(store.unreadable()).toContain('"version":2');
    store.save(EXAMPLE_DIARY);
    expect(store.unreadable()).toBeNull();
  });

  it('does not keep a readable entry aside', () => {
    localStorage.setItem(DIARY_KEY, serializeDiary(EXAMPLE_DIARY, now()));
    diaryStore(localStorage, now).save(EXAMPLE_DIARY);
    expect(localStorage.getItem(`${DIARY_KEY}/unreadable`)).toBeNull();
    expect(parseDiary(localStorage.getItem(DIARY_KEY)!)).toEqual(EXAMPLE_DIARY);
  });

  it('lets a full storage fail loudly, so the screen can say so', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
    expect(() => diaryStore(full, now).save(EXAMPLE_DIARY)).toThrow('QuotaExceededError');
  });
});

// Invented data only: a diary shaped like the one «бета 0.81» leaves, with the old `timed`, `side` and `theme.motion`.
const OLD_DIARY = JSON.stringify({
  format: 'phys-activity-backup',
  version: 1,
  savedAt: '2026-11-08T10:00:00.000Z',
  app: 'бета 0.81',
  profile: {
    format: 'phys-activity-profile',
    version: 1,
    theme: { accent: 'lime', motion: false },
    morningWarmup: { enabled: true, weeklyTarget: 5, levels: [{ id: 'l1', name: 'рівень 1', items: [{ exercise: 'plank', reps: '40', timed: true }] }] },
    workout: { enabled: true, weeklyTarget: 2, sessions: [{ id: 'a', name: 'а', items: [{ exercise: 'lunge', sets: 3, reps: 10, side: 'на кожну ногу', fields: ['reps'] }] }] },
    exercises: [{ id: 'plank', name: 'планка' }, { id: 'lunge', name: 'випад' }],
  },
  days: { '2026-11-07': { v: 2, date: '2026-11-07', note: 'вправа 1', mw: { ticks: ['l1|plank'] } } },
});

describe('diaryStore: settings older than format 0.1', () => {
  beforeEach(() => localStorage.clear());

  const CONVERTED = {
    format: 'phys-activity-profile',
    version: '0.1',
    theme: { accent: 'green' },
    accessibility: { noMotion: true, noBackgroundMotion: false, noVibration: false, noSound: false, largerTargets: false, largerText: false, mirrored: false },
    goal: { enabled: true, days: 5, done: [] },
    morningWarmup: { enabled: true, weeklyTarget: 5, levels: [{ id: 'l1', name: 'рівень 1', items: [{ exercise: 'plank', seconds: 40 }] }] },
    workout: { enabled: true, weeklyTarget: 2, sessions: [{ id: 'a', name: 'а', items: [{ exercise: 'lunge', sets: 3, reps: '10 на кожну ногу', fields: ['reps'] }] }] },
    exercises: [{ id: 'plank', name: 'планка' }, { id: 'lunge', name: 'випад' }],
  };

  it('converts them on the first read, stores them converted and keeps the entry as it was aside', () => {
    localStorage.setItem(DIARY_KEY, OLD_DIARY);
    const diary = diaryStore(localStorage, now).load()!;
    expect(diary.profile).toEqual(CONVERTED);
    expect(JSON.parse(localStorage.getItem(DIARY_KEY)!).profile).toEqual(CONVERTED);
    expect(localStorage.getItem(BEFORE_FORMAT_KEY)).toBe(OLD_DIARY);
  });

  it('leaves the days exactly as they were', () => {
    localStorage.setItem(DIARY_KEY, OLD_DIARY);
    const before = parseDiary(OLD_DIARY)!.days;
    expect(Object.keys(before)).toEqual(['2026-11-07']);
    expect(diaryStore(localStorage, now).load()!.days).toEqual(before);
    expect(parseDiary(localStorage.getItem(DIARY_KEY)!)!.days).toEqual(before);
    expect(JSON.parse(localStorage.getItem(DIARY_KEY)!).days['2026-11-07']).toMatchObject({ note: 'вправа 1' });
  });

  it('does it once: the second read writes nothing', () => {
    localStorage.setItem(DIARY_KEY, OLD_DIARY);
    diaryStore(localStorage, now).load();
    const afterFirst = localStorage.getItem(DIARY_KEY);
    const writes: string[] = [];
    const watched: KeyValue = { getItem: (key) => localStorage.getItem(key), setItem: (key) => void writes.push(key), removeItem: () => {} };
    expect(diaryStore(watched, now).load()!.profile).toEqual(CONVERTED);
    expect(writes).toEqual([]);
    expect(localStorage.getItem(DIARY_KEY)).toBe(afterFirst);
  });

  it('does not touch a diary already in format 0.1', () => {
    diaryStore(localStorage, now).save(EXAMPLE_DIARY);
    const stored = localStorage.getItem(DIARY_KEY);
    expect(diaryStore(localStorage, now).load()).toEqual(EXAMPLE_DIARY);
    expect(localStorage.getItem(DIARY_KEY)).toBe(stored);
    expect(localStorage.getItem(BEFORE_FORMAT_KEY)).toBeNull();
  });

  it('still reads them converted when the phone has no room to store the conversion', () => {
    const full: KeyValue = { getItem: (key) => (key === DIARY_KEY ? OLD_DIARY : null), setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
    expect(diaryStore(full, now).load()!.profile).toEqual(CONVERTED);
  });

  it('never stores the conversion without the entry as it was set aside first', () => {
    const kept = new Map([[DIARY_KEY, OLD_DIARY]]);
    const noRoomAside: KeyValue = {
      getItem: (key) => kept.get(key) ?? null,
      setItem(key, value) {
        if (key === BEFORE_FORMAT_KEY) throw new Error('QuotaExceededError');
        kept.set(key, value);
      },
      removeItem: () => {},
    };
    diaryStore(noRoomAside, now).load();
    expect(kept.get(DIARY_KEY)).toBe(OLD_DIARY);
  });
});

describe('browserChoice («подивитися тут, без встановлення»)', () => {
  beforeEach(() => localStorage.clear());

  it('is off until the person picks it, then stays on', () => {
    expect(browserChoice(localStorage).chosen()).toBe(false);
    browserChoice(localStorage).choose();
    expect(browserChoice(localStorage).chosen()).toBe(true);
  });
});

describe('sectionMemory (closed home sections)', () => {
  beforeEach(() => localStorage.clear());

  it('keeps a section closed until it is opened, and remembers both (Olesia, 2026-11-11: closed by default)', () => {
    const memory = sectionMemory(localStorage);
    expect(memory.open('mw')).toBe(false);
    memory.remember('mw', true);
    expect(sectionMemory(localStorage).open('mw')).toBe(true);
    expect(sectionMemory(localStorage).open('wo')).toBe(false);
    memory.remember('mw', false);
    expect(sectionMemory(localStorage).open('mw')).toBe(false);
  });

  it('only forgets when the phone is full', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
    expect(() => sectionMemory(full).remember('mw', false)).not.toThrow();
  });
});

describe('storageFor (Olesia, 2026-11-09: the app in a browser tab keeps nothing)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps the diary on the phone only in the installed app', () => {
    expect(storageFor(true, { local: localStorage, session: sessionStorage })).toBe(localStorage);
  });

  it('keeps it in the tab otherwise, and never touches what the installed app keeps', () => {
    diaryStore(localStorage, now).save(EXAMPLE_DIARY);
    const tab = storageFor(false, { local: localStorage, session: sessionStorage });
    expect(diaryStore(tab, now).load()).toBeNull();
    diaryStore(tab, now).save({ ...EXAMPLE_DIARY, days: {} });
    expect(diaryStore(localStorage, now).load()).toEqual(EXAMPLE_DIARY);
  });
});

describe('remembered on this phone only: theme and the last copy', () => {
  beforeEach(() => localStorage.clear());
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };

  it('follows the phone until a theme is chosen, then keeps the choice', () => {
    expect(themeMemory(localStorage).chosen()).toBeNull();
    themeMemory(localStorage).choose('light');
    expect(themeMemory(localStorage).chosen()).toBe('light');
    themeMemory(localStorage).choose('dark');
    expect(themeMemory(localStorage).chosen()).toBe('dark');
  });

  it('ignores a theme it does not know', () => {
    localStorage.setItem('phys-activity-tracking-app/theme', 'sepia');
    expect(themeMemory(localStorage).chosen()).toBeNull();
  });

  it('remembers the day of the last copy', () => {
    expect(backupMemory(localStorage).last()).toBeNull();
    backupMemory(localStorage).remember('2026-11-20' as DayKey);
    expect(backupMemory(localStorage).last()).toBe('2026-11-20');
  });

  it('ignores a broken day', () => {
    localStorage.setItem('phys-activity-tracking-app/last-copy', 'yesterday');
    expect(backupMemory(localStorage).last()).toBeNull();
  });

  it('only forgets when the phone is full', () => {
    expect(() => themeMemory(full).choose('light')).not.toThrow();
    expect(() => backupMemory(full).remember('2026-11-20' as DayKey)).not.toThrow();
  });
});

describe('«закінчити тренування» from wave 5b moves into the day (wave 5c)', () => {
  beforeEach(() => localStorage.clear());
  const A = '2026-11-16' as DayKey;
  const B = '2026-11-17' as DayKey;
  const C = '2026-11-18' as DayKey;
  const stored = (store: ReturnType<typeof diaryStore>) => {
    store.save({
      profile: EXAMPLE_DIARY.profile,
      days: {
        [A]: readDay({ wo: { session: 's', ex: { w: [{ r: 5 }] } } }, A),
        [B]: readDay({ wo: { session: 's' } }, B),
        [C]: readDay({ note: 'без тренування' }, C),
      },
    });
  };

  it('a mark on the phone becomes `wo.done` in the stored diary once, and the mark goes', () => {
    const store = diaryStore(localStorage, () => new Date('2026-11-18T08:00:00Z'));
    stored(store);
    localStorage.setItem(FINISHED_KEY + A, 'yes');
    localStorage.setItem(FINISHED_KEY + C, 'yes');
    const diary = store.load()!;
    expect(diary.days[A]!.wo!.done).toBe(true);
    expect(diary.days[B]!.wo!.done).toBeUndefined();
    // a day with no workout picked: the mark means nothing
    expect(diary.days[C]!.wo).toBeNull();
    expect(localStorage.getItem(FINISHED_KEY + A)).toBeNull();
    expect(localStorage.getItem(FINISHED_KEY + C)).toBeNull();
    // in the stored copy, so a copy file carries it
    expect(JSON.parse(localStorage.getItem(DIARY_KEY)!).days[A].wo.done).toBe(true);
    expect(JSON.parse(localStorage.getItem(DIARY_KEY)!).days[B].wo.done).toBeUndefined();
  });

  it('a full phone keeps the marks and tries again next time', () => {
    const store = diaryStore(localStorage, () => new Date());
    stored(store);
    localStorage.setItem(FINISHED_KEY + A, 'yes');
    const before = localStorage.getItem(DIARY_KEY);
    const full: KeyValue = {
      getItem: (key) => localStorage.getItem(key),
      setItem: () => { throw new Error('full'); },
      removeItem: (key) => localStorage.removeItem(key),
    };
    expect(diaryStore(full, () => new Date()).load()!.days[A]!.wo!.done).toBe(true);
    expect(localStorage.getItem(DIARY_KEY)).toBe(before);
    expect(localStorage.getItem(FINISHED_KEY + A)).toBe('yes');
  });
});

describe('tipMemory (tips for newcomers, waves 5 and 5b)', () => {
  it('stops showing a tip after three successes (Olesia, 2026-11-17); each tip counts on its own', () => {
    localStorage.clear();
    const tips = tipMemory(localStorage);
    tips.succeed('slider');
    tips.succeed('slider');
    expect(tips.open('slider')).toBe(true);
    tips.succeed('slider');
    expect(tipMemory(localStorage).open('slider')).toBe(false);
    expect(tips.open('remove')).toBe(true);
    tips.succeed('slider');
    expect(localStorage.getItem('phys-activity-tracking-app/tip-done/slider')).toBe('3');
  });

  beforeEach(() => localStorage.clear());

  it('shows a tip until «зрозуміло», then remembers it on this phone; a full phone only forgets', () => {
    const tips = tipMemory(localStorage);
    expect(tips.open('sets')).toBe(true);
    tips.close('sets');
    expect(tipMemory(localStorage).open('sets')).toBe(false);
    expect(tipMemory(localStorage).open('other')).toBe(true);
    const full: KeyValue = { getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => {} };
    expect(() => tipMemory(full).close('sets')).not.toThrow();
  });
});
