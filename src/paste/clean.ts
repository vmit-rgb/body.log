/*
 * Finds the settings in what a person copied from their AI and repairs the
 * usual slips of an AI (brief, How it works, step 5): ``` fences, words
 * around the braces, “typographic” quotes in place of ", commas before a
 * closing brace, comments, odd spaces. Nothing here judges the settings:
 * it only gets to a value JSON.parse can read.
 */

export type Cleaned =
  | { readonly kind: 'value'; readonly value: unknown }
  /** No `{` anywhere, or what follows it is not JSON even after the repairs. */
  | { readonly kind: 'notJson' }
  /** A `{` that never closes: the answer was cut off. */
  | { readonly kind: 'truncated' };

const CURLY_DOUBLE = '“”„‟';
const ODD_SPACES = /[   -​  ⁠　﻿]/;

/** What stands inside ``` fences, in order; then the whole text. */
function candidates(text: string): string[] {
  const fenced = [...text.matchAll(/```[^\n`]*\n?([\s\S]*?)```/g)].map((match) => match[1]!);
  return [...fenced, text];
}

/**
 * The object that starts at the first `{`, rewritten as strict JSON; null
 * when there is no `{`, 'open' when it never closes.
 */
function firstObject(text: string): string | null | 'open' {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let out = '';
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const char = text[i]!;
    if (char === '"' || CURLY_DOUBLE.includes(char)) {
      const string = readString(text, i);
      if (!string) return 'open';
      out += string.json;
      i = string.end;
      continue;
    }
    if (char === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end;
      continue;
    }
    if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
      continue;
    }
    if (char === '{' || char === '[') depth += 1;
    if (char === '}' || char === ']') {
      depth -= 1;
      // a comma right before a closing brace goes
      out = out.replace(/,\s*$/, '');
    }
    out += ODD_SPACES.test(char) ? ' ' : char;
    i += 1;
    if (depth === 0) return out;
  }
  return 'open';
}

/**
 * A string that starts at `from`. One opened with " ends at the next
 * unescaped "; one opened with a typographic quote ends at the next
 * typographic quote, and a plain " inside it is escaped.
 */
function readString(text: string, from: number): { json: string; end: number } | null {
  const curly = text[from] !== '"';
  let body = '';
  for (let i = from + 1; i < text.length; i += 1) {
    const char = text[i]!;
    if (char === '\\') {
      body += char + (text[i + 1] ?? '');
      i += 1;
    } else if (curly ? CURLY_DOUBLE.includes(char) : char === '"') {
      return { json: `"${body}"`, end: i + 1 };
    } else if (char === '"') body += '\\"';
    else if (char === '\n') body += '\\n';
    else if (char === '\r') body += '';
    else if (char === '\t') body += '\\t';
    else body += char;
  }
  return null;
}

function parse(json: string): { value: unknown } | null {
  try {
    return { value: JSON.parse(json) };
  } catch {
    return null;
  }
}

export function cleanPaste(text: string): Cleaned {
  let open = false;
  for (const candidate of candidates(text)) {
    const object = firstObject(candidate);
    if (object === 'open') open = true;
    else if (object !== null) {
      const parsed = parse(object);
      if (parsed) return { kind: 'value', value: parsed.value };
    }
  }
  return open ? { kind: 'truncated' } : { kind: 'notJson' };
}
