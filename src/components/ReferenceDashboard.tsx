import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AppSettings, AppView, Customer, Expense, GuestTrialState, Invoice, Medicine, Purchase, Supplier } from '@/types';
import { AlertStrip } from '@/components/dashboard/AlertStrip';
import { buildDashboardModel } from '@/components/dashboard/buildDashboardModel';
import { createAppFormatters, formatAppDate } from '@/lib/formatters';
import { buildReportBundle, type ReportFilters, type ReportTab } from '@/reports/reporting';
import { buildReportFileName, buildReportHtml } from '@/reports/export';
interface DashboardProps {
    medicines: Medicine[];
    invoices: Invoice[];
    customers: Customer[];
    expenses: Expense[];
    settings: AppSettings;
    setView: (view: AppView) => void;
    purchases?: Purchase[];
    suppliers?: Supplier[];
    guestTrialState?: GuestTrialState | null;
    onUpgradeGuestToFree?: () => void;
    onNotify?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
    onOpenInvoiceManager?: () => void;
}
type KpiTone = 'blue' | 'emerald' | 'rose' | 'amber';
type WidgetPreviewKind = 'ring' | 'cards' | 'bars' | 'line' | 'segments' | 'cashflow';
type DashboardRangeKey = '7' | '30' | '90' | '365';
const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const formatDeltaLabel = (current: number, previous: number, isEnglish: boolean) => {
    const safeCurrent = Number.isFinite(current) ? current : 0;
    const safePrevious = Number.isFinite(previous) ? previous : 0;
    if (safePrevious === 0 && safeCurrent > 0)
        return isEnglish ? 'New' : 'جدید';
    if (safePrevious === 0 && safeCurrent === 0)
        return '—';
    const delta = ((safeCurrent - safePrevious) / safePrevious) * 100;
    if (!Number.isFinite(delta))
        return '—';
    return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
};
const hasPreviousData = (previous: number) => Number.isFinite(previous) && previous > 0;
const computeDeltaTone = (current: number, previous: number): KpiTone => {
    if (!hasPreviousData(previous))
        return 'blue';
    return current >= previous ? 'emerald' : 'rose';
};
const metricToneMap: Record<KpiTone, {
    icon: string;
    badge: string;
}> = {
    blue: {
        icon: 'bg-[#f3f7ff] text-[#2563eb] ring-1 ring-[#dbe8ff]',
        badge: 'bg-blue-50 text-blue-600 ring-blue-100',
    },
    emerald: {
        icon: 'bg-[#f3f7ff] text-[#2563eb] ring-1 ring-[#dbe8ff]',
        badge: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    },
    rose: {
        icon: 'bg-[#f3f7ff] text-[#2563eb] ring-1 ring-[#dbe8ff]',
        badge: 'bg-rose-50 text-rose-600 ring-rose-100',
    },
    amber: {
        icon: 'bg-[#f3f7ff] text-[#2563eb] ring-1 ring-[#dbe8ff]',
        badge: 'bg-amber-50 text-amber-600 ring-amber-100',
    },
};
const surfaceCardClass = 'rounded-[18px] border border-[#ebeff3] bg-white shadow-[0_18px_32px_-32px_rgba(15,23,42,0.18)]';
const compactCardClass = 'rounded-[16px] border border-[#ebeff3] bg-white shadow-[0_14px_26px_-30px_rgba(15,23,42,0.16)]';
const subtleActionClass = 'inline-flex items-center gap-2 rounded-full border border-[#e7ecf1] bg-white px-3.5 py-2 text-[0.72rem] font-medium text-slate-600 transition hover:border-[#dce4ee] hover:bg-[#f8fafc] hover:text-slate-800';
const utilityDotsButtonClass = 'rounded-full p-1.5 text-slate-300 transition hover:bg-[#f8fafc] hover:text-slate-500';
const DASHBOARD_EXPORT_TABS: ReportTab[] = ['financial', 'inventory', 'customers'];
const OPERATIONAL_ALERT_HIDDEN_STORAGE_KEY = 'wk.dashboard.operational-alert.hidden.v1';
const readOperationalAlertHiddenPreference = () => {
    try {
        if (typeof window === 'undefined')
            return false;
        return window.localStorage.getItem(OPERATIONAL_ALERT_HIDDEN_STORAGE_KEY) === 'true';
    }
    catch {
        return false;
    }
};
const writeOperationalAlertHiddenPreference = (isHidden: boolean) => {
    try {
        if (typeof window === 'undefined')
            return;
        window.localStorage.setItem(OPERATIONAL_ALERT_HIDDEN_STORAGE_KEY, String(isHidden));
    }
    catch {
        // Preference persistence is best-effort; the dashboard state still updates in memory.
    }
};
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
const toIsoDateInput = (value: Date) => value.toISOString().slice(0, 10);
const WidgetPreview: React.FC<{
    kind: WidgetPreviewKind;
}> = ({ kind }) => {
    if (kind === 'ring') {
        return (<div className="relative flex h-full items-center justify-center rounded-[14px] border border-[#edf1f4] bg-white">
        <svg viewBox="0 0 120 120" className="h-16 w-16 -rotate-90">
          <circle cx="60" cy="60" r="42" fill="none" stroke="#e8eef8" strokeWidth="12"/>
          <circle cx="60" cy="60" r="42" fill="none" stroke="#3b82f6" strokeWidth="12" strokeDasharray="190 264" strokeLinecap="round"/>
          <circle cx="60" cy="60" r="42" fill="none" stroke="#fbbf24" strokeWidth="12" strokeDasharray="38 264" strokeDashoffset="-210" strokeLinecap="round"/>
          <circle cx="60" cy="60" r="42" fill="none" stroke="#34d399" strokeWidth="12" strokeDasharray="26 264" strokeDashoffset="-172" strokeLinecap="round"/>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full border border-[#edf1f4] bg-white px-3 py-2 shadow-[0_10px_16px_-22px_rgba(15,23,42,0.14)]">
            <div className="h-1.5 w-6 rounded-full bg-slate-200"/>
            <div className="mt-1 h-1.5 w-8 rounded-full bg-slate-100"/>
          </div>
        </div>
      </div>);
    }
    if (kind === 'cards') {
        return (<div className="relative flex h-full items-center justify-center rounded-[14px] border border-[#edf1f4] bg-white">
        <div className="absolute -left-3 bottom-3 rounded-[12px] border border-[#edf1f4] bg-white px-3 py-2 shadow-[0_10px_18px_-22px_rgba(15,23,42,0.14)]">
          <div className="h-1.5 w-8 rounded-full bg-slate-100"/>
          <div className="mt-2 text-lg font-black text-slate-900">1,682</div>
          <div className="mt-1 h-1.5 w-10 rounded-full bg-emerald-200"/>
        </div>
        <div className="flex h-20 w-20 items-center justify-center rounded-[14px] bg-[#f8fafe]">
          <div className="w-full max-w-[54px] rounded-[12px] border border-[#edf1f4] bg-white px-3 py-4 shadow-[0_10px_16px_-22px_rgba(15,23,42,0.12)]">
            <div className="h-1.5 w-6 rounded-full bg-slate-200"/>
            <div className="mt-2 h-1.5 w-8 rounded-full bg-slate-100"/>
            <div className="mt-4 h-1.5 w-5 rounded-full bg-blue-500"/>
          </div>
        </div>
      </div>);
    }
    if (kind === 'cashflow') {
        return (<div className="relative h-full overflow-hidden rounded-[14px] border border-cyan-100 bg-gradient-to-br from-white via-cyan-50 to-emerald-50">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-emerald-400"/>
        <svg viewBox="0 0 120 88" className="h-full w-full" aria-hidden="true">
          <rect x="16" y="18" width="62" height="38" rx="12" fill="white" stroke="#d7f4f2" strokeWidth="2"/>
          <rect x="24" y="29" width="24" height="5" rx="2.5" fill="#cbd5e1"/>
          <rect x="24" y="40" width="36" height="5" rx="2.5" fill="#99f6e4"/>
          <circle cx="70" cy="38" r="7" fill="#0ea5e9"/>
          <rect x="68" y="24" width="30" height="42" rx="9" fill="#0f172a" opacity="0.94"/>
          <rect x="74" y="33" width="4" height="22" rx="2" fill="#67e8f9"/>
          <rect x="82" y="28" width="4" height="27" rx="2" fill="#34d399"/>
          <rect x="90" y="38" width="4" height="17" rx="2" fill="#bfdbfe"/>
          <path d="M17 68C29 53 42 72 55 59C66 48 75 63 84 50C91 40 98 42 105 32" fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round"/>
          <path d="M17 68C29 53 42 72 55 59C66 48 75 63 84 50C91 40 98 42 105 32" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeDasharray="5 7" opacity="0.9"/>
          <circle cx="105" cy="32" r="4" fill="#10b981"/>
        </svg>
      </div>);
    }
    if (kind === 'bars') {
        return (<div className="flex h-full items-end justify-center gap-2 rounded-[14px] border border-[#edf1f4] bg-white px-5 pb-5">
        {[40, 68, 96].map((height, index) => (<div key={height} className={`w-4 rounded-full ${index === 2 ? 'bg-blue-500' : 'bg-slate-200'}`} style={{ height }}/>))}
      </div>);
    }
    if (kind === 'segments') {
        return (<div className="relative flex h-full items-center justify-center rounded-[14px] border border-[#edf1f4] bg-white">
        <svg viewBox="0 0 160 90" className="h-16 w-20">
          {Array.from({ length: 18 }).map((_, index) => {
                const angle = 180 - index * 10;
                const radians = (angle * Math.PI) / 180;
                const x1 = 80 + Math.cos(radians) * 24;
                const y1 = 68 - Math.sin(radians) * 24;
                const x2 = 80 + Math.cos(radians) * 56;
                const y2 = 68 - Math.sin(radians) * 56;
                const active = index < 12;
                return (<line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke={active ? '#34d399' : '#e2e8f0'} strokeWidth="6" strokeLinecap="round"/>);
            })}
        </svg>
      </div>);
    }
    return (<div className="flex h-full items-center justify-center rounded-[14px] border border-[#edf1f4] bg-white">
      <svg viewBox="0 0 120 120" className="h-16 w-16">
        <path d="M10 82C27 82 33 58 51 58s25 22 38 22c9 0 14-5 21-14" fill="none" stroke="#fb923c" strokeWidth="4" strokeLinecap="round"/>
        <circle cx="99" cy="66" r="5" fill="#fb923c"/>
        <path d="M10 92h100" stroke="#e2e8f0" strokeWidth="4" strokeLinecap="round"/>
      </svg>
    </div>);
};
const SemiGauge: React.FC<{
    title: string;
    value: number;
    valueLabel?: string;
    caption: string;
    actionLabel: string;
    onClick: () => void;
}> = ({ title, value, valueLabel, caption, actionLabel, onClick, }) => {
    const safeValue = clampValue(value, 0, 100);
    const tone = safeValue >= 70 ? '#34d399' : safeValue >= 40 ? '#60a5fa' : '#fb7185';
    const activeSegments = Math.round((safeValue / 100) * 24);
    return (<section className={`${surfaceCardClass} p-[18px]`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[0.95rem] font-semibold tracking-[-0.02em] text-slate-900">{title}</h3>
        <button type="button" onClick={onClick} className={utilityDotsButtonClass} aria-label={actionLabel}>
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="6.5" cy="12" r="1.4"/>
            <circle cx="12" cy="12" r="1.4"/>
            <circle cx="17.5" cy="12" r="1.4"/>
          </svg>
        </button>
      </div>
      <div className="relative mx-auto mt-4 w-full max-w-[210px]">
        <svg viewBox="0 0 200 120" className="w-full">
          {Array.from({ length: 24 }).map((_, index) => {
            const angle = 180 - index * (180 / 23);
            const radians = (angle * Math.PI) / 180;
            const x1 = 100 + Math.cos(radians) * 46;
            const y1 = 100 - Math.sin(radians) * 46;
            const x2 = 100 + Math.cos(radians) * 72;
            const y2 = 100 - Math.sin(radians) * 72;
            return (<line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke={index < activeSegments ? tone : '#e5e7eb'} strokeWidth="5.5" strokeLinecap="round"/>);
        })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-4 text-center">
          <div className="text-[1.9rem] font-semibold tracking-[-0.05em] text-slate-900">{valueLabel ?? `${Math.round(safeValue)}%`}</div>
          <p className="mt-1 max-w-[10rem] text-[0.72rem] leading-5 text-slate-400">{caption}</p>
        </div>
      </div>
      <button type="button" onClick={onClick} className={`${subtleActionClass} mx-auto mt-2 justify-center`}>
        {actionLabel}
      </button>
    </section>);
};
export const ReferenceDashboard: React.FC<DashboardProps> = ({ medicines, invoices, customers, expenses, settings, setView, purchases = [], suppliers = [], guestTrialState, onUpgradeGuestToFree, onNotify, onOpenInvoiceManager, }) => {
    const isEnglish = (settings?.language || 'dari') === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const formatters = useMemo(() => createAppFormatters(settings?.language, 'AFN', settings?.numberDisplayMode || 'full'), [settings?.language, settings?.numberDisplayMode]);
    const [isWidgetDrawerOpen, setIsWidgetDrawerOpen] = useState(false);
    const [selectedRangeKey, setSelectedRangeKey] = useState<DashboardRangeKey>('30');
    const [isOperationalAlertHidden, setIsOperationalAlertHidden] = useState(readOperationalAlertHiddenPreference);
    const [activeWidgets, setActiveWidgets] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('warekeep_dashboard_widgets');
            return saved ? JSON.parse(saved) : [];
        }
        catch {
            return [];
        }
    });
    const selectedRangeDays = Number(selectedRangeKey);
    const dashboardRanges = useMemo(() => [
        { value: '7' as const, label: tr('Last 7 days', '۷ روز اخیر') },
        { value: '30' as const, label: tr('Last 30 days', '۳۰ روز اخیر') },
        { value: '90' as const, label: tr('Last 90 days', '۹۰ روز اخیر') },
        { value: '365' as const, label: tr('Last 12 months', '۱۲ ماه اخیر') },
    ], [tr]);
    useEffect(() => {
        localStorage.setItem('warekeep_dashboard_widgets', JSON.stringify(activeWidgets));
    }, [activeWidgets]);
    const toggleWidget = useCallback((widgetId: string) => {
        setActiveWidgets(prev => prev.includes(widgetId) ? prev.filter(id => id !== widgetId) : [...prev, widgetId]);
    }, []);
    const model = useMemo(() => buildDashboardModel({
        medicines,
        invoices,
        customers,
        expenses,
        settings,
        formatters,
        periodDays: selectedRangeDays,
    }), [medicines, invoices, customers, expenses, settings, formatters, selectedRangeDays]);
    const receivableSummary = useMemo(() => [
        {
            label: tr('Customer balance', 'مانده حسابات مشتریان'),
            value: formatters.formatDisplayCurrency(model.customerReceivableBalance),
        },
        {
            label: tr('Overdue', 'معوقه'),
            value: formatters.formatDisplayCurrency(model.overdueAmount),
        },
        {
            label: tr('Overdue rate', 'نرخ معوقه'),
            value: `${formatters.formatDisplayNumber(Math.round(model.overdueRate))}%`,
        },
    ], [formatters, model.customerReceivableBalance, model.overdueAmount, model.overdueRate, tr]);
    const hasStockOperationalRisk = model.criticalLowStockCount > 0 || model.lowStockCount > 0 || model.expiringImmediateCount > 0;
    const hasReceivableOperationalRisk = model.overdueAmount > 0;
    const hasOperationalAlert = hasStockOperationalRisk || hasReceivableOperationalRisk;
    const operationalAlertTone = (model.criticalLowStockCount > 0 || model.expiringImmediateCount > 0
        ? 'danger'
        : hasReceivableOperationalRisk
            ? 'warning'
            : 'info') as React.ComponentProps<typeof AlertStrip>['tone'];
    const operationalAlertTargetView: AppView = hasStockOperationalRisk ? 'inventory' : 'customers';
    const operationalAlertTitle = hasStockOperationalRisk
        ? tr('Inventory needs attention', 'موجودی نیاز به توجه دارد')
        : tr('Receivables need follow-up', 'بدهی‌ها نیاز به پیگیری دارد');
    const operationalAlertSummary = hasStockOperationalRisk
        ? tr(`${formatters.formatDisplayNumber(model.lowStockCount)} stock alerts and ${formatters.formatDisplayNumber(model.expiringImmediateCount)} near-expiry items need review.`, `${formatters.formatDisplayNumber(model.lowStockCount)} هشدار موجودی و ${formatters.formatDisplayNumber(model.expiringImmediateCount)} قلم نزدیک به انقضا نیاز به بررسی دارد.`)
        : tr(`${formatters.formatDisplayCurrency(model.overdueAmount)} is overdue across customer balances.`, `${formatters.formatDisplayCurrency(model.overdueAmount)} از مانده مشتریان معوقه است.`);
    const operationalAlertActionLabel = hasStockOperationalRisk
        ? tr('Review stock', 'بررسی موجودی')
        : tr('Review receivables', 'بررسی بدهی‌ها');
    const handleDismissOperationalAlert = useCallback(() => {
        setIsOperationalAlertHidden(true);
        writeOperationalAlertHiddenPreference(true);
    }, []);
    const handleRestoreOperationalAlert = useCallback(() => {
        setIsOperationalAlertHidden(false);
        writeOperationalAlertHiddenPreference(false);
    }, []);
    const periodLabel = useMemo(() => {
        const rangeStart = new Date();
        rangeStart.setDate(rangeStart.getDate() - (selectedRangeDays - 1));
        // FSI…PDI isolates keep each formatted date intact so the bidi algorithm
        // cannot detach the leading day number across the hyphen.
        return `⁨${formatAppDate(rangeStart, settings, 'dashboard')}⁩ - ⁨${formatAppDate(new Date(), settings, 'dashboard')}⁩`;
    }, [selectedRangeDays, settings]);
    const reportFilters = useMemo<ReportFilters>(() => {
        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - (selectedRangeDays - 1));
        return {
            preset: 'custom',
            startDate: toIsoDateInput(startDate),
            endDate: toIsoDateInput(endDate),
            compareWithPrevious: true,
            query: '',
            userId: 'all',
            customerId: 'all',
            productType: 'all',
            manufacturer: 'all',
            supplierId: 'all',
            paymentStatus: 'all',
            salesMode: 'all',
            warehouse: 'all',
            branch: 'all',
        };
    }, [selectedRangeDays]);
    const assistantQuickActions = useMemo(() => [
        {
            id: 'sales',
            label: tr('Record sale', 'ثبت فروش'),
            helper: tr('Create a new invoice and complete checkout.', 'فاکتور جدید ثبت و فروش را نهایی کنید.'),
            metric: `${formatters.formatDisplayNumber(model.todayInvoiceCount)} ${tr('today', 'امروز')}`,
            view: 'sales' as AppView,
        },
        {
            id: 'inventory',
            label: tr('Review low stock', 'بررسی کمبود موجودی'),
            helper: tr('Open stock alerts and restock critical items.', 'هشدارهای موجودی را باز کنید و اقلام بحرانی را تأمین نمایید.'),
            metric: `${formatters.formatDisplayNumber(model.lowStockCount)} ${tr('alerts', 'هشدار')}`,
            view: 'inventory' as AppView,
        },
        {
            id: 'receivables',
            label: tr('Follow receivables', 'پیگیری بدهی‌ها'),
            helper: tr('See unpaid balances and contact customers faster.', 'مانده‌های پرداخت‌نشده را ببینید و سریع‌تر پیگیری کنید.'),
            metric: formatters.formatDisplayCurrency(model.openReceivables),
            view: 'customers' as AppView,
        },
        {
            id: 'expenses',
            label: tr('Log expense', 'ثبت مصرف'),
            helper: tr('Capture today’s operational spending.', 'مصارف عملیاتی امروز را ثبت کنید.'),
            metric: formatters.formatDisplayCurrency(model.todayExpenses),
            view: 'expenses' as AppView,
        },
    ], [formatters, model.lowStockCount, model.openReceivables, model.todayExpenses, model.todayInvoiceCount, tr]);
    const customerSegments = useMemo(() => {
        const rows = [
            {
                id: 'retail' as const,
                label: tr('Retail', 'پرچون'),
                value: model.customerSegments.find((s) => s.id === 'retail')?.total ?? 0,
                accent: 'bg-[#2563eb]',
                border: 'border-[#2563eb]',
                text: 'text-[#2563eb]',
            },
            {
                id: 'wholesale' as const,
                label: tr('Wholesale', 'عمده'),
                value: model.customerSegments.find((s) => s.id === 'wholesale')?.total ?? 0,
                accent: 'bg-[#34d399]',
                border: 'border-[#34d399]',
                text: 'text-[#059669]',
            },
            {
                id: 'bulk' as const,
                label: tr('Bulk / Carton', 'کارتنی'),
                value: model.customerSegments.find((s) => s.id === 'bulk')?.total ?? 0,
                accent: 'bg-[#fb923c]',
                border: 'border-[#fb923c]',
                text: 'text-[#ea580c]',
            },
        ] as const;
        const total = rows.reduce((sum, row) => sum + row.value, 0);
        const minPct = 6;
        const rawPcts = rows.map((row) => (total > 0 ? (row.value / total) * 100 : 100 / rows.length));
        const boostedCount = rawPcts.filter((pct) => pct < minPct).length;
        const reservedSpace = boostedCount * minPct;
        const largePctTotal = rawPcts.filter((pct) => pct >= minPct).reduce((sum, pct) => sum + pct, 0);
        const remainingSpace = 100 - reservedSpace;
        return rows.map((row, index) => ({
            ...row,
            width: rawPcts[index] < minPct
                ? `${minPct}%`
                : largePctTotal > 0 ? `${(rawPcts[index] / largePctTotal) * remainingSpace}%` : `${100 / rows.length}%`,
            share: total > 0 ? Math.round((row.value / total) * 100) : 0,
            displayValue: formatters.formatDisplayCurrency(row.value),
        }));
    }, [formatters, model.customerSegments, isEnglish]);
    const bestSelling = model.bestSelling;
    const dayActivity = useMemo(() => {
        const labels = isEnglish
            ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            : ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
        return model.dayActivity.map((day) => ({
            label: labels[day.dayIndex],
            count: day.count,
            isMax: day.isMax,
            height: day.heightPct,
        }));
    }, [model.dayActivity, isEnglish]);
    const repeatCustomerRate = model.repeatCustomerRate;
    const profitGrowthLabel = formatDeltaLabel(model.periodGrossProfit, model.previousPeriodGrossProfit, isEnglish);
    const growthPositive = !hasPreviousData(model.previousPeriodGrossProfit) || model.periodGrossProfit >= model.previousPeriodGrossProfit;
    const growthIsNeutral = !hasPreviousData(model.previousPeriodGrossProfit);
    const kpis: Array<{
        title: string;
        value: string;
        delta: string;
        footer: string;
        tone: KpiTone;
        icon: React.ReactNode;
        view?: AppView;
        onClick?: () => void;
    }> = [
        {
            title: tr('Sales', 'مجموع فروش'),
            value: formatters.formatDisplayCurrency(model.periodSales),
            delta: formatDeltaLabel(model.periodSales, model.previousPeriodSales, isEnglish),
            footer: hasPreviousData(model.previousPeriodSales) ? tr('vs. last period', 'نسبت به دوره قبل') : tr('first period', 'اولین دوره'),
            tone: computeDeltaTone(model.periodSales, model.previousPeriodSales),
            view: 'sales',
            icon: (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75 9 12l4.5 4.5 8.25-8.25"/>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 8.25h6v6"/>
        </svg>),
        },
        {
            title: tr('Buyers', 'خریداران'),
            value: formatters.formatDisplayNumber(model.periodUniqueCustomers),
            delta: formatDeltaLabel(model.periodUniqueCustomers, model.previousPeriodUniqueCustomers, isEnglish),
            footer: hasPreviousData(model.previousPeriodUniqueCustomers) ? tr('vs. last period', 'نسبت به دوره قبل') : tr('first period', 'اولین دوره'),
            tone: computeDeltaTone(model.periodUniqueCustomers, model.previousPeriodUniqueCustomers),
            view: 'customers',
            icon: (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 20.25v-1.5A3.75 3.75 0 0 0 13.5 15h-3A3.75 3.75 0 0 0 6.75 18.75v1.5"/>
          <circle cx="12" cy="8.25" r="3.25"/>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 20.25v-1.5a3.2 3.2 0 0 0-2.25-3.05M4.5 20.25v-1.5a3.2 3.2 0 0 1 2.25-3.05"/>
        </svg>),
        },
        {
            title: tr('Items Sold', 'اقلام فروخته'),
            value: formatters.formatDisplayNumber(model.periodUnitsSold),
            delta: formatDeltaLabel(model.periodUnitsSold, model.previousPeriodUnitsSold, isEnglish),
            footer: hasPreviousData(model.previousPeriodUnitsSold) ? tr('vs. last period', 'نسبت به دوره قبل') : tr('first period', 'اولین دوره'),
            tone: computeDeltaTone(model.periodUnitsSold, model.previousPeriodUnitsSold),
            view: 'inventory',
            icon: (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-8.25 4.5m8.25-4.5V18l-8.25 4.5m8.25-15-8.25-4.5-8.25 4.5m16.5 0-8.25 4.5m-8.25-4.5V18l8.25 4.5m-8.25-15 8.25 4.5"/>
        </svg>),
        },
        {
            title: tr('Invoices', 'فاکتورها'),
            value: formatters.formatDisplayNumber(model.periodInvoiceCount),
            delta: formatDeltaLabel(model.periodInvoiceCount, model.previousPeriodInvoiceCount, isEnglish),
            footer: hasPreviousData(model.previousPeriodInvoiceCount) ? tr('vs. last period', 'نسبت به دوره قبل') : tr('first period', 'اولین دوره'),
            tone: computeDeltaTone(model.periodInvoiceCount, model.previousPeriodInvoiceCount),
            view: 'reports',
            onClick: onOpenInvoiceManager || (() => setView('reports')),
            icon: (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 6.75h10.5a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5H7.5A1.5 1.5 0 0 1 6 15.75v-7.5a1.5 1.5 0 0 1 1.5-1.5Z"/>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9.75h6m-6 3h3.75"/>
        </svg>),
        },
    ];
    const peakPoint = useMemo(() => {
        const seed = model.trend30[0] ?? { label: '', sales: 0, expenses: 0, net: 0 };
        return model.trend30.reduce((best, point) => (point.sales > best.sales ? point : best), seed);
    }, [model.trend30]);
    const widgetCatalog = [
        {
            id: 'inventory-health',
            title: tr('Inventory Health', 'سلامت انبار'),
            description: tr('Stock levels, low-stock alerts, and expiry risk at a glance.', 'سطح موجودی، هشدار کمبود و ریسک انقضا در یک نگاه.'),
            tag: '#Inventory',
            kind: 'cards' as const,
        },
        {
            id: 'expense-breakdown',
            title: tr('Expense Breakdown', 'تفکیک مصارف'),
            description: tr('See how your expenses are distributed across categories.', 'ببینید مصارف شما چگونه در دسته‌بندی‌ها توزیع شده است.'),
            tag: '#Finance',
            kind: 'ring' as const,
        },
        {
            id: 'top-customers',
            title: tr('Top Customers', 'مشتریان برتر'),
            description: tr('Your highest-revenue customers with purchase and debt details.', 'مشتریان با بیشترین درآمد همراه جزئیات خرید و بدهی.'),
            tag: '#Customers',
            kind: 'bars' as const,
        },
        {
            id: 'receivables-aging',
            title: tr('Receivables Aging', 'سن بدهی‌ها'),
            description: tr('Track overdue payments and aging buckets for better collection.', 'پیگیری پرداخت‌های معوقه و بازه‌های سنی برای وصول بهتر.'),
            tag: '#Finance',
            kind: 'segments' as const,
        },
        {
            id: 'margin-by-channel',
            title: tr('Margin by Channel', 'حاشیه سود کانال‌ها'),
            description: tr('Compare profit margins across retail, wholesale, and bulk channels.', 'حاشیه سود در کانال‌های پرچون، عمده و کارتنی را مقایسه کنید.'),
            tag: '#Profitability',
            kind: 'line' as const,
        },
        {
            id: 'treasury-liquidity',
            title: tr('Treasury & Liquidity', 'صندوق و نقدینگی'),
            description: tr('Cash flow overview with today\'s inflows, outflows, collection rate and net position.', 'نمای جریان نقدی با ورودی و خروجی امروز، نرخ وصول و موقعیت خالص.'),
            tag: '#Treasury',
            kind: 'cashflow' as const,
        },
    ];
    const handleWidgetSelect = (widgetId: string) => {
        const isAdded = !activeWidgets.includes(widgetId);
        const widget = widgetCatalog.find((entry) => entry.id === widgetId);
        toggleWidget(widgetId);
        if (isAdded) {
            setIsWidgetDrawerOpen(false);
        }
        if (widget && onNotify) {
            onNotify(isAdded
                ? (isEnglish ? `${widget.title} added to the dashboard.` : `${widget.title} به داشبورد اضافه شد.`)
                : (isEnglish ? `${widget.title} removed from the dashboard.` : `${widget.title} از داشبورد حذف شد.`), isAdded ? 'success' : 'info');
        }
    };
    const handleExportDashboard = useCallback(async () => {
        try {
            const bundle = buildReportBundle({
                invoices,
                medicines,
                customers,
                expenses,
                purchases,
                suppliers,
                settings,
                filters: reportFilters,
                language: settings.language
            });
            const fileName = buildReportFileName(bundle, 'html');
            const html = buildReportHtml({
                primary: bundle,
                mode: 'summary',
                scope: 'fullBook',
                tabs: DASHBOARD_EXPORT_TABS,
                confidentiality: tr('Confidential / Internal Use Only', 'محرمانه / فقط برای استفاده داخلی')
            });
            if (window.electronAPI?.saveInvoiceHtml) {
                const result = await window.electronAPI.saveInvoiceHtml(html, fileName);
                if (!result?.success) {
                    throw new Error(result?.error || 'SAVE_DASHBOARD_EXPORT_FAILED');
                }
            }
            else {
                downloadBlob(fileName, new Blob([html], { type: 'text/html;charset=utf-8' }));
            }
            onNotify?.(isEnglish ? 'Dashboard report exported successfully.' : 'گزارش داشبورد با موفقیت صادر شد.', 'success');
        }
        catch (error) {
            console.error('Dashboard export failed', error);
            onNotify?.(isEnglish ? 'Dashboard export failed. Please try again.' : 'صدور گزارش داشبورد انجام نشد. دوباره تلاش کنید.', 'error');
        }
    }, [customers, expenses, invoices, isEnglish, medicines, onNotify, purchases, reportFilters, settings, suppliers, tr]);
    return (<>
    <div className="relative min-h-full overflow-hidden bg-[#f6f7f9] p-3 md:p-4 lg:p-5" dir="ltr">
      <div className="relative flex w-full flex-col gap-3">
        {false}
        <section className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-[1.72rem] font-semibold tracking-[-0.045em] text-slate-900">
              {tr('Dashboard', 'داشبورد مدیریتی')}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end" data-testid="dashboard-header-control-rail">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#e7ecf1] bg-white px-3.5 py-2 text-[0.72rem] font-medium text-slate-600">
              <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 7.5V4.875m7.5 2.625V4.875m-9 8.25h10.5m-12 6h13.5A2.25 2.25 0 0 0 21 16.875v-9A2.25 2.25 0 0 0 18.75 5.625H5.25A2.25 2.25 0 0 0 3 7.875v9A2.25 2.25 0 0 0 5.25 19.125Z"/>
              </svg>
              {periodLabel}
            </div>
            <label className={`${subtleActionClass} cursor-pointer pr-3`}>
              <span className="sr-only">{tr('Dashboard period', 'بازه زمانی داشبورد')}</span>
              <select aria-label={tr('Dashboard period', 'بازه زمانی داشبورد')} value={selectedRangeKey} onChange={(event) => setSelectedRangeKey(event.target.value as DashboardRangeKey)} className="bg-transparent pr-5 text-[0.72rem] font-medium text-slate-600 outline-hidden">
                {dashboardRanges.map((range) => (<option key={range.value} value={range.value}>
                    {range.label}
                  </option>))}
              </select>
            </label>
            <button type="button" data-testid="dashboard-add-widget" onClick={() => setIsWidgetDrawerOpen(true)} aria-label={tr('Add widget', 'افزودن ویجت')} title={tr('Add widget', 'افزودن ویجت')} className="wk-btn group inline-flex h-10 min-w-[8rem] items-center justify-center gap-2 rounded-full border border-[#dbe7ff] bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.96),rgba(239,246,255,0.92)_42%,rgba(219,234,254,0.96)_100%)] px-3.5 text-[#2563eb] shadow-[0_16px_30px_-24px_rgba(37,99,235,0.55)] ring-1 ring-white/70 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-22px_rgba(37,99,235,0.7)] hover:text-[#1d4ed8] active:translate-y-0">
              <svg data-testid="dashboard-add-widget-icon" className="h-[18px] w-[18px] shrink-0 drop-shadow-[0_4px_10px_rgba(37,99,235,0.3)] transition-transform group-hover:scale-105" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85">
                <rect x="3.75" y="4.25" width="6.25" height="6.25" rx="1.6"/>
                <rect x="3.75" y="13.5" width="6.25" height="6.25" rx="1.6"/>
                <rect x="13" y="4.25" width="6.25" height="6.25" rx="1.6"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.125 14.8v5.4m2.7-2.7h-5.4"/>
              </svg>
              <span className="wk-btn-label text-[0.72rem] font-medium">
                {tr('Add widget', 'افزودن ویجت')}
              </span>
            </button>
            <button type="button" onClick={() => void handleExportDashboard()} className="wk-btn inline-flex items-center gap-2 rounded-full bg-[#2563eb] px-3.5 py-2 text-[0.72rem] font-medium text-white shadow-[0_16px_24px_-24px_rgba(37,99,235,0.45)] transition hover:bg-[#1d4ed8]">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M4.5 19.5h15"/>
              </svg>
              {tr('Export', 'خروجی')}
            </button>
          </div>
        </section>

        <section className="flex flex-wrap items-center gap-2" dir={isEnglish ? 'ltr' : 'rtl'} aria-label={tr('Primary dashboard actions', 'اقدام‌های اصلی داشبورد')}>
          <button type="button" onClick={() => setView('sales')} className="inline-flex min-h-[34px] items-center rounded-full bg-[#2563eb] px-4 text-[0.78rem] font-bold text-white shadow-[0_14px_26px_-24px_rgba(37,99,235,0.45)] transition hover:bg-[#1d4ed8]">
            {tr('New sale', 'فروش جدید')}
          </button>
          <button type="button" onClick={() => setView('inventory')} className="inline-flex min-h-[34px] items-center rounded-full border border-[#d8e2ee] bg-white px-4 text-[0.78rem] font-bold text-slate-700 transition hover:border-[#cbd7e6] hover:bg-[#f8fafc]">
            {tr('Add stock', 'افزودن موجودی')}
          </button>
        </section>

        {hasOperationalAlert ? (<AlertStrip mode={isOperationalAlertHidden ? 'hidden' : 'visible'} tone={operationalAlertTone} title={operationalAlertTitle} summary={operationalAlertSummary} actionLabel={operationalAlertActionLabel} onAction={() => setView(operationalAlertTargetView)} dismissLabel={tr('Hide alert', 'پنهان کردن هشدار')} onDismiss={handleDismissOperationalAlert} restoreLabel={tr('Show alert', 'نمایش هشدار')} onRestore={handleRestoreOperationalAlert}/>) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const tone = metricToneMap[kpi.tone];
            return (<article key={kpi.title} className={compactCardClass}>
                <button type="button" onClick={() => {
                    if (kpi.onClick) {
                        kpi.onClick();
                        return;
                    }
                    if (kpi.view)
                        setView(kpi.view);
                }} className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition hover:bg-slate-50/80">
                  <div className="min-w-0">
                    <p className="text-[0.75rem] font-medium text-slate-500">{kpi.title}</p>
                    <div className="mt-2.5 flex items-end gap-3">
                      <p className="truncate text-[1.78rem] font-semibold tracking-[-0.055em] text-slate-900">{kpi.value}</p>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[0.66rem] font-semibold ring-1 ${tone.badge}`}>
                        {kpi.delta}
                      </span>
                      <span className="text-[0.69rem] text-slate-400">{kpi.footer}</span>
                    </div>
                  </div>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] ${tone.icon}`}>
                    {kpi.icon}
                  </div>
                </button>
              </article>);
        })}
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(316px,0.92fr)]">
          <div className="space-y-3">
            <article className={`${surfaceCardClass} relative isolate overflow-hidden p-4 md:p-5`}>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[0.98rem] font-semibold tracking-[-0.02em] text-slate-900">{tr('Gross Profit', 'سود ناخالص')}</p>
                  <div className="mt-2.5 flex flex-wrap items-end gap-3">
                    <span className="text-[2.12rem] font-semibold tracking-[-0.065em] text-slate-900">{formatters.formatDisplayCurrency(model.periodGrossProfit)}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[0.66rem] font-semibold ring-1 ${growthIsNeutral ? 'bg-blue-50 text-blue-600 ring-blue-100' : growthPositive ? 'bg-emerald-50 text-emerald-600 ring-emerald-100' : 'bg-rose-50 text-rose-600 ring-rose-100'}`}>
                      {profitGrowthLabel} {hasPreviousData(model.previousPeriodGrossProfit) ? tr('vs. last period', 'نسبت به دوره قبل') : tr('first period', 'اولین دوره')}
                    </span>
                  </div>
                </div>
              </div>

              {peakPoint.sales > 0 && (<div data-testid="dashboard-peak-point" className="pointer-events-none absolute right-5 top-[80px] z-20 hidden rounded-[14px] border border-[#edf1f4] bg-white/95 px-3 py-2.5 text-sm shadow-[0_16px_24px_-28px_rgba(15,23,42,0.18)] xl:block">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-slate-400">{peakPoint.label}</p>
                  <div className="mt-1.5 text-[0.9rem] font-semibold text-slate-900">{formatters.formatDisplayCurrency(peakPoint.sales)}</div>
                  <div className="mt-1 text-[0.68rem] text-slate-400">{tr('Peak sales point', 'بالاترین نقطه فروش')}</div>
                </div>)}

              <div className="relative z-0 mt-4 h-[216px] w-full">
                <ResponsiveContainer>
                  <AreaChart data={model.trend30} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="wkDashboardSalesFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.12}/>
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="wkDashboardExpenseFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#cbd5e1" stopOpacity={0.08}/>
                        <stop offset="100%" stopColor="#cbd5e1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f1f4f7" strokeDasharray="4 4" vertical={false}/>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={38} tickFormatter={(value: number) => formatters.formatDisplayNumber(value)}/>
                    <Tooltip wrapperStyle={{ zIndex: 30, pointerEvents: 'none' }} contentStyle={{ borderRadius: '14px', border: '1px solid rgba(226, 232, 240, 0.92)', boxShadow: '0 18px 30px -30px rgba(15, 23, 42, 0.24)', backgroundColor: 'rgba(255,255,255,0.98)' }} labelStyle={{ color: '#0f172a', fontWeight: 700 }} formatter={(value: number, name: string) => [
            formatters.formatDisplayCurrency(value),
            name === 'sales' ? tr('Sales', 'فروش') : tr('Expenses', 'مصارف'),
        ]}/>
                    <Area type="monotone" dataKey="expenses" stroke="#cbd5e1" fill="url(#wkDashboardExpenseFill)" strokeWidth={2} strokeDasharray="6 6"/>
                    <Area type="monotone" dataKey="sales" stroke="#2563eb" fill="url(#wkDashboardSalesFill)" strokeWidth={2.2}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 rounded-[16px] border border-[#edf1f4] bg-[#fbfcfd] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[0.84rem] font-semibold text-slate-800">{tr('Customers', 'مشتریان')}</h3>
                  <button type="button" onClick={() => setView('customers')} className={utilityDotsButtonClass} aria-label={tr('Open customers', 'باز کردن مشتریان')}>
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="6.5" cy="12" r="1.4"/>
                      <circle cx="12" cy="12" r="1.4"/>
                      <circle cx="17.5" cy="12" r="1.4"/>
                    </svg>
                  </button>
                </div>

                <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  {customerSegments.map((segment) => (<div key={segment.id} className={segment.accent} style={{ width: segment.width }}/>))}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {customerSegments.map((segment) => (<div key={segment.id} className={`rounded-[14px] border bg-white px-3.5 py-3 ${segment.border}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={`text-[1.2rem] font-semibold tracking-[-0.05em] ${segment.text}`}>{segment.displayValue}</p>
                          <p className="mt-1 text-[0.7rem] font-medium text-slate-400">{segment.label}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span data-testid={`sales-mix-share-${segment.id}`} className={`mt-0.5 text-[0.72rem] font-black ${segment.text}`} dir="ltr">
                            {isEnglish ? `${segment.share}%` : `${formatters.formatDisplayNumber(segment.share)}٪`}
                          </span>
                          <span className={`mt-1 inline-flex h-2.5 w-2.5 rounded-full ${segment.accent}`}/>
                        </div>
                      </div>
                    </div>))}
                </div>

                <div data-testid="dashboard-receivables-summary" className="mt-4 grid gap-3 md:grid-cols-3">
                  {receivableSummary.map((item, index) => (<div key={item.label} data-testid="dashboard-receivables-summary-item" className="flex min-h-[88px] flex-col justify-between rounded-[14px] border border-[#edf1f4] bg-white px-3.5 py-3">
                      <p className="text-[0.7rem] font-bold text-slate-400">{item.label}</p>
                      <p data-testid={`dashboard-receivables-summary-value-${index}`} className="mt-2 text-[1.08rem] font-black tracking-[-0.04em] text-slate-900" dir="ltr">
                        {item.value}
                      </p>
                    </div>))}
                </div>
              </div>
            </article>

            <article className={`${surfaceCardClass} p-4 md:p-5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[0.98rem] font-semibold tracking-[-0.02em] text-slate-900">{tr('Best Selling Products', 'پرفروش‌ترین محصولات')}</h3>
                  <p className="mt-1 text-[0.72rem] text-slate-400">{tr('Highest revenue items across recent invoices', 'محصولات با بیشترین درآمد در فاکتورهای اخیر')}</p>
                </div>
                <button type="button" onClick={() => setView('inventory')} className={subtleActionClass}>
                  {tr('View all', 'مشاهده همه')}
                </button>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#f0f3f6] text-[0.6rem] font-bold uppercase tracking-[0.14em] text-slate-400">
                      <th className="pb-3 text-left">ID</th>
                      <th className="pb-3 text-left">{tr('Name', 'نام')}</th>
                      <th className="pb-3 text-left">{tr('Sold', 'تعداد')}</th>
                      <th className="pb-3 text-left">{tr('Revenue', 'درآمد')}</th>
                      <th className="pb-3 text-left">{tr('Rating', 'امتیاز')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bestSelling.length > 0 ? bestSelling.map((item, index) => (<tr key={item.id} className="border-b border-[#f6f7f9] last:border-b-0">
                        <td className="py-3 text-[0.68rem] font-semibold text-slate-400">#{String(index + 1).padStart(4, '0')}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-[#f4f6f8] text-[0.72rem] font-black text-slate-600">
                              {(item.name || 'W').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-[0.78rem] font-semibold text-slate-800">{item.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-[0.76rem] font-semibold text-slate-600">{item.sold.toLocaleString()}</td>
                        <td className="py-3 text-[0.76rem] font-semibold text-emerald-600">{formatters.formatDisplayCurrency(item.revenue)}</td>
                        <td className="py-3">
                          <div className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[0.64rem] font-semibold text-amber-600 ring-1 ring-amber-100">
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                              <path d="m12 2.25 2.95 5.977 6.596.96-4.773 4.652 1.127 6.57L12 17.307 6.1 20.41l1.127-6.57L2.455 9.187l6.596-.96L12 2.25Z"/>
                            </svg>
                            {item.rating.toFixed(1)}
                          </div>
                        </td>
                      </tr>)) : (<tr>
                        <td colSpan={5} className="py-10 text-center text-[0.84rem] text-slate-400">
                          {tr('No invoice activity yet. Add your first sale to populate this table.', 'هنوز فعالیت فاکتور وجود ندارد. اولین فروش را ثبت کنید تا این جدول تکمیل شود.')}
                        </td>
                      </tr>)}
                  </tbody>
                </table>
              </div>
            </article>
          </div>

          <div className="space-y-3">
            <article className={`${surfaceCardClass} p-4 md:p-5`}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[0.98rem] font-semibold tracking-[-0.02em] text-slate-900">{tr('Most Day Active', 'فعال‌ترین روز')}</h3>
                <button type="button" onClick={() => setView('sales')} className={utilityDotsButtonClass} aria-label={tr('Open sales activity', 'باز کردن فعالیت فروش')}>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="6.5" cy="12" r="1.4"/>
                    <circle cx="12" cy="12" r="1.4"/>
                    <circle cx="17.5" cy="12" r="1.4"/>
                  </svg>
                </button>
              </div>
              <div className="mt-5 flex items-end gap-3" style={{ height: 136 }}>
                {dayActivity.map((day) => (<div key={day.label} className="flex flex-1 flex-col items-center gap-2">
                    <span className={`text-[0.66rem] font-semibold ${day.isMax ? 'text-[#2563eb]' : 'text-slate-300'}`}>
                      {day.count > 0 ? day.count.toLocaleString() : ''}
                    </span>
                    <div className="flex h-[104px] w-full items-end justify-center">
                      <div className={`w-full max-w-[24px] rounded-[12px] transition-all ${day.isMax ? 'bg-[#2563eb]' : 'bg-slate-200'}`} style={{ height: day.height }}/>
                    </div>
                    <span className={`text-[0.68rem] font-semibold ${day.isMax ? 'text-[#2563eb]' : 'text-slate-400'}`}>{day.label}</span>
                  </div>))}
              </div>
            </article>

            <SemiGauge title={tr('Repeat Customer Rate', 'نرخ بازگشت مشتری')} value={repeatCustomerRate} valueLabel={isEnglish
            ? undefined
            : `${formatters.formatDisplayNumber(Math.round(clampValue(repeatCustomerRate, 0, 100)))}٪`} caption={tr(`Based on buyers active in the last ${selectedRangeDays} days`, `بر اساس خریداران فعال در ${formatters.formatDisplayNumber(selectedRangeDays)} روز اخیر`)} actionLabel={tr('Show details', 'مشاهده جزئیات')} onClick={() => setView('customers')}/>

            {false}
          </div>
        </section>

        {/* ═══ ADDED WIDGETS SECTION ═══ */}
        {activeWidgets.length > 0 && (<section className="grid gap-3 md:grid-cols-2">
            {activeWidgets.map((widgetId) => {
                const catalog = widgetCatalog.find(w => w.id === widgetId);
                if (!catalog)
                    return null;
                if (widgetId === 'inventory-health') {
                    const totalStock = model.totalStockUnits;
                    const healthScore = model.inventoryHealthScore;
                    const lowStock = model.lowStockCount;
                    const expSoon = model.expiringSoonCount;
                    const turnover = model.inventoryTurnover;
                    const healthColor = healthScore >= 70 ? '#34d399' : healthScore >= 40 ? '#fbbf24' : '#fb7185';
                    return (<article key={widgetId} className={`${surfaceCardClass} relative overflow-hidden p-5`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600 ring-1 ring-emerald-200/60">
                          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-8.25 4.5m8.25-4.5V18l-8.25 4.5m8.25-15-8.25-4.5-8.25 4.5m16.5 0-8.25 4.5m-8.25-4.5V18l8.25 4.5m-8.25-15 8.25 4.5"/></svg>
                        </div>
                        <div>
                          <h3 className="text-[0.95rem] font-semibold tracking-[-0.02em] text-slate-900">{catalog.title}</h3>
                          <p className="mt-1 text-[0.68rem] font-medium text-slate-400">{tr('Live stock snapshot', 'نمای زنده موجودی انبار')}</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => toggleWidget(widgetId)} className="rounded-full p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-400" aria-label={tr('Remove widget', 'حذف ویجت')}>
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-3">
                      <div className="rounded-[14px] border border-emerald-100 bg-emerald-50/50 px-3 py-3 text-center">
                        <div className="text-[1.35rem] font-semibold tracking-[-0.04em]" style={{ color: healthColor }}>{healthScore}%</div>
                        <p className="mt-1 text-[0.66rem] font-medium text-slate-400">{tr('Health', 'سلامت')}</p>
                      </div>
                      <div className="rounded-[14px] border border-[#edf1f4] bg-[#fbfcfd] px-3 py-3 text-center">
                        <div className="text-[1.35rem] font-semibold tracking-[-0.04em] text-slate-900">{formatters.formatDisplayNumber(totalStock)}</div>
                        <p className="mt-1 text-[0.66rem] font-medium text-slate-400">{tr('Total Units', 'کل واحد')}</p>
                      </div>
                      <div className="rounded-[14px] border border-[#edf1f4] bg-[#fbfcfd] px-3 py-3 text-center">
                        <div className="text-[1.35rem] font-semibold tracking-[-0.04em] text-slate-900">{turnover.toFixed(1)}x</div>
                        <p className="mt-1 text-[0.66rem] font-medium text-slate-400">{tr('Turnover', 'گردش')}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-3">
                      {lowStock > 0 && (<div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-[0.68rem] font-semibold text-amber-600 ring-1 ring-amber-100">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/></svg>
                          {lowStock} {tr('Low stock', 'کمبود')}
                        </div>)}
                      {expSoon > 0 && (<div className="flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-[0.68rem] font-semibold text-rose-600 ring-1 ring-rose-100">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                          {expSoon} {tr('Expiring', 'انقضا')}
                        </div>)}
                      {lowStock === 0 && expSoon === 0 && (<div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[0.68rem] font-semibold text-emerald-600 ring-1 ring-emerald-100">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                          {tr('All good', 'همه سالم')}
                        </div>)}
                    </div>
                    <button type="button" onClick={() => setView('inventory')} className={`${subtleActionClass} mt-4 w-full justify-center`}>
                      {tr('View Inventory', 'مشاهده انبار')}
                    </button>
                  </article>);
                }
                if (widgetId === 'expense-breakdown') {
                    const breakdown = model.expenseBreakdown;
                    const totalExpense = breakdown.reduce((s, c) => s + c.amount, 0);
                    const topCats = breakdown.slice(0, 5);
                    const catColors = ['#3b82f6', '#34d399', '#fbbf24', '#fb923c', '#a78bfa'];
                    let offsetAngle = 0;
                    const arcs = topCats.map((cat, i) => {
                        const pct = totalExpense > 0 ? (cat.amount / totalExpense) : 0;
                        const dash = pct * 264;
                        const arc = { dash, offset: -offsetAngle, color: catColors[i % catColors.length], label: cat.category, pct, total: cat.amount };
                        offsetAngle += dash;
                        return arc;
                    });
                    return (<article key={widgetId} className={`${surfaceCardClass} relative overflow-hidden p-5`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-gradient-to-br from-violet-50 to-violet-100 text-violet-600 ring-1 ring-violet-200/60">
                          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"/></svg>
                        </div>
                        <h3 className="text-[0.95rem] font-semibold tracking-[-0.02em] text-slate-900">{catalog.title}</h3>
                      </div>
                      <button type="button" onClick={() => toggleWidget(widgetId)} className="rounded-full p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-400" aria-label={tr('Remove widget', 'حذف ویجت')}>
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                    <div className="mt-5 flex items-center gap-6">
                      <div className="relative flex-shrink-0">
                        <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90">
                          <circle cx="60" cy="60" r="42" fill="none" stroke="#f1f5f9" strokeWidth="14"/>
                          {arcs.map((arc, i) => (<circle key={i} cx="60" cy="60" r="42" fill="none" stroke={arc.color} strokeWidth="14" strokeDasharray={`${arc.dash} ${264 - arc.dash}`} strokeDashoffset={arc.offset} strokeLinecap="round"/>))}
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <div className="text-[1rem] font-bold tracking-[-0.03em] text-slate-900">{formatters.formatDisplayCurrency(totalExpense)}</div>
                            <div className="text-[0.58rem] font-medium text-slate-400">{tr('Total', 'مجموع')}</div>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 space-y-2.5">
                        {topCats.map((cat, i) => (<div key={cat.category} className="flex items-center gap-2.5">
                            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: catColors[i % catColors.length] }}/>
                            <span className="min-w-0 flex-1 truncate text-[0.72rem] font-medium text-slate-600">{cat.category}</span>
                            <span className="text-[0.72rem] font-semibold text-slate-900">{formatters.formatDisplayCurrency(cat.amount)}</span>
                          </div>))}
                        {topCats.length === 0 && <p className="text-[0.72rem] text-slate-400">{tr('No expenses yet', 'هنوز مصارفی ثبت نشده')}</p>}
                      </div>
                    </div>
                    <button type="button" onClick={() => setView('expenses')} className={`${subtleActionClass} mt-4 w-full justify-center`}>
                      {tr('View Expenses', 'مشاهده مصارف')}
                    </button>
                  </article>);
                }
                if (widgetId === 'top-customers') {
                    const topCusts = model.topCustomers.slice(0, 4);
                    return (<article key={widgetId} className={`${surfaceCardClass} relative overflow-hidden p-5`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 ring-1 ring-blue-200/60">
                          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"/></svg>
                        </div>
                        <h3 className="text-[0.95rem] font-semibold tracking-[-0.02em] text-slate-900">{catalog.title}</h3>
                      </div>
                      <button type="button" onClick={() => toggleWidget(widgetId)} className="rounded-full p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-400" aria-label={tr('Remove widget', 'حذف ویجت')}>
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                    <div className="mt-4 space-y-2">
                      {topCusts.map((cust, idx) => {
                            const maxRev = topCusts[0]?.revenue ?? 1;
                            const barPct = maxRev > 0 ? (cust.revenue / maxRev) * 100 : 0;
                            return (<div key={cust.name} className="rounded-[14px] border border-[#edf1f4] bg-[#fbfcfd] px-3.5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-[0.68rem] font-bold text-white shadow-sm">
                                {(cust.name || '?').charAt(0)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between">
                                  <p className="truncate text-[0.78rem] font-semibold text-slate-800">{cust.name}</p>
                                  <span className="text-[0.74rem] font-bold text-emerald-600">{formatters.formatDisplayCurrency(cust.revenue)}</span>
                                </div>
                                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                  <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all" style={{ width: `${barPct}%` }}/>
                                </div>
                              </div>
                            </div>
                          </div>);
                        })}
                      {topCusts.length === 0 && <p className="py-6 text-center text-[0.78rem] text-slate-400">{tr('No customer data yet', 'هنوز داده مشتری وجود ندارد')}</p>}
                    </div>
                    <button type="button" onClick={() => setView('customers')} className={`${subtleActionClass} mt-4 w-full justify-center`}>
                      {tr('View Customers', 'مشاهده مشتریان')}
                    </button>
                  </article>);
                }
                if (widgetId === 'receivables-aging') {
                    const aging = model.agingBuckets;
                    const totalReceivables = model.openReceivables;
                    const overdueRate = model.overdueRate;
                    const bucketData = [
                        { label: tr('Current', 'جاری'), value: aging.current, color: '#34d399' },
                        { label: tr('30 days', '۳۰ روز'), value: aging.days30, color: '#fbbf24' },
                        { label: tr('60 days', '۶۰ روز'), value: aging.days60, color: '#fb923c' },
                        { label: tr('90+ days', '۹۰+ روز'), value: aging.days90plus, color: '#fb7185' },
                    ];
                    const maxBucket = Math.max(...bucketData.map(b => b.value), 1);
                    return (<article key={widgetId} className={`${surfaceCardClass} relative overflow-hidden p-5`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-gradient-to-br from-amber-50 to-amber-100 text-amber-600 ring-1 ring-amber-200/60">
                          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                        </div>
                        <div>
                          <h3 className="text-[0.95rem] font-semibold tracking-[-0.02em] text-slate-900">{catalog.title}</h3>
                          <p className="mt-1 text-[0.68rem] font-medium text-slate-400">{tr('Current customer balances', 'مانده‌های فعلی مشتریان')}</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => toggleWidget(widgetId)} className="rounded-full p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-400" aria-label={tr('Remove widget', 'حذف ویجت')}>
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                    <div className="mt-4 flex items-end gap-2">
                      <span className="text-[1.9rem] font-semibold tracking-[-0.05em] text-slate-900">{formatters.formatDisplayCurrency(totalReceivables)}</span>
                      <span className={`mb-1 rounded-full px-2.5 py-1 text-[0.64rem] font-semibold ring-1 ${overdueRate > 30 ? 'bg-rose-50 text-rose-600 ring-rose-100' : 'bg-amber-50 text-amber-600 ring-amber-100'}`}>
                        {overdueRate.toFixed(0)}% {tr('overdue', 'معوقه')}
                      </span>
                    </div>
                    <div className="mt-5 flex items-end gap-2.5" style={{ height: 96 }}>
                      {bucketData.map((bucket) => (<div key={bucket.label} className="flex flex-1 flex-col items-center gap-2">
                          <span className="text-[0.62rem] font-semibold text-slate-400">{bucket.value > 0 ? formatters.formatDisplayCurrency(bucket.value) : '—'}</span>
                          <div className="flex h-[60px] w-full items-end justify-center">
                            <div className="w-full max-w-[32px] rounded-t-[10px] transition-all" style={{ height: `${Math.max((bucket.value / maxBucket) * 60, 4)}px`, backgroundColor: bucket.color }}/>
                          </div>
                          <span className="text-[0.64rem] font-medium text-slate-500">{bucket.label}</span>
                        </div>))}
                    </div>
                    <button type="button" onClick={() => setView('customers')} className={`${subtleActionClass} mt-4 w-full justify-center`}>
                      {tr('View Receivables', 'مشاهده بدهی‌ها')}
                    </button>
                  </article>);
                }
                if (widgetId === 'margin-by-channel') {
                    const marginsArr = model.marginByMode;
                    const findMargin = (mode: string) => marginsArr.find(m => m.mode === mode)?.margin ?? 0;
                    const channels = [
                        { label: tr('Retail', 'پرچون'), margin: findMargin('retail'), color: '#3b82f6', bg: 'from-blue-50 to-blue-100' },
                        { label: tr('Wholesale', 'عمده'), margin: findMargin('wholesale'), color: '#34d399', bg: 'from-emerald-50 to-emerald-100' },
                        { label: tr('Bulk', 'کارتنی'), margin: findMargin('bulk'), color: '#fb923c', bg: 'from-orange-50 to-orange-100' },
                    ];
                    return (<article key={widgetId} className={`${surfaceCardClass} relative overflow-hidden p-5`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-gradient-to-br from-orange-50 to-orange-100 text-orange-600 ring-1 ring-orange-200/60">
                          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"/></svg>
                        </div>
                        <h3 className="text-[0.95rem] font-semibold tracking-[-0.02em] text-slate-900">{catalog.title}</h3>
                      </div>
                      <button type="button" onClick={() => toggleWidget(widgetId)} className="rounded-full p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-400" aria-label={tr('Remove widget', 'حذف ویجت')}>
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-3">
                      {channels.map((ch) => {
                            const safeMargin = Number.isFinite(ch.margin) ? ch.margin : 0;
                            return (<div key={ch.label} className={`rounded-[14px] bg-gradient-to-br ${ch.bg} p-4 text-center ring-1 ring-black/[0.04]`}>
                            <div className="relative mx-auto h-14 w-14">
                              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                                <circle cx="60" cy="60" r="46" fill="none" stroke="white" strokeWidth="10" opacity="0.6"/>
                                <circle cx="60" cy="60" r="46" fill="none" stroke={ch.color} strokeWidth="10" strokeDasharray={`${(safeMargin / 100) * 289} 289`} strokeLinecap="round"/>
                              </svg>
                              <div className="absolute inset-0 flex items-center justify-center text-[0.78rem] font-bold" style={{ color: ch.color }}>{safeMargin.toFixed(0)}%</div>
                            </div>
                            <p className="mt-2 text-[0.72rem] font-semibold text-slate-700">{ch.label}</p>
                          </div>);
                        })}
                    </div>
                    <button type="button" onClick={() => setView('reports')} className={`${subtleActionClass} mt-4 w-full justify-center`}>
                      {tr('View Reports', 'مشاهده گزارشات')}
                    </button>
                  </article>);
                }
                if (widgetId === 'treasury-liquidity') {
                    const cashFlow = model.periodCashFlow;
                    const prevCashFlow = model.previousPeriodCashFlow;
                    const todayIn = model.todayCollected;
                    const todayOut = model.todayExpenses;
                    const todayNet = todayIn - todayOut;
                    const collRate = model.collectionRate;
                    const totalCollected = model.totalSystemCollected;
                    const totalExpensesAll = model.totalSystemExpenses;
                    const systemBalance = totalCollected - totalExpensesAll;
                    const cfDelta = prevCashFlow > 0 ? ((cashFlow - prevCashFlow) / prevCashFlow) * 100 : 0;
                    const cfPositive = cashFlow >= 0;
                    return (<article key={widgetId} className={`${surfaceCardClass} relative overflow-hidden p-5 md:col-span-2`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-gradient-to-br from-cyan-50 to-cyan-100 text-cyan-600 ring-1 ring-cyan-200/60">
                          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"/></svg>
                        </div>
                        <div>
                          <h3 className="text-[0.95rem] font-semibold tracking-[-0.02em] text-slate-900">{catalog.title}</h3>
                          <p className="mt-0.5 text-[0.68rem] text-slate-400">{tr('Real-time cash position', '\u0648\u0636\u0639\u06cc\u062a \u0646\u0642\u062f\u06cc \u0644\u062d\u0638\u0647\u200c\u0627\u06cc')}</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => toggleWidget(widgetId)} className="rounded-full p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-400" aria-label={tr('Remove widget', '\u062d\u0630\u0641 \u0648\u06cc\u062c\u062a')}>
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
                      </button>
                    </div>

                    {/* Main balance */}
                    <div className="mt-5 flex flex-wrap items-end gap-4">
                      <div>
                        <p className="text-[0.68rem] font-medium uppercase tracking-[0.12em] text-slate-400">{tr('System Balance', '\u0645\u0648\u062c\u0648\u062f\u06cc \u0633\u06cc\u0633\u062a\u0645')}</p>
                        <div className="mt-1.5 flex items-end gap-2">
                          <span className={`text-[2rem] font-semibold tracking-[-0.06em] ${systemBalance >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>{formatters.formatDisplayCurrency(systemBalance)}</span>
                        </div>
                      </div>
                      <div className="mb-1">
                        <span className={`rounded-full px-2.5 py-1 text-[0.64rem] font-semibold ring-1 ${cfPositive ? 'bg-emerald-50 text-emerald-600 ring-emerald-100' : 'bg-rose-50 text-rose-600 ring-rose-100'}`}>
                          {tr('30d Cash Flow', '\u062c\u0631\u06cc\u0627\u0646 \u0646\u0642\u062f\u06cc \u06f3\u06f0 \u0631\u0648\u0632\u0647')}: {cfPositive ? '+' : ''}{formatters.formatDisplayCurrency(cashFlow)}
                        </span>
                        {Number.isFinite(cfDelta) && cfDelta !== 0 && (<span className={`ml-2 text-[0.62rem] font-semibold ${cfDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {cfDelta >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(cfDelta).toFixed(1)}%
                          </span>)}
                      </div>
                    </div>

                    {/* Today + Collection Rate */}
                    <div className="mt-5 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-[14px] border border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-emerald-50 px-3.5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0 6.75-6.75M12 19.5l-6.75-6.75"/></svg>
                          </div>
                          <span className="text-[0.66rem] font-medium text-emerald-700">{tr('Today In', '\u0648\u0631\u0648\u062f\u06cc \u0627\u0645\u0631\u0648\u0632')}</span>
                        </div>
                        <p className="mt-2 text-[1.3rem] font-semibold tracking-[-0.04em] text-emerald-700">{formatters.formatDisplayCurrency(todayIn)}</p>
                      </div>
                      <div className="rounded-[14px] border border-rose-100 bg-gradient-to-br from-rose-50/60 to-rose-50 px-3.5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 19.5V4.5m0 0L5.25 11.25M12 4.5l6.75 6.75"/></svg>
                          </div>
                          <span className="text-[0.66rem] font-medium text-rose-700">{tr('Today Out', '\u062e\u0631\u0648\u062c\u06cc \u0627\u0645\u0631\u0648\u0632')}</span>
                        </div>
                        <p className="mt-2 text-[1.3rem] font-semibold tracking-[-0.04em] text-rose-700">{formatters.formatDisplayCurrency(todayOut)}</p>
                      </div>
                      <div className="rounded-[14px] border border-[#edf1f4] bg-[#fbfcfd] px-3.5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"/></svg>
                          </div>
                          <span className="text-[0.66rem] font-medium text-slate-600">{tr('Today Net', '\u062e\u0627\u0644\u0635 \u0627\u0645\u0631\u0648\u0632')}</span>
                        </div>
                        <p className={`mt-2 text-[1.3rem] font-semibold tracking-[-0.04em] ${todayNet >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>{todayNet >= 0 ? '+' : ''}{formatters.formatDisplayCurrency(todayNet)}</p>
                      </div>
                      <div className="rounded-[14px] border border-blue-100 bg-gradient-to-br from-blue-50/60 to-blue-50 px-3.5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                          </div>
                          <span className="text-[0.66rem] font-medium text-blue-700">{tr('Collection', '\u0646\u0631\u062e \u0648\u0635\u0648\u0644')}</span>
                        </div>
                        <p className="mt-2 text-[1.3rem] font-semibold tracking-[-0.04em] text-blue-700">{collRate.toFixed(0)}%</p>
                      </div>
                    </div>

                    {/* Mini cash flow sparkline from trend30 */}
                    <div className="mt-4 rounded-[16px] border border-[#edf1f4] bg-[#fbfcfd] px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[0.7rem] font-semibold text-slate-600">{tr('30-Day Cash Flow Trend', '\u0631\u0648\u0646\u062f \u062c\u0631\u06cc\u0627\u0646 \u0646\u0642\u062f\u06cc \u06f3\u06f0 \u0631\u0648\u0632\u0647')}</span>
                        <div className="flex items-center gap-4 text-[0.62rem] font-medium text-slate-400">
                          <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-4 rounded-full bg-emerald-400"/>{tr('Inflow', '\u0648\u0631\u0648\u062f\u06cc')}</span>
                          <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-4 rounded-full bg-rose-300"/>{tr('Outflow', '\u062e\u0631\u0648\u062c\u06cc')}</span>
                        </div>
                      </div>
                      <div className="mt-3 flex items-end gap-[3px]" style={{ height: 56 }}>
                        {model.trend30.slice(-20).map((day, i) => {
                            const maxVal = Math.max(...model.trend30.slice(-20).map(d => Math.max(d.sales, d.expenses)), 1);
                            const inH = Math.max((day.sales / maxVal) * 52, 2);
                            const outH = Math.max((day.expenses / maxVal) * 52, 2);
                            return (<div key={i} className="flex flex-1 flex-col items-center gap-[2px]" style={{ height: 56, justifyContent: 'flex-end' }}>
                              <div className="w-full rounded-t-[3px] bg-emerald-400/80" style={{ height: inH }}/>
                              <div className="w-full rounded-b-[3px] bg-rose-300/70" style={{ height: outH }}/>
                            </div>);
                        })}
                      </div>
                    </div>

                    <button type="button" onClick={() => setView('treasury' as AppView)} className={`${subtleActionClass} mt-4 w-full justify-center`}>
                      {tr('Open Treasury', '\u0628\u0627\u0632 \u06a9\u0631\u062f\u0646 \u0635\u0646\u062f\u0648\u0642')}
                    </button>
                  </article>);
                }
                return null;
            })}
          </section>)}
      </div>

    </div>

      {createPortal(<div className={`fixed inset-0 z-[9999] transition-all duration-[260ms] ${isWidgetDrawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`} dir="ltr">
          <div className="absolute inset-0 bg-slate-950/12" onClick={() => setIsWidgetDrawerOpen(false)}/>
          <aside className={`absolute bottom-0 right-0 top-0 flex w-full max-w-[404px] flex-col border-l border-[#e8edf2] bg-white shadow-[0_26px_60px_-40px_rgba(15,23,42,0.28)] transition-transform duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] md:bottom-2.5 md:right-2.5 md:top-2.5 md:rounded-[22px] md:border ${isWidgetDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="flex items-center justify-between border-b border-[#f0f3f6] px-5 py-[18px]">
              <div className="flex items-center gap-3">
                <h2 className="text-[1.16rem] font-semibold tracking-[-0.03em] text-slate-900">{tr('Add Widget', 'افزودن ویجت')}</h2>
                {activeWidgets.length > 0 && (<span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#2563eb] px-1.5 text-[0.6rem] font-bold text-white">{activeWidgets.length}</span>)}
              </div>
              <button type="button" onClick={() => setIsWidgetDrawerOpen(false)} className="rounded-full p-2 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600" aria-label={tr('Close panel', 'بستن پنل')}>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M18 6 6 18"/>
                </svg>
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {widgetCatalog.map((widget) => {
                const isAdded = activeWidgets.includes(widget.id);
                return (<article key={widget.id} className={`grid grid-cols-[96px_minmax(0,1fr)] gap-3 rounded-[16px] border p-3.5 shadow-[0_14px_24px_-30px_rgba(15,23,42,0.16)] transition-colors ${isAdded ? 'border-blue-200 bg-blue-50/40' : 'border-[#edf1f4] bg-white'}`}>
                  <div className="h-20 rounded-[14px] bg-[#f8fafc] p-2.5">
                    <WidgetPreview kind={widget.kind}/>
                  </div>
                  <div className="flex min-w-0 flex-col justify-between gap-3">
                    <div>
                      <h3 className="text-[0.88rem] font-semibold tracking-[-0.02em] text-slate-900">{widget.title}</h3>
                      <p className="mt-1 text-[0.72rem] leading-5 text-slate-500">{widget.description}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.6rem] font-medium text-slate-500">
                        {widget.tag}
                      </span>
                      <button type="button" onClick={() => handleWidgetSelect(widget.id)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.68rem] font-medium transition ${isAdded
                        ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100'
                        : 'bg-[#2563eb] text-white hover:bg-[#1d4ed8]'}`}>
                        {isAdded ? (<>
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>
                            {tr('Remove', 'حذف')}
                          </>) : (<>
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
                            {tr('Add', 'افزودن')}
                          </>)}
                      </button>
                    </div>
                  </div>
                </article>);
            })}
            </div>
          </aside>
        </div>, document.body)}
    </>);
};
