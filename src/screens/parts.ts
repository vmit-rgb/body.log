import type { Phone } from '../app/start';
import { VERSION_LABEL } from '../version';
import { lang, switchLang, t, type Lang } from '../i18n/lang';

/* Pieces shared by the screens. Every text here is static: nothing the person typed goes into HTML. */

/** One language of the switch: each name in its own language, the current one marked. */
const langButton = (code: Lang, name: string) =>
  `<button type="button" class="ctl btn btn--tertiary" lang="${code}" data-lang="${code}" aria-current="${lang() === code}">${name}</button>`;

/** UA/EN switch (Olesia, 2026-11-08); works since 2026-11-19: the page loads again in the other language. */
export const LANGUAGE_SWITCH = `
  <nav class="lang" aria-label="${t('мова')}">
    ${langButton('uk', 'укр')}
    <span class="lang__slash" aria-hidden="true">/</span>
    ${langButton('en', 'eng')}
  </nav>`;

/** A tap on the other language saves it and loads the page again (i18n/lang.ts). */
export function wireLanguageSwitch(host: ParentNode): void {
  host.querySelector('.lang')?.addEventListener('click', (event) => {
    const code = (event.target as Element).closest<HTMLElement>('[data-lang]')?.dataset.lang;
    if (code === 'uk' || code === 'en') switchLang(code);
  });
}

/** layout/footer (113:4801); two lines and no surname since 2026-11-18 (Olesia). */
export const FOOTER = `
  <footer class="footer t-3rd-regular">
    <p class="muted">${VERSION_LABEL}</p>
    <p class="muted">${t('© 2026 (Олеся + Нитка / AI) · усі права захищено')}</p>
  </footer>`;

/**
 * A-04 (Olesia, 2026-11-14): in a browser tab the app keeps nothing after the
 * tab is closed (storage/store.ts, `storageFor`), and the screen must say so.
 */
export const TAB_NOTE = `
  <div class="tab-note t-2nd-bold" role="note">
    <p>${t('це вкладка браузера: закриєш її — і записи зникнуть. встанови застосунок, щоб вони лишилися.')}</p>
    <button type="button" class="ctl btn btn--tertiary tab-note__how" aria-haspopup="dialog" data-install-how>${t('як?')}</button>
  </div>`;

/** How to install, per phone: the landing page's steps (screen install-first, the «як?» of the tab note). */
const INSTALL_STEPS: Record<Phone, readonly string[]> = {
  android: [
    t('відкрий цю сторінку в chrome.'),
    t('меню ⋮ → «встановити застосунок».'),
    t('відкрий застосунок з головного екрана. налаштовуй уже в ньому.'),
  ],
  iphone: [
    t('відкрий цю сторінку в safari.'),
    t('«поділитися» → «на початковий екран».'),
    t('відкрий застосунок з головного екрана. налаштовуй уже в ньому, не в safari: у них окремі сховища.'),
  ],
};

/**
 * Under the steps (Olesia, 2026-11-19): the browsers to use, a soft warning about
 * the others, and that menu labels differ. Chrome 150 renamed its Android item
 * (press, July 2026); iOS 16.4+ lets Chrome, Firefox and Edge add to the home screen.
 */
export const INSTALL_NOTES: Record<Phone, string> = {
  android: t('краще встановлювати з chrome. з firefox і з samsung internet на телефонах samsung теж має вийти, а з інших браузерів може не встановитися. назва пункту в меню залежить від версії браузера: шукай «встановити» або «на головний екран».'),
  iphone: t('краще встановлювати з safari. на нових айфонах так само можна з chrome, firefox чи edge: «поділитися» → «на початковий екран». з інших браузерів може не вийти. назви пунктів залежать від версії системи.'),
};

/** The platform toggles in `host` fill its `[data-steps]` list and `[data-steps-note]`; starts on `phone`. */
export function wireInstallSteps(host: HTMLElement, phone: Phone): void {
  const steps = part<HTMLOListElement>(host, '[data-steps]');
  const note = part<HTMLElement>(host, '[data-steps-note]');
  const choose = wirePlatformToggles(host, (chosen) => {
    steps.replaceChildren(...INSTALL_STEPS[chosen].map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
    note.textContent = INSTALL_NOTES[chosen];
  });
  choose(phone);
}

export const PHONE_NAMES: Record<Phone, string> = {
  android: t('андроїд'),
  iphone: t('айфон'),
};

/** tabs/platform: two toggles, one per phone (only on the install screen since wave 7a). */
export function platformToggles(): string {
  const toggle = (platform: Phone) =>
    `<button type="button" class="ctl tab" aria-pressed="false" data-platform="${platform}">${PHONE_NAMES[platform]}</button>`;
  return `<div class="segmented" role="group" aria-label="${t('твій телефон')}">${toggle('android')}${toggle('iphone')}</div>`;
}

/** Marks the chosen phone and calls back on every choice. */
export function wirePlatformToggles(host: HTMLElement, onChoose: (phone: Phone) => void): (phone: Phone) => void {
  const toggles = [...host.querySelectorAll<HTMLButtonElement>('[data-platform]')];
  const choose = (phone: Phone) => {
    for (const toggle of toggles) toggle.setAttribute('aria-pressed', String(toggle.dataset.platform === phone));
    onChoose(phone);
  };
  for (const toggle of toggles) {
    toggle.addEventListener('click', () => choose(toggle.dataset.platform === 'iphone' ? 'iphone' : 'android'));
  }
  return choose;
}

/** Finds an element the screen's own markup must have. */
export function part<T extends Element>(host: ParentNode, selector: string): T {
  const element = host.querySelector<T>(selector);
  if (!element) throw new Error(`screen part missing: ${selector}`);
  return element;
}

/** «відновити з копії» (`[data-restore]`) opens the phone's file picker (`[data-restore-file]`); the chosen file goes to `restore`. */
export function wireRestore(host: ParentNode, restore: (file: File) => void): void {
  const file = part<HTMLInputElement>(host, '[data-restore-file]');
  part(host, '[data-restore]').addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const picked = file.files?.[0];
    file.value = '';
    if (picked) restore(picked);
  });
}
