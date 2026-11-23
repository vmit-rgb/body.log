import { formatNumber, NUMBER_ERRORS } from '../domain/numbers';
import { esc } from '../ui/html';
import { t } from '../i18n/lang';
import { act, checkbox, secondary, tertiary } from '../screens/settings-bits';
import { withGrip } from '../ui/grip';
import { key, LETTERS, totalsLine, type Dish, type FoodNumber, type FoodSettings } from './food';
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

/* Olesia, 2026-11-23: under the warning, that food has its own prompt. Нитка's draft. */
const OWN_PROMPT = t('загальний промпт налаштувань лише вмикає чи вимикає цю секцію. «мої страви» твій ШІ складає за окремим запитом — він тут, у цьому розділі, коли секцію ввімкнено.');

const sw = (key: FoodSwitch, on: boolean) => {
  const hint = HINTS[key];
  const box = checkbox(SWITCHES[key], on, `${act('food-on')} data-key="${key}"`, false, hint ? [{ id: `food-${key}-hint`, text: hint }] : []);
  // not about the checkbox itself: its own paragraph, so a tap on it switches nothing
  return key === 'enabled' ? `${box}<p class="t-2nd-regular muted st-note">${OWN_PROMPT}</p>` : box;
};

const REF_LABELS: Record<FoodNumber, string> = { kcal: t('калорії'), p: t('білки, г'), f: t('жири, г'), c: t('вуглеводи, г') };

function refFields(food: FoodSettings): string {
  const counted = (key: FoodNumber) => key === 'kcal' && food.refKcalAuto;
  const field = (key: FoodNumber) => foodNumber({
    key: `ref|${key}`, label: `${t('орієнтир:')} ${REF_LABELS[key]}`, unit: LETTERS[key],
    value: counted(key) ? '' : formatNumber(food.ref[key] ?? null),
    placeholder: counted(key) && food.ref.kcal !== undefined ? String(food.ref.kcal) : '',
    data: `data-input="food-ref" data-ref="${key}"`,
  });
  // in a frame, so it doesn't get lost among the checkboxes (Olesia, 2026-11-23)
  return `
    <div class="food-guide">
      <h4 class="t-2nd-bold">${t('орієнтир')}</h4>
      <p class="t-2nd-regular muted">${t('за бажанням, для кожного числа окремо. це лише пунктирна лінія на графіку: застосунок нічого не оцінює. порожнє поле — без лінії.')}</p>
      <div class="food-row__numbers food-ref">${(['p', 'f', 'c'] as const).map(field).join('')}
        <span class="food-row__kcal"><span class="food-row__arrow" aria-hidden="true">→</span>${field('kcal')}</span></div>
      <p class="t-2nd-regular food-error" data-ref-note aria-live="polite" hidden>${NUMBER_ERRORS['not-a-number']}</p>
      <p class="t-3rd-regular muted">${t('калорії рахуються самі, коли є всі три числа. своє число в їхньому полі важить більше.')}</p>
    </div>`;
}

function dishLine(dish: Dish): string {
  const numbers = dish.p !== null || dish.f !== null || dish.c !== null || dish.kcal !== null
    ? totalsLine({ kcal: dish.kcal ?? 0, p: dish.p ?? 0, f: dish.f ?? 0, c: dish.c ?? 0 }) : '';
  return [dish.portion, numbers].filter(Boolean).join(' · ');
}

function dishesBlock(food: FoodSettings): string {
  const items = food.dishes.map((dish, i) => {
    const line = food.macros ? dishLine(dish) : dish.portion;
    return `<li data-dish-name="${esc(key(dish.name))}"><button type="button" class="ctl food-dish" ${act('food-dish', `data-index="${i}"`)}>
      <span class="t-1st-semibold">${esc(dish.name)}</span>${line ? `<span class="t-3rd-regular muted">${esc(line)}</span>` : ''}</button></li>`;
  }).join('');
  const search = food.dishes.length > 5
    ? `<input class="field" type="search" autocomplete="off" placeholder="${t('пошук у моїх стравах')}" aria-label="${t('пошук у моїх стравах')}" data-input="food-find" />` : '';
  return `
    <h4 class="t-2nd-bold">${t('мої страви')}</h4>
    <p class="t-2nd-regular muted">${t('їх пропонує пошук 🔍 і підказка під назвою страви. зміна тут не змінює вже записані прийоми.')}</p>
    ${search}
    ${items ? `<ul class="food-dishes" role="list" tabindex="0" aria-label="${t('мої страви')}">${items}</ul>` : `<p class="t-2nd-regular muted">${t('поки порожньо.')}</p>`}
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
