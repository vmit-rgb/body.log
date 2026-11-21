import { esc } from './html';

/*
 * Text emoticons («:)», «<3», «>_<»…) are always in the accent colour
 * (Olesia: COPY.md rules, 2026-11-08; E-17, 2026-11-18: all of them, one way).
 * The one way: the emoticon stays inside the text, and every place that
 * shows text runs it through `emoticonsHtml`. That also covers the texts
 * from the settings (encouragement phrases), where the AI may put one.
 *
 * The span is `aria-hidden`: a screen reader would read «:)» as
 * punctuation, and the toast already kept it out of what is heard (Нитка, E-17).
 */

/**
 * A known emoticon standing alone: after a space or the start (group 1, kept
 * as text), before a space, the end or a sign. No lookbehind: Safari
 * before 16.4 can't parse it, and one such regex stopped the whole app on
 * iOS 16.3 (the D-10 screen, Olesia's iPhone 12 mini, 2026-11-21).
 */
const EMOTICON = /(^|\s)(<3|>_<|\^_\^|\^\^|~\(˘▾˘~\)|[:;=]-?[)(]+|:[D3P])(?=$|\s|[.,!?…])/g;

const span = (emoticon: string) => `<span class="emoticon" aria-hidden="true">${esc(emoticon)}</span>`;

/** The text, safe inside HTML, with each emoticon in an accent span. */
export function emoticonsHtml(text: string): string {
  let html = '';
  let from = 0;
  for (const found of text.matchAll(EMOTICON)) {
    const start = found.index + found[1]!.length;
    const emoticon = found[2]!;
    html += esc(text.slice(from, start)) + span(emoticon);
    from = start + emoticon.length;
  }
  return html + esc(text.slice(from));
}

/** What a screen reader hears: the text without its emoticons. */
export function withoutEmoticons(text: string): string {
  return text.replace(EMOTICON, '$1').replace(/\s{2,}/g, ' ').replace(/\s+([.,!?…])/g, '$1').trim();
}
