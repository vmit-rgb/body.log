import type { BackSteps, OnBack } from '../app/back-steps';

/*
 * A layer over a screen (the calendar sheet, a dialog, the text overlay, the
 * settings' action menu) is one step of the phone's «назад» (A-05). The app
 * hands its steps in once at the start; until then (and in tests of a single
 * layer) a layer is simply not a step.
 */

let steps: BackSteps | null = null;

export function useBackSteps(next: BackSteps | null): void {
  steps = next;
}

/**
 * «назад» closes this layer with `close`. Returns `done`: call it when the
 * layer closes by itself, so its step goes too.
 */
export function closesOnBack(close: OnBack): () => void {
  return steps ? steps.open(close) : () => {};
}
