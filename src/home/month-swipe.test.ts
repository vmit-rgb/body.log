import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wireMonthSwipe, type TurnMonth } from './month-swipe';

// A calendar block reduced to what the swipe touches.
const BLOCK = (last: boolean) => `
  <section class="cal-block">
    <h3 class="cal__month">листопад</h3>
    <div class="cal__scroll"><div class="cal__grid"><button type="button" data-cal="day" data-day="2026-11-03">3</button></div></div>
    <button type="button" data-cal="month" data-by="1"${last ? ' disabled' : ''}>›</button>
  </section>`;

let root: HTMLElement;
let turn: ReturnType<typeof vi.fn<TurnMonth>>;
let controller: AbortController;

function mount(last = false): void {
  controller?.abort();
  document.documentElement.removeAttribute('data-larger-targets');
  document.body.innerHTML = `<div id="root">${BLOCK(last)}</div>`;
  root = document.querySelector<HTMLElement>('#root')!;
  Object.defineProperty(root.querySelector('.cal__grid')!, 'offsetWidth', { value: 320 });
  turn = vi.fn<TurnMonth>((block) => block);
  controller = new AbortController();
  wireMonthSwipe(root, turn, controller.signal);
}

const day = () => root.querySelector<HTMLElement>('[data-cal="day"]')!;

function swipe(dx: number, dy = 0, options: { type?: string; pointerType?: string; ms?: number } = {}): void {
  const base = { bubbles: true, pointerId: 1, isPrimary: true, pointerType: options.pointerType ?? 'touch' };
  const at = (x: number, y: number, type: string, timeStamp: number) => {
    const event = new PointerEvent(type, { ...base, clientX: x, clientY: y });
    Object.defineProperty(event, 'timeStamp', { value: timeStamp });
    day().dispatchEvent(event);
  };
  at(100, 100, 'pointerdown', 0);
  at(100 + dx / 2, 100 + dy / 2, 'pointermove', 100);
  at(100 + dx, 100 + dy, 'pointermove', 200);
  at(100 + dx, 100 + dy, options.type ?? 'pointerup', options.ms ?? 600);
}

describe('the swipe on the calendar', () => {
  beforeEach(() => mount());

  it('left past a quarter turns to the next month, right to the previous', () => {
    swipe(-120);
    expect(turn).toHaveBeenLastCalledWith(expect.any(HTMLElement), 1);
    swipe(120);
    expect(turn).toHaveBeenLastCalledWith(expect.any(HTMLElement), -1);
  });

  it('a short slow drag springs back, a quick flick turns', () => {
    swipe(-40);
    expect(turn).not.toHaveBeenCalled();
    swipe(-40, 0, { ms: 60 });
    expect(turn).toHaveBeenCalledWith(expect.any(HTMLElement), 1);
  });

  it('leaves a vertical move to the page', () => {
    swipe(-30, 150);
    expect(turn).not.toHaveBeenCalled();
  });

  it('opens no day after a swipe, but a tap still opens it', () => {
    const tapped = vi.fn();
    root.addEventListener('click', tapped);
    swipe(-120);
    day().click();
    expect(tapped).not.toHaveBeenCalled();
    day().click();
    expect(tapped).toHaveBeenCalledTimes(1);
  });

  it('never goes past this month', () => {
    mount(true);
    swipe(-200);
    expect(turn).not.toHaveBeenCalled();
    swipe(200);
    expect(turn).toHaveBeenCalledWith(expect.any(HTMLElement), -1);
  });

  it('a cancelled touch, a mouse and «більші зони» turn nothing', () => {
    swipe(-200, 0, { type: 'pointercancel' });
    swipe(-200, 0, { pointerType: 'mouse' });
    document.documentElement.setAttribute('data-larger-targets', '');
    swipe(-200);
    expect(turn).not.toHaveBeenCalled();
  });

  it('cuts the days at the edge only while they move', () => {
    swipe(-120);
    expect(root.querySelector('.cal__scroll--turning')).toBeNull();
  });
});
