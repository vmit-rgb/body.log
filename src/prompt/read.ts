/*
 * Reading prompt.md, kept apart from prompt.ts: this file has no Vite-only
 * imports (`?raw`), so vite.config.ts can use it too and write the same
 * prompt into the build as prompt.json for the landing's «скопіювати
 * промпт» (PROFILE-FORMAT.md, «Where the prompt lives»: the text exists once).
 */

export interface Prompt {
  /** The prompt's own version, e.g. «0.1»: shown in the toast after copying. */
  readonly version: string;
  /** «чернетка» until the real text is written. */
  readonly draft: boolean;
  /** What is copied. */
  readonly text: string;
}

/** Reads a prompt file: `---`, `key: value` lines, `---`, then the text with its placeholders filled. */
export function readPrompt(source: string, parts: Readonly<Record<string, string>>): Prompt {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source.replace(/\r\n/g, '\n'));
  if (!match) throw new Error('prompt.md: no header');
  const header = new Map(match[1]!.split('\n').map((line) => {
    const [key, ...value] = line.split(':');
    return [key!.trim(), value.join(':').trim()] as const;
  }));
  const version = header.get('version');
  if (!version) throw new Error('prompt.md: no version');
  const text = match[2]!.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const part = parts[name];
    if (part === undefined) throw new Error(`prompt.md: unknown part {{${name}}}`);
    return part;
  });
  return { version, draft: header.get('status') === 'чернетка', text: text.trim() };
}

/** Where the build puts the prompt for the landing, next to index.html. */
export const PROMPT_FILE = 'prompt.json';

/** What prompt.json holds: the version for the landing's toast and the text to copy. */
export function promptFile(prompt: Prompt): string {
  return JSON.stringify({ version: prompt.version, text: prompt.text });
}
