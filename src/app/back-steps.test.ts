import { describe, expect, it } from 'vitest';
import { backSteps, type BrowserSteps } from './back-steps';

/** A browser history whose moves arrive only when `arrive` is called, as in a real browser. */
function fakeBrowser(start = 0) {
  let listener: (place: number) => void = () => {};
  const entries = [0];
  for (let i = 1; i <= start; i++) entries.push(i);
  let index = entries.length - 1;
  const pending: number[] = [];
  const log: string[] = [];
  const browser: BrowserSteps = {
    at: () => entries[index]!,
    push(place) {
      entries.length = index + 1;
      entries.push(place);
      index++;
      log.push(`push ${place}`);
    },
    go(delta) {
      pending.push(delta);
      log.push(`go ${delta}`);
    },
    listen(arrived) {
      listener = arrived;
    },
  };
  return {
    browser,
    log,
    /** The browser's move arrives. */
    arrive() {
      index += pending.shift()!;
      listener(entries[index]!);
    },
    /** The phone's «назад». */
    back() {
      index--;
      listener(entries[index]!);
    },
    /** The browser's «вперед». */
    forward() {
      index++;
      listener(entries[index]!);
    },
    shown: () => entries[index]!,
    pending,
  };
}

describe('backSteps', () => {
  it('adds an entry for each step and takes the top one on «назад»', () => {
    const phone = fakeBrowser();
    const steps = backSteps(phone.browser);
    const closed: string[] = [];
    steps.open(() => void closed.push('page'));
    steps.open(() => void closed.push('dialog'));
    expect(phone.shown()).toBe(2);
    phone.back();
    expect(closed).toEqual(['dialog']);
    phone.back();
    expect(closed).toEqual(['dialog', 'page']);
    expect(phone.log).toEqual(['push 1', 'push 2']);
  });

  it('a step closed by its own button takes its entry back', () => {
    const phone = fakeBrowser();
    const steps = backSteps(phone.browser);
    const closed: string[] = [];
    steps.open(() => void closed.push('page'));
    const done = steps.open(() => void closed.push('dialog'));
    done();
    expect(phone.log.at(-1)).toBe('go -1');
    phone.arrive();
    expect(phone.shown()).toBe(1);
    // nothing was closed by «назад»: the move was the app's own
    expect(closed).toEqual([]);
    done();
    expect(phone.pending).toEqual([]);
  });

  it('two steps closed in the same moment make one move after another, never two at once', () => {
    const phone = fakeBrowser();
    const steps = backSteps(phone.browser);
    const page = steps.open(() => {});
    const dialog = steps.open(() => {});
    dialog();
    page();
    expect(phone.pending).toEqual([-1]);
    phone.arrive();
    expect(phone.pending).toEqual([-1]);
    phone.arrive();
    expect(phone.shown()).toBe(0);
  });

  it('a step closed takes the steps above it along', () => {
    const phone = fakeBrowser();
    const steps = backSteps(phone.browser);
    const page = steps.open(() => {});
    steps.open(() => {});
    page();
    expect(phone.pending).toEqual([-2]);
  });

  it('a step that stays keeps its entry, under what it opened', () => {
    const phone = fakeBrowser();
    const steps = backSteps(phone.browser);
    const closed: string[] = [];
    steps.open(() => {
      // «вийти без збереження?»
      steps.open(() => void closed.push('dialog'));
      return 'stay';
    });
    phone.back();
    expect(phone.shown()).toBe(2);
    // A-06: «назад» over the dialog closes the dialog, nothing else asks again
    phone.back();
    expect(closed).toEqual(['dialog']);
    expect(phone.shown()).toBe(1);
  });

  it('a page loaded again on an entry over home goes back to home', () => {
    const phone = fakeBrowser(2);
    backSteps(phone.browser);
    expect(phone.pending).toEqual([-2]);
  });

  it('«вперед» past the steps is taken back', () => {
    const phone = fakeBrowser();
    const steps = backSteps(phone.browser);
    const done = steps.open(() => {});
    done();
    phone.arrive();
    // the entry 1 is still there in the browser: «вперед» shows it
    phone.forward();
    expect(phone.pending).toEqual([-1]);
    phone.arrive();
    expect(phone.shown()).toBe(0);
  });
});
