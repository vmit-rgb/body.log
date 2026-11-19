import { describe, expect, it } from 'vitest';
import { showWhatsNew } from './help';

describe('«що нового»', () => {
  it('puts the newest entry on top: the weekly goal checkbox of 19.11.2026 (Olesia chose draft B)', () => {
    const host = document.createElement('div');
    showWhatsNew(host, { menu: () => {}, search: () => {}, close: () => {} });
    const text = host.textContent!;
    expect(text).toContain('тижнева ціль: галочка «будь-яка активність зараховує день»');
    expect(text.indexOf('19.11.2026')).toBeGreaterThan(-1);
    expect(text.indexOf('19.11.2026')).toBeLessThan(text.indexOf('09.11.2026'));
  });
});
