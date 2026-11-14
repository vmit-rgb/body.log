/*
 * The russian check (D-05; brief, gap 7; PROFILE-FORMAT.md): settings in
 * russian are refused, on paste and on restore from a copy.
 * - `lang` that says russian is refused whatever the texts are;
 * - the letters ы э ъ ё count only when `lang` is uk, en or missing:
 *   Belarusian, Bulgarian and other Cyrillic languages use them too and
 *   are accepted, so with another `lang` the code alone decides.
 * This catches most cases, not all (russian text without these letters
 * under `lang: uk` passes).
 */

export type RussianReason = 'lang' | 'letters';

const RUSSIAN_ONLY_LETTERS = /[ыэъё]/i;
/** Languages whose texts must not hold the letters above. */
const CHECKED_LANGS: readonly string[] = ['uk', 'ukr', 'en', 'eng'];

/** «ru-RU» → «ru»; undefined when there is no usable code. */
function baseLang(lang: unknown): string | undefined {
  if (typeof lang !== 'string') return undefined;
  return lang.trim().toLowerCase().split(/[-_]/)[0] || undefined;
}

function hasLetters(value: unknown): boolean {
  if (typeof value === 'string') return RUSSIAN_ONLY_LETTERS.test(value);
  if (Array.isArray(value)) return value.some(hasLetters);
  if (typeof value === 'object' && value !== null) return Object.values(value).some(hasLetters);
  return false;
}

/** Why these settings count as russian; null when they don't. */
export function russianReason(profile: { readonly [key: string]: unknown }): RussianReason | null {
  const lang = baseLang(profile.lang);
  if (lang === 'ru' || lang === 'rus') return 'lang';
  if (lang !== undefined && !CHECKED_LANGS.includes(lang)) return null;
  return hasLetters(profile) ? 'letters' : null;
}
