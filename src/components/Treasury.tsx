import React, { useCallback, useMemo, useState } from 'react';
import type { AppSettings, AppUser, Customer, Expense, Invoice, Purchase, Supplier, TreasuryCashCount, TreasuryCurrency, TreasuryTransaction, TreasuryTransactionType } from '@/types';
import { PageHeader } from './ui/PageHeader';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { StatusBadge, type StatusBadgeTone } from './ui/StatusBadge';
import { FlatCard, PageSurface } from './ui/Surface';
import { InlineAlert } from './ui/InlineAlert';
import { EmptyStateShell } from './ui/StateShell';
import { classNames } from '@/utils/classNames';
import { getTranslation } from '@/utils/translations';
import { normalizePersianNumbers } from '@/utils/localization';
import { createAppFormatters, formatAppDate } from '@/lib/formatters';
import { getInvoiceNetCollectedAmount, getInvoiceReturnRefundedAmount } from '@/utils/treasuryAccounting';
// ─── Props ─────────────────────────────────────────────────────
export interface TreasuryProps {
    invoices: Invoice[];
    expenses: Expense[];
    customers: Customer[];
    suppliers: Supplier[];
    purchases: Purchase[];
    settings: AppSettings;
    activeAppUser?: AppUser | null;
    treasuryTransactions: TreasuryTransaction[];
    treasuryCashCounts: TreasuryCashCount[];
    onAddTreasuryTransaction: (tx: Omit<TreasuryTransaction, 'id'>) => void;
    onAddCashCount: (count: Omit<TreasuryCashCount, 'id'>) => void;
    readOnly?: boolean;
}
// ─── Constants ─────────────────────────────────────────────────
type ActiveTab = 'overview' | 'transactions' | 'exchange' | 'cash_count';
type DateFilter = 'today' | 'week' | 'month' | 'all';
type DirectionFilter = 'all' | 'in' | 'out';
const SUPPORTED_CURRENCIES: TreasuryCurrency[] = ['AFN', 'USD', 'EUR', 'IRR', 'PKR', 'INR'];
const CURRENCY_LABELS: Record<TreasuryCurrency, {
    en: string;
    fa: string;
    symbol: string;
}> = {
    AFN: { en: 'Afghani', fa: 'افغانی', symbol: '؋' },
    USD: { en: 'US Dollar', fa: 'دالر امریکایی', symbol: '$' },
    EUR: { en: 'Euro', fa: 'یورو', symbol: '€' },
    IRR: { en: 'Iranian Rial', fa: 'ریال ایرانی', symbol: '﷼' },
    PKR: { en: 'Pakistani Rupee', fa: 'روپیه پاکستان', symbol: 'Rs' },
    INR: { en: 'Indian Rupee', fa: 'روپیه هندی', symbol: '₹' },
};
const TRANSACTION_TYPE_CONFIG: Record<TreasuryTransactionType, {
    en: string;
    fa: string;
    direction: 'in' | 'out' | 'both';
    tone: StatusBadgeTone;
}> = {
    sale_income: { en: 'Sale Income', fa: 'درآمد فروش', direction: 'in', tone: 'success' },
    sales_return_refund: { en: 'Sales Return Refund', fa: 'برگشت پول فروش', direction: 'out', tone: 'danger' },
    customer_payment: { en: 'Customer Payment', fa: 'دریافت از مشتری', direction: 'in', tone: 'success' },
    expense_out: { en: 'Expense', fa: 'مصرف', direction: 'out', tone: 'danger' },
    purchase_payment: { en: 'Purchase Payment', fa: 'پرداخت خرید', direction: 'out', tone: 'warning' },
    payroll_out: { en: 'Payroll', fa: 'پرداخت معاش', direction: 'out', tone: 'warning' },
    bank_deposit: { en: 'Bank Deposit', fa: 'واریز به بانک', direction: 'out', tone: 'info' },
    cash_withdrawal: { en: 'Cash Withdrawal', fa: 'برداشت نقدی', direction: 'out', tone: 'danger' },
    petty_cash: { en: 'Petty Cash', fa: 'تنخواه', direction: 'out', tone: 'warning' },
    external_income: { en: 'External Income', fa: 'درآمد خارجی', direction: 'in', tone: 'success' },
    currency_exchange: { en: 'Currency Exchange', fa: 'تبدیل ارز', direction: 'both', tone: 'info' },
    opening_balance: { en: 'Opening Balance', fa: 'موجودی ابتدایی', direction: 'in', tone: 'neutral' },
    adjustment: { en: 'Adjustment', fa: 'تعدیل', direction: 'both', tone: 'neutral' },
};
const PAGE_SIZE = 25;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfWeek = (date: Date) => {
    const d = startOfDay(date);
    d.setDate(d.getDate() - d.getDay());
    return d;
};
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const parseAmountInput = (value: string): number => {
    const normalized = normalizePersianNumbers(value || '').replace(/,/g, '').trim();
    if (!normalized)
        return 0;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
};
// ─── Glass / Card style primitives ────────────────────────────
const GLASS_KPI = 'relative min-h-[120px] overflow-hidden rounded-[24px] border border-white/60 bg-white/40 px-5 py-4 shadow-xl shadow-slate-200/40 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-slate-200/50';
const GLASS_INSET = 'rounded-[20px] border border-white/50 bg-white/50 backdrop-blur-md shadow-sm transition-all hover:bg-white/80';
const GLASS_DARK = 'rounded-[20px] border border-slate-700/50 bg-slate-900/90 text-white shadow-2xl backdrop-blur-xl';
const SECTION_CARD = 'overflow-hidden rounded-[28px] border border-white/60 bg-white/60 backdrop-blur-xl shadow-lg shadow-slate-200/30';
// ─── Icon Primitives ──────────────────────────────────────────
type IconProps = {
    className?: string;
};
const CashInIcon: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v14M7 12l5 5 5-5"/>
    <path d="M5 21h14"/>
  </svg>);
const CashOutIcon: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21V7M7 12l5-5 5 5"/>
    <path d="M5 3h14"/>
  </svg>);
const ExchangeIcon: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 10h13l-4-4"/>
    <path d="M17 14H4l4 4"/>
  </svg>);
const ChartIcon: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 19.5h14"/>
    <path d="M7.5 19.5v-5.5"/>
    <path d="M12 19.5V9.5"/>
    <path d="M16.5 19.5v-8"/>
  </svg>);
const CountIcon: React.FC<IconProps> = ({ className = 'h-5 w-5' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4.25" y="4.25" width="15.5" height="15.5" rx="2.5"/>
    <path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01"/>
  </svg>);
// ─── Component ─────────────────────────────────────────────────
export const Treasury: React.FC<TreasuryProps> = ({ invoices, expenses, customers, suppliers, purchases, settings, activeAppUser, treasuryTransactions, treasuryCashCounts, onAddTreasuryTransaction, onAddCashCount, readOnly = false, }) => {
    const isEnglish = settings.language === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const t = getTranslation(settings.language || 'dari');
    const baseCurrency = (settings.currencySettings?.baseCurrency || 'AFN') as TreasuryCurrency;
    const rates = settings.currencySettings?.rates || { AFN: 1, USD: 0, EUR: 0, IRR: 0, PKR: 0, INR: 0 };
    const numberLocale = isEnglish ? 'en-US' : 'fa-AF';
    const formatters = useMemo(() => createAppFormatters(settings.language, baseCurrency), [settings.language, baseCurrency]);
    // ─── State ──────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
    const [dateFilter, setDateFilter] = useState<DateFilter>('today');
    const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
    const [txPage, setTxPage] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    // Modal states
    const [showTxModal, setShowTxModal] = useState(false);
    const [showExchangeModal, setShowExchangeModal] = useState(false);
    const [showCashCountModal, setShowCashCountModal] = useState(false);
    const [showExternalIncomeModal, setShowExternalIncomeModal] = useState(false);
    // Transaction form
    const [txType, setTxType] = useState<TreasuryTransactionType>('external_income');
    const [txAmount, setTxAmount] = useState('');
    const [txCurrency, setTxCurrency] = useState<TreasuryCurrency>(baseCurrency);
    const [txDescription, setTxDescription] = useState('');
    const [txNote, setTxNote] = useState('');
    const [txCategory, setTxCategory] = useState('');
    // Exchange form
    const [exFromCurrency, setExFromCurrency] = useState<TreasuryCurrency>(baseCurrency);
    const [exToCurrency, setExToCurrency] = useState<TreasuryCurrency>('USD');
    const [exAmount, setExAmount] = useState('');
    const [exRate, setExRate] = useState('');
    const [exNote, setExNote] = useState('');
    // Cash count form
    const [ccActualAmount, setCcActualAmount] = useState('');
    const [ccCurrency, setCcCurrency] = useState<TreasuryCurrency>(baseCurrency);
    const [ccNote, setCcNote] = useState('');
    // External income form
    const [eiAmount, setEiAmount] = useState('');
    const [eiCurrency, setEiCurrency] = useState<TreasuryCurrency>('USD');
    const [eiDescription, setEiDescription] = useState('');
    const [eiNote, setEiNote] = useState('');
    // ─── Format helpers ─────────────────────────────────────────
    const formatNum = useCallback((v: number) => new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0 }).format(Number.isFinite(v) ? v : 0), [numberLocale]);
    const formatMoney = useCallback((v: number, cur: TreasuryCurrency = baseCurrency) => `${formatNum(v)} ${cur}`, [formatNum, baseCurrency]);
    const formatDate = useCallback((d: string) => {
        if (!d)
            return '-';
        const date = new Date(d);
        if (Number.isNaN(date.getTime()))
            return '-';
        return formatAppDate(d, settings, 'treasury');
    }, [settings]);
    // ─── Derived calculations from existing data ────────────────
    const computedData = useMemo(() => {
        const now = new Date();
        const todayStart = startOfDay(now);
        const weekStart = startOfWeek(now);
        const monthStart = startOfMonth(now);
        // Aggregate from invoices
        const todayInvoices = invoices.filter((inv) => !inv.isDeleted && new Date(inv.date) >= todayStart);
        const todaySalesIncome = todayInvoices.reduce((sum, inv) => sum + getInvoiceNetCollectedAmount(inv), 0);
        const todayCreditSales = todayInvoices.reduce((sum, inv) => sum + (inv.remainingAmount || 0), 0);
        // Aggregate from expenses
        const todayExpenses = expenses.filter((exp) => !exp.isDeleted && new Date(exp.date) >= todayStart);
        const todayExpenseOut = todayExpenses.reduce((sum, exp) => sum + exp.amount, 0);
        // Aggregate from purchase payments (today)
        const todayPurchasePayments = purchases.filter((p) => !p.isDeleted).reduce((sum, p) => {
            if (!p.payments)
                return sum;
            return sum + p.payments
                .filter((pay) => new Date(pay.date) >= todayStart)
                .reduce((s, pay) => s + (pay.amount || 0), 0);
        }, 0);
        // Customer receivables (total debt owed to us)
        const totalReceivable = customers
            .filter((c) => !c.isDeleted && c.balance > 0)
            .reduce((sum, c) => sum + c.balance, 0);
        // Supplier payables (total we owe)
        const totalPayable = suppliers
            .filter((s) => !s.isDeleted && s.balance > 0)
            .reduce((sum, s) => sum + s.balance, 0);
        // Profit from today invoices
        const todayGrossProfit = todayInvoices.reduce((sum, inv) => {
            return sum + inv.items.reduce((s, item) => {
                const costPrice = (item as any).costPrice || 0;
                return s + (item.price - costPrice) * item.quantity;
            }, 0);
        }, 0);
        const todayNetProfit = todayGrossProfit - todayExpenseOut - todayPurchasePayments;
        // Overall cash balance: always include auto transactions from app data
        const balanceByCurrency: Record<TreasuryCurrency, number> = { AFN: 0, USD: 0, EUR: 0, IRR: 0, PKR: 0, INR: 0 };
        // 1. Always compute balance from app data (invoices, expenses, purchases)
        const allCashIncome = invoices.filter((inv) => !inv.isDeleted).reduce((sum, inv) => sum + getInvoiceNetCollectedAmount(inv), 0);
        const allExpenseOut = expenses.filter((exp) => !exp.isDeleted).reduce((sum, exp) => sum + (exp.amount || 0), 0);
        const allPurchasePayments = purchases.filter((p) => !p.isDeleted).reduce((sum, p) => {
            if (!p.payments)
                return sum;
            return sum + p.payments.reduce((s, pay) => s + (pay.amount || 0), 0);
        }, 0);
        balanceByCurrency[baseCurrency] = allCashIncome - allExpenseOut - allPurchasePayments;
        // 2. Add manual treasury transactions on top (opening balance, external income, adjustments, etc.)
        const hasTreasuryData = treasuryTransactions.filter((tx) => !tx.isDeleted).length > 0;
        if (hasTreasuryData) {
            // Only include manual-only types that aren't already reflected in invoices/expenses/purchases
            const manualOnlyTypes: TreasuryTransactionType[] = [
                'opening_balance', 'external_income', 'bank_deposit', 'cash_withdrawal',
                'petty_cash', 'adjustment', 'currency_exchange', 'payroll_out',
            ];
            treasuryTransactions
                .filter((tx) => !tx.isDeleted && manualOnlyTypes.includes(tx.type))
                .forEach((tx) => {
                if (tx.direction === 'in') {
                    balanceByCurrency[tx.currency] = (balanceByCurrency[tx.currency] || 0) + tx.amount;
                }
                else {
                    balanceByCurrency[tx.currency] = (balanceByCurrency[tx.currency] || 0) - tx.amount;
                }
            });
        }
        // Month aggregations for chart
        const monthIncome = invoices
            .filter((inv) => !inv.isDeleted && new Date(inv.date) >= monthStart)
            .reduce((sum, inv) => sum + getInvoiceNetCollectedAmount(inv), 0);
        const monthExpenseOnly = expenses
            .filter((exp) => !exp.isDeleted && new Date(exp.date) >= monthStart)
            .reduce((sum, exp) => sum + exp.amount, 0);
        const monthPurchasePayments = purchases.filter((p) => !p.isDeleted).reduce((sum, p) => {
            if (!p.payments)
                return sum;
            return sum + p.payments
                .filter((pay) => new Date(pay.date) >= monthStart)
                .reduce((s, pay) => s + (pay.amount || 0), 0);
        }, 0);
        const monthExpense = monthExpenseOnly + monthPurchasePayments;
        // Week daily flow for mini chart
        const weekDays: {
            label: string;
            income: number;
            expense: number;
            net: number;
        }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const ds = startOfDay(d);
            const de = new Date(ds);
            de.setDate(de.getDate() + 1);
            const dayIncome = invoices
                .filter((inv) => !inv.isDeleted && new Date(inv.date) >= ds && new Date(inv.date) < de)
                .reduce((sum, inv) => sum + getInvoiceNetCollectedAmount(inv), 0);
            const dayExpenseOnly = expenses
                .filter((exp) => !exp.isDeleted && new Date(exp.date) >= ds && new Date(exp.date) < de)
                .reduce((sum, exp) => sum + exp.amount, 0);
            const dayPurchasePayments = purchases.filter((p) => !p.isDeleted).reduce((sum, p) => {
                if (!p.payments)
                    return sum;
                return sum + p.payments
                    .filter((pay) => new Date(pay.date) >= ds && new Date(pay.date) < de)
                    .reduce((s, pay) => s + (pay.amount || 0), 0);
            }, 0);
            const dayExpense = dayExpenseOnly + dayPurchasePayments;
            weekDays.push({
                label: formatAppDate(ds, settings, 'treasury', { weekday: 'short' }),
                income: dayIncome,
                expense: dayExpense,
                net: dayIncome - dayExpense,
            });
        }
        return {
            todaySalesIncome,
            todayCreditSales,
            todayExpenseOut,
            todayPurchasePayments,
            todayGrossProfit,
            todayNetProfit,
            totalReceivable,
            totalPayable,
            balanceByCurrency,
            hasTreasuryData,
            monthIncome,
            monthExpense,
            weekDays,
        };
    }, [invoices, expenses, customers, suppliers, purchases, treasuryTransactions, baseCurrency, settings]);
    // ─── All transactions (unified feed) ────────────────────────
    const unifiedTransactions = useMemo(() => {
        const txList: Array<{
            id: string;
            date: string;
            type: TreasuryTransactionType;
            direction: 'in' | 'out';
            amount: number;
            currency: TreasuryCurrency;
            description: string;
            reference: string;
            userName: string;
            source: 'manual' | 'auto';
        }> = [];
        // Manual transactions
        treasuryTransactions
            .filter((tx) => !tx.isDeleted)
            .forEach((tx) => {
            txList.push({
                id: tx.id,
                date: tx.date,
                type: tx.type,
                direction: tx.direction,
                amount: tx.amount,
                currency: tx.currency,
                description: tx.description,
                reference: tx.referenceId || '',
                userName: tx.userName || '',
                source: 'manual',
            });
        });
        // Auto from invoices (sales income)
        invoices.filter((inv) => !inv.isDeleted && inv.amountPaid > 0).forEach((inv) => {
            txList.push({
                id: `inv_${inv.id}`,
                date: inv.date,
                type: 'sale_income',
                direction: 'in',
                amount: inv.amountPaid,
                currency: baseCurrency,
                description: tr(`Invoice #${inv.invoiceNumber || inv.id.slice(-6)}`, `فاکتور #${inv.invoiceNumber || inv.id.slice(-6)}`),
                reference: inv.id,
                userName: inv.userId || '',
                source: 'auto',
            });
        });
        // Auto from sales returns (cash/card refunds)
        invoices.filter((inv) => !inv.isDeleted && getInvoiceReturnRefundedAmount(inv) > 0).forEach((inv) => {
            (inv.returns || []).filter((entry) => !entry.isDeleted && entry.amountRefunded > 0).forEach((entry) => {
                txList.push({
                    id: `ret_${inv.id}_${entry.id}`,
                    date: entry.date,
                    type: 'sales_return_refund',
                    direction: 'out',
                    amount: entry.amountRefunded,
                    currency: baseCurrency,
                    description: tr(`Sales return refund #${inv.invoiceNumber || inv.id.slice(-6)}`, `برگشت پول فروش #${inv.invoiceNumber || inv.id.slice(-6)}`),
                    reference: inv.id,
                    userName: inv.userId || '',
                    source: 'auto',
                });
            });
        });
        // Auto from expenses
        expenses.filter((exp) => !exp.isDeleted).forEach((exp) => {
            txList.push({
                id: `exp_${exp.id}`,
                date: exp.date,
                type: 'expense_out',
                direction: 'out',
                amount: exp.amount,
                currency: baseCurrency,
                description: `${exp.title}${exp.category ? ` (${exp.category})` : ''}`,
                reference: exp.id,
                userName: exp.userId || '',
                source: 'auto',
            });
        });
        // Auto from purchase payments
        purchases.filter((p) => !p.isDeleted).forEach((p) => {
            (p.payments || []).forEach((pay) => {
                txList.push({
                    id: `pp_${p.id}_${pay.id}`,
                    date: pay.date,
                    type: 'purchase_payment',
                    direction: 'out',
                    amount: pay.amount,
                    currency: baseCurrency,
                    description: tr(`Purchase payment`, `پرداخت خرید`),
                    reference: p.id,
                    userName: pay.recordedBy || '',
                    source: 'auto',
                });
            });
        });
        // Sort by date desc
        txList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return txList;
    }, [treasuryTransactions, invoices, expenses, purchases, baseCurrency, tr]);
    // ─── Filtered transactions ──────────────────────────────────
    const filteredTransactions = useMemo(() => {
        const now = new Date();
        let list = [...unifiedTransactions];
        // Date filter
        if (dateFilter === 'today') {
            const s = startOfDay(now);
            list = list.filter((tx) => new Date(tx.date) >= s);
        }
        else if (dateFilter === 'week') {
            const s = startOfWeek(now);
            list = list.filter((tx) => new Date(tx.date) >= s);
        }
        else if (dateFilter === 'month') {
            const s = startOfMonth(now);
            list = list.filter((tx) => new Date(tx.date) >= s);
        }
        // Direction filter
        if (directionFilter === 'in') {
            list = list.filter((tx) => tx.direction === 'in');
        }
        else if (directionFilter === 'out') {
            list = list.filter((tx) => tx.direction === 'out');
        }
        // Search
        if (searchTerm.trim()) {
            const term = searchTerm.trim().toLowerCase();
            list = list.filter((tx) => tx.description.toLowerCase().includes(term) ||
                tx.userName.toLowerCase().includes(term) ||
                tx.reference.toLowerCase().includes(term));
        }
        return list;
    }, [unifiedTransactions, dateFilter, directionFilter, searchTerm]);
    const pagedTransactions = useMemo(() => filteredTransactions.slice(txPage * PAGE_SIZE, (txPage + 1) * PAGE_SIZE), [filteredTransactions, txPage]);
    const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
    // ─── Exchange rate helpers ──────────────────────────────────
    const getRate = (from: TreasuryCurrency, to: TreasuryCurrency): number => {
        if (from === to)
            return 1;
        const fromRate = rates[from] || 1;
        const toRate = rates[to] || 1;
        if (fromRate === 0)
            return 0;
        return toRate / fromRate;
    };
    // ─── Handlers ───────────────────────────────────────────────
    const resetTxForm = () => {
        setTxAmount('');
        setTxCurrency(baseCurrency);
        setTxDescription('');
        setTxNote('');
        setTxCategory('');
    };
    const handleSubmitTransaction = () => {
        const amount = parseAmountInput(txAmount);
        if (amount <= 0 || !txDescription.trim())
            return;
        const config = TRANSACTION_TYPE_CONFIG[txType];
        const direction: 'in' | 'out' = config.direction === 'both'
            ? 'in'
            : config.direction;
        onAddTreasuryTransaction({
            date: new Date().toISOString(),
            type: txType,
            direction,
            amount,
            currency: txCurrency,
            description: txDescription.trim(),
            note: txNote.trim() || undefined,
            category: txCategory.trim() || undefined,
            userId: activeAppUser?.id,
            userName: activeAppUser?.name,
            updatedAt: new Date().toISOString(),
        });
        resetTxForm();
        setShowTxModal(false);
    };
    const handleSubmitExchange = () => {
        const amount = parseAmountInput(exAmount);
        const rate = parseAmountInput(exRate);
        if (amount <= 0 || rate <= 0 || exFromCurrency === exToCurrency)
            return;
        const convertedAmount = amount * rate;
        // Record OUT from source currency
        onAddTreasuryTransaction({
            date: new Date().toISOString(),
            type: 'currency_exchange',
            direction: 'out',
            amount,
            currency: exFromCurrency,
            convertedAmount,
            exchangeRate: rate,
            targetCurrency: exToCurrency,
            description: tr(`Exchange ${formatNum(amount)} ${exFromCurrency} → ${formatNum(Math.round(convertedAmount))} ${exToCurrency}`, `تبدیل ${formatNum(amount)} ${CURRENCY_LABELS[exFromCurrency].fa} → ${formatNum(Math.round(convertedAmount))} ${CURRENCY_LABELS[exToCurrency].fa}`),
            note: exNote.trim() || undefined,
            userId: activeAppUser?.id,
            userName: activeAppUser?.name,
            updatedAt: new Date().toISOString(),
        });
        // Record IN to target currency
        onAddTreasuryTransaction({
            date: new Date().toISOString(),
            type: 'currency_exchange',
            direction: 'in',
            amount: Math.round(convertedAmount),
            currency: exToCurrency,
            convertedAmount: amount,
            exchangeRate: 1 / rate,
            targetCurrency: exFromCurrency,
            description: tr(`Exchange ${formatNum(amount)} ${exFromCurrency} → ${formatNum(Math.round(convertedAmount))} ${exToCurrency}`, `تبدیل ${formatNum(amount)} ${CURRENCY_LABELS[exFromCurrency].fa} → ${formatNum(Math.round(convertedAmount))} ${CURRENCY_LABELS[exToCurrency].fa}`),
            referenceType: 'manual',
            userId: activeAppUser?.id,
            userName: activeAppUser?.name,
            updatedAt: new Date().toISOString(),
        });
        setExAmount('');
        setExRate('');
        setExNote('');
        setShowExchangeModal(false);
    };
    const handleSubmitCashCount = () => {
        const actual = parseAmountInput(ccActualAmount);
        const expected = computedData.balanceByCurrency[ccCurrency] || 0;
        const diff = actual - expected;
        onAddCashCount({
            date: new Date().toISOString(),
            expectedBalance: expected,
            actualBalance: actual,
            difference: diff,
            currency: ccCurrency,
            note: ccNote.trim() || undefined,
            userId: activeAppUser?.id,
            userName: activeAppUser?.name,
            updatedAt: new Date().toISOString(),
        });
        // Record adjustment if difference
        if (diff !== 0) {
            onAddTreasuryTransaction({
                date: new Date().toISOString(),
                type: 'adjustment',
                direction: diff > 0 ? 'in' : 'out',
                amount: Math.abs(diff),
                currency: ccCurrency,
                description: tr(`Cash count adjustment (${diff > 0 ? 'surplus' : 'shortage'}: ${formatNum(Math.abs(diff))} ${ccCurrency})`, `تعدیل شمارش صندوق (${diff > 0 ? 'اضافه' : 'کسری'}: ${formatNum(Math.abs(diff))} ${ccCurrency})`),
                referenceType: 'manual',
                userId: activeAppUser?.id,
                userName: activeAppUser?.name,
                updatedAt: new Date().toISOString(),
            });
        }
        setCcActualAmount('');
        setCcNote('');
        setShowCashCountModal(false);
    };
    const handleSubmitExternalIncome = () => {
        const amount = parseAmountInput(eiAmount);
        if (amount <= 0 || !eiDescription.trim())
            return;
        onAddTreasuryTransaction({
            date: new Date().toISOString(),
            type: 'external_income',
            direction: 'in',
            amount,
            currency: eiCurrency,
            description: eiDescription.trim(),
            note: eiNote.trim() || undefined,
            referenceType: 'manual',
            userId: activeAppUser?.id,
            userName: activeAppUser?.name,
            updatedAt: new Date().toISOString(),
        });
        setEiAmount('');
        setEiDescription('');
        setEiNote('');
        setShowExternalIncomeModal(false);
    };
    // ─── Computed exchange preview ──────────────────────────────
    const exchangePreview = useMemo(() => {
        const amt = parseAmountInput(exAmount);
        const rate = parseAmountInput(exRate);
        if (amt <= 0 || rate <= 0)
            return null;
        return Math.round(amt * rate);
    }, [exAmount, exRate]);
    const cashCountExpected = computedData.balanceByCurrency[ccCurrency] || 0;
    const cashCountActual = parseAmountInput(ccActualAmount);
    const cashCountDiff = cashCountActual - cashCountExpected;
    // ─── Tab config ─────────────────────────────────────────────
    const tabs: Array<{
        id: ActiveTab;
        label: string;
        icon: React.ReactNode;
    }> = [
        { id: 'overview', label: tr('Overview', 'نمای کلی'), icon: <ChartIcon className="h-4 w-4"/> },
        { id: 'transactions', label: tr('Transactions', 'تراکنش‌ها'), icon: <CashInIcon className="h-4 w-4"/> },
        { id: 'exchange', label: tr('Exchange', 'تبدیل ارز'), icon: <ExchangeIcon className="h-4 w-4"/> },
        { id: 'cash_count', label: tr('Cash Count', 'شمارش صندوق'), icon: <CountIcon className="h-4 w-4"/> },
    ];
    // ─── Select input style ─────────────────────────────────────
    const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100';
    const labelClass = 'mb-1.5 block text-xs font-bold text-slate-600';
    // ═══════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════
    return (<PageSurface className="space-y-5" dir={isEnglish ? 'ltr' : 'rtl'}>
      {/* ─── Page Header ──────────────────────────────────────── */}
      <PageHeader title={t.treasury} subtitle={tr('Treasury & Cash Flow Management', 'مدیریت موجودی صندوق، جریان نقدینگی و ارزها')} primaryAction={!readOnly
            ? {
                label: tr('New Transaction', 'تراکنش جدید'),
                onClick: () => setShowTxModal(true),
                icon: (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>),
            }
            : undefined} secondaryActions={!readOnly
            ? [
                {
                    label: tr('External Income', 'درآمد خارجی'),
                    onClick: () => setShowExternalIncomeModal(true),
                    variant: 'secondary',
                },
                {
                    label: tr('Exchange', 'تبدیل ارز'),
                    onClick: () => setShowExchangeModal(true),
                    variant: 'secondary',
                },
                {
                    label: tr('Cash Count', 'شمارش صندوق'),
                    onClick: () => setShowCashCountModal(true),
                    variant: 'secondary',
                },
            ]
            : []} tabs={tabs.map((tab) => ({
            id: tab.id,
            label: tab.label,
            active: activeTab === tab.id,
            onClick: () => { setActiveTab(tab.id); setTxPage(0); },
        }))}/>

      {/* ─── OVERVIEW TAB ─────────────────────────────────────── */}
      {activeTab === 'overview' && (<div className="space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {/* Cash Balance */}
            <article className={GLASS_KPI}>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-sky-400/18 via-sky-200/10 to-transparent"/>
              <div className="relative">
                <p className="text-[13px] font-semibold text-slate-600">{tr('Cash Balance', 'موجودی صندوق')}</p>
                <div className="mt-3 text-[clamp(1.5rem,2vw,2rem)] font-extrabold tracking-tight text-slate-950">
                  {formatMoney(computedData.balanceByCurrency[baseCurrency])}
                </div>
                <div className="mt-2 border-t border-slate-200/85 pt-2">
                  <p className="text-[11px] font-medium text-slate-500">
                    {computedData.hasTreasuryData
                ? tr('Includes manual adjustments', 'شامل تنظیمات دستی')
                : tr('Based on all transactions', 'بر اساس تمام تراکنش‌ها')}
                  </p>
                </div>
              </div>
            </article>

            {/* Today Income */}
            <article className={GLASS_KPI}>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-emerald-400/18 via-emerald-200/10 to-transparent"/>
              <div className="relative">
                <div className="flex items-start justify-between">
                  <p className="text-[13px] font-semibold text-slate-600">{tr("Today's Income", 'دریافتی امروز')}</p>
                  <StatusBadge tone="success" dot>{tr('Income', 'ورودی')}</StatusBadge>
                </div>
                <div className="mt-3 text-[clamp(1.5rem,2vw,2rem)] font-extrabold tracking-tight text-emerald-700">
                  {formatMoney(computedData.todaySalesIncome)}
                </div>
                <div className="mt-2 border-t border-slate-200/85 pt-2">
                  <p className="text-[11px] font-medium text-slate-500">
                    {tr('Credit sales', 'فروش نسیه')}: {formatMoney(computedData.todayCreditSales)}
                  </p>
                </div>
              </div>
            </article>

            {/* Today Expenses */}
            <article className={GLASS_KPI}>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-rose-400/18 via-rose-200/10 to-transparent"/>
              <div className="relative">
                <div className="flex items-start justify-between">
                  <p className="text-[13px] font-semibold text-slate-600">{tr("Today's Expenses", 'مصارف امروز')}</p>
                  <StatusBadge tone="danger" dot>{tr('Outgoing', 'خروجی')}</StatusBadge>
                </div>
                <div className="mt-3 text-[clamp(1.5rem,2vw,2rem)] font-extrabold tracking-tight text-rose-700">
                  {formatMoney(computedData.todayExpenseOut + computedData.todayPurchasePayments)}
                </div>
                <div className="mt-2 border-t border-slate-200/85 pt-2">
                  <p className="text-[11px] font-medium text-slate-500">
                    {tr('Purchase payments', 'پرداخت خرید')}: {formatMoney(computedData.todayPurchasePayments)}
                  </p>
                </div>
              </div>
            </article>

            {/* Net Profit */}
            <article className={GLASS_KPI}>
              <div className={classNames('pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b', computedData.todayNetProfit >= 0 ? 'from-emerald-400/18 via-emerald-200/10 to-transparent' : 'from-amber-400/18 via-amber-200/10 to-transparent')}/>
              <div className="relative">
                <div className="flex items-start justify-between">
                  <p className="text-[13px] font-semibold text-slate-600">{tr("Today's Net", 'سود خالص امروز')}</p>
                  <StatusBadge tone={computedData.todayNetProfit >= 0 ? 'success' : 'warning'} dot>
                    {computedData.todayNetProfit >= 0 ? tr('Profit', 'سود') : tr('Loss', 'ضرر')}
                  </StatusBadge>
                </div>
                <div className={classNames('mt-3 text-[clamp(1.5rem,2vw,2rem)] font-extrabold tracking-tight', computedData.todayNetProfit >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                  {computedData.todayNetProfit >= 0 ? '+' : ''}{formatMoney(computedData.todayNetProfit)}
                </div>
                <div className="mt-2 border-t border-slate-200/85 pt-2">
                  <p className="text-[11px] font-medium text-slate-500">
                    {tr('Gross profit', 'سود ناخالص')}: {formatMoney(computedData.todayGrossProfit)}
                  </p>
                </div>
              </div>
            </article>
          </div>

          {/* Multi-Currency Balances */}
          <FlatCard className={SECTION_CARD}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">{tr('Currency Accounts', 'حساب‌های ارزی')}</h3>
                <p className="mt-0.5 text-xs font-medium text-slate-500">{tr('Balance per currency', 'موجودی بر اساس ارز')}</p>
              </div>
              {!readOnly && (<Button variant="ghost" onClick={() => setShowExternalIncomeModal(true)} className="text-sm">
                  {tr('+ Add Funds', '+ افزودن موجودی')}
                </Button>)}
            </div>
            <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-6">
              {SUPPORTED_CURRENCIES.map((cur) => {
                const balance = computedData.balanceByCurrency[cur] || 0;
                const isActive = balance !== 0;
                return (<div key={cur} className={classNames(GLASS_INSET, 'px-4 py-3 transition', isActive ? 'border-sky-200/80 bg-sky-50/50' : 'opacity-60')}>
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-sm font-black text-slate-700">
                        {CURRENCY_LABELS[cur].symbol}
                      </span>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{cur}</p>
                        <p className="text-xs font-medium text-slate-400">
                          {isEnglish ? CURRENCY_LABELS[cur].en : CURRENCY_LABELS[cur].fa}
                        </p>
                      </div>
                    </div>
                    <p className={classNames('mt-2 text-lg font-black', balance > 0 ? 'text-emerald-700' : balance < 0 ? 'text-rose-700' : 'text-slate-400')}>
                      {formatNum(balance)}
                    </p>
                  </div>);
            })}
            </div>
          </FlatCard>

          {/* Receivables & Payables + Weekly Chart */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Receivables & Payables */}
            <FlatCard className={SECTION_CARD}>
              <div className="border-b border-slate-100 px-5 py-4">
                <h3 className="text-lg font-black text-slate-900">{tr('Receivables & Payables', 'دریافتنی و پرداختنی')}</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 p-5">
                <div className={classNames(GLASS_INSET, 'px-4 py-3')}>
                  <p className="text-xs font-bold text-emerald-600">{tr('Total Receivable', 'مجموع طلب‌ها (از مشتریان)')}</p>
                  <p className="mt-2 text-xl font-black text-emerald-800">{formatMoney(computedData.totalReceivable)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {formatNum(customers.filter((c) => !c.isDeleted && c.balance > 0).length)} {tr('debtors', 'بدهکار')}
                  </p>
                </div>
                <div className={classNames(GLASS_INSET, 'px-4 py-3')}>
                  <p className="text-xs font-bold text-rose-600">{tr('Total Payable', 'مجموع بدهی (به تأمین‌کنندگان)')}</p>
                  <p className="mt-2 text-xl font-black text-rose-800">{formatMoney(computedData.totalPayable)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {formatNum(suppliers.filter((s) => !s.isDeleted && s.balance > 0).length)} {tr('suppliers', 'تأمین‌کننده')}
                  </p>
                </div>
              </div>

              {/* Payment method breakdown */}
              <div className="border-t border-slate-100 px-5 py-4">
                <p className="mb-3 text-xs font-bold text-slate-600">{tr('Monthly Summary', 'خلاصه ماهانه')}</p>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-[11px] text-slate-500">{tr('Month Income', 'درآمد ماه')}</p>
                    <p className="text-base font-black text-emerald-700">{formatMoney(computedData.monthIncome)}</p>
                  </div>
                  <div className="h-8 w-px bg-slate-200"/>
                  <div className="flex-1">
                    <p className="text-[11px] text-slate-500">{tr('Month Expenses', 'مصارف ماه')}</p>
                    <p className="text-base font-black text-rose-700">{formatMoney(computedData.monthExpense)}</p>
                  </div>
                  <div className="h-8 w-px bg-slate-200"/>
                  <div className="flex-1">
                    <p className="text-[11px] text-slate-500">{tr('Net', 'خالص')}</p>
                    <p className={classNames('text-base font-black', computedData.monthIncome - computedData.monthExpense >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                      {formatMoney(computedData.monthIncome - computedData.monthExpense)}
                    </p>
                  </div>
                </div>
              </div>
            </FlatCard>

            {/* Weekly Cash Flow Chart (Modern Glassmorphism) */}
            <FlatCard className={SECTION_CARD}>
              <div className="border-b border-slate-100/50 px-5 py-4">
                <h3 className="text-lg font-black text-slate-800">{tr('Weekly Cash Flow', 'جریان نقدینگی هفتگی')}</h3>
              </div>
              <div className="relative p-5">
                <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-100/40 via-transparent to-transparent"/>
                {(() => {
                const maxVal = Math.max(1, ...computedData.weekDays.map((d) => Math.max(d.income, d.expense)));
                return (<div className="relative flex items-end justify-between gap-1.5 rounded-2xl border border-white/40 bg-white/30 p-4 shadow-[inset_0_2px_15px_rgba(255,255,255,0.7)] backdrop-blur-xl sm:gap-3" style={{ height: 180 }}>
                      {/* Background Grid Lines */}
                      <div className="pointer-events-none absolute inset-x-4 inset-y-4 flex flex-col justify-between">
                        {[1, 2, 3, 4].map((iline) => (<div key={iline} className="w-full border-t border-dashed border-slate-300/40"/>))}
                      </div>

                      {computedData.weekDays.map((day, i) => (<div key={i} className="group relative z-10 flex h-full flex-1 flex-col justify-end gap-2">
                          {/* Tooltip on hover */}
                          <div className="pointer-events-none absolute -top-12 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                            <div className="whitespace-nowrap rounded-xl border border-white/60 bg-white/70 px-2.5 py-1.5 shadow-xl backdrop-blur-md">
                              <p className="text-[10px] font-black text-slate-700">{day.label}</p>
                              <div className="mt-1 flex items-center gap-2 text-[10px] font-bold">
                                <span className="text-emerald-600">+{formatNum(day.income)}</span>
                                <span className="text-rose-500">-{formatNum(day.expense)}</span>
                              </div>
                            </div>
                            <div className="h-1.5 w-1.5 rotate-45 border-b border-r border-white/60 bg-white/70"/>
                          </div>

                          <div className="flex h-full w-full justify-center gap-[2px]">
                            {/* Income Bar */}
                            <div className="group/bar flex w-full max-w-[12px] flex-col justify-end sm:max-w-[16px]">
                              <div className="w-full rounded-t-lg border border-emerald-300/50 bg-gradient-to-t from-emerald-400/60 to-emerald-300/80 shadow-[0_0_15px_rgba(52,211,153,0.15)] backdrop-blur-sm transition-all duration-300 group-hover/bar:bg-emerald-400 group-hover/bar:shadow-[0_0_20px_rgba(52,211,153,0.4)]" style={{ height: `${(day.income / maxVal) * 100}%`, minHeight: day.income > 0 ? 8 : 0 }}/>
                            </div>
                            {/* Expense Bar */}
                            <div className="group/bar flex w-full max-w-[12px] flex-col justify-end sm:max-w-[16px]">
                              <div className="w-full rounded-t-lg border border-rose-300/50 bg-gradient-to-t from-rose-400/60 to-rose-300/80 shadow-[0_0_15px_rgba(251,113,133,0.15)] backdrop-blur-sm transition-all duration-300 group-hover/bar:bg-rose-400 group-hover/bar:shadow-[0_0_20px_rgba(251,113,133,0.4)]" style={{ height: `${(day.expense / maxVal) * 100}%`, minHeight: day.expense > 0 ? 8 : 0 }}/>
                            </div>
                          </div>
                          <p className="text-center text-[10px] font-bold text-slate-500 transition-colors duration-200 group-hover:text-slate-800">{day.label}</p>
                        </div>))}
                    </div>);
            })()}
                
                {/* Legend */}
                <div className="mt-5 flex items-center justify-center gap-6 rounded-2xl border border-white/50 bg-white/40 px-4 py-2 shadow-sm backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-md bg-emerald-400/80 shadow-inner"/>
                    <span className="text-[11px] font-bold text-slate-600">{tr('Income', 'ورودی (درآمد)')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-md bg-rose-400/80 shadow-inner"/>
                    <span className="text-[11px] font-bold text-slate-600">{tr('Expenses', 'خروجی (مصرف)')}</span>
                  </div>
                </div>
              </div>
            </FlatCard>
          </div>
        </div>)}

      {/* ─── TRANSACTIONS TAB ─────────────────────────────────── */}
      {activeTab === 'transactions' && (<div className="space-y-4">
          {/* Filters */}
          <FlatCard className="flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
            {/* Date filter */}
            <div className="flex gap-1 rounded-xl bg-slate-100 p-0.5">
              {(['today', 'week', 'month', 'all'] as DateFilter[]).map((f) => (<button key={f} type="button" onClick={() => { setDateFilter(f); setTxPage(0); }} className={classNames('rounded-lg px-3 py-1.5 text-xs font-bold transition', dateFilter === f
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700')}>
                  {f === 'today' ? tr('Today', 'امروز')
                    : f === 'week' ? tr('Week', 'هفته')
                        : f === 'month' ? tr('Month', 'ماه')
                            : tr('All', 'همه')}
                </button>))}
            </div>

            {/* Direction filter */}
            <div className="flex gap-1 rounded-xl bg-slate-100 p-0.5">
              {(['all', 'in', 'out'] as DirectionFilter[]).map((d) => (<button key={d} type="button" onClick={() => { setDirectionFilter(d); setTxPage(0); }} className={classNames('rounded-lg px-3 py-1.5 text-xs font-bold transition', directionFilter === d
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700')}>
                  {d === 'all' ? tr('All', 'همه')
                    : d === 'in' ? tr('Income', 'ورودی')
                        : tr('Expenses', 'خروجی')}
                </button>))}
            </div>

            {/* Search */}
            <div className="relative flex-1" style={{ minWidth: 200 }}>
              <input type="text" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setTxPage(0); }} placeholder={tr('Search transactions...', 'جستجوی تراکنش...')} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-700 outline-hidden transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-100"/>
            </div>

            <p className="text-xs font-bold text-slate-400">
              {formatNum(filteredTransactions.length)} {tr('transactions', 'تراکنش')}
            </p>
          </FlatCard>

          {/* Transaction List */}
          {pagedTransactions.length === 0 ? (<EmptyStateShell title={tr('No transactions found', 'تراکنشی یافت نشد')} description={tr('Adjust filters or add a new transaction.', 'فیلترها را تغییر دهید یا تراکنش جدید اضافه کنید.')}/>) : (<FlatCard className={classNames(SECTION_CARD, 'overflow-hidden')}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className={classNames('px-4 py-3 font-bold text-slate-600', isEnglish ? 'text-left' : 'text-right')}>{tr('Date', 'تاریخ')}</th>
                      <th className={classNames('px-4 py-3 font-bold text-slate-600', isEnglish ? 'text-left' : 'text-right')}>{tr('Type', 'نوع')}</th>
                      <th className={classNames('px-4 py-3 font-bold text-slate-600', isEnglish ? 'text-left' : 'text-right')}>{tr('Description', 'تفصیلات')}</th>
                      <th className="px-4 py-3 text-center font-bold text-slate-600">{tr('Direction', 'جهت')}</th>
                      <th className={classNames('px-4 py-3 font-bold text-slate-600', isEnglish ? 'text-right' : 'text-left')}>{tr('Amount', 'مبلغ')}</th>
                      <th className={classNames('px-4 py-3 font-bold text-slate-600', isEnglish ? 'text-left' : 'text-right')}>{tr('User', 'کاربر')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedTransactions.map((tx, idx) => {
                    const typeConfig = TRANSACTION_TYPE_CONFIG[tx.type];
                    return (<tr key={tx.id} className="group border-b border-slate-100/50 bg-transparent transition-all duration-200 hover:bg-white/60 hover:shadow-sm">
                          <td className="whitespace-nowrap px-4 py-4 text-xs font-medium text-slate-600">{formatDate(tx.date)}</td>
                          <td className="px-4 py-3">
                            <StatusBadge tone={typeConfig?.tone || 'neutral'}>
                              {isEnglish ? typeConfig?.en : typeConfig?.fa}
                            </StatusBadge>
                          </td>
                          <td className="max-w-[220px] truncate px-4 py-3 text-xs font-semibold text-slate-800">{tx.description}</td>
                          <td className="px-4 py-3 text-center">
                            {tx.direction === 'in' ? (<span className="inline-flex items-center gap-1 text-emerald-600">
                                <CashInIcon className="h-3.5 w-3.5"/>
                                <span className="text-xs font-bold">{tr('In', 'ورودی')}</span>
                              </span>) : (<span className="inline-flex items-center gap-1 text-rose-600">
                                <CashOutIcon className="h-3.5 w-3.5"/>
                                <span className="text-xs font-bold">{tr('Out', 'خروجی')}</span>
                              </span>)}
                          </td>
                          <td className={classNames('whitespace-nowrap px-4 py-3 text-sm font-black', tx.direction === 'in' ? 'text-emerald-700' : 'text-rose-700', isEnglish ? 'text-right' : 'text-left')}>
                            {tx.direction === 'in' ? '+' : '-'}{formatNum(tx.amount)} {tx.currency}
                          </td>
                          <td className="px-4 py-3 text-xs font-medium text-slate-500">{tx.userName || '-'}</td>
                        </tr>);
                })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (<div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
                  <Button variant="ghost" disabled={txPage === 0} onClick={() => setTxPage((p) => Math.max(0, p - 1))}>
                    {tr('Previous', 'قبلی')}
                  </Button>
                  <p className="text-xs font-bold text-slate-500">
                    {tr('Page', 'صفحه')} {formatNum(txPage + 1)} / {formatNum(totalPages)}
                  </p>
                  <Button variant="ghost" disabled={txPage >= totalPages - 1} onClick={() => setTxPage((p) => Math.min(totalPages - 1, p + 1))}>
                    {tr('Next', 'بعدی')}
                  </Button>
                </div>)}
            </FlatCard>)}
        </div>)}

      {/* ─── EXCHANGE TAB ─────────────────────────────────────── */}
      {activeTab === 'exchange' && (<div className="grid gap-5 lg:grid-cols-2">
          {/* Exchange Rates */}
          <FlatCard className={SECTION_CARD}>
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-lg font-black text-slate-900">{tr('Exchange Rates', 'نرخ ارزها')}</h3>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                {tr(`Base: ${baseCurrency}`, `ارز پایه: ${CURRENCY_LABELS[baseCurrency].fa}`)}
                {rates.USD > 0 && ` · ${tr('Last updated', 'آخرین بروزرسانی')}: ${settings.currencySettings?.lastUpdated ? formatDate(settings.currencySettings.lastUpdated) : '-'}`}
              </p>
            </div>
            <div className="space-y-2 p-5">
              {SUPPORTED_CURRENCIES.filter((c) => c !== baseCurrency).map((cur) => {
                const rate = getRate(baseCurrency, cur);
                return (<div key={cur} className={classNames(GLASS_INSET, 'flex items-center justify-between px-4 py-3')}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-black text-slate-700">
                        {CURRENCY_LABELS[cur].symbol}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{isEnglish ? CURRENCY_LABELS[cur].en : CURRENCY_LABELS[cur].fa}</p>
                        <p className="text-[10px] font-medium text-slate-400">{cur}</p>
                      </div>
                    </div>
                    <div className={isEnglish ? 'text-right' : 'text-left'}>
                      <p className="text-base font-black text-slate-900">
                        {rate > 0 ? formatNum(Math.round(rate * 10000) / 10000 * 10000 / 10000) : '-'}
                      </p>
                      <p className="text-[10px] text-slate-400">1 {baseCurrency} = {rate > 0 ? (Math.round(rate * 100) / 100).toString() : '?'} {cur}</p>
                    </div>
                  </div>);
            })}
            </div>
          </FlatCard>

          {/* Quick Exchange Calculator */}
          <FlatCard className={SECTION_CARD}>
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-lg font-black text-slate-900">{tr('Currency Converter', 'مبدل ارز')}</h3>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>{tr('From', 'از')}</label>
                  <select value={exFromCurrency} onChange={(e) => setExFromCurrency(e.target.value as TreasuryCurrency)} className={inputClass}>
                    {SUPPORTED_CURRENCIES.map((c) => (<option key={c} value={c}>{c} - {isEnglish ? CURRENCY_LABELS[c].en : CURRENCY_LABELS[c].fa}</option>))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>{tr('To', 'به')}</label>
                  <select value={exToCurrency} onChange={(e) => setExToCurrency(e.target.value as TreasuryCurrency)} className={inputClass}>
                    {SUPPORTED_CURRENCIES.map((c) => (<option key={c} value={c}>{c} - {isEnglish ? CURRENCY_LABELS[c].en : CURRENCY_LABELS[c].fa}</option>))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelClass}>{tr('Amount', 'مبلغ')}</label>
                <input type="text" inputMode="numeric" value={exAmount} onChange={(e) => setExAmount(e.target.value)} placeholder="0" className={inputClass}/>
              </div>
              <div>
                <label className={labelClass}>{tr('Exchange Rate', 'نرخ تبدیل')}</label>
                <input type="text" inputMode="decimal" value={exRate} onChange={(e) => setExRate(e.target.value)} placeholder={`1 ${exFromCurrency} = ? ${exToCurrency}`} className={inputClass}/>
              </div>

              {exchangePreview !== null && (<div className={classNames(GLASS_DARK, 'px-5 py-4')}>
                  <p className="text-xs font-bold text-slate-400">{tr('Result', 'نتیجه')}</p>
                  <p className="mt-1 text-2xl font-black">
                    {formatNum(parseAmountInput(exAmount))} {exFromCurrency} = {formatNum(exchangePreview)} {exToCurrency}
                  </p>
                </div>)}

              {!readOnly && (<Button variant="primary" className="w-full" disabled={!exchangePreview || exFromCurrency === exToCurrency} onClick={() => setShowExchangeModal(true)}>
                  {tr('Record Exchange', 'ثبت تبدیل ارز')}
                </Button>)}
            </div>
          </FlatCard>
        </div>)}

      {/* ─── CASH COUNT TAB ───────────────────────────────────── */}
      {activeTab === 'cash_count' && (<div className="space-y-5">
          {/* Current expected balances */}
          <FlatCard className={SECTION_CARD}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">{tr('Cash Count & Reconciliation', 'شمارش و تطبیق صندوق')}</h3>
                <p className="mt-0.5 text-xs font-medium text-slate-500">{tr('Compare actual cash with system balance', 'مقایسه موجودی واقعی با موجودی سیستم')}</p>
              </div>
              {!readOnly && (<Button variant="primary" onClick={() => setShowCashCountModal(true)}>
                  {tr('New Cash Count', 'شمارش جدید')}
                </Button>)}
            </div>
            <div className="grid grid-cols-2 gap-4 p-5 lg:grid-cols-3">
              {SUPPORTED_CURRENCIES.map((cur) => {
                const balance = computedData.balanceByCurrency[cur] || 0;
                if (balance === 0 && cur !== baseCurrency)
                    return null;
                return (<div key={cur} className={classNames(GLASS_INSET, 'px-4 py-3')}>
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-xs font-black text-slate-600">{CURRENCY_LABELS[cur].symbol}</span>
                      <p className="text-sm font-bold text-slate-800">{cur}</p>
                    </div>
                    <p className="mt-2 text-xs font-medium text-slate-500">{tr('System Balance', 'موجودی سیستم')}</p>
                    <p className="text-lg font-black text-slate-900">{formatNum(balance)}</p>
                  </div>);
            }).filter(Boolean)}
            </div>
          </FlatCard>

          {/* History of cash counts */}
          <FlatCard className={SECTION_CARD}>
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-lg font-black text-slate-900">{tr('Count History', 'تاریخچه شمارش‌ها')}</h3>
            </div>
            {treasuryCashCounts.length === 0 ? (<div className="p-8 text-center">
                <CountIcon className="mx-auto h-10 w-10 text-slate-300"/>
                <p className="mt-3 text-sm font-bold text-slate-500">{tr('No counts recorded yet', 'هنوز شمارشی ثبت نشده')}</p>
              </div>) : (<div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className={classNames('px-4 py-3 font-bold text-slate-600', isEnglish ? 'text-left' : 'text-right')}>{tr('Date', 'تاریخ')}</th>
                      <th className={classNames('px-4 py-3 font-bold text-slate-600', isEnglish ? 'text-left' : 'text-right')}>{tr('Currency', 'ارز')}</th>
                      <th className={classNames('px-4 py-3 font-bold text-slate-600', isEnglish ? 'text-right' : 'text-left')}>{tr('Expected', 'مورد انتظار')}</th>
                      <th className={classNames('px-4 py-3 font-bold text-slate-600', isEnglish ? 'text-right' : 'text-left')}>{tr('Actual', 'واقعی')}</th>
                      <th className={classNames('px-4 py-3 font-bold text-slate-600', isEnglish ? 'text-right' : 'text-left')}>{tr('Difference', 'مغایرت')}</th>
                      <th className={classNames('px-4 py-3 font-bold text-slate-600', isEnglish ? 'text-left' : 'text-right')}>{tr('User', 'کاربر')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...treasuryCashCounts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((cc, idx) => (<tr key={cc.id} className={classNames('border-b border-slate-50', idx % 2 === 0 ? 'bg-white' : 'bg-slate-25')}>
                        <td className="px-4 py-3 text-xs font-medium text-slate-600">{formatDate(cc.date)}</td>
                        <td className="px-4 py-3 text-xs font-bold text-slate-700">{cc.currency}</td>
                        <td className={classNames('px-4 py-3 text-sm font-bold text-slate-700', isEnglish ? 'text-right' : 'text-left')}>{formatNum(cc.expectedBalance)}</td>
                        <td className={classNames('px-4 py-3 text-sm font-bold text-slate-700', isEnglish ? 'text-right' : 'text-left')}>{formatNum(cc.actualBalance)}</td>
                        <td className={classNames('px-4 py-3 text-sm font-black', cc.difference === 0 ? 'text-emerald-600' : cc.difference > 0 ? 'text-sky-600' : 'text-rose-600', isEnglish ? 'text-right' : 'text-left')}>
                          {cc.difference === 0
                        ? tr('Match', 'تراز')
                        : `${cc.difference > 0 ? '+' : ''}${formatNum(cc.difference)}`}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-500">{cc.userName || '-'}</td>
                      </tr>))}
                  </tbody>
                </table>
              </div>)}
          </FlatCard>
        </div>)}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MODALS                                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}

      {/* ─── New Transaction Modal ────────────────────────────── */}
      <Modal isOpen={showTxModal} onClose={() => { setShowTxModal(false); resetTxForm(); }} title={tr('New Transaction', 'تراکنش جدید')} maxWidthClassName="max-w-lg">
        <div className="space-y-4" dir={isEnglish ? 'ltr' : 'rtl'}>
          <div>
            <label className={labelClass}>{tr('Transaction Type', 'نوع تراکنش')}</label>
            <select value={txType} onChange={(e) => setTxType(e.target.value as TreasuryTransactionType)} className={inputClass}>
              {(Object.keys(TRANSACTION_TYPE_CONFIG) as TreasuryTransactionType[]).map((key) => (<option key={key} value={key}>
                  {isEnglish ? TRANSACTION_TYPE_CONFIG[key].en : TRANSACTION_TYPE_CONFIG[key].fa}
                </option>))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{tr('Amount', 'مبلغ')}</label>
              <input type="text" inputMode="numeric" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} placeholder="0" className={inputClass}/>
            </div>
            <div>
              <label className={labelClass}>{tr('Currency', 'ارز')}</label>
              <select value={txCurrency} onChange={(e) => setTxCurrency(e.target.value as TreasuryCurrency)} className={inputClass}>
                {SUPPORTED_CURRENCIES.map((c) => (<option key={c} value={c}>{c} - {isEnglish ? CURRENCY_LABELS[c].en : CURRENCY_LABELS[c].fa}</option>))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>{tr('Description', 'تفصیلات')}</label>
            <input type="text" value={txDescription} onChange={(e) => setTxDescription(e.target.value)} placeholder={tr('Enter description...', 'توضیحات را وارد کنید...')} className={inputClass}/>
          </div>
          <div>
            <label className={labelClass}>{tr('Note (optional)', 'یادداشت (اختیاری)')}</label>
            <input type="text" value={txNote} onChange={(e) => setTxNote(e.target.value)} placeholder={tr('Optional note...', 'یادداشت اختیاری...')} className={inputClass}/>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => { setShowTxModal(false); resetTxForm(); }}>{tr('Cancel', 'لغو')}</Button>
            <Button variant="primary" disabled={parseAmountInput(txAmount) <= 0 || !txDescription.trim()} onClick={handleSubmitTransaction}>
              {tr('Record', 'ثبت')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Exchange Modal ───────────────────────────────────── */}
      <Modal isOpen={showExchangeModal} onClose={() => setShowExchangeModal(false)} title={tr('Record Currency Exchange', 'ثبت تبدیل ارز')} maxWidthClassName="max-w-lg">
        <div className="space-y-4" dir={isEnglish ? 'ltr' : 'rtl'}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{tr('From Currency', 'از ارز')}</label>
              <select value={exFromCurrency} onChange={(e) => setExFromCurrency(e.target.value as TreasuryCurrency)} className={inputClass}>
                {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>{tr('To Currency', 'به ارز')}</label>
              <select value={exToCurrency} onChange={(e) => setExToCurrency(e.target.value as TreasuryCurrency)} className={inputClass}>
                {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>{tr('Amount', 'مبلغ')}</label>
            <input type="text" inputMode="numeric" value={exAmount} onChange={(e) => setExAmount(e.target.value)} placeholder="0" className={inputClass}/>
          </div>
          <div>
            <label className={labelClass}>{tr('Rate', 'نرخ')} (1 {exFromCurrency} = ? {exToCurrency})</label>
            <input type="text" inputMode="decimal" value={exRate} onChange={(e) => setExRate(e.target.value)} placeholder="0" className={inputClass}/>
          </div>

          {exchangePreview !== null && exFromCurrency !== exToCurrency && (<div className={classNames(GLASS_DARK, 'px-5 py-4')}>
              <p className="text-xs font-bold text-slate-400">{tr('You will exchange', 'تبدیل خواهید کرد')}</p>
              <p className="mt-1 text-xl font-black">
                {formatNum(parseAmountInput(exAmount))} {CURRENCY_LABELS[exFromCurrency].symbol} → {formatNum(exchangePreview)} {CURRENCY_LABELS[exToCurrency].symbol}
              </p>
            </div>)}

          <div>
            <label className={labelClass}>{tr('Note', 'یادداشت')}</label>
            <input type="text" value={exNote} onChange={(e) => setExNote(e.target.value)} className={inputClass} placeholder={tr('Optional...', 'اختیاری...')}/>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowExchangeModal(false)}>{tr('Cancel', 'لغو')}</Button>
            <Button variant="primary" disabled={!exchangePreview || exFromCurrency === exToCurrency} onClick={handleSubmitExchange}>
              {tr('Confirm Exchange', 'تایید تبدیل')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Cash Count Modal ─────────────────────────────────── */}
      <Modal isOpen={showCashCountModal} onClose={() => setShowCashCountModal(false)} title={tr('Cash Count', 'شمارش صندوق')} maxWidthClassName="max-w-md">
        <div className="space-y-4" dir={isEnglish ? 'ltr' : 'rtl'}>
          <div>
            <label className={labelClass}>{tr('Currency', 'ارز')}</label>
            <select value={ccCurrency} onChange={(e) => setCcCurrency(e.target.value as TreasuryCurrency)} className={inputClass}>
              {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c} - {isEnglish ? CURRENCY_LABELS[c].en : CURRENCY_LABELS[c].fa}</option>)}
            </select>
          </div>

          <div className={classNames(GLASS_DARK, 'px-5 py-4')}>
            <p className="text-sm font-bold text-slate-400">{tr('Expected Balance (System)', 'موجودی مورد انتظار (سیستم)')}</p>
            <p className="mt-1 text-3xl font-black">{formatNum(cashCountExpected)} <span className="text-sm font-normal text-slate-500">{ccCurrency}</span></p>
          </div>

          <div>
            <label className={labelClass}>{tr('Actual Cash (Counted)', 'موجودی واقعی (شمارش شده)')}</label>
            <input type="text" inputMode="numeric" value={ccActualAmount} onChange={(e) => setCcActualAmount(e.target.value)} placeholder="0" className={classNames(inputClass, 'text-center text-lg font-black')}/>
          </div>

          {ccActualAmount && (<div className={classNames('rounded-xl border px-4 py-3 text-center text-sm font-bold', cashCountDiff === 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700')}>
              {cashCountDiff === 0
                ? tr('Perfect Match — No discrepancy', 'تراز دقیق — بدون مغایرت')
                : `${tr('Discrepancy', 'مغایرت')}: ${cashCountDiff > 0 ? '+' : ''}${formatNum(cashCountDiff)} ${ccCurrency} (${cashCountDiff > 0 ? tr('Surplus', 'اضافه') : tr('Shortage', 'کسری')})`}
            </div>)}

          <div>
            <label className={labelClass}>{tr('Note', 'یادداشت')}</label>
            <input type="text" value={ccNote} onChange={(e) => setCcNote(e.target.value)} className={inputClass} placeholder={tr('Optional...', 'اختیاری...')}/>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCashCountModal(false)}>{tr('Cancel', 'لغو')}</Button>
            <Button variant="primary" disabled={!ccActualAmount} onClick={handleSubmitCashCount}>
              {tr('Submit Count', 'ثبت شمارش')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── External Income Modal ────────────────────────────── */}
      <Modal isOpen={showExternalIncomeModal} onClose={() => setShowExternalIncomeModal(false)} title={tr('Add External Income', 'افزودن درآمد خارجی')} maxWidthClassName="max-w-md">
        <div className="space-y-4" dir={isEnglish ? 'ltr' : 'rtl'}>
          <InlineAlert tone="info">
            {tr('Record income from outside the pharmacy (e.g. personal deposit, money exchange, transfers).', 'درآمدی که از خارج از داروخانه دریافت شده را ثبت کنید (مثلاً واریز شخصی، صرافی، انتقال پول).')}
          </InlineAlert>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{tr('Amount', 'مبلغ')}</label>
              <input type="text" inputMode="numeric" value={eiAmount} onChange={(e) => setEiAmount(e.target.value)} placeholder="0" className={inputClass}/>
            </div>
            <div>
              <label className={labelClass}>{tr('Currency', 'ارز')}</label>
              <select value={eiCurrency} onChange={(e) => setEiCurrency(e.target.value as TreasuryCurrency)} className={inputClass}>
                {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c} - {isEnglish ? CURRENCY_LABELS[c].en : CURRENCY_LABELS[c].fa}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>{tr('Description', 'تفصیلات')}</label>
            <input type="text" value={eiDescription} onChange={(e) => setEiDescription(e.target.value)} placeholder={tr('e.g. Personal deposit', 'مثلاً واریز شخصی')} className={inputClass}/>
          </div>
          <div>
            <label className={labelClass}>{tr('Note', 'یادداشت')}</label>
            <input type="text" value={eiNote} onChange={(e) => setEiNote(e.target.value)} className={inputClass} placeholder={tr('Optional...', 'اختیاری...')}/>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowExternalIncomeModal(false)}>{tr('Cancel', 'لغو')}</Button>
            <Button variant="primary" disabled={parseAmountInput(eiAmount) <= 0 || !eiDescription.trim()} onClick={handleSubmitExternalIncome}>
              {tr('Add to Treasury', 'افزودن به صندوق')}
            </Button>
          </div>
        </div>
      </Modal>
    </PageSurface>);
};
