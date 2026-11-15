import { NUMBER_ERRORS, readNumber } from '../domain/numbers';
import type { HomeSession } from './session';

/*
 * A number field that holds something else (D-01, Olesia 2026-11-14): the
 * text stays as typed, nothing is saved for it, and once the person leaves
 * the field a small line under it says why. While they type, nothing is said;
 * the line goes as soon as the field holds a number or nothing.
 *
 * The text lives in the session, so a render (which draws fields from the
 * saved day) does not wipe it.
 */

let ids = 0;

const isNumberField = (element: EventTarget | null): element is HTMLInputElement =>
  element instanceof HTMLInputElement && element.classList.contains('number__input');

/** The row the line goes under: a set or a lap, the pulse row, a question's name with its fields. */
const rowOf = (field: HTMLElement): Element =>
  field.closest('.set-row') ?? field.closest('.pulse__row') ?? field.closest('.labeled') ?? field.closest('.labeled__fields') ?? field;

function lineFor(root: ParentNode, key: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>('.number-error')].find((line) => line.dataset.errorFor === key);
}

function clear(root: ParentNode, field: HTMLInputElement): void {
  lineFor(root, String(field.dataset.key))?.remove();
  field.removeAttribute('aria-invalid');
  field.removeAttribute('aria-describedby');
}

function mark(root: ParentNode, field: HTMLInputElement, message: string): void {
  const key = String(field.dataset.key);
  let line = lineFor(root, key);
  if (!line) {
    line = document.createElement('p');
    line.className = 'number-error t-3rd-regular';
    line.id = `number-error-${++ids}`;
    line.dataset.errorFor = key;
    // read out when it appears
    line.setAttribute('role', 'alert');
    rowOf(field).after(line);
  }
  line.textContent = message;
  field.setAttribute('aria-invalid', 'true');
  field.setAttribute('aria-describedby', line.id);
}

/** After a keystroke: wrong text is remembered quietly; a number or nothing takes the line away. */
function typed(root: ParentNode, session: HomeSession, field: HTMLInputElement): void {
  const key = String(field.dataset.key);
  const read = readNumber(field.value);
  if (read.kind === 'number' || read.kind === 'empty') {
    session.typed.delete(key);
    clear(root, field);
    return;
  }
  const shown = session.typed.get(key)?.shown ?? false;
  session.typed.set(key, { text: field.value, shown });
  if (shown) mark(root, field, NUMBER_ERRORS[read.kind]);
}

/** The person left the field: now the line shows. */
function left(root: ParentNode, session: HomeSession, field: HTMLInputElement): void {
  const read = readNumber(field.value);
  if (read.kind === 'number' || read.kind === 'empty') return;
  session.typed.set(String(field.dataset.key), { text: field.value, shown: true });
  mark(root, field, NUMBER_ERRORS[read.kind]);
}

/** Puts the remembered texts (and the lines already shown) back on a screen just drawn. */
function restore(root: ParentNode, session: HomeSession): void {
  for (const field of root.querySelectorAll<HTMLInputElement>('.number__input')) {
    const kept = session.typed.get(String(field.dataset.key));
    if (!kept) continue;
    field.value = kept.text;
    field.style.setProperty('--len', String(kept.text.length));
    const read = readNumber(kept.text);
    if (kept.shown && (read.kind === 'negative' || read.kind === 'not-a-number')) mark(root, field, NUMBER_ERRORS[read.kind]);
  }
}

/** Rows moved (one was removed or brought back): the texts kept for that day no longer know their rows. */
export function forgetTyped(session: HomeSession, date: string): void {
  for (const key of [...session.typed.keys()]) {
    if (key.startsWith(`${date}|`)) session.typed.delete(key);
  }
}

/** Number fields under `root` explain themselves; call once per render, after the markup is in. */
export function wireNumberErrors(root: HTMLElement, session: HomeSession): void {
  restore(root, session);
  // after the handlers that save: they have read the field by now
  root.addEventListener('input', (event) => {
    if (isNumberField(event.target)) typed(root, session, event.target);
  });
  root.addEventListener('focusout', (event) => {
    if (isNumberField(event.target)) left(root, session, event.target);
  });
}
