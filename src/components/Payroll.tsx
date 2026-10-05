import React, { useMemo, useState } from 'react';
import { AppSettings, Invoice, Medicine, Expense, AppUser } from '../types';
import { Modal } from './ui/Modal';
import { normalizePersianNumbers } from '../utils/localization';
import { getTranslation } from '../utils/translations';
import { PageHeader } from './ui/PageHeader';
import { ActiveFilterChip, FilterSearchField, FilterSelectField, UnifiedFilterBar } from './ui/UnifiedFilterBar';
import { Button } from './ui/Button';
import { InlineAlert } from './ui/InlineAlert';
import { EmptyStateShell } from './ui/StateShell';
import { FlatCard, GlassCard, PageSurface } from './ui/Surface';
import { StatusBadge } from './ui/StatusBadge';
import { classNames } from '@/utils/classNames';
import { calculateInvoiceLineTotal } from '../utils/calculations';
import { getInvoiceItemBaseQuantity } from '../utils/unitConversion';
import { formatAppDate, getSectionCalendar } from '@/lib/formatters';
import { AFGHAN_SOLAR_MONTHS_EN, AFGHAN_SOLAR_MONTHS_FA, jalaliMonthLength, jalaliToDate, todayJalali } from '@/utils/jalali';
import { JalaliDatePicker } from './ui/JalaliDatePicker';
import { calculateInvoiceItemCommissionRate, getInvoiceItemCommissionAdjustment } from '../utils/commissionRules';
interface PayrollProps {
    settings: AppSettings;
    invoices: Invoice[];
    medicines: Medicine[];
    expenses: Expense[];
    onAddExpense: (expense: Omit<Expense, 'id'>) => void;
    activeAppUser?: AppUser | null;
    readOnly?: boolean;
}
type PayrollStatus = 'unpaid' | 'partial' | 'settled' | 'overpaid';
type PayrollStatusFilter = 'all' | PayrollStatus;
type PayrollStage = 'draft' | 'review' | 'finalize' | 'paid';
type PayrollRow = {
    user: AppUser;
    totalSales: number;
    generatedProfit: number;
    effectiveCommissionRate: number;
    averageCommissionAdjustment: number;
    minFinalCommissionRate: number;
    maxFinalCommissionRate: number;
    commissionAdjustedLineCount: number;
    tierName: string;
    commissionAmount: number;
    baseSalary: number;
    totalDue: number;
    totalPaid: number;
    remainingBalance: number;
    status: PayrollStatus;
    invoiceCount: number;
    lastPaymentDate: string | null;
};
export const Payroll: React.FC<PayrollProps> = ({ settings, invoices = [], medicines = [], expenses = [], onAddExpense, activeAppUser, readOnly = false }) => {
    const t = getTranslation(settings.language || 'dari');
    const isEnglish = settings.language === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const formatPayrollDate = (value: string | Date | null | undefined) => formatAppDate(value, settings, 'payroll');
    const isAdmin = !activeAppUser || activeAppUser.role === 'admin' || activeAppUser.permissions.includes('manage_payroll');
    const isSalaryCategory = (category?: string) => {
        const normalized = (category || '').trim().toLowerCase();
        return normalized === 'salary & wages' || normalized === 'حقوق و دستمزد';
    };
    // Payroll periods follow the configured payroll calendar: solar (Afghan)
    // months by default, plain Gregorian months when the user configured that.
    const payrollCalendar = getSectionCalendar(settings, 'payroll');
    const useSolarPeriods = payrollCalendar !== 'gregorian';
    const [selectedMonth, setSelectedMonth] = useState(() => (useSolarPeriods ? todayJalali().jm - 1 : new Date().getMonth()));
    const [selectedYear, setSelectedYear] = useState(() => (useSolarPeriods ? todayJalali().jy : new Date().getFullYear()));
    const periodRange = useMemo(() => {
        if (useSolarPeriods) {
            const start = jalaliToDate(selectedYear, selectedMonth + 1, 1);
            const end = jalaliToDate(selectedYear, selectedMonth + 1, jalaliMonthLength(selectedYear, selectedMonth + 1));
            end.setDate(end.getDate() + 1);
            return { start, end };
        }
        return { start: new Date(selectedYear, selectedMonth, 1), end: new Date(selectedYear, selectedMonth + 1, 1) };
    }, [useSolarPeriods, selectedMonth, selectedYear]);
    const periodTag = `M:${selectedMonth + 1}-Y:${selectedYear}`;
    // Payments recorded before the solar-period fix were tagged with the
    // Gregorian month whose 15th day the old UI mislabeled with this solar
    // month's name — match that tag too so historic payments stay attached.
    const legacyPeriodTag = useMemo(() => {
        if (!useSolarPeriods)
            return null;
        for (let offset = 0; offset < 2; offset += 1) {
            const probe = new Date(periodRange.start.getFullYear(), periodRange.start.getMonth() + offset, 15);
            if (probe >= periodRange.start && probe < periodRange.end) {
                return `M:${probe.getMonth() + 1}-Y:${probe.getFullYear()}`;
            }
        }
        return null;
    }, [useSolarPeriods, periodRange]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<PayrollStatusFilter>('all');
    const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<PayrollRow | null>(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentNote, setPaymentNote] = useState('');
    const [paymentError, setPaymentError] = useState('');
    const payrollData = useMemo<PayrollRow[]>(() => {
        const safeInvoices = Array.isArray(invoices) ? invoices : [];
        const safeMedicines = Array.isArray(medicines) ? medicines : [];
        const safeExpenses = Array.isArray(expenses) ? expenses : [];
        const users = settings?.users || [];
        const adminInvoices = safeInvoices.some((inv) => !inv.isDeleted && (inv.userId === 'admin' || !inv.userId));
        const allUsers = [...users];
        if (adminInvoices && !users.find((u) => u.id === 'admin')) {
            allUsers.push({
                id: 'admin',
                name: tr('Admin', 'مدیر'),
                role: 'admin',
                pinCode: '',
                permissions: [],
                commissionRate: 0,
                baseSalary: 0
            });
        }
        const usersToProcess = isAdmin ? allUsers : allUsers.filter((u) => u.id === activeAppUser?.id);
        return usersToProcess
            .map((user) => {
            const userInvoices = safeInvoices.filter((inv) => {
                if (inv.isDeleted)
                    return false;
                const d = new Date(inv.date);
                const invUserId = inv.userId || 'admin';
                return invUserId === user.id && d >= periodRange.start && d < periodRange.end;
            });
            let totalSales = 0;
            let generatedProfit = 0;
            const commissionLines: Array<{
                profit: number;
                item: Invoice['items'][number];
                adjustmentPercent: number;
            }> = [];
            userInvoices.forEach((inv) => {
                totalSales += inv.finalAmount;
            });
            let effectiveCommissionRate = user.commissionRate || 0;
            let tierName = tr('Base tier', 'سطح پایه');
            if (user.commissionTiers?.length) {
                const sortedTiers = [...user.commissionTiers].sort((a, b) => b.threshold - a.threshold);
                for (const tier of sortedTiers) {
                    if (totalSales >= tier.threshold) {
                        effectiveCommissionRate = tier.rate;
                        tierName = `${tr('Tier over', 'سطح بالاتر از')} ${tier.threshold.toLocaleString()}`;
                        break;
                    }
                }
            }
            userInvoices.forEach((inv) => {
                const currency = inv.currency || settings.currencySettings?.baseCurrency || 'AFN';
                const activeReturns = (inv.returns || []).filter((entry) => !entry.isDeleted);
                inv.items?.forEach((item, itemIndex) => {
                    const medicine = safeMedicines.find((m) => m.id === item.medicineId);
                    if (!medicine)
                        return;
                    const batch = medicine.batches?.find((b) => b.id === item.batchId) || medicine.batches?.[0];
                    const purchasePrice = typeof item.costPrice === 'number' ? item.costPrice : batch ? batch.purchasePrice : 0;
                    const safeQuantity = Math.max(0, getInvoiceItemBaseQuantity(item));
                    const lineNetRevenue = calculateInvoiceLineTotal(item, currency);
                    const lineCogs = purchasePrice * safeQuantity;
                    const returnedQuantity = activeReturns.reduce((sum, entry) => {
                        const matchesSource = entry.sourceItemIndex === itemIndex;
                        return sum + (entry.items || []).reduce((itemSum, returnedItem) => {
                            const matchesBatch = returnedItem.medicineId === item.medicineId && returnedItem.batchId === item.batchId;
                            return itemSum + (matchesSource || matchesBatch ? Math.max(0, Number(returnedItem.quantity) || 0) : 0);
                        }, 0);
                    }, 0);
                    const returnedRatio = safeQuantity > 0 ? Math.min(1, returnedQuantity / safeQuantity) : 0;
                    const returnedProfitImpact = (lineNetRevenue * returnedRatio) - (lineCogs * returnedRatio);
                    const lineProfit = (lineNetRevenue - lineCogs) - returnedProfitImpact;
                    const adjustmentPercent = getInvoiceItemCommissionAdjustment(item);
                    generatedProfit += lineProfit;
                    commissionLines.push({ profit: lineProfit, item, adjustmentPercent });
                });
            });
            let commissionAdjustedLineCount = 0;
            let adjustmentTotal = 0;
            let minFinalCommissionRate = Number.POSITIVE_INFINITY;
            let maxFinalCommissionRate = Number.NEGATIVE_INFINITY;
            const commissionAmount = Math.round(commissionLines.reduce((sum, line) => {
                const finalRate = calculateInvoiceItemCommissionRate(effectiveCommissionRate, line.item);
                minFinalCommissionRate = Math.min(minFinalCommissionRate, finalRate);
                maxFinalCommissionRate = Math.max(maxFinalCommissionRate, finalRate);
                const displayAdjustment = finalRate - effectiveCommissionRate;
                if (displayAdjustment !== 0) {
                    commissionAdjustedLineCount += 1;
                    adjustmentTotal += displayAdjustment;
                }
                return sum + ((line.profit * finalRate) / 100);
            }, 0));
            if (!commissionLines.length) {
                minFinalCommissionRate = effectiveCommissionRate;
                maxFinalCommissionRate = effectiveCommissionRate;
            }
            const averageCommissionAdjustment = commissionAdjustedLineCount > 0
                ? adjustmentTotal / commissionAdjustedLineCount
                : 0;
            const baseSalary = user.baseSalary || 0;
            const totalDue = Math.round(commissionAmount + baseSalary);
            const userPayments = safeExpenses.filter((exp) => !exp.isDeleted &&
                isSalaryCategory(exp.category) &&
                exp.description &&
                exp.description.includes(`[${user.id}]`) &&
                (exp.description.includes(periodTag) || (legacyPeriodTag !== null && exp.description.includes(legacyPeriodTag))));
            const totalPaid = userPayments.reduce((sum, exp) => sum + exp.amount, 0);
            const remainingBalance = totalDue - totalPaid;
            let status: PayrollStatus = 'unpaid';
            if (remainingBalance < 0)
                status = 'overpaid';
            else if (remainingBalance === 0 && totalDue > 0)
                status = 'settled';
            else if (totalPaid > 0)
                status = 'partial';
            else if (totalDue === 0)
                status = 'settled';
            return {
                user,
                totalSales,
                generatedProfit,
                effectiveCommissionRate,
                averageCommissionAdjustment,
                minFinalCommissionRate,
                maxFinalCommissionRate,
                commissionAdjustedLineCount,
                tierName,
                commissionAmount,
                baseSalary,
                totalDue,
                totalPaid,
                remainingBalance,
                status,
                invoiceCount: userInvoices.length,
                lastPaymentDate: userPayments.length > 0 ? userPayments[userPayments.length - 1].date : null
            };
        })
            .sort((left, right) => {
            const outstandingDiff = Math.max(0, right.remainingBalance) - Math.max(0, left.remainingBalance);
            if (outstandingDiff !== 0)
                return outstandingDiff;
            return right.totalDue - left.totalDue;
        });
    }, [activeAppUser, expenses, invoices, isAdmin, medicines, periodRange, periodTag, legacyPeriodTag, settings.currencySettings?.baseCurrency, settings?.users, tr]);
    const months = useMemo(() => (useSolarPeriods
        ? (isEnglish ? [...AFGHAN_SOLAR_MONTHS_EN] : [...AFGHAN_SOLAR_MONTHS_FA])
        : Array.from({ length: 12 }, (_, i) => formatAppDate(new Date(Date.UTC(2026, i, 15, 12, 0, 0, 0)), settings, 'payroll', { month: 'long' }))), [useSolarPeriods, isEnglish, settings]);
    const yearOptions = useMemo(() => {
        const current = useSolarPeriods ? todayJalali().jy : new Date().getFullYear();
        return Array.from({ length: 4 }, (_, i) => current - 3 + i);
    }, [useSolarPeriods]);
    const totalPayout = payrollData.reduce((sum, item) => sum + item.totalDue, 0);
    const totalPaidSoFar = payrollData.reduce((sum, item) => sum + item.totalPaid, 0);
    const totalRemaining = payrollData.reduce((sum, item) => sum + Math.max(0, item.remainingBalance), 0);
    const activePayrollUsers = payrollData.filter((item) => item.totalDue > 0 || item.invoiceCount > 0).length;
    const payrollCoverage = totalPayout > 0 ? Math.min(100, Math.round((totalPaidSoFar / totalPayout) * 100)) : 100;
    const currentStage: PayrollStage = payrollData.length === 0 ? 'draft' : payrollCoverage === 0 ? 'review' : payrollCoverage < 100 ? 'finalize' : 'paid';
    const stageLabels: Record<PayrollStage, {
        en: string;
        fa: string;
    }> = {
        draft: { en: 'Draft', fa: 'پیش‌نویس' },
        review: { en: 'Review', fa: 'بازبینی' },
        finalize: { en: 'Finalize', fa: 'نهایی‌سازی' },
        paid: { en: 'Paid', fa: 'پرداخت شد' },
    };
    const payRunMessage = currentStage === 'paid'
        ? {
            tone: 'success' as const,
            title: tr('Current pay run is fully covered', 'اجرای فعلی معاش کامل پوشش داده شده است'),
            description: tr('No payroll balance is left for the selected month.', 'برای ماه انتخاب‌شده مانده‌ای باز نمانده است.')
        }
        : currentStage === 'finalize'
            ? {
                tone: 'warning' as const,
                title: tr('A payout is still open in this run', 'در این اجرا هنوز پرداخت باز وجود دارد'),
                description: tr('Finish the remaining payroll balances to close this period cleanly.', 'برای بستن تمیز این دوره، مانده‌های معاش را تکمیل کنید.')
            }
            : currentStage === 'review'
                ? {
                    tone: 'info' as const,
                    title: tr('The pay run is ready for review', 'اجرای معاش برای بازبینی آماده است'),
                    description: tr('Check rows with anomalies or missing payment activity before recording payouts.', 'پیش از ثبت پرداخت، ردیف‌های دارای ناهماهنگی یا فاقد فعالیت پرداخت را بررسی کنید.')
                }
                : {
                    tone: 'neutral' as const,
                    title: tr('Select a period to start this pay run', 'برای شروع این اجرا یک دوره را انتخاب کنید'),
                    description: tr('Choose a month and year first, then review payroll rows below.', 'ابتدا سال و ماه را انتخاب کنید، سپس ردیف‌های معاش را در پایین ببینید.')
                };
    const statusMeta = (row: PayrollRow) => {
        if (row.status === 'overpaid')
            return { tone: 'info' as const, label: tr('Overpaid', 'پرداخت اضافه') };
        if (row.status === 'settled')
            return { tone: 'success' as const, label: t.settled };
        if (row.status === 'partial')
            return { tone: 'warning' as const, label: tr('Partial', 'بخشی پرداخت شده') };
        return { tone: row.totalDue > 0 ? 'danger' as const : 'neutral' as const, label: row.totalDue > 0 ? tr('Unpaid', 'پرداخت‌نشده') : tr('No due', 'بدون بدهی') };
    };
    const getAnomalies = (row: PayrollRow) => {
        const anomalies: {
            tone: 'warning' | 'info' | 'danger';
            label: string;
        }[] = [];
        if (row.status === 'overpaid')
            anomalies.push({ tone: 'info', label: tr('Overpayment detected', 'پرداخت اضافه تشخیص شد') });
        if (row.totalDue > 0 && row.totalPaid === 0)
            anomalies.push({ tone: 'warning', label: tr('No payment recorded yet', 'هنوز پرداختی ثبت نشده است') });
        if (row.baseSalary === 0 && row.effectiveCommissionRate === 0)
            anomalies.push({ tone: 'danger', label: tr('No payroll rule set', 'قاعده معاش تنظیم نشده است') });
        if (row.invoiceCount === 0 && row.totalDue > 0)
            anomalies.push({ tone: 'info', label: tr('No sales this period', 'در این بازه فروشی ثبت نشده است') });
        return anomalies.slice(0, 3);
    };
    const visibleRows = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        return payrollData.filter((row) => {
            const matchesSearch = !query || row.user.name.toLowerCase().includes(query) || row.user.role.toLowerCase().includes(query) || row.tierName.toLowerCase().includes(query);
            const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [payrollData, searchTerm, statusFilter]);
    const selectedRow = visibleRows.find((row) => row.user.id === selectedRowId)
        || payrollData.find((row) => row.user.id === selectedRowId)
        || visibleRows[0]
        || null;
    const activeFilterChips = [
        searchTerm.trim() ? { key: 'search', label: tr(`Search: ${searchTerm}`, `جستجو: ${searchTerm}`), clear: () => setSearchTerm('') } : null,
        statusFilter !== 'all' ? { key: 'status', label: tr(`Status: ${statusFilter}`, `وضعیت: ${statusFilter}`), clear: () => setStatusFilter('all') } : null,
    ].filter(Boolean) as {
        key: string;
        label: string;
        clear: () => void;
    }[];
    const openPaymentModal = (row: PayrollRow) => {
        if (readOnly) {
            alert(tr('Guest Trial: payroll payment is disabled.', 'حالت مهمان: پرداخت معاش غیرفعال است.'));
            return;
        }
        setSelectedUser(row);
        setPaymentAmount(row.remainingBalance > 0 ? String(row.remainingBalance) : '');
        setPaymentDate(new Date().toISOString().split('T')[0]);
        setPaymentNote('');
        setPaymentError('');
        setShowPaymentModal(true);
    };
    const closePaymentModal = () => {
        setShowPaymentModal(false);
        setSelectedUser(null);
        setPaymentError('');
    };
    const handlePaySalary = () => {
        if (readOnly) {
            alert(tr('Guest Trial: payroll payment is disabled.', 'حالت مهمان: پرداخت معاش غیرفعال است.'));
            return;
        }
        if (!selectedUser)
            return;
        const amountToPay = parseFloat(normalizePersianNumbers(paymentAmount));
        if (Number.isNaN(amountToPay) || amountToPay <= 0) {
            setPaymentError(tr('Enter a valid amount greater than zero.', 'یک مبلغ معتبر و بزرگ‌تر از صفر وارد کنید.'));
            return;
        }
        const trackingTag = `[${selectedUser.user.id}] M:${selectedMonth + 1}-Y:${selectedYear}`;
        const description = `${tr('Salary payment', 'پرداخت معاش')}: ${selectedUser.user.name}${paymentNote ? ` - ${paymentNote}` : ''} - ${trackingTag}`;
        onAddExpense({
            title: `${tr('Salary payment', 'پرداخت معاش')}: ${selectedUser.user.name}`,
            amount: amountToPay,
            category: isEnglish ? 'Salary & Wages' : 'حقوق و دستمزد',
            date: paymentDate,
            description,
            userId: activeAppUser?.id || 'admin'
        });
        closePaymentModal();
    };
    const parsedPaymentAmount = parseFloat(normalizePersianNumbers(paymentAmount)) || 0;
    const projectedBalance = selectedUser ? selectedUser.remainingBalance - parsedPaymentAmount : 0;
    const resetPayrollFilters = () => {
        setSearchTerm('');
        setStatusFilter('all');
    };
    return (<PageSurface className="min-h-full p-4 sm:p-5" dir={isEnglish ? 'ltr' : 'rtl'}>
            <div className="space-y-4">
                <PageHeader eyebrow={tr('Finance', 'مالی')} title={isAdmin ? t.payrollTitleAdmin : t.payrollTitleStaff} subtitle={isAdmin ? t.payrollSubtitleAdmin : t.payrollSubtitleStaff} meta={(<div className="flex flex-wrap gap-2">
                            <StatusBadge tone="neutral">{months[selectedMonth]} {isEnglish ? selectedYear : selectedYear.toLocaleString('fa-AF', { useGrouping: false })}</StatusBadge>
                            <StatusBadge tone={currentStage === 'paid' ? 'success' : currentStage === 'finalize' ? 'warning' : currentStage === 'review' ? 'info' : 'neutral'}>
                                {tr(`Run stage: ${stageLabels[currentStage].en}`, `مرحله اجرا: ${stageLabels[currentStage].fa}`)}
                            </StatusBadge>
                        </div>)}/>

                {readOnly ? (<InlineAlert tone="warning" title={tr('Payroll actions are locked', 'عملیات معاش قفل است')}>
                        {tr('You can review payroll rows and payment history, but payout actions are disabled in the current mode.', 'می‌توانید ردیف‌های معاش و تاریخچه پرداخت را ببینید، اما ثبت پرداخت در وضعیت فعلی غیرفعال است.')}
                    </InlineAlert>) : null}

                <FlatCard className="p-3.5">
                    <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2.5">
                                <div>
                                    <label className="block text-xs font-black text-slate-500">{tr('Year', 'سال')}</label>
                                    <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="wk-input mt-2">
                                        {yearOptions.map((year) => <option key={year} value={year}>{isEnglish ? year : year.toLocaleString('fa-AF', { useGrouping: false })}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-500">{tr('Month', 'ماه')}</label>
                                    <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="wk-input mt-2">
                                        {months.map((month, index) => <option key={month} value={index}>{month}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Run coverage', 'پوشش اجرا')}</p>
                                <p className="wk-ltr-data mt-2 text-xl font-black text-brand-700">{payrollCoverage}%</p>
                                <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Based on payments recorded for this period', 'بر اساس پرداخت‌های ثبت‌شده برای این بازه')}</p>
                            </div>
                        </div>
                        <div className="wk-summary-grid">
                            {[
            { id: 'draft', label: tr('Draft', 'پیش‌نویس'), note: tr('Period selected', 'بازه انتخاب شد') },
            { id: 'review', label: tr('Review', 'بازبینی'), note: tr('Rows are ready', 'ردیف‌ها آماده‌اند') },
            { id: 'finalize', label: tr('Finalize', 'نهایی‌سازی'), note: tr('Payout is in progress', 'پرداخت در جریان است') },
            { id: 'paid', label: tr('Paid', 'پرداخت شد'), note: tr('Run is fully covered', 'اجرا کامل پوشش داده شد') },
        ].map((stage) => (<div key={stage.id} className={classNames('rounded-2xl border px-3 py-2.5', currentStage === stage.id ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-neutral-200 bg-white text-slate-500')}>
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em]">{stage.label}</p>
                                    <p className="mt-1.5 text-sm font-black">{stage.note}</p>
                                </div>))}
                        </div>
                    </div>
                </FlatCard>

                <InlineAlert tone={payRunMessage.tone === 'neutral' ? 'info' : payRunMessage.tone} title={payRunMessage.title}>
                    {payRunMessage.description}
                </InlineAlert>

                <div className="wk-summary-grid">
                    <FlatCard className="border border-neutral-200 bg-neutral-50 p-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{t.totalPayrollMonth}</p>
                        <p className="wk-ltr-data mt-2 text-lg font-black text-slate-900">{totalPayout.toLocaleString()}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Net payroll for this run', 'خالص معاش این اجرا')}</p>
                    </FlatCard>
                    <FlatCard className="border border-neutral-200 bg-neutral-50 p-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{t.paidSoFar}</p>
                        <p className="wk-ltr-data mt-2 text-lg font-black text-emerald-600">{totalPaidSoFar.toLocaleString()}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Recorded payout so far', 'پرداخت ثبت‌شده تا حالا')}</p>
                    </FlatCard>
                    <FlatCard className="border border-neutral-200 bg-neutral-50 p-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{t.remainingPayable}</p>
                        <p className="wk-ltr-data mt-2 text-lg font-black text-rose-600">{totalRemaining.toLocaleString()}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Still open in this run', 'باقی‌مانده باز این اجرا')}</p>
                    </FlatCard>
                    <FlatCard className="border border-neutral-200 bg-neutral-50 p-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Payroll users', 'کاربران معاش')}</p>
                        <p className="wk-ltr-data mt-2 text-lg font-black text-brand-700">{activePayrollUsers.toLocaleString()}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Rows with due or activity', 'ردیف‌های دارای بدهی یا فعالیت')}</p>
                    </FlatCard>
                </div>

                <UnifiedFilterBar searchSlot={(<FilterSearchField label={tr('Search payroll', 'جستجوی معاش')} value={searchTerm} onChange={setSearchTerm} placeholder={tr('Employee name, role, or tier', 'نام پرسنل، نقش یا سطح')} dir={isEnglish ? 'ltr' : 'rtl'}/>)} filters={[
            <FilterSelectField key="status" label={tr('Status', 'وضعیت')} value={statusFilter} onChange={(value) => setStatusFilter(value as PayrollStatusFilter)} options={[
                    { value: 'all', label: t.all },
                    { value: 'unpaid', label: tr('Unpaid', 'پرداخت‌نشده') },
                    { value: 'partial', label: tr('Partial', 'بخشی پرداخت شده') },
                    { value: 'settled', label: t.settled },
                    { value: 'overpaid', label: tr('Overpaid', 'پرداخت اضافه') }
                ]}/>,
        ]} actionsSlot={(<Button type="button" variant="secondary" size="sm" onClick={resetPayrollFilters}>
                            {tr('Reset filters', 'پاک‌سازی فیلترها')}
                        </Button>)} resultsLabel={tr(`${visibleRows.length} payroll row(s) visible`, `${visibleRows.length} ردیف معاش نمایش داده می‌شود`)} activeFiltersSlot={activeFilterChips.length > 0 ? activeFilterChips.map((chip) => (<ActiveFilterChip key={chip.key} label={chip.label} onClear={chip.clear}/>)) : undefined}/>

                <div className="wk-detail-split">
                    <FlatCard className="overflow-hidden p-0">
                        {visibleRows.length === 0 ? (<div className="p-5">
                                <EmptyStateShell title={tr('No payroll rows for this period', 'برای این بازه ردیف معاشی وجود ندارد')} description={tr('Add users in Settings and record invoice activity to populate this payroll run.', 'برای پرشدن این اجرای معاش، کاربر اضافه کنید و فعالیت فروش را ثبت نمایید.')} className="py-8"/>
                            </div>) : (<div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-neutral-50">
                                        <tr>
                                            <th className="px-5 py-4 text-right text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t.personnelName}</th>
                                            <th className="px-5 py-4 text-center text-xs font-black uppercase tracking-[0.16em] text-slate-500">{tr('Activity', 'فعالیت')}</th>
                                            <th className="px-5 py-4 text-center text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t.baseSalary}</th>
                                            <th className="px-5 py-4 text-center text-xs font-black uppercase tracking-[0.16em] text-slate-500">{tr('Adjustments', 'تعدیلات')}</th>
                                            <th className="px-5 py-4 text-center text-xs font-black uppercase tracking-[0.16em] text-slate-500">{tr('Net pay', 'خالص پرداخت')}</th>
                                            <th className="px-5 py-4 text-center text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t.payment}</th>
                                            <th className="px-5 py-4 text-center text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t.remaining}</th>
                                            <th className="px-5 py-4 text-center text-xs font-black uppercase tracking-[0.16em] text-slate-500">{tr('Status', 'وضعیت')}</th>
                                            <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t.operation}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100 bg-white">
                                        {visibleRows.map((row) => {
                const meta = statusMeta(row);
                const anomalies = getAnomalies(row);
                const isSelected = selectedRow?.user.id === row.user.id;
                return (<tr key={row.user.id} onClick={() => setSelectedRowId(row.user.id)} className={classNames('cursor-pointer transition hover:bg-brand-50/35', isSelected && 'bg-brand-50/55')}>
                                                    <td className="px-5 py-4">
                                                        <div className="font-black text-slate-900">{row.user.name}</div>
                                                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-400">
                                                            <span>{row.user.role === 'admin' ? tr('System admin', 'مدیر سیستم') : tr('Staff member', 'کارمند')}</span>
                                                            {anomalies[0] ? <StatusBadge tone={anomalies[0].tone}>{anomalies[0].label}</StatusBadge> : null}
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4 text-center">
                                                        <div className="wk-ltr-data text-sm font-black text-slate-900">{row.invoiceCount.toLocaleString()}</div>
                                                        <div className="wk-ltr-data mt-1 text-[11px] font-semibold text-slate-400">{row.totalSales.toLocaleString()}</div>
                                                    </td>
                                                    <td className="wk-ltr-data px-5 py-4 text-center font-semibold text-slate-600">{row.baseSalary.toLocaleString()}</td>
                                                    <td className="px-5 py-4 text-center">
                                                        <div className="wk-ltr-data font-black text-brand-700">{row.commissionAmount.toLocaleString()}</div>
                                                        <div className="wk-ltr-data mt-1 text-[11px] font-semibold text-slate-400">
                                                            {row.commissionAdjustedLineCount > 0
                        ? `${row.minFinalCommissionRate.toFixed(2)}% - ${row.maxFinalCommissionRate.toFixed(2)}%`
                        : `${row.effectiveCommissionRate.toFixed(2)}%`}
                                                        </div>
                                                    </td>
                                                    <td className="wk-ltr-data px-5 py-4 text-center font-black text-slate-900">{row.totalDue.toLocaleString()}</td>
                                                    <td className="wk-ltr-data px-5 py-4 text-center font-black text-emerald-600">{row.totalPaid.toLocaleString()}</td>
                                                    <td className={classNames('wk-ltr-data px-5 py-4 text-center font-black', row.remainingBalance > 0 ? 'text-rose-600' : row.remainingBalance < 0 ? 'text-sky-700' : 'text-emerald-600')}>{row.remainingBalance.toLocaleString()}</td>
                                                    <td className="px-5 py-4 text-center"><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></td>
                                                    <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                                                        <div className="flex justify-end gap-2">
                                                            <Button type="button" variant="ghost" className="px-3 py-2 text-xs" onClick={() => setSelectedRowId(row.user.id)}>{tr('Details', 'جزئیات')}</Button>
                                                            {isAdmin && row.totalDue > 0 && row.status !== 'overpaid' ? (<Button type="button" variant={row.status === 'partial' ? 'secondary' : 'primary'} className="px-3 py-2 text-xs" disabled={readOnly} onClick={() => openPaymentModal(row)}>
                                                                    {row.status === 'partial' ? t.settleAccount : t.paySalary}
                                                                </Button>) : null}
                                                        </div>
                                                    </td>
                                                </tr>);
            })}
                                    </tbody>
                                </table>
                            </div>)}
                    </FlatCard>

                    <FlatCard className="p-5">
                        {selectedRow ? (<div className="space-y-4">
                                <div className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-4">
                                    <div>
                                        <h2 className="text-lg font-black text-slate-900">{tr('Employee payroll detail', 'جزئیات معاش پرسنل')}</h2>
                                        <p className="mt-1 text-xs font-semibold text-slate-500"><bdi className="whitespace-nowrap">{months[selectedMonth]} {isEnglish ? selectedYear : selectedYear.toLocaleString('fa-AF', { useGrouping: false })}</bdi></p>
                                    </div>
                                    <StatusBadge tone={statusMeta(selectedRow).tone}>{statusMeta(selectedRow).label}</StatusBadge>
                                </div>

                                <GlassCard className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-base font-black text-slate-900">{selectedRow.user.name}</p>
                                            <p className="mt-1 text-sm font-semibold text-slate-500">{selectedRow.user.role === 'admin' ? tr('System admin', 'مدیر سیستم') : tr('Staff member', 'کارمند')}</p>
                                            <p className="mt-2 text-xs font-semibold text-slate-500">{selectedRow.invoiceCount} {tr('invoice(s) in this run', 'فاکتور در این اجرا')}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Net pay', 'خالص پرداخت')}</p>
                                            <p className="wk-ltr-data mt-2 text-xl font-black text-slate-900">{selectedRow.totalDue.toLocaleString()}</p>
                                        </div>
                                    </div>
                                </GlassCard>

                                <FlatCard className="border border-neutral-200 bg-neutral-50 p-4">
                                    <h3 className="text-sm font-black text-slate-900">{tr('Payroll breakdown', 'جزئیات معاش')}</h3>
                                    <div className="mt-3 space-y-2">
                                        {[
                { label: t.baseSalary, value: selectedRow.baseSalary, tone: 'text-slate-700' },
                { label: tr('Adjustments / commission', 'تعدیلات / پورسانت'), value: selectedRow.commissionAmount, tone: 'text-brand-700' },
                { label: tr('Deductions', 'کسورات'), value: 0, tone: 'text-slate-500' },
                { label: tr('Net pay', 'خالص پرداخت'), value: selectedRow.totalDue, tone: 'text-slate-900' },
                { label: t.payment, value: selectedRow.totalPaid, tone: 'text-emerald-600' },
                { label: t.remainingPayable, value: selectedRow.remainingBalance, tone: selectedRow.remainingBalance > 0 ? 'text-rose-600' : selectedRow.remainingBalance < 0 ? 'text-sky-700' : 'text-emerald-600' },
            ].map((item) => (<div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-3">
                                                <span className="text-sm font-semibold text-slate-600">{item.label}</span>
                                                <span className={classNames('wk-ltr-data text-sm font-black', item.tone)}>{item.value.toLocaleString()}</span>
                                            </div>))}
                                    </div>
                                    <p className="mt-3 text-xs font-semibold text-slate-500">{tr('No manual deductions are tracked in the current payroll model.', 'در مدل فعلی معاش، کسورات دستی جداگانه ثبت نمی‌شود.')}</p>
                                </FlatCard>

                                <FlatCard className="p-4">
                                    <h3 className="text-sm font-black text-slate-900">{tr('Performance and review', 'عملکرد و بازبینی')}</h3>
                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Generated sales', 'فروش ایجادشده')}</p>
                                            <p className="wk-ltr-data mt-2 text-lg font-black text-slate-900">{selectedRow.totalSales.toLocaleString()}</p>
                                        </div>
                                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Generated profit', 'سود ایجادشده')}</p>
                                            <p className="wk-ltr-data mt-2 text-lg font-black text-brand-700">{selectedRow.generatedProfit.toLocaleString()}</p>
                                        </div>
                                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Tier', 'سطح')}</p>
                                            <p className="mt-2 text-lg font-black text-slate-900">{selectedRow.tierName}</p>
                                        </div>
                                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Effective rate', 'نرخ مؤثر')}</p>
                                            <p className="wk-ltr-data mt-2 text-lg font-black text-slate-900">{selectedRow.effectiveCommissionRate.toFixed(2)}%</p>
                                            <p className="mt-1 text-[11px] font-semibold text-slate-500">{tr('Base rate before medicine adjustment', 'نرخ پایه پیش از تعدیل دوا')}</p>
                                        </div>
                                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Medicine adjustment', 'تعدیل دوا')}</p>
                                            <p className="wk-ltr-data mt-2 text-lg font-black text-slate-900">
                                                {selectedRow.commissionAdjustedLineCount > 0
                ? `${selectedRow.averageCommissionAdjustment >= 0 ? '+' : ''}${selectedRow.averageCommissionAdjustment.toFixed(2)}%`
                : '0.00%'}
                                            </p>
                                            <p className="mt-1 text-[11px] font-semibold text-slate-500">{selectedRow.commissionAdjustedLineCount} {tr('line(s)', 'سطر')}</p>
                                        </div>
                                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Final rate', 'نرخ نهایی')}</p>
                                            <p className="wk-ltr-data mt-2 text-lg font-black text-slate-900">
                                                {selectedRow.minFinalCommissionRate === selectedRow.maxFinalCommissionRate
                ? `${selectedRow.maxFinalCommissionRate.toFixed(2)}%`
                : `${selectedRow.minFinalCommissionRate.toFixed(2)}% - ${selectedRow.maxFinalCommissionRate.toFixed(2)}%`}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-4 rounded-2xl border border-neutral-200 bg-white px-3 py-3">
                                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Last payment', 'آخرین پرداخت')}</p>
                                        <p className="wk-ltr-data mt-2 text-sm font-black text-slate-900">
                                            {selectedRow.lastPaymentDate ? formatPayrollDate(selectedRow.lastPaymentDate) : tr('No payment recorded yet', 'هنوز پرداختی ثبت نشده است')}
                                        </p>
                                    </div>
                                    {getAnomalies(selectedRow).length > 0 ? (<div className="mt-4 flex flex-wrap gap-2">
                                            {getAnomalies(selectedRow).map((anomaly) => (<StatusBadge key={anomaly.label} tone={anomaly.tone}>{anomaly.label}</StatusBadge>))}
                                        </div>) : (<div className="mt-4">
                                            <InlineAlert tone="success" title={tr('No payroll anomalies detected', 'مورد غیرعادی در معاش دیده نشد')}>
                                                {tr('This payroll row is ready for review or payout based on the remaining balance.', 'این ردیف معاش بر اساس مانده، برای بازبینی یا پرداخت آماده است.')}
                                            </InlineAlert>
                                        </div>)}
                                </FlatCard>

                                <FlatCard className="p-4">
                                    <h3 className="text-sm font-black text-slate-900">{tr('Next action', 'اقدام بعدی')}</h3>
                                    <div className="mt-3 space-y-3">
                                        {selectedRow.remainingBalance > 0 ? (<InlineAlert tone={selectedRow.status === 'partial' ? 'warning' : 'info'} title={selectedRow.status === 'partial' ? tr('Payroll is partially paid', 'معاش به‌صورت بخشی پرداخت شده است') : tr('Payroll is ready for payout', 'معاش برای پرداخت آماده است')} action={isAdmin ? (<Button type="button" variant="primary" disabled={readOnly} onClick={() => openPaymentModal(selectedRow)}>
                                                        {selectedRow.status === 'partial' ? t.settleAccount : t.paySalary}
                                                    </Button>) : undefined}>
                                                {selectedRow.status === 'partial'
                    ? tr('Finish the remaining balance to move this row to the paid stage.', 'برای انتقال این ردیف به مرحله پرداخت‌شده، مانده را تسویه کنید.')
                    : tr('Record a payout to move this row forward in the current pay run.', 'برای پیش‌برد این ردیف در اجرای فعلی معاش، یک پرداخت ثبت کنید.')}
                                            </InlineAlert>) : selectedRow.remainingBalance < 0 ? (<InlineAlert tone="warning" title={tr('This row is overpaid', 'برای این ردیف پرداخت اضافه ثبت شده است')}>
                                                {tr('Review the payment history before creating new payroll expenses for this user.', 'پیش از ثبت هزینه معاش جدید برای این کاربر، تاریخچه پرداخت را بازبینی کنید.')}
                                            </InlineAlert>) : (<InlineAlert tone="success" title={tr('Payroll is fully covered', 'معاش این ردیف کامل پرداخت شده است')}>
                                                {tr('No further action is required for this employee in the selected period.', 'برای این کارمند در بازه انتخاب‌شده، اقدام دیگری لازم نیست.')}
                                            </InlineAlert>)}
                                    </div>
                                </FlatCard>
                            </div>) : (<EmptyStateShell title={tr('Select a payroll row', 'یک ردیف معاش را انتخاب کنید')} description={tr('Choose an employee from the table to review the payroll breakdown, activity, and next action.', 'برای دیدن جزئیات معاش، فعالیت و اقدام بعدی، یک کارمند را از جدول انتخاب کنید.')} className="py-8"/>)}
                    </FlatCard>
                </div>

                <Modal isOpen={showPaymentModal} onClose={closePaymentModal} title={selectedUser ? `${t.paySalary}: ${selectedUser.user.name}` : t.paySalary}>
                    {selectedUser ? (<form onSubmit={(event) => { event.preventDefault(); handlePaySalary(); }} className="space-y-4">
                            <GlassCard className="p-4">
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Net pay', 'خالص پرداخت')}</p>
                                        <p className="wk-ltr-data mt-2 text-lg font-black text-slate-900">{selectedUser.totalDue.toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{t.paidSoFar}</p>
                                        <p className="wk-ltr-data mt-2 text-lg font-black text-emerald-600">{selectedUser.totalPaid.toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{t.remainingPayable}</p>
                                        <p className={classNames('wk-ltr-data mt-2 text-lg font-black', selectedUser.remainingBalance > 0 ? 'text-rose-600' : 'text-emerald-600')}>{selectedUser.remainingBalance.toLocaleString()}</p>
                                    </div>
                                </div>
                            </GlassCard>

                            {paymentError ? (<InlineAlert tone="danger" title={tr('Unable to record payroll payment', 'ثبت پرداخت معاش انجام نشد')}>
                                    {paymentError}
                                </InlineAlert>) : null}

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <label className="block text-xs font-black text-slate-500">{t.amount}</label>
                                    <input type="text" inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(normalizePersianNumbers(event.target.value))} className="wk-input wk-ltr-data mt-2" placeholder={selectedUser.remainingBalance.toString()} disabled={readOnly}/>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-500">{t.date}</label>
                                    <JalaliDatePicker value={paymentDate} onChange={setPaymentDate} isEnglish={isEnglish} disabled={readOnly} className="mt-2" ariaLabel={tr('Payment date', 'تاریخ پرداخت')}/>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-semibold text-slate-600">{tr('Projected remaining balance', 'مانده پس از ثبت')}</span>
                                    <span className={classNames('wk-ltr-data text-sm font-black', projectedBalance > 0 ? 'text-rose-600' : projectedBalance < 0 ? 'text-sky-700' : 'text-emerald-600')}>{projectedBalance.toLocaleString()}</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-black text-slate-500">{tr('Payment note', 'یادداشت پرداخت')}</label>
                                <textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} className="wk-input mt-2 min-h-[110px] py-3" placeholder={tr('Optional note for this payroll payment', 'یادداشت اختیاری برای این پرداخت معاش')} disabled={readOnly}/>
                            </div>

                            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                                <Button type="button" variant="secondary" onClick={closePaymentModal}>{t.cancel}</Button>
                                <Button type="submit" variant="primary" disabled={readOnly || !parsedPaymentAmount}>{selectedUser.status === 'partial' ? t.settleAccount : t.paySalary}</Button>
                            </div>
                        </form>) : null}
                </Modal>
            </div>
        </PageSurface>);
};
