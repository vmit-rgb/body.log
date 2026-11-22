import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DayKey } from '../domain/dates';
import { parseDiary, type Diary } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';
import { browserChoice, DIARY_KEY, diaryStore, healthMemory } from '../storage/store';
import { mountToast } from '../ui/toast';
import { startApp } from './app';
import type { Platform } from './start';
import { fakeDevice, openSections } from './test-env';

/*
 * Beta 1.1.1 (HEALTH-IMPORT.md, A4, A9): the «Здоровʼя» buttons in «рух» on
 * an iPhone, with a fake clipboard. Invented data only.
 */

const TODAY = '2026-11-22' as DayKey;
let host: HTMLElement;
/** What the phone's clipboard gives: text, or null when it refuses. */
let clipboard: string | null;

function start(platform: Platform, diary: Diary = EXAMPLE_DIARY): void {
  diaryStore(localStorage, () => new Date()).save(diary);
  document.body.innerHTML = '<main id="app"></main>';
  host = document.querySelector<HTMLElement>('#app')!;
  startApp({
    host,
    store: diaryStore(localStorage, () => new Date('2026-11-22T08:00:00Z')),
    browser: browserChoice(localStorage),
    platform,
    installed: true,
    toast: mountToast(document.body),
    onDiary: () => {},
    today: () => TODAY,
    sections: openSections,
    whenHidden: () => {},
    health: platform === 'iphone' ? { ...healthMemory(localStorage), read: async () => clipboard } : undefined,
    ...fakeDevice().env,
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const movement = () => host.querySelector<HTMLElement>('#sec-mv')!;
const control = (name: string) => [...movement().querySelectorAll<HTMLElement>('a, button')].find((b) => b.textContent!.trim() === name);
const tap = async (name: string) => {
  const found = control(name);
  if (!found) throw new Error(`no «${name}»`);
  found.click();
  await settle();
  await settle();
};
/** Olesia, 2026-11-22: one pill across the screen, nothing next to it. */
const pills = () => [...movement().querySelectorAll<HTMLElement>('.health__buttons > *')].map((b) => {
  expect(b.classList.contains('health__main')).toBe(true);
  return b.textContent!.trim();
});
const toastSays = () => document.querySelector<HTMLElement>('.toast:not([hidden]) .toast__message')?.textContent;
const stored = () => parseDiary(localStorage.getItem(DIARY_KEY) ?? '')!;
const REAL = 'body.log health 1\n2026-11-19 steps 2841\n2026-11-19 km 2.15974999998603\n2026-11-22 steps 18';

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  clipboard = REAL;
  // links don't go anywhere in a test (jsdom can't open the iCloud link or the shortcut)
  document.addEventListener('click', (event) => event.preventDefault(), { capture: true });
});

afterEach(() => vi.restoreAllMocks());

describe('«Здоровʼя» buttons (A4)', () => {
  it('are only on an iPhone', () => {
    start('android');
    expect(control('підключити Здоровʼя')).toBeUndefined();
    expect(control('синхронізувати')).toBeUndefined();
    start('unknown');
    expect(control('підключити Здоровʼя')).toBeUndefined();
  });

  it('go «підключити» → «синхронізувати» → «вставити дані» → written', async () => {
    start('iphone');
    const connect = control('підключити Здоровʼя')!;
    expect(connect.getAttribute('href')).toBe('https://www.icloud.com/shortcuts/f253cfa88cfd41aa923ff3d01c16e90b');
    expect(connect.getAttribute('target')).toBe('_blank');
    await tap('підключити Здоровʼя');
    expect(healthMemory(localStorage).connected()).toBe(true);
    const bubble = movement().querySelector('[data-tip-id="health"]')!.textContent!;
    expect(bubble).toContain('«Додати швидку команду»');
    expect(bubble).toContain('застосунку «Команди»');
    expect(control('підключити знову')).toBeDefined();
    expect(control('синхронізувати')!.getAttribute('href')).toBe('shortcuts://run-shortcut?name=body.log%20health');
    expect(pills()).toEqual(['синхронізувати']);

    await tap('синхронізувати');
    expect(pills()).toEqual(['вставити дані']);
    // the second tap isn't obvious: a bubble says so (Olesia, 2026-11-22)
    expect(movement().querySelector('[data-tip-id="health"]')!.textContent).toContain('натисни цю кнопку ще раз — «вставити дані»');
    await tap('вставити дані');

    expect(toastSays()).toBe('додано зі Здоровʼя: 2 дні');
    expect(stored().days['2026-11-19' as DayKey]!.hl).toMatchObject({ steps: 2841, km: 2.16 });
    expect(stored().days['2026-11-22' as DayKey]!.hl).toMatchObject({ steps: 18, km: null });
    // today is shown: its record, read only, and «синхронізувати» again
    expect(movement().querySelector('.mv-kind--health')!.textContent).toContain('18 кроків');
    expect(control('синхронізувати')).toBeDefined();
  });

  it('after a reload the phone remembers «підключено»', () => {
    healthMemory(localStorage).connect();
    start('iphone');
    expect(control('підключити Здоровʼя')).toBeUndefined();
    expect(control('синхронізувати')).toBeDefined();
  });

  it('a sync again replaces the days that came and keeps the rest', async () => {
    healthMemory(localStorage).connect();
    start('iphone');
    await tap('синхронізувати');
    await tap('вставити дані');
    clipboard = 'body.log health 1\n2026-11-22 steps 5000';
    await tap('синхронізувати');
    await tap('вставити дані');
    expect(stored().days['2026-11-22' as DayKey]!.hl).toMatchObject({ steps: 5000 });
    expect(stored().days['2026-11-19' as DayKey]!.hl).toMatchObject({ steps: 2841 });
    expect(toastSays()).toBe('додано зі Здоровʼя: 1 день');
  });

  it('not our text: an error, the bubble with «підключити знову», nothing written', async () => {
    healthMemory(localStorage).connect();
    start('iphone');
    clipboard = 'some other text';
    await tap('синхронізувати');
    await tap('вставити дані');
    expect(toastSays()).toContain('у буфері немає даних зі Здоровʼя');
    expect(control('підключити знову')).toBeDefined();
    // the one button goes back to «синхронізувати», to try again
    expect(pills()).toEqual(['синхронізувати']);
    expect(Object.values(stored().days).some((day) => day.hl)).toBe(false);
  });

  it('the header with no days: says so and writes nothing', async () => {
    healthMemory(localStorage).connect();
    start('iphone');
    clipboard = 'body.log health 1\n';
    await tap('синхронізувати');
    await tap('вставити дані');
    expect(toastSays()).toContain('немає кроків чи км за 7 днів');
  });

  it('a clipboard the phone won\'t give: a paste field, then «застосувати»', async () => {
    healthMemory(localStorage).connect();
    start('iphone');
    clipboard = null;
    await tap('синхронізувати');
    await tap('вставити дані');
    const field = movement().querySelector<HTMLTextAreaElement>('[data-health-field]')!;
    expect(field).not.toBeNull();
    field.value = REAL;
    await tap('застосувати');
    expect(toastSays()).toBe('додано зі Здоровʼя: 2 дні');
    expect(movement().querySelector('[data-health-field]')).toBeNull();
  });

  it('the bubble goes on a tap anywhere, but its own button still works', async () => {
    start('iphone');
    await tap('підключити Здоровʼя');
    const again = control('підключити знову')!;
    again.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(control('підключити знову')).toBe(again);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(movement().querySelector('[data-tip-id="health"]')).toBeNull();
  });

  it('none without «рух»', () => {
    start('iphone', { ...EXAMPLE_DIARY, profile: { ...EXAMPLE_DIARY.profile, movement: { enabled: false } } });
    expect(host.querySelector('#sec-mv')).toBeNull();
  });
});
