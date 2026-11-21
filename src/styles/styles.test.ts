import { describe, expect, it } from 'vitest';
import main from '../main.ts?raw';
import calendar from './calendar.css?raw';
import base from './base.css?raw';
import components from './components.css?raw';
import index from '../../index.html?raw';
import history from './history.css?raw';
import settings from './settings.css?raw';
import home from './home.css?raw';
import sections from './sections.css?raw';
import tokens from './tokens.css?raw';
import typography from './typography.css?raw';
import motion from './motion.css?raw';
import menu from './menu.css?raw';
import screens from './screens.css?raw';

// The cascade can't be seen in jsdom, so these read the stylesheets as text (comments stripped).
const FILES: Record<string, string> = { './base.css': base, '../main.ts': main, './calendar.css': calendar, './components.css': components, './history.css': history, './settings.css': settings, './home.css': home, './sections.css': sections, './tokens.css': tokens, './typography.css': typography, './motion.css': motion, './menu.css': menu, './screens.css': screens };
const read = (file: string) => FILES[file]!.replace(/\/\*[\s\S]*?\*\//g, '');
const block = (css: string, selector: string) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? undefined : css.slice(at, css.indexOf('}', at));
};

describe('stylesheets', () => {
  it('load the text styles last, so a later font rule can’t beat a t-* class', () => {
    const imports = [...read('../main.ts').matchAll(/import '\.\/styles\/([\w-]+\.css)'/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(5);
    expect(imports.at(-1)).toBe('typography.css');
  });

  it('let a control with a text style keep its own weight for hover and pressed', () => {
    const css = read('./typography.css');
    for (const [style, weight] of [['t-h5', 500], ['t-1st-semibold', 600], ['t-3rd-regular', 420], ['t-2nd-bold', 720]] as const)
      expect(css).toMatch(new RegExp(`\\.${style}[^{]*\\{[^}]*--weight-0: ${weight};`));
    const rule = /\.ctl:is\(([^)]*)\) \{ font-weight: var\(--weight\); \}/.exec(css);
    expect(rule![1]!.split(', ')).toHaveLength(15);
  });

  it('keep the heading margin reset weaker than any class', () => {
    expect(read('./typography.css')).toMatch(/:where\(\.t-h1, \.t-h2, \.t-h3, \.t-h4, \.t-h5, \.t-h6\) \{ margin: 0; \}/);
  });

  it('let the bar row up when the date doesn’t fit, whatever the reason (C-01; larger text since 2026-11-11)', () => {
    const home = read('./home.css');
    expect(block(home, '.bar[data-fit]')).toMatch(/grid-template-areas: 'menu goal' 'nav nav';/);
    expect(block(home, ".bar[data-fit='2'] .date-nav")).toMatch(/grid-template-areas: 'date date' 'prev next';/);
    expect(block(home, ".bar[data-fit='2'] .date-nav__date")).toContain('white-space: normal;');
    expect(block(home, '.bar')).toContain('column-gap: var(--gap-items);');
    // no fixed guess for larger text: the bar's height is measured (ui/bar-fit.ts)
    expect(read('./tokens.css')).not.toContain('calc(83px + var(--tap))');
    expect(home).not.toContain('data-larger-text');
    // what sits above the bar follows its height
    expect(read('./components.css')).toContain('bottom: calc(var(--bar-h) + max(8px, env(safe-area-inset-bottom)));');
    expect(home).toContain('bottom: calc(var(--bar-h) + 16px + env(safe-area-inset-bottom));');
  });

  it('show each field’s own Figma focus after a tap as after a key (Olesia, 2026-11-11, Н3)', () => {
    const css = read('./components.css');
    expect(css).not.toContain('data-modality');
    // number: accent brackets and line 2 px at 900, no frame; the unit doesn't light up (wave 7a)
    expect(block(css, '.number:focus-within')).toMatch(/--part: var\(--accent\);[^}]*--part-weight: 900;[^}]*--num-line: var\(--accent\);[^}]*--num-line-w: var\(--stroke-focus\);/);
    expect(block(css, '.number:focus-within')).not.toMatch(/--unit/);
    expect(block(css, '.number:focus-within')).not.toContain('box-shadow');
    // text: the ring
    expect(block(css, '.field:focus')).toContain('box-shadow: var(--focus-ring);');
  });

  it('draw the number field as input/base: line after the digits, unit inside, hover and error as Figma (п. 5)', () => {
    const css = read('./components.css');
    expect(block(css, '.number__input')).toMatch(/background-position: calc\(min\(var\(--len, 0\), var\(--chars\)\) \* 1ch\) 100%;/);
    expect(block(css, '.number__input')).toMatch(/width: calc\(var\(--chars\) \* 1ch\);/);
    expect(block(css, '.number')).not.toMatch(/\bwidth: 180px/);
    expect(css).toMatch(/\.number:hover \{[^}]*--part: var\(--accent\);[^}]*--part-weight: 700;/);
    expect(css).not.toMatch(/\.number:hover \{[^}]*--unit/);
    expect(css).not.toMatch(/\.number:hover \{[^}]*--num-line: var\(--accent\)/);
    // an error keeps the unit muted
    expect(block(css, ".number:has([aria-invalid='true'])")).not.toContain('--unit');
  });

  it('give the checkbox Figma’s hover and focus: accent 720 / 900, no frame (п. 5а)', () => {
    const css = read('./components.css');
    expect(block(css, '.checkbox')).toMatch(/--fg-hover: var\(--accent\);[^}]*--weight-hover: 720;/);
    expect(css).not.toContain('.checkbox__input:focus-visible + .checkbox__box');
    expect(block(css, '.checkbox:has(.checkbox__input:focus-visible)')).toMatch(/--fg-0: var\(--accent\);[^}]*--weight-0: 900;/);
  });

  it('make every control at least --tap wide and high (Н9, ACCESSIBILITY.md rule 1)', () => {
    expect(block(read('./components.css'), '.ctl')).toMatch(/min-width: var\(--tap\);[^}]*min-height: var\(--tap\);/);
    // no smaller fixed sizes on a tap target
    expect(block(read('./settings.css'), '.st-text--link')).not.toMatch(/min-height/);
    expect(read('./history.css')).not.toMatch(/min-(height|width): (32|44)px/);
    expect(block(read('./history.css'), '.search__input')).toContain('min-height: var(--tap);');
    // the day of the month is a target too
    expect(block(read('./calendar.css'), '.cal-day')).toContain('min-height: var(--tap);');
    expect(read('./calendar.css')).toMatch(/grid-template-columns: repeat\(7, minmax\(var\(--tap\), 1fr\)\);/);
  });

  it('draw home as Figma: stat cards, sheet, saved slider, past-day date, left buttons (п. 14, 19–22, Н6)', () => {
    const calendar = read('./calendar.css');
    // 4 cards go 2 × 2 (Olesia, 2026-11-11); number and «з N днів» on one line
    expect(calendar).toMatch(/\.stats:has\(> :nth-child\(4\)\) \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    expect(block(calendar, '.stat__value')).toContain('align-items: baseline;');
    expect(block(calendar, '.cal-sheet__panel')).not.toContain('border-top');
    const sections = read('./sections.css');
    expect(sections).toMatch(/\.slider:disabled::-webkit-slider-thumb \{[^}]*width: 8px;[^}]*background: var\(--disabled\);/);
    expect(block(sections, '.wo-drop')).toContain('align-items: flex-start;');
    expect(sections).toMatch(/\.acc-body--group > \.btn--tertiary \{[^}]*align-self: flex-start;/);
    expect(read('./home.css')).toMatch(/\.hero__text--past b \{[^}]*font-weight: 700;/);
    expect(block(read('./components.css'), '.unit')).toMatch(/color: var\(--muted\);[^}]*font-size: calc\(12px \* var\(--text-scale\)\);/);
  });

  it('draw the history, search, tabs and the full-screen field as Figma (п. 6, 7, 23, 24, 26, Н10)', () => {
    const history = read('./history.css');
    expect(block(history, '.history__days')).toContain('gap: 0;');
    expect(history).toMatch(/\.day-card \+ \.day-card \{[^}]*border-top: 0;/);
    expect(block(read('./calendar.css'), '.avgs--column')).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(block(history, '.value-row')).toContain('display: block;');
    expect(block(history, ".bar__search[aria-pressed='true']")).not.toContain('background');
    expect(block(history, '.search')).toContain('bottom: calc(var(--bar-h) + 8px + env(safe-area-inset-bottom));');
    const components = read('./components.css');
    // the tab you can switch to is underlined; the chosen one is not (Olesia, В 35)
    expect(components).toMatch(/\.tab:is\(\[aria-selected='true'\], \[aria-pressed='true'\]\) \{[^}]*text-decoration: none;/);
    // a pressed level keeps a 1 px muted frame (accordion/trigger group pressed)
    expect(block(components, '.accordion--group')).toContain('--ring-w-pressed: var(--stroke-3);');
    expect(block(components, '.ctl:active')).toContain('--ring-w: var(--ring-w-pressed, var(--ring-w-0, 0px));');
    expect(block(read('./settings.css'), '.text-edit')).toContain('background: var(--bg);');
  });

  it('colours the full-screen text edit from the theme, so it reads on the light background too', () => {
    const css = read('./settings.css');
    expect(block(css, '.text-edit__input')).toContain('color: var(--ink);');
    expect(block(css, '.text-edit__actions .btn--secondary')).toContain('color: var(--ink);');
    expect(css).not.toMatch(/\.text-edit[^{]*\{[^}]*color: #e9e9e9/);
  });

  it('drop the browser’s button padding and keep 8 px inside the settings boxes (п. 27, 32)', () => {
    expect(block(read('./components.css'), '.ctl')).toContain('padding: 0;');
    expect(read('./settings.css')).toMatch(/\.st-item\.st-box \{[^}]*padding: 4px 8px 8px;/);
  });

  it('draw the noise as overlay/noise: light grain SCREEN and dark grain MULTIPLY, 25 % each (Н11)', () => {
    const base = read('./base.css');
    expect(block(base, '.noise')).toMatch(/opacity: 0.25;[^}]*mix-blend-mode: screen;/);
    expect(block(base, '.noise--dark')).toContain('mix-blend-mode: multiply;');
    expect(index.match(/class="noise[^"]*"/g)).toEqual(['class="noise"', 'class="noise noise--dark"']);
  });

  it('draw × for removing in the accent colour, not the error colour (Н4)', () => {
    const css = read('./sections.css');
    expect(block(css, '.rm')).toBeUndefined();
    expect(css).not.toMatch(/\.rm[^{]*\{[^}]*--err/);
  });

  it('drop the hover pill while a text button is pressed (Н12)', () => {
    const css = read('./components.css');
    expect(css).toMatch(/\.btn--tertiary:not\(:disabled, \[aria-disabled='true'\], :active\):hover::after/);
    expect(css).toMatch(/\.btn--destructive:not\(:disabled, \[aria-disabled='true'\], :active\):hover::after/);
  });

  it('time every CSS motion on the scale 120 / 240 / 360 / 420 / 720 / 1200 ms (MICROINTERACTIONS.md)', () => {
    const all = Object.keys(FILES).filter((file) => file.endsWith('.css')).map(read).join('\n');
    // a delay is a step of the stagger (40 ms), not a duration (MICROINTERACTIONS.md, general rules)
    const delay = /animation-delay:\s*-?(\d+)ms/g;
    const delays = [...all.matchAll(delay)].map((m) => Number(m[1]));
    const durations = [...all.replace(delay, '').matchAll(/(\d+)ms/g)].map((m) => Number(m[1]));
    expect(durations.length).toBeGreaterThan(3);
    expect(durations.filter((ms) => ![120, 240, 360, 420, 720, 1200].includes(ms))).toEqual([]);
    expect(delays.length).toBeGreaterThan(0);
    expect(delays.filter((ms) => ms % 40 !== 0)).toEqual([]);
  });

  it('press as MICROINTERACTIONS.md: 0.97, icons 0.86, text 1 px down, rows 3 px right, day 0.88', () => {
    const css = read('./motion.css');
    expect(css).toMatch(/:is\(\.btn--primary, \.btn--secondary, \.tab, \.chip\):active \{ transform: scale\(0\.97\); \}/);
    expect(css).toMatch(/\.icon-btn:active \.icon \{ transform: scale\(0\.86\); \}/);
    expect(css).toMatch(/:is\(\.btn--tertiary, \.btn--destructive\):active \{ transform: translateY\(1px\); text-decoration-thickness: 2px; \}/);
    expect(css).toMatch(/:is\(\.checkbox, \.accordion--mini\):active \{ transform: translateX\(3px\); \}/);
    expect(css).toMatch(/\.cal-day:active \{ transform: scale\(0\.88\); \}/);
    // only when motion is allowed
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*:root:not\(\[data-no-motion\]\) \.ctl/);
  });

  it('draw the glyph frames over the usual look, so nothing shifts (checkbox, + → −, ✓)', () => {
    const css = read('./motion.css');
    expect(css).toMatch(/\.checkbox__box\[data-g\]::before \{ content: attr\(data-g\); \}/);
    expect(css).toMatch(/:is\(\.accordion__icon, \.toast__check\)\[data-g\] \.icon \{ visibility: hidden; \}/);
  });

  it('melt the bar of a 4 s toast only when motion is allowed, and stop it while the toast is held', () => {
    const css = read('./components.css');
    const moving = css.slice(css.indexOf('.toast__life[hidden]'));
    expect(moving).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*:root:not\(\[data-no-motion\]\) \.toast__life \{\s*animation: toast-life 4s linear forwards;/);
    // the pause must be as specific as the rule that starts the animation, or it never applies (seen in the browser)
    expect(moving).toMatch(/:root:not\(\[data-no-motion\]\) \.toast--held \.toast__life \{\s*animation-play-state: paused;/);
    expect(block(css, '.toast__life')).not.toContain('animation');
  });

  it('draw × (and its ✓) in the sections at 16 px, tap zone untouched (Olesia, 2026-11-12)', () => {
    const rule = block(read('./sections.css'), '.rm .icon');
    expect(rule).toContain('width: 16px;');
    expect(rule).toContain('height: 16px;');
    expect(rule).not.toMatch(/min-|padding|margin/);
  });

  it('load the motion styles before the text styles', () => {
    const imports = [...read('../main.ts').matchAll(/import '\.\/styles\/([\w-]+\.css)'/g)].map((m) => m[1]);
    expect(imports.at(-2)).toBe('motion.css');
  });

  describe('wave 4: overflow and fields (Olesia, MY-FIXES)', () => {
    it('reserve 6 characters in a one-line field, 9 in the movement section, in ch so larger text widens them', () => {
      const css = read('./components.css');
      expect(block(css, '.number')).toContain('--chars: 6;');
      expect(css).not.toContain('.number--pair {');
      expect(block(css, '.number__input')).not.toContain('--len, 0) + 1');
      expect(block(read('./sections.css'), '#sec-mv .number')).toContain('--chars: 9;');
      expect(read('./sections.css')).not.toMatch(/^\.set-row__fields \.number \{|\.lap \.number \{/m);
    });

    it('wave 7a: кг × повтори fit one row from 360 px, two characters narrower', () => {
      expect(block(read('./sections.css'), '#sec-wo .set-row__fields .number')).toContain('--chars: 4;');
    });

    it('break a word that is longer than its line (C-03)', () => {
      expect(block(read('./base.css'), 'body')).toContain('overflow-wrap: break-word;');
      expect(read('./history.css')).toMatch(/\.value-row__label,\s*\.value-row__value \{\s*overflow-wrap: anywhere;/);
      expect(block(read('./settings.css'), '.st-text')).toContain('overflow-wrap: anywhere;');
    });

    it('keep the menu buttons inside the screen (C-04)', () => {
      const css = read('./menu.css');
      expect(block(css, '.menu__group')).toContain('padding: 0 var(--pad-screen-x);');
      expect(block(css, '.menu__group')).not.toContain('overflow-x');
      expect(block(css, '.menu__help')).not.toContain('100% + 4px');
    });

    it('put 8 px between neighbouring targets (C-12); inside one entry 4 px (Olesia, 2026-11-21)', () => {
      const css = read('./settings.css');
      for (const selector of ['.swatches', '.st-backup', '.st-box', '.st-list']) expect(block(css, selector)).toContain('gap: var(--gap-items);');
      expect(block(css, '.st-item')).toContain('gap: var(--gap-micro);');
      expect(css).toMatch(/\.st-pair,\s*\.st-asks,\s*\.st-fields \{[^}]*gap: var\(--gap-micro\);/);
      expect(block(read('./screens.css'), '.segmented')).toContain('gap: var(--gap-items);');
    });

    it('make the bottom of a section 1.5× its top', () => {
      expect(block(read('./home.css'), '.home-section__body')).toContain('padding: var(--gap-section) var(--pad-screen-x) calc(var(--gap-section) * 1.5);');
      expect(block(read('./settings.css'), '.st-part__body')).toContain('padding: 0 16px 12px;');
      expect(block(read('./sections.css'), '.zone')).toContain('padding: var(--gap-items) var(--gap-items) 12px;');
    });

    it('put every «додати …» on the right, at home too', () => {
      expect(block(read('./sections.css'), '.wo-ex__actions > .btn')).toContain('align-self: flex-end;');
    });

    it('keep text on the axis of its title: no bare indents', () => {
      const sections = read('./sections.css');
      expect(block(sections, '.wo-ex__sub')).not.toContain('padding-left');
      expect(sections).toMatch(/\.acc-body--paragraph,\s*\.acc-body--mini \{\s*padding: var\(--gap-items\) 0 0 4px;/);
      expect(block(sections, '.sub > .accordion--group')).toContain('padding-left: var(--gap-items);');
      const settings = read('./settings.css');
      expect(settings).not.toContain('.st-box__body .st-list > .st-item:not(.st-box)');
      expect(settings).not.toMatch(/\.st-asks,\s*\.st-fields \{\s*padding-left/);
    });

    it('size the text overlay to what is seen, buttons at the top, 14 px for long text', () => {
      const css = read('./settings.css');
      expect(block(css, '.text-edit__actions')).toContain('flex: none;');
      expect(block(css, '.text-edit--long .text-edit__input')).toContain('font-size: calc(14px * var(--text-scale));');
      expect(block(css, '.text-edit--long .text-edit__input')).toContain('overflow-y: auto;');
    });
  });
});

describe('wave 5: sections (Olesia, MY-FIXES)', () => {
  it('fills every exercise box and only outlines a group, at home and in the settings', () => {
    const home = read('./sections.css');
    expect(block(home, '.wo-ex')).toBeDefined();
    expect(home).toMatch(/\.wo-ex \{[^}]*background: var\(--surface\);/);
    expect(block(home, '.wo-group')).toContain('border: var(--stroke-1) solid var(--accent-mid);');
    expect(block(home, '.wo-group')).not.toContain('background');
    const settings = read('./settings.css');
    expect(settings).toMatch(/\.st-item\.st-ex,\s*\.st-item\.st-mv \{[^}]*background: var\(--surface\);/);
    expect(block(settings, '.st-item.st-group')).toContain('border: var(--stroke-1) solid var(--accent-mid);');
    expect(block(settings, '.st-item.st-group')).not.toContain('background');
  });

  it('frames an open settings part round its trigger and its body; the daytime «як робити» is filled as a whole', () => {
    const settings = read('./settings.css');
    expect(block(settings, ".st-part:has(> .st-part__heading [aria-expanded='true'])")).toContain('outline: var(--stroke-1) solid var(--accent-mid);');
    expect(block(read('./sections.css'), '.how-acc--filled')).toContain('background: var(--surface);');
    expect(block(read('./sections.css'), '.zone')).not.toContain('background');
  });

  it('shows ⋯ as a visible target, the <3 in the accent, «згорнути секцію» on the right', () => {
    const settings = read('./settings.css');
    expect(block(settings, '.st-actions')).toContain('position: absolute;');
    expect(block(settings, '.st-actions')).not.toContain('clip-path');
    expect(block(read('./components.css'), '.emoticon')).toContain('color: var(--accent);');
    expect(block(read('./sections.css'), '.home-section__end')).toContain('justify-content: flex-end;');
  });
});
