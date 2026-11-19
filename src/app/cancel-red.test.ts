import { describe, expect, it } from 'vitest';
import sections from '../home/sections.ts?raw';
import calendar from '../home/calendar.ts?raw';
import dialog from '../ui/dialog.ts?raw';
import toast from '../ui/toast.ts?raw';
import settingsSections from '../screens/settings-sections.ts?raw';
import pasteResult from '../screens/paste-result.ts?raw';
import components from '../styles/components.css?raw';

/*
 * «скасувати» is red (the error colour) everywhere it drops what was begun
 * (Olesia, 2026-11-19): pulse timer, «обрати період», the text field, the
 * paste preview, the ⋯ menu and the toast. In a delete dialog it stays the
 * safe, framed button next to the red «видалити».
 */
describe('red «скасувати»', () => {
  it('text buttons use the destructive look', () => {
    expect(sections).toContain('class="ctl btn btn--destructive" data-act="pulse-cancel"');
    expect(calendar).toContain('class="ctl btn btn--destructive" data-cal="period-cancel">скасувати');
    expect(dialog).toContain('class="ctl btn btn--destructive" data-answer="cancel">скасувати');
    expect(settingsSections).toContain("item.key === 'cancel' ? 'btn--destructive' : 'btn--tertiary'");
  });

  it('the framed one on the paste preview is red, frame and text', () => {
    expect(pasteResult).toContain("button('secondary', 'cancel', 'скасувати', ' btn--cancel')");
    expect(components).toMatch(/\.btn--secondary\.btn--cancel \{[^}]*--fg-0: var\(--err\);[^}]*--ring-0: var\(--err\);/);
  });

  it('the toast turns only «скасувати» red', () => {
    expect(toast).toContain("const cancels = next.action?.label === 'скасувати';");
    expect(toast).toContain("button.classList.toggle('btn--destructive', cancels);");
  });

  it('the delete dialog keeps «скасувати» framed, not red', () => {
    expect(dialog).toContain('class="ctl btn btn--secondary" data-answer="cancel">${esc(spec.cancel)}');
  });
});
