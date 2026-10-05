// Offline icon matching engine for expense-category names.
// Decision chain (stops at the first confident layer):
//   1. exact  → normalized lookup
//   2. token  → per-word exact lookup for multi-word input
//   3. phonetic → homophone-folded lookup (whole input, then per token)
//   4. fuzzy  → Damerau-Levenshtein over folded keywords (typo correction)
//   5. cache  → previously stored online-AI results (fully offline)
//   7. default → 'tag' icon + stable hash-based color
// (Layer 6, the online AI fallback, lives in services/aiIconFallback.ts and
// only runs on submit — never while typing.)
import type { CategoryIconMeta, CategoryIconSource } from '../types';
import { ICON_DICTIONARY, ICON_COLOR_PALETTE, isKnownCategoryIcon, isCategoryIconColor } from './iconDictionary';
import { normalizeFa, phoneticFold } from './textNormalizer';
import { getAiIconCacheEntry } from './aiIconCache';
export interface IconResult {
    icon: string;
    color: string;
    source: CategoryIconSource;
    confidence: number;
    suggestedWord?: string;
}
interface IndexedKeyword {
    keyword: string; // canonical display form, used for spelling suggestions
    normalized: string;
    folded: string;
    icon: string;
    color: string;
    groupIndex: number;
}
interface MatcherIndex {
    exactMap: Map<string, IndexedKeyword>;
    foldMap: Map<string, IndexedKeyword>;
    flatList: IndexedKeyword[];
}
let matcherIndex: MatcherIndex | null = null;
const buildIndex = (): MatcherIndex => {
    const exactMap = new Map<string, IndexedKeyword>();
    const foldMap = new Map<string, IndexedKeyword>();
    const flatList: IndexedKeyword[] = [];
    ICON_DICTIONARY.forEach((entry, groupIndex) => {
        for (const keyword of [...entry.fa, ...entry.en]) {
            const normalized = normalizeFa(keyword);
            if (!normalized)
                continue;
            const indexed: IndexedKeyword = {
                keyword,
                normalized,
                folded: phoneticFold(keyword),
                icon: entry.icon,
                color: entry.color,
                groupIndex
            };
            // First entry wins on collisions so dictionary order stays authoritative.
            if (!exactMap.has(normalized))
                exactMap.set(normalized, indexed);
            if (!foldMap.has(indexed.folded))
                foldMap.set(indexed.folded, indexed);
            flatList.push(indexed);
        }
    });
    return { exactMap, foldMap, flatList };
};
const getIndex = (): MatcherIndex => {
    if (!matcherIndex)
        matcherIndex = buildIndex();
    return matcherIndex;
};
/**
 * Damerau-Levenshtein distance (optimal string alignment): counts adjacent
 * transpositions — e.g. «تلیفون» → «تیلفون» — as a single edit.
 */
export const damerauLevenshtein = (a: string, b: string): number => {
    const m = a.length;
    const n = b.length;
    if (m === 0)
        return n;
    if (n === 0)
        return m;
    let prevPrev = new Array<number>(n + 1).fill(0);
    let prev = new Array<number>(n + 1);
    let curr = new Array<number>(n + 1);
    for (let j = 0; j <= n; j++)
        prev[j] = j;
    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                curr[j] = Math.min(curr[j], prevPrev[j - 2] + 1);
            }
        }
        [prevPrev, prev, curr] = [prev, curr, prevPrev];
    }
    return prev[n];
};
const maxAllowedDistance = (foldedLength: number): number => {
    if (foldedLength <= 3)
        return 1;
    if (foldedLength <= 6)
        return 2;
    return 3;
};
const MIN_FUZZY_CONFIDENCE = 0.6;
export const djb2Hash = (value: string): number => {
    let hash = 5381;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
    }
    return hash;
};
export const getDefaultIconResult = (name: string): IconResult => {
    const normalized = normalizeFa(name);
    return {
        icon: 'tag',
        color: ICON_COLOR_PALETTE[djb2Hash(normalized || 'tag') % ICON_COLOR_PALETTE.length],
        source: 'default',
        confidence: 0
    };
};
interface FuzzyCandidate {
    indexed: IndexedKeyword;
    distance: number;
    confidence: number;
    tokenIndex: number;
    queryFolded: string;
}
const findBestFuzzy = (queryFolded: string, flatList: IndexedKeyword[], tokenIndex: number): FuzzyCandidate | null => {
    const queryLen = queryFolded.length;
    if (queryLen === 0)
        return null;
    const maxDist = maxAllowedDistance(queryLen);
    let best: FuzzyCandidate | null = null;
    for (const indexed of flatList) {
        const keywordLen = indexed.folded.length;
        if (Math.abs(keywordLen - queryLen) > maxDist)
            continue;
        const distance = damerauLevenshtein(queryFolded, indexed.folded);
        if (distance > maxDist)
            continue;
        const confidence = 1 - distance / Math.max(queryLen, keywordLen);
        if (confidence < MIN_FUZZY_CONFIDENCE)
            continue;
        if (!best ||
            distance < best.distance ||
            (distance === best.distance &&
                Math.abs(keywordLen - queryLen) < Math.abs(best.indexed.folded.length - queryLen))) {
            best = { indexed, distance, confidence, tokenIndex, queryFolded };
        }
    }
    return best;
};
/** Replaces the misspelled token inside the original (normalized) input so the
 *  "اصلاح نام" action can fix multi-word names without losing the other words. */
const buildSuggestion = (tokens: string[], tokenIndex: number, keyword: string): string => {
    if (tokens.length <= 1 || tokenIndex < 0)
        return keyword;
    return tokens.map((token, index) => (index === tokenIndex ? keyword : token)).join(' ');
};
const LATIN_LETTER_RE = /[a-z]/;
const ARABIC_SCRIPT_RE = /[؀-ۿﭐ-﷿ﹰ-﻿]/;
/** Persian compounds are head-initial («کرایه دکان» is a کرایه) while English
 *  ones are head-final ("Office Rent" is a rent) — token layers must walk the
 *  words from the head side of whichever script dominates the input. */
const isLatinDominant = (normalized: string): boolean => {
    let latin = 0;
    let arabic = 0;
    for (const char of normalized) {
        if (LATIN_LETTER_RE.test(char))
            latin++;
        else if (ARABIC_SCRIPT_RE.test(char))
            arabic++;
    }
    return latin > arabic;
};
const matchTokenCase = (original: string, replacement: string): string => {
    if (original.toLowerCase() === replacement)
        return original;
    if (original.length > 1 && original === original.toUpperCase() && /[A-Z]/.test(original)) {
        return replacement.toUpperCase();
    }
    if (/^[A-Z]/.test(original))
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    return replacement;
};
/** Suggestions are built in the normalized (lowercased) space; re-apply the
 *  casing of the user's original tokens so "Internit Bill" suggests
 *  "Internet Bill", not "internet bill". */
const adaptSuggestionCase = (rawName: string, suggestion: string): string => {
    if (!LATIN_LETTER_RE.test(suggestion))
        return suggestion;
    const rawTokens = rawName.trim().split(/\s+/);
    const suggestionTokens = suggestion.split(' ');
    if (rawTokens.length !== suggestionTokens.length)
        return suggestion;
    return suggestionTokens
        .map((token, index) => matchTokenCase(rawTokens[index], token))
        .join(' ');
};
const toResult = (indexed: IndexedKeyword, source: CategoryIconSource, confidence: number, suggestedWord?: string): IconResult => ({
    icon: indexed.icon,
    color: indexed.color,
    source,
    confidence,
    ...(suggestedWord ? { suggestedWord } : {})
});
// ---------------------------------------------------------------------------
// LRU memoization for the last 100 queries (keyed by normalized input).
// ---------------------------------------------------------------------------
const LRU_CAPACITY = 100;
const lruCache = new Map<string, IconResult>();
const lruGet = (key: string): IconResult | undefined => {
    const value = lruCache.get(key);
    if (value !== undefined) {
        lruCache.delete(key);
        lruCache.set(key, value);
    }
    return value;
};
const lruSet = (key: string, value: IconResult): void => {
    if (lruCache.has(key))
        lruCache.delete(key);
    lruCache.set(key, value);
    if (lruCache.size > LRU_CAPACITY) {
        const oldest = lruCache.keys().next().value;
        if (oldest !== undefined)
            lruCache.delete(oldest);
    }
};
/** Test hook: clears memoized results (the dictionary index is immutable). */
export const __clearIconMatcherCache = (): void => {
    lruCache.clear();
};
/** Drops one memoized entry — used when the AI cache gains a late answer so
 *  the next lookup reaches layer 5 instead of a stale memoized default. */
export const invalidateIconMatcherEntry = (name: string): void => {
    lruCache.delete(normalizeFa(name));
};
const matchNormalized = (normalized: string): IconResult => {
    const { exactMap, foldMap, flatList } = getIndex();
    // Layer 1 — exact match on the whole input.
    const exact = exactMap.get(normalized);
    if (exact)
        return toResult(exact, 'exact', 1);
    const tokens = normalized.split(' ').filter(Boolean);
    const isMultiWord = tokens.length > 1;
    // Walk tokens from the head side: first-to-last for Persian compounds
    // («کرایه دکان»), last-to-first for English ones ("Office Rent").
    const headOrderedTokens = tokens.map((token, index) => ({ token, index }));
    if (isLatinDominant(normalized))
        headOrderedTokens.reverse();
    // Layer 2 — token match: the head-most token with an exact hit wins.
    if (isMultiWord) {
        for (const { token } of headOrderedTokens) {
            const hit = exactMap.get(token);
            if (hit)
                return toResult(hit, 'token', 0.9);
        }
    }
    // Layer 3 — phonetic match on the folded whole input, then per token.
    const foldedWhole = phoneticFold(normalized);
    const phoneticWhole = foldMap.get(foldedWhole);
    if (phoneticWhole) {
        const suggestion = phoneticWhole.normalized !== normalized ? phoneticWhole.keyword : undefined;
        return toResult(phoneticWhole, 'phonetic', 0.85, suggestion);
    }
    if (isMultiWord) {
        for (const { token, index } of headOrderedTokens) {
            const hit = foldMap.get(phoneticFold(token));
            if (hit) {
                const suggestion = hit.normalized !== token
                    ? buildSuggestion(tokens, index, hit.keyword)
                    : undefined;
                return toResult(hit, 'phonetic', 0.85, suggestion);
            }
        }
    }
    // Layer 4 — fuzzy (Damerau-Levenshtein) on the whole input, then per token
    // (in head order, so equal-distance candidates resolve to the head noun).
    const candidates: FuzzyCandidate[] = [];
    const wholeCandidate = findBestFuzzy(foldedWhole, flatList, -1);
    if (wholeCandidate)
        candidates.push(wholeCandidate);
    if (isMultiWord) {
        for (const { token, index } of headOrderedTokens) {
            const tokenCandidate = findBestFuzzy(phoneticFold(token), flatList, index);
            if (tokenCandidate)
                candidates.push(tokenCandidate);
        }
    }
    if (candidates.length > 0) {
        const best = candidates.reduce((acc, candidate) => {
            if (candidate.distance < acc.distance)
                return candidate;
            if (candidate.distance === acc.distance && candidate.confidence > acc.confidence)
                return candidate;
            return acc;
        });
        const suggestion = buildSuggestion(tokens, best.tokenIndex, best.indexed.keyword);
        return toResult(best.indexed, 'fuzzy', best.confidence, suggestion);
    }
    // Layer 5 — permanent cache of earlier online-AI answers.
    const cached = getAiIconCacheEntry(normalized);
    if (cached && isKnownCategoryIcon(cached.icon) && isCategoryIconColor(cached.color)) {
        return { icon: cached.icon, color: cached.color, source: 'cache', confidence: 0.9 };
    }
    // Layer 7 — deterministic default.
    return getDefaultIconResult(normalized);
};
/**
 * Resolves an icon + color for a category name, fully offline, in O(dictionary)
 * worst case (well under 10ms). Never throws and never touches the network.
 */
export const matchCategoryIcon = (name: string): IconResult => {
    const normalized = normalizeFa(name);
    if (!normalized)
        return getDefaultIconResult('');
    const result = lruGet(normalized) ?? (() => {
        const fresh = matchNormalized(normalized);
        lruSet(normalized, fresh);
        return fresh;
    })();
    // Casing is per-call (raw input), never stored in the memoized result.
    if (result.suggestedWord) {
        const cased = adaptSuggestionCase(name, result.suggestedWord);
        if (cased !== result.suggestedWord)
            return { ...result, suggestedWord: cased };
    }
    return result;
};
/** Number of milliseconds it took to build the index (startup budget: 20ms). */
export const warmUpIconMatcher = (): number => {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    getIndex();
    const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return end - start;
};
/**
 * Meta stored against a category. Prefers the saved entry; falls back to a
 * fresh offline match so categories that predate this feature (or arrive via
 * sync from an older client) still render a sensible icon.
 *
 * - `manual` entries are sacred: returned verbatim even when this client
 *   version doesn't recognize the icon/color (rendering falls back safely).
 * - `default` entries are always recomputed so a later dictionary update or a
 *   late-cached AI answer (layer 5) can upgrade them.
 */
export const resolveCategoryIconMeta = (icons: Record<string, CategoryIconMeta> | undefined, name: string): CategoryIconMeta => {
    const saved = icons?.[name];
    if (saved && saved.source === 'manual' && typeof saved.icon === 'string' && saved.icon) {
        return saved;
    }
    if (saved &&
        saved.source !== 'default' &&
        isKnownCategoryIcon(saved.icon) &&
        isCategoryIconColor(saved.color)) {
        return saved;
    }
    const matched = matchCategoryIcon(name);
    return { icon: matched.icon, color: matched.color, source: matched.source };
};
const VALID_SOURCES: ReadonlySet<string> = new Set([
    'exact', 'token', 'phonetic', 'fuzzy', 'cache', 'ai', 'manual', 'default'
]);
/**
 * Normalizer/backfill used by the persistence layer on every load and save:
 * keeps valid entries (manual picks are sacred), rebuilds invalid ones, fills
 * missing categories via the offline matcher and prunes deleted categories.
 */
export const normalizeExpenseCategoryIcons = (rawIcons: unknown, categories: unknown): Record<string, CategoryIconMeta> => {
    const list: string[] = Array.isArray(categories)
        ? categories.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
        : [];
    const source = (rawIcons && typeof rawIcons === 'object' && !Array.isArray(rawIcons)
        ? rawIcons
        : {}) as Record<string, Partial<CategoryIconMeta> | undefined>;
    const isManualEntry = (entry: Partial<CategoryIconMeta> | undefined): entry is CategoryIconMeta => !!entry && entry.source === 'manual' && typeof entry.icon === 'string' && entry.icon !== '' &&
        typeof entry.color === 'string' && entry.color !== '';
    // Null prototype: category names are user input, and bracket-assigning a
    // hostile name like '__proto__' onto a plain literal would silently write
    // to the prototype instead of storing the entry.
    const normalized: Record<string, CategoryIconMeta> = Object.create(null);
    for (const name of list) {
        const entry = source[name];
        if (isManualEntry(entry)) {
            // Manual picks are sacred — kept verbatim even when this client
            // version doesn't know the icon/color (a newer client may).
            normalized[name] = { icon: entry.icon, color: entry.color, source: 'manual' };
        }
        else if (entry &&
            entry.source !== 'default' &&
            isKnownCategoryIcon(entry.icon) &&
            isCategoryIconColor(entry.color) &&
            typeof entry.source === 'string' &&
            VALID_SOURCES.has(entry.source)) {
            normalized[name] = { icon: entry.icon, color: entry.color, source: entry.source as CategoryIconSource };
        }
        else {
            // Missing, invalid or 'default' entries are (re)computed so a late
            // AI-cache answer or dictionary update can upgrade them.
            const matched = matchCategoryIcon(name);
            normalized[name] = { icon: matched.icon, color: matched.color, source: matched.source };
        }
    }
    // Manual picks whose category is temporarily absent (e.g. mid-merge, or a
    // category re-added later from another device) are kept instead of pruned.
    for (const [name, entry] of Object.entries(source)) {
        if (!(name in normalized) && isManualEntry(entry)) {
            normalized[name] = { icon: entry.icon, color: entry.color, source: 'manual' };
        }
    }
    return normalized;
};
