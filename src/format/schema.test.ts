import { describe, expect, it } from 'vitest';
import schemaFile from './profile.schema.json';
import { checkSchema, KNOWN_KEYWORDS, schemaAt, type Schema } from './schema';

const SCHEMA: Schema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { title: 'назва', type: 'string', minLength: 1, maxLength: 5 },
    count: { type: 'integer', minimum: 1, maximum: 3 },
    weight: { type: 'number' },
    reps: { type: ['string', 'integer'] },
    kind: { enum: ['a', 'b'] },
    id: { $ref: '#/$defs/id' },
    tags: { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { type: 'string' } },
    thing: {
      title: 'річ',
      oneOf: [
        { type: 'object', additionalProperties: false, required: ['type'], properties: { type: { const: 'plain' } } },
        { type: 'object', additionalProperties: false, required: ['type', 'url'], properties: { type: { const: 'link' }, url: { type: 'string' } } },
        { title: 'пара', type: 'object', additionalProperties: false, required: ['pair'], properties: { pair: { type: 'array' } } },
      ],
    },
  },
  $defs: { id: { type: 'string', pattern: '^[a-z]+$', 'x-pattern-hint': 'малі латинські літери' } },
};

const issues = (value: unknown) => checkSchema(SCHEMA, value).issues;

describe('the schema reader', () => {
  it('knows every keyword profile.schema.json uses, so nothing is skipped silently', () => {
    const used = new Set<string>();
    const walk = (node: unknown, isSchema: boolean): void => {
      if (Array.isArray(node)) return node.forEach((entry) => walk(entry, isSchema));
      if (typeof node !== 'object' || node === null) return;
      for (const [key, value] of Object.entries(node)) {
        if (!isSchema) walk(value, true); // a map of names to schemas (properties, $defs)
        else {
          used.add(key);
          if (key === 'properties' || key === '$defs') walk(value, false);
          else if (key === 'items' || key === 'oneOf') walk(value, true);
        }
      }
    };
    walk(schemaFile, true);
    expect([...used].filter((keyword) => !KNOWN_KEYWORDS.includes(keyword))).toEqual([]);
  });

  it('passes a value that fits', () => {
    expect(checkSchema(SCHEMA, { name: 'ок', count: 2, weight: 2.5, reps: 10, kind: 'a', id: 'abc', tags: ['x'] })).toEqual({ issues: [], unknown: [] });
  });

  it('names a missing key, a wrong type and a value out of a list', () => {
    expect(issues({})).toEqual([{ kind: 'required', path: [], key: 'name' }]);
    expect(issues({ name: 5 })).toEqual([{ kind: 'type', path: ['name'], expected: ['string'] }]);
    expect(issues({ name: 'a', count: 1.5 })).toEqual([{ kind: 'type', path: ['count'], expected: ['integer'] }]);
    expect(issues({ name: 'a', weight: 3 })).toEqual([]);
    expect(issues({ name: 'a', reps: true })).toEqual([{ kind: 'type', path: ['reps'], expected: ['string', 'integer'] }]);
    expect(issues({ name: 'a', kind: 'c' })).toEqual([{ kind: 'enum', path: ['kind'], allowed: ['a', 'b'] }]);
    expect(issues([])).toEqual([{ kind: 'type', path: [], expected: ['object'] }]);
    expect(issues(null)).toEqual([{ kind: 'type', path: [], expected: ['object'] }]);
  });

  it('checks lengths (an emoji counts as one), numbers and patterns', () => {
    expect(issues({ name: '' })).toEqual([{ kind: 'minLength', path: ['name'], limit: 1, actual: 0 }]);
    expect(issues({ name: '🙂🙂🙂🙂🙂' })).toEqual([]);
    expect(issues({ name: 'задовга' })).toEqual([{ kind: 'maxLength', path: ['name'], limit: 5, actual: 7 }]);
    expect(issues({ name: 'a', count: 0 })).toEqual([{ kind: 'minimum', path: ['count'], limit: 1, actual: 0 }]);
    expect(issues({ name: 'a', count: 4 })).toEqual([{ kind: 'maximum', path: ['count'], limit: 3, actual: 4 }]);
    expect(issues({ name: 'a', id: 'Abc' })).toEqual([{ kind: 'pattern', path: ['id'], hint: 'малі латинські літери' }]);
  });

  it('checks lists: how many, repeats, and each entry up to the limit', () => {
    expect(issues({ name: 'a', tags: [] })).toEqual([{ kind: 'minItems', path: ['tags'], limit: 1, actual: 0 }]);
    expect(issues({ name: 'a', tags: ['x', 'x'] })).toEqual([{ kind: 'unique', path: ['tags'] }]);
    expect(issues({ name: 'a', tags: ['x', 1, 2, 3] })).toEqual([
      { kind: 'maxItems', path: ['tags'], limit: 2, actual: 4 },
      { kind: 'type', path: ['tags', 1], expected: ['string'] },
    ]);
  });

  it('lists a key the schema does not name as unknown, not as an error', () => {
    expect(checkSchema(SCHEMA, { name: 'a', extra: 1, thing: { type: 'plain', more: 2 } })).toEqual({
      issues: [], unknown: [['extra'], ['thing', 'more']],
    });
  });

  it('picks the `oneOf` branch by its const, then by its required keys', () => {
    expect(issues({ name: 'a', thing: { type: 'link' } })).toEqual([{ kind: 'required', path: ['thing'], key: 'url' }]);
    expect(issues({ name: 'a', thing: { type: 'link', url: 'x' } })).toEqual([]);
    expect(issues({ name: 'a', thing: { pair: 'x' } })).toEqual([{ kind: 'type', path: ['thing', 'pair'], expected: ['array'] }]);
    // nothing matches: only the key that tells the branches apart is judged, with every value it may have
    expect(checkSchema(SCHEMA, { name: 'a', thing: { type: 'other', more: 1 } })).toEqual({
      issues: [{ kind: 'enum', path: ['thing', 'type'], allowed: ['plain', 'link'] }], unknown: [],
    });
    expect(issues({ name: 'a', thing: {} })).toEqual([{ kind: 'required', path: ['thing'], key: 'type' }]);
    expect(issues({ name: 'a', thing: 'text' })).toEqual([{ kind: 'type', path: ['thing'], expected: ['object'] }]);
    // branches that differ only by their required keys: the first one speaks
    const plain: Schema = { oneOf: [{ type: 'object', required: ['a'] }, { type: 'object', required: ['b'] }] };
    expect(checkSchema(plain, {}).issues).toEqual([{ kind: 'required', path: [], key: 'a' }]);
  });

  it('fails loudly on a $ref it cannot follow', () => {
    expect(() => checkSchema({ $ref: '#/$defs/none' }, 1)).toThrow('unknown $ref');
    expect(() => checkSchema({ $ref: 'other.json' }, 1)).toThrow('unknown $ref');
  });

  it('finds the schema of a place, for its title', () => {
    const value = { name: 'a', thing: { pair: [] }, tags: ['x'] };
    expect(schemaAt(SCHEMA, value, ['name'])?.title).toBe('назва');
    expect(schemaAt(SCHEMA, value, ['thing'])?.title).toBe('річ');
    expect(schemaAt(SCHEMA, value, ['thing', 'pair'])?.type).toBe('array');
    expect(schemaAt(SCHEMA, value, ['tags', 0])?.type).toBe('string');
    expect(schemaAt(SCHEMA, value, ['nope'])).toBeNull();
    expect(schemaAt(SCHEMA, value, ['name', 'deeper'])).toBeNull();
  });
});
