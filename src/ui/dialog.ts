import { closesOnBack } from './back';
import { esc } from './html';
import { EASE, MS, play, whenDone } from './motion';

/*
 * Two layers over a screen, both closed with Escape too:
 * - dialog/confirm (Figma 250:6304) over overlay/scrim: a question with a
 *   safe button («скасувати», «залишитися») and the action;
 * - overlay/text-edit (250:6286): one value, full screen, big, with the
 *   phone's keyboard; «готово» keeps it, «скасувати» gives the old one back.
 * The focus goes back where it was when the layer closes.
 */

export interface ConfirmSpec {
  readonly title: string;
  readonly body?: string;
  /** The action, in the error colour (Figma button/confirm). */
  readonly confirm: string;
  /** The safe way out, the outlined button; it gets the focus. */
  readonly cancel: string;
  /** A third button above the two, e.g. «зберегти копію» before erasing. */
  readonly extra?: string;
}

export type ConfirmAnswer = 'confirm' | 'cancel' | 'extra';

/**
 * Puts a layer on the page. While it is there (B-03) the screen under it is
 * inert, so Tab and a screen reader stay in the layer; Escape anywhere and
 * the phone's «назад» (A-05) call `cancel`. `close` gives the focus back to
 * where it was and removes the layer, `dissolve` too, but the layer fades
 * out first (and takes no taps meanwhile).
 */
export function layer(markup: string, cancel: () => void): { root: HTMLElement; close(): void; dissolve(): void } {
  const before = document.activeElement as HTMLElement | null;
  const screen = document.querySelector<HTMLElement>('#app');
  const wasInert = screen?.hasAttribute('inert') ?? false;
  document.body.insertAdjacentHTML('beforeend', markup);
  const root = document.body.lastElementChild as HTMLElement;
  screen?.setAttribute('inert', '');
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') cancel();
  };
  document.addEventListener('keydown', onKey);
  const done = closesOnBack(cancel);
  /** The screen takes the focus again: everything but the layer's own removal. */
  const letGo = () => {
    document.removeEventListener('keydown', onKey);
    screen?.toggleAttribute('inert', wasInert);
    done();
    before?.focus({ preventScroll: true });
  };
  return {
    root,
    close() {
      root.remove();
      letGo();
    },
    dissolve() {
      root.inert = true;
      letGo();
      whenDone(play(root, [{ opacity: 1 }, { opacity: 0 }], { duration: MS.s, easing: EASE.in, fill: 'forwards' }), () => root.remove());
    },
  };
}

export function confirmDialog(spec: ConfirmSpec): Promise<ConfirmAnswer> {
  let answer: (value: ConfirmAnswer) => void = () => {};
  const { root, dissolve } = layer(`
    <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title"${spec.body ? ' aria-describedby="dialog-body"' : ''}>
      <div class="dialog__scrim" data-answer="cancel"></div>
      <div class="dialog__panel">
        <p class="t-1st-bold" id="dialog-title">${esc(spec.title)}</p>
        ${spec.body ? `<p class="t-2nd-regular muted" id="dialog-body">${esc(spec.body)}</p>` : ''}
        ${spec.extra ? `<button type="button" class="ctl btn btn--primary btn--wide dialog__extra" data-answer="extra">${esc(spec.extra)}</button>` : ''}
        <div class="dialog__actions">
          <button type="button" class="ctl btn btn--secondary" data-answer="cancel">${esc(spec.cancel)}</button>
          <button type="button" class="ctl btn btn--destructive" data-answer="confirm">${esc(spec.confirm)}</button>
        </div>
      </div>
    </div>`, () => answer('cancel'));
  root.querySelector<HTMLElement>('[data-answer="cancel"].btn')!.focus();
  // comes up from below, the scrim darkens with it
  play(root.querySelector('.dialog__panel'), [{ opacity: 0, transform: 'translateY(32px)' }, { opacity: 1, transform: 'none' }], { duration: MS.m, easing: EASE.out });
  play(root.querySelector('.dialog__scrim'), [{ opacity: 0 }, { opacity: 1 }], { duration: MS.m, easing: EASE.out });
  return new Promise((resolve) => {
    let answered = false;
    answer = (value: ConfirmAnswer) => {
      if (answered) return;
      answered = true;
      dissolve();
      resolve(value);
    };
    root.addEventListener('click', (event) => {
      const target = (event.target as Element).closest<HTMLElement>('[data-answer]');
      if (target) answer(target.dataset.answer as ConfirmAnswer);
    });
  });
}

export interface ListSpec {
  readonly title: string;
  readonly items: readonly string[];
  /** The one in view now: bold, and it takes the focus. */
  readonly current: number;
}

/**
 * A sheet from below with a list of names, like the calendar sheet (wave 9:
 * the questions of the carousel, Olesia 2026-11-18). The index picked, or
 * null when it was closed without a choice.
 */
export function pickFromList(spec: ListSpec): Promise<number | null> {
  let answer: (value: number | null) => void = () => {};
  const { root, dissolve } = layer(`
    <div class="list-sheet" role="dialog" aria-modal="true" aria-labelledby="list-sheet-title">
      <div class="list-sheet__scrim" data-pick="none"></div>
      <div class="list-sheet__panel">
        <h2 class="t-h5" id="list-sheet-title">${esc(spec.title)}</h2>
        <ul class="list-sheet__items" role="list">${spec.items.map((item, i) => `
          <li><button type="button" class="ctl list-sheet__item t-1st-regular" data-pick="${i}"${i === spec.current ? ' aria-current="true"' : ''}>${esc(item)}</button></li>`).join('')}</ul>
      </div>
    </div>`, () => answer(null));
  (root.querySelector<HTMLElement>('[aria-current="true"]') ?? root.querySelector<HTMLElement>('[data-pick="0"]'))?.focus();
  play(root.querySelector('.list-sheet__panel'), [{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: MS.m, easing: EASE.out });
  play(root.querySelector('.list-sheet__scrim'), [{ opacity: 0 }, { opacity: 1 }], { duration: MS.m, easing: EASE.out });
  return new Promise((resolve) => {
    let answered = false;
    answer = (value) => {
      if (answered) return;
      answered = true;
      dissolve();
      resolve(value);
    };
    root.addEventListener('click', (event) => {
      const target = (event.target as Element).closest<HTMLElement>('[data-pick]');
      if (target) answer(target.dataset.pick === 'none' ? null : Number(target.dataset.pick));
    });
  });
}

export interface TextEditSpec {
  /** Muted, above the value: what is being changed. */
  readonly label: string;
  readonly value: string;
  readonly maxLength: number;
  /** A description or «як робити»: 14 px from the top, the field as big as the screen allows (Olesia, MY-FIXES). */
  readonly long?: boolean;
}

/**
 * The overlay covers what the person sees: above the phone's keyboard, so its
 * buttons stay at the top edge (Olesia, MY-FIXES). Returns the way to stop.
 */
function fitToVisible(root: HTMLElement): () => void {
  const view = window.visualViewport;
  if (!view) return () => {};
  const fit = () => {
    root.style.top = `${view.offsetTop}px`;
    root.style.bottom = 'auto';
    root.style.height = `${view.height}px`;
  };
  fit();
  view.addEventListener('resize', fit);
  view.addEventListener('scroll', fit);
  return () => {
    view.removeEventListener('resize', fit);
    view.removeEventListener('scroll', fit);
  };
}

/** The new text, or null when cancelled. */
export function editText(spec: TextEditSpec): Promise<string | null> {
  let answer: (done: boolean) => void = () => {};
  const { root, close } = layer(`
    <div class="text-edit${spec.long ? ' text-edit--long' : ''}" role="dialog" aria-modal="true" aria-label="${esc(spec.label)}">
      <div class="text-edit__actions">
        <button type="button" class="ctl btn btn--tertiary" data-answer="cancel">скасувати</button>
        <button type="button" class="ctl btn btn--secondary" data-answer="done">готово</button>
      </div>
      <label class="text-edit__field">
        <span class="t-3rd-regular muted">${esc(spec.label)}</span>
        <textarea class="text-edit__input" rows="4" autocomplete="off" enterkeyhint="done" maxlength="${spec.maxLength}">${esc(spec.value)}</textarea>
      </label>
    </div>`, () => answer(false));
  // overlay/text-edit fills the screen gradually, gaining brightness (MICROINTERACTIONS.md)
  play(root, [
    { opacity: 0, filter: 'brightness(.3)', clipPath: 'inset(30% 0 30% 0)' },
    { opacity: 1, filter: 'brightness(1)', clipPath: 'inset(0 0 0 0)' },
  ], { duration: MS.l, easing: EASE.out });
  // a textarea, so a long phrase wraps instead of running off the screen; Enter still means «готово»
  const input = root.querySelector<HTMLTextAreaElement>('.text-edit__input')!;
  const unfit = fitToVisible(root);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  return new Promise((resolve) => {
    let answered = false;
    answer = (done: boolean) => {
      if (answered) return;
      answered = true;
      unfit();
      close();
      resolve(done ? input.value.trim() : null);
    };
    root.addEventListener('click', (event) => {
      const target = (event.target as Element).closest<HTMLElement>('[data-answer]');
      if (target) answer(target.dataset.answer === 'done');
    });
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        answer(true);
      }
    });
  });
}
