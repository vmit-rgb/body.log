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

/** A known emoticon standing alone: after a space or the start, before a space, the end or a sign. */
const EMOTICON = /(?<=^|\s)(?:<3|>_<|\^_\^|\^\^|~\(˘▾˘~\)|[:;=]-?[)(]+|:[D3P])(?=$|\s|[.,!?…])/g;

const span = (emoticon: string) => `<span class="emoticon" aria-hidden="true">${esc(emoticon)}</span>`;

/** The text, safe inside HTML, with each emoticon in an accent span. */
export function emoticonsHtml(text: string): string {
  let html = '';
  let from = 0;
  for (const found of text.matchAll(EMOTICON)) {
    html += esc(text.slice(from, found.index)) + span(found[0]);
    from = found.index + found[0].length;
  }
  return html + esc(text.slice(from));
}

/** What a screen reader hears: the text without its emoticons. */
export function withoutEmoticons(text: string): string {
  return text.replace(EMOTICON, '').replace(/\s{2,}/g, ' ').replace(/\s+([.,!?…])/g, '$1').trim();
}
