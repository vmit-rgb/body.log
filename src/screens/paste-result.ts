import type { PasteAct, PasteView } from '../app/paste-flow';
import { esc } from '../ui/html';

/*
 * What «застосувати» answers, under the paste field on the first screen
 * and in «налаштування через ШІ» (Figma `profile/import`: error, russian
 * error, preview; the unknown-keys state is new, Olesia 2026-11-15).
 * Texts: COPY.md «Pasting settings»; Нитка's drafts where it has none.
 */

const button = (order: 'primary' | 'secondary', act: PasteAct, label: string) =>
  `<button type="button" class="ctl btn btn--${order} btn--wide" data-paste-act="${act}">${label}</button>`;

const list = (lines: readonly string[]) =>
  (lines.length ? `<ul class="paste-result__lines t-2nd-regular">${lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>` : '');

const title = (text: string) => `<p class="t-1st-bold" tabindex="-1" data-paste-title>${esc(text)}</p>`;
const hint = (text: string) => (text ? `<p class="t-3rd-regular muted">${esc(text)}</p>` : '');

function group(name: string, lines: readonly string[]): string {
  return lines.length ? `<div class="paste-result__group"><p class="t-2nd-bold">${name}</p>${list(lines)}</div>` : '';
}

function previewMarkup(view: PasteView & { kind: 'preview' }): string {
  const { changes } = view;
  if (view.nothing) {
    return `${title('нічого не зміниться')}${hint('ці налаштування такі самі, як зараз.')}${button('secondary', 'cancel', 'закрити')}`;
  }
  const body = changes.first
    ? list(changes.added)
    : `${group('додано', changes.added)}${group('змінено', changes.changed)}${group('прибрано', changes.removed)}
       <p class="t-2nd-regular">записи лишаються як були</p>`;
  return `${title(changes.first ? 'ось що буде в налаштуваннях' : 'ось що зміниться')}${body}
    ${button('primary', 'save', 'зберегти')}${button('secondary', 'cancel', 'скасувати')}`;
}

/** The inside of `[data-paste-result]`; empty when there is nothing to say. */
export function pasteResultMarkup(view: PasteView): string {
  if (view.kind === 'none') return '';
  if (view.kind === 'preview') return previewMarkup(view);
  if (view.kind === 'unknown') {
    return `${title('ось що застосунок не прочитав')}${list(view.lines)}
      ${hint('таких полів у налаштуваннях немає, тож вони не збережуться. попроси свій ШІ виправити — або продовж без них.')}
      ${button('primary', 'copy', 'скопіювати для ШІ, щоб виправити')}${button('secondary', 'continue', 'продовжити без цього')}`;
  }
  const { refusal } = view;
  return `${title(refusal.title)}${list(refusal.lines)}${hint(refusal.hint)}
    ${refusal.forAi === null ? '' : button('primary', 'copy', 'скопіювати для ШІ')}`;
}

/** The box the result lives in; `role="status"` so a screen reader hears a new result. */
export const pasteResultBox = (view: PasteView) =>
  `<div class="paste-result" role="status" data-paste-result${view.kind === 'none' ? ' hidden' : ''}>${pasteResultMarkup(view)}</div>`;

/** Puts a new result into the box that is on the page and moves the focus to its first line. */
export function showPasteResult(host: ParentNode, view: PasteView): void {
  const box = host.querySelector<HTMLElement>('[data-paste-result]');
  if (!box) return;
  box.innerHTML = pasteResultMarkup(view);
  box.hidden = view.kind === 'none';
  box.querySelector<HTMLElement>('[data-paste-title]')?.focus();
}

/** The act of a tapped button of the result, if it is one. */
export function pasteActOf(target: Element): PasteAct | null {
  return (target.closest<HTMLElement>('button[data-paste-act]')?.dataset.pasteAct as PasteAct | undefined) ?? null;
}
