import { beforeEach, describe, expect, it } from 'vitest';
import type { DayKey } from '../domain/dates';
import type { Diary } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';
import { browserChoice, diaryStore, sectionMemory, tipMemory, TIP_SUCCESSES } from '../storage/store';
import { mountToast } from '../ui/toast';
import { startApp } from './app';
import { fakeDevice } from './test-env';

/*
 * Wave 7a (`app/fix-small`, ux-audit/FIXES-PLAN.md): ⋯ moved into
 * «доступність», a second tap on ⋯ closes its menu, the «затисни» tip.
 * Invented data only: the «почати без ШІ» example.
 */

const TODAY = '2026-11-09' as DayKey;
let host: HTMLElement;

function start(diary: Diary): void {
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
    tips: tipMemory(localStorage),
    whenHidden: () => {},
    ...fake.env,
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
const withDots = (on: boolean): Diary => ({ ...EXAMPLE_DIARY, profile: { ...EXAMPLE_DIARY.profile, accessibility: { showDots: on } } } as Diary);

async function openSettings(diary: Diary = EXAMPLE_DIARY): Promise<void> {
  start(diary);
  await tap('меню');
  await tap('налаштування');
  await tap('ранкова розминка');
}

const intro = () => host.querySelector('.settings__intro')!.textContent!;
const menuItems = () => [...host.querySelectorAll('.st-menu button')].map((b) => b.textContent);
const tipText = () => host.querySelector('.tip')?.textContent?.trim();

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('⋯ in «доступність» (wave 7a, Olesia 2026-11-18)', () => {
  it('has no ⋯ by default; the intro speaks of the long press only', async () => {
    await openSettings();
    expect(host.querySelector('.st-actions')).toBeNull();
    expect(host.querySelector('.st-item--movable')).not.toBeNull();
    expect(intro()).toContain('без перетягування: затримай палець на записі й відпусти.');
    expect(intro()).not.toContain('⋯');
  });

  it('shows ⋯ once its checkbox in «доступність» is on', async () => {
    await openSettings();
    await tap('доступність');
    const box = [...host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
      .find((input) => input.closest('label')!.textContent!.includes('показувати ⋯ біля пунктів, що потребують затискання'))!;
    box.click();
    await settle();
    expect(buttons('дії: рівень 1')).toHaveLength(1);
    expect(intro()).toContain('натисни ⋯ біля запису');
  });

  it('a second tap on ⋯ closes its menu', async () => {
    await openSettings(withDots(true));
    await tap('дії: рівень 1');
    expect(menuItems()).toEqual(['нижче', 'скасувати']);
    await tap('дії: рівень 1');
    expect(host.querySelector('.st-menu')).toBeNull();
  });
});

describe('the «затисни, щоб відкрити дії» tip (wave 7a)', () => {
  it('stands under the first entry with a menu, once, while ⋯ are off', async () => {
    await openSettings();
    expect(host.querySelectorAll('.tip')).toHaveLength(1);
    expect(tipText()).toBe('затисни, щоб відкрити дії.');
  });

  it('is not there with ⋯ on', async () => {
    await openSettings(withDots(true));
    expect(host.querySelector('.tip')).toBeNull();
  });

  it('a tap anywhere hides it until the settings are opened again', async () => {
    await openSettings();
    host.querySelector('.settings-screen')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(host.querySelector('.tip')).toBeNull();
    await tap('тренування');
    expect(host.querySelector('.tip')).toBeNull();
  });

  it('goes for good after the menu was opened three times', async () => {
    await openSettings(withDots(true));
    for (let i = 0; i < TIP_SUCCESSES; i++) {
      await tap('дії: рівень 1');
      await tap('скасувати');
    }
    await openSettings();
    expect(host.querySelector('.tip')).toBeNull();
  });
});
