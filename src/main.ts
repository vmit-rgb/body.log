import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';
import './styles/home.css';
import './styles/sections.css';
import './styles/calendar.css';
import './styles/menu.css';
import './styles/history.css';
import './styles/settings.css';
import './styles/glass.css';
import './styles/motion.css';
// last: a text style class (t-*) wins over any earlier font rule of the same weight (VISUAL-AUDIT Н2)
import './styles/typography.css';
import { startApp } from './app/app';
import { detectPlatform, isInstalled } from './app/start';
import { dayKeyOf } from './domain/dates';
import { backupMemory, browserChoice, diaryStore, sectionMemory, storageFor, themeMemory, tipMemory } from './storage/store';
import { DEFAULT_APPEARANCE, lookOf, startAppearance, type Appearance } from './ui/appearance';
import { trackNumberFill } from './ui/number-fill';
import { watchForUpdates } from './pwa/updates';
import { mountAnnouncer } from './ui/announce';
import { mountToast } from './ui/toast';
import { wireTapMotion } from './ui/taps';
import { wireNotes } from './ui/notes';
import { leaveLoading } from './ui/boot';
import { wireBarFit } from './ui/bar-fit';
import { startFlight } from './ui/flight';
import { within } from './ui/patience';
import { copyWith, saveFile, screenHistory, shareWith } from './ui/device';
import type { PdfFonts } from './pdf/pdf';

// Wiring only: everything with a decision in it lives in the modules above.
const root = document.documentElement;
const installed = isInstalled((query) => matchMedia(query), navigator as { standalone?: boolean });
const storage = storageFor(installed, { local: localStorage, session: sessionStorage });
const themes = themeMemory(storage);
let look: Omit<Appearance, 'theme'> = DEFAULT_APPEARANCE;
const appearance = (): Appearance => ({ ...look, theme: themes.chosen() ?? 'system' });
const applyAppearance = startAppearance(root, matchMedia('(prefers-color-scheme: light)'), appearance());
trackNumberFill(root);
// «Політ символів», the ASCII background; it follows the theme, the accent and both «вимкнути … анімації»
const flight = document.querySelector<HTMLCanvasElement>('canvas.flight');
if (flight) startFlight({ root, canvas: flight, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)') });

// B-02: the one live region is in the page from the start, before there is anything to say
mountAnnouncer();
const toast = mountToast(document.body);
wireTapMotion(document);
wireNotes(document);
const host = document.querySelector<HTMLElement>('#app')!;
// C-01: the bottom bar rebuilds itself when the date doesn't fit, and what sits above it follows
wireBarFit(root, host);
startApp({
  host,
  store: diaryStore(storage, () => new Date()),
  browser: browserChoice(storage),
  platform: detectPlatform(navigator),
  installed,
  toast,
  today: () => dayKeyOf(new Date()),
  sections: sectionMemory(storage),
  tips: tipMemory(storage),
  onDiary: (diary) => {
    look = lookOf(diary.profile);
    applyAppearance(appearance());
    // ask the browser not to clear the diary when space runs low (a tab keeps nothing anyway)
    if (installed) void navigator.storage?.persist?.();
  },
  whenHidden: (save) => {
    addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save();
    });
  },
  theme: {
    shown: () => (root.dataset.theme === 'light' ? 'light' : 'dark'),
    choose(theme) {
      themes.choose(theme);
      applyAppearance(appearance());
    },
  },
  look(profile) {
    look = lookOf(profile);
    applyAppearance(appearance());
  },
  motionReduced: () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  backups: backupMemory(storage),
  saveFile: (name, content) => saveFile(document, name, content),
  // a separate file, loaded with the first PDF (and kept offline with the rest)
  // D-10: a font that never arrives becomes «не вдалося зібрати PDF» after 7 s, not an endless spinner
  pdfFonts: () => within(import('./pdf/noto-sans-mono-pdf.json').then((font) => font.default as PdfFonts)),
  share: (data) => shareWith(navigator, data),
  copyText: (text) => copyWith(navigator.clipboard, text),
  now: () => new Date(),
  history: screenHistory(history, window),
});
leaveLoading(document, host, performance.now());

// offline copy and «є нова версія :)»; only in the built app, never in development
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void watchForUpdates(navigator.serviceWorker, import.meta.env.BASE_URL, {
    offer: (apply) => toast.show({ message: 'є нова версія :)', action: { label: 'оновити', run: apply } }),
    reload: () => location.reload(),
    onReturn: (check) => document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    }),
  }).catch(() => {
    // no offline copy (e.g. a private window): the app still works online
  });
}
