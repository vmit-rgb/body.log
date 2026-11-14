/*
 * A small reader of JSON Schema, only the part profile.schema.json uses, so
 * the app needs no library for it. A test walks the schema file and fails
 * on any keyword this reader doesn't know, so nothing is silently skipped.
 *
 * Two things differ from a general validator, both on purpose:
 * - a key the schema doesn't name is not an error: it is listed in
 *   `unknown`, and the paste decides what to do with it;
 * - `oneOf` picks its branch by the `const` properties (`kind`, `type`)
 *   and the required keys, so the errors speak about the branch the
 *   writer meant, not about all of them.
 */

export type Path = readonly (string | number)[];

export type JsonType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

export interface Schema {
  readonly $ref?: string;
  readonly $defs?: { readonly [name: string]: Schema };
  readonly title?: string;
  readonly type?: JsonType | readonly JsonType[];
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly properties?: { readonly [key: string]: Schema };
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly items?: Schema;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: boolean;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly pattern?: string;
  readonly 'x-pattern-hint'?: string;
  readonly oneOf?: readonly Schema[];
}

/** Every keyword the reader acts on or knowingly passes by. */
export const KNOWN_KEYWORDS: readonly string[] = [
  '$schema', '$ref', '$defs', 'title', 'description', 'type', 'const', 'enum', 'properties', 'required',
  'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength',
  'minimum', 'maximum', 'pattern', 'x-pattern-hint', 'oneOf',
];

export type Issue =
  | { readonly kind: 'required'; readonly path: Path; readonly key: string }
  | { readonly kind: 'type'; readonly path: Path; readonly expected: readonly JsonType[] }
  | { readonly kind: 'enum'; readonly path: Path; readonly allowed: readonly unknown[] }
  | { readonly kind: 'minLength' | 'maxLength' | 'minimum' | 'maximum' | 'minItems' | 'maxItems'; readonly path: Path; readonly limit: number; readonly actual: number }
  | { readonly kind: 'pattern'; readonly path: Path; readonly hint: string }
  | { readonly kind: 'unique'; readonly path: Path };

export interface Checked {
  readonly issues: readonly Issue[];
  /** Keys the schema doesn't name, each as the path to it. */
  readonly unknown: readonly Path[];
}

const isObject = (value: unknown): value is { readonly [key: string]: unknown } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function typeOf(value: unknown): JsonType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value as JsonType;
}

/** An integer is a number too. */
const fits = (actual: JsonType, expected: readonly JsonType[]) =>
  expected.includes(actual) || (actual === 'integer' && expected.includes('number'));

/** Text length as a person counts it (an emoji is one). */
const lengthOf = (text: string) => [...text].length;

class Reader {
  readonly issues: Issue[] = [];
  readonly unknown: Path[] = [];

  constructor(private readonly root: Schema) {}

  resolve(schema: Schema): Schema {
    let found = schema;
    while (found.$ref !== undefined) {
      const name = /^#\/\$defs\/(.+)$/.exec(found.$ref)?.[1];
      const target = name === undefined ? undefined : this.root.$defs?.[name];
      if (!target) throw new Error(`schema: unknown $ref ${found.$ref}`);
      // what stands next to a $ref (a title) stays on top of the target
      const { $ref: _ref, ...rest } = found;
      found = { ...target, ...rest };
    }
    return found;
  }

  /** The branch of a `oneOf` the value means: its consts match and its required keys are there. */
  branch(options: readonly Schema[], value: unknown): Schema {
    const resolved = options.map((option) => this.resolve(option));
    if (!isObject(value)) return resolved.find((option) => option.type !== 'object') ?? resolved[0]!;
    const constsMatch = (option: Schema) => Object.entries(option.properties ?? {})
      .every(([key, property]) => !('const' in this.resolve(property)) || this.resolve(property).const === value[key]);
    const hasRequired = (option: Schema) => (option.required ?? []).every((key) => key in value);
    const consts = (option: Schema) => Object.entries(option.properties ?? {})
      .map(([key, property]) => [key, this.resolve(property)] as const).filter(([, property]) => 'const' in property);
    const discriminated = (option: Schema) => consts(option).length > 0;
    return resolved.find((option) => discriminated(option) && constsMatch(option))
      ?? resolved.find((option) => !discriminated(option) && hasRequired(option))
      ?? this.kindOnly(resolved.flatMap(consts))
      ?? resolved[0]!;
  }

  /**
   * No branch fits and the branches differ by a key like `kind`: a schema
   * that asks only for that key with every value it may have, so the error
   * names them all and nothing else is judged by a branch chosen at random.
   */
  private kindOnly(consts: readonly (readonly [string, Schema])[]): Schema | undefined {
    const first = consts[0];
    if (!first) return undefined;
    const [key, property] = first;
    const { const: _const, ...rest } = property;
    const allowed = consts.filter(([name]) => name === key).map(([, each]) => each.const);
    return { type: 'object', required: [key], properties: { [key]: { ...rest, enum: allowed } } };
  }

  check(given: Schema, value: unknown, path: Path): void {
    const schema = this.resolve(given);
    if (schema.oneOf) return this.check(this.branch(schema.oneOf, value), value, path);
    if ('const' in schema && value !== schema.const) return void this.issues.push({ kind: 'enum', path, allowed: [schema.const] });
    if (schema.enum && !schema.enum.includes(value)) return void this.issues.push({ kind: 'enum', path, allowed: schema.enum });
    const actual = typeOf(value);
    if (schema.type !== undefined) {
      const expected = typeof schema.type === 'string' ? [schema.type] : schema.type;
      if (!fits(actual, expected)) return void this.issues.push({ kind: 'type', path, expected });
    }
    if (typeof value === 'string') this.text(schema, value, path);
    else if (typeof value === 'number') this.number(schema, value, path);
    else if (Array.isArray(value)) this.list(schema, value, path);
    else if (isObject(value)) this.object(schema, value, path);
  }

  private text(schema: Schema, value: string, path: Path): void {
    const length = lengthOf(value);
    if (schema.minLength !== undefined && length < schema.minLength) this.issues.push({ kind: 'minLength', path, limit: schema.minLength, actual: length });
    if (schema.maxLength !== undefined && length > schema.maxLength) this.issues.push({ kind: 'maxLength', path, limit: schema.maxLength, actual: length });
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) this.issues.push({ kind: 'pattern', path, hint: schema['x-pattern-hint'] ?? '' });
  }

  private number(schema: Schema, value: number, path: Path): void {
    if (schema.minimum !== undefined && value < schema.minimum) this.issues.push({ kind: 'minimum', path, limit: schema.minimum, actual: value });
    if (schema.maximum !== undefined && value > schema.maximum) this.issues.push({ kind: 'maximum', path, limit: schema.maximum, actual: value });
  }

  private list(schema: Schema, value: readonly unknown[], path: Path): void {
    if (schema.minItems !== undefined && value.length < schema.minItems) this.issues.push({ kind: 'minItems', path, limit: schema.minItems, actual: value.length });
    if (schema.maxItems !== undefined && value.length > schema.maxItems) this.issues.push({ kind: 'maxItems', path, limit: schema.maxItems, actual: value.length });
    if (schema.uniqueItems && new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length) this.issues.push({ kind: 'unique', path });
    // an overlong list is named once, not once per entry
    const items = schema.items;
    if (items) value.slice(0, schema.maxItems ?? value.length).forEach((entry, index) => this.check(items, entry, [...path, index]));
  }

  private object(schema: Schema, value: { readonly [key: string]: unknown }, path: Path): void {
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!(key in value)) this.issues.push({ kind: 'required', path, key });
    }
    for (const [key, entry] of Object.entries(value)) {
      const property = properties[key];
      if (property) this.check(property, entry, [...path, key]);
      else if (schema.additionalProperties === false) this.unknown.push([...path, key]);
    }
  }
}

/** Checks a value against the schema. */
export function checkSchema(schema: Schema, value: unknown): Checked {
  const reader = new Reader(schema);
  reader.check(schema, value, []);
  return { issues: reader.issues, unknown: reader.unknown };
}

/**
 * The schema of what sits at `path` in `value` (titles for messages); null
 * when the schema doesn't name it.
 */
export function schemaAt(schema: Schema, value: unknown, path: Path): Schema | null {
  const reader = new Reader(schema);
  let node: Schema = reader.resolve(schema);
  let at: unknown = value;
  for (const key of path) {
    if (node.oneOf) node = named(reader.branch(node.oneOf, at), node.title);
    const next = typeof key === 'number' ? node.items : node.properties?.[key];
    if (!next) return null;
    node = reader.resolve(next);
    at = isObject(at) || Array.isArray(at) ? (at as { readonly [key: string]: unknown })[key] : undefined;
  }
  return node;
}

/** A `oneOf` branch under the name of the whole («вправа», not «група вправ»), when the whole has one. */
function named(branch: Schema, title: string | undefined): Schema {
  return title === undefined ? branch : { ...branch, title };
}
