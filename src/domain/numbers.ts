import { englishPlural, lang, t } from '../i18n/lang';
/* Numbers as people type and read them: «2,5» in Ukrainian, «2.5» in English; both are read either way. */

/** What a number field holds: nothing, a number, or text that isn't one (and why). */
export type NumberRead =
  | { readonly kind: 'empty' }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'negative' | 'not-a-number' };

/** Digits with at most one decimal part: «12», «1.5», «.5», «5.». */
const DIGITS = /^(?:\d+\.?\d*|\.\d+)$/;
const MINUS = /^[-−–—]/;

/**
 * Reads what the person typed (D-01, Olesia 2026-11-14): «10 000» with any
 * kind of space is 10000, «1.5» and «1,5» are the same; a number below zero
 * and any text are not accepted, and nothing is guessed from them.
 */
export function readNumber(input: string): NumberRead {
  const typed = input.replace(/\s/g, '').replace(',', '.');
  if (typed === '') return { kind: 'empty' };
  if (DIGITS.test(typed)) {
    const value = Number(typed);
    return Number.isFinite(value) ? { kind: 'number', value } : { kind: 'not-a-number' };
  }
  return { kind: MINUS.test(typed) && DIGITS.test(typed.replace(MINUS, '')) ? 'negative' : 'not-a-number' };
}

/** What the person typed, or null when it isn't a number (an empty field too). */
export function parseNumber(input: string): number | null {
  const read = readNumber(input);
  return read.kind === 'number' ? read.value : null;
}

/* COPY.md, «Drafts from MY-FIXES» (D-01): small text under the field. */
export const NUMBER_ERRORS: Record<'negative' | 'not-a-number', string> = {
  negative: t('число не може бути відʼємним'),
  'not-a-number': t('тут потрібне число, наприклад 10 або 1,5'),
};

/** «2,5», at most two decimals; an empty string for no number. */
export function formatNumber(value: number | null): string {
  if (value === null) return '';
  const shown = String(Math.round(value * 100) / 100);
  return lang() === 'en' ? shown : shown.replace('.', ',');
}

/** The word for a count: [1, 2–4, 5+] («коло, кола, кіл»); 11–14 take the third. In English: 1 or the rest (i18n/en.ts). */
export function plural(n: number, [one, few, many]: readonly [string, string, string]): string {
  const english = lang() === 'en' ? englishPlural(one) : undefined;
  if (english) return Math.abs(n) === 1 ? english[0] : english[1];
  const lastTwo = Math.abs(n) % 100;
  const last = lastTwo % 10;
  if (lastTwo > 10 && lastTwo < 15) return many;
  if (last === 1) return one;
  return last >= 2 && last <= 4 ? few : many;
}

const TIMES = ['раз', 'рази', 'разів'] as const;

/** A warm-up count as Figma's «n разів»: «10 разів», «8–12 разів»; other text as it was written. */
export function countLabel(reps: string): string {
  const range = /^\d+(?:\s*[–-]\s*(\d+))?$/.exec(reps.trim());
  if (!range) return reps;
  const last = Number(range[1] ?? reps.trim());
  return `${reps.trim()} ${plural(last, TIMES)}`;
}
