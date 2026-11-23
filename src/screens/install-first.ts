import type { Phone } from '../app/start';
import { chromeIntent } from '../app/in-app';
import { INSTALL_BUTTON, inAppNow, LANGUAGE_SWITCH, part, platformToggles, tabNote, wireInAppNote, wireInstallSteps, wireLanguageSwitch } from './parts';
import { t } from '../i18n/lang';
import { wireDemo } from './install-how';

/*
 * screen/install-first (390:9345): a phone opened the app in the browser.
 * Android steps: the landing page's (parts.ts, INSTALL_STEPS); «подивитися тут»
 * is Olesia's choice of 2026-11-09, its wording Нитка's draft.
 * Beta 1.0.1 (FIXES-1.0.1.md): the «встановити» button on Android (A1); inside
 * another app's browser the yellow frame takes the place of the steps (A3).
 * The drawn phone under the steps, as in «як?» (Olesia, 2026-11-23).
 */

const STEPS = `
    <section class="screen__section" aria-labelledby="install-title">
      <h1 id="install-title" class="t-h3">${t('спершу встанови застосунок')}</h1>
      <p class="t-1st-regular">${t('зараз він відкритий у браузері. налаштовуй уже у встановленому.')}</p>
    </section>
    <section class="screen__section" aria-label="${t('як встановити')}">
      ${platformToggles()}
      ${INSTALL_BUTTON}
      <ol class="steps t-1st-regular" data-steps></ol>
      <div data-install-demo></div>
      <p class="t-3rd-regular muted" data-steps-note></p>
      <p class="t-3rd-regular muted">${t('телефон визначено автоматично. якщо не той — перемкни.')}</p>
    </section>`;

/** Inside Instagram or a messenger nothing installs: the yellow frame says where to go instead. */
const IN_APP = () => `
    <section class="screen__section" aria-labelledby="install-title">
      <h1 id="install-title" class="t-h3">${t('спершу встанови застосунок')}</h1>
      ${tabNote()}
    </section>`;

const markup = (inApp: boolean) => `
  <div class="screen">
    ${LANGUAGE_SWITCH}
    ${inApp ? IN_APP() : STEPS}
    <section class="screen__section screen__section--tight" aria-label="${t('без встановлення')}">
      <div class="option">
        <button type="button" class="ctl btn btn--tertiary" data-use-browser>${t('подивитися тут, без встановлення')}</button>
        <p class="t-3rd-regular muted">${t('без встановлення записи не зберігаються: закриєш вкладку — і все зникне.')}</p>
      </div>
    </section>
  </div>`;

export function showInstallFirst(host: HTMLElement, phone: Phone, useBrowser: () => void): void {
  const inApp = inAppNow();
  host.innerHTML = markup(inApp);
  wireLanguageSwitch(host);
  if (inApp) wireInAppNote(host, chromeIntent(location.href));
  else {
    wireInstallSteps(host, phone);
    wireDemo(host, phone);
  }
  part(host, '[data-use-browser]').addEventListener('click', useBrowser);
}
