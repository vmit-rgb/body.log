import { announce } from './announce';
import { iconSvg } from './icons';
import { EASE, glyphs, MS, play, typeIn, whenDone } from './motion';

export interface ToastMessage {
  readonly message: string;
  /** Shown in the accent colour after the message, e.g. «:)» (COPY.md rules). */
  readonly emoticon?: string;
  /** ✓ only when a process has a result: збережено, видалено, скасовано… */
  readonly showIcon?: boolean;
  /** One text button, e.g. «скасувати» (deleting always offers it) or «оновити». */
  readonly action?: ToastAction;
  /** Something did not work: stays until ×, so it is not missed (the 4 s are for success and neutral messages). */
  readonly error?: boolean;
  /** Speaks about the screen it came on: goes when another screen comes (A-02). */
  readonly local?: boolean;
}

export interface ToastAction {
  readonly label: string;
  /** What to show next; nothing closes the toast. */
  readonly run: () => ToastMessage | void;
  /** «скасувати»: the toast goes with the next change, when it is no longer true (F-01). */
  readonly undo?: boolean;
}

export interface Toast {
  show(message: ToastMessage): void;
  /** Something was changed: a toast with «скасувати» for an earlier change goes (F-01). */
  changed(): void;
  /** Another screen came: a toast about the screen before goes (A-02), and so does «скасувати» (wave 7a). */
  screenChanged(): void;
  /** «вимкнути зникання повідомлень»: every toast stays until ×. */
  keep(on: boolean): void;
}

/** How long a success or neutral toast stays (Olesia, 2026-11-14). */
export const TOAST_MS = 4000;
/** The letters typed in become plain text again after this long. */
const SETTLE_MS = 600;

const UNDONE: ToastMessage = { message: 'скасовано', showIcon: true };

/** «скасувати»: runs the undo, then says «скасовано». */
export function undo(run: () => void): ToastAction {
  return { label: 'скасувати', undo: true, run: () => { run(); return UNDONE; } };
}

/** What a screen reader hears: the message whole, then the button's name. */
const spoken = (next: ToastMessage) => (next.action ? `${next.message}. ${next.action.label}` : next.message);

/** A focus that comes this soon after a finger or the mouse went down on the toast is the tap's own. */
const TAP_FOCUS_MS = 1000;

/** The toast comes out from under the bar (360 ms) and hides faster (240 ms); a new message stops the hiding. */
function slideUnderBar(box: HTMLElement): { rise(): void; hide(): void } {
  let leaving = false;
  return {
    rise() {
      const coming = box.hidden || leaving;
      box.getAnimations?.().forEach((run) => run.cancel());
      leaving = false;
      box.hidden = false;
      if (coming) play(box, [{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: MS.m, easing: EASE.out });
    },
    hide() {
      leaving = true;
      const fall = play(box, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(100%)', opacity: 0 }], { duration: MS.s, easing: EASE.in, fill: 'forwards' });
      whenDone(fall, () => {
        if (!leaving) return;
        leaving = false;
        box.hidden = true;
        fall?.cancel();
      });
    },
  };
}

/**
 * The single toast of the app; a new message replaces the current one.
 * How long it stays (ACCESSIBILITY.md rule 7, Olesia 2026-11-14):
 * - success and neutral messages: 4 s, shown by the bar on top that melts;
 * - with «скасувати»: until ×, the next change or another screen (wave 7a, even with «вимкнути зникання повідомлень»);
 * - with another button («оновити») or an error: until ×;
 * - never while the focus, a finger or the pointer is on it (B-09); when the
 *   focus leaves, it goes;
 * - with «вимкнути зникання повідомлень»: always until ×.
 * A screen reader hears it from the announcer, whole (B-09).
 */
export function mountToast(host: HTMLElement): Toast {
  host.insertAdjacentHTML('beforeend', `
    <div class="toast" role="region" aria-label="повідомлення" hidden>
      <span class="toast__life" hidden></span>
      <div class="toast__inner">
        <span class="toast__check" hidden>${iconSvg('check')}</span>
        <p class="toast__message t-2nd-regular"></p>
        <button type="button" class="ctl btn btn--tertiary toast__action" hidden></button>
        <button type="button" class="ctl icon-btn icon-btn--secondary toast__close" aria-label="закрити">${iconSvg('close')}</button>
      </div>
    </div>`);
  const box = host.querySelector<HTMLElement>('.toast:last-child')!;
  const check = box.querySelector<HTMLElement>('.toast__check')!;
  const text = box.querySelector<HTMLElement>('.toast__message')!;
  const button = box.querySelector<HTMLButtonElement>('.toast__action')!;
  const closeButton = box.querySelector<HTMLButtonElement>('.toast__close')!;
  const { rise, hide } = slideUnderBar(box);
  let life = box.querySelector<HTMLElement>('.toast__life')!;
  let current: ToastMessage | null = null;
  let keepAll = false;
  /** What is left of the 4 s, and when the count went on. */
  let left = 0;
  let since = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settling: ReturnType<typeof setTimeout> | undefined;
  const held = { focus: false, pointer: false };

  const timed = (message: ToastMessage) => !keepAll && !message.action && !message.error;

  function write(next: ToastMessage): void {
    text.textContent = next.message;
    if (!next.emoticon) return;
    const emoticon = document.createElement('span');
    emoticon.className = 'toast__emoticon';
    emoticon.textContent = next.emoticon;
    text.append(' ', emoticon);
  }

  /** Counts what is left of the 4 s, unless something holds the toast. */
  function count(): void {
    clearTimeout(timer);
    timer = undefined;
    const waits = current !== null && timed(current);
    box.classList.toggle('toast--held', waits && (held.focus || held.pointer));
    if (!waits || held.focus || held.pointer) return;
    since = Date.now();
    timer = setTimeout(close, left);
  }

  function pause(): void {
    if (timer !== undefined) left = Math.max(0, left - (Date.now() - since));
    count();
  }

  /** The bar that melts: drawn anew, so it starts from full. */
  function startLife(shown: boolean): void {
    const fresh = life.cloneNode() as HTMLElement;
    fresh.hidden = !shown;
    life.replaceWith(fresh);
    life = fresh;
    left = TOAST_MS;
    count();
  }

  function close(): void {
    current = null;
    clearTimeout(timer);
    timer = undefined;
    // a hidden toast is left without «pointerleave» or «focusout»
    held.focus = false;
    held.pointer = false;
    hide();
  }

  function show(next: ToastMessage): void {
    current = next;
    write(next);
    check.hidden = !next.showIcon;
    // a keyboard's focus stays in the toast when its button goes (after «скасувати»)
    if (!next.action && held.focus && document.activeElement === button) closeButton.focus({ preventScroll: true });
    button.textContent = next.action?.label ?? '';
    button.hidden = !next.action;
    rise();
    typeIn(text);
    clearTimeout(settling);
    settling = setTimeout(() => {
      if (current === next && text.querySelector('.fx-ch')) write(next);
    }, SETTLE_MS);
    if (next.showIcon) glyphs(check, ['.', '\\', 'v']);
    announce(spoken(next));
    startLife(timed(next));
  }

  button.addEventListener('click', () => {
    const action = current?.action;
    // what the action itself changes is not «the next change»
    current = null;
    const after = action?.run();
    if (after) show(after);
    else close();
  });
  closeButton.addEventListener('click', close);

  // a tap on a button focuses it too; only a focus brought another way (keyboard, switch) holds the toast
  let tappedAt = -TAP_FOCUS_MS;
  box.addEventListener('pointerdown', () => {
    tappedAt = Date.now();
  });
  box.addEventListener('focusin', () => {
    if (Date.now() - tappedAt < TAP_FOCUS_MS) return;
    held.focus = true;
    pause();
  });
  box.addEventListener('focusout', (event) => {
    if (!held.focus || box.contains(event.relatedTarget as Node | null)) return;
    held.focus = false;
    // «висить, поки фокус не піде» (Olesia, 2026-11-15): no extra time after it
    if (current && timed(current)) close();
    else count();
  });
  box.addEventListener('pointerenter', () => {
    held.pointer = true;
    pause();
  });
  for (const gone of ['pointerleave', 'pointercancel']) {
    box.addEventListener(gone, () => {
      held.pointer = false;
      count();
    });
  }

  return {
    show,
    changed() {
      const stale = current;
      if (!stale?.action?.undo) return;
      // a change that brings its own toast replaces this one in place, without it hiding first
      queueMicrotask(() => {
        if (current === stale) close();
      });
    },
    screenChanged() {
      // wave 7a (Olesia, 2026-11-18): «скасувати» can't be used from another screen
      if (current?.local || current?.action?.undo) close();
    },
    keep(on) {
      if (keepAll === on) return;
      keepAll = on;
      if (current) startLife(timed(current));
    },
  };
}
