// Permanent local cache for AI-suggested category icons.
// Keyed by normalizeFa(category name); once an online suggestion lands here
// the same category resolves fully offline forever (matcher layer 5).
export interface AiIconCacheEntry {
    icon: string;
    color: string;
    created_at: string;
}
const AI_ICON_CACHE_KEY = 'warekeep_ai_icon_cache';
// Parsed once per session; sanitizeFullData may look categories up several
// times per user action, so re-reading/parsing the blob every call is wasted work.
let memoizedCache: Record<string, AiIconCacheEntry> | null = null;
const hasLocalStorage = (): boolean => {
    try {
        return typeof window !== 'undefined' && !!window.localStorage;
    }
    catch {
        return false;
    }
};
// Category names are user input, so hostile keys like '__proto__' must behave
// like any other name: null-prototype objects make bracket assignment always
// create an own property instead of touching the prototype chain.
const toNullProtoRecord = (value: unknown): Record<string, AiIconCacheEntry> => {
    const record: Record<string, AiIconCacheEntry> = Object.create(null);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const key of Object.keys(value)) {
            record[key] = (value as Record<string, AiIconCacheEntry>)[key];
        }
    }
    return record;
};
export const readAiIconCache = (): Record<string, AiIconCacheEntry> => {
    if (memoizedCache)
        return memoizedCache;
    if (!hasLocalStorage())
        return toNullProtoRecord(null);
    try {
        const raw = window.localStorage.getItem(AI_ICON_CACHE_KEY);
        memoizedCache = toNullProtoRecord(raw ? JSON.parse(raw) : null);
        return memoizedCache;
    }
    catch {
        return toNullProtoRecord(null);
    }
};
export const getAiIconCacheEntry = (nameNorm: string): AiIconCacheEntry | null => {
    if (!nameNorm)
        return null;
    const cache = readAiIconCache();
    const entry = Object.prototype.hasOwnProperty.call(cache, nameNorm) ? cache[nameNorm] : undefined;
    if (!entry || typeof entry.icon !== 'string' || typeof entry.color !== 'string')
        return null;
    return entry;
};
export const setAiIconCacheEntry = (nameNorm: string, entry: Omit<AiIconCacheEntry, 'created_at'>): void => {
    if (!nameNorm || !hasLocalStorage())
        return;
    try {
        const cache = toNullProtoRecord(readAiIconCache());
        cache[nameNorm] = { ...entry, created_at: new Date().toISOString() };
        memoizedCache = cache;
        window.localStorage.setItem(AI_ICON_CACHE_KEY, JSON.stringify(cache));
    }
    catch {
        // Cache is best-effort; never let it break the add-category flow.
    }
};
export const clearAiIconCache = (): void => {
    memoizedCache = null;
    if (!hasLocalStorage())
        return;
    try {
        window.localStorage.removeItem(AI_ICON_CACHE_KEY);
    }
    catch {
        // best-effort
    }
};
