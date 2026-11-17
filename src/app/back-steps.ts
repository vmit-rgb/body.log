/*
 * A-05 + A-06: what the phone's «назад» closes. Every screen over home and
 * every layer over a screen (the calendar sheet, a dialog, the text overlay,
 * the settings' action menu) is one step, the newest on top. «назад» takes
 * the top step only, so it closes a dialog and never the screen under it.
 *
 * The browser's history holds one entry per step, each marked with its
 * place (`{ step: n }`, 0 = home). The app changes the steps at once and the
 * browser follows, one move at a time: a second move waits until the first
 * has arrived, so two moves made in the same moment never cancel each other.
 */

/** The browser's history, as far as the steps need it. */
export interface BrowserSteps {
  /** The place of the entry shown now (0 for home or an entry without a mark). */
  at(): number;
  /** Adds an entry with this place on top and shows it. */
  push(place: number): void;
  /** Moves by `delta` entries; the browser says where it arrived through `listen`. */
  go(delta: number): void;
  listen(arrived: (place: number) => void): void;
}

/**
 * What happens when «назад» takes this step. 'stay' keeps it (the settings
 * with changes, which ask first); anything else closes it.
 */
export type OnBack = () => void | 'stay';

export interface BackSteps {
  /**
   * A new step on top. Returns `done`: the step closed by itself (its own
   * button); the steps above it go with it, and so do their entries.
   */
  open(onBack: OnBack): () => void;
}

export function backSteps(browser: BrowserSteps): BackSteps {
  const steps: { onBack: OnBack }[] = [];
  let at = browser.at();
  /** A move asked of the browser that has not arrived yet. */
  let moving = false;

  /** The browser shows as many entries over home as there are steps. */
  function follow(): void {
    if (moving) return;
    while (at < steps.length) browser.push(++at);
    if (at > steps.length) {
      moving = true;
      browser.go(steps.length - at);
    }
  }

  /** The person's own «назад» (or «вперед»): the top steps it took close, unless one stays. */
  function taken(place: number): void {
    let count = at - place;
    at = place;
    while (count-- > 0 && steps.length > place) {
      const index = steps.length - 1;
      const step = steps.pop()!;
      if (step.onBack() !== 'stay') continue;
      // under anything it opened meanwhile (the dialog «вийти без збереження?»)
      steps.splice(index, 0, step);
      break;
    }
    follow();
  }

  browser.listen((place) => {
    if (!moving) return taken(place);
    moving = false;
    at = place;
    follow();
  });
  // a page loaded again on an entry over home goes back to home's entry
  follow();

  return {
    open(onBack) {
      const step = { onBack };
      steps.push(step);
      follow();
      return () => {
        const index = steps.indexOf(step);
        if (index < 0) return;
        steps.length = index;
        follow();
      };
    },
  };
}
