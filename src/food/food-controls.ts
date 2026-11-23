import { putMeal, removeMeal } from '../domain/log';
import { announce } from '../ui/announce';
import { undo } from '../ui/toast';
import { t } from '../i18n/lang';
import type { SectionControls } from '../home/controls';
import type { Dish } from './food';
import { mealSheet } from './meal-sheet';

/* «+ прийом» and a tap on a meal on home (FOOD-SECTION.md): the sheet, then the day changes. */

export interface FoodControls {
  /** Puts text on the clipboard; false when the phone refuses. */
  copy(text: string): Promise<boolean>;
  /** New dishes for «мої страви», ticked «зберегти в мої страви» in the sheet. */
  keepDishes(dishes: readonly Dish[]): void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const nowTime = (now = new Date()) => `${pad(now.getHours())}:${pad(now.getMinutes())}`;

/** Opens the sheet: a new meal (`index` null) or the meal at `index` of the day shown. */
export async function openMeal(c: SectionControls, index: number | null): Promise<void> {
  const before = c.day();
  const meal = index === null ? null : before.food?.[index] ?? null;
  const answer = await mealSheet({
    settings: c.settings.food,
    meal,
    now: nowTime(),
    copy: (text) => c.food?.copy(text) ?? Promise.resolve(false),
    toast: (message) => c.toast(message),
  });
  const backTo = () => c.screen().querySelector<HTMLElement>(index === null ? '[data-act="meal-add"]' : `[data-act="meal"][data-i="${index}"]`)
    ?? c.screen().querySelector<HTMLElement>('[data-act="meal-add"]');
  if (answer === null) return void backTo()?.focus({ preventScroll: true });
  if (answer.kind === 'delete' && index !== null) {
    c.edit(removeMeal(index), true);
    c.toast({ message: t('прийом видалено'), showIcon: true, action: undo(() => c.restore(before)) });
    c.screen().querySelector<HTMLElement>('[data-act="meal-add"]')?.focus({ preventScroll: true });
    return;
  }
  if (answer.kind !== 'save') return;
  if (answer.dishes.length) c.food?.keepDishes(answer.dishes);
  c.edit(putMeal(answer.meal, index ?? undefined), true);
  announce(index === null ? t('прийом записано') : t('прийом змінено'));
  const at = c.day().food?.indexOf(c.day().food!.find((x) => x.t === answer.meal.t)!) ?? -1;
  (c.screen().querySelector<HTMLElement>(`[data-act="meal"][data-i="${at}"]`) ?? backTo())?.focus({ preventScroll: true });
}
