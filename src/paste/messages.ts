import { PROFILE_SCHEMA, type ProfileIssue } from '../format/profile-check';
import { schemaAt, type JsonType, type Path } from '../format/schema';

/*
 * The strict check's findings in plain words, with the name of the field
 * as the person sees it in the app (the schema's titles) and the key as
 * the AI wrote it. Texts: Нитка's drafts on COPY.md «Pasting settings».
 */

/** Lists whose name adds nothing before «рівень 2», «вправа 1». */
const SILENT_LISTS: readonly (string | number)[] = ['levels', 'groups', 'sessions', 'kinds', 'items'];

const at = (value: unknown, path: Path): unknown =>
  path.reduce<unknown>((node, key) => (typeof node === 'object' && node !== null ? (node as Record<string | number, unknown>)[key] : undefined), value);

/** «ранкова розминка → рівень 2 «легкий день» → вправа 1 → скільки разів». */
export function where(profile: unknown, path: Path): string {
  const parts: string[] = [];
  path.forEach((key, i) => {
    const here = path.slice(0, i + 1);
    const title = schemaAt(PROFILE_SCHEMA, profile, here)?.title;
    if (typeof key === 'number') {
      const name = (at(profile, here) as { name?: unknown } | undefined)?.name;
      parts.push(`${title ?? 'запис'} ${key + 1}${typeof name === 'string' && name !== '' ? ` «${name}»` : ''}`);
    } else if (!(SILENT_LISTS.includes(key) && typeof path[i + 1] === 'number')) {
      parts.push(title ?? `"${key}"`);
    }
  });
  return parts.join(' → ');
}

/** `morningWarmup.levels[1].items[0].reps`, for the AI. */
export const jsonPath = (path: Path): string =>
  path.map((key, i) => (typeof key === 'number' ? `[${key}]` : `${i ? '.' : ''}${key}`)).join('');

const TYPE_WORDS: Record<JsonType, string> = {
  string: 'текстом у лапках',
  integer: 'цілим числом',
  number: 'числом',
  boolean: 'true або false',
  array: 'списком у квадратних дужках [ ]',
  object: 'блоком у фігурних дужках { }',
  null: 'null',
};

const quoted = (value: unknown) => JSON.stringify(value);

function what(issue: ProfileIssue, profile: unknown): string {
  switch (issue.kind) {
    case 'required': {
      const title = schemaAt(PROFILE_SCHEMA, profile, [...issue.path, issue.key])?.title;
      return `немає поля "${issue.key}"${title ? ` (${title})` : ''}`;
    }
    case 'type': return `має бути ${issue.expected.map((type) => TYPE_WORDS[type]).join(' або ')}`;
    case 'enum': return issue.allowed.length === 1 ? `має бути ${quoted(issue.allowed[0])}` : `має бути одним із: ${issue.allowed.map(quoted).join(', ')}`;
    case 'minLength': return 'не може бути порожнім';
    case 'maxLength': return `задовгий текст: символів ${issue.actual}, можна до ${issue.limit}`;
    case 'minimum': return `${issue.actual} — замало, найменше ${issue.limit}`;
    case 'maximum': return `${issue.actual} — забагато, найбільше ${issue.limit}`;
    case 'minItems': return `замало записів: ${issue.actual}, треба щонайменше ${issue.limit}`;
    case 'maxItems': return `забагато записів: ${issue.actual}, можна до ${issue.limit}`;
    case 'pattern': return issue.hint || 'записано не так, як треба';
    case 'unique': return 'значення не мають повторюватися';
    case 'duplicateId': return `id "${issue.id}" повторюється. у кожного запису свій id`;
    case 'missingExercise': return `вправи з id "${issue.id}" немає в каталозі вправ ("exercises"). додай її туди або виправ id`;
    case 'minNotBelowMax': return '"min" має бути менше за "max"';
  }
}

export interface Line {
  /** For the person. */
  readonly text: string;
  /** The same with the exact place in the JSON, for the AI. */
  readonly forAi: string;
}

export function issueLine(issue: ProfileIssue, profile: unknown): Line {
  const place = where(profile, issue.path);
  const text = `${place ? `${place}: ` : ''}${what(issue, profile)}`;
  return { text, forAi: issue.path.length ? `${text} [${jsonPath(issue.path)}]` : text };
}

/** A key the app doesn't know: «тренування → тренування 1 «а» → вправа 1 → "side"». */
export function unknownLine(path: Path, profile: unknown): Line {
  const text = where(profile, path);
  return { text, forAi: `${text} [${jsonPath(path)}]` };
}

/** The name of a top-level section with its key: «тренування ("workout")». */
export function sectionName(key: string): string {
  const title = PROFILE_SCHEMA.properties?.[key]?.title;
  return title ? `${title} ("${key}")` : `"${key}"`;
}
