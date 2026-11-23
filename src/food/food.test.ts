import { describe, expect, it } from 'vitest';
import type { DayKey } from '../domain/dates';
import { emptyDay, readDay, writeDay, type Day } from '../domain/day';
import { dayBlocks } from '../domain/journal';
import { putMeal, removeMeal } from '../domain/log';
import { readSettings } from '../domain/settings';
import { EXAMPLE_DIARY } from '../domain/examples';
import {
  daySummary, dayTotals, itemKcal, kcalOf, onlyNumber, mealLine, mergeDishes, readFoodSettings, readMeals, searchDishes, totalsLine, type Dish, type Meal,
} from './food';
import { dishesPrompt, mealPrompt, readFoodPaste } from './food-paste';
import { foodCards } from './food-cards';
import { describeChanges } from '../paste/preview';
import { foodForAi, keepFood, withDishes, withFood, withRef } from './food-profile';

/* «їжа» (FOOD-SECTION.md) without the DOM. Invented data only. */

const DAY = '2026-11-23' as DayKey;
const oats: Meal = { t: '08:30', items: [{ name: 'вівсянка', portion: 1, p: 12, f: 8, c: 45, kcal: 300 }] };
const lunch: Meal = {
  t: '13:05',
  items: [
    { name: 'гречка', portion: 1.5, p: 6, f: 2, c: 30, kcal: 162 },
    { name: 'сирник', portion: 1, p: 10, f: 5, c: 10, kcal: 250, kcalManual: true },
  ],
};
const ON = readFoodSettings({ enabled: true });

describe('kcal', () => {
  it('counts 4 × protein + 9 × fat + 4 × carbs, whole', () => {
    expect(kcalOf(12, 8, 45)).toBe(300);
    expect(kcalOf(1.5, null, null)).toBe(6);
    expect(kcalOf(null, null, null)).toBeNull();
  });

  it('keeps the number written by hand', () => {
    expect(itemKcal({ p: 10, f: 5, c: 10, kcal: 250, kcalManual: true })).toBe(250);
    expect(itemKcal({ p: 10, f: 5, c: 10, kcal: 250 })).toBe(125);
  });

  it('multiplies a dish by its portion in the sums', () => {
    expect(dayTotals([oats, lunch])).toEqual({ kcal: 300 + 162 * 1.5 + 250, p: 12 + 9 + 10, f: 8 + 3 + 5, c: 45 + 45 + 10 });
  });
});

describe('what is stored', () => {
  it('a day keeps its meals by time and comes back the same', () => {
    const day: Day = { ...emptyDay(DAY), food: [lunch, oats] };
    const stored = putMeal(oats)(emptyDay(DAY));
    expect(stored.food).toEqual([oats]);
    const both = putMeal(lunch)(stored);
    expect(both.food!.map((m) => m.t)).toEqual(['08:30', '13:05']);
    expect(readDay(JSON.parse(JSON.stringify(writeDay(both))), DAY).food).toEqual(both.food);
    expect(writeDay(day)).not.toBeNull();
  });

  it('a day with only a meal is kept; without meals has no `food`', () => {
    const only = putMeal({ t: '09:00', items: [] })(emptyDay(DAY));
    expect(writeDay(only)).toMatchObject({ food: [{ t: '09:00', items: [] }] });
    expect(writeDay(removeMeal(0)(only))).toBeNull();
    expect(removeMeal(0)(only)).not.toHaveProperty('food');
  });

  it('a meal changed in place moves to its new time', () => {
    const day = putMeal(lunch)(putMeal(oats)(emptyDay(DAY)));
    const moved = putMeal({ ...oats, t: '20:00' }, 0)(day);
    expect(moved.food!.map((m) => m.t)).toEqual(['13:05', '20:00']);
  });

  it('drops what can not be read, never guesses', () => {
    expect(readMeals([{ t: '25:00', items: [] }, { t: '7:00' }, { t: '07:00', items: [{ name: '', p: -1 }, { name: 'яблуко', portion: 3, p: 0.3 }] }])).toEqual([
      { t: '07:00', items: [{ name: 'яблуко', portion: 1, p: 0.3, f: null, c: null, kcal: 1 }] },
    ]);
    expect(readMeals('ні')).toBeNull();
    expect(readDay({ food: [] }, DAY)).not.toHaveProperty('food');
  });

  it('a copy without `food` reads as before', () => {
    expect(readDay({ note: 'x' }, DAY).food).toBeUndefined();
  });
});

describe('the settings of «їжа»', () => {
  it('are off by default (FOOD-SECTION.md, risks), the rest on; «почати без ШІ» has them on (Olesia, 2026-11-23)', () => {
    expect(readSettings({}).food).toEqual({ enabled: false, macros: true, names: true, cardMacros: true, cardTimes: true, ref: {}, refKcalAuto: true, dishes: [] });
    expect(readSettings(EXAMPLE_DIARY.profile).food.enabled).toBe(true);
  });

  it('keep a guide line only for a number above zero', () => {
    expect(readFoodSettings({ ref: { p: 90, f: 0, c: 'ні' } }).ref).toEqual({ p: 90 });
    const profile = withRef(withRef({}, 'p', 90), 'kcal', 2000);
    expect(readFoodSettings(profile.food).ref).toEqual({ p: 90, kcal: 2000 });
    expect(readFoodSettings(withRef(profile, 'p', null).food).ref).toEqual({ kcal: 2000 });
  });

  it('store only what differs from the defaults', () => {
    expect(withFood({ x: 1 }, { enabled: true })).toEqual({ x: 1, food: { enabled: true } });
    expect(withFood({}, { enabled: true, macros: false }).food).toEqual({ enabled: true, macros: false });
  });

  it('add the dishes ticked in the sheet; a name already there stays as it was', () => {
    const tea: Dish = { name: 'Чай', p: 0, f: 0, c: 0, kcal: 0, portion: '' };
    const profile = withDishes({}, [tea]);
    const again = withDishes(profile, [{ ...tea, name: 'чай', p: 5 }, { ...tea, name: 'кава' }]);
    expect(readFoodSettings(again.food).dishes.map((d) => [d.name, d.p])).toEqual([['Чай', 0], ['кава', 0]]);
  });

  it('reach the AI only as switches: no dishes, guides or cards (Olesia, 2026-11-23)', () => {
    const profile = withFood(withRef({ a: 1 }, 'p', 90), { enabled: true, macros: false, dishes: [{ name: 'чай', p: 0, f: 0, c: 0, kcal: 0, portion: '' }] });
    expect(foodForAi(profile)).toEqual({ a: 1, food: { enabled: true, macros: false } });
    expect(foodForAi({ a: 1 })).toEqual({ a: 1 });
  });

  it('from an AI: its switches over what the app keeps; none keeps it as it was', () => {
    const now = withFood(withRef({}, 'p', 90), { enabled: false, cardTimes: false, dishes: [{ name: 'чай', p: 0, f: 0, c: 0, kcal: 0, portion: '' }] });
    const on = readFoodSettings(keepFood(now, { food: { enabled: true, macros: false } }).food);
    expect(on).toMatchObject({ enabled: true, macros: false, names: true, cardTimes: false, ref: { p: 90 } });
    expect(on.dishes.map((d) => d.name)).toEqual(['чай']);
    expect(keepFood(now, { x: 1 })).toEqual({ x: 1, food: now.food });
    expect(keepFood(null, { x: 1 })).toEqual({ x: 1 });
  });

  it('count the kcal guide from the other three, until one is typed (Olesia, 2026-11-23)', () => {
    const three = withRef(withRef(withRef({}, 'p', 100), 'f', 50), 'c', 200);
    expect(readFoodSettings(three.food)).toMatchObject({ ref: { kcal: 1650 }, refKcalAuto: true });
    expect((three.food as { ref: object }).ref).not.toHaveProperty('kcal');
    expect(readFoodSettings(withRef({}, 'p', 100).food).ref).toEqual({ p: 100 });
    const own = withRef(three, 'kcal', 1800);
    expect(readFoodSettings(own.food)).toMatchObject({ ref: { kcal: 1800 }, refKcalAuto: false });
    expect(readFoodSettings(withRef(own, 'kcal', null).food).ref.kcal).toBe(1650);
  });
});

describe('words', () => {
  it('sum a day without judging it: «/ 90» next to a number with a guide line', () => {
    // the thousands keep together: a no-break space, as the language groups them
    const NO_BREAK = [String.fromCharCode(0xa0), String.fromCharCode(0x202f)];
    const plain = (text: string) => NO_BREAK.reduce((line, space) => line.split(space).join(' '), text);
    expect(NO_BREAK).toContain(totalsLine({ kcal: 1240, p: 48, f: 40.4, c: 150 }).charAt(1));
    expect(plain(totalsLine({ kcal: 1240, p: 48, f: 40.4, c: 150 }))).toBe('1 240 ккал · б 48 · ж 40 · в 150');
    expect(plain(totalsLine({ kcal: 1240, p: 48, f: 40, c: 150 }, { p: 90 }))).toBe('1 240 ккал · б 48 / 90 · ж 40 · в 150');
  });

  it('count meals when the numbers are off', () => {
    expect(daySummary([oats, lunch, oats], { ...ON, macros: false })).toBe('3 прийоми');
    expect(daySummary([], ON)).toBe('');
  });

  it('show a meal by its names, with portions, and its sum', () => {
    expect(mealLine(lunch, ON)).toBe('гречка ×1½, сирник · 493 ккал · б 19 · ж 8 · в 55');
    expect(mealLine(lunch, { ...ON, macros: false })).toBe('гречка ×1½, сирник');
    expect(mealLine(lunch, { ...ON, macros: false, names: false })).toBe('');
  });

  it('put the meals in the day of the history, after movement', () => {
    const settings = { ...readSettings(EXAMPLE_DIARY.profile), food: ON };
    const day: Day = { ...emptyDay(DAY), food: [oats, lunch] };
    const block = dayBlocks(day, {}, settings).find((b) => b.title === 'їжа');
    expect(block).toMatchObject({ kind: 'values', rows: [{ label: '08:30' }, { label: '13:05' }, { label: 'за день' }] });
  });
});

describe('«мої страви»', () => {
  const dishes: Dish[] = ['вівсянка', 'омлет з овочами', 'суп овочевий', 'Овочі гриль'].map((name) => ({ name, p: 1, f: 1, c: 1, kcal: 17, portion: '' }));

  it('find a dish starting with the query first, any case', () => {
    expect(searchDishes(dishes, 'ов').map((d) => d.name)).toEqual(['Овочі гриль', 'вівсянка', 'омлет з овочами', 'суп овочевий'].filter((n) => n !== 'вівсянка'));
    expect(searchDishes(dishes, '', 2)).toHaveLength(2);
  });

  it('replace a twin only when asked', () => {
    const twin = { ...dishes[0]!, name: 'ВІВСЯНКА', p: 9 };
    expect(mergeDishes(dishes, [twin], false)[0]!.p).toBe(1);
    expect(mergeDishes(dishes, [twin], true)[0]!.p).toBe(9);
  });
});

describe('an AI answer about food', () => {
  const answer = (dishes: unknown, extra: Record<string, unknown> = {}) =>
    `ось:\n\`\`\`json\n${JSON.stringify({ format: 'body.log-food', lang: 'uk', dishes, ...extra })}\n\`\`\`\nсмачного`;

  it('reads the dishes from a fenced block, kcal counted by the app', () => {
    expect(readFoodPaste(answer([{ name: 'борщ', portion: 'тарілка', p: 8, f: 6, c: 20, kcal: 9999 }]))).toEqual({
      kind: 'ok', dishes: [{ name: 'борщ', p: 8, f: 6, c: 20, kcal: 166, portion: 'тарілка' }],
    });
  });

  it('refuses what is not ours, names every broken dish', () => {
    expect(readFoodPaste('просто текст')).toEqual({ kind: 'refused', lines: [expect.stringContaining('не схоже')] });
    expect(readFoodPaste(answer([]))).toMatchObject({ kind: 'refused' });
    const broken = readFoodPaste(answer([{ name: '', p: 1 }, { name: 'суп', p: 'багато' }]));
    expect(broken).toEqual({ kind: 'refused', lines: ['страва 1: немає назви', 'страва 2 «суп»: білки мають бути числом від 0 до 1000'] });
  });

  it('refuses dishes in russian', () => {
    expect(readFoodPaste(answer([{ name: 'суп', p: 1 }], { lang: 'ru' }))).toMatchObject({ kind: 'refused', lines: ['страви російською застосунок не приймає.'] });
    expect(readFoodPaste(answer([{ name: 'сырники', p: 1 }]))).toMatchObject({ kind: 'refused', lines: [expect.stringContaining('російською')] });
  });

  it('has two short prompts of its own, both with the format', () => {
    for (const prompt of [dishesPrompt(), mealPrompt()]) {
      expect(prompt).toContain('"format": "body.log-food"');
      expect(prompt.length).toBeLessThan(1500);
    }
  });
});

describe('the cards', () => {
  const week = ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'] as DayKey[];
  const days: Record<string, Day> = { '2026-11-22': { ...emptyDay('2026-11-22' as DayKey), food: [oats] }, '2026-11-23': { ...emptyDay(DAY), food: [oats, lunch] } };
  const at = (key: DayKey) => days[key] ?? emptyDay(key);

  it('are none while the section is off, and each can be switched off', () => {
    expect(foodCards(week, at, readFoodSettings({}))).toEqual([]);
    expect(foodCards(week, at, ON).map((c) => c.id)).toEqual(['food-macros', 'food-times']);
    expect(foodCards(week, at, { ...ON, cardMacros: false }).map((c) => c.id)).toEqual(['food-times']);
    expect(foodCards(week, at, { ...ON, macros: false }).map((c) => c.id)).toEqual(['food-times']);
  });

  it('average over the days with meals only, a bar per day', () => {
    const [macros] = foodCards(week, at, ON);
    expect(macros).toMatchObject({ kind: 'food-macros', averages: { p: Math.round((12 + 31) / 2) } });
    expect((macros as unknown as { bars: unknown[] }).bars.filter(Boolean)).toHaveLength(2);
  });

  it('put every meal on its hour', () => {
    const times = foodCards(week, at, ON)[1] as unknown as { days: { meals: { at: number }[] }[] };
    expect(times.days.at(-1)!.meals.map((m) => m.at)).toEqual([8.5, 13 + 5 / 60]);
  });
});

describe('Olesia, 2026-11-23', () => {
  it('a number field keeps only a number: digits and one decimal place', () => {
    expect(onlyNumber('12')).toBe('12');
    expect(onlyNumber('1o2 г')).toBe('12');
    expect(onlyNumber('-5')).toBe('5');
    expect(onlyNumber('4,55')).toBe('4,5');
    expect(onlyNumber('4.5.6')).toBe('4.5');
    expect(onlyNumber('багато')).toBe('');
  });

  it('the full name finds its dish, whatever the apostrophe', () => {
    const dishes: Dish[] = [{ name: 'мʼясо з рисом', p: 1, f: 1, c: 1, kcal: 17, portion: '' }];
    expect(searchDishes(dishes, 'мʼясо з рисом')).toHaveLength(1);
    expect(searchDishes(dishes, "М'ясо  з рисом")).toHaveLength(1);
  });

  it('«ось що зміниться» names «їжа» when an AI switches it', () => {
    const names = { accents: new Proxy({}, { get: () => 'колір' }), accessibility: new Proxy({}, { get: () => 'x' }) } as never;
    const off = { ...EXAMPLE_DIARY.profile, food: { enabled: false } };
    expect(describeChanges(off, EXAMPLE_DIARY.profile, names).changed).toContain('їжа: білки, жири, вуглеводи');
    expect(describeChanges(null, { ...EXAMPLE_DIARY.profile, food: { enabled: true, macros: false } }, names).added).toContain('їжа: назви страв і час');
  });
});
