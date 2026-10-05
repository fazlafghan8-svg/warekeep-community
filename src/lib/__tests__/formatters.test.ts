import { describe, expect, it } from 'vitest';
import type { AppSettings, AppTimeZone, CalendarSystem, DateMonthDisplay, DateTimeSection, TimeFormat } from '@/types';
import {
  DEFAULT_DATE_TIME_SETTINGS,
  formatAppDate,
  formatAppTime,
  formatMedicineExpiryDate,
  normalizeDateTimeSettings,
  parseAppDate,
  resolveSalesModePrice
} from '../formatters';

const settingsFor = (section: DateTimeSection, calendar: CalendarSystem, monthDisplay: DateMonthDisplay = 'name'): AppSettings => ({
  storeName: 'Test',
  storePhone: '',
  storeAddress: '',
  taxRate: 0,
  language: 'english',
  aiLanguage: 'en',
  defaultSalesMode: 'retail',
  dateTimeSettings: {
    ...DEFAULT_DATE_TIME_SETTINGS,
    globalCalendar: calendar,
    sectionCalendars: {
      ...DEFAULT_DATE_TIME_SETTINGS.sectionCalendars,
      [section]: calendar,
    },
    monthDisplay,
    sectionMonthDisplays: {
      ...DEFAULT_DATE_TIME_SETTINGS.sectionMonthDisplays,
      [section]: monthDisplay,
    },
  },
});

describe('app date formatters', () => {
  it('parses YYYY-MM-DD as a stable local date without shifting the day', () => {
    const parsed = parseAppDate('2028-05-31');

    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2028);
    expect(parsed?.getMonth()).toBe(4);
    expect(parsed?.getDate()).toBe(31);
  });

  it('keeps medicine expiry dates Gregorian by default', () => {
    const label = formatMedicineExpiryDate('2028-05-31', {
      storeName: 'Test',
      storePhone: '',
      storeAddress: '',
      taxRate: 0,
      language: 'english',
      aiLanguage: 'en',
      defaultSalesMode: 'retail',
    });

    expect(label).toContain('2028');
    expect(label).toMatch(/May|5/);
  });

  it('formats Gregorian, Afghan solar, Iranian solar, and Hijri calendars through section settings', () => {
    const value = '2028-05-31';
    const gregorian = formatAppDate(value, settingsFor('sales', 'gregorian'), 'sales');
    const solarAfghan = formatAppDate(value, settingsFor('sales', 'solar_afghan'), 'sales');
    const solarIranian = formatAppDate(value, settingsFor('sales', 'solar_iranian'), 'sales');
    const hijri = formatAppDate(value, settingsFor('sales', 'hijri'), 'sales');

    expect(gregorian).toContain('2028');
    expect(solarAfghan).not.toEqual(gregorian);
    expect(solarIranian).not.toEqual(gregorian);
    expect(hijri).not.toEqual(gregorian);
    expect(new Set([gregorian, solarAfghan, solarIranian, hijri]).size).toBeGreaterThanOrEqual(3);
  });

  it('formats June 3 2026 as 13 Jawza 1405 in Afghanistan Solar Hijri', () => {
    const label = formatAppDate('2026-06-03', { ...settingsFor('sales', 'solar_afghan'), language: 'dari' }, 'sales', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    expect(label).toContain('۱۳');
    expect(label).toContain('جوزا');
    expect(label).toContain('۱۴۰۵');
    expect(label).not.toContain('خرداد');
    expect(label).not.toContain('۱۴۰۷');
  });

  it('keeps Iranian Solar Hijri separate from Afghanistan month names', () => {
    const afghan = formatAppDate('2026-06-03', { ...settingsFor('sales', 'solar_afghan'), language: 'dari' }, 'sales', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const iranian = formatAppDate('2026-06-03', { ...settingsFor('sales', 'solar_iranian'), language: 'dari' }, 'sales', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    expect(afghan).toContain('جوزا');
    expect(iranian).toContain('خرداد');
  });

  it('can display the month as a number per section', () => {
    const label = formatAppDate('2026-06-03', { ...settingsFor('sales', 'solar_afghan', 'number'), language: 'dari' }, 'sales', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    expect(label).toContain('۱۳');
    expect(label).toContain('۳');
    expect(label).toContain('۱۴۰۵');
    expect(label).not.toContain('جوزا');
    expect(label).not.toContain('خرداد');
  });

  it('keeps selected solar and Hijri calendars readable in English without changing saved settings', () => {
    for (const calendar of ['solar_afghan', 'solar_iranian', 'hijri'] as const) {
      const saved = settingsFor('sales', calendar);
      const before = JSON.stringify(saved);
      const label = formatAppDate('2026-06-03', saved, 'sales', { year: 'numeric', month: 'long', day: 'numeric' });
      expect(label).not.toMatch(/[\u0600-\u06ff]/);
      if (calendar === 'solar_afghan') expect(label).toContain('Jawza');
      expect(JSON.stringify(saved)).toBe(before);
    }
  });

  it('normalizes invalid calendar settings back to safe defaults', () => {
    const normalized = normalizeDateTimeSettings({
      globalCalendar: 'broken' as CalendarSystem,
      sectionCalendars: {
        sales: 'also-broken' as CalendarSystem,
        system: 'hijri',
      },
      monthDisplay: 'not-a-display' as DateMonthDisplay,
      sectionMonthDisplays: {
        sales: 'bad-display' as DateMonthDisplay,
        system: 'number',
      },
      timeFormat: '99h' as TimeFormat,
      timeZone: 'Mars/Local' as AppTimeZone,
    });

    expect(normalized.globalCalendar).toBe(DEFAULT_DATE_TIME_SETTINGS.globalCalendar);
    expect(normalized.sectionCalendars.sales).toBe(DEFAULT_DATE_TIME_SETTINGS.sectionCalendars.sales);
    expect(normalized.sectionCalendars.system).toBe('hijri');
    expect(normalized.monthDisplay).toBe(DEFAULT_DATE_TIME_SETTINGS.monthDisplay);
    expect(normalized.sectionMonthDisplays.sales).toBe(DEFAULT_DATE_TIME_SETTINGS.sectionMonthDisplays.sales);
    expect(normalized.sectionMonthDisplays.system).toBe('number');
    expect(normalized.timeFormat).toBe(DEFAULT_DATE_TIME_SETTINGS.timeFormat);
    expect(normalized.timeZone).toBe(DEFAULT_DATE_TIME_SETTINGS.timeZone);
  });

  it('uses the configured 12-hour or 24-hour time format', () => {
    const value = '2028-05-31T12:00:00.000Z';
    const twelveHour = formatAppTime(value, {
      ...settingsFor('sales', 'gregorian'),
      dateTimeSettings: {
        ...DEFAULT_DATE_TIME_SETTINGS,
        sectionCalendars: { ...DEFAULT_DATE_TIME_SETTINGS.sectionCalendars, sales: 'gregorian' },
        timeFormat: '12h',
        timeZone: 'Asia/Kabul',
      },
    }, 'sales');
    const twentyFourHour = formatAppTime(value, {
      ...settingsFor('sales', 'gregorian'),
      dateTimeSettings: {
        ...DEFAULT_DATE_TIME_SETTINGS,
        sectionCalendars: { ...DEFAULT_DATE_TIME_SETTINGS.sectionCalendars, sales: 'gregorian' },
        timeFormat: '24h',
        timeZone: 'Asia/Kabul',
      },
    }, 'sales');

    expect(twelveHour).toMatch(/AM|PM/);
    expect(twentyFourHour).not.toMatch(/AM|PM/);
  });
});

describe('sales mode price resolver', () => {
  it('uses requested mode and falls back safely when a mode price is missing', () => {
    expect(resolveSalesModePrice({ retail: 10, wholesale: 8, bulk: 6 }, 'wholesale')).toBe(8);
    expect(resolveSalesModePrice({ retail: 10, wholesale: 0, bulk: 6 }, 'wholesale')).toBe(10);
    expect(resolveSalesModePrice({ retail: 0, wholesale: 7, bulk: 6 }, 'retail')).toBe(7);
  });
});
