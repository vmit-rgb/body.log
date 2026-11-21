import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DayKey } from '../domain/dates';
import { readDay } from '../domain/day';
import { parseDiary, serializeDiary, type Diary, type JsonObject } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';
import { PROMPT } from '../prompt/prompt';
import { browserChoice, DIARY_KEY, diaryStore, sectionMemory } from '../storage/store';
import { mountToast } from '../ui/toast';
import { startApp } from './app';
import { fakeDevice } from './test-env';

// Invented data only.
const TODAY = '2026-11-09' as DayKey;
const WITH_A_DAY: Diary = {
  ...EXAMPLE_DIARY,
  days: { ['2026-11-08' as DayKey]: readDay({ note: 'вправа 1 легко', t: { morning: { energy: 6 } } }, '2026-11-08' as DayKey) },
};

let host: HTMLElement;
let device: ReturnType<typeof fakeDevice>['device'];

function start(diary: Diary = WITH_A_DAY, reduced = false): void {
  diaryStore(localStorage, () => new Date()).save(diary);
  document.body.innerHTML = '<main id="app"></main>';
  host = document.querySelector<HTMLElement>('#app')!;
  const fake = fakeDevice();
  device = fake.device;
  device.motionReduced = reduced;
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
    whenHidden: () => {},
    ...fake.env,
  });
}

const stored = (): Diary => parseDiary(localStorage.getItem(DIARY_KEY) ?? '')!;
const storedProfile = (): JsonObject => stored().profile;
const heading = () => host.querySelector('h1')?.textContent;
const toastSays = () => {
  const shown = document.querySelector<HTMLElement>('.toast:not([hidden])');
  if (!shown) return undefined;
  const check = shown.querySelector('.toast__check:not([hidden])') ? '✓ ' : '';
  return check + shown.querySelector('.toast__message')!.textContent;
};
const named = (b: HTMLElement) => (b.getAttribute('aria-label') ?? (b.querySelector('.accordion__title') ?? b).textContent!.trim());
const button = (name: string, root: ParentNode = document) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => named(b) === name)!;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const tap = async (name: string) => {
  button(name).click();
  await settle();
};
const checkbox = (label: string) => [...host.querySelectorAll<HTMLLabelElement>('label.checkbox')]
  .find((l) => l.textContent!.trim() === label)!.querySelector<HTMLInputElement>('input')!;
const tick = async (label: string) => {
  checkbox(label).click();
  await settle();
};
const dialog = () => document.querySelector<HTMLElement>('.dialog');
const editor = () => document.querySelector<HTMLElement>('.text-edit');
const partTitles = () => [...host.querySelectorAll('.st-part .accordion__title')].map((t) => t.textContent);
const meta = (title: string) => button(title).querySelector('.accordion__meta')?.textContent;
const openPart = (title: string) => tap(title);

async function openSettings(diary?: Diary, reduced?: boolean): Promise<void> {
  start(diary, reduced);
  await tap('меню');
  await tap('налаштування');
}

beforeEach(async () => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('settings: the page (Figma screen/edit-profile 186:3278)', () => {
  beforeEach(() => openSettings());

  it('opens from the menu, with its parts closed and 💾 ✕ in the bar', async () => {
    expect(heading()).toBe('налаштування');
    expect(partTitles()).toEqual([
      'самопочуття', 'ранкова розминка', 'денна розминка', 'тренування', 'рух', 'тижнева ціль',
      'акцентний колір', 'підбадьорлива фраза', 'доступність',
      'налаштування через ШІ', 'копія й експорт', 'видалення',
    ]);
    expect(button('тижнева ціль').getAttribute('aria-expanded')).toBe('false');
    expect(button('зберегти налаштування')).toBeTruthy();
    expect(button('закрити налаштування')).toBeTruthy();
    expect(host.textContent).toContain('натисни на будь-який текст, щоб змінити його. коли закінчиш — збережи внизу.');
  });

  it('E-14: puts the parts in three groups that never fold, a group titled for the screen reader', () => {
    const groups = [...host.querySelectorAll<HTMLElement>('.settings__parts > .settings__group')];
    expect(groups.map((g) => g.querySelector('h2')!.textContent)).toEqual(['що відстежую', 'вигляд і доступність', 'дані']);
    expect(groups.map((g) => g.querySelectorAll('.st-part').length)).toEqual([6, 3, 3]);
    for (const g of groups) {
      // named by its title; no button folds it
      expect(host.querySelector(`#${g.getAttribute('aria-labelledby')}`)!.textContent).toBe(g.querySelector('h2')!.textContent);
      expect(g.querySelector(':scope > h2 button')).toBeNull();
      expect(g.hidden).toBe(false);
    }
    // a part's title is one level under its group's
    expect(host.querySelectorAll('.st-part > h3.st-part__heading')).toHaveLength(12);
  });

  it('says what a closed part holds', async () => {
    expect(meta('тижнева ціль')).toBe('5 днів на тиждень');
    expect(meta('підбадьорлива фраза')).toBe('1 фраза');
    expect(meta('акцентний колір')).toBe('рожевий');
    expect(meta('доступність')).toBe('стандартно');
  });

  it('opens a part with a tap and hides its line', async () => {
    await openPart('тижнева ціль');
    expect(button('тижнева ціль').getAttribute('aria-expanded')).toBe('true');
    expect(meta('тижнева ціль')).toBeUndefined();
    expect(checkbox('рахувати тижневу ціль').checked).toBe(true);
  });

  it('closes with ✕ straight home when nothing changed', async () => {
    await tap('закрити налаштування');
    expect(heading()).toBe('головна');
    expect(dialog()).toBeNull();
    expect(device.depth()).toBe(0);
    // B-04: back on ≡, which opened the menu the settings came from
    expect(document.activeElement).toBe(button('меню'));
  });
});

describe('settings: saving and leaving', () => {
  beforeEach(async () => {
    await openSettings();
    await openPart('тижнева ціль');
  });

  it('keeps a change only on 💾, with «скасувати» in the toast', async () => {
    await tick('рахувати тижневу ціль');
    expect((storedProfile().goal as JsonObject).enabled).toBe(true);
    await tap('зберегти налаштування');
    expect((storedProfile().goal as JsonObject).enabled).toBe(false);
    expect(toastSays()).toBe('✓ збережено :)');
    await tap('скасувати');
    expect(toastSays()).toBe('✓ скасовано');
    expect((storedProfile().goal as JsonObject).enabled).toBe(true);
    expect(checkbox('рахувати тижневу ціль').checked).toBe(true);
  });

  it('F-02: 💾 carries a mark while something is not saved, and says so to a screen reader', async () => {
    const save = () => button('зберегти налаштування');
    const note = () => host.querySelector(`#${save().getAttribute('aria-describedby')}`)?.textContent;
    expect(save().classList).not.toContain('bar__menu--unsaved');
    expect(save().hasAttribute('aria-describedby')).toBe(false);
    await tick('рахувати тижневу ціль');
    expect(save().classList).toContain('bar__menu--unsaved');
    expect(note()).toBe('є незбережені зміни');
    await tap('зберегти налаштування');
    expect(save().classList).not.toContain('bar__menu--unsaved');
    expect(toastSays()).toBe('✓ збережено :)');
  });

  it('F-02: the mark goes when the change is taken back by hand', async () => {
    await tick('рахувати тижневу ціль');
    await tick('рахувати тижневу ціль');
    expect(button('зберегти налаштування').classList).not.toContain('bar__menu--unsaved');
  });

  it('F-01: «скасувати» after 💾 goes with the next change, so it can’t take newer changes back', async () => {
    await tick('рахувати тижневу ціль');
    await tap('зберегти налаштування');
    expect(button('скасувати')).toBeTruthy();
    await tick('рахувати тижневу ціль');
    expect(toastSays()).toBeUndefined();
  });

  it('keeps fields of the profile the screen doesn’t know', async () => {
    await tick('рахувати тижневу ціль');
    await tap('зберегти налаштування');
    expect(storedProfile().format).toBe('phys-activity-profile');
    expect(storedProfile().workout).toEqual(EXAMPLE_DIARY.profile.workout);
  });

  it('asks before ✕ throws changes away; «залишитися» stays', async () => {
    await tick('рахувати тижневу ціль');
    await tap('закрити налаштування');
    expect(dialog()!.textContent).toContain('вийти без збереження?');
    expect(dialog()!.textContent).toContain('зміни на цій сторінці пропадуть.');
    expect(document.activeElement!.textContent).toBe('залишитися');
    await tap('залишитися');
    expect(dialog()).toBeNull();
    expect(heading()).toBe('налаштування');
    expect(checkbox('рахувати тижневу ціль').checked).toBe(false);
  });

  it('leaves without saving on «вийти»', async () => {
    await tick('рахувати тижневу ціль');
    await tap('закрити налаштування');
    await tap('вийти');
    expect(heading()).toBe('головна');
    expect((storedProfile().goal as JsonObject).enabled).toBe(true);
  });

  it('asks on the phone’s back button too, and stays on «залишитися»', async () => {
    await tick('рахувати тижневу ціль');
    device.pressBack();
    await settle();
    expect(dialog()!.textContent).toContain('вийти без збереження?');
    await tap('залишитися');
    expect(heading()).toBe('налаштування');
    device.pressBack();
    await settle();
    await tap('вийти');
    expect(heading()).toBe('меню');
  });

  it('A-06: «назад» over «вийти без збереження?» closes the question, and asks no second time', async () => {
    await tick('рахувати тижневу ціль');
    device.pressBack();
    await settle();
    device.pressBack();
    await settle();
    expect(document.querySelectorAll('.dialog:not([inert])')).toHaveLength(0);
    expect(heading()).toBe('налаштування');
    expect(checkbox('рахувати тижневу ціль').checked).toBe(false);
    // the settings are still one step over the menu
    expect(device.depth()).toBe(2);
    device.pressBack();
    await settle();
    expect(document.querySelectorAll('.dialog:not([inert])')).toHaveLength(1);
    await tap('вийти');
    expect(heading()).toBe('меню');
    expect(document.querySelectorAll('.dialog:not([inert])')).toHaveLength(0);
    expect(device.depth()).toBe(1);
  });

  it('B-03: the screen under a dialog takes no focus, and Escape anywhere closes it', async () => {
    await tick('рахувати тижневу ціль');
    const closeButton = button('закрити налаштування');
    closeButton.focus();
    closeButton.click();
    await settle();
    expect(host.hasAttribute('inert')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(host.hasAttribute('inert')).toBe(false);
    expect(heading()).toBe('налаштування');
    expect(document.activeElement).toBe(button('закрити налаштування'));
  });

  it('«назад» with nothing changed leaves straight for the menu', async () => {
    device.pressBack();
    await settle();
    expect(dialog()).toBeNull();
    expect(heading()).toBe('меню');
    // the tap here focused nothing (as on an iPhone): the menu's heading takes the focus
    expect(document.activeElement).toBe(host.querySelector('h1'));
  });

  it('closes with Escape the same as «залишитися»', async () => {
    await tick('рахувати тижневу ціль');
    await tap('закрити налаштування');
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(dialog()).toBeNull();
    expect(heading()).toBe('налаштування');
  });
});

describe('settings: the weekly goal', () => {
  beforeEach(async () => {
    await openSettings();
    await openPart('тижнева ціль');
  });

  it('lists the kinds that are on and changes what makes a day «зроблено»', async () => {
    expect(host.textContent).toContain('що треба виконати, щоб день зарахувався');
    expect(checkbox('ранкова розминка').checked).toBe(true);
    await tick('денна розминка');
    await tap('зберегти налаштування');
    expect((storedProfile().goal as JsonObject).done).toEqual(['morningWarmup', 'daytimeWarmup']);
  });

  it('names the slider «ціль: днів на тиждень» with 0–7 under it (settings/weekly-goal, п. 28)', () => {
    const days = host.querySelector('.st-days')!;
    expect(days.querySelector('.st-days__head .t-1st-semibold')!.textContent).toBe('ціль: днів на тиждень');
    expect([...days.querySelectorAll('.st-days__ticks span')].map((tick) => tick.textContent)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7']);
    // the chosen number is marked, and only it
    const value = days.querySelector('.st-days__value')!.textContent!.split('/')[0];
    expect([...days.querySelectorAll('.st-days__ticks .on')].map((tick) => tick.textContent)).toEqual([value]);
  });

  it('changes the days with − and + within 0–7', async () => {
    await tap('більше: днів на тиждень');
    await tap('більше: днів на тиждень');
    await tap('більше: днів на тиждень');
    expect(host.querySelector('.st-days__value')!.textContent).toBe('7/7');
    await tap('зберегти налаштування');
    expect((storedProfile().goal as JsonObject).days).toBe(7);
  });

  it('hides what to count when the goal is off', async () => {
    await tick('рахувати тижневу ціль');
    expect(host.textContent).not.toContain('що треба виконати');
  });
});

describe('settings: the phrase', () => {
  beforeEach(async () => {
    await openSettings();
    await openPart('підбадьорлива фраза');
  });

  const typeIn = (text: string) => {
    editor()!.querySelector<HTMLTextAreaElement>('textarea')!.value = text;
  };

  it('changes a phrase in the full-screen field', async () => {
    await tap('ти можеш налаштувати все в налаштуваннях :)');
    expect(editor()!.textContent).toContain('підбадьорлива фраза');
    expect(editor()!.querySelector('textarea')!.value).toBe('ти можеш налаштувати все в налаштуваннях :)');
    typeIn('маленький крок теж рахується');
    await tap('готово');
    expect(editor()).toBeNull();
    expect(button('маленький крок теж рахується')).toBeTruthy();
  });

  it('gives the old phrase back on «скасувати»', async () => {
    await tap('ти можеш налаштувати все в налаштуваннях :)');
    typeIn('інше');
    await tap('скасувати');
    expect(button('ти можеш налаштувати все в налаштуваннях :)')).toBeTruthy();
  });

  it('«назад» closes the full-screen field as «скасувати», and the settings stay (Olesia, MY-FIXES)', async () => {
    await tap('ти можеш налаштувати все в налаштуваннях :)');
    expect(device.depth()).toBe(3);
    typeIn('не збережеться');
    device.pressBack();
    await settle();
    expect(editor()).toBeNull();
    expect(heading()).toBe('налаштування');
    expect(button('ти можеш налаштувати все в налаштуваннях :)')).toBeTruthy();
    expect(device.depth()).toBe(2);
  });

  it('adds a phrase at the end and drops it when nothing was typed', async () => {
    await tap('додати фразу');
    expect(editor()!.querySelector('textarea')!.value).toBe('');
    await tap('скасувати');
    expect(host.querySelectorAll('[data-act="phrase"]')).toHaveLength(1);
    await tap('додати фразу');
    typeIn('ти тут — це вже половина справи');
    editor()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    await tap('зберегти налаштування');
    expect(storedProfile().encouragement).toEqual(['ти можеш налаштувати все в налаштуваннях :)', 'ти тут — це вже половина справи']);
  });

  it('removes a phrase after asking', async () => {
    await tap('видалити: ти можеш налаштувати все в налаштуваннях :)');
    expect(dialog()!.textContent).toContain('видалити «ти можеш налаштувати все в налаштуваннях :)»?');
    await tap('видалити');
    expect(host.querySelectorAll('[data-act="phrase"]')).toHaveLength(0);
    await tap('зберегти налаштування');
    expect(storedProfile().encouragement).toEqual([]);
  });
});

describe('settings: accent and «доступність»', () => {
  it('shows a new accent at once and keeps it on 💾', async () => {
    await openSettings();
    await openPart('акцентний колір');
    expect(host.textContent).toContain('гортай, щоб побачити всі');
    expect(button('рожевий').getAttribute('aria-pressed')).toBe('true');
    await tap('блакитний');
    expect(button('блакитний').getAttribute('aria-pressed')).toBe('true');
    // the new colour comes in the middle of the flicker (ui/flicker.ts)
    await vi.waitFor(() => expect((device.looks.at(-1)!.theme as JsonObject).accent).toBe('sky'));
    await tap('зберегти налаштування');
    expect((storedProfile().theme as JsonObject).accent).toBe('sky');
  });

  it('names the eleven swatches in the picker’s order (Olesia, 2026-11-12)', async () => {
    await openSettings();
    await openPart('акцентний колір');
    expect([...host.querySelectorAll('.swatch')].map((s) => s.getAttribute('aria-label'))).toEqual([
      'сірий', 'помаранчевий', 'рожевий', 'пурпуровий', 'фіолетовий', 'лавандовий',
      'синій', 'блакитний', 'бірюзовий', 'мʼятний', 'зелений',
    ]);
  });

  it('puts the saved look back when leaving without saving', async () => {
    await openSettings();
    await openPart('акцентний колір');
    await tap('блакитний');
    await tap('закрити налаштування');
    await tap('вийти');
    expect((device.looks.at(-1)!.theme as JsonObject).accent).toBe('pink');
  });

  it('has nine checkboxes, applied at once and kept on 💾', async () => {
    await openSettings();
    await openPart('доступність');
    const labels = [...host.querySelectorAll('#st-access label.checkbox')].map((l) => l.textContent!.trim());
    expect(labels).toEqual([
      'вимкнути всі анімації', 'вимкнути фонові анімації (ASCII)', 'вимкнути вібрацію', 'вимкнути звук',
      'збільшити зони натискання', 'збільшити розмір тексту', 'віддзеркалити нижню панель', 'вимкнути зникання повідомлень',
      'показувати ⋯ біля пунктів, що потребують затискання',
    ]);
    await tick('збільшити розмір тексту');
    expect((device.looks.at(-1)!.accessibility as JsonObject).largerText).toBe(true);
    await tick('вимкнути звук');
    await tap('зберегти налаштування');
    expect(storedProfile().accessibility).toMatchObject({ largerText: true, noSound: true, noMotion: false });
    await tap('доступність');
    expect(meta('доступність')).toBe('без звуку, більший текст');
  });

  it('«вимкнути зникання повідомлень» explains itself in small text, tied to the checkbox', async () => {
    await openSettings();
    await openPart('доступність');
    const box = checkbox('вимкнути зникання повідомлень');
    const hint = host.querySelector(`#${box.getAttribute('aria-describedby')}`)!;
    expect(hint.textContent).toBe('повідомлення внизу екрана лишаються, поки не натиснеш ×');
  });

  it('«вимкнути зникання повідомлень» keeps toasts at once, before 💾, and lets them go again when switched off', async () => {
    const life = () => document.querySelector<HTMLElement>('.toast__life')!;
    await openSettings();
    await openPart('копія й експорт');
    await tap('зберегти копію');
    expect(toastSays()).toBe('✓ копію збережено');
    expect(life().hidden).toBe(false);
    await openPart('доступність');
    await tick('вимкнути зникання повідомлень');
    expect(life().hidden).toBe(true);
    await tap('зберегти копію');
    expect(life().hidden).toBe(true);
    await tick('вимкнути зникання повідомлень');
    expect(life().hidden).toBe(false);
    await tap('доступність');
    expect(meta('доступність')).toBe('стандартно');
  });

  it('«вимкнути зникання повідомлень» saved in the settings holds from the start of the app', async () => {
    const kept = { ...WITH_A_DAY, profile: { ...WITH_A_DAY.profile, accessibility: { keepToasts: true } } };
    await openSettings(kept);
    expect(meta('доступність')).toBe('повідомлення не зникають');
    await openPart('копія й експорт');
    await tap('зберегти копію');
    expect(document.querySelector<HTMLElement>('.toast__life')!.hidden).toBe(true);
  });

  it('locks the two animation checkboxes when the phone reduces motion', async () => {
    await openSettings(WITH_A_DAY, true);
    await openPart('доступність');
    expect(checkbox('вимкнути всі анімації').checked).toBe(true);
    expect(checkbox('вимкнути всі анімації').disabled).toBe(true);
    expect(checkbox('вимкнути фонові анімації (ASCII)').disabled).toBe(true);
    expect(checkbox('вимкнути вібрацію').disabled).toBe(false);
    expect(host.textContent).toContain('на телефоні ввімкнено «зменшити рух», тож анімації вимкнені.');
  });
});

describe('settings: the pulse timer', () => {
  beforeEach(async () => {
    await openSettings();
    await openPart('самопочуття');
    await tap('розгорнути: одне число');
  });

  it('shows the timer of each one-number question, with its length', async () => {
    expect(host.querySelector('#st-wellbeing')!.textContent).toContain('пульс');
    expect(checkbox('таймер для пульсу').checked).toBe(true);
    expect(host.textContent).toContain('на головній зʼявиться таймер');
    expect(button('30 с').getAttribute('aria-pressed')).toBe('true');
  });

  it('changes the length and switches the timer off', async () => {
    await tap('60 с');
    await tap('зберегти налаштування');
    const pulse = () => (storedProfile().trackers as JsonObject[]).find((t) => t.id === 'pulse')!;
    expect(pulse().timer).toEqual({ enabled: true, seconds: 60 });
    await tick('таймер для пульсу');
    expect(button('60 с')).toBeUndefined();
    await tap('зберегти налаштування');
    expect(pulse().timer).toEqual({ enabled: false, seconds: 60 });
  });
});

describe('settings: «налаштування через ШІ»', () => {
  beforeEach(async () => {
    await openSettings();
    await openPart('налаштування через ШІ');
  });

  it('copies the settings for the AI', async () => {
    await tap('скопіювати мої налаштування для ШІ');
    await Promise.resolve();
    await Promise.resolve();
    expect(JSON.parse(device.copied[0]!)).toEqual(EXAMPLE_DIARY.profile);
    expect(device.copied[0]!.startsWith('{\n "format": "phys-activity-profile",')).toBe(true);
    expect(toastSays()).toBe('✓ скопійовано — встав у чат зі своїм ШІ');
  });

  it('copies the prompt and names its version; «застосувати» waits for text', async () => {
    await tap('скопіювати промпт');
    await settle();
    expect(toastSays()).toBe('✓ промпт 0.1 скопійовано');
    expect(device.copied).toEqual([PROMPT.text]);
    device.copyWorks = false;
    await tap('скопіювати промпт');
    await settle();
    expect(toastSays()).toBe('не вдалося скопіювати >_<');
    expect(button('застосувати').disabled).toBe(true);
    const field = host.querySelector<HTMLTextAreaElement>('textarea')!;
    field.value = '{ }';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(button('застосувати').disabled).toBe(false);
  });

  const pasteText = async (value: unknown) => {
    const field = host.querySelector<HTMLTextAreaElement>('textarea')!;
    field.value = typeof value === 'string' ? value : JSON.stringify(value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await tap('застосувати');
  };
  const result = () => host.querySelector<HTMLElement>('[data-paste-result]')!;
  const title = () => result().querySelector('[data-paste-title]')?.textContent;
  const CHANGED = {
    ...EXAMPLE_DIARY.profile,
    theme: { accent: 'mint' },
    exercises: [...(EXAMPLE_DIARY.profile.exercises as JsonObject[]).map((e) => (e.id === 'exercise-1' ? { ...e, name: 'присід' } : e)), { id: 'bridge', name: 'місток' }],
    trackers: (EXAMPLE_DIARY.profile.trackers as JsonObject[]).filter((t) => t.id !== 'hard'),
  };

  it('previews a paste: added, changed, removed, and the records stay', async () => {
    await pasteText(CHANGED);
    expect(title()).toBe('ось що зміниться');
    expect(document.activeElement).toBe(result().querySelector('[data-paste-title]'));
    const groups = [...result().querySelectorAll('.paste-result__group')].map((g) => g.textContent!.replace(/\s+/g, ' ').trim());
    expect(groups).toEqual([
      'додановправа: місток',
      'зміненоакцентний колір: мʼятнийвправа: присід',
      'прибранопитання про самопочуття: було важко?',
    ]);
    expect(result().textContent).toContain('записи лишаються як були');
    expect(storedProfile()).toEqual(EXAMPLE_DIARY.profile);
  });

  it('«зберегти» keeps the pasted settings and the records; «скасувати» on the toast brings the old ones back', async () => {
    await pasteText(CHANGED);
    await tap('зберегти');
    expect(toastSays()).toBe('✓ збережено :)');
    expect(storedProfile()).toEqual(CHANGED);
    expect(stored().days).toEqual(WITH_A_DAY.days);
    expect(result().hidden).toBe(true);
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
    document.querySelector<HTMLElement>('.toast__action')!.click();
    expect(toastSays()).toBe('✓ скасовано');
    expect(storedProfile()).toEqual(EXAMPLE_DIARY.profile);
    expect(stored().days).toEqual(WITH_A_DAY.days);
  });

  it('«скасувати» in the preview changes nothing', async () => {
    await pasteText(CHANGED);
    await tap('скасувати');
    expect(result().hidden).toBe(true);
    expect(storedProfile()).toEqual(EXAMPLE_DIARY.profile);
  });

  it('says so when the paste is the same as the settings', async () => {
    await pasteText(EXAMPLE_DIARY.profile);
    expect(title()).toBe('нічого не зміниться');
    expect(button('зберегти', result())).toBeUndefined();
    await tap('закрити');
    expect(result().hidden).toBe(true);
  });

  it('keeps «доступність» unless the paste carries it, and then shows it in the preview', async () => {
    await openSettings({ ...WITH_A_DAY, profile: { ...EXAMPLE_DIARY.profile, accessibility: { largerText: true } } });
    await openPart('налаштування через ШІ');
    await pasteText(CHANGED);
    expect(result().textContent).not.toContain('доступність');
    await tap('зберегти');
    expect(storedProfile().accessibility).toEqual({ largerText: true });
    await pasteText({ ...CHANGED, accessibility: { noMotion: true } });
    expect(result().textContent).toContain('доступність: без анімацій');
    await tap('зберегти');
    expect(storedProfile().accessibility).toEqual({ noMotion: true });
  });

  it('keeps the accent colour when the paste has no `theme` (Olesia, 2026-11-15)', async () => {
    await openSettings({ ...WITH_A_DAY, profile: { ...EXAMPLE_DIARY.profile, theme: { accent: 'sky' } } });
    await openPart('налаштування через ШІ');
    const { theme: _theme, ...noTheme } = CHANGED;
    await pasteText(noTheme);
    expect(title()).toBe('ось що зміниться');
    expect(result().textContent).not.toContain('акцентний колір');
    await tap('зберегти');
    expect(storedProfile().theme).toEqual({ accent: 'sky' });
    expect(storedProfile().exercises).toEqual(CHANGED.exercises);
  });

  it('brings back changes not saved yet when the paste is undone', async () => {
    await openPart('тижнева ціль');
    await tick('рахувати тижневу ціль');
    await openPart('тижнева ціль');
    await pasteText(CHANGED);
    await tap('зберегти');
    document.querySelector<HTMLElement>('.toast__action')!.click();
    await settle();
    expect(storedProfile()).toEqual(EXAMPLE_DIARY.profile);
    expect(meta('тижнева ціль')).toBe('вимкнено');
  });

  it('refuses an error, a part and russian; unknown keys can be left out', async () => {
    await pasteText({ ...CHANGED, theme: { accent: 'red' } });
    expect(title()).toBe('щось не так у налаштуваннях >_<');
    // a refusal empties the field, so the next answer goes in at once (Olesia, 2026-11-18)
    const field = host.querySelector<HTMLTextAreaElement>('[data-input="paste"]')!;
    expect(field.value).toBe('');
    expect(button('застосувати').disabled).toBe(true);
    await tap('скопіювати для ШІ');
    await settle();
    expect(device.copied.at(-1)).toContain('[theme.accent]');
    const { trackers: _t, ...part } = CHANGED;
    await pasteText(part);
    expect(title()).toBe('це лише частина налаштувань');
    await pasteText({ ...CHANGED, lang: 'ru' });
    expect(title()).toBe('налаштування російською мовою не приймаються.');
    await pasteText({ ...CHANGED, ui: null });
    expect(title()).toBe('ось що застосунок не прочитав');
    await tap('продовжити без цього');
    expect(title()).toBe('ось що зміниться');
    await tap('зберегти');
    expect(storedProfile()).toEqual(CHANGED);
  });

  it('has no «відновити з копії»: it lives in «копія й експорт» (A-07)', () => {
    expect(host.querySelector('[data-restore]')).toBeNull();
  });
});

describe('settings: copy and export', () => {
  beforeEach(async () => {
    await openSettings();
    await openPart('копія й експорт');
  });

  const pick = async (text: string) => {
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [new File([text], 'trekr-kopiya.json')] });
    input.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const FROM_FILE = serializeDiary(
    { ...EXAMPLE_DIARY, days: { ['2026-11-01' as DayKey]: readDay({ note: 'з файлу' }, '2026-11-01' as DayKey) } }, new Date(),
  );

  it('«відновити з копії» sits right under «зберегти копію» (A-07)', () => {
    const buttons = [...host.querySelectorAll('#st-backup button')].map((b) => b.textContent);
    expect(buttons.slice(0, 2)).toEqual(['зберегти копію', 'відновити з копії']);
  });

  it('refuses to restore a copy whose settings are russian, before asking anything', async () => {
    await pick(serializeDiary({ profile: { ...EXAMPLE_DIARY.profile, lang: 'ru' }, days: {} }, new Date()));
    expect(dialog()).toBeNull();
    expect(toastSays()).toBe('копію не відновлено: налаштування в ній російською мовою.');
    expect(stored()).toEqual(WITH_A_DAY);
  });

  it('before replacing, offers to save a copy of what is here now (A-08)', async () => {
    await pick(FROM_FILE);
    expect(dialog()!.textContent).toContain('поточні дані буде замінено. спершу зберегти копію?');
    expect(dialog()!.textContent).toContain('у файлі 1 день записів і налаштування. вони замінять ті, що є зараз.');
    expect([...dialog()!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['зберегти й відновити', 'скасувати', 'відновити без збереження']);
  });

  it('«зберегти й відновити» saves the copy of the old diary first, then restores and goes home', async () => {
    await pick(FROM_FILE);
    await tap('зберегти й відновити');
    expect(device.saved).toHaveLength(1);
    expect(device.saved[0]!.name).toBe('trekr-kopiya-2026-11-09.json');
    expect(Object.keys(JSON.parse(device.saved[0]!.text).days)).toEqual(Object.keys(WITH_A_DAY.days));
    expect(heading()).toBe('головна');
    expect(Object.keys(stored().days)).toEqual(['2026-11-01']);
    expect(toastSays()).toBe('✓ відновлено з файлу :)');
  });

  it('«зберегти й відновити» replaces nothing when the phone refuses the copy', async () => {
    device.saveWorks = false;
    await pick(FROM_FILE);
    await tap('зберегти й відновити');
    expect(stored()).toEqual(WITH_A_DAY);
    expect(toastSays()).toBe('не вдалося зберегти файл >_<');
    expect(heading()).not.toBe('головна');
  });

  it('«відновити без збереження» restores without a copy', async () => {
    await pick(FROM_FILE);
    await tap('відновити без збереження');
    expect(device.saved).toEqual([]);
    expect(heading()).toBe('головна');
    expect(Object.keys(stored().days)).toEqual(['2026-11-01']);
  });

  it('«скасувати» leaves everything as it was', async () => {
    await pick(FROM_FILE);
    await tap('скасувати');
    expect(dialog()).toBeNull();
    expect(stored()).toEqual(WITH_A_DAY);
  });

  it('says so when the file is not a copy', async () => {
    await pick('не копія');
    expect(dialog()).toBeNull();
    expect(toastSays()).toBe('цей файл не схожий на копію з body.log >_<');
  });

  it('says that a copy holds health records (E-13)', () => {
    expect(host.querySelector('#st-backup')!.textContent).toContain('у копії всі записи про здоровʼя.');
  });

  it('saves a copy and says how old it is', async () => {
    expect(host.querySelector('#st-backup')!.textContent).toContain('копії ще немає');
    await tap('зберегти копію');
    expect(device.saved[0]!.name).toBe('trekr-kopiya-2026-11-09.json');
    expect(host.querySelector('#st-backup')!.textContent).toContain('остання копія — сьогодні');
  });

  it('exports the records with the health-data warning', async () => {
    expect(button('записи').getAttribute('aria-pressed')).toBe('true');
    expect(host.textContent).toContain('записи — це дані про твоє здоровʼя. надсилай їх лише тим, кому довіряєш; у чаті з ШІ вони потрапляють до стороннього сервісу.');
    // E-13: the warning stands over all three buttons, not only the one for an AI
    const warning = [...host.querySelectorAll('.st-warning')].find((p) => p.textContent!.startsWith('записи —'))!;
    expect(warning.compareDocumentPosition(button('зберегти PDF')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(warning.compareDocumentPosition(button('скопіювати для ШІ')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await tap('скопіювати для ШІ');
    await Promise.resolve();
    await Promise.resolve();
    expect(device.copied[0]).toContain('Мій щоденник руху й самопочуття (експорт з body.log, 09.11.2026)');
    expect(device.copied[0]).toContain('нотатка: вправа 1 легко');
    await tap('зберегти JSON');
    expect(device.saved[0]!.name).toBe('trekr-zapysy-2026-11-09.json');
    expect(JSON.parse(device.saved[0]!.text).format).toBe('phys-activity-log');
  });

  it('exports the exercises without the warning', async () => {
    await tap('вправи');
    expect(button('вправи').getAttribute('aria-pressed')).toBe('true');
    expect(host.textContent).not.toContain('записи — це дані про твоє здоровʼя');
    await tap('скопіювати для ШІ');
    await Promise.resolve();
    await Promise.resolve();
    expect(device.copied[0]).toContain('Мої вправи (з body.log, 09.11.2026):');
    await tap('зберегти JSON');
    expect(device.saved[0]!.name).toBe('trekr-vpravy-2026-11-09.json');
  });

  it('saves the records and the exercises as PDF', async () => {
    await tap('зберегти PDF');
    await vi.waitFor(() => expect(device.saved).toHaveLength(1));
    expect(device.saved[0]!.name).toBe('trekr-zapysy-2026-11-09.pdf');
    expect(device.saved[0]!.text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(device.saved[0]!.text).toContain('/Count 1');
    expect(toastSays()).toBe('✓ збережено');
    await tap('вправи');
    await tap('зберегти PDF');
    await vi.waitFor(() => expect(device.saved).toHaveLength(2));
    expect(device.saved[1]!.name).toBe('trekr-vpravy-2026-11-09.pdf');
  });

  it('says so when the PDF cannot be made', async () => {
    device.fontsWork = false;
    await tap('зберегти PDF');
    await vi.waitFor(() => expect(toastSays()).toBe('не вдалося зібрати PDF >_<'));
    expect(device.saved).toEqual([]);
  });

  it('says so when the phone refuses the PDF', async () => {
    device.saveWorks = false;
    await tap('зберегти PDF');
    await vi.waitFor(() => expect(toastSays()).toBe('не вдалося зберегти файл >_<'));
  });

  it('says so when the phone refuses the file', async () => {
    device.saveWorks = false;
    await tap('зберегти JSON');
    expect(toastSays()).toBe('не вдалося зберегти файл >_<');
  });
});

describe('settings: deleting', () => {
  beforeEach(async () => {
    await openSettings();
    await openPart('видалення');
  });

  it('deletes the records only after asking, with «скасувати» after', async () => {
    expect(host.textContent).toContain('після натискання зʼявиться вікно з підтвердженням. утримувати нічого не треба.');
    await tap('видалити тільки записи');
    expect(dialog()!.textContent).toContain('видалити тільки записи?');
    // E-04: nothing says «видалене не повернути» while the toast offers «скасувати»
    expect(dialog()!.textContent).not.toContain('не повернути');
    expect(host.textContent).not.toContain('не повернути');
    await tap('скасувати');
    expect(Object.keys(stored().days)).toHaveLength(1);
    await tap('видалити тільки записи');
    await tap('видалити');
    expect(stored().days).toEqual({});
    expect(storedProfile()).toEqual(EXAMPLE_DIARY.profile);
    expect(toastSays()).toBe('✓ записи видалено');
    await tap('скасувати');
    expect(toastSays()).toBe('✓ скасовано');
    expect(Object.keys(stored().days)).toEqual(['2026-11-08']);
  });

  it('erases everything after asking, offering a copy first', async () => {
    await tap('стерти все разом з налаштуваннями');
    expect(dialog()!.textContent).toContain('стерти все разом з налаштуваннями?');
    expect(dialog()!.textContent).toContain('спершу збережи копію.');
    expect(dialog()!.textContent).not.toContain('не повернути');
    button('зберегти копію', dialog()!).click();
    await settle();
    expect(device.saved[0]!.name).toBe('trekr-kopiya-2026-11-09.json');
    expect(dialog()).toBeNull();
    await tap('стерти все разом з налаштуваннями');
    await tap('стерти все');
    expect(localStorage.getItem(DIARY_KEY)).toBeNull();
    expect(host.textContent).toContain('почати без ШІ');
    expect(toastSays()).toBe('✓ усе видалено');
    await tap('скасувати');
    expect(toastSays()).toBe('✓ скасовано');
    expect(heading()).toBe('головна');
    expect(Object.keys(stored().days)).toEqual(['2026-11-08']);
  });
});

describe('settings: less common paths', () => {
  afterEach(() => vi.restoreAllMocks());

  const failWrites = () => vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('QuotaExceededError');
  });
  const NOT_SAVED = 'не вдалося зберегти: схоже, на телефоні забракло місця >_<';
  const pick = async (file: unknown) => {
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await settle();
  };

  it('takes a kind out of the goal and moves the days with the slider itself', async () => {
    await openSettings();
    await openPart('тижнева ціль');
    await tick('ранкова розминка');
    const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    range.value = '3';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(host.querySelector('.st-days__value')!.textContent).toBe('3/7');
    await tap('зберегти налаштування');
    expect(storedProfile().goal).toMatchObject({ done: [], days: 3 });
  });

  it('keeps the focus on the same control after a redraw', async () => {
    await openSettings();
    await openPart('тижнева ціль');
    checkbox('рахувати тижневу ціль').focus();
    await tick('рахувати тижневу ціль');
    expect((document.activeElement as HTMLElement).dataset.act).toBe('goal-on');
    await openPart('налаштування через ШІ');
    await openPart('копія й експорт');
    host.querySelector<HTMLElement>('[data-restore]')!.focus();
    await tick('рахувати тижневу ціль');
    expect(document.activeElement).toBe(document.body);
    expect(host.querySelector('textarea')!.value).toBe('');
  });

  it('opens the file picker and keeps pasted text over a redraw', async () => {
    await openSettings();
    await openPart('налаштування через ШІ');
    await openPart('копія й експорт');
    const picker = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    await tap('відновити з копії');
    expect(picker).toHaveBeenCalled();
    const field = host.querySelector<HTMLTextAreaElement>('textarea')!;
    field.value = 'від ШІ';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await openPart('тижнева ціль');
    expect(host.querySelector('textarea')!.value).toBe('від ШІ');
    expect(button('застосувати').disabled).toBe(false);
  });

  it('says so when the phone refuses to store, and keeps the draft', async () => {
    await openSettings();
    await openPart('тижнева ціль');
    await tick('рахувати тижневу ціль');
    failWrites();
    await tap('зберегти налаштування');
    expect(toastSays()).toBe(NOT_SAVED);
    expect(checkbox('рахувати тижневу ціль').checked).toBe(false);
  });

  it('keeps the saved settings when undoing fails', async () => {
    await openSettings();
    await openPart('тижнева ціль');
    await tick('рахувати тижневу ціль');
    await tap('зберегти налаштування');
    failWrites();
    await tap('скасувати');
    vi.restoreAllMocks();
    expect((storedProfile().goal as JsonObject).enabled).toBe(false);
  });

  it('keeps the records when deleting them can’t be stored', async () => {
    await openSettings();
    await openPart('видалення');
    await tap('видалити тільки записи');
    failWrites();
    await tap('видалити');
    vi.restoreAllMocks();
    expect(Object.keys(stored().days)).toHaveLength(1);
    expect(toastSays()).toBe(NOT_SAVED);
  });

  it('says so when copying fails', async () => {
    await openSettings();
    await openPart('налаштування через ШІ');
    device.copyWorks = false;
    await tap('скопіювати мої налаштування для ШІ');
    expect(toastSays()).toBe('не вдалося скопіювати >_<');
  });

  it('changes nothing when restoring or erasing is cancelled', async () => {
    await openSettings();
    await openPart('копія й експорт');
    await pick(new File([serializeDiary(EXAMPLE_DIARY, new Date())], 'trekr-kopiya.json'));
    await tap('скасувати');
    await openPart('видалення');
    await tap('стерти все разом з налаштуваннями');
    await tap('скасувати');
    expect(heading()).toBe('налаштування');
    expect(Object.keys(stored().days)).toHaveLength(1);
  });

  it('says a file that can’t be read is not a copy', async () => {
    await openSettings();
    await openPart('копія й експорт');
    await pick({ text: () => Promise.reject(new Error('unreadable')) });
    expect(toastSays()).toBe('цей файл не схожий на копію з body.log >_<');
  });

  it('has no timer when no question takes a number', async () => {
    await openSettings({ profile: { ...EXAMPLE_DIARY.profile, trackers: [] }, days: {} });
    await openPart('самопочуття');
    await tap('розгорнути: одне число');
    expect(host.textContent).toContain('наприклад, пульс');
    expect(host.textContent).not.toContain('таймер для пульсу');
    expect(meta('доступність')).toBe('стандартно');
  });

  it('turns a timer on at 30 s on an unnamed question', async () => {
    await openSettings({ profile: { ...EXAMPLE_DIARY.profile, trackers: [{ id: 'n', name: '', kind: 'number', ask: ['morning'] }] }, days: {} });
    await openPart('самопочуття');
    await tap('розгорнути: одне число');
    expect(button('видалити поле: без назви')).toBeTruthy();
    await tick('таймер для пульсу');
    expect(button('30 с').getAttribute('aria-pressed')).toBe('true');
    await tap('зберегти налаштування');
    expect((storedProfile().trackers as JsonObject[])[0]!.timer).toEqual({ enabled: true, seconds: 30 });
  });
});

describe('settings: the days at their ends', () => {
  it('goes down with − and stops at 0 and at 7', async () => {
    await openSettings();
    await openPart('тижнева ціль');
    for (let i = 0; i < 5; i += 1) await tap('менше: днів на тиждень');
    expect(host.querySelector('.st-days__value')!.textContent).toBe('0/7');
    expect(button('менше: днів на тиждень').disabled).toBe(true);
    expect(button('більше: днів на тиждень').disabled).toBe(false);
    for (let i = 0; i < 7; i += 1) await tap('більше: днів на тиждень');
    expect(button('більше: днів на тиждень').disabled).toBe(true);
    expect(button('менше: днів на тиждень').disabled).toBe(false);
    const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(range.getAttribute('aria-valuetext')).toBe('7 з 7');
  });
});

describe('settings: «будь-яка активність зараховує день» (Olesia, 2026-11-19)', () => {
  const anyBox = () => [...host.querySelectorAll<HTMLLabelElement>('label.checkbox')].find((l) => l.textContent!.trim() === 'будь-яка активність зараховує день');
  const noGoal = (): Diary => {
    const { goal: _goal, ...profile } = EXAMPLE_DIARY.profile;
    return { ...WITH_A_DAY, profile };
  };
  // a goal stored before `any` existed
  const oldGoal = (): Diary => ({ ...WITH_A_DAY, profile: { ...EXAMPLE_DIARY.profile, goal: { enabled: true, days: 5, done: ['morningWarmup'] } } });

  it('shows only with two or more sections ticked, under the list, as a labelled checkbox', async () => {
    await openSettings(oldGoal());
    await openPart('тижнева ціль');
    expect(anyBox()).toBeUndefined();
    await tick('денна розминка');
    const box = anyBox()!;
    expect(box).toBeDefined();
    // under the sections, above the days slider
    const order = [...host.querySelectorAll('#st-goal label.checkbox, #st-goal .st-days')];
    expect(order.indexOf(box)).toBe(order.indexOf(host.querySelector('#st-goal .st-days')!) - 1);
    expect(box.classList.contains('ctl')).toBe(true);
    expect(box.querySelector('input')!.type).toBe('checkbox');
    // an existing goal without `any` stays «усі»
    expect(box.querySelector('input')!.checked).toBe(false);
    await tick('денна розминка');
    expect(anyBox()).toBeUndefined();
  });

  it('the «почати без ШІ» example finds it ticked once a second section is ticked', async () => {
    await openSettings();
    await openPart('тижнева ціль');
    expect(anyBox()).toBeUndefined();
    await tick('денна розминка');
    expect(checkbox('будь-яка активність зараховує день').checked).toBe(true);
    await tap('зберегти налаштування');
    expect(storedProfile().goal).toMatchObject({ done: ['morningWarmup', 'daytimeWarmup'], any: true });
  });

  it('saves `any`, keeps the focus on it after the redraw and says it in the closed row', async () => {
    await openSettings(oldGoal());
    await openPart('тижнева ціль');
    await tick('денна розминка');
    checkbox('будь-яка активність зараховує день').focus();
    await tick('будь-яка активність зараховує день');
    expect((document.activeElement as HTMLElement).dataset.act).toBe('goal-any');
    await tap('зберегти налаштування');
    expect(storedProfile().goal).toMatchObject({ done: ['morningWarmup', 'daytimeWarmup'], any: true });
    await openPart('тижнева ціль');
    expect(meta('тижнева ціль')).toBe('5 днів на тиждень, будь-яка активність');
  });

  it('a goal switched on from nothing starts with the checkbox ticked', async () => {
    await openSettings(noGoal());
    await openPart('тижнева ціль');
    await tick('рахувати тижневу ціль');
    await tick('ранкова розминка');
    await tick('денна розминка');
    expect(checkbox('будь-яка активність зараховує день').checked).toBe(true);
    await tap('зберегти налаштування');
    expect(storedProfile().goal).toMatchObject({ enabled: true, any: true });
  });

  it('the copy for the AI carries `any`', async () => {
    const profile = { ...EXAMPLE_DIARY.profile, goal: { enabled: true, days: 4, done: ['morningWarmup', 'daytimeWarmup'], any: true } };
    await openSettings({ ...WITH_A_DAY, profile });
    await openPart('налаштування через ШІ');
    await tap('скопіювати мої налаштування для ШІ');
    await Promise.resolve();
    await Promise.resolve();
    expect(JSON.parse(device.copied[0]!).goal).toEqual(profile.goal);
  });
});
