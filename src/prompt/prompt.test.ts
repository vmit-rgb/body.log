import { describe, expect, it } from 'vitest';
import example from '../format/example-profile.json';
import schema from '../format/profile.schema.json';
import { readPaste } from '../paste/read';
import { PROMPT, readPrompt } from './prompt';

describe('the prompt file', () => {
  it('has its own version and is marked as a draft for now', () => {
    expect(PROMPT.version).toBe('0.1');
    expect(PROMPT.draft).toBe(true);
    expect(PROMPT.text.startsWith('You are helping a person set up body.log')).toBe(true);
  });

  it('names every accent value the format allows, so the AI maps the colour names right', () => {
    for (const accent of schema.properties.theme.properties.accent.enum) expect(PROMPT.text).toContain(`(${accent})`);
  });

  it('shows both shapes of «source» as the format has them (Gemini wrote links without url and by, 2026-11-18)', () => {
    expect(PROMPT.text).toContain('"source": { "type": "user" }');
    expect(PROMPT.text).toContain('"source": { "type": "link", "url": "https://…", "by": "user" }');
    const [user, link] = schema.$defs.source.oneOf;
    expect(user!.required).toEqual(['type']);
    expect(link!.required).toEqual(['type', 'url', 'by']);
  });

  it('carries the same schema and example the paste check reads, with no placeholder left', () => {
    expect(PROMPT.text).toContain(JSON.stringify(schema, null, 1));
    expect(PROMPT.text).toContain(JSON.stringify(example, null, 1));
    expect(PROMPT.text).not.toContain('{{');
    expect(PROMPT.text).not.toContain('---');
  });

  it('asks for lowercase texts in the settings, in every language, and its own example keeps to it (ChatGPT wrote «Біль у кисті», 2026-11-19)', () => {
    expect(PROMPT.text).toContain('Every text in the settings starts with a lowercase letter, in any language');
    expect(PROMPT.text).toContain('"name": "біль у кисті", not "Біль у кисті"');
    const texts: string[] = [];
    const walk = (value: unknown, key: string): void => {
      if (typeof value === 'string') {
        if (!['id', 'type', 'by', 'url', 'version', 'format', 'lang', 'accent', 'exercise'].includes(key)) texts.push(value);
      } else if (Array.isArray(value)) value.forEach((item) => walk(item, key));
      else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, k);
    };
    walk(example, '');
    expect(texts.length).toBeGreaterThan(10);
    expect(texts.filter((text) => /^\p{Lu}|[.!?]\s+\p{Lu}/u.test(text))).toEqual([]);
  });

  it('keeps the fixes from the AI tests of 2026-11-19 (russian word, button names, calques, step numbers, links)', () => {
    expect(PROMPT.text).toContain('Never put the English word into a text in another language');
    expect(PROMPT.text).not.toMatch(/translation in brackets|\((apply|settings|settings via AI|copy for AI|copy my settings for AI)\)/);
    expect(PROMPT.text).toContain('quote them exactly as they are («…»).');
    expect(PROMPT.text).toContain('«рачки», not «на четвереньках»');
    expect(PROMPT.text).toContain('Never mention step numbers');
    expect(PROMPT.text).toContain('Every link you give in the conversation also goes into that exercise\'s "source"');
    expect(PROMPT.text).toContain('List every exercise by name.');
  });

  it('gives an example the paste accepts as it is', () => {
    expect(readPaste(JSON.stringify(example, null, 1)).kind).toBe('accepted');
  });
});

describe('readPrompt', () => {
  it('reads the header and fills the parts', () => {
    expect(readPrompt('---\nversion: 1.2\nstatus: готово\n---\nПривіт, {{name}}!\n', { name: 'ШІ' })).toEqual({ version: '1.2', draft: false, text: 'Привіт, ШІ!' });
    expect(readPrompt('---\r\nversion: 0.3\r\n---\r\nтекст\r\n', {}).version).toBe('0.3');
  });

  it('fails loudly on a file without a header or a version, or with an unknown part', () => {
    expect(() => readPrompt('просто текст', {})).toThrow('no header');
    expect(() => readPrompt('---\nstatus: чернетка\n---\nтекст', {})).toThrow('no version');
    expect(() => readPrompt('---\nversion: 1\n---\n{{nope}}', {})).toThrow('unknown part');
  });
});
