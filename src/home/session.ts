import type { Moment } from '../domain/settings';
import type { MonthKey } from '../domain/stats';

/**
 * What the home screen keeps while the app is open but never stores:
 * which levels and «як робити» are open, the × armed for removal, running
 * stopwatches and slider values not saved yet. It outlives a render, so a
 * tap that re-draws the screen loses nothing.
 *
 * Glossary
 * - armed: a × tapped once; it turns into ✓, and the second tap removes (ACCESSIBILITY.md, deleting).
 * - draft: a slider value moved but not saved; only «зберегти» saves it (wave 5c).
 * - retry: a saved stopwatch tapped once; the next tap starts it again from zero.
 * - running: when each stopwatch counts from, as performance.now(): 3 s after ▶ (F-05, «3 · 2 · 1» first).
 */
export interface HomeSession {
  readonly open: Map<string, boolean>;
  armed: string | null;
  readonly running: Map<string, number>;
  readonly retry: Set<string>;
  readonly drafts: Map<string, Draft>;
  /** Number fields holding something that isn't a number, by field key; `shown`: its error line is on screen (D-01). */
  readonly typed: Map<string, { readonly text: string; readonly shown: boolean }>;
  /** Tips a tap hid in this run of the app (wave 5c: bubbles that go on any tap). */
  readonly quietTips: Set<string>;
  /** The month the calendar shows; null follows the day shown. */
  month: MonthKey | null;
  /** The pulse timer in use, if any (one at a time: both hands are busy). */
  pulse: PulseRun | null;
  /** The next step of the pulse timer (ready → counting → beats); set by the screen shown. */
  pulseStep: () => void;
  /** The pending step, so ■ and «скасувати» can call it off. */
  pulseTimer: ReturnType<typeof setTimeout> | undefined;
}

export interface Draft { readonly moment: Moment; readonly tracker: string; readonly value: number }

/**
 * The pulse timer (ACCESSIBILITY.md, wave 6): ready (3 s to find the pulse)
 * → counting → beats («готово» / «скасувати» in the timer's place, until
 * one of them or the app is closed) → done (the line «42 удари за 30 с × 2»,
 * until the day changes). ■ in ready or counting and «скасувати» at beats
 * drop the run (Olesia, 2026-11-12 and 2026-11-15).
 */
export interface PulseRun {
  readonly key: string;
  readonly seconds: number;
  readonly phase: 'ready' | 'counting' | 'beats' | 'done';
  /** When the phase shown ends (ready, counting), as Date.now(). */
  readonly ends: number;
  readonly beats: number | null;
  /** What is typed in «скільки ударів» so far: the field comes at ▶, and a render must not lose it. */
  readonly typed: string;
}

/**
 * What the pulse timer says in each phase: on screen, and to a screen reader
 * through the announcer (B-02: the lines themselves are drawn anew each time).
 */
export const PULSE_SAYS = { ready: 'приготуйся', counting: 'рахуй удари' } as const;
export const pulseQuestion = (seconds: number) => `скільки ударів за ${seconds} с?`;
/** What a screen reader hears when a stopwatch starts counting after «3 · 2 · 1» (F-05; Нитка's draft). */
export const STOPWATCH_GO = 'почали';

/** Time to find the pulse before the count starts (Olesia, 2026-11-12); the same «3 · 2 · 1» before a stopwatch (F-05, 2026-11-15). */
export const PULSE_READY_MS = 3000;
export const READY_MS = PULSE_READY_MS;

/** Ready or counting: ■ is on screen and a step is pending. */
export const pulseRunning = (run: PulseRun | null | undefined): boolean => run?.phase === 'ready' || run?.phase === 'counting';

/** The next pulse step comes after `ms`; one at a time. */
export function schedulePulse(session: HomeSession, ms: number): void {
  clearTimeout(session.pulseTimer);
  session.pulseTimer = setTimeout(() => session.pulseStep(), ms);
}

/** ■ or «скасувати»: the run and its pending step are gone, nothing is saved. */
export function dropPulse(session: HomeSession): void {
  clearTimeout(session.pulseTimer);
  session.pulseTimer = undefined;
  session.pulse = null;
}

export function homeSession(): HomeSession {
  return {
    open: new Map(), armed: null, running: new Map(), retry: new Set(), drafts: new Map(), typed: new Map(), quietTips: new Set(),
    month: null, pulse: null, pulseStep: () => {}, pulseTimer: undefined,
  };
}

/** «0:18» */
export function formatCountdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** What the pulse timer shows now: «3», «2», «1» while getting ready, then «0:30» … «0:00». */
export function pulseTime(run: PulseRun, now: number): string {
  return run.phase === 'ready' ? String(Math.max(1, Math.ceil((run.ends - now) / 1000))) : formatCountdown(run.ends - now);
}

/** «01.24.37»: minutes, seconds, hundredths (Figma `stopwatch`). */
export function formatStopwatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 10));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 6000))}.${pad(Math.floor(total / 100) % 60)}.${pad(total % 100)}`;
}

/**
 * What a running stopwatch shows (F-05): «3», «2», «1» before `started`
 * (the start is set 3 s ahead), then the time counting up from zero.
 */
export function stopwatchTime(started: number, now: number): string {
  return now < started ? String(Math.max(1, Math.ceil((started - now) / 1000))) : formatStopwatch(now - started);
}

export type StopwatchState = 'default' | 'running' | 'saved' | 'retry';

export function stopwatchState(session: HomeSession, key: string, saved: number | null): StopwatchState {
  if (session.running.has(key)) return 'running';
  if (saved === null) return 'default';
  return session.retry.has(key) ? 'retry' : 'saved';
}
