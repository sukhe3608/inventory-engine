import { createHash } from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';
export function sha256Hex(value) {
    return createHash('sha256').update(value).digest('hex');
}
export function safeEqualHex(a, b) {
    const ab = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ab.length !== bb.length)
        return false;
    return timingSafeEqual(ab, bb);
}
