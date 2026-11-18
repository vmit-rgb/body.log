import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_MS } from '../screens/history';
import type { DayKey } from '../domain/dates';
import { readDay } from '../domain/day';
import type { Diary } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';
import { browserChoice, diaryStore, sectionMemory, tipMemory } from '../storage/store';
import { mountToast } from '../ui/toast';
import { startApp } from './app';
import { fakeDevice } from './test-env';

// Invented data only.
const TODAY = '2026-11-09' as DayKey;
const at = (date: string, raw: object) => [date, readDay(raw, date as DayKey)] as const;
const DIARY: Diary = {
  ...EXAMPLE_DIARY,
  days: Object.fromEntries([
    at('2026-11-08', {
      note: 'коліно трохи болить', mw: { ticks: ['exercise-1', 'exercise-2'], times: { 'exercise-2': [30, 25] } },
      t: { morning: { energy: 6 }, evening: { gone: 'так собі' } },
    }),
    at('2026-11-05', { note: 'усе <b>добре</b>', wo: { session: 'a', ex: { 'exercise-6': [{ w: 5, r: 10 }, { w: 5, r: 10 }] } }, t: { morning: { energy: 4 } } }),
    at('2026-11-03', { t: { evening: { tired: 3 } } }),
    at('2026-10-20', { note: 'жовтневе коліно', mv: { 'movement-1': { min: 25 } } }),
  ]),
};

let host: HTMLElement;
let device: ReturnType<typeof fakeDevice>['device'];

function start(diary: Diary = DIARY): void {
  diaryStore(localStorage, () => new Date()).save(diary);
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
    tips: tipMemory(localStorage),
    whenHidden: () => {},
    ...fake.env,
  });
}

const heading = () => host.querySelector('h1')!.textContent;
const toastSays = () => {
  const shown = document.querySelector<HTMLElement>('.toast:not([hidden])');
  if (!shown) return undefined;
  const check = shown.querySelector('.toast__check:not([hidden])') ? '✓ ' : '';
  return check + shown.querySelector('.toast__message')!.textContent;
};
const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent!.trim()) === name);
const tap = (name: string) => {
  const found = button(name);
  if (!found) throw new Error(`no button «${name}»`);
  found.click();
};
const texts = (selector: string, root: ParentNode = host) => [...root.querySelectorAll(selector)].map((element) => element.textContent!.replace(/\s+/g, ' ').trim());
const cards = () => [...host.querySelectorAll<HTMLElement>('.day-card')];
const cardTitle = (card: HTMLElement) => card.querySelector('.accordion__title')!.textContent;
const isOpen = (card: HTMLElement) => card.querySelector('button.accordion')!.getAttribute('aria-expanded') === 'true';
const openHistory = () => {
  tap('меню');
  tap('історія');
};
const calDay = (date: string) => host.querySelector<HTMLButtonElement>(`.history [data-cal="day"][data-day="${date}"]`)!;
const searchInput = () => host.querySelector<HTMLInputElement>('.search__input');
const type = (text: string) => {
  const input = searchInput()!;
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

beforeEach(() => localStorage.clear());

describe('«історія» (Figma screen/log-history 165:2758)', () => {
  beforeEach(() => {
    start();
    openHistory();
  });

  it('opens from the menu with the week, the month line and the calendar', () => {
    expect(heading()).toBe('історія');
    expect(host.querySelector('.history__goal')!.textContent).toBe('цей тиждень: 0 з 5 днів');
    expect(host.querySelector('.history__summary')!.textContent).toBe('листопад: 1 день з розминкою, 1 тренування');
    expect(calDay('2026-11-08')).toBeTruthy();
    expect(host.querySelector('footer')).toBeTruthy();
  });

  it('counts the month open: the cards «за листопад» and the carousel in place of «середнє за період» (wave 9)', () => {
    expect(host.querySelector('.history__averages')).toBeNull();
    expect(texts('.history .cal-block h3')).toEqual(['за листопад', 'середнє за листопад', 'листопад']);
    expect(texts('.history .stat__goal')[0]).toBe('за 9 днів');
    expect(texts('.history .avg-card__title')).toEqual(['енергія', 'пульс', 'було важко?', 'втома']);
    const [energy, pulse, , tired] = [...host.querySelectorAll<HTMLElement>('.history .avg-card')];
    expect(texts('.avg', energy)).toEqual(['зранку 5', 'після тренування —']);
    expect(pulse!.textContent).toContain('записів немає');
    expect(texts('.avg', tired)).toEqual(['ввечері 3']);
    // a point per day of the month so far: from 01.11 to today
    expect([...energy!.querySelectorAll('.chart text')].slice(3).map((t) => t.textContent)).toEqual(['01.11', '09.11']);
  });

  it('has 🔍 as a switch that is off', () => {
    expect(button('пошук у нотатках')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('lists the days with records, newest first, the first one open', () => {
    expect(cards().map(cardTitle)).toEqual(['неділя, 08.11.2026', 'четвер, 05.11.2026', 'вівторок, 03.11.2026']);
    expect(cards().map(isOpen)).toEqual([true, false, false]);
    expect(cards()[0]!.querySelector('.accordion__meta')!.textContent).toBe('розминка: рівень 1 · нотатка');
  });

  it('shows what was logged inside an open card', () => {
    const first = cards()[0]!;
    const titles = [...first.querySelectorAll('.day-block__title')].map((t) => t.textContent);
    expect(titles).toEqual(['самопочуття зранку', 'ранкова розминка', 'самопочуття ввечері', 'нотатка']);
    expect(first.querySelector('.day-check')!.textContent).toContain('вправа 1');
    expect([...first.querySelectorAll('.day-check')][1]!.textContent).toContain('вправа 2 · 30 с, 25 с');
    expect(first.querySelector('.value-row--text')!.textContent).toContain('питання, якого вже немає·так собі');
    // F-07: level 2 of the example has its own exercises now, so the ticks of level 1 show under level 1 only
    expect(first.querySelectorAll('.day-block .checkbox__box')).toHaveLength(2);
    expect([...first.querySelectorAll('.day-block__group')].map((g) => g.textContent)).toEqual(['рівень 1 · готово']);
    expect(first.textContent).toContain('коліно трохи болить');
  });

  it('opens and closes a card', () => {
    const second = cards()[1]!;
    second.querySelector<HTMLButtonElement>('button.accordion')!.click();
    expect(isOpen(cards()[1]!)).toBe(true);
    expect(cards()[1]!.textContent).toContain('2 × 10 повт. · 5 кг');
    // units small and muted, the row one flowing line (history/day-block, п. 25, Н10)
    expect([...cards()[1]!.querySelectorAll('.value-row__value')].find((v) => v.textContent!.includes('повт'))!.innerHTML).toBe('2 × 10 <span class="unit">повт.</span> · 5 <span class="unit">кг</span>');
    cards()[1]!.querySelector<HTMLButtonElement>('button.accordion')!.click();
    expect(isOpen(cards()[1]!)).toBe(false);
  });

  it('writes typed text as text, never as markup', () => {
    cards()[1]!.querySelector<HTMLButtonElement>('button.accordion')!.click();
    const note = [...cards()[1]!.querySelectorAll('.day-block__text')].at(-1)!;
    expect(note.children).toHaveLength(0);
    expect(note.textContent).toBe('усе <b>добре</b>');
  });

  it('opens that day over the history from «редагувати цей день» (A-11)', () => {
    tap('редагувати цей день');
    expect(heading()).toBe('головна');
    expect(host.querySelector('.hero__text')!.textContent).toContain('нд, 08.11.2026');
    // menu, history, the day
    expect(device.depth()).toBe(3);
    expect(document.title).toBe('body.log');
  });

  it('«назад» from that day comes back to the same month, the same open cards and the button', () => {
    tap('попередній місяць');
    tap('наступний місяць');
    cards()[1]!.querySelector<HTMLButtonElement>('button.accordion')!.click();
    const edit = cards()[1]!.querySelector<HTMLButtonElement>('.day-card__edit')!;
    edit.focus();
    edit.click();
    expect(host.querySelector('.hero__text')!.textContent).toContain('чт, 05.11.2026');
    device.pressBack();
    expect(heading()).toBe('історія');
    expect(cards().map(isOpen)).toEqual([true, true, false]);
    expect(document.activeElement).toBe(cards()[1]!.querySelector('.day-card__edit'));
    expect(device.depth()).toBe(2);
  });

  it('opens the card of a day tapped in the calendar', () => {
    calDay('2026-11-05').click();
    expect(isOpen(cards()[1]!)).toBe(true);
    expect(document.activeElement).toBe(cards()[1]!.querySelector('button.accordion'));
    expect(host.querySelector('[data-cal="day"][aria-current="date"]')!.getAttribute('data-day')).toBe('2026-11-05');
  });

  it('says so for a day without records', () => {
    calDay('2026-11-02').click();
    expect(toastSays()).toBe('за цей день записів немає');
    expect(heading()).toBe('історія');
  });

  it('shows the month chosen with the arrows: its line, averages and days', () => {
    tap('попередній місяць');
    expect(host.querySelector('.history__summary')!.textContent).toBe('жовтень: 0 днів з розминкою, 0 тренувань');
    expect(cards().map(cardTitle)).toEqual(['вівторок, 20.10.2026']);
    expect(isOpen(cards()[0]!)).toBe(true);
    expect(host.querySelector('.carousel h3')!.textContent).toBe('середнє за жовтень');
    expect(texts('.history .avg-card__empty')).toHaveLength(4);
    expect(document.activeElement).toBe(button('попередній місяць'));
    tap('попередній місяць');
    expect(host.querySelector('.history__empty')!.textContent).toBe('цього місяця записів немає. зате попереду ще купа днів :3');
  });

  it('goes to the menu with ≡, home with ✕ and back with the phone', () => {
    tap('меню');
    expect(heading()).toBe('меню');
    tap('історія');
    tap('закрити');
    expect(heading()).toBe('головна');
    expect(device.depth()).toBe(0);
    openHistory();
    device.pressBack();
    expect(heading()).toBe('меню');
  });
});

describe('the carousel in the history', () => {
  it('counts today, but not the days of the next or last month shown in the grid', () => {
    start({
      ...DIARY,
      days: Object.fromEntries([
        at('2026-11-09', { t: { morning: { energy: 2 } } }),
        at('2026-11-03', { t: { morning: { energy: 4 } } }),
        at('2026-10-30', { t: { morning: { energy: 10 } } }),
      ]),
    });
    openHistory();
    expect(texts('.avg', host.querySelector<HTMLElement>('.history .avg-card')!)[0]).toBe('зранку 3');
  });
});

describe('«обрати період» (wave 9)', () => {
  beforeEach(() => {
    start();
    openHistory();
  });

  it('chooses with two taps after the button, in any order, and counts the period', () => {
    tap('обрати період');
    expect(host.querySelector('.cal__period [role="status"]')!.textContent).toBe('торкнись першого дня періоду');
    calDay('2026-11-08').click();
    expect(host.querySelector('.cal__period [role="status"]')!.textContent).toBe('від 08.11: торкнись останнього дня');
    // a tap while choosing doesn't open the day: only the newest card is open, as at first
    expect(cards().filter(isOpen).map(cardTitle)).toEqual(['неділя, 08.11.2026']);
    calDay('2026-11-03').click();
    expect(texts('.history .cal-block h3')).toEqual(['за 03.11–08.11', 'середнє за 03.11–08.11', 'листопад']);
    expect(texts('.history .stat__goal')[0]).toBe('за 6 днів');
    expect(texts('.cal__period p')).toEqual(['період 03.11–08.11']);
    expect([...host.querySelectorAll<HTMLElement>('.cal-day--period')].map((day) => day.dataset.day))
      .toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(calDay('2026-11-05').getAttribute('aria-label')).toContain('у періоді');
    expect(texts('.legend li').at(-1)).toBe('обраний період');
    expect(document.activeElement).toBe(button('скинути період'));
  });

  it('keeps the period while the month changes, and «скинути період» goes back to the month', () => {
    tap('обрати період');
    calDay('2026-11-02').click();
    calDay('2026-11-04').click();
    tap('попередній місяць');
    expect(host.querySelector('.carousel h3')!.textContent).toBe('середнє за 02.11–04.11');
    tap('скинути період');
    expect(host.querySelector('.carousel h3')!.textContent).toBe('середнє за жовтень');
    expect(host.querySelector('.cal-day--period')).toBeNull();
    expect(document.activeElement).toBe(button('обрати період'));
  });

  it('«скасувати» stops choosing, and a tap opens a day again', () => {
    tap('обрати період');
    calDay('2026-11-08').click();
    tap('скасувати');
    expect(host.querySelector('.cal-day--period')).toBeNull();
    calDay('2026-11-05').click();
    expect(isOpen(cards().find((card) => cardTitle(card) === 'четвер, 05.11.2026')!)).toBe(true);
  });

  it('starts with a long tap on the first day; the click after it does nothing', () => {
    vi.useFakeTimers();
    try {
      calDay('2026-11-03').dispatchEvent(new Event('pointerdown', { bubbles: true }));
      vi.advanceTimersByTime(HOLD_MS);
      calDay('2026-11-03').click();
      expect(host.querySelector('.cal__period [role="status"]')!.textContent).toBe('від 03.11: торкнись останнього дня');
      calDay('2026-11-09').click();
      expect(texts('.cal__period p')).toEqual(['період 03.11–09.11']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a short press is still a tap', () => {
    vi.useFakeTimers();
    try {
      const day = calDay('2026-11-05');
      day.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      vi.advanceTimersByTime(HOLD_MS - 100);
      day.dispatchEvent(new Event('pointerup', { bubbles: true }));
      vi.advanceTimersByTime(200);
      day.click();
      expect(host.querySelector('.cal__period [role="status"]')).toBeNull();
      expect(isOpen(cards().find((card) => cardTitle(card) === 'четвер, 05.11.2026')!)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tells about the long tap under the button until three periods are chosen; a tap hides it', () => {
    expect(host.querySelector('.cal__period .tip')!.textContent).toBe('швидше: затисни перший день періоду, а потім торкнись останнього.');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(host.querySelector('.cal__period .tip')).toBeNull();
    for (let i = 0; i < 3; i++) {
      if (i > 0) tap('скинути період');
      tap('обрати період');
      calDay('2026-11-02').click();
      calDay('2026-11-03').click();
    }
    tap('закрити');
    openHistory();
    expect(host.querySelector('.cal__period .tip')).toBeNull();
  });

  it('is shown as a tip again when the history opens anew, until then', () => {
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    tap('закрити');
    openHistory();
    expect(host.querySelector('.cal__period .tip')).not.toBeNull();
  });
});

describe('the week line', () => {
  it('is hidden without a goal', () => {
    const profile = { ...(EXAMPLE_DIARY.profile as object), goal: { enabled: false, days: 5, done: [] } };
    start({ ...DIARY, profile });
    openHistory();
    expect(host.querySelector<HTMLElement>('.history__goal')).toBeNull();
  });

  it('goes with the month line when neither warm-up nor workout is on', () => {
    const profile = { ...(EXAMPLE_DIARY.profile as object), goal: { enabled: false }, morningWarmup: { enabled: false }, workout: { enabled: false } };
    start({ ...DIARY, profile });
    openHistory();
    expect(host.querySelector('.history__summary')).toBeNull();
    expect(cards()).toHaveLength(3);
  });
});

describe('search in notes (Figma search/panel 210:4110)', () => {
  beforeEach(() => start());

  it('opens from the menu over the history, ready to type', () => {
    tap('меню');
    tap('пошук у нотатках');
    expect(heading()).toBe('історія');
    expect(document.activeElement).toBe(searchInput());
    expect(searchInput()!.placeholder).toBe('пошук у нотатках');
    expect(button('пошук у нотатках')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('finds words in the notes and marks them', () => {
    openHistory();
    tap('пошук у нотатках');
    type('коліно');
    expect(host.querySelector('.search__count')!.textContent).toBe('знайдено: 2');
    const hits = [...host.querySelectorAll<HTMLButtonElement>('.search__hit')];
    expect(hits.map((hit) => hit.querySelector('.search__date')!.textContent)).toEqual(['нд, 08.11.2026', 'вт, 20.10.2026']);
    expect(hits[0]!.querySelector('mark')!.textContent).toBe('коліно');
  });

  it('says when nothing is found', () => {
    openHistory();
    tap('пошук у нотатках');
    type('плавання');
    expect(host.querySelector('.search__none')!.textContent).toBe('нічого не знайшлося :( спробуй інше слово');
    expect(host.querySelector('.search__hit')).toBeNull();
  });

  it('writes the found text as text', () => {
    openHistory();
    tap('пошук у нотатках');
    type('добре');
    expect(host.querySelector('.search__hit b')).toBeNull();
    expect(host.querySelector('.search__hit')!.textContent).toContain('<b>');
  });

  it('clears the query with ×, which shows only with a query', () => {
    openHistory();
    tap('пошук у нотатках');
    expect(button('очистити')!.hidden).toBe(true);
    type('коліно');
    expect(button('очистити')!.hidden).toBe(false);
    tap('очистити');
    expect(button('очистити')!.hidden).toBe(true);
    expect(searchInput()!.value).toBe('');
    expect(host.querySelector('.search__hit')).toBeNull();
    expect(document.activeElement).toBe(searchInput());
  });

  it('stays open on a tap beside the results and on other keys', () => {
    openHistory();
    tap('пошук у нотатках');
    type('коліно');
    host.querySelector<HTMLElement>('.search__count')!.click();
    searchInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(heading()).toBe('історія');
    expect(searchInput()).toBeTruthy();
  });

  it('keeps the bar out while the panel sits on it', () => {
    openHistory();
    tap('пошук у нотатках');
    const scrollTo = (y: number) => {
      Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
      window.dispatchEvent(new Event('scroll'));
    };
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 5000 });
    scrollTo(1000);
    expect(host.querySelector('.bar')!.classList.contains('bar--hidden')).toBe(false);
    expect(host.querySelector<HTMLElement>('.to-top')!.hidden).toBe(true);
    tap('пошук у нотатках');
    // closing gives the focus to 🔍, which keeps the bar out on its own
    (document.activeElement as HTMLElement).blur();
    scrollTo(2000);
    expect(host.querySelector('.bar')!.classList.contains('bar--hidden')).toBe(true);
    scrollTo(0);
  });

  it('opens home on the day of a result', () => {
    openHistory();
    tap('пошук у нотатках');
    type('жовтневе');
    host.querySelector<HTMLButtonElement>('.search__hit')!.click();
    expect(heading()).toBe('головна');
    expect(host.querySelector('.hero__text')!.textContent).toContain('вт, 20.10.2026');
    // A-11: over the history, as «редагувати цей день»
    expect(device.depth()).toBe(3);
    device.pressBack();
    expect(heading()).toBe('історія');
  });

  it('closes with 🔍 again or Escape, giving the focus back to 🔍', () => {
    openHistory();
    tap('пошук у нотатках');
    tap('пошук у нотатках');
    expect(searchInput()).toBeNull();
    tap('пошук у нотатках');
    searchInput()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(searchInput()).toBeNull();
    expect(document.activeElement).toBe(button('пошук у нотатках'));
  });

  it('opens over the history from 🔍 on «що нового»; ≡ goes back to the menu', () => {
    tap('меню');
    tap('що нового в застосунку');
    // there 🔍 leads somewhere, it is not a switch
    expect(button('пошук у нотатках')!.hasAttribute('aria-pressed')).toBe(false);
    tap('пошук у нотатках');
    expect(heading()).toBe('історія');
    expect(searchInput()).toBeTruthy();
    tap('меню');
    expect(heading()).toBe('меню');
  });
});
