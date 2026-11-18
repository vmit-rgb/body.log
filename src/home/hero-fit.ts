/**
 * Long phrases get a smaller header (Olesia, 2026-10-30; COPY.md «Home»):
 * header 1 → 2 → … The phrase stands in the empty space under the scene
 * (seasonal headers, Olesia 2026-11-18), so the measure is that space: the
 * largest style whose height fits in `room` px. It may step down to header 6
 * and then to 17 px, the size of first-order body text, never smaller
 * (Olesia, 2026-11-18); a phrase that doesn't fit even then stays at 17 px
 * and goes up over the scene («у виключних випадках захід на анімацію норм»).
 */
export const HERO_STYLES = ['t-h1', 't-h2', 't-h3', 't-h4', 't-h5', 't-h6', 't-1st-bold'] as const;
export type HeroStyle = (typeof HERO_STYLES)[number];

/** `height` tells how tall the phrase is in a style, px. */
export function heroStyle(height: (style: HeroStyle) => number, room: number): HeroStyle {
  return HERO_STYLES.find((style) => height(style) <= room) ?? 't-1st-bold';
}
