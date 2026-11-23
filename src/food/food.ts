import { lang, t } from '../i18n/lang';
import { formatNumber, plural } from '../domain/numbers';

/*
 * The section «їжа» (FOOD-SECTION.md, Olesia 2026-11-22): what and when the
 * person ate, and how much protein, fat and carbs it held. No goals that
 * press: no «too much», no «too little», no red, no grades. An optional
 * guide line («орієнтир») per number is only a line on the chart.
 *
 * Glossary
 * - meal («прийом»): a time and any number of dishes.
 * - item: one dish in a meal; its numbers are per one portion, `portion`
 *   multiplies them (½ · 1 · 1½ · 2). It keeps its own copy of the numbers,
 *   so a change of «мої страви» never changes what was eaten before.
 * - dish («моя страва»): a saved dish with its numbers per portion, kept in
 *   the settings (`food.dishes`), edited only there.
 * - kcal: counted from the rest, 4 × p + 9 × f + 4 × c, unless the person
 *   wrote their own (`kcalManual`, e.g. from a label).
 * No DOM here.
 */

export interface FoodItem {
  readonly name: string;
  readonly portion: number;
  readonly p: number | null;
  readonly f: number | null;
  readonly c: number | null;
  /** Per portion: the person's own number when `kcalManual`, else counted. */
  readonly kcal: number | null;
  readonly kcalManual?: true;
  /** The numbers are an AI's estimate. */
  readonly ai?: true;
}

export interface Meal {
  /** «HH:MM» */
  readonly t: string;
  readonly items: readonly FoodItem[];
}

export interface Dish {
  readonly name: string;
  readonly p: number | null;
  readonly f: number | null;
  readonly c: number | null;
  readonly kcal: number | null;
  readonly kcalManual?: true;
  /** What one portion is, as text («тарілка», «100 г»). */
  readonly portion: string;
}

export type FoodNumber = 'kcal' | 'p' | 'f' | 'c';
export const FOOD_NUMBERS: readonly FoodNumber[] = ['kcal', 'p', 'f', 'c'];

export interface FoodSettings {
  /** The section shows on home. Off by default (FOOD-SECTION.md, risks: counting can hurt). */
  readonly enabled: boolean;
  /** Protein, fat, carbs and kcal; off → only the names of dishes and the time. */
  readonly macros: boolean;
  /** Names of dishes; off together with `macros` → only the time of a meal. */
  readonly names: boolean;
  readonly cardMacros: boolean;
  readonly cardTimes: boolean;
  /** The guide line per number; none = no line. */
  readonly ref: Readonly<Partial<Record<FoodNumber, number>>>;
  /**
   * The kcal guide is counted from the other three (Olesia, 2026-11-23), as in
   * the sheet, once all three are there; a number typed in its field wins.
   */
  readonly refKcalAuto: boolean;
  readonly dishes: readonly Dish[];
}

export const PORTIONS = [0.5, 1, 1.5, 2] as const;
export const NAME_MAX = 80;
export const PORTION_NOTE_MAX = 60;

type Raw = { readonly [key: string]: unknown };
const isRaw = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const raw = (value: unknown): Raw => (isRaw(value) ? value : {});
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);
const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** One decimal place, as typed numbers are kept. */
export const tenth = (value: number) => Math.round(value * 10) / 10;

/**
 * What a number field of «їжа» keeps of what was typed (Olesia, 2026-11-23:
 * only numbers): digits and one decimal comma or dot with one digit after it
 * (FOOD-SECTION.md, «Округлення»). Letters, minus and spaces never get in.
 */
export function onlyNumber(typed: string): string {
  const cleaned = typed.replace(/[^\d.,]/g, '');
  const at = cleaned.search(/[.,]/);
  if (at === -1) return cleaned;
  return `${cleaned.slice(0, at + 1)}${cleaned.slice(at + 1).replace(/[.,]/g, '').slice(0, 1)}`;
}

/** kcal from protein, fat and carbs; null when none of them is known. */
export function kcalOf(p: number | null, f: number | null, c: number | null): number | null {
  if (p === null && f === null && c === null) return null;
  return Math.round(4 * (p ?? 0) + 9 * (f ?? 0) + 4 * (c ?? 0));
}

/** kcal of one portion: the person's own number, or counted. */
export const itemKcal = (item: Pick<FoodItem, 'p' | 'f' | 'c' | 'kcal' | 'kcalManual'>) =>
  (item.kcalManual ? item.kcal : kcalOf(item.p, item.f, item.c));

/* ---- reading what is stored ---- */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTime = (value: unknown): value is string => typeof value === 'string' && TIME.test(value);

function readItem(value: unknown): FoodItem | null {
  const item = raw(value);
  const name = text(item.name, NAME_MAX);
  const portion = PORTIONS.find((x) => x === item.portion) ?? 1;
  const [p, f, c] = [num(item.p), num(item.f), num(item.c)];
  const manual = item.kcalManual === true && num(item.kcal) !== null;
  if (name === '' && p === null && f === null && c === null && !manual) return null;
  return {
    name, portion, p, f, c,
    kcal: manual ? num(item.kcal) : kcalOf(p, f, c),
    ...(manual ? { kcalManual: true as const } : {}),
    ...(item.ai === true ? { ai: true as const } : {}),
  };
}

function readMeal(value: unknown): Meal | null {
  const meal = raw(value);
  if (!isTime(meal.t)) return null;
  const items = Array.isArray(meal.items) ? meal.items.map(readItem).filter((x): x is FoodItem => x !== null) : [];
  return { t: meal.t, items };
}

/** The meals of a day, by time; null when there are none. */
export function readMeals(value: unknown): Meal[] | null {
  if (!Array.isArray(value)) return null;
  const meals = value.map(readMeal).filter((x): x is Meal => x !== null);
  return meals.length ? sortMeals(meals) : null;
}

export const sortMeals = (meals: readonly Meal[]): Meal[] => [...meals].sort((a, b) => a.t.localeCompare(b.t));

function readDish(value: unknown): Dish | null {
  const dish = raw(value);
  const name = text(dish.name, NAME_MAX);
  if (name === '') return null;
  const [p, f, c] = [num(dish.p), num(dish.f), num(dish.c)];
  const manual = dish.kcalManual === true && num(dish.kcal) !== null;
  return {
    name, p, f, c,
    kcal: manual ? num(dish.kcal) : kcalOf(p, f, c),
    ...(manual ? { kcalManual: true as const } : {}),
    portion: text(dish.portion, PORTION_NOTE_MAX),
  };
}

/** `food` of the settings, filled in: anything missing gets its default. */
export function readFoodSettings(value: unknown): FoodSettings {
  const food = raw(value);
  const ref = raw(food.ref);
  const refs: Partial<Record<FoodNumber, number>> = {};
  for (const key of FOOD_NUMBERS) {
    const n = num(ref[key]);
    if (n !== null && n > 0) refs[key] = n;
  }
  const refKcalAuto = refs.kcal === undefined;
  if (refKcalAuto && refs.p !== undefined && refs.f !== undefined && refs.c !== undefined) refs.kcal = kcalOf(refs.p, refs.f, refs.c)!;
  return {
    enabled: food.enabled === true,
    macros: food.macros !== false,
    names: food.names !== false,
    cardMacros: food.cardMacros !== false,
    cardTimes: food.cardTimes !== false,
    ref: refs,
    refKcalAuto,
    dishes: Array.isArray(food.dishes) ? food.dishes.map(readDish).filter((x): x is Dish => x !== null) : [],
  };
}

/* ---- sums ---- */

export type Totals = Readonly<Record<FoodNumber, number>>;
const ZERO: Totals = { kcal: 0, p: 0, f: 0, c: 0 };

export function itemTotals(item: FoodItem): Totals {
  const k = item.portion;
  return { kcal: (itemKcal(item) ?? 0) * k, p: (item.p ?? 0) * k, f: (item.f ?? 0) * k, c: (item.c ?? 0) * k };
}

const add = (a: Totals, b: Totals): Totals => ({ kcal: a.kcal + b.kcal, p: a.p + b.p, f: a.f + b.f, c: a.c + b.c });

export const mealTotals = (meal: Meal): Totals => meal.items.map(itemTotals).reduce(add, ZERO);
export const dayTotals = (meals: readonly Meal[]): Totals => meals.map(mealTotals).reduce(add, ZERO);

/** Whether a meal holds any number at all (a meal of names only has no sum to show). */
export const hasNumbers = (meal: Meal) => meal.items.some((item) => item.p !== null || item.f !== null || item.c !== null || item.kcal !== null);

/* ---- words ---- */

/** «1 240»: whole numbers, grouped as the language groups them. */
export function whole(value: number): string {
  return new Intl.NumberFormat(lang() === 'en' ? 'en-GB' : 'uk-UA', { maximumFractionDigits: 0 }).format(Math.round(value));
}

export const LETTERS: Record<FoodNumber, string> = { kcal: t('ккал'), p: t('б'), f: t('ж'), c: t('в') };

/**
 * Beta 1.2.3 (Olesia, 2026-11-23): a field («ж 33 / 60») wraps whole, never in pieces.
 * Inside a field the spaces don't break; the «·» keeps to the field before it,
 * so a line breaks only after «· ».
 */
const KEEP = ' ';
const SEP = `${KEEP}· `;

/**
 * «1 240 ккал · б 48 · ж 40 · в 150»; with a guide line, «б 48 / 90»:
 * the same colour, no word about more or less.
 */
export function totalsLine(totals: Totals, ref: FoodSettings['ref'] = {}): string {
  const guide = (key: FoodNumber) => (ref[key] === undefined ? '' : `${KEEP}/${KEEP}${whole(ref[key]!)}`);
  return [
    `${whole(totals.kcal)}${guide('kcal')}${KEEP}${LETTERS.kcal}`,
    ...(['p', 'f', 'c'] as const).map((key) => `${LETTERS[key]}${KEEP}${whole(totals[key])}${guide(key)}`),
  ].join(SEP);
}

const MEALS = ['прийом', 'прийоми', 'прийомів'] as const;
export const mealsCount = (n: number) => `${n} ${plural(n, MEALS)}`;

const PORTION_WORDS: Record<number, string> = { 0.5: '½', 1: '1', 1.5: '1½', 2: '2' };
export const portionLabel = (portion: number) => PORTION_WORDS[portion] ?? formatNumber(portion);

/** «вівсянка ×1½, банан» — the names of a meal. */
export function mealNames(meal: Meal): string {
  return meal.items.map((item) => `${item.name || t('без назви')}${item.portion === 1 ? '' : ` ×${portionLabel(item.portion)}`}`).join(', ');
}

/** The line of a meal on home and in the history: its names and, when there are numbers, its sum. */
export function mealLine(meal: Meal, settings: FoodSettings): string {
  const names = settings.macros || settings.names ? mealNames(meal) : '';
  const sum = settings.macros && hasNumbers(meal) ? totalsLine(mealTotals(meal)) : '';
  return [names, sum].filter(Boolean).join(SEP);
}

/** What the section's header says about the day. */
export function daySummary(meals: readonly Meal[], settings: FoodSettings): string {
  if (meals.length === 0) return '';
  if (!settings.macros || !meals.some(hasNumbers)) return mealsCount(meals.length);
  return totalsLine(dayTotals(meals), settings.ref);
}

/* ---- «мої страви» ---- */

/** A name as the search compares it: any case, any apostrophe (' ’ ʼ), spaces squeezed. */
export const key = (name: string) => name.trim().toLocaleLowerCase().replace(/['’ʼ`]/g, 'ʼ').replace(/\s+/g, ' ');

export const sameName = (a: string, b: string) => key(a) === key(b);

export const findDish = (dishes: readonly Dish[], name: string) => dishes.find((dish) => sameName(dish.name, name));

/** Dishes whose name holds the query, the ones starting with it first; all of them for an empty query. */
export function searchDishes(dishes: readonly Dish[], query: string, limit = Infinity): Dish[] {
  const q = key(query);
  if (q === '') return dishes.slice(0, limit);
  const starts = dishes.filter((dish) => key(dish.name).startsWith(q));
  const inside = dishes.filter((dish) => !key(dish.name).startsWith(q) && key(dish.name).includes(q));
  return [...starts, ...inside].slice(0, limit);
}

/** The dish as stored in the settings. */
export function writeDish(dish: Dish): Raw {
  return {
    name: dish.name,
    p: dish.p, f: dish.f, c: dish.c,
    ...(dish.kcalManual ? { kcal: dish.kcal, kcalManual: true } : {}),
    ...(dish.portion ? { portion: dish.portion } : {}),
  };
}

/** Adds dishes; `replace` says what to do with one whose name is already there. */
export function mergeDishes(dishes: readonly Dish[], added: readonly Dish[], replace: boolean): Dish[] {
  const result = [...dishes];
  for (const dish of added) {
    const at = result.findIndex((x) => sameName(x.name, dish.name));
    if (at === -1) result.push(dish);
    else if (replace) result[at] = dish;
  }
  return result;
}

/** The meal item from a dish, one portion. */
export const itemFromDish = (dish: Dish): FoodItem => ({
  name: dish.name, portion: 1, p: dish.p, f: dish.f, c: dish.c, kcal: dish.kcal, ...(dish.kcalManual ? { kcalManual: true as const } : {}),
});

/** A dish from what was eaten, to keep in «мої страви». */
export const dishFromItem = (item: FoodItem): Dish => ({
  name: item.name, p: item.p, f: item.f, c: item.c, kcal: item.kcal, ...(item.kcalManual ? { kcalManual: true as const } : {}), portion: '',
});
