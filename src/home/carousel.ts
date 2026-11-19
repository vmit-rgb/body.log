import type { DayKey } from '../domain/dates';
import type { Chart, TrackerCard } from '../domain/cards';
import { formatNumber, plural } from '../domain/numbers';
import { pickFromList } from '../ui/dialog';
import { esc } from '../ui/html';
import { iconSvg } from '../ui/icons';

/*
 * The carousel of averages (wave 9, Olesia 2026-11-18; layout from
 * WAVE-9-MOCKUP.html, style from the app): one filled block, a heading that
 * never changes, one card per question. Swipe or ‹ ›; between them the dots
 * show which card it is («3 / 14» when there are many). The underlined name
 * opens the list of questions. All cards are as tall as the tallest one.
 * The chart is drawn once its width is known (`mountCarousels`).
 */

/** Where each copy of the carousel is (home, the sheet, the history): the card it shows. */
export interface CarouselMemory { card: number }

/** Dots up to this many cards; «3 / 14» from there on. */
const MAX_PIPS = 7;

const WEEKDAYS = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const dayMonth = (key: DayKey) => `${key.slice(8)}.${key.slice(5, 7)}`;
const weekday = (key: DayKey) => WEEKDAYS[new Date(`${key}T12:00:00Z`).getUTCDay()]!;

/** «з 1 запису», «з 6 записів»: the genitive after «з». */
const records = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'запису' : 'записів');

/* ---- the chart ---- */

/** Line looks: a solid line and four dashes; the points take a shape each (● ▲ ■ ◆ ○). */
const DASHES = ['', '5 3', '1.5 3', '7 3 1.5 3', '3 2'];

function shape(i: number, x: number, y: number): string {
  const [a, b] = [x.toFixed(1), y.toFixed(1)];
  switch (i) {
    case 0: return `<circle class="chart__dot" cx="${a}" cy="${b}" r="3"/>`;
    case 1: return `<polygon class="chart__dot" points="${a},${(y - 3.6).toFixed(1)} ${(x + 3.4).toFixed(1)},${(y + 2.6).toFixed(1)} ${(x - 3.4).toFixed(1)},${(y + 2.6).toFixed(1)}"/>`;
    case 2: return `<rect class="chart__dot" x="${(x - 2.8).toFixed(1)}" y="${(y - 2.8).toFixed(1)}" width="5.6" height="5.6"/>`;
    case 3: return `<polygon class="chart__dot" points="${a},${(y - 3.8).toFixed(1)} ${(x + 3.8).toFixed(1)},${b} ${a},${(y + 3.8).toFixed(1)} ${(x - 3.8).toFixed(1)},${b}"/>`;
    default: return `<circle class="chart__dot chart__dot--open" cx="${a}" cy="${b}" r="2.8"/>`;
  }
}

const dash = (i: number) => (DASHES[i] ? ` stroke-dasharray="${DASHES[i]}"` : '');

interface ChartData {
  readonly min: number;
  readonly max: number;
  readonly lines: readonly (readonly (number | null)[])[];
  /** Under each point (≤ 7 points), or at both ends. */
  readonly x: readonly string[];
  readonly ends: boolean;
}

function chartData(chart: Chart): ChartData {
  const n = chart.starts.length;
  const ends = n > 7;
  const x = ends
    ? [dayMonth(chart.starts[0]!), `${chart.weekly ? 'по тижнях · ' : ''}${dayMonth(chart.end)}`]
    : chart.starts.map(weekday);
  return { min: chart.min, max: chart.max, lines: chart.lines.map((line) => line.points), x, ends };
}

/** The legend under the chart (Olesia, 2026-11-18): each line's look and its moment. */
function chartLegend(chart: Chart): string {
  return `<ul class="chart__legend t-3rd-regular" role="list">${chart.lines.map((line, i) => `
    <li><svg class="chart__key" viewBox="0 0 26 10" aria-hidden="true"><line class="chart__line" x1="1" x2="25" y1="5" y2="5"${dash(i)}/>${shape(i, 13, 5)}</svg>${esc(line.label)}</li>`).join('')}</ul>`;
}

function chartMarkup(chart: Chart): string {
  return `<div class="chart" data-chart="${esc(JSON.stringify(chartData(chart)))}" aria-hidden="true"></div>${chartLegend(chart)}`;
}

const HEIGHT = 132;

/** The chart in CSS pixels of its box, so lines, dashes and shapes keep their size on any phone. */
export function chartSvg(data: ChartData, width: number, textScale: number): string {
  const label = (v: number) => formatNumber(Math.round(v * 10) / 10);
  const ticks = [data.min, (data.min + data.max) / 2, data.max];
  const chars = Math.max(...ticks.map((v) => label(v).length));
  const font = 11 * textScale;
  const [top, bottom] = [8, HEIGHT - 8 - font * 1.4];
  const left = 6 + chars * font * 0.62;
  const right = width - 8;
  const n = data.lines[0]?.length ?? 0;
  const X = (i: number) => (n <= 1 ? (left + right) / 2 : left + (i * (right - left)) / (n - 1));
  const Y = (v: number) => bottom - ((v - data.min) / (data.max - data.min || 1)) * (bottom - top);
  let svg = `<svg class="chart__svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}">`;
  for (const v of ticks) {
    svg += `<line class="chart__grid" x1="${left}" x2="${right}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>`;
    svg += `<text class="chart__text" x="${left - 6}" y="${(Y(v) + font * 0.35).toFixed(1)}" text-anchor="end">${label(v)}</text>`;
  }
  data.lines.forEach((points, li) => {
    let d = '';
    let pen = false;
    points.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)} `;
      pen = true;
    });
    if (d) svg += `<path class="chart__line" d="${d.trim()}"${dash(li)}/>`;
    points.forEach((v, i) => {
      if (v !== null) svg += shape(li, X(i), Y(v));
    });
  });
  const base = HEIGHT - 4;
  if (data.ends) {
    svg += `<text class="chart__text" x="${left}" y="${base}">${esc(data.x[0]!)}</text>`;
    svg += `<text class="chart__text" x="${right}" y="${base}" text-anchor="end">${esc(data.x[1]!)}</text>`;
  } else {
    data.x.forEach((text, i) => {
      svg += `<text class="chart__text" x="${X(i).toFixed(1)}" y="${base}" text-anchor="middle">${esc(text)}</text>`;
    });
  }
  return `${svg}</svg>`;
}

/* ---- the cards ---- */

function body(card: TrackerCard): string {
  switch (card.kind) {
    case 'empty':
      return '<p class="avg-card__empty t-2nd-regular muted">записів немає</p>';
    case 'yesno':
      return `<ul class="avgs avgs--column" role="list">${card.rows.map((row) => `
        <li class="avg"><span class="avg__label t-3rd-semibold">${esc(row.label)}:</span> <b class="t-2nd-bold">так у ${row.yes} з ${row.total}</b> <span class="avg__label t-3rd-regular">${records(row.total)}</span></li>`).join('')}</ul>`;
    case 'pairs':
      return `<div class="avg-card__fill"><ul class="avg-card__list t-2nd-regular" role="list" tabindex="0" aria-label="записи: ${esc(card.name)}">${card.entries.map((entry) => `
        <li><span class="muted">${weekday(entry.date)} ${dayMonth(entry.date)} · ${esc(entry.label)}</span> <b class="t-2nd-bold">${formatNumber(entry.a) || '—'}/${formatNumber(entry.b) || '—'}</b></li>`).join('')}</ul></div>`;
    case 'averages':
      return `<ul class="avgs" role="list">${card.rows.map((row) => `
        <li class="avg"><span class="avg__label t-3rd-semibold">${esc(row.label)}</span> <b class="avg__value t-1st-bold">${row.value === null ? '—' : formatNumber(row.value)}</b></li>`).join('')}</ul>${
  card.chart ? chartMarkup(card.chart) : ''}`;
  }
}

function cardMarkup(card: TrackerCard, i: number, total: number): string {
  return `
      <article class="avg-card" aria-label="${i + 1} з ${total}: ${esc(card.name)}">
        <h4 class="avg-card__heading"><button type="button" class="ctl avg-card__title t-1st-semibold" data-car="list" aria-haspopup="dialog">${esc(card.name)}</button></h4>
        ${body(card)}
      </article>`;
}

function where(index: number, total: number): string {
  if (total > MAX_PIPS) return `<span class="carousel__count t-3rd-semibold">${index + 1} / ${total}</span>`;
  return Array.from({ length: total }, (_, i) => `<span class="carousel__pip"${i === index ? ' data-on' : ''}></span>`).join('');
}

/** The whole block; nothing when there are no questions to average. */
export function carouselMarkup(cards: readonly TrackerCard[], heading: string, id: string, index: number): string {
  if (cards.length === 0) return '';
  const at = Math.min(Math.max(index, 0), cards.length - 1);
  const nav = cards.length < 2 ? '' : `
      <div class="carousel__nav">
        <button type="button" class="ctl icon-btn icon-btn--secondary" data-car="by" data-by="-1" aria-label="попередня картка"${at === 0 ? ' disabled' : ''}>${iconSvg('chevron-left')}</button>
        <div class="carousel__where" aria-hidden="true">${where(at, cards.length)}</div>
        <button type="button" class="ctl icon-btn icon-btn--secondary" data-car="by" data-by="1" aria-label="наступна картка"${at === cards.length - 1 ? ' disabled' : ''}>${iconSvg('chevron-right')}</button>
      </div>`;
  return `
    <section class="carousel" aria-roledescription="карусель" aria-labelledby="${id}" data-card="${at}">
      <h3 class="t-h5" id="${id}">${esc(heading)}</h3>
      <div class="carousel__track">${cards.map((card, i) => cardMarkup(card, i, cards.length)).join('')}</div>${nav}
    </section>`;
}

/* ---- on the page ---- */

function textScale(): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--text-scale'));
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function drawCharts(root: ParentNode): void {
  const scale = textScale();
  for (const box of root.querySelectorAll<HTMLElement>('.chart[data-chart]')) {
    const width = Math.round(box.clientWidth) || 280;
    if (box.dataset.width === String(width) && box.firstElementChild) continue;
    box.dataset.width = String(width);
    box.innerHTML = chartSvg(JSON.parse(box.dataset.chart!) as ChartData, width, scale);
  }
}

function cardsOf(carousel: HTMLElement): HTMLElement[] {
  return [...carousel.querySelectorAll<HTMLElement>('.avg-card')];
}

/** Dots and arrows follow the card in view. */
function show(carousel: HTMLElement, index: number): void {
  const total = cardsOf(carousel).length;
  carousel.dataset.card = String(index);
  const place = carousel.querySelector<HTMLElement>('.carousel__where');
  if (place) place.innerHTML = where(index, total);
  const [back, next] = carousel.querySelectorAll<HTMLButtonElement>('[data-car="by"]');
  if (back) back.disabled = index === 0;
  if (next) next.disabled = index === total - 1;
}

function scrollTo(carousel: HTMLElement, index: number, smooth: boolean): void {
  const track = carousel.querySelector<HTMLElement>('.carousel__track')!;
  const left = index * track.clientWidth;
  if (typeof track.scrollTo === 'function') track.scrollTo({ left, behavior: smooth ? 'smooth' : 'instant' });
  else track.scrollLeft = left;
}

/**
 * After a carousel is drawn (again): the card it showed, the charts at
 * their width. Call it each time the block's HTML is replaced.
 */
export function mountCarousels(root: ParentNode, memory: CarouselMemory): void {
  for (const carousel of root.querySelectorAll<HTMLElement>('.carousel')) {
    const total = cardsOf(carousel).length;
    memory.card = Math.min(Math.max(memory.card, 0), total - 1);
    scrollTo(carousel, memory.card, false);
    show(carousel, memory.card);
  }
  drawCharts(root);
}

/**
 * Swipes, ‹ › and the list of questions, for every carousel `root` will
 * hold (it is drawn anew often, so the listeners sit on `root`).
 */
export function wireCarousels(root: HTMLElement, memory: CarouselMemory, signal: AbortSignal): void {
  let settle: ReturnType<typeof setTimeout> | undefined;
  root.addEventListener('scroll', (event) => {
    const track = event.target as HTMLElement;
    if (!(track instanceof HTMLElement) || !track.classList.contains('carousel__track')) return;
    clearTimeout(settle);
    settle = setTimeout(() => {
      const index = Math.round(track.scrollLeft / (track.clientWidth || 1));
      const carousel = track.closest<HTMLElement>('.carousel')!;
      if (String(index) === carousel.dataset.card) return;
      memory.card = index;
      show(carousel, index);
    }, 80);
  }, { capture: true, passive: true, signal });

  root.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-car]');
    const carousel = button?.closest<HTMLElement>('.carousel');
    if (!button || !carousel) return;
    const cards = cardsOf(carousel);
    const go = (index: number) => {
      memory.card = Math.min(Math.max(index, 0), cards.length - 1);
      scrollTo(carousel, memory.card, true);
      show(carousel, memory.card);
    };
    if (button.dataset.car === 'by') {
      go(memory.card + Number(button.dataset.by));
      return;
    }
    // the name opens the list of questions; a name picked shows its card
    const names = cards.map((card) => card.querySelector('.avg-card__title')!.textContent ?? '');
    void pickFromList({ title: 'самопочуття', items: names, current: memory.card }).then((picked) => {
      if (picked === null) return;
      go(picked);
      cards[picked]?.querySelector<HTMLElement>('.avg-card__title')?.focus({ preventScroll: true });
    });
  }, { signal });

  if (typeof ResizeObserver === 'function') {
    const watch = new ResizeObserver(() => mountCarousels(root, memory));
    watch.observe(root);
    signal.addEventListener('abort', () => watch.disconnect());
  }
}

/** For «за 18 днів». */
export const daysCount = (n: number) => `${n} ${plural(n, ['день', 'дні', 'днів'])}`;
