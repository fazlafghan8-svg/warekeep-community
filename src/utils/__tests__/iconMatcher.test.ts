import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    damerauLevenshtein,
    getDefaultIconResult,
    matchCategoryIcon,
    normalizeExpenseCategoryIcons,
    resolveCategoryIconMeta,
    warmUpIconMatcher,
    __clearIconMatcherCache
} from '../iconMatcher';
import { ICON_COLOR_PALETTE } from '../iconDictionary';
import { setAiIconCacheEntry, clearAiIconCache } from '../aiIconCache';

beforeEach(() => {
    __clearIconMatcherCache();
    clearAiIconCache();
});

describe('damerauLevenshtein', () => {
    it('computes classic edit distances', () => {
        expect(damerauLevenshtein('', '')).toBe(0);
        expect(damerauLevenshtein('abc', 'abc')).toBe(0);
        expect(damerauLevenshtein('abc', 'abd')).toBe(1);
        expect(damerauLevenshtein('abc', 'ab')).toBe(1);
        expect(damerauLevenshtein('abc', 'abcd')).toBe(1);
    });

    it('counts adjacent transposition as a single edit', () => {
        expect(damerauLevenshtein('ab', 'ba')).toBe(1);
        expect(damerauLevenshtein('تلیفون', 'تیلفون')).toBe(1);
        expect(damerauLevenshtein('internet', 'intenret')).toBe(1);
    });
});

// معیارهای پذیرش — بخش ۱۱ مشخصات
describe('matchCategoryIcon — acceptance criteria', () => {
    it('«برق» resolves on the exact layer', () => {
        const result = matchCategoryIcon('برق');
        expect(result.icon).toBe('zap');
        expect(result.source).toBe('exact');
        expect(result.confidence).toBe(1);
    });

    it('«برغ» (misspelling) resolves to zap and suggests «برق»', () => {
        const result = matchCategoryIcon('برغ');
        expect(result.icon).toBe('zap');
        expect(result.suggestedWord).toBe('برق');
    });

    it('«غزا» (misspelling) resolves via the phonetic layer', () => {
        const result = matchCategoryIcon('غزا');
        expect(result.icon).toBe('utensils');
        expect(result.source).toBe('phonetic');
    });

    it('«کرايه» (Arabic ي) resolves via normalization', () => {
        const result = matchCategoryIcon('کرايه');
        expect(result.icon).toBe('house');
        expect(result.source).toBe('exact');
    });

    it('«اجاره دفتر» (Iranian Farsi, multi-word) resolves via the token layer', () => {
        const result = matchCategoryIcon('اجاره دفتر');
        expect(result.icon).toBe('house');
        expect(result.source).toBe('token');
    });

    it('«انترنیت» resolves via the fuzzy layer', () => {
        const result = matchCategoryIcon('انترنیت');
        expect(result.icon).toBe('wifi');
        expect(result.source).toBe('fuzzy');
        expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('«internit» (English misspelling) resolves via the fuzzy layer', () => {
        const result = matchCategoryIcon('internit');
        expect(result.icon).toBe('wifi');
        expect(result.source).toBe('fuzzy');
    });

    it('«بنزین» (Iranian Farsi) resolves to fuel', () => {
        const result = matchCategoryIcon('بنزین');
        expect(result.icon).toBe('fuel');
    });

    it('«تلیفون» (adjacent transposition) resolves via Damerau distance 1', () => {
        const result = matchCategoryIcon('تلیفون');
        expect(result.icon).toBe('smartphone');
        expect(result.source).toBe('fuzzy');
        expect(result.suggestedWord).toBe('تیلفون');
    });

    it('«معاش کارمندان» resolves via the token layer to wallet', () => {
        const result = matchCategoryIcon('معاش کارمندان');
        expect(result.icon).toBe('wallet');
        expect(result.source).toBe('token');
    });

    it('«Marketing» resolves to megaphone', () => {
        const result = matchCategoryIcon('Marketing');
        expect(result.icon).toBe('megaphone');
        expect(result.source).toBe('exact');
    });

    it('«xyz» falls back to the default tag icon without throwing', () => {
        const result = matchCategoryIcon('xyz');
        expect(result.icon).toBe('tag');
        expect(result.source).toBe('default');
        expect(ICON_COLOR_PALETTE).toContain(result.color);
    });

    it('unknown names resolve from the AI cache when present (offline layer 5)', () => {
        setAiIconCacheEntry('xyz', { icon: 'gem', color: 'purple' });
        const result = matchCategoryIcon('xyz');
        expect(result.icon).toBe('gem');
        expect(result.color).toBe('purple');
        expect(result.source).toBe('cache');
    });

    it('never issues network requests', () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);
        matchCategoryIcon('برق');
        matchCategoryIcon('یک دسته کاملاً ناشناخته');
        matchCategoryIcon('internit');
        expect(fetchSpy).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});

describe('matchCategoryIcon — behaviour details', () => {
    it('is deterministic for default colors (stable hash)', () => {
        const name = 'xqzwvutk';
        const first = matchCategoryIcon(name);
        expect(first.source).toBe('default');
        __clearIconMatcherCache();
        const second = matchCategoryIcon(name);
        expect(first.color).toBe(second.color);
        expect(getDefaultIconResult(name).color).toBe(first.color);
    });

    it('corrects a misspelled token inside a multi-word name in the suggestion', () => {
        const result = matchCategoryIcon('انترنیت قوی');
        expect(result.icon).toBe('wifi');
        expect(result.source).toBe('fuzzy');
        expect(result.suggestedWord).toBe('انترنت قوی');
    });

    it('«کرایه دکان مرکزی» resolves via the token layer to house', () => {
        const result = matchCategoryIcon('کرایه دکان مرکزی');
        expect(result.icon).toBe('house');
        expect(result.source).toBe('token');
    });

    // English compounds are head-final — the LAST matching word is the concept.
    it('"Office Rent" resolves to house (head-final English compound)', () => {
        const result = matchCategoryIcon('Office Rent');
        expect(result.icon).toBe('house');
        expect(result.source).toBe('token');
    });

    it('"Staff Salary" resolves to wallet, "Shop Rent" to house', () => {
        expect(matchCategoryIcon('Staff Salary').icon).toBe('wallet');
        expect(matchCategoryIcon('Shop Rent').icon).toBe('house');
    });

    it('"Salary & Wages" (English fallback category) resolves to wallet', () => {
        expect(matchCategoryIcon('Salary & Wages').icon).toBe('wallet');
    });

    it('preserves the casing of English spelling suggestions', () => {
        expect(matchCategoryIcon('Internit').suggestedWord).toBe('Internet');
        expect(matchCategoryIcon('internit').suggestedWord).toBe('internet');
        expect(matchCategoryIcon('INTERNIT').suggestedWord).toBe('INTERNET');
    });

    it('preserves untouched English words and their casing in multi-word suggestions', () => {
        const result = matchCategoryIcon('Internit Bill');
        expect(result.icon).toBe('wifi');
        expect(result.suggestedWord).toBe('Internet Bill');
    });

    it('handles empty and whitespace-only input', () => {
        expect(matchCategoryIcon('').source).toBe('default');
        expect(matchCategoryIcon('   ').source).toBe('default');
    });

    it('memoizes repeated queries (LRU)', () => {
        const first = matchCategoryIcon('برق');
        const second = matchCategoryIcon('برق');
        expect(second).toBe(first);
    });
});

describe('performance budgets', () => {
    it('builds the index fast (startup budget)', () => {
        const elapsed = warmUpIconMatcher();
        expect(elapsed).toBeLessThan(20);
    });

    it('runs the full offline chain in well under 10ms per query', () => {
        warmUpIconMatcher();
        const queries = ['برق', 'انترنیت', 'یک دسته کاملاً ناشناخته دراز', 'internit', 'اجاره دفتر مرکزی'];
        const start = performance.now();
        const ROUNDS = 20;
        for (let i = 0; i < ROUNDS; i++) {
            for (const query of queries) {
                __clearIconMatcherCache();
                matchCategoryIcon(query);
            }
        }
        const average = (performance.now() - start) / (ROUNDS * queries.length);
        expect(average).toBeLessThan(10);
    });
});

describe('resolveCategoryIconMeta', () => {
    it('prefers the saved entry', () => {
        const meta = resolveCategoryIconMeta({ 'برق': { icon: 'gem', color: 'pink', source: 'manual' } }, 'برق');
        expect(meta).toEqual({ icon: 'gem', color: 'pink', source: 'manual' });
    });

    it('falls back to a live offline match for unsaved categories', () => {
        const meta = resolveCategoryIconMeta(undefined, 'برق');
        expect(meta.icon).toBe('zap');
    });

    it('repairs automatic entries with unknown icons', () => {
        const meta = resolveCategoryIconMeta({ 'برق': { icon: 'not-a-real-icon', color: 'pink', source: 'exact' } }, 'برق');
        expect(meta.icon).toBe('zap');
    });

    it('returns manual entries verbatim even when the icon is unknown to this client', () => {
        const meta = resolveCategoryIconMeta({ 'برق': { icon: 'icon-from-newer-version', color: 'pink', source: 'manual' } }, 'برق');
        expect(meta).toEqual({ icon: 'icon-from-newer-version', color: 'pink', source: 'manual' });
    });

    it('recomputes default-source entries so a cached AI answer can upgrade them', () => {
        setAiIconCacheEntry('xyz', { icon: 'gem', color: 'purple' });
        const meta = resolveCategoryIconMeta({ 'xyz': { icon: 'tag', color: 'lime', source: 'default' } }, 'xyz');
        expect(meta).toEqual({ icon: 'gem', color: 'purple', source: 'cache' });
    });
});

describe('normalizeExpenseCategoryIcons (persistence backfill)', () => {
    it('backfills the seven legacy default categories', () => {
        const categories = ['کرایه', 'برق', 'آب', 'غذا', 'معاش', 'حمل و نقل', 'متفرقه'];
        const normalized = normalizeExpenseCategoryIcons(undefined, categories);
        expect(normalized['کرایه'].icon).toBe('house');
        expect(normalized['برق'].icon).toBe('zap');
        expect(normalized['آب'].icon).toBe('droplets');
        expect(normalized['غذا'].icon).toBe('utensils');
        expect(normalized['معاش'].icon).toBe('wallet');
        expect(normalized['حمل و نقل'].icon).toBe('truck');
        expect(normalized['متفرقه'].icon).toBe('tag');
    });

    it('keeps valid manual entries untouched (manual picks are sacred)', () => {
        const normalized = normalizeExpenseCategoryIcons(
            { 'برق': { icon: 'gem', color: 'pink', source: 'manual' } },
            ['برق']
        );
        expect(normalized['برق']).toEqual({ icon: 'gem', color: 'pink', source: 'manual' });
    });

    it('prunes automatic icons of deleted categories and repairs invalid entries', () => {
        const normalized = normalizeExpenseCategoryIcons(
            {
                'حذف شده': { icon: 'zap', color: 'amber', source: 'exact' },
                'برق': { icon: 'fake-icon', color: 'amber', source: 'exact' }
            },
            ['برق']
        );
        expect(normalized['حذف شده']).toBeUndefined();
        expect(normalized['برق'].icon).toBe('zap');
    });

    it('keeps orphaned manual picks (transient category absence must not destroy them)', () => {
        const normalized = normalizeExpenseCategoryIcons(
            { 'چای سبز': { icon: 'coffee', color: 'teal', source: 'manual' } },
            ['برق']
        );
        expect(normalized['چای سبز']).toEqual({ icon: 'coffee', color: 'teal', source: 'manual' });
    });

    it('keeps manual entries verbatim even with icons unknown to this client version', () => {
        const normalized = normalizeExpenseCategoryIcons(
            { 'برق': { icon: 'future-icon', color: 'future-color', source: 'manual' } },
            ['برق']
        );
        expect(normalized['برق']).toEqual({ icon: 'future-icon', color: 'future-color', source: 'manual' });
    });

    it('recomputes stored default entries on every pass (backfill self-heals from the AI cache)', () => {
        setAiIconCacheEntry('xyz', { icon: 'gem', color: 'purple' });
        const normalized = normalizeExpenseCategoryIcons(
            { 'xyz': { icon: 'tag', color: 'lime', source: 'default' } },
            ['xyz']
        );
        expect(normalized['xyz']).toEqual({ icon: 'gem', color: 'purple', source: 'cache' });
    });

    it('tolerates malformed input shapes', () => {
        expect(normalizeExpenseCategoryIcons(null, null)).toEqual({});
        expect(normalizeExpenseCategoryIcons([], 'nope')).toEqual({});
    });
});
