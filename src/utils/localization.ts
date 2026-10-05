import type { AppSettings } from '@/types';
import { formatAppDate } from '@/lib/formatters';
import { DEFAULT_SALES_MODE } from '@/constants/sales';
export const AFGHAN_MONTHS = [
    "حمل", "ثور", "جوزا", "سرطان", "اسد", "سنبله",
    "میزان", "عقرب", "قوس", "جدی", "دلو", "حوت"
];
const AFGHAN_SOLAR_SETTINGS: AppSettings = {
    storeName: '',
    storePhone: '',
    storeAddress: '',
    taxRate: 0,
    defaultSalesMode: DEFAULT_SALES_MODE,
    language: 'dari',
    dateTimeSettings: {
        globalCalendar: 'solar_afghan',
        sectionCalendars: { system: 'solar_afghan' },
        monthDisplay: 'name',
        sectionMonthDisplays: { system: 'name' },
        timeFormat: '24h',
        timeZone: 'Asia/Kabul',
    },
};
export const normalizePersianNumbers = (str: string): string => {
    if (!str)
        return '';
    return str.replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d).toString())
        .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString());
};
export const formatCurrency = (amount: number): string => {
    return `${amount.toLocaleString('fa-AF')} افغانی`;
};
export const toAfghanDate = (dateInput: string | Date): string => {
    return formatAppDate(dateInput, AFGHAN_SOLAR_SETTINGS, 'system');
};
export const getAfghanMonthName = (dateInput: string | Date): string => {
    const month = formatAppDate(dateInput, AFGHAN_SOLAR_SETTINGS, 'system', { month: 'long' });
    return month === '-' ? '' : month;
};
export const medicineTypeTranslations: Record<string, string> = {
    'Tablet': 'قرص (Tablet)',
    'Capsule': 'کپسول (Capsule)',
    'Syrup': 'شربت (Syrup)',
    'Suspension': 'سوسپانسیون (Suspension)',
    'Ampoule': 'آمپول (Ampoule)',
    'Injection': 'تزریقی (Injection)',
    'Vial': 'ویال (Vial)',
    'Infusion': 'انفیوژن (Infusion)',
    'Powder': 'پودر (Powder)',
    'Granules': 'گرانول (Granules)',
    'Sachet': 'ساشه (Sachet)',
    'Oral Solution': 'محلول خوراکی (Oral Solution)',
    'Drop': 'قطره (Drop)',
    'Oral Drops': 'قطره خوراکی (Oral Drops)',
    'Eye Drops': 'قطره چشم (Eye Drops)',
    'Ear Drops': 'قطره گوش (Ear Drops)',
    'Nasal Drops': 'قطره بینی (Nasal Drops)',
    'Spray': 'اسپری (Spray)',
    'Nasal Spray': 'اسپری بینی (Nasal Spray)',
    'Inhaler': 'انهیلر (Inhaler)',
    'Nebulizer Solution': 'محلول نبولایزر (Nebulizer Solution)',
    'Ointment': 'پماد (Ointment)',
    'Cream': 'کرم (Cream)',
    'Gel': 'ژل (Gel)',
    'Lotion': 'لوشن (Lotion)',
    'Foam': 'فوم (Foam)',
    'Suppository': 'شیاف (Suppository)',
    'Patch': 'پچ (Patch)',
    'Mouthwash': 'دهان‌شویه (Mouthwash)',
    'Gargle': 'غرغره (Gargle)',
    'Serum': 'سرم (Serum)',
    'Shampoo': 'شامپو (Shampoo)',
    'Soap': 'صابون (Soap)',
    'Equipment': 'تجهیزات (Equipment)',
    'Other': 'سایر (Other)'
};
export const getMedicineTypeLabel = (type: string): string => {
    return medicineTypeTranslations[type] || type;
};
