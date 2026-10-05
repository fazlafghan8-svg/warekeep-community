import { describe, expect, it } from 'vitest';
import {
    ICON_DICTIONARY,
    ICON_COLOR_PALETTE,
    ALL_CATEGORY_ICONS,
    isCategoryIconColor,
    isKnownCategoryIcon
} from '../iconDictionary';
import { normalizeFa, phoneticFold } from '../textNormalizer';
import { CATEGORY_ICON_REGISTRY } from '../../components/icons/lucideRegistry';

describe('ICON_DICTIONARY coverage requirements', () => {
    it('has at least 60 groups', () => {
        expect(ICON_DICTIONARY.length).toBeGreaterThanOrEqual(60);
    });

    it('has at least 400 keywords in total', () => {
        const total = ICON_DICTIONARY.reduce((sum, entry) => sum + entry.fa.length + entry.en.length, 0);
        expect(total).toBeGreaterThanOrEqual(400);
    });

    it('covers both Dari and Iranian Farsi vocabulary for key concepts', () => {
        const allFa = new Set(ICON_DICTIONARY.flatMap((entry) => entry.fa.map((keyword) => normalizeFa(keyword))));
        const pairs: Array<[string, string]> = [
            ['تیل', 'بنزین'],
            ['موتر', 'خودرو'],
            ['تکت', 'بلیط'],
            ['دوا', 'دارو'],
            ['معاش', 'حقوق'],
            ['انترنت', 'اینترنت'],
            ['کرایه', 'اجاره'],
            ['تیلفون', 'تلفن'],
            ['صفایی', 'نظافت'],
            ['داکتر', 'دکتر'],
            ['گدام', 'انبار']
        ];
        for (const [dari, farsi] of pairs) {
            expect(allFa.has(normalizeFa(dari)), `missing Dari term: ${dari}`).toBe(true);
            expect(allFa.has(normalizeFa(farsi)), `missing Farsi term: ${farsi}`).toBe(true);
        }
    });
});

describe('ICON_DICTIONARY integrity', () => {
    it('uses only icons that exist in the lucide registry', () => {
        for (const entry of ICON_DICTIONARY) {
            expect(CATEGORY_ICON_REGISTRY[entry.icon], `unknown lucide icon: ${entry.icon}`).toBeTruthy();
        }
    });

    it('registry and whitelist stay in sync', () => {
        expect(Object.keys(CATEGORY_ICON_REGISTRY).sort()).toEqual([...ALL_CATEGORY_ICONS].sort());
    });

    it('uses only palette colors', () => {
        for (const entry of ICON_DICTIONARY) {
            expect(ICON_COLOR_PALETTE).toContain(entry.color);
        }
    });

    it('contains the default tag icon', () => {
        expect(isKnownCategoryIcon('tag')).toBe(true);
    });

    it('has no duplicate normalized keyword across groups', () => {
        const seen = new Map<string, number>();
        ICON_DICTIONARY.forEach((entry, groupIndex) => {
            for (const keyword of [...entry.fa, ...entry.en]) {
                const normalized = normalizeFa(keyword);
                const existing = seen.get(normalized);
                expect(
                    existing === undefined || existing === groupIndex,
                    `keyword "${keyword}" appears in groups ${existing} and ${groupIndex}`
                ).toBe(true);
                seen.set(normalized, groupIndex);
            }
        });
    });

    it('has no cross-group phonetic-fold collisions (would shadow each other)', () => {
        const seen = new Map<string, { group: number; keyword: string }>();
        const collisions: string[] = [];
        ICON_DICTIONARY.forEach((entry, groupIndex) => {
            for (const keyword of [...entry.fa, ...entry.en]) {
                const folded = phoneticFold(keyword);
                const existing = seen.get(folded);
                if (existing && existing.group !== groupIndex) {
                    collisions.push(`"${keyword}" ~ "${existing.keyword}"`);
                } else {
                    seen.set(folded, { group: groupIndex, keyword });
                }
            }
        });
        expect(collisions, collisions.join(', ')).toEqual([]);
    });

    it('validators reject unknown values', () => {
        expect(isKnownCategoryIcon('definitely-not-an-icon')).toBe(false);
        expect(isCategoryIconColor('magenta')).toBe(false);
        expect(isCategoryIconColor('emerald')).toBe(true);
    });
});
