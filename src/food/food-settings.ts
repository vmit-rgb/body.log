import { formatNumber } from '../domain/numbers';
import { esc } from '../ui/html';
import { t } from '../i18n/lang';
import { act, checkbox, secondary, tertiary } from '../screens/settings-bits';
import { withGrip } from '../ui/grip';
import { LETTERS, totalsLine, type Dish, type FoodNumber, type FoodSettings } from './food';
import { foodNumber } from './meal-sheet';

/*
 * The settings part «їжа» (FOOD-SECTION.md, «Налаштування секції «їжа»»):
 * checkboxes, the guide lines, «мої страви» with a search, the AI import.
 * Changes go into the page's draft and are kept with 💾, as everywhere there.
 * Texts: Нитка's drafts.
 */

export type FoodSwitch = 'enabled' | 'macros' | 'names' | 'cardMacros' | 'cardTimes';

export interface FoodView {
  /** What is in the import field. */
  readonly pasted: string;
  /** Lines of a refused import. */
  readonly lines: readonly string[];
}

const SWITCHES: Record<FoodSwitch, string> = {
  enabled: t('показувати секцію «їжа» на головній'),
  macros: t('рахувати білки, жири, вуглеводи й калорії'),
  names: t('записувати назви страв'),
  cardMacros: t('картка «білки, жири, вуглеводи» в середньому за 7 днів'),
  cardTimes: t('картка «час прийомів» в середньому за 7 днів'),
};

const HINTS: Partial<Record<FoodSwitch, string>> = {
  enabled: t('підрахунок їжі комусь допомагає, а комусь шкодить. якщо через нього тривожно — не вмикай, без нього теж ок.'),
  macros: t('без цього записуються лише назви страв і час.'),
  names: t('без назв і без цифр записується тільки час прийому.'),
};

const sw = (key: FoodSwitch, on: boolean) => {
  const hint = HINTS[key];
  const box = checkbox(SWITCHES[key], on, `${act('food-on')} data-key="${key}"${hint ? ` aria-describedby="food-${key}-hint"` : ''}`);
  return hint ? `${box}<p class="t-2nd-regular muted st-hint" id="food-${key}-hint">${hint}</p>` : box;
};

const REF_LABELS: Record<FoodNumber, string> = { kcal: t('калорії'), p: t('білки, г'), f: t('жири, г'), c: t('вуглеводи, г') };

function refFields(food: FoodSettings): string {
  const field = (key: FoodNumber) => foodNumber({
    key: `ref|${key}`, label: `${t('орієнтир:')} ${REF_LABELS[key]}`, value: formatNumber(food.ref[key] ?? null), unit: LETTERS[key],
    data: `data-input="food-ref" data-ref="${key}"`,
  });
  return `
    <h4 class="t-2nd-bold">${t('орієнтир')}</h4>
    <p class="t-2nd-regular muted">${t('за бажанням, для кожного числа окремо. це лише пунктирна лінія на графіку: застосунок нічого не оцінює. порожнє поле — без лінії.')}</p>
    <div class="food-row__numbers food-ref">${(['kcal', 'p', 'f', 'c'] as const).map(field).join('')}</div>`;
}

function dishLine(dish: Dish): string {
  const numbers = dish.p !== null || dish.f !== null || dish.c !== null || dish.kcal !== null
    ? totalsLine({ kcal: dish.kcal ?? 0, p: dish.p ?? 0, f: dish.f ?? 0, c: dish.c ?? 0 }) : '';
  return [dish.portion, numbers].filter(Boolean).join(' · ');
}

function dishesBlock(food: FoodSettings): string {
  const items = food.dishes.map((dish, i) => {
    const line = food.macros ? dishLine(dish) : dish.portion;
    return `<li data-dish-name="${esc(dish.name.toLocaleLowerCase())}"><button type="button" class="ctl food-dish" ${act('food-dish', `data-index="${i}"`)}>
      <span class="t-1st-semibold">${esc(dish.name)}</span>${line ? `<span class="t-3rd-regular muted">${esc(line)}</span>` : ''}</button></li>`;
  }).join('');
  const search = food.dishes.length > 5
    ? `<input class="field" type="search" autocomplete="off" placeholder="${t('пошук у моїх стравах')}" aria-label="${t('пошук у моїх стравах')}" data-input="food-find" />` : '';
  return `
    <h4 class="t-2nd-bold">${t('мої страви')}</h4>
    <p class="t-2nd-regular muted">${t('їх пропонує пошук 🔍 і підказка під назвою страви. зміна тут не змінює вже записані прийоми.')}</p>
    ${search}
    ${items ? `<ul class="food-dishes" role="list">${items}</ul>` : `<p class="t-2nd-regular muted">${t('поки порожньо.')}</p>`}
    <div class="st-end">${tertiary(t('додати страву'), act('food-dish-add'))}</div>`;
}

function importBlock(view: FoodView): string {
  const errors = view.lines.length
    ? `<div class="food-errors" role="alert"><p class="t-2nd-bold">${t('не вдалося прочитати:')}</p><ul class="t-2nd-regular">${view.lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></div>` : '';
  return `
    <h4 class="t-2nd-bold">${t('страви від ШІ')}</h4>
    <p class="t-2nd-regular muted">${t('скопіюй запит і встав його в чат зі своїм ШІ: він розпитає, що ти зазвичай їси. його відповідь встав сюди — страви додадуться в «мої страви».')}</p>
    ${secondary(t('скопіювати запит'), act('food-prompt'))}
    <div class="paste">
      ${withGrip(`<textarea class="field paste__field" rows="3" aria-label="${t('відповідь ШІ про страви')}" placeholder="${t('встав сюди відповідь ШІ')}" data-input="food-paste">${esc(view.pasted)}</textarea>`)}
      <button type="button" class="ctl btn btn--primary btn--wide" ${act('food-import')}${view.pasted.trim() ? '' : ' disabled'}>${t('додати страви')}</button>
      ${errors}
    </div>`;
}

export function foodSettingsBody(food: FoodSettings, view: FoodView): string {
  if (!food.enabled) return sw('enabled', false);
  const cards = `${food.macros ? sw('cardMacros', food.cardMacros) : ''}${sw('cardTimes', food.cardTimes)}`;
  return `${sw('enabled', true)}${sw('macros', food.macros)}${food.macros ? '' : sw('names', food.names)}${cards}${
    food.macros ? refFields(food) : ''}${food.macros || food.names ? `${dishesBlock(food)}${food.macros ? importBlock(view) : ''}` : ''}`;
}

/** The line of the closed part. */
export function foodMeta(food: FoodSettings): string {
  if (!food.enabled) return t('вимкнено');
  if (!food.macros) return food.names ? t('назви страв і час') : t('лише час');
  return food.dishes.length ? `${t('мої страви:')} ${food.dishes.length}` : t('білки, жири, вуглеводи');
}
