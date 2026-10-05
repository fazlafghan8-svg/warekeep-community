/**
 * Security & Performance Hardening for IPC Logging
 * Ensures no payload from Renderer can crash the Main process or flood logs.
 */
const LIMITS = {
    MAX_MSG_LEN: 5000, // Max characters for the main message
    MAX_OBJ_DEPTH: 4, // Max nesting level for objects
    MAX_ARR_LEN: 50, // Max items in an array
    MAX_STR_LEN: 2000, // Max characters for string values in meta
    MAX_KEYS: 50 // Max keys per object level
};
export const VALID_LOG_TAGS = ['APP', 'IPC', 'SYNC', 'STORAGE', 'AUTH', 'UI', 'PERFORMANCE', 'CRASH'];
export const sanitizeLogTag = (tag) => {
    if (typeof tag === 'string') {
        const upper = tag.toUpperCase();
        if (VALID_LOG_TAGS.includes(upper)) {
            return upper;
        }
    }
    return 'APP'; // Default fallback
};
export const sanitizeLogMessage = (msg) => {
    if (typeof msg !== 'string') {
        try {
            msg = String(msg);
        }
        catch (e) {
            return '[Unserializable Message]';
        }
    }
    if (msg.length > LIMITS.MAX_MSG_LEN) {
        return msg.substring(0, LIMITS.MAX_MSG_LEN) + `... [TRUNCATED ${msg.length - LIMITS.MAX_MSG_LEN} chars]`;
    }
    return msg;
};
export const sanitizeLogMeta = (meta) => {
    // Basic types pass through
    if (meta === null || meta === undefined)
        return {};
    if (typeof meta !== 'object')
        return { value: meta };
    // Circular reference detection
    const seen = new WeakSet();
    const process = (obj, depth) => {
        // Depth Limit
        if (depth > LIMITS.MAX_OBJ_DEPTH)
            return '[Max Depth Reached]';
        if (obj === null)
            return null;
        // Handle primitives
        if (typeof obj !== 'object') {
            if (typeof obj === 'string' && obj.length > LIMITS.MAX_STR_LEN) {
                return obj.substring(0, LIMITS.MAX_STR_LEN) + '...';
            }
            return obj;
        }
        // Circular Check
        if (seen.has(obj))
            return '[Circular]';
        seen.add(obj);
        // Handle Array
        if (Array.isArray(obj)) {
            if (obj.length > LIMITS.MAX_ARR_LEN) {
                const arr = obj.slice(0, LIMITS.MAX_ARR_LEN).map(i => process(i, depth + 1));
                arr.push(`[... ${obj.length - LIMITS.MAX_ARR_LEN} more items]`);
                return arr;
            }
            return obj.map(i => process(i, depth + 1));
        }
        // Handle Object
        const res = {};
        const keys = Object.keys(obj);
        const keysToProcess = keys.slice(0, LIMITS.MAX_KEYS);
        for (const key of keysToProcess) {
            // Prevent huge key names (unlikely but possible attack vector)
            const safeKey = key.length > 50 ? key.substring(0, 50) + '...' : key;
            try {
                res[safeKey] = process(obj[key], depth + 1);
            }
            catch (e) {
                res[safeKey] = '[Error Processing Value]';
            }
        }
        if (keys.length > LIMITS.MAX_KEYS) {
            res['_truncated'] = `[... ${keys.length - LIMITS.MAX_KEYS} more keys]`;
        }
        return res;
    };
    try {
        return process(meta, 0);
    }
    catch (e) {
        return { error: 'Meta sanitization failed', details: e.message };
    }
};
