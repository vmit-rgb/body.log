/**
 * Accent colours the person can pick, in order round the hue circle.
 * 11 since 2026-11-12 (Olesia): sky and green added; green is free again
 * because there is no success colour any more.
 */
export const ACCENTS = [
  'gray', 'orange', 'pink', 'magenta', 'purple', 'violet', 'blue', 'sky', 'cyan', 'mint', 'green',
] as const;

export type Accent = (typeof ACCENTS)[number];

export const DEFAULT_ACCENT: Accent = 'pink';

function isAccent(value: unknown): value is Accent {
  return (ACCENTS as readonly unknown[]).includes(value);
}

/**
 * Reads an accent from stored settings; anything else is the default.
 * Accents removed earlier are moved to the nearest one when old settings
 * are converted (format/profile-upgrade.ts).
 */
export function parseAccent(value: unknown): Accent {
  return isAccent(value) ? value : DEFAULT_ACCENT;
}
