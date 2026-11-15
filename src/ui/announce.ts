/*
 * What a screen reader hears when something changes on its own: the toast,
 * another day, the phases of the pulse timer (B-02, B-09). One region, made
 * once and never hidden; only its text changes. A region that appears
 * together with its text is often not read at all.
 */

const ID = 'announcer';

/** The region, made on the first call (main.ts calls it when the app loads). */
export function mountAnnouncer(): HTMLElement {
  const found = document.getElementById(ID);
  if (found) return found;
  const region = document.createElement('div');
  region.id = ID;
  region.className = 'visually-hidden';
  region.setAttribute('role', 'status');
  document.body.append(region);
  return region;
}

/** Says `text`, politely: after what is being read now. */
export function announce(text: string): void {
  const region = mountAnnouncer();
  // the same words again are a new message: the text has to differ to be read
  region.textContent = region.textContent === text ? `${text} ` : text;
}
