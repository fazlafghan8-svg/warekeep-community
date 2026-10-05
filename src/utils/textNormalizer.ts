// Text normalization for Dari/Farsi/English category matching.
// Both sides of every comparison (user input AND dictionary keywords)
// must pass through these functions so the comparison space is identical.
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
// U+064B-U+065F (tanween/harakat + combining maddah/hamza + Quranic marks),
// U+0670 (superscript alef), U+0640 (tatweel). Explicit escapes on purpose -
// the range MUST stop before U+0660 (Arabic-Indic digits).
const DIACRITICS_RE = /[ً-ٰٟـ]/g;
// U+200C ZWNJ, U+200E LRM, U+200F RLM
const JOINERS_RE = /[‌‎‏]/g;
/**
 * Canonical normalization: Arabic→Persian letter forms, diacritics/tatweel
 * removal, ZWNJ→space, Persian/Arabic digits→Latin, whitespace collapse.
 */
export const normalizeFa = (value: string): string => {
    if (typeof value !== 'string')
        return '';
    return value
        .trim()
        .toLowerCase()
        .replace(DIACRITICS_RE, '')
        .replace(JOINERS_RE, ' ')
        .replace(/ي/g, 'ی') // ي → ی
        .replace(/ك/g, 'ک') // ك → ک
        .replace(/ة/g, 'ه') // ة → ه
        .replace(/ۀ/g, 'ه') // ۀ (heh + yeh above) → ه
        .replace(/[أإآٱ]/g, 'ا') // أ إ آ ٱ → ا
        .replace(/ؤ/g, 'و') // ؤ → و
        .replace(/[ئى]/g, 'ی') // ئ ى → ی
        .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
        .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
        .replace(/\s+/g, ' ')
        .trim();
};
/**
 * Phonetic folding: maps homophone letter groups (the source of most
 * Dari/Farsi spelling mistakes, e.g. غذا/غزا, برق/برغ) onto a single
 * representative. Only ever used for matching — never for display.
 */
export const phoneticFold = (value: string): string => {
    return normalizeFa(value)
        .replace(/[ذضظ]/g, 'ز') // ذ ض ظ → ز
        .replace(/[ثص]/g, 'س') // ث ص → س
        .replace(/ط/g, 'ت') // ط → ت
        .replace(/ح/g, 'ه') // ح → ه
        .replace(/ع/g, 'ا') // ع → ا
        .replace(/غ/g, 'ق') // غ → ق
        .replace(/ژ/g, 'ز'); // ژ → ز
};
