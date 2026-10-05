import type { AppSettings, CalendarSystem, DateMonthDisplay, DateTimeSection, SalesMode } from '@/types';
import { AFGHAN_SOLAR_MONTHS_EN, AFGHAN_SOLAR_MONTHS_FA } from '@/utils/jalali';
type UiLanguage = AppSettings['language'];
const NON_BREAKING_SPACE = '\u00A0';
const COMPACT_SUFFIXES = [
    { value: 1000000000, suffix: 'B' },
    { value: 1000000, suffix: 'M' },
    { value: 1000, suffix: 'K' },
];
export const resolveUiLocale = (language?: UiLanguage) => language === 'english' ? 'en-US' : 'fa-AF-u-nu-arabext';
export type NumberDisplayMode = 'full' | 'compact';
export const DEFAULT_DATE_TIME_SETTINGS: NonNullable<AppSettings['dateTimeSettings']> = {
    globalCalendar: 'solar_afghan',
    sectionCalendars: {
        medicineExpiry: 'gregorian',
        sales: 'solar_afghan',
        purchases: 'solar_afghan',
        expenses: 'solar_afghan',
        customers: 'solar_afghan',
        payroll: 'solar_afghan',
        treasury: 'solar_afghan',
        reports: 'solar_afghan',
        dashboard: 'solar_afghan',
        system: 'gregorian',
    },
    monthDisplay: 'name',
    sectionMonthDisplays: {
        medicineExpiry: 'name',
        sales: 'name',
        purchases: 'name',
        expenses: 'name',
        customers: 'name',
        payroll: 'name',
        treasury: 'name',
        reports: 'name',
        dashboard: 'name',
        system: 'name',
    },
    timeFormat: '24h',
    timeZone: 'Asia/Kabul',
};
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const calendarSystems: readonly CalendarSystem[] = ['gregorian', 'solar_afghan', 'solar_iranian', 'hijri'];
const monthDisplays: readonly DateMonthDisplay[] = ['name', 'number'];
const dateTimeSections: readonly DateTimeSection[] = [
    'medicineExpiry',
    'sales',
    'purchases',
    'expenses',
    'customers',
    'payroll',
    'treasury',
    'reports',
    'dashboard',
    'system',
];
const isCalendarSystem = (value: unknown): value is CalendarSystem => typeof value === 'string' && (calendarSystems as readonly string[]).includes(value);
const isDateTimeSection = (value: unknown): value is DateTimeSection => typeof value === 'string' && (dateTimeSections as readonly string[]).includes(value);
const isDateMonthDisplay = (value: unknown): value is DateMonthDisplay => typeof value === 'string' && (monthDisplays as readonly string[]).includes(value);
const calendarLocaleMap: Record<CalendarSystem, string> = {
    gregorian: 'en-US-u-ca-gregory',
    solar_afghan: 'fa-AF-u-ca-persian',
    solar_iranian: 'fa-IR-u-ca-persian',
    hijri: 'fa-AF-u-ca-islamic',
};
const iranianToAfghanSolarMonthMap: Record<string, string> = {
    'فروردین': 'حمل',
    'اردیبهشت': 'ثور',
    'خرداد': 'جوزا',
    'تیر': 'سرطان',
    'مرداد': 'اسد',
    'شهریور': 'سنبله',
    'مهر': 'میزان',
    'آبان': 'عقرب',
    'آذر': 'قوس',
    'دی': 'جدی',
    'بهمن': 'دلو',
    'اسفند': 'حوت',
    Farvardin: 'حمل',
    Ordibehesht: 'ثور',
    Khordad: 'جوزا',
    Tir: 'سرطان',
    Mordad: 'اسد',
    Shahrivar: 'سنبله',
    Mehr: 'میزان',
    Aban: 'عقرب',
    Azar: 'قوس',
    Dey: 'جدی',
    Bahman: 'دلو',
    Esfand: 'حوت',
};
const forceAfghanSolarMonthNames = (value: string, isEnglish = false) => Object.entries(iranianToAfghanSolarMonthMap).reduce((result, [iranianMonth, afghanMonth]) => {
    const monthIndex = AFGHAN_SOLAR_MONTHS_FA.findIndex(month => month === afghanMonth);
    return result.replace(new RegExp(iranianMonth, 'g'), isEnglish ? AFGHAN_SOLAR_MONTHS_EN[monthIndex] : afghanMonth);
}, value);
export const normalizeDateTimeSettings = (settings?: AppSettings['dateTimeSettings'] | null): NonNullable<AppSettings['dateTimeSettings']> => {
    const sectionCalendars = { ...DEFAULT_DATE_TIME_SETTINGS.sectionCalendars };
    Object.entries(settings?.sectionCalendars || {}).forEach(([section, calendar]) => {
        if (isDateTimeSection(section) && isCalendarSystem(calendar)) {
            sectionCalendars[section] = calendar;
        }
    });
    const sectionMonthDisplays = { ...DEFAULT_DATE_TIME_SETTINGS.sectionMonthDisplays };
    Object.entries(settings?.sectionMonthDisplays || {}).forEach(([section, monthDisplay]) => {
        if (isDateTimeSection(section) && isDateMonthDisplay(monthDisplay)) {
            sectionMonthDisplays[section] = monthDisplay;
        }
    });
    return {
        globalCalendar: isCalendarSystem(settings?.globalCalendar)
            ? settings.globalCalendar
            : DEFAULT_DATE_TIME_SETTINGS.globalCalendar,
        sectionCalendars,
        monthDisplay: isDateMonthDisplay(settings?.monthDisplay)
            ? settings.monthDisplay
            : DEFAULT_DATE_TIME_SETTINGS.monthDisplay,
        sectionMonthDisplays,
        timeFormat: settings?.timeFormat === '12h' ? '12h' : settings?.timeFormat === '24h' ? '24h' : DEFAULT_DATE_TIME_SETTINGS.timeFormat,
        timeZone: settings?.timeZone === 'local' || settings?.timeZone === 'UTC' || settings?.timeZone === 'Asia/Kabul'
            ? settings.timeZone
            : DEFAULT_DATE_TIME_SETTINGS.timeZone,
    };
};
export const getSectionCalendar = (settings: AppSettings | undefined | null, section: DateTimeSection): CalendarSystem => {
    const normalized = normalizeDateTimeSettings(settings?.dateTimeSettings);
    return normalized.sectionCalendars[section] || normalized.globalCalendar;
};
export const getSectionMonthDisplay = (settings: AppSettings | undefined | null, section: DateTimeSection): DateMonthDisplay => {
    const normalized = normalizeDateTimeSettings(settings?.dateTimeSettings);
    return normalized.sectionMonthDisplays[section] || normalized.monthDisplay;
};
export const parseAppDate = (value: string | Date | null | undefined): Date | null => {
    if (!value)
        return null;
    if (value instanceof Date)
        return Number.isNaN(value.getTime()) ? null : value;
    const text = String(value).trim();
    const dateOnly = text.match(DATE_ONLY_PATTERN);
    if (dateOnly) {
        const [, year, month, day] = dateOnly;
        return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0));
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const getTimeZoneOption = (settings?: AppSettings | null) => {
    const timeZone = normalizeDateTimeSettings(settings?.dateTimeSettings).timeZone;
    if (timeZone === 'local')
        return undefined;
    return timeZone;
};
const englishCalendarLocaleMap: Record<CalendarSystem, string> = {
    gregorian: 'en-US-u-ca-gregory', solar_afghan: 'en-US-u-ca-persian',
    solar_iranian: 'en-US-u-ca-persian', hijri: 'en-US-u-ca-islamic',
};
const buildDateFormatter = (settings: AppSettings | undefined | null, calendar: CalendarSystem, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(settings?.language === 'english' ? englishCalendarLocaleMap[calendar] : calendarLocaleMap[calendar], {
    ...options,
    timeZone: getTimeZoneOption(settings),
});
const formatCalendarDate = (date: Date, settings: AppSettings | undefined | null, calendar: CalendarSystem, options: Intl.DateTimeFormatOptions) => {
    const formatted = buildDateFormatter(settings, calendar, options).format(date);
    return calendar === 'solar_afghan' ? forceAfghanSolarMonthNames(formatted, settings?.language === 'english') : formatted;
};
const applyMonthDisplay = (settings: AppSettings | undefined | null, section: DateTimeSection, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions => {
    if (!options.month || getSectionMonthDisplay(settings, section) === 'name')
        return options;
    return {
        ...options,
        month: options.month === '2-digit' ? '2-digit' : 'numeric',
    };
};
export const formatAppDate = (value: string | Date | null | undefined, settings: AppSettings | undefined | null, section: DateTimeSection = 'system', options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }) => {
    const date = parseAppDate(value);
    if (!date)
        return '-';
    return formatCalendarDate(date, settings, getSectionCalendar(settings, section), applyMonthDisplay(settings, section, options));
};
export const formatAppDateTime = (value: string | Date | null | undefined, settings: AppSettings | undefined | null, section: DateTimeSection = 'system') => {
    const date = parseAppDate(value);
    if (!date)
        return '-';
    const normalized = normalizeDateTimeSettings(settings?.dateTimeSettings);
    return formatCalendarDate(date, settings, getSectionCalendar(settings, section), applyMonthDisplay(settings, section, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: normalized.timeFormat === '12h',
    }));
};
export const formatAppTime = (value: string | Date | null | undefined, settings: AppSettings | undefined | null, section: DateTimeSection = 'system') => {
    const date = parseAppDate(value);
    if (!date)
        return '-';
    const normalized = normalizeDateTimeSettings(settings?.dateTimeSettings);
    return formatCalendarDate(date, settings, getSectionCalendar(settings, section), {
        hour: 'numeric',
        minute: '2-digit',
        hour12: normalized.timeFormat === '12h',
    });
};
export const formatMedicineExpiryDate = (value: string | Date | null | undefined, settings: AppSettings | undefined | null) => formatAppDate(value, settings, 'medicineExpiry', { year: 'numeric', month: 'short', day: 'numeric' });
export const resolveSalesModePrice = (salePrices: Partial<Record<SalesMode, number>> | null | undefined, mode: SalesMode | undefined, fallback: SalesMode = 'retail') => {
    const normalizedMode: SalesMode = mode === 'wholesale' || mode === 'bulk' ? mode : fallback;
    const primary = Number(salePrices?.[normalizedMode]);
    if (Number.isFinite(primary) && primary > 0)
        return primary;
    const fallbackPrice = Number(salePrices?.[fallback]);
    if (Number.isFinite(fallbackPrice) && fallbackPrice > 0)
        return fallbackPrice;
    const retail = Number(salePrices?.retail);
    if (Number.isFinite(retail) && retail > 0)
        return retail;
    const wholesale = Number(salePrices?.wholesale);
    if (Number.isFinite(wholesale) && wholesale > 0)
        return wholesale;
    const bulk = Number(salePrices?.bulk);
    return Number.isFinite(bulk) && bulk > 0 ? bulk : 0;
};
export const getSalesModeLabel = (mode: SalesMode | undefined, language: AppSettings['language'] = 'dari') => {
    const normalized: SalesMode = mode === 'wholesale' || mode === 'bulk' ? mode : 'retail';
    if (language === 'english') {
        if (normalized === 'wholesale')
            return 'Wholesale';
        if (normalized === 'bulk')
            return 'Bulk';
        return 'Retail';
    }
    if (normalized === 'wholesale')
        return 'عمده';
    if (normalized === 'bulk')
        return 'کارتنی';
    return 'پرچون';
};
export const createAppFormatters = (language?: UiLanguage, currencyCode = 'AFN', displayMode: NumberDisplayMode = 'full') => {
    const locale = resolveUiLocale(language);
    // Dari UI writes the afghani out in Persian; other codes stay as ISO codes.
    const currencyLabel = language !== 'english' && currencyCode === 'AFN' ? 'افغانی' : currencyCode;
    const numberFormatter = new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0,
    });
    const moneyFormatter = new Intl.NumberFormat(locale, {
        maximumFractionDigits: currencyCode === 'IRR' ? 0 : 2,
    });
    const compactNumberFormatter = new Intl.NumberFormat(locale, {
        maximumFractionDigits: 1,
    });
    const signedPercentFormatter = new Intl.NumberFormat(locale, {
        signDisplay: 'exceptZero',
        maximumFractionDigits: 0,
    });
    const shortDateFormatter = new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
    });
    const longDateFormatter = new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    const timeFormatter = new Intl.DateTimeFormat(locale, {
        hour: 'numeric',
        minute: '2-digit',
    });
    const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
    const formatNumber = (value: number) => numberFormatter.format(Math.round(value || 0));
    const formatCompactNumber = (value: number) => {
        const numericValue = Number(value || 0);
        const absoluteValue = Math.abs(numericValue);
        const compactRule = COMPACT_SUFFIXES.find((rule) => absoluteValue >= rule.value);
        if (!compactRule) {
            return formatNumber(numericValue);
        }
        const compactBase = numericValue / compactRule.value;
        const compactValue = compactNumberFormatter.format(Math.abs(compactBase) >= 100 ? Math.round(compactBase) : Math.round(compactBase * 10) / 10);
        return `${compactValue}${compactRule.suffix}`;
    };
    const formatCurrency = (value: number) => {
        const numericValue = Number(value || 0);
        return `${moneyFormatter.format(Number.isFinite(numericValue) ? numericValue : 0)}${NON_BREAKING_SPACE}${currencyLabel}`;
    };
    const formatCompactCurrency = (value: number) => `${formatCompactNumber(value)}${NON_BREAKING_SPACE}${currencyLabel}`;
    const formatSignedPercent = (value: number) => `${signedPercentFormatter.format(Math.round(value || 0))}%`;
    const formatShortDate = (value: string | Date) => shortDateFormatter.format(value instanceof Date ? value : new Date(value));
    const formatLongDate = (value: string | Date) => longDateFormatter.format(value instanceof Date ? value : new Date(value));
    const formatTime = (value: string | Date) => timeFormatter.format(value instanceof Date ? value : new Date(value));
    const formatDateTime = (value: string | Date) => dateTimeFormatter.format(value instanceof Date ? value : new Date(value));
    const formatDisplayNumber = (value: number) => displayMode === 'compact' ? formatCompactNumber(value) : formatNumber(value);
    const formatDisplayCurrency = (value: number) => displayMode === 'compact' ? formatCompactCurrency(value) : formatCurrency(value);
    return {
        currencyCode,
        locale,
        formatNumber,
        formatCompactNumber,
        formatCurrency,
        formatCompactCurrency,
        formatDisplayNumber,
        formatDisplayCurrency,
        formatSignedPercent,
        formatShortDate,
        formatLongDate,
        formatTime,
        formatDateTime,
    };
};
export type AppFormatters = ReturnType<typeof createAppFormatters>;
