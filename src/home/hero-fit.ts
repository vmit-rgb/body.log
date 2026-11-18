/**
 * Long phrases get a smaller header (Olesia, 2026-10-30; COPY.md «Home»):
 * header 1 → 2 → 3 → 4. Since the seasonal headers (Olesia, 2026-11-18) the
 * phrase stands in the empty space under the scene, not over it, so the
 * measure is that space: the largest style whose height fits in `room` px
 * (at 90 px that is at most 2 lines, so the old «3 lines» rule is inside it);
 * otherwise header 4, which then grows up over the scene.
 */
export const HERO_STYLES = ['t-h1', 't-h2', 't-h3', 't-h4'] as const;
export type HeroStyle = (typeof HERO_STYLES)[number];

/** `height` tells how tall the phrase is in a style, px. */
export function heroStyle(height: (style: HeroStyle) => number, room: number): HeroStyle {
  return HERO_STYLES.find((style) => height(style) <= room) ?? 't-h4';
}
