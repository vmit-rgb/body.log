import example from '../format/example-profile.json';
import schema from '../format/profile.schema.json';
import file from './prompt.md?raw';

/*
 * The prompt a person gives their AI (brief, How it works, step 2). Its
 * text lives once, in prompt.md, and is bundled into the app, so
 * «скопіювати промпт» works offline. The file starts with its own
 * version (separate from the app's) and status; `{{schema}}` and
 * `{{example}}` are filled from the files the paste check reads, so the
 * format is described once.
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

/**
 * Most characters a pasted prompt may have. Free Gemini silently cut a
 * paste at about 32 100 characters (AI re-test, 2026-11-19), so the schema
 * and the example go in without indentation and a test keeps the whole
 * text under this.
 */
export const PROMPT_MAX_LENGTH = 30_000;

export const PROMPT: Prompt = readPrompt(file, {
  schema: JSON.stringify(schema),
  example: JSON.stringify(example),
});
