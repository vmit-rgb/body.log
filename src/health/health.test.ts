import { describe, expect, it } from 'vitest';
import type { DayKey } from '../domain/dates';
import { emptyDay, hasData, readDay, writeDay, type Day, type HealthLog } from '../domain/day';
import { parseDiary, serializeDiary } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';
import { trackerCards } from '../domain/cards';
import { dayBlocks } from '../domain/journal';
import { dayPdf } from '../domain/pdf-records';
import { dayDone, kindDone } from '../domain/progress';
import { readSettings } from '../domain/settings';
import { EMPTY_HEALTH, formatHealth, healthAverages, healthNumber, parseHealth, SHORTCUT_RUN, withHealth } from './health';

/*
 * Beta 1.1.1 (HEALTH-IMPORT.md, A1, A2, A5, A9). The texts are the shortcut's
 * real output from Olesia's iPhone 12 mini (iOS 16.3.1, 2026-11-22), plus
 * shapes it may take later (spaces in thousands, commas, workouts).
 */

const TODAY = '2026-11-22' as DayKey;
const day = (key: string) => key as DayKey;
const log = (fields: Partial<HealthLog>): HealthLog => ({ ...EMPTY_HEALTH, ...fields });
const days = (text: string) => {
  const pasted = parseHealth(text, TODAY);
  if (pasted.kind !== 'days') throw new Error('not ours');
  return pasted.days;
};

describe('the text from the shortcut (A1)', () => {
  it('reads the first real output, the header pasted twice and a day repeated', () => {
    const text = 'body.log health 1\n2026-11-19 steps 2841\nbody.log health 1\n2026-11-19 steps 2841\n2026-11-22 steps 18';
    expect(days(text)).toEqual({ '2026-11-19': log({ steps: 2841 }), '2026-11-22': log({ steps: 18 }) });
  });

  it('rounds km with a dot and a long tail to two decimals', () => {
    expect(days('body.log health 1\n2026-11-19 km 2.15974999998603\n2026-11-19 steps 2841')).toEqual({ '2026-11-19': log({ steps: 2841, km: 2.16 }) });
  });

  it('takes a comma, spaces between thousands and Windows line ends', () => {
    expect(days('body.log health 1\r\n2026-11-20 steps 8 432\r\n2026-11-20 km 6,1\r\n2026-11-20 kcal 412\r\n2026-11-20 steps 10 001')).toEqual({
      '2026-11-20': log({ steps: 10001, km: 6.1, kcal: 412 }),
    });
  });

  it('the same day and key twice: the last one counts', () => {
    expect(days('body.log health 1\n2026-11-21 steps 100\n2026-11-21 steps 200')['2026-11-21' as DayKey]!.steps).toBe(200);
  });

  it('reads workouts with and without km, each once', () => {
    const text = 'body.log health 1\n2026-11-21 workout 32 5,1 Біг на вулиці\n2026-11-21 workout 20 Йога\n2026-11-21 workout 32 5,1 Біг на вулиці';
    expect(days(text)['2026-11-21' as DayKey]!.workouts).toEqual([{ min: 32, km: 5.1, name: 'Біг на вулиці' }, { min: 20, km: null, name: 'Йога' }]);
  });

  it('skips unknown keys, broken numbers and lines, future days and days older than 31 days', () => {
    const text = [
      'body.log health 1',
      '2026-11-21 heartrate 70',
      '2026-11-21 steps -5',
      '2026-11-21 steps lots',
      'just a line',
      '2026-13-01 steps 5',
      '2026-11-23 steps 5',
      '2026-10-21 steps 5',
      '2026-10-22 steps 6',
    ].join('\n');
    expect(days(text)).toEqual({ '2026-10-22': log({ steps: 6 }) });
  });

  it('the header alone: ours, with no days (nothing in Health for the week)', () => {
    expect(parseHealth('body.log health 1\n', TODAY)).toEqual({ kind: 'days', days: {} });
  });

  it('anything without the header first is not ours', () => {
    expect(parseHealth('', TODAY).kind).toBe('not-ours');
    expect(parseHealth('2026-11-19 steps 2841', TODAY).kind).toBe('not-ours');
    expect(parseHealth('{"format":"body.log-profile"}', TODAY).kind).toBe('not-ours');
    expect(parseHealth('body.log health 2\n2026-11-19 steps 1', TODAY).kind).toBe('not-ours');
  });

  it('a number is digits with one dot or comma', () => {
    expect(healthNumber('8 432')).toBe(8432);
    expect(healthNumber('2,5')).toBe(2.5);
    expect(healthNumber('1e3')).toBeNull();
    expect(healthNumber('')).toBeNull();
  });

  it('runs the shortcut by its exact name', () => {
    expect(SHORTCUT_RUN).toBe('shortcuts://run-shortcut?name=body.log%20health');
  });
});

describe('«Здоровʼя» in the day (A2)', () => {
  const synced = withHealth(log({ steps: 2841, km: 2.16 }))(emptyDay(day('2026-11-19')));

  it('is stored and read back; a day with only it is kept', () => {
    expect(hasData(synced)).toBe(true);
    const stored = writeDay(synced)!;
    expect(stored.hl).toEqual(log({ steps: 2841, km: 2.16 }));
    expect(readDay(JSON.parse(JSON.stringify(stored)), day('2026-11-19'))).toEqual(synced);
  });

  it('a copy keeps it, and an old copy without it reads as before', () => {
    const diary = { profile: EXAMPLE_DIARY.profile, days: { [synced.date]: synced } };
    expect(parseDiary(serializeDiary(diary, new Date('2026-11-22T10:00:00Z')))!.days[synced.date]).toEqual(synced);
    const old = readDay({ v: 2, date: '2026-11-19', note: 'прогулянка' }, day('2026-11-19'));
    expect(old.hl).toBeUndefined();
    expect(writeDay(old)).not.toHaveProperty('hl');
  });

  it('drops what can not be read and leaves out an empty record', () => {
    const read = readDay({ hl: { steps: 'many', km: 1, workouts: [{ min: 'x' }, { min: 10, name: 5 }] } }, day('2026-11-19'));
    expect(read.hl).toEqual(log({ km: 1, workouts: [{ min: 10, km: null, name: '' }] }));
    expect(readDay({ hl: { steps: null } }, day('2026-11-19')).hl).toBeUndefined();
    expect(hasData(readDay({ hl: {} }, day('2026-11-19')))).toBe(false);
  });

  it('a new sync replaces the record and keeps what was logged by hand', () => {
    const byHand: Day = { ...synced, note: 'вечір', mv: { walk: [{ km: 3, min: null, steps: null }] } };
    const again = withHealth(log({ steps: 3000 }))(byHand);
    expect(again.hl).toEqual(log({ steps: 3000 }));
    expect(again.note).toBe('вечір');
    expect(again.mv).toEqual(byHand.mv);
  });

  it('never makes «рух» done, nor the day for the goal', () => {
    const settings = readSettings(EXAMPLE_DIARY.profile);
    expect(kindDone(synced, 'movement', settings)).toBe(false);
    expect(dayDone(synced, { ...settings, goal: { ...settings.goal, done: ['movement'], any: true } })).toBe(false);
  });
});

describe('«Здоровʼя» on the screens (A3, A5)', () => {
  const settings = readSettings(EXAMPLE_DIARY.profile);
  const at: Record<string, Day> = {
    '2026-11-20': withHealth(log({ steps: 8000, km: 6 }))(emptyDay(day('2026-11-20'))),
    '2026-11-21': withHealth(log({ steps: 2001, workouts: [{ min: 32, km: 5.1, name: 'Біг' }] }))(emptyDay(day('2026-11-21'))),
  };
  const dayAt = (key: DayKey) => at[key] ?? emptyDay(key);
  const week = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'].map(day);

  it('says what came, in a line', () => {
    expect(formatHealth(at['2026-11-20']!.hl!)).toBe('8000 кроків · 6 км');
    expect(formatHealth(at['2026-11-21']!.hl!)).toBe('2001 крок · Біг 32 хв 5,1 км');
    expect(formatHealth(log({ exmin: 34, kcal: 412, floors: 3 }))).toBe('34 хв активності · 412 ккал · 3 прольоти');
  });

  it('averages steps and km over the days that have them; a card only then', () => {
    expect(healthAverages(week, dayAt)).toEqual({ steps: 5001, km: 6 });
    const card = trackerCards(week, dayAt, settings).find((c) => c.id === 'health')!;
    expect(card).toMatchObject({ id: 'health', name: 'зі Здоровʼя', kind: 'averages', rows: [{ label: 'кроки', value: 5001 }, { label: 'км', value: 6 }] });
    expect(trackerCards(week, (key) => emptyDay(key), settings).some((c) => c.id === 'health')).toBe(false);
  });

  it('is in the history and the PDF under «рух»', () => {
    const blocks = dayBlocks(at['2026-11-20']!, at, settings);
    expect(blocks).toEqual([{ kind: 'values', title: 'рух', rows: [{ label: 'зі Здоровʼя', value: '8000 кроків · 6 км', unit: '', text: false }] }]);
    const pdf = dayPdf(at['2026-11-20']!, '20.11', at, settings).map((line) => ('text' in line ? line.text : ''));
    expect(pdf).toContain('рух');
    expect(pdf).toContain('• зі Здоровʼя: 8000 кроків · 6 км');
  });
});
