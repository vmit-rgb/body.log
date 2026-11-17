import { beforeEach, describe, expect, it } from 'vitest';
import type { DayKey } from '../domain/dates';
import { readDay } from '../domain/day';
import type { Diary } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';
import { browserChoice, diaryStore, finishMemory, sectionMemory, tipMemory } from '../storage/store';
import { mountToast } from '../ui/toast';
import { startApp } from './app';
import { fakeDevice } from './test-env';

/*
 * Wave 5b (`app/fix-sections-2`, ux-audit/FIXES-PLAN.md; Olesia's answers
 * of 2026-11-17): what counts as done, «закінчити тренування», the tick on a
 * done section, tips that stop after three successes. Invented data only.
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
    finished: finishMemory(localStorage),
    whenHidden: () => {},
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
const section = (id: string) => host.querySelector<HTMLElement>(`#sec-${id}-title`)!.closest<HTMLElement>('.home-section')!;
const done = (id: string) => section(id).classList.contains('home-section--done');
const lead = (id: string) => section(id).querySelector('.home-section__hint')!.textContent;
const tipsIn = (id: string, tip: string) => section(id).querySelectorAll(`[data-tip-id="${tip}"]`);

const withSets = (): Diary =>
  ({ profile: EXAMPLE_DIARY.profile, days: { [TODAY]: readDay({ wo: { session: 'a', ex: { 'exercise-6': [{ w: 5, r: 10 }] } } }, TODAY) } }) as unknown as Diary;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('the tick on a done section (Olesia, 2026-11-17)', () => {
  it('stands at the start of the header and is said before the title; a section not done has none', async () => {
    start(EXAMPLE_DIARY);
    await tap('рух');
    const title = host.querySelector<HTMLButtonElement>('#sec-mv-title')!;
    expect(title.firstElementChild!.matches('.accordion__done')).toBe(true);
    expect(title.querySelector('.accordion__done svg')).not.toBeNull();
    expect(title.querySelector('.accordion__done .visually-hidden')!.textContent).toBe('зроблено: ');
    expect(done('mv')).toBe(false);
    await tap('додати коло');
    const field = host.querySelector<HTMLInputElement>('[data-input="lap"]')!;
    field.value = '20';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(done('mv')).toBe(true);
    // the closed strip says it too
    expect(lead('mv')).toBe('хороша робота <3');
  });

  it('the morning warm-up is done by a whole level, not by its first exercise', async () => {
    start(EXAMPLE_DIARY);
    await tap('ранкова розминка');
    host.querySelector<HTMLInputElement>('[data-input="tick"][data-ex="exercise-1"]')!.click();
    await settle();
    expect(done('mw')).toBe(false);
    host.querySelector<HTMLInputElement>('[data-input="tick"][data-ex="exercise-2"]')!.click();
    await settle();
    expect(done('mw')).toBe(true);
  });
});

describe('«закінчити тренування» (Olesia, 2026-11-17)', () => {
  it('sets alone don\'t make the workout done; the first-level button at the bottom does', async () => {
    start(withSets());
    await tap('тренування');
    expect(done('wo')).toBe(false);
    const finish = buttons('закінчити тренування')[0]!;
    expect(finish.classList.contains('btn--primary')).toBe(true);
    // at the bottom of the workout: after its exercises, before «самопочуття після тренування»
    const wrap = finish.closest('.wo-finish')!;
    expect(wrap.previousElementSibling!.matches('ol.ex-list')).toBe(true);
    expect(wrap.nextElementSibling!.matches('.sub')).toBe(true);
    await tap('закінчити тренування');
    expect(done('wo')).toBe(true);
    expect(lead('wo')).toBe('хороша робота <3');
    expect(finishMemory(localStorage).finished(TODAY)).toBe(true);
    const again = buttons('продовжити тренування')[0]!;
    expect(again.classList.contains('btn--tertiary')).toBe(true);
    expect(document.activeElement).toBe(again);
  });

  it('«продовжити тренування» opens it again; the fields stay open either way', async () => {
    start(withSets());
    await tap('тренування');
    await tap('закінчити тренування');
    expect(host.querySelector<HTMLInputElement>('[data-input="set"]')!.disabled).toBe(false);
    await tap('продовжити тренування');
    expect(done('wo')).toBe(false);
    expect(buttons('закінчити тренування')).toHaveLength(1);
    expect(finishMemory(localStorage).finished(TODAY)).toBe(false);
  });

  it('is remembered for that day on this phone, and doesn\'t change the week goal', async () => {
    start(withSets());
    const goal = host.querySelector('.bar__goal')?.textContent;
    await tap('тренування');
    await tap('закінчити тренування');
    expect(host.querySelector('.bar__goal')?.textContent).toBe(goal);
    start(withSets());
    expect(done('wo')).toBe(true);
  });

  it('a workout picked anew after «прибрати з цього дня» starts unfinished', async () => {
    start({ profile: EXAMPLE_DIARY.profile, days: { [TODAY]: readDay({ wo: { session: 'a' } }, TODAY) } } as unknown as Diary);
    await tap('тренування');
    await tap('закінчити тренування');
    expect(done('wo')).toBe(true);
    await tap('прибрати з цього дня');
    expect(done('wo')).toBe(false);
    await tap('тренування А');
    expect(done('wo')).toBe(false);
    expect(buttons('закінчити тренування')).toHaveLength(1);
  });
});

describe('tips that stop after three successes (Olesia, 2026-11-17)', () => {
  it('the slider: shows while a value is not saved, goes once it is; after three «зберегти» it never shows', async () => {
    start(EXAMPLE_DIARY);
    await tap('самопочуття зранку');
    for (let round = 0; round < 3; round += 1) {
      await tap('більше: енергія');
      expect(tipsIn('ck-morning', 'slider')).toHaveLength(1);
      expect(tipsIn('ck-morning', 'slider')[0]!.textContent).toContain('«зберегти»');
      await tap('зберегти');
      expect(tipsIn('ck-morning', 'slider')).toHaveLength(0);
      await tap('скинути');
    }
    await tap('більше: енергія');
    expect(tipsIn('ck-morning', 'slider')).toHaveLength(0);
  });

  it('the slider moved by a finger gets the tip without a render, once', async () => {
    start(EXAMPLE_DIARY);
    await tap('самопочуття зранку');
    const slider = host.querySelector<HTMLInputElement>('#sec-ck-morning input.slider')!;
    slider.value = '6';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.value = '7';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(tipsIn('ck-morning', 'slider')).toHaveLength(1);
  });

  it('× → ✓: the tip shows under the row whose × turned into ✓, and counts the removals', async () => {
    start(EXAMPLE_DIARY);
    await tap('рух');
    for (let round = 0; round < 3; round += 1) {
      await tap('додати коло');
      expect(tipsIn('mv', 'remove')).toHaveLength(0);
      await tap('видалити коло 2');
      const shown = tipsIn('mv', 'remove');
      expect(shown).toHaveLength(1);
      expect(shown[0]!.previousElementSibling!.querySelector('[data-act="rm"]')!.classList.contains('rm--armed')).toBe(true);
      await tap('точно видалити коло 2');
    }
    await tap('додати коло');
    await tap('видалити коло 2');
    expect(tipsIn('mv', 'remove')).toHaveLength(0);
  });

  it('× → ✓ on a set stays quiet where the tip about extra sets already says it; removing a set counts for both', async () => {
    start(withSets());
    await tap('тренування');
    await tap('видалити підхід 2');
    expect(tipsIn('wo', 'remove')).toHaveLength(0);
    expect(tipsIn('wo', 'sets')).toHaveLength(1);
    await tap('точно видалити підхід 2');
    expect(localStorage.getItem('phys-activity-tracking-app/tip-done/sets')).toBe('1');
    expect(localStorage.getItem('phys-activity-tracking-app/tip-done/remove')).toBe('1');
  });

  it('«ще раз»: one tip under the first timed exercise; after three taps it never shows', async () => {
    start(EXAMPLE_DIARY);
    await tap('ранкова розминка');
    expect(tipsIn('mw', 'rounds')).toHaveLength(1);
    expect(tipsIn('mw', 'rounds')[0]!.previousElementSibling!.textContent).toBe('ще раз');
    for (let round = 0; round < 3; round += 1) await tap('ще раз');
    expect(tipsIn('mw', 'rounds')).toHaveLength(0);
  });

  it('«зрозуміло» still hides a tip for good', async () => {
    start(EXAMPLE_DIARY);
    await tap('ранкова розминка');
    tipsIn('mw', 'rounds')[0]!.querySelector<HTMLButtonElement>('.tip__close')!.click();
    await settle();
    expect(tipsIn('mw', 'rounds')).toHaveLength(0);
    expect(tipMemory(localStorage).open('rounds')).toBe(false);
  });
});
