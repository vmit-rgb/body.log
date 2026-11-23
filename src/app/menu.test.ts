import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DayKey } from '../domain/dates';
import { readDay } from '../domain/day';
import { parseDiary, type Diary } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';
import { browserChoice, diaryStore, sectionMemory } from '../storage/store';
import { mountToast } from '../ui/toast';
import { startApp } from './app';
import { fakeDevice } from './test-env';

// Invented data only.
const TODAY = '2026-11-09' as DayKey;
const WITH_A_DAY: Diary = {
  ...EXAMPLE_DIARY,
  days: { ['2026-11-08' as DayKey]: readDay({ note: 'вправа 1' }, '2026-11-08' as DayKey) },
};

let host: HTMLElement;
let device: ReturnType<typeof fakeDevice>['device'];
let env: ReturnType<typeof fakeDevice>['env'];

function start(diary: Diary = WITH_A_DAY): void {
  diaryStore(localStorage, () => new Date()).save(diary);
  document.body.innerHTML = '<main id="app"></main>';
  host = document.querySelector<HTMLElement>('#app')!;
  const fake = fakeDevice();
  device = fake.device;
  env = fake.env;
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

const heading = () => host.querySelector('h1')!.textContent;
const toastText = () => document.querySelector<HTMLElement>('.toast:not([hidden]) .toast__message')?.textContent;
const toastSays = () => {
  const shown = document.querySelector<HTMLElement>('.toast:not([hidden])');
  if (!shown) return undefined;
  const check = shown.querySelector('.toast__check:not([hidden])') ? '✓ ' : '';
  return check + shown.querySelector('.toast__message')!.textContent;
};
const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent!.trim()) === name)!;
const tap = (name: string) => button(name).click();
const openMenu = () => tap('меню');

beforeEach(() => localStorage.clear());

describe('the menu (Figma screen/menu 183:3210)', () => {
  beforeEach(() => {
    start();
    openMenu();
  });

  it('opens from ≡ with its links, the copy and the help links', () => {
    expect(heading()).toBe('меню');
    for (const name of ['історія', 'налаштування', 'пошук у нотатках', 'зберегти копію', 'що нового в застосунку', 'як користуватись', 'поділитися застосунком']) {
      expect(button(name), name).toBeTruthy();
    }
    expect(host.querySelector('footer')!.textContent).toContain('бета 1.2.4');
  });

  it('keeps the bottom bar, with ✕ instead of ≡', () => {
    expect(button('закрити меню')).toBeTruthy();
    expect(button('меню')).toBeUndefined();
    expect(host.querySelector('.date-nav__date [aria-hidden]')!.textContent).toBe('пн 09.11');
  });

  it('goes back home with ✕', () => {
    tap('закрити меню');
    expect(heading()).toBe('головна');
    expect(device.depth()).toBe(0);
  });

  it('has no «Політ символів» behind it; home, history and settings have it again (Olesia, 2026-11-18)', () => {
    const noFlight = () => document.documentElement.hasAttribute('data-no-flight');
    expect(noFlight()).toBe(true);
    tap('закрити меню');
    expect(noFlight()).toBe(false);
    for (const page of ['історія', 'налаштування']) {
      openMenu();
      expect(noFlight()).toBe(true);
      tap(page);
      expect(heading(), page).toBe(page);
      expect(noFlight(), page).toBe(false);
      history.back();
    }
  });

  it('goes back home with the phone’s back button', () => {
    device.pressBack();
    expect(heading()).toBe('головна');
  });

  it('opens home on the day shown from the date', () => {
    tap('попередній день');
    openMenu();
    host.querySelector<HTMLButtonElement>('.date-nav__date')!.click();
    expect(heading()).toBe('головна');
    expect(host.querySelector('.hero__text')!.textContent).toContain('це запис за нд, 08.11.2026.');
    expect(device.depth()).toBe(0);
  });

  it('ignores «вперед» and a «назад» that leaves the menu where it is', () => {
    env.history.go(0);
    expect(heading()).toBe('меню');
  });

  it('opens home on the day before from the arrow', () => {
    tap('попередній день');
    expect(heading()).toBe('головна');
    expect(host.querySelector('.hero__text')!.textContent).toContain('це запис за нд, 08.11.2026.');
    // B-02: a screen reader hears the day it landed on
    expect(document.querySelector('#announcer')!.textContent).toBe('неділя, 08.11.2026');
  });

  it('«залишити відгук» is a link to the Google Form in a new tab', () => {
    const link = [...host.querySelectorAll<HTMLAnchorElement>('a')].find((a) => a.textContent!.trim() === 'залишити відгук')!;
    expect(link.href).toMatch(/^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/viewform$/);
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.classList.contains('menu__help')).toBe(true);
  });

  it('A-02: a toast about something done stays when the screen changes', () => {
    tap('зберегти копію');
    tap('історія');
    expect(toastSays()).toBe('✓ копію збережено');
  });
});

describe('«зберегти копію»', () => {
  it('reminds when there are records and no copy yet: one bold line instead of the status (menu/backup warning, Olesia П3)', () => {
    start();
    openMenu();
    expect(host.querySelector('[data-backup-line]')).toBeNull();
    const reminder = host.querySelector('[data-backup-reminder]')!;
    expect(reminder.textContent).toBe('давненько не було копії. збережи, поки все на місці :)');
    expect(reminder.className).toBe('t-2nd-bold');
  });

  it('does not remind with no records', () => {
    start(EXAMPLE_DIARY);
    openMenu();
    expect(host.querySelector('[data-backup-reminder]')).toBeNull();
  });

  it('saves the whole diary as a file «бета 0.81» can restore, and says so', () => {
    start();
    openMenu();
    tap('зберегти копію');
    expect(device.saved).toHaveLength(1);
    expect(device.saved[0]!.name).toBe('trekr-kopiya-2026-11-09.json');
    expect(parseDiary(device.saved[0]!.text)).toEqual(WITH_A_DAY);
    expect(toastSays()).toBe('✓ копію збережено');
    expect(host.querySelector('[data-backup-line]')!.textContent).toBe('остання копія — сьогодні');
    expect(host.querySelector('[data-backup-reminder]')).toBeNull();
  });

  it('copies what was just logged on home, too', () => {
    start(EXAMPLE_DIARY);
    const note = host.querySelector<HTMLTextAreaElement>('textarea[data-input="note"]')!;
    note.value = 'нове';
    note.dispatchEvent(new Event('input', { bubbles: true }));
    openMenu();
    tap('зберегти копію');
    expect(parseDiary(device.saved[0]!.text)!.days[TODAY]).toBeTruthy();
  });

  it('says when the phone would not take the file', () => {
    start();
    device.saveWorks = false;
    openMenu();
    tap('зберегти копію');
    expect(toastSays()).toBe('не вдалося зберегти файл >_<');
    expect(host.querySelector('[data-backup-reminder]')).not.toBeNull();
  });
});

describe('the theme switch ☼ / ☾', () => {
  it('switches dark to light and back, and names what it does', async () => {
    start();
    openMenu();
    tap('світла тема');
    // the other theme comes in the middle of the flicker (ui/flicker.ts)
    await vi.waitFor(() => expect(button('темна тема')).toBeTruthy());
    tap('темна тема');
    await vi.waitFor(() => expect(button('світла тема')).toBeTruthy());
  });
});

describe('«поділитися застосунком»', () => {
  beforeEach(() => {
    start();
    openMenu();
  });

  it('opens the phone’s share sheet with the landing page', async () => {
    tap('поділитися застосунком');
    await vi.waitFor(() => expect(device.shared).toHaveLength(1));
    expect(device.shared[0]!.url).toBe('https://vmit-rgb.github.io/body.log-landing/');
    expect(device.shared[0]!.text).toContain('підлаштовується під твоє тіло');
    expect(toastText()).toBeUndefined();
  });

  it('copies the link when there is no share sheet', async () => {
    device.shareResult = 'unavailable';
    tap('поділитися застосунком');
    await vi.waitFor(() => expect(toastSays()).toBe('✓ посилання скопійовано — надішли, кому хочеш :)'));
    expect(device.copied[0]).toContain('https://vmit-rgb.github.io/body.log-landing/');
  });

  it('says so when even copying fails', async () => {
    device.shareResult = 'unavailable';
    device.copyWorks = false;
    tap('поділитися застосунком');
    await vi.waitFor(() => expect(toastSays()).toBe('не вдалося поділитися >_<'));
  });
});

describe('«що нового» and «як користуватись»', () => {
  beforeEach(() => {
    start();
    openMenu();
  });

  it('shows what is new, newest on top', () => {
    tap('що нового в застосунку');
    expect(heading()).toBe('що нового');
    expect(host.querySelectorAll('.news__entry')).toHaveLength(7);
    expect(host.querySelector('.news__entry h2')!.textContent).toContain('бета 1.2.4 · 23.11.2026');
    // the name in bold and the accent, the emoticon in the accent and bold (copy fix A9, A10; bold: beta 1.2.4)
    expect(host.querySelector('.news__changes .brand')!.textContent).toBe('body.log');
    expect(host.querySelector('.news__changes .emoticon')!.textContent).toBe(':)');
  });

  it('answers the questions one at a time', () => {
    tap('як користуватись');
    expect(heading()).toBe('як користуватись');
    const first = button('як позначити вправу?');
    expect(first.getAttribute('aria-expanded')).toBe('false');
    first.click();
    expect(host.querySelector(`#${first.getAttribute('aria-controls')}`)!.textContent).toContain('натисни на вправу');
    expect(host.querySelectorAll('.faq button.accordion')).toHaveLength(36);
  });

  it('puts the questions in five groups, each answer under its own id', () => {
    tap('як користуватись');
    expect([...host.querySelectorAll('.faq > h2')].map((h) => h.textContent)).toEqual(
      ['перший раз', 'щодня', 'календар і статистика', 'налаштування', 'копія й дані']);
    const ids = [...host.querySelectorAll('.faq button.accordion')].map((b) => b.getAttribute('aria-controls'));
    expect(new Set(ids).size).toBe(ids.length);
    const last = button('як стерти свої дані?');
    last.click();
    expect(last.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector<HTMLElement>(`#${last.getAttribute('aria-controls')}`)!.hidden).toBe(false);
  });

  it('says «натисни», never «тапни» (glossary, E-11)', () => {
    tap('як користуватись');
    expect(host.querySelector('.faq')!.textContent).not.toMatch(/тапни/);
  });

  it('names all nine «доступність» options (E-12)', () => {
    tap('як користуватись');
    const answer = button('як збільшити текст чи вимкнути анімації?');
    const text = host.querySelector(`#${answer.getAttribute('aria-controls')}`)!.textContent!;
    for (const word of ['текст', 'зони натискання', 'всі анімації', 'фонові', 'вібрацію', 'звук', 'нижню панель', 'повідомлення', '⋯']) {
      expect(text).toContain(word);
    }
  });

  it('goes back to the menu with ≡ and home with ✕', () => {
    tap('як користуватись');
    tap('меню');
    expect(heading()).toBe('меню');
    tap('що нового в застосунку');
    tap('закрити');
    expect(heading()).toBe('головна');
    expect(device.depth()).toBe(0);
  });

  it('goes back step by step with the phone’s back button', () => {
    tap('що нового в застосунку');
    device.pressBack();
    expect(heading()).toBe('меню');
    device.pressBack();
    expect(heading()).toBe('головна');
  });
});

describe('a tap between the buttons of the page bar', () => {
  it('does nothing', () => {
    start();
    openMenu();
    tap('як користуватись');
    host.querySelector<HTMLElement>('.bar')!.click();
    expect(heading()).toBe('як користуватись');
  });
});
