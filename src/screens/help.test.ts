import { describe, expect, it } from 'vitest';
import { showWhatsNew } from './help';
import { emptyMonth } from './history';
import type { DayKey } from '../domain/dates';
import type { MonthKey } from '../domain/stats';

describe('«що нового»', () => {
  it('has only the beta 1.0 entry: the old ones were deleted (copy fix A9, Olesia, 2026-11-21)', () => {
    const host = document.createElement('div');
    showWhatsNew(host, { menu: () => {}, search: () => {}, close: () => {} });
    const text = host.textContent!;
    expect(host.querySelectorAll('.news__entry')).toHaveLength(1);
    expect(host.querySelectorAll('.news__changes li')).toHaveLength(3);
    expect(text).toContain('бета 1.0');
    expect(text).not.toContain('бета 0.9');
    expect(text).toContain('але це все ще бета: щось може зламатися.');
  });
});

describe('a month without entries (copy fix A5)', () => {
  it('this month has days ahead, a past one is just a month, named as on the cards', () => {
    const empty = (month: string) => emptyMonth(month as MonthKey, '2026-11-21' as DayKey);
    expect(empty('2026-11')).toBe('цього місяця записів ще немає. зате попереду купа днів :3');
    expect(empty('2026-10')).toBe('за жовтень записів немає. пропущений місяць — просто місяць :)');
    expect(empty('2025-12')).toBe('за грудень 2025 записів немає. пропущений місяць — просто місяць :)');
  });
});
