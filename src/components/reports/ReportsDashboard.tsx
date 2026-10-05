import React, { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { startPerformanceSpan } from '@/utils/performanceTelemetry';
import { openPrintWindow } from '@/utils/printWindow';
import { defaultReportFilters } from '@/reports/reportComputation';
import { calculateReportAsync, calculateSuggestedPresetAsync } from '@/reports/reportWorkerClient';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AppSettings, AppUser, Customer, Currency, Expense, Invoice, InvoiceItem, InvoiceUpdateRequest, Medicine, Purchase, Supplier } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { CategoryIconChip } from '@/components/ui/CategoryIconChip';
import { resolveCategoryIconMeta } from '@/utils/iconMatcher';
import type { CategoryIconMeta } from '@/types';
import { InvoicePrintModal } from '@/components/InvoicePrintModal';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActiveFilterChip, FilterDateField, FilterField, FilterSearchField, FilterSelectField, LockHint, UnifiedFilterBar } from '@/components/ui/UnifiedFilterBar';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { EmptyStateShell } from '@/components/ui/StateShell';
import { PageSurface, FlatCard as SharedFlatCard } from '@/components/ui/Surface';
import { TabStrip } from '@/components/ui/TabStrip';
import { buildReportBundle, formatReportDate, formatReportMoney, formatReportPercent, type ReportBundle, type ReportChartSeries, type ReportFilters, type ReportMetricCard, type ReportPreset, type ReportTableColumn, type ReportTable, type ReportTab } from '@/reports/reporting';
import { formatAppDate, resolveUiLocale } from '@/lib/formatters';
import { buildBilingualBundlePair, buildReportCsv, buildReportFileName, buildReportHtml, buildShareText, sanitizeReportBundleForAccess, type ReportExportLanguage, type ReportExportMode } from '@/reports/export';
import { auditService } from '@/services/auditService';
import { calculateInvoiceLineDiscount, calculateInvoiceTotals, calculateItemProfit } from '@/utils/calculations';
import { createUniqueId } from '@/utils/localIds';
import { normalizePersianNumbers } from '@/utils/localization';
import { getInvoiceItemBaseQuantity } from '@/utils/unitConversion';
export type ReportsFinancialOverlay = 'sales_ledger' | 'profit_studio' | 'expense_manager' | 'invoice_manager';
export interface ReportsDashboardProps {
    mode?: 'home' | 'advanced';
    invoices: Invoice[];
    medicines: Medicine[];
    customers?: Customer[];
    expenses?: Expense[];
    purchases?: Purchase[];
    suppliers?: Supplier[];
    settings?: AppSettings;
    activeAppUser?: AppUser | null;
    onNavigate?: (view: 'sales' | 'inventory' | 'customers' | 'expenses' | 'purchases') => void;
    onDeleteInvoices?: (ids: string[]) => void;
    canDeleteInvoices?: boolean;
    onUpdateInvoice?: (invoiceId: string, request: InvoiceUpdateRequest) => void | Promise<void | Invoice>;
    canEditInvoices?: boolean;
    onTransferInvoiceSeller?: (invoiceId: string, nextUserId: string) => void | Promise<void>;
    canTransferInvoiceSeller?: boolean;
    onAddExpense?: (expense: Omit<Expense, 'id'>) => void;
    onUpdateExpense?: (id: string, expense: Partial<Expense>) => void;
    onDeleteExpense?: (id: string) => void;
    canManageExpenses?: boolean;
    requestedFinancialOverlay?: ReportsFinancialOverlay | null;
    onRequestedFinancialOverlayApplied?: () => void;
}
type SavedView = {
    id: string;
    name: string;
    favorite: boolean;
    filters: ReportFilters;
    createdAt: string;
};
type ReportState = {
    status: 'loading';
    report?: ReportBundle;
} | {
    status: 'ready';
    report: ReportBundle;
} | {
    status: 'error';
    message: string;
    report?: ReportBundle;
};
type ExportJob = {
    id: string;
    label: string;
    status: 'queued' | 'processing' | 'ready' | 'failed';
    createdAt: string;
    detail?: string;
};
type HomeInvoiceRow = {
    id: string;
    invoiceLabel: string;
    date: string;
    customerId: string;
    customerName: string;
    sellerId: string;
    sellerName: string;
    grossSales: number;
    netSales: number;
    finalAmount: number;
    amountPaid: number;
    remainingAmount: number;
    cogs: number;
    grossProfit: number;
    paymentStatus: Invoice['paymentStatus'];
};
type HomeExpenseRow = {
    id: string;
    title: string;
    category: string;
    amount: number;
    date: string;
    description: string;
    recordedBy: string;
};
type HomeReportSearchFilter = 'all' | 'invoice' | 'customer' | 'seller' | 'product' | 'expense' | 'debt';
type HomeSearchPaymentStatus = 'all' | Invoice['paymentStatus'];
type InvoiceManagerFilters = {
    query: string;
    status: HomeSearchPaymentStatus;
    dateFrom: string;
    dateTo: string;
};
type HomeReportSearchResultKind = 'invoice' | 'customer' | 'seller' | 'product' | 'expense';
type HomeReportSearchStatTone = 'brand' | 'success' | 'danger' | 'warning' | 'neutral';
type HomeReportSearchStat = {
    label: string;
    value: string;
    tone?: HomeReportSearchStatTone;
};
type HomeReportSearchResult = {
    id: string;
    kind: HomeReportSearchResultKind;
    title: string;
    subtitle: string;
    detail: string;
    stats: HomeReportSearchStat[];
    invoiceId?: string;
    overlay?: FinancialOverlay;
};
type HomeSearchSuggestion = {
    id: string;
    label: string;
    query: string;
    filter: HomeReportSearchFilter;
    paymentStatus?: HomeSearchPaymentStatus;
};
type ExecutiveFinancePoint = {
    id: string;
    label: string;
    grossSales: number;
    collected: number;
    grossProfit: number;
    invoiceCount: number;
};
type ProfitMixSegment = {
    id: string;
    label: string;
    value: number;
    color: string;
    glowClass: string;
    badgeClass: string;
};
type FinancialOverlay = ReportsFinancialOverlay;
type InvoiceTableVariant = 'invoice-manager' | 'sales-ledger' | 'profit-studio';
type PendingDeleteAction = {
    kind: 'invoices';
    ids: string[];
} | {
    kind: 'expense';
    expenseId: string;
    expenseLabel: string;
};
type ExpenseDraft = {
    title: string;
    amount: string;
    category: string;
    date: string;
    description: string;
};
type InvoiceEditCustomerMode = NonNullable<InvoiceUpdateRequest['customerEditMode']>;
type InvoiceEditDraft = {
    invoiceNumber: string;
    date: string;
    customerName: string;
    customerMode: InvoiceEditCustomerMode;
    targetCustomerId: string;
    userId: string;
    amountPaid: string;
    discount: string;
    taxRate: string;
    editReason: string;
    allowReturnedLineReassignment: boolean;
    items: InvoiceItem[];
};
type InvoiceActionMenuPosition = {
    top: number;
    left: number;
    strategy: 'absolute' | 'fixed';
};
const SAVED_VIEWS_KEY = 'warekeep-report-saved-views-v2';
const MANAGER_NOTE_KEY = 'warekeep-report-manager-note-v2';
const PIE_COLORS = ['#1d4ed8', '#0f766e', '#c0841a', '#9333ea', '#475569', '#dc2626'];
const INVOICE_TABLE_PAGE_SIZES: Record<InvoiceTableVariant, number> = {
    'invoice-manager': 40,
    'sales-ledger': 80,
    'profit-studio': 80
};
const DEFAULT_INVOICE_TABLE_PAGES: Record<InvoiceTableVariant, number> = {
    'invoice-manager': 1,
    'sales-ledger': 1,
    'profit-studio': 1
};
const DEFAULT_INVOICE_MANAGER_FILTERS: InvoiceManagerFilters = {
    query: '',
    status: 'all',
    dateFrom: '',
    dateTo: ''
};
const safeParse = <T,>(value: string | null, fallback: T): T => {
    if (!value)
        return fallback;
    try {
        return JSON.parse(value) as T;
    }
    catch {
        return fallback;
    }
};
const readSavedViews = (): SavedView[] => {
    if (typeof window === 'undefined')
        return [];
    return safeParse<SavedView[]>(window.localStorage.getItem(SAVED_VIEWS_KEY), []);
};
const writeSavedViews = (views: SavedView[]) => {
    if (typeof window === 'undefined')
        return;
    window.localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
};
const readManagerNote = () => {
    if (typeof window === 'undefined')
        return '';
    return window.localStorage.getItem(MANAGER_NOTE_KEY) || '';
};
const writeManagerNote = (value: string) => {
    if (typeof window === 'undefined')
        return;
    window.localStorage.setItem(MANAGER_NOTE_KEY, value);
};
const toDateInputValue = (value: string | undefined) => {
    if (!value)
        return new Date().toISOString().slice(0, 10);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10);
};
const getInvoiceItemLineId = (invoice: Invoice, item: InvoiceItem, index: number) => (item.lineId || `${invoice.id}-line-${index + 1}`);
const getInvoiceReturnSourceIndex = (invoice: Invoice, sourceReturn: NonNullable<Invoice['returns']>[number]) => {
    const returnItem = sourceReturn.items?.[0];
    const sourceLineId = sourceReturn.sourceLineId || returnItem?.lineId;
    if (sourceLineId) {
        const lineIndex = invoice.items.findIndex((item, index) => getInvoiceItemLineId(invoice, item, index) === sourceLineId);
        if (lineIndex >= 0)
            return lineIndex;
    }
    if (typeof sourceReturn.sourceItemIndex === 'number' && sourceReturn.sourceItemIndex >= 0 && sourceReturn.sourceItemIndex < invoice.items.length) {
        return sourceReturn.sourceItemIndex;
    }
    if (!returnItem)
        return -1;
    return invoice.items.findIndex((item) => item.medicineId === returnItem.medicineId && item.batchId === returnItem.batchId);
};
const getReturnedQuantityByInvoiceLine = (invoice: Invoice): Map<number, number> => {
    const returned = new Map<number, number>();
    (invoice.returns || []).filter((entry) => !entry.isDeleted && !entry.isVoided).forEach((entry) => {
        const sourceIndex = getInvoiceReturnSourceIndex(invoice, entry);
        if (sourceIndex < 0)
            return;
        const quantity = (entry.items || []).reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
        returned.set(sourceIndex, (returned.get(sourceIndex) || 0) + quantity);
    });
    return returned;
};
const getActiveReturnCount = (invoice: Invoice) => ((invoice.returns || []).filter((entry) => !entry.isDeleted && !entry.isVoided).length);
const downloadBlob = (name: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};
const normalizeReportSearchText = (value: unknown) => normalizePersianNumbers(String(value ?? ''))
    .toLowerCase()
    .replace(/[#،,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const compactReportSearchText = (parts: unknown[]) => normalizeReportSearchText(parts.filter((part) => part !== undefined && part !== null && String(part).trim() !== '').join(' '));
const toneClass: Record<string, string> = {
    positive: 'border-emerald-200/60 bg-gradient-to-b from-emerald-50/80 to-emerald-100/50 text-emerald-900 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_4px_12px_-4px_rgba(16,185,129,0.15)] backdrop-blur-md',
    negative: 'border-rose-200/60 bg-gradient-to-b from-rose-50/80 to-rose-100/50 text-rose-900 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_4px_12px_-4px_rgba(244,63,94,0.15)] backdrop-blur-md',
    warning: 'border-amber-200/60 bg-gradient-to-b from-amber-50/80 to-amber-100/50 text-amber-900 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_4px_12px_-4px_rgba(245,158,11,0.15)] backdrop-blur-md',
    info: 'border-indigo-200/60 bg-gradient-to-b from-indigo-50/80 to-indigo-100/50 text-indigo-900 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_4px_12px_-4px_rgba(99,102,241,0.15)] backdrop-blur-md',
    neutral: 'border-slate-200/60 bg-gradient-to-b from-slate-50/80 to-slate-100/50 text-slate-900 shadow-[inset_0_1px_1px_rgba(255,255,255,0.8),0_4px_12px_-4px_rgba(15,23,42,0.06)] backdrop-blur-md'
};
const toneDotClass: Record<string, string> = {
    positive: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]',
    negative: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]',
    warning: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]',
    info: 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]',
    neutral: 'bg-slate-400 shadow-[0_0_8px_rgba(148,163,184,0.5)]'
};
const hasUntouchedHomeFilterShape = (filters: ReportFilters) => !filters.startDate &&
    !filters.endDate &&
    !filters.query &&
    (filters.userId || 'all') === 'all' &&
    (filters.customerId || 'all') === 'all' &&
    (filters.productType || 'all') === 'all' &&
    (filters.manufacturer || 'all') === 'all' &&
    (filters.supplierId || 'all') === 'all' &&
    (filters.paymentStatus || 'all') === 'all' &&
    (filters.salesMode || 'all') === 'all' &&
    (filters.warehouse || 'all') === 'all' &&
    (filters.branch || 'all') === 'all' &&
    (filters.compareWithPrevious ?? true);
// Central, locale-aware number formatter for the executive dashboard.
// The digit system follows the app-wide convention in src/lib/formatters.ts
// (resolveUiLocale): Latin digits for English, Eastern-Arabic (Dari/Persian)
// digits otherwise. Every executive number — including chart axes/legends —
// flows through this one function so the whole dashboard uses a single digit set.
const formatLocalizedNumber = (value: number, digits = 0, locale = 'fa-AF-u-nu-arabext') => new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
}).format(Number.isFinite(value) ? value : 0);
const formatInvoiceManagerMoney = (value: number, language: ReportBundle['language'], currencyCode: Currency) => formatReportMoney(Number.isFinite(value) ? value : 0, language, currencyCode);
const startOfExecutiveDay = (date: Date) => {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
};
const startOfExecutiveWeek = (date: Date) => {
    const next = startOfExecutiveDay(date);
    const day = next.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    next.setDate(next.getDate() + diff);
    return next;
};
const toExecutiveDateKey = (date: Date) => date.toISOString().slice(0, 10);
const getExecutiveBucketKey = (date: Date, granularity: ReportBundle['range']['granularity']) => {
    if (granularity === 'day')
        return toExecutiveDateKey(startOfExecutiveDay(date));
    if (granularity === 'week')
        return toExecutiveDateKey(startOfExecutiveWeek(date));
    return `${date.getFullYear()}-${date.getMonth()}`;
};
const getExecutiveBucketLabel = (date: Date, granularity: ReportBundle['range']['granularity'], language: ReportBundle['language'], bundle?: ReportBundle | null) => {
    if (granularity === 'day') {
        return formatReportDate(date.toISOString(), language, bundle);
    }
    if (granularity === 'week') {
        const weekStart = startOfExecutiveWeek(date);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        return `${formatReportDate(weekStart.toISOString(), language, bundle)} - ${formatReportDate(weekEnd.toISOString(), language, bundle)}`;
    }
    return formatAppDate(date, { language, dateTimeSettings: bundle?.dateTimeSettings } as AppSettings, 'reports', { month: 'short', year: 'numeric' });
};
const RESTRICTED_VALUE = '•••';
const ActionButton = ({ label, onClick, tone = 'default', disabled = false }: {
    label: string;
    onClick?: () => void;
    tone?: 'default' | 'primary' | 'ghost' | 'danger';
    disabled?: boolean;
}) => {
    const classes = tone === 'primary'
        ? 'border-brand-600 bg-brand-600 text-white hover:bg-brand-700 hover:border-brand-700'
        : tone === 'ghost'
            ? 'border-transparent bg-transparent text-slate-600 hover:bg-slate-100'
            : tone === 'danger'
                ? 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';
    return (<button type="button" onClick={onClick} disabled={disabled} className={`rounded-2xl border px-4 py-2.5 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${classes}`}>
      {label}
    </button>);
};
const HOME_GLASS_SHELL = 'relative overflow-hidden rounded-[28px] border border-white/60 bg-gradient-to-br from-white/90 to-white/50 shadow-[0_18px_38px_-18px_rgba(15,23,42,0.12),0_0_0_1px_rgba(255,255,255,0.72)_inset] backdrop-blur-2xl ring-1 ring-slate-100/25';
const HOME_GLASS_INSET = 'rounded-[24px] border border-white/70 bg-gradient-to-b from-white/80 to-white/40 shadow-[inset_0_2px_8px_rgba(255,255,255,0.8),0_8px_20px_-6px_rgba(0,0,0,0.04)] backdrop-blur-xl ring-1 ring-slate-100/20';
const HOME_MUTED_BADGE = 'inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-slate-50/68 px-2.5 py-1 text-[10px] font-bold tracking-wide text-slate-600 shadow-[inset_0_1px_2px_rgba(255,255,255,0.74)] backdrop-blur-md';
const HOME_PROFIT_MIX_BADGE = 'inline-flex min-w-[42px] shrink-0 items-center justify-center rounded-full border border-white/60 bg-slate-50/68 px-2.5 py-1 text-[10.5px] font-bold leading-4 tracking-normal text-slate-600 shadow-[inset_0_1px_2px_rgba(255,255,255,0.74)] backdrop-blur-md tabular-nums';
const HOME_PANEL_KICKER = 'inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/80 px-3 py-1 text-[10px] font-black tracking-wide text-slate-600 shadow-[inset_0_1px_2px_rgba(255,255,255,0.82)] backdrop-blur-xl';
const GlassActionButton = ({ label, onClick, tone = 'default', disabled = false, className = '', ariaLabel }: {
    label: string;
    onClick?: () => void;
    tone?: 'default' | 'primary' | 'ghost' | 'danger';
    disabled?: boolean;
    className?: string;
    ariaLabel?: string;
}) => {
    const classes = tone === 'primary'
        ? 'border-white/40 bg-gradient-to-r from-brand-500 to-indigo-500 text-white shadow-[0_12px_24px_-8px_rgba(var(--wk-color-brand-500),0.4),inset_0_1px_1px_rgba(255,255,255,0.4)] hover:brightness-110 hover:-translate-y-0.5'
        : tone === 'ghost'
            ? 'border-white/50 bg-white/60 text-slate-700 shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05),inset_0_1px_1px_rgba(255,255,255,0.8)] hover:bg-white/90 hover:-translate-y-0.5'
            : tone === 'danger'
                ? 'border-white/40 bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-[0_12px_24px_-8px_rgba(244,63,94,0.4),inset_0_1px_1px_rgba(255,255,255,0.4)] hover:brightness-110 hover:-translate-y-0.5'
                : 'border-white/60 bg-white/80 text-slate-800 shadow-[0_8px_16px_-6px_rgba(0,0,0,0.06),inset_0_1px_1px_rgba(255,255,255,0.9)] hover:bg-white hover:-translate-y-0.5';
    return (<button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel} className={`rounded-2xl border px-4 py-2.5 text-sm font-black transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 backdrop-blur-xl ${classes} ${className}`}>
      {label}
    </button>);
};
const Surface = ({ children, className = '' }: {
    children: React.ReactNode;
    className?: string;
}) => (<div className={`rounded-[30px] border border-white/80 bg-gradient-to-b from-white/90 to-white/60 shadow-[0_18px_48px_-24px_rgba(15,23,42,0.12),inset_0_2px_4px_rgba(255,255,255,0.9)] backdrop-blur-2xl ring-1 ring-slate-100/40 ${className}`}>{children}</div>);
const FieldLabel = ({ children }: {
    children: React.ReactNode;
}) => (<span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{children}</span>);
const FilterSelect = ({ label, value, onChange, options, disabled = false, compact = false }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<{
        value: string;
        label: string;
        disabled?: boolean;
    }>;
    disabled?: boolean;
    compact?: boolean;
}) => (<label className="block">
    <FieldLabel>{label}</FieldLabel>
    <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={`mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:ring-2 focus:ring-brand-200 disabled:bg-slate-50 disabled:text-slate-400 ${compact ? 'h-10' : 'h-11'}`}>
      {options.map((option) => (<option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>))}
    </select>
  </label>);
const EmptyPanel = ({ title, description, actionLabel, onAction }: {
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
}) => (<div className={`${HOME_GLASS_SHELL} px-4 py-6 text-center`}>
    <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/80 bg-white/78 text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.94)] backdrop-blur-sm">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="8"/>
          <path d="M12 8v5"/>
          <path d="M12 16h.01"/>
        </svg>
      </span>
      <p className="mt-3 text-base font-black text-slate-900">{title}</p>
      <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">{description}</p>
    </div>
    {actionLabel && onAction ? (<div className="mt-4">
        <GlassActionButton label={actionLabel} onClick={onAction} tone="primary"/>
      </div>) : null}
  </div>);
const LoadingSkeleton = () => (<div className="space-y-4">
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr),228px]">
      <div className="space-y-2.5">
        <div className="h-8 w-32 animate-pulse rounded-full bg-white/70"/>
        <div className="h-10 max-w-[420px] animate-pulse rounded-[22px] bg-white/72"/>
        <div className="h-7 w-64 animate-pulse rounded-full bg-white/62"/>
      </div>
      <div className={`h-[52px] animate-pulse ${HOME_GLASS_SHELL}`}/>
    </div>
    <div className={`h-[58px] animate-pulse ${HOME_GLASS_SHELL}`}/>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (<div key={index} className={`h-28 animate-pulse ${HOME_GLASS_SHELL}`}/>))}
    </div>
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr,0.95fr]">
      <div className={`h-56 animate-pulse ${HOME_GLASS_SHELL}`}/>
      <div className={`h-64 animate-pulse ${HOME_GLASS_SHELL}`}/>
    </div>
    <div className={`h-[280px] animate-pulse ${HOME_GLASS_SHELL}`}/>
  </div>);
const DrawerModal = ({ isOpen, onClose, title, children, footer }: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
}) => (<Modal isOpen={isOpen} onClose={onClose} title={title} footer={footer} maxWidthClassName="max-w-[760px]" panelClassName="h-full rounded-none bg-white/70 backdrop-blur-2xl shadow-[0_40px_100px_-40px_rgba(30,41,59,0.7)] sm:rounded-l-[30px]" headerClassName="flex items-center justify-between border-b border-white/50 bg-white/40 px-6 py-5" bodyClassName="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 bg-gradient-to-br from-white/30 to-transparent" footerClassName="border-t border-white/50 bg-white/40 p-4" overlayClassName="fixed inset-0 z-[120] flex items-stretch justify-end bg-slate-900/40 p-0 backdrop-blur-md" closeButtonClassName="rounded-full p-2 text-slate-500 transition hover:bg-white/60 hover:text-slate-800" titleClassName="text-lg font-black text-slate-800">
    {children}
  </Modal>);
const HelpButton = ({ onClick }: {
    onClick: () => void;
}) => (<button type="button" onClick={onClick} className="rounded-full border border-white/70 bg-white/80 p-1.5 text-slate-500 transition hover:bg-white hover:text-slate-700" aria-label="Metric definition">
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9.1 9a3 3 0 1 1 5.8 1c-.35 1-1.2 1.45-2 1.9-.78.43-1.4.86-1.4 1.85V14"/>
      <path d="M12 17h.01"/>
      <circle cx="12" cy="12" r="9"/>
    </svg>
  </button>);
const TrendBadge = ({ metric }: {
    metric: ReportMetricCard;
}) => {
    const direction = metric.trend === 'up' ? '↑' : metric.trend === 'down' ? '↓' : metric.trend === 'flat' ? '•' : '·';
    return (<span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${toneClass[metric.tone]}`}>
      <span>{direction}</span>
      <span>{metric.trendLabel}</span>
    </span>);
};
const KpiCard = ({ metric, onOpen, helpOpen, onHelpToggle }: {
    metric: ReportMetricCard;
    onOpen?: () => void;
    helpOpen?: boolean;
    onHelpToggle?: () => void;
}) => (<div role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined} onClick={onOpen} onKeyDown={(event) => {
        if (!onOpen)
            return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen();
        }
    }} className={`relative w-full overflow-hidden rounded-[24px] border px-4 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${toneClass[metric.tone]}`}>
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${toneDotClass[metric.tone]}`}/>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] opacity-70">{metric.label}</p>
        </div>
        <p className="mt-2 text-[22px] font-black leading-none">{metric.formattedValue}</p>
        <p className="mt-1.5 text-[11px] font-semibold opacity-80">{metric.changeLabel}</p>
      </div>
      <div className="relative z-10 flex flex-col items-end gap-2">
        {onHelpToggle ? (<div onClick={(event) => {
            event.stopPropagation();
            onHelpToggle();
        }}>
            <HelpButton onClick={onHelpToggle}/>
          </div>) : null}
        <TrendBadge metric={metric}/>
      </div>
    </div>
    {metric.note ? <p className="mt-2 text-[11px] font-semibold leading-5 opacity-70">{metric.note}</p> : null}
    {helpOpen ? (<div className="mt-3 rounded-2xl border border-current/15 bg-white/70 p-3 text-xs font-semibold leading-6">
        <p>{metric.formula}</p>
        <p className="mt-1 opacity-80">{metric.source}</p>
      </div>) : null}
  </div>);
const getTableAlignmentClass = (language: ReportBundle['language'], align: ReportTableColumn['align'] = 'start') => {
    const isEnglish = language === 'english';
    if (align === 'center')
        return 'text-center';
    if (align === 'end')
        return isEnglish ? 'text-right' : 'text-left';
    return isEnglish ? 'text-left' : 'text-right';
};
const isNumericColumn = (column: ReportTableColumn) => column.type === 'money' || column.type === 'number' || column.type === 'percent';
const formatTableValue = (bundle: ReportBundle, column: ReportTableColumn, row: ReportTable['rows'][number]) => {
    const rawValue = row[column.key];
    if (column.type === 'money')
        return formatReportMoney(Number(rawValue || 0), bundle.language, bundle.currencyCode);
    if (column.type === 'percent')
        return formatReportPercent(Number(rawValue || 0), bundle.language);
    if (column.type === 'date')
        return formatReportDate(String(rawValue || ''), bundle.language, bundle);
    return String(rawValue ?? '-');
};
const InsightCard = ({ title, description, tone, onOpen }: {
    title: string;
    description: string;
    tone: string;
    onOpen?: () => void;
}) => (<button type="button" onClick={onOpen} className={`w-full rounded-[24px] border px-4 py-3 text-left transition hover:-translate-y-0.5 ${toneClass[tone]}`}>
    <p className="text-sm font-black">{title}</p>
    <p className="mt-2 text-xs font-semibold opacity-80">{description}</p>
  </button>);
const renderGenericChart = (bundle: ReportBundle, chart: ReportChartSeries) => {
    const hasData = chart.data.length > 0;
    const showTrendGap = chart.kind === 'area' && chart.data.length < 2;
    if (!hasData || showTrendGap) {
        return (<div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
        <div>
          <p className="text-sm font-black text-slate-800">{chart.emptyTitle}</p>
          <p className="mt-2 text-xs font-semibold text-slate-500">{showTrendGap ? chart.suggestion || chart.emptyDescription : chart.emptyDescription}</p>
        </div>
      </div>);
    }
    if (chart.kind === 'area') {
        return (<ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chart.data} margin={{ top: 16, right: 16, bottom: 10, left: 8 }}>
          <defs>
            <linearGradient id={`${chart.id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.24}/>
              <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.04}/>
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false}/>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} tickMargin={8} tickLine={false} axisLine={false}/>
          <YAxis tick={{ fontSize: 10 }} tickMargin={8} tickLine={false} axisLine={false}/>
          <Tooltip formatter={(value: number) => formatReportMoney(Number(value), bundle.language, bundle.currencyCode)}/>
          <Area type="monotone" dataKey="value" isAnimationActive={false} stroke="#1d4ed8" strokeWidth={3} fillOpacity={1} fill={`url(#${chart.id}-fill)`}/>
        </AreaChart>
      </ResponsiveContainer>);
    }
    if (chart.kind === 'waterfall') {
        const data = chart.data.map((point) => {
            const start = Number(point.secondaryValue || 0);
            const end = Number(point.tertiaryValue ?? point.value);
            return {
                ...point,
                start,
                end,
                offset: Math.min(start, end),
                span: Math.abs(end - start)
            };
        });
        const values = data.flatMap((point) => [point.start, point.end]);
        const minValue = Math.min(0, ...values);
        const maxValue = Math.max(0, ...values);
        const padding = Math.max((maxValue - minValue) * 0.08, 1);
        const toneToColor = (tone?: string, fallbackId?: string) => {
            if (fallbackId === 'netSales')
                return '#3b82f6';
            if (fallbackId === 'cogs')
                return '#f59e0b';
            if (fallbackId === 'grossProfit')
                return '#10b981';
            if (fallbackId === 'expenses')
                return '#fb7185';
            if (tone === 'positive')
                return '#10b981';
            if (tone === 'negative')
                return '#f43f5e';
            if (tone === 'warning')
                return '#f59e0b';
            return '#3b82f6';
        };
        return (<ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 12, right: 12, bottom: 12, left: 8 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" horizontal={false}/>
          <XAxis type="number" domain={[minValue - padding, maxValue + padding]} tick={{ fontSize: 10 }} tickFormatter={(value) => formatReportMoney(Number(value), bundle.language, bundle.currencyCode)} tickLine={false} axisLine={false}/>
          <YAxis dataKey="label" type="category" width={110} tick={{ fontSize: 11, fill: '#475569', fontWeight: 700 }} tickLine={false} axisLine={false}/>
          <ReferenceLine x={0} stroke="#cbd5e1" strokeDasharray="4 4"/>
          <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length)
                    return null;
                const point = payload[0]?.payload as typeof data[number] | undefined;
                if (!point)
                    return null;
                return (<div className={`${HOME_GLASS_INSET} min-w-[220px] px-4 py-3`}>
                  <p className="text-sm font-black text-slate-900">{point.label}</p>
                  <div className="mt-3 space-y-2 text-xs font-semibold text-slate-600">
                    <div className="flex items-center justify-between gap-3">
                      <span>{bundle.language === 'english' ? 'Change' : 'تغییر'}</span>
                      <span className={`font-black ${point.value >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {formatReportMoney(point.value, bundle.language, bundle.currencyCode)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>{bundle.language === 'english' ? 'From' : 'از'}</span>
                      <span className="font-black text-slate-800">{formatReportMoney(point.start, bundle.language, bundle.currencyCode)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>{bundle.language === 'english' ? 'To' : 'تا'}</span>
                      <span className="font-black text-slate-800">{formatReportMoney(point.end, bundle.language, bundle.currencyCode)}</span>
                    </div>
                  </div>
                </div>);
            }}/>
          <Bar dataKey="offset" stackId="waterfall" fill="transparent" isAnimationActive={false}/>
          <Bar dataKey="span" stackId="waterfall" isAnimationActive={false} radius={[10, 10, 10, 10]} barSize={24}>
            {data.map((point) => (<Cell key={point.id} fill={toneToColor(point.tone, point.id)}/>))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>);
    }
    if (chart.kind === 'donut') {
        return (<ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Pie data={chart.data} dataKey="value" nameKey="label" isAnimationActive={false} innerRadius={60} outerRadius={90} paddingAngle={3}>
            {chart.data.map((entry, index) => (<Cell key={entry.id} fill={PIE_COLORS[index % PIE_COLORS.length]}/>))}
          </Pie>
          <Tooltip formatter={(value: number) => formatReportMoney(Number(value), bundle.language, bundle.currencyCode)}/>
        </PieChart>
      </ResponsiveContainer>);
    }
    return (<ResponsiveContainer width="100%" height="100%">
      <BarChart data={chart.data} margin={{ top: 16, right: 14, bottom: 10, left: 8 }}>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false}/>
        <XAxis dataKey="label" tick={{ fontSize: 10 }} tickMargin={8} tickLine={false} axisLine={false}/>
        <YAxis tick={{ fontSize: 10 }} tickMargin={8} tickLine={false} axisLine={false}/>
        <Tooltip formatter={(value: number) => formatReportMoney(Number(value), bundle.language, bundle.currencyCode)}/>
        <Bar dataKey="value" isAnimationActive={false} fill="#1d4ed8" radius={[10, 10, 0, 0]}/>
      </BarChart>
    </ResponsiveContainer>);
};
const ChartPanel = ({ bundle, chart, titleOverride }: {
    bundle: ReportBundle;
    chart: ReportChartSeries;
    titleOverride?: string;
}) => (<Surface className="p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3 pb-1">
      <div className="min-w-0">
        <h3 className="text-base font-black text-slate-900">{titleOverride || chart.title}</h3>
        <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-500">{chart.description}</p>
      </div>
    </div>
    <div className="mt-3.5 h-64 rounded-[24px] bg-white/36 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]" dir="ltr">
      {renderGenericChart(bundle, chart)}
    </div>
  </Surface>);
const OverviewFocusChart = ({ bundle, chart, labels }: {
    bundle: ReportBundle;
    chart: ReportChartSeries;
    labels: {
        sales: string;
        collected: string;
        receivable: string;
    };
}) => {
    const [mode, setMode] = useState<'value' | 'secondaryValue' | 'tertiaryValue'>('value');
    const data = chart.data;
    const hasData = data.length > 1;
    const modeLabel = mode === 'value' ? labels.sales : mode === 'secondaryValue' ? labels.collected : labels.receivable;
    return (<Surface className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 pb-1">
        <div className="min-w-0">
          <h3 className="text-base font-black text-slate-900">{chart.title}</h3>
          <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-500">{modeLabel}</p>
        </div>
        <div className="mt-0.5 inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
          {[
            { value: 'value', label: labels.sales },
            { value: 'secondaryValue', label: labels.collected },
            { value: 'tertiaryValue', label: labels.receivable }
        ].map((option) => (<button key={option.value} type="button" onClick={() => setMode(option.value as 'value' | 'secondaryValue' | 'tertiaryValue')} className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${mode === option.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {option.label}
            </button>))}
        </div>
      </div>
      <div className="mt-3.5 h-64 rounded-[24px] bg-white/36 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]" dir="ltr">
        {!hasData ? (<div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
            <div>
              <p className="text-sm font-black text-slate-800">{chart.emptyTitle}</p>
              <p className="mt-2 text-xs font-semibold text-slate-500">{chart.suggestion || chart.emptyDescription}</p>
            </div>
          </div>) : (<ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 16, right: 16, bottom: 10, left: 8 }}>
              <defs>
                <linearGradient id={`${chart.id}-${mode}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.24}/>
                  <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.04}/>
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false}/>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} tickMargin={8} tickLine={false} axisLine={false}/>
              <YAxis tick={{ fontSize: 10 }} tickMargin={8} tickLine={false} axisLine={false}/>
              <Tooltip formatter={(value: number) => formatReportMoney(Number(value), bundle.language, bundle.currencyCode)}/>
              <Area type="monotone" dataKey={mode} stroke="#1d4ed8" strokeWidth={3} fillOpacity={1} fill={`url(#${chart.id}-${mode})`}/>
            </AreaChart>
          </ResponsiveContainer>)}
      </div>
    </Surface>);
};
const CompactAttentionTable = ({ bundle, table, onRowOpen }: {
    bundle: ReportBundle;
    table: ReportTable;
    onRowOpen?: (tableId: string) => void;
}) => (<Surface className="overflow-hidden">
    <div className="border-b border-white/50 px-4 py-4 bg-white/30 backdrop-blur-md">
      <h3 className="text-base font-black text-slate-900">{table.title}</h3>
      <p className="mt-1 text-xs font-semibold text-slate-500">{table.description}</p>
    </div>
    {table.rows.length ? (<div className="wk-table-scroll--compact overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white/60 backdrop-blur-md border-b border-white/50">
            <tr>
              {table.columns.map((column) => (<th key={column.key} className={`px-4 py-3 text-xs font-black text-slate-500 ${getTableAlignmentClass(bundle.language, column.align)}`}>
                  {column.label}
                </th>))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/60 bg-white/40 backdrop-blur-sm">
            {table.rows.slice(0, 8).map((row) => {
            const sourceTableId = typeof row.sourceTableId === 'string' ? row.sourceTableId : '';
            return (<tr key={row.id} className={sourceTableId ? 'cursor-pointer transition duration-300 hover:bg-white/80' : ''} onClick={() => {
                    if (sourceTableId)
                        onRowOpen?.(sourceTableId);
                }}>
                  {table.columns.map((column) => (<td key={`${row.id}-${column.key}`} className={`px-4 py-3 text-[13px] font-semibold text-slate-700 ${getTableAlignmentClass(bundle.language, column.align)} ${isNumericColumn(column) ? 'tabular-nums whitespace-nowrap' : ''}`}>
                      <span className={!isNumericColumn(column) ? 'block max-w-[220px] truncate' : undefined} title={String(row[column.key] ?? '-')}>
                        {formatTableValue(bundle, column, row)}
                      </span>
                    </td>))}
                </tr>);
        })}
          </tbody>
        </table>
      </div>) : (<div className="px-4 py-8 text-center text-sm font-semibold text-slate-600">{table.emptyDescription}</div>)}
    <div className="border-t border-slate-100 px-4 py-3 text-xs font-semibold text-slate-500">
      {bundle.language === 'english' ? 'Showing up to 8 items' : 'حداکثر ۸ مورد نمایش داده می‌شود'}
    </div>
  </Surface>);
const DataTable = ({ bundle, table, onRowClick, titleAction, pageSize = 8, searchPlaceholder }: {
    bundle: ReportBundle;
    table: ReportTable;
    onRowClick?: (row: ReportTable['rows'][number]) => void;
    titleAction?: React.ReactNode;
    pageSize?: number;
    searchPlaceholder?: string;
}) => {
    const [query, setQuery] = useState('');
    const [sortKey, setSortKey] = useState(table.columns[0]?.key || 'id');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [page, setPage] = useState(1);
    const deferredQuery = useDeferredValue(query);
    const filteredRows = useMemo(() => {
        const normalized = deferredQuery.trim().toLowerCase();
        const rows = !normalized
            ? [...table.rows]
            : table.rows.filter((row) => Object.values(row).some((value) => String(value || '').toLowerCase().includes(normalized)));
        rows.sort((left, right) => {
            const a = left[sortKey];
            const b = right[sortKey];
            const aNumber = Number(a);
            const bNumber = Number(b);
            const isNumeric = Number.isFinite(aNumber) && Number.isFinite(bNumber);
            const result = isNumeric
                ? aNumber - bNumber
                : String(a || '').localeCompare(String(b || ''), bundle.language === 'english' ? 'en' : 'fa');
            return sortDir === 'asc' ? result : -result;
        });
        return rows;
    }, [bundle.language, deferredQuery, sortDir, sortKey, table.rows]);
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
    useEffect(() => {
        setPage(1);
    }, [deferredQuery, sortDir, sortKey, table.id]);
    return (<Surface className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/50 px-4 py-4 bg-white/30 backdrop-blur-md">
        <div>
          <h3 className="text-base font-black text-slate-900">{table.title}</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">{table.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder || (bundle.language === 'english' ? 'Search table...' : 'جستجو در جدول...')} className="h-10 rounded-2xl border border-white/60 bg-white/70 backdrop-blur-sm px-3.5 text-sm font-semibold text-slate-800 outline-hidden focus:border-brand-400 focus:ring-2 focus:ring-brand-200 transition-all duration-300 hover:bg-white/90"/>
          {titleAction}
        </div>
      </div>
      <div className="wk-table-scroll overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white/60 backdrop-blur-md border-b border-white/50">
            <tr>
              {table.columns.map((column) => (<th key={column.key} className={`px-4 py-3 font-black text-slate-500 ${getTableAlignmentClass(bundle.language, column.align)}`}>
                  <button type="button" onClick={() => {
                if (sortKey === column.key)
                    setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
                else {
                    setSortKey(column.key);
                    setSortDir('desc');
                }
            }}>
                    {column.label}
                  </button>
                </th>))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/60 bg-white/40 backdrop-blur-sm">
            {pagedRows.length ? (pagedRows.map((row) => (<tr key={row.id} className={onRowClick ? 'cursor-pointer transition duration-300 hover:bg-white/80' : ''} onClick={() => onRowClick?.(row)}>
                  {table.columns.map((column) => (<td key={`${row.id}-${column.key}`} className={`px-4 py-3 text-[13px] font-semibold text-slate-700 ${getTableAlignmentClass(bundle.language, column.align)} ${isNumericColumn(column) ? 'tabular-nums whitespace-nowrap' : ''}`}>
                      <span className={!isNumericColumn(column) ? 'block max-w-[220px] truncate' : undefined} title={String(row[column.key] ?? '-')}>
                        {formatTableValue(bundle, column, row)}
                      </span>
                    </td>))}
                </tr>))) : (<tr>
                <td colSpan={table.columns.length} className="px-4 py-8 text-center text-sm font-semibold text-slate-600">
                  {table.emptyDescription}
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <span className="text-xs font-semibold text-slate-500">
          {bundle.language === 'english' ? 'Rows' : 'رکوردها'}: {filteredRows.length}
        </span>
        <div className="flex items-center gap-2">
          <ActionButton label={bundle.language === 'english' ? 'Prev' : 'قبلی'} onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}/>
          <span className="text-xs font-black text-slate-700">
            {page}/{totalPages}
          </span>
          <ActionButton label={bundle.language === 'english' ? 'Next' : 'بعدی'} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}/>
        </div>
      </div>
    </Surface>);
};
const ClassicMetricCard = ({ title, value, note, theme, icon, onClick, actionHint, kicker, ctaLabel, isEnglish = false }: {
    title: string;
    value: string;
    note?: string;
    theme: 'blue' | 'green' | 'rose' | 'violet';
    icon: React.ReactNode;
    onClick?: () => void;
    actionHint?: string;
    kicker?: string;
    ctaLabel?: string;
    isEnglish?: boolean;
}) => {
    const themeConfig = theme === 'blue'
        ? {
            surface: 'from-white/84 via-brand-50/62 to-cyan-50/78',
            stripe: 'from-brand-300/45 via-blue-300/35 to-cyan-300/40',
            blob: 'bg-brand-200/30',
            value: 'text-slate-900',
            accent: 'text-brand-700',
            icon: 'border-brand-100/80 bg-brand-50/74 text-brand-700',
            pill: 'border-brand-100/70 bg-brand-50/72 text-brand-700',
            ctaSurface: 'from-brand-50/82 to-cyan-50/76'
        }
        : theme === 'green'
            ? {
                surface: 'from-white/84 via-emerald-50/68 to-cyan-50/74',
                stripe: 'from-emerald-300/45 via-green-300/35 to-cyan-300/40',
                blob: 'bg-emerald-200/30',
                value: 'text-emerald-700',
                accent: 'text-emerald-700',
                icon: 'border-emerald-100/80 bg-emerald-50/72 text-emerald-700',
                pill: 'border-emerald-100/70 bg-emerald-50/72 text-emerald-700',
                ctaSurface: 'from-emerald-50/82 to-cyan-50/76'
            }
            : theme === 'rose'
                ? {
                    surface: 'from-white/84 via-rose-50/68 to-pink-50/78',
                    stripe: 'from-rose-300/42 via-pink-300/35 to-orange-300/38',
                    blob: 'bg-rose-200/32',
                    value: 'text-rose-700',
                    accent: 'text-rose-700',
                    icon: 'border-rose-100/80 bg-rose-50/72 text-rose-700',
                    pill: 'border-rose-100/70 bg-rose-50/72 text-rose-700',
                    ctaSurface: 'from-rose-50/82 to-pink-50/76'
                }
                : {
                    surface: 'from-white/84 via-violet-50/68 to-fuchsia-50/78',
                    stripe: 'from-violet-300/45 via-fuchsia-300/35 to-brand-300/38',
                    blob: 'bg-violet-200/32',
                    value: 'text-violet-700',
                    accent: 'text-violet-700',
                    icon: 'border-violet-100/80 bg-violet-50/72 text-violet-700',
                    pill: 'border-violet-100/70 bg-violet-50/72 text-violet-700',
                    ctaSurface: 'from-violet-50/82 to-fuchsia-50/76'
                };
    return (<div role={onClick ? 'button' : undefined} aria-label={onClick ? title : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={(event) => {
            if (!onClick)
                return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
            }
        }} data-testid="reports-home-kpi-card" className={`${HOME_GLASS_SHELL} wk-reports-kpi-card ${theme === 'rose' ? 'wk-reports-kpi-card--expense' : ''} min-h-[158px] bg-gradient-to-br ${themeConfig.surface} px-3.5 py-3 text-slate-800 sm:min-h-[160px] xl:min-h-[158px] [overflow:visible] ${onClick ? 'group cursor-pointer transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-26px_rgba(15,23,42,0.38)] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50' : ''}`} dir={isEnglish ? 'ltr' : 'rtl'}>
      <div className={`pointer-events-none absolute inset-x-4 top-1 h-px rounded-full bg-gradient-to-r opacity-75 ${themeConfig.stripe}`}/>
      <div className="relative grid h-full min-h-[134px] grid-rows-[32px_minmax(66px,1fr)_28px] gap-1 text-start">
        <div data-testid="reports-home-kpi-top-row" className="flex h-8 items-start justify-between gap-2">
          <div data-testid="reports-home-kpi-icon" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] border shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] backdrop-blur-md [&_svg]:h-[18px] [&_svg]:w-[18px] ${themeConfig.icon}`}>
            {icon}
          </div>
          <div data-testid="reports-home-kpi-tabs" className="flex min-h-[30px] min-w-0 flex-1 items-start justify-start overflow-hidden">
            {kicker ? <span className={`${HOME_PANEL_KICKER} px-2 py-0.5 text-center text-[9px] leading-[14px]`}>{kicker}</span> : null}
          </div>
        </div>
        <div data-testid="reports-home-kpi-body" className="grid min-h-[66px] min-w-0 content-start grid-rows-[17px_31px_minmax(16px,auto)] text-start">
          <p data-testid="reports-home-kpi-label" className="text-[12px] font-black leading-[17px] text-slate-700">{title}</p>
          <p data-testid="reports-home-kpi-value" dir="ltr" className={`self-start break-words ${isEnglish ? 'text-left' : 'text-right'} text-[26px] font-[850] leading-[1.12] tracking-normal tabular-nums [font-feature-settings:'tnum'_1,'lnum'_1] [font-variant-numeric:tabular-nums_lining-nums] md:text-[28px] ${themeConfig.value}`}>
            {value}
          </p>
          {note ? (<span data-testid="reports-home-kpi-note" className={`mt-0.5 inline-flex max-w-full self-start whitespace-normal rounded-full border px-2 py-0.5 text-start text-[9px] font-bold leading-[15px] shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] backdrop-blur-md ${themeConfig.pill}`}>
              {note}
            </span>) : null}
        </div>
        {onClick ? (<div data-testid="reports-home-kpi-action" className={`relative flex h-7 w-full items-center justify-between self-end rounded-[12px] border border-white/75 bg-gradient-to-r px-2.5 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] backdrop-blur-md ${themeConfig.ctaSurface}`}>
            <span className="min-w-0 flex-1 whitespace-normal text-start text-[10px] font-black leading-[15px] text-slate-600">{ctaLabel || actionHint}</span>
            <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/75 bg-white/72 transition ${themeConfig.accent} group-hover:translate-x-0.5`}>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M7 12h10"/>
                <path d="m13 8 4 4-4 4"/>
              </svg>
            </span>
          </div>) : (<div className="h-7 w-full self-end"/>)}
      </div>
    </div>);
};
const StatusBadge = ({ label, tone = 'neutral' }: {
    label: string;
    tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
}) => {
    const toneClassName = tone === 'info'
        ? 'border-brand-200/60 bg-gradient-to-b from-brand-50/80 to-brand-100/50 text-brand-700 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
        : tone === 'success'
            ? 'border-emerald-200/60 bg-gradient-to-b from-emerald-50/80 to-emerald-100/50 text-emerald-700 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
            : tone === 'warning'
                ? 'border-amber-200/60 bg-gradient-to-b from-amber-50/80 to-amber-100/50 text-amber-700 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
                : tone === 'danger'
                    ? 'border-rose-200/60 bg-gradient-to-b from-rose-50/80 to-rose-100/50 text-rose-700 shadow-[0_0_12px_rgba(244,63,94,0.15)]'
                    : 'border-slate-200/60 bg-gradient-to-b from-slate-50/80 to-slate-100/50 text-slate-700 shadow-[0_0_12px_rgba(15,23,42,0.06)]';
    return (<span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black shadow-[inset_0_2px_4px_rgba(255,255,255,1)] backdrop-blur-xl ${toneClassName}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-90 shadow-[0_0_4px_currentColor]"/>
      {label}
    </span>);
};
const ClassicStatusCard = ({ title, note, value, tone, statusLabel }: {
    title: string;
    note?: string;
    value: string;
    tone: 'red' | 'orange' | 'amber';
    statusLabel: string;
}) => {
    const toneConfig = tone === 'red'
        ? {
            bar: 'from-rose-500 to-pink-500 shadow-[0_0_16px_rgba(244,63,94,0.6)]',
            text: 'text-rose-800 drop-shadow-sm',
            surface: 'from-white/90 via-rose-50/80 to-rose-100/60',
            blob: 'bg-rose-400/20',
            badge: 'danger' as const
        }
        : tone === 'orange'
            ? {
                bar: 'from-orange-500 to-amber-400 shadow-[0_0_16px_rgba(249,115,22,0.6)]',
                text: 'text-orange-800 drop-shadow-sm',
                surface: 'from-white/90 via-orange-50/80 to-amber-100/60',
                blob: 'bg-orange-400/20',
                badge: 'warning' as const
            }
            : {
                bar: 'from-amber-500 to-yellow-400 shadow-[0_0_16px_rgba(245,158,11,0.6)]',
                text: 'text-amber-800 drop-shadow-sm',
                surface: 'from-white/90 via-amber-50/80 to-yellow-100/60',
                blob: 'bg-amber-400/20',
                badge: 'warning' as const
            };
    return (<div className={`${HOME_GLASS_SHELL} bg-gradient-to-br ${toneConfig.surface} hover:scale-[1.02] transition-transform duration-500`}>
      <div className={`pointer-events-none absolute inset-y-0 right-0 w-2.5 bg-gradient-to-b opacity-80 ${toneConfig.bar}`}/>
      <div className="relative flex min-h-[134px] flex-col justify-between gap-3 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <StatusBadge label={statusLabel} tone={toneConfig.badge}/>
          <span className="inline-flex min-w-[48px] justify-center rounded-full border border-white/80 bg-white/76 px-3 py-1 text-base font-black text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-md">
            {value}
          </span>
        </div>
        <div className="text-right">
          <p className={`text-[21px] font-black leading-tight ${toneConfig.text}`}>{title}</p>
          {note ? <p className="mt-2 text-[13px] font-bold leading-5 text-slate-600">{note}</p> : null}
        </div>
      </div>
    </div>);
};
const ClassicPanel = ({ title, accentClass, children, className = '', subtitle, headerMeta, eyebrow, compactChartSpacing = false }: {
    title: string;
    accentClass: string;
    children: React.ReactNode;
    className?: string;
    subtitle?: string;
    headerMeta?: React.ReactNode;
    eyebrow?: string;
    compactChartSpacing?: boolean;
}) => {
    const headerSpacingClass = compactChartSpacing ? 'gap-x-3 gap-y-1.5 px-4 py-3' : 'gap-x-4 gap-y-2 px-4 py-3.5';
    const titleSpacingClass = compactChartSpacing ? 'mt-1' : 'mt-1.5';
    const subtitleSpacingClass = compactChartSpacing ? 'mt-1 text-[12px] font-bold leading-[18px] text-slate-600' : 'mt-1.5 text-[12px] font-bold leading-[19px] text-slate-600';
    const bodySpacingClass = compactChartSpacing ? 'px-4 pb-3.5 pt-2.5' : 'px-4 pb-4 pt-3';
    return (<div className={`${HOME_GLASS_SHELL} ${className}`}>
      <div data-testid="reports-home-panel-header" className={`relative flex flex-wrap items-start justify-between border-b border-white/38 bg-gradient-to-r from-white/58 to-white/40 backdrop-blur-md ${headerSpacingClass}`}>
        <div className="min-w-0 flex-1 text-right">
          {eyebrow ? <span className={HOME_PANEL_KICKER}>{eyebrow}</span> : null}
          <h3 className={`${titleSpacingClass} text-[18px] font-black leading-snug tracking-tight text-slate-800 md:text-[20px]`}>{title}</h3>
          {/* #7: dropped the 0.88 opacity and darkened to slate-600 so subtitles
clear the WCAG AA 4.5:1 contrast ratio on the light panel background. */}
          {subtitle ? <p className={subtitleSpacingClass}>{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-start justify-end gap-2.5">
          {headerMeta}
          <span className={`mt-0.5 h-8 w-1.5 rounded-full shadow-[0_0_14px_rgba(255,255,255,0.58),inset_0_1px_3px_rgba(255,255,255,0.55)] backdrop-blur-md ${accentClass}`}/>
        </div>
      </div>
      <div data-testid="reports-home-panel-body" className={`relative z-10 ${bodySpacingClass}`}>{children}</div>
    </div>);
};
const ClassicEmptyState = ({ text, compact = false }: {
    text: string;
    compact?: boolean;
}) => (<div data-density={compact ? 'compact' : 'default'} className={`${HOME_GLASS_INSET} flex h-full items-center justify-center text-center bg-white/30 backdrop-blur-xl border border-white/50 shadow-[inset_0_2px_12px_rgba(255,255,255,0.7)] ${compact ? 'px-2 py-1.5 sm:px-2.5' : 'px-6 py-10'}`}>
    <div className={compact ? 'space-y-1' : 'space-y-4'}>
      <div className="flex justify-center">
        <span className={`inline-flex items-center justify-center border border-white/60 bg-gradient-to-br from-white/90 to-white/70 text-slate-400 shadow-[0_8px_16px_-6px_rgba(0,0,0,0.05),inset_0_2px_4px_rgba(255,255,255,1)] backdrop-blur-2xl ${compact ? 'h-7 w-7 rounded-lg' : 'h-14 w-14 rounded-3xl'}`}>
          <svg viewBox="0 0 24 24" className={`${compact ? 'h-3.5 w-3.5' : 'h-6 w-6'} opacity-60`} fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </span>
      </div>
      <p className={`max-w-md font-semibold text-slate-500 ${compact ? 'text-[12px] leading-[18px]' : 'text-[15px] leading-6'}`}>{text}</p>
    </div>
  </div>);
const GlassTableShell = ({ children, variant = 'glass', className = '' }: {
    children: React.ReactNode;
    variant?: 'glass' | 'flat';
    className?: string;
}) => (<div className={`${variant === 'flat'
        ? 'overflow-hidden rounded-[24px] border border-white/80 bg-white/72 p-2 shadow-[0_24px_70px_-46px_rgba(15,23,42,0.48),inset_0_1px_0_rgba(255,255,255,0.98)] ring-1 ring-slate-900/[0.04] backdrop-blur-2xl'
        : `${HOME_GLASS_INSET} overflow-hidden p-2.5`} ${className}`}>
    {children}
  </div>);
const GlassMetricSummary = ({ label, value, tone = 'default' }: {
    label: string;
    value: string;
    tone?: 'default' | 'brand' | 'success' | 'danger';
}) => {
    const toneClassName = tone === 'brand'
        ? 'text-brand-700 border-brand-200/50 bg-gradient-to-br from-brand-50/80 to-brand-100/40 shadow-[0_8px_16px_-6px_rgba(59,130,246,0.2),inset_0_2px_4px_rgba(255,255,255,0.9)]'
        : tone === 'success'
            ? 'text-emerald-700 border-emerald-200/50 bg-gradient-to-br from-emerald-50/80 to-emerald-100/40 shadow-[0_8px_16px_-6px_rgba(16,185,129,0.2),inset_0_2px_4px_rgba(255,255,255,0.9)]'
            : tone === 'danger'
                ? 'text-rose-700 border-rose-200/50 bg-gradient-to-br from-rose-50/80 to-rose-100/40 shadow-[0_8px_16px_-6px_rgba(244,63,94,0.2),inset_0_2px_4px_rgba(255,255,255,0.9)]'
                : 'text-slate-800 border-white/60 bg-gradient-to-br from-white/90 to-white/50 shadow-[0_8px_16px_-6px_rgba(15,23,42,0.08),inset_0_2px_4px_rgba(255,255,255,0.9)]';
    return (<div className={`${HOME_GLASS_INSET} px-6 py-5 hover:scale-[1.02] transition-transform duration-500 rounded-3xl`}>
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-3 inline-flex rounded-2xl border px-5 py-2.5 text-3xl font-black backdrop-blur-xl ${toneClassName}`}>
        {value}
      </p>
    </div>);
};
const StatCard = ({ label, value, meta, tone = 'default', icon = 'invoice' }: {
    label: string;
    value: string;
    meta?: string;
    tone?: 'default' | 'brand' | 'success' | 'danger';
    icon?: 'invoice' | 'wallet' | 'alert';
}) => {
    const toneClassName = tone === 'brand'
        ? 'border-brand-100/90 bg-gradient-to-br from-white via-brand-50/70 to-brand-100/50 text-brand-700 ring-brand-100/70'
        : tone === 'success'
            ? 'border-emerald-100/90 bg-gradient-to-br from-white via-emerald-50/70 to-emerald-100/50 text-emerald-700 ring-emerald-100/70'
            : tone === 'danger'
                ? 'border-rose-100/90 bg-gradient-to-br from-white via-rose-50/65 to-rose-100/45 text-rose-700 ring-rose-100/70'
                : 'border-slate-200/80 bg-gradient-to-br from-white via-slate-50/80 to-blue-50/45 text-slate-900 ring-slate-100/80';
    const dotClassName = tone === 'brand'
        ? 'bg-brand-500'
        : tone === 'success'
            ? 'bg-emerald-500'
            : tone === 'danger'
                ? 'bg-rose-500'
                : 'bg-slate-400';
    const iconSurfaceClassName = tone === 'brand'
        ? 'bg-brand-600 text-white shadow-brand-500/30'
        : tone === 'success'
            ? 'bg-emerald-500 text-white shadow-emerald-500/30'
            : tone === 'danger'
                ? 'bg-rose-500 text-white shadow-rose-500/30'
                : 'bg-slate-900 text-white shadow-slate-500/25';
    const metricIcon = icon === 'wallet' ? (<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M4.5 7.25h13.25A1.75 1.75 0 0 1 19.5 9v8A1.75 1.75 0 0 1 17.75 18.75H4.5A2.25 2.25 0 0 1 2.25 16.5v-10A2.25 2.25 0 0 1 4.5 4.25h11" strokeLinecap="round"/>
      <path d="M15.25 11h4.25v4h-4.25a2 2 0 1 1 0-4Z"/>
    </svg>) : icon === 'alert' ? (<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M12 3.25a3.1 3.1 0 0 0-3.1 3.1v.9a5.8 5.8 0 0 1-1.5 3.9l-1.65 1.8a1.7 1.7 0 0 0 1.25 2.85h10a1.7 1.7 0 0 0 1.25-2.85l-1.65-1.8a5.8 5.8 0 0 1-1.5-3.9v-.9A3.1 3.1 0 0 0 12 3.25Z"/>
      <path d="M10 18.25a2.2 2.2 0 0 0 4 0" strokeLinecap="round"/>
    </svg>) : (<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M6.25 3.25h8.1l3.4 3.4v13.1a1 1 0 0 1-1 1H6.25a1 1 0 0 1-1-1V4.25a1 1 0 0 1 1-1Z"/>
      <path d="M14 3.5v3.75h3.5M8.5 11h6.5M8.5 14.5h6.5M8.5 18h3.25" strokeLinecap="round"/>
    </svg>);
    return (<div className={`group relative min-h-[96px] min-w-0 overflow-hidden rounded-[22px] border px-4 py-3.5 shadow-[0_24px_58px_-42px_rgba(15,23,42,0.45),inset_0_1px_0_rgba(255,255,255,0.98)] ring-1 backdrop-blur-2xl transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_28px_64px_-40px_rgba(15,23,42,0.5)] ${toneClassName}`} aria-label={`${label}: ${value}`}>
      <span className={`absolute -bottom-12 -left-10 h-28 w-28 rounded-full opacity-[0.08] ${dotClassName}`} aria-hidden="true"/>
      <span className="pointer-events-none absolute inset-x-4 top-0 h-px bg-white" aria-hidden="true"/>
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 pt-0.5">
          <p className="truncate text-[11px] font-black text-slate-500" title={label}>{label}</p>
          <p className="mt-1.5 truncate text-[21px] font-black leading-tight tracking-normal tabular-nums md:text-[23px]" title={value}>{value}</p>
          {meta ? <p className="mt-1 truncate text-[10px] font-black uppercase tracking-[0.1em] text-slate-400" title={meta}>{meta}</p> : null}
        </div>
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] shadow-lg transition duration-300 group-hover:scale-105 ${iconSurfaceClassName}`}>
          {metricIcon}
        </span>
      </div>
    </div>);
};
const InvoiceStatusBadge = ({ label, status, detail }: {
    label: string;
    status: Invoice['paymentStatus'];
    detail?: string;
}) => {
    const toneClassName = status === 'paid' || status === 'cash' || status === 'card'
        ? 'border-emerald-200/80 bg-emerald-50/95 text-emerald-700'
        : status === 'partial' || status === 'mixed'
            ? 'border-amber-200/80 bg-amber-50/95 text-amber-700'
            : 'border-rose-200/80 bg-rose-50/95 text-rose-700';
    return (<span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ${toneClassName}`} title={detail ? `${label} - ${detail}` : label} aria-label={detail ? `${label} - ${detail}` : label}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden="true"/>
      {label}
    </span>);
};
const InvoiceActionIcon = ({ name }: {
    name: 'view' | 'edit' | 'delete' | 'transfer';
}) => {
    if (name === 'edit') {
        return (<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
        <path d="M4.75 19.25h4.5L18.6 9.9a2.35 2.35 0 0 0-3.32-3.32L5.93 15.93l-1.18 3.32Z"/>
        <path d="m13.8 8.05 2.15 2.15"/>
      </svg>);
    }
    if (name === 'delete') {
        return (<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
        <path d="M5.5 7.25h13"/>
        <path d="M9.25 7.25V5.7a1.2 1.2 0 0 1 1.2-1.2h3.1a1.2 1.2 0 0 1 1.2 1.2v1.55"/>
        <path d="m8.1 10.25.45 7.3a1.7 1.7 0 0 0 1.7 1.6h3.5a1.7 1.7 0 0 0 1.7-1.6l.45-7.3"/>
      </svg>);
    }
    if (name === 'transfer') {
        return (<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
        <path d="M6.5 8.25h10.75l-2.7-2.7" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M17.5 15.75H6.75l2.7 2.7" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>);
    }
    return (<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
      <path d="M3.75 12s3-5.25 8.25-5.25S20.25 12 20.25 12s-3 5.25-8.25 5.25S3.75 12 3.75 12Z"/>
      <circle cx="12" cy="12" r="2.4"/>
    </svg>);
};
const InvoiceMenuItem = ({ label, ariaLabel, icon, tone = 'neutral', onClick }: {
    label: string;
    ariaLabel: string;
    icon: 'view' | 'edit' | 'delete' | 'transfer';
    tone?: 'neutral' | 'primary' | 'danger';
    onClick: () => void;
}) => {
    const toneClassName = tone === 'primary'
        ? 'text-brand-700 hover:bg-brand-50'
        : tone === 'danger'
            ? 'text-rose-700 hover:bg-rose-50'
            : 'text-slate-700 hover:bg-slate-50';
    return (<button type="button" role="menuitem" aria-label={ariaLabel} onClick={onClick} className={`flex h-9 w-full items-center justify-start gap-2 rounded-xl px-3 text-right text-xs font-black transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300/60 ${toneClassName}`}>
      <InvoiceActionIcon name={icon}/>
      <span>{label}</span>
    </button>);
};
const InvoiceRowActionMenu = ({ menuKey, invoiceLabel, isOpen, canEdit, canDelete, canTransfer, labels, onToggle, onClose, onView, onEdit, onDelete, onTransfer }: {
    menuKey: string;
    invoiceLabel: string;
    isOpen: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canTransfer?: boolean;
    labels: {
        actions: string;
        view: string;
        edit: string;
        delete: string;
        transfer?: string;
    };
    onToggle: () => void;
    onClose: () => void;
    onView: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onTransfer?: () => void;
}) => {
    const menuId = `invoice-actions-${menuKey.replace(/[^a-zA-Z0-9_-]/g, '') || 'row'}`;
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const menuFrameRef = useRef<number | null>(null);
    const [menuPosition, setMenuPosition] = useState<InvoiceActionMenuPosition | null>(null);
    const actionCount = 1 + (canEdit ? 1 : 0) + (canTransfer ? 1 : 0) + (canDelete ? 1 : 0);
    const closeAfter = (handler: () => void) => {
        onClose();
        handler();
    };
    useLayoutEffect(() => {
        if (!isOpen) {
            setMenuPosition(null);
            return;
        }
        const commitMenuPosition = (nextPosition: InvoiceActionMenuPosition) => {
            setMenuPosition((current) => {
                if (current &&
                    current.strategy === nextPosition.strategy &&
                    Math.abs(current.top - nextPosition.top) < 1 &&
                    Math.abs(current.left - nextPosition.left) < 1) {
                    return current;
                }
                return nextPosition;
            });
        };
        const updatePosition = () => {
            const trigger = buttonRef.current;
            if (!trigger)
                return;
            const rect = trigger.getBoundingClientRect();
            const modalPanel = trigger.closest('.wk-invoice-manager-modal-panel') as HTMLElement | null;
            const panelRect = modalPanel?.getBoundingClientRect();
            const menuWidth = 156;
            const menuHeight = 18 + actionCount * 36;
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 768;
            const gap = 8;
            const panelGap = 12;
            if (panelRect) {
                const panelWidth = panelRect.width || viewportWidth;
                const panelHeight = panelRect.height || viewportHeight;
                const relativeTop = rect.top - panelRect.top;
                const relativeBottom = rect.bottom - panelRect.top;
                const relativeLeft = rect.left - panelRect.left;
                const relativeRight = rect.right - panelRect.left;
                const top = relativeBottom + menuHeight + gap > panelHeight && relativeTop > menuHeight + gap
                    ? relativeTop - menuHeight - gap
                    : relativeBottom + gap;
                const maxTop = Math.max(panelGap, panelHeight - menuHeight - panelGap);
                const minLeft = panelGap;
                const maxLeft = Math.max(minLeft, panelWidth - menuWidth - panelGap);
                const preferredLeft = relativeRight - menuWidth;
                const inwardLeft = Math.min(relativeLeft, maxLeft);
                const left = Math.min(Math.max(preferredLeft < minLeft ? inwardLeft : preferredLeft, minLeft), maxLeft);
                commitMenuPosition({
                    strategy: 'absolute',
                    top: Math.min(Math.max(panelGap, top), maxTop),
                    left
                });
                return;
            }
            const top = rect.bottom + menuHeight + gap > viewportHeight && rect.top > menuHeight + gap
                ? rect.top - menuHeight - gap
                : rect.bottom + gap;
            const maxTop = Math.max(gap, viewportHeight - menuHeight - gap);
            const minLeft = gap;
            const maxLeft = viewportWidth - menuWidth - gap;
            const preferredLeft = rect.right - menuWidth;
            const inwardLeft = Math.min(rect.left, maxLeft);
            const left = Math.min(Math.max(preferredLeft < minLeft ? inwardLeft : preferredLeft, minLeft), Math.max(minLeft, maxLeft));
            commitMenuPosition({
                strategy: 'fixed',
                top: Math.min(Math.max(gap, top), maxTop),
                left
            });
        };
        const schedulePositionUpdate = (event?: Event) => {
            const target = event?.target;
            const tableScrollFrame = buttonRef.current?.closest('.wk-invoice-manager-scroll-frame');
            if (tableScrollFrame && target instanceof Node && tableScrollFrame.contains(target)) {
                onClose();
                return;
            }
            if (menuFrameRef.current !== null)
                return;
            menuFrameRef.current = window.requestAnimationFrame(() => {
                menuFrameRef.current = null;
                updatePosition();
            });
        };
        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', schedulePositionUpdate, { capture: true, passive: true });
        return () => {
            if (menuFrameRef.current !== null) {
                window.cancelAnimationFrame(menuFrameRef.current);
                menuFrameRef.current = null;
            }
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', schedulePositionUpdate, true);
        };
    }, [actionCount, canDelete, canEdit, canTransfer, isOpen, onClose]);
    const menuNode = isOpen ? (<div id={menuId} ref={menuRef} role="menu" style={menuPosition
            ? { top: menuPosition.top, left: menuPosition.left, visibility: 'visible' }
            : { top: 0, left: 0, visibility: 'hidden', pointerEvents: 'none' }} data-testid={`invoice-actions-menu-${menuKey}`} className={`${menuPosition?.strategy === 'absolute' ? 'absolute' : 'fixed'} z-[220] min-w-[156px] rounded-2xl border border-slate-200 bg-white p-2 text-right shadow-[0_28px_64px_-22px_rgba(15,23,42,0.55)] ring-1 ring-slate-900/5`}>
      <InvoiceMenuItem label={labels.view} ariaLabel={`${labels.view} ${invoiceLabel}`} icon="view" onClick={() => closeAfter(onView)}/>
      {canEdit ? (<InvoiceMenuItem label={labels.edit} ariaLabel={`${labels.edit} ${invoiceLabel}`} icon="edit" tone="primary" onClick={() => closeAfter(onEdit)}/>) : null}
      {canTransfer && onTransfer ? (<InvoiceMenuItem label={labels.transfer || 'Transfer'} ariaLabel={`${labels.transfer || 'Transfer'} ${invoiceLabel}`} icon="transfer" tone="primary" onClick={() => closeAfter(onTransfer)}/>) : null}
      {canDelete ? (<InvoiceMenuItem label={labels.delete} ariaLabel={`${labels.delete} ${invoiceLabel}`} icon="delete" tone="danger" onClick={() => closeAfter(onDelete)}/>) : null}
    </div>) : null;
    return (<div className="relative inline-flex justify-center" onBlur={(event) => {
            const nextTarget = event.relatedTarget;
            if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget))
                return;
            if (nextTarget instanceof Node && menuRef.current?.contains(nextTarget))
                return;
            onClose();
        }} onKeyDown={(event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
            }
        }}>
      <button type="button" ref={buttonRef} aria-haspopup="menu" aria-expanded={isOpen} aria-controls={isOpen ? menuId : undefined} aria-label={`${labels.actions} ${invoiceLabel}`} onClick={onToggle} className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300/60 ${isOpen ? 'border-brand-200 text-brand-700 ring-2 ring-brand-100' : 'border-slate-200'}`}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <circle cx="5.75" cy="12" r="1.65"/>
          <circle cx="12" cy="12" r="1.65"/>
          <circle cx="18.25" cy="12" r="1.65"/>
        </svg>
      </button>
      {menuNode && typeof document !== 'undefined' ? createPortal(menuNode, (buttonRef.current?.closest('.wk-invoice-manager-modal-panel') as HTMLElement | null) || document.body) : null}
    </div>);
};
const InvoiceFilterBar = ({ query, status, dateFrom, dateTo, statusOptions, resultLabel, hasActiveFilters, labels, onQueryChange, onStatusChange, onDateFromChange, onDateToChange, onReset }: {
    query: string;
    status: HomeSearchPaymentStatus;
    dateFrom: string;
    dateTo: string;
    statusOptions: Array<{
        value: string;
        label: string;
    }>;
    resultLabel: string;
    hasActiveFilters: boolean;
    labels: {
        filters: string;
        search: string;
        searchPlaceholder: string;
        status: string;
        from: string;
        to: string;
        reset: string;
    };
    onQueryChange: (value: string) => void;
    onStatusChange: (value: HomeSearchPaymentStatus) => void;
    onDateFromChange: (value: string) => void;
    onDateToChange: (value: string) => void;
    onReset: () => void;
}) => {
    const activeFilterItems = [
        query.trim() ? `${labels.search}: ${query.trim()}` : null,
        status !== 'all' ? `${labels.status}: ${statusOptions.find((option) => option.value === status)?.label || status}` : null,
        dateFrom ? `${labels.from}: ${dateFrom}` : null,
        dateTo ? `${labels.to}: ${dateTo}` : null
    ].filter(Boolean) as string[];
    return (<section className="wk-invoice-manager-filter-bar relative overflow-hidden rounded-[22px] border border-white/80 bg-white/72 px-3.5 py-3 shadow-[0_24px_64px_-44px_rgba(15,23,42,0.48),inset_0_1px_0_rgba(255,255,255,0.98)] ring-1 ring-slate-900/[0.04] backdrop-blur-2xl" aria-label={labels.filters}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-[0_12px_24px_-14px_rgba(15,23,42,0.9)]" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round"/>
            </svg>
          </span>
          <p className="text-xs font-black text-slate-900">{labels.filters}</p>
          <span className="rounded-full border border-brand-100/90 bg-brand-50/80 px-2.5 py-1 text-[11px] font-black text-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]">{resultLabel}</span>
          {activeFilterItems.length ? (<div className="flex flex-wrap gap-1.5">
              {activeFilterItems.map((item) => (<span key={item} className="max-w-full truncate rounded-full border border-brand-100/90 bg-brand-50/78 px-2 py-0.5 text-[10px] font-black text-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]" title={item}>
                  {item}
                </span>))}
            </div>) : null}
        </div>
        <button type="button" onClick={onReset} disabled={!hasActiveFilters} className="relative h-8 rounded-xl border border-slate-200/80 bg-white/82 px-3 text-[11px] font-black text-slate-700 shadow-sm transition hover:border-brand-200 hover:bg-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300/60 disabled:cursor-not-allowed disabled:bg-slate-50/70 disabled:text-slate-400 disabled:shadow-none">
          {labels.reset}
        </button>
      </div>
      <div className="relative grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(300px,1fr)_190px_160px_160px]">
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] font-black text-slate-500">{labels.search}</span>
          <span className="relative block">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="5.75"/>
              <path d="m15 15 4.25 4.25" strokeLinecap="round"/>
            </svg>
            <input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={labels.searchPlaceholder} aria-label={labels.search} dir="auto" className="h-11 w-full rounded-[14px] border border-slate-200/80 bg-white/90 py-0 pl-3 pr-10 text-sm font-bold text-slate-800 shadow-[0_10px_28px_-24px_rgba(15,23,42,0.6),inset_0_1px_0_rgba(255,255,255,1)] outline-hidden transition placeholder:text-slate-400 hover:border-brand-200 hover:bg-white focus:border-brand-300 focus:bg-white focus:ring-4 focus:ring-brand-100/80"/>
          </span>
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] font-black text-slate-500">{labels.status}</span>
          <select value={status} onChange={(event) => onStatusChange(event.target.value as HomeSearchPaymentStatus)} aria-label={labels.status} className="h-11 w-full rounded-[14px] border border-slate-200/80 bg-white/90 px-3 text-xs font-black text-slate-700 shadow-[0_10px_28px_-24px_rgba(15,23,42,0.6),inset_0_1px_0_rgba(255,255,255,1)] outline-hidden transition hover:border-brand-200 hover:bg-white focus:border-brand-300 focus:bg-white focus:ring-4 focus:ring-brand-100/80">
            {statusOptions.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
          </select>
        </label>
        <label className="min-w-0">
          <span className="mb-1 flex items-center justify-between gap-2 text-[10px] font-black text-slate-500">
            <span>{labels.from}</span>
            <span dir="ltr" className="font-bold text-slate-300">YYYY-MM-DD</span>
          </span>
          <input type="text" inputMode="numeric" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" aria-label={labels.from} title="YYYY-MM-DD" dir="ltr" lang="en-CA" className="wk-date-input h-11 w-full rounded-[14px] border border-slate-200/80 bg-white/90 px-3 text-left text-xs font-black text-slate-700 shadow-[0_10px_28px_-24px_rgba(15,23,42,0.6),inset_0_1px_0_rgba(255,255,255,1)] outline-hidden transition hover:border-brand-200 hover:bg-white focus:border-brand-300 focus:bg-white focus:ring-4 focus:ring-brand-100/80"/>
        </label>
        <label className="min-w-0">
          <span className="mb-1 flex items-center justify-between gap-2 text-[10px] font-black text-slate-500">
            <span>{labels.to}</span>
            <span dir="ltr" className="font-bold text-slate-300">YYYY-MM-DD</span>
          </span>
          <input type="text" inputMode="numeric" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" aria-label={labels.to} title="YYYY-MM-DD" dir="ltr" lang="en-CA" className="wk-date-input h-11 w-full rounded-[14px] border border-slate-200/80 bg-white/90 px-3 text-left text-xs font-black text-slate-700 shadow-[0_10px_28px_-24px_rgba(15,23,42,0.6),inset_0_1px_0_rgba(255,255,255,1)] outline-hidden transition hover:border-brand-200 hover:bg-white focus:border-brand-300 focus:bg-white focus:ring-4 focus:ring-brand-100/80"/>
        </label>
      </div>
    </section>);
};
const PaginationControls = ({ summaryLabel, pageLabel, previousLabel, nextLabel, currentPage, totalPages, onPrevious, onNext, testId }: {
    summaryLabel: string;
    pageLabel: string;
    previousLabel: string;
    nextLabel: string;
    currentPage: number;
    totalPages: number;
    onPrevious: () => void;
    onNext: () => void;
    testId: string;
}) => (<div className="mb-2 flex min-h-[46px] flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/85 bg-white/78 px-3 py-2 text-xs font-black text-slate-600 shadow-[0_16px_38px_-34px_rgba(15,23,42,0.55),inset_0_1px_0_rgba(255,255,255,1)]">
    <span>{summaryLabel}</span>
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-brand-100 bg-brand-50/80 px-2.5 py-1 text-[11px] font-black text-brand-700">{pageLabel}</span>
      {totalPages > 1 ? (<div data-testid={testId} className="flex flex-wrap items-center gap-1.5" dir="ltr">
          <button type="button" onClick={onPrevious} disabled={currentPage <= 1} className="h-8 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-700 shadow-sm transition hover:border-brand-200 hover:text-brand-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300/60 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300 disabled:shadow-none">
            {previousLabel}
          </button>
          <button type="button" onClick={onNext} disabled={currentPage >= totalPages} className="h-8 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-700 shadow-sm transition hover:border-brand-200 hover:text-brand-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300/60 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300 disabled:shadow-none">
            {nextLabel}
          </button>
        </div>) : null}
    </div>
  </div>);
const InvoiceManagerScrollFrame = ({ testId, className, header, contentDir, children }: {
    testId: string;
    className: string;
    header?: React.ReactNode;
    contentDir?: 'ltr' | 'rtl';
    children: React.ReactNode;
}) => (<div className="relative flex min-h-0 flex-1 flex-col">
    {header ? <div className="wk-invoice-manager-pagination shrink-0">{header}</div> : null}
    <div data-testid={testId} dir="ltr" className={`${className} wk-invoice-manager-scroll-frame`}>
      <div dir={contentDir} className="min-w-full">
        {children}
      </div>
    </div>
  </div>);
const BulkActionBar = ({ selectedLabel, deleteLabel, closeLabel, canDelete, selectedCount, selectedCountLabel, onDelete, onClose }: {
    selectedLabel: string;
    deleteLabel: string;
    closeLabel: string;
    canDelete: boolean;
    selectedCount: number;
    selectedCountLabel: string;
    onDelete: () => void;
    onClose: () => void;
}) => {
    const hasSelection = selectedCount > 0;
    return (<div className={`sticky bottom-2 z-40 mt-4 rounded-2xl border px-3 py-2.5 transition ${hasSelection ? 'border-rose-200 bg-white shadow-[0_-22px_48px_-30px_rgba(225,29,72,0.52),0_16px_40px_-34px_rgba(15,23,42,0.55)]' : 'border-slate-200 bg-white shadow-[0_-22px_48px_-34px_rgba(15,23,42,0.42),0_14px_36px_-34px_rgba(15,23,42,0.42)]'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span aria-live="polite" className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${hasSelection ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
          {selectedLabel}: {selectedCountLabel}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {canDelete ? (<button type="button" onClick={onDelete} disabled={!hasSelection} className={`h-10 rounded-xl border px-4 text-xs font-black transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-300/70 disabled:cursor-not-allowed disabled:opacity-60 ${hasSelection ? 'border-rose-200 bg-rose-600 text-white shadow-[0_14px_28px_-18px_rgba(225,29,72,0.7)] hover:bg-rose-700' : 'border-slate-200 bg-slate-100 text-slate-400 shadow-none'}`}>
              {deleteLabel}
            </button>) : null}
          <button type="button" onClick={onClose} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300/60">
            {closeLabel}
          </button>
        </div>
      </div>
    </div>);
};
const InvoiceManagerEmptyState = ({ title, description, actionLabel, onAction }: {
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
}) => (<div className="rounded-2xl border border-dashed border-slate-200 bg-white/86 px-5 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M5 6.75h14"/>
        <path d="M5 12h14"/>
        <path d="M5 17.25h8"/>
      </svg>
    </div>
    <p className="mt-3 text-sm font-black text-slate-900">{title}</p>
    <p className="mx-auto mt-1 max-w-md text-xs font-semibold leading-6 text-slate-500">{description}</p>
    {actionLabel && onAction ? (<button type="button" onClick={onAction} className="mt-4 h-10 rounded-xl border border-brand-100 bg-brand-50 px-4 text-xs font-black text-brand-700 transition hover:border-brand-200 hover:bg-brand-100/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300/60">
        {actionLabel}
      </button>) : null}
  </div>);
const GlassCategoryBreakdown = ({ items, emptyText, numberLocale, categoryIcons }: {
    items: Array<{
        label: string;
        value: number;
    }>;
    emptyText: string;
    numberLocale: string;
    categoryIcons?: Record<string, CategoryIconMeta>;
}) => {
    const total = items.reduce((sum, item) => sum + item.value, 0);
    if (!items.length) {
        return <ClassicEmptyState text={emptyText}/>;
    }
    return (<div className="space-y-4">
      {items.map((item, index) => {
            const width = total > 0 ? Math.max(8, (item.value / total) * 100) : 0;
            const iconMeta = resolveCategoryIconMeta(categoryIcons, item.label);
            const tone = index % 3 === 0
                ? 'from-brand-500 to-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.5)]'
                : index % 3 === 1
                    ? 'from-emerald-400 to-teal-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]'
                    : 'from-rose-400 to-pink-500 shadow-[0_0_12px_rgba(251,113,133,0.5)]';
            return (<div key={item.label} className={`${HOME_GLASS_INSET} px-5 py-4 transition-all duration-300 hover:-translate-y-0.5`}>
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-black text-slate-800">
                <CategoryIconChip icon={iconMeta.icon} color={iconMeta.color} size="sm"/>
                {item.label}
              </p>
              <span className={HOME_MUTED_BADGE}>{formatLocalizedNumber(item.value, 0, numberLocale)}</span>
            </div>
            <div className="mt-3.5 h-2.5 overflow-hidden rounded-full bg-slate-200/50 shadow-inner backdrop-blur-sm">
              <div className={`h-2.5 rounded-full bg-gradient-to-r ${tone}`} style={{ width: `${width}%` }}/>
            </div>
          </div>);
        })}
    </div>);
};
const ExecutiveFinanceHeroChart = ({ data, emptyText, labels, numberLocale }: {
    data: ExecutiveFinancePoint[];
    emptyText: string;
    labels: {
        grossSales: string;
        collected: string;
        grossProfit: string;
        invoiceCount: string;
    };
    numberLocale: string;
}) => {
    if (!data.length) {
        return <ClassicEmptyState text={emptyText}/>;
    }
    const totalInvoices = data.reduce((sum, point) => sum + point.invoiceCount, 0);
    const chartHeightClass = data.length === 1 ? 'min-h-[238px]' : 'min-h-[232px]';
    return (<div className="flex h-full min-h-0 flex-col">
      <div className="wk-reports-finance-legend mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          <span className={`${HOME_MUTED_BADGE} gap-2`}>
            <span className="h-2.5 w-2.5 rounded-full bg-brand-500"/>
            {labels.grossSales}
          </span>
          <span className={`${HOME_MUTED_BADGE} gap-2`}>
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-500"/>
            {labels.collected}
          </span>
          <span className={`${HOME_MUTED_BADGE} gap-2`}>
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"/>
            {labels.grossProfit}
          </span>
        </div>
        <span className={HOME_MUTED_BADGE}>
          {labels.invoiceCount}: {formatLocalizedNumber(totalInvoices, 0, numberLocale)}
        </span>
      </div>
      <div className={`relative min-h-0 flex-1 overflow-hidden rounded-[28px] border border-white/75 bg-white/36 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl sm:p-3.5 ${chartHeightClass}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
            <defs>
              <linearGradient id="executive-hero-bar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.95}/>
                <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.78}/>
              </linearGradient>
              <linearGradient id="executive-hero-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.26}/>
                <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.03}/>
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#d8e2ee" strokeDasharray="4 8" vertical={false}/>
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b', fontWeight: 700 }} tickMargin={10} tickLine={false} axisLine={false} minTickGap={28}/>
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value) => formatLocalizedNumber(Number(value), 0, numberLocale)} tickMargin={8} tickLine={false} axisLine={false} width={68}/>
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.22)' }} content={({ active, label, payload }) => {
            if (!active || !payload?.length)
                return null;
            const point = payload[0]?.payload as ExecutiveFinancePoint | undefined;
            if (!point)
                return null;
            return (<div className={`${HOME_GLASS_INSET} min-w-[220px] px-4 py-3`}>
                    <p className="text-sm font-black text-slate-900">{label}</p>
                    <div className="mt-3 space-y-2 text-xs font-semibold text-slate-600">
                      <div className="flex items-center justify-between gap-3">
                        <span>{labels.grossSales}</span>
                        <span className="font-black text-slate-900">{formatLocalizedNumber(point.grossSales, 0, numberLocale)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>{labels.collected}</span>
                        <span className="font-black text-cyan-700">{formatLocalizedNumber(point.collected, 0, numberLocale)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>{labels.grossProfit}</span>
                        <span className="font-black text-emerald-700">{formatLocalizedNumber(point.grossProfit, 0, numberLocale)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>{labels.invoiceCount}</span>
                        <span className="font-black text-slate-800">{formatLocalizedNumber(point.invoiceCount, 0, numberLocale)}</span>
                      </div>
                    </div>
                  </div>);
        }}/>
            <Bar dataKey="grossSales" isAnimationActive={false} fill="url(#executive-hero-bar)" radius={[16, 16, 8, 8]} barSize={data.length === 1 ? 82 : 34}/>
            <Area type="monotone" dataKey="collected" isAnimationActive={false} stroke="#06b6d4" strokeWidth={2.5} fill="url(#executive-hero-area)" fillOpacity={1} dot={{ r: 0 }} activeDot={{ r: 5, strokeWidth: 3, stroke: '#06b6d4', fill: '#ffffff' }}/>
            <Line type="monotone" dataKey="grossProfit" isAnimationActive={false} stroke="#10b981" strokeWidth={3} dot={{ r: 4.5, strokeWidth: 3, stroke: '#10b981', fill: '#ffffff' }} activeDot={{ r: 6, strokeWidth: 3, stroke: '#10b981', fill: '#ffffff' }}/>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>);
};
const ExecutiveProfitMixDonut = ({ segments, netAmount, margin, baseAmount, emptyText, labels, numberLocale }: {
    segments: ProfitMixSegment[];
    netAmount: number;
    margin: number;
    baseAmount: number;
    emptyText: string;
    labels: {
        netSales: string;
        profit: string;
        loss: string;
    };
    numberLocale: string;
}) => {
    if (!segments.length) {
        return <ClassicEmptyState text={emptyText}/>;
    }
    const centerLabel = netAmount >= 0 ? labels.profit : labels.loss;
    const centerToneClass = netAmount >= 0 ? 'text-emerald-700' : 'text-rose-700';
    const marginLabel = `${margin > 0 ? '+' : margin < 0 ? '-' : ''}${formatLocalizedNumber(Math.abs(margin), 1, numberLocale)}%`;
    return (<div className="wk-reports-profit-layout grid h-full grid-cols-1 gap-4 overflow-visible py-1 max-[559px]:gap-2.5 max-[559px]:py-0.5 min-[560px]:grid-cols-[154px,minmax(0,1fr)] min-[560px]:items-center min-[560px]:gap-4 md:grid-cols-[178px,minmax(0,1fr)] lg:grid-cols-[178px,minmax(0,1fr)] lg:gap-4 lg:py-1 xl:grid-cols-[136px,minmax(0,1fr)] xl:gap-3 2xl:grid-cols-[180px,minmax(0,1fr)] 2xl:gap-4">
      <div className="wk-reports-profit-donut relative h-[240px] max-[559px]:h-[132px] min-[560px]:h-[204px] md:h-[214px] lg:h-[214px] xl:h-[184px] 2xl:h-[218px]">
        <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.42),transparent_62%)]"/>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className={`${HOME_GLASS_INSET} flex h-[112px] w-[112px] flex-col items-center justify-center rounded-full bg-white/76 text-center max-[559px]:h-[76px] max-[559px]:w-[76px] min-[560px]:h-[92px] min-[560px]:w-[92px] md:h-[100px] md:w-[100px] lg:h-[100px] lg:w-[100px] xl:h-[84px] xl:w-[84px] 2xl:h-[104px] 2xl:w-[104px]`}>
            <span className={`max-w-[86%] text-center text-[11px] font-black uppercase leading-none tracking-[0.14em] max-[559px]:text-[9px] max-[559px]:tracking-[0.1em] min-[560px]:text-[10px] lg:text-[11px] lg:tracking-[0.14em] xl:text-[9.5px] xl:tracking-[0.1em] 2xl:text-[11px] 2xl:tracking-[0.14em] ${centerToneClass}`}>{centerLabel}</span>
            <span className="mt-1 text-xl font-black leading-tight text-slate-900 tabular-nums max-[559px]:text-base min-[560px]:text-lg lg:text-xl xl:text-base 2xl:text-xl">{formatLocalizedNumber(Math.abs(netAmount), 0, numberLocale)}</span>
            <span className="mt-0.5 text-xs font-bold leading-none text-slate-500 tabular-nums max-[559px]:text-[10px] min-[560px]:text-[11px] lg:text-xs xl:text-[10px] 2xl:text-xs">{marginLabel}</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
            <Pie data={segments} dataKey="value" nameKey="label" isAnimationActive={false} innerRadius="54%" outerRadius="76%" paddingAngle={4} stroke="#ffffff" strokeWidth={3}>
              {segments.map((segment) => (<Cell key={segment.id} fill={segment.color}/>))}
            </Pie>
            <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length)
                return null;
            const segment = payload[0]?.payload as ProfitMixSegment | undefined;
            if (!segment)
                return null;
            return (<div className={`${HOME_GLASS_INSET} px-4 py-3 min-w-[max-content]`}>
                    <p className="text-sm font-black text-slate-900 whitespace-nowrap">{segment.label}</p>
                    <p className="mt-2 text-base font-black text-slate-800">{formatLocalizedNumber(segment.value, 0, numberLocale)}</p>
                  </div>);
        }}/>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="wk-reports-profit-labels space-y-3 max-[559px]:space-y-2 min-[560px]:space-y-2.5 lg:space-y-3 xl:space-y-2.5 2xl:space-y-3">
        {/* #1: value badges use shrink-0 + whitespace-nowrap so the full number is
            never compressed or truncated; labels wrap instead of clipping on
            narrow chart columns. */}
        <div className={`${HOME_GLASS_INSET} flex min-h-[48px] items-center justify-between gap-3.5 px-4 py-3 max-[559px]:min-h-[44px] max-[559px]:px-3 max-[559px]:py-2 min-[560px]:px-3 min-[560px]:py-2.5 lg:px-4 lg:py-3 xl:px-3 xl:py-2.5 2xl:px-4 2xl:py-3`}>
          <p className="min-w-0 flex-1 break-words text-sm font-extrabold leading-[18px] text-slate-700 max-[559px]:text-[12px] max-[559px]:leading-4 min-[560px]:text-[13px] lg:text-sm xl:text-[13px] 2xl:text-sm">{labels.netSales}</p>
          <span className={`${HOME_PROFIT_MIX_BADGE}`}>{formatLocalizedNumber(baseAmount, 0, numberLocale)}</span>
        </div>
        {segments.map((segment) => (<div key={segment.id} className={`${HOME_GLASS_INSET} relative min-h-[48px] overflow-hidden px-4 py-3 max-[559px]:min-h-[44px] max-[559px]:px-3 max-[559px]:py-2 min-[560px]:px-3 min-[560px]:py-2.5 lg:px-4 lg:py-3 xl:px-3 xl:py-2.5 2xl:px-4 2xl:py-3`}>
            <div className="relative flex min-h-[25px] items-center justify-between gap-3.5">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="h-3 w-3 shrink-0 rounded-full shadow-[0_0_0_4px_rgba(255,255,255,0.62)]" style={{ backgroundColor: segment.color }}/>
                <p className="min-w-0 break-words text-sm font-extrabold leading-[18px] text-slate-700 max-[559px]:text-[12px] max-[559px]:leading-4 min-[560px]:text-[13px] lg:text-sm xl:text-[13px] 2xl:text-sm">{segment.label}</p>
              </div>
              <span className={`${HOME_PROFIT_MIX_BADGE} ${segment.badgeClass}`}>{formatLocalizedNumber(segment.value, 0, numberLocale)}</span>
            </div>
          </div>))}
      </div>
    </div>);
};
const ExecutiveProductsChart = ({ chart, emptyText, numberLocale }: {
    chart: ReportChartSeries | null;
    emptyText: string;
    numberLocale: string;
}) => {
    const data = (chart?.data || []).slice(0, 5);
    if (!data.length) {
        return <ClassicEmptyState text={emptyText}/>;
    }
    return (<ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 18, right: 18, bottom: 16, left: 12 }}>
        <CartesianGrid stroke="#edf2f7" strokeDasharray="4 4" horizontal={false}/>
        <XAxis type="number" hide/>
        <YAxis dataKey="label" type="category" width={110} tick={{ fontSize: 13, fill: '#475569', fontWeight: 700 }} tickMargin={8} tickLine={false} axisLine={false}/>
        <Tooltip formatter={(value: number) => formatLocalizedNumber(Number(value), 0, numberLocale)} contentStyle={{ borderRadius: '16px', border: '1px solid #e5e7eb', boxShadow: '0 16px 40px -28px rgba(15,23,42,0.45)' }}/>
        <Bar dataKey="value" isAnimationActive={false} fill="#18b77a" radius={[0, 10, 10, 0]} barSize={26}/>
      </BarChart>
    </ResponsiveContainer>);
};
export const ReportsDashboard: React.FC<ReportsDashboardProps> = ({ mode = 'advanced', invoices, medicines, customers = [], expenses = [], purchases = [], suppliers = [], settings, activeAppUser, onNavigate, onDeleteInvoices, canDeleteInvoices = false, onUpdateInvoice, canEditInvoices = false, onTransferInvoiceSeller, canTransferInvoiceSeller = false, onAddExpense, onUpdateExpense, onDeleteExpense, canManageExpenses = false, requestedFinancialOverlay, onRequestedFinancialOverlayApplied }) => {
    const language = settings?.language || 'dari';
    const isEnglish = language === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    // #4: single source of truth for the dashboard's digit system. Resolves to
    // Latin (en-US) for English and Eastern-Arabic (Dari) digits otherwise, so
    // every executive figure — KPI cards, charts, tables, legends — is uniform.
    const numberLocale = resolveUiLocale(language);
    const formatExecutiveNumber = (value: number, digits = 0) => formatLocalizedNumber(value, digits, numberLocale);
    const [homeSuggestedPreset, setHomeSuggestedPreset] = useState<ReportPreset>(() => (mode === 'home' ? 'thisMonth' : 'thisYear'));
    useEffect(() => {
        if (mode !== 'home') {
            setHomeSuggestedPreset((current) => (current === 'thisYear' ? current : 'thisYear'));
            return;
        }
        let cancelled = false;
        const finishSuggestedPreset = startPerformanceSpan('report-home-preset', {
            invoiceCount: invoices.length,
            medicineCount: medicines.length,
            customerCount: customers.length,
            expenseCount: expenses.length,
            purchaseCount: purchases.length
        });
        const computation = calculateSuggestedPresetAsync({
            invoices,
            medicines,
            customers,
            expenses,
            purchases,
            suppliers,
            settings,
            activeAppUser,
            language
        });
        computation.promise
            .then((preset) => {
            if (cancelled) {
                finishSuggestedPreset({ status: 'stale', usedWorker: computation.usedWorker });
                return;
            }
            setHomeSuggestedPreset(preset);
            finishSuggestedPreset({ status: 'ready', usedWorker: computation.usedWorker });
        })
            .catch(() => {
            if (cancelled) {
                finishSuggestedPreset({ status: 'stale', usedWorker: computation.usedWorker });
                return;
            }
            setHomeSuggestedPreset('thisMonth');
            finishSuggestedPreset({ status: 'fallback', usedWorker: computation.usedWorker });
        });
        return () => {
            cancelled = true;
            computation.cancel();
        };
    }, [activeAppUser, customers, expenses, invoices, language, medicines, mode, purchases, settings, suppliers]);
    const [activeTab, setActiveTab] = useState<ReportTab>('financial');
    const [filters, setFilters] = useState<ReportFilters>(() => defaultReportFilters(mode, mode === 'home' ? homeSuggestedPreset : undefined));
    const [didUserTouchFilters, setDidUserTouchFilters] = useState(false);
    const [savedViews, setSavedViews] = useState<SavedView[]>(() => readSavedViews());
    const [managerNote, setManagerNote] = useState(() => readManagerNote());
    const [reportState, setReportState] = useState<ReportState>({ status: 'loading' });
    const [refreshToken, setRefreshToken] = useState(0);
    const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
    const [activeFinancialOverlay, setActiveFinancialOverlay] = useState<FinancialOverlay | null>(null);
    const [isCompactInvoiceViewport, setIsCompactInvoiceViewport] = useState(false);
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
    const [invoiceTablePages, setInvoiceTablePages] = useState<Record<InvoiceTableVariant, number>>(DEFAULT_INVOICE_TABLE_PAGES);
    const [invoiceManagerFilters, setInvoiceManagerFilters] = useState<InvoiceManagerFilters>(DEFAULT_INVOICE_MANAGER_FILTERS);
    const [homeSearchQuery, setHomeSearchQuery] = useState('');
    const [homeSearchFilter, setHomeSearchFilter] = useState<HomeReportSearchFilter>('all');
    const [homeSearchPaymentStatus, setHomeSearchPaymentStatus] = useState<HomeSearchPaymentStatus>('all');
    const [highlightedInvoiceId, setHighlightedInvoiceId] = useState<string | null>(null);
    const [pendingDeleteAction, setPendingDeleteAction] = useState<PendingDeleteAction | null>(null);
    const [invoicePreviewId, setInvoicePreviewId] = useState<string | null>(null);
    const [invoiceEditId, setInvoiceEditId] = useState<string | null>(null);
    const [invoiceEditDraft, setInvoiceEditDraft] = useState<InvoiceEditDraft | null>(null);
    const [invoiceEditError, setInvoiceEditError] = useState<string | null>(null);
    const [openInvoiceActionMenuId, setOpenInvoiceActionMenuId] = useState<string | null>(null);
    const [sellerTransferEditorInvoiceId, setSellerTransferEditorInvoiceId] = useState<string | null>(null);
    const [isSavingInvoiceEdit, setIsSavingInvoiceEdit] = useState(false);
    const [expenseEditorState, setExpenseEditorState] = useState<{
        mode: 'add';
    } | {
        mode: 'edit';
        expenseId: string;
    } | null>(null);
    const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>({
        title: '',
        amount: '',
        category: '',
        date: new Date().toISOString().split('T')[0],
        description: ''
    });
    const [expenseFormError, setExpenseFormError] = useState<string | null>(null);
    const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
    const [isQuickExportOpen, setIsQuickExportOpen] = useState(false);
    const [isAdvancedExportOpen, setIsAdvancedExportOpen] = useState(false);
    const [exportLanguage, setExportLanguage] = useState<ReportExportLanguage>(language);
    const [exportMode, setExportMode] = useState<ReportExportMode>('detailed');
    const [exportScope, setExportScope] = useState<'currentTab' | 'fullBook'>('currentTab');
    const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
    const [helpMetricKey, setHelpMetricKey] = useState<string | null>(null);
    const [transferringSellerInvoiceId, setTransferringSellerInvoiceId] = useState<string | null>(null);
    const [detailsOpenByTab, setDetailsOpenByTab] = useState<Record<ReportTab, boolean>>({
        financial: false,
        inventory: false,
        customers: false,
        employees: false
    });
    const deferredQuery = useDeferredValue(filters.query || '');
    const deferredHomeSearchQuery = useDeferredValue(homeSearchQuery);
    const deferredInvoiceManagerQuery = useDeferredValue(invoiceManagerFilters.query);
    const canViewCustomers = !activeAppUser ||
        activeAppUser.role === 'admin' ||
        activeAppUser.permissions.includes('view_customers') ||
        activeAppUser.permissions.includes('manage_customers');
    const canViewEmployees = !activeAppUser ||
        activeAppUser.role === 'admin' ||
        activeAppUser.permissions.includes('view_payroll') ||
        activeAppUser.permissions.includes('manage_payroll');
    const canViewProfit = !activeAppUser ||
        activeAppUser.role === 'admin' ||
        activeAppUser.permissions.includes('view_profit');
    const allowedTabs = useMemo(() => {
        const tabs: ReportTab[] = ['financial', 'inventory'];
        if (canViewCustomers)
            tabs.push('customers');
        if (canViewEmployees)
            tabs.push('employees');
        return tabs;
    }, [canViewCustomers, canViewEmployees]);
    const currentTab = activeTab;
    const viewedReportSignatureRef = useRef('');
    useEffect(() => {
        if (!allowedTabs.includes(activeTab)) {
            setActiveTab(allowedTabs[0] || 'financial');
        }
    }, [activeTab, allowedTabs]);
    useEffect(() => {
        writeSavedViews(savedViews);
    }, [savedViews]);
    useEffect(() => {
        writeManagerNote(managerNote);
    }, [managerNote]);
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
            return;
        const mediaQuery = window.matchMedia('(max-width: 767px)');
        const syncCompactViewport = () => setIsCompactInvoiceViewport(mediaQuery.matches);
        syncCompactViewport();
        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', syncCompactViewport);
            return () => mediaQuery.removeEventListener('change', syncCompactViewport);
        }
        mediaQuery.addListener(syncCompactViewport);
        return () => mediaQuery.removeListener(syncCompactViewport);
    }, []);
    useEffect(() => {
        if (!requestedFinancialOverlay)
            return;
        setSelectedTableId(null);
        setOpenInvoiceActionMenuId(null);
        setSellerTransferEditorInvoiceId(null);
        setActiveFinancialOverlay(requestedFinancialOverlay);
        onRequestedFinancialOverlayApplied?.();
    }, [onRequestedFinancialOverlayApplied, requestedFinancialOverlay]);
    useEffect(() => {
        setOpenInvoiceActionMenuId(null);
        setSellerTransferEditorInvoiceId(null);
        setInvoiceTablePages((current) => (current['invoice-manager'] === 1 ? current : { ...current, 'invoice-manager': 1 }));
    }, [deferredInvoiceManagerQuery, invoiceManagerFilters.dateFrom, invoiceManagerFilters.dateTo, invoiceManagerFilters.status]);
    useEffect(() => {
        let cancelled = false;
        let computation: ReturnType<typeof calculateReportAsync> | null = null;
        setReportState((current) => ({ status: 'loading', report: current.report }));
        const timer = window.setTimeout(() => {
            const finishReportCalculation = startPerformanceSpan('report-calculation', {
                invoiceCount: invoices.length,
                medicineCount: medicines.length,
                customerCount: customers.length,
                expenseCount: expenses.length,
                purchaseCount: purchases.length
            });
            computation = calculateReportAsync({
                invoices,
                medicines,
                customers,
                expenses,
                purchases,
                suppliers,
                settings,
                activeAppUser,
                filters: { ...filters, query: deferredQuery },
                language
            });
            computation.promise
                .then((rawReport) => {
                if (cancelled) {
                    finishReportCalculation({ status: 'stale', usedWorker: computation?.usedWorker ?? false });
                    return;
                }
                const report = sanitizeReportBundleForAccess(rawReport, {
                    allowedTabs,
                    canViewProfit
                });
                setReportState({ status: 'ready', report });
                finishReportCalculation({ status: 'ready', usedWorker: computation?.usedWorker ?? false });
            })
                .catch((error) => {
                finishReportCalculation({ status: cancelled ? 'stale' : 'error', usedWorker: computation?.usedWorker ?? false });
                if (cancelled)
                    return;
                setReportState({
                    status: 'error',
                    message: error instanceof Error ? error.message : tr('Could not build the report.', 'ساخت راپور با مشکل روبه‌رو شد.')
                });
            });
        }, 160);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
            computation?.cancel();
        };
    }, [activeAppUser, allowedTabs, canViewProfit, customers, deferredQuery, expenses, filters, invoices, language, medicines, purchases, refreshToken, settings, suppliers]);
    const report = reportState.report;
    const isInitialReportLoading = reportState.status === 'loading' && !report;
    const canRenderReportContent = reportState.status !== 'error' && !!report;
    const currentSection = report?.sections[currentTab];
    const currentPrimaryTable = report && currentSection ? report.tablesById[currentSection.primaryTableId] : null;
    const selectedTable = report && selectedTableId ? report.tablesById[selectedTableId] : null;
    const customerById = useMemo(() => new Map(customers.filter((customer) => !customer.isDeleted).map((customer) => [customer.id, customer])), [customers]);
    const customerNameById = useMemo(() => new Map(Array.from(customerById.values()).map((customer) => [customer.id, customer.name || '-'])), [customerById]);
    const medicineById = useMemo(() => new Map(medicines.filter((medicine) => !medicine.isDeleted).map((medicine) => [medicine.id, medicine])), [medicines]);
    const invoiceById = useMemo(() => new Map(invoices.filter((invoice) => !invoice.isDeleted).map((invoice) => [invoice.id, invoice])), [invoices]);
    const userNameById = useMemo(() => new Map((settings?.users || [])
        .filter((user) => !user.isDeleted)
        .map((user) => [user.id, user.name])), [settings?.users]);
    const canDeleteInvoiceRows = !!onDeleteInvoices && !!canDeleteInvoices;
    const canEditInvoiceRows = !!onUpdateInvoice && !!canEditInvoices;
    const canTransferInvoiceRows = !!onTransferInvoiceSeller && !!canTransferInvoiceSeller;
    const previewInvoice = invoicePreviewId ? invoiceById.get(invoicePreviewId) || null : null;
    const previewCustomer = previewInvoice ? customerById.get(previewInvoice.customerId) || null : null;
    const editingInvoice = invoiceEditId ? invoiceById.get(invoiceEditId) || null : null;
    const canManageExpenseRows = !!onAddExpense && !!onDeleteExpense && !!canManageExpenses;
    const canEditExpenseRows = canManageExpenseRows && !!onUpdateExpense;
    const sellerTransferOptions = useMemo(() => {
        const options = (settings?.users || [])
            .filter((user) => user && !user.isDeleted)
            .map((user) => ({
            value: user.id,
            label: user.name || user.id
        }));
        if (!options.some((option) => option.value === 'admin')) {
            options.unshift({ value: 'admin', label: tr('System Admin', 'مدیر سیستم') });
        }
        return options;
    }, [settings?.users, tr]);
    const expenseCategories = useMemo(() => settings?.expenseCategories?.length
        ? settings.expenseCategories
        : isEnglish
            ? ['Rent', 'Electricity', 'Water', 'Food', 'Salary', 'Transport', 'Misc']
            : ['کرایه', 'برق', 'آب', 'غذا', 'معاش', 'حمل‌ونقل', 'متفرقه'], [isEnglish, settings?.expenseCategories]);
    const homeInvoiceRows = useMemo<HomeInvoiceRow[]>(() => {
        if (mode !== 'home' || !report)
            return [];
        const startDate = new Date(report.range.startIso);
        const endDate = new Date(report.range.endIso);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()))
            return [];
        return invoices
            .filter((invoice) => {
            if (invoice.isDeleted)
                return false;
            const invoiceDate = new Date(invoice.date);
            if (Number.isNaN(invoiceDate.getTime()))
                return false;
            return invoiceDate >= startDate && invoiceDate <= endDate;
        })
            .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
            .map((invoice) => {
            const safeGrossSales = Number.isFinite(invoice.total) ? invoice.total : 0;
            const safeDiscount = Math.max(0, Number.isFinite(invoice.discount) ? invoice.discount : 0);
            const invoiceCurrency = invoice.currency || report.currencyCode;
            const activeReturns = Array.isArray(invoice.returns) ? invoice.returns.filter((entry) => !entry?.isDeleted) : [];
            const returnSubtotal = activeReturns.reduce((sum, entry) => sum + Math.max(0, Number(entry.subtotal ?? entry.totalRefund) || 0), 0);
            const returnRefunded = activeReturns.reduce((sum, entry) => sum + Math.max(0, Number(entry.amountRefunded) || 0), 0);
            const returnDebtReduction = activeReturns.reduce((sum, entry) => sum + Math.max(0, Number(entry.debtReduction) || 0), 0);
            const lineDiscountTotal = (Array.isArray(invoice.items) ? invoice.items : []).reduce((sum, item) => sum + calculateInvoiceLineDiscount(item, invoiceCurrency), 0);
            const safeNetSales = Math.max(0, safeGrossSales - lineDiscountTotal - safeDiscount - returnSubtotal);
            const safeFinalAmount = Math.max(0, (Number.isFinite(invoice.finalAmount) ? invoice.finalAmount : 0) - activeReturns.reduce((sum, entry) => sum + Math.max(0, Number(entry.totalRefund) || 0), 0));
            const safePaid = Math.max(0, Math.min(Number.isFinite(invoice.amountPaid) ? invoice.amountPaid : 0, safeFinalAmount + returnRefunded) - returnRefunded);
            const safeRemaining = Math.max(0, (Number.isFinite(invoice.remainingAmount) ? invoice.remainingAmount : safeFinalAmount - safePaid) - returnDebtReduction);
            const grossProfitBeforeInvoiceDiscount = (Array.isArray(invoice.items) ? invoice.items : []).reduce((sum, item) => sum + calculateItemProfit(item, medicines, invoiceCurrency), 0);
            const returnCogs = activeReturns.reduce((returnSum, entry) => (returnSum + (Array.isArray(entry.items) ? entry.items : []).reduce((itemSum, returnItem) => {
                const sourceItem = (Array.isArray(invoice.items) ? invoice.items : []).find((item) => (item.medicineId === returnItem.medicineId && item.batchId === returnItem.batchId));
                const medicine = medicineById.get(returnItem.medicineId);
                const batch = medicine?.batches?.find((candidate) => candidate.id === returnItem.batchId);
                const unitCost = Math.max(0, Number(returnItem.costPrice ?? sourceItem?.costPrice ?? batch?.purchasePrice) || 0);
                return itemSum + unitCost * getInvoiceItemBaseQuantity(returnItem);
            }, 0)), 0);
            const safeGrossProfit = grossProfitBeforeInvoiceDiscount - safeDiscount - returnSubtotal + returnCogs;
            const safeCogs = Math.max(0, safeNetSales - safeGrossProfit);
            const knownCustomerName = customerNameById.get(invoice.customerId);
            const sellerId = invoice.userId || 'admin';
            const rawUserName = userNameById.get(sellerId);
            const sellerName = rawUserName || (sellerId === 'admin' ? tr('System Admin', 'مدیر سیستم') : '-');
            return {
                id: invoice.id,
                invoiceLabel: invoice.invoiceNumber ? `#${invoice.invoiceNumber}` : `#${invoice.id.slice(-6)}`,
                date: invoice.date,
                customerId: invoice.customerId,
                customerName: knownCustomerName || '-',
                sellerId,
                sellerName,
                grossSales: safeGrossSales,
                netSales: safeNetSales,
                finalAmount: safeFinalAmount,
                amountPaid: safePaid,
                remainingAmount: safeRemaining,
                cogs: safeCogs,
                grossProfit: safeGrossProfit,
                paymentStatus: invoice.paymentStatus
            };
        });
    }, [customerNameById, invoices, medicineById, medicines, mode, report, tr, userNameById]);
    const homeInvoiceSummary = useMemo(() => ({
        count: homeInvoiceRows.length,
        totalGrossSales: homeInvoiceRows.reduce((sum, row) => sum + row.grossSales, 0),
        totalNetSales: homeInvoiceRows.reduce((sum, row) => sum + row.netSales, 0),
        totalFinalAmount: homeInvoiceRows.reduce((sum, row) => sum + row.finalAmount, 0),
        totalCollected: homeInvoiceRows.reduce((sum, row) => sum + row.amountPaid, 0),
        totalRemainingAmount: homeInvoiceRows.reduce((sum, row) => sum + row.remainingAmount, 0),
        totalCogs: homeInvoiceRows.reduce((sum, row) => sum + row.cogs, 0),
        totalGrossProfit: homeInvoiceRows.reduce((sum, row) => sum + row.grossProfit, 0)
    }), [homeInvoiceRows]);
    const homeExpenseRows = useMemo<HomeExpenseRow[]>(() => {
        if (mode !== 'home' || !report)
            return [];
        const startDate = new Date(report.range.startIso);
        const endDate = new Date(report.range.endIso);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()))
            return [];
        return expenses
            .filter((expense) => {
            if (expense.isDeleted)
                return false;
            const expenseDate = new Date(expense.date);
            if (Number.isNaN(expenseDate.getTime()))
                return false;
            return expenseDate >= startDate && expenseDate <= endDate;
        })
            .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
            .map((expense) => {
            const rawUserName = expense.userId ? userNameById.get(expense.userId) : null;
            return {
                id: expense.id,
                title: expense.title || '-',
                category: expense.category || '-',
                amount: Number.isFinite(expense.amount) ? expense.amount : 0,
                date: expense.date,
                description: expense.description || '',
                recordedBy: rawUserName || (expense.userId === 'admin' ? tr('System Admin', 'مدیر سیستم') : '-')
            };
        });
    }, [expenses, mode, report, tr, userNameById]);
    const homeExpenseSummary = useMemo(() => ({
        count: homeExpenseRows.length,
        totalAmount: homeExpenseRows.reduce((sum, row) => sum + row.amount, 0),
        topCategories: Object.values(homeExpenseRows.reduce<Record<string, {
            label: string;
            value: number;
        }>>((acc, row) => {
            const key = row.category || '-';
            if (!acc[key])
                acc[key] = { label: key, value: 0 };
            acc[key].value += row.amount;
            return acc;
        }, {}))
            .sort((left, right) => right.value - left.value)
            .slice(0, 5)
    }), [homeExpenseRows]);
    const profitStudioSummary = useMemo(() => {
        const operatingExpenses = homeExpenseSummary.totalAmount;
        const grossSales = homeInvoiceSummary.totalGrossSales;
        const netSales = homeInvoiceSummary.totalNetSales;
        const cogs = homeInvoiceSummary.totalCogs;
        const grossProfit = homeInvoiceSummary.totalGrossProfit;
        const netProfit = grossProfit - operatingExpenses;
        const grossMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0;
        const margin = netSales > 0 ? (netProfit / netSales) * 100 : 0;
        return {
            grossSales,
            netSales,
            cogs,
            operatingExpenses,
            grossProfit,
            netProfit,
            grossMargin,
            margin
        };
    }, [homeExpenseSummary.totalAmount, homeInvoiceSummary]);
    const executiveHeroChartData = useMemo<ExecutiveFinancePoint[]>(() => {
        if (mode !== 'home' || !report)
            return [];
        const trendPoints = report.sections.financial.charts.find((chart) => chart.id === 'financial-sales-trend')?.data || [];
        const buckets = new Map<string, ExecutiveFinancePoint>();
        trendPoints.forEach((point) => {
            buckets.set(point.id, {
                id: point.id,
                label: point.label,
                grossSales: 0,
                collected: 0,
                grossProfit: 0,
                invoiceCount: 0
            });
        });
        homeInvoiceRows.forEach((row) => {
            const date = new Date(row.date);
            if (Number.isNaN(date.getTime()))
                return;
            const bucketKey = getExecutiveBucketKey(date, report.range.granularity);
            const current = buckets.get(bucketKey) ||
                {
                    id: bucketKey,
                    label: getExecutiveBucketLabel(date, report.range.granularity, report.language, report),
                    grossSales: 0,
                    collected: 0,
                    grossProfit: 0,
                    invoiceCount: 0
                };
            current.grossSales += row.grossSales;
            current.collected += row.amountPaid;
            current.grossProfit += row.grossProfit;
            current.invoiceCount += 1;
            buckets.set(bucketKey, current);
        });
        return Array.from(buckets.values())
            .filter((point) => point.grossSales > 0 || point.collected > 0 || point.grossProfit !== 0 || point.invoiceCount > 0)
            .sort((left, right) => left.id.localeCompare(right.id));
    }, [homeInvoiceRows, mode, report]);
    const profitMixSegments = useMemo<ProfitMixSegment[]>(() => {
        const segments: ProfitMixSegment[] = [];
        if (profitStudioSummary.cogs > 0) {
            segments.push({
                id: 'cogs',
                label: tr('COGS', 'بهای تمام‌شده'),
                value: profitStudioSummary.cogs,
                color: '#60a5fa',
                glowClass: 'bg-brand-200/22',
                badgeClass: 'border-brand-100/75 bg-brand-50/72 text-brand-700'
            });
        }
        if (profitStudioSummary.operatingExpenses > 0) {
            segments.push({
                id: 'operating-expenses',
                label: tr('Operating Expenses', 'مصارف جاری'),
                value: profitStudioSummary.operatingExpenses,
                color: '#fb7185',
                glowClass: 'bg-rose-200/22',
                badgeClass: 'border-rose-100/75 bg-rose-50/72 text-rose-700'
            });
        }
        if (profitStudioSummary.grossProfit > 0) {
            segments.push({
                id: 'gross-profit',
                label: tr('Gross Profit', 'مفاد ناخالص'),
                value: profitStudioSummary.grossProfit,
                color: '#10b981',
                glowClass: 'bg-emerald-200/22',
                badgeClass: 'border-emerald-100/75 bg-emerald-50/72 text-emerald-700'
            });
        }
        if (profitStudioSummary.grossProfit < 0) {
            segments.push({
                id: 'gross-loss',
                label: tr('Gross Loss', 'ضرر ناخالص'),
                value: Math.abs(profitStudioSummary.grossProfit),
                color: '#f43f5e',
                glowClass: 'bg-rose-300/22',
                badgeClass: 'border-rose-100/75 bg-rose-50/72 text-rose-700'
            });
        }
        return segments;
    }, [profitStudioSummary.cogs, profitStudioSummary.grossProfit, profitStudioSummary.operatingExpenses, tr]);
    const heroMetrics = useMemo(() => currentSection
        ? currentSection.heroMetricKeys
            .map((key) => currentSection.kpis.find((metric) => metric.key === key))
            .filter(Boolean) as ReportMetricCard[]
        : [], [currentSection]);
    const detailMetrics = useMemo(() => currentSection
        ? currentSection.secondaryMetricKeys
            .map((key) => currentSection.kpis.find((metric) => metric.key === key))
            .filter(Boolean) as ReportMetricCard[]
        : [], [currentSection]);
    const primaryChart = currentSection?.charts.find((chart) => chart.id === currentSection.primaryChartId) || currentSection?.charts[0] || null;
    const secondaryCharts = currentSection?.charts.filter((chart) => chart.id !== currentSection.primaryChartId) || [];
    const secondaryTables = currentSection?.secondaryTableIds.map((id) => report?.tablesById[id]).filter(Boolean) as ReportTable[] | undefined;
    const currentPageInsights = report?.insights
        .filter((insight) => insight.surface !== 'overview' && (!insight.tab || insight.tab === currentTab))
        .slice(0, 2) || [];
    const exportAccess = useMemo(() => ({
        allowedTabs,
        canViewProfit
    }), [allowedTabs, canViewProfit]);
    const homeRangeOptions = [
        { value: 'today', label: tr('Today', 'امروز') },
        { value: 'thisWeek', label: tr('This Week', 'هفته جاری') },
        { value: 'thisMonth', label: tr('This Month', 'ماه جاری') },
        { value: 'thisQuarter', label: tr('This Quarter', 'ربع جاری') },
        { value: 'thisYear', label: tr('This Year', 'سال جاری') }
    ];
    homeRangeOptions.splice(3, 0, { value: 'lastMonth', label: tr('Last Month', 'ماه قبل') });
    homeRangeOptions.splice(5, 0, { value: 'lastQuarter', label: tr('Last Quarter', 'ربع قبل') });
    homeRangeOptions.push({ value: 'lastYear', label: tr('Last Year', 'سال قبل') });
    const buildAuditDetails = (currentReport: ReportBundle, extra: Record<string, unknown> = {}) => ({
        reportId: currentReport.reportId,
        surfaceMode: mode === 'home' ? 'executive-home' : 'advanced-workspace',
        currentTab,
        state: currentReport.state,
        range: currentReport.range.label,
        language: currentReport.language,
        filters: currentReport.appliedFilters,
        currentInvoiceCount: currentReport.metadata.currentInvoiceCount,
        visibleTabs: allowedTabs,
        canViewProfit,
        userId: activeAppUser?.id || null,
        userName: activeAppUser?.name || null,
        ...extra
    });
    useEffect(() => {
        if (reportState.status !== 'ready' || !report)
            return;
        const signature = `${mode}:${report.reportId}:${currentTab}`;
        if (viewedReportSignatureRef.current === signature)
            return;
        viewedReportSignatureRef.current = signature;
        void auditService.log('INFO', 'REPORTING', 'Report viewed', buildAuditDetails(report));
    }, [currentTab, mode, report, reportState.status]);
    useEffect(() => {
        setSelectedInvoiceIds((current) => {
            if (!current.size)
                return current;
            const visibleIds = new Set(homeInvoiceRows.map((row) => row.id));
            const next = new Set(Array.from(current).filter((id) => visibleIds.has(id)));
            return next.size === current.size ? current : next;
        });
    }, [homeInvoiceRows]);
    useEffect(() => {
        setInvoiceTablePages(DEFAULT_INVOICE_TABLE_PAGES);
    }, [report?.reportId]);
    const hasUntouchedHomeDefaultFilters = mode === 'home' &&
        !didUserTouchFilters &&
        hasUntouchedHomeFilterShape(filters);
    useEffect(() => {
        if (!hasUntouchedHomeDefaultFilters)
            return;
        if (filters.preset === homeSuggestedPreset)
            return;
        setFilters(defaultReportFilters('home', homeSuggestedPreset));
    }, [filters.preset, hasUntouchedHomeDefaultFilters, homeSuggestedPreset]);
    useEffect(() => {
        if (mode === 'home' && currentTab !== 'financial' && activeFinancialOverlay) {
            setActiveFinancialOverlay(null);
            setSelectedInvoiceIds(new Set());
            setPendingDeleteAction(null);
            setTransferringSellerInvoiceId(null);
            setExpenseEditorState(null);
            setExpenseFormError(null);
            setHighlightedInvoiceId(null);
        }
    }, [activeFinancialOverlay, currentTab, mode]);
    const updateFilter = <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) => {
        setDidUserTouchFilters(true);
        setFilters((current) => ({ ...current, [key]: value }));
    };
    const resetFilters = () => {
        setDidUserTouchFilters(false);
        setFilters(defaultReportFilters(mode, mode === 'home' ? homeSuggestedPreset : undefined));
    };
    const getInvoiceStatusLabel = (status: Invoice['paymentStatus']) => {
        if (status === 'cash')
            return tr('Cash', 'نقد');
        if (status === 'paid')
            return tr('Paid', 'پرداخت‌شده');
        if (status === 'partial')
            return tr('Partial', 'نقد و باقی');
        if (status === 'credit')
            return tr('Credit', 'نسیه');
        if (status === 'unpaid')
            return tr('Unpaid', 'پرداخت‌نشده');
        if (status === 'card')
            return tr('Card', 'کارت');
        if (status === 'mixed')
            return tr('Mixed', 'ترکیبی');
        return String(status || '-');
    };
    const hasActiveInvoiceManagerFilters = Boolean(invoiceManagerFilters.query.trim() ||
        invoiceManagerFilters.status !== 'all' ||
        invoiceManagerFilters.dateFrom ||
        invoiceManagerFilters.dateTo);
    const normalizedInvoiceManagerQuery = normalizePersianNumbers(deferredInvoiceManagerQuery.trim()).toLowerCase();
    const filteredInvoiceManagerRows = homeInvoiceRows.filter((row) => {
        if (invoiceManagerFilters.status !== 'all' && row.paymentStatus !== invoiceManagerFilters.status)
            return false;
        const invoiceDate = toDateInputValue(row.date);
        if (invoiceManagerFilters.dateFrom && invoiceDate < invoiceManagerFilters.dateFrom)
            return false;
        if (invoiceManagerFilters.dateTo && invoiceDate > invoiceManagerFilters.dateTo)
            return false;
        if (!normalizedInvoiceManagerQuery)
            return true;
        return [
            row.invoiceLabel,
            row.customerName,
            row.sellerName,
            getInvoiceStatusLabel(row.paymentStatus),
            formatExecutiveNumber(row.finalAmount),
            formatExecutiveNumber(row.amountPaid),
            formatExecutiveNumber(row.remainingAmount),
            formatReportDate(row.date, report?.language || language, report)
        ].some((value) => normalizePersianNumbers(String(value || '')).toLowerCase().includes(normalizedInvoiceManagerQuery));
    });
    const resetInvoiceManagerFilters = () => {
        setInvoiceManagerFilters(DEFAULT_INVOICE_MANAGER_FILTERS);
    };
    const closeFinancialOverlay = () => {
        setActiveFinancialOverlay(null);
        setSelectedInvoiceIds(new Set());
        setInvoiceTablePages(DEFAULT_INVOICE_TABLE_PAGES);
        setInvoiceManagerFilters(DEFAULT_INVOICE_MANAGER_FILTERS);
        setPendingDeleteAction(null);
        setTransferringSellerInvoiceId(null);
        setSellerTransferEditorInvoiceId(null);
        setExpenseEditorState(null);
        setExpenseFormError(null);
        setHighlightedInvoiceId(null);
        setInvoicePreviewId(null);
        setInvoiceEditId(null);
        setInvoiceEditDraft(null);
        setInvoiceEditError(null);
        setOpenInvoiceActionMenuId(null);
        setIsSavingInvoiceEdit(false);
    };
    const toggleInvoiceSelection = (invoiceId: string) => {
        setSelectedInvoiceIds((current) => {
            const next = new Set(current);
            if (next.has(invoiceId))
                next.delete(invoiceId);
            else
                next.add(invoiceId);
            return next;
        });
    };
    const toggleSelectAllInvoices = (invoiceIds: string[] = homeInvoiceRows.map((row) => row.id)) => {
        if (!invoiceIds.length)
            return;
        setSelectedInvoiceIds((current) => {
            const next = new Set(current);
            const allSelected = invoiceIds.every((id) => next.has(id));
            invoiceIds.forEach((id) => {
                if (allSelected)
                    next.delete(id);
                else
                    next.add(id);
            });
            return next;
        });
    };
    const requestDeleteInvoices = (ids: string[]) => {
        if (!ids.length || !canDeleteInvoiceRows)
            return;
        setPendingDeleteAction({ kind: 'invoices', ids });
    };
    const openInvoiceEdit = (invoiceId: string) => {
        const invoice = invoiceById.get(invoiceId);
        if (!invoice || !canEditInvoiceRows)
            return;
        const customer = customerById.get(invoice.customerId);
        setInvoiceEditId(invoiceId);
        setInvoiceEditError(null);
        setInvoiceEditDraft({
            invoiceNumber: invoice.invoiceNumber ? String(invoice.invoiceNumber) : '',
            date: toDateInputValue(invoice.date),
            customerName: customer?.name || '',
            customerMode: 'keep',
            targetCustomerId: invoice.customerId,
            userId: invoice.userId || 'admin',
            amountPaid: String(invoice.amountPaid || 0),
            discount: String(invoice.discount || 0),
            taxRate: String(invoice.taxRate ?? settings?.taxRate ?? 0),
            editReason: '',
            allowReturnedLineReassignment: false,
            items: (invoice.items || []).map((item, index) => ({
                ...item,
                lineId: getInvoiceItemLineId(invoice, item, index)
            }))
        });
    };
    const updateInvoiceEditItem = (index: number, patch: Partial<InvoiceItem>) => {
        setInvoiceEditDraft((current) => {
            if (!current)
                return current;
            return {
                ...current,
                items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)
            };
        });
    };
    const addInvoiceEditItem = () => {
        const firstMedicine = medicines.find((medicine) => !medicine.isDeleted);
        const firstBatch = firstMedicine?.batches?.find((batch) => (Number(batch.quantity) || 0) > 0) || firstMedicine?.batches?.[0];
        setInvoiceEditDraft((current) => {
            if (!current || !firstMedicine || !firstBatch || !editingInvoice)
                return current;
            return {
                ...current,
                items: [
                    ...current.items,
                    {
                        lineId: `${editingInvoice.id}-line-${current.items.length + 1}-${createUniqueId('line')}`,
                        medicineId: firstMedicine.id,
                        batchId: firstBatch.id,
                        quantity: 1,
                        baseQuantity: 1,
                        price: firstMedicine.salePrices?.retail || 0,
                        costPrice: firstBatch.purchasePrice || 0,
                        priceMode: 'retail'
                    }
                ]
            };
        });
    };
    const removeInvoiceEditItem = (index: number) => {
        if (!editingInvoice)
            return;
        const returnedByLine = getReturnedQuantityByInvoiceLine(editingInvoice);
        if ((returnedByLine.get(index) || 0) > 0) {
            setInvoiceEditError(tr('Returned lines cannot be removed.', 'سطر دارای برگشتی قابل حذف نیست.'));
            return;
        }
        setInvoiceEditDraft((current) => current ? {
            ...current,
            items: current.items.filter((_, itemIndex) => itemIndex !== index)
        } : current);
    };
    const submitInvoiceEdit = async () => {
        if (!editingInvoice || !invoiceEditDraft || !onUpdateInvoice || isSavingInvoiceEdit)
            return;
        const activeReturnCount = getActiveReturnCount(editingInvoice);
        if (activeReturnCount > 0 && !invoiceEditDraft.editReason.trim()) {
            setInvoiceEditError(tr('Edit reason is required for invoices with returns.', 'برای فاکتور دارای برگشتی دلیل ویرایش الزامی است.'));
            return;
        }
        if (!invoiceEditDraft.items.length) {
            setInvoiceEditError(tr('Invoice must include at least one item.', 'فاکتور باید حداقل یک قلم داشته باشد.'));
            return;
        }
        const returnedByLine = getReturnedQuantityByInvoiceLine(editingInvoice);
        const changedReturnedLine = invoiceEditDraft.items.some((item, index) => {
            if ((returnedByLine.get(index) || 0) <= 0)
                return false;
            const previousItem = editingInvoice.items[index];
            return previousItem && (previousItem.medicineId !== item.medicineId || previousItem.batchId !== item.batchId);
        });
        if (changedReturnedLine && !invoiceEditDraft.allowReturnedLineReassignment) {
            setInvoiceEditError(tr('Confirm recalculation before changing medicine or batch on returned lines.', 'برای تغییر دوا یا بچ سطر برگشتی، تأیید بازمحاسبه را فعال کنید.'));
            return;
        }
        const nextItems = invoiceEditDraft.items.map((item, index) => {
            const medicine = medicineById.get(item.medicineId);
            const batch = medicine?.batches?.find((entry) => entry.id === item.batchId);
            return {
                ...item,
                lineId: item.lineId || getInvoiceItemLineId(editingInvoice, item, index),
                quantity: Math.max(0, Number(item.quantity) || 0),
                baseQuantity: item.baseQuantity === undefined ? undefined : Math.max(0, Number(item.baseQuantity) || 0),
                price: Math.max(0, Number(item.price) || 0),
                costPrice: item.costPrice ?? batch?.purchasePrice,
                batchOwnershipType: item.batchOwnershipType || batch?.ownershipType,
                partnerId: item.partnerId || batch?.ownerPartnerId,
                priceMode: item.priceMode || editingInvoice.salesMode || 'retail'
            };
        });
        const taxRate = Math.max(0, Number(invoiceEditDraft.taxRate) || 0);
        const discount = Math.max(0, Number(invoiceEditDraft.discount) || 0);
        const totals = calculateInvoiceTotals(nextItems, discount, taxRate, editingInvoice.currency);
        const amountPaid = Math.max(0, Number(invoiceEditDraft.amountPaid) || 0);
        const nextInvoice: Invoice = {
            ...editingInvoice,
            invoiceNumber: invoiceEditDraft.invoiceNumber.trim() ? Math.max(1, Math.trunc(Number(invoiceEditDraft.invoiceNumber) || 0)) : undefined,
            date: new Date(invoiceEditDraft.date || editingInvoice.date).toISOString(),
            userId: invoiceEditDraft.userId || 'admin',
            customerId: invoiceEditDraft.customerMode === 'transfer_ownership'
                ? (invoiceEditDraft.targetCustomerId || editingInvoice.customerId)
                : editingInvoice.customerId,
            items: nextItems,
            total: totals.total,
            lineDiscountTotal: totals.lineDiscountTotal,
            discount,
            tax: totals.tax,
            taxRate,
            finalAmount: totals.finalAmount,
            amountPaid,
            remainingAmount: Math.max(0, totals.finalAmount - Math.min(amountPaid, totals.finalAmount)),
            updatedAt: new Date().toISOString()
        };
        const request: InvoiceUpdateRequest = {
            invoice: nextInvoice,
            customerEditMode: invoiceEditDraft.customerMode,
            customerName: invoiceEditDraft.customerName.trim(),
            targetCustomerId: invoiceEditDraft.targetCustomerId || undefined,
            editReason: invoiceEditDraft.editReason.trim() || undefined,
            allowReturnedLineReassignment: invoiceEditDraft.allowReturnedLineReassignment,
            idempotencyKey: `invoice-edit:${editingInvoice.id}:${Date.now()}`
        };
        try {
            setIsSavingInvoiceEdit(true);
            setInvoiceEditError(null);
            await onUpdateInvoice(editingInvoice.id, request);
            setInvoiceEditId(null);
            setInvoiceEditDraft(null);
        }
        catch (error) {
            setInvoiceEditError(error instanceof Error ? error.message : tr('Invoice edit failed.', 'ویرایش فاکتور ناکام شد.'));
        }
        finally {
            setIsSavingInvoiceEdit(false);
        }
    };
    const handleTransferInvoiceSeller = async (invoiceId: string, nextUserId: string, currentUserId: string) => {
        if (!canTransferInvoiceRows || !onTransferInvoiceSeller)
            return;
        if (!nextUserId || nextUserId === currentUserId || transferringSellerInvoiceId)
            return;
        try {
            setTransferringSellerInvoiceId(invoiceId);
            await onTransferInvoiceSeller(invoiceId, nextUserId);
            setSellerTransferEditorInvoiceId(null);
        }
        finally {
            setTransferringSellerInvoiceId(null);
        }
    };
    const requestDeleteExpense = (expenseId: string, expenseLabel: string) => {
        if (!canManageExpenseRows)
            return;
        setPendingDeleteAction({ kind: 'expense', expenseId, expenseLabel });
    };
    const confirmPendingDelete = () => {
        if (!pendingDeleteAction)
            return;
        const action = pendingDeleteAction;
        setPendingDeleteAction(null);
        if (action.kind === 'invoices') {
            if (!action.ids.length || !onDeleteInvoices)
                return;
            window.setTimeout(() => {
                void onDeleteInvoices(action.ids);
            }, 0);
            const deletedIds = new Set(action.ids);
            setSelectedInvoiceIds((current) => new Set(Array.from(current).filter((id) => !deletedIds.has(id))));
            return;
        }
        if (!onDeleteExpense)
            return;
        window.setTimeout(() => {
            onDeleteExpense(action.expenseId);
        }, 0);
    };
    const openFinancialOverlay = (overlay: FinancialOverlay) => {
        setActiveFinancialOverlay(overlay);
        setHighlightedInvoiceId(null);
        setSellerTransferEditorInvoiceId(null);
        if (overlay !== 'expense_manager') {
            const tableVariant = overlay === 'invoice_manager'
                ? 'invoice-manager'
                : overlay === 'sales_ledger'
                    ? 'sales-ledger'
                    : 'profit-studio';
            setInvoiceTablePages((current) => ({ ...current, [tableVariant]: 1 }));
        }
        setPendingDeleteAction(null);
    };
    const resetExpenseDraft = (expense?: HomeExpenseRow) => {
        setExpenseDraft({
            title: expense?.title || '',
            amount: expense ? String(expense.amount) : '',
            category: expense?.category || expenseCategories[0] || '',
            date: expense?.date ? expense.date.slice(0, 10) : new Date().toISOString().split('T')[0],
            description: expense?.description || ''
        });
        setExpenseFormError(null);
    };
    const openExpenseEditor = (expense?: HomeExpenseRow) => {
        resetExpenseDraft(expense);
        setExpenseEditorState(expense ? { mode: 'edit', expenseId: expense.id } : { mode: 'add' });
    };
    const closeExpenseEditor = () => {
        setExpenseEditorState(null);
        setExpenseFormError(null);
    };
    const handleExpenseDraftChange = <K extends keyof ExpenseDraft>(key: K, value: ExpenseDraft[K]) => {
        setExpenseDraft((current) => ({ ...current, [key]: value }));
        if (expenseFormError)
            setExpenseFormError(null);
    };
    const handleExpenseAmountChange = (value: string) => {
        const normalized = normalizePersianNumbers(value);
        if (normalized === '' || /^\d*\.?\d*$/.test(normalized)) {
            handleExpenseDraftChange('amount', normalized);
        }
    };
    const submitExpenseEditor = () => {
        if (!canManageExpenseRows)
            return;
        const parsedAmount = Number.parseFloat(expenseDraft.amount);
        if (!expenseDraft.title.trim() || !expenseDraft.category || !expenseDraft.date || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            setExpenseFormError(tr('Please complete required fields with valid values.', 'لطفاً فیلدهای ضروری را با مقدار معتبر کامل کنید.'));
            return;
        }
        const payload = {
            title: expenseDraft.title.trim(),
            amount: parsedAmount,
            category: expenseDraft.category,
            date: expenseDraft.date,
            description: expenseDraft.description.trim(),
            userId: activeAppUser?.id || 'admin'
        };
        if (expenseEditorState?.mode === 'edit') {
            onUpdateExpense?.(expenseEditorState.expenseId, payload);
        }
        else {
            onAddExpense?.(payload);
        }
        closeExpenseEditor();
    };
    useEffect(() => {
        if (pendingDeleteAction?.kind !== 'invoices')
            return;
        const visibleIds = new Set(homeInvoiceRows.map((row) => row.id));
        const filteredIds = pendingDeleteAction.ids.filter((id) => visibleIds.has(id));
        if (!filteredIds.length) {
            setPendingDeleteAction(null);
        }
        else if (filteredIds.length !== pendingDeleteAction.ids.length) {
            setPendingDeleteAction({ kind: 'invoices', ids: filteredIds });
            setSelectedInvoiceIds((current) => new Set(Array.from(current).filter((id) => visibleIds.has(id))));
        }
    }, [homeInvoiceRows, pendingDeleteAction]);
    const sortedProfitInvoiceRows = useMemo(() => [...homeInvoiceRows].sort((left, right) => right.grossProfit - left.grossProfit), [homeInvoiceRows]);
    const salesLedgerRows = useMemo(() => [...homeInvoiceRows].sort((left, right) => right.netSales - left.netSales), [homeInvoiceRows]);
    const financialExpenseRows = useMemo(() => [...homeExpenseRows].sort((left, right) => right.amount - left.amount), [homeExpenseRows]);
    useEffect(() => {
        if (!expenseEditorState?.mode || expenseEditorState.mode !== 'edit')
            return;
        const editedExpense = homeExpenseRows.find((row) => row.id === expenseEditorState.expenseId);
        if (!editedExpense) {
            closeExpenseEditor();
        }
    }, [expenseEditorState, homeExpenseRows]);
    useEffect(() => {
        if (pendingDeleteAction?.kind !== 'expense')
            return;
        const exists = homeExpenseRows.some((row) => row.id === pendingDeleteAction.expenseId);
        if (!exists) {
            setPendingDeleteAction(null);
        }
    }, [homeExpenseRows, pendingDeleteAction]);
    useEffect(() => {
        if (!activeFinancialOverlay) {
            setSelectedInvoiceIds(new Set());
            setTransferringSellerInvoiceId(null);
        }
    }, [activeFinancialOverlay]);
    const handleSaveView = () => {
        const name = window.prompt(tr('Save this view as', 'این نما با چه نامی ذخیره شود؟'));
        if (!name?.trim())
            return;
        const next: SavedView = {
            id: createUniqueId('view'),
            name: name.trim(),
            favorite: false,
            filters,
            createdAt: new Date().toISOString()
        };
        setSavedViews((current) => [next, ...current].slice(0, 12));
    };
    const applyView = (view: SavedView) => {
        setFilters(view.filters);
        setIsFilterDrawerOpen(false);
    };
    const toggleFavorite = (id: string) => {
        setSavedViews((current) => current.map((view) => (view.id === id ? { ...view, favorite: !view.favorite } : view)));
    };
    const removeView = (id: string) => {
        setSavedViews((current) => current.filter((view) => view.id !== id));
    };
    const pushJob = (label: string) => {
        const job: ExportJob = {
            id: createUniqueId('job'),
            label,
            status: 'queued',
            createdAt: new Date().toISOString()
        };
        setExportJobs((current) => [job, ...current].slice(0, 10));
        return job.id;
    };
    const updateJob = (id: string, updates: Partial<ExportJob>) => {
        setExportJobs((current) => current.map((job) => (job.id === id ? { ...job, ...updates } : job)));
    };
    const exportReport = async (format: 'pdf' | 'html' | 'csv' | 'print', overrides: Partial<{
        mode: ReportExportMode;
        scope: 'currentTab' | 'fullBook';
        language: ReportExportLanguage;
        tab: ReportTab | undefined;
    }> = {}) => {
        if (!report)
            return;
        const resolvedMode = overrides.mode ?? exportMode;
        const resolvedScope = overrides.scope ?? exportScope;
        const resolvedLanguage = overrides.language ?? exportLanguage;
        const targetTab = overrides.tab !== undefined
            ? overrides.tab
            : resolvedScope === 'currentTab'
                ? currentTab
                : undefined;
        if (format === 'csv' && !targetTab) {
            throw new Error(tr('CSV export is only available from a detail page.', 'خروجی CSV فقط از صفحه جزئیات در دسترس است.'));
        }
        const jobId = pushJob(`${format.toUpperCase()} · ${resolvedScope === 'currentTab' ? (targetTab || 'overview') : 'full'}`);
        updateJob(jobId, { status: 'processing' });
        try {
            const rawPair = resolvedLanguage === 'bilingual'
                ? buildBilingualBundlePair({
                    invoices,
                    medicines,
                    customers,
                    expenses,
                    purchases,
                    suppliers,
                    settings,
                    activeAppUser,
                    filters: { ...filters, query: deferredQuery }
                })
                : {
                    primary: buildReportBundle({
                        invoices,
                        medicines,
                        customers,
                        expenses,
                        purchases,
                        suppliers,
                        settings,
                        activeAppUser,
                        filters: { ...filters, query: deferredQuery },
                        language: resolvedLanguage
                    }),
                    secondary: null
                };
            const pair = {
                primary: sanitizeReportBundleForAccess(rawPair.primary, exportAccess),
                secondary: rawPair.secondary ? sanitizeReportBundleForAccess(rawPair.secondary, exportAccess) : null
            };
            const exportAuditDetails = buildAuditDetails(pair.primary, {
                format,
                exportScope: resolvedScope,
                exportMode: resolvedMode,
                exportLanguage: resolvedLanguage,
                targetTab: targetTab || 'overview'
            });
            void auditService.log('INFO', 'REPORTING', 'Report export requested', exportAuditDetails);
            const html = buildReportHtml({
                primary: pair.primary,
                secondary: pair.secondary,
                mode: resolvedMode,
                scope: resolvedScope,
                tab: targetTab,
                tabs: allowedTabs,
                managerNote,
                confidentiality: tr('Confidential / Internal Use Only', 'محرمانه / فقط برای استفاده داخلی')
            });
            if (format === 'print') {
                const printWindow = openPrintWindow('width=1200,height=900');
                if (!printWindow)
                    throw new Error(tr('Popup was blocked.', 'پنجره چاپ مسدود شد.'));
                printWindow.document.write(html);
                printWindow.document.close();
                printWindow.focus();
                printWindow.print();
                updateJob(jobId, { status: 'ready', detail: tr('Sent to print dialog.', 'به پنجره چاپ فرستاده شد.') });
                void auditService.log('INFO', 'REPORTING', 'Report export completed', { ...exportAuditDetails, status: 'ready' });
                return;
            }
            if (format === 'csv') {
                const csv = buildReportCsv(pair.primary, targetTab || 'financial');
                downloadBlob(buildReportFileName(pair.primary, 'csv', targetTab), new Blob([csv], { type: 'text/csv;charset=utf-8' }));
                updateJob(jobId, { status: 'ready', detail: tr('CSV downloaded.', 'CSV دانلود شد.') });
                void auditService.log('INFO', 'REPORTING', 'Report export completed', { ...exportAuditDetails, status: 'ready' });
                return;
            }
            if (format === 'html') {
                if (window.electronAPI?.saveInvoiceHtml) {
                    const result = await window.electronAPI.saveInvoiceHtml(html, buildReportFileName(pair.primary, 'html', targetTab));
                    if (!result?.success)
                        throw new Error(result?.error || 'SAVE_HTML_FAILED');
                    updateJob(jobId, { status: 'ready', detail: result.filePath || tr('HTML saved.', 'HTML ذخیره شد.') });
                }
                else {
                    downloadBlob(buildReportFileName(pair.primary, 'html', targetTab), new Blob([html], { type: 'text/html;charset=utf-8' }));
                    updateJob(jobId, { status: 'ready', detail: tr('HTML downloaded.', 'HTML دانلود شد.') });
                }
                void auditService.log('INFO', 'REPORTING', 'Report export completed', { ...exportAuditDetails, status: 'ready' });
                return;
            }
            if (!window.electronAPI?.generateReportPdf) {
                throw new Error(tr('Desktop PDF export is not available in this runtime.', 'خروجی PDF دسکتاپ در این محیط در دسترس نیست.'));
            }
            const result = await window.electronAPI.generateReportPdf(html, buildReportFileName(pair.primary, 'pdf', targetTab));
            if (!result?.success)
                throw new Error(result?.error || 'PDF_EXPORT_FAILED');
            updateJob(jobId, { status: 'ready', detail: result.filePath || tr('PDF generated.', 'PDF ساخته شد.') });
            void auditService.log('INFO', 'REPORTING', 'Report export completed', {
                ...exportAuditDetails,
                status: 'ready',
                filePath: result.filePath || null
            });
        }
        catch (error) {
            updateJob(jobId, {
                status: 'failed',
                detail: error instanceof Error ? error.message : tr('Export failed.', 'خروجی ناموفق شد.')
            });
            void auditService.log('ERROR', 'REPORTING', 'Report export failed', buildAuditDetails(report, {
                format,
                error: error instanceof Error ? error.message : 'EXPORT_FAILED'
            }));
            throw error;
        }
    };
    const quickExportPdf = async () => {
        await exportReport('pdf', {
            mode: 'summary',
            scope: 'fullBook',
            language
        });
        setIsQuickExportOpen(false);
    };
    const shareReport = async () => {
        if (!report)
            return;
        const sharedReport = sanitizeReportBundleForAccess(report, exportAccess);
        const text = buildShareText(sharedReport);
        const canUseNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;
        try {
            if (canUseNativeShare) {
                await navigator.share({ title: sharedReport.title, text });
            }
            else if (navigator.clipboard) {
                await navigator.clipboard.writeText(text);
            }
            void auditService.log('INFO', 'REPORTING', 'Report shared', buildAuditDetails(sharedReport, {
                shareMethod: canUseNativeShare ? 'navigator.share' : 'clipboard'
            }));
        }
        catch (error) {
            void auditService.log('WARNING', 'REPORTING', 'Report share failed', buildAuditDetails(sharedReport, {
                error: error instanceof Error ? error.message : 'SHARE_FAILED'
            }));
        }
    };
    const openPrimaryAction = () => setIsQuickExportOpen(true);
    const getActionForState = () => {
        if (!report)
            return null;
        if (report.state === 'filteredOut') {
            return {
                label: tr('Reset Filters', 'بازنشانی فیلترها'),
                onClick: resetFilters
            };
        }
        if (currentTab === 'inventory')
            return { label: tr('Open inventory', 'بازکردن انبار'), onClick: () => onNavigate?.('inventory') };
        if (currentTab === 'customers')
            return { label: tr('Open customers', 'بازکردن مشتریان'), onClick: () => onNavigate?.('customers') };
        return { label: tr('Open sales', 'بازکردن فروش'), onClick: () => onNavigate?.('sales') };
    };
    const rangeOptions = [
        { value: 'today', label: tr('Today', 'امروز') },
        { value: 'yesterday', label: tr('Yesterday', 'دیروز') },
        { value: 'thisWeek', label: tr('This Week', 'این هفته') },
        { value: 'lastWeek', label: tr('Last Week', 'هفته قبل') },
        { value: 'thisMonth', label: tr('This Month', 'این ماه') },
        { value: 'lastMonth', label: tr('Last Month', 'ماه قبل') },
        { value: 'thisQuarter', label: tr('This Quarter', 'این ربع') },
        { value: 'lastQuarter', label: tr('Last Quarter', 'ربع قبل') },
        { value: 'thisYear', label: tr('This Year', 'این سال') },
        { value: 'lastYear', label: tr('Last Year', 'سال قبل') },
        { value: 'custom', label: tr('Custom Range', 'بازه دلخواه') }
    ];
    const detailDrawerTable = selectedTable || null;
    const legacyTabLabels: Record<ReportTab, string> = {
        financial: tr('Financial Performance', 'عملکرد مالی'),
        inventory: tr('Inventory Analysis', 'تحلیل کالا و انبار'),
        customers: tr('Customers', 'مشتریان'),
        employees: tr('Employees', 'کارمندان')
    };
    const classicSubtitle = tr('Financial and inventory performance analysis', 'تحلیل عملکرد مالی و انبار');
    const getMetric = (tab: ReportTab, key: string) => report?.sections[tab].kpis.find((metric) => metric.key === key);
    const getChart = (tab: ReportTab, chartId: string) => report?.sections[tab].charts.find((chart) => chart.id === chartId) || null;
    const getTable = (tableId: string) => (report ? report.tablesById[tableId] : null);
    const primaryStateAction = getActionForState();
    const homeRecommendedActions = report
        ? report.overview.topInsights
            .slice()
            .sort((left, right) => left.priority - right.priority)
            .slice(0, 3)
            .map((insight, index) => ({
            id: `${insight.id}-${index}`,
            title: insight.title,
            description: insight.description,
            label: insight.actionLabel || (insight.tableId ? tr('Open detail', 'بازکردن جزئیات') : tr('Review area', 'بازبینی بخش')),
            onClick: () => {
                if (insight.tableId) {
                    setSelectedTableId(insight.tableId);
                    return;
                }
                if (insight.tab) {
                    setActiveTab(insight.tab);
                    return;
                }
                primaryStateAction?.onClick?.();
            }
        }))
        : [];
    const advancedInvalidCustomRange = filters.preset === 'custom' && !!filters.startDate && !!filters.endDate && filters.startDate > filters.endDate;
    const advancedHasCustomQuery = Boolean((filters.query || '').trim());
    const advancedSavedViews = savedViews
        .slice()
        .sort((left, right) => Number(right.favorite) - Number(left.favorite))
        .slice(0, 8);
    const advancedWorkspaceState = report?.state !== 'ready'
        ? null
        : advancedInvalidCustomRange
            ? {
                key: 'invalid',
                title: tr('Invalid filter combination', 'ترکیب فیلتر نامعتبر است'),
                description: tr('The start date must be before the end date before running this workspace.', 'پیش از اجرای این workspace، تاریخ شروع باید قبل از تاریخ ختم باشد.')
            }
            : !currentPrimaryTable && !primaryChart
                ? {
                    key: 'insufficient',
                    title: tr('Insufficient data for this workspace', 'داده کافی برای این workspace موجود نیست'),
                    description: tr('This area does not have enough data yet to render a stable table or chart.', 'این بخش فعلا داده کافی برای نمایش یک جدول یا نمودار پایدار ندارد.')
                }
                : currentPrimaryTable && currentPrimaryTable.rows.length === 0 && !advancedHasCustomQuery && report.appliedFilters.length <= 1 && advancedSavedViews.length === 0
                    ? {
                        key: 'no-query',
                        title: tr('No query or saved view yet', 'هنوز query یا نمای ذخیره شده ای وجود ندارد'),
                        description: tr('Start with a saved view, add a search term, or open more filters to shape the analysis workspace.', 'برای شکل دادن به فضای تحلیل، از یک نمای ذخیره شده شروع کنید، عبارت جستجو اضافه کنید یا فیلترهای بیشتر را باز کنید.')
                    }
                    : currentPrimaryTable && currentPrimaryTable.rows.length === 0 && advancedHasCustomQuery
                        ? {
                            key: 'zero-result',
                            title: tr('No rows match this query', 'هیچ ردیفی با این query همخوان نیست'),
                            description: tr('Try broadening the search, switching the date range, or loading a saved view.', 'جستجو را گسترده تر کنید، بازه زمانی را تغییر دهید یا یک نمای ذخیره شده را بارگذاری کنید.')
                        }
                        : currentPrimaryTable && currentPrimaryTable.rows.length === 0
                            ? {
                                key: 'insufficient',
                                title: tr('This view needs more data', 'این نما به داده بیشتری نیاز دارد'),
                                description: tr('The current filters are valid, but this report area does not have enough rows to analyze yet.', 'فیلترهای فعلی معتبرند، اما این بخش گزارش هنوز ردیف کافی برای تحلیل ندارد.')
                            }
                            : null;
    const financialCards = report
        ? [
            {
                key: 'grossSales',
                title: tr('Total Sales', 'مجموع فروش'),
                value: formatExecutiveNumber(getMetric('financial', 'grossSales')?.value || 0),
                note: tr('Gross sales', 'فروش ناخالص'),
                actionHint: tr('Sales ledger', 'دفتر فروش'),
                kicker: tr('Sales', 'فروش'),
                ctaLabel: tr('Open sales ledger', 'باز کردن دفتر فروش'),
                theme: 'blue' as const,
                onClick: () => openFinancialOverlay('sales_ledger'),
                icon: (<svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M12 4v16"/>
              <path d="M16 7.5c0-1.9-1.8-3.5-4-3.5s-4 1.6-4 3.5 1.8 3.1 4 3.5 4 1.5 4 3.5-1.8 3.5-4 3.5-4-1.6-4-3.5"/>
            </svg>)
            },
            {
                key: 'netProfit',
                title: tr('Net Profit', 'مفاد خالص'),
                value: canViewProfit ? formatExecutiveNumber(profitStudioSummary.netProfit) : RESTRICTED_VALUE,
                // #2: net-profit card shows the NET margin (display-only; both margins are
                // pre-computed). When no expenses are recorded, net profit equals gross
                // profit — so we surface a "مصارف ثبت‌نشده" tag to explain why the two
                // figures coincide instead of leaving an unexplained duplicate number.
                note: canViewProfit
                    ? profitStudioSummary.operatingExpenses === 0
                        ? `${formatExecutiveNumber(profitStudioSummary.margin, 1)}% ${tr('margin', 'حاشیه مفاد')} · ${tr('No expenses', 'بدون مصرف')}`
                        : `${formatExecutiveNumber(profitStudioSummary.margin, 1)}% ${tr('margin', 'حاشیهٔ مفاد')}`
                    : tr('Hidden by your access level', 'براساس سطح دسترسی شما پنهان است'),
                actionHint: canViewProfit ? tr('Profit studio', 'استودیوی مفاد') : tr('Locked', 'قفل شده'),
                kicker: tr('Profitability', 'مفاد'),
                ctaLabel: canViewProfit ? tr('Open profit studio', 'باز کردن استودیوی مفاد') : tr('Locked by permission', 'قفل به‌دلیل دسترسی'),
                theme: 'green' as const,
                onClick: () => openFinancialOverlay('profit_studio'),
                icon: (<svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M5 15l4-4 3 3 7-7"/>
              <path d="M14 7h5v5"/>
            </svg>)
            },
            {
                key: 'operatingExpenses',
                title: tr('Operating Expenses', 'مصارف جاری'),
                value: formatExecutiveNumber(getMetric('financial', 'operatingExpenses')?.value || 0),
                note: `${formatExecutiveNumber(getTable('financial-expenses')?.rows.length || 0)} ${tr('expense items', 'مورد مصرف')}`,
                actionHint: canManageExpenseRows ? tr('Manage expenses', 'مدیریت مصارف') : tr('Expense details', 'جزئیات مصارف'),
                kicker: tr('Operational spend', 'مصارف'),
                ctaLabel: canManageExpenseRows ? tr('Open expense manager', 'باز کردن مدیریت مصارف') : tr('Review expense details', 'مرور جزئیات مصارف'),
                theme: 'rose' as const,
                onClick: () => openFinancialOverlay('expense_manager'),
                // #6: replaced the ambiguous "circle with minus" (read as disabled/blocked)
                // with a banknote icon that clearly represents spending/expenses.
                icon: (<svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.9">
              <rect x="3" y="6" width="18" height="12" rx="2.5"/>
              <circle cx="12" cy="12" r="2.6"/>
              <path d="M6.5 9.5h.01M17.5 14.5h.01" strokeLinecap="round"/>
            </svg>)
            },
            {
                key: 'invoiceCount',
                title: tr('Invoices', 'تعداد فاکتورها'),
                value: formatExecutiveNumber(getMetric('financial', 'invoiceCount')?.value || 0),
                note: `${tr('Avg. basket', 'سبد میانگین')}: ${formatExecutiveNumber(getMetric('financial', 'averageInvoiceValue')?.value || 0)}`,
                kicker: tr('Order flow', 'فاکتورها'),
                theme: 'violet' as const,
                actionHint: tr('Invoice manager', 'مدیریت فاکتورها'),
                ctaLabel: tr('Open invoice manager', 'باز کردن مدیریت فاکتورها'),
                onClick: () => openFinancialOverlay('invoice_manager'),
                // #6: replaced the bag/bin-like glyph (mistaken for a delete/trash icon)
                // with a clear invoice/document icon — a page with a folded corner and
                // text lines, matching the "invoice count" meaning of this card.
                icon: (<svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/>
              <path d="M14 3v4h4"/>
              <path d="M9.5 12h5M9.5 15.5h5"/>
            </svg>)
            }
        ]
        : [];
    const inventoryAlerts = report
        ? [
            {
                key: 'expired',
                title: tr('Expired products', 'کالاهای منقضی شده'),
                note: tr('Need disposal or return', 'نیاز به امحا یا مرجوعی دارند'),
                value: formatExecutiveNumber(getMetric('inventory', 'expired')?.value || 0),
                statusLabel: tr('Critical', 'بحرانی'),
                tone: 'red' as const
            },
            {
                key: 'expiring60',
                title: tr('Near expiry (60 days)', 'نزدیک به انقضا (60 روز)'),
                note: tr('Suggested for priority sale', 'پیشنهاد فروش ویژه'),
                value: formatExecutiveNumber(getMetric('inventory', 'expiring60')?.value || 0),
                statusLabel: tr('Watch', 'هشدار'),
                tone: 'orange' as const
            },
            {
                key: 'reorderNeeded',
                title: tr('Low stock', 'کمبود موجودی'),
                note: tr('Needs reorder', 'نیاز به سفارش مجدد'),
                value: formatExecutiveNumber(getMetric('inventory', 'reorderNeeded')?.value || 0),
                statusLabel: tr('Action needed', 'اقدام لازم'),
                tone: 'amber' as const
            }
        ]
        : [];
    const customerPhoneMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer.phone || '-'])), [customers]);
    const debtorRows = useMemo(() => {
        const rows = getTable('customers-summary')?.rows || [];
        return [...rows]
            .map((row) => ({
            id: String(row.id),
            customer: String(row.customer || '-'),
            phone: customerPhoneMap.get(String(row.id)) || '-',
            debt: Number(row.balance || 0)
        }))
            .filter((row) => row.debt > 0)
            .sort((left, right) => right.debt - left.debt)
            .slice(0, 12);
    }, [customerPhoneMap, report]);
    const employeeRows = useMemo(() => {
        const rows = getTable('employees-summary')?.rows || [];
        return rows.slice(0, 12).map((row) => ({
            id: String(row.id),
            employee: String(row.employee || '-'),
            invoiceCount: Number(row.invoiceCount || 0),
            sales: Number(row.sales || 0)
        }));
    }, [report]);
    const debtorTotal = useMemo(() => debtorRows.reduce((sum, row) => sum + row.debt, 0), [debtorRows]);
    const employeeSalesTotal = useMemo(() => employeeRows.reduce((sum, row) => sum + row.sales, 0), [employeeRows]);
    const normalizedHomeSearchQuery = useMemo(() => normalizeReportSearchText(deferredHomeSearchQuery), [deferredHomeSearchQuery]);
    const hasHomeSearchActivity = Boolean(normalizedHomeSearchQuery) || homeSearchFilter !== 'all' || homeSearchPaymentStatus !== 'all';
    const homeReportSearchResults = useMemo<HomeReportSearchResult[]>(() => {
        if (mode !== 'home' || !report || !hasHomeSearchActivity)
            return [];
        const query = normalizedHomeSearchQuery;
        const hasQuery = Boolean(query);
        const includesQuery = (parts: unknown[]) => !hasQuery || compactReportSearchText(parts).includes(query);
        const statusFilteredInvoiceRows = homeInvoiceRows.filter((row) => (homeSearchPaymentStatus === 'all' || row.paymentStatus === homeSearchPaymentStatus));
        const debtOnly = homeSearchFilter === 'debt';
        const invoiceRowsForFilter = debtOnly
            ? statusFilteredInvoiceRows.filter((row) => row.remainingAmount > 0)
            : statusFilteredInvoiceRows;
        const shouldInclude = (filter: HomeReportSearchFilter) => homeSearchFilter === 'all' || homeSearchFilter === filter || (debtOnly && (filter === 'invoice' || filter === 'customer'));
        const formatDate = (date: string) => formatReportDate(date, report.language, report);
        const results: HomeReportSearchResult[] = [];
        if (shouldInclude('invoice')) {
            invoiceRowsForFilter.forEach((row) => {
                const sourceInvoice = invoiceById.get(row.id);
                const itemLabels = (sourceInvoice?.items || []).map((item) => {
                    const medicine = medicineById.get(item.medicineId);
                    const unit = item.saleUnitLabel || item.saleUnitName || item.baseUnit || medicine?.unit || '';
                    const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
                    return `${medicine?.name || item.medicineId}${unit ? ` · ${formatExecutiveNumber(quantity)} ${unit}` : ''}`;
                });
                const statusLabel = getInvoiceStatusLabel(row.paymentStatus);
                if (!includesQuery([
                    row.invoiceLabel,
                    sourceInvoice?.invoiceNumber,
                    row.customerName,
                    row.sellerName,
                    row.date,
                    formatDate(row.date),
                    statusLabel,
                    row.finalAmount,
                    row.amountPaid,
                    row.remainingAmount,
                    itemLabels.join(' ')
                ])) {
                    return;
                }
                results.push({
                    id: `invoice-${row.id}`,
                    kind: 'invoice',
                    title: tr('Invoice', 'فاکتور') + ` ${row.invoiceLabel}`,
                    subtitle: `${row.customerName} · ${formatDate(row.date)} · ${statusLabel}`,
                    detail: itemLabels.length
                        ? itemLabels.slice(0, 4).join('، ')
                        : tr('No item detail is available.', 'جزئیات قلم ثبت نشده است.'),
                    invoiceId: row.id,
                    overlay: 'invoice_manager',
                    stats: [
                        { label: tr('Total', 'مجموع'), value: formatExecutiveNumber(row.finalAmount), tone: 'brand' },
                        { label: tr('Paid', 'پرداخت‌شده'), value: formatExecutiveNumber(row.amountPaid), tone: 'success' },
                        { label: tr('Remaining', 'باقی‌مانده'), value: formatExecutiveNumber(row.remainingAmount), tone: row.remainingAmount > 0 ? 'danger' : 'neutral' },
                        { label: tr('Seller', 'فروشنده'), value: row.sellerName, tone: 'neutral' }
                    ]
                });
            });
        }
        if (shouldInclude('customer')) {
            const customerGroups = new Map<string, {
                customerId: string;
                name: string;
                phone: string;
                invoices: HomeInvoiceRow[];
                total: number;
                paid: number;
                remaining: number;
            }>();
            invoiceRowsForFilter.forEach((row) => {
                const customer = customerById.get(row.customerId);
                const key = row.customerId || row.customerName;
                const current = customerGroups.get(key) || {
                    customerId: row.customerId,
                    name: customer?.name || row.customerName || '-',
                    phone: customer?.phone || '-',
                    invoices: [],
                    total: 0,
                    paid: 0,
                    remaining: 0
                };
                current.invoices.push(row);
                current.total += row.finalAmount;
                current.paid += row.amountPaid;
                current.remaining += row.remainingAmount;
                customerGroups.set(key, current);
            });
            Array.from(customerGroups.values()).forEach((group) => {
                const latestInvoice = group.invoices[0];
                const invoiceLabels = group.invoices.map((invoice) => invoice.invoiceLabel).join(' ');
                if (debtOnly && group.remaining <= 0)
                    return;
                if (!includesQuery([group.name, group.phone, invoiceLabels, group.total, group.remaining]))
                    return;
                results.push({
                    id: `customer-${group.customerId || group.name}`,
                    kind: 'customer',
                    title: tr('Customer summary', 'خلاصه مشتری') + `: ${group.name}`,
                    subtitle: `${tr('Latest invoice', 'آخرین فاکتور')}: ${latestInvoice?.invoiceLabel || '-'} · ${latestInvoice ? formatDate(latestInvoice.date) : '-'}`,
                    detail: group.phone !== '-' ? `${tr('Phone', 'شماره تماس')}: ${group.phone}` : tr('No phone number is saved.', 'شماره تماس ثبت نشده است.'),
                    invoiceId: latestInvoice?.id,
                    overlay: 'invoice_manager',
                    stats: [
                        { label: tr('Invoice count', 'تعداد فاکتور'), value: formatExecutiveNumber(group.invoices.length), tone: 'brand' },
                        { label: tr('Total sales', 'مجموع فروش'), value: formatExecutiveNumber(group.total), tone: 'brand' },
                        { label: tr('Paid', 'پرداخت‌شده'), value: formatExecutiveNumber(group.paid), tone: 'success' },
                        { label: tr('Remaining', 'باقی‌مانده'), value: formatExecutiveNumber(group.remaining), tone: group.remaining > 0 ? 'danger' : 'neutral' }
                    ]
                });
            });
        }
        if (shouldInclude('seller')) {
            const sellerGroups = new Map<string, {
                sellerId: string;
                name: string;
                invoices: HomeInvoiceRow[];
                total: number;
                remaining: number;
            }>();
            statusFilteredInvoiceRows.forEach((row) => {
                const current = sellerGroups.get(row.sellerId) || {
                    sellerId: row.sellerId,
                    name: row.sellerName,
                    invoices: [],
                    total: 0,
                    remaining: 0
                };
                current.invoices.push(row);
                current.total += row.finalAmount;
                current.remaining += row.remainingAmount;
                sellerGroups.set(row.sellerId, current);
            });
            Array.from(sellerGroups.values()).forEach((group) => {
                const latestInvoice = group.invoices[0];
                if (!includesQuery([group.name, group.sellerId, group.total, group.remaining]))
                    return;
                results.push({
                    id: `seller-${group.sellerId}`,
                    kind: 'seller',
                    title: tr('Seller summary', 'خلاصه فروشنده') + `: ${group.name}`,
                    subtitle: `${tr('Latest invoice', 'آخرین فاکتور')}: ${latestInvoice?.invoiceLabel || '-'}`,
                    detail: tr('Sales performance in the active report range.', 'عملکرد فروش در بازه فعال راپور.'),
                    invoiceId: latestInvoice?.id,
                    overlay: 'invoice_manager',
                    stats: [
                        { label: tr('Invoice count', 'تعداد فاکتور'), value: formatExecutiveNumber(group.invoices.length), tone: 'brand' },
                        { label: tr('Total sales', 'مجموع فروش'), value: formatExecutiveNumber(group.total), tone: 'success' },
                        { label: tr('Remaining', 'باقی‌مانده'), value: formatExecutiveNumber(group.remaining), tone: group.remaining > 0 ? 'danger' : 'neutral' }
                    ]
                });
            });
        }
        if (shouldInclude('product')) {
            const productGroups = new Map<string, {
                medicineId: string;
                name: string;
                manufacturer: string;
                type: string;
                invoiceIds: Set<string>;
                invoiceLabels: string[];
                quantity: number;
                amount: number;
                latestInvoiceId?: string;
            }>();
            statusFilteredInvoiceRows.forEach((row) => {
                const sourceInvoice = invoiceById.get(row.id);
                (sourceInvoice?.items || []).forEach((item) => {
                    const medicine = medicineById.get(item.medicineId);
                    const quantity = Math.max(0, Number(item.quantity) || 0);
                    const lineAmount = Math.max(0, (Number(item.price) || 0) * quantity);
                    const current = productGroups.get(item.medicineId) || {
                        medicineId: item.medicineId,
                        name: medicine?.name || item.medicineId,
                        manufacturer: medicine?.manufacturer || '-',
                        type: medicine?.type || '-',
                        invoiceIds: new Set<string>(),
                        invoiceLabels: [],
                        quantity: 0,
                        amount: 0,
                        latestInvoiceId: row.id
                    };
                    current.invoiceIds.add(row.id);
                    if (!current.invoiceLabels.includes(row.invoiceLabel))
                        current.invoiceLabels.push(row.invoiceLabel);
                    current.quantity += quantity;
                    current.amount += lineAmount;
                    productGroups.set(item.medicineId, current);
                });
            });
            Array.from(productGroups.values()).forEach((group) => {
                if (!includesQuery([group.name, group.manufacturer, group.type, group.medicineId]))
                    return;
                results.push({
                    id: `product-${group.medicineId}`,
                    kind: 'product',
                    title: tr('Product summary', 'خلاصه محصول') + `: ${group.name}`,
                    subtitle: `${group.manufacturer} · ${group.type}`,
                    detail: `${tr('Invoices', 'فاکتورها')}: ${group.invoiceLabels.slice(0, 5).join('، ') || '-'}`,
                    invoiceId: group.latestInvoiceId,
                    overlay: 'invoice_manager',
                    stats: [
                        { label: tr('Invoice count', 'تعداد فاکتور'), value: formatExecutiveNumber(group.invoiceIds.size), tone: 'brand' },
                        { label: tr('Quantity', 'تعداد'), value: formatExecutiveNumber(group.quantity), tone: 'neutral' },
                        { label: tr('Sales amount', 'مبلغ فروش'), value: formatExecutiveNumber(group.amount), tone: 'success' }
                    ]
                });
            });
        }
        if (homeSearchFilter === 'all' || homeSearchFilter === 'expense') {
            homeExpenseRows.forEach((expense) => {
                if (!includesQuery([
                    expense.title,
                    expense.category,
                    expense.description,
                    expense.recordedBy,
                    expense.date,
                    formatDate(expense.date),
                    expense.amount
                ])) {
                    return;
                }
                results.push({
                    id: `expense-${expense.id}`,
                    kind: 'expense',
                    title: tr('Expense', 'مصرف') + `: ${expense.title}`,
                    subtitle: `${expense.category} · ${formatDate(expense.date)}`,
                    detail: expense.description || tr('No description is saved.', 'توضیحات ثبت نشده است.'),
                    overlay: 'expense_manager',
                    stats: [
                        { label: tr('Amount', 'مبلغ'), value: formatExecutiveNumber(expense.amount), tone: 'danger' },
                        { label: tr('Recorded by', 'ثبت‌کننده'), value: expense.recordedBy, tone: 'neutral' }
                    ]
                });
            });
        }
        return results
            .sort((left, right) => {
            const priority = { invoice: 0, customer: 1, seller: 2, product: 3, expense: 4 };
            return priority[left.kind] - priority[right.kind];
        })
            .slice(0, 16);
    }, [
        customerById,
        getInvoiceStatusLabel,
        hasHomeSearchActivity,
        homeExpenseRows,
        homeInvoiceRows,
        homeSearchFilter,
        homeSearchPaymentStatus,
        invoiceById,
        medicineById,
        mode,
        normalizedHomeSearchQuery,
        report,
        tr
    ]);
    const homeSearchSuggestions = useMemo<HomeSearchSuggestion[]>(() => {
        if (mode !== 'home')
            return [];
        const suggestions: HomeSearchSuggestion[] = [];
        const latestInvoice = homeInvoiceRows[0];
        if (latestInvoice) {
            suggestions.push({
                id: 'latest-invoice',
                label: `${tr('Latest invoice', 'آخرین فاکتور')}: ${latestInvoice.invoiceLabel}`,
                query: latestInvoice.invoiceLabel,
                filter: 'invoice'
            });
        }
        const topDebtor = debtorRows[0];
        if (topDebtor) {
            suggestions.push({
                id: 'top-debtor',
                label: `${tr('Open debt', 'بدهی باز')}: ${topDebtor.customer}`,
                query: topDebtor.customer,
                filter: 'debt'
            });
        }
        const topSeller = employeeRows.find((row) => row.invoiceCount > 0);
        if (topSeller) {
            suggestions.push({
                id: 'top-seller',
                label: `${tr('Seller', 'فروشنده')}: ${topSeller.employee}`,
                query: topSeller.employee,
                filter: 'seller'
            });
        }
        const creditInvoice = homeInvoiceRows.find((row) => row.paymentStatus === 'credit' || row.paymentStatus === 'partial' || row.paymentStatus === 'unpaid');
        if (creditInvoice) {
            suggestions.push({
                id: 'credit-invoices',
                label: tr('Credit invoices', 'فاکتورهای نسیه'),
                query: '',
                filter: 'debt',
                paymentStatus: creditInvoice.paymentStatus
            });
        }
        const latestExpense = financialExpenseRows[0];
        if (latestExpense) {
            suggestions.push({
                id: 'latest-expense',
                label: `${tr('Expense', 'مصرف')}: ${latestExpense.title}`,
                query: latestExpense.title,
                filter: 'expense'
            });
        }
        const seen = new Set<string>();
        return suggestions.filter((suggestion) => {
            const key = `${suggestion.filter}:${suggestion.paymentStatus || 'all'}:${suggestion.query}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        }).slice(0, 5);
    }, [debtorRows, employeeRows, financialExpenseRows, homeInvoiceRows, mode, tr]);
    const openInvoiceFromHomeSearch = (invoiceId: string) => {
        const invoiceIndex = homeInvoiceRows.findIndex((row) => row.id === invoiceId);
        const pageSize = INVOICE_TABLE_PAGE_SIZES['invoice-manager'];
        const nextPage = invoiceIndex >= 0 ? Math.floor(invoiceIndex / pageSize) + 1 : 1;
        setActiveTab('financial');
        setActiveFinancialOverlay('invoice_manager');
        setInvoiceManagerFilters(DEFAULT_INVOICE_MANAGER_FILTERS);
        setInvoiceTablePages((current) => ({ ...current, 'invoice-manager': nextPage }));
        setHighlightedInvoiceId(invoiceId);
        setPendingDeleteAction(null);
        setOpenInvoiceActionMenuId(null);
    };
    const openHomeSearchResult = (result: HomeReportSearchResult) => {
        if (result.invoiceId) {
            openInvoiceFromHomeSearch(result.invoiceId);
            return;
        }
        if (result.overlay === 'expense_manager') {
            setActiveTab('financial');
            setActiveFinancialOverlay('expense_manager');
            setHighlightedInvoiceId(null);
            setPendingDeleteAction(null);
        }
    };
    const applyHomeSearchSuggestion = (suggestion: HomeSearchSuggestion) => {
        setHomeSearchQuery(suggestion.query);
        setHomeSearchFilter(suggestion.filter);
        setHomeSearchPaymentStatus(suggestion.paymentStatus || 'all');
    };
    const renderClassicTabContent = () => {
        if (!report)
            return null;
        if (currentTab === 'financial') {
            return (<>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {financialCards.map((card) => (<ClassicMetricCard key={card.key} title={card.title} value={card.value} note={card.note} theme={card.theme} icon={card.icon} onClick={card.onClick} actionHint={card.actionHint} kicker={card.kicker} ctaLabel={card.ctaLabel} isEnglish={isEnglish}/>))}
          </div>
          <div data-testid="reports-home-chart-grid" className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.95fr)]">
            <ClassicPanel className="wk-reports-finance-panel" title={tr('Financial Pulse', 'نبض مالی و وصول')} subtitle={tr('Sales, collection, and gross profit in the selected range.', 'فروش، وصول و مفاد ناخالص در همین بازه.')} accentClass="bg-blue-500" headerMeta={<span className={HOME_MUTED_BADGE}>{tr('Invoices', 'فاکتورها')}: {formatExecutiveNumber(homeInvoiceSummary.count)}</span>} compactChartSpacing>
              <div className="wk-reports-finance-chart-slot h-[304px] max-[559px]:h-[308px]" dir="ltr">
                <ExecutiveFinanceHeroChart data={executiveHeroChartData} numberLocale={numberLocale} emptyText={tr('No financial movement was recorded in this range.', 'برای این بازه حرکت مالی ثبت نشده است.')} labels={{
                    grossSales: tr('Gross sales', 'فروش ناخالص'),
                    collected: tr('Collected', 'وصول‌شده'),
                    grossProfit: tr('Gross profit', 'مفاد ناخالص'),
                    invoiceCount: tr('Invoices', 'تعداد فاکتورها')
                }}/>
              </div>
            </ClassicPanel>
            <ClassicPanel className="wk-reports-profit-panel" title={tr('Profit Mix', 'ترکیب مفاد و ضرر')} subtitle={tr('Cost, expenses, and final outcome in one view.', 'مفاد، بهای تمام‌شده و مصارف در یک نگاه.')} 
            // #5: accent bar now tracks the real outcome — emerald when the net
            // result is healthy (profit), rose only when it is a loss — so the
            // colour never contradicts the "سالم/ضرر" status badge beside it.
            accentClass={profitStudioSummary.netProfit >= 0 ? 'bg-emerald-500' : 'bg-rose-500'} headerMeta={<StatusBadge label={profitStudioSummary.netProfit >= 0 ? tr('Healthy', 'سالم') : tr('Loss', 'ضرر')} tone={profitStudioSummary.netProfit >= 0 ? 'success' : 'danger'}/>}>
              <div className="wk-reports-profit-chart-slot h-[304px] max-[559px]:h-[308px]" dir="ltr">
                <ExecutiveProfitMixDonut segments={profitMixSegments} numberLocale={numberLocale} netAmount={profitStudioSummary.netProfit} margin={profitStudioSummary.margin} baseAmount={profitStudioSummary.netSales} emptyText={tr('Financial mix will appear after sales or expenses are recorded.', 'پس از ثبت فروش یا مصرف، ترکیب مالی در اینجا نمایش داده می‌شود.')} labels={{
                    netSales: tr('Net sales base', 'پایه فروش خالص'),
                    profit: tr('Profit', 'مفاد'),
                    loss: tr('Loss', 'ضرر')
                }}/>
              </div>
            </ClassicPanel>
          </div>
        </>);
        }
        if (currentTab === 'inventory') {
            const productChart = getChart('inventory', 'inventory-top-products');
            return (<div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.38fr,0.88fr]">
          <ClassicPanel title={tr('Top Products (Count)', '5 محصول پرفروش (تعداد)')} subtitle={tr('A quick ranked view of the strongest-selling items in the selected range.', 'مرتب‌سازی سریع اقلام پرفروش بر مبنای تعداد فروش در بازه انتخاب‌شده.')} eyebrow={tr('Inventory momentum', 'شتاب انبار')} accentClass="bg-emerald-500">
            <div className="h-[368px]" dir="ltr">
              <ExecutiveProductsChart chart={productChart} numberLocale={numberLocale} emptyText={tr('No product sales were recorded in this range.', 'برای این بازه داده‌ای موجود نیست')}/>
            </div>
          </ClassicPanel>
          <div className="space-y-4">
            {inventoryAlerts.map((card) => (<ClassicStatusCard key={card.key} title={card.title} note={card.note} value={card.value} tone={card.tone} statusLabel={card.statusLabel}/>))}
          </div>
        </div>);
        }
        if (currentTab === 'customers') {
            return (<ClassicPanel title={tr('Top Debtors', 'بدهکارترین مشتریان')} subtitle={tr('Customers with the highest open balances, ordered for fast follow-up.', 'مرتب‌شده بر اساس بیشترین مانده بدهی برای پیگیری سریع‌تر.')} eyebrow={tr('Customer debt watch', 'پایش بدهی مشتریان')} accentClass="bg-slate-300" headerMeta={<div className="flex flex-col items-end gap-2">
              <span className={HOME_MUTED_BADGE}>{tr('Rows', 'ردیف‌ها')}: {formatExecutiveNumber(debtorRows.length)}</span>
              <span className={`${HOME_MUTED_BADGE} text-rose-700`}>{tr('Open debt', 'بدهی باز')}: {formatExecutiveNumber(debtorTotal)}</span>
            </div>}>
          {debtorRows.length ? (<GlassTableShell>
              <div className="wk-table-scroll--compact overflow-auto">
                <table className="min-w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-[46%]"/>
                    <col className="w-[24%]"/>
                    <col className="w-[30%]"/>
                  </colgroup>
                  <thead className="bg-white/82 text-slate-500 backdrop-blur-md">
                    <tr>
                      <th className="px-4 py-3 text-right text-[13px] font-black">{tr('Name', 'نام')}</th>
                      <th className="px-4 py-3 text-right text-[13px] font-black">{tr('Phone', 'شماره تماس')}</th>
                      <th className="px-4 py-3 text-right text-[13px] font-black">{tr('Debt', 'میزان بدهی')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/70 bg-white/52">
                    {debtorRows.map((row, index) => (<tr key={row.id} className="transition duration-200 hover:bg-white/78">
                        <td className="px-4 py-3.5 align-top text-right">
                          <div className="grid grid-cols-[minmax(0,1fr)_36px] items-start gap-3">
                            <div className="min-w-0 text-right">
                              <p className="truncate text-[15px] font-black text-slate-900">{row.customer}</p>
                              <div className="mt-1.5 flex justify-end">
                                <StatusBadge label={row.debt >= 50000
                            ? tr('Critical', 'بحرانی')
                            : row.debt >= 20000
                                ? tr('Watch', 'هشدار')
                                : tr('Open balance', 'مانده باز')} tone={row.debt >= 50000 ? 'danger' : row.debt >= 20000 ? 'warning' : 'neutral'}/>
                              </div>
                            </div>
                            <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-white/84 text-xs font-black text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-md">
                              {index + 1}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 align-top text-right text-sm font-semibold text-slate-600 tabular-nums" dir="ltr">
                          <span className="inline-flex rounded-full border border-slate-200/80 bg-white/78 px-3 py-1 font-mono shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]">{row.phone}</span>
                        </td>
                        <td className="px-4 py-3.5 align-top text-right">
                          <div className="flex flex-col items-end gap-1.5">
                            <span className="inline-flex rounded-full border border-rose-100/75 bg-rose-50/72 px-3 py-1.5 text-[16px] font-black text-rose-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-md tabular-nums">
                              {formatExecutiveNumber(row.debt)}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-500">{tr('Needs follow-up', 'نیازمند پیگیری')}</span>
                          </div>
                        </td>
                      </tr>))}
                  </tbody>
                </table>
              </div>
            </GlassTableShell>) : (<ClassicEmptyState text={tr('No customer debt is available in this range.', 'در این بازه بدهی ثبت‌شده‌ای برای مشتریان وجود ندارد.')}/>)}
        </ClassicPanel>);
        }
        return (<ClassicPanel title={tr('Employee Sales Performance', 'عملکرد فروش کاربران')} subtitle={tr('A cleaner view of invoice volume and sales output for each user.', 'نمایی خواناتر از تعداد فاکتور و مجموع فروش هر کاربر.')} eyebrow={tr('Team performance', 'عملکرد تیم')} accentClass="bg-slate-300" headerMeta={<div className="flex flex-col items-end gap-2">
            <span className={HOME_MUTED_BADGE}>{tr('Rows', 'ردیف‌ها')}: {formatExecutiveNumber(employeeRows.length)}</span>
            <span className={`${HOME_MUTED_BADGE} text-emerald-700`}>{tr('Total sales', 'مجموع فروش')}: {formatExecutiveNumber(employeeSalesTotal)}</span>
          </div>}>
        {employeeRows.length ? (<GlassTableShell>
            <div className="wk-table-scroll--compact overflow-auto">
              <table className="min-w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[46%]"/>
                  <col className="w-[22%]"/>
                  <col className="w-[32%]"/>
                </colgroup>
                <thead className="bg-white/82 text-slate-500 backdrop-blur-md">
                  <tr>
                    <th className="px-4 py-3 text-right text-[13px] font-black">{tr('Name', 'نام')}</th>
                    <th className="px-4 py-3 text-right text-[13px] font-black">{tr('Invoice Count', 'تعداد فاکتور')}</th>
                    <th className="px-4 py-3 text-right text-[13px] font-black">{tr('Total Sales', 'مجموع فروش')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/70 bg-white/52">
                  {employeeRows.map((row) => (<tr key={row.id} className="transition duration-200 hover:bg-white/78">
                      <td className="px-4 py-3.5 align-top text-right">
                        <div className="space-y-1.5">
                          <p className="truncate text-[15px] font-black text-slate-900">{row.employee}</p>
                          <StatusBadge label={row.invoiceCount > 0 ? tr('Active', 'فعال') : tr('No sales', 'بدون فروش')} tone={row.invoiceCount > 0 ? 'success' : 'neutral'}/>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-top text-right text-[15px] font-semibold text-slate-600 tabular-nums">{formatExecutiveNumber(row.invoiceCount)}</td>
                      <td className="px-4 py-3.5 align-top text-right">
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="inline-flex rounded-full border border-emerald-100/75 bg-emerald-50/72 px-3 py-1.5 text-[16px] font-black text-emerald-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-md tabular-nums">
                            {formatExecutiveNumber(row.sales)}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500">
                            {row.invoiceCount > 0 ? tr('Performance recorded', 'عملکرد ثبت شده') : tr('Awaiting activity', 'در انتظار فعالیت')}
                          </span>
                        </div>
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </GlassTableShell>) : (<ClassicEmptyState text={tr('No employee performance is available in this range.', 'در این بازه عملکردی برای کاربران ثبت نشده است.')}/>)}
      </ClassicPanel>);
    };
    if (mode === 'home') {
        const selectedInvoiceCount = selectedInvoiceIds.size;
        const pendingInvoiceDeleteCount = pendingDeleteAction?.kind === 'invoices' ? pendingDeleteAction.ids.length : 0;
        const reportLanguage = report?.language || language;
        const invoiceCurrencyCode: Currency = report?.currencyCode || settings?.currencySettings?.baseCurrency || 'AFN';
        const activeHomeRangeLabel = homeRangeOptions.find((option) => option.value === filters.preset)?.label || homeRangeOptions[0]?.label || '';
        const editingExpense = expenseEditorState?.mode === 'edit'
            ? homeExpenseRows.find((row) => row.id === expenseEditorState.expenseId) || null
            : null;
        const homeModalPanelClassName = 'wk-home-report-modal-panel rounded-[32px] border border-white/80 bg-gradient-to-br from-white/84 via-white/72 to-white/62 shadow-[0_40px_100px_-40px_rgba(15,23,42,0.75)] backdrop-blur-2xl';
        const homeModalHeaderClassName = 'wk-home-report-modal-header relative flex items-center justify-between border-b border-white/70 bg-white/56 px-6 py-5 backdrop-blur-xl';
        const homeModalBodyClassName = 'wk-home-report-modal-body min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.10),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.72),rgba(248,250,252,0.82))] px-6 py-5 custom-scrollbar';
        const homeModalFooterClassName = 'wk-home-report-modal-footer border-t border-white/70 bg-white/56 p-4 backdrop-blur-xl';
        const homeModalOverlayClassName = 'wk-home-report-modal-overlay fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/32 p-2 backdrop-blur-md sm:p-4';
        const invoiceManagerModalOverlayClassName = 'wk-invoice-manager-modal-overlay fixed inset-0 z-[180] flex items-stretch justify-center bg-slate-950/72 px-2 pb-2 pt-[calc(var(--wk-titlebar-height)+8px)] backdrop-blur-xl sm:px-3 sm:pb-3 sm:pt-[calc(var(--wk-titlebar-height)+10px)]';
        const invoiceManagerChildOverlayClassName = 'wk-home-report-modal-overlay fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/42 p-2 backdrop-blur-md sm:p-4';
        const invoiceManagerModalPanelClassName = 'wk-invoice-manager-modal-panel overflow-hidden rounded-[28px] border border-white/80 bg-slate-50 bg-white/72 shadow-[0_42px_110px_-46px_rgba(2,6,23,0.92),inset_0_1px_0_rgba(255,255,255,0.98)] ring-1 ring-slate-900/5 backdrop-blur-2xl';
        const invoiceManagerModalHeaderClassName = 'wk-home-report-modal-header wk-invoice-manager-modal-header sticky top-0 z-30 flex min-h-[68px] shrink-0 items-center justify-between border-b border-white/76 bg-white/68 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.98)] backdrop-blur-2xl sm:px-5';
        const invoiceManagerModalBodyClassName = 'wk-home-report-modal-body wk-invoice-manager-modal-body min-h-0 flex flex-1 flex-col overflow-hidden overscroll-contain bg-white/40 px-3 py-3.5 backdrop-blur-xl sm:px-4';
        const homeSearchFilterOptions: Array<{
            value: HomeReportSearchFilter;
            label: string;
        }> = [
            { value: 'all', label: tr('All', 'همه') },
            { value: 'invoice', label: tr('Invoices', 'فاکتورها') },
            { value: 'customer', label: tr('Customers', 'مشتریان') },
            { value: 'seller', label: tr('Sellers', 'فروشندگان') },
            { value: 'product', label: tr('Products', 'محصولات') },
            { value: 'expense', label: tr('Expenses', 'مصارف') },
            { value: 'debt', label: tr('Debt', 'بدهی') }
        ];
        const homeSearchPaymentStatusOptions: Array<{
            value: HomeSearchPaymentStatus;
            label: string;
        }> = [
            { value: 'all', label: tr('All statuses', 'همه وضعیت‌ها') },
            { value: 'cash', label: getInvoiceStatusLabel('cash') },
            { value: 'paid', label: getInvoiceStatusLabel('paid') },
            { value: 'partial', label: getInvoiceStatusLabel('partial') },
            { value: 'credit', label: getInvoiceStatusLabel('credit') },
            { value: 'unpaid', label: getInvoiceStatusLabel('unpaid') },
            { value: 'card', label: getInvoiceStatusLabel('card') },
            { value: 'mixed', label: getInvoiceStatusLabel('mixed') }
        ];
        const homeSearchKindMeta: Record<HomeReportSearchResultKind, {
            label: string;
            tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
        }> = {
            invoice: { label: tr('Invoice', 'فاکتور'), tone: 'info' },
            customer: { label: tr('Customer', 'مشتری'), tone: 'success' },
            seller: { label: tr('Seller', 'فروشنده'), tone: 'neutral' },
            product: { label: tr('Product', 'محصول'), tone: 'warning' },
            expense: { label: tr('Expense', 'مصرف'), tone: 'danger' }
        };
        const getHomeSearchStatClass = (tone: HomeReportSearchStatTone = 'neutral') => {
            if (tone === 'brand')
                return 'border-brand-100/80 bg-brand-50/70 text-brand-700';
            if (tone === 'success')
                return 'border-emerald-100/80 bg-emerald-50/70 text-emerald-700';
            if (tone === 'danger')
                return 'border-rose-100/80 bg-rose-50/70 text-rose-700';
            if (tone === 'warning')
                return 'border-amber-100/80 bg-amber-50/70 text-amber-700';
            return 'border-slate-200/75 bg-white/72 text-slate-600';
        };
        const clearHomeSearch = () => {
            setHomeSearchQuery('');
            setHomeSearchFilter('all');
            setHomeSearchPaymentStatus('all');
        };
        const compactHomeControlShellClass = 'relative min-w-0';
        const compactHomeControlLabelClass = 'pointer-events-none absolute right-2.5 top-0.5 z-10 max-w-[calc(100%-1.25rem)] truncate text-[8.5px] font-black leading-3 text-slate-500';
        const compactHomeInputClass = 'wk-input !h-9 !min-h-0 rounded-[12px] border-white/80 bg-white/88 pb-0.5 pt-[14px] text-[12px] font-black leading-4 shadow-[0_8px_18px_-16px_rgba(15,23,42,0.55),inset_0_1px_0_rgba(255,255,255,0.92)]';
        const compactHomeSelectClass = 'wk-select !h-9 !min-h-0 rounded-[12px] border-white/80 bg-white/86 pb-0.5 pt-[14px] text-[12px] font-black leading-4 shadow-[0_8px_18px_-16px_rgba(15,23,42,0.45),inset_0_1px_0_rgba(255,255,255,0.92)]';
        const renderHomeReportSearchPanel = () => (<div data-testid="reports-home-search-panel" className={`${HOME_GLASS_SHELL} wk-reports-search-panel bg-gradient-to-br from-white/90 via-brand-50/50 to-cyan-50/50 px-2 py-0.5 sm:px-2.5 xl:grid xl:grid-cols-[200px_minmax(0,1fr)] xl:items-center xl:gap-x-2`}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-500 via-cyan-400 to-emerald-400"/>

        <div className="wk-reports-search-heading relative flex min-w-0 flex-wrap items-center justify-end gap-px sm:gap-0.5 xl:justify-start">
          <h2 className="order-1 min-w-0 pr-1.5 text-[16px] font-black leading-5 text-slate-900 sm:text-[18px]">{tr('Report Search', 'جستجوی راپورها')}</h2>
        </div>

        <div className="relative mt-px grid grid-cols-2 gap-px lg:grid-cols-[minmax(210px,1fr)_104px_104px_120px_72px] lg:items-end xl:mt-0 xl:grid-cols-[minmax(220px,1fr)_112px_112px_132px_76px]">
          <label className={`${compactHomeControlShellClass} col-span-2 lg:col-span-1`}>
            <span className={compactHomeControlLabelClass}>{tr('Report search', 'جستجوی راپورها')}</span>
            <input type="text" value={homeSearchQuery} onChange={(event) => setHomeSearchQuery(event.target.value)} placeholder={tr('Invoice number, customer, seller, product, expense...', 'نمبر فاکتور، مشتری، فروشنده، محصول، مصرف...')} aria-label={tr('Report search', 'جستجوی راپورها')} dir={isEnglish ? 'ltr' : 'rtl'} className={compactHomeInputClass}/>
          </label>
          <label className={compactHomeControlShellClass}>
            <span className={compactHomeControlLabelClass}>{tr('Period', 'دوره')}</span>
            <select value={filters.preset} onChange={(event) => updateFilter('preset', event.target.value as ReportFilters['preset'])} aria-label={tr('Period', 'دوره')} className={compactHomeSelectClass}>
              {homeRangeOptions.map((option) => (<option key={option.value} value={option.value}>
                  {option.label}
                </option>))}
            </select>
          </label>
          <label className={compactHomeControlShellClass}>
            <span className={compactHomeControlLabelClass}>{tr('Search filter', 'فیلتر جستجو')}</span>
            <select value={homeSearchFilter} onChange={(event) => setHomeSearchFilter(event.target.value as HomeReportSearchFilter)} aria-label={tr('Search filter', 'فیلتر جستجو')} className={compactHomeSelectClass}>
              {homeSearchFilterOptions.map((option) => (<option key={option.value} value={option.value}>
                  {option.label}
                </option>))}
            </select>
          </label>
          <label className={compactHomeControlShellClass}>
            <span className={compactHomeControlLabelClass}>{tr('Payment status', 'وضعیت پرداخت')}</span>
            <select value={homeSearchPaymentStatus} onChange={(event) => setHomeSearchPaymentStatus(event.target.value as HomeSearchPaymentStatus)} aria-label={tr('Payment status', 'وضعیت پرداخت')} className={compactHomeSelectClass}>
              {homeSearchPaymentStatusOptions.map((option) => (<option key={option.value} value={option.value}>
                  {option.label}
                </option>))}
            </select>
          </label>
          <div className="flex min-w-0 items-end justify-start sm:justify-end">
            <GlassActionButton label={tr('Clear', 'پاک‌کردن')} tone="ghost" disabled={!hasHomeSearchActivity} className="h-9 w-full min-w-[76px] rounded-[12px] border-slate-200/70 bg-white/60 px-2.5 py-0 text-[10.5px] text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] hover:bg-white/80 sm:w-auto" onClick={clearHomeSearch}/>
          </div>
        </div>

        {homeSearchSuggestions.length ? (<div className="relative mt-px flex gap-px overflow-x-auto pb-0 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:justify-end sm:overflow-visible xl:col-span-2 [&::-webkit-scrollbar]:hidden">
            {homeSearchSuggestions.map((suggestion) => (<button key={suggestion.id} type="button" onClick={() => applyHomeSearchSuggestion(suggestion)} className="shrink-0 rounded-full border border-white/72 bg-white/68 px-1.5 py-0 text-[9px] font-black leading-[14px] text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] transition hover:bg-white hover:text-brand-700 focus:outline-hidden focus:ring-2 focus:ring-brand-200">
                {suggestion.label}
              </button>))}
          </div>) : null}

        {hasHomeSearchActivity ? (<div className="wk-reports-search-results-popover rounded-[14px] border border-white/70 bg-white/86 shadow-[0_26px_60px_-32px_rgba(15,23,42,0.52),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-2xl xl:col-span-2">
            {homeReportSearchResults.length ? (<div className="divide-y divide-white/70">
                {homeReportSearchResults.map((result) => {
                        const kindMeta = homeSearchKindMeta[result.kind];
                        return (<div key={result.id} data-testid="reports-home-search-result" className="grid grid-cols-1 gap-4 px-4 py-4 transition hover:bg-white/58 lg:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="min-w-0 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <StatusBadge label={kindMeta.label} tone={kindMeta.tone}/>
                          <p className="min-w-0 truncate text-[16px] font-black text-slate-900">{result.title}</p>
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold text-slate-600">{result.subtitle}</p>
                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                          {result.stats.map((stat) => (<span key={`${result.id}-${stat.label}`} className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black ${getHomeSearchStatClass(stat.tone)}`}>
                              <span className="text-slate-500">{stat.label}</span>
                              <span className="min-w-0 truncate">{stat.value}</span>
                            </span>))}
                        </div>
                      </div>
                      <div className="flex items-center justify-end">
                        <GlassActionButton label={result.overlay === 'expense_manager' ? tr('Open expenses', 'دیدن مصارف') : tr('Open invoice', 'دیدن فاکتور')} tone="primary" className="whitespace-nowrap px-4 py-2.5 text-xs" onClick={() => openHomeSearchResult(result)}/>
                      </div>
                    </div>);
                    })}
              </div>) : (<div className="px-2 py-1.5">
                <ClassicEmptyState compact text={tr('No matching report data was found.', 'نتیجه‌ای مطابق جستجو یافت نشد.')}/>
              </div>)}
          </div>) : null}
      </div>);
        const renderInvoiceRowsTable = (rows: HomeInvoiceRow[], modeVariant: InvoiceTableVariant) => {
            const pageSize = INVOICE_TABLE_PAGE_SIZES[modeVariant];
            const totalRows = rows.length;
            const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
            const currentPage = Math.min(Math.max(invoiceTablePages[modeVariant] || 1, 1), totalPages);
            const startIndex = (currentPage - 1) * pageSize;
            const visibleRows = rows.slice(startIndex, startIndex + pageSize);
            const visibleRowIds = visibleRows.map((row) => row.id);
            const allVisibleInvoicesSelected = visibleRowIds.length > 0 && visibleRowIds.every((id) => selectedInvoiceIds.has(id));
            const endIndex = startIndex + visibleRows.length;
            const formatInvoiceMoney = (value: number) => formatInvoiceManagerMoney(value, reportLanguage, invoiceCurrencyCode);
            const setInvoiceTablePage = (nextPage: number) => {
                setOpenInvoiceActionMenuId(null);
                setSellerTransferEditorInvoiceId(null);
                setInvoiceTablePages((current) => ({
                    ...current,
                    [modeVariant]: Math.min(Math.max(nextPage, 1), totalPages)
                }));
            };
            const tableMinWidth = modeVariant === 'invoice-manager'
                ? 'min-w-[1120px]'
                : modeVariant === 'profit-studio'
                    ? 'min-w-[1100px]'
                    : 'min-w-[1120px]';
            const emptyText = modeVariant === 'invoice-manager' && hasActiveInvoiceManagerFilters
                ? tr('No invoice matches the current filters.', 'هیچ فاکتوری مطابق فیلترهای فعلی یافت نشد.')
                : tr('No invoice was found for this range.', 'برای این بازه فاکتوری یافت نشد');
            const paginationControls = (<PaginationControls summaryLabel={`${tr('Rows on this page', '\u0631\u062f\u06cc\u0641 \u0647\u0627\u06cc \u0627\u06cc\u0646 \u0635\u0641\u062d\u0647')}: ${formatExecutiveNumber(startIndex + 1)}-${formatExecutiveNumber(endIndex)} ${tr('of', '\u0627\u0632')} ${formatExecutiveNumber(totalRows)}`} pageLabel={`${tr('Page', '\u0635\u0641\u062d\u0647')} ${formatExecutiveNumber(currentPage)} ${tr('of', '\u0627\u0632')} ${formatExecutiveNumber(totalPages)}`} previousLabel={tr('Previous', '\u0642\u0628\u0644\u06cc')} nextLabel={tr('Next', '\u0628\u0639\u062f\u06cc')} currentPage={currentPage} totalPages={totalPages} onPrevious={() => setInvoiceTablePage(currentPage - 1)} onNext={() => setInvoiceTablePage(currentPage + 1)} testId={`invoice-${modeVariant}-pager-actions`}/>);
            return (<GlassTableShell variant={modeVariant === 'invoice-manager' ? 'flat' : 'glass'} className={modeVariant === 'invoice-manager' ? 'wk-invoice-manager-table-shell min-h-0 flex flex-1 flex-col' : ''}>
            {totalRows ? (<>
                {modeVariant === 'invoice-manager' && isCompactInvoiceViewport ? (<InvoiceManagerScrollFrame testId={`invoice-${modeVariant}-scroll`} className="wk-invoice-manager-table-scroll min-h-0 flex-1 overflow-auto overscroll-contain rounded-lg border border-white/72 bg-white/56 p-2 custom-scrollbar wk-invoice-manager-scrollbar shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl" header={paginationControls} contentDir={isEnglish ? 'ltr' : 'rtl'}>
                    <div className="space-y-2">
                      {visibleRows.map((invoice) => {
                            const isHighlighted = highlightedInvoiceId === invoice.id;
                            const isSelected = selectedInvoiceIds.has(invoice.id);
                            const hasOpenActionMenu = openInvoiceActionMenuId === invoice.id;
                            const formattedDate = formatReportDate(invoice.date, reportLanguage, report);
                            const isTransferEditorOpen = canTransferInvoiceRows && sellerTransferEditorInvoiceId === invoice.id;
                            const hasSellerOption = sellerTransferOptions.some((option) => option.value === invoice.sellerId);
                            const hasPaidAmount = invoice.amountPaid > 0;
                            const hasRemainingAmount = invoice.remainingAmount > 0;
                            return (<article key={invoice.id} data-testid={`invoice-row-${invoice.id}`} className={`rounded-2xl border bg-white p-3 shadow-[0_14px_30px_-30px_rgba(15,23,42,0.4)] transition ${isHighlighted || hasOpenActionMenu ? 'border-brand-200 bg-brand-50/80 ring-2 ring-brand-200/70' : isSelected ? 'border-brand-100 bg-brand-50/55 ring-1 ring-brand-200/70' : 'border-slate-200/80'}`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-2">
                                {canDeleteInvoiceRows ? (<input type="checkbox" aria-label={tr(`Select ${invoice.invoiceLabel}`, `انتخاب ${invoice.invoiceLabel}`)} checked={isSelected} onChange={() => toggleInvoiceSelection(invoice.id)} className="mt-1 h-5 w-5 cursor-pointer rounded border-slate-300 text-brand-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300"/>) : null}
                                <div className="min-w-0">
                                  <p className="truncate text-left text-sm font-black text-slate-900 tabular-nums" dir="ltr" title={invoice.invoiceLabel}>{invoice.invoiceLabel}</p>
                                  <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500" title={formattedDate}>{formattedDate}</p>
                                </div>
                              </div>
                              <InvoiceRowActionMenu menuKey={invoice.id} invoiceLabel={invoice.invoiceLabel} isOpen={openInvoiceActionMenuId === invoice.id} canEdit={canEditInvoiceRows} canDelete={canDeleteInvoiceRows} canTransfer={canTransferInvoiceRows && modeVariant === 'invoice-manager'} labels={{
                                    actions: tr('Actions', 'عملیات'),
                                    view: tr('View', 'دیدن'),
                                    edit: tr('Edit', 'ویرایش'),
                                    delete: tr('Delete', 'حذف'),
                                    transfer: tr('Transfer seller', 'انتقال فروشنده')
                                }} onToggle={() => setOpenInvoiceActionMenuId((current) => (current === invoice.id ? null : invoice.id))} onClose={() => setOpenInvoiceActionMenuId((current) => (current === invoice.id ? null : current))} onView={() => setInvoicePreviewId(invoice.id)} onEdit={() => openInvoiceEdit(invoice.id)} onDelete={() => requestDeleteInvoices([invoice.id])} onTransfer={() => setSellerTransferEditorInvoiceId(invoice.id)}/>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-right">
                              <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                                <p className="text-[10px] font-black text-slate-400">{tr('Customer', 'مشتری')}</p>
                                <p className="mt-1 truncate text-xs font-black text-slate-800" title={invoice.customerName}>{invoice.customerName}</p>
                              </div>
                              <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                                <p className="text-[10px] font-black text-slate-400">
                                  {tr('Seller', 'فروشنده')}
                                </p>
                                {isTransferEditorOpen ? (<select aria-label={tr(`Transfer seller for ${invoice.invoiceLabel}`, `تغییر فروشنده ${invoice.invoiceLabel}`)} value={hasSellerOption ? invoice.sellerId : ''} disabled={transferringSellerInvoiceId === invoice.id} title={invoice.sellerName} onChange={(event) => void handleTransferInvoiceSeller(invoice.id, event.target.value, invoice.sellerId)} className="mt-1 h-8 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs font-black text-slate-800 outline-hidden transition focus:border-brand-300 focus:ring-2 focus:ring-brand-200/80 disabled:cursor-wait disabled:opacity-60">
                                    {!hasSellerOption ? (<option value="">{invoice.sellerName}</option>) : null}
                                    {sellerTransferOptions.map((option) => (<option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>))}
                                  </select>) : (<p className="mt-1 truncate text-xs font-black text-slate-800" title={invoice.sellerName}>{invoice.sellerName}</p>)}
                              </div>
                              <div className={`rounded-xl border px-3 py-2 ${hasPaidAmount ? 'border-emerald-100 bg-emerald-50/70' : 'border-slate-100 bg-slate-50/80'}`}>
                                <p className={`text-[10px] font-black ${hasPaidAmount ? 'text-emerald-500' : 'text-slate-400'}`}>{tr('Paid', 'پرداخت‌شده')}</p>
                                <p className={`mt-1 text-left text-xs font-black tabular-nums ${hasPaidAmount ? 'text-emerald-700' : 'text-slate-500'}`} dir="ltr">{formatInvoiceMoney(invoice.amountPaid)}</p>
                              </div>
                              <div className={`rounded-xl border px-3 py-2 ${hasRemainingAmount ? 'border-rose-100 bg-rose-50/60' : 'border-slate-100 bg-slate-50/80'}`}>
                                <p className={`text-[10px] font-black ${hasRemainingAmount ? 'text-rose-500' : 'text-slate-400'}`}>{tr('Remaining', 'باقی‌مانده')}</p>
                                <p className={`mt-1 text-left text-xs font-bold tabular-nums ${hasRemainingAmount ? 'text-rose-600' : 'text-slate-500'}`} dir="ltr">{formatInvoiceMoney(invoice.remainingAmount)}</p>
                              </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <InvoiceStatusBadge label={getInvoiceStatusLabel(invoice.paymentStatus)} status={invoice.paymentStatus} detail={`${tr('Remaining', 'باقی‌مانده')}: ${formatInvoiceMoney(invoice.remainingAmount)}`}/>
                              {transferringSellerInvoiceId === invoice.id ? (<span className="truncate text-[10px] font-semibold text-slate-400">
                                  {tr('Updating calculations...', 'در حال به‌روزرسانی محاسبات...')}
                                </span>) : null}
                            </div>
                          </article>);
                        })}
                    </div>
                  </InvoiceManagerScrollFrame>) : (<InvoiceManagerScrollFrame testId={`invoice-${modeVariant}-scroll`} className={`${modeVariant === 'invoice-manager' ? 'wk-invoice-manager-table-scroll min-h-0 flex-1' : 'max-h-[min(62vh,680px)]'} overflow-auto overscroll-contain rounded-lg border border-white/72 bg-white/60 custom-scrollbar ${modeVariant === 'invoice-manager' ? 'wk-invoice-manager-scrollbar shadow-[inset_0_1px_0_rgba(255,255,255,0.94)] backdrop-blur-xl' : ''}`} header={paginationControls} contentDir={isEnglish ? 'ltr' : 'rtl'}>
                  <table className={`${tableMinWidth} w-full border-separate border-spacing-0 ${modeVariant === 'invoice-manager' ? 'table-fixed text-[13px]' : 'text-sm'}`}>
                    {modeVariant === 'invoice-manager' ? (<colgroup>
                        {canDeleteInvoiceRows ? <col className="w-[46px]"/> : null}
                        <col className="w-[122px]"/>
                        <col className="w-[142px]"/>
                        <col className="w-[210px]"/>
                        <col className="w-[184px]"/>
                        <col className="w-[132px]"/>
                        <col className="w-[132px]"/>
                        <col className="w-[126px]"/>
                        <col className="w-[126px]"/>
                      </colgroup>) : null}
                    <thead className="sticky top-0 z-10 text-[11px] text-slate-500 shadow-[0_1px_0_rgba(226,232,240,0.84)]">
                      <tr>
                        {modeVariant !== 'profit-studio' && canDeleteInvoiceRows ? (<th scope="col" className="bg-white/74 px-2 py-3 text-center backdrop-blur-xl">
                            <input type="checkbox" aria-label={tr('Select all invoices', 'انتخاب همه فاکتورها')} checked={allVisibleInvoicesSelected} onChange={() => toggleSelectAllInvoices(visibleRowIds)} className="h-5 w-5 cursor-pointer rounded border-slate-300 text-brand-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300"/>
                          </th>) : null}
                        <th scope="col" className="bg-white/74 px-3 py-3 text-right font-black backdrop-blur-xl">{tr('Invoice', 'شماره فاکتور')}</th>
                        <th scope="col" className="bg-white/74 px-3 py-3 text-right font-black backdrop-blur-xl">{tr('Date', 'تاریخ')}</th>
                        <th scope="col" className="bg-white/74 px-3 py-3 text-right font-black backdrop-blur-xl">{tr('Customer', 'مشتری')}</th>
                        <th scope="col" className="bg-white/74 px-3 py-3 text-right font-black backdrop-blur-xl">
                          {tr('Seller', 'فروشنده')}
                        </th>
                        {modeVariant !== 'invoice-manager' ? <th scope="col" className="bg-white/74 px-3 py-3 text-left font-black backdrop-blur-xl">{tr('Gross', 'فروش ناخالص')}</th> : null}
                        {modeVariant === 'sales-ledger' ? <th scope="col" className="bg-white/74 px-3 py-3 text-left font-black backdrop-blur-xl">{tr('Net', 'فروش خالص')}</th> : null}
                        {modeVariant === 'profit-studio' ? <th scope="col" className="bg-white/74 px-3 py-3 text-left font-black backdrop-blur-xl">{tr('COGS', 'بهای تمام‌شده')}</th> : null}
                        {modeVariant === 'profit-studio' ? <th scope="col" className="bg-white/74 px-3 py-3 text-left font-black backdrop-blur-xl">{tr('Profit', 'مفاد')}</th> : null}
                        {modeVariant !== 'profit-studio' ? <th scope="col" className="bg-white/74 px-3 py-3 text-left font-black backdrop-blur-xl">{tr('Paid', 'پرداخت‌شده')}</th> : null}
                        <th scope="col" className="bg-white/74 px-3 py-3 text-left font-black backdrop-blur-xl">{tr('Remaining', 'باقی‌مانده')}</th>
                        <th scope="col" className="bg-white/74 px-3 py-3 text-center font-black backdrop-blur-xl">{tr('Status', 'وضعیت')}</th>
                        {modeVariant === 'invoice-manager' ? (<th scope="col" className="sticky left-0 z-[11] border-r border-white/70 bg-white/82 px-3 py-3 text-center font-black backdrop-blur-2xl">{tr('Actions', 'عملیات')}</th>) : null}
                        {modeVariant !== 'invoice-manager' && canDeleteInvoiceRows ? <th scope="col" className="bg-white/74 px-3 py-3 text-center font-black backdrop-blur-xl">{tr('Delete', 'حذف')}</th> : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100/80 bg-white/62">
                      {visibleRows.map((invoice) => {
                            const isHighlighted = highlightedInvoiceId === invoice.id;
                            const isSelected = selectedInvoiceIds.has(invoice.id);
                            const hasOpenActionMenu = openInvoiceActionMenuId === invoice.id;
                            const isTransferEditorOpen = canTransferInvoiceRows && modeVariant === 'invoice-manager' && sellerTransferEditorInvoiceId === invoice.id;
                            const hasSellerOption = sellerTransferOptions.some((option) => option.value === invoice.sellerId);
                            const hasPaidAmount = invoice.amountPaid > 0;
                            const hasRemainingAmount = invoice.remainingAmount > 0;
                            return (<tr key={invoice.id} data-testid={`invoice-row-${invoice.id}`} className={`transition ${isHighlighted || hasOpenActionMenu ? 'bg-brand-50/80 ring-1 ring-inset ring-brand-300/70' : isSelected ? 'bg-brand-50/60 ring-1 ring-inset ring-brand-200/70' : 'hover:bg-slate-50/90'}`}>
                            {modeVariant !== 'profit-studio' && canDeleteInvoiceRows ? (<td className="px-2 py-2.5 text-center align-middle">
                                <input type="checkbox" aria-label={tr(`Select ${invoice.invoiceLabel}`, `انتخاب ${invoice.invoiceLabel}`)} checked={isSelected} onChange={() => toggleInvoiceSelection(invoice.id)} className="h-5 w-5 cursor-pointer rounded border-slate-300 text-brand-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300"/>
                              </td>) : null}
                            <td className="whitespace-nowrap px-3 py-2.5 text-left align-middle font-black text-slate-900 tabular-nums" dir="ltr" title={invoice.invoiceLabel}>{invoice.invoiceLabel}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 align-middle font-semibold text-slate-600" title={formatReportDate(invoice.date, reportLanguage, report)}>{formatReportDate(invoice.date, reportLanguage, report)}</td>
                            <td className="px-3 py-2.5 align-middle font-bold text-slate-800">
                              <span className="block max-w-[180px] truncate" title={invoice.customerName}>{invoice.customerName}</span>
                            </td>
                            <td className="px-3 py-2.5 align-middle font-semibold text-slate-600">
                              {isTransferEditorOpen ? (<div className="min-w-[156px] max-w-[190px]">
                                  <select aria-label={tr(`Transfer seller for ${invoice.invoiceLabel}`, `تغییر فروشنده ${invoice.invoiceLabel}`)} value={hasSellerOption ? invoice.sellerId : ''} disabled={transferringSellerInvoiceId === invoice.id} title={invoice.sellerName} onChange={(event) => void handleTransferInvoiceSeller(invoice.id, event.target.value, invoice.sellerId)} className="h-8 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-black text-slate-800 outline-hidden transition focus:border-brand-300 focus:ring-2 focus:ring-brand-200/80 disabled:cursor-wait disabled:opacity-60">
                                    {!hasSellerOption ? (<option value="">{invoice.sellerName}</option>) : null}
                                    {sellerTransferOptions.map((option) => (<option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>))}
                                  </select>
                                  {transferringSellerInvoiceId === invoice.id ? (<p className="mt-1 truncate text-[10px] font-semibold text-slate-400">
                                      {tr('Updating calculations...', 'در حال به‌روزرسانی محاسبات...')}
                                    </p>) : null}
                                </div>) : (<span className="block max-w-[170px] truncate" title={invoice.sellerName}>{invoice.sellerName}</span>)}
                            </td>
                            {modeVariant !== 'invoice-manager' ? (<td className="whitespace-nowrap px-3 py-2.5 text-left align-middle font-black text-slate-900 tabular-nums" dir="ltr">{formatInvoiceMoney(invoice.grossSales)}</td>) : null}
                            {modeVariant === 'sales-ledger' ? (<td className="whitespace-nowrap px-3 py-2.5 text-left align-middle font-black text-brand-700 tabular-nums" dir="ltr">{formatInvoiceMoney(invoice.netSales)}</td>) : null}
                            {modeVariant === 'profit-studio' ? (<td className="whitespace-nowrap px-3 py-2.5 text-left align-middle font-semibold text-slate-600 tabular-nums" dir="ltr">{formatInvoiceMoney(invoice.cogs)}</td>) : null}
                            {modeVariant === 'profit-studio' ? (<td className="whitespace-nowrap px-3 py-2.5 text-left align-middle font-black text-emerald-700 tabular-nums" dir="ltr">{formatInvoiceMoney(invoice.grossProfit)}</td>) : null}
                            {modeVariant !== 'profit-studio' ? (<td className={`whitespace-nowrap px-3 py-2.5 text-left align-middle font-bold tabular-nums ${hasPaidAmount ? 'text-emerald-700' : 'text-slate-500'}`} dir="ltr">{formatInvoiceMoney(invoice.amountPaid)}</td>) : null}
                            <td className={`whitespace-nowrap px-3 py-2.5 text-left align-middle font-bold tabular-nums ${hasRemainingAmount ? 'text-rose-600' : 'text-slate-500'}`} dir="ltr">{formatInvoiceMoney(invoice.remainingAmount)}</td>
                            <td className="px-3 py-2.5 text-center align-middle">
                              <InvoiceStatusBadge label={getInvoiceStatusLabel(invoice.paymentStatus)} status={invoice.paymentStatus} detail={`${tr('Remaining', 'باقی‌مانده')}: ${formatInvoiceMoney(invoice.remainingAmount)}`}/>
                            </td>
                            {modeVariant === 'invoice-manager' ? (<td className="sticky left-0 z-[5] border-r border-white/70 bg-white/72 px-2 py-2.5 text-center align-middle backdrop-blur-xl">
                                <div className="inline-flex items-center justify-center gap-1.5">
                                  <button type="button" onClick={() => setInvoicePreviewId(invoice.id)} aria-label={tr('Details', 'جزئیات')} title={tr('Details', 'جزئیات')} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/75 bg-white/72 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl transition hover:border-brand-200 hover:bg-white/95 hover:text-brand-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300/60">
                                    <InvoiceActionIcon name="view"/>
                                  </button>
                                <InvoiceRowActionMenu menuKey={invoice.id} invoiceLabel={invoice.invoiceLabel} isOpen={openInvoiceActionMenuId === invoice.id} canEdit={canEditInvoiceRows} canDelete={canDeleteInvoiceRows} canTransfer={canTransferInvoiceRows} labels={{
                                        actions: tr('Actions', 'عملیات'),
                                        view: tr('View', 'دیدن'),
                                        edit: tr('Edit', 'ویرایش'),
                                        delete: tr('Delete', 'حذف'),
                                        transfer: tr('Transfer seller', 'انتقال فروشنده')
                                    }} onToggle={() => setOpenInvoiceActionMenuId((current) => (current === invoice.id ? null : invoice.id))} onClose={() => setOpenInvoiceActionMenuId((current) => (current === invoice.id ? null : current))} onView={() => setInvoicePreviewId(invoice.id)} onEdit={() => openInvoiceEdit(invoice.id)} onDelete={() => requestDeleteInvoices([invoice.id])} onTransfer={() => setSellerTransferEditorInvoiceId(invoice.id)}/>
                                </div>
                              </td>) : null}
                            {modeVariant !== 'invoice-manager' && canDeleteInvoiceRows ? (<td className="px-3 py-2 text-center align-middle">
                                <button type="button" aria-label={tr(`Delete ${invoice.invoiceLabel}`, `حذف ${invoice.invoiceLabel}`)} onClick={() => requestDeleteInvoices([invoice.id])} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-black text-rose-700 transition hover:border-rose-300 hover:bg-rose-100/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300/60">
                                  <InvoiceActionIcon name="delete"/>
                                  <span>{tr('Delete', 'حذف')}</span>
                                </button>
                              </td>) : null}
                          </tr>);
                        })}
                    </tbody>
                  </table>
                </InvoiceManagerScrollFrame>)}
              </>) : (modeVariant === 'invoice-manager' ? (<InvoiceManagerEmptyState title={emptyText} description={hasActiveInvoiceManagerFilters
                        ? tr('Try clearing the filters or broadening the date range.', 'فیلترها را پاک کنید یا بازه تاریخ را گسترده‌تر بسازید.')
                        : tr('When invoices are created, they will appear here for review, transfer, edit, and delete actions.', 'وقتی فاکتور ثبت شود، برای دیدن، انتقال، ویرایش و حذف در همین بخش نمایش داده می‌شود.')} actionLabel={hasActiveInvoiceManagerFilters ? tr('Reset filters', 'بازنشانی فیلترها') : undefined} onAction={hasActiveInvoiceManagerFilters ? resetInvoiceManagerFilters : undefined}/>) : (<ClassicEmptyState text={emptyText}/>))}
          </GlassTableShell>);
        };
        return (<div dir={isEnglish ? 'ltr' : 'rtl'} className="relative overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_28%),radial-gradient(circle_at_top_left,rgba(167,139,250,0.14),transparent_24%),radial-gradient(circle_at_left_center,rgba(103,232,249,0.08),transparent_18%),linear-gradient(180deg,#f9fbff_0%,#f3f7fb_45%,#f7fafc_100%)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.16),transparent_34%),radial-gradient(circle_at_top_left,rgba(167,139,250,0.12),transparent_28%)]"/>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.08),transparent_55%)]"/>
        <div className="wk-page-shell wk-page-stack wk-reports-home-stack relative z-10">
        {isInitialReportLoading ? <LoadingSkeleton /> : null}

        {reportState.status === 'error' ? (<EmptyPanel title={tr('Report generation failed', 'ساخت راپور ناموفق شد')} description={reportState.message} actionLabel={tr('Retry', 'تلاش دوباره')} onAction={() => setRefreshToken((current) => current + 1)}/>) : null}

        {canRenderReportContent && report ? (<>
              {report.state !== 'ready' ? (<SharedFlatCard className="p-5">
                  <EmptyStateShell title={report.stateTitle} description={report.stateDescription} action={primaryStateAction ? <ActionButton label={primaryStateAction.label} onClick={primaryStateAction.onClick} tone="primary"/> : undefined} className="py-7"/>
                </SharedFlatCard>) : (<>
                  <section data-testid="reports-home-first-screen" className="wk-reports-home-first-screen">
                    {renderHomeReportSearchPanel()}

                    {renderClassicTabContent()}
                  </section>

                  <div className="wk-reports-home-below-fold">
                  <PageHeader dataTestId="reports-home-page-header" eyebrow={tr('Executive analytics', 'تحلیل مدیریتی')} title={tr('Reports & Business Intelligence', 'راپورها و هوش تجاری')} subtitle={tr('Manager-facing performance, financial movement, and operational risk in one view.', 'نمای مدیریتی عملکرد، حرکت مالی و ریسک عملیاتی.')} primaryAction={{ label: tr('Quick Export', 'خروجی سریع'), onClick: openPrimaryAction }} secondaryActions={[
                        { label: tr('Refresh', 'تازه‌سازی'), onClick: () => setRefreshToken((current) => current + 1), variant: 'ghost' }
                    ]} meta={(<div className="flex flex-wrap gap-2">
                        <span className={HOME_MUTED_BADGE}>{tr('Range', 'بازه')}: {activeHomeRangeLabel}</span>
                        <span className={HOME_MUTED_BADGE}>{tr('Area', 'حوزه')}: {legacyTabLabels[currentTab]}</span>
                      </div>)} tabs={allowedTabs.map((tab) => ({
                        id: tab,
                        label: legacyTabLabels[tab],
                        active: currentTab === tab,
                        onClick: () => setActiveTab(tab)
                    }))}/>

                  <UnifiedFilterBar searchSlot={<div className="grid gap-2.5 md:grid-cols-[220px_minmax(0,1fr)]">
                        <FilterSelectField label={tr('Period', 'دوره')} value={filters.preset} onChange={(value) => updateFilter('preset', value as ReportFilters['preset'])} options={homeRangeOptions}/>
                        <FilterField label={tr('Current section', 'بخش فعلی')}>
                          <div>
                            <p className="text-sm font-black text-slate-900">{currentSection?.title || report.title}</p>
                          </div>
                        </FilterField>
                      </div>} actionsSlot={(<>
                        <ActionButton label={tr('Print', 'چاپ')} onClick={() => void exportReport('print')}/>
                        <ActionButton label={tr('Filters', 'فیلترها')} onClick={() => setIsFilterDrawerOpen(true)}/>
                      </>)} resultsLabel={tr(`Showing ${report.metadata.currentInvoiceCount} invoice-linked records`, `نمایش ${report.metadata.currentInvoiceCount} رکورد متصل به فاکتور`)} activeFiltersSlot={report.appliedFilters.slice(0, 5).map((filter) => (<ActiveFilterChip key={filter.key} label={`${filter.label}: ${filter.value}`}/>))}/>

                  {report.appliedFilters.length > 5 ? (<InlineAlert tone="info" title={tr('Filtered executive view', 'نمای مدیریتی فیلترشده')}>
                      {tr('Several filters are active. Reset filters if you want a broader executive picture.', 'چند فیلتر فعال است. اگر به تصویر گسترده‌تری نیاز دارید، فیلترها را بازنشانی کنید.')}
                    </InlineAlert>) : null}

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {report.overview.primaryMetrics.slice(0, 4).map((metric) => (<KpiCard key={metric.key} metric={metric} onOpen={() => setSelectedTableId(metric.detailTableId)} helpOpen={helpMetricKey === metric.key} onHelpToggle={() => setHelpMetricKey((current) => (current === metric.key ? null : metric.key))}/>))}
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    {report.overview.topInsights.slice(0, 3).map((insight) => (<InsightCard key={insight.id} title={insight.title} description={insight.description} tone={insight.tone} onOpen={() => {
                            if (insight.tableId)
                                setSelectedTableId(insight.tableId);
                            else if (insight.tab)
                                setActiveTab(insight.tab);
                        }}/>))}
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr,0.95fr]">
                    <OverviewFocusChart bundle={report} chart={report.overview.focusChart} labels={{
                        sales: tr('Sales', 'فروش'),
                        collected: tr('Collected', 'وصول'),
                        receivable: tr('Receivables', 'مطالبات')
                    }}/>
                    <CompactAttentionTable bundle={report} table={report.overview.attentionTable} onRowOpen={(tableId) => setSelectedTableId(tableId)}/>
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr,0.85fr]">
                    <SharedFlatCard className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-black text-slate-900">{tr('Recommended actions', 'اقدام‌های پیشنهادی')}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Turn insight into action without opening the analyst workspace.', 'بینش را بدون بازکردن فضای تحلیلی، به اقدام تبدیل کنید.')}</p>
                        </div>
                        {primaryStateAction ? <ActionButton label={primaryStateAction.label} onClick={primaryStateAction.onClick} tone="primary"/> : null}
                      </div>
                      <div className="mt-3 space-y-2.5">
                        {homeRecommendedActions.length ? homeRecommendedActions.map((action) => (<button key={action.id} type="button" onClick={action.onClick} className="flex w-full items-start justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-left transition hover:border-brand-200 hover:bg-brand-50/40">
                            <div>
                              <p className="text-sm font-black text-slate-900">{action.title}</p>
                              <p className="mt-1 text-xs font-semibold leading-6 text-slate-500">{action.description}</p>
                            </div>
                            <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-black text-brand-700">{action.label}</span>
                          </button>)) : (<EmptyStateShell title={tr('No recommended action yet', 'هنوز اقدام پیشنهادی وجود ندارد')} description={tr('As soon as the executive insights detect movement or risk, the next action will appear here.', 'به‌محض اینکه بینش‌های مدیریتی حرکت یا ریسکی را تشخیص دهند، اقدام بعدی اینجا ظاهر می‌شود.')} className="py-6"/>)}
                      </div>
                    </SharedFlatCard>

                    <SharedFlatCard className="p-4">
                      <p className="text-base font-black text-slate-900">{tr('Manager note', 'یادداشت مدیریتی')}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{currentSection?.subtitle || classicSubtitle}</p>
                      <div className="mt-3 space-y-2.5">
                        {(currentSection?.notes || []).slice(0, 3).map((note) => (<div key={note} className="rounded-2xl border border-white/70 bg-white/78 px-4 py-3 text-sm font-semibold leading-6 text-slate-600">
                            {note}
                          </div>))}
                      </div>
                    </SharedFlatCard>
                  </div>
                  </div>
                </>)}

              {/* Home financial overlays */}
              <Modal isOpen={activeFinancialOverlay === 'invoice_manager'} onClose={closeFinancialOverlay} title={tr('Invoice Manager', 'مدیریت فاکتورها')} maxWidthClassName="max-w-none" panelClassName={invoiceManagerModalPanelClassName} headerClassName={invoiceManagerModalHeaderClassName} bodyClassName={invoiceManagerModalBodyClassName} overlayClassName={invoiceManagerModalOverlayClassName} closeButtonClassName="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-slate-200/80 bg-white/86 text-slate-500 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.7),inset_0_1px_0_rgba(255,255,255,1)] backdrop-blur-xl transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300/60" closeAriaLabel={tr('Close Invoice Manager', 'بستن مدیریت فاکتورها')} titleClassName="wk-invoice-manager-title text-[17px] font-black text-slate-950">
                <div className="wk-invoice-manager-layout flex h-full min-h-0 flex-col gap-3">
                  <div className="wk-invoice-manager-summary-grid grid shrink-0 grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <StatCard label={tr('Count', 'تعداد فاکتور')} value={formatExecutiveNumber(homeInvoiceSummary.count)} icon="invoice"/>
                    <StatCard label={tr('Total amount', 'مجموع مبلغ')} value={formatInvoiceManagerMoney(homeInvoiceSummary.totalFinalAmount, reportLanguage, invoiceCurrencyCode)} tone="brand" icon="wallet" meta={invoiceCurrencyCode}/>
                    <StatCard label={tr('Remaining amount', 'مجموع باقی‌مانده')} value={formatInvoiceManagerMoney(homeInvoiceSummary.totalRemainingAmount, reportLanguage, invoiceCurrencyCode)} tone="danger" icon="alert" meta={invoiceCurrencyCode}/>
                  </div>
                  <div className="wk-invoice-manager-filter-group shrink-0">
                    <InvoiceFilterBar query={invoiceManagerFilters.query} status={invoiceManagerFilters.status} dateFrom={invoiceManagerFilters.dateFrom} dateTo={invoiceManagerFilters.dateTo} statusOptions={homeSearchPaymentStatusOptions} resultLabel={`${tr('Results', 'نتیجه‌ها')}: ${formatExecutiveNumber(filteredInvoiceManagerRows.length)} / ${formatExecutiveNumber(homeInvoiceRows.length)}`} hasActiveFilters={hasActiveInvoiceManagerFilters} labels={{
                    filters: tr('Invoice filters', 'فیلتر فاکتورها'),
                    search: tr('Search invoices', 'جستجوی فاکتورها'),
                    searchPlaceholder: tr('Invoice number, customer, seller...', 'شماره فاکتور، مشتری، فروشنده...'),
                    status: tr('Payment status', 'وضعیت پرداخت'),
                    from: tr('From date', 'از تاریخ'),
                    to: tr('To date', 'تا تاریخ'),
                    reset: tr('Reset', 'بازنشانی')
                }} onQueryChange={(value) => setInvoiceManagerFilters((current) => ({ ...current, query: value }))} onStatusChange={(value) => setInvoiceManagerFilters((current) => ({ ...current, status: value }))} onDateFromChange={(value) => setInvoiceManagerFilters((current) => ({ ...current, dateFrom: value }))} onDateToChange={(value) => setInvoiceManagerFilters((current) => ({ ...current, dateTo: value }))} onReset={resetInvoiceManagerFilters}/>
                  </div>
                  <div className="wk-invoice-manager-table-zone min-h-0 flex flex-1 flex-col">
                    {renderInvoiceRowsTable(filteredInvoiceManagerRows, 'invoice-manager')}
                  </div>
                  {selectedInvoiceCount > 0 ? (<div className="wk-invoice-manager-footer shrink-0">
                      <BulkActionBar selectedLabel={tr('Selected', 'انتخاب‌شده')} deleteLabel={tr('Delete selected', 'حذف فاکتورهای انتخاب‌شده')} closeLabel={tr('Close', 'بستن')} canDelete={canDeleteInvoiceRows} selectedCount={selectedInvoiceCount} selectedCountLabel={formatExecutiveNumber(selectedInvoiceCount)} onDelete={() => requestDeleteInvoices(Array.from(selectedInvoiceIds))} onClose={closeFinancialOverlay}/>
                    </div>) : null}
                </div>
              </Modal>

              {previewInvoice ? (<InvoicePrintModal invoice={previewInvoice} customer={previewCustomer || {
                        id: previewInvoice.customerId,
                        name: '-',
                        phone: '',
                        balance: 0,
                        transactions: []
                    }} medicines={medicines} settings={settings || ({
                        storeName: 'WareKeep',
                        storePhone: '',
                        storeAddress: '',
                        taxRate: 0,
                        language
                    } as AppSettings)} onClose={() => setInvoicePreviewId(null)}/>) : null}

              {editingInvoice && invoiceEditDraft ? (() => {
                    const activeReturnCount = getActiveReturnCount(editingInvoice);
                    const returnedByLine = getReturnedQuantityByInvoiceLine(editingInvoice);
                    const draftTotals = calculateInvoiceTotals(invoiceEditDraft.items, Math.max(0, Number(invoiceEditDraft.discount) || 0), Math.max(0, Number(invoiceEditDraft.taxRate) || 0), editingInvoice.currency);
                    const paidPreview = Math.max(0, Number(invoiceEditDraft.amountPaid) || 0);
                    const clampedPaidPreview = Math.min(paidPreview, draftTotals.finalAmount);
                    const creditPreview = Math.max(0, paidPreview - clampedPaidPreview);
                    return (<Modal isOpen={true} onClose={() => {
                            if (isSavingInvoiceEdit)
                                return;
                            setInvoiceEditId(null);
                            setInvoiceEditDraft(null);
                            setInvoiceEditError(null);
                        }} title={tr('Edit Invoice', 'ویرایش فاکتور')} maxWidthClassName="max-w-6xl" panelClassName={homeModalPanelClassName} headerClassName={homeModalHeaderClassName} bodyClassName={`${homeModalBodyClassName} space-y-5`} footerClassName={homeModalFooterClassName} overlayClassName={invoiceManagerChildOverlayClassName} footer={<div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                          <span className={HOME_MUTED_BADGE}>{tr('Before', 'قبل')}: {formatExecutiveNumber(editingInvoice.finalAmount)}</span>
                          <span className={HOME_MUTED_BADGE}>{tr('After', 'بعد')}: {formatExecutiveNumber(draftTotals.finalAmount)}</span>
                          {creditPreview > 0 ? <span className={`${HOME_MUTED_BADGE} text-emerald-700`}>{tr('Customer credit', 'اعتبار مشتری')}: {formatExecutiveNumber(creditPreview)}</span> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <GlassActionButton label={tr('Cancel', 'لغو')} disabled={isSavingInvoiceEdit} onClick={() => {
                                setInvoiceEditId(null);
                                setInvoiceEditDraft(null);
                                setInvoiceEditError(null);
                            }}/>
                          <GlassActionButton label={isSavingInvoiceEdit ? tr('Saving...', 'در حال ذخیره...') : tr('Save changes', 'ذخیره تغییرات')} tone="primary" disabled={isSavingInvoiceEdit} onClick={() => void submitInvoiceEdit()}/>
                        </div>
                      </div>}>
                    {activeReturnCount > 0 ? (<InlineAlert tone="warning" title={tr('Invoice has returns', 'این فاکتور برگشتی دارد')}>
                        {tr('Returned quantities are protected. If medicine or batch changes on a returned line, recalculation confirmation and edit reason are required.', 'تعدادهای برگشتی محافظت می‌شوند. اگر دوا یا بچ سطر برگشتی تغییر کند، تأیید بازمحاسبه و دلیل ویرایش الزامی است.')}
                      </InlineAlert>) : null}
                    {invoiceEditError ? (<InlineAlert tone="danger" title={tr('Cannot save invoice', 'ذخیره فاکتور ممکن نیست')}>
                        {invoiceEditError}
                      </InlineAlert>) : null}

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <label className="block">
                        <FieldLabel>{tr('Invoice number', 'شماره فاکتور')}</FieldLabel>
                        <input value={invoiceEditDraft.invoiceNumber} onChange={(event) => setInvoiceEditDraft((current) => current ? { ...current, invoiceNumber: event.target.value } : current)} className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-hidden focus:border-brand-400 focus:ring-2 focus:ring-brand-200"/>
                      </label>
                      <label className="block">
                        <FieldLabel>{tr('Date', 'تاریخ')}</FieldLabel>
                        <input type="date" value={invoiceEditDraft.date} onChange={(event) => setInvoiceEditDraft((current) => current ? { ...current, date: event.target.value } : current)} className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-hidden focus:border-brand-400 focus:ring-2 focus:ring-brand-200"/>
                      </label>
                      <FilterSelect label={tr('Seller', 'فروشنده')} value={invoiceEditDraft.userId} onChange={(value) => setInvoiceEditDraft((current) => current ? { ...current, userId: value } : current)} options={sellerTransferOptions}/>
                      <label className="block">
                        <FieldLabel>{tr('Customer name', 'نام مشتری')}</FieldLabel>
                        <input value={invoiceEditDraft.customerName} onChange={(event) => setInvoiceEditDraft((current) => current ? { ...current, customerName: event.target.value } : current)} className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-hidden focus:border-brand-400 focus:ring-2 focus:ring-brand-200"/>
                      </label>
                      <FilterSelect label={tr('Customer change mode', 'نوع تغییر مشتری')} value={invoiceEditDraft.customerMode} onChange={(value) => setInvoiceEditDraft((current) => {
                            if (!current)
                                return current;
                            const nextMode = value as InvoiceEditCustomerMode;
                            return {
                                ...current,
                                customerMode: nextMode,
                                targetCustomerId: nextMode === 'transfer_ownership' ? '' : current.targetCustomerId
                            };
                        })} options={[
                            { value: 'keep', label: tr('Keep this customer', 'نگهداشت همین مشتری') },
                            { value: 'rename_global', label: tr('Rename customer globally', 'تغییر نام در همه سوابق مشتری') },
                            { value: 'transfer_ownership', label: tr('Transfer invoice ownership', 'واگذاری مالکیت فاکتور') }
                        ]}/>
                      {invoiceEditDraft.customerMode === 'transfer_ownership' ? (<FilterSelect label={tr('Target customer', 'مشتری مقصد')} value={invoiceEditDraft.targetCustomerId} onChange={(value) => setInvoiceEditDraft((current) => current ? { ...current, targetCustomerId: value } : current)} options={[
                                { value: '', label: tr('Use typed/new name', 'استفاده از نام نوشته‌شده/جدید') },
                                ...Array.from(customerById.values()).map((customer) => ({ value: customer.id, label: customer.name || customer.id }))
                            ]}/>) : null}
                      <label className="block">
                        <FieldLabel>{tr('Paid amount', 'مبلغ پرداخت‌شده')}</FieldLabel>
                        <input type="number" min="0" value={invoiceEditDraft.amountPaid} onChange={(event) => setInvoiceEditDraft((current) => current ? { ...current, amountPaid: event.target.value } : current)} className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-hidden focus:border-brand-400 focus:ring-2 focus:ring-brand-200"/>
                      </label>
                      <label className="block">
                        <FieldLabel>{tr('Invoice discount', 'تخفیف فاکتور')}</FieldLabel>
                        <input type="number" min="0" value={invoiceEditDraft.discount} onChange={(event) => setInvoiceEditDraft((current) => current ? { ...current, discount: event.target.value } : current)} className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-hidden focus:border-brand-400 focus:ring-2 focus:ring-brand-200"/>
                      </label>
                      <label className="block">
                        <FieldLabel>{tr('Tax rate', 'فیصدی مالیه')}</FieldLabel>
                        <input type="number" min="0" value={invoiceEditDraft.taxRate} onChange={(event) => setInvoiceEditDraft((current) => current ? { ...current, taxRate: event.target.value } : current)} className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-hidden focus:border-brand-400 focus:ring-2 focus:ring-brand-200"/>
                      </label>
                    </div>

                    <label className="block">
                      <FieldLabel>{tr('Edit reason', 'دلیل ویرایش')}</FieldLabel>
                      <textarea value={invoiceEditDraft.editReason} onChange={(event) => setInvoiceEditDraft((current) => current ? { ...current, editReason: event.target.value } : current)} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden focus:border-brand-400 focus:ring-2 focus:ring-brand-200"/>
                    </label>
                    {activeReturnCount > 0 ? (<label className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                        <input type="checkbox" checked={invoiceEditDraft.allowReturnedLineReassignment} onChange={(event) => setInvoiceEditDraft((current) => current ? { ...current, allowReturnedLineReassignment: event.target.checked } : current)} className="h-4 w-4 rounded border-amber-300 text-amber-600"/>
                        {tr('I confirm recalculation for returned lines if medicine or batch changes.', 'تأیید می‌کنم اگر دوا یا بچ سطر برگشتی تغییر کند، برگشتی‌ها دوباره محاسبه شوند.')}
                      </label>) : null}

                    <div className="rounded-3xl border border-white/70 bg-white/60 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-black text-slate-900">{tr('Items', 'اقلام')}</p>
                        <GlassActionButton label={tr('Add item', 'افزودن قلم')} className="px-3 py-2 text-xs" onClick={addInvoiceEditItem}/>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-[920px] text-sm">
                          <thead className="text-slate-500">
                            <tr>
                              <th className="px-3 py-2 text-right font-black">{tr('Medicine', 'دوا')}</th>
                              <th className="px-3 py-2 text-right font-black">{tr('Batch', 'بچ')}</th>
                              <th className="px-3 py-2 text-right font-black">{tr('Qty', 'تعداد')}</th>
                              <th className="px-3 py-2 text-right font-black">{tr('Price', 'قیمت')}</th>
                              <th className="px-3 py-2 text-right font-black">{tr('Returned', 'برگشتی')}</th>
                              <th className="px-3 py-2 text-center font-black">{tr('Remove', 'حذف')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {invoiceEditDraft.items.map((item, index) => {
                            const selectedMedicine = medicineById.get(item.medicineId);
                            const returnedQuantity = returnedByLine.get(index) || 0;
                            return (<tr key={item.lineId || index}>
                                  <td className="px-3 py-2">
                                    <select value={item.medicineId} onChange={(event) => {
                                    const nextMedicine = medicineById.get(event.target.value);
                                    const nextBatch = nextMedicine?.batches?.[0];
                                    updateInvoiceEditItem(index, {
                                        medicineId: event.target.value,
                                        batchId: nextBatch?.id || '',
                                        price: nextMedicine?.salePrices?.retail || item.price,
                                        costPrice: nextBatch?.purchasePrice ?? item.costPrice
                                    });
                                }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold">
                                      {medicines.filter((medicine) => !medicine.isDeleted).map((medicine) => (<option key={medicine.id} value={medicine.id}>{medicine.name}</option>))}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2">
                                    <select value={item.batchId} onChange={(event) => {
                                    const batch = selectedMedicine?.batches?.find((entry) => entry.id === event.target.value);
                                    updateInvoiceEditItem(index, { batchId: event.target.value, costPrice: batch?.purchasePrice ?? item.costPrice });
                                }} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold">
                                      {(selectedMedicine?.batches || []).map((batch) => (<option key={batch.id} value={batch.id}>{batch.batchNumber || batch.id}</option>))}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2">
                                    <input type="number" min="0" step="0.001" value={item.quantity} onChange={(event) => updateInvoiceEditItem(index, { quantity: Number(event.target.value) })} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold"/>
                                  </td>
                                  <td className="px-3 py-2">
                                    <input type="number" min="0" value={item.price} onChange={(event) => updateInvoiceEditItem(index, { price: Number(event.target.value) })} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold"/>
                                  </td>
                                  <td className="px-3 py-2 font-black text-amber-700">{formatExecutiveNumber(returnedQuantity)}</td>
                                  <td className="px-3 py-2 text-center">
                                    <GlassActionButton label={tr('Remove', 'حذف')} tone="danger" disabled={returnedQuantity > 0} className="px-3 py-2 text-xs" onClick={() => removeInvoiceEditItem(index)}/>
                                  </td>
                                </tr>);
                        })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </Modal>);
                })() : null}

              <Modal isOpen={activeFinancialOverlay === 'sales_ledger'} onClose={closeFinancialOverlay} title={tr('Sales Ledger', 'دفتر فروش')} maxWidthClassName="max-w-7xl" panelClassName={homeModalPanelClassName} headerClassName={homeModalHeaderClassName} bodyClassName={homeModalBodyClassName} footerClassName={homeModalFooterClassName} overlayClassName={homeModalOverlayClassName} closeButtonClassName="rounded-full border border-white/75 bg-white/72 p-2 text-slate-500 transition hover:bg-white hover:text-slate-800" titleClassName="text-xl font-black text-slate-900" footer={<div className="flex flex-wrap items-center justify-between gap-3">
                    <div className={`${HOME_MUTED_BADGE} text-sm`}>
                      {tr('Invoices in range', 'فاکتورهای این بازه')}: {formatExecutiveNumber(homeInvoiceSummary.count)}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canDeleteInvoiceRows ? (<GlassActionButton label={tr('Delete selected', 'حذف فاکتورهای انتخاب‌شده')} tone="danger" disabled={!selectedInvoiceCount} onClick={() => requestDeleteInvoices(Array.from(selectedInvoiceIds))}/>) : null}
                      <GlassActionButton label={tr('Close', 'بستن')} onClick={closeFinancialOverlay}/>
                    </div>
                  </div>}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <GlassMetricSummary label={tr('Gross sales', 'فروش ناخالص')} value={formatExecutiveNumber(homeInvoiceSummary.totalGrossSales)} tone="brand"/>
                  <GlassMetricSummary label={tr('Net sales', 'فروش خالص')} value={formatExecutiveNumber(homeInvoiceSummary.totalNetSales)}/>
                  <GlassMetricSummary label={tr('Collected', 'وصول‌شده')} value={formatExecutiveNumber(homeInvoiceSummary.totalCollected)} tone="success"/>
                  <GlassMetricSummary label={tr('Receivable', 'قابل وصول')} value={formatExecutiveNumber(homeInvoiceSummary.totalRemainingAmount)} tone="danger"/>
                </div>
                {renderInvoiceRowsTable(salesLedgerRows, 'sales-ledger')}
              </Modal>

              <Modal isOpen={activeFinancialOverlay === 'profit_studio'} onClose={closeFinancialOverlay} title={tr('Profit Studio', 'استودیوی مفاد')} maxWidthClassName="max-w-7xl" panelClassName={homeModalPanelClassName} headerClassName={homeModalHeaderClassName} bodyClassName={homeModalBodyClassName} footerClassName={homeModalFooterClassName} overlayClassName={homeModalOverlayClassName} closeButtonClassName="rounded-full border border-white/75 bg-white/72 p-2 text-slate-500 transition hover:bg-white hover:text-slate-800" titleClassName="text-xl font-black text-slate-900" footer={<div className="flex justify-end">
                    <GlassActionButton label={tr('Close', 'بستن')} onClick={closeFinancialOverlay}/>
                  </div>}>
                {!canViewProfit ? (<div className={`${HOME_GLASS_SHELL} px-8 py-10 text-center`}>
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/75 bg-white/76 text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl">
                      <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="5" y="11" width="14" height="9" rx="2"/>
                        <path d="M8 11V8a4 4 0 1 1 8 0v3"/>
                      </svg>
                    </div>
                    <p className="mt-5 text-2xl font-black text-slate-900">{tr('Profit data is locked', 'داده‌های مفاد قفل است')}</p>
                    <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-7 text-slate-500">
                      {tr('Your access level does not allow profit details in the executive dashboard.', 'سطح دسترسی شما اجازه نمایش جزئیات مفاد را در داشبورد اجرایی نمی‌دهد.')}
                    </p>
                  </div>) : (<>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                      <GlassMetricSummary label={tr('Gross sales', 'فروش ناخالص')} value={formatExecutiveNumber(profitStudioSummary.grossSales)} tone="brand"/>
                      <GlassMetricSummary label={tr('COGS', 'بهای تمام‌شده')} value={formatExecutiveNumber(profitStudioSummary.cogs)}/>
                      <GlassMetricSummary label={tr('Operating expenses', 'مصارف جاری')} value={formatExecutiveNumber(profitStudioSummary.operatingExpenses)} tone="danger"/>
                      <GlassMetricSummary label={tr('Net profit', 'مفاد خالص')} value={formatExecutiveNumber(profitStudioSummary.netProfit)} tone="success"/>
                      <GlassMetricSummary label={tr('Margin', 'حاشیهٔ مفاد')} value={`${formatExecutiveNumber(profitStudioSummary.grossMargin, 1)}%`}/>
                    </div>

                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.28fr,0.92fr]">
                      <div className={`${HOME_GLASS_SHELL} p-5`}>
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-lg font-black text-slate-900">{tr('Invoice contributors', 'فاکتورهای موثر بر مفاد')}</p>
                            <p className="mt-1 text-sm font-semibold text-slate-600">{tr('Delete an invoice to recalculate margin and receivables.', 'با حذف هر فاکتور، حاشیهٔ مفاد و حساب‌های دریافتنی دوباره محاسبه می‌شود.')}</p>
                          </div>
                          <span className={HOME_MUTED_BADGE}>{formatExecutiveNumber(sortedProfitInvoiceRows.length)}</span>
                        </div>
                        {renderInvoiceRowsTable(sortedProfitInvoiceRows, 'profit-studio')}
                      </div>

                      <div className={`${HOME_GLASS_SHELL} p-5`}>
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-lg font-black text-slate-900">{tr('Expense impact', 'تأثیر مصارف')}</p>
                            <p className="mt-1 text-sm font-semibold text-slate-600">{tr('These expenses reduce net profit for the current range.', 'این مصارف مفاد خالص بازه فعلی را کاهش می‌دهند.')}</p>
                          </div>
                          <span className={HOME_MUTED_BADGE}>{formatExecutiveNumber(financialExpenseRows.length)}</span>
                        </div>
                        <GlassTableShell>
                          {financialExpenseRows.length ? (<div className="overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead className="bg-white/76 text-slate-500 backdrop-blur-md">
                                  <tr>
                                    <th className="px-4 py-4 text-right font-black">{tr('Title', 'عنوان')}</th>
                                    <th className="px-4 py-4 text-right font-black">{tr('Category', 'دسته‌بندی')}</th>
                                    <th className="px-4 py-4 text-right font-black">{tr('Amount', 'مبلغ')}</th>
                                    <th className="px-4 py-4 text-right font-black">{tr('Recorded by', 'ثبت‌کننده')}</th>
                                    {(canEditExpenseRows || canManageExpenseRows) ? <th className="px-4 py-4 text-center font-black">{tr('Actions', 'عملیات')}</th> : null}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/70 bg-white/50">
                                  {financialExpenseRows.map((expense) => (<tr key={expense.id} className="transition hover:bg-white/55">
                                      <td className="px-4 py-4 font-black text-slate-900">{expense.title}</td>
                                      <td className="px-4 py-4 font-semibold text-slate-600">{expense.category}</td>
                                      <td className="px-4 py-4 font-black text-rose-700">{formatExecutiveNumber(expense.amount)}</td>
                                      <td className="px-4 py-4 font-semibold text-slate-600">{expense.recordedBy}</td>
                                      {(canEditExpenseRows || canManageExpenseRows) ? (<td className="px-4 py-4">
                                          <div className="flex justify-center gap-2">
                                            {canEditExpenseRows ? (<GlassActionButton label={tr('Edit', 'ویرایش')} ariaLabel={tr(`Edit ${expense.title}`, `ویرایش ${expense.title}`)} className="px-3 py-2 text-xs" onClick={() => openExpenseEditor(expense)}/>) : null}
                                            {canManageExpenseRows ? (<GlassActionButton label={tr('Delete', 'حذف')} ariaLabel={tr(`Delete ${expense.title}`, `حذف ${expense.title}`)} tone="danger" className="px-3 py-2 text-xs" onClick={() => requestDeleteExpense(expense.id, expense.title)}/>) : null}
                                          </div>
                                        </td>) : null}
                                    </tr>))}
                                </tbody>
                              </table>
                            </div>) : (<ClassicEmptyState text={tr('No expense was found in this range.', 'در این بازه مصرفی یافت نشد.')}/>)}
                        </GlassTableShell>
                      </div>
                    </div>
                  </>)}
              </Modal>

              <Modal isOpen={activeFinancialOverlay === 'expense_manager'} onClose={closeFinancialOverlay} title={tr('Expense Manager', 'مدیریت مصارف')} maxWidthClassName="max-w-7xl" panelClassName={homeModalPanelClassName} headerClassName={homeModalHeaderClassName} bodyClassName={homeModalBodyClassName} footerClassName={homeModalFooterClassName} overlayClassName={homeModalOverlayClassName} closeButtonClassName="rounded-full border border-white/75 bg-white/72 p-2 text-slate-500 transition hover:bg-white hover:text-slate-800" titleClassName="text-xl font-black text-slate-900" footer={<div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-600">
                      {canManageExpenseRows
                        ? tr('Add, edit, or delete expenses and the financial report will refresh automatically.', 'مصارف را اضافه، ویرایش یا حذف کنید و راپور مالی به‌صورت خودکار به‌روز می‌شود.')
                        : tr('You can review expense records for this range.', 'شما فقط می‌توانید رکوردهای مصارف این بازه را مشاهده کنید.')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {canManageExpenseRows ? (<GlassActionButton label={tr('Add Expense', 'افزودن مصرف')} tone="primary" onClick={() => openExpenseEditor()}/>) : null}
                      <GlassActionButton label={tr('Close', 'بستن')} onClick={closeFinancialOverlay}/>
                    </div>
                  </div>}>
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.08fr,0.92fr]">
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <GlassMetricSummary label={tr('Expense total', 'مجموع مصارف')} value={formatExecutiveNumber(homeExpenseSummary.totalAmount)} tone="danger"/>
                      <GlassMetricSummary label={tr('Expense count', 'تعداد مصارف')} value={formatExecutiveNumber(homeExpenseSummary.count)}/>
                    </div>
                    <div className={`${HOME_GLASS_SHELL} p-5`}>
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-lg font-black text-slate-900">{tr('Expense records', 'رکوردهای مصارف')}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-600">{tr('Records are limited to the current executive range.', 'رکوردها فقط به بازه فعلی داشبورد اجرایی محدود شده‌اند.')}</p>
                        </div>
                        <span className={HOME_MUTED_BADGE}>{formatExecutiveNumber(homeExpenseRows.length)}</span>
                      </div>
                      <GlassTableShell>
                        {homeExpenseRows.length ? (<div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="bg-white/76 text-slate-500 backdrop-blur-md">
                                <tr>
                                  <th className="px-4 py-4 text-right font-black">{tr('Date', 'تاریخ')}</th>
                                  <th className="px-4 py-4 text-right font-black">{tr('Title', 'عنوان')}</th>
                                  <th className="px-4 py-4 text-right font-black">{tr('Category', 'دسته‌بندی')}</th>
                                  <th className="px-4 py-4 text-right font-black">{tr('Amount', 'مبلغ')}</th>
                                  <th className="px-4 py-4 text-right font-black">{tr('Description', 'توضیحات')}</th>
                                  <th className="px-4 py-4 text-right font-black">{tr('Recorded by', 'ثبت‌کننده')}</th>
                                  {(canEditExpenseRows || canManageExpenseRows) ? <th className="px-4 py-4 text-center font-black">{tr('Actions', 'عملیات')}</th> : null}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/70 bg-white/50">
                                {homeExpenseRows.map((expense) => (<tr key={expense.id} className="transition hover:bg-white/55">
                                    <td className="px-4 py-4 font-semibold text-slate-600">{formatReportDate(expense.date, reportLanguage, report)}</td>
                                    <td className="px-4 py-4 font-black text-slate-900">{expense.title}</td>
                                    <td className="px-4 py-4 font-semibold text-slate-600">{expense.category}</td>
                                    <td className="px-4 py-4 font-black text-rose-700">{formatExecutiveNumber(expense.amount)}</td>
                                    <td className="px-4 py-4 font-semibold text-slate-500">{expense.description || '-'}</td>
                                    <td className="px-4 py-4 font-semibold text-slate-600">{expense.recordedBy}</td>
                                    {(canEditExpenseRows || canManageExpenseRows) ? (<td className="px-4 py-4">
                                        <div className="flex justify-center gap-2">
                                          {canEditExpenseRows ? (<GlassActionButton label={tr('Edit', 'ویرایش')} ariaLabel={tr(`Edit ${expense.title}`, `ویرایش ${expense.title}`)} className="px-3 py-2 text-xs" onClick={() => openExpenseEditor(expense)}/>) : null}
                                          {canManageExpenseRows ? (<GlassActionButton label={tr('Delete', 'حذف')} ariaLabel={tr(`Delete ${expense.title}`, `حذف ${expense.title}`)} tone="danger" className="px-3 py-2 text-xs" onClick={() => requestDeleteExpense(expense.id, expense.title)}/>) : null}
                                        </div>
                                      </td>) : null}
                                  </tr>))}
                              </tbody>
                            </table>
                          </div>) : (<ClassicEmptyState text={tr('No expense has been recorded yet.', 'هنوز مصرفی ثبت نشده است.')}/>)}
                      </GlassTableShell>
                    </div>
                  </div>

                  <div className={`${HOME_GLASS_SHELL} p-5`}>
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-black text-slate-900">{tr('Category breakdown', 'ترکیب دسته‌بندی‌ها')}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">{tr('Highest expense categories in the current range.', 'بیشترین دسته‌های مصارف در بازه فعلی.')}</p>
                      </div>
                      <span className={HOME_MUTED_BADGE}>{tr('Live', 'زنده')}</span>
                    </div>
                    <GlassCategoryBreakdown items={homeExpenseSummary.topCategories} numberLocale={numberLocale} categoryIcons={settings?.expenseCategoryIcons} emptyText={tr('No expense categories are available.', 'هیچ دستهٔ مصرفی برای این بازه موجود نیست.')}/>
                  </div>
                </div>
              </Modal>

              <Modal isOpen={!!expenseEditorState} onClose={closeExpenseEditor} title={expenseEditorState?.mode === 'edit'
                    ? tr('Edit Expense', 'ویرایش مصرف')
                    : tr('Add Expense', 'افزودن مصرف')} maxWidthClassName="max-w-2xl" panelClassName={homeModalPanelClassName} headerClassName={homeModalHeaderClassName} bodyClassName={`${homeModalBodyClassName} space-y-4`} footerClassName={homeModalFooterClassName} overlayClassName={homeModalOverlayClassName} closeButtonClassName="rounded-full border border-white/75 bg-white/72 p-2 text-slate-500 transition hover:bg-white hover:text-slate-800" titleClassName="text-xl font-black text-slate-900" footer={<div className="flex flex-wrap justify-end gap-2">
                    <GlassActionButton label={tr('Cancel', 'لغو')} onClick={closeExpenseEditor}/>
                    <GlassActionButton label={expenseEditorState?.mode === 'edit' ? tr('Save Changes', 'ذخیره تغییرات') : tr('Record Expense', 'ثبت مصرف')} tone="primary" onClick={submitExpenseEditor}/>
                  </div>}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="block">
                    <FieldLabel>{tr('Title', 'عنوان')}</FieldLabel>
                    <input aria-label={tr('Title', 'عنوان')} type="text" value={expenseDraft.title} onChange={(event) => handleExpenseDraftChange('title', event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-white/80 bg-white/76 px-4 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-300 focus:ring-2 focus:ring-brand-200/80" placeholder={tr('Expense title', 'عنوان مصرف')}/>
                  </label>
                  <label className="block">
                    <FieldLabel>{tr('Amount', 'مبلغ')}</FieldLabel>
                    <input aria-label={tr('Amount', 'مبلغ')} type="text" inputMode="decimal" value={expenseDraft.amount} onChange={(event) => handleExpenseAmountChange(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-white/80 bg-white/76 px-4 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-300 focus:ring-2 focus:ring-brand-200/80" placeholder="0"/>
                  </label>
                  <label className="block">
                    <FieldLabel>{tr('Category', 'دسته‌بندی')}</FieldLabel>
                    <div className="relative mt-2">
                      <select aria-label={tr('Category', 'دسته‌بندی')} value={expenseDraft.category} onChange={(event) => handleExpenseDraftChange('category', event.target.value)} className="h-12 w-full rounded-2xl border border-white/80 bg-white/76 ps-12 pe-4 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-300 focus:ring-2 focus:ring-brand-200/80">
                        {expenseCategories.map((category) => (<option key={category} value={category}>
                            {category}
                          </option>))}
                      </select>
                      <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2">
                        {(() => {
                    const meta = resolveCategoryIconMeta(settings?.expenseCategoryIcons, expenseDraft.category);
                    return <CategoryIconChip icon={meta.icon} color={meta.color} size="sm" animateKey={`${meta.icon}-${meta.color}`}/>;
                })()}
                      </span>
                    </div>
                  </label>
                  <label className="block">
                    <FieldLabel>{tr('Date', 'تاریخ')}</FieldLabel>
                    <input aria-label={tr('Date', 'تاریخ')} type="date" value={expenseDraft.date} onChange={(event) => handleExpenseDraftChange('date', event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-white/80 bg-white/76 px-4 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-300 focus:ring-2 focus:ring-brand-200/80 wk-date-input"/>
                  </label>
                </div>
                <label className="block">
                  <FieldLabel>{tr('Description', 'توضیحات')}</FieldLabel>
                  <textarea aria-label={tr('Description', 'توضیحات')} value={expenseDraft.description} onChange={(event) => handleExpenseDraftChange('description', event.target.value)} rows={4} className="mt-2 w-full rounded-[24px] border border-white/80 bg-white/76 px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-300 focus:ring-2 focus:ring-brand-200/80" placeholder={tr('Optional note', 'یادداشت اختیاری')}/>
                </label>
                {editingExpense ? (<div className={`${HOME_MUTED_BADGE} text-sm`}>
                    {tr('Editing', 'در حال ویرایش')}: {editingExpense.title}
                  </div>) : null}
                {expenseFormError ? (<div className="rounded-[22px] border border-rose-200/80 bg-rose-50/72 px-4 py-3 text-sm font-bold text-rose-700">
                    {expenseFormError}
                  </div>) : null}
              </Modal>

              <Modal isOpen={!!pendingDeleteAction} onClose={() => setPendingDeleteAction(null)} title={pendingDeleteAction?.kind === 'expense'
                    ? tr('Confirm expense deletion', 'تأیید حذف مصرف')
                    : tr('Confirm invoice deletion', 'تأیید حذف فاکتورها')} maxWidthClassName="max-w-xl" panelClassName={homeModalPanelClassName} headerClassName={homeModalHeaderClassName} bodyClassName={`${homeModalBodyClassName} space-y-4`} footerClassName={homeModalFooterClassName} overlayClassName={pendingDeleteAction?.kind === 'invoices' ? invoiceManagerChildOverlayClassName : homeModalOverlayClassName} closeButtonClassName="rounded-full border border-white/75 bg-white/72 p-2 text-slate-500 transition hover:bg-white hover:text-slate-800" titleClassName="text-xl font-black text-slate-900" footer={<div className="flex flex-wrap justify-end gap-2">
                    <GlassActionButton label={tr('Cancel', 'لغو')} onClick={() => setPendingDeleteAction(null)}/>
                    <GlassActionButton label={tr('Yes, delete', 'بله، حذف شود')} tone="danger" onClick={confirmPendingDelete}/>
                  </div>}>
                {pendingDeleteAction?.kind === 'expense' ? (<>
                    <p className="text-sm font-semibold leading-7 text-slate-700">
                      {tr('Deleting this expense will remove it from the current range and refresh profit and expense calculations automatically.', 'با حذف این مصرف، از بازه فعلی حذف می‌شود و محاسبات مفاد و مصارف به‌صورت خودکار دوباره به‌روز می‌گردد.')}
                    </p>
                    <div className="rounded-[22px] border border-rose-200/80 bg-rose-50/72 px-4 py-3 text-sm font-bold text-rose-700">
                      {pendingDeleteAction.expenseLabel}
                    </div>
                  </>) : (<>
                    <p className="text-sm font-semibold leading-7 text-slate-700">
                      {tr('Deleting the selected invoice(s) will restore warehouse stock and fully recalculate the customer account.', 'با حذف فاکتورهای انتخاب‌شده، موجودی گدام برگردانده می‌شود و حساب مشتری به‌صورت کامل دوباره محاسبه می‌گردد.')}
                    </p>
                    <div className="rounded-[22px] border border-rose-200/80 bg-rose-50/72 px-4 py-3 text-sm font-bold text-rose-700">
                      {tr('Selected invoices', 'فاکتورهای انتخاب‌شده')}: {formatExecutiveNumber(pendingInvoiceDeleteCount)}
                    </div>
                  </>)}
              </Modal>
          </>) : null}
        </div>
      </div>);
    }
    return (<PageSurface dir={isEnglish ? 'ltr' : 'rtl'} className="space-y-4 p-4 sm:p-5">
      {isInitialReportLoading ? <LoadingSkeleton /> : null}

      {reportState.status === 'error' ? (<EmptyPanel title={tr('Report generation failed', 'ساخت راپور ناموفق شد')} description={reportState.message} actionLabel={tr('Retry', 'تلاش دوباره')} onAction={() => setRefreshToken((current) => current + 1)}/>) : null}

      {canRenderReportContent && report ? (<>
          {report.state !== 'ready' ? (<SharedFlatCard className="p-5">
              <EmptyStateShell title={report.stateTitle} description={report.stateDescription} action={primaryStateAction ? <ActionButton label={primaryStateAction.label} onClick={primaryStateAction.onClick} tone="primary"/> : undefined} className="py-8"/>
            </SharedFlatCard>) : (<>
              <PageHeader eyebrow={tr('Analyst workspace', 'فضای کاری تحلیل‌گر')} title={tr('Advanced Reports', 'راپور پیشرفته')} subtitle={tr('Saved views, query shaping, and table-first investigation for power users.', 'نمای ذخیره‌شده، شکل‌دهی query و بررسی table-first برای کاربران حرفه‌ای.')} primaryAction={{ label: tr('Export', 'خروجی'), onClick: openPrimaryAction }} secondaryActions={[
                    { label: tr('More Filters', 'فیلترهای بیشتر'), onClick: () => setIsFilterDrawerOpen(true), variant: 'secondary' },
                    { label: tr('Save View', 'ذخیره نما'), onClick: handleSaveView, variant: 'ghost' }
                ]} meta={(<div className="flex flex-wrap gap-2">
                    <span className="wk-status-badge wk-status-badge--neutral">{tr('Last update', 'آخرین به‌روزرسانی')}: {report.lastDataSync ? formatReportDate(report.lastDataSync, report.language, report) : '-'}</span>
                    <span className="wk-status-badge wk-status-badge--neutral">{tr('Generated by', 'تولیدشده توسط')}: {report.metadata.generatedBy}</span>
                    <span className="wk-status-badge wk-status-badge--neutral">{tr('Range', 'بازه')}: {report.range.label}</span>
                  </div>)}/>

              <UnifiedFilterBar searchSlot={<FilterSearchField label={tr('Query / search', 'query / جستجو')} value={filters.query || ''} onChange={(value) => updateFilter('query', value)} placeholder={tr('Customer, invoice, product, supplier...', 'مشتری، فاکتور، کالا، تامین‌کننده...')} dir={language === 'english' ? 'ltr' : 'rtl'}/>} filters={[
                    <FilterSelect key="range" label={tr('Range', 'بازه')} value={filters.preset} onChange={(value) => updateFilter('preset', value as ReportFilters['preset'])} options={rangeOptions} compact/>,
                    <FilterSelect key="salesperson" label={tr('Salesperson', 'فروشنده')} value={filters.userId || 'all'} onChange={(value) => updateFilter('userId', value)} options={report.options.users || [{ value: 'all', label: tr('All', 'همه') }]} compact/>,
                    <FilterSelect key="customer" label={tr('Customer', 'مشتری')} value={filters.customerId || 'all'} onChange={(value) => updateFilter('customerId', value)} options={report.options.customers || [{ value: 'all', label: tr('All', 'همه') }]} compact/>,
                    <FilterSelect key="payment" label={tr('Payment Status', 'وضعیت پرداخت')} value={filters.paymentStatus || 'all'} onChange={(value) => updateFilter('paymentStatus', value)} options={report.options.paymentStatuses || [{ value: 'all', label: tr('All', 'همه') }]} compact/>
                ]} actionsSlot={(<>
                    <ActionButton label={tr('Print', 'چاپ')} onClick={() => void exportReport('print')}/>
                    <ActionButton label={tr('Reset', 'بازنشانی')} onClick={resetFilters}/>
                  </>)} resultsLabel={currentPrimaryTable ? tr(`${currentPrimaryTable.rows.length} row(s) in current result`, `${currentPrimaryTable.rows.length} ردیف در نتیجه فعلی`) : tr('No table result yet', 'هنوز نتیجه جدولی وجود ندارد')} activeFiltersSlot={report.appliedFilters.slice(0, 6).map((filter) => (<ActiveFilterChip key={filter.key} label={`${filter.label}: ${filter.value}`}/>))}/>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px,minmax(0,1fr)]">
                <div className="space-y-4">
                  <SharedFlatCard className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-black text-slate-900">{tr('Saved views rail', 'نوار نماهای ذخیره‌شده')}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Fast entry points for repeat analysis.', 'ورودی‌های سریع برای تحلیل‌های تکراری.')}</p>
                      </div>
                      <span className="wk-status-badge wk-status-badge--neutral">{savedViews.length}</span>
                    </div>
                    <div className="mt-4 space-y-2">
                      {advancedSavedViews.length ? advancedSavedViews.map((view) => (<button key={view.id} type="button" onClick={() => applyView(view)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-left transition hover:border-brand-200 hover:bg-brand-50/40">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-900">{view.favorite ? `★ ${view.name}` : view.name}</p>
                            <p className="mt-1 text-[11px] font-semibold text-slate-500">{formatReportDate(view.createdAt, report.language, report)}</p>
                          </div>
                          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-black text-brand-700">{view.filters.preset}</span>
                        </button>)) : (<EmptyStateShell title={tr('No saved view yet', 'هنوز نمای ذخیره‌شده‌ای وجود ندارد')} description={tr('Save the current query after shaping filters to create your first reusable analyst view.', 'پس از شکل‌دادن فیلترها، query فعلی را ذخیره کنید تا اولین نمای قابل استفاده مجدد ساخته شود.')} className="py-8"/>)}
                    </div>
                  </SharedFlatCard>

                  <SharedFlatCard className="p-4">
                    <p className="text-base font-black text-slate-900">{tr('Workspace status', 'وضعیت workspace')}</p>
                    <div className="mt-3 space-y-2.5">
                      <div className="rounded-2xl border border-white/70 bg-white/78 px-4 py-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Tab', 'تب')}</p>
                        <p className="mt-2 text-sm font-black text-slate-900">{currentSection?.title}</p>
                      </div>
                      <div className="rounded-2xl border border-white/70 bg-white/78 px-4 py-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Applied filters', 'فیلترهای اعمال‌شده')}</p>
                        <p className="mt-2 text-sm font-black text-slate-900">{report.appliedFilters.length}</p>
                      </div>
                      <div className="rounded-2xl border border-white/70 bg-white/78 px-4 py-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Export jobs', 'وظیفه‌های خروجی')}</p>
                        <p className="mt-2 text-sm font-black text-slate-900">{exportJobs.length}</p>
                      </div>
                    </div>
                  </SharedFlatCard>
                </div>

                <div className="space-y-4">
                  <Surface className="overflow-hidden">
                    <div className="border-b border-slate-100 px-5 py-4">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="space-y-3">
                          <div>
                            <p className="text-sm font-black text-slate-900">{tr('Query builder', 'سازنده query')}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {tr('Shape the workspace before opening the result surface.', 'پیش از بازکردن سطح نتیجه، فضای تحلیل را شکل بدهید.')}
                            </p>
                          </div>
                          <TabStrip compact ariaLabel={tr('Advanced report sections', 'بخش‌های راپور پیشرفته')} items={allowedTabs.map((tab) => ({
                    id: tab,
                    label: report.sections[tab].navigationLabel,
                    active: currentTab === tab,
                    onClick: () => setActiveTab(tab)
                }))}/>
                        </div>
                        <div className="grid w-full gap-3 md:grid-cols-2 xl:w-auto xl:min-w-[360px]">
                          <FilterDateField label={tr('Start Date', 'تاریخ شروع')} value={filters.startDate || ''} onChange={(value) => updateFilter('startDate', value)} disabled={filters.preset !== 'custom'}/>
                          <FilterDateField label={tr('End Date', 'تاریخ ختم')} value={filters.endDate || ''} onChange={(value) => updateFilter('endDate', value)} disabled={filters.preset !== 'custom'}/>
                        </div>
                      </div>
                    </div>
                  </Surface>
                  {filters.preset !== 'custom' ? <LockHint>{tr('Custom date fields open when the range is set to custom.', 'فیلدهای تاریخ سفارشی زمانی فعال می‌شوند که بازه روی حالت سفارشی قرار بگیرد.')}</LockHint> : null}

                  {advancedWorkspaceState ? (<SharedFlatCard className="p-5">
                      <EmptyStateShell title={advancedWorkspaceState.title} description={advancedWorkspaceState.description} action={advancedWorkspaceState.key === 'invalid' ? (<ActionButton label={tr('Reset Filters', 'بازنشانی فیلترها')} onClick={resetFilters} tone="primary"/>) : advancedWorkspaceState.key === 'no-query' ? (<ActionButton label={tr('Open Filters', 'بازکردن فیلترها')} onClick={() => setIsFilterDrawerOpen(true)} tone="primary"/>) : advancedWorkspaceState.key === 'zero-result' ? (<ActionButton label={tr('Try broader range', 'بازه گسترده‌تر را امتحان کنید')} onClick={resetFilters} tone="primary"/>) : (<ActionButton label={tr('Refresh', 'تازه‌سازی')} onClick={() => setRefreshToken((current) => current + 1)} tone="primary"/>)} className="py-8"/>
                    </SharedFlatCard>) : (<>
                      <Surface className="overflow-hidden">
                        <div className="border-b border-slate-100 px-5 py-4">
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div className="space-y-3">
                              <div>
                                <p className="text-sm font-black text-slate-900">{tr('Result workspace', 'فضای نتیجه')}</p>
                                <p className="mt-1 text-xs font-semibold text-slate-500">
                                  {currentSection?.subtitle}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {report.appliedFilters.slice(0, 5).map((filter) => (<span key={filter.key} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-600">
                                    {filter.label}: {filter.value}
                                  </span>))}
                                {report.appliedFilters.length > 5 ? (<span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-600">
                                    +{report.appliedFilters.length - 5}
                                  </span>) : null}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-start gap-2">
                              <ActionButton label={tr('Download Report', 'دانلود راپور')} onClick={openPrimaryAction} tone="primary"/>
                              <ActionButton label={tr('Filters', 'فیلترها')} onClick={() => setIsFilterDrawerOpen(true)}/>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4 px-5 py-5">
                          {currentPageInsights.length ? (<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                              {currentPageInsights.map((insight) => (<InsightCard key={insight.id} title={insight.title} description={insight.description} tone={insight.tone} onOpen={() => insight.tableId && setSelectedTableId(insight.tableId)}/>))}
                            </div>) : null}

                          {heroMetrics.length ? (<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                              {heroMetrics.map((metric) => (<KpiCard key={metric.key} metric={metric} onOpen={() => setSelectedTableId(metric.detailTableId)} helpOpen={helpMetricKey === metric.key} onHelpToggle={() => setHelpMetricKey((current) => (current === metric.key ? null : metric.key))}/>))}
                            </div>) : null}

                          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr,0.9fr]">
                            {currentPrimaryTable ? (<DataTable bundle={report} table={currentPrimaryTable} titleAction={<ActionButton label={tr('Open full table', 'بازکردن جدول کامل')} onClick={() => setSelectedTableId(currentPrimaryTable.id)}/>}/>) : (<EmptyPanel title={tr('Table unavailable', 'جدول در دسترس نیست')} description={tr('There is no main table to show for this tab yet.', 'برای این تب هنوز جدول اصلی در دسترس نیست.')}/>)}
                            {primaryChart ? <ChartPanel bundle={report} chart={primaryChart}/> : <EmptyPanel title={tr('Chart unavailable', 'نمودار در دسترس نیست')} description={tr('This tab does not have enough data to render a primary chart.', 'این تب فعلاً داده کافی برای نمودار اصلی ندارد.')}/>}
                          </div>
                        </div>
                      </Surface>

                      <Surface className="overflow-hidden">
                        <button type="button" onClick={() => setDetailsOpenByTab((current) => ({
                        ...current,
                        [currentTab]: !current[currentTab]
                    }))} className="flex w-full items-center justify-between px-5 py-4 text-left" aria-expanded={detailsOpenByTab[currentTab]}>
                          <div>
                            <p className="text-base font-black text-slate-900">{tr('More Details', 'جزئیات بیشتر')}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {tr('Technical metrics, supporting tables, and professional actions stay here.', 'شاخص‌های فنی، جدول‌های پشتیبان و ابزارهای حرفه‌ای در این بخش می‌مانند.')}
                            </p>
                          </div>
                          <span className="text-2xl font-light text-slate-400">{detailsOpenByTab[currentTab] ? '−' : '+'}</span>
                        </button>
                        {detailsOpenByTab[currentTab] ? (<div className="space-y-4 border-t border-slate-100 px-5 py-4">
                            <div className="flex flex-wrap gap-2">
                              <ActionButton label={tr('Refresh', 'تازه‌سازی')} onClick={() => setRefreshToken((current) => current + 1)}/>
                              <ActionButton label={tr('Save View', 'ذخیره نما')} onClick={handleSaveView}/>
                              <ActionButton label={tr('Share', 'اشتراک‌گذاری')} onClick={() => void shareReport()}/>
                              <ActionButton label={tr('Print', 'چاپ')} onClick={() => void exportReport('print')}/>
                              <ActionButton label={tr('Advanced Export', 'خروجی پیشرفته')} onClick={() => setIsAdvancedExportOpen(true)}/>
                            </div>
                            {detailMetrics.length ? (<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                {detailMetrics.map((metric) => (<KpiCard key={metric.key} metric={metric} onOpen={() => setSelectedTableId(metric.detailTableId)} helpOpen={helpMetricKey === metric.key} onHelpToggle={() => setHelpMetricKey((current) => (current === metric.key ? null : metric.key))}/>))}
                              </div>) : null}
                            {secondaryCharts.length ? (<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                {secondaryCharts.slice(0, 2).map((chart) => (<ChartPanel key={chart.id} bundle={report} chart={chart}/>))}
                              </div>) : null}
                            {secondaryTables?.length ? (<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                {secondaryTables.slice(0, 2).map((table) => (<DataTable key={table.id} bundle={report} table={table} pageSize={6} titleAction={<ActionButton label={tr('Open full table', 'بازکردن جدول کامل')} onClick={() => setSelectedTableId(table.id)}/>}/>))}
                              </div>) : null}
                            {!detailMetrics.length && !secondaryCharts.length && !secondaryTables?.length ? (<p className="text-sm font-semibold text-slate-600">{tr('No extra detail is available for this tab yet.', 'برای این تب هنوز جزئیات بیشتری در دسترس نیست.')}</p>) : null}
                          </div>) : null}
                      </Surface>
                    </>)}
                </div>
              </div>
            </>)}
        </>) : null}

      <DrawerModal isOpen={isFilterDrawerOpen} onClose={() => setIsFilterDrawerOpen(false)} title={tr('Filters & Saved Views', 'فیلترها و نماهای ذخیره‌شده')} footer={<div className="flex flex-wrap justify-between gap-3">
            <ActionButton label={tr('Reset Filters', 'بازنشانی فیلترها')} onClick={resetFilters}/>
            <div className="flex gap-2">
              <ActionButton label={tr('Save View', 'ذخیره نما')} onClick={handleSaveView}/>
              <ActionButton label={tr('Done', 'بستن')} onClick={() => setIsFilterDrawerOpen(false)} tone="primary"/>
            </div>
          </div>}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FilterSelect label={tr('Range', 'بازه')} value={filters.preset} onChange={(value) => updateFilter('preset', value as ReportFilters['preset'])} options={rangeOptions}/>
            <label className="block">
              <FieldLabel>{tr('Search', 'جستجو')}</FieldLabel>
              <input value={filters.query || ''} onChange={(event) => updateFilter('query', event.target.value)} placeholder={tr('Customer, invoice, product...', 'مشتری، فاکتور، کالا...')} className="mt-2 h-[50px] w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:ring-2 focus:ring-brand-200"/>
            </label>
            <FilterSelect label={tr('Branch', 'شعبه')} value={filters.branch || 'all'} onChange={(value) => updateFilter('branch', value)} options={report?.options.branches || [{ value: 'all', label: tr('All', 'همه') }]}/>
            <FilterSelect label={tr('Warehouse', 'انبار')} value={filters.warehouse || 'all'} onChange={(value) => updateFilter('warehouse', value)} options={report?.options.warehouses || [{ value: 'all', label: tr('All', 'همه') }]}/>
            <FilterSelect label={tr('Salesperson', 'فروشنده')} value={filters.userId || 'all'} onChange={(value) => updateFilter('userId', value)} options={report?.options.users || [{ value: 'all', label: tr('All', 'همه') }]}/>
            <FilterSelect label={tr('Customer', 'مشتری')} value={filters.customerId || 'all'} onChange={(value) => updateFilter('customerId', value)} options={report?.options.customers || [{ value: 'all', label: tr('All', 'همه') }]}/>
            <FilterSelect label={tr('Payment Status', 'وضعیت پرداخت')} value={filters.paymentStatus || 'all'} onChange={(value) => updateFilter('paymentStatus', value)} options={report?.options.paymentStatuses || [{ value: 'all', label: tr('All', 'همه') }]}/>
            <FilterSelect label={tr('Product Type', 'نوع کالا')} value={filters.productType || 'all'} onChange={(value) => updateFilter('productType', value)} options={report?.options.productTypes || [{ value: 'all', label: tr('All', 'همه') }]}/>
            <FilterSelect label={tr('Brand', 'برند')} value={filters.manufacturer || 'all'} onChange={(value) => updateFilter('manufacturer', value)} options={report?.options.manufacturers || [{ value: 'all', label: tr('All', 'همه') }]}/>
            <FilterSelect label={tr('Supplier', 'تأمین‌کننده')} value={filters.supplierId || 'all'} onChange={(value) => updateFilter('supplierId', value)} options={report?.options.suppliers || [{ value: 'all', label: tr('All', 'همه') }]}/>
            <FilterSelect label={tr('Sales Mode', 'نوع فروش')} value={filters.salesMode || 'all'} onChange={(value) => updateFilter('salesMode', value)} options={report?.options.salesModes || [{ value: 'all', label: tr('All', 'همه') }]}/>
            <label className="flex items-end">
              <span className="flex h-[50px] w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
                <span>{tr('Compare with previous period', 'مقایسه با دوره قبل')}</span>
                <input type="checkbox" checked={!!filters.compareWithPrevious} onChange={(event) => updateFilter('compareWithPrevious', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600"/>
              </span>
            </label>
          </div>

          {filters.preset === 'custom' ? (<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <FieldLabel>{tr('Start Date', 'تاریخ شروع')}</FieldLabel>
                <input type="date" value={filters.startDate || ''} onChange={(event) => updateFilter('startDate', event.target.value)} className="mt-2 h-[50px] w-full rounded-2xl border border-white/60 bg-white/70 backdrop-blur-sm px-4 text-sm font-semibold text-slate-800 outline-hidden focus:border-brand-400 focus:ring-2 focus:ring-brand-200 transition-all hover:bg-white/90 wk-date-input"/>
              </label>
              <label className="block">
                <FieldLabel>{tr('End Date', 'تاریخ ختم')}</FieldLabel>
                <input type="date" value={filters.endDate || ''} onChange={(event) => updateFilter('endDate', event.target.value)} className="mt-2 h-[50px] w-full rounded-2xl border border-white/60 bg-white/70 backdrop-blur-sm px-4 text-sm font-semibold text-slate-800 outline-hidden focus:border-brand-400 focus:ring-2 focus:ring-brand-200 transition-all hover:bg-white/90 wk-date-input"/>
              </label>
            </div>) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black text-slate-900">{tr('Saved Views', 'نماهای ذخیره‌شده')}</p>
              <span className="text-xs font-semibold text-slate-500">{savedViews.length}</span>
            </div>
            {savedViews.length ? (<div className="flex flex-wrap gap-2">
                {savedViews
                .slice()
                .sort((a, b) => Number(b.favorite) - Number(a.favorite))
                .map((view) => (<div key={view.id} className="flex items-center gap-1 rounded-full border border-white/50 bg-white/60 backdrop-blur-sm px-2 py-1 shadow-sm">
                      <button type="button" onClick={() => applyView(view)} className="px-2 py-1 text-xs font-black text-slate-700">
                        {view.favorite ? '★ ' : ''}
                        {view.name}
                      </button>
                      <button type="button" onClick={() => toggleFavorite(view.id)} className="text-slate-400 transition hover:text-amber-500">
                        ☆
                      </button>
                      <button type="button" onClick={() => removeView(view.id)} className="text-slate-400 transition hover:text-rose-500">
                        ×
                      </button>
                    </div>))}
              </div>) : (<p className="text-sm font-semibold text-slate-600">{tr('No saved view yet.', 'هنوز نمای ذخیره‌شده وجود ندارد.')}</p>)}
          </div>
        </div>
      </DrawerModal>

      <Modal isOpen={isQuickExportOpen} onClose={() => setIsQuickExportOpen(false)} title={tr('Download Report', 'دانلود راپور')} maxWidthClassName="max-w-lg" panelClassName="rounded-[28px] bg-white/70 backdrop-blur-2xl shadow-[0_40px_100px_-40px_rgba(30,41,59,0.7)]" headerClassName="flex items-center justify-between border-b border-white/50 bg-white/40 px-6 py-5" bodyClassName="space-y-4 px-6 py-5 bg-gradient-to-b from-white/30 to-transparent" footerClassName="border-t border-white/50 bg-white/40 p-4" footer={<div className="flex flex-wrap justify-between gap-3">
            <button type="button" onClick={() => { setIsQuickExportOpen(false); setIsAdvancedExportOpen(true); }} className="text-sm font-bold text-brand-700 transition hover:text-brand-800">
              {tr('Advanced export settings', 'تنظیمات پیشرفته خروجی')}
            </button>
            <ActionButton label={tr('Download PDF Summary', 'دانلود PDF خلاصه')} onClick={() => void quickExportPdf()} tone="primary"/>
          </div>}>
        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-black text-slate-900">{tr('Quick Export', 'خروجی سریع')}</p>
          <div className="mt-3 space-y-2 text-sm font-semibold text-slate-600">
            <p>{tr('Format', 'فرمت')}: PDF Summary</p>
            <p>{tr('Scope', 'محدوده')}: {tr('Overview page', 'صفحه Overview')}</p>
            <p>{tr('Language', 'زبان')}: {language === 'english' ? 'English' : 'دری'}</p>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isAdvancedExportOpen} onClose={() => setIsAdvancedExportOpen(false)} title={tr('Advanced Export', 'خروجی پیشرفته')} maxWidthClassName="max-w-4xl" panelClassName="rounded-[28px] bg-white/80 backdrop-blur-2xl shadow-[0_40px_100px_-40px_rgba(30,41,59,0.7)]" headerClassName="flex items-center justify-between border-b border-white/50 bg-white/40 px-6 py-5" bodyClassName="space-y-5 px-6 py-5 bg-gradient-to-b from-white/30 to-transparent">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <FilterSelect label={tr('Language', 'زبان')} value={exportLanguage} onChange={(value) => setExportLanguage(value as ReportExportLanguage)} options={[
            { value: 'dari', label: 'دری' },
            { value: 'english', label: 'English' },
            { value: 'bilingual', label: tr('Bilingual', 'دوزبانه') }
        ]}/>
          <FilterSelect label={tr('Mode', 'حالت')} value={exportMode} onChange={(value) => setExportMode(value as ReportExportMode)} options={[
            { value: 'summary', label: tr('Summary', 'خلاصه') },
            { value: 'detailed', label: tr('Detailed', 'تفصیلی') },
            { value: 'full', label: tr('Full Report Book', 'گزارش جامع') }
        ]}/>
          <FilterSelect label={tr('Scope', 'محدوده')} value={exportScope} onChange={(value) => setExportScope(value as 'currentTab' | 'fullBook')} options={[
            { value: 'currentTab', label: tr('Current tab', 'تب فعال') },
            { value: 'fullBook', label: tr('Full module', 'کل ماژول') }
        ]}/>
        </div>
        <div>
          <FieldLabel>{tr('Manager Note for PDF', 'یادداشت مدیریتی برای PDF')}</FieldLabel>
          <textarea value={managerNote} onChange={(event) => setManagerNote(event.target.value)} rows={4} placeholder={tr('Add executive commentary or decision notes...', 'جمع‌بندی مدیریتی یا یادداشت تصمیم‌گیری را اینجا بنویسید...')} className="mt-2 w-full rounded-2xl border border-white/60 bg-white/70 backdrop-blur-sm px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:ring-2 focus:ring-brand-200"/>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton label="PDF" onClick={() => void exportReport('pdf')} tone="primary"/>
          <ActionButton label="HTML" onClick={() => void exportReport('html')}/>
          <ActionButton label="CSV" onClick={() => void exportReport('csv')} disabled={exportScope !== 'currentTab'}/>
          <ActionButton label={tr('Print', 'چاپ')} onClick={() => void exportReport('print')}/>
        </div>
        <div className="space-y-2 rounded-[24px] border border-white/50 bg-white/50 backdrop-blur-md p-4">
          <p className="text-sm font-black text-slate-900">{tr('Export Jobs', 'وظیفه‌های خروجی')}</p>
          {exportJobs.length ? (exportJobs.map((job) => (<div key={job.id} className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-sm px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-black text-slate-800">{job.label}</span>
                  <span className="text-xs font-black text-slate-500">{job.status}</span>
                </div>
                {job.detail ? <p className="mt-1 text-xs font-semibold text-slate-500">{job.detail}</p> : null}
              </div>))) : (<p className="text-sm font-semibold text-slate-600">{tr('No export job yet.', 'هنوز وظیفه خروجی وجود ندارد.')}</p>)}
        </div>
      </Modal>

      <DrawerModal isOpen={!!detailDrawerTable && !!report} onClose={() => setSelectedTableId(null)} title={detailDrawerTable?.title || ''}>
        {detailDrawerTable && report ? (<DataTable bundle={report} table={detailDrawerTable} pageSize={10}/>) : null}
      </DrawerModal>
    </PageSurface>);
};
