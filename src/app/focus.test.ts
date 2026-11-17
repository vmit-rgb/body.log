import { beforeEach, describe, expect, it } from 'vitest';
import type { DayKey } from '../domain/dates';
import { readDay } from '../domain/day';
import type { Diary } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';
import { browserChoice, diaryStore, sectionMemory } from '../storage/store';
import { mountToast } from '../ui/toast';
import { startApp } from './app';
import { fakeDevice } from './test-env';

/* Wave 3 (`app/fix-focus`): «назад», the focus and the page's title. Invented data only. */

const TODAY = '2026-11-09' as DayKey;
const WITH_A_DAY: Diary = {
  ...EXAMPLE_DIARY,
  days: { ['2026-11-08' as DayKey]: readDay({ note: 'вправа 1' }, '2026-11-08' as DayKey) },
};

let host: HTMLElement;
let device: ReturnType<typeof fakeDevice>['device'];

function start(diary: Diary | null = WITH_A_DAY): void {
  if (diary) diaryStore(localStorage, () => new Date()).save(diary);
  document.body.innerHTML = '<main id="app"></main>';
  host = document.querySelector<HTMLElement>('#app')!;
  const fake = fakeDevice();
  device = fake.device;
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
const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent!.trim()) === name)!;
/** A tap that focuses what it taps, as on Android. */
const press = (name: string) => {
  const found = button(name);
  found.focus();
  found.click();
};
const sheet = () => host.querySelector('.cal-sheet:not(.cal-sheet--closing)');
const dateButton = () => host.querySelector<HTMLButtonElement>('.date-nav__date')!;
/** The date as a screen reader hears it (the one on screen re-forms letter by letter). */
const shownDay = () => host.querySelector('.date-nav__date .visually-hidden')!.textContent;

beforeEach(() => localStorage.clear());

describe('A-05: the calendar sheet is a step of «назад»', () => {
  beforeEach(() => {
    start();
    dateButton().click();
  });

  it('«назад» closes the sheet, not the app', () => {
    expect(sheet()).toBeTruthy();
    expect(device.depth()).toBe(1);
    device.pressBack();
    expect(sheet()).toBeNull();
    expect(heading()).toBe('головна');
    expect(device.depth()).toBe(0);
    expect(document.activeElement).toBe(dateButton());
  });

  it('closed by the date, it takes its step back', () => {
    dateButton().click();
    expect(sheet()).toBeNull();
    expect(device.depth()).toBe(0);
  });

  it('B-03: the screen under it takes no focus but the date; Escape anywhere closes it', () => {
    const inert = (selector: string) => host.querySelector(selector)!.hasAttribute('inert');
    expect(inert('.home')).toBe(true);
    expect(inert('.bar__menu')).toBe(true);
    expect(inert('.date-nav__step')).toBe(true);
    expect(inert('.date-nav__date')).toBe(false);
    document.body.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(sheet()).toBeNull();
    expect(inert('.home')).toBe(false);
    expect(device.depth()).toBe(0);
  });

  it('B-01: a day chosen in it leaves the focus on the date', () => {
    host.querySelector<HTMLButtonElement>('.cal-sheet [data-cal="day"][data-day="2026-11-05"]')!.click();
    expect(shownDay()).toBe('четвер, 05.11.2026');
    expect(document.activeElement).toBe(dateButton());
    expect(device.depth()).toBe(0);
  });
});

describe('B-01: the day arrows keep the focus', () => {
  beforeEach(() => start());

  it('stays on ‹ after a step back', () => {
    press('попередній день');
    expect(shownDay()).toBe('неділя, 08.11.2026');
    expect(document.activeElement).toBe(button('попередній день'));
  });

  it('stays on › while it can go on, and moves to the date at today', () => {
    press('попередній день');
    press('попередній день');
    press('наступний день');
    expect(document.activeElement).toBe(button('наступний день'));
    press('наступний день');
    expect(shownDay()).toBe('понеділок, 09.11.2026');
    expect(document.activeElement).toBe(dateButton());
  });

  it('a day chosen in the calendar on home keeps the focus on that day', () => {
    host.querySelector<HTMLButtonElement>('.home .cal-block [data-cal="day"][data-day="2026-11-05"]')!.click();
    expect(document.activeElement).toBe(host.querySelector('.home .cal-block [data-cal="day"][data-day="2026-11-05"]'));
  });
});

describe('B-04: the focus follows the screens', () => {
  beforeEach(() => start());

  it('a new screen puts it on its heading, which is no stop for Tab', () => {
    press('меню');
    expect(document.activeElement).toBe(host.querySelector('h1'));
    expect(host.querySelector('h1')!.getAttribute('tabindex')).toBe('-1');
    press('історія');
    expect(document.activeElement!.textContent).toBe('історія');
  });

  it('closing the menu gives it back to ≡, with ✕ and with «назад»', () => {
    press('меню');
    press('закрити меню');
    expect(document.activeElement).toBe(button('меню'));
    press('меню');
    device.pressBack();
    expect(document.activeElement).toBe(button('меню'));
  });

  it('even when the tap on ≡ focused nothing (iPhone)', () => {
    button('меню').click();
    device.pressBack();
    expect(document.activeElement).toBe(button('меню'));
  });

  it('a page closed gives it back to its link in the menu', () => {
    press('меню');
    press('як користуватись');
    device.pressBack();
    expect(heading()).toBe('меню');
    expect(document.activeElement).toBe(button('як користуватись'));
  });
});

describe('B-05: the page’s title', () => {
  it('names the screen shown', () => {
    start();
    expect(document.title).toBe('body.log');
    button('меню').click();
    expect(document.title).toBe('меню · body.log');
    button('історія').click();
    expect(document.title).toBe('історія · body.log');
    device.pressBack();
    button('налаштування').click();
    expect(document.title).toBe('налаштування · body.log');
  });

  it('names the help pages', () => {
    start();
    button('меню').click();
    button('що нового в застосунку').click();
    expect(document.title).toBe('що нового · body.log');
    button('меню').click();
    button('як користуватись').click();
    expect(document.title).toBe('як користуватись · body.log');
    button('закрити').click();
    expect(document.title).toBe('body.log');
  });

  it('is «початок · body.log» before there are settings', () => {
    start(null);
    expect(document.title).toBe('початок · body.log');
  });
});

describe('E-15, A-10: what already holds', () => {
  it('the theme switch is only in the menu', () => {
    start();
    button('меню').click();
    expect(button('світла тема') ?? button('темна тема')).toBeTruthy();
    button('налаштування').click();
    expect(button('світла тема') ?? button('темна тема')).toBeUndefined();
  });

  it('💾 sits first in the settings bar, where ≡ is on home, so the mirrored bar moves both alike', () => {
    start();
    const homeFirst = host.querySelector('.bar')!.firstElementChild!;
    expect(homeFirst.getAttribute('aria-label')).toBe('меню');
    button('меню').click();
    button('налаштування').click();
    expect(host.querySelector('.bar')!.firstElementChild!.getAttribute('aria-label')).toBe('зберегти налаштування');
  });
});
