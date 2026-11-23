import type { JsonObject } from '../domain/diary';
import { FOOD_NUMBERS, mergeDishes, readFoodSettings, writeDish, type Dish, type FoodNumber, type FoodSettings } from './food';

/*
 * «їжа» in the stored settings (`profile.food`, FOOD-SECTION.md «Дані»).
 * It lives in the profile, so the copy keeps it and the settings page saves
 * it with 💾, but not in the AI's schema: the settings prompt stays short,
 * «скопіювати мої налаштування для ШІ» leaves it out, and a paste of new
 * settings keeps it as it was (as the accent and «доступність»).
 */

export type FoodPatch = Partial<Omit<FoodSettings, 'dishes' | 'ref'>> & {
  readonly dishes?: readonly Dish[];
  readonly ref?: FoodSettings['ref'];
};

/** `food` as stored: only what differs from the defaults, the dishes as written. */
export function writeFood(food: FoodSettings): JsonObject {
  const ref = Object.fromEntries(FOOD_NUMBERS.filter((key) => food.ref[key] !== undefined).map((key) => [key, food.ref[key]]));
  return {
    enabled: food.enabled,
    ...(food.macros ? {} : { macros: false }),
    ...(food.names ? {} : { names: false }),
    ...(food.cardMacros ? {} : { cardMacros: false }),
    ...(food.cardTimes ? {} : { cardTimes: false }),
    ...(Object.keys(ref).length ? { ref } : {}),
    dishes: food.dishes.map(writeDish),
  };
}

export function withFood(profile: JsonObject, patch: FoodPatch): JsonObject {
  return { ...profile, food: writeFood({ ...readFoodSettings(profile.food), ...patch }) };
}

/** The dishes ticked in the sheet join «мої страви»; one with a name already there stays as it was. */
export function withDishes(profile: JsonObject, dishes: readonly Dish[]): JsonObject {
  return withFood(profile, { dishes: mergeDishes(readFoodSettings(profile.food).dishes, dishes, false) });
}

export function withRef(profile: JsonObject, key: FoodNumber, value: number | null): JsonObject {
  const ref = { ...readFoodSettings(profile.food).ref };
  if (value === null || value <= 0) delete ref[key];
  else ref[key] = value;
  return withFood(profile, { ref });
}

/** The settings as the AI sees them: without «їжа». */
export function withoutFood(profile: JsonObject): JsonObject {
  const { food: _food, ...rest } = profile;
  return rest;
}
