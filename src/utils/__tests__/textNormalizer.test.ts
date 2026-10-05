import { describe, expect, it } from 'vitest';
import { normalizeFa, phoneticFold } from '../textNormalizer';

describe('normalizeFa', () => {
    it('maps Arabic letter forms to Persian', () => {
        expect(normalizeFa('كرايه')).toBe('کرایه');
        expect(normalizeFa('مدرسة')).toBe('مدرسه');
        expect(normalizeFa('مسؤول')).toBe('مسوول');
        expect(normalizeFa('أنار')).toBe('انار');
        expect(normalizeFa('آب')).toBe('اب');
        expect(normalizeFa('رئیس')).toBe('رییس');
    });

    it('removes diacritics and tatweel', () => {
        expect(normalizeFa('بـــرق')).toBe('برق');
        expect(normalizeFa('غَذا')).toBe('غذا');
    });

    it('removes combining hamza/maddah and folds precomposed ۀ', () => {
        expect(normalizeFa('کرایهٔ دکان')).toBe('کرایه دکان');
        expect(normalizeFa('خانۀ')).toBe('خانه');
    });

    it('converts ZWNJ and direction marks to a space', () => {
        expect(normalizeFa('حمل‌ونقل')).toBe('حمل ونقل');
        expect(normalizeFa('برق‏')).toBe('برق');
    });

    it('converts Persian and Arabic-Indic digits to Latin', () => {
        expect(normalizeFa('دسته ۱۲')).toBe('دسته 12');
        expect(normalizeFa('دسته ٣٤')).toBe('دسته 34');
    });

    it('lowercases and collapses whitespace', () => {
        expect(normalizeFa('  MARKETING   Costs ')).toBe('marketing costs');
    });

    it('returns an empty string for non-string input', () => {
        expect(normalizeFa(undefined as unknown as string)).toBe('');
        expect(normalizeFa(null as unknown as string)).toBe('');
    });
});

describe('phoneticFold', () => {
    it('folds homophone letters onto one representative', () => {
        expect(phoneticFold('غذا')).toBe(phoneticFold('غزا'));
        expect(phoneticFold('برق')).toBe(phoneticFold('برغ'));
        expect(phoneticFold('حمل')).toBe(phoneticFold('همل'));
        expect(phoneticFold('صابون')).toBe(phoneticFold('سابون'));
        expect(phoneticFold('طعام')).toBe(phoneticFold('تعام'));
    });

    it('normalizes before folding', () => {
        expect(phoneticFold('غَذا')).toBe(phoneticFold('غزا'));
    });
});
