/*
 * D-10 (Olesia, 2026-11-15): no state lasts forever. Anything the app waits
 * for turns into an error after 7 s, so a spinner never spins without end.
 * The loading screen has its own check in index.html, for when this code
 * never runs.
 */

/** How long the app waits before it calls a state stuck. */
export const STUCK_MS = 7000;

/** `work`, or a rejection when it has not settled in `ms`. */
export function within<T>(work: Promise<T>, ms: number = STUCK_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
