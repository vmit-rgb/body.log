import { describe, expect, it, vi } from 'vitest';
import { chromeIntent, installedWelcome, isInAppBrowser } from './in-app';
import { watchInstallOffer } from '../pwa/install-offer';

/* User agents as these apps and browsers send them (2024–2026); versions vary, the tokens don't. */
const IN_APP: Record<string, string> = {
  'Instagram, Android': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 Instagram 343.0.0.33.101 Android (34/14; 420dpi; 1008x2244; Google/google; Pixel 8 Pro; husky; husky; en_US; 627400398)',
  'Instagram, iPhone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.91 (iPhone13,1; iOS 17_5_1; en_US; en; scale=3.00; 1080x2340; 619461904)',
  'Facebook, Android': 'Mozilla/5.0 (Linux; Android 13; SM-S911B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.163 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/442.0.0.33.113;]',
  'Facebook, iPhone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/462.0.0.38.107;FBBV/580010000;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.4;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5;FBRV/0]',
  'Messenger, iPhone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/440.0.0.37.109;FBBV/559373563;FBDV/iPhone13,1;FBMD/iPhone;FBSN/iOS;FBSV/16.3.1;FBSS/3;FBCR/;FBID/phone;FBLC/uk_UA;FBOP/5]',
  'LinkedIn, iPhone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.29.6942',
  'LinkedIn, Android': 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP1A.240505.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 [LinkedInApp]/4.1.948',
  'Viber, Android': 'Mozilla/5.0 (Linux; Android 12; Redmi Note 11 Build/SKQ1.211103.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36 Viber/21.3.0.0',
  'Telegram, Android webview': 'Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 Telegram-Android/10.14.5 (Samsung SM-A546B; Android 14; SDK 34; AVERAGE)',
  'TikTok, iPhone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_35.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/UA BytedanceWebview/d8a21c6',
  'an unnamed Android WebView': 'Mozilla/5.0 (Linux; Android 13; Pixel 6 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0.0.0 Mobile Safari/537.36',
  'an unnamed iPhone web view': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
};

const BROWSERS: Record<string, string> = {
  'Chrome, Android (reduced UA)': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  'Samsung Internet': 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  'Firefox, Android': 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  'Edge, Android': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.2849.80',
  'Safari, iOS 16.3.1': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1',
  'Safari, iOS 26': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  'Chrome, iPhone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  'Firefox, iPhone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  'Edge, iPhone': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/130.0.2849.80 Mobile/15E148 Safari/605.1.15',
  'Safari, iPad (desktop mode)': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Chrome, Windows': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

describe('isInAppBrowser (FIXES-1.0.1.md, A3)', () => {
  it.each(Object.entries(IN_APP))('%s → inside another app', (_, userAgent) => {
    expect(isInAppBrowser(userAgent)).toBe(true);
  });
  it.each(Object.entries(BROWSERS))('%s → a real browser, no frame', (_, userAgent) => {
    expect(isInAppBrowser(userAgent)).toBe(false);
  });
});

describe('chromeIntent', () => {
  it('hands the same address, with its language, to Chrome', () => {
    expect(chromeIntent('https://vmit-rgb.github.io/body.log/?lang=en')).toBe(
      'intent://vmit-rgb.github.io/body.log/?lang=en#Intent;scheme=https;package=com.android.chrome;end',
    );
  });
});

describe('installedWelcome: «встановлено :)» only on a first start with nothing stored (A2a)', () => {
  it('says it in the installed app the first time, when there is no diary', () => {
    expect(installedWelcome({ installed: true, seen: false, nothingStored: true })).toBe('show');
  });
  it('marks it quietly when a diary is there: whoever installed 1.0 hears nothing after the update', () => {
    expect(installedWelcome({ installed: true, seen: false, nothingStored: false })).toBe('mark');
  });
  it('never twice', () => {
    expect(installedWelcome({ installed: true, seen: true, nothingStored: true })).toBe('none');
  });
  it('never in a browser tab', () => {
    expect(installedWelcome({ installed: false, seen: false, nothingStored: true })).toBe('none');
  });
});

describe('watchInstallOffer (A1)', () => {
  function offerEvent(outcome: 'accepted' | 'dismissed') {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(async () => {}),
      userChoice: Promise.resolve({ outcome }),
    });
    return event;
  }

  it('has nothing to offer until the browser offers it', () => {
    const offer = watchInstallOffer(new EventTarget() as unknown as Window, () => {});
    expect(offer.ready()).toBe(false);
  });

  it('keeps the browser\'s offer, keeps its own bar away and tells the screens', async () => {
    const target = new EventTarget() as unknown as Window;
    const offer = watchInstallOffer(target, () => {});
    const changed = vi.fn();
    offer.onChange(changed);
    const event = offerEvent('accepted');
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(offer.ready()).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    await expect(offer.install()).resolves.toBe('accepted');
    expect(event.prompt).toHaveBeenCalledTimes(1);
    // an offer works once
    expect(offer.ready()).toBe(false);
    await expect(offer.install()).resolves.toBe('unavailable');
  });

  it('is used up when the person says no, too', async () => {
    const target = new EventTarget() as unknown as Window;
    const offer = watchInstallOffer(target, () => {});
    target.dispatchEvent(offerEvent('dismissed'));
    await expect(offer.install()).resolves.toBe('dismissed');
    expect(offer.ready()).toBe(false);
  });

  it('says so in the tab after the install (A2b) and drops the offer', () => {
    const target = new EventTarget() as unknown as Window;
    const installed = vi.fn();
    const offer = watchInstallOffer(target, installed);
    target.dispatchEvent(offerEvent('accepted'));
    target.dispatchEvent(new Event('appinstalled'));
    expect(installed).toHaveBeenCalledTimes(1);
    expect(offer.ready()).toBe(false);
  });
});
