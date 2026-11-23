import type { Accent } from '../domain/accents';
import type { DayKey } from '../domain/dates';
import { readCopy, type Diary, type JsonObject } from '../domain/diary';
import { exercisesText, exportFile, pdfDocument, recordsText, type ExportTab } from '../domain/export';
import { buildPdf, type PdfFonts } from '../pdf/pdf';
import { VERSION_LABEL } from '../version';
import { plural } from '../domain/numbers';
import {
  cleanForSave, withAccent, withAccessibility, withEncouragement, withGoal, withPulseTimer, type ProfileEdit,
} from '../domain/profile-edit';
import { tidy } from '../domain/sections-edit';
import { withFood, withoutFood, withRef } from '../food/food-profile';
import { findDish, mergeDishes, tenth, type FoodNumber } from '../food/food';
import { dishesPrompt, readFoodPaste } from '../food/food-paste';
import { dishSheet } from '../food/meal-sheet';
import type { FoodView } from '../food/food-settings';
import { parseNumber } from '../domain/numbers';
import { readSettings, type ActivityKind, type Settings } from '../domain/settings';
import { russianReason } from '../paste/russian';
import { ACCENT_NAMES, ACCESS_SHORT } from '../screens/settings';
import { copyPrompt, PasteFlow, pasteFailed, RUSSIAN_COPY } from './paste-flow';
import { showSettings, type PartId, type SettingsAct } from '../screens/settings';
import { SectionsEditor } from './sections-page';
import { buzz } from '../home/signal';
import { confirmDialog, editText } from '../ui/dialog';
import { accentFlicker } from '../ui/flicker';
import { fillThrough, spinWhile } from '../ui/motion';
import { undo, type Toast, type ToastMessage } from '../ui/toast';
import type { TipMemory } from '../storage/store';
import { HOLD_TIP } from '../screens/settings-sections';
import { t } from '../i18n/lang';

/*
 * The settings page's working copy (Figma screen/edit-profile; «бета 0.81»
 * `openSettings`, `stSave`, `stClose`): every change goes into a draft that
 * is shown at once (also the look: accent, text size…), 💾 keeps it with
 * «скасувати» in the toast, leaving with changes asks first. Copy, export,
 * restore and deleting act on the saved diary right away.
 */

export interface SettingsEnv {
  /** Puts a profile's look (accent, «доступність») on screen. */
  look(profile: JsonObject): void;
  /** The phone's «reduce motion». */
  motionReduced(): boolean;
  /** Puts text on the clipboard; false when the phone refuses. */
  copyText(text: string): Promise<boolean>;
  /** Hands a file to the phone; throws when it refuses. */
  saveFile(name: string, content: string | Uint8Array<ArrayBuffer>): void;
  /** The font for PDFs; rejects when it can't load. */
  pdfFonts(): Promise<PdfFonts>;
  now(): Date;
  /** Tips for newcomers (storage/store.ts tipMemory); none without it. */
  tips?: TipMemory | undefined;
}

export interface SettingsHome {
  host: HTMLElement;
  toast: Toast;
  today(): DayKey;
  diary(): Diary;
  /** «остання копія — …» */
  backupLine(): string;
  /** «зберегти копію»; false when the phone refused the file. */
  saveCopy(): boolean;
  /** Stores the diary and stays here; false (and a toast) when the phone refuses. */
  keep(next: Diary): boolean;
  /** Starts over with this diary, on home. */
  restart(next: Diary, message?: ToastMessage): void;
  /** «стерти все»: the first screen, nothing kept. */
  erase(message: ToastMessage): void;
  /** ✕: home, every screen closed. */
  close(): void;
}

export interface SettingsPage {
  draw(): () => void;
  /** The page holds changes that 💾 has not kept yet: leaving asks first. */
  hasChanges(): boolean;
  /** Whether leaving now loses something; asks first, and puts the saved look back when it may go. */
  mayLeave(): Promise<boolean>;
}

/* COPY.md, Toasts and Settings; Нитка's drafts marked. */
const SAVED: ToastMessage = { message: t('збережено :)'), showIcon: true };
const COPIED: ToastMessage = { message: t('скопійовано — встав у чат зі своїм ШІ'), showIcon: true };
const NOT_COPIED: ToastMessage = { message: `${t('не вдалося скопіювати')} >_<`, error: true }; // draft
const FILE_SAVED: ToastMessage = { message: t('збережено'), showIcon: true };
const FILE_NOT_SAVED: ToastMessage = { message: `${t('не вдалося зберегти файл')} >_<`, error: true };
const NOT_A_COPY: ToastMessage = { message: `${t('цей файл не схожий на копію з body.log')} >_<`, error: true };
const RESTORED: ToastMessage = { message: t('відновлено з файлу :)'), showIcon: true };
const PDF_NOT_MADE: ToastMessage = { message: `${t('не вдалося зібрати PDF')} >_<`, error: true }; // «бета 0.81»
const PDF_FOOTER = `body.log · ${VERSION_LABEL}`; // Olesia, 2026-11-10; the name body.log since 2026-11-17
const PHRASE_MAX = 80;
const DAYS = ['день', 'дні', 'днів'] as const;

const same = (a: JsonObject, b: JsonObject) => JSON.stringify(a) === JSON.stringify(b);

/** The page's working copy and what it does; one instance per visit to the settings. */
class Draft implements SettingsPage {
  private saved: JsonObject;
  private draft: JsonObject;
  private open = new Set<PartId>();
  private exportTab: ExportTab = 'records';
  private pasted = '';
  private shown = false;
  /** The «затисни» tip was hidden by a tap in this visit. */
  private tipQuiet = false;
  /** «їжа»: the AI import field and what it answered. */
  private food: FoodView = { pasted: '', lines: [] };
  readonly sections: SectionsEditor;
  /** «застосувати»: compares with the settings on screen; «зберегти» keeps the pasted ones at once. */
  readonly paste = new PasteFlow({
    current: () => this.draft,
    names: { accents: ACCENT_NAMES, accessibility: ACCESS_SHORT },
    copyText: (text) => this.env.copyText(text),
    say: (message) => this.say(message),
    show: () => {
      if (pasteFailed(this.paste.view)) this.pasted = '';
      this.redraw();
      this.home.host.querySelector<HTMLElement>('[data-paste-title]')?.focus();
    },
    save: (profile) => this.savePasted(profile),
  });

  constructor(private readonly env: SettingsEnv, private readonly home: SettingsHome) {
    // tidy: what the screen can't show is dropped, so its indices are the profile's
    this.saved = tidy(home.diary().profile);
    this.draft = this.saved;
    this.sections = new SectionsEditor({
      settings: () => this.settings(),
      profile: () => this.draft,
      change: (edit) => this.change(edit),
      replace: (profile) => this.change(() => profile),
      redraw: () => this.redraw(),
      say: (message) => this.say(message),
      menuOpened: () => this.env.tips?.succeed?.(HOLD_TIP),
    });
  }

  pastedText(): string {
    return this.pasted;
  }

  settings(): Settings {
    return readSettings(this.draft);
  }

  say(message: ToastMessage): void {
    this.home.toast.show(message);
  }

  draw = (): (() => void) => {
    this.shown = true;
    showSettings(this.home.host, {
      settings: this.settings(),
      open: this.open,
      motionReduced: this.env.motionReduced(),
      backupLine: this.home.backupLine(),
      exportTab: this.exportTab,
      pasted: this.pasted,
      pasteView: this.paste.view,
      sections: { ...this.sections.view(), holdTip: !this.tipQuiet && (this.env.tips?.open(HOLD_TIP) ?? false) },
      unsaved: !same(this.draft, this.saved),
      food: this.food,
    }, {
      act: (action) => ACTS[action.act](this, action as never),
      paste: (text) => {
        this.pasted = text;
        this.paste.reset();
      },
      restore: (file) => void this.restore(file),
      lifted: () => this.sections.lifted(),
      tipHushed: () => {
        this.tipQuiet = true;
      },
    });
    return () => {
      this.shown = false;
    };
  };

  redraw(): void {
    if (this.shown) this.draw();
  }

  change(edit: ProfileEdit): void {
    // F-01: «скасувати» for an earlier change is no longer true
    this.home.toast.changed();
    this.draft = edit(this.draft);
    this.env.look(this.draft);
    this.redraw();
  }

  toggle(part: PartId): void {
    this.open = new Set(this.open);
    if (!this.open.delete(part)) this.open.add(part);
    this.redraw();
  }

  showTab(tab: ExportTab): void {
    this.exportTab = tab;
    this.redraw();
  }

  /* ---- 💾 and leaving ---- */

  /** Makes `profile` the saved one (and the draft); false when the phone refused. */
  private keepProfile(profile: JsonObject): boolean {
    if (!this.home.keep({ ...this.home.diary(), profile })) return false;
    this.saved = profile;
    this.draft = profile;
    this.redraw();
    return true;
  }

  /**
   * Saves at once; the page drawn anew turns the ASCII spinner on 💾 for a
   * moment (MICROINTERACTIONS.md, «збереження в налаштуваннях»).
   */
  save(): void {
    const before = this.saved;
    if (!this.keepProfile(cleanForSave(this.draft))) return;
    void spinWhile(this.button('save'), Promise.resolve());
    this.say({ ...SAVED, action: undo(() => this.keepProfile(before)) });
  }

  /**
   * Keeps pasted settings in place of the saved ones and of the changes not
   * saved yet; «скасувати» brings both back. The records are not touched.
   */
  private savePasted(profile: JsonObject): void {
    const saved = this.saved;
    const draft = this.draft;
    if (!this.keepProfile(profile)) return;
    this.pasted = '';
    this.redraw();
    this.say({
      ...SAVED,
      action: undo(() => {
        if (!this.keepProfile(saved)) return;
        this.draft = draft;
        this.env.look(draft);
        this.redraw();
      }),
    });
  }

  hasChanges = (): boolean => !same(this.draft, this.saved);

  mayLeave = async (): Promise<boolean> => {
    if (this.hasChanges()) {
      const answer = await confirmDialog({
        title: t('вийти без збереження?'), body: t('зміни на цій сторінці пропадуть.'), confirm: t('вийти'), cancel: t('залишитися'),
      });
      if (answer !== 'confirm') return false;
    }
    this.forget();
    return true;
  };

  /** Drops the draft and puts the saved look back. */
  private forget(): void {
    this.draft = this.saved;
    this.env.look(this.saved);
  }

  async close(): Promise<void> {
    if (await this.mayLeave()) this.home.close();
  }

  /* ---- the phrase ---- */

  async editPhrase(index: number, adding: boolean): Promise<void> {
    const phrases = this.settings().encouragement;
    const typed = await editText({ label: t('підбадьорлива фраза'), value: phrases[index] ?? '', maxLength: PHRASE_MAX });
    if (typed) this.change(withEncouragement(phrases.map((p, i) => (i === index ? typed : p)).concat(adding ? [typed] : [])));
  }

  async removePhrase(index: number): Promise<void> {
    const phrases = this.settings().encouragement;
    const answer = await confirmDialog({
      title: t('видалити «{name}»?', { name: phrases[index]! }), body: t('її більше не буде в налаштуваннях.'), confirm: t('видалити'), cancel: t('скасувати'),
    });
    if (answer === 'confirm') this.change(withEncouragement(phrases.filter((_, i) => i !== index)));
  }

  /* ---- copy, export, restore ---- */

  /** The button of `act` on the page now. */
  private button(act: string): HTMLElement | null {
    return this.home.host.querySelector<HTMLElement>(`[data-act="${act}"]`);
  }

  /** A button's work is done: the fill runs through it, its label re-forms, vibration 18 ms. */
  private finished(act: string): void {
    fillThrough(this.button(act));
    buzz(18, this.settings().accessibility);
  }

  async copy(text: string, act: string): Promise<void> {
    const copied = await this.env.copyText(text);
    if (copied) this.finished(act);
    this.say(copied ? COPIED : NOT_COPIED);
  }

  async copyPrompt(): Promise<void> {
    if (await copyPrompt((text) => this.env.copyText(text), (message) => this.say(message))) this.finished('copy-prompt');
  }

  copySettings(): Promise<void> {
    return this.copy(JSON.stringify(withoutFood(this.draft), null, 1), 'copy-settings');
  }

  exportText(): Promise<void> {
    const diary = this.home.diary();
    const settings = readSettings(diary.profile);
    const today = this.home.today();
    return this.copy(this.exportTab === 'records' ? recordsText(diary.days, settings, today) : exercisesText(settings, today), 'export-ai');
  }

  exportJson(): void {
    const file = exportFile(this.exportTab, this.home.diary(), this.home.today(), this.env.now());
    if (this.hand(file.name, file.text)) this.finished('export-json');
  }

  async exportPdf(): Promise<void> {
    const diary = this.home.diary();
    const doc = pdfDocument(this.exportTab, diary.days, readSettings(diary.profile), this.home.today(), PDF_FOOTER);
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      // the font loads with the first PDF: the spinner waits on the button
      bytes = buildPdf(doc.lines, await spinWhile(this.button('export-pdf'), this.env.pdfFonts()));
    } catch {
      return this.say(PDF_NOT_MADE);
    }
    if (this.hand(doc.name, bytes)) this.finished('export-pdf');
  }

  /** Gives a file to the phone and says how it went; false when the phone refused. */
  private hand(name: string, content: string | Uint8Array<ArrayBuffer>): boolean {
    try {
      this.env.saveFile(name, content);
    } catch {
      this.say(FILE_NOT_SAVED);
      return false;
    }
    this.say(FILE_SAVED);
    return true;
  }

  async restore(file: File): Promise<void> {
    const copied = await readCopy(file);
    if (!copied) return this.say(NOT_A_COPY);
    if (russianReason(copied.profile)) return this.say(RUSSIAN_COPY);
    const n = Object.keys(copied.days).length;
    // A-08 (Olesia, 2026-11-14): a copy of what is here now is offered before it is replaced
    const answer = await confirmDialog({
      title: t('поточні дані буде замінено. спершу зберегти копію?'),
      body: `${t('у файлі')} ${n} ${plural(n, DAYS)} ${t('записів і налаштування. вони замінять ті, що є зараз.')}`,
      extra: t('зберегти й відновити'),
      confirm: t('відновити без збереження'),
      cancel: t('скасувати'),
    });
    if (answer === 'cancel') return;
    // the phone refused the file: nothing is replaced without the copy the person asked for
    if (answer === 'extra' && !this.home.saveCopy()) return;
    this.forget();
    this.home.restart(copied, RESTORED);
  }

  backup(): void {
    if (!this.home.saveCopy()) return;
    this.redraw();
    this.finished('backup');
  }

  /**
   * A new accent: the page marks it at once, and only the accent colour
   * flickers, the new one put on in the middle. The look put on is the draft
   * of that moment, so leaving meanwhile never brings back an unsaved accent.
   */
  accent(accent: Accent): void {
    this.home.toast.changed();
    this.draft = withAccent(accent)(this.draft);
    this.redraw();
    accentFlicker(document.documentElement, () => this.env.look(this.draft));
  }

  /* ---- deleting (ACCESSIBILITY.md: a tap and a confirmation, no hold) ---- */

  async deleteRecords(): Promise<void> {
    // E-04: no «видалене не повернути»: the toast that follows offers «скасувати»
    const answer = await confirmDialog({ title: t('видалити тільки записи?'), confirm: t('видалити'), cancel: t('скасувати') });
    if (answer !== 'confirm') return;
    const before = this.home.diary();
    if (!this.home.keep({ ...before, days: {} })) return;
    this.say({ message: t('записи видалено'), showIcon: true, action: undo(() => this.home.keep({ ...this.home.diary(), days: before.days })) });
  }

  async deleteAll(): Promise<void> {
    const answer = await confirmDialog({
      title: t('стерти все разом з налаштуваннями?'),
      body: t('спершу збережи копію.'),
      extra: t('зберегти копію'),
      confirm: t('стерти все'),
      cancel: t('скасувати'),
    });
    if (answer === 'extra') return this.backup();
    if (answer !== 'confirm') return;
    const before = this.home.diary();
    this.forget();
    this.home.erase({ message: t('усе видалено'), showIcon: true, action: undo(() => this.home.restart(before)) });
  }

  /* ---- «їжа» (FOOD-SECTION.md) ---- */

  foodText(text: string): void {
    this.food = { pasted: text, lines: [] };
  }

  foodRef(key: FoodNumber, typed: string): void {
    const value = parseNumber(typed);
    if (value === (this.settings().food.ref[key] ?? null)) return;
    this.change((profile) => withRef(profile, key, value === null ? null : tenth(value)));
  }

  async editDish(index: number | null): Promise<void> {
    const { dishes } = this.settings().food;
    const dish = index === null ? null : dishes[index] ?? null;
    const answer = await dishSheet({ dish, taken: dishes.filter((_, i) => i !== index).map((x) => x.name) });
    if (answer === null) return;
    const next = answer.kind === 'delete'
      ? dishes.filter((_, i) => i !== index)
      : index === null ? [...dishes, answer.dish] : dishes.map((x, i) => (i === index ? answer.dish : x));
    this.change((profile) => withFood(profile, { dishes: next }));
  }

  async foodImport(): Promise<void> {
    const read = readFoodPaste(this.food.pasted);
    if (read.kind === 'refused') {
      this.food = { pasted: '', lines: read.lines };
      return this.redraw();
    }
    const { dishes } = this.settings().food;
    const twins = read.dishes.filter((dish) => findDish(dishes, dish.name)).map((dish) => dish.name);
    let replace = false;
    if (twins.length) {
      const answer = await confirmDialog({
        title: t('такі страви вже є'), body: twins.join(', '), confirm: t('замінити'), cancel: t('пропустити'),
      });
      replace = answer === 'confirm';
    }
    this.food = { pasted: '', lines: [] };
    this.change((profile) => withFood(profile, { dishes: mergeDishes(dishes, read.dishes, replace) }));
    this.say({ message: `${t('додано страв:')} ${read.dishes.length - (replace ? 0 : twins.length)}`, showIcon: true });
  }

  /* ---- the goal and the pulse timer ---- */

  goalKind(kind: ActivityKind, on: boolean): void {
    const done = this.settings().goal.done.filter((k) => k !== kind);
    this.change(withGoal({ done: on ? [...done, kind] : done }));
  }

  goalDays(delta: number): void {
    this.change(withGoal({ days: this.settings().goal.days + delta }));
  }

  /** Switching a timer on starts at 30 s (Figma); switching off keeps its length. */
  timer(trackerId: string, on: boolean): void {
    const tracker = this.settings().trackers.find((t) => t.id === trackerId);
    const seconds = tracker?.kind === 'number' && tracker.timer !== null ? tracker.timer : 30;
    this.change(withPulseTimer(trackerId, on, seconds));
  }
}

type Acts = { readonly [K in SettingsAct['act']]: (page: Draft, action: Extract<SettingsAct, { act: K }>) => void };

/** What each tap does. */
const ACTS: Acts = {
  part: (p, a) => p.toggle(a.part),
  'goal-on': (p, a) => p.change(withGoal({ enabled: a.on })),
  'goal-kind': (p, a) => p.goalKind(a.kind, a.on),
  'goal-any': (p, a) => p.change(withGoal({ any: a.on })),
  'goal-days': (p, a) => p.goalDays(a.delta),
  phrase: (p, a) => void p.editPhrase(a.index, false),
  'phrase-add': (p) => void p.editPhrase(p.settings().encouragement.length, true),
  'phrase-rm': (p, a) => void p.removePhrase(a.index),
  accent: (p, a) => p.accent(a.accent),
  access: (p, a) => p.change(withAccessibility(a.key, a.on)),
  timer: (p, a) => p.timer(a.tracker, a.on),
  'timer-length': (p, a) => p.change(withPulseTimer(a.tracker, true, a.seconds)),
  'export-tab': (p, a) => p.showTab(a.tab),
  save: (p) => p.save(),
  close: (p) => void p.close(),
  'copy-prompt': (p) => void p.copyPrompt(),
  'copy-settings': (p) => void p.copySettings(),
  apply: (p) => p.paste.apply(p.pastedText()),
  'paste-act': (p, a) => p.paste.act(a.name),
  backup: (p) => p.backup(),
  'export-ai': (p) => void p.exportText(),
  'export-json': (p) => p.exportJson(),
  'export-pdf': (p) => void p.exportPdf(),
  'delete-records': (p) => void p.deleteRecords(),
  'delete-all': (p) => void p.deleteAll(),
  edit: (p, a) => void p.sections.edit(a.path, a.edit, a.label),
  rm: (p, a) => void p.sections.remove(a.slot),
  inner: (p, a) => p.sections.toggle(a.id),
  add: (p, a) => void p.sections.add(a.what, a.kind, a.list),
  menu: (p, a) => p.sections.openMenu(a.slot, a.family, a.toggle),
  'menu-item': (p, a) => p.sections.menuItem(a.key),
  ask: (p, a) => p.sections.ask(a.path, a.moment, a.on),
  timed: (p, a) => p.sections.timed(a.path, a.on),
  wfield: (p, a) => p.sections.field('wfield', a.path, a.field, a.on),
  mfield: (p, a) => p.sections.field('mfield', a.path, a.field, a.on),
  'kind-on': (p, a) => p.sections.activity(a.kind, a.on),
  target: (p, a) => p.sections.target(a.kind, a.delta),
  pick: (p, a) => p.sections.pick(a.slot),
  'pick-start': (p) => p.sections.startPicking(),
  'pick-done': (p) => p.sections.finishPicking(true),
  'pick-cancel': (p) => p.sections.finishPicking(false),
  drop: (p, a) => p.sections.drop(a.from, a.target),
  'food-on': (p, a) => p.change((profile) => withFood(profile, { [a.key]: a.on })),
  'food-ref': (p, a) => p.foodRef(a.key, a.value),
  'food-dish': (p, a) => void p.editDish(a.index),
  'food-dish-add': (p) => void p.editDish(null),
  'food-paste': (p, a) => p.foodText(a.text),
  'food-prompt': (p) => void p.copy(dishesPrompt(), 'food-prompt'),
  'food-import': (p) => void p.foodImport(),
};

export function settingsPage(env: SettingsEnv, home: SettingsHome): SettingsPage {
  return new Draft(env, home);
}
