import { backupLine, copyFileName, needsBackup } from '../domain/backup';
import type { DayKey } from '../domain/dates';
import { serializeDiary, type Diary } from '../domain/diary';
import { readSettings } from '../domain/settings';
import { showHowToUse, showWhatsNew, type HelpActions } from '../screens/help';
import { showHistory, type HistoryMemory } from '../screens/history';
import { showMenu, type MenuItem } from '../screens/menu';
import { menuIn, menuOut } from '../screens/menu-motion';
import type { PdfFonts } from '../pdf/pdf';
import type { backupMemory, ThemeChoice, TipMemory } from '../storage/store';
import { buzz } from '../home/signal';
import { tvFlicker } from '../ui/flicker';
import { enter, fillThrough } from '../ui/motion';
import type { Toast, ToastMessage } from '../ui/toast';
import { focusBack, focusHeading, selectorOf, titleFor } from '../ui/screen-focus';
import type { BackSteps, BrowserSteps } from './back-steps';
import { settingsPage, type SettingsEnv, type SettingsPage } from './settings-page';
import { t } from '../i18n/lang';

/*
 * The screens that open over home: the menu and its two pages (stage 6a),
 * the history with search in notes (stage 6b), a day opened from the history
 * (A-11). Each one is a step of the phone's «назад» (back-steps.ts), so
 * «назад» closes them one by one.
 */

export interface ShareData {
  readonly title: string;
  readonly text: string;
  readonly url: string;
}

/** What the screens over home need from the phone. */
export interface DeviceEnv extends Pick<SettingsEnv, 'look' | 'motionReduced'> {
  /** The theme shown now and the choice made with ☼ / ☾ in the menu. */
  theme: { shown(): ThemeChoice; choose(theme: ThemeChoice): void };
  /** The day of the last copy, on this phone. */
  backups: ReturnType<typeof backupMemory>;
  /** Hands a file to the phone (its downloads); throws when the phone refuses. */
  saveFile(name: string, content: string | Uint8Array<ArrayBuffer>): void;
  /** The font embedded in a PDF, loaded when the first PDF is made; rejects when it can't load. */
  pdfFonts(): Promise<PdfFonts>;
  /** The phone's share sheet; 'unavailable' when it has none. */
  share(data: ShareData): Promise<'shared' | 'cancelled' | 'unavailable'>;
  /** Puts text on the clipboard; false when the phone refuses. */
  copyText(text: string): Promise<boolean>;
  now(): Date;
  /** The browser's history, which the phone's «назад» moves through (A-05). */
  history: BrowserSteps;
  /** Tips for newcomers; the settings have «затисни, щоб відкрити дії» (wave 7a). */
  tips?: TipMemory | undefined;
}

/** How the app lets these screens take the screen and give it back to home. */
export interface Home {
  host: HTMLElement;
  toast: Toast;
  today(): DayKey;
  diary(): Diary;
  /** The day home shows. */
  date(): DayKey;
  /** Shows home on that day. */
  showHome(date: DayKey): void;
  /**
   * Undoes the screen shown now and draws the next one; `draw` returns what to undo later.
   * `comeIn` moves it in.
   */
  replace(draw: () => () => void, comeIn: (host: HTMLElement) => void): void;
  /** Stores the diary; false (and a toast) when the phone refuses. */
  keep(next: Diary): boolean;
  /** Starts over with this diary on home (a restored copy, an undone «стерти все»). */
  restart(next: Diary, message?: ToastMessage): void;
  /** «стерти все»: no diary on this phone, the first screen. */
  erase(message: ToastMessage): void;
}

/* COPY.md, Toasts; «не вдалося зберегти файл» as «бета 0.81» says it. */
const COPY_SAVED: ToastMessage = { message: t('копію збережено'), showIcon: true };
const FILE_NOT_SAVED: ToastMessage = { message: `${t('не вдалося зберегти файл')} >_<`, error: true };
const LINK_COPIED: ToastMessage = { message: t('посилання скопійовано — надішли, кому хочеш :)'), showIcon: true };
/* Нитка's drafts (stage 6a): what the menu offers before it is built. */
const NOT_SHARED: ToastMessage = { message: `${t('не вдалося поділитися')} >_<`, error: true };

/** «поділитися застосунком» (Figma caption, Нитка's draft): the landing page, not the app itself. */
export const SHARE: ShareData = {
  title: 'body.log',
  text: t('щоденник руху, який підлаштовується під твоє тіло: твої вправи, твої питання про самопочуття, твої шкали. налаштовує твій ШІ за одну розмову, а змінити можна все й будь-коли. без сповіщень, записи лишаються тільки на телефоні.'),
  url: 'https://vmit-rgb.github.io/body.log-landing/',
};

/** «зберегти копію»; false when the phone refused the file. */
function saveCopyFile(env: DeviceEnv, home: Home): boolean {
  const today = home.today();
  try {
    env.saveFile(copyFileName(today), serializeDiary(home.diary(), env.now()));
  } catch {
    home.toast.show(FILE_NOT_SAVED);
    return false;
  }
  env.backups.remember(today);
  home.toast.show(COPY_SAVED);
  return true;
}

/** The share sheet; without one, the text and link on the clipboard. */
async function share(env: DeviceEnv, toast: Toast): Promise<void> {
  if ((await env.share(SHARE)) !== 'unavailable') return;
  toast.show((await env.copyText(`${SHARE.text} -> ${SHARE.url}`)) ? LINK_COPIED : NOT_SHARED);
}

/** A screen drawn anew in place (the menu after ☼ / ☾ or a copy): no motion. */
const still = () => {};
/** The usual way in: a fade and a rise of 12 px. */
const fadeUp = (host: HTMLElement) => enter(host.firstElementChild);

/** How `page` comes in after `from`: the menu from ≡, unless it was the menu already; others fade up. */
export function comeInFor(page: Page, from: Page | undefined): (host: HTMLElement) => void {
  if (page !== 'menu') return fadeUp;
  return from === 'menu' ? still : menuIn;
}

/** 'search' is the history with the search panel open. */
export type Page = 'menu' | 'whats-new' | 'how-to-use' | 'history' | 'search' | 'settings';

/** B-05: what the page is called while each screen shows. */
const TITLES: Record<Page, string> = {
  menu: t('меню'),
  'whats-new': t('що нового'),
  'how-to-use': t('як користуватись'),
  history: t('історія'),
  search: t('історія'),
  settings: t('налаштування'),
};

/** A screen over home: a page, or home itself on a day opened from the history (A-11). */
interface Entry {
  readonly page: Page | 'day';
  /** The day to open, for 'day', until it is shown. */
  date: DayKey | undefined;
  /** Its step of «назад»; closing it closes everything above. */
  done: () => void;
  /** B-04: the button that opened it, to get the focus back when it closes. */
  readonly opener: string | null;
  /** The history's open cards and scroll, kept while a day is open over it (A-11). */
  readonly memory: HistoryMemory;
}

export function pagesOverHome(env: DeviceEnv, home: Home, steps: BackSteps): { open(page: Page): void } {
  let pages: Entry[] = [];
  let settings: SettingsPage | null = null;

  function open(page: Page | 'day', date?: DayKey): void {
    // home opens only the menu, from ≡, even where a tap focuses nothing (iPhone)
    const opener = selectorOf(document.activeElement) ?? (pages.length ? null : '.bar__menu');
    const entry: Entry = { page, date, done: () => {}, opener, memory: {} };
    entry.done = steps.open(() => back(entry));
    pages = [...pages, entry];
    draw();
  }

  /** The phone's «назад» took this screen's step. */
  function back(entry: Entry): void | 'stay' {
    // A-06: settings with changes ask first, and stay until the person decides
    if (entry.page === 'settings' && settings?.hasChanges()) {
      void leaveSettings(entry);
      return 'stay';
    }
    if (entry.page === 'settings') leaveSettingsNow();
    closeFrom(pages.indexOf(entry));
  }

  /** The screens from `index` up close; the one under them shows again. */
  function closeFrom(index: number): void {
    if (index < 0 || index >= pages.length) return;
    const closed = pages[index]!;
    closed.done();
    pages = pages.slice(0, index);
    draw(closed.opener);
  }

  /** Back to `depth` screens over home. */
  const backTo = (depth: number) => closeFrom(depth);

  /** Home on that day, every screen over it closed. */
  function goTo(date: DayKey): void {
    pages[0]?.done();
    pages = [];
    drawn = undefined;
    home.toast.screenChanged();
    home.showHome(date);
  }

  const help: HelpActions = { menu: () => backTo(1), search: () => open('search'), close: () => backTo(0) };

  function history(search: boolean, memory: HistoryMemory): () => void {
    const diary = home.diary();
    return showHistory(home.host, {
      settings: readSettings(diary.profile),
      days: diary.days,
      today: home.today(),
      date: home.date(),
      search,
    }, {
      menu: () => backTo(1),
      close: () => backTo(0),
      // A-11: the day opens over the history, and «назад» comes back to the same place
      goTo: (date) => open('day', date),
      toast: (message) => home.toast.show(message),
      tips: env.tips,
    }, memory);
  }

  const helpPage = (show: typeof showWhatsNew) => () => {
    show(home.host, help);
    return () => {};
  };

  /** Each page draws itself and returns what to undo. */
  const SCREENS: Record<Page, (entry: Entry) => () => void> = {
    menu: () => menu(),
    'whats-new': helpPage(showWhatsNew),
    'how-to-use': helpPage(showHowToUse),
    history: (entry) => history(false, entry.memory),
    search: (entry) => history(true, entry.memory),
    // the menu creates the page before opening it
    settings: () => settings!.draw(),
  };

  function openSettings(): void {
    settings = settingsPage(env, {
      ...home,
      backupLine: () => backupLine(env.backups.last(), home.today()),
      saveCopy,
      close: () => leaveAll(() => {
        home.showHome(home.date());
        // B-04: ✕ closes every screen opened from ≡, so the focus goes back to ≡
        focusBack(home.host, '.bar__menu');
      }),
      restart: (next, message) => leaveAll(() => home.restart(next, message)),
      erase: (message) => leaveAll(() => home.erase(message)),
    });
    open('settings');
  }

  /** Settings let go of the screen: every screen over home closes, and `then` shows the next one. */
  function leaveAll(then: () => void): void {
    settings = null;
    pages[0]?.done();
    pages = [];
    drawn = undefined;
    then();
  }

  /** The entry drawn now; undefined when home shows. */
  let drawn: Entry | undefined;

  /**
   * Draws the top screen. A screen new on top gets the focus on its heading;
   * a screen shown again after the one over it closed gets it on `returnTo`.
   */
  function draw(returnTo?: string | null): void {
    const entry = pages.at(-1);
    const from = drawn;
    drawn = entry;
    if (entry === from) return redraw(entry);
    // A-02: a toast about the screen before does not follow to this one
    home.toast.screenChanged();
    if (!entry) home.showHome(home.date());
    else if (entry.page === 'day') {
      // the day it opened on the first time; afterwards the one its arrows got to
      home.showHome(entry.date ?? home.date());
      entry.date = undefined;
    } else {
      document.title = titleFor(TITLES[entry.page]);
      const memory = returnTo === undefined ? undefined : entry.memory;
      home.replace(() => SCREENS[entry.page as Page](entry), comeInAgain(comeInFor(entry.page, pageOf(from)), memory));
    }
    if (returnTo !== undefined) focusBack(home.host, returnTo);
    // unless the screen put the focus somewhere itself (the search field)
    else if (!home.host.contains(document.activeElement)) focusHeading(home.host);
  }

  /** The same screen drawn anew in place (the menu after ☼ / ☾ or a copy): the focus stays where the caller puts it. */
  function redraw(entry: Entry | undefined): void {
    if (!entry) home.showHome(home.date());
    else if (entry.page === 'day') home.showHome(home.date());
    else home.replace(() => SCREENS[entry.page as Page](entry), still);
  }

  const saveCopy = () => saveCopyFile(env, home);

  const ITEMS: Record<MenuItem, () => void> = {
    history: () => open('history'),
    settings: openSettings,
    search: () => open('search'),
    backup: () => {
      if (!saveCopy()) return;
      draw();
      fillThrough(home.host.querySelector<HTMLElement>('[data-menu="backup"]'));
      buzz(18, readSettings(home.diary().profile).accessibility);
    },
    'whats-new': () => open('whats-new'),
    'how-to-use': () => open('how-to-use'),
    share: () => void share(env, home.toast),
  };

  /** ☼ / ☾: the noise of an old TV flickers twice, the other theme comes in the middle. */
  function switchTheme(): void {
    const next = env.theme.shown() === 'dark' ? 'light' : 'dark';
    tvFlicker(() => {
      env.theme.choose(next);
      redrawMenu();
    });
  }

  /** The menu anew with the focus back on ☼ / ☾; nothing when the menu has gone meanwhile. */
  function redrawMenu(): void {
    if (drawn?.page !== 'menu') return;
    draw();
    home.host.querySelector<HTMLElement>('.menu__theme')!.focus();
  }

  function menu(): () => void {
    const diary = home.diary();
    const today = home.today();
    const last = env.backups.last();
    return showMenu(home.host, {
      settings: readSettings(diary.profile),
      days: diary.days,
      date: home.date(),
      today,
      theme: env.theme.shown(),
      backupLine: backupLine(last, today),
      remind: needsBackup(last, today, Object.keys(diary.days).length > 0),
    }, {
      choose: (item) => ITEMS[item](),
      switchTheme,
      close: () => menuOut(home.host, () => backTo(0)),
      goTo,
    });
  }

  /** Settings are left without asking (no changes): the saved look comes back. */
  function leaveSettingsNow(): void {
    void settings?.mayLeave();
    settings = null;
  }

  /** The phone's «назад» over settings with changes: the page stays until the person decides. */
  async function leaveSettings(entry: Entry): Promise<void> {
    const page = settings!;
    if (!(await page.mayLeave()) || settings !== page) return;
    settings = null;
    closeFrom(pages.indexOf(entry));
  }

  return { open: (page) => open(page) };
}

/** The page an entry draws; home (undefined) for home and a day over the history. */
const pageOf = (entry: Entry | undefined): Page | undefined => (entry && entry.page !== 'day' ? entry.page : undefined);

/** The history shown again comes back to where it was scrolled (A-11), then moves in as usual. */
function comeInAgain(comeIn: (host: HTMLElement) => void, memory: HistoryMemory | undefined): (host: HTMLElement) => void {
  if (memory?.y === undefined) return comeIn;
  const y = memory.y;
  return (host) => {
    scrollTo(0, y);
    comeIn(host);
  };
}

