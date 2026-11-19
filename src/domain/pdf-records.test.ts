import { describe, expect, it } from 'vitest';
import type { DayKey } from './dates';
import { readDay } from './day';
import { EXAMPLE_DIARY } from './examples';
import { dayPdf, isTable, type PdfBlock } from './pdf-records';
import { readSettings } from './settings';

// Invented data only.
const KEY = '2026-11-18' as DayKey;
const SETTINGS = readSettings(EXAMPLE_DIARY.profile);
const blocks = (raw: Parameters<typeof readDay>[0]) => {
  const day = readDay(raw, KEY);
  return dayPdf(day, 'ср, 18.11.2026', { [KEY]: day }, SETTINGS);
};
const texts = (all: readonly PdfBlock[]) => all.filter((b) => !isTable(b)).map((b) => ('text' in b ? b.text : '')).filter(Boolean);

describe('dayPdf', () => {
  it('starts with the date and ends with a gap', () => {
    const all = blocks({ dw: ['back'] });
    expect(all[0]).toEqual({ text: 'ср, 18.11.2026', size: 13, bold: true, indent: 0 });
    expect(all.at(-1)).toEqual({ text: '', size: 10, bold: false, indent: 0 });
  });

  it('puts one check-in under its moment, a bullet per question with its unit', () => {
    expect(texts(blocks({ t: { morning: { energy: 6, pulse: 72 } } })))
      .toEqual(['ср, 18.11.2026', 'самопочуття зранку', '• енергія: 6', '• пульс: 72 уд/хв']);
  });

  it('gathers several check-ins under «самопочуття»: each question once, its moments one level down', () => {
    const all = blocks({ t: { evening: { tired: 7 }, morning: { energy: 6 }, afterWorkout: { energy: 4, hard: 'yes' } } });
    expect(texts(all)).toEqual(['ср, 18.11.2026', 'самопочуття',
      '• енергія', '– зранку: 6', '– після тренування: 4', '• було важко?', '– після тренування: так', '• втома', '– ввечері: 7']);
    expect(all.find((b) => 'text' in b && b.text === '– зранку: 6')).toEqual({ text: '– зранку: 6', size: 9.5, bold: false, indent: 19.4, hang: 11.4 });
  });

  it('gives each warm-up level and each zone a bullet', () => {
    expect(texts(blocks({ mw: { ticks: ['exercise-1', 'exercise-2', 'exercise-3'], times: { 'exercise-2': [30] } }, dw: ['back', 'gone'] })))
      .toEqual(['ср, 18.11.2026', 'ранкова розминка', '• рівень 1 · готово (вправа 1, вправа 2 30 с)', '• рівень 2 (вправа 3)',
        'денна розминка', '• для спини', '• зона, якої вже немає']);
  });

  it('draws the workout as a table under the session, leaving out columns nobody filled', () => {
    const all = blocks({ wo: { session: 'a', ex: {
      'exercise-6': [{ r: 10, w: 5 }, { r: 10, w: 5 }, { r: 8, w: 5 }],
      'exercise-7': [{ s: 40 }, { r: 5 }],
      'exercise-8': [{}],
    } } });
    expect(texts(all)).toEqual(['ср, 18.11.2026', 'тренування А']);
    expect(all.find(isTable)).toEqual({
      header: ['вправа', 'підходи', 'повт.', 'кг', 'с'],
      rows: [['вправа 6', '3', '10, 10, 8', '5', ''], ['вправа 7', '2', '—, 5', '', '40, —']],
      size: 9.5,
      indent: 8,
    });
  });

  it('names a workout whose session is gone «тренування», and keeps only the filled columns', () => {
    const all = blocks({ wo: { session: 'gone', ex: { 'exercise-6': [{ w: 20 }] } } });
    expect(texts(all)).toEqual(['ср, 18.11.2026', 'тренування']);
    expect(all.find(isTable)).toMatchObject({ header: ['вправа', 'підходи', 'кг'], rows: [['вправа 6', '1', '20']] });
  });

  it('leaves out a workout with no filled set', () => {
    expect(blocks({ wo: { session: 'a', ex: { 'exercise-6': [{}] } }, dw: ['back'] }).some(isTable)).toBe(false);
    expect(texts(blocks({ wo: { session: 'a', ex: { 'exercise-6': [{}] } }, dw: ['back'] }))).not.toContain('тренування А');
  });

  it('writes one lap on the line of its movement, several laps one level down', () => {
    expect(texts(blocks({ mv: { 'movement-1': { km: 3, min: 40, more: [{ km: 1.5 }] }, gone: { min: 10 } } })))
      .toEqual(['ср, 18.11.2026', 'рух', '• рух 1', '– коло 1: 3 км · 40 хв', '– коло 2: 1,5 км', '• рух, якого вже немає: 10 хв']);
  });

  it('names an unnamed movement «без назви»', () => {
    const profile = { ...EXAMPLE_DIARY.profile, movement: { enabled: true, kinds: [{ id: 'm', name: '', fields: ['km'], source: { type: 'user' } }] } };
    const day = readDay({ mv: { m: { km: 1 } } }, KEY);
    expect(texts(dayPdf(day, 'd', { [KEY]: day }, readSettings(profile)))).toContain('• без назви: 1 км');
  });

  it('writes the note line by line under «нотатка», last', () => {
    expect(texts(blocks({ note: 'перший рядок \n  другий', dw: ['back'] })))
      .toEqual(['ср, 18.11.2026', 'денна розминка', '• для спини', 'нотатка', 'перший рядок', 'другий']);
  });

  it('puts a small gap before each heading', () => {
    const all = blocks({ dw: ['back'] });
    expect(all[1]).toEqual({ text: '', size: 4, bold: false, indent: 0 });
    expect(all[2]).toEqual({ text: 'денна розминка', size: 10.5, bold: true, indent: 0 });
  });
});
