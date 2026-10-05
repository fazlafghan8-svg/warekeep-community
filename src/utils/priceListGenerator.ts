import type { AppSettings, Batch, Medicine } from '@/types';
import { getMedicineUnitLabel } from '@/constants/medicineUnits';
import { getMedicineTypeLabel } from './localization';
export type PriceListPreset = 'customer' | 'internal';
export type PriceListNumeralStyle = 'auto' | 'english' | 'persian';
export type PriceListPageSize = 'A4' | 'A5';
export type PriceListPageOrientation = 'portrait' | 'landscape';
export type PriceListFontFamily = 'system' | 'vazirmatn' | 'tahoma' | 'arial' | 'serif';
export type PriceListTableDensity = 'compact' | 'comfortable' | 'spacious';
export type PriceListHeaderLayout = 'split' | 'centered' | 'stacked';
export type PriceListTitleAlign = 'start' | 'center' | 'end';
export type PriceListBorderStyle = 'grid' | 'soft' | 'minimal';
export type PriceListWatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
export type PriceListTextAlign = 'start' | 'center' | 'end' | 'left' | 'right';
export type PriceListLogoPosition = 'start' | 'end' | 'top' | 'hidden';
export type PriceListEditablePart = 'logo' | 'title' | 'subtitle' | 'storeName' | 'contact' | 'address' | 'meta' | 'topNote' | 'tableHeader' | 'tableBody' | 'tableCell' | 'footer' | 'watermark';
export type PriceListTextOverrideKey = 'title' | 'subtitle' | 'storeName' | 'contact' | 'address' | 'topNote' | 'footer' | 'watermark' | 'logoText';
export type PriceListSectionStyle = {
    color?: string;
    backgroundColor?: string;
    align?: PriceListTextAlign;
    fontSize?: number;
    offsetXmm?: number;
    offsetYmm?: number;
};
export type PriceListSectionStyleMap = Partial<Record<PriceListEditablePart, PriceListSectionStyle>>;
export type PriceListTextOverrideMap = Partial<Record<PriceListTextOverrideKey, string>>;
export type PriceListCellOverrides = Record<string, Partial<Record<PriceListFieldKey, string>>>;
export type PriceListHeaderOverrides = Partial<Record<PriceListFieldKey, string>>;
export type PriceListFieldKey = 'name' | 'genericName' | 'manufacturer' | 'type' | 'unit' | 'barcode' | 'description' | 'retailPrice' | 'wholesalePrice' | 'bulkPrice' | 'stock' | 'status' | 'nextExpiry' | 'location' | 'averagePurchasePrice' | 'totalPurchaseValue' | 'batchDetails';
export type PriceListFieldGroup = 'general' | 'sales' | 'inventory' | 'internal';
export interface PriceListFieldDefinition {
    key: PriceListFieldKey;
    group: PriceListFieldGroup;
    label: {
        en: string;
        fa: string;
    };
    sensitive?: boolean;
}
export interface PriceListRowInput {
    medicine: Medicine;
    canonicalManufacturer?: string;
    totalQuantity?: number;
    nextExpiry?: string | null;
    averagePurchasePrice?: number;
    totalPurchaseValue?: number;
}
export interface PriceListBrandingOptions {
    title?: string;
    subtitle?: string;
    footerNote?: string;
    showLogo?: boolean;
    showStoreName?: boolean;
    showContact?: boolean;
}
export interface PriceListDesignOptions {
    numeralStyle?: PriceListNumeralStyle;
    pageSize?: PriceListPageSize;
    orientation?: PriceListPageOrientation;
    marginMm?: number;
    primaryColor?: string;
    accentColor?: string;
    fontFamily?: PriceListFontFamily;
    fontSize?: number;
    tableDensity?: PriceListTableDensity;
    headerLayout?: PriceListHeaderLayout;
    titleAlign?: PriceListTitleAlign;
    bodyTextAlign?: PriceListTextAlign;
    borderStyle?: PriceListBorderStyle;
    logoPosition?: PriceListLogoPosition;
    logoSize?: number;
    logoBackgroundColor?: string;
    zebraRows?: boolean;
    showGeneratedAt?: boolean;
    showItemCount?: boolean;
    showCurrency?: boolean;
    topNote?: string;
    showWatermark?: boolean;
    watermarkText?: string;
    watermarkPosition?: PriceListWatermarkPosition;
    watermarkOpacity?: number;
    sectionStyles?: PriceListSectionStyleMap;
    textOverrides?: PriceListTextOverrideMap;
}
export interface PriceListGenerationOptions extends PriceListBrandingOptions {
    rows: PriceListRowInput[];
    selectedFieldKeys: PriceListFieldKey[];
    settings: AppSettings;
    canViewPurchasePrice: boolean;
    generatedAt?: Date;
    design?: PriceListDesignOptions;
    cellOverrides?: PriceListCellOverrides;
    headerOverrides?: PriceListHeaderOverrides;
    previewSelection?: {
        part: PriceListEditablePart;
        rowId?: string;
        field?: PriceListFieldKey;
    };
}
type ResolvedPriceListRow = PriceListRowInput & {
    totalQuantity: number;
    nextExpiry: string | null;
    averagePurchasePrice: number;
    totalPurchaseValue: number;
};
export const PRICE_LIST_FIELD_DEFINITIONS: PriceListFieldDefinition[] = [
    { key: 'name', group: 'general', label: { en: 'Medicine', fa: 'نام دوا' } },
    { key: 'genericName', group: 'general', label: { en: 'Generic / Composition', fa: 'نام جنریک / ترکیب' } },
    { key: 'manufacturer', group: 'general', label: { en: 'Company', fa: 'شرکت' } },
    { key: 'type', group: 'general', label: { en: 'Type', fa: 'نوع' } },
    { key: 'unit', group: 'general', label: { en: 'Unit', fa: 'واحد' } },
    { key: 'barcode', group: 'general', label: { en: 'Barcode', fa: 'بارکد' } },
    { key: 'description', group: 'general', label: { en: 'Description', fa: 'توضیحات' } },
    { key: 'retailPrice', group: 'sales', label: { en: 'Retail Price', fa: 'قیمت پرچون' } },
    { key: 'wholesalePrice', group: 'sales', label: { en: 'Wholesale Price', fa: 'قیمت عمده' } },
    { key: 'bulkPrice', group: 'sales', label: { en: 'Bulk Price', fa: 'قیمت کارتنی' } },
    { key: 'stock', group: 'inventory', label: { en: 'Available Stock', fa: 'موجودی قابل فروش' } },
    { key: 'status', group: 'inventory', label: { en: 'Status', fa: 'وضعیت' } },
    { key: 'nextExpiry', group: 'inventory', label: { en: 'Next Expiry', fa: 'نزدیک‌ترین انقضا' } },
    { key: 'location', group: 'inventory', label: { en: 'Rack / Shelf', fa: 'رک / قفسه' } },
    { key: 'averagePurchasePrice', group: 'internal', label: { en: 'Avg. Purchase', fa: 'میانگین قیمت خرید' }, sensitive: true },
    { key: 'totalPurchaseValue', group: 'internal', label: { en: 'Stock Value', fa: 'ارزش موجودی' }, sensitive: true },
    { key: 'batchDetails', group: 'internal', label: { en: 'Batch Details', fa: 'جزئیات بچ' }, sensitive: true }
];
const SENSITIVE_FIELDS = new Set<PriceListFieldKey>(PRICE_LIST_FIELD_DEFINITIONS.filter((field) => field.sensitive).map((field) => field.key));
const getCurrencyFractionDigits = (currency?: string) => (currency === 'IRR' ? 0 : 2);
export const escapePriceListHtml = (value: unknown): string => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const sanitizeCssColor = (value: unknown, fallback = '#2563eb') => {
    const color = String(value || '').trim();
    return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color) ? color : fallback;
};
const sanitizeOptionalCssColor = (value: unknown) => {
    const color = String(value || '').trim();
    return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color) ? color : '';
};
const sanitizeAssetUrl = (value: unknown) => {
    const source = String(value || '').trim();
    if (!source)
        return '';
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(source))
        return source;
    if (/^(https?:|file:)/i.test(source))
        return source;
    return '';
};
const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.min(max, Math.max(min, parsed));
};
const sanitizeOffsetMm = (value: unknown) => clampNumber(value, 0, -80, 80);
const sanitizeSectionFontSize = (value: unknown) => clampNumber(value, 0, 6, 72);
const sanitizeOption = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => allowed.includes(value as T) ? value as T : fallback;
const normalizeNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const PRICE_VALUE_FIELDS = new Set<PriceListFieldKey>(['retailPrice', 'wholesalePrice', 'bulkPrice', 'averagePurchasePrice', 'totalPurchaseValue']);
const getNumeralLocale = (style: PriceListNumeralStyle | undefined, isEnglish: boolean) => {
    if (style === 'english')
        return 'en-US';
    if (style === 'persian')
        return 'fa-AF';
    return isEnglish ? 'en-US' : 'fa-AF';
};
const formatNumber = (value: unknown, locale: string) => normalizeNumber(value).toLocaleString(locale, {
    maximumFractionDigits: 2
});
const formatMoney = (value: unknown, currency: string, locale: string) => `${normalizeNumber(value).toLocaleString(locale, {
    maximumFractionDigits: getCurrencyFractionDigits(currency)
})} ${escapePriceListHtml(currency)}`;
const formatDate = (value: string | null | undefined, locale: string) => {
    if (!value)
        return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()))
        return value;
    return date.toLocaleDateString(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
};
const getBatchQuantity = (batch: Batch) => normalizeNumber(batch.quantity);
const resolveTotals = (row: PriceListRowInput): ResolvedPriceListRow => {
    const batches = row.medicine.batches || [];
    let totalQuantity = 0;
    let totalPurchaseValue = 0;
    let nextExpiryTs = Number.POSITIVE_INFINITY;
    let nextExpiry: string | null = null;
    batches.forEach((batch) => {
        const quantity = getBatchQuantity(batch);
        totalQuantity += quantity;
        totalPurchaseValue += quantity * normalizeNumber(batch.purchasePrice);
        if (quantity <= 0 || !batch.expiryDate)
            return;
        const expiryTs = new Date(batch.expiryDate).getTime();
        if (!Number.isFinite(expiryTs) || expiryTs >= nextExpiryTs)
            return;
        nextExpiryTs = expiryTs;
        nextExpiry = batch.expiryDate;
    });
    const resolvedQuantity = typeof row.totalQuantity === 'number' && Number.isFinite(row.totalQuantity)
        ? row.totalQuantity
        : totalQuantity;
    const resolvedValue = typeof row.totalPurchaseValue === 'number' && Number.isFinite(row.totalPurchaseValue)
        ? row.totalPurchaseValue
        : totalPurchaseValue;
    return {
        ...row,
        totalQuantity: resolvedQuantity,
        nextExpiry: typeof row.nextExpiry === 'string' || row.nextExpiry === null ? row.nextExpiry : nextExpiry,
        averagePurchasePrice: typeof row.averagePurchasePrice === 'number' && Number.isFinite(row.averagePurchasePrice)
            ? row.averagePurchasePrice
            : resolvedQuantity > 0
                ? Math.round(resolvedValue / resolvedQuantity)
                : 0,
        totalPurchaseValue: resolvedValue
    };
};
export const normalizePriceListFields = (fields: PriceListFieldKey[], canViewPurchasePrice: boolean): PriceListFieldKey[] => {
    const allowedKeys = new Set(PRICE_LIST_FIELD_DEFINITIONS.map((field) => field.key));
    const normalized: PriceListFieldKey[] = [];
    fields.forEach((field) => {
        if (!allowedKeys.has(field))
            return;
        if (!canViewPurchasePrice && SENSITIVE_FIELDS.has(field))
            return;
        if (!normalized.includes(field))
            normalized.push(field);
    });
    return normalized.length > 0 ? normalized : getDefaultPriceListFields('customer', canViewPurchasePrice);
};
export const getDefaultPriceListFields = (preset: PriceListPreset, canViewPurchasePrice: boolean): PriceListFieldKey[] => {
    const customerFields: PriceListFieldKey[] = [
        'name',
        'genericName',
        'manufacturer',
        'type',
        'unit',
        'retailPrice',
        'wholesalePrice',
        'bulkPrice',
        'stock',
        'status',
        'description'
    ];
    if (preset === 'customer')
        return customerFields;
    return normalizePriceListFields([
        ...customerFields,
        'barcode',
        'nextExpiry',
        'location',
        'averagePurchasePrice',
        'totalPurchaseValue',
        'batchDetails'
    ], canViewPurchasePrice);
};
const getStatusLabel = (row: ResolvedPriceListRow, isEnglish: boolean) => {
    if (row.medicine.isDeleted)
        return isEnglish ? 'Archived' : 'بایگانی';
    if (row.totalQuantity <= 0)
        return isEnglish ? 'Unavailable' : 'ناموجود';
    if (row.totalQuantity < normalizeNumber(row.medicine.lowStockThreshold)) {
        return isEnglish ? 'Low stock' : 'موجودی کم';
    }
    return isEnglish ? 'Available' : 'موجود';
};
const getLocationLabel = (medicine: Medicine) => {
    const locations = (medicine.batches || [])
        .map((batch) => {
        const rack = batch.location?.rack?.trim();
        const shelf = batch.location?.shelf?.trim();
        return [rack, shelf].filter(Boolean).join(' / ');
    })
        .filter(Boolean);
    return Array.from(new Set(locations)).join(', ');
};
const getBatchDetails = (medicine: Medicine, currency: string, isEnglish: boolean, locale: string) => {
    const batches = (medicine.batches || []).filter((batch) => getBatchQuantity(batch) > 0);
    if (batches.length === 0)
        return '';
    return batches
        .map((batch) => {
        const parts = [
            batch.batchNumber ? `${isEnglish ? 'Batch' : 'بچ'}: ${batch.batchNumber}` : '',
            `${isEnglish ? 'Qty' : 'تعداد'}: ${formatNumber(batch.quantity, locale)}`,
            batch.expiryDate ? `${isEnglish ? 'Exp' : 'انقضا'}: ${formatDate(batch.expiryDate, locale)}` : '',
            `${isEnglish ? 'Buy' : 'خرید'}: ${formatMoney(batch.purchasePrice, currency, locale)}`
        ].filter(Boolean);
        return parts.join(' | ');
    })
        .join('\n');
};
const getFieldValue = (row: ResolvedPriceListRow, field: PriceListFieldKey, settings: AppSettings, canViewPurchasePrice: boolean, locale?: string) => {
    const isEnglish = (settings.language || 'dari') === 'english';
    const numberLocale = locale || getNumeralLocale('auto', isEnglish);
    const currency = settings.currencySettings?.baseCurrency || 'AFN';
    const { medicine } = row;
    if (!canViewPurchasePrice && SENSITIVE_FIELDS.has(field))
        return '';
    switch (field) {
        case 'name':
            return medicine.name;
        case 'genericName':
            return medicine.genericName || medicine.clinicalSummary?.composition || '';
        case 'manufacturer':
            return row.canonicalManufacturer || medicine.manufacturer || '';
        case 'type':
            return isEnglish ? medicine.type : getMedicineTypeLabel(medicine.type);
        case 'unit':
            return getMedicineUnitLabel(medicine.unit, isEnglish);
        case 'barcode':
            return medicine.barcode || '';
        case 'description':
            return medicine.description || '';
        case 'retailPrice':
            return formatMoney(medicine.salePrices?.retail, currency, numberLocale);
        case 'wholesalePrice':
            return formatMoney(medicine.salePrices?.wholesale, currency, numberLocale);
        case 'bulkPrice':
            return formatMoney(medicine.salePrices?.bulk, currency, numberLocale);
        case 'stock':
            return `${formatNumber(row.totalQuantity, numberLocale)} ${getMedicineUnitLabel(medicine.unit, isEnglish)}`;
        case 'status':
            return getStatusLabel(row, isEnglish);
        case 'nextExpiry':
            return formatDate(row.nextExpiry, numberLocale);
        case 'location':
            return getLocationLabel(medicine);
        case 'averagePurchasePrice':
            return formatMoney(row.averagePurchasePrice, currency, numberLocale);
        case 'totalPurchaseValue':
            return formatMoney(row.totalPurchaseValue, currency, numberLocale);
        case 'batchDetails':
            return getBatchDetails(medicine, currency, isEnglish, numberLocale);
        default:
            return '';
    }
};
const renderCellValue = (value: unknown) => {
    const safe = escapePriceListHtml(value);
    return safe ? safe.replace(/\n/g, '<br />') : '<span class="muted">-</span>';
};
export const getPriceListBrandingSuggestions = (settings: AppSettings, footerNote?: string): string[] => {
    const suggestions: string[] = [];
    const design = settings.invoiceDesign || {};
    if (!sanitizeAssetUrl(design.logo))
        suggestions.push('لوگو اضافه کنید');
    if (!String(settings.storeName || '').trim())
        suggestions.push('نام دواخانه را تکمیل کنید');
    if (!String(settings.storePhone || design.customPhone || '').trim())
        suggestions.push('شماره تماس اضافه کنید');
    if (!String(settings.storeAddress || '').trim())
        suggestions.push('آدرس اضافه کنید');
    if (!String(footerNote || design.footerText || '').trim())
        suggestions.push('یادداشت پایین صفحه اضافه کنید');
    return suggestions;
};
const PRICE_LIST_FONT_STACKS: Record<PriceListFontFamily, string> = {
    system: "Inter, Vazirmatn, Tahoma, Arial, sans-serif",
    vazirmatn: "Vazirmatn, Tahoma, Arial, sans-serif",
    tahoma: "Tahoma, Arial, sans-serif",
    arial: "Arial, Helvetica, sans-serif",
    serif: "Georgia, 'Times New Roman', serif"
};
type ResolvedPriceListDesign = Required<Omit<PriceListDesignOptions, 'topNote' | 'watermarkText'>> & {
    topNote: string;
    watermarkText: string;
};
const resolvePriceListDesign = (options: PriceListGenerationOptions, isEnglish: boolean): ResolvedPriceListDesign => {
    const source = options.design || {};
    const invoiceDesign = options.settings.invoiceDesign || {};
    return {
        numeralStyle: sanitizeOption(source.numeralStyle, ['auto', 'english', 'persian'] as const, 'auto'),
        pageSize: sanitizeOption(source.pageSize, ['A4', 'A5'] as const, 'A4'),
        orientation: sanitizeOption(source.orientation, ['portrait', 'landscape'] as const, 'portrait'),
        marginMm: clampNumber(source.marginMm, 12, 6, 24),
        primaryColor: sanitizeCssColor(source.primaryColor || invoiceDesign.primaryColor, '#2563eb'),
        accentColor: sanitizeCssColor(source.accentColor, '#0f172a'),
        fontFamily: sanitizeOption(source.fontFamily, ['system', 'vazirmatn', 'tahoma', 'arial', 'serif'] as const, isEnglish ? 'system' : 'vazirmatn'),
        fontSize: clampNumber(source.fontSize, 11, 9, 14),
        tableDensity: sanitizeOption(source.tableDensity, ['compact', 'comfortable', 'spacious'] as const, 'comfortable'),
        headerLayout: sanitizeOption(source.headerLayout, ['split', 'centered', 'stacked'] as const, 'split'),
        titleAlign: sanitizeOption(source.titleAlign, ['start', 'center', 'end'] as const, 'start'),
        bodyTextAlign: sanitizeOption(source.bodyTextAlign, ['start', 'center', 'end', 'left', 'right'] as const, 'start'),
        borderStyle: sanitizeOption(source.borderStyle, ['grid', 'soft', 'minimal'] as const, 'grid'),
        logoPosition: sanitizeOption(source.logoPosition, ['start', 'end', 'top', 'hidden'] as const, 'start'),
        logoSize: clampNumber(source.logoSize, 58, 32, 96),
        logoBackgroundColor: sanitizeCssColor(source.logoBackgroundColor, '#ffffff'),
        zebraRows: source.zebraRows !== false,
        showGeneratedAt: source.showGeneratedAt !== false,
        showItemCount: source.showItemCount !== false,
        showCurrency: source.showCurrency !== false,
        topNote: String(source.topNote || '').trim(),
        showWatermark: source.showWatermark !== false,
        watermarkText: String(source.watermarkText || 'WareKeep').trim().slice(0, 48) || 'WareKeep',
        watermarkPosition: sanitizeOption(source.watermarkPosition, ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'] as const, 'bottom-left'),
        watermarkOpacity: clampNumber(source.watermarkOpacity, 0.16, 0.04, 0.3),
        sectionStyles: source.sectionStyles || {},
        textOverrides: source.textOverrides || {}
    };
};
const getPageDimensions = (pageSize: PriceListPageSize, orientation: PriceListPageOrientation) => {
    const base = pageSize === 'A5'
        ? { width: 148, height: 210 }
        : { width: 210, height: 297 };
    return orientation === 'landscape'
        ? { width: base.height, height: base.width }
        : base;
};
const getDensityPadding = (density: PriceListTableDensity) => {
    if (density === 'compact')
        return { th: '5px 5px', td: '4px 5px' };
    if (density === 'spacious')
        return { th: '9px 8px', td: '8px 8px' };
    return { th: '7px 6px', td: '6px' };
};
const getAlignmentValue = (align: PriceListTextAlign | PriceListTitleAlign | undefined, isEnglish: boolean) => {
    if (align === 'center')
        return 'center';
    if (align === 'left')
        return 'left';
    if (align === 'right')
        return 'right';
    if (align === 'end')
        return isEnglish ? 'right' : 'left';
    return isEnglish ? 'left' : 'right';
};
const getTableBorderColor = (borderStyle: PriceListBorderStyle) => {
    if (borderStyle === 'minimal')
        return 'transparent';
    if (borderStyle === 'soft')
        return '#eef2f7';
    return '#e5e7eb';
};
const renderSafeTextBlock = (value: string) => {
    const safe = escapePriceListHtml(value);
    return safe.replace(/\n/g, '<br />');
};
const getSectionStyle = (styles: PriceListSectionStyleMap, part: PriceListEditablePart, isEnglish: boolean, fallback: {
    color?: string;
    backgroundColor?: string;
    align?: string;
    fontSize?: number;
    offsetXmm?: number;
    offsetYmm?: number;
} = {}) => {
    const source = styles[part] || {};
    const color = sanitizeOptionalCssColor(source.color) || fallback.color || '';
    const backgroundColor = sanitizeOptionalCssColor(source.backgroundColor) || fallback.backgroundColor || '';
    const align = source.align ? getAlignmentValue(source.align, isEnglish) : fallback.align;
    const fontSize = source.fontSize === undefined ? fallback.fontSize || 0 : sanitizeSectionFontSize(source.fontSize);
    const offsetXmm = source.offsetXmm === undefined ? fallback.offsetXmm || 0 : sanitizeOffsetMm(source.offsetXmm);
    const offsetYmm = source.offsetYmm === undefined ? fallback.offsetYmm || 0 : sanitizeOffsetMm(source.offsetYmm);
    return {
        color,
        backgroundColor,
        align,
        fontSize,
        offsetXmm,
        offsetYmm
    };
};
const renderInlineStyle = (style: {
    color?: string;
    backgroundColor?: string;
    align?: string;
    fontSize?: number;
    offsetXmm?: number;
    offsetYmm?: number;
}) => {
    const offsetX = sanitizeOffsetMm(style.offsetXmm);
    const offsetY = sanitizeOffsetMm(style.offsetYmm);
    const fontSize = sanitizeSectionFontSize(style.fontSize);
    const declarations = [
        style.color ? `color: ${style.color}` : '',
        style.backgroundColor ? `background-color: ${style.backgroundColor}` : '',
        style.align ? `text-align: ${style.align}` : '',
        fontSize ? `font-size: ${fontSize}px` : '',
        offsetX || offsetY ? 'position: relative' : '',
        offsetX || offsetY ? `transform: translate(${offsetX}mm, ${offsetY}mm)` : ''
    ].filter(Boolean);
    return declarations.length ? ` style="${declarations.join('; ')}"` : '';
};
const editableAttrs = (part: PriceListEditablePart, extra: Record<string, string | undefined> = {}) => {
    const extraAttrs = Object.entries(extra)
        .filter(([, value]) => typeof value === 'string' && value.length > 0)
        .map(([key, value]) => {
        const attrKey = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
        return ` data-wk-edit-${attrKey}="${escapePriceListHtml(value)}"`;
    })
        .join('');
    return ` data-wk-edit-part="${part}"${extraAttrs}`;
};
const getTextOverride = (overrides: PriceListTextOverrideMap, key: PriceListTextOverrideKey, fallback: string) => {
    const override = overrides[key];
    return typeof override === 'string' && override.length > 0 ? override : fallback;
};
const getCellOverrideValue = (overrideValue: string | undefined, field: PriceListFieldKey, currency: string, locale: string) => {
    if (typeof overrideValue !== 'string' || overrideValue.trim() === '')
        return undefined;
    const trimmed = overrideValue.trim();
    const numeric = Number(trimmed);
    if (PRICE_VALUE_FIELDS.has(field) && Number.isFinite(numeric)) {
        return formatMoney(numeric, currency, locale);
    }
    return trimmed;
};
const getFieldLabel = (field: PriceListFieldKey, isEnglish: boolean, headerOverrides?: PriceListHeaderOverrides) => {
    const override = headerOverrides?.[field];
    if (typeof override === 'string' && override.trim())
        return override.trim();
    const definition = PRICE_LIST_FIELD_DEFINITIONS.find((item) => item.key === field);
    return definition ? (isEnglish ? definition.label.en : definition.label.fa) : field;
};
const isSelectedPreviewTarget = (selection: PriceListGenerationOptions['previewSelection'], part: PriceListEditablePart, extra: {
    rowId?: string;
    field?: PriceListFieldKey;
} = {}) => {
    if (!selection || selection.part !== part)
        return false;
    if (selection.rowId && selection.rowId !== extra.rowId)
        return false;
    if (selection.field && selection.field !== extra.field)
        return false;
    if (!selection.rowId && extra.rowId && part === 'tableCell')
        return false;
    if (!selection.field && extra.field && part === 'tableHeader')
        return false;
    return true;
};
const selectedPreviewClass = (selection: PriceListGenerationOptions['previewSelection'], part: PriceListEditablePart, extra: {
    rowId?: string;
    field?: PriceListFieldKey;
} = {}) => isSelectedPreviewTarget(selection, part, extra) ? ' wk-selected' : '';
export const generatePriceListHTML = (options: PriceListGenerationOptions): string => {
    const { rows, settings, canViewPurchasePrice } = options;
    const isEnglish = (settings.language || 'dari') === 'english';
    const direction = isEnglish ? 'ltr' : 'rtl';
    const textAlign = isEnglish ? 'left' : 'right';
    const design = settings.invoiceDesign || {};
    const resolvedDesign = resolvePriceListDesign(options, isEnglish);
    const primaryColor = resolvedDesign.primaryColor;
    const accentColor = resolvedDesign.accentColor;
    const page = getPageDimensions(resolvedDesign.pageSize, resolvedDesign.orientation);
    const numberLocale = getNumeralLocale(resolvedDesign.numeralStyle, isEnglish);
    const densityPadding = getDensityPadding(resolvedDesign.tableDensity);
    const titleAlign = getAlignmentValue(resolvedDesign.titleAlign, isEnglish);
    const bodyTextAlign = getAlignmentValue(resolvedDesign.bodyTextAlign, isEnglish);
    const borderColor = getTableBorderColor(resolvedDesign.borderStyle);
    const sectionStyles = resolvedDesign.sectionStyles;
    const textOverrides = resolvedDesign.textOverrides;
    const logoVisible = options.showLogo !== false && resolvedDesign.logoPosition !== 'hidden';
    const logoSrc = logoVisible ? sanitizeAssetUrl(design.logo) : '';
    const showStoreName = options.showStoreName !== false;
    const showContact = options.showContact !== false;
    const generatedAt = options.generatedAt || new Date();
    const safeStoreName = escapePriceListHtml(getTextOverride(textOverrides, 'storeName', settings.storeName || (isEnglish ? 'Pharmacy' : 'دواخانه')));
    const safeStorePhone = escapePriceListHtml(design.customPhone || settings.storePhone || '');
    const safeStoreAddress = escapePriceListHtml(getTextOverride(textOverrides, 'address', settings.storeAddress || ''));
    const safeTitle = escapePriceListHtml(getTextOverride(textOverrides, 'title', options.title || (isEnglish ? 'Medicine Price List' : 'پرایس‌لیست دواها')));
    const safeSubtitle = escapePriceListHtml(getTextOverride(textOverrides, 'subtitle', options.subtitle || (isEnglish ? 'Prepared for customers' : 'برای معلومات مشتریان')));
    const safeFooter = escapePriceListHtml(getTextOverride(textOverrides, 'footer', options.footerNote || design.footerText || ''));
    const safeTopNote = renderSafeTextBlock(getTextOverride(textOverrides, 'topNote', resolvedDesign.topNote));
    const safeWatermarkText = escapePriceListHtml(getTextOverride(textOverrides, 'watermark', resolvedDesign.watermarkText));
    const safeLogoText = escapePriceListHtml(getTextOverride(textOverrides, 'logoText', (settings.storeName || 'W').trim().charAt(0) || 'W'));
    const currency = settings.currencySettings?.baseCurrency || 'AFN';
    const fields = normalizePriceListFields(options.selectedFieldKeys, canViewPurchasePrice);
    const resolvedRows = rows.map(resolveTotals);
    const previewSelection = options.previewSelection;
    const labels = {
        generated: isEnglish ? 'Generated' : 'تاریخ ساخت',
        count: isEnglish ? 'Items' : 'تعداد اقلام',
        phone: isEnglish ? 'Phone' : 'تماس',
        address: isEnglish ? 'Address' : 'آدرس',
        noRows: isEnglish ? 'No medicines selected.' : 'هیچ دوایی انتخاب نشده است.'
    };
    const headerCells = fields
        .map((field) => {
        const label = getFieldLabel(field, isEnglish, options.headerOverrides);
        return `<th class="wk-editable${selectedPreviewClass(previewSelection, 'tableHeader', { field })}" ${editableAttrs('tableHeader', { field })}>${escapePriceListHtml(label)}</th>`;
    })
        .join('');
    const bodyRows = resolvedRows.length
        ? resolvedRows
            .map((row, rowIndex) => {
            const rowOverrides = options.cellOverrides?.[row.medicine.id] || {};
            const cells = fields
                .map((field) => {
                const value = getCellOverrideValue(rowOverrides[field], field, currency, numberLocale) ??
                    getFieldValue(row, field, settings, canViewPurchasePrice, numberLocale);
                return `<td class="wk-editable${selectedPreviewClass(previewSelection, 'tableCell', { rowId: row.medicine.id, field })}" ${editableAttrs('tableCell', { rowId: row.medicine.id, field })}>${renderCellValue(value)}</td>`;
            })
                .join('');
            return `<tr><td class="index-cell wk-editable${selectedPreviewClass(previewSelection, 'tableBody', { rowId: row.medicine.id })}" ${editableAttrs('tableBody', { rowId: row.medicine.id })}>${formatNumber(rowIndex + 1, numberLocale)}</td>${cells}</tr>`;
        })
            .join('')
        : `<tr><td colspan="${fields.length + 1}" class="empty-cell">${labels.noRows}</td></tr>`;
    const metaItems = [
        resolvedDesign.showGeneratedAt
            ? `${labels.generated}: ${escapePriceListHtml(generatedAt.toLocaleString(numberLocale))}`
            : '',
        resolvedDesign.showItemCount
            ? `${labels.count}: ${formatNumber(resolvedRows.length, numberLocale)}`
            : '',
        resolvedDesign.showCurrency ? escapePriceListHtml(currency) : ''
    ].filter(Boolean);
    const headerLayoutClass = `header-${resolvedDesign.headerLayout}`;
    const watermarkClass = `watermark-${resolvedDesign.watermarkPosition}`;
    const logoOrderClass = `logo-${resolvedDesign.logoPosition}`;
    const logoStyle = renderInlineStyle(getSectionStyle(sectionStyles, 'logo', isEnglish, { backgroundColor: resolvedDesign.logoBackgroundColor, fontSize: 24 }));
    const titleStyle = renderInlineStyle(getSectionStyle(sectionStyles, 'title', isEnglish, { color: primaryColor, align: titleAlign, fontSize: 24 }));
    const subtitleStyle = renderInlineStyle(getSectionStyle(sectionStyles, 'subtitle', isEnglish, { fontSize: resolvedDesign.fontSize + 1 }));
    const storeNameStyle = renderInlineStyle(getSectionStyle(sectionStyles, 'storeName', isEnglish, { color: accentColor, fontSize: 18 }));
    const contactStyle = renderInlineStyle(getSectionStyle(sectionStyles, 'contact', isEnglish, { fontSize: 10 }));
    const addressStyle = renderInlineStyle(getSectionStyle(sectionStyles, 'address', isEnglish, { fontSize: 10 }));
    const metaStyle = renderInlineStyle(getSectionStyle(sectionStyles, 'meta', isEnglish, { fontSize: resolvedDesign.fontSize }));
    const topNoteStyle = renderInlineStyle(getSectionStyle(sectionStyles, 'topNote', isEnglish, { fontSize: resolvedDesign.fontSize }));
    const footerStyle = renderInlineStyle(getSectionStyle(sectionStyles, 'footer', isEnglish, { fontSize: 10 }));
    const watermarkStyle = renderInlineStyle(getSectionStyle(sectionStyles, 'watermark', isEnglish, { color: accentColor, fontSize: 9 }));
    const tableHeaderStyle = getSectionStyle(sectionStyles, 'tableHeader', isEnglish, {
        color: '#ffffff',
        backgroundColor: primaryColor,
        align: bodyTextAlign,
        fontSize: 9.5
    });
    const tableBodyStyle = getSectionStyle(sectionStyles, 'tableBody', isEnglish, {
        color: '#1f2937',
        align: bodyTextAlign,
        fontSize: resolvedDesign.fontSize
    });
    const tableCellStyle = getSectionStyle(sectionStyles, 'tableCell', isEnglish, {
        color: tableBodyStyle.color,
        backgroundColor: tableBodyStyle.backgroundColor,
        align: tableBodyStyle.align,
        fontSize: tableBodyStyle.fontSize
    });
    const contactOverride = getTextOverride(textOverrides, 'contact', '');
    const hasAddressOverride = typeof textOverrides.address === 'string' && textOverrides.address.length > 0;
    const phoneHtml = contactOverride
        ? renderSafeTextBlock(contactOverride)
        : (safeStorePhone ? `${labels.phone}: ${safeStorePhone}` : '');
    const addressHtml = safeStoreAddress && (!contactOverride || hasAddressOverride) ? `${labels.address}: ${safeStoreAddress}` : '';
    const contactHtml = [
        phoneHtml ? `<span class="contact-piece wk-editable${selectedPreviewClass(previewSelection, 'contact')}"${editableAttrs('contact')}${contactStyle}>${phoneHtml}</span>` : '',
        addressHtml ? `<span class="contact-piece wk-editable${selectedPreviewClass(previewSelection, 'address')}"${editableAttrs('address')}${addressStyle}>${addressHtml}</span>` : ''
    ].filter(Boolean).join('');
    const logoMarkup = !logoVisible
        ? ''
        : logoSrc
            ? `<img src="${escapePriceListHtml(logoSrc)}" class="brand-logo wk-editable${selectedPreviewClass(previewSelection, 'logo')}"${editableAttrs('logo')}${logoStyle} alt="logo" />`
            : `<div class="logo-placeholder wk-editable${selectedPreviewClass(previewSelection, 'logo')}"${editableAttrs('logo')}${logoStyle}>${safeLogoText}</div>`;
    return `<!DOCTYPE html>
<html lang="${isEnglish ? 'en' : 'fa'}" dir="${direction}">
<head>
  <meta charset="UTF-8" />
  <title>${safeTitle}</title>
  <style>
    @page { size: ${resolvedDesign.pageSize} ${resolvedDesign.orientation}; margin: ${resolvedDesign.marginMm}mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #111827;
      font-family: ${PRICE_LIST_FONT_STACKS[resolvedDesign.fontFamily]};
      font-size: ${resolvedDesign.fontSize}px;
      line-height: 1.55;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { direction: ${direction}; text-align: ${textAlign}; }
    .sheet {
      position: relative;
      z-index: 1;
      width: 100%;
      min-height: ${Math.max(20, page.height - (resolvedDesign.marginMm * 2))}mm;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 2px solid ${primaryColor};
      padding-bottom: 12px;
      margin-bottom: 12px;
    }
    .header-centered {
      flex-direction: column-reverse;
      align-items: center;
      text-align: center;
    }
    .header-stacked {
      flex-direction: column-reverse;
      align-items: stretch;
    }
    .header-centered .brand,
    .header-centered .doc-title {
      max-width: 100%;
      text-align: center;
      justify-content: center;
    }
    .header-stacked .doc-title {
      max-width: 100%;
      text-align: ${titleAlign};
    }
    .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .brand.logo-end { flex-direction: row-reverse; }
    .brand.logo-top { flex-direction: column; align-items: flex-start; }
    .header-centered .brand.logo-top { align-items: center; }
    .brand-logo {
      width: ${resolvedDesign.logoSize}px;
      height: ${resolvedDesign.logoSize}px;
      object-fit: contain;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 5px;
      background: ${resolvedDesign.logoBackgroundColor};
    }
    .logo-placeholder {
      display: inline-flex;
      width: ${resolvedDesign.logoSize}px;
      height: ${resolvedDesign.logoSize}px;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      background: ${primaryColor};
      color: #fff;
      font-size: 24px;
      font-weight: 900;
    }
    .store-name { margin: 0; font-size: 18px; font-weight: 900; color: ${accentColor}; }
    .contact {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 8px;
      margin-top: 4px;
      color: #475569;
      font-size: 10px;
      font-weight: 600;
    }
    .contact-piece { display: inline-block; }
    .doc-title { max-width: 42%; text-align: ${titleAlign}; }
    .doc-title h1 { margin: 0; color: ${primaryColor}; font-size: 24px; font-weight: 900; line-height: 1.1; }
    .doc-title p { margin: 6px 0 0; color: #475569; font-weight: 700; }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0 0 12px;
      color: #475569;
      font-weight: 700;
    }
    .meta span {
      border: 1px solid #e2e8f0;
      border-radius: 999px;
      padding: 4px 10px;
      background: #f8fafc;
    }
    .top-note {
      margin: 0 0 12px;
      border: 1px solid #dbeafe;
      border-inline-start: 4px solid ${primaryColor};
      border-radius: 10px;
      background: #eff6ff;
      padding: 8px 10px;
      color: #334155;
      font-weight: 700;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      page-break-inside: auto;
    }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    th {
      background: ${tableHeaderStyle.backgroundColor || primaryColor};
      color: ${tableHeaderStyle.color || '#ffffff'};
      padding: ${densityPadding.th};
      border: 1px solid ${tableHeaderStyle.backgroundColor || primaryColor};
      font-size: ${tableHeaderStyle.fontSize || 9.5}px;
      font-weight: 900;
      text-align: ${tableHeaderStyle.align || bodyTextAlign};
      vertical-align: top;
      ${tableHeaderStyle.offsetXmm || tableHeaderStyle.offsetYmm ? `position: relative; transform: translate(${tableHeaderStyle.offsetXmm}mm, ${tableHeaderStyle.offsetYmm}mm);` : ''}
    }
    td {
      padding: ${densityPadding.td};
      border: 1px solid ${borderColor};
      vertical-align: top;
      overflow-wrap: anywhere;
      color: ${tableCellStyle.color || '#1f2937'};
      ${tableCellStyle.backgroundColor ? `background: ${tableCellStyle.backgroundColor};` : ''}
      font-size: ${tableCellStyle.fontSize || resolvedDesign.fontSize}px;
      font-weight: 650;
      text-align: ${tableCellStyle.align || bodyTextAlign};
      ${tableCellStyle.offsetXmm || tableCellStyle.offsetYmm ? `position: relative; transform: translate(${tableCellStyle.offsetXmm}mm, ${tableCellStyle.offsetYmm}mm);` : ''}
    }
    ${resolvedDesign.zebraRows && !tableCellStyle.backgroundColor ? 'tbody tr:nth-child(even) td { background: #f8fafc; }' : ''}
    .index-cell {
      width: 28px;
      text-align: center;
      color: #64748b;
      font-weight: 900;
    }
    .muted { color: #94a3b8; font-weight: 600; }
    .empty-cell { text-align: center; padding: 24px; color: #64748b; }
    .footer {
      margin-top: 14px;
      border-top: 1px dashed #cbd5e1;
      padding-top: 10px;
      color: #475569;
      font-size: 10px;
      font-weight: 650;
    }
    .warekeep-watermark {
      position: fixed;
      z-index: 2;
      pointer-events: auto;
      color: ${accentColor};
      opacity: ${resolvedDesign.watermarkOpacity};
      font-size: 9px;
      font-weight: 900;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .wk-editable { cursor: pointer; }
    .wk-editable:hover {
      outline: 1px dashed ${primaryColor};
      outline-offset: -2px;
    }
    .wk-selected {
      outline: 2px solid ${primaryColor} !important;
      outline-offset: -2px;
      box-shadow: inset 0 0 0 999px rgba(37, 99, 235, 0.08);
    }
    .watermark-top-left { top: 6mm; left: 7mm; }
    .watermark-top-right { top: 6mm; right: 7mm; }
    .watermark-bottom-left { bottom: 6mm; left: 7mm; }
    .watermark-bottom-right { bottom: 6mm; right: 7mm; }
    .watermark-center {
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-24deg);
      font-size: 34px;
      letter-spacing: 0.22em;
    }
    @media print {
      .sheet { min-height: auto; }
      .warekeep-watermark { pointer-events: none; }
    }
  </style>
</head>
<body>
  ${resolvedDesign.showWatermark ? `<div class="warekeep-watermark ${watermarkClass} wk-editable${selectedPreviewClass(previewSelection, 'watermark')}"${editableAttrs('watermark')}${watermarkStyle}>${safeWatermarkText}</div>` : ''}
  <main class="sheet">
    <header class="header ${headerLayoutClass}">
      <div class="brand ${logoOrderClass}">
        ${logoMarkup}
        <div>
          ${showStoreName ? `<h2 class="store-name wk-editable${selectedPreviewClass(previewSelection, 'storeName')}"${editableAttrs('storeName')}${storeNameStyle}>${safeStoreName}</h2>` : ''}
          ${showContact
        ? `<div class="contact">${contactHtml}</div>`
        : ''}
        </div>
      </div>
      <div class="doc-title">
        <h1 class="wk-editable${selectedPreviewClass(previewSelection, 'title')}"${editableAttrs('title')}${titleStyle}>${safeTitle}</h1>
        <p class="wk-editable${selectedPreviewClass(previewSelection, 'subtitle')}"${editableAttrs('subtitle')}${subtitleStyle}>${safeSubtitle}</p>
      </div>
    </header>
    ${metaItems.length ? `<section class="meta wk-editable${selectedPreviewClass(previewSelection, 'meta')}" aria-label="price-list-meta"${editableAttrs('meta')}${metaStyle}>${metaItems.map((item) => `<span>${item}</span>`).join('')}</section>` : ''}
    ${safeTopNote ? `<section class="top-note wk-editable${selectedPreviewClass(previewSelection, 'topNote')}"${editableAttrs('topNote')}${topNoteStyle}>${safeTopNote}</section>` : ''}
    <table>
      <thead>
        <tr>
          <th class="index-cell">#</th>
          ${headerCells}
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
    </table>
    ${safeFooter ? `<footer class="footer wk-editable${selectedPreviewClass(previewSelection, 'footer')}"${editableAttrs('footer')}${footerStyle}>${safeFooter}</footer>` : ''}
  </main>
  <script>
  (() => {
    document.addEventListener('click', (event) => {
      const target = event.target && event.target.closest ? event.target.closest('[data-wk-edit-part]') : null;
      if (!target) return;
      event.preventDefault();
      window.parent && window.parent.postMessage({
        type: 'warekeep:price-list-select',
        part: target.getAttribute('data-wk-edit-part') || '',
        rowId: target.getAttribute('data-wk-edit-row-id') || '',
        field: target.getAttribute('data-wk-edit-field') || ''
      }, '*');
    });
  })();
  </script>
</body>
</html>`;
};
const escapeCsvCell = (value: unknown) => {
    const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
export const generatePriceListCSV = (options: PriceListGenerationOptions): string => {
    const isEnglish = (options.settings.language || 'dari') === 'english';
    const numberLocale = getNumeralLocale(options.design?.numeralStyle, isEnglish);
    const currency = options.settings.currencySettings?.baseCurrency || 'AFN';
    const fields = normalizePriceListFields(options.selectedFieldKeys, options.canViewPurchasePrice);
    const headers = [
        '#',
        ...fields.map((field) => getFieldLabel(field, isEnglish, options.headerOverrides))
    ];
    const rows = options.rows.map(resolveTotals).map((row, index) => {
        const rowOverrides = options.cellOverrides?.[row.medicine.id] || {};
        return [
            formatNumber(index + 1, numberLocale),
            ...fields.map((field) => getCellOverrideValue(rowOverrides[field], field, currency, numberLocale) ??
                getFieldValue(row, field, options.settings, options.canViewPurchasePrice, numberLocale))
        ];
    });
    return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n');
};
