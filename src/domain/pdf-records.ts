import type { DayKey } from './dates';
import { hasLap, hasSet, type Day, type SetLog } from './day';
import { formatLaps } from './history';
import { MOMENT_TITLES, answerRow, exerciseName, sessionName, warmupGroups, zoneNames } from './journal';
import { formatNumber } from './numbers';
import { MOMENTS, type Moment, type Settings } from './settings';
import { t } from '../i18n/lang';
import { formatHealth, hasHealth, HEALTH_NAME } from '../health/health';

/*
 * The records PDF laid out for reading (Olesia, 2026-11-19): the date, then
 * each block under its own bold heading, the facts as bulleted lists
 * (a second level for several check-ins or laps) and the workout as a table.
 */

export interface PdfLine {
  readonly text: string;
  /** Points. */
  readonly size: number;
  readonly bold: boolean;
  /** Points from the left margin. */
  readonly indent: number;
  /** Points more for the rows a long line wraps to (under the text of a bullet). */
  readonly hang?: number;
}

export interface PdfTable {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly size: number;
  readonly indent: number;
}

export type PdfBlock = PdfLine | PdfTable;

export const isTable = (block: PdfBlock): block is PdfTable => 'rows' in block;

export const pdfLine = (text: string, size: number, bold = false, indent = 0): PdfLine => ({ text, size, bold, indent });
export const gap = (size: number): PdfLine => pdfLine('', size);

const BODY = 9.5;
/** Two letters of the body size: «• » and «– ». */
const HANG = 2 * BODY * 0.6;

const heading = (text: string): PdfBlock[] => [gap(4), pdfLine(text, 10.5, true)];
const bullet = (text: string): PdfLine => ({ ...pdfLine(`• ${text}`, BODY, false, 8), hang: HANG });
const subBullet = (text: string): PdfLine => ({ ...pdfLine(`– ${text}`, BODY, false, 8 + HANG), hang: HANG });

/** «самопочуття ввечері» → «ввечері» */
const momentName = (moment: Moment) => MOMENT_TITLES[moment].replace(/^самопочуття /, '');

/**
 * One check-in: its questions as bullets under «самопочуття зранку».
 * Several: each question once, its answers by moment one level down.
 */
function wellbeing(day: Day, settings: Settings): PdfBlock[] {
  const moments = MOMENTS.filter((moment) => Object.keys(day.t[moment] ?? {}).length > 0);
  const answer = (id: string, moment: Moment) => {
    const row = answerRow(settings.trackers.find((t) => t.id === id), day.t[moment]![id]!);
    return { label: row.label, value: [row.value, row.unit].filter(Boolean).join(' ') };
  };
  if (moments.length === 0) return [];
  if (moments.length === 1) {
    const [moment] = moments as [Moment];
    return [...heading(MOMENT_TITLES[moment]), ...Object.keys(day.t[moment]!).map((id) => {
      const { label, value } = answer(id, moment);
      return bullet(`${label}: ${value}`);
    })];
  }
  const ids = [...new Set(moments.flatMap((moment) => Object.keys(day.t[moment]!)))];
  return [...heading(t('самопочуття')), ...ids.flatMap((id) => {
    const answered = moments.filter((moment) => day.t[moment]![id] !== undefined);
    return [bullet(answer(id, answered[0]!).label), ...answered.map((moment) => subBullet(`${momentName(moment)}: ${answer(id, moment).value}`))];
  })];
}

function morning(day: Day, days: readonly Day[], settings: Settings): PdfBlock[] {
  const groups = warmupGroups(day, days, settings);
  if (groups.length === 0) return [];
  return [...heading(t('ранкова розминка')), ...groups.map((group) =>
    bullet(`${group.title} (${group.items.map((item) => (item.times ? `${item.name} ${item.times}` : item.name)).join(', ')})`))];
}

function daytime(day: Day, settings: Settings): PdfBlock[] {
  const zones = zoneNames(day, settings);
  return zones.length ? [...heading(t('денна розминка')), ...zones.map(bullet)] : [];
}

/** One value per set, written once when every set has the same. */
function column(sets: readonly SetLog[], key: keyof SetLog): string {
  const values = sets.map((set) => set[key]);
  if (values.every((x) => x === null)) return '';
  const texts = values.map((x) => (x === null ? '—' : formatNumber(x)));
  return texts.every((x) => x === texts[0]) ? texts[0]! : texts.join(', ');
}

const SET_COLUMNS: readonly [string, keyof SetLog][] = [[t('повт.'), 'r'], [t('кг'), 'w'], [t('с'), 's']];

/** «вправа · підходи · повт. · кг · с»; a column nobody filled is left out. */
function workoutTable(day: Day, days: readonly Day[], settings: Settings): PdfTable | null {
  const done = Object.entries(day.wo!.ex).map(([id, sets]) => [id, sets.filter(hasSet)] as const).filter(([, sets]) => sets.length > 0);
  if (done.length === 0) return null;
  const used = SET_COLUMNS.filter(([, key]) => done.some(([, sets]) => column(sets, key)));
  return {
    header: [t('вправа'), t('підходи'), ...used.map(([title]) => title)],
    rows: done.map(([id, sets]) => [exerciseName(settings, days, id), String(sets.length), ...used.map(([, key]) => column(sets, key))]),
    size: BODY,
    indent: 8,
  };
}

function workout(day: Day, days: readonly Day[], settings: Settings): PdfBlock[] {
  if (!day.wo) return [];
  const table = workoutTable(day, days, settings);
  if (!table) return [];
  const session = settings.workout.sessions.find((s) => s.id === day.wo!.session);
  return [...heading(session ? sessionName(session.name) : t('тренування')), gap(2), table];
}

/** A kind with one lap on one line; with several, each lap one level down. «Здоровʼя» first (beta 1.1.1). */
function movement(day: Day, settings: Settings): PdfBlock[] {
  const health = hasHealth(day.hl) ? [[bullet(`${HEALTH_NAME}: ${formatHealth(day.hl)}`)]] : [];
  const kinds = [...health, ...Object.entries(day.mv).map(([id, laps]) => {
    const kind = settings.movement.kinds.find((k) => k.id === id);
    const label = kind ? kind.name || t('без назви') : t('рух, якого вже немає');
    const filled = laps.filter(hasLap);
    return filled.length === 1
      ? [bullet(`${label}: ${formatLaps(filled)}`)]
      : [bullet(label), ...filled.map((lap, i) => subBullet(`${t('коло')} ${i + 1}: ${formatLaps([lap])}`))];
  })];
  return kinds.length ? [...heading(t('рух')), ...kinds.flat()] : [];
}

function note(day: Day): PdfBlock[] {
  if (!day.note) return [];
  return [...heading(t('нотатка')), ...day.note.split('\n').map((text) => pdfLine(text.trim(), BODY, false, 8))];
}

/** A day under its date: wellbeing first, then the day as it was lived, the note last. */
export function dayPdf(day: Day, date: string, days: Readonly<Record<DayKey, Day>>, settings: Settings): PdfBlock[] {
  const all = [day, ...Object.values(days)];
  return [
    pdfLine(date, 13, true),
    ...wellbeing(day, settings),
    ...morning(day, all, settings),
    ...daytime(day, settings),
    ...workout(day, all, settings),
    ...movement(day, settings),
    ...note(day),
    gap(10),
  ];
}
