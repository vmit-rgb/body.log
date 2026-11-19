import { describe, expect, it } from 'vitest';
import { DAILY_UP_TO, MAX_LINES, trackerCards, weekTo } from './cards';
import type { DayKey } from './dates';
import { emptyDay, readDay, type Day } from './day';
import { readSettings } from './settings';
import { daysFrom } from './stats';

// Invented data only: nothing from a real log.
const key = (text: string) => text as DayKey;

const settings = readSettings({
  trackers: [
    { id: 'pain', name: 'біль у запʼястках', kind: 'scale', min: 0, max: 10, ask: ['morning', 'afterMorningWarmup', 'evening'] },
    { id: 'pulse', name: 'пульс', kind: 'number', units: ['уд/хв'], ask: ['morning'] },
    { id: 'bp', name: 'тиск', kind: 'numbers', units: ['мм', 'мм'], ask: ['morning', 'evening'] },
    { id: 'slept', name: 'спала добре?', kind: 'yesno', ask: ['morning'] },
    { id: 'dizzy', name: 'запаморочення', kind: 'scale', ask: ['morning'] },
    { id: 'note', name: 'що ще', kind: 'note', ask: ['evening'] },
  ],
});

const days: Record<string, Day> = {
  '2026-11-16': readDay({ t: { morning: { pain: 4, pulse: 66, bp: [118, 76], slept: 'yes' }, evening: { pain: 2 } } }, key('2026-11-16')),
  '2026-11-17': readDay({ t: { morning: { pain: 3, slept: 'no' }, afterMorningWarmup: { pain: 2 }, evening: { bp: [121, null] } } }, key('2026-11-17')),
  '2026-11-18': readDay({ t: { morning: { pain: 2, pulse: 61, slept: 'yes' }, evening: { note: 'текст' } } }, key('2026-11-18')),
};
const dayAt = (at: DayKey) => days[at] ?? emptyDay(at);
const WEEK = weekTo(key('2026-11-18'));

describe('trackerCards', () => {
  it('gives a card to every question but the notes, in the settings order', () => {
    expect(trackerCards(WEEK, dayAt, settings).map((card) => card.name)).toEqual(['біль у запʼястках', 'пульс', 'тиск', 'спала добре?', 'запаморочення']);
  });

  it('averages a slider per moment, with «—» left for a moment without answers', () => {
    const [pain] = trackerCards(WEEK, dayAt, settings);
    expect(pain!.kind).toBe('averages');
    if (pain!.kind !== 'averages') return;
    expect(pain!.rows.map((row) => [row.label, row.value])).toEqual([['зранку', 3], ['після ранкової', 2], ['ввечері', 2]]);
  });

  it('draws a line per moment over the 7 days, a point per day, with gaps for days without answers', () => {
    const [pain] = trackerCards(WEEK, dayAt, settings);
    if (pain!.kind !== 'averages') throw new Error('no chart');
    const chart = pain!.chart!;
    expect(chart.starts).toEqual(WEEK);
    expect(chart.weekly).toBe(false);
    expect([chart.min, chart.max]).toEqual([0, 10]);
    expect(chart.lines.map((line) => line.label)).toEqual(['зранку', 'після ранкової', 'ввечері']);
    expect(chart.lines[0]!.points).toEqual([null, null, null, null, 4, 3, 2]);
    expect(chart.lines[1]!.points).toEqual([null, null, null, null, null, 2, null]);
  });

  it('scales a number to whole fives around its values', () => {
    const pulse = trackerCards(WEEK, dayAt, settings)[1]!;
    if (pulse.kind !== 'averages') throw new Error('no chart');
    expect(pulse.rows.map((row) => row.value)).toEqual([63.5]);
    expect([pulse.chart!.min, pulse.chart!.max]).toEqual([60, 70]);
  });

  it('lists every pressure record, a missing number as null', () => {
    const bp = trackerCards(WEEK, dayAt, settings)[2]!;
    expect(bp).toMatchObject({
      kind: 'pairs',
      entries: [
        { date: '2026-11-16', label: 'зранку', a: 118, b: 76 },
        { date: '2026-11-17', label: 'ввечері', a: 121, b: null },
      ],
    });
  });

  it('says «так» out of the answers for yes / no', () => {
    expect(trackerCards(WEEK, dayAt, settings)[3]).toMatchObject({ kind: 'yesno', rows: [{ label: 'зранку', yes: 2, total: 3 }] });
  });

  it('is empty without answers', () => {
    expect(trackerCards(WEEK, dayAt, settings)[4]).toMatchObject({ kind: 'empty', name: 'запаморочення' });
    expect(trackerCards(daysFrom(key('2026-10-01'), key('2026-10-31')), dayAt, settings).every((card) => card.kind === 'empty')).toBe(true);
  });

  it('takes a point per week over 31 days', () => {
    const keys = daysFrom(key('2026-10-01'), key('2026-11-18'));
    expect(keys.length).toBeGreaterThan(DAILY_UP_TO);
    const [pain] = trackerCards(keys, dayAt, settings);
    if (pain!.kind !== 'averages') throw new Error('no chart');
    expect(pain!.chart!.weekly).toBe(true);
    expect(pain!.chart!.starts).toHaveLength(Math.ceil(keys.length / 7));
    expect(pain!.chart!.end).toBe('2026-11-18');
    // 12.11–18.11 is the last week: (4 + 3 + 2) / 3
    expect(pain!.chart!.lines[0]!.points.at(-1)).toBe(3);
  });

  it('draws at most 5 lines, the first moments of the day', () => {
    const moments = ['morning', 'afterMorningWarmup', 'beforeDaytimeWarmup', 'afterDaytimeWarmup', 'beforeWorkout', 'afterWorkout', 'evening'] as const;
    const many = readSettings({ trackers: [{ id: 'e', name: 'енергія', kind: 'scale', ask: moments }] });
    const day = readDay({ t: Object.fromEntries(moments.map((moment, i) => [moment, { e: i }])) }, key('2026-11-18'));
    const [card] = trackerCards([key('2026-11-18')], () => day, many);
    if (card!.kind !== 'averages') throw new Error('no chart');
    expect(card!.rows).toHaveLength(7);
    expect(card!.chart!.lines).toHaveLength(MAX_LINES);
    expect(card!.chart!.lines.at(-1)!.label).toBe('до тренування');
  });
});
