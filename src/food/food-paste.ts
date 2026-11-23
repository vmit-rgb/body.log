import { lang, t } from '../i18n/lang';
import { russianReason } from '../paste/russian';
import { NAME_MAX, PORTION_NOTE_MAX, kcalOf, type Dish } from './food';

/*
 * What an AI answers about food (FOOD-SECTION.md, «ШІ-запити»): two short
 * prompts of their own, never inside the settings prompt (Gemini cuts a long
 * one at about 32k, AI-RETEST 2026-11-19). Both answer in one shape:
 *   {"format": "body.log-food", "lang": "uk", "dishes": [{"name": "…", "portion": "…", "p": 0, "f": 0, "c": 0}]}
 * The numbers are per one portion; kcal is counted by the app. The check is
 * as strict as the settings' paste: the format, every dish, russian refused.
 */

export const FOOD_FORMAT = 'body.log-food';
const MAX_DISHES = 100;
const MAX_GRAMS = 1000;

export type FoodPaste =
  | { readonly kind: 'ok'; readonly dishes: readonly Dish[] }
  | { readonly kind: 'refused'; readonly lines: readonly string[] };

type Raw = { readonly [key: string]: unknown };
const isRaw = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The JSON in an answer: inside ``` fences or around them, from the first { to the last }. */
function jsonOf(answer: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(answer)?.[1] ?? answer;
  const from = fenced.indexOf('{');
  const to = fenced.lastIndexOf('}');
  if (from === -1 || to < from) return undefined;
  try {
    return JSON.parse(fenced.slice(from, to + 1).replace(/[“”]/g, '"'));
  } catch {
    return undefined;
  }
}

const NOT_OURS = t('це не схоже на відповідь про їжу для body.log. перевір, що скопійовано всю відповідь ШІ.');
const RUSSIAN = t('страви російською застосунок не приймає.');

/** One dish; its problems as lines («страва 2: …»). */
function readDish(value: unknown, n: number): { dish: Dish | null; lines: string[] } {
  const at = `${t('страва')} ${n}`;
  if (!isRaw(value)) return { dish: null, lines: [`${at}: ${t('не схоже на страву')}`] };
  const lines: string[] = [];
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (name === '') lines.push(`${at}: ${t('немає назви')}`);
  else if ([...name].length > NAME_MAX) lines.push(`${at}: ${t('назва довша за')} ${NAME_MAX} ${t('символів')}`);
  const grams = (key: 'p' | 'f' | 'c', word: string): number | null => {
    const v = value[key];
    if (v === undefined || v === null) return null;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_GRAMS) {
      lines.push(`${at}${name ? ` «${name}»` : ''}: ${word} ${t('мають бути числом від 0 до')} ${MAX_GRAMS}`);
      return null;
    }
    return Math.round(v * 10) / 10;
  };
  const p = grams('p', t('білки'));
  const f = grams('f', t('жири'));
  const c = grams('c', t('вуглеводи'));
  const portion = typeof value.portion === 'string' ? value.portion.trim().slice(0, PORTION_NOTE_MAX) : '';
  if (lines.length) return { dish: null, lines };
  return { dish: { name, p, f, c, kcal: kcalOf(p, f, c), portion }, lines };
}

/** Reads an AI's answer about food. */
export function readFoodPaste(answer: string): FoodPaste {
  const data = jsonOf(answer);
  if (!isRaw(data) || data.format !== FOOD_FORMAT || !Array.isArray(data.dishes)) return { kind: 'refused', lines: [NOT_OURS] };
  if (russianReason({ lang: data.lang, dishes: data.dishes }) !== null) return { kind: 'refused', lines: [RUSSIAN] };
  if (data.dishes.length === 0) return { kind: 'refused', lines: [t('у відповіді немає жодної страви.')] };
  if (data.dishes.length > MAX_DISHES) return { kind: 'refused', lines: [`${t('забагато страв: до')} ${MAX_DISHES}`] };
  const read = data.dishes.map((dish, i) => readDish(dish, i + 1));
  const lines = read.flatMap((x) => x.lines);
  return lines.length ? { kind: 'refused', lines } : { kind: 'ok', dishes: read.map((x) => x.dish!) };
}

/* ---- the two prompts (Нитка's drafts) ---- */

const SHAPE = '{"format": "body.log-food", "lang": "uk", "dishes": [{"name": "вівсянка на молоці", "portion": "тарілка, 250 г", "p": 12, "f": 8, "c": 45}]}';
const SHAPE_EN = '{"format": "body.log-food", "lang": "en", "dishes": [{"name": "porridge with milk", "portion": "bowl, 250 g", "p": 12, "f": 8, "c": 45}]}';

const RULES_UK = `Правила відповіді:
- Відповідь — лише один блок JSON у такому вигляді, без тексту до чи після:
${SHAPE}
- p — білки, f — жири, c — вуглеводи, у грамах на одну порцію; числа, не текст. Калорії не пиши: застосунок рахує їх сам.
- portion — що таке одна порція, коротко («тарілка, 250 г», «1 шт», «100 г»).
- Назви страв — з малої літери, мовою людини; lang — код цієї мови. Російською не пиши.
- Якщо незрозуміло, яка порція або що саме за страва, спершу спитай, а JSON дай після відповіді.
- Значення — твоя оцінка; не вигадуй точності, якої немає.`;

const RULES_EN = `Answer rules:
- The answer is one JSON block only, in this shape, with no text before or after:
${SHAPE_EN}
- p is protein, f is fat, c is carbs, in grams per one portion; numbers, not text. Don't write calories: the app counts them.
- portion says what one portion is, briefly ("bowl, 250 g", "1 piece", "100 g").
- Names of dishes in lowercase, in the person's language; lang is the code of that language. Never in russian.
- If it isn't clear how much the person ate or what exactly, ask first and give the JSON after their answer.
- The numbers are your estimate; don't make up precision that isn't there.`;

/** (а) «мої страви» as a list: what the person usually eats. */
export function dishesPrompt(): string {
  return lang() === 'en'
    ? `I keep a food diary in the body.log app. Help me make a list of the dishes I usually eat, with protein, fat and carbs per portion. Ask me what I usually eat for breakfast, lunch, dinner and snacks, then answer.\n\n${RULES_EN}`
    : `Я веду щоденник їжі в застосунку body.log. Допоможи скласти список страв, які я зазвичай їм, з білками, жирами й вуглеводами на порцію. Розпитай, що я зазвичай їм на сніданок, обід, вечерю й перекуси, а потім дай відповідь.\n\n${RULES_UK}`;
}

/** (б) one meal: one dish or several. */
export function mealPrompt(): string {
  return lang() === 'en'
    ? `I keep a food diary in the body.log app. I'll describe what I ate in one meal; estimate protein, fat and carbs for each dish.\n\n${RULES_EN}\n\nWhat I ate:`
    : `Я веду щоденник їжі в застосунку body.log. Зараз опишу один прийом їжі; оціни білки, жири й вуглеводи для кожної страви.\n\n${RULES_UK}\n\nОсь що було в прийомі:`;
}
