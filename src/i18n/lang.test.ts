import { afterEach, describe, expect, it, vi } from 'vitest';
import schema from '../format/profile.schema.json';
import { EN, EN_PLURALS } from './en';
import { keepLangWith, LANG_KEY, lang, pickLang, switchLang, t, useLang } from './lang';
import { formatNumber, plural } from '../domain/numbers';
import { LANGUAGE_SWITCH, wireLanguageSwitch } from '../screens/parts';

/*
 * The English interface (Olesia, 2026-11-19): the Ukrainian text in the code
 * is the key, en.ts holds its English line. These tests keep the two in step.
 */

const code = import.meta.glob<string>(['../**/*.ts', '!../**/*.test.ts', '!../i18n/**', '!../components-page.ts', '!../app/test-env.ts'], { query: '?raw', import: 'default', eager: true });

/** Every literal key: `t('…')` with a plain quoted string. */
function keysInCode(): Map<string, string> {
  const keys = new Map<string, string>();
  for (const [path, text] of Object.entries(code)) {
    for (const found of text.matchAll(/\bt\(('(?:[^'\\]|\\.)*')/g)) {
      const key = (0, eval)(found[1]!) as string;
      if (!keys.has(key)) keys.set(key, path);
    }
  }
  return keys;
}

/** Titles and pattern hints of the settings schema: shown in the paste messages. */
function schemaTexts(): Set<string> {
  const texts = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if (typeof record.title === 'string') texts.add(record.title);
      if (typeof record['x-pattern-hint'] === 'string') texts.add(record['x-pattern-hint']);
      Object.values(record).forEach(walk);
    }
  };
  walk(schema);
  return texts;
}

const CYRILLIC = /[а-яіїєґʼ]/i;

afterEach(() => useLang('uk'));

describe('the English dictionary', () => {
  it('has a line for every text in the code', () => {
    const missing = [...keysInCode()].filter(([key]) => !(key in EN)).map(([key, path]) => `${path}: ${key}`);
    expect(missing).toEqual([]);
  });

  it('has a line for every schema title and hint', () => {
    expect([...schemaTexts()].filter((text) => !(text in EN))).toEqual([]);
  });

  it('keeps no line nobody uses', () => {
    const used = new Set([...keysInCode().keys(), ...schemaTexts()]);
    expect(Object.keys(EN).filter((key) => !used.has(key))).toEqual([]);
  });

  it('is English: no Ukrainian letters, the same {placeholders}', () => {
    const wrong = Object.entries(EN).filter(([uk, en]) => {
      const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
      return CYRILLIC.test(en) || names(uk) !== names(en);
    });
    expect(wrong).toEqual([]);
  });

  it('keeps the emoticons of a line', () => {
    const emoticons = (text: string) => (text.match(/(?:<3|>_<|:\(|:\)|:3)/g) ?? []).join();
    expect(Object.entries(EN).filter(([uk, en]) => emoticons(uk) !== emoticons(en))).toEqual([]);
  });

  it('has an English pair for every count word in the code', () => {
    const firsts = new Set<string>();
    for (const text of Object.values(code)) {
      for (const found of text.matchAll(/\[\s*'([^']+)',\s*'[^']+',\s*'[^']+'\s*\]/g)) {
        if (CYRILLIC.test(found[1]!)) firsts.add(found[1]!);
      }
    }
    expect([...firsts].filter((word) => !(word in EN_PLURALS))).toEqual([]);
  });
});

describe('t', () => {
  it('gives Ukrainian by default and English when the page is English', () => {
    expect(t('зберегти')).toBe('зберегти');
    useLang('en');
    expect(t('зберегти')).toBe('save');
  });

  it('fills {placeholders} in both languages', () => {
    expect(t('видалити «{name}»?', { name: 'присід' })).toBe('видалити «присід»?');
    useLang('en');
    expect(t('видалити «{name}»?', { name: 'squat' })).toBe('delete “squat”?');
  });

  it('leaves a line it has no English for as it is', () => {
    useLang('en');
    expect(t('рядок, якого немає')).toBe('рядок, якого немає');
  });
});

describe('numbers in English', () => {
  it('counts with one or the rest', () => {
    useLang('en');
    expect(plural(1, ['день', 'дні', 'днів'])).toBe('day');
    expect(plural(3, ['день', 'дні', 'днів'])).toBe('days');
    expect(plural(11, ['день', 'дні', 'днів'])).toBe('days');
    expect(plural(21, ['день', 'дні', 'днів'])).toBe('days');
  });

  it('writes a decimal point, Ukrainian a comma', () => {
    expect(formatNumber(2.5)).toBe('2,5');
    useLang('en');
    expect(formatNumber(2.5)).toBe('2.5');
  });
});

describe('pickLang', () => {
  const saved = (value: string | null) => ({ getItem: (key: string) => (key === LANG_KEY ? value : null) });

  it('takes the link first, then the saved choice, then Ukrainian', () => {
    expect(pickLang('?lang=en', saved('uk'))).toBe('en');
    expect(pickLang('', saved('en'))).toBe('en');
    expect(pickLang('', saved(null), saved('en'))).toBe('en');
    expect(pickLang('', saved(null))).toBe('uk');
    expect(pickLang('?lang=ru', saved('ru'))).toBe('uk');
  });

  it('is Ukrainian when the storage refuses', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); } };
    expect(pickLang('', blocked)).toBe('uk');
  });
});

describe('the language switch', () => {
  function mounted(): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = LANGUAGE_SWITCH;
    wireLanguageSwitch(host);
    return host;
  }

  it('marks the language on now', () => {
    const host = mounted();
    expect(lang()).toBe('uk');
    expect(host.querySelector('[data-lang="uk"]')!.getAttribute('aria-current')).toBe('true');
    expect(host.querySelector('[data-lang="en"]')!.getAttribute('aria-current')).toBe('false');
    expect(host.querySelector('[data-lang="en"]')!.getAttribute('lang')).toBe('en');
  });

  it('keeps the other language when tapped, and nothing for the same one', () => {
    const keep = vi.fn();
    keepLangWith(keep);
    const host = mounted();
    host.querySelector<HTMLElement>('[data-lang="uk"]')!.click();
    expect(keep).not.toHaveBeenCalled();
    host.querySelector<HTMLElement>('[data-lang="en"]')!.click();
    expect(keep).toHaveBeenCalledWith('en');
    switchLang('uk');
    expect(keep).toHaveBeenCalledTimes(1);
  });
});
