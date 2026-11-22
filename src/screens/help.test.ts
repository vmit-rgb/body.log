import { describe, expect, it } from 'vitest';
import { showWhatsNew } from './help';
import { emptyMonth } from './history';
import type { DayKey } from '../domain/dates';
import type { MonthKey } from '../domain/stats';

describe('«що нового»', () => {
  it('has beta 1.0.1 on top of beta 1.0; the 0.x entries were deleted (copy fix A9, Olesia, 2026-11-21)', () => {
    const host = document.createElement('div');
    showWhatsNew(host, { menu: () => {}, search: () => {}, close: () => {} });
    const text = host.textContent!;
    const entries = [...host.querySelectorAll('.news__entry')];
    expect(entries).toHaveLength(2);
    expect(entries[0]!.querySelector('h2')!.textContent).toContain('бета 1.0.1 · 22.11.2026');
    expect(entries[0]!.querySelectorAll('.news__changes li')).toHaveLength(3);
    expect(entries[0]!.textContent).toContain('кнопка «встановити» на андроїді.');
    expect(entries[1]!.querySelector('h2')!.textContent).toContain('бета 1.0 · 21.11.2026');
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
