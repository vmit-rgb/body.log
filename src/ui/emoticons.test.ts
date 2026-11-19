import { describe, expect, it } from 'vitest';
import { emoticonsHtml, withoutEmoticons } from './emoticons';

const SPAN = (emoticon: string) => `<span class="emoticon" aria-hidden="true">${emoticon}</span>`;

describe('emoticonsHtml (E-17)', () => {
  it('puts each emoticon of the app in an accent span', () => {
    expect(emoticonsHtml('збережено :)')).toBe(`збережено ${SPAN(':)')}`);
    expect(emoticonsHtml('не вдалося зберегти :( спробуй ще раз.')).toBe(`не вдалося зберегти ${SPAN(':(')} спробуй ще раз.`);
    expect(emoticonsHtml('зупинись <3')).toBe(`зупинись ${SPAN('&lt;3')}`);
    expect(emoticonsHtml('текст завеликий >_<')).toBe(`текст завеликий ${SPAN('&gt;_&lt;')}`);
    expect(emoticonsHtml('купа днів :3')).toBe(`купа днів ${SPAN(':3')}`);
  });

  it('knows the usual ones an AI may put into a phrase', () => {
    for (const emoticon of [';)', ':D', ':P', '^^', '^_^', ':-)', ':-(', '=)', ':))', '~(˘▾˘~)']) {
      expect(emoticonsHtml(`ок ${emoticon}`)).toBe(`ок ${SPAN(emoticon)}`);
    }
  });

  it('takes one at the start and one before a sign', () => {
    expect(emoticonsHtml(':) привіт')).toBe(`${SPAN(':)')} привіт`);
    expect(emoticonsHtml('привіт :)!')).toBe(`привіт ${SPAN(':)')}!`);
  });

  it('leaves what only looks like one: times, brackets, words', () => {
    expect(emoticonsHtml('о 10:30 (вечір)')).toBe('о 10:30 (вечір)');
    expect(emoticonsHtml('крок 3:3')).toBe('крок 3:3');
    expect(emoticonsHtml('a<3b')).toBe('a&lt;3b');
  });

  it('escapes the rest, so text from the settings stays text', () => {
    expect(emoticonsHtml('<img src=x onerror=alert(1)> :)')).toBe(`&lt;img src=x onerror=alert(1)&gt; ${SPAN(':)')}`);
  });
});

describe('withoutEmoticons', () => {
  it('drops them with their space, keeps the signs', () => {
    expect(withoutEmoticons('збережено :)')).toBe('збережено');
    expect(withoutEmoticons('не вдалося зберегти :( спробуй ще раз.')).toBe('не вдалося зберегти спробуй ще раз.');
    expect(withoutEmoticons('привіт :)!')).toBe('привіт!');
  });
});

/*
 * The one way, kept: a text in the code with an emoticon is either a toast
 * message (the toast runs it through `emoticonsHtml`) or in a file that
 * uses `emoticonsHtml`. No other accent rule for emoticons in the styles.
 */
describe('every emoticon in the code goes one way', () => {
  const code = import.meta.glob<string>(['../**/*.ts', '!../**/*.test.ts', '!../ui/hero/**', '!../prompt/**', '!./emoticons.ts', '!../components-page.ts'], { query: '?raw', import: 'default', eager: true });
  const css = import.meta.glob<string>('../styles/*.css', { query: '?raw', import: 'default', eager: true });
  // texts that another file shows, and that file marks them
  const SHOWN_ELSEWHERE: Record<string, string> = {
    '../home/home-view.ts': 'section lines → screens/home.ts leadOf',
    '../domain/examples.ts': 'the example phrase → screens/home.ts fillHero',
    '../paste/read.ts': 'refusal titles → screens/paste-result.ts',
  };
  const QUOTED = /['`][^'`]*(?:\s|^)(?:<3|>_<|:\(|:\)|:3|;\))(?=$|\s|[.,!?'`])[^'`]*['`]/;

  it('reads the source files', () => {
    expect(Object.keys(code).length).toBeGreaterThan(50);
    expect(code['../app/keeper.ts']).toContain('не вдалося зберегти :(');
  });

  it('finds them only where they are marked', () => {
    const loose: string[] = [];
    for (const [path, text] of Object.entries(code)) {
      const marks = text.includes('emoticonsHtml(') || path in SHOWN_ELSEWHERE;
      text.split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line) || !QUOTED.test(line)) return;
        if (/message: (?:t\()?[`']/.test(line) || marks) return;
        loose.push(`${path}:${i + 1}`);
      });
    }
    expect(loose).toEqual([]);
  });

  it('has a single accent rule for them', () => {
    const all = Object.values(css).join('\n');
    expect(all).not.toMatch(/__emoticon|good-job__heart/);
    expect(all.match(/^\.emoticon \{/gm)).toHaveLength(1);
  });
});
