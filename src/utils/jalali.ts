// Afghan/Iranian solar-Hijri (Jalali) <-> Gregorian conversion.
// Arithmetic algorithm ported from jalaali-js (MIT), which follows the
// 33-year cycle rules; matches Intl's 'persian' calendar for modern dates.
export interface JalaliDate {
    jy: number;
    jm: number;
    jd: number;
}
export interface GregorianDate {
    gy: number;
    gm: number;
    gd: number;
}
export const AFGHAN_SOLAR_MONTHS_FA = ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'] as const;
export const AFGHAN_SOLAR_MONTHS_EN = ['Hamal', 'Sawr', 'Jawza', 'Saratan', 'Asad', 'Sunbula', 'Mizan', 'Aqrab', 'Qaws', 'Jadi', 'Dalw', 'Hut'] as const;
// Week starts on Saturday (شنبه) in Afghanistan.
export const AFGHAN_WEEKDAYS_FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'] as const;
export const AFGHAN_WEEKDAYS_SHORT_FA = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const;
const BREAKS = [
    -61,
    9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
    1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
];
const div = (a: number, b: number) => ~~(a / b);
const mod = (a: number, b: number) => a - ~~(a / b) * b;
const jalCal = (jy: number) => {
    const bl = BREAKS.length;
    const gy = jy + 621;
    let leapJ = -14;
    let jp = BREAKS[0];
    if (jy < jp || jy >= BREAKS[bl - 1])
        throw new Error(`Invalid Jalali year ${jy}`);
    let jump = 0;
    for (let i = 1; i < bl; i += 1) {
        const jm = BREAKS[i];
        jump = jm - jp;
        if (jy < jm)
            break;
        leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
        jp = jm;
    }
    let n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4)
        leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    const march = 20 + leapJ - leapG;
    if (jump - n < 6)
        n = n - jump + div(jump + 4, 33) * 33;
    let leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1)
        leap = 4;
    return { leap, gy, march };
};
const g2d = (gy: number, gm: number, gd: number): number => {
    let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
        + div(153 * mod(gm + 9, 12) + 2, 5)
        + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
};
const d2g = (jdn: number): GregorianDate => {
    let j = 4 * jdn + 139361631;
    j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
    return { gy, gm, gd };
};
const j2d = (jy: number, jm: number, jd: number): number => {
    const r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
};
const d2j = (jdn: number): JalaliDate => {
    const gy = d2g(jdn).gy;
    let jy = gy - 621;
    const r = jalCal(jy);
    const jdn1f = g2d(gy, 3, r.march);
    let k = jdn - jdn1f;
    if (k >= 0) {
        if (k <= 185) {
            return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
        }
        k -= 186;
    }
    else {
        jy -= 1;
        k += 179;
        if (r.leap === 1)
            k += 1;
    }
    return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
};
export const jalaliToGregorian = (jy: number, jm: number, jd: number): GregorianDate => d2g(j2d(jy, jm, jd));
export const gregorianToJalali = (gy: number, gm: number, gd: number): JalaliDate => d2j(g2d(gy, gm, gd));
export const isLeapJalaliYear = (jy: number): boolean => jalCal(jy).leap === 0;
export const jalaliMonthLength = (jy: number, jm: number): number => {
    if (jm <= 6)
        return 31;
    if (jm <= 11)
        return 30;
    return isLeapJalaliYear(jy) ? 30 : 29;
};
const pad2 = (value: number) => String(value).padStart(2, '0');
/** ISO `YYYY-MM-DD` for a Jalali date (Gregorian projection, for storage). */
export const jalaliToIso = (jy: number, jm: number, jd: number): string => {
    const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd);
    return `${String(gy).padStart(4, '0')}-${pad2(gm)}-${pad2(gd)}`;
};
/** Parse an ISO `YYYY-MM-DD` (or a longer ISO string) into a Jalali date. */
export const isoToJalali = (iso: string | null | undefined): JalaliDate | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso || '').trim());
    if (!match)
        return null;
    const gy = Number(match[1]);
    const gm = Number(match[2]);
    const gd = Number(match[3]);
    if (gm < 1 || gm > 12 || gd < 1 || gd > 31)
        return null;
    try {
        return gregorianToJalali(gy, gm, gd);
    }
    catch {
        return null;
    }
};
export const todayJalali = (): JalaliDate => {
    const now = new Date();
    return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
};
/** Local-time Date at the start of a Jalali day (for range comparisons). */
export const jalaliToDate = (jy: number, jm: number, jd: number): Date => {
    const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd);
    return new Date(gy, gm - 1, gd);
};
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const toPersianDigits = (value: number | string): string => String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
/** «۲۱ سرطان ۱۴۰۵» — the app-wide single-line Dari date format. */
export const formatJalali = (date: JalaliDate, options?: {
    english?: boolean;
}): string => {
    const monthName = options?.english
        ? AFGHAN_SOLAR_MONTHS_EN[date.jm - 1]
        : AFGHAN_SOLAR_MONTHS_FA[date.jm - 1];
    return options?.english
        ? `${date.jd} ${monthName} ${date.jy}`
        : `${toPersianDigits(date.jd)} ${monthName} ${toPersianDigits(date.jy)}`;
};
