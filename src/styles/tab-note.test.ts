import { describe, expect, it } from 'vitest';
import tokens from './tokens.css?raw';
import screens from './screens.css?raw';
import glass from './glass.css?raw';
import { TAB_NOTE } from '../screens/parts';

/*
 * Wave 11, item 1 (Olesia, 2026-11-18): «це вкладка браузера…» is a yellow plate
 * with black text and an outline, the same in both themes, very easy to see.
 */
type Rgb = readonly [number, number, number];
const linear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const contrast = (a: Rgb, b: Rgb) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const hex = (value: string): Rgb => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value.trim());
  if (!m) throw new Error(`not a hex colour: ${value}`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
};
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const blockOf = (css: string, selector: string) => {
  const at = strip(css).indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no block ${selector}`);
  const text = strip(css);
  return text.slice(at, text.indexOf('}', at));
};
const token = (block: string, name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1];

const root = blockOf(tokens, ':root');
const light = blockOf(tokens, ":root[data-theme='light']");
const yellow = hex(token(root, '--tab-note-bg')!);
const black = hex(token(root, '--tab-note-ink')!);
const pages = { dark: hex(token(root, '--bg')!), light: hex(token(light, '--bg')!), header: hex(token(root, '--scene-bg')!) };

describe('«це вкладка браузера…»: a yellow plate, the same in both themes (wave 11)', () => {
  it('has its own yellow and black, never overridden by the light theme or an accent', () => {
    expect(light).not.toMatch(/--tab-note-/);
    expect(strip(tokens).match(/--tab-note-(bg|ink):/g)).toHaveLength(2);
    const note = blockOf(screens, '.tab-note');
    expect(note).toMatch(/background: var\(--tab-note-bg\);/);
    expect(note).toMatch(/color: var\(--tab-note-ink\);/);
    expect(note).toMatch(/border: var\(--stroke-focus\) solid var\(--tab-note-ink\);/);
    expect(note).toMatch(/box-shadow: 0 0 0 var\(--stroke-focus\) var\(--tab-note-bg\);/);
    expect(note).not.toMatch(/accent|--warn|--panel/);
  });

  it('black text on the yellow passes 4.5:1', () => {
    expect(contrast(black, yellow)).toBeGreaterThanOrEqual(4.5);
  });

  it('its outline stands at least 3:1 against both pages and the header', () => {
    for (const [name, page] of Object.entries(pages)) {
      expect(Math.max(contrast(black, page), contrast(yellow, page)), name).toBeGreaterThanOrEqual(3);
    }
  });

  it('…and against anything at all behind it, such as the fade under the header', () => {
    // contrast depends only on luminance, and the greys from black to white walk through all of it
    for (let v = 0; v <= 255; v++) {
      const behind: Rgb = [v, v, v];
      expect(Math.max(contrast(black, behind), contrast(yellow, behind)), `#${v.toString(16)}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('is solid: no glass and no frame rule takes its background away', () => {
    expect(strip(glass)).not.toContain('.tab-note');
  });

  it('uses the 14 px text, bold', () => {
    expect(TAB_NOTE).toContain('class="tab-note t-2nd-bold"');
  });

  it('puts «як?» on the right, bolder than the text (Olesia, 2026-11-19)', () => {
    expect(blockOf(screens, '.tab-note')).toMatch(/display: flex;[^}]*flex-direction: column;/);
    const how = blockOf(screens, '.tab-note__how');
    expect(how).toMatch(/align-self: flex-end;/);
    // .ctl takes its weight from --weight-0; the plate's text is 720
    expect(how).toMatch(/--weight-0: 900;/);
    expect(how).not.toMatch(/font-weight/);
  });
});
