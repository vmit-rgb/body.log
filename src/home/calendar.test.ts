import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDevice, openSections } from '../app/test-env';
import { SAVE_DELAY_MS, startApp } from '../app/app';
import type { DayKey } from '../domain/dates';
import { readDay } from '../domain/day';
import type { Diary } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';
import { diaryStore, type DiaryStore } from '../storage/store';
import { mountToast } from '../ui/toast';

/*
 * Stage 5c, the way the person uses it: the calendar block under the
 * sections, the calendar sheet from the date, the pulse timer.
 * Invented data only: nothing from a real log.
 */

const TODAY = '2026-11-11' as DayKey; // Wednesday
const MONDAY = '2026-11-09' as DayKey;
const TUESDAY = '2026-11-10' as DayKey;

const profile = {
  goal: { enabled: true, days: 3, done: ['workout'] },
  morningWarmup: { enabled: true, weeklyTarget: 6, levels: [
    { id: 'l1', name: 'рівень 1', items: [{ exercise: 'a' }] },
    // F-07: each level has its own exercises (a shared one would be split at launch)
    { id: 'l2', name: 'рівень 2', items: [{ exercise: 'c' }, { exercise: 'b' }] },
  ] },
  workout: { enabled: true, weeklyTarget: 2, sessions: [{ id: 's', name: 'а', items: [{ exercise: 'w', fields: ['reps'] }] }] },
  movement: { enabled: true, weeklyTarget: 0, kinds: [{ id: 'walk', name: 'ходьба', fields: ['km'] }] },
  exercises: [{ id: 'a', name: 'нахили' }, { id: 'b', name: 'оберти' }, { id: 'c', name: 'нахили' }, { id: 'w', name: 'присідання' }],
  trackers: [
    { id: 'pain', name: 'біль', kind: 'scale', ask: ['morning'] },
    { id: 'pulse', name: 'пульс', kind: 'number', units: ['уд/хв'], ask: ['morning'], timer: { enabled: true, seconds: 30 } },
  ],
};

const DAYS: Diary['days'] = {
  [MONDAY]: readDay({ mw: { ticks: ['a', 'c', 'b'] }, t: { morning: { pain: 3 } } }, MONDAY),
  [TUESDAY]: readDay({ wo: { session: 's', ex: { w: [{ r: 10 }] } }, mv: { walk: { km: 2 } }, t: { morning: { pain: 4 } } }, TUESDAY),
};

let host: HTMLElement;
let store: DiaryStore;

function start(days: Diary['days'] = DAYS, settings: Diary['profile'] = profile): void {
  document.body.innerHTML = '<main id="app"></main>';
  host = document.querySelector<HTMLElement>('#app')!;
  localStorage.clear();
  store = diaryStore(localStorage, () => new Date('2026-11-11T08:00:00Z'));
  store.save({ profile: settings, days });
  startApp({
    host,
    store,
    browser: { chosen: () => true, choose: () => {} },
    platform: 'android',
    installed: true,
    toast: mountToast(document.body),
    today: () => TODAY,
    sections: openSections,
    ...fakeDevice().env,
    onDiary: () => {},
    whenHidden: () => {},
  });
}

const $ = <T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = host) => {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`not on screen: ${selector}`);
  return element;
};
const all = (selector: string, root: ParentNode = host) => [...root.querySelectorAll<HTMLElement>(selector)];
const texts = (selector: string, root: ParentNode = host) => all(selector, root).map((element) => element.textContent!.trim());
const byText = (text: string, root: ParentNode = host) => all('button', root).find((b) => b.textContent!.trim() === text)!;
const byLabel = (label: string, root: ParentNode = host) => $<HTMLButtonElement>(`[aria-label="${label}"]`, root);
const block = () => $('.home .cal-block');
const sheet = () => host.querySelector<HTMLElement>('.cal-sheet');
const shownDate = () => $('.date-nav__date .visually-hidden').textContent;
const type = (field: HTMLInputElement, value: string) => {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
};
const saved = () => {
  vi.advanceTimersByTime(SAVE_DELAY_MS);
  return store.load()!.days[TODAY];
};

beforeEach(() => {
  vi.useFakeTimers();
  start();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('calendar block on home', () => {
  it('comes after the sections, before the footer', () => {
    const order = [...$('.home').children].map((child) => child.className.split(' ')[0]);
    expect(order.indexOf('cal-block')).toBe(order.indexOf('home__sections') + 1);
  });

  it('counts this week per activity, with the target when there is one', () => {
    expect(texts('.stat__label', block())).toEqual(['розминка', 'тренування', 'рух']);
    expect(texts('.stat__value', block())).toEqual(['1 з 6 днів', '1 з 2 днів', '1']);
  });

  it('says «з 1 дня» for one day a week', () => {
    start(DAYS, { ...profile, movement: { ...profile.movement, weeklyTarget: 1 } });
    expect(texts('.stat__value', block())[2]).toBe('1 з 1 дня');
  });

  it('does nothing on a tap beside the days', () => {
    $('.legend', block()).click();
    expect(shownDate()).toBe('середа, 11.11.2026');
  });

  it('averages each question over the last 7 days in a carousel, a card each (wave 9)', () => {
    expect(texts('.carousel > h3', block())).toEqual(['середнє за 7 днів']);
    expect(texts('.avg-card__title', block())).toEqual(['біль', 'пульс']);
    const [pain, pulse] = all('.avg-card', block());
    expect(texts('.avg', pain)).toEqual(['зранку 3,5']);
    expect(pain!.querySelector('.chart')).not.toBeNull();
    expect(texts('.chart__legend li', pain)).toEqual(['зранку']);
    expect($('.avg-card__empty', pulse).textContent).toBe('записів немає');
  });

  it('draws the chart: a point per day of the 7, weekdays under them', () => {
    const svg = $('.avg-card .chart svg', block());
    expect([...svg.querySelectorAll('text')].slice(3).map((t) => t.textContent)).toEqual(['чт', 'пт', 'сб', 'нд', 'пн', 'вт', 'ср']);
    expect(svg.querySelectorAll('.chart__line')).toHaveLength(1);
    expect(svg.querySelectorAll('.chart__dot')).toHaveLength(2);
  });

  it('shows empty cards when nothing was answered', () => {
    start({});
    expect(texts('h3', block())).toEqual(['цей тиждень', 'середнє за 7 днів', 'листопад']);
    expect(texts('.avg-card__empty', block())).toEqual(['записів немає', 'записів немає']);
  });

  it('turns cards with the arrows and the dots, and keeps the card when home is drawn again', () => {
    const [back, next] = all('[data-car="by"]', block()) as HTMLButtonElement[];
    expect(back!.disabled).toBe(true);
    expect(all('.carousel__pip', block()).map((pip) => pip.hasAttribute('data-on'))).toEqual([true, false]);
    next!.click();
    expect(all('.carousel__pip', block()).map((pip) => pip.hasAttribute('data-on'))).toEqual([false, true]);
    expect((all('[data-car="by"]', block())[1] as HTMLButtonElement).disabled).toBe(true);
    // typing redraws the block; the carousel stays on its card
    byLabel('наступний день').click();
    byLabel('попередній день').click();
    expect($('.carousel', block()).dataset.card).toBe('1');
  });

  it('opens the list of questions from the name and goes to the one picked', async () => {
    $('.avg-card__title', block()).click();
    const list = $('.list-sheet', document.body);
    expect(list.getAttribute('role')).toBe('dialog');
    expect(texts('.list-sheet__item', list)).toEqual(['біль', 'пульс']);
    expect(document.activeElement!.textContent).toBe('біль');
    byText('пульс', list).click();
    await Promise.resolve();
    expect($('.carousel', block()).dataset.card).toBe('1');
  });

  it('shows «3 / 9» instead of the dots when there are many questions', () => {
    const trackers = Array.from({ length: 9 }, (_, i) => ({ id: `q${i}`, name: `питання ${i}`, kind: 'scale', ask: ['morning'] }));
    start(DAYS, { ...profile, trackers });
    expect($('.carousel__where', block()).textContent).toBe('1 / 9');
  });

  it('shows the month: dots for levels, markers, today and the day shown', () => {
    expect($('h3.cal__month', block()).textContent).toBe('листопад');
    const monday = byLabel('понеділок, 09.11.2026, ранкова розминка: 2 рівні', block());
    expect(monday.querySelectorAll('.cal-day__dots--bottom i')).toHaveLength(2);
    expect(monday.className).not.toMatch(/--lv/);
    const tuesday = byLabel('вівторок, 10.11.2026, тренування, рух', block());
    expect(tuesday.querySelector('.cal-day__mark--workout')).not.toBeNull();
    expect(tuesday.querySelector('.cal-day__mark--movement')).not.toBeNull();
    const today = byLabel('середа, 11.11.2026', block());
    expect(today.className).toContain('cal-day--today');
    expect(today.className).toContain('cal-day--shown');
    expect(today.getAttribute('aria-current')).toBe('date');
  });

  it('puts a number instead of dots from 6 levels, and daytime groups above the number', () => {
    const levels = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `l${n}`, items: [{ exercise: `e${n}` }] }));
    const lots = {
      ...profile,
      morningWarmup: { enabled: true, levels },
      daytimeWarmup: { enabled: true, groups: [{ id: 'neck', name: 'шия' }, { id: 'back', name: 'спина' }] },
    };
    start({ [TODAY]: readDay({ mw: { ticks: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'] }, dw: ['neck', 'back'] }, TODAY) }, lots);
    const today = byLabel('середа, 11.11.2026, ранкова розминка: 6 рівнів, денна розминка: 2 групи', block());
    expect($('.cal-day__dots--bottom', today).textContent).toBe('6');
    expect(today.querySelectorAll('.cal-day__dots--top i')).toHaveLength(2);
    expect(texts('.legend li', block())[1]).toBe('над числом: виконані групи денної розминки');
  });

  it('has no «обрати період» on home', () => {
    expect(block().querySelector('[data-cal^="period"]')).toBeNull();
  });

  it('lets only past days and today be tapped', () => {
    const days = all('.cal__grid .cal-day', block());
    expect(days).toHaveLength(42);
    expect(all('.cal__grid button', block())).toHaveLength(11);
    expect(days.find((day) => day.textContent === '12')!.tagName).toBe('SPAN');
  });

  it('explains in the legend what is switched on, as shapes', () => {
    expect(texts('.legend li', block())).toEqual(['під числом: пройдені рівні ранкової розминки, з 6 — число', 'тренування', 'рух']);
    // its own class: the settings' colour «.swatch» made these 48 px circles (VISUAL-AUDIT п. 2)
    expect(block().querySelector('.legend .swatch')).toBeNull();
    expect(block().querySelector('.legend__swatch')).toBeNull();
    start({}, { ...profile, workout: { enabled: false } });
    expect(texts('.legend li', block())).toEqual(['під числом: пройдені рівні ранкової розминки, з 6 — число', 'рух']);
  });

  it('opens a day from the calendar', () => {
    byLabel('понеділок, 09.11.2026, ранкова розминка: 2 рівні', block()).click();
    expect(shownDate()).toBe('понеділок, 09.11.2026');
    expect($('.hero__text').textContent).toContain('це запис за пн, 09.11.2026.');
  });

  it('goes to earlier months, never past this one, and keeps the focus on the arrow', () => {
    const next = byLabel('наступний місяць', block());
    expect(next.disabled).toBe(true);
    byLabel('попередній місяць', block()).click();
    expect($('h3.cal__month', block()).textContent).toBe('жовтень');
    expect(document.activeElement).toBe(byLabel('попередній місяць', block()));
    expect(byLabel('наступний місяць', block()).disabled).toBe(false);
    byLabel('наступний місяць', block()).click();
    expect($('h3.cal__month', block()).textContent).toBe('листопад');
  });

  it('shows the month of the day picked', () => {
    byLabel('попередній місяць', block()).click();
    byLabel('пʼятниця, 30.10.2026', block()).click();
    expect($('h3.cal__month', block()).textContent).toBe('жовтень');
    byLabel('наступний день').click();
    byLabel('наступний день').click();
    expect($('h3.cal__month', block()).textContent).toBe('листопад');
  });

  it('starts «почати без ШІ» with the legend and no marks (Olesia, 2026-11-09)', () => {
    start(EXAMPLE_DIARY.days, EXAMPLE_DIARY.profile);
    expect(texts('.legend li', block())).toEqual([
      'під числом: пройдені рівні ранкової розминки, з 6 — число', 'над числом: виконані групи денної розминки', 'тренування', 'рух',
    ]);
    expect(all('.cal-day__dots, .cal-day__mark', block())).toHaveLength(0);
  });
});

describe('calendar sheet from the date', () => {
  const date = () => $<HTMLButtonElement>('.date-nav__date');

  it('opens over the page with the week, the averages and the month', () => {
    date().click();
    expect(sheet()!.getAttribute('role')).toBe('dialog');
    expect(date().getAttribute('aria-expanded')).toBe('true');
    expect(texts('h3', sheet()!)).toEqual(['цей тиждень', 'середнє за 7 днів', 'листопад']);
    expect(document.activeElement).toBe(byLabel('середа, 11.11.2026', sheet()!));
  });

  it('closes with Escape, a tap beside it or the date, and gives the focus back to the date', () => {
    date().click();
    sheet()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(date());
    date().click();
    $('.cal-sheet__scrim').click();
    expect(sheet()).toBeNull();
    date().click();
    date().click();
    expect(sheet()).toBeNull();
    expect(date().getAttribute('aria-expanded')).toBe('false');
  });

  it('opens a day and closes', () => {
    date().click();
    byLabel('вівторок, 10.11.2026, тренування, рух', sheet()!).click();
    expect(sheet()).toBeNull();
    expect(shownDate()).toBe('вівторок, 10.11.2026');
  });

  it('changes the month inside the sheet without closing it', () => {
    date().click();
    byLabel('попередній місяць', sheet()!).click();
    expect($('h3.cal__month', sheet()!).textContent).toBe('жовтень');
    expect(document.activeElement).toBe(byLabel('попередній місяць', sheet()!));
  });

  it('brings the bar back when it opens', () => {
    $('.bar').classList.add('bar--hidden');
    date().click();
    expect($('.bar').classList.contains('bar--hidden')).toBe(false);
  });
});


describe('pulse timer (wave 6: field on one row, timer on the next, «готово» in its place)', () => {
  const pulse = () => $('[data-pulse]');
  const timerRow = () => $('.pulse__row', pulse());
  const sw = () => $<HTMLButtonElement>('.sw__btn', pulse());
  const time = () => $('.sw__time', pulse()).textContent;
  const state = () => $('.sw', pulse()).dataset.state;
  const field = () => $<HTMLInputElement>('.labeled input', pulse());
  const beats = () => $<HTMLInputElement>('[data-input="beats"]', pulse());
  let vibrate: ReturnType<typeof vi.fn>;

  /** ▶, 3 s to get ready, 30 s of counting, then the beats and «готово». */
  const countTo = (typed: string) => {
    sw().click();
    vi.advanceTimersByTime(33_000);
    type(beats(), typed);
    byText('готово', pulse()).click();
  };

  beforeEach(() => {
    vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
  });

  it('puts the field and «уд/хв» on one row and the timer, as a stopwatch, on the next', () => {
    expect(field().getAttribute('aria-label')).toBe('пульс, уд/хв');
    expect(field().closest('.labeled')!.textContent).toContain('уд/хв');
    expect(timerRow().contains(field())).toBe(false);
    expect(timerRow().querySelector('.sw')).not.toBeNull();
    expect(sw().getAttribute('aria-label')).toBe('запустити таймер, 30 с');
    expect(state()).toBe('default');
    expect(time()).toBe('0:30');
    expect(pulse().querySelector('[data-input="beats"]')).toBeNull();
    expect(pulse().querySelector('[data-act="rm"]')).toBeNull();
  });

  it('▶: the «скільки ударів» field comes on the left at once, the timer goes to the right', () => {
    // a tap focuses the button (jsdom does not); the row rebuilds and the focus must stay on it
    sw().focus();
    sw().click();
    const row = timerRow();
    expect(row.classList.contains('pulse__row--busy')).toBe(true);
    expect(row.firstElementChild!.contains(beats())).toBe(true);
    expect(row.lastElementChild!.matches('.sw')).toBe(true);
    expect(beats().getAttribute('aria-label')).toBe('скільки ударів за 30 с?');
    // the focus stays on ■, so no keyboard pops up while counting
    expect(document.activeElement).toBe(sw());
  });

  it('gives 3 s to get ready, signals the start and the end, then «готово» saves beats per minute', () => {
    sw().click();
    expect(state()).toBe('running');
    expect(sw().getAttribute('aria-label')).toBe('зупинити й скасувати');
    expect(time()).toBe('3');
    expect(pulse().textContent).toContain('приготуйся');
    // B-02: each phase is said through the region that is always there; the lines are drawn anew
    const heard = () => document.querySelector('#announcer')!.textContent;
    expect(heard()).toBe('приготуйся');
    expect(pulse().querySelector('[role="status"]')).toBeNull();
    vi.advanceTimersByTime(1_000);
    expect(time()).toBe('2');
    expect(vibrate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    // F-06: the start comes with vibration, sound and the flash
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('.flash')).not.toBeNull();
    expect(time()).toBe('0:30');
    expect(pulse().textContent).toContain('рахуй удари');
    expect(heard()).toBe('рахуй удари');
    vi.advanceTimersByTime(12_000);
    expect(time()).toBe('0:18');
    vi.advanceTimersByTime(18_000);
    expect(vibrate).toHaveBeenCalledTimes(2);
    // the timer goes; «готово» (first level) and «скасувати» (third) take its place
    expect(pulse().querySelector('.sw')).toBeNull();
    expect(byText('готово', pulse()).className).toContain('btn--primary');
    expect(byText('скасувати', pulse()).className).toContain('btn--tertiary');
    expect(pulse().textContent).toContain('скільки ударів за 30 с?');
    expect(heard()).toBe('скільки ударів за 30 с?');
    expect(document.activeElement).toBe(beats());
    type(beats(), '42');
    byText('готово', pulse()).click();
    expect(saved()!.t.morning!.pulse).toBe(84);
    expect(field().value).toBe('84');
    // no line about the count stays after «готово» (Olesia, 2026-11-17)
    expect(pulse().textContent).not.toContain('удари за');
    expect(pulse().querySelector('.pulse__note')).toBeNull();
    // back to its starting look: ▶ and the full time, no ✓, no beats field
    expect(state()).toBe('default');
    expect(time()).toBe('0:30');
    expect(pulse().querySelector('[data-input="beats"]')).toBeNull();
    expect(document.activeElement).toBe(sw());
  });

  it('keeps the beats typed while counting through the end of the count', () => {
    sw().click();
    vi.advanceTimersByTime(10_000);
    type(beats(), '38');
    vi.advanceTimersByTime(23_000);
    expect(beats().value).toBe('38');
    byText('готово', pulse()).click();
    expect(saved()!.t.morning!.pulse).toBe(76);
  });

  it('■ while getting ready cancels the timer and the row goes back: no start, no end, nothing saved', () => {
    sw().click();
    vi.advanceTimersByTime(1_000);
    sw().focus();
    sw().click();
    expect(state()).toBe('default');
    expect(time()).toBe('0:30');
    expect(pulse().querySelector('[data-input="beats"]')).toBeNull();
    expect(timerRow().classList.contains('pulse__row--busy')).toBe(false);
    expect(document.activeElement).toBe(sw());
    vi.advanceTimersByTime(40_000);
    expect(vibrate).not.toHaveBeenCalled();
    expect(pulse().textContent).not.toContain('скільки ударів');
    expect(saved()).toBeUndefined();
  });

  it('■ while counting cancels the timer: no end, no question, nothing saved', () => {
    sw().click();
    vi.advanceTimersByTime(8_000);
    sw().click();
    expect(state()).toBe('default');
    document.body.querySelectorAll('.flash').forEach((flash) => flash.remove());
    vi.advanceTimersByTime(40_000);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('.flash')).toBeNull();
    expect(pulse().textContent).not.toContain('скільки ударів');
    expect(saved()).toBeUndefined();
  });

  it('a cancelled timer started again counts its own full time', () => {
    sw().click();
    vi.advanceTimersByTime(10_000);
    sw().click();
    sw().click();
    vi.advanceTimersByTime(30_000);
    expect(pulse().querySelector('.sw')).not.toBeNull();
    expect(time()).toBe('0:03');
    vi.advanceTimersByTime(3_000);
    expect(byText('готово', pulse())).toBeDefined();
  });

  it('«скасувати» after the count drops it, saves nothing and brings the timer back', () => {
    sw().click();
    vi.advanceTimersByTime(33_000);
    type(beats(), '40');
    byText('скасувати', pulse()).click();
    expect(state()).toBe('default');
    expect(pulse().querySelector('[data-input="beats"]')).toBeNull();
    expect(document.activeElement).toBe(sw());
    expect(saved()).toBeUndefined();
  });

  it('waits for a number before «готово» saves anything', () => {
    sw().click();
    vi.advanceTimersByTime(33_000);
    byText('готово', pulse()).click();
    type(beats(), '0');
    byText('готово', pulse()).click();
    expect(saved()).toBeUndefined();
    expect(document.activeElement).toBe(beats());
    expect(byText('готово', pulse())).toBeDefined();
  });

  it('a timer left after the count waits there, also across days, until the app is opened anew', () => {
    sw().click();
    vi.advanceTimersByTime(60_000);
    expect(byText('готово', pulse())).toBeDefined();
    byLabel('попередній день').click();
    byLabel('наступний день').click();
    expect(byText('готово', pulse())).toBeDefined();
    // a new run of the app (start) has a fresh session: the timer is back to ▶
    start();
    expect(state()).toBe('default');
  });

  it('a saved pulse has no ✓ and no ×: ▶ counts again, and the number is corrected in the field', () => {
    countTo('40');
    expect(saved()!.t.morning!.pulse).toBe(80);
    expect(pulse().querySelector('[data-act="rm"]')).toBeNull();
    expect(state()).toBe('default');
    sw().click();
    expect(state()).toBe('running');
    expect(time()).toBe('3');
    sw().click();
    type(field(), '78');
    expect(saved()!.t.morning!.pulse).toBe(78);
    type(field(), '');
    expect(saved()?.t.morning?.pulse).toBeUndefined();
  });

  it('a number typed by hand shows the timer at ▶, without ✓', () => {
    start({ ...DAYS, [TODAY]: readDay({ t: { morning: { pulse: 70 } } }, TODAY) });
    expect(field().value).toBe('70');
    expect(state()).toBe('default');
    expect(pulse().querySelector('[data-act="rm"]')).toBeNull();
  });

  it('shows the saved number in the field once the result is gone', () => {
    countTo('36');
    byLabel('попередній день').click();
    byLabel('наступний день').click();
    expect(field().value).toBe('72');
    expect(pulse().textContent).not.toContain('удари за');
  });
});
