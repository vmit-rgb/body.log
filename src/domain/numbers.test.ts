import { describe, expect, it } from 'vitest';
import { countLabel, formatNumber, parseNumber, plural, readNumber } from './numbers';

describe('parseNumber', () => {
  it.each<[string, number | null]>([
    ['12', 12],
    ['2,5', 2.5],
    [' 7.25 ', 7.25],
    ['', null],
    ['   ', null],
    ['дванадцять', null],
    ['1e400', null],
    // D-01: thousands typed with a space of any kind
    ['10 000', 10000],
    ['10 000', 10000],
    ['1 250,5', 1250.5],
    ['1.5', 1.5],
    ['1,5', 1.5],
    ['.5', 0.5],
    ['5,', 5],
    // not numbers: nothing is guessed
    ['-5', null],
    ['−5', null],
    ['120/80', null],
    ['70кг', null],
    ['1,2,3', null],
    ['0x10', null],
    ['1e3', null],
    [',', null],
  ])('reads «%s» as %s', (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });
});

describe('readNumber: why a field is not a number (D-01)', () => {
  it.each<[string, string]>([
    ['', 'empty'],
    ['  ', 'empty'],
    ['12', 'number'],
    ['-5', 'negative'],
    ['−2,5', 'negative'],
    ['– 3', 'negative'],
    ['сімдесят', 'not-a-number'],
    ['120/80', 'not-a-number'],
    ['-', 'not-a-number'],
    ['-кг', 'not-a-number'],
  ])('«%s» is %s', (input, kind) => {
    expect(readNumber(input).kind).toBe(kind);
  });

  it('gives the value of a number', () => {
    expect(readNumber('10 000')).toEqual({ kind: 'number', value: 10000 });
  });
});

describe('formatNumber', () => {
  it('writes the Ukrainian comma and at most two decimals', () => {
    expect(formatNumber(2.5)).toBe('2,5');
    expect(formatNumber(3.14159)).toBe('3,14');
    expect(formatNumber(40)).toBe('40');
  });

  it('writes nothing for no number', () => {
    expect(formatNumber(null)).toBe('');
  });
});

describe('plural', () => {
  const laps = (n: number) => plural(n, ['коло', 'кола', 'кіл']);
  it.each<[number, string]>([[1, 'коло'], [2, 'кола'], [4, 'кола'], [5, 'кіл'], [11, 'кіл'], [14, 'кіл'], [21, 'коло'], [22, 'кола'], [0, 'кіл']])(
    '%s → %s', (n, word) => {
      expect(laps(n)).toBe(word);
    },
  );
});

describe('countLabel (checklist/exercise «n разів»)', () => {
  it('names a plain count or a range with the right word', () => {
    expect(countLabel('1')).toBe('1 раз');
    expect(countLabel('3')).toBe('3 рази');
    expect(countLabel('10')).toBe('10 разів');
    expect(countLabel('8–12')).toBe('8–12 разів');
    expect(countLabel('2-4')).toBe('2-4 рази');
  });

  it('keeps anything else as the person wrote it, and nothing as nothing', () => {
    expect(countLabel('10 на кожну ногу')).toBe('10 на кожну ногу');
    expect(countLabel('до втоми')).toBe('до втоми');
    expect(countLabel('')).toBe('');
  });
});
