import type { DayKey } from '../domain/dates';
import type { Day } from '../domain/day';
import { esc } from '../ui/html';
import { t } from '../i18n/lang';
import { dayTotals, hasNumbers, itemKcal, LETTERS, whole, type FoodNumber, type FoodSettings, type Meal } from './food';

/*
 * Two cards of «їжа» in the carousel «середнє за 7 днів» (FOOD-SECTION.md,
 * «Картки з графіками»), each can be switched off. Neutral colours: no red,
 * no green, nothing «done» or «not done».
 * 1. protein, fat, carbs: bars per day (protein in the accent, fat and carbs
 *    muted), kcal as a number over the day (up to 7 days), the guide lines
 *    dashed with «орієнтир»; over 31 days a bar per week.
 * 2. the time of meals: a row per day, hours across (0–24), a dot per meal,
 *    bigger for more kcal; long gaps without food are seen at once.
 * Drawn in HTML and CSS, so the width of the phone doesn't matter.
 */

export interface FoodBar { readonly start: DayKey; readonly p: number; readonly f: number; readonly c: number; readonly kcal: number }

export type FoodCard =
  | { readonly id: 'food-macros'; readonly name: string; readonly kind: 'food-macros'; readonly averages: Readonly<Record<FoodNumber, number>>; readonly bars: readonly (FoodBar | null)[]; readonly starts: readonly DayKey[]; readonly weekly: boolean; readonly ref: FoodSettings['ref'] }
  | { readonly id: 'food-times'; readonly name: string; readonly kind: 'food-times'; readonly days: readonly { readonly date: DayKey; readonly meals: readonly { readonly at: number; readonly kcal: number | null; readonly t: string }[] }[]; readonly cut: boolean }
  | { readonly id: 'food-macros' | 'food-times'; readonly name: string; readonly kind: 'empty' };

const MACROS_NAME = t('їжа: білки, жири, вуглеводи');
const TIMES_NAME = t('їжа: час прийомів');
/** Up to this many days the times card shows every day; past it, the last ones. */
const TIME_ROWS = 14;
const DAILY_UP_TO = 31;

const mealsOf = (day: Day): readonly Meal[] => day.food ?? [];

function macrosCard(keys: readonly DayKey[], dayAt: (key: DayKey) => Day, settings: FoodSettings): FoodCard {
  const counted = keys.map(dayAt).filter((day) => mealsOf(day).some(hasNumbers));
  if (counted.length === 0) return { id: 'food-macros', name: MACROS_NAME, kind: 'empty' };
  const totals = counted.map((day) => dayTotals(mealsOf(day)));
  const mean = (key: FoodNumber) => Math.round(totals.reduce((sum, x) => sum + x[key], 0) / totals.length);
  const groups = keys.length <= DAILY_UP_TO ? keys.map((key) => [key]) : Array.from({ length: Math.ceil(keys.length / 7) }, (_, i) => keys.slice(i * 7, i * 7 + 7));
  const bars = groups.map((group) => {
    const days = group.map(dayAt).filter((day) => mealsOf(day).some(hasNumbers)).map((day) => dayTotals(mealsOf(day)));
    if (days.length === 0) return null;
    const avg = (key: FoodNumber) => days.reduce((sum, x) => sum + x[key], 0) / days.length;
    return { start: group[0]!, p: avg('p'), f: avg('f'), c: avg('c'), kcal: avg('kcal') };
  });
  return {
    id: 'food-macros', name: MACROS_NAME, kind: 'food-macros',
    averages: { kcal: mean('kcal'), p: mean('p'), f: mean('f'), c: mean('c') },
    bars, starts: groups.map((group) => group[0]!), weekly: groups.length !== keys.length, ref: settings.ref,
  };
}

const hours = (time: string) => Number(time.slice(0, 2)) + Number(time.slice(3)) / 60;

function timesCard(keys: readonly DayKey[], dayAt: (key: DayKey) => Day, settings: FoodSettings): FoodCard {
  if (!keys.some((key) => mealsOf(dayAt(key)).length)) return { id: 'food-times', name: TIMES_NAME, kind: 'empty' };
  const shown = keys.slice(-TIME_ROWS);
  return {
    id: 'food-times', name: TIMES_NAME, kind: 'food-times', cut: shown.length < keys.length,
    days: shown.map((date) => ({
      date,
      meals: mealsOf(dayAt(date)).map((meal) => ({
        at: hours(meal.t),
        t: meal.t,
        kcal: settings.macros && hasNumbers(meal) ? meal.items.reduce((sum, item) => sum + (itemKcal(item) ?? 0) * item.portion, 0) : null,
      })),
    })),
  };
}

/** The cards of «їжа» that are switched on; none while the section is off. */
export function foodCards(keys: readonly DayKey[], dayAt: (key: DayKey) => Day, settings: FoodSettings): FoodCard[] {
  if (!settings.enabled || keys.length === 0) return [];
  return [
    ...(settings.macros && settings.cardMacros ? [macrosCard(keys, dayAt, settings)] : []),
    ...(settings.cardTimes ? [timesCard(keys, dayAt, settings)] : []),
  ];
}

/* ---- markup ---- */

const WEEKDAYS = [t('нд'), t('пн'), t('вт'), t('ср'), t('чт'), t('пт'), t('сб')];
const weekday = (key: DayKey) => WEEKDAYS[new Date(`${key}T12:00:00Z`).getUTCDay()]!;
const dayMonth = (key: DayKey) => `${key.slice(8)}.${key.slice(5, 7)}`;
const pct = (value: number) => `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;

/** A round step for 3–5 lines of the y axis: 1, 2 or 5 times a power of ten. */
export function gridStep(max: number): number {
  const rough = Math.max(max, 1) / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  return [1, 2, 5, 10].map((k) => k * power).find((step) => step >= rough)!;
}

/*
 * The y axis in grams with a line per step (Olesia, 2026-11-23: the labels on
 * the guide lines overlapped the bars); a guide line is dashed in its bar's
 * colour, and the legend says what the dashes are.
 */
function macrosMarkup(card: Extract<FoodCard, { kind: 'food-macros' }>): string {
  const grams = (['p', 'f', 'c'] as const);
  const highest = Math.max(1, ...card.bars.flatMap((bar) => (bar ? grams.map((key) => bar[key]) : [])), ...grams.map((key) => card.ref[key] ?? 0));
  const step = gridStep(highest);
  const top = Math.ceil(highest / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const at = (value: number) => (value / top).toFixed(3);
  const axis = ticks.map((v) => `<span class="food-bars__tick t-3rd-regular" style="--at: ${at(v)}">${whole(v)}</span>`).join('');
  const grid = ticks.slice(1).map((v) => `<span class="food-bars__grid" style="--at: ${at(v)}"></span>`).join('');
  const few = card.bars.length <= 7;
  const guided = grams.filter((key) => card.ref[key] !== undefined);
  const refs = guided.map((key) => `<span class="food-bars__ref food-bars__ref--${key}" style="--at: ${at(card.ref[key]!)}"></span>`).join('');
  const days = card.bars.map((bar, i) => `
      <div class="food-bars__day">${bar && few ? `<span class="food-bars__kcal t-3rd-semibold">${whole(bar.kcal)}</span>` : ''}
        <div class="food-bars__group">${bar ? grams.map((key) => `<span class="food-bar food-bar--${key}" style="height: ${pct((bar[key] / top) * 100)}"></span>`).join('') : ''}</div>
        <span class="food-bars__x t-3rd-regular">${few ? weekday(card.starts[i]!) : i === 0 || i === card.bars.length - 1 ? dayMonth(card.starts[i]!) : ''}</span>
      </div>`).join('');
  const avg = card.averages;
  const kcalRef = card.ref.kcal === undefined ? '' : ` / ${whole(card.ref.kcal)}`;
  return `<ul class="avgs" role="list">
      <li class="avg"><span class="avg__label t-3rd-semibold">${LETTERS.kcal}</span> <b class="avg__value t-1st-bold">${whole(avg.kcal)}${kcalRef}</b></li>${grams.map((key) => `
      <li class="avg"><span class="avg__label t-3rd-semibold">${LETTERS[key]}</span> <b class="avg__value t-1st-bold">${whole(avg[key])}${card.ref[key] === undefined ? '' : ` / ${whole(card.ref[key]!)}`}</b></li>`).join('')}</ul>
    <div class="food-bars" aria-hidden="true"><div class="food-bars__y">${axis}</div><div class="food-bars__plot">${grid}${refs}${days}</div></div>
    <ul class="chart__legend t-3rd-regular" role="list">
      <li><span class="food-key food-bar--p"></span>${t('білки')}</li><li><span class="food-key food-bar--f"></span>${t('жири')}</li><li><span class="food-key food-bar--c"></span>${t('вуглеводи')}</li>${
  guided.length ? `<li><span class="food-key food-key--ref"></span>${t('орієнтир')}</li>` : ''}${
  card.weekly ? `<li>${t('по тижнях')}</li>` : ''}</ul>
    <p class="t-3rd-regular muted">${t('у середньому за день, г; дні без записів не враховано')}</p>`;
}

function timesMarkup(card: Extract<FoodCard, { kind: 'food-times' }>): string {
  const few = card.days.length <= 7;
  const biggest = Math.max(1, ...card.days.flatMap((day) => day.meals.map((meal) => meal.kcal ?? 0)));
  const rows = card.days.map((day) => `
      <li class="food-times__row"><span class="food-times__day t-3rd-regular">${few ? weekday(day.date) : dayMonth(day.date)}</span>
        <span class="food-times__line">${day.meals.map((meal) => `<span class="food-times__dot" style="left: ${pct((meal.at / 24) * 100)}; --size: ${
  meal.kcal === null ? 8 : Math.round(6 + 10 * Math.sqrt(meal.kcal / biggest))}px"></span>`).join('')}</span>
        <span class="visually-hidden">${day.meals.length ? day.meals.map((meal) => meal.t).join(', ') : t('без записів')}</span></li>`).join('');
  return `<ol class="food-times" role="list">${rows}</ol>
    <div class="food-times__axis t-3rd-regular" aria-hidden="true"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
    ${card.cut ? `<p class="t-3rd-regular muted">${t('останні 14 днів')}</p>` : ''}`;
}

/** The inside of a food card. */
export function foodCardBody(card: FoodCard): string {
  if (card.kind === 'food-macros') return macrosMarkup(card);
  if (card.kind === 'food-times') return timesMarkup(card);
  return `<p class="avg-card__empty t-2nd-regular muted">${esc(t('записів немає'))}</p>`;
}
