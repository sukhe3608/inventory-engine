const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function requireUuid(value: unknown, label = 'id'): string {
  if (!isUuid(value)) {
    throw { kind: 'validation', message: `Invalid ${label}` } as { kind: string; message: string };
  }
  return value;
}