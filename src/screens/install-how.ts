import { detectPlatform, type Phone } from '../app/start';
import { layer } from '../ui/dialog';
import { EASE, MS, moving, play } from '../ui/motion';
import { mountInstallDemo } from '../ui/install-demo';
import { chromeIntent } from '../app/in-app';
import { INSTALL_BUTTON, platformToggles, wireInAppNote, wireInstallSteps } from './parts';
import { lang, t } from '../i18n/lang';

/*
 * «як?» on the tab note (Olesia, 2026-11-19): a popup with the landing page's
 * android / iphone toggle and the install steps, the same as screen
 * install-first. A computer gets the android steps, as install-first does.
 */

const MARKUP = `
  <div class="dialog install-how" role="dialog" aria-modal="true" aria-labelledby="install-how-title">
    <div class="dialog__scrim" data-close></div>
    <div class="dialog__panel">
      <h2 class="t-1st-bold" id="install-how-title">${t('як встановити застосунок')}</h2>
      ${platformToggles()}
      ${INSTALL_BUTTON}
      <ol class="steps t-2nd-regular" data-steps></ol>
      <div data-install-demo></div>
      <p class="t-3rd-regular muted" data-steps-note></p>
      <p class="t-3rd-regular muted">${t('телефон визначено автоматично. якщо не той — перемкни.')}</p>
      <div class="dialog__actions">
        <button type="button" class="ctl btn btn--secondary" data-close>${t('зрозуміло')}</button>
      </div>
    </div>
  </div>`;

export function showInstallHow(phone: Phone): void {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    dissolve();
  };
  const { root, dissolve } = layer(MARKUP, close);
  wireInstallSteps(root, phone);
  wireDemo(root, phone);
  root.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  play(root.querySelector('.dialog__panel'), [{ opacity: 0, transform: 'translateY(32px)' }, { opacity: 1, transform: 'none' }], { duration: MS.m, easing: EASE.out });
  play(root.querySelector('.dialog__scrim'), [{ opacity: 0 }, { opacity: 1 }], { duration: MS.m, easing: EASE.out });
  root.addEventListener('click', (event) => {
    if ((event.target as Element).closest('[data-close]')) close();
  });
}

/**
 * The drawn phone under the steps (Olesia, 2026-11-22), drawn anew for the phone
 * chosen in the toggle. None without motion (moving(): the app's «вимкнути всі
 * анімації» or the phone's «reduce motion»): the steps are in the text.
 */
function wireDemo(root: HTMLElement, phone: Phone): void {
  const host = root.querySelector<HTMLElement>('[data-install-demo]')!;
  if (!moving()) {
    host.remove();
    return;
  }
  const draw = (which: Phone) => mountInstallDemo(host, which, { lang: lang(), icon: `${import.meta.env.BASE_URL}icons/icon-192.png` });
  let shown = draw(phone);
  for (const toggle of root.querySelectorAll<HTMLElement>('[data-platform]')) {
    toggle.addEventListener('click', () => {
      shown.show(false);
      shown = draw(toggle.dataset.platform === 'iphone' ? 'iphone' : 'android');
    });
  }
}

/** The tab note's «як?», or the in-app note's buttons, if the screen has the note. */
export function wireTabNote(host: ParentNode): void {
  host.querySelector('[data-install-how]')?.addEventListener('click', () => {
    showInstallHow(detectPlatform(navigator) === 'iphone' ? 'iphone' : 'android');
  });
  wireInAppNote(host, chromeIntent(location.href));
}
