import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountAnnouncer } from './announce';
import { mountToast, TOAST_MS, undo, type Toast } from './toast';
import { fakeAnimate } from './test-animate';

describe('toast', () => {
  let host: HTMLElement;
  let toast: Toast;
  const box = () => host.querySelector<HTMLElement>('.toast')!;
  const text = () => host.querySelector<HTMLElement>('.toast__message')!;
  const action = () => host.querySelector<HTMLButtonElement>('.toast__action')!;
  const close = () => host.querySelector<HTMLButtonElement>('.toast__close')!;

  beforeEach(() => {
    host = document.createElement('div');
    toast = mountToast(host);
  });

  it('stays hidden until something happens and is not a live region itself', () => {
    expect(box().hidden).toBe(true);
    expect(box().getAttribute('role')).toBe('region');
    expect(box().getAttribute('aria-label')).toBe('повідомлення');
  });

  it('shows the message with the emoticon in its own accent span', () => {
    toast.show({ message: 'збережено :)' });
    expect(box().hidden).toBe(false);
    expect(text().textContent).toBe('збережено :)');
    expect(text().querySelector('.emoticon')!.textContent).toBe(':)');
  });

  it('E-17: an emoticon inside the message is in the accent span too', () => {
    toast.show({ message: 'не вдалося зберегти :( спробуй ще раз.', error: true });
    expect(text().textContent).toBe('не вдалося зберегти :( спробуй ще раз.');
    expect(text().querySelector('.emoticon')!.textContent).toBe(':(');
  });

  it('writes the message as text, never as HTML', () => {
    toast.show({ message: '<b>а</b> <3' });
    expect(text().querySelector('b')).toBeNull();
    expect(text().textContent).toBe('<b>а</b> <3');
  });

  it('shows ✓ only when a process has a result', () => {
    toast.show({ message: 'збережено', showIcon: true });
    expect(host.querySelector('.toast__check')!.hasAttribute('hidden')).toBe(false);
    toast.show({ message: 'за цей день записів немає' });
    expect(host.querySelector('.toast__check')!.hasAttribute('hidden')).toBe(true);
  });

  it('closes with × at any moment', () => {
    toast.show({ message: 'видалено', showIcon: true });
    close().click();
    expect(box().hidden).toBe(true);
  });

  it('runs undo once and then says «скасовано» without another undo', () => {
    const onUndo = vi.fn();
    toast.show({ message: 'підхід видалено', showIcon: true, action: undo(onUndo) });
    expect(action().textContent).toBe('скасувати');
    action().click();
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(text().textContent).toBe('скасовано');
    expect(action().hidden).toBe(true);
    expect(box().hidden).toBe(false);
  });

  it('hides the action for a message without one', () => {
    expect(action().classList).toContain('ctl');
    toast.show({ message: 'видалено', action: undo(() => {}) });
    toast.show({ message: 'не вдалося зберегти' });
    expect(action().hidden).toBe(true);
  });

  it('runs another action under its own label and closes when it has nothing more to say', () => {
    const update = vi.fn();
    toast.show({ message: 'є нова версія :)', action: { label: 'оновити', run: update } });
    expect(action().textContent).toBe('оновити');
    action().click();
    expect(update).toHaveBeenCalledTimes(1);
    expect(box().hidden).toBe(true);
  });

  it('keeps a single toast when shown again', () => {
    toast.show({ message: 'один' });
    toast.show({ message: 'два' });
    expect(host.querySelectorAll('.toast')).toHaveLength(1);
    expect(text().textContent).toBe('два');
  });
});

describe('how long a toast stays (ACCESSIBILITY.md rule 7)', () => {
  let host: HTMLElement;
  let toast: Toast;
  const box = () => host.querySelector<HTMLElement>('.toast')!;
  const life = () => host.querySelector<HTMLElement>('.toast__life')!;
  const action = () => host.querySelector<HTMLButtonElement>('.toast__action')!;
  const close = () => host.querySelector<HTMLButtonElement>('.toast__close')!;
  const wait = (ms: number) => vi.advanceTimersByTime(ms);
  const say = (type: string, init: FocusEventInit = {}) => box().dispatchEvent(new FocusEvent(type, { bubbles: true, ...init }));
  const tick = () => Promise.resolve();

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    host = document.body;
    toast = mountToast(host);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('closes a success or neutral message after 4 s, and shows the time on its top stroke', () => {
    toast.show({ message: 'збережено', showIcon: true });
    expect(life().hidden).toBe(false);
    wait(TOAST_MS - 1);
    expect(box().hidden).toBe(false);
    wait(1);
    expect(box().hidden).toBe(true);
  });

  it('counts the 4 s anew for a message that replaces another', () => {
    toast.show({ message: 'один' });
    const first = life();
    wait(3000);
    toast.show({ message: 'два' });
    expect(life()).not.toBe(first);
    wait(3000);
    expect(box().hidden).toBe(false);
    wait(1000);
    expect(box().hidden).toBe(true);
  });

  it('keeps «скасувати» until × or the next change, without the stroke', async () => {
    toast.show({ message: 'підхід видалено', showIcon: true, action: undo(() => {}) });
    expect(life().hidden).toBe(true);
    wait(600_000);
    expect(box().hidden).toBe(false);
    toast.changed();
    await tick();
    expect(box().hidden).toBe(true);
  });

  it('F-01: a change that brings its own toast replaces the old «скасувати» in place', async () => {
    const first = vi.fn();
    const second = vi.fn();
    toast.show({ message: 'коло видалено', action: undo(first) });
    toast.changed();
    toast.show({ message: 'підхід видалено', action: undo(second) });
    await tick();
    expect(box().hidden).toBe(false);
    action().click();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('F-01: what «скасувати» itself changes does not close its «скасовано»', async () => {
    toast.show({ message: 'видалено', action: undo(() => toast.changed()) });
    action().click();
    await tick();
    expect(box().hidden).toBe(false);
    expect(host.querySelector('.toast__message')!.textContent).toBe('скасовано');
    wait(TOAST_MS);
    expect(box().hidden).toBe(true);
  });

  it('keeps «є нова версія» until × or «оновити»: a change does not close it', async () => {
    toast.show({ message: 'є нова версія :)', action: { label: 'оновити', run: () => {} } });
    wait(600_000);
    toast.changed();
    await tick();
    expect(box().hidden).toBe(false);
    close().click();
    expect(box().hidden).toBe(true);
  });

  it('keeps an error until ×', () => {
    toast.show({ message: 'не вдалося зберегти файл >_<', error: true });
    expect(life().hidden).toBe(true);
    wait(600_000);
    expect(box().hidden).toBe(false);
  });

  it('A-02: a message about one screen goes when another screen comes; others stay', () => {
    toast.show({ message: 'форму ще робимо, скоро буде', local: true });
    toast.screenChanged();
    expect(box().hidden).toBe(true);
    toast.show({ message: 'копію збережено', showIcon: true });
    toast.screenChanged();
    expect(box().hidden).toBe(false);
  });

  it('wave 7a: «скасувати» goes when another screen comes, even with «вимкнути зникання повідомлень»', () => {
    toast.keep(true);
    toast.show({ message: 'вправу видалено', action: undo(() => {}) });
    wait(600_000);
    expect(box().hidden).toBe(false);
    toast.screenChanged();
    expect(box().hidden).toBe(true);
    toast.show({ message: 'нова версія готова', action: { label: 'оновити', run: () => {} } });
    toast.screenChanged();
    expect(box().hidden).toBe(false);
  });

  it('B-09: does not close while the focus is on it, and goes when the focus leaves', () => {
    toast.show({ message: 'збережено' });
    wait(1000);
    close().focus();
    say('focusin');
    expect(box().classList).toContain('toast--held');
    wait(600_000);
    expect(box().hidden).toBe(false);
    say('focusout', { relatedTarget: null });
    expect(box().hidden).toBe(true);
  });

  it('B-09: the focus a tap leaves on a button does not hold the toast', () => {
    toast.show({ message: 'збережено' });
    box().dispatchEvent(new Event('pointerdown'));
    close().focus();
    expect(box().classList).not.toContain('toast--held');
    wait(TOAST_MS);
    expect(box().hidden).toBe(true);
  });

  it('B-09: the focus moving inside the toast is not leaving it', () => {
    toast.show({ message: 'збережено' });
    close().focus();
    say('focusin');
    say('focusout', { relatedTarget: close() });
    expect(box().hidden).toBe(false);
  });

  it('B-09: waits while a finger or the pointer is on it, then counts what was left', () => {
    toast.show({ message: 'збережено' });
    wait(3000);
    box().dispatchEvent(new Event('pointerenter'));
    wait(600_000);
    expect(box().hidden).toBe(false);
    box().dispatchEvent(new Event('pointerleave'));
    expect(box().classList).not.toContain('toast--held');
    wait(999);
    expect(box().hidden).toBe(false);
    wait(1);
    expect(box().hidden).toBe(true);
  });

  it('B-09: a toast closed under the pointer does not hold the next one', () => {
    toast.show({ message: 'один' });
    box().dispatchEvent(new Event('pointerenter'));
    close().click();
    toast.show({ message: 'два' });
    wait(TOAST_MS);
    expect(box().hidden).toBe(true);
  });

  it('keeps the focus in the toast when «скасувати» gives way to «скасовано»', () => {
    toast.show({ message: 'видалено', action: undo(() => {}) });
    action().focus();
    action().click();
    expect(document.activeElement).toBe(close());
  });

  it('«вимкнути зникання повідомлень»: every toast stays until ×, without the stroke', () => {
    toast.keep(true);
    toast.show({ message: 'збережено' });
    expect(life().hidden).toBe(true);
    wait(600_000);
    expect(box().hidden).toBe(false);
    close().click();
    expect(box().hidden).toBe(true);
  });

  it('«вимкнути зникання повідомлень» switched off starts the 4 s of the toast shown', () => {
    toast.keep(true);
    toast.show({ message: 'збережено' });
    toast.keep(false);
    expect(life().hidden).toBe(false);
    wait(TOAST_MS);
    expect(box().hidden).toBe(true);
  });
});

describe('what a screen reader hears from a toast (B-09)', () => {
  let toast: Toast;
  beforeEach(() => {
    document.body.innerHTML = '';
    toast = mountToast(document.body);
  });

  it('hears the message whole, from the region that is always there', () => {
    const region = mountAnnouncer();
    toast.show({ message: 'копію збережено', showIcon: true });
    expect(mountAnnouncer()).toBe(region);
    expect(region.textContent).toBe('копію збережено');
  });

  it('hears the button after the message, and not the emoticon', () => {
    toast.show({ message: 'збережено :)', action: undo(() => {}) });
    expect(mountAnnouncer().textContent).toBe('збережено. скасувати');
  });

  it('E-17: does not hear an emoticon in the middle either', () => {
    toast.show({ message: 'не вдалося зберегти :( спробуй ще раз.', error: true });
    expect(mountAnnouncer().textContent).toBe('не вдалося зберегти спробуй ще раз.');
  });
});

describe('toast in motion (MICROINTERACTIONS.md)', () => {
  let fake: ReturnType<typeof fakeAnimate>;
  let host: HTMLElement;
  let toast: Toast;
  const box = () => host.querySelector<HTMLElement>('.toast')!;
  const check = () => host.querySelector<HTMLElement>('.toast__check')!;

  beforeEach(() => {
    vi.useFakeTimers();
    fake = fakeAnimate();
    host = document.createElement('div');
    toast = mountToast(host);
  });
  afterEach(() => {
    fake.restore();
    vi.useRealTimers();
  });

  it('comes out from under the bar in 360 ms', () => {
    toast.show({ message: 'збережено' });
    const [rise] = fake.on(box());
    expect(rise!.keyframes[0]).toMatchObject({ transform: 'translateY(100%)' });
    expect(rise!.options.duration).toBe(360);
  });

  it('types the message in letter by letter, the emoticon as one', () => {
    toast.show({ message: 'ок :)' });
    expect(host.querySelector('.toast__message')!.textContent).toBe('ок :)');
    expect(fake.on(host.querySelector('.emoticon'))).toHaveLength(1);
    expect(fake.played.filter((run) => run.el.classList.contains('fx-ch'))).toHaveLength(3);
  });

  it('B-09: leaves the typed letters as plain text once they are in', () => {
    toast.show({ message: 'ок :)' });
    vi.advanceTimersByTime(600);
    const message = host.querySelector('.toast__message')!;
    expect(message.querySelector('.fx-ch')).toBeNull();
    expect(message.textContent).toBe('ок :)');
    expect(message.querySelector('.emoticon')!.textContent).toBe(':)');
  });

  it('assembles ✓ out of characters', () => {
    toast.show({ message: 'видалено', showIcon: true });
    const frames = [check().dataset.g];
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(80);
      frames.push(check().dataset.g);
    }
    expect(frames).toEqual(['.', '\\', 'v', undefined]);
  });

  it('hides faster than it comes, in 240 ms, and only then is gone', () => {
    toast.show({ message: 'видалено' });
    fake.finishAll();
    host.querySelector<HTMLButtonElement>('.toast__close')!.click();
    expect(box().hidden).toBe(false);
    const fall = fake.on(box()).at(-1)!;
    expect(fall.options.duration).toBe(240);
    fall.finish();
    expect(box().hidden).toBe(true);
  });

  it('stays when a new message comes while it hides', () => {
    toast.show({ message: 'видалено' });
    host.querySelector<HTMLButtonElement>('.toast__close')!.click();
    toast.show({ message: 'збережено' });
    fake.finishAll();
    expect(box().hidden).toBe(false);
  });

  it('does not come out again when it is already shown', () => {
    toast.show({ message: 'один' });
    fake.finishAll();
    toast.show({ message: 'два' });
    expect(fake.on(box())).toHaveLength(1);
  });
});
