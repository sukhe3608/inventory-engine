const STATUS_BY_CODE = {
    NEGATIVE_STOCK_NOT_ALLOWED: 409,
    FORBIDDEN: 403,
    LOCATION_NOT_IN_TENANT: 404,
    VARIANT_NOT_IN_TENANT: 404,
    ORDER_NOT_IN_TENANT: 404,
    ORDER_NOT_FOUND: 404,
    INVALID_OR_UNSCOPED_LOCATION: 404,
    NO_ITEMS: 400,
    INVALID_ITEM: 400,
    NO_LOCATION: 400,
    INVALID_STATUS: 400,
    VARIANT_NOT_FOUND: 404,
};
function extractCode(message) {
    if (!message)
        return null;
    const found = message.match(/([A-Z][A-Z0-9_]{4,})/);
    if (!found)
        return null;
    const code = found[1];
    if (code in STATUS_BY_CODE)
        return code;
    return null;
}
export function fromProcError(err) {
    const msg = err?.message ?? String(err);
    const code = extractCode(msg);
    if (code) {
        return { kind: 'proc', status: STATUS_BY_CODE[code], code, message: msg };
    }
    return { kind: 'unknown', status: 400, message: msg };
}
export function validationError(message) {
    return { kind: 'validation', status: 400, message };
}
