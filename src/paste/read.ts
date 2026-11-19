import type { JsonObject } from '../domain/diary';
import { checkProfile, MAX_PASTE_BYTES, PROFILE_FORMAT, PROFILE_SCHEMA } from '../format/profile-check';
import type { Path } from '../format/schema';
import { cleanPaste } from './clean';
import { issueLine, sectionName, unknownLine, type Line } from './messages';
import { russianReason } from './russian';
import { t } from '../i18n/lang';

/*
 * «застосувати»: from the pasted text to settings that can be kept, or to
 * a refusal in plain words with a text to copy for the AI (brief, How it
 * works, step 5; PROFILE-FORMAT.md «Paste»). Order: size, cleaning, is it
 * settings at all, russian, the whole of it (a part is refused), the
 * strict check, unknown keys.
 *
 * Texts: COPY.md «Pasting settings» where it has them, else Нитка's
 * drafts. Lowercase for the person; the text for the AI is written as a
 * message to a model.
 */

export interface Refusal {
  readonly kind: 'refused';
  readonly reason: 'tooLong' | 'notJson' | 'truncated' | 'backup' | 'notSettings' | 'russian' | 'partial' | 'errors';
  readonly title: string;
  /** No emoticon, plain colour: health, russian (COPY.md rules). */
  readonly serious: boolean;
  readonly lines: readonly string[];
  /** Under the lines: what to do. */
  readonly hint: string;
  /** What «скопіювати для ШІ» copies; null when the AI can't help (not its answer at all). */
  readonly forAi: string | null;
}

export interface Accepted {
  readonly kind: 'accepted';
  /** The settings without the unknown keys, `reps` as text. */
  readonly profile: JsonObject;
  /** Keys the app doesn't know and will not keep; empty when there are none. */
  readonly unknown: readonly string[];
  /** What «скопіювати для ШІ, щоб виправити» copies; null without unknown keys. */
  readonly forAi: string | null;
  /** Whether the paste itself carries «доступність». */
  readonly hasAccessibility: boolean;
}

export type PasteRead = Refusal | Accepted;

/** How many findings the screen lists; the text for the AI carries up to `AI_LINES`. */
export const SHOWN_LINES = 8;
const AI_LINES = 40;

const AGAIN = t('Надішли весь JSON заново, повністю, одним блоком коду, без пояснень навколо.');

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);
const numbered = (lines: readonly string[]) => lines.map((line, i) => `${i + 1}. ${line}`).join('\n');

function capped(lines: readonly string[], max: number): string[] {
  return lines.length > max ? [...lines.slice(0, max), t('і ще {n}', { n: lines.length - max })] : [...lines];
}

function refusal(reason: Refusal['reason'], title: string, parts: Partial<Omit<Refusal, 'kind' | 'reason' | 'title'>>): Refusal {
  return { kind: 'refused', reason, title, serious: false, lines: [], hint: '', forAi: null, ...parts };
}

const NOT_JSON = refusal('notJson', `${t('це не схоже на налаштування')} >_<`, {
  hint: t('скопіюй усю відповідь ШІ, разом із фігурними дужками { }.'),
});

const TRUNCATED = refusal('truncated', `${t('схоже, відповідь ШІ обірвалася')} >_<`, {
  hint: t('у тексті немає закривної дужки }. скопіюй відповідь повністю або попроси ШІ надіслати її ще раз.'),
  forAi: `${t('Застосунок не прийняв налаштування: JSON обірваний, немає закривної дужки.')} ${AGAIN}`,
});

const TOO_LONG = refusal('tooLong', `${t('текст завеликий')} >_<`, {
  hint: t('налаштування мають вміщатися у 200 КБ. попроси свій ШІ скоротити: менше вправ і коротші описи.'),
  forAi: `${t('Застосунок не прийняв налаштування: текст більший за 200 КБ. Скороти: лиши необхідний мінімум вправ і коротші описи.')} ${AGAIN}`,
});

const BACKUP = refusal('backup', t('це копія щоденника, а не налаштування від ШІ'), {
  hint: t('копію відновлює кнопка «відновити з копії».'),
});

const NOT_SETTINGS = refusal('notSettings', `${t('це не схоже на налаштування для body.log')} >_<`, {
  hint: t('скопіюй усю відповідь ШІ. якщо це вона і є — попроси його написати налаштування за форматом із промпту.'),
  forAi: `${t('Застосунок не прийняв відповідь: це не налаштування у форматі з промпту (немає')} "format": "${PROFILE_FORMAT}"). ${AGAIN}`,
});

const RUSSIAN = refusal('russian', t('налаштування російською мовою не приймаються.'), {
  serious: true,
  hint: t('попроси свій ШІ написати їх українською або англійською.'),
  forAi: `${t('Застосунок не приймає налаштування російською мовою. Перепиши всі тексти українською або англійською, як обрала людина (розмовляти з нею можна й далі її мовою), і вкажи відповідний')} "lang". ${AGAIN}`,
});

/** The top-level sections the format needs; a paste without some of them is a part, not the whole. */
function missingSections(value: JsonObject): string[] {
  return (PROFILE_SCHEMA.required ?? []).filter((key) => key !== 'format' && key !== 'version' && !(key in value));
}

function partial(missing: readonly string[]): Refusal {
  const names = missing.map(sectionName).join(', ');
  return refusal('partial', t('це лише частина налаштувань'), {
    lines: [`${t('бракує розділів:')} ${names}`],
    hint: t('застосунок приймає тільки повні налаштування. попроси свій ШІ надіслати все повністю, а не лише те, що змінилося.'),
    forAi: `${t('Застосунок приймає тільки повні налаштування, а не частину. Бракує розділів:')} ${names}${t('. Надішли весь JSON повністю: усі розділи, також ті, що не змінювалися, одним блоком коду, без пояснень навколо.')}`,
  });
}

function errors(lines: readonly Line[]): Refusal {
  return refusal('errors', `${t('щось не так у налаштуваннях')} >_<`, {
    lines: capped(lines.map((line) => line.text), SHOWN_LINES),
    hint: t('встав це своєму ШІ — він виправить.'),
    forAi: `${t('Застосунок не прийняв налаштування. Що треба виправити:\n')}${numbered(capped(lines.map((line) => line.forAi), AI_LINES))}${t('\n\nВиправ це й нічого іншого не міняй.')} ${AGAIN}`,
  });
}

/** The value without the keys at `paths` (each path ends with the key to drop). */
function without(value: unknown, paths: readonly Path[]): unknown {
  const copy = structuredClone(value);
  for (const path of paths) {
    const owner = path.slice(0, -1).reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], copy);
    delete (owner as Record<string | number, unknown>)[path.at(-1)!];
  }
  return copy;
}

/** `reps` given as a number is kept as text (PROFILE-FORMAT.md). */
function withTextReps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withTextReps);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) =>
    [key, key === 'reps' && typeof entry === 'number' ? String(entry) : withTextReps(entry)]));
}

function unknownForAi(lines: readonly Line[]): string {
  return `${t('Застосунок не знає цих полів і не збереже їх:\n')}${numbered(capped(lines.map((line) => line.forAi), AI_LINES))}${t('\n\nПрибери їх, а якщо в них було щось потрібне — перенеси це в поля, які є у форматі з промпту. Решту не міняй.')} ${AGAIN}`;
}

export function readPaste(text: string): PasteRead {
  if (new TextEncoder().encode(text).length > MAX_PASTE_BYTES) return TOO_LONG;
  const cleaned = cleanPaste(text);
  if (cleaned.kind !== 'value') return cleaned.kind === 'truncated' ? TRUNCATED : NOT_JSON;
  const { value } = cleaned;
  if (!isObject(value)) return NOT_JSON;
  if (value.format === 'phys-activity-backup') return BACKUP;
  if (value.format !== PROFILE_FORMAT) return NOT_SETTINGS;
  if (russianReason(value)) return RUSSIAN;
  const missing = missingSections(value);
  if (missing.length) return partial(missing);
  const checked = checkProfile(value);
  if (checked.issues.length) return errors(checked.issues.map((issue) => issueLine(issue, value)));
  const unknown = checked.unknown.map((path) => unknownLine(path, value));
  return {
    kind: 'accepted',
    profile: withTextReps(without(value, checked.unknown)) as JsonObject,
    unknown: capped(unknown.map((line) => line.text), SHOWN_LINES),
    forAi: unknown.length ? unknownForAi(unknown) : null,
    hasAccessibility: isObject(value.accessibility),
  };
}
