import { vi } from 'vitest';
import type { JsonObject } from '../domain/diary';
import type { PdfFonts } from '../pdf/pdf';
import type { ThemeChoice } from '../storage/store';
import { backupMemory } from '../storage/store';
import type { DeviceEnv, ShareData } from './pages';

/**
 * The parts of AppEnv that reach the phone itself (files, share sheet,
 * clipboard, back button, theme), as fakes a test can look into.
 */
export function fakeDevice() {
  let theme: ThemeChoice = 'dark';
  let arrived: (place: number) => void = () => {};
  // the browser's entries, each marked with its place; moves arrive at once
  const entries: number[] = [0];
  let index = 0;
  const move = (to: number) => {
    index = Math.max(0, Math.min(entries.length - 1, to));
    arrived(entries[index]!);
  };
  const device = {
    saved: [] as { name: string; text: string }[],
    shared: [] as ShareData[],
    copied: [] as string[],
    /** What the share sheet answers. */
    shareResult: 'shared' as Awaited<ReturnType<DeviceEnv['share']>>,
    copyWorks: true,
    saveWorks: true,
    /** Whether the PDF font loads. */
    fontsWork: true,
    /** Every profile whose look was put on screen, the last one shown now. */
    looks: [] as JsonObject[],
    /** The phone's «reduce motion». */
    motionReduced: false,
    /** The phone's own back button or gesture. */
    pressBack() {
      move(index - 1);
    },
    /** How many steps of «назад» the browser shows over home. */
    depth: () => entries[index]!,
  };
  const env: DeviceEnv = {
    theme: {
      shown: () => theme,
      choose: (next) => {
        theme = next;
      },
    },
    look: (profile) => device.looks.push(profile),
    motionReduced: () => device.motionReduced,
    backups: backupMemory(localStorage),
    saveFile(name, content) {
      if (!device.saveWorks) throw new Error('NotAllowedError');
      device.saved.push({ name, text: typeof content === 'string' ? content : new TextDecoder('latin1').decode(content) });
    },
    async pdfFonts() {
      if (!device.fontsWork) throw new Error('offline');
      return (await import('../pdf/noto-sans-mono-pdf.json')).default as PdfFonts;
    },
    share: vi.fn(async (data: ShareData) => {
      device.shared.push(data);
      return device.shareResult;
    }),
    copyText: vi.fn(async (text: string) => {
      if (device.copyWorks) device.copied.push(text);
      return device.copyWorks;
    }),
    now: () => new Date('2026-11-09T08:00:00Z'),
    history: {
      at: () => entries[index]!,
      push(place) {
        entries.length = index + 1;
        entries.push(place);
        index++;
      },
      go: (delta) => move(index + delta),
      listen: (listener) => {
        arrived = listener;
      },
    },
  };
  return { device, env };
}

/** Home sections that are all open (they start closed since 2026-11-11), for tests that log inside them. */
export const openSections = { open: () => true, remember: () => {} };
