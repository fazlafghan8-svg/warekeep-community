import React, { useMemo, useState } from 'react';
import type { AppSettings, AppUser, BatchOwnershipType, Expense, Invoice, Medicine, Partner, PartnerCapitalType, PartnerLedgerEntry, PartnerLedgerEntryType, PartnerProfitRuleType, PartnerSettlementPeriod, PartnerStatus, Purchase } from '@/types';
import { Button } from './ui/Button';
import { EmptyStateShell } from './ui/StateShell';
import { FlatCard, PageSurface, SectionShell } from './ui/Surface';
import { StatusBadge, type StatusBadgeTone } from './ui/StatusBadge';
import { Modal } from './ui/Modal';
import { TabStrip } from './ui/TabStrip';
import { classNames } from '@/utils/classNames';
import { normalizePersianNumbers } from '@/utils/localization';
import { formatAppDate } from '@/lib/formatters';
import { buildPartnerAccountingModel, type PartnerAccountingSummary, type PartnerResolvedLedgerEntry } from '@/utils/partnerAccounting';
type ActiveTab = 'partners' | 'capital' | 'goods' | 'ledger' | 'settlements' | 'reports';
type DialogMode = 'partner' | 'ledger' | 'settlement' | null;
type PartnerFormState = {
    name: string;
    phone: string;
    capitalType: PartnerCapitalType;
    openingCapital: string;
    openingGoodsCapital: string;
    sharePercentage: string;
    profitRuleType: PartnerProfitRuleType;
    storeCommissionPercent: string;
    storeCommissionFixedAmount: string;
    settlementPeriod: PartnerSettlementPeriod;
    status: PartnerStatus;
    notes: string;
};
type LedgerFormState = {
    partnerId: string;
    date: string;
    type: PartnerLedgerEntryType;
    direction: 'in' | 'out';
    amount: string;
    description: string;
};
export interface PartnershipsProps {
    partners: Partner[];
    invoices: Invoice[];
    purchases: Purchase[];
    medicines: Medicine[];
    expenses: Expense[];
    settings: AppSettings;
    activeAppUser?: AppUser | null;
    onAddPartner: (partner: Omit<Partner, 'id'>) => void | Promise<void>;
    onUpdatePartner: (id: string, data: Partial<Partner>) => void | Promise<void>;
    onDeletePartner: (id: string) => void | Promise<void>;
    onAddPartnerLedgerEntry: (partnerId: string, entry: Omit<PartnerLedgerEntry, 'id'>) => void | Promise<void>;
    onOpenPurchases?: () => void;
    onOpenPurchaseEdit?: (purchaseId: string) => void;
    readOnly?: boolean;
}
const todayInput = () => new Date().toISOString().split('T')[0];
const createPartnerForm = (): PartnerFormState => ({
    name: '',
    phone: '',
    capitalType: 'cash',
    openingCapital: '0',
    openingGoodsCapital: '0',
    sharePercentage: '0',
    profitRuleType: 'own_goods_100',
    storeCommissionPercent: '0',
    storeCommissionFixedAmount: '0',
    settlementPeriod: 'monthly',
    status: 'active',
    notes: '',
});
const createPartnerFormFromPartner = (partner: Partner): PartnerFormState => ({
    name: partner.name || '',
    phone: partner.phone || '',
    capitalType: partner.capitalType || 'cash',
    openingCapital: String(partner.openingCapital || 0),
    openingGoodsCapital: String(partner.openingGoodsCapital || 0),
    sharePercentage: String(partner.profitRule?.sharePercentage ?? partner.sharePercentage ?? 0),
    profitRuleType: partner.profitRule?.type || 'own_goods_100',
    storeCommissionPercent: String(partner.profitRule?.storeCommissionPercent || 0),
    storeCommissionFixedAmount: String(partner.profitRule?.storeCommissionFixedAmount || 0),
    settlementPeriod: partner.settlementPeriod || 'monthly',
    status: partner.status || 'active',
    notes: partner.notes || '',
});
const createLedgerForm = (partnerId = ''): LedgerFormState => ({
    partnerId,
    date: todayInput(),
    type: 'withdrawal',
    direction: 'out',
    amount: '',
    description: '',
});
const parseAmountInput = (value: string): number => {
    const normalized = normalizePersianNumbers(value || '').replace(/,/g, '').trim();
    if (!normalized)
        return 0;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : 0;
};
const statusTone = (status?: PartnerStatus): StatusBadgeTone => {
    if (status === 'active')
        return 'success';
    if (status === 'settled')
        return 'info';
    return 'neutral';
};
const ownershipTone = (ownership?: BatchOwnershipType): StatusBadgeTone => {
    if (ownership === 'partner')
        return 'info';
    if (ownership === 'consignment')
        return 'warning';
    if (ownership === 'shared')
        return 'success';
    return 'neutral';
};
const capitalTypeLabel = (type?: PartnerCapitalType, isEnglish = false) => {
    const labels: Record<PartnerCapitalType, {
        en: string;
        fa: string;
    }> = {
        cash: { en: 'Cash', fa: 'سرمایه نقدی' },
        goods: { en: 'Goods / medicine', fa: 'سرمایه جنسی/دوا' },
        mixed: { en: 'Cash + goods', fa: 'نقد + دوا' },
        consignment: { en: 'Consignment', fa: 'جنس امانی' },
        general_profit_share: { en: 'General profit share', fa: 'شریک درصدی مفاد' },
    };
    const key = type || 'cash';
    return isEnglish ? labels[key].en : labels[key].fa;
};
const profitRuleLabel = (type?: PartnerProfitRuleType, isEnglish = false) => {
    const labels: Record<PartnerProfitRuleType, {
        en: string;
        fa: string;
    }> = {
        own_goods_100: { en: '100% own goods profit', fa: '۱۰۰٪ مفاد جنس خودش' },
        share_percentage: { en: 'By share %', fa: 'تقسیم بر اساس فیصدی' },
        store_commission_percent: { en: 'Store commission %', fa: 'کمیشن درصدی دکان' },
        store_commission_fixed: { en: 'Fixed store commission', fa: 'کمیشن ثابت دکان' },
        general_profit_share: { en: 'General shop profit', fa: 'مفاد عمومی دکان' },
        custom: { en: 'Custom', fa: 'قانون سفارشی' },
    };
    const key = type || 'own_goods_100';
    return isEnglish ? labels[key].en : labels[key].fa;
};
const ledgerTypeLabel = (type: PartnerLedgerEntryType, isEnglish = false) => {
    const labels: Record<PartnerLedgerEntryType, {
        en: string;
        fa: string;
    }> = {
        capital_in: { en: 'Cash capital', fa: 'سرمایه نقدی' },
        goods_capital: { en: 'Goods capital', fa: 'سرمایه جنسی' },
        goods_received: { en: 'Goods received', fa: 'ورود دوا' },
        sale_revenue: { en: 'Sale', fa: 'فروش' },
        cost_of_goods_sold: { en: 'Cost', fa: 'قیمت تمام‌شده' },
        gross_profit: { en: 'Gross profit', fa: 'مفاد ناخالص' },
        partner_profit_share: { en: 'Partner share', fa: 'سهم شریک' },
        store_profit_share: { en: 'Store share', fa: 'سهم دکان' },
        payment: { en: 'Payment', fa: 'پرداخت' },
        withdrawal: { en: 'Withdrawal', fa: 'برداشت' },
        expense_share: { en: 'Expense share', fa: 'سهم مصرف' },
        profit_share: { en: 'Profit share', fa: 'تقسیم مفاد' },
        sales_return: { en: 'Sales return', fa: 'برگشتی فروش' },
        waste: { en: 'Waste', fa: 'ضایعات' },
        expired_stock: { en: 'Expired stock', fa: 'تاریخ‌گذشته' },
        adjustment: { en: 'Adjustment', fa: 'تعدیل' },
        settlement: { en: 'Settlement', fa: 'تسویه' },
    };
    return isEnglish ? labels[type].en : labels[type].fa;
};
const ownershipLabel = (ownership?: BatchOwnershipType, isEnglish = false) => {
    const labels: Record<BatchOwnershipType, {
        en: string;
        fa: string;
    }> = {
        store: { en: 'Store', fa: 'دکان' },
        partner: { en: 'Partner', fa: 'شریک' },
        shared: { en: 'Shared', fa: 'مشترک' },
        consignment: { en: 'Consignment', fa: 'امانی' },
    };
    const key = ownership || 'store';
    return isEnglish ? labels[key].en : labels[key].fa;
};
const compactText = (value: string, fallback = '-') => value.trim() || fallback;
export const Partnerships: React.FC<PartnershipsProps> = ({ partners, invoices, purchases, medicines, expenses, settings, activeAppUser, onAddPartner, onUpdatePartner, onDeletePartner, onAddPartnerLedgerEntry, onOpenPurchases, onOpenPurchaseEdit, readOnly = false, }) => {
    const isEnglish = settings.language === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const currencyCode = settings.currencySettings?.baseCurrency || 'AFN';
    const numberLocale = isEnglish ? 'en-US' : 'fa-AF-u-nu-arabext';
    const canManage = !readOnly && (!activeAppUser || activeAppUser.role === 'admin' || activeAppUser.permissions.includes('manage_partnerships'));
    const canOpenPurchaseEditor = !readOnly && Boolean(onOpenPurchaseEdit) && (!activeAppUser || activeAppUser.role === 'admin' || activeAppUser.permissions.includes('manage_purchases') || activeAppUser.permissions.includes('manage_inventory') || activeAppUser.permissions.includes('manage_partnerships'));
    const [activeTab, setActiveTab] = useState<ActiveTab>('partners');
    const [dialogMode, setDialogMode] = useState<DialogMode>(null);
    const [editingPartnerId, setEditingPartnerId] = useState('');
    const [selectedPartnerId, setSelectedPartnerId] = useState('');
    const [partnerForm, setPartnerForm] = useState<PartnerFormState>(createPartnerForm);
    const [ledgerForm, setLedgerForm] = useState<LedgerFormState>(createLedgerForm);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | PartnerStatus>('all');
    const [typeFilter, setTypeFilter] = useState<'all' | PartnerCapitalType>('all');
    const [ownershipFilter, setOwnershipFilter] = useState<'all' | BatchOwnershipType>('all');
    const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 0, ...options }).format(Number.isFinite(value) ? value : 0);
    const formatMoney = (value: number) => `${formatNumber(Math.round(Number.isFinite(value) ? value : 0))} ${currencyCode}`;
    const formatDecimal = (value: number) => new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 3 }).format(Number.isFinite(value) ? value : 0);
    const formatDate = (value?: string) => value ? formatAppDate(value, settings, 'reports') : '-';
    const accounting = useMemo(() => buildPartnerAccountingModel({
        partners,
        invoices,
        purchases,
        medicines,
        expenses,
        language: settings.language,
    }), [expenses, invoices, medicines, partners, purchases, settings.language]);
    const partnerById = useMemo(() => new Map(partners.filter((partner) => !partner.isDeleted).map((partner) => [partner.id, partner])), [partners]);
    const editablePurchaseById = useMemo(() => new Map(purchases.filter((purchase) => !purchase.isDeleted).map((purchase) => [purchase.id, purchase])), [purchases]);
    const selectedSummary = useMemo(() => {
        if (selectedPartnerId) {
            return accounting.summaries.find((summary) => summary.partner.id === selectedPartnerId) || null;
        }
        return accounting.summaries[0] || null;
    }, [accounting.summaries, selectedPartnerId]);
    const selectedPurchaseDocuments = useMemo(() => {
        const partnerId = selectedSummary?.partner.id || '';
        if (!partnerId)
            return [];
        const seenPurchaseIds = new Set<string>();
        return accounting.contributionRows
            .filter((row) => row.partnerId === partnerId && editablePurchaseById.has(row.purchaseId))
            .sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime())
            .flatMap((row) => {
            if (seenPurchaseIds.has(row.purchaseId))
                return [];
            const purchase = editablePurchaseById.get(row.purchaseId);
            if (!purchase)
                return [];
            seenPurchaseIds.add(row.purchaseId);
            return [{ row, purchase }];
        })
            .slice(0, 4);
    }, [accounting.contributionRows, editablePurchaseById, selectedSummary?.partner.id]);
    const normalizedSearch = search.trim().toLowerCase();
    const filteredSummaries = accounting.summaries.filter((summary) => {
        if (statusFilter !== 'all' && summary.partner.status !== statusFilter)
            return false;
        if (typeFilter !== 'all' && summary.capitalType !== typeFilter)
            return false;
        if (!normalizedSearch)
            return true;
        return [
            summary.partner.name,
            summary.partner.phone,
            summary.partner.notes,
            capitalTypeLabel(summary.capitalType, false),
            capitalTypeLabel(summary.capitalType, true),
        ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
    const filteredGoodsRows = accounting.medicineRows.filter((row) => {
        if (ownershipFilter !== 'all' && row.ownershipType !== ownershipFilter)
            return false;
        if (!normalizedSearch)
            return true;
        return [row.partnerName, row.medicineName, row.batchNumber]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
    const visibleLedgerEntries = useMemo(() => {
        const partnerId = selectedSummary?.partner.id || '';
        if (!partnerId)
            return [] as PartnerResolvedLedgerEntry[];
        return accounting.ledgerByPartnerId.get(partnerId) || [];
    }, [accounting.ledgerByPartnerId, selectedSummary?.partner.id]);
    const openPartnerDialog = (partner?: Partner) => {
        if (partner) {
            setSelectedPartnerId(partner.id);
            setEditingPartnerId(partner.id);
            setPartnerForm(createPartnerFormFromPartner(partner));
        }
        else {
            setEditingPartnerId('');
            setPartnerForm(createPartnerForm());
        }
        setDialogMode('partner');
    };
    const openPartnerDetails = (partnerId: string) => {
        setSelectedPartnerId(partnerId);
        setActiveTab('ledger');
    };
    const openLedgerDialog = (partnerId?: string) => {
        const targetPartnerId = partnerId || selectedSummary?.partner.id || '';
        setLedgerForm(createLedgerForm(targetPartnerId));
        setDialogMode('ledger');
    };
    const openSettlementDialog = (partnerId?: string) => {
        const targetPartnerId = partnerId || selectedSummary?.partner.id || '';
        if (targetPartnerId)
            setSelectedPartnerId(targetPartnerId);
        setDialogMode('settlement');
    };
    const openPurchaseEditor = (purchaseId?: string) => {
        if (!purchaseId || !editablePurchaseById.has(purchaseId) || !canOpenPurchaseEditor)
            return;
        onOpenPurchaseEdit?.(purchaseId);
    };
    const closeDialog = () => {
        setDialogMode(null);
        setEditingPartnerId('');
    };
    const handlePartnerSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canManage || !partnerForm.name.trim())
            return;
        const nowIso = new Date().toISOString();
        const sharePercentage = parseAmountInput(partnerForm.sharePercentage);
        const payload: Omit<Partner, 'id'> = {
            name: partnerForm.name.trim(),
            phone: partnerForm.phone.trim(),
            capitalType: partnerForm.capitalType,
            openingCapital: parseAmountInput(partnerForm.openingCapital),
            openingGoodsCapital: parseAmountInput(partnerForm.openingGoodsCapital),
            sharePercentage,
            profitRule: {
                type: partnerForm.profitRuleType,
                sharePercentage,
                storeCommissionPercent: parseAmountInput(partnerForm.storeCommissionPercent),
                storeCommissionFixedAmount: parseAmountInput(partnerForm.storeCommissionFixedAmount),
            },
            settlementPeriod: partnerForm.settlementPeriod,
            status: partnerForm.status,
            notes: partnerForm.notes.trim(),
            documents: [],
            ledger: editingPartnerId ? (partnerById.get(editingPartnerId)?.ledger || []) : [],
            createdAt: editingPartnerId ? partnerById.get(editingPartnerId)?.createdAt : nowIso,
            updatedAt: nowIso,
        };
        if (editingPartnerId) {
            await onUpdatePartner(editingPartnerId, payload);
            setSelectedPartnerId(editingPartnerId);
        }
        else {
            await onAddPartner(payload);
        }
        closeDialog();
    };
    const handleLedgerSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canManage || !ledgerForm.partnerId)
            return;
        const amount = parseAmountInput(ledgerForm.amount);
        if (amount <= 0)
            return;
        await onAddPartnerLedgerEntry(ledgerForm.partnerId, {
            date: ledgerForm.date || todayInput(),
            type: ledgerForm.type,
            direction: ledgerForm.direction,
            amount,
            debit: ledgerForm.direction === 'out' ? amount : 0,
            credit: ledgerForm.direction === 'in' ? amount : 0,
            source: 'partner',
            description: ledgerForm.description.trim() || ledgerTypeLabel(ledgerForm.type, isEnglish),
            recordedBy: activeAppUser?.name,
        });
        setSelectedPartnerId(ledgerForm.partnerId);
        closeDialog();
    };
    const handleSettlementPost = async () => {
        const preview = selectedSummary ? accounting.settlementPreviews.get(selectedSummary.partner.id) : null;
        if (!canManage || !selectedSummary || !preview)
            return;
        const amount = preview.payableAmount > 0 ? preview.payableAmount : preview.receivableAmount;
        if (amount <= 0)
            return;
        await onAddPartnerLedgerEntry(selectedSummary.partner.id, {
            date: todayInput(),
            type: 'settlement',
            direction: preview.payableAmount > 0 ? 'out' : 'in',
            amount,
            debit: preview.payableAmount > 0 ? amount : 0,
            credit: preview.payableAmount > 0 ? 0 : amount,
            source: 'settlement',
            description: preview.payableAmount > 0 ? 'تسویه پرداخت به شریک' : 'تسویه دریافت از شریک',
            recordedBy: activeAppUser?.name,
            metadata: {
                fromDate: preview.fromDate,
                toDate: preview.toDate,
                finalBalance: preview.finalBalance,
            },
        });
        closeDialog();
    };
    const renderPartnerTable = (rows: PartnerAccountingSummary[]) => (<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-3 text-right font-black">{tr('Partner', 'شریک')}</th>
            <th className="hidden px-3 py-3 text-center font-black md:table-cell">{tr('Type', 'نوع')}</th>
            <th className="hidden px-3 py-3 text-center font-black lg:table-cell">{tr('Goods value', 'ارزش جنس')}</th>
            <th className="hidden px-3 py-3 text-center font-black md:table-cell">{tr('Sales', 'فروش')}</th>
            <th className="px-3 py-3 text-center font-black">{tr('Balance', 'بیلانس')}</th>
            <th className="w-[112px] px-3 py-3 text-center font-black">{tr('Action', 'اقدام')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((summary) => (<tr key={summary.partner.id} className={classNames('align-top hover:bg-slate-50', selectedSummary?.partner.id === summary.partner.id && 'bg-brand-50/45')}>
              <td className="px-3 py-3">
                <button type="button" className="text-right font-black text-slate-950 hover:text-brand-700" onClick={() => setSelectedPartnerId(summary.partner.id)}>
                  {summary.partner.name}
                </button>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge tone={statusTone(summary.partner.status)}>{summary.partner.status === 'settled' ? tr('Settled', 'تسویه‌شده') : summary.partner.status === 'inactive' ? tr('Inactive', 'غیرفعال') : tr('Active', 'فعال')}</StatusBadge>
                  <StatusBadge tone="info">{capitalTypeLabel(summary.capitalType, isEnglish)}</StatusBadge>
                </div>
                <p className="mt-2 truncate text-xs font-semibold text-slate-500">{compactText(summary.partner.phone || summary.partner.notes || '')}</p>
              </td>
              <td className="hidden px-3 py-3 text-center font-semibold text-slate-600 md:table-cell">{profitRuleLabel(summary.profitRule.type, isEnglish)}</td>
              <td className="hidden px-3 py-3 text-center font-black text-indigo-700 lg:table-cell">{formatMoney(summary.goodsCapital)}</td>
              <td className="hidden px-3 py-3 text-center font-black text-emerald-700 md:table-cell">{formatMoney(summary.salesTotal)}</td>
              <td className={classNames('px-3 py-3 text-center font-black', summary.finalBalance >= 0 ? 'text-slate-950' : 'text-rose-700')}>
                {formatMoney(summary.finalBalance)}
              </td>
              <td className="px-3 py-3">
                <div className="flex justify-center gap-1.5">
                  <Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); openPartnerDetails(summary.partner.id); }}>{tr('Open', 'دیدن')}</Button>
                  <Button size="sm" variant="ghost" disabled={!canManage} onClick={(event) => { event.stopPropagation(); openPartnerDialog(summary.partner); }}>{tr('Edit', 'ویرایش')}</Button>
                </div>
              </td>
            </tr>))}
          {rows.length === 0 ? (<tr>
              <td colSpan={6} className="px-3 py-8">
                <EmptyStateShell title={tr('No partner was found', 'هیچ شریکی ثبت نشده است')} description={tr('Add the first partner to get started.', 'برای شروع، اولین شریک را اضافه کنید.')} className="py-6"/>
              </td>
            </tr>) : null}
        </tbody>
      </table>
    </div>);
    return (<PageSurface className="min-h-full space-y-4 p-3 sm:p-4 md:p-6" dir={isEnglish ? 'ltr' : 'rtl'}>
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-950">{tr('Partnerships', 'شرکات')}</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">{tr('Capital, goods, ledger, settlements.', 'سرمایه، دوا، ledger و تسویه.')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={!canManage} onClick={() => openLedgerDialog()}>{tr('Cash entry', 'ثبت سرمایه نقدی')}</Button>
          <Button variant="secondary" size="sm" onClick={onOpenPurchases} disabled={!canManage || !onOpenPurchases}>{tr('Partner goods', 'ثبت دوا به نام شریک')}</Button>
          <Button variant="secondary" size="sm" disabled={!selectedSummary} onClick={() => openSettlementDialog()}>{tr('Settlement', 'تسویه حساب')}</Button>
          <Button variant="primary" size="sm" disabled={!canManage} onClick={() => openPartnerDialog()}>{tr('Add partner', 'افزودن شریک')}</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label={tr('Partners', 'تعداد شرکا')} value={formatNumber(accounting.totals.partnerCount)}/>
        <MetricCard label={tr('Total capital', 'سرمایه کل')} value={formatMoney(accounting.totals.totalCapital)} tone="border-sky-200 bg-sky-50 text-sky-900"/>
        <MetricCard label={tr('Goods value', 'ارزش جنس شرکا')} value={formatMoney(accounting.totals.goodsCapital)} tone="border-indigo-200 bg-indigo-50 text-indigo-900"/>
        <MetricCard label={tr('Payable profit', 'مفاد قابل پرداخت')} value={formatMoney(accounting.totals.partnerShare)} tone="border-emerald-200 bg-emerald-50 text-emerald-900"/>
        <MetricCard label={tr('Total balance', 'بیلانس کل')} value={formatMoney(accounting.totals.ledgerBalance)} tone={accounting.totals.ledgerBalance >= 0 ? 'border-slate-200 bg-white text-slate-900' : 'border-rose-200 bg-rose-50 text-rose-900'}/>
      </div>

      {(accounting.unassigned.purchaseTotal > 0 || accounting.unassigned.salesTotal > 0 || accounting.unassigned.stockValue > 0) ? (<SectionShell className="rounded-2xl border-amber-200 bg-amber-50 p-3 text-amber-900">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="text-sm font-black">{tr('Unassigned stock exists.', 'موجودی بدون مالک ثبت شده است.')}</p>
            <div className="flex flex-wrap gap-2 text-xs font-black">
              <span>{tr('Purchase', 'خرید')}: {formatMoney(accounting.unassigned.purchaseTotal)}</span>
              <span>{tr('Sales', 'فروش')}: {formatMoney(accounting.unassigned.salesTotal)}</span>
              <span>{tr('Stock', 'موجودی')}: {formatMoney(accounting.unassigned.stockValue)}</span>
            </div>
          </div>
        </SectionShell>) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3">
            <TabStrip compact ariaLabel={tr('Partnership sections', 'بخش‌های شرکات')} items={[
            { id: 'partners', label: tr('Partners', 'شرکا'), active: activeTab === 'partners', onClick: () => setActiveTab('partners') },
            { id: 'capital', label: tr('Capital', 'سرمایه‌ها'), active: activeTab === 'capital', onClick: () => setActiveTab('capital') },
            { id: 'goods', label: tr('Goods', 'جنس/دواها'), active: activeTab === 'goods', onClick: () => setActiveTab('goods') },
            { id: 'ledger', label: tr('Ledger', 'دفتر شرکا'), active: activeTab === 'ledger', onClick: () => setActiveTab('ledger') },
            { id: 'settlements', label: tr('Settlement', 'تسویه حساب'), active: activeTab === 'settlements', onClick: () => setActiveTab('settlements') },
            { id: 'reports', label: tr('Reports', 'گزارش‌ها'), active: activeTab === 'reports', onClick: () => setActiveTab('reports') },
        ]}/>

            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_160px_160px]">
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="wk-input" placeholder={tr('Search partner, medicine, batch', 'جستجوی شریک، دوا، batch')}/>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | PartnerCapitalType)} className="wk-select">
                <option value="all">{tr('All types', 'همه نوع‌ها')}</option>
                <option value="cash">{capitalTypeLabel('cash', isEnglish)}</option>
                <option value="goods">{capitalTypeLabel('goods', isEnglish)}</option>
                <option value="mixed">{capitalTypeLabel('mixed', isEnglish)}</option>
                <option value="consignment">{capitalTypeLabel('consignment', isEnglish)}</option>
                <option value="general_profit_share">{capitalTypeLabel('general_profit_share', isEnglish)}</option>
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | PartnerStatus)} className="wk-select">
                <option value="all">{tr('All statuses', 'همه وضعیت‌ها')}</option>
                <option value="active">{tr('Active', 'فعال')}</option>
                <option value="inactive">{tr('Inactive', 'غیرفعال')}</option>
                <option value="settled">{tr('Settled', 'تسویه‌شده')}</option>
              </select>
              <select value={ownershipFilter} onChange={(event) => setOwnershipFilter(event.target.value as 'all' | BatchOwnershipType)} className="wk-select">
                <option value="all">{tr('All batches', 'همه batchها')}</option>
                <option value="store">{ownershipLabel('store', isEnglish)}</option>
                <option value="partner">{ownershipLabel('partner', isEnglish)}</option>
                <option value="shared">{ownershipLabel('shared', isEnglish)}</option>
                <option value="consignment">{ownershipLabel('consignment', isEnglish)}</option>
              </select>
            </div>
          </div>

          {activeTab === 'partners' ? renderPartnerTable(filteredSummaries) : null}

          {activeTab === 'capital' ? (<div className="grid gap-3 md:grid-cols-2">
              {filteredSummaries.map((summary) => (<FlatCard key={summary.partner.id} className="rounded-2xl border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-black text-slate-950">{summary.partner.name}</h2>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{capitalTypeLabel(summary.capitalType, isEnglish)}</p>
                    </div>
                    <StatusBadge tone={statusTone(summary.partner.status)}>{summary.partner.status}</StatusBadge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <MiniStat label={tr('Cash', 'نقدی')} value={formatMoney(summary.cashCapital)}/>
                    <MiniStat label={tr('Goods', 'جنسی')} value={formatMoney(summary.goodsCapital)}/>
                    <MiniStat label={tr('Remaining stock', 'موجودی باقی')} value={formatMoney(summary.stockValue)}/>
                    <MiniStat label={tr('Partner share', 'سهم شریک')} value={formatMoney(summary.partnerShare)}/>
                  </div>
                </FlatCard>))}
            </div>) : null}

          {activeTab === 'goods' ? (<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-3 text-right font-black">{tr('Medicine', 'دوا')}</th>
                    <th className="hidden px-3 py-3 text-center font-black md:table-cell">batch</th>
                    <th className="px-3 py-3 text-center font-black">{tr('Qty', 'تعداد')}</th>
                    <th className="hidden px-3 py-3 text-center font-black lg:table-cell">{tr('Owner', 'مالک')}</th>
                    <th className="px-3 py-3 text-center font-black">{tr('Value', 'ارزش')}</th>
                    <th className="w-[132px] px-3 py-3 text-center font-black">{tr('Action', 'اقدام')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredGoodsRows.map((row) => {
                const sourcePurchase = row.purchaseId ? editablePurchaseById.get(row.purchaseId) : null;
                return (<tr key={row.batchId} className="align-top hover:bg-slate-50">
                        <td className="px-3 py-3">
                          <p className="font-black text-slate-950">{row.medicineName}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">{row.partnerName}</p>
                          {sourcePurchase ? (<p className="mt-1 text-xs font-semibold text-slate-500">
                              {tr('Invoice', 'فاکتور')}: {sourcePurchase.invoiceNumber || sourcePurchase.id.slice(-6)}
                            </p>) : null}
                        </td>
                        <td className="hidden px-3 py-3 text-center font-semibold text-slate-600 md:table-cell">{row.batchNumber}</td>
                        <td className="px-3 py-3 text-center font-black text-slate-800">{formatDecimal(row.quantity)}</td>
                        <td className="hidden px-3 py-3 text-center lg:table-cell"><StatusBadge tone={ownershipTone(row.ownershipType)}>{ownershipLabel(row.ownershipType, isEnglish)}</StatusBadge></td>
                        <td className="px-3 py-3 text-center font-black text-indigo-700">{formatMoney(row.stockValue)}</td>
                        <td className="px-3 py-3 text-center">
                          <Button size="sm" variant="ghost" disabled={!sourcePurchase || !canOpenPurchaseEditor} onClick={() => openPurchaseEditor(sourcePurchase?.id)}>
                            {tr('Edit invoice', 'ویرایش فاکتور')}
                          </Button>
                        </td>
                      </tr>);
            })}
                  {filteredGoodsRows.length === 0 ? (<tr><td colSpan={6} className="px-3 py-8"><EmptyStateShell title={tr('No partner goods', 'دوا/جنس شریک ثبت نشده است')} description={tr('Use Purchases to register stock under a partner.', 'از بخش خرید، دوا را به نام شریک ثبت کنید.')} className="py-6"/></td></tr>) : null}
                </tbody>
              </table>
            </div>) : null}

          {activeTab === 'ledger' ? (<LedgerPanel entries={visibleLedgerEntries} formatDate={formatDate} formatMoney={formatMoney} isEnglish={isEnglish} tr={tr} onAdd={() => openLedgerDialog(selectedSummary?.partner.id)} canManage={canManage}/>) : null}

          {activeTab === 'settlements' ? (<div className="grid gap-3 md:grid-cols-2">
              {filteredSummaries.map((summary) => {
                const preview = accounting.settlementPreviews.get(summary.partner.id);
                return (<FlatCard key={summary.partner.id} className="rounded-2xl border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-black text-slate-950">{summary.partner.name}</h2>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{summary.partner.settlementPeriod || 'monthly'}</p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => openSettlementDialog(summary.partner.id)} disabled={!preview}>{tr('Settle', 'تسویه')}</Button>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <MiniStat label={tr('Sales', 'فروش')} value={formatMoney(preview?.salesTotal || 0)}/>
                      <MiniStat label={tr('Cost', 'تمام‌شده')} value={formatMoney(preview?.costTotal || 0)}/>
                      <MiniStat label={tr('Partner share', 'سهم شریک')} value={formatMoney(preview?.partnerShare || 0)}/>
                      <MiniStat label={tr('Final balance', 'بیلانس نهایی')} value={formatMoney(preview?.finalBalance || 0)}/>
                    </div>
                  </FlatCard>);
            })}
            </div>) : null}

          {activeTab === 'reports' ? (<div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <ReportTile label={tr('Partner comparison', 'مقایسه شرکا')} value={formatNumber(filteredSummaries.length)}/>
                <ReportTile label={tr('Partner batches', 'batchهای شرکا')} value={formatNumber(accounting.batchRows.length)}/>
                <ReportTile label={tr('Expiring partner stock', 'دواهای نزدیک انقضا')} value={formatNumber(accounting.summaries.reduce((sum, item) => sum + item.expiringSoonCount, 0))}/>
              </div>
              {renderPartnerTable(filteredSummaries)}
            </div>) : null}
        </div>

        <aside className="space-y-3">
          {selectedSummary ? (<FlatCard className="rounded-2xl border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-black text-slate-950">{selectedSummary.partner.name}</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{compactText(selectedSummary.partner.phone || '')}</p>
                </div>
                <StatusBadge tone={statusTone(selectedSummary.partner.status)}>{selectedSummary.partner.status}</StatusBadge>
              </div>
              <div className="mt-4 space-y-2">
                <MiniStat label={tr('Final balance', 'بیلانس نهایی')} value={formatMoney(selectedSummary.finalBalance)}/>
                <MiniStat label={tr('Payable', 'قابل پرداخت')} value={formatMoney(selectedSummary.payableAmount)}/>
                <MiniStat label={tr('Remaining stock', 'موجودی باقی‌مانده')} value={formatMoney(selectedSummary.stockValue)}/>
                <MiniStat label={tr('Gross profit', 'مفاد ناخالص')} value={formatMoney(selectedSummary.grossProfit)}/>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => openPartnerDetails(selectedSummary.partner.id)}>{tr('View ledger', 'مشاهده ledger')}</Button>
                <Button size="sm" variant="ghost" disabled={!canManage} onClick={(event) => { event.stopPropagation(); openPartnerDialog(selectedSummary.partner); }}>{tr('Edit', 'ویرایش')}</Button>
                <Button size="sm" variant="danger" disabled={!canManage} onClick={() => void onDeletePartner(selectedSummary.partner.id)}>{tr('Archive', 'غیرفعال')}</Button>
              </div>
              {selectedPurchaseDocuments.length ? (<div className="mt-4 border-t border-slate-200 pt-4">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">{tr('Purchase invoices', 'فاکتورهای خرید')}</p>
                  <div className="mt-2 space-y-2">
                    {selectedPurchaseDocuments.map(({ row, purchase }) => (<div key={purchase.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-900">{purchase.invoiceNumber || row.sourceDocumentNumber || purchase.id.slice(-6)}</p>
                          <p className="truncate text-xs font-semibold text-slate-500">{formatDate(row.date)} - {formatMoney(row.lineValue)}</p>
                        </div>
                        <Button size="sm" variant="ghost" disabled={!canOpenPurchaseEditor} onClick={() => openPurchaseEditor(purchase.id)}>
                          {tr('Edit', 'ویرایش')}
                        </Button>
                      </div>))}
                  </div>
                </div>) : null}
            </FlatCard>) : (<FlatCard className="rounded-2xl border-slate-200 bg-white p-4">
              <EmptyStateShell title={tr('No partner selected', 'شریکی انتخاب نشده است')} description={tr('Select a partner from the list.', 'از لیست یک شریک را انتخاب کنید.')} className="py-6"/>
            </FlatCard>)}
        </aside>
      </div>

      <Modal isOpen={dialogMode === 'partner'} onClose={closeDialog} title={editingPartnerId ? tr('Edit partner', 'ویرایش شریک') : tr('Add partner', 'افزودن شریک')} maxWidthClassName="max-w-3xl">
        <form onSubmit={handlePartnerSubmit} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={tr('Name', 'نام شریک')}><input value={partnerForm.name} onChange={(event) => setPartnerForm((current) => ({ ...current, name: event.target.value }))} className="wk-input" disabled={!canManage} required/></Field>
            <Field label={tr('Phone', 'تلفن')}><input value={partnerForm.phone} onChange={(event) => setPartnerForm((current) => ({ ...current, phone: event.target.value }))} className="wk-input wk-ltr-data" disabled={!canManage}/></Field>
            <Field label={tr('Capital type', 'نوع سرمایه')}><select value={partnerForm.capitalType} onChange={(event) => setPartnerForm((current) => ({ ...current, capitalType: event.target.value as PartnerCapitalType }))} className="wk-select" disabled={!canManage}>
              <option value="cash">{capitalTypeLabel('cash', isEnglish)}</option>
              <option value="goods">{capitalTypeLabel('goods', isEnglish)}</option>
              <option value="mixed">{capitalTypeLabel('mixed', isEnglish)}</option>
              <option value="consignment">{capitalTypeLabel('consignment', isEnglish)}</option>
              <option value="general_profit_share">{capitalTypeLabel('general_profit_share', isEnglish)}</option>
            </select></Field>
            <Field label={tr('Status', 'وضعیت')}><select value={partnerForm.status} onChange={(event) => setPartnerForm((current) => ({ ...current, status: event.target.value as PartnerStatus }))} className="wk-select" disabled={!canManage}>
              <option value="active">{tr('Active', 'فعال')}</option>
              <option value="inactive">{tr('Inactive', 'غیرفعال')}</option>
              <option value="settled">{tr('Settled', 'تسویه‌شده')}</option>
            </select></Field>
            <Field label={tr('Opening cash', 'سرمایه نقدی ابتدایی')}><input value={partnerForm.openingCapital} onChange={(event) => setPartnerForm((current) => ({ ...current, openingCapital: normalizePersianNumbers(event.target.value) }))} className="wk-input wk-ltr-data" disabled={!canManage}/></Field>
            <Field label={tr('Opening goods value', 'ارزش سرمایه جنسی ابتدایی')}><input value={partnerForm.openingGoodsCapital} onChange={(event) => setPartnerForm((current) => ({ ...current, openingGoodsCapital: normalizePersianNumbers(event.target.value) }))} className="wk-input wk-ltr-data" disabled={!canManage}/></Field>
            <Field label={tr('Profit rule', 'قانون تقسیم مفاد')}><select value={partnerForm.profitRuleType} onChange={(event) => setPartnerForm((current) => ({ ...current, profitRuleType: event.target.value as PartnerProfitRuleType }))} className="wk-select" disabled={!canManage}>
              <option value="own_goods_100">{profitRuleLabel('own_goods_100', isEnglish)}</option>
              <option value="share_percentage">{profitRuleLabel('share_percentage', isEnglish)}</option>
              <option value="store_commission_percent">{profitRuleLabel('store_commission_percent', isEnglish)}</option>
              <option value="store_commission_fixed">{profitRuleLabel('store_commission_fixed', isEnglish)}</option>
              <option value="general_profit_share">{profitRuleLabel('general_profit_share', isEnglish)}</option>
              <option value="custom">{profitRuleLabel('custom', isEnglish)}</option>
            </select></Field>
            <Field label={tr('Share %', 'فیصدی سهم')}><input value={partnerForm.sharePercentage} onChange={(event) => setPartnerForm((current) => ({ ...current, sharePercentage: normalizePersianNumbers(event.target.value) }))} className="wk-input wk-ltr-data" disabled={!canManage}/></Field>
            <Field label={tr('Store commission %', 'کمیشن درصدی دکان')}><input value={partnerForm.storeCommissionPercent} onChange={(event) => setPartnerForm((current) => ({ ...current, storeCommissionPercent: normalizePersianNumbers(event.target.value) }))} className="wk-input wk-ltr-data" disabled={!canManage}/></Field>
            <Field label={tr('Fixed commission', 'کمیشن ثابت')}><input value={partnerForm.storeCommissionFixedAmount} onChange={(event) => setPartnerForm((current) => ({ ...current, storeCommissionFixedAmount: normalizePersianNumbers(event.target.value) }))} className="wk-input wk-ltr-data" disabled={!canManage}/></Field>
            <Field label={tr('Settlement period', 'دوره تسویه')}><select value={partnerForm.settlementPeriod} onChange={(event) => setPartnerForm((current) => ({ ...current, settlementPeriod: event.target.value as PartnerSettlementPeriod }))} className="wk-select" disabled={!canManage}>
              <option value="daily">{tr('Daily', 'روزانه')}</option>
              <option value="weekly">{tr('Weekly', 'هفتگی')}</option>
              <option value="monthly">{tr('Monthly', 'ماهانه')}</option>
              <option value="custom">{tr('Custom', 'سفارشی')}</option>
            </select></Field>
          </div>
          <Field label={tr('Notes', 'یادداشت')}><textarea value={partnerForm.notes} onChange={(event) => setPartnerForm((current) => ({ ...current, notes: event.target.value }))} className="wk-textarea min-h-[88px]" disabled={!canManage}/></Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeDialog}>{tr('Cancel', 'لغو')}</Button>
            <Button type="submit" variant="primary" disabled={!canManage || !partnerForm.name.trim()}>{tr('Save', 'ثبت')}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={dialogMode === 'ledger'} onClose={closeDialog} title={tr('Ledger entry', 'ثبت دفتر حساب')} maxWidthClassName="max-w-2xl">
        <form onSubmit={handleLedgerSubmit} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={tr('Partner', 'شریک')}><select value={ledgerForm.partnerId} onChange={(event) => setLedgerForm((current) => ({ ...current, partnerId: event.target.value }))} className="wk-select" disabled={!canManage} required>
              <option value="">{tr('Select partner', 'انتخاب شریک')}</option>
              {accounting.summaries.map((summary) => <option key={summary.partner.id} value={summary.partner.id}>{summary.partner.name}</option>)}
            </select></Field>
            <Field label={tr('Date', 'تاریخ')}><input type="date" value={ledgerForm.date} onChange={(event) => setLedgerForm((current) => ({ ...current, date: event.target.value }))} className="wk-input wk-date-input" disabled={!canManage}/></Field>
            <Field label={tr('Type', 'نوع')}><select value={ledgerForm.type} onChange={(event) => setLedgerForm((current) => ({ ...current, type: event.target.value as PartnerLedgerEntryType }))} className="wk-select" disabled={!canManage}>
              <option value="capital_in">{ledgerTypeLabel('capital_in', isEnglish)}</option>
              <option value="goods_capital">{ledgerTypeLabel('goods_capital', isEnglish)}</option>
              <option value="payment">{ledgerTypeLabel('payment', isEnglish)}</option>
              <option value="withdrawal">{ledgerTypeLabel('withdrawal', isEnglish)}</option>
              <option value="expense_share">{ledgerTypeLabel('expense_share', isEnglish)}</option>
              <option value="adjustment">{ledgerTypeLabel('adjustment', isEnglish)}</option>
              <option value="settlement">{ledgerTypeLabel('settlement', isEnglish)}</option>
            </select></Field>
            <Field label={tr('Direction', 'جهت')}><select value={ledgerForm.direction} onChange={(event) => setLedgerForm((current) => ({ ...current, direction: event.target.value as 'in' | 'out' }))} className="wk-select" disabled={!canManage}>
              <option value="in">{tr('Credit partner', 'افزایش طلب شریک')}</option>
              <option value="out">{tr('Debit partner', 'کاهش طلب شریک')}</option>
            </select></Field>
            <Field label={tr('Amount', 'مبلغ')}><input value={ledgerForm.amount} onChange={(event) => setLedgerForm((current) => ({ ...current, amount: normalizePersianNumbers(event.target.value) }))} className="wk-input wk-ltr-data" disabled={!canManage}/></Field>
          </div>
          <Field label={tr('Description', 'توضیح')}><textarea value={ledgerForm.description} onChange={(event) => setLedgerForm((current) => ({ ...current, description: event.target.value }))} className="wk-textarea min-h-[88px]" disabled={!canManage}/></Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeDialog}>{tr('Cancel', 'لغو')}</Button>
            <Button type="submit" variant="primary" disabled={!canManage || !ledgerForm.partnerId || parseAmountInput(ledgerForm.amount) <= 0}>{tr('Save ledger', 'ثبت ledger')}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={dialogMode === 'settlement'} onClose={closeDialog} title={tr('Settlement', 'تسویه حساب')} maxWidthClassName="max-w-2xl">
        {selectedSummary ? (<div className="space-y-4">
            <div>
              <h2 className="text-lg font-black text-slate-950">{selectedSummary.partner.name}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">{tr('Preview is calculated from current ledger, sales, returns, and stock.', 'پیش‌نمایش از ledger، فروش، برگشتی و موجودی فعلی حساب شده است.')}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                [tr('Opening capital', 'سرمایه ابتدایی'), selectedSummary.cashCapital],
                [tr('Goods capital', 'سرمایه جنسی'), selectedSummary.goodsCapital],
                [tr('Sales', 'فروش کل'), selectedSummary.salesTotal],
                [tr('Cost', 'قیمت تمام‌شده'), selectedSummary.salesCost],
                [tr('Gross profit', 'مفاد ناخالص'), selectedSummary.grossProfit],
                [tr('Partner share', 'سهم شریک'), selectedSummary.partnerShare],
                [tr('Store share', 'سهم دکان'), selectedSummary.storeShare],
                [tr('Remaining stock', 'موجودی باقی‌مانده'), selectedSummary.stockValue],
                [tr('Payable', 'قابل پرداخت'), selectedSummary.payableAmount],
                [tr('Receivable', 'قابل دریافت'), selectedSummary.receivableAmount],
            ].map(([label, value]) => <MiniStat key={String(label)} label={String(label)} value={formatMoney(Number(value))}/>)}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeDialog}>{tr('Cancel', 'لغو')}</Button>
              <Button variant="primary" onClick={() => void handleSettlementPost()} disabled={!canManage || (selectedSummary.payableAmount <= 0 && selectedSummary.receivableAmount <= 0)}>{tr('Post settlement', 'ثبت تسویه')}</Button>
            </div>
          </div>) : (<EmptyStateShell title={tr('No partner selected', 'شریکی انتخاب نشده است')} description={tr('Select a partner first.', 'اول یک شریک را انتخاب کنید.')} className="py-8"/>)}
      </Modal>
    </PageSurface>);
};
const Field: React.FC<{
    label: string;
    children: React.ReactNode;
}> = ({ label, children }) => (<label className="block text-sm font-black text-slate-600">
    <span className="mb-2 block text-xs text-slate-500">{label}</span>
    {children}
  </label>);
const MetricCard: React.FC<{
    label: string;
    value: string;
    tone?: string;
}> = ({ label, value, tone = 'border-slate-200 bg-white text-slate-900', }) => (<FlatCard className={classNames('min-h-[92px] rounded-2xl border p-3', tone)}>
    <p className="text-xs font-black text-current opacity-65">{label}</p>
    <p className="mt-2 break-words text-xl font-black">{value}</p>
  </FlatCard>);
const MiniStat: React.FC<{
    label: string;
    value: string;
}> = ({ label, value }) => (<div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
    <p className="text-xs font-black text-slate-500">{label}</p>
    <p className="mt-1 break-words text-sm font-black text-slate-950">{value}</p>
  </div>);
const ReportTile: React.FC<{
    label: string;
    value: string;
}> = ({ label, value }) => (<div className="rounded-2xl border border-slate-200 bg-white p-4">
    <p className="text-xs font-black text-slate-500">{label}</p>
    <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
  </div>);
const LedgerPanel: React.FC<{
    entries: PartnerResolvedLedgerEntry[];
    formatDate: (value?: string) => string;
    formatMoney: (value: number) => string;
    isEnglish: boolean;
    tr: (en: string, fa: string) => string;
    onAdd: () => void;
    canManage: boolean;
}> = ({ entries, formatDate, formatMoney, isEnglish, tr, onAdd, canManage }) => (<div className="rounded-2xl border border-slate-200 bg-white">
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-3">
      <h2 className="text-base font-black text-slate-950">{tr('Partner ledger', 'دفتر حساب شریک')}</h2>
      <Button size="sm" variant="secondary" onClick={onAdd} disabled={!canManage}>{tr('Add entry', 'ثبت حرکت')}</Button>
    </div>
    <div className="divide-y divide-slate-100">
      {entries.slice().reverse().map((entry) => (<div key={entry.id} className="grid gap-2 p-3 md:grid-cols-[112px_minmax(0,1fr)_120px_120px_120px] md:items-center">
          <span className="text-xs font-bold text-slate-500">{formatDate(entry.date)}</span>
          <div>
            <p className="font-black text-slate-950">{ledgerTypeLabel(entry.type, isEnglish)}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{entry.description}</p>
          </div>
          <span className="text-sm font-black text-rose-700">{entry.debit > 0 ? formatMoney(entry.debit) : '-'}</span>
          <span className="text-sm font-black text-emerald-700">{entry.credit > 0 ? formatMoney(entry.credit) : '-'}</span>
          <span className="text-sm font-black text-slate-950">{formatMoney(entry.balanceAfter)}</span>
        </div>))}
      {entries.length === 0 ? (<EmptyStateShell title={tr('No ledger entry', 'هیچ حرکتی در ledger نیست')} description={tr('Transactions will appear here.', 'حرکت‌های حساب اینجا نمایش داده می‌شود.')} className="py-8"/>) : null}
    </div>
  </div>);
