import example from '../format/example-profile.json';
import schema from '../format/profile.schema.json';
import file from './prompt.md?raw';
import { type Prompt, readPrompt } from './read';

export { type Prompt, readPrompt } from './read';

/*
 * The prompt a person gives their AI (brief, How it works, step 2). Its
 * text lives once, in prompt.md, and is bundled into the app, so
 * «скопіювати промпт» works offline. The file starts with its own
 * version (separate from the app's) and status; `{{schema}}` and
 * `{{example}}` are filled from the files the paste check reads, so the
 * format is described once. The build also writes it as prompt.json for
 * the landing (vite.config.ts, src/prompt/read.ts).
 */

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
