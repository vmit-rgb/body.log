import { randomAccent } from '../domain/accents';
import { formatLong, type DayKey } from '../domain/dates';
import type { Day } from '../domain/day';
import { readCopy, type Diary, type JsonObject } from '../domain/diary';
import { EXAMPLE_DIARY } from '../domain/examples';
import { readSettings } from '../domain/settings';
import { russianReason } from '../paste/russian';
import { showPasteResult } from '../screens/paste-result';
import { ACCENT_NAMES, ACCESS_SHORT } from '../screens/settings';
import { homeSession } from '../home/session';
import { clearPasteField, showFirstLaunch } from '../screens/first-launch';
import { showHome } from '../screens/home';
import { showInstallFirst } from '../screens/install-first';
import { showUnreadable } from '../screens/unreadable';
import { unreadableFileName } from '../domain/backup';
import type { DiaryStore, sectionMemory, TipMemory } from '../storage/store';
import { announce } from '../ui/announce';
import { useBackSteps } from '../ui/back';
import { titleFor } from '../ui/screen-focus';
import { backSteps } from './back-steps';
import { enter } from '../ui/motion';
import type { Toast, ToastMessage } from '../ui/toast';
import { copyPrompt as copyPromptText, PasteFlow, pasteFailed, RUSSIAN_COPY } from './paste-flow';
import { logKeeper } from './keeper';
import { pagesOverHome, type DeviceEnv } from './pages';
import { startScreen, type Phone, type Platform, type StartScreen } from './start';
import { installedWelcome } from './in-app';
import { useInAppHelp } from '../screens/parts';
import { withHealth } from '../health/health';
import { withDishes } from '../food/food-profile';
import { t } from '../i18n/lang';

export { SAVE_DELAY_MS } from './keeper';

export interface AppEnv extends DeviceEnv {
  host: HTMLElement;
  store: DiaryStore;
  browser: { chosen(): boolean; choose(): void };
  platform: Platform;
  installed: boolean;
  toast: Toast;
  /** Today on the phone. */
  today(): DayKey;
  sections: ReturnType<typeof sectionMemory>;
  /** Tips for newcomers (storage/store.ts tipMemory); none without it. */
  tips?: TipMemory | undefined;
  /** Called with every diary the app starts showing, e.g. to apply its accent. */
  onDiary(diary: Diary): void;
  /** Runs `save` when the app is hidden or closed, so nothing typed is lost. */
  whenHidden(save: () => void): void;
  /** The page is open in a browser inside another app (in-app.ts, by the user agent). */
  inApp?: boolean;
  /** Whether the installed app said «встановлено :)» yet (storage/store.ts welcomeMemory); none: never says it. */
  welcome?: { seen(): boolean; mark(): void } | undefined;
  /** The page's address, for «скопіювати посилання». */
  pageUrl?: () => string;
  /** iPhone only (beta 1.1.1): «Здоровʼя» through the shortcut and the clipboard; none on other phones. */
  health?: {
    connected(): boolean;
    connect(): void;
    /** The clipboard as text; null when the phone doesn't give it. */
    read(): Promise<string | null>;
  } | undefined;
}

/* Beta 1.0.1 (FIXES-1.0.1.md, A2a, A3): Нитка's drafts. */
const INSTALLED: ToastMessage = { message: t('встановлено :) записи тепер тримаються тут'), showIcon: true, stay: true };
const PAGE_LINK_COPIED: ToastMessage = { message: t('посилання скопійовано'), showIcon: true };
const LINK_NOT_COPIED: ToastMessage = { message: `${t('не вдалося скопіювати')} >_<`, error: true };

/* Texts: COPY.md. */
const SAVED: ToastMessage = { message: t('збережено :)'), showIcon: true };
const UNDONE: ToastMessage = { message: t('скасовано'), showIcon: true };
/* Нитка's draft. */
const HAS_RECORDS: ToastMessage = { message: t('уже є записи, тож скасувати не вийде. налаштування можна змінити в меню'), error: true };
const NOT_A_COPY: ToastMessage = { message: `${t('цей файл не схожий на копію з body.log')} >_<`, error: true };
const RESTORED: ToastMessage = { message: t('відновлено з файлу :)'), showIcon: true };
const FILE_SAVED: ToastMessage = { message: t('збережено'), showIcon: true };
const FILE_NOT_SAVED: ToastMessage = { message: `${t('не вдалося зберегти файл')} >_<`, error: true };
const NOT_SAVED: ToastMessage = { message: `${t('не вдалося зберегти: схоже, на телефоні забракло місця')} >_<`, error: true };

/** Stores the diary; false and the «no space» toast when the phone refuses. */
function saved(store: DiaryStore, next: Diary, toast: Toast): boolean {
  try {
    store.save(next);
    return true;
  } catch {
    toast.show(NOT_SAVED);
    return false;
  }
}

/** «відновити з копії»: a copy goes to `keep`, anything else gets the «not a copy» toast. */
async function restoreFrom(file: File, keep: (diary: Diary, done: ToastMessage) => void, toast: Toast): Promise<void> {
  const restored = await readCopy(file);
  if (!restored) toast.show(NOT_A_COPY);
  else if (russianReason(restored.profile)) toast.show(RUSSIAN_COPY);
  else keep(restored, RESTORED);
}

/**
 * B-05: «body.log» on home, «початок · body.log» before there are settings
 * (Olesia's list); the screen of an unreadable diary is home's (Нитка).
 */
const START_TITLES: Record<StartScreen, string | undefined> = {
  home: undefined,
  unreadable: undefined,
  'first-launch': t('початок'),
  'install-first': t('початок'),
};

/**
 * The first settings keep the accent they name; without one they get a
 * random accent of the 11, kept with them (PROFILE-FORMAT.md, `theme.accent`).
 * Light or dark follows the phone either way.
 */
function withSomeAccent(profile: Diary['profile']): Diary['profile'] {
  const theme = profile.theme;
  const named: JsonObject = typeof theme === 'object' && theme !== null && !Array.isArray(theme) ? theme as JsonObject : {};
  if (named.accent !== undefined) return profile;
  return { ...profile, theme: { ...named, accent: randomAccent() } };
}

/** install-first shows Android's steps unless the phone is an iPhone. */
const phoneOf = (platform: Platform): Phone => (platform === 'iphone' ? 'iphone' : 'android');

export function startApp(env: AppEnv): void {
  const { host, store, browser, toast } = env;
  let diary = store.load();
  let date = env.today();
  let leave = () => {};
  /** Home is the screen shown now. */
  let onHome = false;
  /** «вимкнути зникання повідомлень» follows the settings shown, saved or still a draft. */
  const followToasts = (profile: Diary['profile']) => toast.keep(readSettings(profile).accessibility.keepToasts);
  const session = homeSession();
  const log = logKeeper(store, toast);
  // A-05: screens and layers are steps of the phone's «назад»
  const steps = backSteps(env.history);
  useBackSteps(steps);
  // the menu opens only from home, so there is a diary whenever it asks
  const pages = pagesOverHome({
    ...env,
    look(profile) {
      env.look(profile);
      followToasts(profile);
    },
  }, {
    host,
    toast,
    today: env.today,
    diary: () => diary!,
    date: () => date,
    // after «стерти все» there is no diary, and `show` gives the first screen instead
    showHome(day) {
      const moved = day !== date;
      date = day;
      show('home');
      // B-02: home on another day (from the menu's arrows, the history): the day is said, as on home itself
      if (moved && diary) announce(formatLong(day));
    },
    replace(draw, comeIn) {
      leave();
      onHome = false;
      leave = draw();
      document.documentElement.scrollTop = 0;
      comeIn(host);
    },
    keep: (next) => persist(next),
    restart: (next, message) => keep(next, message),
    erase(message) {
      store.clear();
      diary = null;
      show('first-launch');
      toast.show(message);
    },
  }, steps);

  function showDay(current: Diary, next: DayKey): void {
    const cameFrom = date;
    date = next;
    leave();
    onHome = true;
    let shown = current;
    leave = showHome(host, { settings: readSettings(current.profile), days: current.days, date, today: env.today(), session, cameFrom, inTab: !env.installed }, {
      goTo: (day) => showDay(shown, day),
      openMenu: () => {
        log.saveNow();
        pages.open('menu');
      },
      sectionOpen: env.sections.open,
      rememberSection: env.sections.remember,
      tips: env.tips,
      edit(change, render) {
        // F-01: «скасувати» for an earlier change is no longer true
        toast.changed();
        shown = log.edit(shown, date, change);
        diary = shown;
        if (render) showDay(shown, date);
        return shown.days;
      },
      restore: restoreDay,
      refresh: () => showDay(shown, date),
      toast: (message) => toast.show(message),
      food: {
        copy: env.copyText,
        keepDishes(dishes) {
          // the day's typing first, then the settings with the new dishes; the meal is written on top of both
          log.saveNow();
          const next = { ...shown, profile: withDishes(shown.profile, dishes) };
          if (persist(next)) shown = next;
        },
      },
      health: env.health && {
        ...env.health,
        add(days) {
          toast.changed();
          // each day that came gets its «Здоровʼя» replaced; written at once, not after the typing pause
          for (const [day, health] of Object.entries(days)) shown = log.edit(shown, day as DayKey, withHealth(health));
          log.saveNow();
          diary = shown;
          showDay(shown, date);
        },
      },
    });
  }

  /**
   * «скасувати» on home (F-01): puts a day back as it was, under its own
   * date, whatever day is shown by now. Nothing else can have changed since:
   * the next change or another screen closes the toast (wave 7a).
   */
  function restoreDay(day: Day): void {
    if (!diary) return;
    diary = log.edit(diary, day.date, () => day);
    if (onHome) showDay(diary, date);
  }

  function show(screen: StartScreen): void {
    leave();
    leave = () => {};
    onHome = false;
    // A-02: a toast about the screen before does not follow to this one
    toast.screenChanged();
    paste.reset();
    document.title = titleFor(START_TITLES[screen]);
    // home is only chosen when there is a diary (startScreen)
    if (screen === 'home' && diary) showDay(diary, date);
    else {
      if (screen === 'install-first') showInstallFirst(host, phoneOf(env.platform), useBrowser);
      else if (screen === 'unreadable') showUnreadable(host, { saveAsFile: saveUnreadable, restore, startOver: () => show('first-launch') });
      else {
        showFirstLaunch(host, {
          copyPrompt, applySettings: (text) => paste.apply(text), pasteAct: (act) => paste.act(act), pasteEdited: () => paste.reset(), restore, startWithoutAi,
        }, !env.installed);
      }
      enter(host.firstElementChild);
    }
    document.documentElement.scrollTop = 0;
  }

  /** Stores the diary and makes it the one shown; false (and a toast) when the phone refuses. */
  function persist(next: Diary): boolean {
    if (!saved(store, next, toast)) return false;
    // F-01: «скасувати» for an earlier change is no longer true
    toast.changed();
    diary = next;
    env.onDiary(next);
    followToasts(next.profile);
    return true;
  }

  function keep(next: Diary, done?: ToastMessage): void {
    if (!persist(next)) return;
    show('home');
    if (done) toast.show(done);
  }

  function useBrowser(): void {
    browser.choose();
    show('first-launch');
  }
  const copyPrompt = () => void copyPromptText(env.copyText, (message) => toast.show(message));

  /** The first settings from the AI: home, and «скасувати» brings the first screen back while nothing is logged. */
  function startWith(pasted: Diary['profile']): void {
    const profile = withSomeAccent(pasted);
    const back = (): ToastMessage => {
      if (diary && Object.keys(diary.days).length) return HAS_RECORDS;
      store.clear();
      diary = null;
      show('first-launch');
      return UNDONE;
    };
    keep({ profile, days: {} }, { ...SAVED, action: { label: t('скасувати'), run: back } });
  }
  const paste = new PasteFlow({
    current: () => null,
    names: { accents: ACCENT_NAMES, accessibility: ACCESS_SHORT },
    copyText: env.copyText,
    say: (message) => toast.show(message),
    show: () => {
      if (pasteFailed(paste.view)) clearPasteField(host);
      showPasteResult(host, paste.view);
    },
    save: startWith,
  });
  const startWithoutAi = () => keep(EXAMPLE_DIARY);
  function restore(file: File): void {
    void restoreFrom(file, keep, toast);
  }
  /** «зберегти як файл»: what is stored, exactly as it is (D-02). */
  function saveUnreadable(): void {
    try {
      env.saveFile(unreadableFileName(env.today()), store.unreadable() ?? '');
      toast.show(FILE_SAVED);
    } catch {
      toast.show(FILE_NOT_SAVED);
    }
  }

  env.whenHidden(() => log.saveNow());
  if (diary) {
    env.onDiary(diary);
    followToasts(diary.profile);
  }
  // A3: inside Instagram or a messenger the yellow frame replaces the install steps; never in the installed app
  useInAppHelp({
    inApp: env.inApp === true && !env.installed,
    phone: phoneOf(env.platform),
    copyLink() {
      void env.copyText(env.pageUrl?.() ?? location.href).then((done) => toast.show(done ? PAGE_LINK_COPIED : LINK_NOT_COPIED));
    },
  });
  const unreadable = diary === null && store.unreadable() !== null;
  show(startScreen({ hasDiary: diary !== null, unreadable, installed: env.installed, platform: env.platform, browserChosen: browser.chosen() }));
  greetInstalled(diary === null && !unreadable);

  /** A2a: «встановлено :)» once, on the first start of the installed app with nothing stored yet. */
  function greetInstalled(nothingStored: boolean): void {
    if (!env.welcome) return;
    const welcome = installedWelcome({ installed: env.installed, seen: env.welcome.seen(), nothingStored });
    if (welcome === 'none') return;
    try {
      env.welcome.mark();
    } catch {
      // storage refused: at worst it says «встановлено» once more
    }
    if (welcome === 'show') toast.show(INSTALLED);
  }
}
