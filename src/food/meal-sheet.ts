import { formatNumber, NUMBER_ERRORS, readNumber } from '../domain/numbers';
import { confirmDialog, keepAboveKeyboard, layer } from '../ui/dialog';
import { esc } from '../ui/html';
import { iconSvg } from '../ui/icons';
import { EASE, MS, play } from '../ui/motion';
import { announce } from '../ui/announce';
import { undo, type ToastMessage } from '../ui/toast';
import { t } from '../i18n/lang';
import {
  findDish, isTime, onlyNumber, itemFromDish, kcalOf, NAME_MAX, PORTION_NOTE_MAX, PORTIONS, portionLabel, searchDishes, tenth, totalsLine, mealTotals,
  type Dish, type FoodItem, type FoodSettings, type Meal,
} from './food';
import { mealPrompt, readFoodPaste } from './food-paste';

/*
 * The sheet «+ прийом» (FOOD-SECTION.md, «Лист «+ прийом»»): the time, rows
 * of dishes, «+ ще страва», «вставити від ШІ», the meal's sum, «зберегти» /
 * «скасувати». The same sheet edits a meal; then «видалити прийом» too.
 * Changing a dish here changes only this meal, never «мої страви».
 * Texts are Нитка's drafts unless FOOD-SECTION.md gives them.
 *
 * Also the sheet of one dish of «мої страви» (`dishSheet`), for the settings.
 */

interface Row {
  readonly id: number;
  name: string;
  portion: number;
  p: string;
  f: string;
  c: string;
  /** What the kcal field holds when the person wrote their own. */
  kcal: string;
  manual: boolean;
  ai: boolean;
  /** «зберегти в мої страви» */
  keep: boolean;
  search: boolean;
  /** Just picked from «мої страви»: the hint under the name waits for the next letter. */
  picked: boolean;
}

export interface MealSheetSpec {
  readonly settings: FoodSettings;
  /** The meal to change; none for «+ прийом». */
  readonly meal: Meal | null;
  /** «HH:MM» now, for a new meal. */
  readonly now: string;
  copy(text: string): Promise<boolean>;
  toast(message: ToastMessage): void;
}

export type MealAnswer =
  | { readonly kind: 'save'; readonly meal: Meal; readonly dishes: readonly Dish[] }
  | { readonly kind: 'delete' }
  | null;

let rowIds = 0;

const show = (value: number | null) => formatNumber(value === null ? null : tenth(value));

function rowOf(item: FoodItem | null, keep: boolean): Row {
  return {
    id: ++rowIds,
    name: item?.name ?? '',
    portion: item?.portion ?? 1,
    p: show(item?.p ?? null),
    f: show(item?.f ?? null),
    c: show(item?.c ?? null),
    kcal: item?.kcalManual ? show(item.kcal) : '',
    manual: item?.kcalManual === true,
    ai: item?.ai === true,
    keep,
    search: false,
    picked: false,
  };
}

/** A typed number, or null for an empty field or text that isn't a number. */
function value(typed: string): number | null {
  const read = readNumber(typed);
  return read.kind === 'number' ? tenth(read.value) : null;
}

const invalid = (typed: string) => {
  const kind = readNumber(typed).kind;
  return kind === 'negative' || kind === 'not-a-number';
};

const blank = (row: Row) => row.name.trim() === '' && row.p === '' && row.f === '' && row.c === '' && !(row.manual && row.kcal !== '');

const counted = (row: Row) => kcalOf(value(row.p), value(row.f), value(row.c));

function itemOf(row: Row, macros: boolean): FoodItem {
  const name = row.name.trim().slice(0, NAME_MAX);
  if (!macros) return { name, portion: 1, p: null, f: null, c: null, kcal: null };
  const own = row.manual ? value(row.kcal) : null;
  return {
    name, portion: row.portion, p: value(row.p), f: value(row.f), c: value(row.c),
    kcal: own ?? counted(row),
    ...(own !== null ? { kcalManual: true as const } : {}),
    ...(row.ai ? { ai: true as const } : {}),
  };
}

/* ---- markup ---- */

interface NumberSpec { readonly key: string; readonly label: string; readonly value: string; readonly unit: string; readonly data: string; readonly placeholder?: string }

/** Figma input/base number: [ 0000 ] unit; digits, the next field on Enter (no jump by itself). */
export function foodNumber(spec: NumberSpec): string {
  const wrong = invalid(spec.value);
  return `<label class="number food-num${wrong ? ' food-num--wrong' : ''}"><span class="number__bracket" aria-hidden="true">[</span>
      <input class="number__input" inputmode="decimal" autocomplete="off" enterkeyhint="next" aria-label="${esc(spec.label)}"${wrong ? ' aria-invalid="true"' : ''}
        value="${esc(spec.value)}"${spec.placeholder ? ` placeholder="${esc(spec.placeholder)}"` : ''} style="--len: ${Math.max(spec.value.length, spec.placeholder?.length ?? 0)}" data-key="${esc(spec.key)}" ${spec.data} />
      <span class="number__bracket" aria-hidden="true">]</span><span class="number__unit">${esc(spec.unit)}</span></label>`;
}

function suggestions(settings: FoodSettings, row: Row): string {
  const query = row.name.trim();
  // the full name typed shows its dish too, so its numbers can be taken (Olesia, 2026-11-23)
  if (query === '' || row.search || row.picked) return '';
  const found = searchDishes(settings.dishes, query, 5);
  return found.map((dish) => `<li><button type="button" class="ctl food-pick t-2nd-regular" data-food="pick" data-row="${row.id}" data-dish="${esc(dish.name)}">${esc(dish.name)}${
    dish.portion ? ` <span class="muted">· ${esc(dish.portion)}</span>` : ''}</button></li>`).join('');
}

function searchPanel(settings: FoodSettings, row: Row): string {
  if (!row.search) return '';
  const list = settings.dishes.length
    ? `<ul class="food-list" role="list" data-food-results="${row.id}">${dishItems(settings.dishes, row.id)}</ul>`
    : `<p class="t-2nd-regular muted">${t('у «моїх стравах» поки порожньо. страва додається туди, коли зберігаєш прийом з галочкою «зберегти в мої страви», або в налаштуваннях.')}</p>`;
  return `<div class="food-search">
      <input class="field food-search__field" type="search" autocomplete="off" enterkeyhint="search" placeholder="${t('пошук у моїх стравах')}"
        aria-label="${t('пошук у моїх стравах')}" data-food="search" data-row="${row.id}" data-key="search|${row.id}" />
      ${list}</div>`;
}

function dishItems(dishes: readonly Dish[], row: number): string {
  return dishes.map((dish) => `<li><button type="button" class="ctl food-pick t-2nd-regular" data-food="pick" data-row="${row}" data-dish="${esc(dish.name)}">${esc(dish.name)}${
    dish.portion ? ` <span class="muted">· ${esc(dish.portion)}</span>` : ''}</button></li>`).join('');
}

function kcalField(row: Row): string {
  const auto = counted(row);
  return `${foodNumber({
    key: `kcal|${row.id}`,
    label: t('калорії на порцію'),
    value: row.manual ? row.kcal : '',
    placeholder: row.manual ? '' : auto === null ? '' : String(auto),
    unit: t('ккал'),
    data: `data-food="kcal" data-row="${row.id}"`,
  })}<span class="food-row__own t-3rd-regular muted" data-own="${row.id}"${row.manual ? '' : ' hidden'} title="${t('калорії вписано вручну')}">✎<span class="visually-hidden">${t('вписано вручну')}</span></span>`;
}

/** The only row has «видалити» too once something is in it; then it is cleared, not taken away (Olesia, 2026-11-27). */
function rowMarkup(spec: MealSheetSpec, row: Row, i: number, armed: number | null, only: boolean): string {
  const { settings } = spec;
  const macro = (f: 'p' | 'f' | 'c', label: string, letter: string) => foodNumber({
    key: `${f}|${row.id}`, label, value: row[f], unit: letter, data: `data-food="num" data-f="${f}" data-row="${row.id}"`,
  });
  const remove = `<button type="button" class="ctl icon-btn icon-btn--secondary rm${armed === row.id ? ' rm--armed' : ''}" data-food="rm" data-row="${row.id}"${only && blank(row) ? ' hidden' : ''}
      aria-label="${armed === row.id ? t('точно видалити страву') : t('видалити страву')}">${iconSvg(armed === row.id ? 'check' : 'close')}</button>`;
  const known = findDish(settings.dishes, row.name) !== undefined;
  const numbers = settings.macros ? `
      <div class="chips food-portions" role="group" aria-label="${t('порція')}"><span class="t-3rd-regular muted">${t('порція')}</span>${PORTIONS.map((p) => `
        <button type="button" class="ctl chip" data-food="portion" data-row="${row.id}" data-portion="${p}" aria-pressed="${row.portion === p}">${portionLabel(p)}</button>`).join('')}</div>
      <div class="food-row__numbers">${macro('p', t('білки, г на порцію'), t('б'))}${macro('f', t('жири, г на порцію'), t('ж'))}${macro('c', t('вуглеводи, г на порцію'), t('в'))}
        <span class="food-row__kcal"><span class="food-row__arrow" aria-hidden="true">-></span>${kcalField(row)}</span></div>
      <p class="t-2nd-regular food-error" data-num-note="${row.id}" aria-live="polite" hidden>${NUMBER_ERRORS['not-a-number']}</p>
      ${row.ai ? `<p class="t-3rd-regular muted">${t('оцінка ШІ, приблизно')}</p>` : ''}` : '';
  return `
    <li class="food-row" data-row-id="${row.id}">
      <div class="food-row__head">
        <input class="field food-row__name" type="text" autocomplete="off" enterkeyhint="next" maxlength="${NAME_MAX}" placeholder="${t('назва страви')}"
          aria-label="${t('назва страви')} ${i + 1}" value="${esc(row.name)}" data-food="name" data-row="${row.id}" data-key="name|${row.id}" />
        <button type="button" class="ctl icon-btn icon-btn--secondary" data-food="find" data-row="${row.id}" aria-expanded="${row.search}"
          aria-label="${t('знайти в моїх стравах')}">${iconSvg('search')}</button>${remove}
      </div>
      <ul class="food-suggest" role="list" data-suggest="${row.id}">${suggestions(settings, row)}</ul>
      ${searchPanel(settings, row)}${numbers}
      <label class="ctl checkbox food-row__keep" data-keep-box="${row.id}"${row.name.trim() && !known ? '' : ' hidden'}>
        <input class="checkbox__input" type="checkbox" data-food="keep" data-row="${row.id}"${row.keep ? ' checked' : ''} /><span class="checkbox__box" aria-hidden="true"></span>
        <span class="checkbox__label t-2nd-regular">${t('зберегти в мої страви')}</span></label>
    </li>`;
}

interface PasteState { open: boolean; text: string; lines: readonly string[]; copied: boolean }

/*
 * «вставити від ШІ» copies the request by itself and says so in a toast
 * (Olesia, 2026-11-23, beta 1.2.4); inside, «скопіювати запит ще раз» is a
 * tertiary button. When the copy fails, the section asks to copy as before.
 */
function pasteMarkup(paste: PasteState): string {
  if (!paste.open) return `<button type="button" class="ctl btn btn--secondary st-wide" data-food="paste-open">${t('вставити від ШІ')}</button>`;
  const errors = paste.lines.length
    ? `<div class="food-errors" role="alert"><p class="t-2nd-bold">${t('не вдалося прочитати:')}</p><ul class="t-2nd-regular">${paste.lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul></div>` : '';
  const how = paste.copied
    ? t('запит уже скопійовано: встав його в чат зі своїм ШІ й опиши, що було в прийомі. відповідь ШІ встав сюди.')
    : t('скопіюй запит, встав його в чат зі своїм ШІ й опиши, що було в прийомі. відповідь ШІ встав сюди.');
  const copy = paste.copied
    ? `<div><button type="button" class="ctl btn btn--tertiary" data-food="paste-copy" data-key="paste-copy">${t('скопіювати запит ще раз')}</button></div>`
    : `<button type="button" class="ctl btn btn--secondary st-wide" data-food="paste-copy" data-key="paste-copy">${t('скопіювати запит')}</button>`;
  return `<div class="food-paste">
      <p class="t-2nd-regular muted">${how}</p>
      ${copy}
      <textarea class="field paste__field" rows="3" aria-label="${t('відповідь ШІ')}" placeholder="${t('встав сюди відповідь ШІ')}" data-food="paste-text" data-key="paste">${esc(paste.text)}</textarea>
      <button type="button" class="ctl btn btn--primary btn--wide" data-food="paste-apply"${paste.text.trim() ? '' : ' disabled'}>${t('застосувати')}</button>
      ${errors}</div>`;
}

/* ---- the sheet ---- */

export function mealSheet(spec: MealSheetSpec): Promise<MealAnswer> {
  const { settings } = spec;
  const editing = spec.meal !== null;
  const items = spec.meal?.items ?? [];
  let time = spec.meal?.t ?? spec.now;
  let rows: Row[] = items.length ? items.map((item) => rowOf(item, false)) : [rowOf(null, true)];
  let armed: number | null = null;
  const paste: PasteState = { open: false, text: '', lines: [], copied: false };
  const start = JSON.stringify({ time, rows: rows.map((row) => itemOf(row, settings.macros)) });
  const withRows = settings.macros || settings.names;

  let answer: (value: MealAnswer) => void = () => {};
  const { root, dissolve } = layer(`
    <div class="list-sheet food-sheet" role="dialog" aria-modal="true" aria-labelledby="food-sheet-title">
      <div class="list-sheet__scrim" data-food="scrim"></div>
      <div class="list-sheet__panel food-sheet__panel"></div>
    </div>`, () => void leave());
  const panel = root.querySelector<HTMLElement>('.food-sheet__panel')!;
  const rowById = (id: string | undefined) => rows.find((row) => String(row.id) === id);

  const sumText = () => {
    const meal = { t: time, items: rows.filter((row) => !blank(row)).map((row) => itemOf(row, true)) };
    return `${t('разом:')} ${totalsLine(mealTotals(meal))}`;
  };

  function draw(focus?: string): void {
    const keyNow = focus ?? (document.activeElement as HTMLElement | null)?.dataset?.key;
    panel.innerHTML = `
      <h2 class="t-h5" id="food-sheet-title" tabindex="-1" data-key="title">${editing ? t('прийом їжі') : t('новий прийом')}</h2>
      <label class="food-time"><span class="t-1st-semibold">${t('час')}</span>
        <input class="field food-time__field" type="time" value="${esc(time)}" data-food="time" data-key="time" /></label>
      ${withRows ? `<ol class="food-rows" role="list">${rows.map((row, i) => rowMarkup(spec, row, i, armed, rows.length === 1)).join('')}</ol>
      <div><button type="button" class="ctl btn btn--tertiary" data-food="more" data-key="more">${t('+ ще страва')}</button></div>` : ''}
      ${settings.macros ? `${pasteMarkup(paste)}<p class="food-sum t-1st-semibold" data-sum aria-live="polite">${esc(sumText())}</p>` : ''}
      ${editing ? `<div><button type="button" class="ctl btn btn--destructive" data-food="delete">${t('видалити прийом')}</button></div>` : ''}
      <div class="food-sheet__actions">
        <button type="button" class="ctl btn btn--destructive" data-food="cancel">${t('скасувати')}</button>
        <button type="button" class="ctl btn btn--primary" data-food="save">${t('зберегти')}</button>
      </div>`;
    const target = keyNow ? [...panel.querySelectorAll<HTMLElement>('[data-key]')].find((el) => el.dataset.key === keyNow) : undefined;
    target?.focus({ preventScroll: true });
  }

  const dirty = () => JSON.stringify({ time, rows: rows.filter((row) => !blank(row)).map((row) => itemOf(row, settings.macros)) }) !== start
    && !(!editing && rows.every(blank));

  /** Escape and «назад» reach the sheet under the question too: one question at a time. */
  let asking = false;
  async function leave(): Promise<void> {
    if (asking) return;
    if (dirty()) {
      asking = true;
      const sure = await confirmDialog({ title: t('не зберігати прийом?'), body: t('те, що вписано, пропаде.'), confirm: t('не зберігати'), cancel: t('залишитися') });
      asking = false;
      if (sure !== 'confirm') return;
    }
    answer(null);
  }

  function save(): void {
    const kept = rows.filter((row) => !blank(row));
    const meal: Meal = { t: isTime(time) ? time : spec.now, items: withRows ? kept.map((row) => itemOf(row, settings.macros)) : [] };
    const dishes: Dish[] = [];
    for (const row of kept) {
      const item = itemOf(row, settings.macros);
      if (!row.keep || item.name === '' || findDish(settings.dishes, item.name) || findDish(dishes, item.name)) continue;
      dishes.push({ name: item.name, p: item.p, f: item.f, c: item.c, kcal: item.kcal, ...(item.kcalManual ? { kcalManual: true as const } : {}), portion: '' });
    }
    answer({ kind: 'save', meal, dishes });
  }

  function fill(row: Row, dish: Dish): void {
    const item = itemFromDish(dish);
    Object.assign(row, { name: item.name, p: show(item.p), f: show(item.f), c: show(item.c), kcal: item.kcalManual ? show(item.kcal) : '', manual: item.kcalManual === true, ai: false, keep: false, search: false, picked: true });
  }

  /**
   * Removes a row; the only one is swapped for an empty row (Olesia, 2026-11-27: «просто очищати рядок»).
   * «скасувати» in the toast puts it back where it was, while the sheet is open.
   */
  function removeRow(row: Row): void {
    const at = rows.indexOf(row);
    const cleared = rows.length === 1 ? rowOf(null, true) : null;
    rows = cleared ? [cleared] : rows.filter((x) => x !== row);
    armed = null;
    draw();
    panel.querySelector<HTMLElement>('[data-food="more"]')?.focus({ preventScroll: true });
    spec.toast({
      message: t('страву прибрано'),
      showIcon: true,
      action: undo(() => {
        if (!root.isConnected) return;
        if (cleared && rows.length === 1 && blank(rows[0]!)) rows = [];
        rows.splice(Math.min(at, rows.length), 0, row);
        draw(`name|${row.id}`);
      }),
    });
  }

  /** Copies the request; the toast says how it went (4 s), the section follows. */
  function copyPrompt(): void {
    void spec.copy(mealPrompt()).then((done) => {
      if (!root.isConnected) return;
      if (paste.open && paste.copied !== done) {
        paste.copied = done;
        draw();
      }
      spec.toast(done
        ? { message: t('скопійовано — встав у чат зі своїм ШІ'), showIcon: true }
        : { message: `${t('не вдалося скопіювати')} >_<`, error: true });
    });
  }

  function applyPaste(): void {
    const read = readFoodPaste(paste.text);
    paste.text = '';
    if (read.kind === 'refused') {
      paste.lines = read.lines;
      draw('paste');
      return;
    }
    const added = read.dishes.map((dish) => ({ ...rowOf(itemFromDish(dish), findDish(settings.dishes, dish.name) === undefined), ai: true }));
    rows = rows.every(blank) ? added : [...rows.filter((row) => !blank(row)), ...added];
    Object.assign(paste, { open: false, lines: [] });
    draw();
    announce(`${t('додано страв:')} ${added.length}`);
    panel.querySelector<HTMLElement>('[data-sum]')?.scrollIntoView?.({ block: 'nearest' });
  }

  /** Typing changes only what follows it, so the field keeps the keyboard. */
  function typed(target: HTMLInputElement | HTMLTextAreaElement): void {
    const what = target.dataset.food;
    if (what === 'time') {
      time = target.value;
      return;
    }
    if (what === 'paste-text') {
      paste.text = target.value;
      panel.querySelector<HTMLButtonElement>('[data-food="paste-apply"]')!.disabled = target.value.trim() === '';
      return;
    }
    if (what === 'search') {
      const found = searchDishes(settings.dishes, target.value);
      const list = panel.querySelector<HTMLElement>(`[data-food-results="${target.dataset.row}"]`);
      if (list) list.innerHTML = found.length ? dishItems(found, Number(target.dataset.row)) : `<li class="t-2nd-regular muted">${t('нічого не знайдено')}</li>`;
      return;
    }
    const row = rowById(target.dataset.row);
    if (!row) return;
    if (target.classList.contains('number__input')) {
      // only numbers get in (Olesia, 2026-11-23); what was dropped is said under the row
      const clean = onlyNumber(target.value);
      const note = panel.querySelector<HTMLElement>(`[data-num-note="${row.id}"]`);
      if (note) note.hidden = clean === target.value;
      if (clean !== target.value) target.value = clean;
      target.style.setProperty('--len', String(target.value.length));
    }
    if (what === 'name') {
      row.name = target.value;
      row.picked = false;
      const known = findDish(settings.dishes, row.name) !== undefined;
      panel.querySelector<HTMLElement>(`[data-keep-box="${row.id}"]`)!.hidden = row.name.trim() === '' || known;
      panel.querySelector<HTMLElement>(`[data-suggest="${row.id}"]`)!.innerHTML = suggestions(settings, row);
    } else if (what === 'num') {
      row[target.dataset.f as 'p' | 'f' | 'c'] = target.value;
      const kcal = panel.querySelector<HTMLInputElement>(`[data-food="kcal"][data-row="${row.id}"]`);
      if (kcal && !row.manual) kcal.placeholder = String(counted(row) ?? '');
    } else if (what === 'kcal') {
      row.kcal = target.value;
      row.manual = target.value.trim() !== '';
      panel.querySelector<HTMLElement>(`[data-own="${row.id}"]`)!.hidden = !row.manual;
      if (!row.manual) target.placeholder = String(counted(row) ?? '');
    }
    if (rows.length === 1) panel.querySelector<HTMLElement>(`[data-food="rm"][data-row="${row.id}"]`)?.toggleAttribute('hidden', blank(row));
    target.toggleAttribute('aria-invalid', invalid(target.value));
    target.closest('.food-num')?.classList.toggle('food-num--wrong', invalid(target.value));
    const sum = panel.querySelector<HTMLElement>('[data-sum]');
    if (sum) sum.textContent = sumText();
  }

  function tapped(button: HTMLElement): void {
    const what = button.dataset.food;
    const row = rowById(button.dataset.row);
    if (what !== 'rm') armed = null;
    switch (what) {
      case 'scrim': return void leave();
      case 'cancel': return void leave();
      case 'save': return save();
      case 'delete': return answer({ kind: 'delete' });
      case 'more': {
        const added = rowOf(null, true);
        rows = [...rows, added];
        // the focus stays on the button, so no keyboard until the person taps the new name (beta 1.2.4)
        draw('more');
        return panel.querySelector<HTMLElement>(`[data-row-id="${added.id}"]`)?.scrollIntoView?.({ block: 'nearest' });
      }
      case 'portion':
        if (row) row.portion = Number(button.dataset.portion);
        return draw();
      case 'find':
        if (row) row.search = !row.search;
        return draw(row?.search ? `search|${row.id}` : undefined);
      case 'pick': {
        const dish = settings.dishes.find((x) => x.name === button.dataset.dish);
        if (row && dish) fill(row, dish);
        return draw(row ? `name|${row.id}` : undefined);
      }
      case 'rm':
        if (!row) return;
        if (armed !== row.id) {
          armed = row.id;
          return draw();
        }
        return removeRow(row);
      case 'paste-open':
        paste.open = true;
        draw();
        // the field waits for a tap: no keyboard by itself (Olesia, 2026-11-23)
        panel.querySelector<HTMLElement>('[data-food="paste-copy"]')?.focus({ preventScroll: true });
        return copyPrompt();
      case 'paste-copy': return copyPrompt();
      case 'paste-apply': return applyPaste();
      default:
    }
  }

  draw();
  // the title takes the focus, not a field: the keyboard opens only where the person taps (Olesia, 2026-11-23)
  panel.querySelector<HTMLElement>('#food-sheet-title')?.focus({ preventScroll: true });
  const unfit = keepAboveKeyboard(root, panel);
  play(panel, [{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: MS.m, easing: EASE.out });
  play(root.querySelector('.list-sheet__scrim'), [{ opacity: 0 }, { opacity: 1 }], { duration: MS.m, easing: EASE.out });

  root.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('button[data-food], [data-food="scrim"]');
    if (button) tapped(button);
  });
  root.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.dataset.food) typed(target);
  });
  root.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    const row = rowById(target.dataset.row);
    if (target.dataset.food === 'keep' && row) row.keep = target.checked;
    // an emptied kcal field counts again (FOOD-SECTION.md)
    if (target.dataset.food === 'kcal' && row && target.value.trim() === '') draw();
  });
  // Enter moves on to the next field, never saves by itself
  root.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    if (event.key !== 'Enter' || !(target instanceof HTMLInputElement) || target.type === 'search') return;
    event.preventDefault();
    const fields = [...panel.querySelectorAll<HTMLElement>('input:not([type="checkbox"]):not([type="search"]), textarea')];
    fields[fields.indexOf(target) + 1]?.focus();
  });

  return new Promise((resolve) => {
    let answered = false;
    answer = (value) => {
      if (answered) return;
      answered = true;
      unfit();
      dissolve();
      resolve(value);
    };
  });
}

/* ---- one dish of «мої страви» (settings) ---- */

export interface DishSheetSpec {
  readonly dish: Dish | null;
  /** Names already taken by other dishes. */
  readonly taken: readonly string[];
}

export type DishAnswer = { readonly kind: 'save'; readonly dish: Dish } | { readonly kind: 'delete' } | null;

export function dishSheet(spec: DishSheetSpec): Promise<DishAnswer> {
  const dish = spec.dish;
  const state = {
    name: dish?.name ?? '', portion: dish?.portion ?? '',
    p: show(dish?.p ?? null), f: show(dish?.f ?? null), c: show(dish?.c ?? null),
    kcal: dish?.kcalManual ? show(dish.kcal) : '',
  };
  let error = '';
  let answer: (value: DishAnswer) => void = () => {};
  const { root, dissolve } = layer(`
    <div class="list-sheet food-sheet" role="dialog" aria-modal="true" aria-labelledby="dish-sheet-title">
      <div class="list-sheet__scrim" data-dish-act="cancel"></div>
      <div class="list-sheet__panel food-sheet__panel"></div>
    </div>`, () => answer(null));
  const panel = root.querySelector<HTMLElement>('.food-sheet__panel')!;
  const counted = () => kcalOf(value(state.p), value(state.f), value(state.c));
  const num = (f: 'p' | 'f' | 'c', label: string, letter: string) => foodNumber({ key: f, label, value: state[f], unit: letter, data: `data-dish="${f}"` });

  function draw(): void {
    panel.innerHTML = `
      <h2 class="t-h5" id="dish-sheet-title" tabindex="-1">${dish ? t('моя страва') : t('нова страва')}</h2>
      <input class="field" type="text" maxlength="${NAME_MAX}" placeholder="${t('назва страви')}" aria-label="${t('назва страви')}" value="${esc(state.name)}" data-dish="name" />
      ${error ? `<p class="t-2nd-regular food-error" role="alert">${esc(error)}</p>` : ''}
      <input class="field" type="text" maxlength="${PORTION_NOTE_MAX}" placeholder="${t('порція, напр. тарілка або 100 г')}" aria-label="${t('що таке одна порція')}" value="${esc(state.portion)}" data-dish="portion" />
      <p class="t-3rd-regular muted">${t('білки, жири й вуглеводи — у грамах на одну порцію.')}</p>
      <div class="food-row__numbers">${num('p', t('білки, г на порцію'), t('б'))}${num('f', t('жири, г на порцію'), t('ж'))}${num('c', t('вуглеводи, г на порцію'), t('в'))}
        <span class="food-row__kcal"><span class="food-row__arrow" aria-hidden="true">-></span>${foodNumber({
          key: 'kcal', label: t('калорії на порцію'), value: state.kcal, placeholder: state.kcal ? '' : String(counted() ?? ''), unit: t('ккал'), data: 'data-dish="kcal"',
        })}</span></div>
      <p class="t-2nd-regular food-error" data-num-note aria-live="polite" hidden>${NUMBER_ERRORS['not-a-number']}</p>
      ${dish ? `<div><button type="button" class="ctl btn btn--destructive" data-dish-act="delete">${t('видалити страву')}</button></div>` : ''}
      <div class="food-sheet__actions">
        <button type="button" class="ctl btn btn--destructive" data-dish-act="cancel">${t('скасувати')}</button>
        <button type="button" class="ctl btn btn--primary" data-dish-act="save">${t('зберегти')}</button>
      </div>`;
  }

  function save(): void {
    const name = state.name.trim();
    if (name === '') error = t('напиши назву страви');
    else if (spec.taken.some((x) => x.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) error = t('страва з такою назвою вже є');
    else {
      const [p, f, c] = [value(state.p), value(state.f), value(state.c)];
      const own = value(state.kcal);
      return answer({
        kind: 'save',
        dish: { name, p, f, c, kcal: own ?? kcalOf(p, f, c), ...(own !== null ? { kcalManual: true as const } : {}), portion: state.portion.trim() },
      });
    }
    draw();
    panel.querySelector<HTMLElement>('[data-dish="name"]')?.focus();
  }

  draw();
  // as in the meal sheet: no keyboard until the person taps a field
  panel.querySelector<HTMLElement>('#dish-sheet-title')?.focus({ preventScroll: true });
  const unfit = keepAboveKeyboard(root, panel);
  play(panel, [{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: MS.m, easing: EASE.out });
  root.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    const key = target.dataset.dish as keyof typeof state | undefined;
    if (!key) return;
    if (target.classList.contains('number__input')) {
      const clean = onlyNumber(target.value);
      panel.querySelector<HTMLElement>('[data-num-note]')!.hidden = clean === target.value;
      if (clean !== target.value) target.value = clean;
      target.style.setProperty('--len', String(target.value.length));
    }
    state[key] = target.value;
    const kcal = panel.querySelector<HTMLInputElement>('[data-dish="kcal"]');
    if (kcal && state.kcal === '') kcal.placeholder = String(counted() ?? '');
  });
  root.addEventListener('click', (event) => {
    const act = (event.target as Element).closest<HTMLElement>('[data-dish-act]')?.dataset.dishAct;
    if (act === 'cancel') answer(null);
    else if (act === 'delete') answer({ kind: 'delete' });
    else if (act === 'save') save();
  });
  return new Promise((resolve) => {
    let answered = false;
    answer = (result) => {
      if (answered) return;
      answered = true;
      unfit();
      dissolve();
      resolve(result);
    };
  });
}
