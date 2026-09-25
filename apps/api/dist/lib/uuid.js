const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value) {
    return typeof value === 'string' && UUID_RE.test(value);
}
export function requireUuid(value, label = 'id') {
    if (!isUuid(value)) {
        throw { kind: 'validation', message: `Invalid ${label}` };
    }
    return value;
}
