import type { JsonObject } from '../domain/diary';
import { changesNothing, describeChanges, type Changes, type PreviewNames } from '../paste/preview';
import { readPaste, type Refusal } from '../paste/read';
import type { ToastMessage } from '../ui/toast';

/*
 * «застосувати» on the first screen and in «налаштування через ШІ»: the
 * pasted text is read (paste/read.ts), then the person sees a refusal
 * with «скопіювати для ШІ», or what the app couldn't read with two ways
 * on, or the preview with «зберегти» / «скасувати». Nothing is kept
 * before «зберегти». Texts: COPY.md «Pasting settings», Toasts.
 */

export type PasteView =
  | { readonly kind: 'none' }
  | { readonly kind: 'refused'; readonly refusal: Refusal }
  /** Keys the app doesn't know: they are named and never kept. */
  | { readonly kind: 'unknown'; readonly lines: readonly string[] }
  | { readonly kind: 'preview'; readonly changes: Changes; readonly nothing: boolean };

export type PasteAct = 'copy' | 'continue' | 'save' | 'cancel';

export interface PasteDeps {
  /** The settings on screen now, to compare with; null on the first screen. */
  current(): JsonObject | null;
  readonly names: PreviewNames;
  copyText(text: string): Promise<boolean>;
  say(message: ToastMessage): void;
  /** Draws `view` where the result lives. */
  show(): void;
  /** «зберегти»: keeps the settings; the records are not touched. */
  save(profile: JsonObject): void;
}

const COPIED: ToastMessage = { message: 'скопійовано — встав у чат зі своїм ШІ', showIcon: true };
const NOT_COPIED: ToastMessage = { message: 'не вдалося скопіювати', emoticon: '>_<' };
/** «відновити з копії» refuses a copy whose settings are russian (D-05). Serious: no emoticon. Нитка's draft. */
export const RUSSIAN_COPY: ToastMessage = { message: 'копію не відновлено: налаштування в ній російською мовою.' };

export class PasteFlow {
  view: PasteView = { kind: 'none' };
  private forAi: string | null = null;
  private pending: JsonObject | null = null;

  constructor(private readonly deps: PasteDeps) {}

  /** Forgets the result without drawing (the text in the field changed, or the screen went). */
  reset(): void {
    this.view = { kind: 'none' };
    this.forAi = null;
    this.pending = null;
  }

  apply(text: string): void {
    this.reset();
    const read = readPaste(text);
    this.forAi = read.forAi;
    if (read.kind === 'refused') this.view = { kind: 'refused', refusal: read };
    else {
      // «доступність» changes only when the paste carries it (PROFILE-FORMAT.md)
      const kept = this.deps.current()?.accessibility;
      this.pending = read.hasAccessibility || kept === undefined ? read.profile : { ...read.profile, accessibility: kept };
      if (read.unknown.length) this.view = { kind: 'unknown', lines: read.unknown };
      else this.preview();
    }
    this.deps.show();
  }

  private preview(): void {
    const changes = describeChanges(this.deps.current(), this.pending!, this.deps.names);
    this.view = { kind: 'preview', changes, nothing: changesNothing(changes) };
  }

  act(act: PasteAct): void {
    if (act === 'copy') return void this.copy();
    if (act === 'save' && this.pending) {
      const profile = this.pending;
      this.reset();
      return this.deps.save(profile);
    }
    if (act === 'continue' && this.pending) this.preview();
    else this.reset();
    this.deps.show();
  }

  private async copy(): Promise<void> {
    if (this.forAi === null) return;
    this.deps.say((await this.deps.copyText(this.forAi)) ? COPIED : NOT_COPIED);
  }
}
