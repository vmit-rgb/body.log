import { EN, EN_PLURALS } from './en';

/*
 * The interface language: Ukrainian or English (Olesia, 2026-11-19).
 * The texts in the code are Ukrainian; `t()` swaps one for its English line
 * in `en.ts`. The language is fixed for the whole page: a switch saves the
 * choice and loads the page again, so texts built once at start follow it.
 */

export type Lang = 'uk' | 'en';

/** Where the choice is kept. Not in the diary: the language belongs to the phone, like the theme. */
export const LANG_KEY = 'phys-activity-tracking-app/lang';

interface Reader {
  getItem(key: string): string | null;
}

/** `?lang=en` in the link wins (for the landing page later), then the saved choice, then Ukrainian. */
export function pickLang(search: string, ...storages: readonly (Reader | undefined)[]): Lang {
  const asked = new URLSearchParams(search).get('lang');
  if (asked === 'en' || asked === 'uk') return asked;
  for (const storage of storages) {
    try {
      const saved = storage?.getItem(LANG_KEY);
      if (saved === 'en' || saved === 'uk') return saved;
    } catch {
      // storage blocked: Ukrainian
    }
  }
  return 'uk';
}

function startLang(): Lang {
  if (typeof location === 'undefined') return 'uk';
  const get = (name: 'localStorage' | 'sessionStorage'): Reader | undefined => {
    try {
      return globalThis[name];
    } catch {
      return undefined;
    }
  };
  // a browser tab keeps its things in sessionStorage, the installed app in localStorage (storage/store.ts)
  return pickLang(location.search, get('sessionStorage'), get('localStorage'));
}

let current: Lang = startLang();

export function lang(): Lang {
  return current;
}

/** For tests only: the page itself changes language by loading again. */
export function useLang(next: Lang): void {
  current = next;
}

let keep: ((next: Lang) => void) | undefined;

/** main.ts says how a choice is kept: saved where the app keeps its things, then the page loads again. */
export function keepLangWith(save: (next: Lang) => void): void {
  keep = save;
}

/** The language switch: nothing happens for the language already on. */
export function switchLang(next: Lang): void {
  if (next !== current) keep?.(next);
}

/** `{name}` in a line gets its value. */
function fill(text: string, values?: Readonly<Record<string, string | number>>): string {
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in values ? String(values[name]) : all));
}

/**
 * The line in the current language. The Ukrainian text is the key; a line
 * missing from `en.ts` stays Ukrainian (a test lists every one).
 */
export function t(uk: string, values?: Readonly<Record<string, string | number>>): string {
  return fill(current === 'en' ? (EN[uk] ?? uk) : uk, values);
}

/** The English pair for a Ukrainian [1, 2–4, 5+] triple, keyed by its first word. */
export function englishPlural(one: string): readonly [string, string] | undefined {
  return EN_PLURALS[one];
}
