import { esc } from '../ui/html';
import { iconSvg, type IconName } from '../ui/icons';
import { t } from '../i18n/lang';

/* Small pieces of the settings page, shared by its parts. */

/** Small text under a checkbox's name: its id for aria-describedby, and the text (HTML). */
export interface CheckHint { readonly id: string; readonly text: string }

/**
 * A checkbox; `hints` stand under its name inside the label, so they follow
 * a name of any length (Olesia's Pixel, 2026-11-23: a name on two lines ran
 * over the hint that was pulled up to one line). Hidden from the name, they
 * are its description.
 */
export function checkbox(label: string, checked: boolean, data: string, disabled = false, hints: readonly CheckHint[] = []): string {
  const described = hints.length ? ` aria-describedby="${hints.map((hint) => hint.id).join(' ')}"` : '';
  const under = hints.map((hint) => `<span class="checkbox__hint t-2nd-regular muted" id="${hint.id}" aria-hidden="true">${hint.text}</span>`).join('');
  const name = `<span class="checkbox__label t-1st-semibold">${label}</span>`;
  return `
    <label class="ctl checkbox${hints.length ? ' checkbox--hinted' : ''}"><input class="checkbox__input" type="checkbox" ${data}${described}${checked ? ' checked' : ''}${disabled ? ' disabled' : ''} /><span class="checkbox__box" aria-hidden="true"></span>
      ${hints.length ? `<span class="checkbox__text">${name}${under}</span>` : name}</label>`;
}

export const act = (name: string, extra = '') => `data-act="${name}"${extra ? ` ${extra}` : ''}`;
export const tertiary = (label: string, data: string) => `<button type="button" class="ctl btn btn--tertiary" ${data}>${label}</button>`;
export const secondary = (label: string, data: string) => `<button type="button" class="ctl btn btn--secondary st-wide" ${data}>${label}</button>`;
export const destructive = (label: string, data: string) => `<button type="button" class="ctl btn btn--destructive" ${data}>${label}</button>`;

export function iconButton(icon: IconName, label: string, data: string, disabled = false): string {
  return `<button type="button" class="ctl icon-btn icon-btn--secondary" ${data} aria-label="${esc(label)}"${disabled ? ' disabled' : ''}>${iconSvg(icon)}</button>`;
}

export interface DaysSpec {
  readonly label: string;
  readonly value: number;
  /** `data-act` of − and +, and `data-input` of the slider. */
  readonly name: string;
  /** More data attributes for all three, e.g. `data-kind="workout"`. */
  readonly data?: string;
  /** Said after «менше» / «більше» for screen readers. */
  readonly spoken: string;
}

/** Days per week, 0–7: the value, − slider + (Figma group/weekly-goal). */
export function daysSlider({ label, value, name, data = '', spoken }: DaysSpec): string {
  const extra = data ? ` ${data}` : '';
  const step = (delta: number, word: string, icon: IconName, off: boolean) =>
    iconButton(icon, `${word}: ${spoken}`, `${act(name, `data-delta="${delta}"${extra}`)}`, off);
  return `
        <div class="st-days">
          <div class="st-days__head"><span class="t-1st-semibold">${label}</span><span class="st-days__value t-3rd-semibold" aria-live="polite">${value}/7</span></div>
          <div class="slider-row">${step(-1, t('менше'), 'remove', value <= 0)}
            <input type="range" class="slider" min="0" max="7" step="1" value="${value}" aria-label="${esc(spoken)}" aria-valuetext="${value} ${t('з 7')}" data-input="${name}"${extra} />${
  step(1, t('більше'), 'add', value >= 7)}
          </div>
          <div class="st-days__ticks t-3rd-regular" aria-hidden="true">${Array.from({ length: 8 }, (_, n) => `<span${n === value ? ' class="on"' : ''}>${n}</span>`).join('')}</div>
        </div>`;
}
