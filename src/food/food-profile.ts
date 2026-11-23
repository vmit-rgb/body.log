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
  // a counted kcal guide is not stored: it follows the other three
  const ref = Object.fromEntries(FOOD_NUMBERS.filter((key) => food.ref[key] !== undefined && !(key === 'kcal' && food.refKcalAuto)).map((key) => [key, food.ref[key]]));
  return {
    enabled: food.enabled,
    ...(food.macros ? {} : { macros: false }),
    ...(food.names ? {} : { names: false }),
    ...(food.cardMacros ? {} : { cardMacros: false }),
    ...(food.cardTimes ? {} : { cardTimes: false }),
    ...(Object.keys(ref).length ? { ref } : {}),
    ...(food.dishes.length ? { dishes: food.dishes.map(writeDish) } : {}),
  };
}

export function withFood(profile: JsonObject, patch: FoodPatch): JsonObject {
  return { ...profile, food: writeFood({ ...readFoodSettings(profile.food), ...patch }) };
}

/** The dishes ticked in the sheet join «мої страви»; one with a name already there stays as it was. */
export function withDishes(profile: JsonObject, dishes: readonly Dish[]): JsonObject {
  return withFood(profile, { dishes: mergeDishes(readFoodSettings(profile.food).dishes, dishes, false) });
}

/** One guide line; an emptied kcal field counts again from the other three. */
export function withRef(profile: JsonObject, key: FoodNumber, value: number | null): JsonObject {
  const food = readFoodSettings(profile.food);
  const ref = { ...food.ref };
  const gone = value === null || value <= 0;
  if (gone) delete ref[key];
  else ref[key] = value;
  return withFood(profile, { ref, refKcalAuto: key === 'kcal' ? gone : food.refKcalAuto });
}

/**
 * The settings as the AI sees them: of «їжа» only whether it is on and what
 * it records (Olesia, 2026-11-23); «мої страви», the guide and the cards stay
 * in the app, they have their own prompt.
 */
export function foodForAi(profile: JsonObject): JsonObject {
  if (profile.food === undefined) return profile;
  const food = readFoodSettings(profile.food);
  return { ...profile, food: { enabled: food.enabled, ...(food.macros ? {} : { macros: false }), ...(food.names ? {} : { names: false }) } };
}

/** New settings from an AI: its switches of «їжа» over what the app keeps; no `food` in them keeps it as it was. */
export function keepFood(now: JsonObject | null, pasted: JsonObject): JsonObject {
  const kept = now?.food;
  const said = pasted.food;
  if (said === undefined) return kept === undefined ? pasted : { ...pasted, food: kept };
  const switches = said as { enabled?: unknown; macros?: unknown; names?: unknown };
  const base = readFoodSettings(kept);
  return withFood(pasted, {
    dishes: base.dishes,
    ref: base.ref,
    refKcalAuto: base.refKcalAuto,
    cardMacros: base.cardMacros,
    cardTimes: base.cardTimes,
    enabled: switches.enabled === true,
    macros: switches.macros !== false,
    names: switches.names !== false,
  });
}
