import type { DayKey } from '../domain/dates';
import type { HealthLog } from '../domain/day';
import { plural } from '../domain/numbers';
import type { HomeSession } from '../home/session';
import type { ToastMessage } from '../ui/toast';
import { t } from '../i18n/lang';
import { healthDates, parseHealth } from './health';

/*
 * What the «Здоровʼя» buttons in «рух» do (beta 1.1.1, HEALTH-IMPORT.md, A4).
 * Texts of the toasts are Нитка's drafts.
 */

/** What home gives the buttons on an iPhone; nothing on other phones. */
export interface HealthControls {
  /** «підключити Здоровʼя» was pressed: remembered on this phone. */
  connect(): void;
  /** The clipboard as text; null when the phone doesn't let the app read it. */
  read(): Promise<string | null>;
  /** Writes «Здоровʼя» of these days (replacing what came before) and draws home again. */
  add(days: Readonly<Record<DayKey, HealthLog>>): void;
  today(): DayKey;
}

interface Screen {
  readonly session: HomeSession;
  readonly health?: HealthControls | undefined;
  render(): void;
  screen(): HTMLElement;
  toast(message: ToastMessage): void;
}

export const NOT_HEALTH: ToastMessage = {
  message: `${t('у буфері немає даних зі Здоровʼя. спершу натисни «синхронізувати».')} >_<`, error: true,
};
export const NO_HEALTH_DATA: ToastMessage = { message: t('команда спрацювала, але у «Здоровʼї» немає кроків чи км за 7 днів.') };
const DAYS = ['день', 'дні', 'днів'] as const;
export const healthAdded = (n: number): ToastMessage => ({ message: `${t('додано зі Здоровʼя:')} ${n} ${plural(n, DAYS)}`, showIcon: true });

/**
 * A link's own tap opens what it points to (the iCloud link, the shortcut);
 * drawing home anew in the same tap would take the link away before the
 * phone follows it, so the new buttons come a moment later.
 */
const later = (c: Screen) => setTimeout(() => c.render(), 0);

export function connectHealth(c: Screen): void {
  c.health?.connect();
  Object.assign(c.session.health, { synced: false, field: false, tip: true });
  later(c);
}

/** «синхронізувати»: the button becomes «вставити дані», with a bubble saying it needs this second tap. */
export function syncHealth(c: Screen): void {
  Object.assign(c.session.health, { synced: true, field: false, tip: true });
  later(c);
}

/** The text from the shortcut, read and written; a text that isn't ours keeps the buttons as they are. */
export function applyHealth(c: Screen, text: string): void {
  const health = c.health;
  if (!health) return;
  const pasted = parseHealth(text, health.today());
  if (pasted.kind === 'not-ours') {
    // the bubble comes with «підключити знову»: maybe the shortcut was never added;
    // the one button says «синхронізувати» again, to try once more
    Object.assign(c.session.health, { synced: false, field: false, tip: true });
    c.render();
    c.toast(NOT_HEALTH);
    return;
  }
  const dates = healthDates(pasted.days);
  Object.assign(c.session.health, { synced: false, field: false, tip: false });
  if (dates.length === 0) {
    c.render();
    c.toast(NO_HEALTH_DATA);
    return;
  }
  health.add(pasted.days);
  c.toast(healthAdded(dates.length));
}

/** «вставити дані»: the clipboard, or a paste field when the phone won't give it. */
export async function pasteHealth(c: Screen): Promise<void> {
  const text = await c.health?.read();
  if (text === null || text === undefined) {
    c.session.health.field = true;
    c.render();
    c.screen().querySelector<HTMLElement>('[data-health-field]')?.focus({ preventScroll: true });
    return;
  }
  applyHealth(c, text);
}

/** «застосувати» under the paste field. */
export function applyHealthField(c: Screen): void {
  const field = c.screen().querySelector<HTMLTextAreaElement>('[data-health-field]');
  applyHealth(c, field?.value ?? '');
}
