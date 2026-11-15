import { describe, expect, it } from 'vitest';
import type { DayKey } from './dates';
import { backupLine, copyFileName, needsBackup, unreadableFileName } from './backup';

const key = (text: string) => text as DayKey;
const TODAY = key('2026-11-20');

describe('backupLine (COPY.md, Menu)', () => {
  it('says there is no copy yet', () => {
    expect(backupLine(null, TODAY)).toBe('копії ще немає');
  });

  it('says today for a copy saved today', () => {
    expect(backupLine(TODAY, TODAY)).toBe('остання копія — сьогодні');
  });

  it.each([
    ['2026-11-19', 'остання копія — 1 день тому'],
    ['2026-11-17', 'остання копія — 3 дні тому'],
    ['2026-11-15', 'остання копія — 5 днів тому'],
    ['2026-11-09', 'остання копія — 11 днів тому'],
    ['2026-10-30', 'остання копія — 21 день тому'],
    ['2026-10-29', 'остання копія — 22 дні тому'],
  ])('counts the days since %s', (saved, line) => {
    expect(backupLine(key(saved), TODAY)).toBe(line);
  });

  it('reads a date after today (a phone clock moved back) as today', () => {
    expect(backupLine(key('2026-11-22'), TODAY)).toBe('остання копія — сьогодні');
  });
});

describe('needsBackup: the reminder after 1 day (D-03; Olesia, 2026-11-08 and 2026-11-14)', () => {
  it('reminds when there are records and no copy', () => {
    expect(needsBackup(null, TODAY, true)).toBe(true);
  });

  it('stays quiet with no records and no copy', () => {
    expect(needsBackup(null, TODAY, false)).toBe(false);
  });

  it('stays quiet on the day of the copy and reminds from the next day', () => {
    expect(needsBackup(TODAY, TODAY, true)).toBe(false);
    expect(needsBackup(key('2026-11-19'), TODAY, true)).toBe(true);
    expect(needsBackup(key('2026-11-17'), TODAY, true)).toBe(true);
  });

  it('a copy dated after today (the clock moved back) does not remind', () => {
    expect(needsBackup(key('2026-11-22'), TODAY, true)).toBe(false);
  });
});

describe('unreadableFileName', () => {
  it('does not name records the app could not read as a copy', () => {
    expect(unreadableFileName(TODAY)).toBe('trekr-nechytani-zapysy-2026-11-20.json');
  });
});

describe('copyFileName', () => {
  it('names the file as «бета 0.81» does, so both apps know it', () => {
    expect(copyFileName(TODAY)).toBe('trekr-kopiya-2026-11-20.json');
  });
});
