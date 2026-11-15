import { beforeEach, describe, expect, it } from 'vitest';
import { announce, mountAnnouncer } from './announce';

describe('the announcer (B-02, B-09)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('is one polite region, in the page before anything is said and never hidden', () => {
    const region = mountAnnouncer();
    expect(region.getAttribute('role')).toBe('status');
    expect(region.hidden).toBe(false);
    expect(region.className).toBe('visually-hidden');
    expect(region.textContent).toBe('');
  });

  it('keeps the same region and changes only its text', () => {
    const region = mountAnnouncer();
    announce('середа, 11 листопада');
    announce('рахуй удари');
    expect(mountAnnouncer()).toBe(region);
    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(region.textContent).toBe('рахуй удари');
  });

  it('makes the same words differ, so they are read again', () => {
    announce('збережено');
    announce('збережено');
    expect(mountAnnouncer().textContent).toBe('збережено ');
    announce('збережено');
    expect(mountAnnouncer().textContent).toBe('збережено');
  });
});
