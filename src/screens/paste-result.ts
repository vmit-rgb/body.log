import type { PasteAct, PasteView } from '../app/paste-flow';
import { emoticonsHtml } from '../ui/emoticons';
import { t } from '../i18n/lang';

/*
 * What «застосувати» answers, under the paste field on the first screen
 * and in «налаштування через ШІ» (Figma `profile/import`: error, russian
 * error, preview; the unknown-keys state is new, Olesia 2026-11-15).
 * Texts: COPY.md «Pasting settings»; Нитка's drafts where it has none.
 */

const button = (order: 'primary' | 'secondary', act: PasteAct, label: string, extra = '') =>
  `<button type="button" class="ctl btn btn--${order} btn--wide${extra}" data-paste-act="${act}">${label}</button>`;

const list = (lines: readonly string[]) =>
  (lines.length ? `<ul class="paste-result__lines t-2nd-regular">${lines.map((line) => `<li>${emoticonsHtml(line)}</li>`).join('')}</ul>` : '');

/* Texts here and from the settings (a phrase in «додано») may carry an emoticon: in the accent (E-17). */
const title = (text: string) => `<p class="t-1st-bold" tabindex="-1" data-paste-title>${emoticonsHtml(text)}</p>`;
const hint = (text: string) => (text ? `<p class="t-3rd-regular muted">${emoticonsHtml(text)}</p>` : '');

function group(name: string, lines: readonly string[]): string {
  return lines.length ? `<div class="paste-result__group"><p class="t-2nd-bold">${name}</p>${list(lines)}</div>` : '';
}

function previewMarkup(view: PasteView & { kind: 'preview' }): string {
  const { changes } = view;
  if (view.nothing) {
    return `${title(t('нічого не зміниться'))}${hint(t('ці налаштування такі самі, як зараз.'))}${button('secondary', 'cancel', t('закрити'))}`;
  }
  const body = changes.first
    ? list(changes.added)
    : `${group(t('додано'), changes.added)}${group(t('змінено'), changes.changed)}${group(t('прибрано'), changes.removed)}
       <p class="t-2nd-regular">${t('записи лишаються як були')}</p>`;
  return `${title(changes.first ? t('ось що буде в налаштуваннях') : t('ось що зміниться'))}${body}
    ${button('primary', 'save', t('зберегти'))}${button('secondary', 'cancel', t('скасувати'), ' btn--cancel')}`;
}

/** The inside of `[data-paste-result]`; empty when there is nothing to say. */
export function pasteResultMarkup(view: PasteView): string {
  if (view.kind === 'none') return '';
  if (view.kind === 'preview') return previewMarkup(view);
  if (view.kind === 'unknown') {
    return `${title(t('ось що застосунок не прочитав'))}${list(view.lines)}
      ${hint(t('таких полів у налаштуваннях немає, тож вони не збережуться. попроси свій ШІ виправити — або продовж без них.'))}
      ${button('primary', 'copy', t('скопіювати для ШІ, щоб виправити'))}${button('secondary', 'continue', t('продовжити без цього'))}`;
  }
  const { refusal } = view;
  return `${title(refusal.title)}${list(refusal.lines)}${hint(refusal.hint)}
    ${refusal.forAi === null ? '' : button('primary', 'copy', t('скопіювати для ШІ'))}`;
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
