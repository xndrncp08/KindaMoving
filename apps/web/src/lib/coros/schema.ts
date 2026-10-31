/**
 * Minimal JSON Schema check (type, required, properties, items, enum, numeric bounds)
 * used to verify an outgoing COROS tool payload against the tool's *live* inputSchema
 * before any write. Returns human-readable problems; empty means it conforms.
 */
type Schema = {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  anyOf?: Schema[];
  oneOf?: Schema[];
};
const typeOf = (v: unknown) =>
  Array.isArray(v)
    ? 'array'
    : v === null
      ? 'null'
      : Number.isInteger(v)
        ? 'integer'
        : typeof v;
export function validate(
  value: unknown,
  schema: Schema | undefined,
  path = '$',
  out: string[] = [],
): string[] {
  if (!schema || out.length > 20) return out;
  const alts = schema.anyOf ?? schema.oneOf;
  if (alts) {
    if (!alts.some((s) => validate(value, s, path).length === 0))
      out.push(`${path}: matches none of the allowed shapes`);
    return out;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const t = typeOf(value);
    if (!types.includes(t) && !(t === 'integer' && types.includes('number'))) {
      out.push(`${path}: expected ${types.join('|')}, got ${t}`);
      return out;
    }
  }
  if (schema.enum && !schema.enum.includes(value))
    out.push(`${path}: must be one of ${schema.enum.join(', ')}`);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum)
      out.push(`${path}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum)
      out.push(`${path}: above ${schema.maximum}`);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of schema.required ?? [])
      if (!(k in value)) out.push(`${path}.${k}: required`);
    for (const [k, s] of Object.entries(schema.properties ?? {}))
      if (k in value)
        validate((value as Record<string, unknown>)[k], s, `${path}.${k}`, out);
  }
  if (Array.isArray(value) && schema.items)
    value.forEach((v, i) => validate(v, schema.items, `${path}[${i}]`, out));
  return out;
}
