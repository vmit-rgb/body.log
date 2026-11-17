/*
 * B-04: where the focus goes when a screen changes. A new screen puts it on
 * its heading, so a screen reader says where the person is and a keyboard
 * starts there; a screen closed gives it back to the button that opened it.
 */

/** What finds the same button again on a screen drawn anew; null for anything else. */
export function selectorOf(element: Element | null): string | null {
  if (!(element instanceof HTMLElement)) return null;
  for (const key of ['menu', 'edit', 'page', 'card'] as const) {
    const value = element.dataset[key];
    if (value !== undefined) return `[data-${key}="${value.replace(/["\\]/g, '\\$&')}"]`;
  }
  return element.classList.contains('bar__menu') ? '.bar__menu' : null;
}

/** The screen's heading takes the focus (it can be focused, but is no stop for Tab). */
export function focusHeading(host: HTMLElement): void {
  const heading = host.querySelector<HTMLElement>('h1');
  if (!heading) return;
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
}

/** The button `selector` finds takes the focus; the heading when it isn't there. */
export function focusBack(host: HTMLElement, selector: string | null): void {
  const button = selector ? host.querySelector<HTMLElement>(selector) : null;
  if (button) button.focus({ preventScroll: true });
  else focusHeading(host);
}

/** B-05: the page's title, as the phone says it when switching apps. */
export function titleFor(screen?: string): string {
  return screen ? `${screen} · body.log` : 'body.log';
}
