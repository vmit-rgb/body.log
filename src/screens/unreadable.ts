import { part, wireRestore } from './parts';
import { t } from '../i18n/lang';

/*
 * D-02 (Olesia, 2026-11-14): something is stored on the phone, but the app
 * can't read it as a diary. Before, the app showed the first screen, as if
 * there were no records at all. Now it says what happened and gives two ways
 * out: keep what is stored as a file, or restore from a copy.
 * «почати заново» is Нитка's addition: without it a person with no copy
 * could never use the app again. Texts: COPY.md, «Drafts from MY-FIXES».
 */

export interface UnreadableActions {
  /** Hands what is stored to the phone as a file. */
  saveAsFile(): void;
  restore(file: File): void;
  /** The first screen; what is stored stays until something new is saved, and is set aside then. */
  startOver(): void;
}

const MARKUP = `
  <div class="screen">
    <section class="screen__section" aria-labelledby="unreadable-title">
      <h1 id="unreadable-title" class="t-h3">${t('не вдалося прочитати щоденник')}</h1>
      <p class="t-1st-regular">${t('записи на місці, але застосунок не може їх відкрити. збережи їх як файл, щоб нічого не загубилося, або віднови з копії.')}</p>
      <button type="button" class="ctl btn btn--primary btn--wide" data-save-file>${t('зберегти як файл')}</button>
      <button type="button" class="ctl btn btn--secondary btn--wide" data-restore>${t('відновити з копії')}</button>
      <input type="file" accept=".json,application/json,text/plain" hidden data-restore-file />
    </section>
    <section class="screen__section screen__section--tight" aria-label="${t('без копії')}">
      <div class="option">
        <button type="button" class="ctl btn btn--tertiary" data-start-over>${t('почати заново')}</button>
        <p class="t-3rd-regular muted">${t('якщо копії немає. спершу збережи записи як файл: його можна буде показати тому, хто допоможе їх дістати.')}</p>
      </div>
    </section>
  </div>`;

export function showUnreadable(host: HTMLElement, actions: UnreadableActions): void {
  host.innerHTML = MARKUP;
  part(host, '[data-save-file]').addEventListener('click', () => actions.saveAsFile());
  wireRestore(host, actions.restore);
  part(host, '[data-start-over]').addEventListener('click', () => actions.startOver());
}
