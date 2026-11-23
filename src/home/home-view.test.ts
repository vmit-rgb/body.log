import { describe, expect, it } from 'vitest';
import type { DayKey } from '../domain/dates';
import { readSettings } from '../domain/settings';
import { EXAMPLE_DIARY } from '../domain/examples';
import { readDay } from '../domain/day';
import { goalLine, heroFor, homeSections, phraseFor, sectionDone } from './home-view';

const key = (text: string) => text as DayKey;

describe('homeSections', () => {
  it('shows every section of the example settings in the fixed order', () => {
    expect(homeSections(readSettings(EXAMPLE_DIARY.profile)).map((section) => section.title)).toEqual([
      'самопочуття зранку', 'ранкова розминка', 'денна розминка', 'тренування', 'рух', 'їжа', 'самопочуття ввечері', 'нотатка',
    ]);
  });

  it('keeps only the note for empty settings', () => {
    expect(homeSections(readSettings({}))).toEqual([
      { id: 'note', title: 'нотатка', description: 'усе, що хочеш запамʼятати про цей день.' },
    ]);
  });

  it('shows a check-in only when a question is asked at that moment', () => {
    const settings = readSettings({ trackers: [{ id: 'e', ask: ['evening', 'afterWorkout'] }], workout: { enabled: true } });
    expect(homeSections(settings).map((section) => section.id)).toEqual(['wo', 'ck-evening', 'note']);
  });

  it('gives the sections with exercises the same reminder (Olesia, 2026-11-08)', () => {
    const settings = readSettings({ morningWarmup: { enabled: true }, daytimeWarmup: { enabled: true }, movement: { enabled: true }, trackers: [{ id: 'm', ask: ['morning'] }] });
    expect(homeSections(settings).map((section) => section.description)).toEqual([
      'познач, як ти зараз. правильних відповідей тут немає.',
      'слухай тіло. якщо щось не так — зупинись <3',
      'слухай тіло. якщо щось не так — зупинись <3',
      'запиши, скільки вийшло.',
      'усе, що хочеш запамʼятати про цей день.',
    ]);
  });
});

describe('phraseFor', () => {
  const phrases = ['перша', 'друга', 'третя'];
  it('changes the phrase every day and comes back round', () => {
    expect(phraseFor(key('2026-01-01'), phrases)).toBe('перша');
    expect(phraseFor(key('2026-01-02'), phrases)).toBe('друга');
    expect(phraseFor(key('2026-01-03'), phrases)).toBe('третя');
    expect(phraseFor(key('2026-01-04'), phrases)).toBe('перша');
    expect(phraseFor(key('2025-12-31'), phrases)).toBe('друга');
  });
  it('is empty without phrases', () => {
    expect(phraseFor(key('2026-11-09'), [])).toBe('');
  });
});

describe('heroFor', () => {
  const settings = readSettings({ encouragement: ['ти тут — це вже половина справи :)'] });
  it('shows the phrase today', () => {
    expect(heroFor(key('2026-11-09'), key('2026-11-09'), settings)).toEqual({ kind: 'phrase', text: 'ти тут — це вже половина справи :)' });
  });
  it('says whose record a past day is', () => {
    expect(heroFor(key('2026-10-26'), key('2026-11-09'), settings)).toEqual({
      kind: 'past', text: 'це запис за пн, 26.10.2026.\nзміни збережуться в цей день.', bold: 'пн, 26.10.2026',
    });
  });
});

describe('goalLine', () => {
  it('reads «з N днів» with the right ending', () => {
    expect(goalLine({ done: 3, target: 6 })).toBe('цей тиждень: 3 з 6 днів');
    expect(goalLine({ done: 0, target: 1 })).toBe('цей тиждень: 0 з 1 дня');
    expect(goalLine({ done: 2, target: 2 })).toBe('цей тиждень: 2 з 2 днів');
  });
  it('is hidden without a goal', () => {
    expect(goalLine(null)).toBeNull();
  });
});

describe('sectionDone (waves 5 and 5b: the tick and «хороша робота <3»)', () => {
  const settings = readSettings(EXAMPLE_DIARY.profile);
  const day = (raw: Record<string, unknown>) => readDay(raw, '2026-11-09' as DayKey);

  it('nothing done on an empty day, and the note never counts', () => {
    for (const id of ['ck-morning', 'mw', 'dw', 'wo', 'mv', 'ck-evening', 'note'] as const) expect(sectionDone(id, day({}), settings)).toBe(false);
    expect(sectionDone('note', day({ note: 'було добре' }), settings)).toBe(false);
  });

  it('one zone, one lap, one answer count; the morning warm-up needs a finished level, the workout «закінчити тренування»', () => {
    expect(sectionDone('mw', day({ mw: { ticks: ['exercise-1'] } }), settings)).toBe(false);
    expect(sectionDone('mw', day({ mw: { times: { 'exercise-2': [12] } } }), settings)).toBe(false);
    expect(sectionDone('mw', day({ mw: { ticks: ['exercise-1', 'exercise-2'] } }), settings)).toBe(true);
    expect(sectionDone('dw', day({ dw: ['back'] }), settings)).toBe(true);
    expect(sectionDone('wo', day({ wo: { session: 'a', ex: { 'exercise-6': [{ r: 8 }] } } }), settings)).toBe(false);
    expect(sectionDone('wo', day({ wo: { session: 'a', ex: { 'exercise-6': [{ r: 8 }] }, done: true } }), settings)).toBe(true);
    expect(sectionDone('wo', day({ wo: { session: 'a', done: true } }), settings)).toBe(true);
    // only `true` counts (wave 5c: the key in the day)
    expect(sectionDone('wo', day({ wo: { session: 'a', done: 'yes' } }), settings)).toBe(false);
    expect(sectionDone('mv', day({ mv: { 'movement-1': { min: 20 } } }), settings)).toBe(true);
    expect(sectionDone('ck-evening', day({ t: { evening: { tiredness: 4 } } }), settings)).toBe(true);
  });

  it('a picked workout with nothing typed is not done yet; a morning answer is not the evening', () => {
    expect(sectionDone('wo', day({ wo: { session: 'a' } }), settings)).toBe(false);
    expect(sectionDone('ck-evening', day({ t: { morning: { energy: 5 } } }), settings)).toBe(false);
  });
});
