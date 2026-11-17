import { beforeEach, describe, expect, it } from 'vitest';
import type { DayKey } from '../domain/dates';
import { readDay, writeDay } from '../domain/day';
import { parseDiary, serializeDiary, type Diary } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';
import { finishWorkout, pickSession, setSet } from '../domain/log';
import { browserChoice, diaryStore, sectionMemory, tipMemory } from '../storage/store';
import { mountToast } from '../ui/toast';
import { startApp } from './app';
import { fakeDevice } from './test-env';

/*
 * Wave 5c (ux-audit/FIXES-PLAN.md; Olesia's answers of 2026-11-17): a
 * finished workout is `wo.done` in the day, so the copy keeps it; the slider
 * saves only with «зберегти», and its tip sits above that button.
 * Invented data only.
 */

const TODAY = '2026-11-09' as DayKey;
let host: HTMLElement;

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
    whenHidden: () => {},
    ...fakeDevice().env,
  });
}

const named = (b: HTMLElement) => (b.getAttribute('aria-label') ?? (b.querySelector('.accordion__title') ?? b).textContent!.trim());
const buttons = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].filter((b) => named(b) === name);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const tap = async (name: string) => {
  const found = buttons(name)[0];
  if (!found) throw new Error(`no button «${name}»`);
  found.click();
  await settle();
};
const done = (id: string) => host.querySelector(`#sec-${id}-title`)!.closest('.home-section')!.classList.contains('home-section--done');

const withWorkout = (wo: unknown): Diary =>
  ({ profile: EXAMPLE_DIARY.profile, days: { [TODAY]: readDay({ wo }, TODAY) } }) as unknown as Diary;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('a finished workout in the day record (`wo.done`)', () => {
  it('is read only as `true`; a copy without it, or with anything else, is not finished', () => {
    expect(readDay({ wo: { session: 'a', done: true } }, TODAY).wo!.done).toBe(true);
    expect(readDay({ wo: { session: 'a' } }, TODAY).wo).toEqual({ session: 'a', ex: {}, rows: {} });
    expect(readDay({ wo: { session: 'a', done: 'yes' } }, TODAY).wo!.done).toBeUndefined();
    expect(readDay({ wo: { session: 'a', done: false } }, TODAY).wo!.done).toBeUndefined();
  });

  it('is written only when finished, so an unfinished day looks as it did before', () => {
    const day = readDay({ wo: { session: 'a', ex: { x: [{ r: 5 }] } } }, TODAY);
    expect(writeDay(day)!.wo).toEqual({ session: 'a', ex: { x: [{ w: null, r: 5, s: null }] }, rows: {} });
    expect((writeDay(finishWorkout(true)(day))!.wo as { done?: unknown }).done).toBe(true);
    expect('done' in (writeDay(finishWorkout(false)(finishWorkout(true)(day)))!.wo as object)).toBe(false);
  });

  it('stays through typing a set; a workout picked anew starts unfinished; no workout, nothing to finish', () => {
    const finished = finishWorkout(true)(readDay({ wo: { session: 'a' } }, TODAY));
    expect(setSet('x', 0, 'r', 8)(finished).wo!.done).toBe(true);
    expect(pickSession('b')(finished).wo!.done).toBeUndefined();
    const empty = readDay({}, TODAY);
    expect(finishWorkout(true)(empty)).toBe(empty);
  });

  it('goes into the copy file and comes back from it', () => {
    const diary = withWorkout({ session: 'a', done: true });
    const copy = serializeDiary(diary, new Date('2026-11-17T20:00:00Z'));
    expect(JSON.parse(copy).days[TODAY].wo.done).toBe(true);
    expect(parseDiary(copy)!.days[TODAY]!.wo!.done).toBe(true);
  });

  it('a restored copy with `done` shows the workout finished; «закінчити» and «продовжити» are kept by the diary', async () => {
    start(withWorkout({ session: 'a', done: true }));
    await tap('тренування');
    expect(done('wo')).toBe(true);
    expect(buttons('продовжити тренування')).toHaveLength(1);
    await tap('продовжити тренування');
    expect(done('wo')).toBe(false);
    expect(document.activeElement).toBe(buttons('закінчити тренування')[0]);
  });
});

describe('the slider saves only with «зберегти» (Olesia, 2026-11-17)', () => {
  it('its tip sits above «зберегти», points at it and no longer promises 20 s', async () => {
    start(EXAMPLE_DIARY);
    await tap('самопочуття зранку');
    await tap('більше: енергія');
    const tip = host.querySelector<HTMLElement>('[data-tip-id="slider"]')!;
    expect(tip.classList.contains('tip--above')).toBe(true);
    expect(tip.nextElementSibling!.matches('.tracker__head')).toBe(true);
    expect(tip.nextElementSibling!.querySelector('[data-act="slide-save"]')).not.toBeNull();
    expect(tip.textContent).toContain('«зберегти»');
    expect(tip.textContent).not.toContain('20');
  });

  it('a dragged slider gets the tip above its «зберегти» too, without drawing home anew', async () => {
    start(EXAMPLE_DIARY);
    await tap('самопочуття зранку');
    const slider = host.querySelector<HTMLInputElement>('input.slider')!;
    slider.value = '6';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    const tip = host.querySelector<HTMLElement>('[data-tip-id="slider"]')!;
    expect(tip.classList.contains('tip--above')).toBe(true);
    expect(tip.nextElementSibling!.matches('.tracker__head')).toBe(true);
    expect(tip.closest('.tracker')).toBe(slider.closest('.tracker'));
  });
});
