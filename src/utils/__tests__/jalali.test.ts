import { describe, expect, it } from 'vitest';
import {
    gregorianToJalali,
    isLeapJalaliYear,
    isoToJalali,
    jalaliMonthLength,
    jalaliToGregorian,
    jalaliToIso,
} from '../jalali';

describe('jalali conversion', () => {
    it('converts known dates from Gregorian to Jalali', () => {
        // Verified against Intl fa-AF-u-ca-persian (the app's own date rendering).
        expect(gregorianToJalali(2026, 7, 12)).toEqual({ jy: 1405, jm: 4, jd: 21 }); // ۲۱ سرطان ۱۴۰۵
        expect(gregorianToJalali(2026, 3, 21)).toEqual({ jy: 1405, jm: 1, jd: 1 }); // نوروز ۱۴۰۵
        expect(gregorianToJalali(2025, 3, 21)).toEqual({ jy: 1404, jm: 1, jd: 1 });
        expect(gregorianToJalali(2026, 3, 20)).toEqual({ jy: 1404, jm: 12, jd: 29 });
    });

    it('converts known dates from Jalali to Gregorian', () => {
        expect(jalaliToGregorian(1405, 4, 21)).toEqual({ gy: 2026, gm: 7, gd: 12 });
        expect(jalaliToGregorian(1405, 1, 1)).toEqual({ gy: 2026, gm: 3, gd: 21 });
        expect(jalaliToGregorian(1403, 12, 30)).toEqual({ gy: 2025, gm: 3, gd: 20 }); // 1403 is leap
    });

    it('round-trips every day across several years', () => {
        for (let jy = 1400; jy <= 1408; jy += 1) {
            for (let jm = 1; jm <= 12; jm += 1) {
                const length = jalaliMonthLength(jy, jm);
                for (let jd = 1; jd <= length; jd += 1) {
                    const g = jalaliToGregorian(jy, jm, jd);
                    expect(gregorianToJalali(g.gy, g.gm, g.gd)).toEqual({ jy, jm, jd });
                }
            }
        }
    });

    it('knows leap years and month lengths', () => {
        expect(isLeapJalaliYear(1403)).toBe(true);
        expect(isLeapJalaliYear(1404)).toBe(false);
        expect(jalaliMonthLength(1403, 12)).toBe(30);
        expect(jalaliMonthLength(1404, 12)).toBe(29);
        expect(jalaliMonthLength(1405, 1)).toBe(31);
        expect(jalaliMonthLength(1405, 7)).toBe(30);
    });

    it('parses and formats ISO strings', () => {
        expect(isoToJalali('2026-07-12')).toEqual({ jy: 1405, jm: 4, jd: 21 });
        expect(isoToJalali('2026-07-12T08:30:00.000Z')).toEqual({ jy: 1405, jm: 4, jd: 21 });
        expect(isoToJalali('')).toBeNull();
        expect(isoToJalali('not-a-date')).toBeNull();
        expect(jalaliToIso(1405, 4, 21)).toBe('2026-07-12');
        expect(jalaliToIso(1405, 1, 1)).toBe('2026-03-21');
    });
});
