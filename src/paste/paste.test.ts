import { describe, expect, it } from 'vitest';
import example from '../format/example-profile.json';
import { cleanPaste } from './clean';
import { describeChanges, GROUP_LINES, changesNothing, type PreviewNames } from './preview';
import { readPaste, SHOWN_LINES, type Accepted, type Refusal } from './read';
import { russianReason } from './russian';

// Invented data only.
type Obj = Record<string, unknown>;

const JSON_TEXT = JSON.stringify(example, null, 2);
const copyOf = (): Obj => structuredClone(example) as Obj;
const withAt = (path: string, value: unknown): Obj => {
  const copy = copyOf();
  const keys = path.split('.');
  const last = keys.pop()!;
  const owner = keys.reduce<Obj>((node, key) => node[key] as Obj, copy);
  if (value === undefined) delete owner[last];
  else owner[last] = value;
  return copy;
};
const read = (value: unknown) => readPaste(typeof value === 'string' ? value : JSON.stringify(value));
const refused = (value: unknown) => read(value) as Refusal;
const accepted = (value: unknown) => read(value) as Accepted;

describe('cleanPaste: the usual slips of an AI', () => {
  const value = (text: string) => {
    const cleaned = cleanPaste(text);
    return cleaned.kind === 'value' ? cleaned.value : cleaned.kind;
  };

  it('reads plain JSON', () => {
    expect(value('{"a": [1, {"b": "в"}]}')).toEqual({ a: [1, { b: 'в' }] });
  });

  it('takes the settings out of a ``` block and out of the words around', () => {
    expect(value('Ось твої налаштування:\n```json\n{"a": 1}\n```\nГотово! Встав їх у застосунок.')).toEqual({ a: 1 });
    expect(value('Ось: {"a": 1} — це все.')).toEqual({ a: 1 });
    expect(value('```\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('prefers the block to braces in the words before it', () => {
    expect(value('Формат {як домовлялись}:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    // the first block is not JSON, the second is
    expect(value('```\nnpm run {x}\n```\n```json\n{"a": 2}\n```')).toEqual({ a: 2 });
  });

  it('turns typographic quotes that stand for " into ", and leaves the ones inside a text', () => {
    expect(value('{“a”: “текст”, „b”: 1}')).toEqual({ a: 'текст', b: 1 });
    expect(value('{"a": "сказала “привіт” і «па»"}')).toEqual({ a: 'сказала “привіт” і «па»' });
    expect(value('{“a”: “дюйм 5" тут”}')).toEqual({ a: 'дюйм 5" тут' });
  });

  it('drops commas before a closing brace, comments and odd spaces', () => {
    expect(value('{"a": [1, 2,], "b": {"c": 1,},}')).toEqual({ a: [1, 2], b: { c: 1 } });
    expect(value('{\n  // коментар\n  "a": 1, /* ще */ "b": "http://x.y//z"\n}')).toEqual({ a: 1, b: 'http://x.y//z' });
    expect(value('{ "a": 1,​"b": "з пробілом"}')).toEqual({ a: 1, b: 'з пробілом' });
  });

  it('keeps escapes and repairs a line break inside a text', () => {
    expect(value('{"a": "лапка \\" і \\\\ коса", "b": "два\nрядки"}')).toEqual({ a: 'лапка " і \\ коса', b: 'два\nрядки' });
  });

  it('says when there is nothing like JSON, and when the answer was cut off', () => {
    expect(value('привіт, ось твої вправи')).toBe('notJson');
    expect(value('')).toBe('notJson');
    expect(value('{ "a": 1 "b" }')).toBe('notJson');
    expect(value('{"a": {"b": 1}')).toBe('truncated');
    expect(value('{"a": "обірваний текст')).toBe('truncated');
    expect(value('```json\n{"a": [1, 2')).toBe('truncated');
  });
});

describe('russianReason (D-05)', () => {
  it('refuses a russian `lang` whatever the texts are', () => {
    expect(russianReason({ lang: 'ru' })).toBe('lang');
    expect(russianReason({ lang: 'ru-RU' })).toBe('lang');
    expect(russianReason({ lang: ' RU_ru ' })).toBe('lang');
    expect(russianReason({ lang: 'rus' })).toBe('lang');
  });

  it.each(['uk', 'uk-UA', 'en', 'EN-gb', undefined, '', 5])('counts the letters ы э ъ ё when `lang` is %j', (lang) => {
    expect(russianReason({ lang, exercises: [{ name: 'вправа' }] })).toBeNull();
    expect(russianReason({ lang, exercises: [{ name: 'подъём' }] })).toBe('letters');
    expect(russianReason({ lang, trackers: [{ hint: 'Это боль' }] })).toBe('letters');
    expect(russianReason({ lang, encouragement: ['ты молодец', 'всё'] })).toBe('letters');
  });

  it.each(['be', 'bg', 'kk', 'mk', 'sr', 'pl'])('accepts another language with these letters: %s', (lang) => {
    expect(russianReason({ lang, exercises: [{ name: 'прысяданні', how: 'гэта ъ ё' }] })).toBeNull();
  });

  it('does not take Ukrainian for russian', () => {
    expect(russianReason({ lang: 'uk', exercises: [{ name: 'присідання', how: 'їжак ґанок є і об’єм' }] })).toBeNull();
    expect(russianReason(example)).toBeNull();
  });
});

describe('readPaste: what is accepted', () => {
  it('accepts the example as the AI would send it, fences and words around', () => {
    const result = accepted(`Готово! Ось налаштування:\n\`\`\`json\n${JSON_TEXT}\n\`\`\`\nВстав їх у застосунок.`);
    expect(result).toEqual({ kind: 'accepted', profile: example, unknown: [], forAi: null, hasAccessibility: false });
  });

  it('accepts it with typographic quotes and trailing commas', () => {
    const sloppy = JSON_TEXT.replace(/"(format|version|lang)"/g, '“$1”').replace(/\n\}$/, ',\n}');
    expect(accepted(sloppy).profile).toEqual(example);
  });

  it('keeps a `reps` given as a number as text', () => {
    const result = accepted(withAt('morningWarmup.levels.0.items.0.reps', 12));
    expect((result.profile.morningWarmup as { levels: { items: Obj[] }[] }).levels[0]!.items[0]).toEqual({ exercise: 'neck-rolls', reps: '12' });
  });

  it('says whether the paste carries «доступність»', () => {
    expect(accepted({ ...example, accessibility: { largerText: true } }).hasAccessibility).toBe(true);
  });
});

describe('readPaste: unknown keys', () => {
  const result = accepted({ ...withAt('workout.sessions.0.items.0.side', 'на кожну ногу'), schedule: 'daily', theme: { accent: 'blue', dark: true } });

  it('names them in plain words and never keeps them', () => {
    expect(result.kind).toBe('accepted');
    expect(result.unknown).toEqual(['вигляд → "dark"', 'тренування → тренування 1 «а» → вправа 1 → "side"', '"schedule"']);
    expect(result.profile).toEqual(example);
  });

  it('gives a text for the AI with the exact places', () => {
    expect(result.forAi).toContain('Застосунок не знає цих полів і не збереже їх:');
    expect(result.forAi).toContain('2. тренування → тренування 1 «а» → вправа 1 → "side" [workout.sessions[0].items[0].side]');
    expect(result.forAi).toContain('3. "schedule" [schedule]');
    expect(result.forAi).toContain('Надішли весь JSON заново');
  });
});

describe('readPaste: refusals', () => {
  it('refuses what is not JSON, with no text for the AI', () => {
    expect(refused('привіт')).toMatchObject({ reason: 'notJson', title: 'це не схоже на налаштування >_<', forAi: null });
    expect(refused('[1, 2]')).toMatchObject({ reason: 'notJson' });
  });

  it('refuses an answer that was cut off', () => {
    expect(refused(JSON_TEXT.slice(0, 400))).toMatchObject({ reason: 'truncated', title: 'схоже, відповідь ШІ обірвалася >_<' });
  });

  it('refuses a text over 200 KB before reading it', () => {
    expect(refused(`{"a": "${'а'.repeat(100_001)}"}`)).toMatchObject({ reason: 'tooLong' });
    expect(read(`${JSON_TEXT}${' '.repeat(150_000)}`).kind).toBe('accepted');
  });

  it('tells a copy of the diary and other JSON from settings', () => {
    expect(refused({ format: 'phys-activity-backup', version: 1, profile: {}, days: {} })).toMatchObject({ reason: 'backup', forAi: null });
    expect(refused({ exercises: [] })).toMatchObject({ reason: 'notSettings' });
    expect(refused({ exercises: [] }).forAi).toContain('"format": "phys-activity-profile"');
  });

  it('refuses russian by `lang` and by letters, seriously', () => {
    const byLang = refused({ ...example, lang: 'ru' });
    expect(byLang).toMatchObject({ reason: 'russian', serious: true, title: 'налаштування російською мовою не приймаються.', hint: 'попроси свій ШІ написати їх українською або англійською.' });
    expect(byLang.forAi).toContain('Перепиши всі тексти українською');
    expect(refused(withAt('exercises.0.name', 'подъём')).reason).toBe('russian');
    expect(refused({ format: 'phys-activity-profile', lang: 'ru' }).reason).toBe('russian');
  });

  it('accepts Belarusian and Bulgarian texts with their own `lang`', () => {
    expect(read({ ...withAt('exercises.0.name', 'прысяданні гэта'), lang: 'be' }).kind).toBe('accepted');
    expect(read({ ...withAt('exercises.0.name', 'клякане с подскок, ъгъл'), lang: 'bg' }).kind).toBe('accepted');
  });

  it('refuses a part of the settings and asks for the whole', () => {
    const { workout: _w, trackers: _t, ...part } = example;
    const result = refused(part);
    expect(result).toMatchObject({
      reason: 'partial',
      title: 'це лише частина налаштувань',
      lines: ['бракує розділів: тренування ("workout"), самопочуття ("trackers")'],
    });
    expect(result.hint).toContain('попроси свій ШІ надіслати все повністю');
    expect(result.forAi).toContain('Надішли весь JSON повністю');
    expect(refused({ format: 'phys-activity-profile', version: '0.1', exercises: [] }).reason).toBe('partial');
  });

  it('names the field of every error in plain words, and the place for the AI', () => {
    const broken = copyOf();
    (broken.morningWarmup as { levels: Obj[] }).levels[0]!.name = '';
    (broken.exercises as Obj[])[1]!.id = 'neck-rolls';
    (broken.workout as { weeklyTarget: unknown }).weeklyTarget = 'двічі';
    (broken.trackers as Obj[])[0]!.max = 0;
    broken.version = 1;
    const result = refused(broken);
    expect(result).toMatchObject({ reason: 'errors', title: 'щось не так у налаштуваннях >_<', hint: 'встав це своєму ШІ — він виправить.' });
    expect(result.lines).toEqual([
      'версія формату: має бути "0.1"',
      'ранкова розминка → рівень 1 → назва: не може бути порожнім',
      'тренування → ціль: днів на тиждень: має бути цілим числом',
      'вправи → вправа 2 «планка» → id: id "neck-rolls" повторюється. у кожного запису свій id',
      'ранкова розминка → рівень 1 → вправа 2 → id вправи: вправи з id "plank" немає в каталозі вправ ("exercises"). додай її туди або виправ id',
      'тренування → тренування 1 «а» → вправа 2 → група вправ → вправа 2 → id вправи: вправи з id "plank" немає в каталозі вправ ("exercises"). додай її туди або виправ id',
      'самопочуття → питання 1 «біль у шиї»: "min" має бути менше за "max"',
    ]);
    expect(result.forAi).toContain('Застосунок не прийняв налаштування. Що треба виправити:\n1. версія формату: має бути "0.1" [version]');
    expect(result.forAi).toContain('2. ранкова розминка → рівень 1 → назва: не може бути порожнім [morningWarmup.levels[0].name]');
    expect(result.forAi).toContain('Виправ це й нічого іншого не міняй.');
  });

  it('words the other kinds of error', () => {
    const line = (path: string, value: unknown) => refused(withAt(path, value)).lines[0];
    expect(line('exercises.0.name', 'а'.repeat(61))).toBe('вправи → вправа 1 «ааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааа» → назва: задовгий текст: символів 61, можна до 60');
    expect(line('goal.days', 9)).toBe('тижнева ціль → днів на тиждень: 9 — забагато, найбільше 7');
    expect(line('goal.days', -1)).toBe('тижнева ціль → днів на тиждень: -1 — замало, найменше 0');
    expect(read(withAt('goal.days', 0)).kind).toBe('accepted');
    expect(line('encouragement.0', 'а'.repeat(81))).toBe('підбадьорливі фрази → фраза 1: задовгий текст: символів 81, можна до 80');
    expect(line('theme.accent', 'red')).toContain('вигляд → акцентний колір: має бути одним із: "gray", "orange"');
    expect(line('trackers.0.ask', [])).toBe('самопочуття → питання 1 «біль у шиї» → коли питати: замало записів: 0, треба щонайменше 1');
    expect(line('trackers.0.ask', ['morning', 'morning'])).toBe('самопочуття → питання 1 «біль у шиї» → коли питати: значення не мають повторюватися');
    expect(line('exercises.3.source.url', 'example.com')).toBe('вправи → вправа 4 «присід» → посилання → адреса: має починатися з https:// або http://');
    expect(line('exercises.0.id', 'Шия')).toBe('вправи → вправа 1 «оберти шиєю» → id: тільки малі латинські літери, цифри й дефіс');
    expect(line('exercises.0.name', undefined)).toBe('вправи → вправа 1: немає поля "name" (назва)');
    expect(line('encouragement', 'вперед')).toBe('підбадьорливі фрази: має бути списком у квадратних дужках [ ]');
    expect(line('morningWarmup.levels.0.items.0.reps', true)).toBe('ранкова розминка → рівень 1 «легкий день» → вправа 1 → скільки разів: має бути текстом у лапках або цілим числом');
    expect(line('trackers.0.kind', 'mood')).toContain('вид питання: має бути одним із: "scale", "yesno", "number", "numbers", "note"');
  });

  it('lists the first errors and counts the rest; the AI gets more of them', () => {
    const exercises = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, name: '' }));
    const result = refused({ ...example, morningWarmup: { enabled: false, weeklyTarget: 0, levels: [] }, daytimeWarmup: { enabled: false, weeklyTarget: 0, groups: [] }, workout: { enabled: false, weeklyTarget: 0, sessions: [] }, exercises });
    expect(result.lines).toHaveLength(SHOWN_LINES + 1);
    expect(result.lines.at(-1)).toBe('і ще 4');
    expect(result.forAi).toContain('12. вправи → вправа 12 → назва: не може бути порожнім [exercises[11].name]');
  });
});

describe('describeChanges: the preview', () => {
  const names = {
    accents: new Proxy({}, { get: (_, key) => `колір ${String(key)}` }),
    accessibility: new Proxy({}, { get: (_, key) => `доступність ${String(key)}` }),
  } as unknown as PreviewNames;
  const changes = (after: Obj, before: Obj | null = example) => describeChanges(before, after, names);

  it('sums up the first settings on a phone', () => {
    expect(changes(example, null)).toEqual({
      first: true,
      added: [
        'ранкова розминка: показується, ціль днів на тиждень — 6',
        'денна розминка: показується, ціль днів на тиждень — 3',
        'тренування: показується, ціль днів на тиждень — 2',
        'рух: показується, ціль днів на тиждень — 4',
        'вправ у каталозі: 5',
        'питань про самопочуття: 5',
        'рівнів ранкової розминки: 1',
        'зон денної розминки: 1',
        'тренувань: 1',
        'видів руху: 1',
        'тижнева ціль: днів на тиждень — 5',
        'акцентний колір: колір blue',
      ],
      changed: [],
      removed: [],
    });
    const { goal: _goal, ...noGoal } = example;
    expect(changes({ ...noGoal, accessibility: { largerText: true } }, null).added).toEqual(expect.arrayContaining(['без тижневої цілі', 'доступність: доступність largerText']));
  });

  it('says nothing changes for the same settings', () => {
    expect(changesNothing(changes(copyOf()))).toBe(true);
    expect(changesNothing(changes(example, null))).toBe(false);
  });

  it('matches entries by id: a renamed exercise is changed, a new id is added, a missing one removed', () => {
    const after = copyOf();
    const exercises = after.exercises as Obj[];
    exercises[0]!.name = 'кола шиєю';
    exercises.push({ id: 'bridge', name: 'місток' });
    after.trackers = (after.trackers as Obj[]).filter((tracker) => tracker.id !== 'dizzy');
    expect(changes(after)).toEqual({
      first: false,
      added: ['вправа: місток'],
      changed: ['вправа: кола шиєю'],
      removed: ['питання про самопочуття: було запаморочення?'],
    });
  });

  it('names what else changed: goal, phrases, colour, «доступність», a section, an order, a level', () => {
    const after = copyOf();
    delete after.goal;
    after.encouragement = ['нова фраза'];
    after.theme = { accent: 'mint' };
    after.accessibility = { noMotion: true };
    (after.movement as Obj).enabled = false;
    (after.workout as Obj).hint = 'коли є сили';
    (after.trackers as Obj[]).reverse();
    (after.morningWarmup as { levels: { items: Obj[] }[] }).levels[0]!.items.pop();
    const result = changes(after);
    expect(result.removed).toEqual(['тижнева ціль']);
    expect(result.added).toEqual([]);
    expect(result.changed).toEqual([
      'підбадьорливі фрази',
      'акцентний колір: колір mint',
      'доступність: доступність noMotion',
      'тренування: підказка',
      'рух: вимкнено',
      'порядок: питань про самопочуття',
      'рівень ранкової розминки: легкий день',
    ]);
    const { goal: _goal, ...noGoal } = example;
    expect(changes(example, noGoal).added).toEqual(['тижнева ціль: днів на тиждень — 5']);
    expect(changes({ ...example, goal: { enabled: true, days: 3, done: [] } }).changed).toEqual(['тижнева ціль: днів на тиждень — 3']);
  });

  it('cuts a long group short', () => {
    const exercises = Array.from({ length: 20 }, (_, i) => ({ id: `new-${i}`, name: `вправа ${i}` }));
    const added = changes({ ...example, exercises: [...example.exercises, ...exercises] }).added;
    expect(added).toHaveLength(GROUP_LINES + 1);
    expect(added.at(-1)).toBe('і ще 8');
  });
});
