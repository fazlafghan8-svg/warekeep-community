const sanitizePrefix = (prefix: string): string => {
    const normalized = String(prefix || 'id')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || 'id';
};
const bytesToUuid = (bytes: Uint8Array): string => {
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20),
    ].join('-');
};
const createUuid = (): string => {
    const cryptoRef = globalThis.crypto;
    if (typeof cryptoRef?.randomUUID === 'function') {
        return cryptoRef.randomUUID();
    }
    if (typeof cryptoRef?.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        cryptoRef.getRandomValues(bytes);
        return bytesToUuid(bytes);
    }
    throw new Error('SECURE_RANDOM_UNAVAILABLE');
};
export const createUniqueId = (prefix = 'id'): string => `${sanitizePrefix(prefix)}-${createUuid()}`;
