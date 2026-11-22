/*
 * Beta 1.0.1 (FIXES-1.0.1.md, A1): the «встановити» button on Android.
 * Chrome (and Edge, Samsung Internet) offer the install with
 * `beforeinstallprompt`; the app keeps that event and asks with it when the
 * button is pressed. No event (Firefox, an iPhone, already installed, the
 * browser didn't offer) — no button, the steps stay as text.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallAnswer = 'accepted' | 'dismissed' | 'unavailable';

export interface InstallOffer {
  /** The browser offered the install, and it was not used yet. */
  ready(): boolean;
  /** Called whenever `ready()` may have changed; returns the way to stop listening. */
  onChange(listener: () => void): () => void;
  /** The browser's own install window; the offer is used up either way. */
  install(): Promise<InstallAnswer>;
}

/** No browser offer: the button never shows (tests, the installed app, an iPhone). */
export const NO_OFFER: InstallOffer = {
  ready: () => false,
  onChange: () => () => {},
  install: async () => 'unavailable',
};

/**
 * Listens on `target` (the window) for the browser's offer and for the
 * install itself; `onInstalled` runs in the tab after the install (A2b).
 */
export function watchInstallOffer(target: Pick<Window, 'addEventListener'>, onInstalled: () => void): InstallOffer {
  let offer: InstallPromptEvent | null = null;
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of [...listeners]) listener();
  };
  target.addEventListener('beforeinstallprompt', (event) => {
    // the browser's own mini bar stays away; the app's button asks instead
    event.preventDefault();
    offer = event as InstallPromptEvent;
    changed();
  });
  target.addEventListener('appinstalled', () => {
    offer = null;
    changed();
    onInstalled();
  });
  return {
    ready: () => offer !== null,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async install() {
      const asked = offer;
      if (!asked) return 'unavailable';
      // an offer works once
      offer = null;
      changed();
      try {
        await asked.prompt();
        return (await asked.userChoice).outcome;
      } catch {
        return 'unavailable';
      }
    },
  };
}

let shared: InstallOffer = NO_OFFER;

/** main.ts hands the page's offer here once; the install screens read it. */
export function useInstallOffer(offer: InstallOffer): void {
  shared = offer;
}

export function installOffer(): InstallOffer {
  return shared;
}
