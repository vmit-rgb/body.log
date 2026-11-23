import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DayKey } from '../domain/dates';
import { readDay, writeDay } from '../domain/day';
import type { Diary } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';

const EXAMPLE_PROFILE = EXAMPLE_DIARY.profile;
import { addExercise, rememberNames, removeAdded, toggleAddedField } from '../domain/log';
import { readSettings } from '../domain/settings';
import { checkSchema } from '../format/schema';
import schema from '../format/profile.schema.json';
import type { Schema } from '../format/schema';
import { countdownTime } from '../home/session';
import { morningBody as settingsMorning, workoutBody as settingsWorkout } from '../screens/settings-sections';
import { warmupCountdown } from '../home/sections';
import { browserChoice, diaryStore, sectionMemory, tipMemory } from '../storage/store';
import { mountToast } from '../ui/toast';
import { startApp } from './app';
import { fakeDevice } from './test-env';

/*
 * Beta 1.2.2 (Olesia, 2026-11-23): a countdown timer in workout exercises,
 * and exercises added right in the workout, with кг, повтори, секундомір
 * that can be taken away and brought back. Invented data only.
 */

const TODAY = '2026-11-09' as DayKey;
let host: HTMLElement;
let hide: () => void = () => {};

function start(diary: Diary): void {
  diaryStore(localStorage, () => new Date()).save(diary);
  document.body.innerHTML = '<main id="app"></main>';
  host = document.querySelector<HTMLElement>('#app')!;
  startApp({
    host,
    store: diaryStore(localStorage, () => new Date('2026-11-09T08:00:00Z')),
    browser: browserChoice(localStorage),
    platform: 'android',
    installed: true,
    toast: mountToast(document.body),
    onDiary: () => {},
    today: () => TODAY,
    sections: sectionMemory(localStorage),
    tips: tipMemory(localStorage),
    whenHidden: (save) => {
      hide = save;
    },
    ...fakeDevice().env,
  });
}

const named = (b: HTMLElement) => (b.getAttribute('aria-label') ?? (b.querySelector('.accordion__title') ?? b).textContent!.trim());
const buttons = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].filter((b) => named(b) === name);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const tap = async (name: string, nth = 0) => {
  const found = buttons(name)[nth];
  if (!found) throw new Error(`no button «${name}»`);
  found.click();
  await settle();
};
const stored = () => {
  hide();
  return diaryStore(localStorage, () => new Date()).load()!.days[TODAY]!;
};

/** The example with its timed exercise (exercise-8, 30 s) on the timer. */
function withTimer(): Diary {
  const profile = structuredClone(EXAMPLE_PROFILE) as unknown as { workout: { sessions: { items: Record<string, unknown>[] }[] } };
  profile.workout.sessions[0]!.items[2]!.timer = true;
  return { profile, days: { [TODAY]: readDay({ wo: { session: 'a', ex: {} } }, TODAY) } } as unknown as Diary;
}

const picked = (): Diary => ({ profile: EXAMPLE_DIARY.profile, days: { [TODAY]: readDay({ wo: { session: 'a', ex: {} } }, TODAY) } }) as unknown as Diary;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the workout timer (beta 1.2.2)', () => {
  it('is a choice of the profile the schema allows; without it the exercise keeps the stopwatch', () => {
    const profile = withTimer().profile;
    expect(checkSchema(schema as Schema, profile).issues).toEqual([]);
    expect(checkSchema(schema as Schema, profile).unknown).toEqual([]);
    const items = readSettings(profile).workout.sessions[0]!.items;
    expect(items[2]).toMatchObject({ exercise: 'exercise-8', timer: true });
    expect(items[0]).not.toHaveProperty('timer');
  });

  it('counts down from its seconds after «3 · 2 · 1»', () => {
    expect(countdownTime(1000, 0, 30)).toBe('1');
    expect(countdownTime(1000, 1000, 30)).toBe('00.30.00');
    expect(countdownTime(1000, 11_000, 30)).toBe('00.20.00');
    expect(countdownTime(1000, 40_000, 30)).toBe('00.00.00');
  });

  it('shows its seconds before the start and says it is a timer', async () => {
    start(withTimer());
    await tap('тренування');
    const sw = host.querySelector<HTMLElement>('.sw--timer')!;
    expect(sw.querySelector('.sw__time')!.textContent).toBe('00.30.00');
    expect(sw.querySelector('[data-act="sw"]')!.getAttribute('aria-label')).toBe('запустити таймер, 1');
  });

  it('at zero saves the whole time by itself', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
    start(withTimer());
    host.querySelector<HTMLButtonElement>('#sec-wo-title')!.click();
    await vi.advanceTimersByTimeAsync(10);
    host.querySelector<HTMLButtonElement>('.sw--timer [data-act="sw"]')!.click();
    await vi.advanceTimersByTimeAsync(3000 + 30_000 + 50);
    expect(stored().wo!.ex['exercise-8']![0]!.s).toBe(30);
  });

  it('the stopwatch of an exercise without the timer is as before', async () => {
    start(picked());
    await tap('тренування');
    expect(host.querySelector('.sw--timer')).toBeNull();
    expect(host.querySelector('.sw [data-act="sw"]')!.getAttribute('aria-label')).toBe('запустити секундомір, 1');
  });

  it('the settings offer «секундомір» and «таймер» for a timed workout exercise only', () => {
    const view = { inner: new Set(['a', 'exercise-6', 'exercise-7', 'exercise-8']), menu: null, picking: null, movable: () => false };
    const box = document.createElement('div');
    box.innerHTML = settingsWorkout({ settings: readSettings(withTimer().profile), view });
    const tabs = [...box.querySelectorAll<HTMLButtonElement>('[data-act="wtimer"]')];
    expect(tabs.map((tab) => [tab.textContent, tab.getAttribute('aria-pressed')])).toEqual([['секундомір', 'false'], ['таймер', 'true']]);
    expect(tabs[0]!.dataset.path).toBe(tabs[1]!.dataset.path);
  });

  it('with the stopwatch the settings have no «скільки секунд»; the timer without them is an error', () => {
    const view = { inner: new Set(['a', 'exercise-8']), menu: null, picking: null, movable: () => false };
    const render = (item: Record<string, unknown>) => {
      const profile = structuredClone(EXAMPLE_PROFILE) as unknown as { workout: { sessions: { items: Record<string, unknown>[] }[] } };
      profile.workout.sessions[0]!.items = [item];
      const box = document.createElement('div');
      box.innerHTML = settingsWorkout({ settings: readSettings(profile), view });
      return box;
    };
    const stopwatch = render({ exercise: 'exercise-8', seconds: 30, fields: ['seconds'] });
    expect(stopwatch.querySelector('[data-path$=".seconds"]')).toBeNull();
    expect(stopwatch.querySelector('.st-error')).toBeNull();
    const timer = render({ exercise: 'exercise-8', seconds: 30, fields: ['seconds'], timer: true });
    expect(timer.querySelector('[data-path$=".seconds"]')).not.toBeNull();
    expect(timer.querySelector('.st-row--time')!.contains(timer.querySelector('[data-path$=".seconds"]'))).toBe(true);
    const empty = render({ exercise: 'exercise-8', fields: ['seconds'], timer: true });
    expect(empty.querySelector('.st-error')!.textContent).toBe('впиши «скільки секунд» — без них таймер не запуститься >_<');
  });
});

describe('the morning warm-up timer (beta 1.2.2)', () => {
  /** The example with exercise-2 (30 s, level 1) on the timer. */
  function warmupTimer(): Diary {
    const profile = structuredClone(EXAMPLE_PROFILE) as unknown as { morningWarmup: { levels: { items: Record<string, unknown>[] }[] } };
    profile.morningWarmup.levels[0]!.items[1]!.timer = true;
    return { profile, days: {} } as unknown as Diary;
  }

  it('the schema allows it, and the settings offer the switch for a timed warm-up exercise', () => {
    const profile = warmupTimer().profile;
    expect(checkSchema(schema as Schema, profile).issues).toEqual([]);
    expect(checkSchema(schema as Schema, profile).unknown).toEqual([]);
    const view = { inner: new Set(['level-1', 'exercise-1', 'exercise-2']), menu: null, picking: null, movable: () => false };
    const box = document.createElement('div');
    box.innerHTML = settingsMorning({ settings: readSettings(profile), view });
    const tabs = [...box.querySelectorAll<HTMLButtonElement>('[data-act="wtimer"]')];
    expect(tabs.map((tab) => [tab.textContent, tab.getAttribute('aria-pressed')])).toEqual([['секундомір', 'false'], ['таймер', 'true']]);
    // the seconds stay next to the name (Olesia, 2026-11-23)
    const time = box.querySelector('[data-path$=".items.1.seconds"]')!;
    expect(time.closest('.st-row--time')).toBeNull();
    expect(time.textContent).toContain('30 с');
  });

  it('shows its seconds, counts down and saves the round at zero', async () => {
    expect(warmupCountdown(readSettings(warmupTimer().profile), 'exercise-2')).toBe(30);
    expect(warmupCountdown(readSettings(EXAMPLE_PROFILE), 'exercise-2')).toBeNull();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
    start(warmupTimer());
    host.querySelector<HTMLButtonElement>('#sec-mw-title')!.click();
    await vi.advanceTimersByTimeAsync(10);
    const sw = host.querySelector<HTMLElement>('.sw--timer')!;
    expect(sw.querySelector('.sw__time')!.textContent).toBe('00.30.00');
    sw.querySelector<HTMLButtonElement>('[data-act="sw"]')!.click();
    await vi.advanceTimersByTimeAsync(3000 + 30_000 + 50);
    expect(stored().mw.times['exercise-2']).toEqual([30]);
  });
});

describe('exercises added right in the workout (beta 1.2.2)', () => {
  it('keeps them in the day with all three fields, and a copy reads them back', () => {
    const day = addExercise('day-1', 'віджимання')(readDay({ wo: { session: 'a', ex: {} } }, TODAY));
    expect(day.wo!.add).toEqual([{ id: 'day-1', name: 'віджимання', fields: ['weight', 'reps', 'seconds'] }]);
    expect(readDay(JSON.parse(JSON.stringify(writeDay(day))), TODAY).wo!.add).toEqual(day.wo!.add);
  });

  it('a field goes and comes back in its place; the last one stays', () => {
    let day = addExercise('day-1', 'x')(readDay({ wo: { session: 'a', ex: {} } }, TODAY));
    day = toggleAddedField('day-1', 'weight')(day);
    expect(day.wo!.add![0]!.fields).toEqual(['reps', 'seconds']);
    day = toggleAddedField('day-1', 'weight')(day);
    expect(day.wo!.add![0]!.fields).toEqual(['weight', 'reps', 'seconds']);
    day = toggleAddedField('day-1', 'reps')(toggleAddedField('day-1', 'seconds')(day));
    expect(day.wo!.add![0]!.fields).toEqual(['weight']);
    expect(toggleAddedField('day-1', 'weight')(day).wo!.add![0]!.fields).toEqual(['weight']);
  });

  it('removed, its sets go too; a copy without any reads as before', () => {
    let day = addExercise('day-1', 'x')(readDay({ wo: { session: 'a', ex: { 'day-1': [{ w: 1, r: 2, s: null }] } } }, TODAY));
    day = removeAdded('day-1')(day);
    expect(day.wo).toEqual({ session: 'a', ex: {}, rows: {} });
  });

  it('a done one keeps its name for the history', () => {
    const settings = readSettings(EXAMPLE_PROFILE);
    const day = addExercise('day-1', 'віджимання')(readDay({ wo: { session: 'a', ex: { 'day-1': [{ w: null, r: 12, s: null }] } } }, TODAY));
    expect(rememberNames(settings)(day).names['day-1']).toBe('віджимання');
    expect(rememberNames(settings)(addExercise('day-2', 'y')(day)).names['day-2']).toBeUndefined();
  });

  it('«додати вправу» → a name → an exercise with кг, повтори and the stopwatch; a chip takes one away', async () => {
    start(picked());
    await tap('тренування');
    await tap('додати вправу');
    const field = host.querySelector<HTMLInputElement>('[data-add-ex]')!;
    expect(document.activeElement).toBe(field);
    field.value = '  віджимання ';
    await tap('додати');
    const added = host.querySelector<HTMLElement>('.wo-ex--added')!;
    expect(added.querySelector('.accordion__title')!.textContent).toBe('віджимання');
    expect(added.querySelectorAll('[data-input="set"]')).toHaveLength(2);
    expect(added.querySelector('.sw')).not.toBeNull();
    expect([...added.querySelectorAll('[data-act="added-field"]')].map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'true']);
    // the stopwatch away
    added.querySelector<HTMLButtonElement>('[data-act="added-field"][data-field="seconds"]')!.click();
    await settle();
    const after = host.querySelector<HTMLElement>('.wo-ex--added')!;
    expect(after.querySelector('.sw')).toBeNull();
    const reps = after.querySelector<HTMLInputElement>('[data-input="set"][data-f="r"]')!;
    reps.value = '12';
    reps.dispatchEvent(new Event('input', { bubbles: true }));
    const day = stored();
    expect(day.wo!.add![0]).toMatchObject({ name: 'віджимання', fields: ['weight', 'reps'] });
    expect(day.names[day.wo!.add![0]!.id]).toBe('віджимання');
  });

  it('the field is one line named «назва вправи»; «додати» is second level, «скасувати» red (Olesia, 2026-11-23)', async () => {
    start(picked());
    await tap('тренування');
    await tap('додати вправу');
    const field = host.querySelector<HTMLInputElement>('[data-add-ex]')!;
    expect(field.tagName).toBe('INPUT');
    expect(field.classList.contains('wo-add__field')).toBe(true);
    expect(field.getAttribute('aria-label')).toBe('назва вправи');
    const [add, cancel] = [...host.querySelectorAll<HTMLButtonElement>('.wo-add__buttons > button')];
    expect(add!.textContent).toBe('додати');
    expect(add!.classList.contains('btn--secondary')).toBe(true);
    expect(cancel!.textContent).toBe('скасувати');
    expect(cancel!.classList.contains('btn--destructive')).toBe(true);
  });

  it('Enter adds as «додати»; nothing typed adds nothing; «скасувати» closes the field', async () => {
    start(picked());
    await tap('тренування');
    await tap('додати вправу');
    await tap('додати');
    expect(host.querySelector('.wo-ex--added')).toBeNull();
    await tap('скасувати');
    expect(host.querySelector('[data-add-ex]')).toBeNull();
    await tap('додати вправу');
    const field = host.querySelector<HTMLInputElement>('[data-add-ex]')!;
    field.value = 'планка';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(host.querySelector('.wo-ex--added .accordion__title')!.textContent).toBe('планка');
  });

  it('«прибрати вправу» asks first, then removes', async () => {
    start(picked());
    await tap('тренування');
    await tap('додати вправу');
    host.querySelector<HTMLInputElement>('[data-add-ex]')!.value = 'планка';
    await tap('додати');
    await tap('прибрати вправу «планка»');
    expect(host.querySelector('.wo-ex--added')).not.toBeNull();
    await tap('так, прибрати вправу «планка»');
    expect(host.querySelector('.wo-ex--added')).toBeNull();
  });
});
