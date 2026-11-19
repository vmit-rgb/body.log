import { describe, expect, it } from 'vitest';
import glass from './glass.css?raw';
import tokens from './tokens.css?raw';
import components from './components.css?raw';
import main from '../main.ts?raw';
import first from '../screens/first-launch.ts?raw';

describe('glass: no text straight on «Політ символів» (Olesia, 2026-11-18)', () => {
  it('blurs every panel like the section titles', () => {
    expect(tokens).toMatch(/--glass-blur: blur\(4px\);/);
    expect(components).toMatch(/\.accordion--section \{[^}]*backdrop-filter: var\(--glass-blur\)/);
    const blurred = /\*\/\n([^{]*)\{\s*-webkit-backdrop-filter: var\(--glass-blur\);/.exec(glass)?.[1] ?? '';
    for (const block of ['.home-section__body', '.home-section__hint', '.home .cal-block', '.history .cal-block', '.screen__section', '.settings__intro', '.footer', '.day-card', '.settings__group']) {
      expect(blurred.split(/,\s*/).map((s) => s.trim()), block).toContain(block);
    }
  });

  it('is loaded after the screen styles, so its room inside wins', () => {
    expect(main.indexOf("'./styles/glass.css'")).toBeGreaterThan(main.indexOf("'./styles/settings.css'"));
  });

  it('puts the start screen in one frame like a home section', () => {
    expect(first).toContain('<div class="screen screen--framed">');
    expect(glass).toMatch(/\.screen--framed \{[^}]*border-top: var\(--stroke-4\) solid var\(--accent\);[^}]*background: var\(--panel\);[^}]*backdrop-filter: var\(--glass-blur\);/);
  });
});
