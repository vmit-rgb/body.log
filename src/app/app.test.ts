import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDevice, openSections } from './test-env';
import type { DayKey } from '../domain/dates';
import { readDay } from '../domain/day';
import { serializeDiary, type Diary } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';
import PASTED from '../format/example-profile.json';
import { BEFORE_FORMAT_KEY, browserChoice, DIARY_KEY, diaryStore, sectionMemory, type KeyValue } from '../storage/store';
import { mountToast } from '../ui/toast';
import { startApp, type AppEnv } from './app';

// Invented data only.
const COPY_081 = serializeDiary({
  profile: { format: 'phys-activity-profile', version: 1, theme: { accent: 'green' } },
  days: { ['2026-11-07' as DayKey]: readDay({ note: 'вправа 1' }, '2026-11-07' as DayKey) },
}, new Date('2026-11-08T10:00:00Z'));

let host: HTMLElement;
let onDiary: ReturnType<typeof vi.fn<(diary: Diary) => void>>;
let device: ReturnType<typeof fakeDevice>['device'];

function start(over: Partial<AppEnv> = {}, storage: KeyValue = localStorage): void {
  document.body.innerHTML = '<main id="app"></main>';
  host = document.querySelector<HTMLElement>('#app')!;
  onDiary = vi.fn<(diary: Diary) => void>();
  const fake = fakeDevice();
  device = fake.device;
  startApp({
    host,
    store: diaryStore(storage, () => new Date('2026-11-09T08:00:00Z')),
    browser: browserChoice(localStorage),
    platform: 'android',
    installed: true,
    toast: mountToast(document.body),
    onDiary,
    today: () => '2026-11-09' as DayKey,
    sections: sectionMemory(localStorage),
    ...fake.env,
    whenHidden: () => {},
    ...over,
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
const click = (selector: string) => host.querySelector<HTMLElement>(selector)!.click();
const stored = () => diaryStore(localStorage, () => new Date()).load();

async function restoreFile(text: string, file: File = new File([text], 'trekr-kopiya.json')): Promise<void> {
  const input = host.querySelector<HTMLInputElement>('[data-restore-file]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(toastText()).toBeTruthy());
}

beforeEach(() => localStorage.clear());

describe('first launch in the installed app', () => {
  beforeEach(() => start());

  it('greets and offers the three ways to start', () => {
    expect(heading()).toBe('привіт! почнімо з налаштувань :)');
    expect(host.querySelector('[data-restore]')!.textContent).toBe('відновити з копії');
    expect(host.querySelector('[data-start-without-ai]')!.textContent).toBe('почати без ШІ');
    expect(host.querySelector('footer')!.textContent).toContain('бета 0.9');
  });

  it('shows the paste field for the detected phone', () => {
    expect(host.querySelector('[data-platform-hint]')!.textContent).toBe('схоже, у тебе андроїд.');
    expect(host.querySelector<HTMLElement>('[data-paste]')!.hidden).toBe(false);
    expect(host.querySelector('[data-platform="android"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-paste-how]')!.textContent).toContain('натисни в полі');
  });

  it('switches the instructions to the other phone', () => {
    click('[data-platform="iphone"]');
    expect(host.querySelector('[data-platform="android"]')!.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('[data-paste-how]')!.textContent).toContain('тапни в полі');
  });

  it('enables «застосувати» only once something is pasted', () => {
    const field = host.querySelector<HTMLTextAreaElement>('[data-paste-field]')!;
    const apply = host.querySelector<HTMLButtonElement>('[data-apply]')!;
    expect(apply.disabled).toBe(true);
    field.value = '   ';
    field.dispatchEvent(new Event('input'));
    expect(apply.disabled).toBe(true);
    field.value = '{ "format": "phys-activity-profile" }';
    field.dispatchEvent(new Event('input'));
    expect(apply.disabled).toBe(false);
  });

  const pasteText = (text: string) => {
    const field = host.querySelector<HTMLTextAreaElement>('[data-paste-field]')!;
    field.value = text;
    field.dispatchEvent(new Event('input'));
    click('[data-apply]');
  };
  const result = () => host.querySelector<HTMLElement>('[data-paste-result]')!;
  const resultButton = (label: string) => [...result().querySelectorAll('button')].find((b) => b.textContent === label)!;

  it('shows what the pasted settings bring, saves them on «зберегти» and opens home', () => {
    expect(result().hidden).toBe(true);
    pasteText(`Ось налаштування:\n\`\`\`json\n${JSON.stringify(PASTED, null, 2)}\n\`\`\``);
    expect(result().hidden).toBe(false);
    expect(result().querySelector('[data-paste-title]')!.textContent).toBe('ось що буде в налаштуваннях');
    expect(document.activeElement).toBe(result().querySelector('[data-paste-title]'));
    expect(result().textContent).toContain('вправ у каталозі: 5');
    expect(result().textContent).not.toContain('записи лишаються як були');
    expect(stored()).toBeNull();
    resultButton('зберегти').click();
    expect(heading()).toBe('головна');
    expect(stored()).toEqual({ profile: PASTED, days: {} });
    expect(toastSays()).toBe('✓ збережено :)');
  });

  it('«скасувати» on the toast brings the first screen back, with nothing stored', () => {
    pasteText(JSON.stringify(PASTED));
    resultButton('зберегти').click();
    document.querySelector<HTMLElement>('.toast__action')!.click();
    expect(toastSays()).toBe('✓ скасовано');
    expect(heading()).toBe('привіт! почнімо з налаштувань :)');
    expect(stored()).toBeNull();
  });

  it('«скасувати» in the preview keeps nothing and hides the result', () => {
    pasteText(JSON.stringify(PASTED));
    resultButton('скасувати').click();
    expect(result().hidden).toBe(true);
    expect(stored()).toBeNull();
    expect(heading()).toBe('привіт! почнімо з налаштувань :)');
  });

  it('explains an error in plain words and copies it for the AI', async () => {
    pasteText(JSON.stringify({ ...PASTED, exercises: [{ id: 'neck-rolls', name: '' }] }));
    expect(result().querySelector('[data-paste-title]')!.textContent).toBe('щось не так у налаштуваннях >_<');
    expect(result().textContent).toContain('вправи → вправа 1 → назва: не може бути порожнім');
    expect(resultButton('зберегти')).toBeUndefined();
    resultButton('скопіювати для ШІ').click();
    await vi.waitFor(() => expect(toastSays()).toBe('✓ скопійовано — встав у чат зі своїм ШІ'));
    expect(device.copied[0]).toContain('Застосунок не прийняв налаштування. Що треба виправити:');
    expect(stored()).toBeNull();
  });

  it('hides the result as soon as the text changes', () => {
    pasteText('не json');
    expect(result().hidden).toBe(false);
    expect(result().querySelector('button')).toBeNull();
    const field = host.querySelector<HTMLTextAreaElement>('[data-paste-field]')!;
    field.value = '{';
    field.dispatchEvent(new Event('input'));
    expect(result().hidden).toBe(true);
  });

  it('names unknown keys; «продовжити без цього» goes on without keeping them', async () => {
    pasteText(JSON.stringify({ ...PASTED, schedule: 'daily' }));
    expect(result().querySelector('[data-paste-title]')!.textContent).toBe('ось що застосунок не прочитав');
    expect(result().textContent).toContain('"schedule"');
    const buttons = [...result().querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['скопіювати для ШІ, щоб виправити', 'продовжити без цього']);
    expect(buttons[0]!.className).toContain('btn--primary');
    expect(buttons[1]!.className).toContain('btn--secondary');
    buttons[0]!.click();
    await vi.waitFor(() => expect(device.copied[0]).toContain('"schedule" [schedule]'));
    resultButton('продовжити без цього').click();
    expect(result().querySelector('[data-paste-title]')!.textContent).toBe('ось що буде в налаштуваннях');
    resultButton('зберегти').click();
    expect(stored()!.profile).toEqual(PASTED);
  });

  it('refuses settings in russian, by `lang` and by letters', () => {
    pasteText(JSON.stringify({ ...PASTED, lang: 'ru' }));
    expect(result().querySelector('[data-paste-title]')!.textContent).toBe('налаштування російською мовою не приймаються.');
    pasteText(JSON.stringify({ ...PASTED, encouragement: ['ты молодец'] }));
    expect(result().querySelector('[data-paste-title]')!.textContent).toBe('налаштування російською мовою не приймаються.');
    expect(stored()).toBeNull();
  });

  it('refuses to restore a copy whose settings are russian', async () => {
    await restoreFile(serializeDiary({ profile: { ...PASTED, lang: 'ru' }, days: {} }, new Date()));
    expect(toastSays()).toBe('копію не відновлено: налаштування в ній російською мовою.');
    expect(stored()).toBeNull();
    // Belarusian has these letters too: accepted
    void restoreFile(serializeDiary({ profile: { ...PASTED, lang: 'be', encouragement: ['гэта добра'] }, days: {} }, new Date()));
    await vi.waitFor(() => expect(toastSays()).toBe('✓ відновлено з файлу :)'));
  });

  it('starts without AI: stores the examples and leaves the first screen', () => {
    click('[data-start-without-ai]');
    expect(stored()).toEqual(EXAMPLE_DIARY);
    expect(onDiary).toHaveBeenCalledWith(EXAMPLE_DIARY);
    expect(heading()).toBe('головна');
    expect(host.querySelector('.hero__text')!.textContent).toBe('ти можеш налаштувати все в налаштуваннях :)');
  });

  it('restores a copy from «бета 0.81» with its days', async () => {
    await restoreFile(COPY_081);
    expect(toastSays()).toBe('✓ відновлено з файлу :)');
    expect(Object.keys(stored()!.days)).toEqual(['2026-11-07']);
    expect(heading()).toBe('головна');
    expect(onDiary).toHaveBeenCalledTimes(1);
  });

  it('refuses a file that is not a copy and stays on the first screen', async () => {
    await restoreFile('{"format":"something-else"}');
    expect(toastSays()).toBe('цей файл не схожий на копію з трекера >_<');
    expect(stored()).toBeNull();
    expect(heading()).toBe('привіт! почнімо з налаштувань :)');
  });

  it('says the file is not a copy when the phone cannot read it', async () => {
    const unreadable = new File([''], 'trekr-kopiya.json');
    unreadable.text = () => Promise.reject(new Error('NotReadableError'));
    await restoreFile('', unreadable);
    expect(toastSays()).toBe('цей файл не схожий на копію з трекера >_<');
    expect(stored()).toBeNull();
  });

  it('does nothing when no file was picked', () => {
    const input = host.querySelector<HTMLInputElement>('[data-restore-file]')!;
    const picker = vi.spyOn(input, 'click').mockImplementation(() => {});
    click('[data-restore]');
    expect(picker).toHaveBeenCalled();
    Object.defineProperty(input, 'files', { configurable: true, value: [] });
    input.dispatchEvent(new Event('change'));
    expect(toastText()).toBeUndefined();
  });
});

describe('the paste field on a computer', () => {
  it('waits for the person to pick a phone', () => {
    start({ platform: 'unknown', installed: false });
    expect(host.querySelector('[data-platform-hint]')!.textContent).toContain('не вдалося визначити телефон');
    expect(host.querySelector<HTMLElement>('[data-paste]')!.hidden).toBe(true);
    click('[data-platform="iphone"]');
    expect(host.querySelector<HTMLElement>('[data-paste]')!.hidden).toBe(false);
  });
});

describe('a phone in the browser', () => {
  it('asks to install first, with the steps for the detected phone', () => {
    start({ platform: 'iphone', installed: false });
    expect(heading()).toBe('спершу встанови застосунок');
    expect(host.querySelector('[data-steps]')!.textContent).toContain('safari');
    click('[data-platform="android"]');
    expect(host.querySelector('[data-steps]')!.textContent).toContain('chrome');
  });

  it('lets the person go on in the browser and remembers it', () => {
    start({ platform: 'android', installed: false });
    click('[data-use-browser]');
    expect(heading()).toBe('привіт! почнімо з налаштувань :)');
    start({ platform: 'android', installed: false });
    expect(heading()).toBe('привіт! почнімо з налаштувань :)');
  });
});

describe('coming back', () => {
  it('opens straight on the saved diary and applies it', () => {
    diaryStore(localStorage, () => new Date()).save(EXAMPLE_DIARY);
    start({ installed: false });
    expect(heading()).toBe('головна');
    expect(onDiary).toHaveBeenCalledWith(EXAMPLE_DIARY);
  });
});

describe('coming back with a diary from before format 0.1', () => {
  it('converts the old `timed` and `side` once, shows the exercises as before and keeps the days', () => {
    // invented: the shape «бета 0.81» leaves on the phone
    const old = serializeDiary({
      profile: {
        format: 'phys-activity-profile',
        version: 1,
        theme: { accent: 'blue' },
        morningWarmup: { enabled: true, weeklyTarget: 5, levels: [{ id: 'l1', name: 'рівень 1', items: [{ exercise: 'plank', reps: '40', timed: true }] }] },
        workout: { enabled: true, weeklyTarget: 2, sessions: [{ id: 'a', name: 'а', items: [{ exercise: 'lunge', sets: 3, reps: '10', side: 'на кожну ногу', fields: ['reps'] }] }] },
        exercises: [{ id: 'plank', name: 'планка' }, { id: 'lunge', name: 'випад' }],
      },
      days: { ['2026-11-09' as DayKey]: readDay({ note: 'вправа 1', wo: { session: 'a' } }, '2026-11-09' as DayKey) },
    }, new Date('2026-11-08T10:00:00Z'));
    localStorage.setItem(DIARY_KEY, old);
    start({ sections: openSections });
    expect(heading()).toBe('головна');
    expect(host.textContent).toContain('40 с');
    expect(host.textContent).toContain('3 × 10 на кожну ногу');
    const profile = stored()!.profile as { morningWarmup: { levels: { items: unknown[] }[] }; workout: { sessions: { items: unknown[] }[] }; version: unknown };
    expect(profile.version).toBe('0.1');
    expect(profile.morningWarmup.levels[0]!.items).toEqual([{ exercise: 'plank', seconds: 40 }]);
    expect(profile.workout.sessions[0]!.items).toEqual([{ exercise: 'lunge', sets: 3, reps: '10 на кожну ногу', fields: ['reps'] }]);
    expect(stored()!.days['2026-11-09' as DayKey]).toMatchObject({ note: 'вправа 1' });
    expect(localStorage.getItem(BEFORE_FORMAT_KEY)).toBe(old);
  });
});

describe('home', () => {
  beforeEach(() => {
    diaryStore(localStorage, () => new Date()).save(EXAMPLE_DIARY);
    start();
  });

  it('opens on today and goes to the previous day', () => {
    expect(host.querySelector('.date-nav__date [aria-hidden]')!.textContent).toBe('пн, 09.11.2026');
    click('[aria-label="попередній день"]');
    // the short date re-forms out of glyphs (home-motion.test.ts); the spoken one is there at once
    expect(host.querySelector('.date-nav__date .visually-hidden')!.textContent).toBe('неділя, 08.11.2026');
    expect(host.querySelector('.hero__text')!.textContent).toContain('це запис за нд, 08.11.2026.');
  });

  it('opens the menu from ≡', () => {
    click('.bar__menu');
    expect(heading()).toBe('меню');
  });
});

describe('when the phone refuses to store', () => {
  it('says so and stays on the first screen', () => {
    start({}, { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} });
    click('[data-start-without-ai]');
    expect(toastSays()).toBe('не вдалося зберегти: схоже, на телефоні забракло місця >_<');
    expect(heading()).toBe('привіт! почнімо з налаштувань :)');
    expect(onDiary).not.toHaveBeenCalled();
  });
});
