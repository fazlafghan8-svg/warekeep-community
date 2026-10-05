import React from 'react';
import type { AppSettings, AppTimeZone, CalendarSystem, DateMonthDisplay, DateTimeSection, TimeFormat } from '../../types';
import { DEFAULT_DATE_TIME_SETTINGS, formatAppDate, formatAppDateTime, normalizeDateTimeSettings } from '../../lib/formatters';
import { SettingsPanel } from './SettingsScaffold';
interface DateTimeSettingsProps {
    formData: AppSettings;
    isReadOnly?: boolean;
    onUpdateForm: (updater: (prev: AppSettings) => AppSettings) => void;
}
const calendarOptions: Array<{
    value: CalendarSystem;
    en: string;
    fa: string;
}> = [
    { value: 'gregorian', en: 'Gregorian', fa: 'میلادی' },
    { value: 'solar_afghan', en: 'Solar Hijri (Afghanistan)', fa: 'شمسی افغانستان' },
    { value: 'solar_iranian', en: 'Solar Hijri (Iran)', fa: 'شمسی ایران' },
    { value: 'hijri', en: 'Hijri', fa: 'قمری' },
];
const monthDisplayOptions: Array<{
    value: DateMonthDisplay;
    en: string;
    fa: string;
}> = [
    { value: 'name', en: 'Month name', fa: 'نام ماه' },
    { value: 'number', en: 'Month number', fa: 'عدد ماه' },
];
const sectionOptions: Array<{
    key: DateTimeSection;
    en: string;
    fa: string;
}> = [
    { key: 'medicineExpiry', en: 'Medicine expiry', fa: 'انقضای دوا' },
    { key: 'sales', en: 'Sales and invoices', fa: 'فروش و فاکتور' },
    { key: 'purchases', en: 'Purchases and suppliers', fa: 'خرید و تأمین‌کننده' },
    { key: 'expenses', en: 'Expenses', fa: 'مصارف' },
    { key: 'customers', en: 'Customers and debts', fa: 'مشتریان و بدهی‌ها' },
    { key: 'payroll', en: 'Payroll', fa: 'معاشات' },
    { key: 'treasury', en: 'Treasury', fa: 'خزانه' },
    { key: 'reports', en: 'Reports', fa: 'گزارش‌ها' },
    { key: 'dashboard', en: 'Dashboard', fa: 'داشبورد' },
    { key: 'system', en: 'System, devices, license', fa: 'سیستم، دستگاه و لایسنس' },
];
const selectClass = 'mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-300 focus:ring-2 focus:ring-brand-200/80 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';
const labelClass = 'block text-[11px] font-black uppercase tracking-[0.14em] text-slate-500';
export const DateTimeSettings: React.FC<DateTimeSettingsProps> = ({ formData, isReadOnly = false, onUpdateForm }) => {
    const isEnglish = (formData.language || 'dari') === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const settings = normalizeDateTimeSettings(formData.dateTimeSettings);
    const previewDate = React.useMemo(() => new Date(), []);
    const previewDateTime = previewDate;
    const updateDateTimeSettings = (updater: (current: typeof settings) => typeof settings) => {
        onUpdateForm((prev) => {
            const current = normalizeDateTimeSettings(prev.dateTimeSettings);
            return {
                ...prev,
                dateTimeSettings: updater(current),
            };
        });
    };
    const handleGlobalCalendar = (value: CalendarSystem) => {
        updateDateTimeSettings((current) => ({ ...current, globalCalendar: value }));
    };
    const handleSectionCalendar = (section: DateTimeSection, value: CalendarSystem) => {
        updateDateTimeSettings((current) => ({
            ...current,
            sectionCalendars: {
                ...current.sectionCalendars,
                [section]: value,
            },
        }));
    };
    const handleTimeFormat = (value: TimeFormat) => {
        updateDateTimeSettings((current) => ({ ...current, timeFormat: value }));
    };
    const handleMonthDisplay = (value: DateMonthDisplay) => {
        updateDateTimeSettings((current) => ({ ...current, monthDisplay: value }));
    };
    const handleSectionMonthDisplay = (section: DateTimeSection, value: DateMonthDisplay) => {
        updateDateTimeSettings((current) => ({
            ...current,
            sectionMonthDisplays: {
                ...current.sectionMonthDisplays,
                [section]: value,
            },
        }));
    };
    const handleTimeZone = (value: AppTimeZone) => {
        updateDateTimeSettings((current) => ({ ...current, timeZone: value }));
    };
    const resetDefaults = () => {
        updateDateTimeSettings(() => DEFAULT_DATE_TIME_SETTINGS);
    };
    return (<div className="space-y-4">
      <SettingsPanel eyebrow={tr('Display policy', 'سیاست نمایش')} title={tr('Date and Time', 'تاریخ و زمان')} description={tr('Raw records stay Gregorian/ISO for sorting and sync; these controls only change display, print, and reports.', 'رکورد خام برای مرتب‌سازی و همگام‌سازی میلادی/ISO می‌ماند؛ این تنظیمات فقط نمایش، چاپ و گزارش را تغییر می‌دهد.')} actions={<button type="button" onClick={resetDefaults} disabled={isReadOnly} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
            {tr('Restore defaults', 'بازگرداندن پیش‌فرض‌ها')}
          </button>}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="block">
            <span className={labelClass}>{tr('Global calendar', 'تقویم عمومی')}</span>
            <select value={settings.globalCalendar} onChange={(event) => handleGlobalCalendar(event.target.value as CalendarSystem)} className={selectClass} disabled={isReadOnly}>
              {calendarOptions.map((option) => <option key={option.value} value={option.value}>{tr(option.en, option.fa)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>{tr('Month display', 'شکل ماه')}</span>
            <select value={settings.monthDisplay} onChange={(event) => handleMonthDisplay(event.target.value as DateMonthDisplay)} className={selectClass} disabled={isReadOnly}>
              {monthDisplayOptions.map((option) => <option key={option.value} value={option.value}>{tr(option.en, option.fa)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>{tr('Time format', 'فرمت ساعت')}</span>
            <select value={settings.timeFormat} onChange={(event) => handleTimeFormat(event.target.value as TimeFormat)} className={selectClass} disabled={isReadOnly}>
              <option value="24h">{tr('24 hour', '۲۴ ساعته')}</option>
              <option value="12h">{tr('12 hour', '۱۲ ساعته')}</option>
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>{tr('Time zone', 'منطقه زمانی')}</span>
            <select value={settings.timeZone} onChange={(event) => handleTimeZone(event.target.value as AppTimeZone)} className={selectClass} disabled={isReadOnly}>
              <option value="Asia/Kabul">Asia/Kabul</option>
              <option value="local">{tr('Device local', 'زمان دستگاه')}</option>
              <option value="UTC">UTC</option>
            </select>
          </label>
        </div>
      </SettingsPanel>

      <SettingsPanel eyebrow={tr('Section overrides', 'تنظیم جداگانه بخش‌ها')} title={tr('Calendar by Section', 'تقویم هر بخش')} description={tr('Medicine expiry defaults to Gregorian. Business ledgers default to Afghanistan Solar Hijri.', 'انقضای دوا به طور پیش‌فرض میلادی است. دفترهای کاری به طور پیش‌فرض شمسی افغانستان هستند.')}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sectionOptions.map((section) => (<label key={section.key} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <span className={labelClass}>{tr(section.en, section.fa)}</span>
              <select aria-label={`${tr('Calendar', 'تقویم')} - ${tr(section.en, section.fa)}`} value={settings.sectionCalendars[section.key] || settings.globalCalendar} onChange={(event) => handleSectionCalendar(section.key, event.target.value as CalendarSystem)} className={selectClass} disabled={isReadOnly}>
                {calendarOptions.map((option) => <option key={option.value} value={option.value}>{tr(option.en, option.fa)}</option>)}
              </select>
              <select aria-label={`${tr('Month display', 'شکل ماه')} - ${tr(section.en, section.fa)}`} value={settings.sectionMonthDisplays[section.key] || settings.monthDisplay} onChange={(event) => handleSectionMonthDisplay(section.key, event.target.value as DateMonthDisplay)} className={selectClass} disabled={isReadOnly}>
                {monthDisplayOptions.map((option) => <option key={option.value} value={option.value}>{tr(option.en, option.fa)}</option>)}
              </select>
              <span className="mt-2 block text-[11px] font-semibold text-slate-500">
                {section.key === 'medicineExpiry'
                ? formatMedicineExpiryPreview(previewDate, { ...formData, dateTimeSettings: settings })
                : formatAppDate(previewDate, { ...formData, dateTimeSettings: settings }, section.key)}
              </span>
            </label>))}
        </div>
      </SettingsPanel>

      <SettingsPanel title={tr('Preview', 'پیش‌نمایش')}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{tr('Sales invoice date', 'تاریخ فاکتور فروش')}</p>
            <p className="mt-2 text-sm font-black text-slate-900">{formatAppDateTime(previewDateTime, { ...formData, dateTimeSettings: settings }, 'sales')}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{tr('Medicine expiry', 'انقضای دوا')}</p>
            <p className="mt-2 text-sm font-black text-slate-900">{formatMedicineExpiryPreview(previewDate, { ...formData, dateTimeSettings: settings })}</p>
          </div>
        </div>
      </SettingsPanel>
    </div>);
};
const formatMedicineExpiryPreview = (value: string | Date, settings: AppSettings) => formatAppDate(value, settings, 'medicineExpiry', { year: 'numeric', month: 'short', day: 'numeric' });
