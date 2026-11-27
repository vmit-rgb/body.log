import type { FilterGroup, FilterKey, HistoryFilter } from '../domain/journal';
import { plural } from '../domain/numbers';
import { layer } from '../ui/dialog';
import { esc } from '../ui/html';
import { iconSvg } from '../ui/icons';
import { EASE, MS, play } from '../ui/motion';
import { t } from '../i18n/lang';

/*
 * Filters in «історія» (FIXES-1.3 item 15, Olesia 2026-11-27): «як у
 * магазинах», a panel from the right over ¾ of the screen. Checkboxes in
 * the groups of the settings, several at once; nothing changes under the
 * panel until «показати N днів». × at the top right, the dark side, Escape
 * and the phone's «назад» close it without applying; «скинути» clears the
 * ticks in the panel.
 */

export interface FilterSpec {
  readonly groups: readonly FilterGroup[];
  /** The filter applied now: its ticks are on when the panel opens. */
  readonly chosen: HistoryFilter;
  /** How many days of the month open would be shown with these ticks. */
  count(filter: HistoryFilter): number;
}

const DAYS = ['день', 'дні', 'днів'] as const;

/** «показати 12 днів» */
export function showLabel(n: number): string {
  return `${t('показати')} ${n} ${plural(n, DAYS)}`;
}

/** The round button under the calendar: the funnel, and how many ticks when a filter is on. */
export function filterButton(filter: HistoryFilter): string {
  const n = filter.size;
  const label = n ? t('фільтри, вибрано {n}').replace('{n}', String(n)) : t('фільтри');
  return `
    <div class="history__filter">
      <button type="button" class="ctl icon-btn icon-btn--primary filter-btn" data-filter="open" aria-haspopup="dialog" aria-label="${esc(label)}">${iconSvg('filter')}${
  n ? `<span class="filter-btn__count t-3rd-bold" aria-hidden="true">${n}</span>` : ''}</button>
      ${n ? `<button type="button" class="ctl btn btn--tertiary" data-filter="reset">${t('скинути фільтр')}</button>` : ''}
    </div>`;
}

const box = ({ key, label }: { key: FilterKey; label: string }, on: boolean) => `
          <label class="ctl checkbox filter-sheet__item"><input class="checkbox__input" type="checkbox" data-key="${esc(key)}"${on ? ' checked' : ''} /><span class="checkbox__box" aria-hidden="true"></span><span class="checkbox__label">${esc(label)}</span></label>`;

/** The filter chosen, or null when the panel was closed without «показати». */
export function openFilter(spec: FilterSpec): Promise<HistoryFilter | null> {
  let answer: (value: HistoryFilter | null) => void = () => {};
  const { root, dissolve } = layer(`
    <div class="filter-sheet" role="dialog" aria-modal="true" aria-labelledby="filter-title">
      <div class="filter-sheet__scrim" data-filter="close"></div>
      <div class="filter-sheet__panel">
        <div class="filter-sheet__head">
          <h2 class="t-h5" id="filter-title">${t('фільтри')}</h2>
          <button type="button" class="ctl icon-btn icon-btn--secondary" data-filter="close" aria-label="${t('закрити')}">${iconSvg('close')}</button>
        </div>
        <div class="filter-sheet__groups">${spec.groups.map((group) => `
          <fieldset class="filter-sheet__group">
            <legend class="filter-sheet__legend t-h6">${esc(group.title)}</legend>${group.items.map((item) => box(item, spec.chosen.has(item.key))).join('')}
          </fieldset>`).join('')}
        </div>
        <div class="filter-sheet__actions">
          <button type="button" class="ctl btn btn--tertiary" data-filter="clear">${t('скинути')}</button>
          <button type="button" class="ctl btn btn--primary filter-sheet__show" data-filter="apply"></button>
        </div>
      </div>
    </div>`, () => answer(null));
  const boxes = [...root.querySelectorAll<HTMLInputElement>('.checkbox__input')];
  const ticked = (): HistoryFilter => new Set(boxes.filter((b) => b.checked).map((b) => b.dataset.key as FilterKey));
  const show = root.querySelector<HTMLButtonElement>('.filter-sheet__show')!;
  const recount = () => {
    show.textContent = showLabel(spec.count(ticked()));
  };
  recount();
  (boxes[0] ?? root.querySelector<HTMLElement>('[data-filter="close"].ctl'))?.focus();
  // comes in from the right edge; with «зменшити рух» it is just there
  play(root.querySelector('.filter-sheet__panel'), [{ transform: 'translateX(100%)' }, { transform: 'none' }], { duration: MS.m, easing: EASE.out });
  play(root.querySelector('.filter-sheet__scrim'), [{ opacity: 0 }, { opacity: 1 }], { duration: MS.m, easing: EASE.out });
  return new Promise((resolve) => {
    let answered = false;
    answer = (value) => {
      if (answered) return;
      answered = true;
      dissolve();
      resolve(value);
    };
    root.addEventListener('change', recount);
    root.addEventListener('click', (event) => {
      const action = (event.target as Element).closest<HTMLElement>('[data-filter]')?.dataset.filter;
      if (action === 'close') answer(null);
      else if (action === 'apply') answer(ticked());
      else if (action === 'clear') {
        for (const b of boxes) b.checked = false;
        recount();
        boxes[0]?.focus();
      }
    });
  });
}
