import { formatLong, type DayKey } from '../domain/dates';
import { emptyDay, type Day, type HealthLog } from '../domain/day';
import type { Diary } from '../domain/diary';
import type { Edit } from '../domain/log';
import type { Settings } from '../domain/settings';
import { wireSections, type SectionControls } from '../home/controls';
import { HERO_STYLES, heroStyle, type HeroStyle } from '../home/hero-fit';
import { dayArrives, popShownDay, reward, sheetIn, sheetOut, swapMonth } from '../home/home-motion';
import { completed } from '../domain/progress';
import { heroFor, homeSections, sectionDone, type SectionId, type SectionSpec } from '../home/home-view';
import {
  checkInBody, daytimeBody, HEALTH_TIP, morningBody, movementBody, noteBody, sectionTop, workoutBody, type SectionContext,
} from '../home/sections';
import { PULSE_SAYS, pulseQuestion, pulseRunning, pulseTime, schedulePulse, stopwatchTime, type HomeSession } from '../home/session';
import { calendarMarkup, type CalendarView } from '../home/calendar';
import { mountCarousels, wireCarousels } from '../home/carousel';
import { wireMonthSwipe } from '../home/month-swipe';
import { endSignal, startSignal } from '../home/signal';
import { monthOf, shiftMonth, type MonthKey } from '../domain/stats';
import { wireAccordions } from '../ui/accordion';
import { esc } from '../ui/html';
import { emoticonsHtml } from '../ui/emoticons';
import { announce } from '../ui/announce';
import { iconSvg } from '../ui/icons';
import { closesOnBack } from '../ui/back';
import { mountHeroScene } from '../ui/hero-scene';
import type { ToastMessage } from '../ui/toast';
import { barMarkup, fillBar, goalText, TO_TOP, wireDateNav, wireScroll } from './bar';
import { FOOTER, part, tabNote } from './parts';
import { wireTabNote } from './install-how';
import { t } from '../i18n/lang';

/*
 * Home (Figma `screen/home-default` 73:2601 open, 338:16522 closed;
 * `navigation` 189:6897; `button/to-top` 288:10620). Stage 5a: the frame of
 * the screen; 5b: the inside of the sections (home/sections.ts, home/controls.ts);
 * the calendar comes in 5c.
 * The header (Olesia, 2026-11-18): the month's ASCII scene (ui/hero-scene.ts)
 * in a 400 px block, nothing over it; the phrase stands in the empty 90 px at
 * its bottom. The block hides «Політ символів» and fades into it below.
 * Texts from the settings are set as text, never as HTML.
 */

export interface HomeState {
  readonly settings: Settings;
  readonly days: Diary['days'];
  readonly date: DayKey;
  readonly today: DayKey;
  readonly session: HomeSession;
  /** The day shown before, when home is drawn for another day: the motion comes from its side. */
  readonly cameFrom?: DayKey;
  /** The app runs in a browser tab, where nothing is kept once the tab is closed (A-04). */
  readonly inTab?: boolean;
}

export interface HomeActions {
  goTo(date: DayKey): void;
  openMenu(): void;
  /** Whether a section is open; open unless the person closed it. */
  sectionOpen(id: string): boolean;
  rememberSection(id: string, open: boolean): void;
  /** Applies an edit to the day shown and keeps it; `render` shows home again. Returns the days after it. */
  edit(edit: Edit, render: boolean): Diary['days'];
  /** «скасувати»: puts a day back as it was, under its own date, and shows home again if it is on screen. */
  restore(day: Day): void;
  /** Shows home again without changing anything. */
  refresh(): void;
  toast(message: ToastMessage): void;
  /** Tips for newcomers: shown until the person closes them or has done the thing three times, on this phone. */
  tips?: { open(id: string): boolean; close(id: string): void; succeed?(id: string): void } | undefined;
  /** iPhone only (beta 1.1.1): «Здоровʼя» in «рух». */
  health?: HomeHealth | undefined;
}

export interface HomeHealth {
  connected(): boolean;
  connect(): void;
  /** The clipboard as text; null when the phone doesn't give it. */
  read(): Promise<string | null>;
  /** Writes «Здоровʼя» of these days and shows home again. */
  add(days: Readonly<Record<DayKey, HealthLog>>): void;
}

const BODIES: Record<SectionId, (ctx: SectionContext) => string> = {
  'ck-morning': (ctx) => checkInBody(ctx, 'morning'),
  mw: morningBody,
  dw: daytimeBody,
  wo: workoutBody,
  mv: movementBody,
  'ck-evening': (ctx) => checkInBody(ctx, 'evening'),
  note: noteBody,
};

/* Olesia, MY-FIXES: the line of a section where something is done; <3 in the accent, as every emoticon (E-17). */
const GOOD_JOB = `${t('хороша робота')} <3`;

/** The section's line as HTML: its description, or «хороша робота <3» once something in it is done. */
const leadOf = (description: string, done: boolean) => emoticonsHtml(done ? GOOD_JOB : description);

/* Olesia, 2026-11-17: a done section has a tick at the start of its header; said as «зроблено» before the title. */
const TICK = `<span class="accordion__done">${iconSvg('check')}<span class="visually-hidden">${t('зроблено:')} </span></span>`;

function sectionMarkup({ id, title, description }: SectionSpec, open: boolean, ctx: SectionContext): string {
  const done = sectionDone(id, ctx.day, ctx.settings);
  return `
    <section class="home-section${done ? ' home-section--done' : ''}" aria-labelledby="sec-${id}-title" data-description="${esc(description)}">
      <h2 class="home-section__heading">
        <button type="button" class="ctl accordion accordion--section" id="sec-${id}-title" data-section="${id}"
          aria-expanded="${open}" aria-controls="sec-${id}">${TICK}<span class="accordion__title">${title}</span></button>
      </h2>
      <p class="home-section__hint t-3rd-regular" aria-hidden="true" data-lead>${leadOf(description, done)}</p>
      <div class="home-section__body" id="sec-${id}"${open ? '' : ' hidden'}>
        ${sectionTop(id, ctx)}<p class="t-1st-regular" data-lead>${leadOf(description, done)}</p>
        ${BODIES[id](ctx)}
        <div class="home-section__end"${done ? '' : ' hidden'}><button type="button" class="ctl btn btn--tertiary" data-collapse="${id}" aria-label="${t('згорнути секцію:')} ${title}">${t('згорнути секцію')}</button></div>
      </div>
    </section>`;
}

/** After an edit that doesn't draw home anew (typing): the tick, the lines and «згорнути секцію» follow what is done now. */
function refreshDone(host: HTMLElement, day: Day, settings: Settings): void {
  for (const section of host.querySelectorAll<HTMLElement>('.home-section')) {
    const id = section.querySelector<HTMLElement>('[data-section]')?.dataset.section as SectionId | undefined;
    if (!id) continue;
    const done = sectionDone(id, day, settings);
    section.classList.toggle('home-section--done', done);
    const lead = leadOf(String(section.dataset.description), done);
    for (const line of section.querySelectorAll<HTMLElement>('[data-lead]')) if (line.innerHTML !== lead) line.innerHTML = lead;
    section.querySelector<HTMLElement>('.home-section__end')!.hidden = !done;
  }
}

/** «згорнути секцію»: closes it as its title does, then the focus and the eyes go back to the title. */
function wireCollapse(home: HTMLElement): void {
  home.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-collapse]');
    if (!button) return;
    const trigger = home.querySelector<HTMLButtonElement>(`#sec-${button.dataset.collapse}-title`);
    if (!trigger || trigger.getAttribute('aria-expanded') !== 'true') return;
    trigger.click();
    trigger.focus({ preventScroll: true });
    trigger.scrollIntoView?.({ block: 'nearest' });
  });
}

function markup(state: HomeState, actions: HomeActions): string {
  const ctx: SectionContext = {
    settings: state.settings, day: dayOf(state), days: state.days, session: state.session, tipOpen: (id) => tipShows(state, actions, id),
    health: actions.health ? { connected: actions.health.connected() } : undefined,
  };
  const sections = homeSections(state.settings).map((section) => sectionMarkup(section, actions.sectionOpen(section.id), ctx));
  return `
    <div class="home">
      <h1 class="visually-hidden">${t('головна')}</h1>
      ${HERO_FADE}<header class="hero">${SCENE}<div class="hero__words"><p class="hero__text"></p></div></header>${state.inTab ? tabNote() : ''}
      <div class="home__sections">${sections.join('')}</div>
      <section class="cal-block" aria-label="${t('календар')}">${calendarMarkup(calendarView(state, 'home'))}</section>
      ${FOOTER}
    </div>
    ${barMarkup('menu')}${TO_TOP}`;
}

/** Under the header: its plate fading into «Політ символів». */
const HERO_FADE = '<div class="home__fade" aria-hidden="true"></div>';
const SCENE = '<div class="hero__scene" aria-hidden="true"><canvas></canvas></div>';

/** The height a phrase takes in a style, measured on a hidden copy of the same width. */
function measure(text: HTMLElement): (style: HeroStyle) => number {
  return (style) => {
    const probe = text.cloneNode(true) as HTMLElement;
    probe.className = `hero__text ${style}`;
    probe.style.cssText = 'position:absolute;visibility:hidden;left:0;right:0';
    text.parentElement!.append(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    // no layout (e.g. a hidden tab) measures nothing: keep header 1
    return Number.isFinite(height) ? height : 0;
  };
}

/** The empty space at the bottom of the header that the phrase may take, px. */
function roomOf(text: HTMLElement): number {
  const words = text.parentElement!;
  const room = words.getBoundingClientRect().height - (parseFloat(getComputedStyle(words).paddingBottom) || 0);
  // no layout measures nothing: then every style «fits»
  return room > 0 ? room : Infinity;
}

function fillHero(host: HTMLElement, state: HomeState): () => void {
  const text = part<HTMLElement>(host, '.hero__text');
  const hero = heroFor(state.date, state.today, state.settings);
  // the phrase comes from the settings: escaped, its emoticons in the accent (E-17)
  text.innerHTML = emoticonsHtml(hero.text);
  if (hero.kind === 'past') {
    // the date in bold, as example/home-past-day; built from text nodes, never HTML
    const [before, after] = hero.text.split(hero.bold) as [string, string];
    const date = document.createElement('b');
    date.textContent = hero.bold;
    text.replaceChildren(before, date, after);
    text.className = 'hero__text hero__text--past t-h6';
    return () => {};
  }
  return () => {
    text.classList.remove(...HERO_STYLES);
    text.classList.add(heroStyle(measure(text), roomOf(text)));
  };
}

const dayOf = (state: HomeState): Day => state.days[state.date] ?? emptyDay(state.date);

/** A tip shows until a tap hid it in this run of the app, or for good after three successes. */
const tipShows = (state: HomeState, actions: HomeActions, id: string) => !state.session.quietTips.has(id) && (actions.tips?.open(id) ?? false);

/**
 * Tips are bubbles that a tap anywhere hides (Olesia, 2026-11-17); Escape
 * too, for a keyboard. The tap still does what it was for: the bubble moved
 * nothing, so it lands where the person aimed. Hidden until the app is
 * opened again.
 */
function wireTips(host: HTMLElement, state: HomeState, signal: AbortSignal): void {
  const hush = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    for (const tip of host.querySelectorAll<HTMLElement>('.tip')) {
      // only a bubble the person sees: one in a closed section waits for its turn
      if (tip.closest('[hidden]')) continue;
      // a button inside the bubble («підключити знову») must get its tap
      if (target?.closest('a, button') && tip.contains(target)) continue;
      // «як підключити» is asked for, not a newcomer's tip: it can come again
      if (tip.dataset.tipId === HEALTH_TIP) state.session.health.tip = false;
      else state.session.quietTips.add(String(tip.dataset.tipId));
      tip.remove();
    }
  };
  document.addEventListener('pointerdown', hush, { capture: true, signal });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hush(event);
  }, { signal });
}

const firstOf = (month: MonthKey) => `${month}-01` as DayKey;

function calendarView(state: HomeState, place: string): CalendarView {
  return {
    settings: state.settings,
    date: state.date,
    today: state.today,
    month: state.session.month ?? monthOf(state.date),
    dayAt: (key) => state.days[key] ?? emptyDay(key),
    place,
    card: state.session.carousel.card,
  };
}

/* ---- the calendar: on home and in the sheet from the date (Figma example/home-calendar-sheet) ---- */

interface Calendar {
  /** Draws the block on home again, e.g. after typing changed the week. */
  refresh(state: HomeState): void;
  closeSheet(): void;
}

/** B-03: what lies under the open sheet and must not take the focus: all but the date, which closes it. */
const UNDER_SHEET = '.home, .to-top, .bar__menu, .bar__goal, .date-nav__step';

/** `turned`: the calendar shows another month now (the header's scene follows it, wave 7a). */
function wireCalendar(host: HTMLElement, state: HomeState, go: (date: DayKey) => void, turned: (month: MonthKey) => void, signal: AbortSignal): Calendar {
  let current = state;
  const dateButton = part<HTMLButtonElement>(host, '.date-nav__date');
  // one closing back into the date doesn't count: the date opens a new one
  const sheet = () => host.querySelector<HTMLElement>('.cal-sheet:not(.cal-sheet--closing)');
  /** While the sheet is open: its step of «назад» and Escape anywhere. */
  let open: { done(): void; keys: AbortController } | null = null;

  /** The screen under the sheet takes taps and the focus again. */
  function letGo(): void {
    for (const element of host.querySelectorAll<HTMLElement>(UNDER_SHEET)) element.removeAttribute('inert');
    open?.keys.abort();
    open?.done();
    open = null;
  }

  function closeSheet(): void {
    const closing = sheet();
    if (!closing) return;
    letGo();
    closing.classList.add('cal-sheet--closing');
    dateButton.setAttribute('aria-expanded', 'false');
    dateButton.focus({ preventScroll: true });
    sheetOut(closing, dateButton, () => closing.remove());
  }

  /** Days open that day; arrows change the month in place and keep the focus. */
  function onTap(event: Event): void {
    const button = (event.target as Element).closest<HTMLElement>('[data-cal]');
    if (!button) return;
    if (button.dataset.cal === 'day') {
      const fromSheet = button.closest('.cal-sheet') !== null;
      const day = String(button.dataset.day) as DayKey;
      closeSheet();
      go(day);
      // B-01: home is drawn anew for that day; the focus goes back where the day was chosen
      (fromSheet ? host.querySelector<HTMLElement>('.date-nav__date') : host.querySelector<HTMLElement>(`.home .cal-block [data-cal="day"][data-day="${day}"]`))
        ?.focus({ preventScroll: true });
      return;
    }
    const container = button.closest<HTMLElement>('.cal-block')!;
    const by = String(button.dataset.by);
    swapMonth(container, () => {
      turnMonth(container, Number(by));
      // the arrow is where the finger is: its focus comes back without scrolling the page
      container.querySelector<HTMLElement>(`[data-cal="month"][data-by="${by}"]`)!.focus({ preventScroll: true });
    });
  }

  /** The month `by` away, drawn in the same block (arrows and the swipe). */
  function turnMonth(container: HTMLElement, by: number): HTMLElement {
    state.session.month = shiftMonth(calendarView(current, '').month, by);
    turned(state.session.month);
    container.innerHTML = calendarMarkup(calendarView(current, container.dataset.place ?? 'home'));
    mountCarousels(container, state.session.carousel);
    return container;
  }

  function openSheet(): void {
    host.querySelector('.cal-sheet--closing')?.remove();
    host.insertAdjacentHTML('beforeend', `
      <div class="cal-sheet" role="dialog" aria-modal="true" aria-label="${t('календар')}">
        <div class="cal-sheet__scrim"></div>
        <div class="cal-sheet__panel"><div class="cal-block" data-place="sheet">${calendarMarkup(calendarView(current, 'sheet'))}</div></div>
      </div>`);
    const opened = sheet()!;
    dateButton.setAttribute('aria-expanded', 'true');
    part(host, '.bar').classList.remove('bar--hidden');
    opened.addEventListener('click', onTap);
    part(opened, '.cal-sheet__scrim').addEventListener('click', closeSheet);
    for (const element of host.querySelectorAll<HTMLElement>(UNDER_SHEET)) element.setAttribute('inert', '');
    const keys = new AbortController();
    const panel = part<HTMLElement>(opened, '.cal-sheet__panel');
    wireCarousels(panel, state.session.carousel, keys.signal);
    mountCarousels(panel, state.session.carousel);
    // B-03: Escape closes it wherever the focus is; A-05: so does «назад»
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeSheet();
    }, { signal: keys.signal });
    open = { done: closesOnBack(closeSheet), keys };
    (opened.querySelector<HTMLElement>('[aria-current="date"]') ?? opened.querySelector<HTMLElement>('button'))!.focus({ preventScroll: true });
    sheetIn(opened, dateButton);
    popShownDay(opened);
  }

  part(host, '.home .cal-block').addEventListener('click', onTap);
  wireCarousels(part(host, '.home .cal-block'), state.session.carousel, signal);
  mountCarousels(part(host, '.home .cal-block'), state.session.carousel);
  dateButton.addEventListener('click', () => (sheet() ? closeSheet() : openSheet()), { signal });
  // the swipe on the days: on home and in the sheet, both inside host
  wireMonthSwipe(host, turnMonth, signal);
  // home drawn anew under an open sheet takes the sheet away: its step goes too
  signal.addEventListener('abort', letGo);
  return {
    refresh(next) {
      current = next;
      part(host, '.home .cal-block').innerHTML = calendarMarkup(calendarView(next, 'home'));
      mountCarousels(part(host, '.home .cal-block'), state.session.carousel);
    },
    closeSheet,
  };
}

const FOCUSABLE = '[data-act], input, textarea, button.accordion';

interface FocusMark { readonly key: string | undefined; readonly index: number }

/** Where the focus was, so a new render can put it back: the field's key or the control's place. */
function focusMark(host: HTMLElement): FocusMark {
  const all = [...host.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const index = all.findIndex((element) => element === document.activeElement);
  return { key: all[index]?.dataset.key, index };
}

function restoreFocus(host: HTMLElement, mark: FocusMark): void {
  const all = [...host.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const target = all.find((element) => mark.key !== undefined && element.dataset.key === mark.key) ?? all[mark.index];
  target?.focus({ preventScroll: true });
}

/** The day's sections: taps and typing become edits; a render keeps the focus where it was. */
function sectionControls(host: HTMLElement, state: HomeState, actions: HomeActions, calendar: Calendar): SectionControls {
  let current = state;
  const keepingFocus = (draw: () => void) => {
    const mark = focusMark(host);
    draw();
    restoreFocus(host, mark);
  };
  return {
    settings: state.settings,
    session: state.session,
    day: () => dayOf(current),
    edit(edit, render) {
      const before = dayOf(current);
      const goalBefore = goalText(current);
      let days = current.days;
      if (render) {
        keepingFocus(() => {
          days = actions.edit(edit, true);
        });
      } else {
        days = actions.edit(edit, false);
        current = { ...current, days };
        fillBar(host, current);
        calendar.refresh(current);
        refreshDone(host, dayOf(current), current.settings);
      }
      const after = days[state.date] ?? emptyDay(state.date);
      reward(host, state.date, completed(before, after, state.settings), state.settings.accessibility);
      // B-02: the week line is drawn anew each time, so its change is said through the announcer
      const goalAfter = goalText({ ...current, days });
      if (goalAfter !== null && goalAfter !== goalBefore) announce(goalAfter);
    },
    restore: (day) => keepingFocus(() => actions.restore(day)),
    render: () => keepingFocus(() => actions.refresh()),
    screen: () => host,
    toast: (message) => actions.toast(message),
    tipOpen: (id) => tipShows(state, actions, id),
    tipDone: (id) => actions.tips?.succeed?.(id),
    health: actions.health && {
      connect: actions.health.connect,
      read: actions.health.read,
      add: actions.health.add,
      today: () => state.today,
    },
  };
}

/** Running stopwatches of the day shown count on screen: «3 · 2 · 1» first (F-05), then up from zero. */
function tickStopwatches(host: HTMLElement, state: HomeState, signal: AbortSignal): void {
  const prefix = `${state.date}|`;
  if (![...state.session.running.keys()].some((key) => key.startsWith(prefix))) return;
  const timer = setInterval(() => {
    for (const time of host.querySelectorAll<HTMLElement>('[data-sw-time]')) {
      const started = state.session.running.get(String(time.dataset.swTime));
      // not while its old digits dissolve («знову»)
      if (started !== undefined && time.dataset.busy === undefined) time.textContent = stopwatchTime(started, performance.now());
    }
  }, 50);
  signal.addEventListener('abort', () => clearInterval(timer));
}

/** The pulse timer counts on screen: «3 · 2 · 1», then the countdown. */
function tickPulse(host: HTMLElement, state: HomeState, signal: AbortSignal): void {
  const run = state.session.pulse;
  if (!run || !pulseRunning(run)) return;
  const timer = setInterval(() => {
    const left = host.querySelector<HTMLElement>('[data-pulse-left]');
    // not while its old digits dissolve («знову»)
    if (left && left.dataset.busy === undefined) left.textContent = pulseTime(run, Date.now());
  }, 200);
  signal.addEventListener('abort', () => clearInterval(timer));
}

/**
 * The next step of the pulse timer. Ready → counting: the start signal and
 * the full countdown. Counting → beats: the end signal, then the question,
 * with the focus in its field.
 */
function pulseStep(host: HTMLElement, state: HomeState, controls: SectionControls): () => void {
  return () => {
    const run = state.session.pulse;
    if (run?.phase === 'ready') {
      state.session.pulse = { ...run, phase: 'counting', ends: Date.now() + run.seconds * 1000 };
      schedulePulse(state.session, run.seconds * 1000);
      startSignal(state.settings.accessibility);
      announce(PULSE_SAYS.counting);
      controls.render();
      return;
    }
    if (run?.phase !== 'counting') return;
    state.session.pulse = { ...run, phase: 'beats' };
    endSignal(state.settings.accessibility);
    announce(pulseQuestion(run.seconds));
    controls.render();
    host.querySelector<HTMLElement>('[data-input="beats"]')?.focus({ preventScroll: true });
  };
}

/** Shows home; returns what to undo when another screen takes its place. */
export function showHome(host: HTMLElement, state: HomeState, actions: HomeActions): () => void {
  host.innerHTML = markup(state, actions);
  const fit = fillHero(host, state);
  const canvas = host.querySelector<HTMLCanvasElement>('.hero__scene canvas');
  // wave 7a: the scene of the month the calendar shows, not of today
  const scene = canvas
    ? mountHeroScene({ root: document.documentElement, canvas, day: firstOf(calendarView(state, '').month), reducedMotion: typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener: () => {} } })
    : null;
  fillBar(host, state);
  // on .home, which every render makes anew: on host the listeners would pile up
  const home = part<HTMLElement>(host, '.home');
  wireAccordions(home, (trigger, open) => {
    if (trigger.dataset.section) actions.rememberSection(trigger.dataset.section, open);
    else state.session.open.set(String(trigger.dataset.memo), open);
  });
  const listeners = new AbortController();
  // another day: the calendar follows it
  const go = (date: DayKey) => {
    state.session.month = null;
    actions.goTo(date);
  };
  const calendar = wireCalendar(host, state, go, (month) => scene?.show(firstOf(month)), listeners.signal);
  const controls = sectionControls(host, state, actions, calendar);
  wireSections(home, controls);
  wireCollapse(home);
  state.session.pulseStep = pulseStep(host, state, controls);
  part(host, '.bar__menu').addEventListener('click', () => actions.openMenu());
  wireTabNote(host);

  wireTips(host, state, listeners.signal);
  tickStopwatches(host, state, listeners.signal);
  tickPulse(host, state, listeners.signal);
  wireDateNav(host, state, go, listeners.signal);
  wireScroll(host, listeners.signal);

  fit();
  if (state.cameFrom) dayArrives(host, state.cameFrom, state.date);
  // B-02: another day is said through the announcer; the date button is drawn anew and would stay silent
  if (state.cameFrom && state.cameFrom !== state.date) announce(formatLong(state.date));
  void document.fonts?.ready.then(fit);
  addEventListener('resize', fit, { signal: listeners.signal });
  return () => {
    listeners.abort();
    scene?.stop();
  };
}
