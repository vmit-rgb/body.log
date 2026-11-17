import type { DayKey } from '../domain/dates';
import type { Day, MovementLog } from '../domain/day';
import { formatLaps, formatSets, lastLaps, lastSets } from '../domain/history';
import { exerciseName as nameOf, MOMENT_TITLES, sessionName } from '../domain/journal';
import { lapRows, roundRows, setRows } from '../domain/log';
import { countLabel, formatNumber } from '../domain/numbers';
import { levelDone } from '../domain/progress';
import type {
  DaytimeGroup, Exercise, Level, Moment, MovementField, MovementKind, Settings, Source, Tracker, WarmupItem, WorkoutEntry, WorkoutItem,
} from '../domain/settings';
import { esc } from '../ui/html';
import { iconSvg } from '../ui/icons';
import { smallUnits } from '../ui/units';
import { withGrip } from '../ui/grip';
import { beatsLine } from '../domain/stats';
import {
  formatCountdown, formatStopwatch, PULSE_SAYS, pulseQuestion, pulseRunning, pulseTime, stopwatchState, type HomeSession, type PulseRun, type StopwatchState,
} from './session';

/*
 * The inside of the home sections (Figma `activity/section` 112:4468 and its
 * parts), as HTML. Every text from the settings or the log goes through esc().
 * Buttons say what they do in `data-act`; screens/home.ts listens for them.
 * Texts: COPY.md (Home); behaviour: «бета 0.81» and ACCESSIBILITY.md.
 */

export interface SectionContext {
  readonly settings: Settings;
  readonly day: Day;
  readonly days: Readonly<Record<DayKey, Day>>;
  readonly session: HomeSession;
  /** Whether a tip for newcomers still shows (the person hasn't closed it on this phone). */
  readonly tipOpen?: ((id: string) => boolean) | undefined;
  /** «закінчити тренування» was pressed for this day (on this phone; wave 5b). */
  readonly finished?: boolean | undefined;
}


const CHECK_IN = 'відміть, як ти зараз. правильних відповідей тут немає.';
const AI_LINK = 'це посилання дав ШІ. перевір його, перш ніж повторювати.';

/** A key for things the session remembers about the day shown. */
const dayKey = (ctx: SectionContext, key: string) => `${ctx.day.date}|${key}`;

let ids = 0;
/** A fresh id for aria-controls; ids from the settings are not safe in selectors. */
const nextId = () => `p${++ids}`;

/** The key a new render finds a field by, to give it the focus back. */
const keyed = (key: string) => `data-key="${esc(key)}"`;
const muted = (text: string) => (text ? `<p class="t-2nd-regular muted">${esc(text)}</p>` : '');
const hint = (tracker: Tracker) => (tracker.hint ? `<p class="t-3rd-regular muted">${esc(tracker.hint)}</p>` : '');

const exerciseName = (ctx: SectionContext, id: string) => nameOf(ctx.settings, [ctx.day, ...Object.values(ctx.days)], id);
const exerciseById = (ctx: SectionContext, id: string): Exercise | undefined => ctx.settings.exercises.find((x) => x.id === id);

/** An accordion the session remembers; open unless closed (or `openFirst` says otherwise). */
function remembered(ctx: SectionContext, key: string, openFirst: boolean): boolean {
  return ctx.session.open.get(dayKey(ctx, key)) ?? openFirst;
}

function accordion(kind: 'group' | 'paragraph' | 'mini', title: string, memo: string, open: boolean, body: string, meta = ''): string {
  const id = nextId();
  return `
    <button type="button" class="ctl accordion accordion--${kind}" aria-expanded="${open}" aria-controls="${id}" data-memo="${esc(memo)}">
      <span class="accordion__title">${title}</span>${meta ? `<span class="accordion__meta">${meta}</span>` : ''}
    </button>
    <div class="acc-body acc-body--${kind}" id="${id}"${open ? '' : ' hidden'}>${body}</div>`;
}

function link(source: Source): string {
  if (source.type !== 'link') return '';
  const ai = source.by === 'ai'
    ? `<button type="button" class="ctl ai-mark" data-act="ai-tip" aria-label="про посилання від ШІ" title="${AI_LINK}">*</button>` : '';
  return `<span class="ex-link"><a class="ctl btn btn--tertiary" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">посилання</a>${ai}</span>`;
}

/** «як робити» text: an empty line starts a new paragraph, a single line break stays (Olesia, MY-FIXES). */
export function howParagraphs(text: string, cls = 'how t-2nd-regular'): string {
  return text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).map((part) => `<p class="${cls}">${esc(part)}</p>`).join('');
}

function howTo(exercise: Exercise | undefined): string {
  if (!exercise || (!exercise.how && exercise.source.type !== 'link')) return '';
  return `${exercise.how ? `<div class="how-text">${howParagraphs(exercise.how)}</div>` : ''}${link(exercise.source)}`;
}

function howAccordion(ctx: SectionContext, memo: string, body: string, title = 'як робити'): string {
  return body ? `<div class="how-acc">${accordion('mini', title, dayKey(ctx, memo), remembered(ctx, memo, false), body)}</div>` : '';
}

/* ---- tips for newcomers (waves 5, 5b): until «зрозуміло» or three successes (Olesia, 2026-11-17) ---- */

/* Нитка's drafts. */
export const SETS_TIP = 'sets';
const SETS_TIP_TEXT = 'зайвий підхід прибирає × праворуч від нього: натисни ×, а потім ✓.';
export const SLIDER_TIP = 'slider';
export const SLIDER_TIP_TEXT = 'значення запишеться, коли натиснеш «зберегти» (або саме, за 20 с).';
export const REMOVE_TIP = 'remove';
const REMOVE_TIP_TEXT = '× нічого не стирає одразу: натисни ✓, щоб видалити.';
export const ROUNDS_TIP = 'rounds';
const ROUNDS_TIP_TEXT = '«ще раз» додає ще один таймер, щоб записати вправу ще раз.';

export function tip(id: string, text: string): string {
  return `<div class="tip" role="note" data-tip-id="${esc(id)}"><p class="t-3rd-regular tip__text">${text}</p>
    <button type="button" class="ctl btn btn--tertiary tip__close" data-act="tip-close" data-tip="${esc(id)}" aria-label="зрозуміло, сховати підказку">зрозуміло</button></div>`;
}

const tipOpen = (ctx: SectionContext, id: string) => ctx.tipOpen?.(id) ?? false;

/** Under a row whose × has turned into ✓: what the ✓ does. `quiet` where the sets tip already says it. */
function armedTip(ctx: SectionContext, target: string, quiet = false): string {
  return !quiet && ctx.session.armed === dayKey(ctx, target) && tipOpen(ctx, REMOVE_TIP) ? tip(REMOVE_TIP, REMOVE_TIP_TEXT) : '';
}

/** The first slider with a value not saved yet gets the tip (one at a time). */
function firstDraft(ctx: SectionContext): string | undefined {
  const prefix = `${ctx.day.date}|`;
  return [...ctx.session.drafts.keys()].find((key) => key.startsWith(prefix));
}

/* ---- wellbeing questions (Figma tracker/field, tracker/yes-no, input/labeled) ---- */

interface Field { readonly key: string; readonly label: string; readonly value: string; readonly unit: string; readonly data: string }

/* Figma input/base number: [ 0000____ ] одиниці; --len tells the line where the digits end (ui/number-fill). */
function numberInput(field: Field): string {
  return `<span class="number__bracket" aria-hidden="true">[</span>
      <input class="number__input" inputmode="decimal" autocomplete="off" enterkeyhint="done" aria-label="${esc(field.label)}"
        value="${esc(field.value)}" style="--len: ${field.value.length}" ${keyed(field.key)} ${field.data} />
      <span class="number__bracket" aria-hidden="true">]</span>`;
}

function numberField(field: Field): string {
  return `
    <label class="number">${numberInput(field)}${field.unit ? `<span class="number__unit">${esc(field.unit)}</span>` : ''}</label>`;
}

/** input/base number-pair: [ ] / [ ] and one unit (both, when they differ). */
function numberPair(first: Field, second: Field): string {
  const unit = first.unit === second.unit ? first.unit : `${first.unit} / ${second.unit}`;
  return `
    <div class="number number--pair">
      <label class="number__half">${numberInput(first)}</label>
      <span class="number__slash" aria-hidden="true">/</span>
      <label class="number__half">${numberInput(second)}</label>
      <span class="number__unit">${esc(unit)}</span>
    </div>`;
}

function trackerData(moment: Moment, tracker: Tracker): string {
  return `data-moment="${moment}" data-tracker="${esc(tracker.id)}"`;
}

function scaleTracker(ctx: SectionContext, moment: Moment, tracker: Tracker & { kind: 'scale' }): string {
  const saved = ctx.day.t[moment]?.[tracker.id];
  const key = dayKey(ctx, `slide|${moment}|${tracker.id}`);
  const draft = ctx.session.drafts.get(key)?.value;
  const value = typeof saved === 'number' ? saved : draft;
  const locked = typeof saved === 'number';
  const state = locked ? ' tracker--locked' : value === undefined ? ' tracker--unset' : '';
  return `
    <div class="tracker tracker--scale${state}">
      <div class="tracker__head">
        <span class="t-1st-semibold tracker__name">${esc(tracker.name || 'без назви')}</span>
        <span class="tracker__value t-3rd-semibold" aria-live="polite">${value === undefined ? '' : `${formatNumber(value)}/${formatNumber(tracker.max)}`}</span>${
          sliderAction(locked, draft !== undefined, trackerData(moment, tracker))}
      </div>
      ${sliderRow({ tracker, key, value, locked, data: trackerData(moment, tracker) })}
      ${!locked && draft !== undefined && firstDraft(ctx) === key && tipOpen(ctx, SLIDER_TIP) ? tip(SLIDER_TIP, SLIDER_TIP_TEXT) : ''}${hint(tracker)}
    </div>`;
}

/** «скинути» on a saved value, «зберегти» on a draft, nothing on an empty slider. */
function sliderAction(locked: boolean, drafted: boolean, data: string): string {
  if (locked) return `<button type="button" class="ctl btn btn--tertiary" data-act="slide-reset" ${data}>скинути</button>`;
  return drafted ? `<button type="button" class="ctl btn btn--tertiary" data-act="slide-save" ${data}>зберегти</button>` : '';
}

interface SliderRow { readonly tracker: Tracker & { kind: 'scale' }; readonly key: string; readonly value: number | undefined; readonly locked: boolean; readonly data: string }

/** − slider + (tracker/field, 2026-11-08); a saved value locks all three. */
function sliderRow({ tracker, key, value, locked, data }: SliderRow): string {
  const name = esc(tracker.name || 'без назви');
  const off = locked ? ' disabled' : '';
  const step = (delta: number, label: string, icon: 'add' | 'remove') => `<button type="button" class="ctl icon-btn icon-btn--secondary" data-act="slide-step"
    data-delta="${delta}" data-min="${tracker.min}" data-max="${tracker.max}" ${data} aria-label="${label}: ${name}"${off}>${iconSvg(icon)}</button>`;
  const spoken = value === undefined ? 'не записано' : `${formatNumber(value)} з ${formatNumber(tracker.max)}`;
  return `
    <div class="slider-row">${step(-1, 'менше', 'remove')}
      <input type="range" class="slider" min="${tracker.min}" max="${tracker.max}" step="1" value="${value ?? tracker.min}"
        aria-label="${name}" aria-valuetext="${spoken}" ${keyed(key)} data-input="slide" ${data}${off} />${step(1, 'більше', 'add')}
    </div>`;
}

function yesNoTracker(ctx: SectionContext, moment: Moment, tracker: Tracker): string {
  const checked = ctx.day.t[moment]?.[tracker.id] === 'yes';
  return `
    <div class="tracker">
      <label class="ctl checkbox"><input class="checkbox__input" type="checkbox" data-input="yesno" ${trackerData(moment, tracker)}
        ${keyed(dayKey(ctx, `yes|${moment}|${tracker.id}`))}${checked ? ' checked' : ''} /><span class="checkbox__box" aria-hidden="true"></span>
        <span class="checkbox__label t-1st-semibold">${esc(tracker.name || 'без назви')}</span></label>${hint(tracker)}
    </div>`;
}

/**
 * A one-number tracker with the pulse timer: «пульс» … «уд/хв», then the
 * field and the timer drawn as a stopwatch (Olesia, 2026-11-12); while it
 * counts, a small line under them. At «скільки ударів?» the question takes the row.
 */
function timedTracker(ctx: SectionContext, moment: Moment, tracker: Tracker & { kind: 'number' }): string {
  const own = ctx.session.pulse;
  const run = own?.key === pulseKey(ctx, moment, tracker) ? own : null;
  const data = trackerData(moment, tracker);
  const head = `<div class="pulse__head"><span class="t-1st-bold">${esc(tracker.name || 'без назви')}</span><span class="t-3rd-regular muted">${esc(tracker.unit)}</span></div>`;
  if (run?.phase === 'beats') return `<div class="tracker pulse" data-pulse ${data}>${head}${pulseBeats(run, data)}</div>`;
  const [field] = trackerFields(ctx, moment, tracker);
  return `
    <div class="tracker pulse" data-pulse ${data}>${head}
      <div class="pulse__row">${numberField({ ...field!, unit: '' })}${pulseTimer(ctx, moment, tracker, run)}</div>${
        armedTip(ctx, `pulse|${moment}|${tracker.id}`)}${pulseNote(run)}${hint(tracker)}
    </div>`;
}

function trackerFields(ctx: SectionContext, moment: Moment, tracker: Tracker & { kind: 'number' | 'numbers' }): Field[] {
  const saved = ctx.day.t[moment]?.[tracker.id];
  const values = Array.isArray(saved) ? saved : [typeof saved === 'number' ? saved : null];
  const units = tracker.kind === 'numbers' ? tracker.units : [tracker.unit];
  const name = tracker.name || 'без назви';
  return units.map((unit, i): Field => ({
    key: dayKey(ctx, `num|${moment}|${tracker.id}|${i}`),
    label: numberLabel(name, units.length, i, unit),
    value: formatNumber(values[i] ?? null),
    unit,
    data: `data-input="number" ${trackerData(moment, tracker)} data-i="${i}" data-n="${units.length}"`,
  }));
}

function numbersTracker(ctx: SectionContext, moment: Moment, tracker: Tracker & { kind: 'number' | 'numbers' }): string {
  const parts = trackerFields(ctx, moment, tracker);
  const fields = parts.length === 2 ? [numberPair(parts[0]!, parts[1]!)] : parts.map(numberField);
  return `
    <div class="tracker">
      <div class="labeled"><span class="t-1st-semibold labeled__name">${esc(tracker.name || 'без назви')}</span><div class="labeled__fields">${fields.join('')}</div></div>${hint(tracker)}
    </div>`;
}

/* ---- pulse timer (Figma tracker/pulse-timer 398:11959; COPY.md «Pulse timer»; as the stopwatch, Olesia 2026-11-12) ---- */

export const pulseKey = (ctx: SectionContext, moment: Moment, tracker: Tracker) => dayKey(ctx, `pulse|${moment}|${tracker.id}`);

const PULSE_LABELS: Record<StopwatchState, (seconds: number) => string> = {
  default: (seconds) => `запустити таймер, ${seconds} с`,
  running: () => 'зупинити й скасувати',
  saved: () => 'збережено. натисни, щоб виміряти заново',
  retry: () => 'натисни ще раз — і таймер запуститься',
};

/** ▶ nothing saved, ■ getting ready or counting, ✓ a number saved, ↻ asked to count again. */
function pulseState(ctx: SectionContext, key: string, saved: unknown, run: PulseRun | null): StopwatchState {
  if (pulseRunning(run)) return 'running';
  if (saved == null) return 'default';
  return ctx.session.retry.has(key) ? 'retry' : 'saved';
}

/** The button and the time, as the stopwatch; × clears a saved number (hidden while there is none, or while it counts). */
function pulseTimer(ctx: SectionContext, moment: Moment, tracker: Tracker & { kind: 'number' }, run: PulseRun | null): string {
  const target = `pulse|${moment}|${tracker.id}`;
  const key = dayKey(ctx, target);
  const saved = ctx.day.t[moment]?.[tracker.id];
  const state = pulseState(ctx, key, saved, run);
  const seconds = tracker.timer ?? 0;
  const counting = run !== null && state === 'running';
  const time = counting ? pulseTime(run, Date.now()) : formatCountdown(seconds * 1000);
  return `
    <div class="sw" data-state="${state}">
      <button type="button" class="ctl icon-btn icon-btn--secondary sw__btn" data-act="pulse" data-pulse-sw="${esc(target)}" ${trackerData(moment, tracker)}
        aria-label="${PULSE_LABELS[state](seconds)}">${iconSvg(SW_ICONS[state])}</button>
      <span class="sw__time t-1st-bold" data-sw-time="${esc(key)}"${counting ? ' data-pulse-left' : ''}>${time}</span>
      ${state === 'retry' ? '<span class="sw__again t-3rd-regular muted">знову</span>' : ''}
    </div>${removeButton(ctx, target, `скинути ${tracker.name || 'без назви'}`, saved == null || counting)}`;
}

/** «приготуйся» / «рахуй удари» while it runs; «42 удари за 30 с × 2» after «готово», until the day changes. */
function pulseNote(run: PulseRun | null): string {
  if (run?.phase === 'ready' || run?.phase === 'counting') return `<p class="pulse__note t-3rd-regular muted">${PULSE_SAYS[run.phase]}</p>`;
  if (run?.phase === 'done') return `<p class="pulse__note t-3rd-regular muted">${beatsLine(run.beats ?? 0, run.seconds)}</p>`;
  return '';
}

/** «скільки ударів за 30 с?», the field, «готово» and «скасувати». */
function pulseBeats(run: PulseRun, data: string): string {
  const question = pulseQuestion(run.seconds);
  return `
    <p class="pulse__note t-1st-regular">${question}</p>
    <div class="labeled__fields">${numberField({ key: `${run.key}|beats`, label: question, value: '', unit: 'ударів', data: 'data-input="beats"' })}
      <button type="button" class="ctl btn btn--primary" data-act="pulse-done" ${data}>готово</button>
      <button type="button" class="ctl btn btn--tertiary" data-act="pulse-cancel" ${data}>скасувати</button></div>`;
}

/** «тиск, перше число, мм рт. ст.» */
function numberLabel(name: string, count: number, i: number, unit: string): string {
  const which = count > 1 ? [', перше число', ', друге число'][i] : '';
  return `${name}${which}${unit ? `, ${unit}` : ''}`;
}

function noteTracker(ctx: SectionContext, moment: Moment, tracker: Tracker): string {
  const saved = ctx.day.t[moment]?.[tracker.id];
  return `
    <div class="tracker">
      <label class="tracker__note"><span class="t-1st-semibold">${esc(tracker.name || 'без назви')}</span>
        ${withGrip(`<textarea class="field" rows="3" placeholder="як минув день? пиши як є" data-input="tracker-note" ${trackerData(moment, tracker)}
          ${keyed(dayKey(ctx, `tnote|${moment}|${tracker.id}`))}>${esc(typeof saved === 'string' ? saved : '')}</textarea>`)}</label>${hint(tracker)}
    </div>`;
}

function trackerMarkup(ctx: SectionContext, moment: Moment, tracker: Tracker): string {
  switch (tracker.kind) {
    case 'scale': return scaleTracker(ctx, moment, tracker);
    case 'yesno': return yesNoTracker(ctx, moment, tracker);
    case 'note': return noteTracker(ctx, moment, tracker);
    case 'number': return tracker.timer === null ? numbersTracker(ctx, moment, tracker) : timedTracker(ctx, moment, tracker);
    default: return numbersTracker(ctx, moment, tracker);
  }
}

const askedAt = (ctx: SectionContext, moment: Moment) => ctx.settings.trackers.filter((tracker) => tracker.ask.includes(moment));

/** The questions of a moment, as the body of the morning and evening sections. */
export function checkInBody(ctx: SectionContext, moment: Moment): string {
  return askedAt(ctx, moment).map((tracker) => trackerMarkup(ctx, moment, tracker)).join('');
}

/** «самопочуття після розминки» and the like, inside a section (Figma accordion/subsection, check-in). */
function checkInSub(ctx: SectionContext, moment: Moment): string {
  if (askedAt(ctx, moment).length === 0) return '';
  const body = `<p class="t-1st-regular">${CHECK_IN}</p>${checkInBody(ctx, moment)}`;
  return `<div class="sub">${accordion('group', MOMENT_TITLES[moment], dayKey(ctx, `ck|${moment}`), remembered(ctx, `ck|${moment}`, true), body)}</div>`;
}

/* ---- remove × → ✓, stopwatch ---- */

const NO_REMOVE = '<span class="rm-space" aria-hidden="true"></span>';

/** `idle`: the only timer without a time has nothing to reset, so its × waits hidden (Olesia, 2026-11-11). */
function removeButton(ctx: SectionContext, target: string, label: string, idle = false): string {
  if (idle) return NO_REMOVE;
  const armed = ctx.session.armed === dayKey(ctx, target);
  return `<button type="button" class="ctl icon-btn icon-btn--secondary rm${armed ? ' rm--armed' : ''}" data-act="rm" data-rm="${esc(target)}"
    aria-label="${armed ? `точно ${label}` : label}">${iconSvg(armed ? 'check' : 'close')}</button>`;
}

/** The only timer that never ran has nothing to reset (0.81). */
const idleTimer = (ctx: SectionContext, target: string, n: number, saved: number | null) =>
  n === 1 && saved === null && !ctx.session.running.has(dayKey(ctx, target));

const SW_LABELS = {
  default: 'запустити секундомір',
  running: 'зупинити й зберегти',
  saved: 'збережено. натисни, щоб перезаписати',
  retry: 'натисни ще раз — і час запишеться заново',
} as const;
const SW_ICONS = { default: 'play', running: 'rectangle', saved: 'check', retry: 'restart' } as const;

function stopwatch(ctx: SectionContext, target: string, saved: number | null, n: number): string {
  const key = dayKey(ctx, target);
  const state = stopwatchState(ctx.session, key, saved);
  const started = ctx.session.running.get(key);
  const time = started === undefined ? formatStopwatch((saved ?? 0) * 1000) : formatStopwatch(performance.now() - started);
  return `
    <div class="sw" data-state="${state}">
      <button type="button" class="ctl icon-btn icon-btn--secondary sw__btn" data-act="sw" data-sw="${esc(target)}"
        aria-label="${SW_LABELS[state]}, ${n}">${iconSvg(SW_ICONS[state])}</button>
      <span class="sw__time t-1st-bold" data-sw-time="${esc(key)}">${time}</span>
      ${state === 'retry' ? '<span class="sw__again t-3rd-regular muted">знову</span>' : ''}
    </div>`;
}

/* ---- morning warm-up (Figma accordion/subsection checklist, checklist/exercise) ---- */

function repsLabel(item: WarmupItem): string {
  return item.seconds === null ? countLabel(item.reps) : `${formatNumber(item.seconds)} с`;
}

function timerRounds(ctx: SectionContext, item: WarmupItem): string {
  const times = ctx.day.mw.times[item.exercise] ?? [];
  const n = roundRows(ctx.day, item.exercise);
  const rows = Array.from({ length: n }, (_, i) => {
    const target = `round|${item.exercise}|${i}`;
    const label = n > 1 ? `видалити таймер ${i + 1}` : 'скинути таймер до нуля';
    // one round has no number (stopwatch 157:2903)
    return `<div class="set-row"><span class="set-row__n t-2nd-regular">${n > 1 ? i + 1 : ''}</span>${stopwatch(ctx, target, times[i] ?? null, i + 1)}${removeButton(ctx, target, label, idleTimer(ctx, target, n, times[i] ?? null))}</div>${armedTip(ctx, target)}`;
  });
  // checklist/exercise: the rows on the right, «ще раз» under them; the tip under the first «ще раз» of the warm-up
  const showTip = tipOpen(ctx, ROUNDS_TIP) && firstTimed(ctx) === item;
  return `<div class="sw-block"><div class="sets">${rows.join('')}</div>
    <button type="button" class="ctl btn btn--tertiary" data-act="more-rounds" data-ex="${esc(item.exercise)}">ще раз</button>${showTip ? tip(ROUNDS_TIP, ROUNDS_TIP_TEXT) : ''}</div>`;
}

/** The first timed exercise of the morning warm-up (the item itself: one exercise can be in two levels) carries the «ще раз» tip. */
const firstTimed = (ctx: SectionContext) =>
  ctx.settings.morningWarmup.levels.flatMap((level) => level.items).find((item) => item.seconds !== null);

/** + on the right of the row opens the stopwatch (open from the start), how-to and link (checklist/exercise expanded). */
function exerciseDetails(ctx: SectionContext, item: WarmupItem, name: string): { readonly more: string; readonly details: string } {
  const body = `${item.seconds === null ? '' : timerRounds(ctx, item)}${howTo(exerciseById(ctx, item.exercise))}`;
  if (!body) return { more: '', details: '' };
  const memo = `how|${item.exercise}`;
  const open = remembered(ctx, memo, item.seconds !== null);
  const id = nextId();
  return {
    more: `<button type="button" class="ctl icon-btn icon-btn--secondary accordion ex-check__more" aria-label="як робити: ${esc(name)}"
      aria-expanded="${open}" aria-controls="${id}" data-memo="${esc(dayKey(ctx, memo))}"></button>`,
    details: `<div class="ex-check__details" id="${id}"${open ? '' : ' hidden'}>${body}</div>`,
  };
}

function warmupItem(ctx: SectionContext, item: WarmupItem): string {
  const name = exerciseName(ctx, item.exercise);
  const ticked = ctx.day.mw.ticks.includes(item.exercise);
  const { more, details } = exerciseDetails(ctx, item, name);
  return `
    <li class="ex-check">
      <div class="ex-check__head">
        <label class="ctl checkbox ex-check__row"><input class="checkbox__input" type="checkbox" data-input="tick" data-ex="${esc(item.exercise)}"
          ${keyed(dayKey(ctx, `tick|${item.exercise}`))}${ticked ? ' checked' : ''} /><span class="checkbox__box" aria-hidden="true"></span>
          <span class="ex-check__name"><span class="checkbox__label t-1st-semibold">${esc(name)}</span> <span class="ex-check__reps t-3rd-semibold">${esc(repsLabel(item))}</span></span></label>
        ${more}
      </div>
      ${details}
    </li>`;
}

function levelMarkup(ctx: SectionContext, level: Level, index: number): string {
  const done = levelDone(ctx.day, level);
  const ticked = level.items.filter((item) => ctx.day.mw.ticks.includes(item.exercise)).length;
  const meta = [level.duration, done ? 'готово' : `${ticked} з ${level.items.length}`].filter(Boolean).map(esc).join(' · ');
  const markAll = `<button type="button" class="ctl btn btn--tertiary" data-act="level" data-level="${esc(level.id)}" data-done="${!done}">${
    done ? 'зняти позначки з рівня' : 'позначити весь рівень'}</button>`;
  // accordion/subsection: the button under the «5 хв · 1 з 2» line, on the left
  const body = `${markAll}<ul class="ex-list">${level.items.map((item) => warmupItem(ctx, item)).join('')}</ul>`;
  const open = remembered(ctx, `level|${level.id}`, !done);
  return `<div class="sub${done ? ' sub--done' : ''}">${accordion('group', esc(level.name || `рівень ${index + 1}`), dayKey(ctx, `level|${level.id}`), open, body, meta)}${
    done && !open ? markAll : ''}</div>`;
}

export function morningBody(ctx: SectionContext): string {
  const { levels } = ctx.settings.morningWarmup;
  const list = levels.length ? levels.map((level, i) => levelMarkup(ctx, level, i)).join('') : muted('рівнів ще немає. додай їх у налаштуваннях.');
  return `${muted(ctx.settings.morningWarmup.hint)}${list}${checkInSub(ctx, 'afterMorningWarmup')}`;
}

/* ---- daytime warm-up (Figma chip/multi-select-group, accordion/paragraph zones) ---- */

/**
 * One «для чого» inside «як робити»: an outlined region (common region,
 * Olesia, MY-FIXES); its exercises are paragraphs, 14 px, no boxes of their own.
 */
function zone(ctx: SectionContext, group: DaytimeGroup): string {
  const items = group.items.map((item) => {
    const reps = repsLabel(item);
    return `<div class="zone__item"><p class="t-2nd-semibold">${esc(exerciseName(ctx, item.exercise))}${reps ? ` · <span class="muted">${esc(reps)}</span>` : ''}</p>${
      howTo(exerciseById(ctx, item.exercise))}</div>`;
  });
  return `<div class="zone"><p class="t-1st-semibold">${esc(group.name)}</p>${items.join('')}</div>`;
}

export function daytimeBody(ctx: SectionContext): string {
  const { groups, hint: note } = ctx.settings.daytimeWarmup;
  const chips = groups.map((group) => `<button type="button" class="ctl chip" data-act="chip" data-group="${esc(group.id)}"
    aria-pressed="${ctx.day.dw.includes(group.id)}">${esc(group.name || 'без назви')}</button>`).join('');
  // the fill covers the whole accordion, its title and its body (Olesia, MY-FIXES)
  const how = groups.length ? `<div class="how-acc how-acc--filled">${accordion('paragraph', 'як робити', dayKey(ctx, 'how|dw'), remembered(ctx, 'how|dw', false),
    groups.map((group) => zone(ctx, group)).join(''))}</div>` : '';
  return `${muted(note)}${checkInSub(ctx, 'beforeDaytimeWarmup')}<div class="chips" role="group" aria-label="денна розминка: для чого">${chips}</div>${how}${
    checkInSub(ctx, 'afterDaytimeWarmup')}`;
}

/* ---- workout (Figma workout/exercise, workout/exercise-set, exercise/input, stopwatch) ---- */

function prescription(item: WorkoutItem): string {
  const amount = item.reps || (item.seconds === null ? '' : formatNumber(item.seconds));
  const timedOnly = item.fields.includes('seconds') && !item.fields.includes('reps') && amount !== '';
  return `${item.sets ? `${item.sets} × ` : ''}${amount}${timedOnly ? ' с' : ''}`;
}

function setFields(ctx: SectionContext, item: WorkoutItem, i: number): string {
  const set = ctx.day.wo?.ex[item.exercise]?.[i];
  const name = exerciseName(ctx, item.exercise);
  const field = (f: 'w' | 'r', label: string, unit: string) => numberField({
    key: dayKey(ctx, `set|${item.exercise}|${i}|${f}`),
    label: `${name}, підхід ${i + 1}, ${label}`,
    value: formatNumber(set?.[f] ?? null),
    unit,
    data: `data-input="set" data-ex="${esc(item.exercise)}" data-i="${i}" data-f="${f}"`,
  });
  const cells = [
    ...(item.fields.includes('weight') ? [field('w', 'вага, кг', 'кг')] : []),
    ...(item.fields.includes('reps') ? [field('r', 'повторення', 'повт.')] : []),
  ];
  return cells.length ? `<div class="set-row__fields">${cells.join('<span class="set-row__x" aria-hidden="true">×</span>')}</div>` : '';
}

function setRow(ctx: SectionContext, item: WorkoutItem, i: number, n: number, quiet: boolean): string {
  const target = `set|${item.exercise}|${i}`;
  const timed = item.fields.includes('seconds');
  const seconds = ctx.day.wo?.ex[item.exercise]?.[i]?.s ?? null;
  const remove = setRemove(ctx, target, timed, i, n, seconds);
  return `<div class="set-row${timed ? ' set-row--timed' : ''}"><span class="set-row__n t-2nd-regular">${n > 1 ? i + 1 : ''}</span>
    <div class="set-row__main">${timed ? stopwatch(ctx, target, seconds, i + 1) : ''}${setFields(ctx, item, i)}</div>${remove}</div>${armedTip(ctx, target, quiet)}`;
}

/** × from the second set; a timer has × always, and the only timer's × resets it. */
function setRemove(ctx: SectionContext, target: string, timed: boolean, i: number, n: number, seconds: number | null): string {
  if (!timed && i === 0) return NO_REMOVE;
  if (!timed || n > 1) return removeButton(ctx, target, `видалити підхід ${i + 1}`);
  return removeButton(ctx, target, 'скинути таймер до нуля', idleTimer(ctx, target, n, seconds));
}

/**
 * A workout exercise in its own filled box; its name folds it like a warm-up
 * level, for an exercise skipped today or already done (Olesia, MY-FIXES).
 */
function workoutExercise(ctx: SectionContext, item: WorkoutItem, showTip: boolean): string {
  const exercise = exerciseById(ctx, item.exercise);
  const n = setRows(ctx.day, item.exercise, item.sets);
  const last = lastSets(ctx.days, ctx.day.date, item.exercise);
  const cue = exercise?.how.split('\n')[0] ?? '';
  const memo = `wo|${item.exercise}`;
  const open = remembered(ctx, memo, true);
  const id = nextId();
  const name = exerciseName(ctx, item.exercise);
  return `
    <li class="wo-ex">
      <button type="button" class="ctl accordion accordion--exercise" aria-expanded="${open}" aria-controls="${id}" data-memo="${esc(dayKey(ctx, memo))}">
        <span class="accordion__title t-1st-semibold">${esc(name)}</span><span class="accordion__meta t-3rd-semibold">${esc(prescription(item))}</span>
      </button>
      <div class="acc-body acc-body--exercise" id="${id}"${open ? '' : ' hidden'}>
        <div class="wo-ex__sub">${cue ? `<p class="t-2nd-regular">${esc(cue)}</p>` : ''}${last ? `<p class="t-2nd-regular"><b>минулого разу:</b> ${smallUnits(esc(formatSets(last)))}</p>` : ''}</div>
        <div class="sets">${Array.from({ length: n }, (_, i) => setRow(ctx, item, i, n, showTip)).join('')}</div>${showTip ? tip(SETS_TIP, SETS_TIP_TEXT) : ''}
        <div class="wo-ex__actions">${howAccordion(ctx, `how|${item.exercise}`, howTo(exercise)) || '<span></span>'}
          <button type="button" class="ctl btn btn--tertiary" data-act="more-sets" data-ex="${esc(item.exercise)}">додати підхід</button></div>
      </div>
    </li>`;
}

/** The tip goes under the first exercise that has an × to explain (two sets or more). */
function tipExercise(ctx: SectionContext, items: readonly WorkoutItem[]): string | null {
  if (!tipOpen(ctx, SETS_TIP)) return null;
  return items.find((item) => setRows(ctx.day, item.exercise, item.sets) > 1)?.exercise ?? null;
}

/** A group: an outline only; each exercise in it keeps its own fill (Olesia, MY-FIXES). */
function workoutEntry(ctx: SectionContext, entry: WorkoutEntry, tipFor: string | null): string {
  if ('set' in entry) {
    return `<li class="wo-group"><p class="t-3rd-regular muted">група вправ</p><ol class="ex-list">${
      entry.set.map((item) => workoutExercise(ctx, item, item.exercise === tipFor)).join('')}</ol></li>`;
  }
  return workoutExercise(ctx, entry, entry.exercise === tipFor);
}

function pickedWorkout(ctx: SectionContext, sessionId: string): string {
  const session = ctx.settings.workout.sessions.find((s) => s.id === sessionId);
  if (!session) return muted('цього тренування вже немає в налаштуваннях. записи збережено.');
  const how = session.how ? `<div class="how-acc">${accordion('paragraph', 'як проходить тренування', dayKey(ctx, 'how|session'),
    remembered(ctx, 'how|session', false), howParagraphs(session.how))}</div>` : '';
  const rules = ctx.settings.workout.hint ? `<p class="wo-rules t-1st-regular">${esc(ctx.settings.workout.hint)}</p>` : '';
  const tipFor = tipExercise(ctx, session.items.flatMap((entry) => ('set' in entry ? entry.set : [entry])));
  return `${how}<h3 class="t-h5 wo-title">${esc(sessionName(session.name))}</h3>${rules}
    <ol class="ex-list">${session.items.map((entry) => workoutEntry(ctx, entry, tipFor)).join('')}</ol>${finishButton(ctx)}`;
}

/**
 * «закінчити тренування» (first level, at the bottom; Olesia, 2026-11-17):
 * the workout is done from it. Finished, «продовжити тренування» (third
 * level) opens it again; the fields stay open either way.
 */
function finishButton(ctx: SectionContext): string {
  const key = keyed(dayKey(ctx, 'finish'));
  return `<div class="wo-finish">${ctx.finished
    ? `<button type="button" class="ctl btn btn--tertiary" data-act="finish" data-done="false" ${key}>продовжити тренування</button>`
    : `<button type="button" class="ctl btn btn--primary" data-act="finish" data-done="true" ${key}>закінчити тренування</button>`}</div>`;
}

/** «прибрати з цього дня»: at the very top, under the section's title (Olesia, MY-FIXES). */
function dropButton(ctx: SectionContext): string {
  const armed = ctx.session.armed === dayKey(ctx, 'drop');
  return `<div class="wo-drop">${armed
    ? '<p class="t-2nd-regular">записи цього тренування видаляться.</p><button type="button" class="ctl btn btn--destructive" data-act="drop">так, прибрати з цього дня</button>'
    : '<button type="button" class="ctl btn btn--destructive" data-act="drop">прибрати з цього дня</button>'}</div>`;
}

/** What a section shows above its description: «прибрати з цього дня» once a workout is picked. */
export function sectionTop(id: string, ctx: SectionContext): string {
  return id === 'wo' && ctx.day.wo ? dropButton(ctx) : '';
}

export function workoutBody(ctx: SectionContext): string {
  const { sessions } = ctx.settings.workout;
  const before = checkInSub(ctx, 'beforeWorkout');
  if (!ctx.day.wo) {
    const picks = sessions.map((s) => `<button type="button" class="ctl btn btn--secondary pick" data-act="pick" data-session="${esc(s.id)}">${esc(sessionName(s.name))}</button>`);
    return `${before}${picks.join('') || muted('тренувань ще немає. додай їх у налаштуваннях.')}`;
  }
  return `${before}${pickedWorkout(ctx, ctx.day.wo.session)}${checkInSub(ctx, 'afterWorkout')}`;
}

/* ---- movement (Figma activity/section movement): laps («додати коло», Olesia 2026-11-09) ---- */

const MOVEMENT_UNITS: Record<MovementField, { readonly key: keyof MovementLog; readonly unit: string }> = {
  km: { key: 'km', unit: 'км' },
  minutes: { key: 'min', unit: 'хв' },
  steps: { key: 'steps', unit: 'кроків' },
};

function lapRow(ctx: SectionContext, kind: MovementKind, i: number, n: number): string {
  const lap = ctx.day.mv[kind.id]?.[i];
  const fields = kind.fields.map((f) => {
    const { key, unit } = MOVEMENT_UNITS[f];
    return numberField({
      key: dayKey(ctx, `lap|${kind.id}|${i}|${key}`),
      label: `${kind.name}${n > 1 ? `, коло ${i + 1}` : ''}, ${unit}`,
      value: formatNumber(lap?.[key] ?? null),
      unit,
      data: `data-input="lap" data-kind="${esc(kind.id)}" data-i="${i}" data-f="${key}"`,
    });
  });
  const remove = i > 0 ? removeButton(ctx, `lap|${kind.id}|${i}`, `видалити коло ${i + 1}`) : NO_REMOVE;
  return `<div class="set-row"><span class="set-row__n t-2nd-regular">${n > 1 ? i + 1 : ''}</span><div class="set-row__main lap">${fields.join('')}</div>${remove}</div>${armedTip(ctx, `lap|${kind.id}|${i}`)}`;
}

function movementKind(ctx: SectionContext, kind: MovementKind): string {
  const n = lapRows(ctx.day, kind.id);
  const last = lastLaps(ctx.days, ctx.day.date, kind.id);
  return `
    <div class="mv-kind">
      <p class="t-1st-semibold">${esc(kind.name || 'без назви')}</p>
      ${last ? `<div class="wo-ex__sub"><p class="t-2nd-regular"><b>минулого разу:</b> ${esc(formatLaps(last))}</p></div>` : ''}
      <div class="sets">${Array.from({ length: n }, (_, i) => lapRow(ctx, kind, i, n)).join('')}</div>
      <div class="wo-ex__actions">${howAccordion(ctx, `how|mv|${kind.id}`, link(kind.source)) || '<span></span>'}
        <button type="button" class="ctl btn btn--tertiary" data-act="add-lap" data-kind="${esc(kind.id)}">додати коло</button></div>
    </div>`;
}

export function movementBody(ctx: SectionContext): string {
  const { kinds, hint: note } = ctx.settings.movement;
  return `${muted(note)}${checkInSub(ctx, 'beforeMovement')}${kinds.map((kind) => movementKind(ctx, kind)).join('')}${checkInSub(ctx, 'afterMovement')}`;
}

/* ---- note ---- */

export function noteBody(ctx: SectionContext): string {
  return `${withGrip(`<textarea class="field note-field" rows="3" aria-label="нотатка" placeholder="як минув день? пиши як є" data-input="note"
    ${keyed(dayKey(ctx, 'note'))}>${esc(ctx.day.note)}</textarea>`)}<p class="t-3rd-regular muted" data-saving>зберігається, поки пишеш</p>`;
}
