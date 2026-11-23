import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DayKey } from '../domain/dates';
import { parseDiary, type Diary } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';
import { readFoodSettings } from '../food/food';
import { withFood } from '../food/food-profile';
import { browserChoice, DIARY_KEY, diaryStore } from '../storage/store';
import { mountToast } from '../ui/toast';
import { startApp } from './app';
import { PasteFlow } from './paste-flow';
import { ACCENT_NAMES, ACCESS_SHORT } from '../screens/settings';
import { fakeDevice, openSections } from './test-env';

/** The sums keep their fields whole with no-break spaces (beta 1.2.3); compare them as plain text. */
const plain = (text: string | null | undefined) => (text ?? '').replace(/[  ]/g, ' ');

/* «їжа» on home: the sheet «+ прийом» (FOOD-SECTION.md). Invented data only. */

const TODAY = '2026-11-23' as DayKey;
let host: HTMLElement;
let copied: string[];

function start(diary: Diary): void {
  diaryStore(localStorage, () => new Date()).save(diary);
  document.body.innerHTML = '<main id="app"></main>';
  host = document.querySelector<HTMLElement>('#app')!;
  const device = fakeDevice();
  startApp({
    host,
    store: diaryStore(localStorage, () => new Date('2026-11-23T08:00:00Z')),
    browser: browserChoice(localStorage),
    platform: 'android',
    installed: true,
    toast: mountToast(document.body),
    onDiary: () => {},
    today: () => TODAY,
    sections: openSections,
    whenHidden: () => {},
    ...device.env,
    copyText: async (text: string) => {
      copied.push(text);
      return true;
    },
  });
}

const withFoodOn = (patch = {}) => ({ ...EXAMPLE_DIARY, profile: withFood(EXAMPLE_DIARY.profile, { enabled: true, ...patch }) });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const section = () => host.querySelector<HTMLElement>('#sec-food');
const hint = () => host.querySelector('#sec-food')!.closest('section')!.querySelector<HTMLElement>('.home-section__hint');
const sheet = () => document.querySelector<HTMLElement>('.food-sheet:not([inert])');
const inSheet = <T extends HTMLElement = HTMLElement>(selector: string) => sheet()!.querySelector<T>(selector)!;
const sheetButton = (name: string) => [...sheet()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === name)!;
const stored = () => parseDiary(localStorage.getItem(DIARY_KEY) ?? '')!;
const toastSays = () => document.querySelector<HTMLElement>('.toast:not([hidden]) .toast__message')?.textContent;

function type(element: HTMLElement, text: string): void {
  (element as HTMLInputElement).value = text;
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

async function save(): Promise<void> {
  sheetButton('зберегти').click();
  await settle();
  // the keeper writes a moment later; leaving home writes at once
  host.querySelector<HTMLElement>('.bar__menu')?.click();
  await settle();
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  copied = [];
});

// the keeper writes 400 ms after the last change: written now, so it can't land in the next test's storage
afterEach(() => {
  host?.querySelector<HTMLElement>('.bar__menu')?.click();
});

describe('the section «їжа»', () => {
  it('is on in «почати без ШІ» (Olesia, 2026-11-23), off elsewhere until switched on, the warning as its description', () => {
    start(withFoodOn({ enabled: false }));
    expect(section()).toBeNull();
    start(EXAMPLE_DIARY);
    expect(section()).not.toBeNull();
    expect(hint()!.textContent).toContain('підрахунок їжі комусь допомагає, а комусь шкодить');
    start(withFoodOn());
    expect(section()).not.toBeNull();
    expect(section()!.textContent).toContain('калорії рахуються самі з білків, жирів і вуглеводів');
  });

  it('«+ прийом»: a dish typed by hand, kcal counted live, kept in the day and in «мої страви»', async () => {
    start(withFoodOn());
    [...section()!.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === '+ прийом')!.click();
    await settle();
    expect(sheet()).not.toBeNull();
    type(inSheet('[data-food="time"]'), '08:30');
    type(inSheet('[data-food="name"]'), 'вівсянка');
    type(inSheet('[data-f="p"]'), '12');
    type(inSheet('[data-f="f"]'), '8');
    type(inSheet('[data-f="c"]'), '45,5');
    expect(inSheet<HTMLInputElement>('[data-food="kcal"]')).toHaveProperty('placeholder', '302');
    expect(plain(inSheet('[data-sum]').textContent)).toContain('302 ккал');
    await save();
    expect(stored().days[TODAY]!.food).toEqual([{ t: '08:30', items: [{ name: 'вівсянка', portion: 1, p: 12, f: 8, c: 45.5, kcal: 302 }] }]);
    expect(readFoodSettings(stored().profile.food).dishes.map((d) => d.name)).toEqual(['вівсянка']);
  });

  it('the header sums the day; a portion multiplies; a kcal written by hand wins and is marked', async () => {
    start(withFoodOn());
    section()!.querySelector<HTMLElement>('[data-act="meal-add"]')!.click();
    await settle();
    type(inSheet('[data-food="name"]'), 'сирник');
    type(inSheet('[data-f="p"]'), '10');
    inSheet('[data-portion="2"]').click();
    type(inSheet('[data-food="kcal"]'), '250');
    expect(inSheet('[data-own]').hidden).toBe(false);
    expect(plain(inSheet('[data-sum]').textContent)).toContain('500 ккал · б 20');
    sheetButton('зберегти').click();
    await settle();
    expect(plain(hint()!.textContent)).toContain('500 ккал · б 20 · ж 0 · в 0');
    expect(section()!.querySelector('.food-meal')!.textContent).toContain('сирник ×2');
  });

  it('a dish from «мої страви» by the hint under the name; changing it changes only this meal', async () => {
    start(withFoodOn({ dishes: [{ name: 'гречка', p: 6, f: 2, c: 30, kcal: 162, portion: 'тарілка' }] }));
    section()!.querySelector<HTMLElement>('[data-act="meal-add"]')!.click();
    await settle();
    type(inSheet('[data-food="name"]'), 'гре');
    inSheet('.food-suggest [data-food="pick"]').click();
    expect(inSheet<HTMLInputElement>('[data-food="name"]')).toHaveProperty('value', 'гречка');
    type(inSheet('[data-f="p"]'), '7');
    // a dish of «мої страви» is not offered again
    expect(inSheet('[data-keep-box]').hidden).toBe(true);
    await save();
    expect(stored().days[TODAY]!.food![0]!.items[0]).toMatchObject({ name: 'гречка', p: 7 });
    expect(readFoodSettings(stored().profile.food).dishes[0]!.p).toBe(6);
  });

  it('a meal opens again to change it, and «видалити прийом» has «скасувати»', async () => {
    start(withFoodOn());
    section()!.querySelector<HTMLElement>('[data-act="meal-add"]')!.click();
    await settle();
    type(inSheet('[data-food="name"]'), 'яблуко');
    sheetButton('зберегти').click();
    await settle();
    section()!.querySelector<HTMLElement>('[data-act="meal"]')!.click();
    await settle();
    expect(inSheet<HTMLInputElement>('[data-food="name"]')).toHaveProperty('value', 'яблуко');
    sheetButton('видалити прийом').click();
    await settle();
    expect(section()!.querySelector('.food-meal')).toBeNull();
    expect(toastSays()).toBe('прийом видалено');
    [...document.querySelectorAll<HTMLButtonElement>('.toast button')].find((b) => b.textContent === 'скасувати')!.click();
    await settle();
    expect(section()!.querySelector('.food-meal')!.textContent).toContain('яблуко');
  });

  it('«вставити від ШІ»: the prompt is copied, the answer fills the rows marked as an estimate; a wrong one says why', async () => {
    start(withFoodOn());
    section()!.querySelector<HTMLElement>('[data-act="meal-add"]')!.click();
    await settle();
    sheetButton('вставити від ШІ').click();
    sheetButton('скопіювати запит').click();
    await settle();
    expect(copied[0]).toContain('body.log-food');
    type(inSheet('[data-food="paste-text"]'), 'не те');
    sheetButton('застосувати').click();
    expect(sheet()!.querySelector('.food-errors')!.textContent).toContain('не схоже на відповідь про їжу');
    type(inSheet('[data-food="paste-text"]'), JSON.stringify({ format: 'body.log-food', lang: 'uk', dishes: [{ name: 'борщ', p: 8, f: 6, c: 20 }, { name: 'хліб', p: 3, f: 1, c: 15 }] }));
    sheetButton('застосувати').click();
    expect([...sheet()!.querySelectorAll<HTMLInputElement>('[data-food="name"]')].map((x) => x.value)).toEqual(['борщ', 'хліб']);
    expect(sheet()!.textContent).toContain('оцінка ШІ, приблизно');
    await save();
    expect(stored().days[TODAY]!.food![0]!.items.every((item) => item.ai)).toBe(true);
  });

  it('only numbers get into the numbers; the full name of a dish still offers it', async () => {
    start(withFoodOn({ dishes: [{ name: 'гречка', p: 6, f: 2, c: 30, kcal: 162, portion: 'тарілка' }] }));
    section()!.querySelector<HTMLElement>('[data-act="meal-add"]')!.click();
    await settle();
    type(inSheet('[data-f="p"]'), '1о2');
    expect(inSheet<HTMLInputElement>('[data-f="p"]').value).toBe('12');
    expect(inSheet('[data-num-note]').hidden).toBe(false);
    type(inSheet('[data-f="p"]'), '12,5');
    expect(inSheet('[data-num-note]').hidden).toBe(true);
    type(inSheet('[data-food="name"]'), 'гречка');
    expect(inSheet('.food-suggest').textContent).toContain('гречка');
  });

  it('«скасувати» with something typed asks first', async () => {
    start(withFoodOn());
    section()!.querySelector<HTMLElement>('[data-act="meal-add"]')!.click();
    await settle();
    type(inSheet('[data-food="name"]'), 'чай');
    sheetButton('скасувати').click();
    await settle();
    expect(document.querySelector('.dialog')!.textContent).toContain('не зберігати прийом?');
  });

  it('without the numbers: only names; without names too: only the time', async () => {
    start(withFoodOn({ macros: false }));
    section()!.querySelector<HTMLElement>('[data-act="meal-add"]')!.click();
    await settle();
    expect(sheet()!.querySelector('[data-f="p"]')).toBeNull();
    expect(sheet()!.querySelector('[data-food="name"]')).not.toBeNull();
    start(withFoodOn({ macros: false, names: false }));
    section()!.querySelector<HTMLElement>('[data-act="meal-add"]')!.click();
    await settle();
    expect(sheet()!.querySelector('[data-food="name"]')).toBeNull();
    type(inSheet('[data-food="time"]'), '12:00');
    sheetButton('зберегти').click();
    await settle();
    expect(hint()!.textContent).toBe('1 прийом');
  });
});

describe('«їжа» and the settings from an AI', () => {
  it('a paste of new settings keeps «їжа» as it was: it is not in the AI\'s settings', () => {
    const now = withFood(EXAMPLE_DIARY.profile, { enabled: true, dishes: [{ name: 'чай', p: 0, f: 0, c: 0, kcal: 0, portion: '' }] });
    let saved: Record<string, unknown> | null = null;
    const flow = new PasteFlow({
      current: () => now, names: { accents: ACCENT_NAMES, accessibility: ACCESS_SHORT }, copyText: async () => true, say: () => {}, show: () => {},
      save: (profile) => {
        saved = profile;
      },
    });
    flow.apply(JSON.stringify(EXAMPLE_DIARY.profile));
    flow.act('save');
    expect(saved!.food).toEqual(now.food);
  });
});
