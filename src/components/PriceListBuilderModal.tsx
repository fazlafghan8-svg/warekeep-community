import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings } from '@/types';
import { Modal } from './ui/Modal';
import { classNames } from '@/utils/classNames';
import { openPrintWindow } from '@/utils/printWindow';
import { ShellChevronIcon, ShellCloseIcon, ShellFocusIcon, ShellInventoryIcon, ShellReportsIcon, ShellSearchIcon, ShellSettingsIcon } from './ui/ShellIcons';
import { generatePriceListCSV, generatePriceListHTML, getDefaultPriceListFields, getPriceListBrandingSuggestions, normalizePriceListFields, PRICE_LIST_FIELD_DEFINITIONS, type PriceListCellOverrides, type PriceListDesignOptions, type PriceListEditablePart, type PriceListFieldGroup, type PriceListFieldKey, type PriceListHeaderOverrides, type PriceListTextAlign, type PriceListPreset, type PriceListRowInput } from '@/utils/priceListGenerator';
interface PriceListBuilderModalProps {
    isOpen: boolean;
    onClose: () => void;
    rows: PriceListRowInput[];
    settings: AppSettings;
    canViewPurchasePrice: boolean;
}
type StoredPreference = {
    preset?: PriceListPreset;
    fields?: PriceListFieldKey[];
    title?: string;
    subtitle?: string;
    footerNote?: string;
    showLogo?: boolean;
    showStoreName?: boolean;
    showContact?: boolean;
    onlyAvailable?: boolean;
    design?: PriceListDesignOptions;
    cellOverrides?: PriceListCellOverrides;
    headerOverrides?: PriceListHeaderOverrides;
};
const STORAGE_KEY = 'wk.price-list-builder.v1';
const FIELD_GROUPS: Array<{
    key: PriceListFieldGroup;
    label: {
        en: string;
        fa: string;
    };
}> = [
    { key: 'general', label: { en: 'General', fa: 'عمومی' } },
    { key: 'sales', label: { en: 'Sales Prices', fa: 'قیمت فروش' } },
    { key: 'inventory', label: { en: 'Inventory', fa: 'موجودی' } },
    { key: 'internal', label: { en: 'Internal', fa: 'داخلی' } }
];
const PAGE_DIMENSIONS_MM = {
    A4: { portrait: { width: 210, height: 297 }, landscape: { width: 297, height: 210 } },
    A5: { portrait: { width: 148, height: 210 }, landscape: { width: 210, height: 148 } }
} as const;
const resolveNumberLocale = (style: PriceListDesignOptions['numeralStyle'], isEnglish: boolean) => {
    if (style === 'english')
        return 'en-US';
    if (style === 'persian')
        return 'fa-AF';
    return isEnglish ? 'en-US' : 'fa-AF';
};
const createDefaultDesign = (settings: AppSettings, isEnglish: boolean): PriceListDesignOptions => ({
    numeralStyle: 'auto',
    pageSize: 'A4',
    orientation: 'portrait',
    marginMm: 12,
    primaryColor: settings.invoiceDesign?.primaryColor || '#2563eb',
    accentColor: '#0f172a',
    fontFamily: isEnglish ? 'system' : 'vazirmatn',
    fontSize: 11,
    tableDensity: 'comfortable',
    headerLayout: 'split',
    titleAlign: 'start',
    bodyTextAlign: 'start',
    borderStyle: 'grid',
    logoPosition: 'start',
    logoSize: 58,
    logoBackgroundColor: '#ffffff',
    zebraRows: true,
    showGeneratedAt: true,
    showItemCount: true,
    showCurrency: true,
    topNote: '',
    showWatermark: true,
    watermarkText: 'WareKeep',
    watermarkPosition: 'bottom-left',
    watermarkOpacity: 0.16
});
const DESIGN_PRESETS: Array<{
    key: string;
    label: {
        en: string;
        fa: string;
    };
    design: PriceListDesignOptions;
}> = [
    {
        key: 'classic',
        label: { en: 'Classic', fa: 'کلاسیک' },
        design: {
            pageSize: 'A4',
            orientation: 'portrait',
            marginMm: 12,
            tableDensity: 'comfortable',
            headerLayout: 'split',
            titleAlign: 'start',
            borderStyle: 'grid',
            zebraRows: true,
            showWatermark: true,
            watermarkPosition: 'bottom-left',
            watermarkOpacity: 0.16
        }
    },
    {
        key: 'compact',
        label: { en: 'Compact', fa: 'فشرده' },
        design: {
            pageSize: 'A4',
            orientation: 'portrait',
            marginMm: 8,
            fontSize: 10,
            tableDensity: 'compact',
            headerLayout: 'stacked',
            borderStyle: 'soft',
            zebraRows: true,
            watermarkPosition: 'bottom-right',
            watermarkOpacity: 0.12
        }
    },
    {
        key: 'catalog',
        label: { en: 'Catalog', fa: 'کتالوگ' },
        design: {
            pageSize: 'A4',
            orientation: 'landscape',
            marginMm: 10,
            fontSize: 11,
            tableDensity: 'spacious',
            headerLayout: 'centered',
            titleAlign: 'center',
            borderStyle: 'minimal',
            zebraRows: false,
            watermarkPosition: 'bottom-left',
            watermarkOpacity: 0.14
        }
    }
];
const EDITABLE_PARTS: Array<{
    key: PriceListEditablePart;
    label: {
        en: string;
        fa: string;
    };
}> = [
    { key: 'logo', label: { en: 'Logo', fa: 'لوگو' } },
    { key: 'title', label: { en: 'Title', fa: 'عنوان' } },
    { key: 'subtitle', label: { en: 'Subtitle', fa: 'زیرعنوان' } },
    { key: 'storeName', label: { en: 'Store Name', fa: 'نام دواخانه' } },
    { key: 'contact', label: { en: 'Contact', fa: 'تماس' } },
    { key: 'address', label: { en: 'Address', fa: 'آدرس' } },
    { key: 'meta', label: { en: 'Meta Chips', fa: 'معلومات بالا' } },
    { key: 'topNote', label: { en: 'Top Note', fa: 'یادداشت بالا' } },
    { key: 'tableHeader', label: { en: 'Table Header', fa: 'سرجدول' } },
    { key: 'tableBody', label: { en: 'Table Body', fa: 'بدنه جدول' } },
    { key: 'tableCell', label: { en: 'Selected Cell', fa: 'سلول انتخاب‌شده' } },
    { key: 'footer', label: { en: 'Footer', fa: 'پاورقی' } },
    { key: 'watermark', label: { en: 'Watermark', fa: 'واترمارک' } }
];
const EDITABLE_TEXT_PARTS = new Set<PriceListEditablePart>([
    'logo',
    'title',
    'subtitle',
    'storeName',
    'contact',
    'address',
    'topNote',
    'tableHeader',
    'footer',
    'watermark',
    'tableCell'
]);
const PRICE_FIELDS: PriceListFieldKey[] = ['retailPrice', 'wholesalePrice', 'bulkPrice'];
const ROW_EDIT_FIELDS: PriceListFieldKey[] = [
    'name',
    'genericName',
    'manufacturer',
    'retailPrice',
    'wholesalePrice',
    'bulkPrice',
    'description'
];
type EditableTarget = {
    part: PriceListEditablePart;
    rowId?: string;
    field?: PriceListFieldKey;
};
type PriceListWorkflowStep = 'content' | 'design' | 'edit';
type PriceListMobileView = 'settings' | 'preview';
const SETTINGS_SECTION_CLASS = 'group rounded-2xl border border-slate-200/80 bg-white shadow-sm transition focus-within:border-brand-200 focus-within:ring-2 focus-within:ring-brand-100';
const SETTINGS_SUMMARY_CLASS = 'flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-black text-slate-900 transition hover:bg-slate-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300 [&::-webkit-details-marker]:hidden';
const SETTINGS_BODY_CLASS = 'border-t border-slate-100 px-4 py-3';
const PriceListStrokeIcon: React.FC<{
    children: React.ReactNode;
    className?: string;
}> = ({ children, className }) => (<svg className={classNames('h-4 w-4', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>);
const PrintIcon = () => (<PriceListStrokeIcon>
    <path d="M7 8V4.75h10V8"/>
    <path d="M7 17H5.8A2.8 2.8 0 0 1 3 14.2v-3.4A2.8 2.8 0 0 1 5.8 8h12.4a2.8 2.8 0 0 1 2.8 2.8v3.4a2.8 2.8 0 0 1-2.8 2.8H17"/>
    <path d="M7 14h10v5.25H7z"/>
    <path d="M17.5 11.5h.01"/>
  </PriceListStrokeIcon>);
const PdfIcon = () => (<PriceListStrokeIcon>
    <path d="M7 4.5h6.5L18 9v10.5H7z"/>
    <path d="M13.5 4.75v4.5H18"/>
    <path d="M8.75 14.75h6.5M8.75 17.25h4.5"/>
  </PriceListStrokeIcon>);
const HtmlIcon = () => (<PriceListStrokeIcon>
    <path d="m8.5 8.25-4 3.75 4 3.75"/>
    <path d="m15.5 8.25 4 3.75-4 3.75"/>
    <path d="m13.5 6.5-3 11"/>
  </PriceListStrokeIcon>);
const CsvIcon = () => (<PriceListStrokeIcon>
    <path d="M5.75 4.75h12.5v14.5H5.75z"/>
    <path d="M5.75 9.5h12.5M5.75 14.25h12.5M10 4.75v14.5M14.25 4.75v14.5"/>
  </PriceListStrokeIcon>);
const ResetIcon = () => (<PriceListStrokeIcon>
    <path d="M7.25 7.5A6.7 6.7 0 1 1 6 12"/>
    <path d="M7.25 4.75V7.5H4.5"/>
  </PriceListStrokeIcon>);
const PaletteIcon = () => (<PriceListStrokeIcon>
    <path d="M12 4.25a7.75 7.75 0 0 0 0 15.5h1.15a1.65 1.65 0 0 0 1.25-2.72 1.65 1.65 0 0 1 1.25-2.73h1.1A3.1 3.1 0 0 0 19.85 11 7.7 7.7 0 0 0 12 4.25Z"/>
    <circle cx="8.4" cy="11.2" r=".75" fill="currentColor" stroke="none"/>
    <circle cx="10.7" cy="8.4" r=".75" fill="currentColor" stroke="none"/>
    <circle cx="14" cy="8.6" r=".75" fill="currentColor" stroke="none"/>
  </PriceListStrokeIcon>);
const LogoIcon = () => (<PriceListStrokeIcon>
    <rect x="5" y="5" width="14" height="14" rx="3"/>
    <path d="m8.25 15.25 2.5-2.5 2 2 2.75-3 2.25 3.5"/>
    <circle cx="9.75" cy="9.5" r="1"/>
  </PriceListStrokeIcon>);
const StoreIcon = () => (<PriceListStrokeIcon>
    <path d="M5 10.25 6.35 5h11.3L19 10.25"/>
    <path d="M6.25 10.25v8.5h11.5v-8.5"/>
    <path d="M9 18.75v-5h6v5"/>
    <path d="M5 10.25h14"/>
  </PriceListStrokeIcon>);
const PhoneIcon = () => (<PriceListStrokeIcon>
    <path d="M8.2 5.25 10 8.9l-1.45 1.45a10.8 10.8 0 0 0 5.1 5.1L15.1 14l3.65 1.8c.25.12.38.4.31.67-.36 1.45-1.5 2.28-2.98 2.28C10.1 18.75 5.25 13.9 5.25 7.92c0-1.48.83-2.62 2.28-2.98.27-.07.55.06.67.31Z"/>
  </PriceListStrokeIcon>);
const TextIcon = () => (<PriceListStrokeIcon>
    <path d="M5.5 6.75h13M8 6.75v10.5M16 6.75v10.5M9.75 17.25h4.5"/>
  </PriceListStrokeIcon>);
const TextSizeIcon = () => (<PriceListStrokeIcon>
    <path d="M4.75 7h8.5"/>
    <path d="M7 7v10.25"/>
    <path d="M11 17.25H5"/>
    <path d="M14 10h5.25"/>
    <path d="M15.4 10v7.25"/>
    <path d="M18.2 17.25h-5.6"/>
  </PriceListStrokeIcon>);
const CheckIcon = () => (<PriceListStrokeIcon>
    <path d="m5.75 12.5 3.8 3.75 8.7-8.5"/>
  </PriceListStrokeIcon>);
const TrashIcon = () => (<PriceListStrokeIcon>
    <path d="M5.5 7h13"/>
    <path d="M9.5 7V5.25h5V7"/>
    <path d="M7.5 7.25 8.2 19h7.6l.7-11.75"/>
    <path d="M10.5 10.5v5.25M13.5 10.5v5.25"/>
  </PriceListStrokeIcon>);
const SparkleIcon = () => (<PriceListStrokeIcon>
    <path d="M12 4.75 13.15 9 17.25 10.25 13.15 11.5 12 15.75 10.85 11.5 6.75 10.25 10.85 9 12 4.75Z"/>
    <path d="M18.5 14.5 19.1 16.3 20.9 16.9 19.1 17.5 18.5 19.25 17.9 17.5 16.1 16.9 17.9 16.3 18.5 14.5Z"/>
  </PriceListStrokeIcon>);
const ArrowIcon: React.FC<{
    direction: 'up' | 'down' | 'left' | 'right';
}> = ({ direction }) => {
    const path = direction === 'up'
        ? 'M12 19V5M7.25 9.75 12 5l4.75 4.75'
        : direction === 'down'
            ? 'M12 5v14M7.25 14.25 12 19l4.75-4.75'
            : direction === 'left'
                ? 'M19 12H5M9.75 7.25 5 12l4.75 4.75'
                : 'M5 12h14M14.25 7.25 19 12l-4.75 4.75';
    return (<PriceListStrokeIcon>
      <path d={path}/>
    </PriceListStrokeIcon>);
};
const AlignIcon: React.FC<{
    align: PriceListTextAlign;
}> = ({ align }) => (<PriceListStrokeIcon>
    {align === 'center' ? (<>
        <path d="M7 7h10M5.5 12h13M7 17h10"/>
      </>) : align === 'end' || align === 'right' ? (<>
        <path d="M8 7h10M5.5 12H18M10 17h8"/>
        <path d="M19.5 5.75v12.5"/>
      </>) : (<>
        <path d="M6 7h10M6 12h12.5M6 17h8"/>
        <path d="M4.5 5.75v12.5"/>
      </>)}
  </PriceListStrokeIcon>);
type PriceListIconButtonTone = 'neutral' | 'primary' | 'ghost' | 'danger' | 'success';
type PriceListIconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    icon: React.ReactNode;
    tooltip?: string;
    tooltipKey?: string;
    activeTooltipKey?: string | null;
    onTooltipOpen?: (key: string) => void;
    onTooltipClose?: (key?: string) => void;
    tone?: PriceListIconButtonTone;
    active?: boolean;
    iconOnly?: boolean;
    mobileLabel?: string;
    loading?: boolean;
};
const PriceListIconButton = React.forwardRef<HTMLButtonElement, PriceListIconButtonProps>(({ label, icon, tooltip, tooltipKey, activeTooltipKey, onTooltipOpen, onTooltipClose, tone = 'neutral', active = false, iconOnly = false, mobileLabel, loading = false, className, children, disabled, ...props }, ref) => {
    const tooltipText = tooltip || label;
    const tooltipId = tooltipKey || tooltipText;
    const isTooltipControlled = activeTooltipKey !== undefined;
    const isTooltipActive = isTooltipControlled ? activeTooltipKey === tooltipId : false;
    const { 'aria-busy': ariaBusyProp, onBlur, onClick, onFocus, onMouseEnter, onMouseLeave, onPointerDown, ...buttonProps } = props;
    const openTooltip = () => onTooltipOpen?.(tooltipId);
    const closeTooltip = () => onTooltipClose?.(tooltipId);
    return (<button ref={ref} type="button" aria-label={label} title={tooltipText} disabled={disabled} aria-busy={loading || ariaBusyProp ? true : undefined} onMouseEnter={(event) => {
            onMouseEnter?.(event);
            openTooltip();
        }} onMouseLeave={(event) => {
            onMouseLeave?.(event);
            closeTooltip();
        }} onFocus={(event) => {
            onFocus?.(event);
            openTooltip();
        }} onBlur={(event) => {
            onBlur?.(event);
            closeTooltip();
        }} onPointerDown={(event) => {
            onPointerDown?.(event);
            openTooltip();
        }} onClick={(event) => {
            onClick?.(event);
            openTooltip();
        }} className={classNames('group/price-tip relative inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-50', iconOnly && 'min-w-10 px-2', iconOnly && mobileLabel && 'max-sm:min-w-[72px] max-sm:px-3', !active && tone === 'neutral' && 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:bg-brand-50/70 hover:text-brand-700', tone === 'ghost' && !active && 'border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900', tone === 'primary' && 'border-brand-500 bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:border-brand-600 hover:bg-brand-700 hover:text-white', tone === 'success' && !active && 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100', tone === 'danger' && !active && 'border-rose-100 bg-rose-50 text-rose-600 hover:border-rose-200 hover:bg-rose-100', active && 'border-brand-300 bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-100', className)} {...buttonProps}>
      <span className={classNames('inline-flex h-4 w-4 shrink-0 items-center justify-center', loading && 'text-current/65')}>
        {loading ? (<span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" aria-hidden="true"/>) : icon}
      </span>
      {iconOnly ? (<>
          <span className="sr-only">{label}</span>
          {mobileLabel ? <span className="hidden whitespace-nowrap text-[11px] max-sm:inline-flex">{mobileLabel}</span> : null}
        </>) : (<span className="truncate">{children ?? label}</span>)}
      <span role="tooltip" className={classNames('pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 max-w-[190px] -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-950 px-2.5 py-1 text-[11px] font-black text-white shadow-lg transition', isTooltipControlled
            ? isTooltipActive ? 'opacity-100' : 'opacity-0'
            : 'opacity-0 group-hover/price-tip:opacity-100 group-focus-within/price-tip:opacity-100 group-focus-visible/price-tip:opacity-100')}>
        {tooltipText}
      </span>
    </button>);
});
PriceListIconButton.displayName = 'PriceListIconButton';
const PriceListToggleCard: React.FC<{
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    icon: React.ReactNode;
    tooltip?: string;
    tooltipKey?: string;
    activeTooltipKey?: string | null;
    onTooltipOpen?: (key: string) => void;
    onTooltipClose?: (key?: string) => void;
}> = ({ label, checked, onChange, icon, tooltip, tooltipKey, activeTooltipKey, onTooltipOpen, onTooltipClose }) => {
    const tooltipText = tooltip || label;
    const tooltipId = tooltipKey || tooltipText;
    const isTooltipControlled = activeTooltipKey !== undefined;
    const isTooltipActive = isTooltipControlled ? activeTooltipKey === tooltipId : false;
    const openTooltip = () => onTooltipOpen?.(tooltipId);
    const closeTooltip = () => onTooltipClose?.(tooltipId);
    return (<label title={tooltipText} onMouseEnter={openTooltip} onMouseLeave={closeTooltip} onFocus={openTooltip} onBlur={closeTooltip} onPointerDown={openTooltip} className={classNames('group/price-tip relative flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition focus-within:ring-2 focus-within:ring-brand-300 sm:min-h-[58px]', checked
            ? 'border-brand-300 bg-brand-50 text-brand-800 shadow-sm ring-1 ring-brand-100'
            : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:bg-brand-50/60 hover:text-brand-700')}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={label} className="sr-only"/>
      <span className={classNames('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition', checked ? 'border-brand-200 bg-white text-brand-700' : 'border-slate-200 bg-slate-50 text-slate-500')}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 whitespace-normal break-words leading-4">{label}</span>
      <span className={classNames('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition', checked ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-slate-50 text-transparent')}>
        <CheckIcon />
      </span>
      <span role="tooltip" className={classNames('pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 max-w-[190px] -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-950 px-2.5 py-1 text-[11px] font-black text-white shadow-lg transition', isTooltipControlled
            ? isTooltipActive ? 'opacity-100' : 'opacity-0'
            : 'opacity-0 group-hover/price-tip:opacity-100 group-focus-within/price-tip:opacity-100')}>
        {tooltipText}
      </span>
    </label>);
};
const SettingsSection: React.FC<{
    title: string;
    eyebrow?: string;
    icon?: React.ReactNode;
    className?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}> = ({ title, eyebrow, icon, className, defaultOpen = false, children }) => (<details className={classNames(SETTINGS_SECTION_CLASS, className)} open={defaultOpen}>
    <summary className={SETTINGS_SUMMARY_CLASS}>
      <span className="flex min-w-0 items-center gap-3">
        {icon ? (<span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-100 bg-brand-50 text-brand-700">
            {icon}
          </span>) : null}
        <span className="min-w-0">
          {eyebrow ? (<span className="mb-0.5 block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              {eyebrow}
            </span>) : null}
          <span className="block truncate">{title}</span>
        </span>
      </span>
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition group-open:rotate-180">
        <ShellChevronIcon className="h-4 w-4"/>
      </span>
    </summary>
    <div className={SETTINGS_BODY_CLASS}>{children}</div>
  </details>);
const sanitizeFilename = (value: string) => value
    .replace(/[\/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
const readPreference = (): StoredPreference | null => {
    if (typeof window === 'undefined')
        return null;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) as StoredPreference : null;
    }
    catch {
        return null;
    }
};
const writePreference = (value: StoredPreference) => {
    if (typeof window === 'undefined')
        return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    }
    catch { }
};
const getRowQuantity = (row: PriceListRowInput) => {
    if (typeof row.totalQuantity === 'number' && Number.isFinite(row.totalQuantity))
        return row.totalQuantity;
    return (row.medicine.batches || []).reduce((sum, batch) => sum + (Number(batch.quantity) || 0), 0);
};
const downloadBlob = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};
export const PriceListBuilderModal: React.FC<PriceListBuilderModalProps> = ({ isOpen, onClose, rows, settings, canViewPurchasePrice }) => {
    const isEnglish = (settings.language || 'dari') === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const preference = useMemo(() => readPreference(), []);
    const [preset, setPreset] = useState<PriceListPreset>(preference?.preset === 'internal' && canViewPurchasePrice ? 'internal' : 'customer');
    const [fieldKeys, setFieldKeys] = useState<PriceListFieldKey[]>(() => normalizePriceListFields(preference?.fields || getDefaultPriceListFields('customer', canViewPurchasePrice), canViewPurchasePrice));
    const [selectedIds, setSelectedIds] = useState<string[]>(() => rows.map((row) => row.medicine.id));
    const [searchTerm, setSearchTerm] = useState('');
    const [onlyAvailable, setOnlyAvailable] = useState(preference?.onlyAvailable ?? false);
    const [title, setTitle] = useState(preference?.title || tr('Medicine Price List', 'پرایس‌لیست دواها'));
    const [subtitle, setSubtitle] = useState(preference?.subtitle || tr('Prepared for customers', 'برای معلومات مشتریان'));
    const [footerNote, setFooterNote] = useState(preference?.footerNote || settings.invoiceDesign?.footerText || '');
    const [showLogo, setShowLogo] = useState(preference?.showLogo ?? true);
    const [showStoreName, setShowStoreName] = useState(preference?.showStoreName ?? true);
    const [showContact, setShowContact] = useState(preference?.showContact ?? true);
    const [designOptions, setDesignOptions] = useState<PriceListDesignOptions>(() => ({
        ...createDefaultDesign(settings, isEnglish),
        ...(preference?.design || {})
    }));
    const [cellOverrides, setCellOverrides] = useState<PriceListCellOverrides>(() => preference?.cellOverrides || {});
    const [headerOverrides, setHeaderOverrides] = useState<PriceListHeaderOverrides>(() => preference?.headerOverrides || {});
    const [editableTarget, setEditableTargetState] = useState<EditableTarget>({ part: 'title' });
    const editableTargetRef = useRef<EditableTarget>({ part: 'title' });
    const setEditableTarget = (target: EditableTarget) => {
        editableTargetRef.current = target;
        setEditableTargetState(target);
    };
    const [selectedEditRowId, setSelectedEditRowId] = useState(() => rows[0]?.medicine.id || '');
    const [exportStatus, setExportStatus] = useState<string | null>(null);
    const [exportAction, setExportAction] = useState<'print' | 'pdf' | 'html' | 'csv' | null>(null);
    const [activeWorkflowStep, setActiveWorkflowStep] = useState<PriceListWorkflowStep>('content');
    const [mobileView, setMobileView] = useState<PriceListMobileView>('settings');
    const [activeTooltipKey, setActiveTooltipKey] = useState<string | null>(null);
    const previewFrameRef = useRef<HTMLIFrameElement>(null);
    const lastTooltipOpenedAtRef = useRef(0);
    const numberLocale = useMemo(() => resolveNumberLocale(designOptions.numeralStyle, isEnglish), [designOptions.numeralStyle, isEnglish]);
    const formatUiNumber = (value: number) => value.toLocaleString(numberLocale);
    const updateDesignOption = <K extends keyof PriceListDesignOptions>(key: K, value: PriceListDesignOptions[K]) => {
        setDesignOptions((current) => ({ ...current, [key]: value }));
    };
    const updateTextOverride = (key: keyof NonNullable<PriceListDesignOptions['textOverrides']>, value: string) => {
        setDesignOptions((current) => ({
            ...current,
            textOverrides: {
                ...(current.textOverrides || {}),
                [key]: value
            }
        }));
    };
    const updateSectionStyle = (part: PriceListEditablePart, key: 'color' | 'backgroundColor' | 'align' | 'fontSize' | 'offsetXmm' | 'offsetYmm', value: string | number) => {
        setDesignOptions((current) => ({
            ...current,
            sectionStyles: {
                ...(current.sectionStyles || {}),
                [part]: {
                    ...(current.sectionStyles?.[part] || {}),
                    [key]: value
                }
            }
        }));
    };
    const clearSectionStyle = (part: PriceListEditablePart) => {
        setDesignOptions((current) => {
            const nextStyles = { ...(current.sectionStyles || {}) };
            delete nextStyles[part];
            return { ...current, sectionStyles: nextStyles };
        });
    };
    const clearSectionStyleKeys = (part: PriceListEditablePart, keys: Array<'color' | 'backgroundColor' | 'align' | 'fontSize' | 'offsetXmm' | 'offsetYmm'>) => {
        setDesignOptions((current) => {
            const nextStyles = { ...(current.sectionStyles || {}) };
            const nextPartStyle = { ...(nextStyles[part] || {}) };
            keys.forEach((key) => {
                delete nextPartStyle[key];
            });
            if (Object.keys(nextPartStyle).length === 0) {
                delete nextStyles[part];
            }
            else {
                nextStyles[part] = nextPartStyle;
            }
            return { ...current, sectionStyles: nextStyles };
        });
    };
    const clearTextOverride = (key: keyof NonNullable<PriceListDesignOptions['textOverrides']>) => {
        setDesignOptions((current) => {
            const nextOverrides = { ...(current.textOverrides || {}) };
            delete nextOverrides[key];
            return { ...current, textOverrides: nextOverrides };
        });
    };
    const updateCellOverride = (rowId: string, field: PriceListFieldKey, value: string) => {
        setCellOverrides((current) => ({
            ...current,
            [rowId]: {
                ...(current[rowId] || {}),
                [field]: value
            }
        }));
    };
    const clearRowOverrides = (rowId: string) => {
        setCellOverrides((current) => {
            const next = { ...current };
            delete next[rowId];
            return next;
        });
    };
    const updateHeaderOverride = (field: PriceListFieldKey, value: string) => {
        setHeaderOverrides((current) => ({
            ...current,
            [field]: value
        }));
    };
    const clearHeaderOverride = (field: PriceListFieldKey) => {
        setHeaderOverrides((current) => {
            const next = { ...current };
            delete next[field];
            return next;
        });
    };
    const applyDesignPreset = (presetKey: string) => {
        const nextPreset = DESIGN_PRESETS.find((item) => item.key === presetKey);
        if (!nextPreset)
            return;
        setDesignOptions((current) => ({
            ...current,
            ...nextPreset.design,
            primaryColor: current.primaryColor,
            accentColor: current.accentColor,
            numeralStyle: current.numeralStyle,
            fontFamily: current.fontFamily,
            watermarkText: current.watermarkText || 'WareKeep'
        }));
    };
    useEffect(() => {
        if (!isOpen)
            return;
        setSelectedIds(rows.map((row) => row.medicine.id));
        setSelectedEditRowId(rows[0]?.medicine.id || '');
        setSearchTerm('');
        setExportStatus(null);
        setActiveWorkflowStep('content');
        setMobileView('settings');
        setActiveTooltipKey(null);
    }, [isOpen, rows]);
    useEffect(() => {
        if (!isOpen)
            return;
        const clearTooltip = () => {
            if (Date.now() - lastTooltipOpenedAtRef.current < 250)
                return;
            setActiveTooltipKey(null);
        };
        window.addEventListener('scroll', clearTooltip, true);
        window.addEventListener('resize', clearTooltip);
        return () => {
            window.removeEventListener('scroll', clearTooltip, true);
            window.removeEventListener('resize', clearTooltip);
        };
    }, [isOpen]);
    useEffect(() => {
        const handlePreviewSelection = (event: MessageEvent) => {
            const data = event.data;
            if (!data || data.type !== 'warekeep:price-list-select')
                return;
            const part = EDITABLE_PARTS.some((item) => item.key === data.part) ? data.part as PriceListEditablePart : 'title';
            const field = PRICE_LIST_FIELD_DEFINITIONS.some((item) => item.key === data.field)
                ? data.field as PriceListFieldKey
                : undefined;
            const rowId = typeof data.rowId === 'string' && data.rowId ? data.rowId : undefined;
            setEditableTarget({ part, rowId, field });
            if (rowId)
                setSelectedEditRowId(rowId);
            setActiveWorkflowStep('edit');
            setMobileView('settings');
        };
        window.addEventListener('message', handlePreviewSelection);
        return () => window.removeEventListener('message', handlePreviewSelection);
    }, []);
    useEffect(() => {
        if (!canViewPurchasePrice && preset === 'internal') {
            setPreset('customer');
            setFieldKeys(getDefaultPriceListFields('customer', false));
        }
    }, [canViewPurchasePrice, preset]);
    useEffect(() => {
        writePreference({
            preset,
            fields: fieldKeys,
            title,
            subtitle,
            footerNote,
            showLogo,
            showStoreName,
            showContact,
            onlyAvailable,
            design: designOptions,
            cellOverrides,
            headerOverrides
        });
    }, [cellOverrides, designOptions, fieldKeys, footerNote, headerOverrides, onlyAvailable, preset, showContact, showLogo, showStoreName, subtitle, title]);
    const availableRows = useMemo(() => (onlyAvailable ? rows.filter((row) => getRowQuantity(row) > 0) : rows), [onlyAvailable, rows]);
    const checklistRows = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term)
            return availableRows;
        return availableRows.filter((row) => {
            const medicine = row.medicine;
            return [
                medicine.name,
                medicine.genericName,
                medicine.manufacturer,
                row.canonicalManufacturer,
                medicine.barcode
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(term);
        });
    }, [availableRows, searchTerm]);
    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const selectedRows = useMemo(() => availableRows.filter((row) => selectedIdSet.has(row.medicine.id)), [availableRows, selectedIdSet]);
    const resolvedFieldKeys = useMemo(() => normalizePriceListFields(fieldKeys, canViewPurchasePrice), [canViewPurchasePrice, fieldKeys]);
    const exportHtml = useMemo(() => generatePriceListHTML({
        rows: selectedRows,
        selectedFieldKeys: resolvedFieldKeys,
        settings,
        canViewPurchasePrice,
        title,
        subtitle,
        footerNote,
        showLogo,
        showStoreName,
        showContact,
        design: designOptions,
        cellOverrides,
        headerOverrides
    }), [
        canViewPurchasePrice,
        cellOverrides,
        designOptions,
        footerNote,
        headerOverrides,
        resolvedFieldKeys,
        selectedRows,
        settings,
        showContact,
        showLogo,
        showStoreName,
        subtitle,
        title
    ]);
    const previewHtml = useMemo(() => generatePriceListHTML({
        rows: selectedRows,
        selectedFieldKeys: resolvedFieldKeys,
        settings,
        canViewPurchasePrice,
        title,
        subtitle,
        footerNote,
        showLogo,
        showStoreName,
        showContact,
        design: designOptions,
        cellOverrides,
        headerOverrides,
        previewSelection: editableTarget
    }), [
        canViewPurchasePrice,
        cellOverrides,
        designOptions,
        editableTarget,
        footerNote,
        headerOverrides,
        resolvedFieldKeys,
        selectedRows,
        settings,
        showContact,
        showLogo,
        showStoreName,
        subtitle,
        title
    ]);
    const selectedCountLabel = tr(`${formatUiNumber(selectedRows.length)} of ${formatUiNumber(availableRows.length)} medicines selected`, `${formatUiNumber(selectedRows.length)} از ${formatUiNumber(availableRows.length)} دوا انتخاب شده`);
    const isExporting = exportAction !== null;
    const defaultFileBase = sanitizeFilename(`${title || 'Price List'}-${new Date().toISOString().slice(0, 10)}`) || 'price-list';
    const suggestions = getPriceListBrandingSuggestions(settings, footerNote);
    const pageSize = designOptions.pageSize === 'A5' ? 'A5' : 'A4';
    const orientation = designOptions.orientation === 'landscape' ? 'landscape' : 'portrait';
    const previewPage = PAGE_DIMENSIONS_MM[pageSize][orientation];
    const previewScale = pageSize === 'A4' && orientation === 'landscape' ? 0.82 : 1;
    const previewFrame = {
        width: previewPage.width * previewScale,
        height: previewPage.height * previewScale
    };
    const selectedEditRow = selectedRows.find((row) => row.medicine.id === selectedEditRowId) || selectedRows[0] || null;
    const selectedPartLabel = EDITABLE_PARTS.find((part) => part.key === editableTarget.part);
    const selectedPartStyle = designOptions.sectionStyles?.[editableTarget.part] || {};
    const selectedPartSupportsFontSize = editableTarget.part !== 'logo';
    const selectedCellRow = editableTarget.rowId
        ? selectedRows.find((row) => row.medicine.id === editableTarget.rowId) || null
        : null;
    const selectedCellField = editableTarget.field;
    const getFieldLabel = (field: PriceListFieldKey) => {
        const definition = PRICE_LIST_FIELD_DEFINITIONS.find((item) => item.key === field);
        return definition ? (isEnglish ? definition.label.en : definition.label.fa) : field;
    };
    const getHeaderFieldValue = (field: PriceListFieldKey) => headerOverrides[field] ?? getFieldLabel(field);
    const selectedTargetDetail = (() => {
        if (editableTarget.part === 'tableHeader' && editableTarget.field) {
            return `${tr('Header', 'سرجدول')} / ${getFieldLabel(editableTarget.field)}`;
        }
        if ((editableTarget.part === 'tableCell' || editableTarget.part === 'tableBody') && selectedCellRow) {
            return selectedCellField
                ? `${selectedCellRow.medicine.name} / ${getFieldLabel(selectedCellField)}`
                : selectedCellRow.medicine.name;
        }
        return '';
    })();
    const getEditableFieldDefaultValue = (row: PriceListRowInput, field: PriceListFieldKey) => {
        const medicine = row.medicine;
        if (field === 'name')
            return medicine.name || '';
        if (field === 'genericName')
            return medicine.genericName || medicine.clinicalSummary?.composition || '';
        if (field === 'manufacturer')
            return row.canonicalManufacturer || medicine.manufacturer || '';
        if (field === 'description')
            return medicine.description || '';
        if (field === 'retailPrice')
            return String(medicine.salePrices?.retail ?? '');
        if (field === 'wholesalePrice')
            return String(medicine.salePrices?.wholesale ?? '');
        if (field === 'bulkPrice')
            return String(medicine.salePrices?.bulk ?? '');
        return '';
    };
    const getEditableFieldValue = (row: PriceListRowInput, field: PriceListFieldKey) => cellOverrides[row.medicine.id]?.[field] ?? getEditableFieldDefaultValue(row, field);
    const clearCellOverride = (rowId: string, field: PriceListFieldKey) => {
        setCellOverrides((current) => {
            const rowOverrides = { ...(current[rowId] || {}) };
            delete rowOverrides[field];
            const next = { ...current };
            if (Object.keys(rowOverrides).length === 0) {
                delete next[rowId];
            }
            else {
                next[rowId] = rowOverrides;
            }
            return next;
        });
    };
    const getSelectedPartText = () => {
        if (editableTarget.part === 'title')
            return title;
        if (editableTarget.part === 'subtitle')
            return subtitle;
        if (editableTarget.part === 'storeName')
            return designOptions.textOverrides?.storeName ?? settings.storeName ?? '';
        if (editableTarget.part === 'contact') {
            return designOptions.textOverrides?.contact ?? [settings.storePhone, settings.storeAddress].filter(Boolean).join(' | ');
        }
        if (editableTarget.part === 'address')
            return designOptions.textOverrides?.address ?? settings.storeAddress ?? '';
        if (editableTarget.part === 'topNote')
            return designOptions.topNote || '';
        if (editableTarget.part === 'footer')
            return footerNote;
        if (editableTarget.part === 'watermark')
            return designOptions.watermarkText || 'WareKeep';
        if (editableTarget.part === 'logo')
            return designOptions.textOverrides?.logoText || (settings.storeName || 'W').trim().charAt(0) || 'W';
        if (editableTarget.part === 'tableHeader' && editableTarget.field) {
            return getHeaderFieldValue(editableTarget.field);
        }
        if (editableTarget.part === 'tableCell' && editableTarget.rowId && editableTarget.field) {
            const row = selectedRows.find((item) => item.medicine.id === editableTarget.rowId);
            return row ? getEditableFieldValue(row, editableTarget.field) : cellOverrides[editableTarget.rowId]?.[editableTarget.field] || '';
        }
        return '';
    };
    const selectedPartName = selectedPartLabel ? (isEnglish ? selectedPartLabel.label.en : selectedPartLabel.label.fa) : '';
    const selectedPartValue = getSelectedPartText();
    const selectedPartSummary = selectedTargetDetail
        ? selectedTargetDetail
        : selectedPartValue
            ? `${selectedPartValue} / ${selectedPartName}`
            : selectedPartName;
    const offsetX = Number(selectedPartStyle.offsetXmm) || 0;
    const offsetY = Number(selectedPartStyle.offsetYmm) || 0;
    const offsetDescription = tr(`Move: ${offsetX}mm horizontal, ${offsetY}mm vertical`, `جابه‌جایی: ${formatUiNumber(offsetX)}mm افقی، ${formatUiNumber(offsetY)}mm عمودی`);
    const getDefaultPartFontSize = (part: PriceListEditablePart) => {
        if (part === 'title')
            return 24;
        if (part === 'subtitle')
            return (designOptions.fontSize || 11) + 1;
        if (part === 'storeName')
            return 18;
        if (part === 'contact' || part === 'address' || part === 'footer')
            return 10;
        if (part === 'watermark')
            return 9;
        if (part === 'tableHeader')
            return 9.5;
        if (part === 'logo')
            return 24;
        return designOptions.fontSize || 11;
    };
    const selectedPartFontSize = Number(selectedPartStyle.fontSize) || getDefaultPartFontSize(editableTarget.part);
    const clampSelectedPartFontSize = (value: number) => Math.min(72, Math.max(6, value));
    const setSelectedPartText = (value: string) => {
        const target = editableTargetRef.current;
        if (target.part === 'title') {
            setTitle(value);
        }
        else if (target.part === 'subtitle') {
            setSubtitle(value);
        }
        else if (target.part === 'storeName') {
            updateTextOverride('storeName', value);
        }
        else if (target.part === 'contact') {
            updateTextOverride('contact', value);
        }
        else if (target.part === 'address') {
            updateTextOverride('address', value);
        }
        else if (target.part === 'topNote') {
            updateDesignOption('topNote', value);
        }
        else if (target.part === 'footer') {
            setFooterNote(value);
        }
        else if (target.part === 'watermark') {
            updateDesignOption('watermarkText', value);
        }
        else if (target.part === 'logo') {
            updateTextOverride('logoText', value);
        }
        else if (target.part === 'tableHeader' && target.field) {
            updateHeaderOverride(target.field, value);
        }
        else if (target.part === 'tableCell' && target.rowId && target.field) {
            updateCellOverride(target.rowId, target.field, value);
        }
    };
    const setSelectedPartAlign = (align: PriceListTextAlign) => {
        if (editableTarget.part === 'tableBody') {
            updateDesignOption('bodyTextAlign', align);
        }
        updateSectionStyle(editableTarget.part, 'align', align);
    };
    const setSelectedPartFontSize = (value: number) => {
        updateSectionStyle(editableTarget.part, 'fontSize', clampSelectedPartFontSize(value));
    };
    const clampOffset = (value: number) => Math.min(80, Math.max(-80, value));
    const moveStepMm = 4;
    const moveSelectedPart = (deltaX: number, deltaY: number) => {
        const currentX = Number(selectedPartStyle.offsetXmm) || 0;
        const currentY = Number(selectedPartStyle.offsetYmm) || 0;
        updateSectionStyle(editableTarget.part, 'offsetXmm', clampOffset(currentX + deltaX));
        updateSectionStyle(editableTarget.part, 'offsetYmm', clampOffset(currentY + deltaY));
    };
    const resetSelectedPartText = () => {
        if (editableTarget.part === 'title') {
            setTitle(tr('Medicine Price List', 'پرایس‌لیست دواها'));
        }
        else if (editableTarget.part === 'subtitle') {
            setSubtitle(tr('Prepared for customers', 'برای معلومات مشتریان'));
        }
        else if (editableTarget.part === 'storeName') {
            clearTextOverride('storeName');
        }
        else if (editableTarget.part === 'contact') {
            clearTextOverride('contact');
        }
        else if (editableTarget.part === 'address') {
            clearTextOverride('address');
        }
        else if (editableTarget.part === 'topNote') {
            updateDesignOption('topNote', '');
        }
        else if (editableTarget.part === 'footer') {
            setFooterNote(settings.invoiceDesign?.footerText || '');
        }
        else if (editableTarget.part === 'watermark') {
            updateDesignOption('watermarkText', 'WareKeep');
        }
        else if (editableTarget.part === 'logo') {
            clearTextOverride('logoText');
        }
        else if (editableTarget.part === 'tableHeader' && editableTarget.field) {
            clearHeaderOverride(editableTarget.field);
        }
        else if (editableTarget.part === 'tableCell' && editableTarget.rowId && editableTarget.field) {
            clearCellOverride(editableTarget.rowId, editableTarget.field);
        }
    };
    const resetSelectedPartColors = () => {
        clearSectionStyleKeys(editableTarget.part, ['color', 'backgroundColor']);
    };
    const resetSelectedPartAlign = () => {
        if (editableTarget.part === 'tableBody') {
            updateDesignOption('bodyTextAlign', 'start');
        }
        clearSectionStyleKeys(editableTarget.part, ['align']);
    };
    const resetSelectedPartFontSize = () => {
        clearSectionStyleKeys(editableTarget.part, ['fontSize']);
    };
    const resetSelectedPartMove = () => {
        clearSectionStyleKeys(editableTarget.part, ['offsetXmm', 'offsetYmm']);
    };
    const handlePresetChange = (nextPreset: PriceListPreset) => {
        setPreset(nextPreset);
        setFieldKeys(getDefaultPriceListFields(nextPreset, canViewPurchasePrice));
    };
    const handleToggleField = (field: PriceListFieldKey) => {
        setFieldKeys((current) => {
            const exists = current.includes(field);
            const next = exists ? current.filter((item) => item !== field) : [...current, field];
            return normalizePriceListFields(next, canViewPurchasePrice);
        });
    };
    const handleSelectAll = () => {
        setSelectedIds(checklistRows.map((row) => row.medicine.id));
    };
    const handleClearSelection = () => {
        setSelectedIds([]);
    };
    const handleToggleRow = (id: string) => {
        setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    };
    const handlePrint = () => {
        setExportAction('print');
        try {
            const printWindow = openPrintWindow('width=1000,height=900');
            if (!printWindow) {
                setExportStatus(tr('Print window was blocked.', 'پنجره چاپ مسدود شد.'));
                return;
            }
            printWindow.document.write(exportHtml);
            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
            setExportStatus(tr('Sent to print dialog.', 'به پنجره چاپ فرستاده شد.'));
        }
        catch (error) {
            setExportStatus(error instanceof Error ? error.message : tr('Print failed.', 'چاپ ناموفق شد.'));
        }
        finally {
            setExportAction(null);
        }
    };
    const handleSaveHtml = async () => {
        const filename = `${defaultFileBase}.html`;
        setExportAction('html');
        try {
            if (window.electronAPI?.saveInvoiceHtml) {
                const result = await window.electronAPI.saveInvoiceHtml(exportHtml, filename);
                if ((result as {
                    canceled?: boolean;
                } | undefined)?.canceled) {
                    setExportStatus(tr('HTML export canceled.', 'ذخیره HTML لغو شد.'));
                    return;
                }
                if (!result?.success)
                    throw new Error(result?.error || 'SAVE_HTML_FAILED');
                setExportStatus(result.filePath || tr('HTML saved.', 'HTML ذخیره شد.'));
            }
            else {
                downloadBlob(filename, new Blob([exportHtml], { type: 'text/html;charset=utf-8' }));
                setExportStatus(tr('HTML downloaded.', 'HTML دانلود شد.'));
            }
        }
        catch (error) {
            setExportStatus(error instanceof Error ? error.message : tr('HTML export failed.', 'خروجی HTML ناموفق شد.'));
        }
        finally {
            setExportAction(null);
        }
    };
    const handleSavePdf = async () => {
        if (!window.electronAPI?.generateReportPdf) {
            setExportStatus(tr('Use Print and choose Save as PDF in this runtime.', 'در این محیط از چاپ استفاده کنید و Save as PDF را انتخاب کنید.'));
            return;
        }
        setExportAction('pdf');
        try {
            const result = await window.electronAPI.generateReportPdf(exportHtml, `${defaultFileBase}.pdf`);
            if ((result as {
                canceled?: boolean;
            } | undefined)?.canceled) {
                setExportStatus(tr('PDF export canceled.', 'ساخت PDF لغو شد.'));
                return;
            }
            if (!result?.success)
                throw new Error(result?.error || 'PDF_EXPORT_FAILED');
            setExportStatus(result.filePath || tr('PDF generated.', 'PDF ساخته شد.'));
        }
        catch (error) {
            setExportStatus(tr('PDF failed. Use Print and choose Save as PDF.', 'ساخت PDF مستقیم ناموفق شد. از چاپ استفاده کنید و Save as PDF را انتخاب نمایید.'));
        }
        finally {
            setExportAction(null);
        }
    };
    const handleSaveCsv = () => {
        setExportAction('csv');
        try {
            const csv = generatePriceListCSV({
                rows: selectedRows,
                selectedFieldKeys: resolvedFieldKeys,
                settings,
                canViewPurchasePrice,
                title,
                subtitle,
                footerNote,
                showLogo,
                showStoreName,
                showContact,
                design: designOptions,
                cellOverrides,
                headerOverrides
            });
            downloadBlob(`${defaultFileBase}.csv`, new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
            setExportStatus(tr('CSV downloaded.', 'CSV دانلود شد.'));
        }
        catch (error) {
            setExportStatus(error instanceof Error ? error.message : tr('CSV export failed.', 'خروجی CSV ناموفق شد.'));
        }
        finally {
            setExportAction(null);
        }
    };
    const openActiveTooltip = (key: string) => {
        lastTooltipOpenedAtRef.current = Date.now();
        setActiveTooltipKey(key);
    };
    const closeActiveTooltip = (key?: string) => {
        setActiveTooltipKey((current) => (key && current !== key ? current : null));
    };
    const tooltipControlProps = {
        activeTooltipKey,
        onTooltipOpen: openActiveTooltip,
        onTooltipClose: closeActiveTooltip
    };
    const renderAlignButtons = (value: PriceListTextAlign | undefined, onSelect: (align: PriceListTextAlign) => void) => {
        const current = value || 'start';
        const options: Array<{
            key: PriceListTextAlign;
            label: string;
        }> = [
            { key: 'start', label: tr('Start', 'شروع') },
            { key: 'center', label: tr('Center', 'وسط') },
            { key: 'end', label: tr('End', 'آخر') },
            { key: 'left', label: tr('Left', 'چپ') },
            { key: 'right', label: tr('Right', 'راست') }
        ];
        return (<div className="grid grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1 sm:grid-cols-5" data-testid="price-list-align-control" role="group" aria-label={tr('Align', 'چینش متن')}>
        {options.map((option) => (<PriceListIconButton key={option.key} label={option.label} tooltip={option.label} icon={<AlignIcon align={option.key}/>} iconOnly mobileLabel={option.label} active={current === option.key} {...tooltipControlProps} onClick={() => onSelect(option.key)} data-testid={`price-list-align-${option.key}`} className="rounded-xl"/>))}
      </div>);
    };
    const renderFieldGroup = (group: PriceListFieldGroup) => {
        const groupMeta = FIELD_GROUPS.find((item) => item.key === group);
        const fields = PRICE_LIST_FIELD_DEFINITIONS.filter((field) => {
            if (field.group !== group)
                return false;
            if (field.sensitive && !canViewPurchasePrice)
                return false;
            return true;
        });
        if (fields.length === 0)
            return null;
        return (<div key={group} className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
          {groupMeta ? (isEnglish ? groupMeta.label.en : groupMeta.label.fa) : group}
        </p>
        <div className="grid gap-2">
          {fields.map((field) => (<label key={field.key} className="flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-700">
              <input type="checkbox" checked={resolvedFieldKeys.includes(field.key)} onChange={() => handleToggleField(field.key)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"/>
              <span>{isEnglish ? field.label.en : field.label.fa}</span>
            </label>))}
        </div>
      </div>);
    };
    return (<Modal isOpen={isOpen} onClose={onClose} title={tr('Build Medicine Price List', 'ساخت پرایس‌لیست دواها')} maxWidthClassName="max-w-[min(98vw,1560px)]" panelClassName="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl" headerClassName="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 shadow-sm" titleClassName="min-w-0 text-lg font-black text-slate-950" bodyClassName="min-h-0 flex-1 overflow-hidden p-0" footerClassName="shrink-0 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-18px_40px_-36px_rgba(15,23,42,0.35)]" footer={<div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" dir={isEnglish ? 'ltr' : 'rtl'}>
          <div className={classNames('min-h-[36px] rounded-xl border px-3 py-2 text-xs font-bold', exportStatus
                ? 'border-brand-100 bg-brand-50 text-brand-800'
                : 'border-slate-200 bg-slate-50 text-slate-600')} data-testid="price-list-export-status" role="status" aria-live="polite">
            {exportStatus || selectedCountLabel}
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 shadow-sm">
            <PriceListIconButton label={tr('Print', 'چاپ')} tooltip={tr('Print', 'چاپ')} icon={<PrintIcon />} tone="primary" {...tooltipControlProps} onClick={handlePrint} disabled={selectedRows.length === 0 || isExporting} loading={exportAction === 'print'} className="min-w-[104px]">
              {tr('Print', 'چاپ')}
            </PriceListIconButton>
            <PriceListIconButton label="PDF" tooltip={tr('Save as PDF', 'ذخیره PDF')} icon={<PdfIcon />} tone="primary" {...tooltipControlProps} onClick={() => void handleSavePdf()} disabled={selectedRows.length === 0 || isExporting} loading={exportAction === 'pdf'} className="min-w-[104px]">
              PDF
            </PriceListIconButton>
            <PriceListIconButton label="HTML" tooltip={tr('Save HTML', 'ذخیره HTML')} icon={<HtmlIcon />} tone="ghost" {...tooltipControlProps} onClick={() => void handleSaveHtml()} disabled={selectedRows.length === 0 || isExporting} loading={exportAction === 'html'} className="min-w-[92px] border-slate-200 bg-white">
              HTML
            </PriceListIconButton>
            <PriceListIconButton label="CSV" tooltip={tr('Save CSV', 'ذخیره CSV')} icon={<CsvIcon />} tone="ghost" {...tooltipControlProps} onClick={handleSaveCsv} disabled={selectedRows.length === 0 || isExporting} loading={exportAction === 'csv'} className="min-w-[92px] border-slate-200 bg-white">
              CSV
            </PriceListIconButton>
            </div>
            <PriceListIconButton label={tr('Done', 'تمام')} tooltip={tr('Close builder', 'بستن ویرایشگر')} icon={<ShellCloseIcon />} tone="ghost" {...tooltipControlProps} onClick={onClose} className="min-w-[82px] text-slate-500">
              {tr('Done', 'تمام')}
            </PriceListIconButton>
          </div>
        </div>}>
      <div className="flex h-[calc(100dvh-150px)] min-h-0 flex-col bg-slate-50" dir="ltr">
        <div className="shrink-0 border-b border-slate-200 bg-white/95 p-2 lg:hidden" dir={isEnglish ? 'ltr' : 'rtl'}>
          <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
            {([
            { key: 'settings' as PriceListMobileView, label: tr('Settings', 'تنظیمات'), icon: <ShellSettingsIcon /> },
            { key: 'preview' as PriceListMobileView, label: tr('Preview', 'پیش‌نمایش'), icon: <ShellFocusIcon /> }
        ]).map((item) => (<button key={item.key} type="button" onClick={() => setMobileView(item.key)} data-testid={`price-list-mobile-${item.key}`} className={classNames('inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-black transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300', mobileView === item.key
                ? 'bg-white text-brand-700 shadow-sm ring-1 ring-brand-100'
                : 'text-slate-500 hover:bg-white/70 hover:text-slate-900')}>
                <span className="inline-flex h-4 w-4 items-center justify-center">{item.icon}</span>
                <span>{item.label}</span>
              </button>))}
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto bg-slate-50 lg:grid-cols-[minmax(0,1fr)_420px] lg:grid-rows-1 lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_460px]">
        <aside className={classNames('order-2 min-h-0 overflow-y-auto border-t border-slate-200 bg-slate-50/95 p-3 custom-scrollbar lg:block lg:border-l lg:border-t-0 lg:p-4', mobileView === 'settings' ? 'block' : 'hidden')} data-testid="price-list-settings-panel" dir={isEnglish ? 'ltr' : 'rtl'}>
          <div className="sticky top-0 z-10 -mx-3 -mt-3 mb-3 border-b border-slate-200 bg-slate-50/95 px-3 py-3 backdrop-blur lg:-mx-4 lg:-mt-4 lg:px-4">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
              {tr('Settings', 'تنظیمات')}
            </p>
            <p className="mt-1 text-sm font-black text-slate-900">
              {selectedCountLabel}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-white p-1">
              {([
            { key: 'content' as PriceListWorkflowStep, label: tr('Content', 'محتوا'), icon: <ShellInventoryIcon /> },
            { key: 'design' as PriceListWorkflowStep, label: tr('Design', 'طراحی'), icon: <PaletteIcon /> },
            { key: 'edit' as PriceListWorkflowStep, label: tr('Edit', 'ویرایش'), icon: <ShellFocusIcon active={activeWorkflowStep === 'edit'}/> }
        ]).map((item) => (<button key={item.key} type="button" onClick={() => setActiveWorkflowStep(item.key)} data-testid={`price-list-workflow-${item.key}`} className={classNames('inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-black transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300', activeWorkflowStep === item.key
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/20'
                : 'text-slate-500 hover:bg-brand-50 hover:text-brand-700')}>
                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </button>))}
            </div>
            <div className="mt-2 rounded-2xl border border-brand-100 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-brand-500">
                {tr('Selected Part', 'بخش انتخابی')}
              </span>
              <span className="mt-0.5 block truncate" data-testid="price-list-selected-part-chip">
                {selectedPartSummary || tr('Nothing selected', 'چیزی انتخاب نشده')}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <SettingsSection title={tr('Document Content', 'محتوای سند')} eyebrow={tr('Content', 'محتوا')} icon={<TextIcon />} className={activeWorkflowStep === 'content' ? 'order-2' : 'hidden'} defaultOpen>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => handlePresetChange('customer')} className={classNames('rounded-lg border px-3 py-2 text-xs font-black transition', preset === 'customer'
            ? 'border-brand-300 bg-brand-50 text-brand-700'
            : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-700')}>
                  {tr('Customer List', 'لیست مشتری')}
                </button>
                {canViewPurchasePrice ? (<button type="button" onClick={() => handlePresetChange('internal')} className={classNames('rounded-lg border px-3 py-2 text-xs font-black transition', preset === 'internal'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-700')}>
                    {tr('Internal List', 'لیست داخلی')}
                  </button>) : null}
              </div>

              <div className="grid gap-3">
                <label className="grid gap-1 text-sm font-bold text-slate-700">
                  {tr('Title', 'عنوان')}
                  <input value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100"/>
                </label>
                <label className="grid gap-1 text-sm font-bold text-slate-700">
                  {tr('Subtitle', 'زیرعنوان')}
                  <input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100"/>
                </label>
                <label className="grid gap-1 text-sm font-bold text-slate-700">
                  {tr('Footer Note', 'یادداشت پایین صفحه')}
                  <textarea value={footerNote} onChange={(event) => setFooterNote(event.target.value)} rows={2} className="resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100"/>
                </label>
              </div>

            </SettingsSection>

            <SettingsSection title={tr('Pharmacy Info', 'اطلاعات دواخانه')} eyebrow={tr('Branding', 'برندینگ')} icon={<StoreIcon />} className={activeWorkflowStep === 'content' ? 'order-3' : 'hidden'} defaultOpen>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
            { checked: showLogo, onChange: setShowLogo, label: tr('Logo', 'لوگو'), icon: <LogoIcon /> },
            { checked: showStoreName, onChange: setShowStoreName, label: tr('Store Name', 'نام دواخانه'), icon: <StoreIcon /> },
            { checked: showContact, onChange: setShowContact, label: tr('Contact', 'تماس'), icon: <PhoneIcon /> }
        ].map((item) => (<PriceListToggleCard key={item.label} label={item.label} checked={item.checked} onChange={item.onChange} icon={item.icon} {...tooltipControlProps}/>))}
              </div>

              {suggestions.length > 0 ? (<div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-black text-amber-800">
                    <SparkleIcon />
                    <span>{tr('Suggestions', 'پیشنهادها')}</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((suggestion) => (<span key={suggestion} className="rounded-full border border-amber-200 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                        {suggestion}
                      </span>))}
                  </div>
                </div>) : null}
            </SettingsSection>

            <SettingsSection title={tr('Design Presets', 'طرح و قالب')} eyebrow={tr('Design', 'طراحی')} icon={<PaletteIcon />} className={activeWorkflowStep === 'design' ? 'order-1' : 'hidden'}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-black text-slate-900">{tr('Design', 'طراحی')}</p>
                <PriceListIconButton label={tr('Reset', 'تنظیم مجدد')} tooltip={tr('Reset design', 'تنظیم مجدد طراحی')} icon={<ResetIcon />} {...tooltipControlProps} onClick={() => setDesignOptions(createDefaultDesign(settings, isEnglish))} className="min-h-9 px-2.5 py-1.5 text-[11px]">
                  {tr('Reset', 'تنظیم مجدد')}
                </PriceListIconButton>
              </div>

              <div className="mb-3 flex flex-wrap gap-2">
                {DESIGN_PRESETS.map((item) => (<button key={item.key} type="button" onClick={() => applyDesignPreset(item.key)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700">
                    {isEnglish ? item.label.en : item.label.fa}
                  </button>))}
              </div>

              <div className="grid gap-3">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                  {tr('Page / Print', 'صفحه / چاپ')}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-black text-slate-600">
                    {tr('Digits', 'ارقام')}
                    <select value={designOptions.numeralStyle || 'auto'} onChange={(event) => updateDesignOption('numeralStyle', event.target.value as PriceListDesignOptions['numeralStyle'])} data-testid="price-list-numeral-style" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100">
                      <option value="auto">{tr('Auto', 'خودکار')}</option>
                      <option value="persian">{tr('Persian digits', '۱۲۳')}</option>
                      <option value="english">123</option>
                    </select>
                  </label>

                  <label className="grid gap-1 text-xs font-black text-slate-600">
                    {tr('Page', 'صفحه')}
                    <select value={designOptions.pageSize || 'A4'} onChange={(event) => updateDesignOption('pageSize', event.target.value as PriceListDesignOptions['pageSize'])} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100">
                      <option value="A4">A4</option>
                      <option value="A5">A5</option>
                    </select>
                  </label>

                  <label className="grid gap-1 text-xs font-black text-slate-600">
                    {tr('Orientation', 'جهت صفحه')}
                    <select value={designOptions.orientation || 'portrait'} onChange={(event) => updateDesignOption('orientation', event.target.value as PriceListDesignOptions['orientation'])} data-testid="price-list-page-orientation" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100">
                      <option value="portrait">{tr('Portrait', 'عمودی')}</option>
                      <option value="landscape">{tr('Landscape', 'افقی')}</option>
                    </select>
                  </label>

                  <label className="grid gap-1 text-xs font-black text-slate-600">
                    {tr('Margin', 'حاشیه')}
                    <input type="number" min={6} max={24} value={designOptions.marginMm ?? 12} onChange={(event) => updateDesignOption('marginMm', Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100"/>
                  </label>
                </div>

                <p className="pt-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                  {tr('Color / Font', 'رنگ / فونت')}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-black text-slate-600">
                    {tr('Primary Color', 'رنگ اصلی')}
                    <input type="color" value={designOptions.primaryColor || '#2563eb'} onChange={(event) => updateDesignOption('primaryColor', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1"/>
                  </label>
                  <label className="grid gap-1 text-xs font-black text-slate-600">
                    {tr('Text Color', 'رنگ متن')}
                    <input type="color" value={designOptions.accentColor || '#0f172a'} onChange={(event) => updateDesignOption('accentColor', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1"/>
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-black text-slate-600">
                    {tr('Font', 'فونت')}
                    <select value={designOptions.fontFamily || (isEnglish ? 'system' : 'vazirmatn')} onChange={(event) => updateDesignOption('fontFamily', event.target.value as PriceListDesignOptions['fontFamily'])} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100">
                      <option value="system">{tr('System', 'سیستمی')}</option>
                      <option value="vazirmatn">Vazirmatn</option>
                      <option value="tahoma">Tahoma</option>
                      <option value="arial">Arial</option>
                      <option value="serif">{tr('Serif', 'کلاسیک')}</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-black text-slate-600">
                    {tr('Font Size', 'اندازه خط')}
                    <input type="number" min={9} max={14} value={designOptions.fontSize ?? 11} onChange={(event) => updateDesignOption('fontSize', Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100"/>
                  </label>
                </div>

                <p className="pt-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                  {tr('Table / Header', 'جدول / سرصفحه')}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-black text-slate-600">
                    {tr('Table Density', 'تراکم جدول')}
                    <select value={designOptions.tableDensity || 'comfortable'} onChange={(event) => updateDesignOption('tableDensity', event.target.value as PriceListDesignOptions['tableDensity'])} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100">
                      <option value="compact">{tr('Compact', 'فشرده')}</option>
                      <option value="comfortable">{tr('Comfortable', 'معمولی')}</option>
                      <option value="spacious">{tr('Spacious', 'باز')}</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-black text-slate-600">
                    {tr('Borders', 'خطوط جدول')}
                    <select value={designOptions.borderStyle || 'grid'} onChange={(event) => updateDesignOption('borderStyle', event.target.value as PriceListDesignOptions['borderStyle'])} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100">
                      <option value="grid">{tr('Grid', 'جدولی')}</option>
                      <option value="soft">{tr('Soft', 'نرم')}</option>
                      <option value="minimal">{tr('Minimal', 'ساده')}</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-black text-slate-600">
                    {tr('Header', 'سرصفحه')}
                    <select value={designOptions.headerLayout || 'split'} onChange={(event) => updateDesignOption('headerLayout', event.target.value as PriceListDesignOptions['headerLayout'])} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100">
                      <option value="split">{tr('Split', 'دو طرفه')}</option>
                      <option value="centered">{tr('Centered', 'وسط')}</option>
                      <option value="stacked">{tr('Stacked', 'ردیفی')}</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-black text-slate-600">
                    {tr('Title Align', 'جای عنوان')}
                    <select value={designOptions.titleAlign || 'start'} onChange={(event) => updateDesignOption('titleAlign', event.target.value as PriceListDesignOptions['titleAlign'])} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100">
                      <option value="start">{tr('Start', 'شروع')}</option>
                      <option value="center">{tr('Center', 'وسط')}</option>
                      <option value="end">{tr('End', 'آخر')}</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {[
            { key: 'zebraRows' as const, label: tr('Zebra Rows', 'رنگ ردیف‌ها'), checked: designOptions.zebraRows !== false },
            { key: 'showGeneratedAt' as const, label: tr('Date', 'تاریخ'), checked: designOptions.showGeneratedAt !== false },
            { key: 'showItemCount' as const, label: tr('Item Count', 'تعداد اقلام'), checked: designOptions.showItemCount !== false },
            { key: 'showCurrency' as const, label: tr('Currency', 'واحد پول'), checked: designOptions.showCurrency !== false }
        ].map((item) => (<label key={item.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                      <input type="checkbox" checked={item.checked} onChange={(event) => updateDesignOption(item.key, event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"/>
                      {item.label}
                    </label>))}
                </div>

                <p className="pt-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                  {tr('Notes / Watermark', 'یادداشت / واترمارک')}
                </p>
                <label className="grid gap-1 text-xs font-black text-slate-600">
                  {tr('Top Note', 'یادداشت بالای جدول')}
                  <textarea value={designOptions.topNote || ''} onChange={(event) => updateDesignOption('topNote', event.target.value)} rows={2} className="resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100"/>
                </label>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs font-black text-slate-700">
                    <input type="checkbox" checked={designOptions.showWatermark !== false} onChange={(event) => updateDesignOption('showWatermark', event.target.checked)} data-testid="price-list-watermark-toggle" className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"/>
                    {tr('WareKeep Watermark', 'واترمارک WareKeep')}
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input value={designOptions.watermarkText || 'WareKeep'} onChange={(event) => updateDesignOption('watermarkText', event.target.value)} data-testid="price-list-watermark-text" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100" dir="ltr"/>
                    <select value={designOptions.watermarkPosition || 'bottom-left'} onChange={(event) => updateDesignOption('watermarkPosition', event.target.value as PriceListDesignOptions['watermarkPosition'])} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100">
                      <option value="bottom-left">{tr('Bottom Left', 'پایین چپ')}</option>
                      <option value="bottom-right">{tr('Bottom Right', 'پایین راست')}</option>
                      <option value="top-left">{tr('Top Left', 'بالا چپ')}</option>
                      <option value="top-right">{tr('Top Right', 'بالا راست')}</option>
                      <option value="center">{tr('Center', 'وسط')}</option>
                    </select>
                    <label className="sm:col-span-2 grid gap-1 text-[11px] font-black text-slate-600">
                      {tr('Opacity', 'شفافیت')}
                      <input type="range" min={0.04} max={0.3} step={0.01} value={designOptions.watermarkOpacity ?? 0.16} onChange={(event) => updateDesignOption('watermarkOpacity', Number(event.target.value))} className="w-full accent-brand-600"/>
                    </label>
                  </div>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection title={tr('Selected Part', 'بخش انتخابی')} eyebrow={tr('Editor', 'ویرایشگر')} icon={<ShellFocusIcon active/>} className={activeWorkflowStep === 'edit' ? 'order-1' : 'hidden'} defaultOpen>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-black text-slate-900">{tr('Selected Part', 'بخش انتخابی')}</p>
                <PriceListIconButton label={tr('Clear Style', 'پاک‌سازی سبک')} tooltip={tr('Clear selected style', 'پاک‌سازی سبک بخش انتخابی')} icon={<TrashIcon />} tone="danger" {...tooltipControlProps} onClick={() => clearSectionStyle(editableTarget.part)} className="min-h-9 px-2.5 py-1.5 text-[11px]">
                  {tr('Clear Style', 'پاک‌سازی سبک')}
                </PriceListIconButton>
              </div>

              <div className="grid gap-3">
                <label className="grid gap-1 text-xs font-black text-slate-600">
                  {tr('Part', 'بخش')}
                  <select value={editableTarget.part} onChange={(event) => {
            const part = event.target.value as PriceListEditablePart;
            if (part === 'tableCell' && selectedEditRow) {
                setEditableTarget({ part, rowId: selectedEditRow.medicine.id, field: 'retailPrice' });
            }
            else if (part === 'tableHeader') {
                setEditableTarget({ part, field: resolvedFieldKeys[0] || 'name' });
            }
            else {
                setEditableTarget({ part });
            }
        }} data-testid="price-list-editable-part" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100">
                    {EDITABLE_PARTS.map((part) => (<option key={part.key} value={part.key}>
                        {isEnglish ? part.label.en : part.label.fa}
                      </option>))}
                  </select>
                </label>

                {selectedPartSummary ? (<div className="rounded-2xl border border-brand-100 bg-brand-50 px-3 py-2 text-xs font-black text-brand-800">
                    <span className="block text-[10px] uppercase tracking-[0.14em] text-brand-500">
                      {tr('Editing now', 'در حال ویرایش')}
                    </span>
                    <span className="mt-0.5 block break-words">{selectedPartSummary}</span>
                  </div>) : null}

                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="grid grid-cols-5 gap-2">
                    <PriceListIconButton label={tr('Reset Text', 'برگشت متن')} tooltip={tr('Reset Text', 'برگشت متن')} icon={<TextIcon />} iconOnly mobileLabel={tr('Text', 'متن')} {...tooltipControlProps} onClick={resetSelectedPartText} data-testid="price-list-reset-text"/>
                    <PriceListIconButton label={tr('Reset Size', 'برگشت اندازه')} tooltip={tr('Reset Size', 'برگشت اندازه')} icon={<TextSizeIcon />} iconOnly mobileLabel={tr('Size', 'اندازه')} disabled={!selectedPartSupportsFontSize} {...tooltipControlProps} onClick={resetSelectedPartFontSize} data-testid="price-list-reset-size"/>
                    <PriceListIconButton label={tr('Reset Color', 'برگشت رنگ')} tooltip={tr('Reset Color', 'برگشت رنگ')} icon={<PaletteIcon />} iconOnly mobileLabel={tr('Color', 'رنگ')} {...tooltipControlProps} onClick={resetSelectedPartColors} data-testid="price-list-reset-colors"/>
                    <PriceListIconButton label={tr('Reset Align', 'برگشت چینش')} tooltip={tr('Reset Align', 'برگشت چینش')} icon={<AlignIcon align="start"/>} iconOnly mobileLabel={tr('Align', 'چینش')} {...tooltipControlProps} onClick={resetSelectedPartAlign} data-testid="price-list-reset-align"/>
                    <PriceListIconButton label={tr('Reset Move', 'برگشت جابه‌جایی')} tooltip={tr('Reset Move', 'برگشت جابه‌جایی')} icon={<ResetIcon />} iconOnly mobileLabel={tr('Move', 'حرکت')} {...tooltipControlProps} onClick={resetSelectedPartMove} data-testid="price-list-reset-move"/>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
                    <div className="grid grid-cols-3 items-center gap-2 text-xs font-black text-slate-600">
                      <span />
                      <PriceListIconButton label={tr('Move up', 'حرکت به بالا')} tooltip={tr('Move up', 'حرکت به بالا')} icon={<ArrowIcon direction="up"/>} iconOnly mobileLabel={tr('Up', 'بالا')} {...tooltipControlProps} onClick={() => moveSelectedPart(0, -moveStepMm)} data-testid="price-list-move-up" className="mx-auto"/>
                      <span />
                      <PriceListIconButton label={tr('Move left', 'حرکت به چپ')} tooltip={tr('Move left', 'حرکت به چپ')} icon={<ArrowIcon direction="left"/>} iconOnly mobileLabel={tr('Left', 'چپ')} {...tooltipControlProps} onClick={() => moveSelectedPart(-moveStepMm, 0)} data-testid="price-list-move-left" className="mx-auto"/>
                      <span className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-center text-[11px] leading-4 text-slate-500 shadow-sm">
                        {offsetDescription}
                      </span>
                      <PriceListIconButton label={tr('Move right', 'حرکت به راست')} tooltip={tr('Move right', 'حرکت به راست')} icon={<ArrowIcon direction="right"/>} iconOnly mobileLabel={tr('Right', 'راست')} {...tooltipControlProps} onClick={() => moveSelectedPart(moveStepMm, 0)} data-testid="price-list-move-right" className="mx-auto"/>
                      <span />
                      <PriceListIconButton label={tr('Move down', 'حرکت به پایین')} tooltip={tr('Move down', 'حرکت به پایین')} icon={<ArrowIcon direction="down"/>} iconOnly mobileLabel={tr('Down', 'پایین')} {...tooltipControlProps} onClick={() => moveSelectedPart(0, moveStepMm)} data-testid="price-list-move-down" className="mx-auto"/>
                      <span />
                    </div>
                  </div>
                </div>

                {EDITABLE_TEXT_PARTS.has(editableTarget.part) ? (<label className="grid gap-1 text-xs font-black text-slate-600">
                    {tr('Text / Value', 'متن / مقدار')}
                    <textarea value={getSelectedPartText()} onChange={(event) => setSelectedPartText(event.target.value)} data-testid="price-list-selected-part-text" rows={editableTarget.part === 'tableCell' ? 1 : 2} className="resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100"/>
                  </label>) : null}

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-xs font-black text-slate-600">
                    {tr('Text Size', 'اندازه متن')}
                    <input type="number" min={6} max={72} step={0.5} value={selectedPartFontSize} disabled={!selectedPartSupportsFontSize} onChange={(event) => setSelectedPartFontSize(Number(event.target.value))} data-testid="price-list-selected-part-font-size" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100 disabled:text-slate-400"/>
                  </label>
                  <label className="grid gap-1 text-xs font-black text-slate-600">
                    {tr('Color', 'رنگ متن')}
                    <input type="color" value={selectedPartStyle.color || '#0f172a'} onChange={(event) => updateSectionStyle(editableTarget.part, 'color', event.target.value)} data-testid="price-list-selected-part-color" className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1"/>
                  </label>
                  <label className="grid gap-1 text-xs font-black text-slate-600">
                    {tr('Background', 'رنگ پس‌زمینه')}
                    <input type="color" value={selectedPartStyle.backgroundColor || '#ffffff'} onChange={(event) => updateSectionStyle(editableTarget.part, 'backgroundColor', event.target.value)} data-testid="price-list-selected-part-bg" className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1"/>
                  </label>
                </div>

                <div className="grid gap-1 text-xs font-black text-slate-600">
                  {tr('Align', 'چینش متن')}
                  {renderAlignButtons(editableTarget.part === 'tableBody' || editableTarget.part === 'tableHeader' || editableTarget.part === 'tableCell'
            ? selectedPartStyle.align || designOptions.bodyTextAlign
            : selectedPartStyle.align, setSelectedPartAlign)}
                </div>

                {editableTarget.part === 'logo' ? (<div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs font-black text-slate-600">
                      {tr('Logo Position', 'جای لوگو')}
                      <select value={designOptions.logoPosition || 'start'} onChange={(event) => updateDesignOption('logoPosition', event.target.value as PriceListDesignOptions['logoPosition'])} data-testid="price-list-logo-position" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100">
                        <option value="start">{tr('Start', 'شروع')}</option>
                        <option value="end">{tr('End', 'آخر')}</option>
                        <option value="top">{tr('Top', 'بالا')}</option>
                        <option value="hidden">{tr('Hidden', 'پنهان')}</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-black text-slate-600">
                      {tr('Logo Size', 'اندازه لوگو')}
                      <input type="number" min={32} max={96} value={designOptions.logoSize ?? 58} onChange={(event) => updateDesignOption('logoSize', Number(event.target.value))} data-testid="price-list-logo-size" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100"/>
                    </label>
                    <label className="grid gap-1 text-xs font-black text-slate-600 sm:col-span-2">
                      {tr('Logo Background', 'پس‌زمینه لوگو')}
                      <input type="color" value={designOptions.logoBackgroundColor || '#ffffff'} onChange={(event) => updateDesignOption('logoBackgroundColor', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1"/>
                    </label>
                  </div>) : null}
              </div>
            </SettingsSection>

            <SettingsSection title={tr('Row Text & Prices', 'متن و قیمت‌های سطر')} eyebrow={tr('Rows', 'سطرها')} icon={<ShellReportsIcon />} className={activeWorkflowStep === 'edit' ? 'order-2' : 'hidden'}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-black text-slate-900">{tr('Row Text & Prices', 'متن و قیمت‌های سطر')}</p>
                {selectedEditRow ? (<PriceListIconButton label={tr('Reset Row', 'برگشت سطر')} tooltip={tr('Reset Row', 'برگشت سطر')} icon={<ResetIcon />} {...tooltipControlProps} onClick={() => clearRowOverrides(selectedEditRow.medicine.id)} className="min-h-9 px-2.5 py-1.5 text-[11px]">
                    {tr('Reset Row', 'برگشت سطر')}
                  </PriceListIconButton>) : null}
              </div>

              <div className="grid gap-3">
                <label className="grid gap-1 text-xs font-black text-slate-600">
                  {tr('Medicine', 'دوا')}
                  <select value={selectedEditRow?.medicine.id || ''} onChange={(event) => {
            setSelectedEditRowId(event.target.value);
            setEditableTarget({ part: 'tableCell', rowId: event.target.value, field: 'retailPrice' });
        }} data-testid="price-list-row-edit-select" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100">
                    {selectedRows.map((row) => (<option key={row.medicine.id} value={row.medicine.id}>
                        {row.medicine.name}
                      </option>))}
                  </select>
                </label>

                {selectedEditRow ? (<div className="grid gap-2">
                    {ROW_EDIT_FIELDS.map((field) => {
                const isPriceField = PRICE_FIELDS.includes(field);
                return (<label key={field} className="grid gap-1 text-xs font-black text-slate-600">
                          {getFieldLabel(field)}
                          <div className="flex gap-2">
                            <input type={isPriceField ? 'number' : 'text'} value={getEditableFieldValue(selectedEditRow, field)} onFocus={() => setEditableTarget({ part: 'tableCell', rowId: selectedEditRow.medicine.id, field })} onChange={(event) => {
                        updateCellOverride(selectedEditRow.medicine.id, field, event.target.value);
                        setEditableTarget({ part: 'tableCell', rowId: selectedEditRow.medicine.id, field });
                    }} data-testid={`price-list-row-edit-${field}`} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-hidden focus:border-brand-300 focus:ring-2 focus:ring-brand-100"/>
                            <PriceListIconButton label={tr('Reset field', 'برگشت فیلد')} tooltip={tr('Reset field', 'برگشت فیلد')} icon={<ResetIcon />} {...tooltipControlProps} onClick={() => clearCellOverride(selectedEditRow.medicine.id, field)} className="shrink-0 rounded-lg px-2.5 py-2 text-[11px]">
                              {tr('Reset', 'اصل')}
                            </PriceListIconButton>
                          </div>
                        </label>);
            })}
                  </div>) : (<p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">
                    {tr('No selected medicine.', 'هیچ دوایی انتخاب نشده است.')}
                  </p>)}
              </div>
            </SettingsSection>

            <SettingsSection title={tr('Medicines', 'دواها')} eyebrow={tr('Selection', 'انتخاب')} icon={<ShellInventoryIcon />} className={activeWorkflowStep === 'content' ? 'order-1' : 'hidden'} defaultOpen>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-black text-slate-900">{tr('Medicines', 'دواها')}</p>
                <span className="text-xs font-bold text-slate-500">{selectedCountLabel}</span>
              </div>
              <div className="grid gap-2">
                <div className="relative">
                  <span className={classNames('pointer-events-none absolute top-1/2 inline-flex h-4 w-4 -translate-y-1/2 text-slate-400', isEnglish ? 'left-3' : 'right-3')}>
                    <ShellSearchIcon />
                  </span>
                  <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={tr('Search medicines', 'جستجوی دواها')} aria-label={tr('Search medicines', 'جستجوی دواها')} className={classNames('w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-hidden transition focus:border-brand-300 focus:ring-2 focus:ring-brand-100', isEnglish ? 'pl-9' : 'pr-9')}/>
                </div>
                <div className="flex flex-wrap gap-2">
                  <PriceListIconButton label={tr('Select All Filtered', 'انتخاب همه نتایج')} tooltip={tr('Select All Filtered', 'انتخاب همه نتایج')} icon={<CheckIcon />} {...tooltipControlProps} onClick={handleSelectAll} className="min-h-9 px-2.5 py-1.5 text-[11px]">
                    {tr('Select All Filtered', 'انتخاب همه نتایج')}
                  </PriceListIconButton>
                  <PriceListIconButton label={tr('Clear', 'پاک‌سازی')} tooltip={tr('Clear', 'پاک‌سازی')} icon={<TrashIcon />} tone="ghost" {...tooltipControlProps} onClick={handleClearSelection} className="min-h-9 px-2.5 py-1.5 text-[11px]">
                    {tr('Clear', 'پاک‌سازی')}
                  </PriceListIconButton>
                  <label className={classNames('inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition focus-within:ring-2 focus-within:ring-brand-300', onlyAvailable
            ? 'border-brand-300 bg-brand-50 text-brand-800'
            : 'border-slate-200 bg-white text-slate-700 hover:border-brand-200 hover:bg-brand-50/60')}>
                    <input type="checkbox" checked={onlyAvailable} onChange={(event) => setOnlyAvailable(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"/>
                    {tr('Only available', 'فقط موجود')}
                  </label>
                </div>
              </div>
              <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                {checklistRows.length === 0 ? (<p className="px-2 py-4 text-center text-sm font-bold text-slate-500">
                    {tr('No medicines found.', 'هیچ دوایی پیدا نشد.')}
                  </p>) : (<div className="grid gap-1">
                    {checklistRows.map((row) => {
                const checked = selectedIdSet.has(row.medicine.id);
                return (<label key={row.medicine.id} className={classNames('flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm transition', checked
                        ? 'border-brand-200 bg-brand-50 shadow-sm ring-1 ring-brand-100'
                        : 'border-transparent bg-white hover:border-brand-100 hover:bg-brand-50/60')}>
                          <input type="checkbox" checked={checked} onChange={() => handleToggleRow(row.medicine.id)} className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"/>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-black text-slate-800">{row.medicine.name}</span>
                            <span className="block truncate text-xs font-bold text-slate-500">
                              {row.canonicalManufacturer || row.medicine.manufacturer || tr('Unknown company', 'شرکت نامشخص')}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-black text-slate-500">{getRowQuantity(row).toLocaleString(numberLocale)}</span>
                          <span className={classNames('mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition', checked ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-slate-50 text-transparent')}>
                            <CheckIcon />
                          </span>
                        </label>);
            })}
                  </div>)}
              </div>
            </SettingsSection>

            <SettingsSection title={tr('Fields', 'مشخصات')} eyebrow={tr('Columns', 'ستون‌ها')} icon={<ShellSettingsIcon />} className={activeWorkflowStep === 'content' ? 'order-4' : 'hidden'}>
              <p className="mb-3 text-sm font-black text-slate-900">{tr('Fields', 'مشخصات')}</p>
              <div className="grid gap-3">
                {FIELD_GROUPS.map((group) => renderFieldGroup(group.key))}
              </div>
            </SettingsSection>
          </div>
        </aside>

        <section className={classNames('order-1 min-h-[420px] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(219,234,254,0.85),_rgba(248,250,252,0.92)_42%,_rgba(226,232,240,0.92))] p-3 md:p-5 lg:block lg:min-h-0', mobileView === 'preview' ? 'block' : 'hidden')} data-testid="price-list-preview-panel" dir={isEnglish ? 'ltr' : 'rtl'}>
          <div className="flex h-[420px] justify-center overflow-auto rounded-2xl border border-slate-200/80 bg-slate-200/70 p-3 shadow-inner custom-scrollbar sm:h-[520px] md:p-5 lg:h-full">
            <div className="overflow-hidden rounded-sm bg-white shadow-[0_26px_80px_-44px_rgba(15,23,42,0.62)] ring-1 ring-slate-300/60" style={{ width: `${previewFrame.width}mm`, minWidth: `${previewFrame.width}mm`, height: `${previewFrame.height}mm` }}>
              <div style={{ width: `${previewPage.width}mm`, transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
                <iframe ref={previewFrameRef} key={`${previewHtml.length}-${pageSize}-${orientation}`} srcDoc={previewHtml} title={tr('Price List Preview', 'پیش‌نمایش پرایس‌لیست')} data-testid="price-list-preview" className="w-full border-0" style={{ height: `${previewPage.height}mm` }}/>
              </div>
            </div>
          </div>
        </section>
      </div>
      </div>
    </Modal>);
};
