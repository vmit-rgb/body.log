import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DayKey } from '../domain/dates';
import { readDay } from '../domain/day';
import type { Diary, JsonObject } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';
import { browserChoice, diaryStore, sectionMemory, tipMemory } from '../storage/store';
import { mountToast } from '../ui/toast';
import { startApp } from './app';
import { fakeDevice } from './test-env';

/*
 * Wave 5 (`app/fix-sections`, ux-audit/FIXES-PLAN.md): the sections at
 * home and in the settings. Invented data only: the «почати без ШІ» example.
 */

const TODAY = '2026-11-09' as DayKey;
let host: HTMLElement;

function start(diary: Diary, tips = true): void {
  diaryStore(localStorage, () => new Date()).save(diary);
  document.body.innerHTML = '<main id="app"></main>';
  host = document.querySelector<HTMLElement>('#app')!;
  const fake = fakeDevice();
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
    ...(tips ? { tips: tipMemory(localStorage) } : {}),
    whenHidden: () => {},
    ...fake.env,
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
const section = (id: string) => host.querySelector<HTMLElement>(`#sec-${id}-title`)!.closest<HTMLElement>('.home-section')!;
const leads = (id: string) => [...section(id).querySelectorAll('[data-lead]')].map((line) => line.textContent);
const collapse = (id: string) => section(id).querySelector<HTMLElement>('.home-section__end')!;

/** The example with a workout picked today and the first set of its first exercise typed in. */
function withWorkout(sets: JsonObject[] = [{ w: 5, r: 10 }]): Diary {
  return { profile: EXAMPLE_DIARY.profile, days: { [TODAY]: readDay({ wo: { session: 'a', ex: { 'exercise-6': sets } } }, TODAY) } } as unknown as Diary;
}

/** The example's workout with exercises 7 and 8 as a group. */
function grouped(): Diary {
  const profile = structuredClone(EXAMPLE_DIARY.profile) as JsonObject & { workout: { sessions: { items: unknown[] }[] } };
  const [first, second, third] = profile.workout.sessions[0]!.items;
  profile.workout.sessions[0]!.items = [first, { set: [second, third] }];
  return { profile, days: {} } as unknown as Diary;
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('home: «хороша робота <3» and «згорнути секцію» (Olesia, MY-FIXES)', () => {
  it('a section where nothing is done keeps its description and has no «згорнути секцію»', async () => {
    start(EXAMPLE_DIARY);
    await tap('ранкова розминка');
    expect(leads('mw')).toEqual(['слухай тіло. якщо щось не так — зупинись <3', 'слухай тіло. якщо щось не так — зупинись <3']);
    expect(collapse('mw').hidden).toBe(true);
  });

  it('the first ticked exercise turns the line into «хороша робота <3», <3 in the accent, open and closed', async () => {
    start(EXAMPLE_DIARY);
    await tap('ранкова розминка');
    host.querySelector<HTMLInputElement>('[data-input="tick"]')!.click();
    await settle();
    expect(leads('mw')).toEqual(['хороша робота <3', 'хороша робота <3']);
    expect(section('mw').querySelector('.good-job__heart')!.textContent).toBe('<3');
    expect(collapse('mw').hidden).toBe(false);
    // other sections are untouched
    expect(leads('dw')[0]).toBe('слухай тіло. якщо щось не так — зупинись <3');
  });

  it('typing a set changes the line at once, without drawing home anew', async () => {
    start({ profile: EXAMPLE_DIARY.profile, days: { [TODAY]: readDay({ wo: { session: 'a' } }, TODAY) } } as unknown as Diary);
    await tap('тренування');
    expect(leads('wo')[0]).toBe('слухай тіло. якщо щось не так — зупинись <3');
    const field = host.querySelector<HTMLInputElement>('[data-input="set"][data-f="r"]')!;
    field.value = '10';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(host.querySelector('[data-input="set"][data-f="r"]')).toBe(field);
    expect(leads('wo')[0]).toBe('хороша робота <3');
    expect(collapse('wo').hidden).toBe(false);
  });

  it('«згорнути секцію» closes it, remembers it and puts the focus on its title', async () => {
    start(withWorkout());
    await tap('тренування');
    section('wo').querySelector<HTMLButtonElement>('[data-collapse]')!.click();
    await settle();
    const title = host.querySelector<HTMLButtonElement>('#sec-wo-title')!;
    expect(title.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(title);
    expect(sectionMemory(localStorage).open('wo')).toBe(false);
  });
});

describe('home: the workout (Olesia, MY-FIXES)', () => {
  it('«прибрати з цього дня» is the first thing under the title, above the line', async () => {
    start(withWorkout());
    await tap('тренування');
    const body = host.querySelector('#sec-wo')!;
    expect(body.firstElementChild!.matches('.wo-drop')).toBe(true);
    expect(body.firstElementChild!.textContent!.trim()).toBe('прибрати з цього дня');
    expect(body.querySelectorAll('[data-act="drop"]')).toHaveLength(1);
  });

  it('each exercise folds by its name, and it stays folded on that day', async () => {
    start(withWorkout());
    await tap('тренування');
    expect(buttons('вправа 6')[0]!.getAttribute('aria-expanded')).toBe('true');
    await tap('вправа 6');
    expect(buttons('вправа 6')[0]!.getAttribute('aria-expanded')).toBe('false');
    // another tap that draws home anew keeps it folded
    await tap('додати підхід');
    expect(buttons('вправа 6')[0]!.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector(`#${buttons('вправа 6')[0]!.getAttribute('aria-controls')}`)!.hasAttribute('hidden')).toBe(true);
    // the workout as a whole still has its «прибрати з цього дня», the exercise none
    expect(host.querySelectorAll('.wo-ex [data-act="drop"]')).toHaveLength(0);
  });

  it('a group is an outline around exercises that each keep their own box', async () => {
    start(grouped());
    await tap('тренування');
    await tap('тренування А');
    const group = host.querySelector('.wo-group')!;
    expect(group.querySelectorAll(':scope > .ex-list > .wo-ex')).toHaveLength(2);
  });
});

describe('home: the tip about extra sets (Olesia, MY-FIXES)', () => {
  it('shows under the first exercise with more than one set, until «зрозуміло»; then never again', async () => {
    start(withWorkout());
    await tap('тренування');
    const tips = host.querySelectorAll('.tip');
    expect(tips).toHaveLength(1);
    expect(tips[0]!.closest('.wo-ex')!.querySelector('.accordion__title')!.textContent).toBe('вправа 6');
    expect(tips[0]!.textContent).toContain('зайвий підхід прибирає ×');
    await tap('зрозуміло, сховати підказку');
    expect(host.querySelector('.tip')).toBeNull();
    expect(tipMemory(localStorage).open('sets')).toBe(false);
    start(withWorkout());
    expect(host.querySelector('.tip')).toBeNull();
  });

  it('no tip while no exercise has a set to remove, nor without a place to remember it', async () => {
    const profile = structuredClone(EXAMPLE_DIARY.profile) as JsonObject & { workout: { sessions: { items: { sets?: number }[] }[] } };
    for (const item of profile.workout.sessions[0]!.items) delete item.sets;
    start({ profile, days: { [TODAY]: readDay({ wo: { session: 'a' } }, TODAY) } } as unknown as Diary);
    await tap('тренування');
    expect(host.querySelector('.tip')).toBeNull();
    start(withWorkout(), false);
    await tap('тренування');
    expect(host.querySelector('.tip')).toBeNull();
  });
});

describe('home: daytime «як робити» (Olesia, MY-FIXES)', () => {
  it('one filled accordion; each «для чого» is its own region; an empty line in «як робити» starts a paragraph', async () => {
    const profile = structuredClone(EXAMPLE_DIARY.profile) as JsonObject & { exercises: { id: string; how: string }[] };
    profile.exercises.find((x) => x.id === 'exercise-4')!.how = 'сядь рівно.\nповернись.\n\nне через біль.';
    start({ profile, days: {} } as unknown as Diary);
    await tap('денна розминка');
    const how = host.querySelector('#sec-dw .how-acc')!;
    expect(how.classList.contains('how-acc--filled')).toBe(true);
    expect(how.querySelectorAll('.zone')).toHaveLength(1);
    const paragraphs = [...how.querySelectorAll('.zone__item')[0]!.querySelectorAll('.how')].map((p) => p.textContent);
    expect(paragraphs).toEqual(['сядь рівно.\nповернись.', 'не через біль.']);
  });
});

describe('settings: deleting, ⋯ and boxes (Olesia, MY-FIXES; B-06)', () => {
  async function openSettings(diary: Diary = EXAMPLE_DIARY): Promise<void> {
    start(diary);
    await tap('меню');
    await tap('налаштування');
  }

  it('an exercise says «видалити» right under its name; a level, a zone and a workout under their titles', async () => {
    await openSettings();
    await tap('ранкова розминка');
    await tap('розгорнути: рівень 1');
    const exercise = host.querySelector('.st-item.st-ex')!;
    const remove = exercise.querySelector<HTMLButtonElement>('[data-act="rm"]')!;
    expect(remove.textContent).toBe('видалити');
    expect(remove.getAttribute('aria-label')).toBe('видалити вправу: вправа 1');
    expect(remove.parentElement!.previousElementSibling!.matches('.st-row')).toBe(true);
    const level = buttons('видалити рівень: рівень 1')[0]!;
    expect(level.parentElement!.parentElement!.matches('.st-box__body')).toBe(true);
    expect(level.parentElement!.previousElementSibling).toBeNull();
  });

  it('exercises in a warm-up and a workout are boxes; a group is not one of them', async () => {
    await openSettings(grouped());
    await tap('тренування');
    await tap('розгорнути: тренування А');
    const group = host.querySelector('.st-item.st-group')!;
    expect(group.classList.contains('st-ex')).toBe(false);
    expect(group.querySelectorAll('.st-item.st-ex')).toHaveLength(2);
    await tap('ранкова розминка');
    await tap('розгорнути: рівень 1');
    expect(host.querySelectorAll('.st-item[data-family="mw-ex"].st-ex')).toHaveLength(2);
  });

  it('⋯ opens the same menu as a long press, and says how in small text', async () => {
    await openSettings();
    expect(host.querySelector('.settings__intro')!.textContent).toContain('натисни ⋯ біля запису або затримай на ньому палець і відпусти');
    await tap('ранкова розминка');
    const dots = buttons('дії: рівень 1')[0]!;
    expect(dots.classList.contains('st-actions')).toBe(true);
    expect(dots.closest('.st-item')!.classList.contains('st-item--movable')).toBe(true);
    dots.click();
    await settle();
    expect([...host.querySelectorAll('.st-menu button')].map((b) => b.textContent)).toEqual(['нижче', 'скасувати']);
  });
});
