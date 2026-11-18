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

  it('carries the same schema and example the paste check reads, with no placeholder left', () => {
    expect(PROMPT.text).toContain(JSON.stringify(schema, null, 1));
    expect(PROMPT.text).toContain(JSON.stringify(example, null, 1));
    expect(PROMPT.text).not.toContain('{{');
    expect(PROMPT.text).not.toContain('---');
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
