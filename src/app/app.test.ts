import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDevice, openSections } from './test-env';
import type { DayKey } from '../domain/dates';
import { readDay } from '../domain/day';
import { serializeDiary, type Diary } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';
import { PROMPT } from '../prompt/prompt';
import PASTED from '../format/example-profile.json';
import { BEFORE_FORMAT_KEY, browserChoice, DIARY_KEY, diaryStore, sectionMemory, type KeyValue } from '../storage/store';
import { mountToast } from '../ui/toast';
import { INSTALL_NOTES } from '../screens/parts';
import { startApp, type AppEnv } from './app';
import { NO_OFFER, useInstallOffer, type InstallOffer } from '../pwa/install-offer';

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
    expect(host.querySelector('footer')!.textContent).toContain('бета 1.1.1');
  });

  it('shows the paste field at once, with no choice of phone (wave 7a)', () => {
    expect(host.querySelector<HTMLElement>('[data-paste]')!.hidden).toBe(false);
    expect(host.querySelector('[data-platform]')).toBeNull();
    expect(host.querySelector('[data-platform-hint]')).toBeNull();
    expect(host.querySelector('[data-paste-how]')!.textContent).toBe('у чаті з ШІ скопіюй його відповідь з налаштуваннями. тут натисни в полі → «вставити».');
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

  it('keeps «застосувати» off until something is pasted', () => {
    const apply = host.querySelector<HTMLButtonElement>('[data-apply]')!;
    const field = host.querySelector<HTMLTextAreaElement>('[data-paste-field]')!;
    expect(apply.disabled).toBe(true);
    field.value = '   ';
    field.dispatchEvent(new Event('input'));
    expect(apply.disabled).toBe(true);
    field.value = '{ }';
    field.dispatchEvent(new Event('input'));
    expect(apply.disabled).toBe(false);
  });

  it('copies the bundled prompt and names its version in the toast', async () => {
    click('[data-copy-prompt]');
    await vi.waitFor(() => expect(toastSays()).toBe('✓ промпт 0.1 скопійовано'));
    expect(device.copied).toEqual([PROMPT.text]);
    expect(PROMPT.text).toContain('"format": "phys-activity-profile"');
  });

  it('says so when the phone refuses to copy the prompt', async () => {
    device.copyWorks = false;
    click('[data-copy-prompt]');
    await vi.waitFor(() => expect(toastSays()).toBe('не вдалося скопіювати >_<'));
  });

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

  it('names a pasted «вимкнути зникання повідомлень» in the preview and keeps it', () => {
    pasteText(JSON.stringify({ ...PASTED, accessibility: { keepToasts: true } }));
    expect(result().textContent).toContain('доступність: повідомлення не зникають');
    resultButton('зберегти').click();
    expect(stored()!.profile.accessibility).toEqual({ keepToasts: true });
  });

  it('accepts first settings without `theme` and keeps a random accent with them (Olesia, 2026-11-15)', () => {
    const { theme: _theme, ...noTheme } = PASTED;
    // 0.95 of the 11 is the last one, «зелений»
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.95);
    pasteText(JSON.stringify(noTheme));
    resultButton('зберегти').click();
    random.mockRestore();
    expect(stored()!.profile).toEqual({ ...noTheme, theme: { accent: 'green' } });
  });

  it('keeps the accent the first settings name', () => {
    pasteText(JSON.stringify({ ...PASTED, theme: { accent: 'sky' } }));
    resultButton('зберегти').click();
    expect((stored()!.profile.theme as { accent: string }).accent).toBe('sky');
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

  it('empties the field after a refusal, so the next answer goes in at once (Olesia, 2026-11-18)', async () => {
    const field = host.querySelector<HTMLTextAreaElement>('[data-paste-field]')!;
    pasteText('не json');
    expect(field.value).toBe('');
    expect(host.querySelector<HTMLButtonElement>('[data-apply]')!.disabled).toBe(true);
    expect(result().hidden).toBe(false);
    pasteText(JSON.stringify({ ...PASTED, exercises: [{ id: 'neck-rolls', name: '' }] }));
    expect(field.value).toBe('');
    // «скопіювати для ШІ» still has the text the field held
    resultButton('скопіювати для ШІ').click();
    await vi.waitFor(() => expect(device.copied[0]).toContain('вправа 1 → назва'));
  });

  it('keeps the field when the settings are read', () => {
    pasteText(JSON.stringify(PASTED));
    expect(host.querySelector<HTMLTextAreaElement>('[data-paste-field]')!.value).not.toBe('');
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
    expect(host.querySelector<HTMLTextAreaElement>('[data-paste-field]')!.value).toBe('');
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
    expect(toastSays()).toBe('цей файл не схожий на копію з body.log >_<');
    expect(stored()).toBeNull();
    expect(heading()).toBe('привіт! почнімо з налаштувань :)');
  });

  it('says the file is not a copy when the phone cannot read it', async () => {
    const unreadable = new File([''], 'trekr-kopiya.json');
    unreadable.text = () => Promise.reject(new Error('NotReadableError'));
    await restoreFile('', unreadable);
    expect(toastSays()).toBe('цей файл не схожий на копію з body.log >_<');
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
  it('shows the field at once, as on a phone (wave 7a)', () => {
    start({ platform: 'unknown', installed: false });
    expect(host.querySelector<HTMLElement>('[data-paste]')!.hidden).toBe(false);
    expect(host.querySelector('[data-platform]')).toBeNull();
  });
});

describe('a phone in the browser', () => {
  it('asks to install first, with the steps for the detected phone', () => {
    start({ platform: 'iphone', installed: false });
    expect(heading()).toBe('спершу встанови застосунок');
    expect(host.querySelector('[data-steps]')!.textContent).toContain('Safari');
    click('[data-platform="android"]');
    expect(host.querySelector('[data-steps]')!.textContent).toContain('Chrome');
  });

  it('names the browsers to use under the steps, with the note for the chosen phone (here and in «як?»)', () => {
    start({ platform: 'iphone', installed: false });
    const note = () => host.querySelector('[data-steps-note]')!.textContent;
    expect(note()).toBe(INSTALL_NOTES.iphone);
    click('[data-platform="android"]');
    expect(note()).toBe(INSTALL_NOTES.android);
    expect(note()).toContain('назва пункту в меню залежить від версії браузера');
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

describe('in a browser tab the app says that records will not stay (A-04)', () => {
  const NOTE = 'це вкладка браузера: закриєш її — і записи зникнуть. встанови застосунок, щоб вони лишилися.';
  const note = () => host.querySelector('.tab-note p')?.textContent;
  const popup = () => document.querySelector<HTMLElement>('.install-how');
  const steps = () => [...popup()!.querySelectorAll('[data-steps] li')].map((li) => li.textContent);
  afterEach(() => popup()?.remove());

  it('«як?» opens the install steps with the android / iphone toggle, and they close', () => {
    start({ platform: 'unknown', installed: false });
    click('[data-install-how]');
    expect(popup()?.getAttribute('role')).toBe('dialog');
    expect(steps()[0]).toBe('відкрий цю сторінку в Chrome.');
    popup()!.querySelector<HTMLElement>('[data-platform="iphone"]')!.click();
    expect(steps()[1]).toBe('натисни ⋯ (на старіших айфонах — ⍐ унизу) → «поділитися» → «на початковий екран».');
    expect(popup()!.querySelector('[data-steps-note]')!.textContent).toBe(INSTALL_NOTES.iphone);
    expect(popup()!.querySelector('[data-platform="iphone"]')!.getAttribute('aria-pressed')).toBe('true');
    popup()!.querySelector<HTMLElement>('.btn[data-close]')!.click();
    // gone, or fading out and taking no taps
    expect(popup() === null || popup()!.inert).toBe(true);
    expect(document.querySelector('#app')?.hasAttribute('inert') ?? false).toBe(false);
  });

  it('«як?» shows the drawn phone under the steps, the chosen one, hidden from screen readers (Olesia, 2026-11-22)', () => {
    start({ platform: 'unknown', installed: false });
    click('[data-install-how]');
    const demo = () => popup()!.querySelector<HTMLElement>('.install-demo')!;
    expect(demo().previousElementSibling!.hasAttribute('data-steps')).toBe(true);
    expect(demo().querySelector('.phone')!.getAttribute('aria-hidden')).toBe('true');
    expect(demo().querySelector<HTMLElement>('.phone')!.dataset.variant).toBe('android');
    expect(demo().querySelector('[data-t="a-install"]')!.textContent).toBe('встановити застосунок');
    popup()!.querySelector<HTMLElement>('[data-platform="iphone"]')!.click();
    expect(demo().querySelector<HTMLElement>('.phone')!.dataset.variant).toBe('ios26');
    expect(demo().querySelectorAll('button[data-variant]')).toHaveLength(2);
  });

  it('«як?» has no phone with «вимкнути всі анімації»: the steps say it all', () => {
    document.documentElement.setAttribute('data-no-motion', '');
    try {
      start({ platform: 'unknown', installed: false });
      click('[data-install-how]');
      expect(popup()!.querySelector('[data-install-demo]')).toBeNull();
      expect(steps()).toHaveLength(3);
    } finally {
      document.documentElement.removeAttribute('data-no-motion');
    }
  });

  it('«як?» works on home too', () => {
    start({ platform: 'unknown', installed: false });
    click('[data-start-without-ai]');
    click('[data-install-how]');
    expect(steps()).toHaveLength(3);
  });

  it('on the first screen, on a computer and on a phone that chose the browser', () => {
    start({ platform: 'unknown', installed: false });
    expect(note()).toBe(NOTE);
    start({ platform: 'android', installed: false });
    click('[data-use-browser]');
    expect(note()).toBe(NOTE);
  });

  it('on home, and still there after the screen is drawn again', () => {
    start({ platform: 'unknown', installed: false });
    click('[data-start-without-ai]');
    expect(heading()).toBe('головна');
    expect(note()).toBe(NOTE);
    click('.date-nav [data-step="-1"]');
    expect(note()).toBe(NOTE);
  });

  it('never in the installed app', () => {
    start();
    expect(note()).toBeUndefined();
    click('[data-start-without-ai]');
    expect(heading()).toBe('головна');
    expect(note()).toBeUndefined();
  });
});

describe('beta 1.0.1: installing (FIXES-1.0.1.md)', () => {
  const toastBox = () => document.querySelector<HTMLElement>('.toast')!;
  const welcome = () => {
    let seen = false;
    return { seen: () => seen, mark: vi.fn(() => { seen = true; }) };
  };
  const steps = () => [...host.querySelectorAll('[data-steps] li')].map((li) => li.textContent);
  const installButton = () => host.querySelector<HTMLButtonElement>('[data-install-now]')!;

  describe('A2a: «встановлено :)» on the first start of the installed app', () => {
    it('says it, with ✓, when nothing is stored, and marks it at once', () => {
      const memory = welcome();
      start({ welcome: memory });
      expect(toastSays()).toBe('✓ встановлено :) записи тепер тримаються тут');
      expect(memory.mark).toHaveBeenCalledTimes(1);
    });

    it('stays until ×: no melting bar, and the first screen\'s own moves keep it', () => {
      start({ welcome: welcome() });
      expect(toastBox().querySelector<HTMLElement>('.toast__life')!.hidden).toBe(true);
      toastBox().querySelector<HTMLElement>('.toast__close')!.click();
      return vi.waitFor(() => expect(toastBox().hidden).toBe(true));
    });

    it('not a second time', () => {
      const memory = welcome();
      start({ welcome: memory });
      document.querySelector<HTMLElement>('.toast__close')!.click();
      start({ welcome: memory });
      expect(toastText()).toBeUndefined();
    });

    it('not after the update for whoever has a diary already: the mark is set quietly', () => {
      diaryStore(localStorage, () => new Date()).save(EXAMPLE_DIARY);
      const memory = welcome();
      start({ welcome: memory });
      expect(heading()).toBe('головна');
      expect(toastText()).toBeUndefined();
      expect(memory.mark).toHaveBeenCalledTimes(1);
      // and the diary being gone later doesn't bring it back
      localStorage.clear();
      start({ welcome: memory });
      expect(toastText()).toBeUndefined();
    });

    it('not over a diary the app can\'t read', () => {
      localStorage.setItem(DIARY_KEY, '{"format":"phys-activity-backup","version":1,"days":{');
      start({ welcome: welcome() });
      expect(toastText()).toBeUndefined();
    });

    it('never in a browser tab', () => {
      const memory = welcome();
      start({ welcome: memory, installed: false, platform: 'android' });
      expect(toastText()).toBeUndefined();
      expect(memory.mark).not.toHaveBeenCalled();
    });

    it('follows to home after «почати без ШІ», still until ×', () => {
      start({ welcome: welcome() });
      click('[data-start-without-ai]');
      expect(heading()).toBe('головна');
      expect(toastText()).toBe('встановлено :) записи тепер тримаються тут');
    });
  });

  describe('A1: «встановити» when the browser offers the install', () => {
    function fakeOffer(ready: boolean) {
      let offered = ready;
      const listeners = new Set<() => void>();
      const offer: InstallOffer = {
        ready: () => offered,
        onChange(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        install: vi.fn(async () => {
          offered = false;
          listeners.forEach((listener) => listener());
          return 'accepted' as const;
        }),
      };
      return { offer, arrive() { offered = true; listeners.forEach((listener) => listener()); } };
    }
    afterEach(() => useInstallOffer(NO_OFFER));

    it('is there on Android, and the menu becomes the other way', () => {
      const { offer } = fakeOffer(true);
      useInstallOffer(offer);
      start({ platform: 'android', installed: false });
      expect(installButton().hidden).toBe(false);
      expect(installButton().textContent).toBe('встановити');
      expect(steps()).toEqual(['або меню ⋮ → «встановити застосунок».', 'відкрий застосунок з головного екрана. налаштовуй уже в ньому.']);
      click('[data-platform="iphone"]');
      expect(installButton().hidden).toBe(true);
      expect(steps()).toHaveLength(4);
    });

    it('asks the browser and then goes, as the offer is used up', async () => {
      const { offer } = fakeOffer(true);
      useInstallOffer(offer);
      start({ platform: 'android', installed: false });
      installButton().click();
      expect(offer.install).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(installButton().hidden).toBe(true));
      expect(steps()[0]).toBe('відкрий цю сторінку в Chrome.');
    });

    it('comes when the offer comes after the screen', () => {
      const fake = fakeOffer(false);
      useInstallOffer(fake.offer);
      start({ platform: 'android', installed: false });
      expect(installButton().hidden).toBe(true);
      expect(steps()).toHaveLength(3);
      fake.arrive();
      expect(installButton().hidden).toBe(false);
    });

    it('is not there without an offer: the steps stay as text', () => {
      start({ platform: 'android', installed: false });
      expect(installButton().hidden).toBe(true);
      expect(steps()[1]).toBe('меню ⋮ → «встановити застосунок».');
    });

    it('is in «як?» too', () => {
      const { offer } = fakeOffer(true);
      useInstallOffer(offer);
      start({ platform: 'unknown', installed: false });
      click('[data-install-how]');
      const popup = document.querySelector<HTMLElement>('.install-how')!;
      expect(popup.querySelector<HTMLElement>('[data-install-now]')!.hidden).toBe(false);
      popup.remove();
    });
  });

  describe('A4: the iPhone steps for iOS 26 and older', () => {
    it('name ⋯, the older ⍐ and the «відкрити як вебзастосунок» switch', () => {
      start({ platform: 'iphone', installed: false });
      expect(steps()).toEqual([
        'відкрий цю сторінку в Safari.',
        'натисни ⋯ (на старіших айфонах — ⍐ унизу) → «поділитися» → «на початковий екран».',
        'перемикач «відкрити як вебзастосунок» лиши увімкненим → «додати».',
        'відкрий застосунок з головного екрана й налаштовуй уже там, не в Safari.',
      ]);
    });
  });

  describe('A3: inside Instagram or a messenger, the yellow frame', () => {
    const frame = () => host.querySelector<HTMLElement>('[data-in-app]');
    const SAYS = 'ти зараз у браузері всередині іншого застосунку. звідси body.log не встановиться — відкрий цю сторінку в Chrome або Safari.';

    it('takes the place of the install steps, with «відкрити в Chrome» on Android', () => {
      start({ platform: 'android', installed: false, inApp: true });
      expect(heading()).toBe('спершу встанови застосунок');
      expect(frame()!.classList.contains('tab-note')).toBe(true);
      expect(frame()!.querySelector('p')!.textContent).toBe(SAYS);
      expect(host.querySelector('[data-steps]')).toBeNull();
      const chrome = frame()!.querySelector<HTMLAnchorElement>('[data-open-chrome]')!;
      expect(chrome.textContent).toBe('відкрити в Chrome');
      expect(chrome.getAttribute('href')).toMatch(/^intent:\/\/.*#Intent;scheme=https;package=com\.android\.chrome;end$/);
      expect(frame()!.textContent).not.toContain('відкрити в Safari');
    });

    it('on an iPhone: no Chrome button, the app\'s own menu instead', () => {
      start({ platform: 'iphone', installed: false, inApp: true });
      expect(frame()!.querySelector('[data-open-chrome]')).toBeNull();
      expect(frame()!.textContent).toContain('або знайди в меню цього застосунку «відкрити в браузері» чи «відкрити в Safari».');
    });

    it('«скопіювати посилання» copies the page and says so', async () => {
      start({ platform: 'iphone', installed: false, inApp: true, pageUrl: () => 'https://vmit-rgb.github.io/body.log/' });
      frame()!.querySelector<HTMLElement>('[data-copy-link]')!.click();
      await vi.waitFor(() => expect(toastSays()).toBe('✓ посилання скопійовано'));
      expect(device.copied).toEqual(['https://vmit-rgb.github.io/body.log/']);
    });

    it('says when the copy failed', async () => {
      start({ platform: 'android', installed: false, inApp: true });
      device.copyWorks = false;
      frame()!.querySelector<HTMLElement>('[data-copy-link]')!.click();
      await vi.waitFor(() => expect(toastSays()).toBe('не вдалося скопіювати >_<'));
    });

    it('stays over the first screen and home when the person goes on anyway', () => {
      start({ platform: 'android', installed: false, inApp: true });
      click('[data-use-browser]');
      expect(heading()).toBe('привіт! почнімо з налаштувань :)');
      expect(frame()!.querySelector('p')!.textContent).toBe(SAYS);
      click('[data-start-without-ai]');
      expect(heading()).toBe('головна');
      expect(frame()).not.toBeNull();
      expect(host.querySelector('[data-install-how]')).toBeNull();
    });

    it('never in the installed app, whatever the user agent says', () => {
      start({ platform: 'iphone', installed: true, inApp: true });
      expect(frame()).toBeNull();
    });

    it('not for a real browser: the usual steps', () => {
      start({ platform: 'android', installed: false, inApp: false });
      expect(frame()).toBeNull();
      expect(host.querySelector('[data-steps]')).not.toBeNull();
    });
  });
});

describe('coming back to a diary the app cannot read (D-02)', () => {
  const BROKEN = '{"format":"phys-activity-backup","version":1,"profile":{"lang":"uk"},"days":{"2026-11-07":{"note":"вправа';

  beforeEach(() => {
    localStorage.setItem(DIARY_KEY, BROKEN);
    start();
  });

  it('says so, instead of greeting as if nothing was ever logged', () => {
    expect(heading()).toBe('не вдалося прочитати щоденник');
    expect(host.textContent).toContain('записи на місці, але застосунок не може їх відкрити.');
    expect(host.querySelector('[data-copy-prompt]')).toBeNull();
    expect(localStorage.getItem(DIARY_KEY)).toBe(BROKEN);
  });

  it('«зберегти як файл» hands over what is stored, untouched', () => {
    click('[data-save-file]');
    expect(device.saved).toEqual([{ name: 'trekr-nechytani-zapysy-2026-11-09.json', text: BROKEN }]);
    expect(toastSays()).toBe('✓ збережено');
    expect(localStorage.getItem(DIARY_KEY)).toBe(BROKEN);
  });

  it('says so when the phone refuses the file', () => {
    device.saveWorks = false;
    click('[data-save-file]');
    expect(toastSays()).toBe('не вдалося зберегти файл >_<');
  });

  it('«відновити з копії» brings a copy in and keeps the unread entry aside', async () => {
    await restoreFile(COPY_081);
    expect(heading()).toBe('головна');
    expect(Object.keys(stored()!.days)).toEqual(['2026-11-07']);
    expect(localStorage.getItem(`${DIARY_KEY}/unreadable`)).toBe(BROKEN);
  });

  it('a file that is not a copy changes nothing', async () => {
    await restoreFile('не копія');
    expect(heading()).toBe('не вдалося прочитати щоденник');
    expect(localStorage.getItem(DIARY_KEY)).toBe(BROKEN);
  });

  it('«почати заново» opens the first screen and touches nothing until something is saved', () => {
    click('[data-start-over]');
    expect(heading()).toBe('привіт! почнімо з налаштувань :)');
    expect(localStorage.getItem(DIARY_KEY)).toBe(BROKEN);
    click('[data-start-without-ai]');
    expect(heading()).toBe('головна');
    expect(localStorage.getItem(`${DIARY_KEY}/unreadable`)).toBe(BROKEN);
  });

  it('shows the same screen again next time when nothing was saved', () => {
    click('[data-start-over]');
    start();
    expect(heading()).toBe('не вдалося прочитати щоденник');
  });

  it('comes first even on a phone in the browser', () => {
    start({ platform: 'iphone', installed: false });
    expect(heading()).toBe('не вдалося прочитати щоденник');
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
    expect(host.querySelector('.date-nav__date [aria-hidden]')!.textContent).toBe('пн 09.11');
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
