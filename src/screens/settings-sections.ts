import { sessionName } from '../domain/journal';
import { formatNumber, plural } from '../domain/numbers';
import { LIST_OF, TRACKERS, type Slot } from '../domain/sections-edit';
import {
  MOMENTS, PULSE_SECONDS, type ActivityKind, type Moment, type MovementKind, type PulseSeconds, type Settings, type Source,
  type Tracker, type WarmupItem, type WorkoutEntry, type WorkoutItem,
} from '../domain/settings';
import { esc } from '../ui/html';
import { iconSvg } from '../ui/icons';
import { tip } from '../home/sections';
import { act, checkbox, daysSlider, iconButton, tertiary } from './settings-bits';
import { t } from '../i18n/lang';

/*
 * Stage 6d: the inside of the sections in «налаштування» (Figma
 * screen/edit-profile: section/wellbeing, /morning-warmup, /daytime-warmup,
 * /workouts, /movement; «бета 0.81» `renderSettings`). Every text is a
 * button that opens the full-screen field; «видалити …» at the end of an
 * entry removes it after asking (a × until 2026-11-12); every
 * entry can be dragged (screens/drag.ts) or moved through its menu
 * («дії: …», also on a long press). Texts: COPY.md «Settings» and
 * «Added 2026-11-08 in Figma».
 */

/** The long-press / «дії» menu of one entry. */
export interface ActionMenu {
  readonly slot: Slot;
  readonly items: readonly { readonly key: string; readonly label: string }[];
}

/** «створити групу»: choosing exercises of one workout. */
export interface Picking {
  /** The workout's list, once the first exercise is chosen. */
  readonly list: string | null;
  readonly chosen: readonly number[];
}

export interface SectionsView {
  /** Open inner parts: tracker kinds (`k:scale`…) and levels, zones, workouts by id. */
  readonly inner: ReadonlySet<string>;
  readonly menu: ActionMenu | null;
  readonly picking: Picking | null;
  /** Whether an entry's «дії» menu has anything in it (then its ⋯ shows). Without it: always. */
  readonly movable?: ((slot: Slot, family: string) => boolean) | undefined;
  /** The «затисни, щоб відкрити дії» tip under the first entry with a menu (wave 7a). */
  readonly holdTip?: boolean;
}

/** How a value is typed in the full-screen field. */
export type EditKind = 'text' | 'long' | 'number' | 'url' | 'rx';

interface Ctx {
  readonly settings: Settings;
  readonly view: SectionsView;
  /** Set once the «затисни» tip is drawn, so it shows under one entry only. */
  tipDrawn?: boolean;
}

export const KIND_NAMES: Record<ActivityKind, string> = {
  morningWarmup: t('ранкова розминка'), daytimeWarmup: t('денна розминка'), workout: t('тренування'), movement: t('рух'),
};

const EXERCISES = ['вправа', 'вправи', 'вправ'] as const;
/** E-07 / E-08 (Olesia, 2026-11-18): what «самопочуття» holds are «питання», not «поля». */
export const QUESTIONS = ['питання', 'питання', 'питань'] as const;

/* ---- pieces ---- */

/** A text or value: tap to change it. Empty shows its placeholder, faint. */
function ed(path: string, value: string, placeholder: string, label: string, kind: EditKind, cls = 't-1st-regular'): string {
  const empty = value.trim() === '';
  return `<button type="button" class="ctl st-text ${cls}${empty ? ' st-text--empty' : ''}" ${act('edit', `data-path="${esc(path)}" data-edit="${kind}" data-label="${esc(label)}"`)}>${
    esc(empty ? placeholder : value)}</button>`;
}

const slotData = (slot: Slot) => `data-list="${esc(slot.list)}" data-index="${slot.index}"`;
const shown = (name: string) => name.trim() || t('без назви');

/** What can be deleted in the sections: the word in «видалити …» and in the dialog («його / її більше не буде»). */
export type Thing = 'level' | 'zone' | 'session' | 'movement' | 'exercise' | Tracker['kind'];
export const THINGS: Record<Thing, readonly [word: string, it: string]> = {
  level: [t('рівень'), t('його')], zone: [t('зону'), t('її')], session: [t('тренування'), t('його')], movement: [t('рух'), t('його')], exercise: [t('вправу'), t('її')],
  scale: [t('повзунок'), t('його')], yesno: [t('питання'), t('його')], numbers: [t('поле'), t('його')], number: [t('поле'), t('його')], note: [t('нотатку'), t('її')],
};

/**
 * «видалити …»: red text. An exercise, a kind of movement, a level, a zone
 * and a workout have it right under their name or title; an exercise says
 * just «видалити» (Olesia, MY-FIXES; until then at the end of the entry,
 * 2026-11-12). The voice name starts with the seen text and adds which one.
 */
function removeButton(slot: Slot, name: string, thing: Thing): string {
  const label = `${t('видалити')} ${THINGS[thing][0]}`;
  const seen = thing === 'exercise' ? t('видалити') : label;
  return `<div class="st-rm-row"><button type="button" class="ctl btn btn--destructive st-rm" ${act('rm', slotData(slot))} aria-label="${label}: ${esc(shown(name))}">${seen}</button></div>`;
}

function toggle(id: string, name: string, open: boolean): string {
  return `<button type="button" class="ctl icon-btn icon-btn--secondary" ${act('inner', `data-id="${esc(id)}"`)} aria-expanded="${open}" aria-label="${
    open ? t('згорнути') : t('розгорнути')}: ${esc(shown(name))}">${iconSvg(open ? 'remove' : 'add')}</button>`;
}

function menuMarkup(ctx: Ctx, slot: Slot, name: string): string {
  const { menu } = ctx.view;
  if (!menu || menu.slot.list !== slot.list || menu.slot.index !== slot.index) return '';
  const items = menu.items.map((item) => `<button type="button" role="menuitem" class="ctl btn ${item.key === 'cancel' ? 'btn--destructive' : 'btn--tertiary'}"${act('menu-item', `data-key="${esc(item.key)}"`)}>${esc(item.label)}</button>`);
  return `<div class="st-menu" role="menu" aria-label="${t('дії:')} ${esc(shown(name))}">${items.join('')}</div>`;
}

/** What finds an entry again after a redraw moved it: its family and the id of what it is. */
export const entryKey = (family: string, id: string) => `${family}:${id}`;

/**
 * An entry that can be dragged, with its menu. B-06 (Olesia, MY-FIXES): the
 * menu opens two ways, a long press without moving and a visible ⋯ at the
 * top right (drawn by CSS; its name stays «дії: …»). No ⋯ when the menu
 * would be empty. Wave 7a (Olesia, 2026-11-18): ⋯ only with «показувати ⋯
 * біля пунктів, що потребують затискання» in «доступність»; without it the
 * first entry with a menu has the tip «затисни, щоб відкрити дії».
 */
function entry(ctx: Ctx, family: string, slot: Slot, id: string, name: string, inner: string, cls = '', attrs = ''): string {
  const movable = ctx.view.movable?.(slot, family) ?? true;
  const dots = movable && ctx.settings.accessibility.showDots
    ? `<button type="button" class="ctl icon-btn icon-btn--secondary st-actions" ${act('menu', `data-family="${family}" ${slotData(slot)}`)}><span class="st-actions__name">${t('дії:')} ${esc(shown(name))}</span></button>`
    : '';
  return `
      <div class="st-item${cls}${movable ? ' st-item--movable' : ''}" data-family="${family}" data-key="${esc(entryKey(family, id))}" data-name="${esc(shown(name))}" ${slotData(slot)}${attrs}>
        ${dots}${inner}${menuMarkup(ctx, slot, name)}
      </div>${movable && !dots ? holdTip(ctx) : ''}`;
}

export const HOLD_TIP = 'hold';
const HOLD_TIP_TEXT = t('затисни, щоб відкрити дії.');

function holdTip(ctx: Ctx): string {
  if (!ctx.view.holdTip || ctx.tipDrawn) return '';
  ctx.tipDrawn = true;
  return tip(HOLD_TIP, HOLD_TIP_TEXT);
}

function list(family: string, path: string, items: string[], end = ''): string {
  return `<div class="st-list" data-family="${family}" data-list="${esc(path)}" data-end="${end}">${items.join('')}</div>`;
}

const count = (n: number, words: readonly [string, string, string]) => `${n} ${plural(n, words)}`;
const exerciseCount = (items: readonly (WarmupItem | WorkoutEntry)[]) =>
  count(items.reduce((n, item) => n + ('set' in item ? item.set.length : 1), 0), EXERCISES);

function linkField(path: string, source: Source): string {
  const url = source.type === 'link' ? source.url : '';
  const short = url.replace(/^https?:\/\//i, '');
  const text = short.length > 34 ? `${short.slice(0, 34)}…` : short;
  const ai = source.type === 'link' && source.by === 'ai' ? `<span class="t-3rd-regular muted"> ${t('* від ШІ')}</span>` : '';
  return `<div class="st-link">${ed(path, text, t('посилання'), t('посилання (https://…)'), 'url', 't-3rd-regular st-text--link')}${ai}</div>`;
}

/* ---- самопочуття ---- */

const TRACKER_KINDS: readonly [Tracker['kind'], string, string, string, string][] = [
  ['scale', t('повзунки'), '', t('додати повзунок'), t('назва (наприклад, біль у шиї)')],
  ['yesno', t('питання так / ні'), '', t('додати питання'), t('питання (наприклад, було запаморочення?)')],
  ['numbers', t('два числа'), t('наприклад, тиск'), t('додати поле'), t('назва (наприклад, тиск)')],
  ['number', t('одне число'), t('наприклад, пульс'), t('додати поле'), t('назва (наприклад, пульс)')],
  ['note', t('нотатки'), '', t('додати нотатку'), t('назва')],
];

/** Moments that belong to a section show only while it is on (0.81). */
const MOMENT_KIND: Partial<Record<Moment, ActivityKind>> = {
  afterMorningWarmup: 'morningWarmup', beforeDaytimeWarmup: 'daytimeWarmup', afterDaytimeWarmup: 'daytimeWarmup',
  beforeWorkout: 'workout', afterWorkout: 'workout', beforeMovement: 'movement', afterMovement: 'movement',
};
const ASK_LABELS: Record<Moment, string> = {
  morning: t('питати зранку'),
  afterMorningWarmup: t('питати після ранкової розминки'),
  beforeDaytimeWarmup: t('питати до денної розминки'),
  afterDaytimeWarmup: t('питати після денної розминки'),
  beforeWorkout: t('питати до тренування'),
  afterWorkout: t('питати після тренування'),
  beforeMovement: t('питати до руху'),
  afterMovement: t('питати після руху'),
  evening: t('питати ввечері'),
};

function timerBlock(tracker: Tracker & { kind: 'number' }): string {
  const id = esc(tracker.id);
  const length = (seconds: PulseSeconds) => `<button type="button" class="ctl tab" ${act('timer-length', `data-tracker="${id}" data-seconds="${seconds}"`)}
        aria-pressed="${tracker.timer === seconds}">${seconds} ${t('с')}</button>`;
  const lengths = tracker.timer === null ? '' : `<div class="segmented st-lengths" role="group" aria-label="${t('скільки триває таймер')}">${PULSE_SECONDS.map(length).join('')}</div>`;
  return `
        <div class="st-timer">
          ${checkbox(t('таймер для пульсу'), tracker.timer !== null, `${act('timer')} data-tracker="${id}"`)}
          <p class="t-2nd-regular muted">${t('на головній зʼявиться таймер: рахуєш удари, поки він іде, потім вписуєш число — застосунок перерахує в уд/хв.')}</p>
          ${lengths}
        </div>`;
}

function trackerValues(tracker: Tracker, path: string): string {
  switch (tracker.kind) {
    case 'scale':
      return `<div class="st-pair">${ed(`${path}.min`, `${t('від')} ${formatNumber(tracker.min)}`, t('від 0'), t('найменше значення'), 'number', 't-3rd-regular')}${
        ed(`${path}.max`, `${t('до')} ${formatNumber(tracker.max)}`, t('до 10'), t('найбільше значення'), 'number', 't-3rd-regular')}</div>`;
    case 'number':
      return ed(`${path}.units.0`, tracker.unit, t('одиниці (наприклад, уд/хв)'), t('одиниці'), 'text', 't-3rd-regular');
    case 'numbers':
      return `<div class="st-pair">${ed(`${path}.units.0`, tracker.units[0], t('одиниці першого числа'), t('одиниці'), 'text', 't-3rd-regular')}${
        ed(`${path}.units.1`, tracker.units[1], t('одиниці другого числа'), t('одиниці'), 'text', 't-3rd-regular')}</div>`;
    default:
      return '';
  }
}

function trackerMarkup(ctx: Ctx, tracker: Tracker, index: number, placeholder: string): string {
  const path = `${TRACKERS}.${index}`;
  const slot = { list: TRACKERS, index };
  const moments = MOMENTS.filter((moment) => {
    const kind = MOMENT_KIND[moment];
    return !kind || ctx.settings[kind].enabled;
  });
  const asks = moments.map((moment) => checkbox(ASK_LABELS[moment], tracker.ask.includes(moment), `${act('ask')} data-path="${path}.ask" data-moment="${moment}"`));
  const inner = `
        <div class="st-row">${ed(`${path}.name`, tracker.name, placeholder, t('назва'), 'text', 't-1st-semibold')}</div>
        ${ed(`${path}.hint`, tracker.hint, t('підказка (наприклад, 0 — не болить, 10 — дуже)'), t('підказка'), 'text', 't-2nd-regular')}
        ${trackerValues(tracker, path)}
        <div class="st-asks">${asks.join('')}</div>
        ${tracker.kind === 'number' ? timerBlock(tracker) : ''}
        ${removeButton(slot, tracker.name, tracker.kind)}`;
  return entry(ctx, `tk-${tracker.kind}`, slot, tracker.id, tracker.name, inner);
}

/** A box with its own +/−: a tracker kind, a level, a «для чого», a workout. */
function box(title: string, open: boolean, toggleButton: string, meta: string, body: () => string): string {
  return `<div class="st-row st-box__head">${title}${toggleButton}</div>${open ? `<div class="st-box__body">${body()}</div>` : `<p class="t-3rd-regular muted">${esc(meta)}</p>`}`;
}

function trackerKind(ctx: Ctx, [kind, title, hint, add, placeholder]: (typeof TRACKER_KINDS)[number]): string {
  const id = `k:${kind}`;
  const open = ctx.view.inner.has(id);
  const mine = ctx.settings.trackers.flatMap((tracker, index) => (tracker.kind === kind ? [index] : []));
  const end = mine.length ? String(mine.at(-1)! + 1) : '';
  const body = () => `${hint ? `<p class="t-2nd-regular muted">${hint}</p>` : ''}
        ${list(`tk-${kind}`, TRACKERS, mine.map((index) => trackerMarkup(ctx, ctx.settings.trackers[index]!, index, placeholder)), end)}
        <div class="st-end">${tertiary(add, act('add', `data-what="tracker" data-kind="${kind}"`))}</div>`;
  return `<div class="st-box">${box(`<h4 class="t-h6 st-grow">${title}</h4>`, open, toggle(id, title, open), count(mine.length, QUESTIONS), body)}</div>`;
}

export function wellbeingBody(ctx: Ctx): string {
  return TRACKER_KINDS.map((kind) => trackerKind(ctx, kind)).join('');
}

/* ---- the activity sections ---- */

function activityHead(ctx: Ctx, kind: ActivityKind, hint: boolean): string {
  const activity = ctx.settings[kind];
  const head = checkbox(t('показувати на головній'), activity.enabled, `${act('kind-on')} data-kind="${kind}"`);
  if (!activity.enabled) return head;
  return `${head}${hint ? ed(`${kind}.hint`, activity.hint, t('підказка'), t('підказка'), 'long', 't-2nd-regular') : ''}`;
}

function target(ctx: Ctx, kind: ActivityKind): string {
  return daysSlider({
    label: t('ціль: днів на тиждень'), value: ctx.settings[kind].weeklyTarget, name: 'target', data: `data-kind="${kind}"`,
    spoken: `${t('ціль,')} ${KIND_NAMES[kind]}${t(': днів на тиждень')}`,
  });
}

const addButton = (label: string, data: string) => `<div class="st-end">${tertiary(label, act('add', data))}</div>`;

/* exercises */

function exerciseHead(ctx: Ctx, id: string): { name: string; how: string; source: Source } {
  return ctx.settings.exercises.find((exercise) => exercise.id === id) ?? { name: '', how: '', source: { type: 'user' } };
}

function warmupItem(ctx: Ctx, family: string, slot: Slot, item: WarmupItem): string {
  const path = `${slot.list}.${slot.index}`;
  const exercise = exerciseHead(ctx, item.exercise);
  const value = item.seconds === null
    ? ed(`${path}.reps`, item.reps, t('n разів'), t('скільки разів'), 'text', 't-3rd-regular st-value')
    : ed(`${path}.seconds`, `${formatNumber(item.seconds)} ${t('с')}`, t('n с'), t('скільки секунд'), 'number', 't-3rd-regular st-value');
  const inner = `
        <div class="st-row">${ed(`ex:${item.exercise}.name`, exercise.name, t('вправа'), t('назва вправи'), 'text')}${value}</div>
        ${removeButton(slot, exercise.name, 'exercise')}
        ${ed(`ex:${item.exercise}.how`, exercise.how, t('як робити: короткий опис вправи'), t('як робити'), 'long', 't-2nd-regular')}
        ${checkbox(t('n с'), item.seconds !== null, `${act('timed')} data-path="${path}"`)}
        ${linkField(`ex:${item.exercise}.source`, exercise.source)}`;
  return entry(ctx, family, slot, item.exercise, exercise.name, inner, ' st-ex');
}

export function prescription(item: WorkoutItem): string {
  return `${item.sets ? `${item.sets} × ` : ''}${item.reps}`;
}

function workoutFields(item: WorkoutItem, path: string): string {
  const on = (field: WorkoutItem['fields'][number]) => item.fields.includes(field);
  const box = (field: WorkoutItem['fields'][number], label: string) => checkbox(label, on(field), `${act('wfield')} data-path="${path}.fields" data-field="${field}"`);
  const seconds = on('seconds') ? ed(`${path}.seconds`, item.seconds === null ? '' : `${formatNumber(item.seconds)} ${t('с')}`, t('скільки секунд'), t('скільки секунд'), 'number', 't-3rd-regular st-value') : '';
  const weight = on('weight') ? ed(`${path}.weight`, item.weight === null ? '' : `${formatNumber(item.weight)} ${t('кг')}`, t('стартова вага'), t('вага'), 'number', 't-3rd-regular st-value') : '';
  return `<div class="st-fields">
          <div class="st-row">${box('seconds', t('n с'))}${seconds}</div>
          <div class="st-row">${box('weight', t('n кг'))}${weight}</div>
          ${box('reps', t('n разів'))}
        </div>`;
}

function workoutItem(ctx: Ctx, slot: Slot, item: WorkoutItem): string {
  const path = `${slot.list}.${slot.index}`;
  const exercise = exerciseHead(ctx, item.exercise);
  if (ctx.view.picking) return pickRow(ctx, slot, item.exercise, exercise, prescription(item));
  const inner = `
        <div class="st-row">${ed(`ex:${item.exercise}.name`, exercise.name, t('вправа'), t('назва вправи'), 'text')}${
  ed(`${path}.@rx`, prescription(item), t('n разів'), t('підходи × повторення (наприклад, 3 × 10–12)'), 'rx', 't-3rd-regular st-value')}</div>
        ${removeButton(slot, exercise.name, 'exercise')}
        ${ed(`ex:${item.exercise}.how`, exercise.how, t('як робити: короткий опис вправи'), t('як робити'), 'long', 't-2nd-regular')}
        ${linkField(`ex:${item.exercise}.source`, exercise.source)}
        ${workoutFields(item, path)}`;
  return entry(ctx, 'wo-ex', slot, item.exercise, exercise.name, inner, ' st-ex');
}

/**
 * In «створити групу»: an exercise is a toggle with its name, «n разів» and how-to
 * (example/settings-create-group); another workout's are off once one is chosen.
 */
function pickRow(ctx: Ctx, slot: Slot, item: string, exercise: { name: string; how: string }, rx: string): string {
  const name = exercise.name;
  const picking = ctx.view.picking!;
  const chosen = picking.list === slot.list && picking.chosen.includes(slot.index);
  const other = picking.list !== null && picking.list !== slot.list;
  const full = !chosen && picking.chosen.length >= 3;
  const how = exercise.how ? `<span class="st-pick__how t-2nd-regular">${esc(exercise.how)}</span>` : '<span class="st-pick__how"></span>';
  return `<button type="button" class="ctl st-pick" ${act('pick', slotData(slot))} data-key="${esc(entryKey('wo-ex', item))}" aria-label="${esc(shown(name))}" aria-pressed="${chosen}"${other || full ? ' disabled' : ''}>
    <span class="st-pick__name t-1st-regular">${esc(shown(name))}</span><span class="st-pick__rx t-3rd-regular">${esc(rx || t('n разів'))}</span>${how}</button>`;
}

function groupMarkup(ctx: Ctx, slot: Slot, set: readonly WorkoutItem[]): string {
  const inner = `${slot.list}.${slot.index}.set`;
  const names = set.map((item) => shown(exerciseHead(ctx, item.exercise).name));
  const items = set.map((item, index) => workoutItem(ctx, { list: inner, index }, item));
  if (ctx.view.picking) return `<div class="st-group st-group--off"><p class="t-3rd-regular muted">${t('група вправ:')} ${esc(names.join(' + '))}</p></div>`;
  return entry(ctx, 'wo-ex', slot, `set:${set[0]?.exercise ?? ''}`, `${t('група вправ:')} ${names.join(' + ')}`, `<p class="t-3rd-regular muted">${t('група вправ')}</p>${list('wo-ex', inner, items)}`, ' st-group', ` data-group="${set.length}"`);
}

function workoutEntries(ctx: Ctx, path: string, items: readonly WorkoutEntry[]): string {
  return list('wo-ex', path, items.map((item, index) => ('set' in item
    ? groupMarkup(ctx, { list: path, index }, item.set)
    : workoutItem(ctx, { list: path, index }, item))));
}

/* levels, «для чого», workouts */

interface Container {
  readonly family: string;
  readonly id: string;
  readonly slot: Slot;
  readonly name: string;
  readonly head: string;
  readonly meta: string;
  readonly body: () => string;
  readonly thing: Thing;
  readonly forceOpen?: boolean;
}

/** «видалити …» is the first line of the open box, under its title; while picking a group there is nothing to delete. */
function container(ctx: Ctx, c: Container): string {
  const open = c.forceOpen === true || ctx.view.inner.has(c.id);
  const items = `${c.slot.list}.${c.slot.index}.items`;
  const body = () => `${ctx.view.picking ? '' : removeButton(c.slot, c.name, c.thing)}${c.body()}`;
  const inner = box(c.head, open, toggle(c.id, c.name, open), c.meta, body);
  return entry(ctx, c.family, c.slot, c.id, c.name, inner, ' st-box', ` data-items="${esc(items)}"${open ? '' : ' data-closed="1"'}`);
}

const addExercise = (items: string) => `<div class="st-end">${tertiary(t('додати вправу'), act('add', `data-what="exercise" data-list="${esc(items)}"`))}</div>`;

export function morningBody(ctx: Ctx): string {
  const { morningWarmup } = ctx.settings;
  const head = activityHead(ctx, 'morningWarmup', false);
  if (!morningWarmup.enabled) return head;
  const path = LIST_OF.morningWarmup;
  const levels = morningWarmup.levels.map((level, index) => {
    const items = `${path}.${index}.items`;
    return container(ctx, {
      family: 'lv', thing: 'level', id: level.id, slot: { list: path, index }, name: level.name,
      head: `${ed(`${path}.${index}.name`, level.name, t('назва рівня (наприклад, легкий день)'), t('назва рівня'), 'text', 't-h6 st-grow')}${
        ed(`${path}.${index}.duration`, level.duration, t('час'), t('час (наприклад, 10 хв)'), 'text', 't-3rd-regular st-value')}`,
      meta: exerciseCount(level.items),
      body: () => `${list('mw-ex', items, level.items.map((item, i) => warmupItem(ctx, 'mw-ex', { list: items, index: i }, item)))}${addExercise(items)}`,
    });
  });
  return `${head}${target(ctx, 'morningWarmup')}${list('lv', path, levels)}${addButton(t('додати рівень'), 'data-what="level"')}`;
}

export function daytimeBody(ctx: Ctx): string {
  const { daytimeWarmup } = ctx.settings;
  const head = activityHead(ctx, 'daytimeWarmup', true);
  if (!daytimeWarmup.enabled) return head;
  const path = LIST_OF.daytimeWarmup;
  const zones = daytimeWarmup.groups.map((zone, index) => {
    const items = `${path}.${index}.items`;
    return container(ctx, {
      family: 'dg', thing: 'zone', id: zone.id, slot: { list: path, index }, name: zone.name,
      head: ed(`${path}.${index}.name`, zone.name, t('для чого (наприклад, для спини)'), t('для чого'), 'text', 't-h6 st-grow'),
      meta: exerciseCount(zone.items),
      body: () => `${list('dw-ex', items, zone.items.map((item, i) => warmupItem(ctx, 'dw-ex', { list: items, index: i }, item)))}${addExercise(items)}`,
    });
  });
  return `${head}${target(ctx, 'daytimeWarmup')}${list('dg', path, zones)}${addButton(t('додати зону'), 'data-what="zone"')}`;
}

function groupHint(ctx: Ctx): string {
  const { picking } = ctx.view;
  if (!picking) {
    return `<p class="t-2nd-regular muted">${t('група вправ — 2–3 вправи, які робиш разом. натисни «створити групу» й обери вправи. або потягни вправу на іншу, як застосунки в папку на телефоні.')}</p>
        <div>${tertiary(t('створити групу'), act('pick-start'))}</div>`;
  }
  const n = picking.chosen.length;
  return `<div class="st-row st-picking">
          <p class="t-2nd-bold st-grow" aria-live="polite">${t('обери 2–3 вправи для групи')}</p>
          ${iconButton('check', t('зібрати групу'), act('pick-done'), n < 2 || n > 3)}
          ${iconButton('close', t('скасувати групу'), act('pick-cancel'))}
        </div>`;
}

export function workoutBody(ctx: Ctx): string {
  const { workout } = ctx.settings;
  const head = activityHead(ctx, 'workout', true);
  if (!workout.enabled) return head;
  const path = LIST_OF.workout;
  const sessions = workout.sessions.map((session, index) => {
    const items = `${path}.${index}.items`;
    return container(ctx, {
      family: 'ss', thing: 'session', id: session.id, slot: { list: path, index }, name: session.name ? sessionName(session.name) : '',
      head: ed(`${path}.${index}.name`, session.name ? sessionName(session.name) : '', t('тренування (назва)'), t('назва тренування'), 'text', 't-h6 st-grow'),
      meta: exerciseCount(session.items),
      forceOpen: ctx.view.picking !== null,
      body: () => `${ed(`${path}.${index}.how`, session.how, t('як робити: як проходить тренування'), t('як проходить тренування'), 'long', 't-2nd-regular')}
          ${workoutEntries(ctx, items, session.items)}${ctx.view.picking ? '' : addExercise(items)}`,
    });
  });
  return `${head}${groupHint(ctx)}${target(ctx, 'workout')}${list('ss', path, sessions)}${addButton(t('додати тренування'), 'data-what="session"')}`;
}

const MOVEMENT_FIELDS: readonly [MovementKind['fields'][number], string][] = [['km', t('n км')], ['minutes', t('n хв')], ['steps', t('n кроків')]];

function movementKind(ctx: Ctx, kind: MovementKind, index: number): string {
  const path = `${LIST_OF.movement}.${index}`;
  const slot = { list: LIST_OF.movement, index };
  const fields = MOVEMENT_FIELDS.map(([field, label]) => checkbox(label, kind.fields.includes(field), `${act('mfield')} data-path="${path}.fields" data-field="${field}"`));
  const inner = `
        <div class="st-row">${ed(`${path}.name`, kind.name, t('що саме (наприклад, прогулянка)'), t('що саме'), 'text', 't-1st-semibold')}</div>
        ${removeButton(slot, kind.name, 'movement')}
        ${linkField(`${path}.source`, kind.source)}
        <div class="st-fields">${fields.join('')}</div>`;
  return entry(ctx, 'mv', slot, kind.id, kind.name, inner, ' st-mv');
}

export function movementBody(ctx: Ctx): string {
  const { movement } = ctx.settings;
  const head = activityHead(ctx, 'movement', true);
  if (!movement.enabled) return head;
  const kinds = movement.kinds.map((kind, index) => movementKind(ctx, kind, index));
  return `${head}${list('mv', LIST_OF.movement, kinds)}${target(ctx, 'movement')}${addButton(t('додати рух'), 'data-what="movement"')}`;
}

/* ---- the lines of closed parts ---- */

const LEVELS = ['рівень', 'рівні', 'рівнів'] as const;
const ZONES = ['зона', 'зони', 'зон'] as const;
const SESSIONS = ['тренування', 'тренування', 'тренувань'] as const;
const KINDS = ['вид руху', 'види руху', 'видів руху'] as const;

export function sectionMetas(settings: Settings): Record<ActivityKind, string> {
  const off = (kind: ActivityKind, line: string) => (settings[kind].enabled ? line : t('вимкнено'));
  const names = settings.movement.kinds.map((kind) => kind.name.trim()).filter(Boolean);
  return {
    morningWarmup: off('morningWarmup', count(settings.morningWarmup.levels.length, LEVELS)),
    daytimeWarmup: off('daytimeWarmup', count(settings.daytimeWarmup.groups.length, ZONES)),
    workout: off('workout', count(settings.workout.sessions.length, SESSIONS)),
    movement: off('movement', names.length ? names.join(', ') : count(settings.movement.kinds.length, KINDS)),
  };
}
