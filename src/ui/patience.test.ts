import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import index from '../../index.html?raw';
import main from '../main.ts?raw';
import { leaveLoading } from './boot';
import { STUCK_MS, within } from './patience';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.documentElement.removeAttribute('data-no-motion');
});

describe('within: nothing is waited for without end (D-10)', () => {
  it('waits 7 s by Olesia’s rule', () => {
    expect(STUCK_MS).toBe(7000);
  });

  it('gives the answer that comes in time', async () => {
    await expect(within(Promise.resolve('шрифт'))).resolves.toBe('шрифт');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('passes a failure on as it is', async () => {
    await expect(within(Promise.reject(new Error('offline')))).rejects.toThrow('offline');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives up on work that never answers', async () => {
    const waiting = within(new Promise(() => {}));
    const outcome = expect(waiting).rejects.toThrow('no answer in 7000 ms');
    vi.advanceTimersByTime(STUCK_MS - 1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    await outcome;
  });

  it('guards the PDF font, the one thing the app loads after it started', () => {
    expect(main).toMatch(/pdfFonts: \(\) => within\(/);
  });
});

describe('the loading screen that never ended (D-10)', () => {
  const LOADING = /<div id="loading"[\s\S]*?<\/div><span class="ld-t">завантажую…<\/span><\/div>/;
  // the classic script of index.html, the one that runs even when the app's code does not
  const WATCH = /<script>([\s\S]*?)<\/script>/;
  const layer = () => document.getElementById('loading');

  function open(): void {
    document.body.innerHTML = `${LOADING.exec(index)![0]}<main id="app"><div class="screen"></div></main>`;
    new Function(WATCH.exec(index)![1]!)();
  }

  it('stands before the app’s module, so a module that fails can’t take it along', () => {
    expect(index.indexOf('<script>')).toBeGreaterThan(-1);
    expect(index.indexOf('<script>')).toBeLessThan(index.indexOf('<script type="module"'));
  });

  it('keeps «завантажую…» for 7 s, then says what happened and offers to load again', () => {
    open();
    vi.advanceTimersByTime(6999);
    expect(layer()!.textContent).toContain('завантажую…');
    vi.advanceTimersByTime(1);
    expect(layer()!.textContent).not.toContain('завантажую…');
    expect(layer()!.querySelector('.ld-h')!.textContent).toBe('щось пішло не так: застосунок не може дочекатися даних >_<');
    expect(layer()!.querySelector('.ld-b')!.textContent).toContain('онови сторінку.');
    expect(layer()!.getAttribute('role')).toBe('alert');
    expect(layer()!.querySelector('button')!.textContent).toBe('оновити');
    expect(WATCH.exec(index)![1]).toContain('location.reload()');
  });

  it('shows what broke the start, as text, and the browser it happened in', () => {
    open();
    window.dispatchEvent(new ErrorEvent('error', { message: 'TypeError: x is not a function', filename: 'https://site/body.log/assets/app-1.js', lineno: 3, colno: 14 }));
    const script = document.createElement('script');
    script.src = 'https://site/body.log/assets/app-2.js';
    document.body.append(script);
    script.dispatchEvent(new Event('error'));
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new RangeError('<b>bad</b>') }));
    vi.advanceTimersByTime(7000);
    const details = layer()!.querySelector('.ld-e')!;
    expect(details.textContent).toBe([
      'TypeError: x is not a function @ app-1.js:3:14',
      'not loaded: app-2.js',
      'promise: RangeError: <b>bad</b>',
      navigator.userAgent,
    ].join('\n'));
    expect(details.querySelector('b')).toBeNull();
    expect(layer()!.querySelector('button')!.textContent).toBe('оновити');
  });

  it('says so when it caught no error', () => {
    open();
    vi.advanceTimersByTime(7000);
    expect(layer()!.querySelector('.ld-e')!.textContent).toBe(`no error caught\n${navigator.userAgent}`);
  });

  it('says nothing when the app took the loading screen away', () => {
    open();
    document.documentElement.dataset.noMotion = '';
    leaveLoading(document, document.querySelector('#app')!, 0);
    vi.advanceTimersByTime(7000);
    expect(layer()).toBeNull();
  });

  it('leaves a loading screen that is melting away alone', () => {
    open();
    layer()!.setAttribute('data-leaving', '');
    vi.advanceTimersByTime(7000);
    expect(layer()!.hasAttribute('data-stuck')).toBe(false);
  });

  it('an app that arrives late still takes the message away', () => {
    open();
    vi.advanceTimersByTime(7000);
    document.documentElement.dataset.noMotion = '';
    leaveLoading(document, document.querySelector('#app')!, 9000);
    expect(layer()).toBeNull();
  });
});
