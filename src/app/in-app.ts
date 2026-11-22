/*
 * Beta 1.0.1 (FIXES-1.0.1.md, A3; Olesia, 2026-11-22): a link opened inside
 * Instagram, a messenger and the like can't install the app, so the app says
 * so in a yellow frame. Only the app checks this; the landing scrolls fine there.
 *
 * A guess from the user agent, nothing more: Telegram often leaves no trace
 * (on Android it opens Chrome Custom Tabs, which is Chrome), so the landing
 * also says it in words.
 */

/** Apps that put their own name into the user agent of their browser. */
const APP_TOKENS = /Instagram|FBAN|FBAV|FB_IAB|FB4A|LinkedInApp|Viber|musical_ly|BytedanceWebview|TikTok|Telegram/i;

/** Android's WebView marks itself with «; wv)» after the build. */
const ANDROID_WEBVIEW = /Android.*; wv\)/;

/**
 * An iPhone's browsers all say «Safari/…» (Safari, Chrome CriOS, Firefox FxiOS,
 * Edge EdgiOS, the in-app Safari view); a bare WebKit view inside another app
 * does not. The installed app doesn't say it either: callers ask only in a tab.
 */
function bareIosWebView(userAgent: string): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent) && /AppleWebKit/i.test(userAgent) && !/Safari\//i.test(userAgent);
}

/** The page is open in a browser inside another app, by what the user agent shows. */
export function isInAppBrowser(userAgent: string): boolean {
  return APP_TOKENS.test(userAgent) || ANDROID_WEBVIEW.test(userAgent) || bareIosWebView(userAgent);
}

/**
 * «відкрити в Chrome» on Android: an intent link that hands the page to Chrome.
 * Works often, not always (Olesia knows: FIXES-1.0.1.md, A3).
 */
export function chromeIntent(url: string): string {
  const { host, pathname, search, hash } = new URL(url);
  return `intent://${host}${pathname}${search}${hash}#Intent;scheme=https;package=com.android.chrome;end`;
}

export type Welcome = 'show' | 'mark' | 'none';

export interface WelcomeFacts {
  installed: boolean;
  /** The «встановлено» toast was shown, or marked as not needed, before. */
  seen: boolean;
  /** Nothing at all is stored: no diary, readable or not. */
  nothingStored: boolean;
}

/**
 * The first start of the installed app (FIXES-1.0.1.md, A2a): the toast
 * «встановлено :) записи тепер тримаються тут», once. Whoever installed 1.0
 * has no mark either, but has a diary: the mark is set quietly, so they
 * don't hear «встановлено» after an update.
 */
export function installedWelcome({ installed, seen, nothingStored }: WelcomeFacts): Welcome {
  if (!installed || seen) return 'none';
  return nothingStored ? 'show' : 'mark';
}
