// Regression tests for hostile category names like "__proto__": they must be
// stored/retrieved as ordinary own properties and never touch the prototype
// chain (originally reproduced by an adversarial review pass).
import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeExpenseCategoryIcons } from '../iconMatcher';
import { clearAiIconCache, getAiIconCacheEntry, setAiIconCacheEntry } from '../aiIconCache';

describe('hostile "__proto__" category name', () => {
    beforeEach(() => {
        clearAiIconCache();
        window.localStorage.clear();
    });

    it('aiIconCache stores and retrieves a __proto__ entry without pollution', () => {
        setAiIconCacheEntry('__proto__', { icon: 'wrench', color: 'amber' });

        const raw = window.localStorage.getItem('warekeep_ai_icon_cache');
        expect(raw).toContain('wrench');
        expect(getAiIconCacheEntry('__proto__')).toMatchObject({ icon: 'wrench', color: 'amber' });
        // No global prototype pollution.
        expect(({} as Record<string, unknown>).icon).toBeUndefined();
        expect(Object.prototype).not.toHaveProperty('icon');
    });

    it('normalizeExpenseCategoryIcons keeps a manual pick for a __proto__ category', () => {
        const rawIcons = JSON.parse(
            '{"__proto__": {"icon": "wrench", "color": "amber", "source": "manual"}}'
        );
        const normalized = normalizeExpenseCategoryIcons(rawIcons, ['__proto__']);
        expect(Object.prototype.hasOwnProperty.call(normalized, '__proto__')).toBe(true);
        expect(JSON.stringify(normalized)).toContain('wrench');
    });

    it('manual pick for __proto__ survives a save+load round trip', () => {
        const rawIcons = JSON.parse(
            '{"__proto__": {"icon": "wrench", "color": "amber", "source": "manual"}}'
        );
        const normalizedOnSave = normalizeExpenseCategoryIcons(rawIcons, ['__proto__']);
        const reloaded = JSON.parse(JSON.stringify(normalizedOnSave));
        const normalizedOnLoad = normalizeExpenseCategoryIcons(reloaded, ['__proto__']);
        const survived = Object.getOwnPropertyDescriptor(normalizedOnLoad, '__proto__')?.value;
        expect(survived).toEqual({ icon: 'wrench', color: 'amber', source: 'manual' });
    });
});
