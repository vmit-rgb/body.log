import type { Phone } from '../app/start';
import { LANGUAGE_SWITCH, part, platformToggles, wireInstallSteps } from './parts';

/*
 * screen/install-first (390:9345): a phone opened the app in the browser.
 * Android steps: the landing page's (parts.ts, INSTALL_STEPS); «подивитися тут»
 * is Olesia's choice of 2026-11-09, its wording Нитка's draft.
 */

const MARKUP = `
  <div class="screen">
    ${LANGUAGE_SWITCH}
    <section class="screen__section" aria-labelledby="install-title">
      <h1 id="install-title" class="t-h3">спершу встанови застосунок</h1>
      <p class="t-1st-regular">зараз він відкритий у браузері. налаштовуй уже у встановленому.</p>
    </section>
    <section class="screen__section" aria-label="як встановити">
      ${platformToggles()}
      <ol class="steps t-1st-regular" data-steps></ol>
      <p class="t-3rd-regular muted" data-steps-note></p>
      <p class="t-3rd-regular muted">телефон визначено автоматично. якщо не той — перемкни.</p>
    </section>
    <section class="screen__section screen__section--tight" aria-label="без встановлення">
      <div class="option">
        <button type="button" class="ctl btn btn--tertiary" data-use-browser>подивитися тут, без встановлення</button>
        <p class="t-3rd-regular muted">без встановлення записи не зберігаються: закриєш вкладку — і все зникне.</p>
      </div>
    </section>
  </div>`;

export function showInstallFirst(host: HTMLElement, phone: Phone, useBrowser: () => void): void {
  host.innerHTML = MARKUP;
  wireInstallSteps(host, phone);
  part(host, '[data-use-browser]').addEventListener('click', useBrowser);
}
