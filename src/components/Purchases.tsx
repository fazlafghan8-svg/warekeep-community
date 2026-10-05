import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, AppUser, Batch, Invoice, Medicine, Purchase, PurchaseAttachment, PurchaseItem, PurchasePayment, PurchasePaymentMethod, PurchaseReceipt, PurchaseReceiptItem, RequestedPurchaseDraftFocus, PurchaseWorkflowStatus, Partner, StockEntryType, Supplier, SupplierDeleteMode } from '../types';
import { Modal } from './ui/Modal';
import { PageHeader } from './ui/PageHeader';
import { Button } from './ui/Button';
import { ActiveFilterChip, FilterRangeField, FilterSearchField, FilterSelectField, LockHint, UnifiedFilterBar } from './ui/UnifiedFilterBar';
import { InlineAlert } from './ui/InlineAlert';
import { NewFeatureBadge } from './ui/NewFeatureBadge';
import { NewFeatureHint } from './ui/NewFeatureHint';
import { shouldShowNewFeatureMarkers } from './ui/newFeatureVisibility';
import { EmptyStateShell } from './ui/StateShell';
import { FlatCard, GlassCard } from './ui/Surface';
import { StatusBadge as SharedStatusBadge } from './ui/StatusBadge';
import { createUniqueId } from '../utils/localIds';
import { openAttachmentPreview } from '../services/attachmentPreviewService';
import { ATTACHMENT_INPUT_ACCEPT, isSupportedAttachmentFile } from '../utils/attachmentTypePolicy';
import { getTranslation } from '../utils/translations';
import { normalizePersianNumbers } from '../utils/localization';
import { formatAppDate, formatAppDateTime, formatMedicineExpiryDate } from '../lib/formatters';
import { classNames } from '../utils/classNames';
import { buildPurchaseReceiptBatchPayload, buildPurchasePaymentAllocationPlan, buildSupplierSettlementPlan, calculatePurchaseSubtotal, buildPurchaseReceiptQuantityMap, getSupplierFinanceSummary, getInventoryReturnReferenceMeta, getMedicineLastPurchaseRate, getMedicinePurchasePriceHistory, getPurchaseItemTotal, getPurchaseLastPaymentDate, getPurchasePaymentTotal, getPurchaseReceivedQuantity, getPurchaseReturnedQuantity, getSupplierNetBalanceDisplay, getPurchaseVendorCreditTotal, isInventoryReturnReferencePurchase, isUnknownSupplier, normalizePurchaseRecord, parseSupplierFinanceTaggedNote, resolvePurchasePaymentStatus, resolvePurchaseOperationalStage, resolvePurchaseStatus, validatePurchaseBatchPayloadIntegrity } from '../utils/purchaseUtils';
type SupplierFinancePaymentDraft = Omit<PurchasePayment, 'id'> & {
    description?: string;
    settlementId?: string;
};
type PurchaseMutationHandlerResult = boolean | void | Promise<boolean | void>;
export interface PurchasesProps {
    suppliers: Supplier[];
    purchases: Purchase[];
    partners?: Partner[];
    medicines: Medicine[];
    invoices?: Invoice[];
    onAddSupplier: (supplier: Omit<Supplier, 'id'>) => void;
    onUpdateSupplier: (id: string, data: Partial<Supplier>) => void;
    onDeleteSupplier?: (id: string, mode: SupplierDeleteMode) => void;
    onAddPurchase: (purchase: Omit<Purchase, 'id'>, newBatches: {
        medicineId: string;
        batch: Omit<Batch, 'id' | 'history'>;
    }[]) => PurchaseMutationHandlerResult;
    onUpdatePurchase: (purchaseId: string, purchase: Omit<Purchase, 'id'>, newBatches: {
        medicineId: string;
        batch: Omit<Batch, 'id' | 'history'>;
    }[]) => PurchaseMutationHandlerResult;
    onDeletePurchase: (id: string) => void;
    onRecordPurchasePayment: (purchaseId: string, payment: Omit<PurchasePayment, 'id'>) => void;
    onRecordPurchaseReceipt: (purchaseId: string, receipt: Omit<PurchaseReceipt, 'id'>) => void;
    onShortClosePurchase: (purchaseId: string, reason: string) => void;
    onAddSupplierPayment: (supplierId: string, payment: SupplierFinancePaymentDraft) => void;
    onRecordSupplierSettlement: (supplierId: string, payment: SupplierFinancePaymentDraft) => void;
    settings: AppSettings;
    readOnly?: boolean;
    activeAppUser?: AppUser | null;
    requestedTab?: ActiveTab | null;
    onRequestedTabApplied?: () => void;
    requestedPurchaseContext?: {
        medicineId: string;
        medicineName: string;
        preferredSupplierId?: string;
    } | null;
    onRequestedPurchaseContextApplied?: () => void;
    requestedPurchaseDraftFocus?: RequestedPurchaseDraftFocus | null;
    onRequestedPurchaseDraftFocusApplied?: () => void;
}
type ActiveTab = 'new' | 'list' | 'suppliers';
type HistoryStatusFilter = 'all' | 'open' | 'overdue' | 'paid' | 'partial' | 'draft' | 'approved' | 'received' | 'cancelled';
type HistorySort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'remaining_desc';
type SupplierDebtFilter = 'all' | 'with_debt' | 'settled' | 'prepaid' | 'high_debt';
type SupplierInteractionFilter = 'all' | '7d' | '30d' | '90d';
type SupplierSort = 'debt_desc' | 'debt_asc' | 'name_asc' | 'name_desc' | 'last_purchase_desc' | 'interaction_desc';
type PurchaseStep = 'supplier' | 'items' | 'payments' | 'review';
type SupplierProfileSection = 'summary' | 'open' | 'ledger' | 'history';
type SupplierFinanceActionMode = 'settlement' | 'advance';
type SupplierOpeningBalanceMode = 'debt' | 'credit' | 'settled';
type SupplierFormState = {
    name: string;
    code: string;
    phone: string;
    companyName: string;
    contactPerson: string;
    email: string;
    address: string;
    paymentTerms: string;
    notes: string;
    openingBalance: string;
    openingBalanceMode: SupplierOpeningBalanceMode;
    status: 'active' | 'inactive' | 'blocked';
};
type ItemEditorState = {
    search: string;
    medicineId: string;
    batchNumber: string;
    expiryDate: string;
    quantity: string;
    purchasePrice: string;
    barcode: string;
    unit: string;
    notes: string;
    minimumOrderQuantity: string;
    suggestedQuantity: string;
};
type PurchaseFormState = {
    supplierId: string;
    supplierCodeLookup: string;
    partnerId: string;
    invoiceNumber: string;
    date: string;
    dueDate: string;
    workflowStatus: PurchaseWorkflowStatus;
    stockEntryType: StockEntryType;
    destinationWarehouse: string;
    discountAmount: string;
    taxAmount: string;
    shippingAmount: string;
    extraChargesAmount: string;
    notes: string;
    confirmUnknownSupplier: boolean;
};
type PaymentDraftState = {
    amount: string;
    method: PurchasePaymentMethod;
    date: string;
    reference: string;
    note: string;
};
const HISTORY_PAGE_SIZE = 8;
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_SIZE = 2000000;
const todayInput = () => new Date().toISOString().split('T')[0];
const createEmptySupplierForm = (): SupplierFormState => ({
    name: '',
    code: '',
    phone: '',
    companyName: '',
    contactPerson: '',
    email: '',
    address: '',
    paymentTerms: '',
    notes: '',
    openingBalance: '0',
    openingBalanceMode: 'debt',
    status: 'active'
});
const createEmptyItemEditor = (): ItemEditorState => ({
    search: '',
    medicineId: '',
    batchNumber: '',
    expiryDate: '',
    quantity: '',
    purchasePrice: '',
    barcode: '',
    unit: '',
    notes: '',
    minimumOrderQuantity: '',
    suggestedQuantity: ''
});
const createEmptyPurchaseForm = (isEnglish = true): PurchaseFormState => ({
    supplierId: '',
    supplierCodeLookup: '',
    partnerId: '',
    invoiceNumber: '',
    date: todayInput(),
    dueDate: '',
    workflowStatus: 'received',
    stockEntryType: 'store_purchase',
    destinationWarehouse: isEnglish ? 'Main warehouse' : 'گدام اصلی',
    discountAmount: '0',
    taxAmount: '0',
    shippingAmount: '0',
    extraChargesAmount: '0',
    notes: '',
    confirmUnknownSupplier: false
});
const createEmptyPaymentDraft = (): PaymentDraftState => ({
    amount: '',
    method: 'cash',
    date: todayInput(),
    reference: '',
    note: ''
});
const parseAmountInput = (value: string): number => {
    const normalized = normalizePersianNumbers(value || '').replace(/,/g, '').trim();
    if (!normalized)
        return 0;
    const numeric = Number(normalized);
    return Number.isFinite(numeric) ? numeric : 0;
};
const isPurchaseOverdue = (purchase: Purchase): boolean => {
    if (!purchase.dueDate || purchase.remainingAmount <= 0)
        return false;
    return new Date(purchase.dueDate).getTime() < new Date().setHours(0, 0, 0, 0);
};
const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
});
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
const escapeHtml = (value: string | number) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const SectionCard = ({ title, subtitle, action, children }: {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    action?: React.ReactNode;
    children: React.ReactNode;
}) => (<FlatCard className="overflow-hidden rounded-[28px]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
            <div>
                <h3 className="text-lg font-black text-slate-900">{title}</h3>
                {subtitle ? <div className="mt-1 wk-procurement-copy">{subtitle}</div> : null}
            </div>
            {action}
        </div>
        <div className="px-4 py-4 sm:px-5">{children}</div>
    </FlatCard>);
const MetricCard = ({ label, value, tone = 'border-slate-200 bg-slate-50 text-slate-900' }: {
    label: string;
    value: string;
    tone?: string;
}) => (<FlatCard className={`rounded-2xl border px-3 py-2.5 ${tone}`}>
        <p className="wk-procurement-label opacity-70">{label}</p>
        <p className="mt-1.5 text-lg font-black">{value}</p>
    </FlatCard>);
const ActionButton = ({ label, onClick, disabled, tone = 'default', type = 'button', size = 'sm', className }: {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    tone?: 'default' | 'primary' | 'danger' | 'ghost';
    type?: 'button' | 'submit';
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}) => (<Button type={type} onClick={onClick} disabled={disabled} variant={tone === 'default' ? 'secondary' : tone} size={size} className={classNames('font-black', className)}>
        {label}
    </Button>);
const buildNewSectionTitle = (title: string, badgeTestId?: string) => (<span className="inline-flex flex-wrap items-center gap-2">
        <span>{title}</span>
        <NewFeatureBadge data-testid={badgeTestId}/>
    </span>);
const StatusBadge = ({ label, tone, dot = false }: {
    label: string;
    tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
    dot?: boolean;
}) => (<SharedStatusBadge tone={tone} dot={dot}>{label}</SharedStatusBadge>);
const ProcurementKpiChip = ({ label, tone = 'info' }: {
    label: string;
    tone?: 'danger' | 'warning' | 'info';
}) => (<span className="wk-procurement-kpi-chip" data-tone={tone}>
        {label}
    </span>);
const PurchaseStepper = ({ steps, currentStep, onSelect }: {
    steps: Array<{
        id: PurchaseStep;
        title: string;
        note: string;
        complete: boolean;
        disabled?: boolean;
    }>;
    currentStep: PurchaseStep;
    onSelect: (step: PurchaseStep) => void;
}) => (<div className="wk-procurement-stepper" data-testid="purchases-stepper">
        {steps.map((step, index) => {
        const state = step.id === currentStep ? 'current' : step.complete ? 'done' : 'upcoming';
        return (<button key={step.id} type="button" onClick={() => onSelect(step.id)} disabled={step.disabled} className="wk-procurement-step" data-state={state} data-testid={`purchases-step-${step.id}`}>
                    <span className="wk-procurement-step-index">{step.complete && step.id !== currentStep ? '\u2713' : index + 1}</span>
                    <span className="wk-procurement-step-copy">
                        <span className="wk-procurement-step-title">{step.title}</span>
                        <span className="wk-procurement-step-note">{step.note}</span>
                    </span>
                </button>);
    })}
    </div>);
const ReviewCheckItem = ({ title, description, state }: {
    title: string;
    description: string;
    state: 'pass' | 'warn';
}) => (<div className="wk-procurement-review-check" data-state={state}>
        <span className="wk-procurement-review-check-indicator">{state === 'pass' ? '\u2713' : '!'}</span>
        <div>
            <p className="text-sm font-black text-slate-900">{title}</p>
            <p className="mt-1 wk-procurement-copy">{description}</p>
        </div>
    </div>);
export const Purchases: React.FC<PurchasesProps> = ({ suppliers = [], purchases = [], partners = [], medicines = [], invoices = [], onAddSupplier, onUpdateSupplier, onDeleteSupplier, onAddPurchase, onUpdatePurchase, onDeletePurchase, onRecordPurchasePayment, onRecordPurchaseReceipt, onShortClosePurchase, onAddSupplierPayment, onRecordSupplierSettlement, settings, readOnly = false, activeAppUser, requestedTab = null, onRequestedTabApplied, requestedPurchaseContext = null, onRequestedPurchaseContextApplied, requestedPurchaseDraftFocus = null, onRequestedPurchaseDraftFocusApplied }) => {
    const showNewFeatureMarkers = shouldShowNewFeatureMarkers();
    const t = getTranslation(settings.language || 'dari');
    const isEnglish = (settings.language || 'dari') === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const currencyCode = settings.currencySettings?.baseCurrency || 'AFN';
    const currencyLabel = currencyCode === 'AFN' ? tr('AFN', 'افغانی') : currencyCode;
    const numberLocale = isEnglish ? 'en-US' : 'fa-AF';
    const isAdmin = !activeAppUser || activeAppUser.role === 'admin';
    const canManagePurchases = !readOnly && (isAdmin || !!activeAppUser?.permissions.includes('manage_purchases') || !!activeAppUser?.permissions.includes('manage_inventory'));
    const canDeletePurchases = canManagePurchases && (isAdmin || !!activeAppUser?.permissions.includes('manage_purchases'));
    const canDeleteSuppliers = canDeletePurchases && !!onDeleteSupplier;
    const handleOpenAttachment = async (attachment: PurchaseAttachment) => {
        const opened = await openAttachmentPreview(attachment);
        if (!opened) {
            window.alert(tr('Could not open this attachment.', 'باز کردن این پیوست ممکن نشد.'));
        }
    };
    const [activeTab, setActiveTab] = useState<ActiveTab>('list');
    const [newPurchaseStep, setNewPurchaseStep] = useState<PurchaseStep>('supplier');
    const [supplierProfileSection, setSupplierProfileSection] = useState<SupplierProfileSection>('summary');
    const lastAppliedRequestedTabRef = useRef<ActiveTab | null>(null);
    const [supplierModalOpen, setSupplierModalOpen] = useState(false);
    const [supplierForm, setSupplierForm] = useState<SupplierFormState>(createEmptySupplierForm);
    const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
    const [selectedSupplierProfileId, setSelectedSupplierProfileId] = useState<string | null>(suppliers.find((supplier) => !supplier.isDeleted)?.id || null);
    const [pendingDeleteSupplierId, setPendingDeleteSupplierId] = useState<string | null>(null);
    const [supplierDeleteMode, setSupplierDeleteMode] = useState<SupplierDeleteMode>('conditional');
    const [supplierDeleteConfirmText, setSupplierDeleteConfirmText] = useState('');
    const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
    const [purchaseForm, setPurchaseForm] = useState<PurchaseFormState>(() => createEmptyPurchaseForm(settings.language === 'english'));
    const [items, setItems] = useState<PurchaseItem[]>([]);
    const [itemEditor, setItemEditor] = useState<ItemEditorState>(createEmptyItemEditor);
    const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
    const [payments, setPayments] = useState<PurchasePayment[]>([]);
    const [paymentDraft, setPaymentDraft] = useState<PaymentDraftState>(createEmptyPaymentDraft);
    const [attachments, setAttachments] = useState<PurchaseAttachment[]>([]);
    const [autoFillPreview, setAutoFillPreview] = useState<PurchaseItem[]>([]);
    const [isDraftSavePending, setIsDraftSavePending] = useState(false);
    const [isFinalSavePending, setIsFinalSavePending] = useState(false);
    const [isFinalizeDraftPending, setIsFinalizeDraftPending] = useState(false);
    const [historySearch, setHistorySearch] = useState('');
    const [historySupplierFilter, setHistorySupplierFilter] = useState('all');
    const [historyStatusFilter, setHistoryStatusFilter] = useState<HistoryStatusFilter>('all');
    const [historyDateFrom, setHistoryDateFrom] = useState('');
    const [historyDateTo, setHistoryDateTo] = useState('');
    const [historyAmountMin, setHistoryAmountMin] = useState('');
    const [historyAmountMax, setHistoryAmountMax] = useState('');
    const [historySort, setHistorySort] = useState<HistorySort>('date_desc');
    const [historyPage, setHistoryPage] = useState(1);
    const [supplierSearch, setSupplierSearch] = useState('');
    const [supplierDebtFilter, setSupplierDebtFilter] = useState<SupplierDebtFilter>('all');
    const [supplierStatusFilter, setSupplierStatusFilter] = useState<'all' | 'active' | 'inactive' | 'blocked'>('all');
    const [supplierInteractionFilter, setSupplierInteractionFilter] = useState<SupplierInteractionFilter>('all');
    const [supplierSort, setSupplierSort] = useState<SupplierSort>('debt_desc');
    useEffect(() => {
        if (!requestedTab || requestedTab === lastAppliedRequestedTabRef.current)
            return;
        setActiveTab(requestedTab);
        lastAppliedRequestedTabRef.current = requestedTab;
        onRequestedTabApplied?.();
    }, [requestedTab, onRequestedTabApplied]);
    useEffect(() => {
        setSupplierProfileSection('summary');
    }, [selectedSupplierProfileId]);
    const isPurchaseSubmitPending = isDraftSavePending || isFinalSavePending;
    const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
    const [historyPreviewId, setHistoryPreviewId] = useState<string | null>(null);
    const [procurementDraftNotice, setProcurementDraftNotice] = useState<{
        medicineName?: string;
    } | null>(null);
    const [pendingDeletePurchaseId, setPendingDeletePurchaseId] = useState<string | null>(null);
    const [purchasePaymentTargetId, setPurchasePaymentTargetId] = useState<string | null>(null);
    const [purchaseReceiptTargetId, setPurchaseReceiptTargetId] = useState<string | null>(null);
    const [purchaseShortCloseTargetId, setPurchaseShortCloseTargetId] = useState<string | null>(null);
    const [finalizeDraftTargetId, setFinalizeDraftTargetId] = useState<string | null>(null);
    const [supplierPaymentTargetId, setSupplierPaymentTargetId] = useState<string | null>(null);
    const [supplierPaymentMode, setSupplierPaymentMode] = useState<SupplierFinanceActionMode>('settlement');
    const [settlementAmount, setSettlementAmount] = useState('');
    const [settlementNote, setSettlementNote] = useState('');
    const [settlementReference, setSettlementReference] = useState('');
    const [settlementMethod, setSettlementMethod] = useState<PurchasePaymentMethod>('bank_transfer');
    const [showSupplierPaymentDetails, setShowSupplierPaymentDetails] = useState(true);
    const [receiptLineQuantities, setReceiptLineQuantities] = useState<Record<number, string>>({});
    const [receiptNote, setReceiptNote] = useState('');
    const [isFinalReceiptModalOpen, setIsFinalReceiptModalOpen] = useState(false);
    const [finalReceiptLineQuantities, setFinalReceiptLineQuantities] = useState<Record<number, string>>({});
    const [finalReceiptNote, setFinalReceiptNote] = useState('');
    const [shortCloseReason, setShortCloseReason] = useState('');
    const [finalizeDraftDueDate, setFinalizeDraftDueDate] = useState('');
    const [isDraftFocusActionPending, setIsDraftFocusActionPending] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const supplierLookupRef = useRef<HTMLInputElement>(null);
    const formatNumber = (value: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 4, ...options }).format(Number.isFinite(value) ? value : 0);
    const formatMoney = (value: number) => `${formatNumber(value)} ${currencyLabel}`;
    const formatDate = (value?: string) => {
        if (!value)
            return '-';
        return formatAppDate(value, settings, 'purchases');
    };
    const formatExpiryDate = (value?: string) => value ? formatMedicineExpiryDate(value, settings) : '-';
    const formatDateTime = (value?: string) => {
        if (!value)
            return '-';
        return formatAppDateTime(value, settings, 'purchases');
    };
    const getDebtMetricTone = (amount: number) => (amount > 0 ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900');
    const getPrepaymentMetricTone = (amount: number) => (amount > 0 ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-slate-200 bg-slate-50 text-slate-900');
    const getNetBalanceMetricTone = (status?: ReturnType<typeof getSupplierNetBalanceDisplay>['status']) => (status === 'net_debt'
        ? 'border-rose-200 bg-rose-50 text-rose-900'
        : status === 'net_credit'
            ? 'border-sky-200 bg-sky-50 text-sky-900'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900');
    const getNetBalanceTextTone = (status?: ReturnType<typeof getSupplierNetBalanceDisplay>['status']) => (status === 'net_debt'
        ? 'text-rose-700'
        : status === 'net_credit'
            ? 'text-sky-700'
            : 'text-emerald-700');
    const getSupplierFinancePresentation = (finance: ReturnType<typeof getSupplierFinanceSummary> | null | undefined, options?: {
        debtLabel?: string;
        prepaidLabel?: string;
        settledLabel?: string;
    }) => {
        const summary = finance || getSupplierFinanceSummary(null, []);
        const presentationByStatus = {
            open_debt: {
                label: options?.debtLabel ?? tr('Current debt', 'بدهی فعلی'),
                cardTone: 'border-rose-200 bg-rose-50 text-rose-900',
                textTone: 'text-rose-700',
                displayAmount: summary.openDebt,
            },
            prepaid: {
                label: options?.prepaidLabel ?? tr('Supplier prepayment', 'پیش‌پرداخت تامین‌کننده'),
                cardTone: 'border-sky-200 bg-sky-50 text-sky-900',
                textTone: 'text-sky-700',
                displayAmount: summary.supplierPrepayment,
            },
            settled: {
                label: options?.settledLabel ?? tr('Settled / zero debt', 'تسویه / بدون بدهی'),
                cardTone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
                textTone: 'text-emerald-700',
                displayAmount: 0,
            }
        } as const;
        const presentation = presentationByStatus[summary.primaryStatus];
        return {
            ...summary,
            primaryLabel: presentation.label,
            primaryValue: formatMoney(presentation.displayAmount),
            cardTone: presentation.cardTone,
            textTone: presentation.textTone
        };
    };
    const formatSupplierLedgerBalance = (balance: number) => {
        const display = getSupplierNetBalanceDisplay(balance);
        if (display.status === 'settled')
            return tr('Settled', 'تسویه');
        return `${display.status === 'net_debt' ? tr('Net debt', 'بدهی خالص') : tr('Net credit', 'اعتبار خالص')}: ${formatMoney(display.displayAmount)}`;
    };
    const activeSuppliers = useMemo(() => suppliers.filter((supplier) => !supplier.isDeleted), [suppliers]);
    const supplierById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
    const activePartners = useMemo(() => partners.filter((partner) => !partner.isDeleted && partner.status !== 'inactive'), [partners]);
    const partnerById = useMemo(() => new Map(partners.filter((partner) => !partner.isDeleted).map((partner) => [partner.id, partner])), [partners]);
    const medicineById = useMemo(() => new Map(medicines.map((medicine) => [medicine.id, medicine])), [medicines]);
    const normalizedPurchases = useMemo(() => purchases.filter((purchase) => !purchase.isDeleted).map((purchase) => normalizePurchaseRecord(purchase)), [purchases]);
    const sortedPurchases = useMemo(() => [...normalizedPurchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [normalizedPurchases]);
    const supplierFinanceById = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, getSupplierFinanceSummary(supplier, normalizedPurchases)])), [normalizedPurchases, suppliers]);
    useEffect(() => {
        if (!requestedPurchaseContext)
            return;
        const preferredSupplier = requestedPurchaseContext.preferredSupplierId
            ? supplierById.get(requestedPurchaseContext.preferredSupplierId) || null
            : null;
        const usablePreferredSupplier = preferredSupplier && !preferredSupplier.isDeleted ? preferredSupplier : null;
        setActiveTab('new');
        setNewPurchaseStep('items');
        setPurchaseForm((current) => ({
            ...current,
            supplierId: usablePreferredSupplier?.id || current.supplierId,
            supplierCodeLookup: usablePreferredSupplier?.code || usablePreferredSupplier?.name || current.supplierCodeLookup
        }));
        setItemEditor((current) => ({
            ...current,
            search: requestedPurchaseContext.medicineName,
            medicineId: requestedPurchaseContext.medicineId
        }));
        onRequestedPurchaseContextApplied?.();
    }, [onRequestedPurchaseContextApplied, requestedPurchaseContext, supplierById]);
    const subtotalAmount = useMemo(() => calculatePurchaseSubtotal(items), [items]);
    const discountAmount = parseAmountInput(purchaseForm.discountAmount);
    const taxAmount = parseAmountInput(purchaseForm.taxAmount);
    const shippingAmount = parseAmountInput(purchaseForm.shippingAmount);
    const extraChargesAmount = parseAmountInput(purchaseForm.extraChargesAmount);
    const totalAmount = Math.max(0, subtotalAmount - discountAmount + taxAmount + shippingAmount + extraChargesAmount);
    const paidAmount = Math.min(getPurchasePaymentTotal(payments), totalAmount);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);
    const paymentStatus = resolvePurchasePaymentStatus(totalAmount, paidAmount);
    const selectedSupplierCandidate = purchaseForm.supplierId ? supplierById.get(purchaseForm.supplierId) || null : null;
    const selectedSupplier = selectedSupplierCandidate && !selectedSupplierCandidate.isDeleted ? selectedSupplierCandidate : null;
    const selectedPartner = purchaseForm.partnerId ? partnerById.get(purchaseForm.partnerId) || null : null;
    const supplierIsUnknown = isUnknownSupplier(selectedSupplier);
    const supplierLookupMatches = useMemo(() => {
        const query = purchaseForm.supplierCodeLookup.trim().toLowerCase();
        const rankedSuppliers = [...activeSuppliers].sort((a, b) => (b.updatedAt || b.lastInteractionDate || '').localeCompare(a.updatedAt || a.lastInteractionDate || ''));
        const source = query
            ? rankedSuppliers.filter((supplier) => [supplier.code || '', supplier.name, supplier.phone || '', supplier.companyName || '', supplier.contactPerson || ''].join(' ').toLowerCase().includes(query))
            : rankedSuppliers;
        return source.slice(0, 6);
    }, [activeSuppliers, purchaseForm.supplierCodeLookup]);
    const hasSelectedSupplier = Boolean(selectedSupplier);
    const hasInvoiceItems = items.length > 0;
    const hasDraftPayments = payments.length > 0;
    const dueDateIsOverdue = Boolean(purchaseForm.dueDate && new Date(purchaseForm.dueDate).getTime() < new Date().setHours(0, 0, 0, 0));
    const reviewChecklist = [
        {
            id: 'supplier',
            complete: hasSelectedSupplier && (!supplierIsUnknown || purchaseForm.confirmUnknownSupplier),
            title: tr('Supplier is locked and verified', 'تأمین‌کننده انتخاب و تأیید شده است'),
            description: hasSelectedSupplier
                ? supplierIsUnknown && !purchaseForm.confirmUnknownSupplier
                    ? tr('This supplier is flagged as ambiguous and still needs confirmation.', 'این تأمین‌کننده مبهم است و هنوز نیاز به تأیید دارد.')
                    : tr('Debt context and supplier profile are ready for save.', 'زمینه بدهی و پروفایل تأمین‌کننده برای ثبت آماده است.')
                : tr('Choose a supplier before moving to final review.', 'پیش از بازبینی نهایی یک تأمین‌کننده انتخاب کنید.')
        },
        {
            id: 'items',
            complete: hasInvoiceItems && totalAmount > 0,
            title: tr('Invoice lines are ready', 'سطرهای فاکتور آماده‌اند'),
            description: hasInvoiceItems
                ? tr(`${formatNumber(items.length)} line(s) prepared with ${formatMoney(totalAmount)} final total.`, `${formatNumber(items.length)} سطر با جمع نهایی ${formatMoney(totalAmount)} آماده است.`)
                : tr('Add at least one valid line item to continue.', 'حداقل یک سطر معتبر اضافه کنید تا ادامه دهید.')
        },
        {
            id: 'payments',
            complete: remainingAmount <= totalAmount,
            title: tr('Payment standing is coherent', 'وضعیت پرداخت سازگار است'),
            description: hasDraftPayments
                ? remainingAmount > 0
                    ? tr(`${formatMoney(remainingAmount)} remains open after staged payments.`, `پس از پرداخت‌های مرحله‌ای هنوز ${formatMoney(remainingAmount)} مانده است.`)
                    : tr('Current staged payments fully cover the document.', 'پرداخت‌های فعلی کل سند را پوشش می‌دهند.')
                : tr('No payment entry is recorded yet; this will save as open balance unless fully paid later.', 'هنوز پرداختی ثبت نشده و سند به‌عنوان مانده باز ذخیره می‌شود مگر بعداً تسویه گردد.')
        }
    ] as const;
    const purchaseSteps = [
        { id: 'supplier' as const, title: tr('Supplier', 'تأمین‌کننده'), note: tr('Context and dates', 'زمینه و تاریخ‌ها'), complete: reviewChecklist[0].complete },
        { id: 'items' as const, title: tr('Items', 'اقلام'), note: tr('Quick workbench', 'میز کار سریع'), complete: reviewChecklist[1].complete, disabled: !hasSelectedSupplier },
        { id: 'payments' as const, title: tr('Payments', 'پرداخت‌ها'), note: tr('Balance and staging', 'مانده و مرحله‌بندی'), complete: reviewChecklist[2].complete, disabled: !hasSelectedSupplier || !hasInvoiceItems },
        { id: 'review' as const, title: tr('Review', 'بازبینی'), note: tr('Safe final save', 'ثبت امن نهایی'), complete: reviewChecklist.every((item) => item.complete), disabled: !hasSelectedSupplier || !hasInvoiceItems }
    ];
    const purchaseById = useMemo(() => new Map(normalizedPurchases.map((purchase) => [purchase.id, purchase])), [normalizedPurchases]);
    const selectedPurchase = selectedPurchaseId ? purchaseById.get(selectedPurchaseId) || null : null;
    const historyPreviewPurchase = historyPreviewId ? purchaseById.get(historyPreviewId) || null : null;
    const pendingDeletePurchase = pendingDeletePurchaseId ? purchaseById.get(pendingDeletePurchaseId) || null : null;
    const focusedProcurementDraft = procurementDraftNotice && editingPurchaseId
        ? purchaseById.get(editingPurchaseId) || null
        : null;
    const purchasePaymentTarget = purchasePaymentTargetId ? normalizedPurchases.find((purchase) => purchase.id === purchasePaymentTargetId) || null : null;
    const purchaseReceiptTarget = purchaseReceiptTargetId ? normalizedPurchases.find((purchase) => purchase.id === purchaseReceiptTargetId) || null : null;
    const purchaseShortCloseTarget = purchaseShortCloseTargetId ? normalizedPurchases.find((purchase) => purchase.id === purchaseShortCloseTargetId) || null : null;
    const finalizeDraftTarget = finalizeDraftTargetId ? purchaseById.get(finalizeDraftTargetId) || null : null;
    const supplierPaymentTarget = supplierPaymentTargetId ? supplierById.get(supplierPaymentTargetId) || null : null;
    const selectedSupplierProfileCandidate = selectedSupplierProfileId ? supplierById.get(selectedSupplierProfileId) || null : null;
    const selectedSupplierProfile = selectedSupplierProfileCandidate && !selectedSupplierProfileCandidate.isDeleted
        ? selectedSupplierProfileCandidate
        : null;
    const pendingDeleteSupplier = pendingDeleteSupplierId ? supplierById.get(pendingDeleteSupplierId) || null : null;
    const getSupplierDeletionImpact = (supplier: Supplier | null) => {
        if (!supplier) {
            return { purchaseCount: 0, transactionCount: 0, batchCount: 0, preferredMedicineCount: 0, dependentSaleCount: 0 };
        }
        const supplierPurchaseIds = new Set(normalizedPurchases.filter((purchase) => purchase.supplierId === supplier.id).map((purchase) => purchase.id));
        const supplierBatchIds = new Set<string>();
        medicines.forEach((medicine) => {
            (medicine.batches || []).forEach((batch) => {
                if (batch.supplierId === supplier.id || (batch.purchaseId && supplierPurchaseIds.has(batch.purchaseId))) {
                    supplierBatchIds.add(batch.id);
                }
            });
        });
        const dependentSaleCount = invoices.filter((invoice) => !invoice.isDeleted).reduce((sum, invoice) => (sum + (invoice.items || []).filter((item) => item.batchId && supplierBatchIds.has(item.batchId)).length), 0);
        return {
            purchaseCount: supplierPurchaseIds.size,
            transactionCount: (supplier.transactions || []).length,
            batchCount: supplierBatchIds.size,
            preferredMedicineCount: medicines.filter((medicine) => medicine.preferredSupplierId === supplier.id && !medicine.isDeleted).length,
            dependentSaleCount,
        };
    };
    const pendingDeleteSupplierImpact = getSupplierDeletionImpact(pendingDeleteSupplier);
    const selectedSupplierPaymentDetails = useMemo(() => (selectedSupplierProfile
        ? (selectedSupplierProfile.transactions || [])
            .map((transaction, index) => {
            const amount = Math.max(0, Number(transaction.amount) || 0);
            const balanceAfter = Number.isFinite(transaction.balanceAfter) ? transaction.balanceAfter : 0;
            const balanceBefore = transaction.type === 'payment'
                ? balanceAfter + amount
                : balanceAfter;
            const debtApplied = Math.min(Math.max(0, balanceBefore), amount);
            const prepaymentCreated = Math.max(0, amount - debtApplied);
            return {
                transaction,
                index,
                amount,
                balanceBefore,
                balanceAfter,
                debtApplied,
                prepaymentCreated
            };
        })
            .filter((entry) => entry.transaction.type === 'payment')
            .sort((a, b) => {
            const dateDiff = new Date(b.transaction.date).getTime() - new Date(a.transaction.date).getTime();
            return dateDiff || b.index - a.index;
        })
            .slice(0, 3)
        : []), [selectedSupplierProfile]);
    const selectedSupplierFinanceSummary = selectedSupplier ? supplierFinanceById.get(selectedSupplier.id) || getSupplierFinanceSummary(selectedSupplier, normalizedPurchases) : null;
    const selectedSupplierProfileFinanceSummary = selectedSupplierProfile ? supplierFinanceById.get(selectedSupplierProfile.id) || getSupplierFinanceSummary(selectedSupplierProfile, normalizedPurchases) : null;
    const supplierPaymentTargetFinanceSummary = supplierPaymentTarget ? supplierFinanceById.get(supplierPaymentTarget.id) || getSupplierFinanceSummary(supplierPaymentTarget, normalizedPurchases) : null;
    const selectedSupplierFinance = getSupplierFinancePresentation(selectedSupplierFinanceSummary, {
        debtLabel: tr('Open debt', 'بدهی باز')
    });
    const selectedSupplierProfileFinance = getSupplierFinancePresentation(selectedSupplierProfileFinanceSummary);
    const supplierPaymentTargetFinance = getSupplierFinancePresentation(supplierPaymentTargetFinanceSummary);
    const settlementAmountValue = parseAmountInput(settlementAmount);
    const projectedSettlementPlan = supplierPaymentTarget && supplierPaymentMode === 'settlement'
        ? buildSupplierSettlementPlan({
            supplier: supplierPaymentTarget,
            purchases: normalizedPurchases,
            amount: settlementAmountValue,
        })
        : null;
    const projectedSupplierSettlementFinanceSummary = supplierPaymentTarget && supplierPaymentTargetFinanceSummary
        ? {
            ...supplierPaymentTargetFinanceSummary,
            openDebt: supplierPaymentMode === 'advance'
                ? supplierPaymentTargetFinanceSummary.openDebt
                : Math.max(0, supplierPaymentTargetFinanceSummary.openDebt - (projectedSettlementPlan?.totalAppliedToDebt || 0)),
            supplierPrepayment: supplierPaymentMode === 'advance'
                ? supplierPaymentTargetFinanceSummary.supplierPrepayment + settlementAmountValue
                : supplierPaymentTargetFinanceSummary.supplierPrepayment + (projectedSettlementPlan?.advancePaymentAmount || 0),
        }
        : null;
    const projectedSupplierSettlementFinance = getSupplierFinancePresentation(projectedSupplierSettlementFinanceSummary);
    const supplierSettlementOverflow = supplierPaymentMode === 'advance'
        ? 0
        : projectedSettlementPlan?.advancePaymentAmount || 0;
    const projectedPurchasePaymentAllocation = purchasePaymentTarget
        ? buildPurchasePaymentAllocationPlan({
            targetPurchase: purchasePaymentTarget,
            purchases: normalizedPurchases,
            amount: settlementAmountValue,
        })
        : null;
    const projectedOtherPurchasePaymentTotal = projectedPurchasePaymentAllocation?.otherOpenPurchasesAllocations.reduce((sum, entry) => sum + entry.amount, 0) || 0;
    const returnReferencePurchasesBySourceId = useMemo(() => sortedPurchases.reduce<Record<string, Purchase[]>>((acc, purchase) => {
        const meta = getInventoryReturnReferenceMeta(purchase);
        if (!meta.sourcePurchaseId)
            return acc;
        acc[meta.sourcePurchaseId] = [...(acc[meta.sourcePurchaseId] || []), purchase];
        return acc;
    }, {}), [sortedPurchases]);
    const visibleProcurementPurchases = useMemo(() => sortedPurchases.filter((purchase) => !isInventoryReturnReferencePurchase(purchase)), [sortedPurchases]);
    const inventoryGapPurchases = useMemo(() => visibleProcurementPurchases.filter((purchase) => {
        const receivedQuantity = getPurchaseReceivedQuantity(purchase);
        if (purchase.workflowStatus !== 'received' || receivedQuantity <= 0)
            return false;
        const linkedBatchQuantity = medicines.reduce((sum, medicine) => (sum + (medicine.batches || [])
            .filter((batch) => batch.purchaseId === purchase.id)
            .reduce((batchSum, batch) => batchSum + Math.max(0, batch.quantity || 0), 0)), 0);
        return linkedBatchQuantity + 0.0001 < receivedQuantity;
    }), [medicines, visibleProcurementPurchases]);
    const draftPreviewPurchase = normalizePurchaseRecord({
        id: editingPurchaseId || 'draft-preview',
        supplierId: purchaseForm.supplierId || 'draft-supplier',
        partnerId: purchaseForm.partnerId || undefined,
        stockEntryType: purchaseForm.stockEntryType,
        ownershipType: purchaseForm.stockEntryType === 'partner_consignment'
            ? 'consignment'
            : purchaseForm.partnerId
                ? 'partner'
                : 'store',
        date: purchaseForm.date,
        items: items.map((item) => ({
            ...item,
            partnerId: purchaseForm.partnerId || item.partnerId,
            ownerPartnerId: purchaseForm.partnerId || item.ownerPartnerId,
            stockEntryType: purchaseForm.stockEntryType,
            ownershipType: purchaseForm.stockEntryType === 'partner_consignment'
                ? 'consignment'
                : purchaseForm.partnerId
                    ? 'partner'
                    : 'store',
        })),
        subtotalAmount,
        discountAmount,
        taxAmount,
        shippingAmount,
        extraChargesAmount,
        totalAmount,
        paidAmount,
        remainingAmount,
        paymentMethod: payments.length > 1 ? 'mixed' : payments[0]?.method || (remainingAmount > 0 ? 'credit' : 'cash'),
        paymentStatus,
        workflowStatus: purchaseForm.workflowStatus,
        status: resolvePurchaseStatus(purchaseForm.workflowStatus, paymentStatus)
    });
    const getPurchaseDocumentLabel = (purchase: Purchase) => purchase.invoiceNumber || purchase.id.slice(-6);
    useEffect(() => {
        if (!requestedPurchaseDraftFocus)
            return;
        const draftPurchase = purchaseById.get(requestedPurchaseDraftFocus.purchaseId) || null;
        if (!draftPurchase)
            return;
        setActiveTab('new');
        populatePurchaseEditor(draftPurchase);
        setNewPurchaseStep(draftPurchase.items.length ? 'items' : 'supplier');
        setProcurementDraftNotice(requestedPurchaseDraftFocus.source === 'medicine_entry'
            ? { medicineName: requestedPurchaseDraftFocus.medicineName }
            : null);
        onRequestedPurchaseDraftFocusApplied?.();
    }, [onRequestedPurchaseDraftFocusApplied, purchaseById, requestedPurchaseDraftFocus]);
    const getVendorCreditResolutionLabel = (resolution?: string) => {
        switch (resolution) {
            case 'refund':
                return tr('Refund', 'استرداد پول');
            case 'replacement':
                return tr('Replacement', 'جایگزینی');
            case 'vendor_credit':
                return tr('Vendor Credit', 'اعتبار مرجوعی');
            default:
                return '-';
        }
    };
    const getReturnReferenceDetails = (purchase: Purchase) => {
        const meta = getInventoryReturnReferenceMeta(purchase);
        if (!meta.isReference)
            return null;
        const primaryCredit = [...(purchase.vendorCredits || [])]
            .sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime())[0];
        const sourcePurchase = meta.sourcePurchaseId ? purchaseById.get(meta.sourcePurchaseId) || null : null;
        const returnNote = (primaryCredit?.note || purchase.items.find((item) => item.notes)?.notes || '').trim();
        const sourceBatchLabel = meta.sourceBatchNumber
            || primaryCredit?.items?.find((item) => item.batchNumber)?.batchNumber
            || purchase.items.find((item) => item.batchNumber)?.batchNumber
            || '-';
        const creditedAmount = getPurchaseVendorCreditTotal(purchase.vendorCredits || []);
        const returnedQuantity = getPurchaseReturnedQuantity(purchase.vendorCredits || [])
            || purchase.items.reduce((sum, item) => sum + item.quantity, 0);
        return {
            sourcePurchase,
            sourceDocumentLabel: sourcePurchase ? getPurchaseDocumentLabel(sourcePurchase) : (meta.sourcePurchaseId || '-'),
            sourceBatchLabel,
            resolutionLabel: getVendorCreditResolutionLabel(primaryCredit?.resolution || meta.resolution),
            creditedAmount,
            returnedQuantity,
            returnNote,
            recordedAt: primaryCredit?.date || purchase.date,
        };
    };
    const getLinkedReturnSummary = (purchase: Purchase) => {
        const linkedPurchases = returnReferencePurchasesBySourceId[purchase.id] || [];
        if (!linkedPurchases.length)
            return null;
        const entries = linkedPurchases
            .map((referencePurchase) => {
            const details = getReturnReferenceDetails(referencePurchase);
            const creditedAmount = details?.creditedAmount || getPurchaseVendorCreditTotal(referencePurchase.vendorCredits || []);
            const returnedQuantity = details?.returnedQuantity || referencePurchase.items.reduce((sum, item) => sum + item.quantity, 0);
            return {
                purchaseId: referencePurchase.id,
                documentLabel: getPurchaseDocumentLabel(referencePurchase),
                sourceBatchLabel: details?.sourceBatchLabel || '-',
                resolutionLabel: details?.resolutionLabel || '-',
                creditedAmount,
                returnedQuantity,
                returnNote: details?.returnNote || '',
                recordedAt: details?.recordedAt || referencePurchase.date,
            };
        })
            .sort((left, right) => new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime());
        return {
            count: entries.length,
            totalCreditedAmount: entries.reduce((sum, entry) => sum + entry.creditedAmount, 0),
            totalReturnedQuantity: entries.reduce((sum, entry) => sum + entry.returnedQuantity, 0),
            latestRecordedAt: entries[0]?.recordedAt || purchase.date,
            entries,
        };
    };
    const resetPurchaseEditor = () => {
        setEditingPurchaseId(null);
        setPurchaseForm(createEmptyPurchaseForm(isEnglish));
        setItems([]);
        setItemEditor(createEmptyItemEditor());
        setEditingItemIndex(null);
        setPayments([]);
        setPaymentDraft(createEmptyPaymentDraft());
        setAttachments([]);
        setAutoFillPreview([]);
        setIsFinalReceiptModalOpen(false);
        setFinalReceiptLineQuantities({});
        setFinalReceiptNote('');
        setNewPurchaseStep('supplier');
        setProcurementDraftNotice(null);
    };
    const getPaymentStatusLabel = (purchase: Purchase) => {
        const returnReferenceDetails = getReturnReferenceDetails(purchase);
        if (returnReferenceDetails && returnReferenceDetails.creditedAmount > 0 && purchase.paidAmount <= 0 && purchase.remainingAmount <= 0) {
            return tr('Closed by Vendor Credit', 'تسویه با اعتبار مرجوعی');
        }
        if (returnReferenceDetails && returnReferenceDetails.creditedAmount > 0 && purchase.remainingAmount > 0) {
            return tr('Partial Vendor Credit', 'اعتبار مرجوعی جزئی');
        }
        return purchase.paymentStatus === 'paid'
            ? tr('Paid in Full', 'تسویه کامل')
            : purchase.paymentStatus === 'partial'
                ? tr('Partial Payment', 'پرداخت جزئی')
                : tr('Open Balance', 'مانده باز');
    };
    const getWorkflowStatusLabel = (purchase: Purchase) => {
        if (getReturnReferenceDetails(purchase)) {
            return tr('Return Recorded', 'مرجوع ثبت شد');
        }
        return purchase.shortClosedAt
            ? tr('Short Closed', 'بسته ناقص')
            : purchase.workflowStatus === 'draft'
                ? tr('Draft', 'پیش‌نویس')
                : purchase.workflowStatus === 'approved'
                    ? tr('Approved', 'تأیید شده')
                    : purchase.workflowStatus === 'cancelled'
                        ? tr('Cancelled', 'لغو شده')
                        : tr('Received', 'دریافت شده');
    };
    const getPaymentBadge = (purchase: Purchase) => {
        const returnReferenceDetails = getReturnReferenceDetails(purchase);
        if (returnReferenceDetails && returnReferenceDetails.creditedAmount > 0 && purchase.paidAmount <= 0 && purchase.remainingAmount <= 0) {
            return <StatusBadge label={getPaymentStatusLabel(purchase)} tone="info" dot/>;
        }
        return purchase.paymentStatus === 'paid'
            ? <StatusBadge label={getPaymentStatusLabel(purchase)} tone="success" dot/>
            : purchase.paymentStatus === 'partial'
                ? <StatusBadge label={getPaymentStatusLabel(purchase)} tone="warning" dot/>
                : <StatusBadge label={getPaymentStatusLabel(purchase)} tone="danger" dot/>;
    };
    const getWorkflowBadge = (purchase: Purchase) => {
        if (getReturnReferenceDetails(purchase)) {
            return <StatusBadge label={getWorkflowStatusLabel(purchase)} tone="info" dot/>;
        }
        return purchase.shortClosedAt
            ? <StatusBadge label={getWorkflowStatusLabel(purchase)} tone="warning" dot/>
            : purchase.workflowStatus === 'draft'
                ? <StatusBadge label={getWorkflowStatusLabel(purchase)} tone="warning" dot/>
                : purchase.workflowStatus === 'approved'
                    ? <StatusBadge label={getWorkflowStatusLabel(purchase)} tone="info" dot/>
                    : purchase.workflowStatus === 'cancelled'
                        ? <StatusBadge label={getWorkflowStatusLabel(purchase)} tone="danger" dot/>
                        : <StatusBadge label={getWorkflowStatusLabel(purchase)} tone="success" dot/>;
    };
    const getSupplierStatusTone = (status?: Supplier['status']) => {
        switch (status) {
            case 'blocked':
                return 'danger' as const;
            case 'inactive':
                return 'neutral' as const;
            default:
                return 'success' as const;
        }
    };
    const getPaymentMethodLabel = (method?: PurchasePaymentMethod | string) => {
        switch (method) {
            case 'cash':
                return tr('Cash', 'نقد');
            case 'credit':
                return tr('Credit', 'نسیه');
            case 'mixed':
                return tr('Mixed', 'ترکیبی');
            case 'bank_transfer':
                return tr('Bank Transfer', 'انتقال بانکی');
            case 'card':
                return tr('Card', 'کارت');
            case 'cheque':
                return tr('Cheque', 'چک');
            default:
                return '-';
        }
    };
    const getLedgerTypeLabel = (type?: string) => {
        switch (type) {
            case 'purchase':
                return tr('Purchase', 'خرید');
            case 'payment':
                return tr('Payment', 'پرداخت');
            case 'return':
                return tr('Return', 'مرجوعی');
            // NEW: Supplier Ledger label for vendor-credit transactions.
            case 'vendor_credit':
                return tr('Vendor Credit', 'اعتبار مرجوعی');
            case 'initial':
                return tr('Opening', 'افتتاحیه');
            default:
                return type || '-';
        }
    };
    const getAuditActionLabel = (action?: string) => {
        switch (action) {
            case 'created':
                return tr('Created', 'ایجاد');
            case 'updated':
                return tr('Updated', 'ویرایش');
            case 'deleted':
                return tr('Deleted', 'حذف');
            case 'payment_recorded':
                return tr('Payment Recorded', 'ثبت پرداخت');
            default:
                return action || '-';
        }
    };
    const filteredMedicineSuggestions = useMemo(() => {
        const term = itemEditor.search.trim().toLowerCase();
        if (!term)
            return [];
        return medicines.filter((medicine) => {
            if (medicine.isDeleted)
                return false;
            const searchable = [
                medicine.name,
                medicine.genericName || '',
                medicine.manufacturer || '',
                medicine.barcode || '',
                ...(medicine.batches || []).map((batch) => batch.batchNumber)
            ].join(' ').toLowerCase();
            return searchable.includes(term);
        }).slice(0, 8);
    }, [itemEditor.search, medicines]);
    const supplierInsights = useMemo(() => {
        return activeSuppliers.reduce<Record<string, {
            totalSpend: number;
            lastPurchaseDate?: string;
            lastInteractionDate?: string;
            openAmount: number;
            openInvoices: number;
            vendorCreditCount: number;
            vendorCreditAmount: number;
            returnReferenceCount: number;
            partialReceiptCount: number;
            completionRate: number;
            averagePurchaseRate: number;
        }>>((acc, supplier) => {
            const relatedPurchases = sortedPurchases.filter((purchase) => purchase.supplierId === supplier.id);
            const lastInteraction = [...(supplier.transactions || []).map((txn) => txn.date), supplier.updatedAt || '', supplier.lastInteractionDate || '']
                .filter(Boolean)
                .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
            const completedPurchases = relatedPurchases.filter((purchase) => purchase.workflowStatus !== 'cancelled');
            const totalOrderedQty = completedPurchases.reduce((sum, purchase) => sum + purchase.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
            const totalReceivedQty = completedPurchases.reduce((sum, purchase) => sum + getPurchaseReceivedQuantity(purchase), 0);
            const pricedLines = completedPurchases.flatMap((purchase) => purchase.items.map((item) => item.purchasePrice).filter((rate) => rate > 0));
            acc[supplier.id] = {
                totalSpend: relatedPurchases.reduce((sum, purchase) => sum + purchase.totalAmount, 0),
                openAmount: relatedPurchases.reduce((sum, purchase) => sum + (purchase.workflowStatus !== 'cancelled' ? purchase.remainingAmount : 0), 0),
                openInvoices: relatedPurchases.filter((purchase) => purchase.remainingAmount > 0 && purchase.workflowStatus !== 'cancelled').length,
                lastPurchaseDate: relatedPurchases[0]?.date || supplier.lastPurchaseDate,
                lastInteractionDate: lastInteraction,
                vendorCreditCount: relatedPurchases.reduce((sum, purchase) => sum + (purchase.vendorCredits?.length || 0), 0),
                vendorCreditAmount: relatedPurchases.reduce((sum, purchase) => sum + getPurchaseVendorCreditTotal(purchase.vendorCredits || []), 0),
                returnReferenceCount: relatedPurchases.filter((purchase) => isInventoryReturnReferencePurchase(purchase)).length,
                partialReceiptCount: relatedPurchases.filter((purchase) => purchase.receiptStatus === 'partial').length,
                completionRate: totalOrderedQty > 0 ? Math.min(100, (totalReceivedQty / totalOrderedQty) * 100) : 0,
                averagePurchaseRate: pricedLines.length ? pricedLines.reduce((sum, rate) => sum + rate, 0) / pricedLines.length : 0
            };
            return acc;
        }, {});
    }, [activeSuppliers, sortedPurchases]);
    const filteredSuppliers = useMemo(() => {
        const term = supplierSearch.trim().toLowerCase();
        const now = Date.now();
        return [...suppliers].filter((supplier) => {
            if (supplier.isDeleted)
                return false;
            const searchable = [supplier.name, supplier.companyName || '', supplier.phone || '', supplier.code || '', supplier.contactPerson || '', supplier.address || ''].join(' ').toLowerCase();
            const status = supplier.status || 'active';
            const insight = supplierInsights[supplier.id];
            const finance = supplierFinanceById.get(supplier.id) || getSupplierFinanceSummary(supplier, normalizedPurchases);
            const interactionDate = insight?.lastInteractionDate ? new Date(insight.lastInteractionDate).getTime() : 0;
            const interactionAgeDays = interactionDate ? (now - interactionDate) / 86400000 : Number.POSITIVE_INFINITY;
            const matchesSearch = !term || searchable.includes(term);
            const matchesDebt = supplierDebtFilter === 'all'
                || (supplierDebtFilter === 'with_debt' && finance.openDebt > 0)
                || (supplierDebtFilter === 'settled' && finance.openDebt === 0 && finance.supplierPrepayment === 0)
                || (supplierDebtFilter === 'prepaid' && finance.openDebt === 0 && finance.supplierPrepayment > 0)
                || (supplierDebtFilter === 'high_debt' && finance.openDebt >= 10000);
            const matchesStatus = supplierStatusFilter === 'all' || status === supplierStatusFilter;
            const matchesInteraction = supplierInteractionFilter === 'all'
                || (supplierInteractionFilter === '7d' && interactionAgeDays <= 7)
                || (supplierInteractionFilter === '30d' && interactionAgeDays <= 30)
                || (supplierInteractionFilter === '90d' && interactionAgeDays <= 90);
            return matchesSearch && matchesDebt && matchesStatus && matchesInteraction;
        }).sort((a, b) => {
            const aInsight = supplierInsights[a.id];
            const bInsight = supplierInsights[b.id];
            const aFinance = supplierFinanceById.get(a.id) || getSupplierFinanceSummary(a, normalizedPurchases);
            const bFinance = supplierFinanceById.get(b.id) || getSupplierFinanceSummary(b, normalizedPurchases);
            switch (supplierSort) {
                case 'debt_asc': {
                    const diff = aFinance.openDebt - bFinance.openDebt;
                    return diff !== 0 ? diff : a.name.localeCompare(b.name);
                }
                case 'name_asc': return a.name.localeCompare(b.name);
                case 'name_desc': return b.name.localeCompare(a.name);
                case 'last_purchase_desc': return new Date(bInsight?.lastPurchaseDate || 0).getTime() - new Date(aInsight?.lastPurchaseDate || 0).getTime();
                case 'interaction_desc': return new Date(bInsight?.lastInteractionDate || 0).getTime() - new Date(aInsight?.lastInteractionDate || 0).getTime();
                default: {
                    const diff = bFinance.openDebt - aFinance.openDebt;
                    return diff !== 0 ? diff : a.name.localeCompare(b.name);
                }
            }
        });
    }, [supplierSearch, supplierDebtFilter, supplierStatusFilter, supplierInteractionFilter, supplierSort, supplierFinanceById, supplierInsights, suppliers, normalizedPurchases]);
    const filteredHistory = useMemo(() => {
        const term = historySearch.trim().toLowerCase();
        const minAmount = parseAmountInput(historyAmountMin);
        const maxAmount = parseAmountInput(historyAmountMax);
        return [...visibleProcurementPurchases].filter((purchase) => {
            const supplier = supplierById.get(purchase.supplierId);
            const linkedReturnSummary = getLinkedReturnSummary(purchase);
            const searchable = [
                purchase.invoiceNumber || '',
                purchase.notes || '',
                supplier?.name || '',
                supplier?.companyName || '',
                ...purchase.items.map((item) => item.medicineName || medicineById.get(item.medicineId)?.name || ''),
                ...(linkedReturnSummary?.entries.flatMap((entry) => [
                    entry.documentLabel,
                    entry.sourceBatchLabel,
                    entry.resolutionLabel,
                    entry.returnNote,
                ]) || []),
            ].join(' ').toLowerCase();
            const purchaseDate = new Date(purchase.date).getTime();
            const matchesSearch = !term || searchable.includes(term);
            const matchesSupplier = historySupplierFilter === 'all' || purchase.supplierId === historySupplierFilter;
            const matchesFrom = !historyDateFrom || purchaseDate >= new Date(historyDateFrom).getTime();
            const matchesTo = !historyDateTo || purchaseDate <= new Date(historyDateTo).getTime();
            const matchesMin = !historyAmountMin || purchase.totalAmount >= minAmount;
            const matchesMax = !historyAmountMax || purchase.totalAmount <= maxAmount;
            const matchesStatus = historyStatusFilter === 'all'
                || (historyStatusFilter === 'open' && purchase.remainingAmount > 0 && purchase.workflowStatus !== 'cancelled')
                || (historyStatusFilter === 'overdue' && isPurchaseOverdue(purchase))
                || (historyStatusFilter === 'paid' && purchase.paymentStatus === 'paid')
                || (historyStatusFilter === 'partial' && purchase.paymentStatus === 'partial')
                || (historyStatusFilter === 'draft' && purchase.workflowStatus === 'draft')
                || (historyStatusFilter === 'approved' && purchase.workflowStatus === 'approved')
                || (historyStatusFilter === 'received' && purchase.workflowStatus === 'received')
                || (historyStatusFilter === 'cancelled' && purchase.workflowStatus === 'cancelled');
            return matchesSearch && matchesSupplier && matchesFrom && matchesTo && matchesMin && matchesMax && matchesStatus;
        }).sort((a, b) => {
            switch (historySort) {
                case 'date_asc': return new Date(a.date).getTime() - new Date(b.date).getTime();
                case 'amount_desc': return b.totalAmount - a.totalAmount;
                case 'amount_asc': return a.totalAmount - b.totalAmount;
                case 'remaining_desc': return b.remainingAmount - a.remainingAmount;
                default: return new Date(b.date).getTime() - new Date(a.date).getTime();
            }
        });
    }, [historyAmountMax, historyAmountMin, historyDateFrom, historyDateTo, historySearch, historySort, historyStatusFilter, historySupplierFilter, medicineById, supplierById, visibleProcurementPurchases]);
    const pagedHistory = useMemo(() => {
        const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
        return filteredHistory.slice(start, start + HISTORY_PAGE_SIZE);
    }, [filteredHistory, historyPage]);
    const historyTotals = useMemo(() => ({
        total: filteredHistory.reduce((sum, purchase) => sum + purchase.totalAmount, 0),
        paid: filteredHistory.reduce((sum, purchase) => sum + purchase.paidAmount, 0),
        remaining: filteredHistory.reduce((sum, purchase) => sum + purchase.remainingAmount, 0)
    }), [filteredHistory]);
    const historyStateCounts = useMemo(() => ({
        open: filteredHistory.filter((purchase) => purchase.remainingAmount > 0 && purchase.workflowStatus !== 'cancelled').length,
        overdue: filteredHistory.filter((purchase) => isPurchaseOverdue(purchase)).length,
        partial: filteredHistory.filter((purchase) => purchase.paymentStatus === 'partial').length,
        paid: filteredHistory.filter((purchase) => purchase.paymentStatus === 'paid').length
    }), [filteredHistory]);
    const historyActiveFilters = useMemo(() => {
        const nextFilters: string[] = [];
        if (historySupplierFilter !== 'all')
            nextFilters.push(supplierById.get(historySupplierFilter)?.name || tr('Selected supplier', 'تأمین‌کننده انتخاب‌شده'));
        if (historyStatusFilter !== 'all')
            nextFilters.push(tr(`Status: ${historyStatusFilter}`, `وضعیت: ${historyStatusFilter}`));
        if (historyDateFrom)
            nextFilters.push(`${tr('From', 'از')}: ${formatDate(historyDateFrom)}`);
        if (historyDateTo)
            nextFilters.push(`${tr('To', 'تا')}: ${formatDate(historyDateTo)}`);
        if (historyAmountMin)
            nextFilters.push(`${tr('Min', 'حداقل')}: ${formatMoney(parseAmountInput(historyAmountMin))}`);
        if (historyAmountMax)
            nextFilters.push(`${tr('Max', 'حداکثر')}: ${formatMoney(parseAmountInput(historyAmountMax))}`);
        return nextFilters;
    }, [formatDate, formatMoney, historyAmountMax, historyAmountMin, historyDateFrom, historyDateTo, historyStatusFilter, historySupplierFilter, supplierById, tr]);
    const historyPageCount = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
    const resetHistoryFilters = () => {
        setHistorySearch('');
        setHistorySupplierFilter('all');
        setHistoryStatusFilter('all');
        setHistoryDateFrom('');
        setHistoryDateTo('');
        setHistoryAmountMin('');
        setHistoryAmountMax('');
        setHistorySort('date_desc');
    };
    const renderHistoryDateRangeFilter = (key = 'history-date-range') => (<FilterRangeField key={key} label={tr('Date range', 'بازه تاریخ')} startLabel={tr('From', 'از')} endLabel={tr('To', 'تا')} startControl={<input type="date" value={historyDateFrom} onChange={(event) => setHistoryDateFrom(event.target.value)} aria-label={tr('From date', 'از تاریخ')} className="wk-input wk-date-input"/>} endControl={<input type="date" value={historyDateTo} onChange={(event) => setHistoryDateTo(event.target.value)} aria-label={tr('To date', 'تا تاریخ')} className="wk-input wk-date-input"/>}/>);
    const renderHistoryAmountRangeFilter = (key = 'history-amount-range') => (<FilterRangeField key={key} label={tr('Amount range', 'بازه مبلغ')} startLabel={tr('Minimum', 'حداقل')} endLabel={tr('Maximum', 'حداکثر')} startControl={<input type="text" inputMode="decimal" value={historyAmountMin} onChange={(event) => setHistoryAmountMin(normalizePersianNumbers(event.target.value))} placeholder={tr('Min amount', 'حداقل مبلغ')} aria-label={tr('Minimum amount', 'حداقل مبلغ')} className="wk-input wk-input--ltr"/>} endControl={<input type="text" inputMode="decimal" value={historyAmountMax} onChange={(event) => setHistoryAmountMax(normalizePersianNumbers(event.target.value))} placeholder={tr('Max amount', 'حداکثر مبلغ')} aria-label={tr('Maximum amount', 'حداکثر مبلغ')} className="wk-input wk-input--ltr"/>}/>);
    const currentSupplierHistory = useMemo(() => selectedSupplier ? visibleProcurementPurchases.filter((purchase) => purchase.supplierId === selectedSupplier.id).slice(0, 4) : [], [selectedSupplier, visibleProcurementPurchases]);
    const supplierProfilePurchases = useMemo(() => selectedSupplierProfile ? visibleProcurementPurchases.filter((purchase) => purchase.supplierId === selectedSupplierProfile.id) : [], [selectedSupplierProfile, visibleProcurementPurchases]);
    const supplierProfileOutstanding = useMemo(() => supplierProfilePurchases.filter((purchase) => purchase.remainingAmount > 0 && purchase.workflowStatus !== 'cancelled' && purchase.workflowStatus !== 'draft'), [supplierProfilePurchases]);
    const openSupplierModal = (supplier?: Supplier) => {
        if (!canManagePurchases) {
            window.alert(tr('Purchase management is locked for this user.', 'دسترسی این کاربر به مدیریت خرید محدود است.'));
            return;
        }
        if (!supplier) {
            setEditingSupplierId(null);
            setSupplierForm(createEmptySupplierForm());
        }
        else {
            const openingBalance = typeof supplier.openingBalance === 'number' ? supplier.openingBalance : supplier.balance || 0;
            setEditingSupplierId(supplier.id);
            setSupplierForm({
                name: supplier.name,
                code: supplier.code || '',
                phone: supplier.phone || '',
                companyName: supplier.companyName || '',
                contactPerson: supplier.contactPerson || '',
                email: supplier.email || '',
                address: supplier.address || '',
                paymentTerms: supplier.paymentTerms || '',
                notes: supplier.notes || '',
                openingBalance: String(Math.abs(openingBalance)),
                openingBalanceMode: openingBalance > 0 ? 'debt' : openingBalance < 0 ? 'credit' : 'settled',
                status: supplier.status || 'active'
            });
        }
        setSupplierModalOpen(true);
    };
    const handleSaveSupplier = () => {
        if (!canManagePurchases)
            return;
        if (!supplierForm.name.trim()) {
            window.alert(tr('Supplier name is required.', 'نام تأمین‌کننده الزامی است.'));
            return;
        }
        const openingBalanceAmount = Math.abs(parseAmountInput(supplierForm.openingBalance));
        const signedOpeningBalance = supplierForm.openingBalanceMode === 'debt'
            ? openingBalanceAmount
            : supplierForm.openingBalanceMode === 'credit'
                ? -openingBalanceAmount
                : 0;
        const payload = {
            name: supplierForm.name.trim(),
            code: supplierForm.code.trim().toUpperCase(),
            phone: normalizePersianNumbers(supplierForm.phone.trim()),
            companyName: supplierForm.companyName.trim(),
            contactPerson: supplierForm.contactPerson.trim(),
            email: supplierForm.email.trim(),
            address: supplierForm.address.trim(),
            paymentTerms: supplierForm.paymentTerms.trim(),
            notes: supplierForm.notes.trim(),
            openingBalance: signedOpeningBalance,
            balance: signedOpeningBalance,
            status: supplierForm.status,
            transactions: [] as Supplier['transactions']
        };
        if (editingSupplierId)
            onUpdateSupplier(editingSupplierId, payload);
        else
            onAddSupplier(payload);
        setSupplierModalOpen(false);
    };
    const handleSelectSupplierByLookup = () => {
        const query = purchaseForm.supplierCodeLookup.trim().toLowerCase();
        if (!query)
            return;
        const supplier = supplierLookupMatches[0];
        if (!supplier) {
            window.alert(tr('No supplier was found with this code or name.', 'هیچ تأمین‌کننده‌ای با این کد یا نام پیدا نشد.'));
            return;
        }
        setPurchaseForm((current) => ({ ...current, supplierId: supplier.id, supplierCodeLookup: supplier.code || supplier.name, confirmUnknownSupplier: false }));
    };
    const handleSelectMedicine = (medicine: Medicine) => {
        const lastBatch = medicine.batches?.[medicine.batches.length - 1];
        const preferredSupplier = medicine.preferredSupplierId ? supplierById.get(medicine.preferredSupplierId) || null : null;
        const usablePreferredSupplier = preferredSupplier && !preferredSupplier.isDeleted ? preferredSupplier : null;
        if (!purchaseForm.supplierId && usablePreferredSupplier) {
            setPurchaseForm((current) => ({
                ...current,
                supplierId: usablePreferredSupplier.id,
                supplierCodeLookup: usablePreferredSupplier.code || usablePreferredSupplier.name
            }));
        }
        setItemEditor((current) => ({
            ...current,
            search: medicine.name,
            medicineId: medicine.id,
            batchNumber: current.batchNumber || lastBatch?.batchNumber || `B-${Date.now().toString().slice(-5)}`,
            expiryDate: current.expiryDate || lastBatch?.expiryDate || '',
            quantity: current.quantity || '',
            purchasePrice: current.purchasePrice || (lastBatch?.purchasePrice ? String(lastBatch.purchasePrice) : ''),
            barcode: medicine.barcode || '',
            unit: medicine.unit || '',
            minimumOrderQuantity: current.minimumOrderQuantity || String(Math.max(10, medicine.lowStockThreshold || 1))
        }));
    };
    const handleAddOrUpdateItem = () => {
        if (!canManagePurchases)
            return;
        const medicine = medicineById.get(itemEditor.medicineId);
        const quantity = parseAmountInput(itemEditor.quantity);
        const purchasePrice = parseAmountInput(itemEditor.purchasePrice);
        if (!medicine) {
            window.alert(tr('Please select a valid item.', 'لطفاً یک قلم معتبر انتخاب کنید.'));
            return;
        }
        if (quantity <= 0) {
            window.alert(tr('Quantity must be greater than zero.', 'تعداد باید بیشتر از صفر باشد.'));
            return;
        }
        const existingLineId = editingItemIndex !== null ? items[editingItemIndex]?.lineId : undefined;
        const nextItem: PurchaseItem = {
            lineId: existingLineId || createUniqueId('pline'),
            medicineId: medicine.id,
            medicineName: medicine.name,
            barcode: itemEditor.barcode || medicine.barcode || '',
            unit: itemEditor.unit || medicine.unit || '',
            baseQuantity: quantity,
            purchaseUnitName: itemEditor.unit || medicine.unit || '',
            purchaseUnitConversionFactor: 1,
            baseUnit: medicine.baseUnit || medicine.unit || '',
            batchNumber: itemEditor.batchNumber.trim() || `B-${Date.now().toString().slice(-5)}`,
            expiryDate: itemEditor.expiryDate || '',
            quantity,
            purchasePrice,
            purchaseType: 'normal',
            notes: itemEditor.notes.trim(),
            minimumOrderQuantity: parseAmountInput(itemEditor.minimumOrderQuantity) || undefined,
            suggestedQuantity: parseAmountInput(itemEditor.suggestedQuantity) || undefined,
            lineTotal: quantity * purchasePrice
        };
        const isAddingNewLine = editingItemIndex === null;
        setItems((current) => isAddingNewLine ? [...current, nextItem] : current.map((item, index) => index === editingItemIndex ? nextItem : item));
        setItemEditor(createEmptyItemEditor());
        setEditingItemIndex(null);
        searchInputRef.current?.focus();
    };
    const editItem = (index: number) => {
        const item = items[index];
        const medicine = medicineById.get(item.medicineId);
        setEditingItemIndex(index);
        setItemEditor({
            search: item.medicineName || medicine?.name || '',
            medicineId: item.medicineId,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            quantity: String(item.quantity),
            purchasePrice: String(item.purchasePrice),
            barcode: item.barcode || medicine?.barcode || '',
            unit: item.unit || medicine?.unit || '',
            notes: item.notes || '',
            minimumOrderQuantity: item.minimumOrderQuantity ? String(item.minimumOrderQuantity) : '',
            suggestedQuantity: item.suggestedQuantity ? String(item.suggestedQuantity) : ''
        });
        setActiveTab('new');
        setNewPurchaseStep('items');
        window.requestAnimationFrame(() => {
            searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            searchInputRef.current?.focus();
        });
    };
    const removeItem = (index: number) => {
        if (!canManagePurchases)
            return;
        setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
        if (editingItemIndex === index) {
            setEditingItemIndex(null);
            setItemEditor(createEmptyItemEditor());
        }
    };
    const addPaymentDraft = () => {
        if (!canManagePurchases)
            return;
        const amount = parseAmountInput(paymentDraft.amount);
        if (amount <= 0) {
            window.alert(tr('Enter a valid payment amount.', 'یک مبلغ معتبر برای پرداخت وارد کنید.'));
            return;
        }
        setPayments((current) => [...current, {
                id: createUniqueId('draft-payment'),
                date: paymentDraft.date || todayInput(),
                amount,
                method: paymentDraft.method,
                reference: paymentDraft.reference.trim(),
                note: paymentDraft.note.trim()
            }]);
        setPaymentDraft(createEmptyPaymentDraft());
    };
    const removePaymentDraft = (paymentId: string) => {
        if (!canManagePurchases)
            return;
        setPayments((current) => current.filter((payment) => payment.id !== paymentId));
    };
    const handleAttachmentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []).slice(0, Math.max(0, MAX_ATTACHMENTS - attachments.length));
        if (!files.length)
            return;
        if (files.some((file) => !isSupportedAttachmentFile(file))) {
            window.alert(tr('Choose a PDF, JPG, PNG, WebP, GIF, or BMP document.', 'یک فایل PDF یا تصویر JPG، PNG، WebP، GIF یا BMP انتخاب کنید.'));
            event.target.value = '';
            return;
        }
        const oversize = files.find((file) => file.size > MAX_ATTACHMENT_SIZE);
        if (oversize) {
            window.alert(tr(`Attachment "${oversize.name}" exceeds 2 MB.`, `فایل "${oversize.name}" از سقف ۲ مگابایت بیشتر است.`));
            return;
        }
        const nextAttachments = await Promise.all(files.map(async (file) => ({
            id: createUniqueId('attachment'),
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            dataUrl: await readFileAsDataUrl(file),
            uploadedAt: new Date().toISOString()
        })));
        setAttachments((current) => [...current, ...nextAttachments]);
        event.target.value = '';
    };
    const removeAttachment = (attachmentId: string) => {
        if (!canManagePurchases)
            return;
        setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    };
    const handleAutoFillLowStock = () => {
        if (!canManagePurchases)
            return;
        const suggestions = medicines.filter((medicine) => !medicine.isDeleted).reduce<PurchaseItem[]>((acc, medicine) => {
            const currentStock = (medicine.batches || []).reduce((sum, batch) => sum + batch.quantity, 0);
            if (currentStock >= medicine.lowStockThreshold)
                return acc;
            const minimumOrderQuantity = Math.max(10, medicine.lowStockThreshold || 1);
            const suggestedQuantity = Math.max(minimumOrderQuantity, (medicine.lowStockThreshold * 3) - currentStock);
            const lastBatch = medicine.batches?.[medicine.batches.length - 1];
            acc.push({
                lineId: createUniqueId('pline'),
                medicineId: medicine.id,
                medicineName: medicine.name,
                barcode: medicine.barcode || '',
                unit: medicine.unit || '',
                batchNumber: `AUTO-${Date.now().toString().slice(-5)}`,
                expiryDate: lastBatch?.expiryDate || '',
                quantity: suggestedQuantity,
                baseQuantity: suggestedQuantity,
                purchaseUnitName: medicine.unit || '',
                purchaseUnitConversionFactor: 1,
                baseUnit: medicine.baseUnit || medicine.unit || '',
                purchasePrice: lastBatch?.purchasePrice || 0,
                minimumOrderQuantity,
                suggestedQuantity,
                notes: tr(`Current stock ${currentStock} vs threshold ${medicine.lowStockThreshold}.`, `موجودی فعلی ${currentStock} در برابر حد هشدار ${medicine.lowStockThreshold}.`),
                lineTotal: suggestedQuantity * (lastBatch?.purchasePrice || 0)
            });
            return acc;
        }, []);
        if (!suggestions.length) {
            window.alert(tr('No stock shortage was found for auto-fill.', 'هیچ کسری انبار برای پر کردن خودکار پیدا نشد.'));
            return;
        }
        setAutoFillPreview(suggestions);
    };
    const acceptAutoFillPreview = () => {
        setItems((current) => [...current, ...autoFillPreview]);
        setAutoFillPreview([]);
    };
    const populatePurchaseEditor = (purchase: Purchase, duplicate = false) => {
        const normalizedPurchase = normalizePurchaseRecord(purchase);
        const supplier = supplierById.get(purchase.supplierId);
        setProcurementDraftNotice(null);
        setEditingPurchaseId(duplicate ? null : purchase.id);
        setPurchaseForm({
            supplierId: purchase.supplierId,
            supplierCodeLookup: supplier?.code || supplier?.name || '',
            partnerId: purchase.partnerId || '',
            invoiceNumber: purchase.invoiceNumber || '',
            date: purchase.date || todayInput(),
            dueDate: purchase.dueDate || '',
            workflowStatus: duplicate ? 'received' : (purchase.workflowStatus || 'received'),
            stockEntryType: purchase.stockEntryType || (purchase.partnerId ? 'partner_goods_capital' : 'store_purchase'),
            destinationWarehouse: purchase.destinationWarehouse || tr('Main warehouse', 'گدام اصلی'),
            discountAmount: String(purchase.discountAmount || 0),
            taxAmount: String(purchase.taxAmount || 0),
            shippingAmount: String(purchase.shippingAmount || 0),
            extraChargesAmount: String(purchase.extraChargesAmount || 0),
            notes: purchase.notes || '',
            confirmUnknownSupplier: !isUnknownSupplier(supplier)
        });
        setItems(normalizedPurchase.items);
        setPayments(duplicate ? [] : (normalizedPurchase.payments || []).map((payment) => ({ ...payment })));
        setAttachments(duplicate ? [] : (purchase.attachments || []).map((attachment) => ({ ...attachment })));
        setItemEditor(createEmptyItemEditor());
        setEditingItemIndex(null);
        setPaymentDraft(createEmptyPaymentDraft());
        setActiveTab('new');
        setNewPurchaseStep(duplicate || normalizedPurchase.items.length ? 'items' : 'supplier');
    };
    const createDefaultReceiptQuantities = (sourceItems: PurchaseItem[]) => sourceItems.reduce<Record<number, string>>((acc, item, index) => {
        const orderedQuantity = Math.max(0, item.baseQuantity ?? item.quantity);
        acc[index] = orderedQuantity > 0 ? String(orderedQuantity) : '';
        return acc;
    }, {});
    const buildReceiptItemsFromQuantities = (sourceItems: PurchaseItem[], quantities: Record<number, string>, supplierId: string): PurchaseReceiptItem[] => sourceItems.flatMap((item, index) => {
        const requestedQuantity = parseAmountInput(quantities[index] || '');
        if (requestedQuantity <= 0)
            return [];
        const orderedQuantity = Math.max(0, item.baseQuantity ?? item.quantity);
        const acceptedQuantity = Math.min(orderedQuantity, requestedQuantity);
        if (acceptedQuantity <= 0)
            return [];
        return [{
                lineId: item.lineId,
                medicineId: item.medicineId,
                purchaseItemIndex: index,
                batchNumber: item.batchNumber,
                expiryDate: item.expiryDate,
                quantity: acceptedQuantity,
                baseQuantity: acceptedQuantity,
                purchaseUnitName: item.purchaseUnitName || item.unit,
                purchaseUnitConversionFactor: item.purchaseUnitConversionFactor || 1,
                baseUnit: item.baseUnit || item.unit,
                purchasePrice: item.purchasePrice,
                supplierId
            }];
    });
    const submitPurchase = async (mode: 'draft' | 'final', confirmedReceiptItems?: PurchaseReceiptItem[]) => {
        if (!canManagePurchases || isPurchaseSubmitPending)
            return;
        if (!purchaseForm.supplierId) {
            window.alert(tr('Please choose a supplier first.', 'ابتدا یک تأمین‌کننده انتخاب کنید.'));
            return;
        }
        if (mode === 'final' && !items.length) {
            window.alert(tr('Final invoice requires at least one valid item.', 'فاکتور نهایی حداقل به یک قلم معتبر نیاز دارد.'));
            return;
        }
        if (mode === 'final' && totalAmount <= 0) {
            window.alert(tr('Final invoice total must be greater than zero.', 'جمع نهایی فاکتور باید بیشتر از صفر باشد.'));
            return;
        }
        if (supplierIsUnknown && mode === 'final' && !purchaseForm.confirmUnknownSupplier) {
            window.alert(tr('Unknown supplier must be confirmed before final save.', 'تأمین‌کننده نامعلوم باید پیش از ثبت نهایی تأیید شود.'));
            return;
        }
        if (mode === 'final' && confirmedReceiptItems === undefined) {
            setFinalReceiptLineQuantities(createDefaultReceiptQuantities(items));
            setFinalReceiptNote('');
            setIsFinalReceiptModalOpen(true);
            return;
        }
        const finalReceiptItems = confirmedReceiptItems || [];
        const workflowStatus = mode === 'draft' ? 'draft' : finalReceiptItems.length > 0 ? 'received' : 'approved';
        const receivedLineIndexes = new Set(finalReceiptItems.map((item) => item.purchaseItemIndex).filter((index): index is number => typeof index === 'number'));
        const receivedZeroCostNormalItem = items.some((item, index) => (receivedLineIndexes.has(index)
            && (item.purchaseType || 'normal') === 'normal'
            && item.purchasePrice <= 0));
        if (mode === 'final' && workflowStatus === 'received' && receivedZeroCostNormalItem) {
            window.alert(tr('Received normal purchases cannot contain a zero purchase price. Mark bonus/sample items separately before receiving.', 'خرید دریافت‌شده با قلم عادی نمی‌تواند قیمت خرید صفر داشته باشد. اقلام رایگان/نمونه باید جدا ثبت شوند.'));
            return;
        }
        if ((purchaseForm.stockEntryType === 'partner_goods_capital' || purchaseForm.stockEntryType === 'partner_consignment') && !purchaseForm.partnerId) {
            window.alert(tr('Choose the partner owner for this stock entry.', 'برای این نوع ورود، مالک شریک را انتخاب کنید.'));
            return;
        }
        const finalReceipt: PurchaseReceipt | null = mode === 'final' && finalReceiptItems.length > 0 ? {
            id: createUniqueId('receipt'),
            date: todayInput(),
            items: finalReceiptItems,
            note: finalReceiptNote.trim(),
            supplierLiabilityImpact: true
        } : null;
        const paymentMethod: PurchasePaymentMethod = payments.length > 1 ? 'mixed' : payments[0]?.method || (remainingAmount > 0 ? 'credit' : 'cash');
        const invoiceNumber = purchaseForm.invoiceNumber.trim();
        const duplicateDisplayPurchase = !editingPurchaseId && invoiceNumber
            ? normalizedPurchases.find((purchase) => (!purchase.isDeleted
                && purchase.supplierId === purchaseForm.supplierId
                && purchase.workflowStatus !== 'cancelled'
                && (purchase.invoiceNumber || '').trim().toLowerCase() === invoiceNumber.toLowerCase()))
            : null;
        if (duplicateDisplayPurchase) {
            window.alert(tr('This purchase invoice number already exists for the selected supplier. Open the existing invoice and add or edit lines there instead of creating a second block with the same label.', 'این شماره فاکتور خرید برای همین تأمین‌کننده قبلاً ثبت شده است. سند موجود را باز کنید و سطرها را همان‌جا اضافه یا ویرایش کنید تا بلاک دوم با همین نام ساخته نشود.'));
            populatePurchaseEditor(duplicateDisplayPurchase);
            return;
        }
        const payload = normalizePurchaseRecord({
            supplierId: purchaseForm.supplierId,
            partnerId: purchaseForm.partnerId || undefined,
            stockEntryType: purchaseForm.stockEntryType,
            ownershipType: purchaseForm.stockEntryType === 'partner_consignment'
                ? 'consignment'
                : purchaseForm.partnerId
                    ? 'partner'
                    : 'store',
            invoiceNumber,
            date: purchaseForm.date || todayInput(),
            dueDate: purchaseForm.dueDate || undefined,
            items: items.map((item) => ({
                ...item,
                partnerId: purchaseForm.partnerId || item.partnerId,
                ownerPartnerId: purchaseForm.partnerId || item.ownerPartnerId,
                stockEntryType: purchaseForm.stockEntryType,
                ownershipType: purchaseForm.stockEntryType === 'partner_consignment'
                    ? 'consignment'
                    : purchaseForm.partnerId
                        ? 'partner'
                        : 'store',
                sourceDocumentNumber: invoiceNumber || item.sourceDocumentNumber,
            })),
            subtotalAmount,
            discountAmount,
            taxAmount,
            shippingAmount,
            extraChargesAmount,
            totalAmount,
            paidAmount,
            remainingAmount,
            paymentMethod,
            paymentStatus,
            workflowStatus,
            status: resolvePurchaseStatus(workflowStatus, paymentStatus),
            destinationWarehouse: purchaseForm.destinationWarehouse.trim(),
            notes: purchaseForm.notes.trim(),
            payments,
            receipts: finalReceipt ? [finalReceipt] : [],
            inventoryCommitted: Boolean(finalReceipt),
            receivedAt: finalReceipt?.date,
            attachments
        });
        const batchPayload = finalReceipt ? buildPurchaseReceiptBatchPayload(purchaseForm.supplierId, items, finalReceipt.items, {
            destinationWarehouse: purchaseForm.destinationWarehouse,
            ownerPartnerId: purchaseForm.partnerId || undefined,
            ownershipType: purchaseForm.stockEntryType === 'partner_consignment'
                ? 'consignment'
                : purchaseForm.partnerId
                    ? 'partner'
                    : 'store',
            sourceEntryType: purchaseForm.stockEntryType,
            sourceReceiptId: finalReceipt.id,
            receivedAt: finalReceipt.date,
        }) : [];
        const batchIntegrityIssues = mode === 'final' && finalReceipt
            ? validatePurchaseBatchPayloadIntegrity(payload, batchPayload)
            : [];
        if (batchIntegrityIssues.length > 0) {
            window.alert(tr('Purchase save blocked: every received line must create exactly one valid batch record. Check batch number, quantity, and item selection for all received lines.', 'ثبت خرید متوقف شد: هر سطر دریافت‌شده باید دقیقاً یک batch معتبر بسازد. شماره batch، مقدار و انتخاب قلم را برای همه سطرهای دریافت‌شده بررسی کنید.'));
            return;
        }
        const setPendingState = mode === 'draft' ? setIsDraftSavePending : setIsFinalSavePending;
        setPendingState(true);
        try {
            const result = editingPurchaseId
                ? await onUpdatePurchase(editingPurchaseId, payload, batchPayload)
                : await onAddPurchase(payload, batchPayload);
            if (result === false)
                return;
            resetPurchaseEditor();
            setActiveTab('list');
        }
        catch (error) {
            console.error('Failed to save purchase.', error);
            window.alert(tr('Purchase save failed. Please try again.', 'ذخیره سند خرید انجام نشد. لطفاً دوباره تلاش کنید.'));
        }
        finally {
            setPendingState(false);
        }
    };
    const handleRecordPurchasePayment = () => {
        if (!purchasePaymentTarget)
            return;
        const amount = parseAmountInput(settlementAmount);
        if (amount <= 0) {
            window.alert(tr('Enter a valid payment amount.', 'یک مبلغ معتبر برای پرداخت وارد کنید.'));
            return;
        }
        onRecordPurchasePayment(purchasePaymentTarget.id, {
            date: todayInput(),
            amount,
            method: settlementMethod,
            reference: '',
            note: settlementNote.trim()
        });
        setPurchasePaymentTargetId(null);
        setSettlementAmount('');
        setSettlementNote('');
    };
    const handleConfirmDeletePurchase = () => {
        if (!pendingDeletePurchaseId)
            return;
        const deletingFocusedDraft = editingPurchaseId === pendingDeletePurchaseId;
        onDeletePurchase(pendingDeletePurchaseId);
        if (deletingFocusedDraft) {
            resetPurchaseEditor();
            setActiveTab('list');
        }
        setPendingDeletePurchaseId(null);
    };
    const openSupplierDeleteModal = (supplier: Supplier) => {
        setPendingDeleteSupplierId(supplier.id);
        setSupplierDeleteMode('conditional');
        setSupplierDeleteConfirmText('');
    };
    const handleConfirmDeleteSupplier = () => {
        if (!pendingDeleteSupplier || !onDeleteSupplier)
            return;
        if (supplierDeleteMode === 'purge' && supplierDeleteConfirmText.trim() !== pendingDeleteSupplier.name.trim()) {
            window.alert(tr('Type the supplier name exactly to confirm permanent deletion.', 'برای تأیید حذف کامل، نام تأمین‌کننده را دقیق وارد کنید.'));
            return;
        }
        if (supplierDeleteMode === 'purge' && pendingDeleteSupplierImpact.dependentSaleCount > 0) {
            window.alert(tr('This supplier has stock batches used in sales. Delete or return those sales before permanent deletion.', 'بچ‌های این تأمین‌کننده در فروش استفاده شده‌اند. پیش از حذف کامل، آن فروش‌ها را حذف یا برگشت بزنید.'));
            return;
        }
        onDeleteSupplier(pendingDeleteSupplier.id, supplierDeleteMode);
        if (selectedSupplierProfileId === pendingDeleteSupplier.id) {
            setSelectedSupplierProfileId(null);
        }
        setPendingDeleteSupplierId(null);
        setSupplierDeleteMode('conditional');
        setSupplierDeleteConfirmText('');
    };
    const openPurchaseReceiptModal = (purchase: Purchase) => {
        const receiptMap = buildPurchaseReceiptQuantityMap(purchase.receipts || []);
        const nextQuantities: Record<number, string> = {};
        purchase.items.forEach((item, index) => {
            const key = item.lineId ? `line:${item.lineId}` : `idx:${index}`;
            const alreadyReceived = receiptMap.get(key)?.quantity || 0;
            const remaining = Math.max(0, (item.baseQuantity ?? item.quantity) - alreadyReceived);
            nextQuantities[index] = remaining > 0 ? String(remaining) : '';
        });
        setReceiptLineQuantities(nextQuantities);
        setReceiptNote('');
        setPurchaseReceiptTargetId(purchase.id);
    };
    const openFinalizeDraftModal = (purchase: Purchase) => {
        if (!canManagePurchases || purchase.workflowStatus !== 'draft')
            return;
        setFinalizeDraftTargetId(purchase.id);
        setFinalizeDraftDueDate(purchase.dueDate || '');
        setReceiptLineQuantities(createDefaultReceiptQuantities(purchase.items || []));
        setReceiptNote('');
    };
    const handleFinalizeDraft = async () => {
        if (!finalizeDraftTarget || isFinalizeDraftPending)
            return;
        const supplier = supplierById.get(finalizeDraftTarget.supplierId) || null;
        if (!finalizeDraftTarget.items.length) {
            window.alert(tr('Final invoice requires at least one valid item.', 'فاکتور نهایی حداقل به یک قلم معتبر نیاز دارد.'));
            return;
        }
        if (finalizeDraftTarget.totalAmount <= 0) {
            window.alert(tr('Final invoice total must be greater than zero.', 'جمع نهایی فاکتور باید بیشتر از صفر باشد.'));
            return;
        }
        if (isUnknownSupplier(supplier)) {
            window.alert(tr('Choose or confirm a supplier before finalizing this draft.', 'پیش از نهایی‌سازی این پیش‌نویس، تأمین‌کننده را انتخاب یا تأیید کنید.'));
            return;
        }
        if (finalizeDraftTarget.remainingAmount > 0 && !finalizeDraftDueDate) {
            window.alert(tr('Set a due date before finalizing a draft with remaining balance.', 'پیش از نهایی‌سازی پیش‌نویسی که مانده دارد، تاریخ سررسید را ثبت کنید.'));
            return;
        }
        const normalizedPurchase = normalizePurchaseRecord(finalizeDraftTarget);
        const finalReceiptItems = buildReceiptItemsFromQuantities(normalizedPurchase.items, receiptLineQuantities, normalizedPurchase.supplierId);
        const receivedLineIndexes = new Set(finalReceiptItems.map((item) => item.purchaseItemIndex).filter((index): index is number => typeof index === 'number'));
        const receivedZeroCostNormalItem = normalizedPurchase.items.some((item, index) => (receivedLineIndexes.has(index)
            && (item.purchaseType || 'normal') === 'normal'
            && item.purchasePrice <= 0));
        if (receivedZeroCostNormalItem) {
            window.alert(tr('Received normal purchases cannot contain a zero purchase price. Mark bonus/sample items separately before receiving.', 'خرید دریافت‌شده با قلم عادی نمی‌تواند قیمت خرید صفر داشته باشد. اقلام رایگان/نمونه باید جدا ثبت شوند.'));
            return;
        }
        const nextDueDate = finalizeDraftDueDate || normalizedPurchase.dueDate || undefined;
        const finalReceipt: PurchaseReceipt | null = finalReceiptItems.length > 0 ? {
            id: createUniqueId('receipt'),
            date: todayInput(),
            items: finalReceiptItems,
            note: receiptNote.trim(),
            supplierLiabilityImpact: true
        } : null;
        const nextReceipts = finalReceipt ? [...(normalizedPurchase.receipts || []), finalReceipt] : (normalizedPurchase.receipts || []);
        const nextInventoryCommitted = nextReceipts.length > 0;
        const nextWorkflowStatus: PurchaseWorkflowStatus = nextInventoryCommitted ? 'received' : 'approved';
        const finalizedNotes = (normalizedPurchase.notes || '')
            .split(/\r?\n/)
            .filter((line) => line.trim() !== 'Created from medicine entry')
            .join('\n')
            .trim();
        const payload = normalizePurchaseRecord({
            ...normalizedPurchase,
            dueDate: nextDueDate,
            notes: finalizedNotes,
            workflowStatus: nextWorkflowStatus,
            status: resolvePurchaseStatus(nextWorkflowStatus, normalizedPurchase.paymentStatus),
            receipts: nextReceipts,
            inventoryCommitted: nextInventoryCommitted,
            receivedAt: finalReceipt?.date || normalizedPurchase.receivedAt,
        });
        setIsFinalizeDraftPending(true);
        try {
            const batchPayload = finalReceipt ? buildPurchaseReceiptBatchPayload(normalizedPurchase.supplierId, normalizedPurchase.items, finalReceipt.items, {
                destinationWarehouse: normalizedPurchase.destinationWarehouse,
                ownerPartnerId: normalizedPurchase.partnerId || undefined,
                ownershipType: normalizedPurchase.stockEntryType === 'partner_consignment'
                    ? 'consignment'
                    : normalizedPurchase.partnerId
                        ? 'partner'
                        : 'store',
                sourceEntryType: normalizedPurchase.stockEntryType || 'store_purchase',
                sourceReceiptId: finalReceipt.id,
                receivedAt: finalReceipt.date,
            }) : [];
            const batchIntegrityIssues = finalReceipt
                ? validatePurchaseBatchPayloadIntegrity(payload, batchPayload)
                : [];
            if (batchIntegrityIssues.length > 0) {
                window.alert(tr('Purchase finalize blocked: every received line must create exactly one valid batch record.', 'نهایی‌سازی خرید متوقف شد: هر سطر دریافت‌شده باید دقیقاً یک batch معتبر بسازد.'));
                return;
            }
            const result = await onUpdatePurchase(finalizeDraftTarget.id, payload, batchPayload);
            if (result === false)
                return;
            setFinalizeDraftTargetId(null);
            setFinalizeDraftDueDate('');
            setReceiptLineQuantities({});
            setReceiptNote('');
        }
        catch (error) {
            console.error('Failed to finalize purchase draft.', error);
            window.alert(tr('Draft finalize failed. Please try again.', 'نهایی‌سازی پیش‌نویس انجام نشد. لطفاً دوباره تلاش کنید.'));
        }
        finally {
            setIsFinalizeDraftPending(false);
        }
    };
    const handleCancelFocusedDraft = async () => {
        if (!focusedProcurementDraft || focusedProcurementDraft.workflowStatus !== 'draft' || isDraftFocusActionPending)
            return;
        const normalizedPurchase = normalizePurchaseRecord(focusedProcurementDraft);
        const { id: _purchaseId, ...payloadBase } = normalizedPurchase;
        const payload = normalizePurchaseRecord({
            ...payloadBase,
            workflowStatus: 'cancelled',
            status: 'cancelled',
            inventoryCommitted: false,
        });
        setIsDraftFocusActionPending(true);
        try {
            const result = await onUpdatePurchase(focusedProcurementDraft.id, payload, []);
            if (result === false)
                return;
            resetPurchaseEditor();
            setActiveTab('list');
        }
        catch (error) {
            console.error('Failed to cancel procurement draft.', error);
            window.alert(tr('Draft cancel failed. Please try again.', 'لغو پیش‌نویس انجام نشد. لطفاً دوباره تلاش کنید.'));
        }
        finally {
            setIsDraftFocusActionPending(false);
        }
    };
    const handleRecordPurchaseReceipt = () => {
        if (!purchaseReceiptTarget)
            return;
        if (purchaseReceiptTarget.shortClosedAt) {
            window.alert(tr('This purchase has been short closed and cannot receive more stock.', 'این خرید short close شده و دیگر دریافت جدید نمی‌گیرد.'));
            return;
        }
        const receiptMap = buildPurchaseReceiptQuantityMap(purchaseReceiptTarget.receipts || []);
        const receiptItems = purchaseReceiptTarget.items.flatMap((item, index) => {
            const requestedQuantity = parseAmountInput(receiptLineQuantities[index] || '');
            if (requestedQuantity <= 0)
                return [];
            const alreadyReceived = receiptMap.get(`idx:${index}`)?.quantity || 0;
            const remaining = Math.max(0, (item.baseQuantity ?? item.quantity) - alreadyReceived);
            const acceptedQuantity = Math.min(remaining, requestedQuantity);
            if (acceptedQuantity <= 0)
                return [];
            return [{
                    medicineId: item.medicineId,
                    purchaseItemIndex: index,
                    batchNumber: item.batchNumber,
                    expiryDate: item.expiryDate,
                    quantity: acceptedQuantity,
                    baseQuantity: acceptedQuantity,
                    purchaseUnitName: item.purchaseUnitName || item.unit,
                    purchaseUnitConversionFactor: item.purchaseUnitConversionFactor || 1,
                    baseUnit: item.baseUnit || item.unit,
                    purchasePrice: item.purchasePrice,
                    supplierId: purchaseReceiptTarget.supplierId
                }];
        });
        if (!receiptItems.length) {
            window.alert(tr('Enter at least one valid received quantity.', 'حداقل یک مقدار معتبر برای دریافت وارد کنید.'));
            return;
        }
        onRecordPurchaseReceipt(purchaseReceiptTarget.id, {
            date: todayInput(),
            items: receiptItems,
            note: receiptNote.trim(),
            supplierLiabilityImpact: true
        });
        setPurchaseReceiptTargetId(null);
        setReceiptLineQuantities({});
        setReceiptNote('');
    };
    const handleConfirmFinalReceipt = () => {
        const receiptItems = buildReceiptItemsFromQuantities(items, finalReceiptLineQuantities, purchaseForm.supplierId);
        void submitPurchase('final', receiptItems);
    };
    const handleShortClosePurchase = () => {
        if (!purchaseShortCloseTarget)
            return;
        const safeReason = shortCloseReason.trim();
        if (!safeReason) {
            window.alert(tr('Short close reason is required.', 'برای short close، دلیل الزامی است.'));
            return;
        }
        onShortClosePurchase(purchaseShortCloseTarget.id, safeReason);
        setPurchaseShortCloseTargetId(null);
        setShortCloseReason('');
    };
    const handleRecordSupplierSettlement = () => {
        if (!supplierPaymentTarget)
            return;
        const amount = parseAmountInput(settlementAmount);
        if (amount <= 0) {
            window.alert(tr('Enter a valid payment amount.', 'یک مبلغ معتبر برای پرداخت وارد کنید.'));
            return;
        }
        const paymentDraft: SupplierFinancePaymentDraft = {
            amount,
            method: settlementMethod,
            date: todayInput(),
            reference: settlementReference.trim(),
            note: settlementNote.trim(),
            description: supplierPaymentMode === 'advance'
                ? tr('Supplier advance payment', 'پیش‌پرداخت تأمین‌کننده')
                : tr('Supplier settlement', 'تسویه حساب تأمین‌کننده'),
            settlementId: supplierPaymentMode === 'settlement'
                ? createUniqueId('sup-settlement')
                : undefined,
        };
        if (supplierPaymentMode === 'advance') {
            onAddSupplierPayment(supplierPaymentTarget.id, paymentDraft);
        }
        else {
            onRecordSupplierSettlement(supplierPaymentTarget.id, paymentDraft);
        }
        setSupplierPaymentTargetId(null);
        setSupplierPaymentMode('settlement');
        setSettlementAmount('');
        setSettlementNote('');
        setSettlementReference('');
    };
    const buildPrintDocument = (title: string, bodyContent: string) => {
        const dir = isEnglish ? 'ltr' : 'rtl';
        const lang = isEnglish ? 'en' : 'fa';
        return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 24px;
      color: #0f172a;
      background: #f8fafc;
      font-family: "Segoe UI", Tahoma, "Noto Sans Arabic", "Noto Naskh Arabic", Arial, sans-serif;
      line-height: 1.65;
    }
    .print-shell {
      max-width: 1120px;
      margin: 0 auto;
      border: 1px solid #dbe4f0;
      border-radius: 20px;
      background: #ffffff;
      padding: 24px;
    }
    .print-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid #e2e8f0;
    }
    .print-title {
      margin: 0;
      font-size: 28px;
      font-weight: 800;
      color: #0f172a;
    }
    .print-subtitle {
      margin: 8px 0 0;
      color: #475569;
      font-size: 14px;
      font-weight: 600;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin: 18px 0 22px;
    }
    .card {
      border: 1px solid #dbe4f0;
      border-radius: 16px;
      background: #f8fafc;
      padding: 14px 16px;
    }
    .card-label {
      display: block;
      margin-bottom: 6px;
      color: #64748b;
      font-size: 12px;
      font-weight: 800;
    }
    .card-value {
      color: #0f172a;
      font-size: 18px;
      font-weight: 800;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid #dbe4f0;
      padding: 10px 12px;
      vertical-align: top;
      text-align: ${isEnglish ? 'left' : 'right'};
      overflow-wrap: anywhere;
    }
    th {
      background: #eff6ff;
      color: #334155;
      font-size: 12px;
      font-weight: 800;
    }
    td {
      color: #0f172a;
      font-size: 13px;
      font-weight: 600;
    }
    .empty-row {
      text-align: center;
      color: #64748b;
      padding: 18px 12px;
      font-weight: 700;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .print-shell {
        border: none;
        border-radius: 0;
        padding: 0;
        max-width: none;
      }
    }
  </style>
</head>
<body>
  <div class="print-shell">
    ${bodyContent}
  </div>
</body>
</html>`;
    };
    const openPrintPreview = (title: string, bodyContent: string) => {
        const newWindow = window.open('', '_blank', 'width=1180,height=820');
        if (!newWindow)
            return null;
        let didPrint = false;
        const triggerPrint = () => {
            if (didPrint)
                return;
            didPrint = true;
            newWindow.focus();
            newWindow.print();
        };
        newWindow.onload = triggerPrint;
        newWindow.document.open();
        newWindow.document.write(buildPrintDocument(title, bodyContent));
        newWindow.document.close();
        window.setTimeout(triggerPrint, 350);
        return newWindow;
    };
    const printPurchase = (purchase: Purchase) => {
        const supplier = supplierById.get(purchase.supplierId);
        const returnReferenceDetails = getReturnReferenceDetails(purchase);
        const linkedReturnSummary = getLinkedReturnSummary(purchase);
        const rows = purchase.items.map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.medicineName || medicineById.get(item.medicineId)?.name || '-')}</td><td>${escapeHtml(item.barcode || '-')}</td><td>${escapeHtml(item.unit || '-')}</td><td>${escapeHtml(formatNumber(item.quantity))}</td><td>${escapeHtml(formatMoney(item.purchasePrice))}</td><td>${escapeHtml(formatMoney(getPurchaseItemTotal(item)))}</td></tr>`).join('');
        const title = tr('Purchase Invoice', 'فاکتور خرید');
        const returnReferenceMarkup = returnReferenceDetails ? `
            <div class="cards">
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Source Purchase', 'فاکتور منبع'))}</span>
                    <div class="card-value">${escapeHtml(returnReferenceDetails.sourceDocumentLabel)}</div>
                </div>
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Source Batch', 'بچ منبع'))}</span>
                    <div class="card-value">${escapeHtml(returnReferenceDetails.sourceBatchLabel)}</div>
                </div>
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Resolution', 'نوع تسویه'))}</span>
                    <div class="card-value">${escapeHtml(returnReferenceDetails.resolutionLabel)}</div>
                </div>
            </div>
            <div class="cards">
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Returned Qty', 'تعداد مرجوعی'))}</span>
                    <div class="card-value">${escapeHtml(formatNumber(returnReferenceDetails.returnedQuantity))}</div>
                </div>
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Credit Amount', 'مبلغ اعتبار'))}</span>
                    <div class="card-value">${escapeHtml(formatMoney(returnReferenceDetails.creditedAmount))}</div>
                </div>
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Recorded At', 'زمان ثبت'))}</span>
                    <div class="card-value">${escapeHtml(formatDateTime(returnReferenceDetails.recordedAt))}</div>
                </div>
            </div>
            ${returnReferenceDetails.returnNote ? `<div class="card"><span class="card-label">${escapeHtml(tr('Return Note', 'یادداشت مرجوعی'))}</span><div class="card-value">${escapeHtml(returnReferenceDetails.returnNote)}</div></div>` : ''}
        ` : '';
        const linkedReturnMarkup = !returnReferenceDetails && linkedReturnSummary ? `
            <div class="cards">
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Linked Returns', 'مرجوعی‌های ثبت‌شده'))}</span>
                    <div class="card-value">${escapeHtml(formatNumber(linkedReturnSummary.count))}</div>
                </div>
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Returned Qty', 'تعداد مرجوعی'))}</span>
                    <div class="card-value">${escapeHtml(formatNumber(linkedReturnSummary.totalReturnedQuantity))}</div>
                </div>
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Vendor Credit Total', 'جمع اعتبار مرجوعی'))}</span>
                    <div class="card-value">${escapeHtml(formatMoney(linkedReturnSummary.totalCreditedAmount))}</div>
                </div>
            </div>
            <div class="cards">
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Latest Return', 'آخرین مرجوعی'))}</span>
                    <div class="card-value">${escapeHtml(formatDateTime(linkedReturnSummary.latestRecordedAt))}</div>
                </div>
            </div>
            <div class="cards">
                ${linkedReturnSummary.entries.map((entry) => `
                    <div class="card">
                        <span class="card-label">${escapeHtml(entry.documentLabel)}</span>
                        <div class="card-value">${escapeHtml(formatDate(entry.recordedAt))} | ${escapeHtml(formatMoney(entry.creditedAmount))}</div>
                        <div class="card-value" style="margin-top:8px;font-size:12px;font-weight:600;">${escapeHtml(`${tr('Batch', 'بچ')}: ${entry.sourceBatchLabel} | ${tr('Returned Qty', 'تعداد مرجوعی')}: ${formatNumber(entry.returnedQuantity)}`)}</div>
                        <div class="card-value" style="margin-top:8px;font-size:12px;font-weight:600;">${escapeHtml(`${tr('Resolution', 'نوع تسویه')}: ${entry.resolutionLabel}`)}</div>
                        ${entry.returnNote ? `<div class="card-value" style="margin-top:8px;font-size:12px;font-weight:600;">${escapeHtml(entry.returnNote)}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        ` : '';
        const bodyContent = `
            <div class="print-header">
                <div>
                    <h1 class="print-title">${escapeHtml(title)}</h1>
                    <p class="print-subtitle">${escapeHtml(tr('Detailed purchase invoice with supplier, line items, and payable balance.', 'فاکتور کامل خرید با جزئیات تأمین‌کننده، اقلام و مانده قابل پرداخت.'))}</p>
                </div>
            </div>
            <div class="cards">
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Supplier', 'تأمین‌کننده'))}</span>
                    <div class="card-value">${escapeHtml(supplier?.name || '-')}</div>
                </div>
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Invoice', 'فاکتور'))}</span>
                    <div class="card-value">${escapeHtml(getPurchaseDocumentLabel(purchase))}</div>
                </div>
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Date', 'تاریخ'))}</span>
                    <div class="card-value">${escapeHtml(formatDate(purchase.date))}</div>
                </div>
            </div>
            ${returnReferenceMarkup}
            ${linkedReturnMarkup}
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>${escapeHtml(tr('Item', 'قلم'))}</th>
                        <th>${escapeHtml(tr('Barcode', 'بارکد'))}</th>
                        <th>${escapeHtml(tr('Unit', 'واحد'))}</th>
                        <th>${escapeHtml(tr('Qty', 'تعداد'))}</th>
                        <th>${escapeHtml(tr('Buy Price', 'قیمت خرید'))}</th>
                        <th>${escapeHtml(tr('Total', 'جمع'))}</th>
                    </tr>
                </thead>
                <tbody>${rows || `<tr><td colspan="7" class="empty-row">${escapeHtml(tr('No line item is recorded for this invoice.', 'برای این فاکتور هنوز قلمی ثبت نشده است.'))}</td></tr>`}</tbody>
            </table>
            <div class="cards">
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Subtotal', 'جمع اقلام'))}</span>
                    <div class="card-value">${escapeHtml(formatMoney(purchase.subtotalAmount || 0))}</div>
                </div>
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Final Total', 'جمع نهایی'))}</span>
                    <div class="card-value">${escapeHtml(formatMoney(purchase.totalAmount))}</div>
                </div>
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Remaining', 'مانده'))}</span>
                    <div class="card-value">${escapeHtml(formatMoney(purchase.remainingAmount))}</div>
                </div>
            </div>`;
        openPrintPreview(title, bodyContent);
    };
    const exportHistoryCsv = () => {
        const rows = filteredHistory.map((purchase) => {
            const supplier = supplierById.get(purchase.supplierId);
            return [
                purchase.date,
                supplier?.name || '',
                purchase.invoiceNumber || '',
                purchase.totalAmount,
                purchase.paidAmount,
                purchase.remainingAmount,
                getWorkflowStatusLabel(purchase),
                getPaymentStatusLabel(purchase),
                purchase.destinationWarehouse || '',
                purchase.notes || ''
            ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',');
        });
        const csv = [[
                tr('Date', 'تاریخ'),
                tr('Supplier', 'تأمین‌کننده'),
                tr('Invoice Number', 'شماره فاکتور'),
                tr('Total', 'جمع'),
                tr('Paid', 'پرداختی'),
                tr('Remaining', 'مانده'),
                tr('Workflow Status', 'وضعیت چرخه'),
                tr('Payment Status', 'وضعیت پرداخت'),
                tr('Warehouse', 'گدام'),
                tr('Notes', 'یادداشت')
            ].join(','), ...rows].join('\n');
        downloadBlob(`purchase-history-${todayInput()}.csv`, new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' }));
    };
    const printHistory = () => {
        const rows = filteredHistory.map((purchase, index) => {
            const supplier = supplierById.get(purchase.supplierId);
            return `<tr><td>${index + 1}</td><td>${escapeHtml(formatDate(purchase.date))}</td><td>${escapeHtml(supplier?.name || '-')}</td><td>${escapeHtml(getPurchaseDocumentLabel(purchase))}</td><td>${escapeHtml(formatMoney(purchase.totalAmount))}</td><td>${escapeHtml(formatMoney(purchase.paidAmount))}</td><td>${escapeHtml(formatMoney(purchase.remainingAmount))}</td><td>${escapeHtml(getWorkflowStatusLabel(purchase))}</td><td>${escapeHtml(getPaymentStatusLabel(purchase))}</td></tr>`;
        }).join('');
        const title = tr('Purchase History Report', 'گزارش تاریخچه خرید');
        const bodyContent = `
            <div class="print-header">
                <div>
                    <h1 class="print-title">${escapeHtml(title)}</h1>
                    <p class="print-subtitle">${escapeHtml(tr('Summary of filtered purchase records with payable balances and document status.', 'خلاصه اسناد خرید فیلترشده همراه با مانده پرداختنی و وضعیت سند.'))}</p>
                </div>
            </div>
            <div class="cards">
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Filtered Total', 'جمع خرید فیلترشده'))}</span>
                    <div class="card-value">${escapeHtml(formatMoney(historyTotals.total))}</div>
                </div>
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Filtered Paid', 'جمع پرداختی'))}</span>
                    <div class="card-value">${escapeHtml(formatMoney(historyTotals.paid))}</div>
                </div>
                <div class="card">
                    <span class="card-label">${escapeHtml(tr('Filtered Remaining', 'جمع مانده'))}</span>
                    <div class="card-value">${escapeHtml(formatMoney(historyTotals.remaining))}</div>
                </div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>#</th>
                        <th>${escapeHtml(tr('Date', 'تاریخ'))}</th>
                        <th>${escapeHtml(tr('Supplier', 'تأمین‌کننده'))}</th>
                        <th>${escapeHtml(tr('Invoice', 'فاکتور'))}</th>
                        <th>${escapeHtml(tr('Total', 'جمع'))}</th>
                        <th>${escapeHtml(tr('Paid', 'پرداختی'))}</th>
                        <th>${escapeHtml(tr('Remaining', 'مانده'))}</th>
                        <th>${escapeHtml(tr('Workflow', 'چرخه'))}</th>
                        <th>${escapeHtml(tr('Payment', 'پرداخت'))}</th>
                    </tr>
                </thead>
                <tbody>${rows || `<tr><td colspan="9" class="empty-row">${escapeHtml(tr('No purchase matched the current filters.', 'سندی با فیلترهای فعلی پیدا نشد.'))}</td></tr>`}</tbody>
            </table>`;
        openPrintPreview(title, bodyContent);
    };
    const selectSupplierForDraft = (supplier: Supplier) => {
        setPurchaseForm((current) => ({
            ...current,
            supplierId: supplier.id,
            supplierCodeLookup: supplier.code || supplier.name,
            confirmUnknownSupplier: false
        }));
    };
    const goToPurchaseStep = (step: PurchaseStep) => {
        const target = purchaseSteps.find((entry) => entry.id === step);
        if (!target?.disabled)
            setNewPurchaseStep(step);
    };
    const continueFromSupplierStep = () => {
        if (!hasSelectedSupplier) {
            window.alert(tr('Please choose a supplier first.', 'ابتدا یک تأمین‌کننده انتخاب کنید.'));
            return;
        }
        if (supplierIsUnknown && !purchaseForm.confirmUnknownSupplier) {
            window.alert(tr('Please confirm the ambiguous supplier before continuing.', 'پیش از ادامه تأمین‌کننده مبهم را تأیید کنید.'));
            return;
        }
        setNewPurchaseStep('items');
    };
    const continueFromItemsStep = () => {
        if (!items.length) {
            window.alert(tr('Add at least one line item before continuing.', 'پیش از ادامه حداقل یک سطر اضافه کنید.'));
            return;
        }
        setNewPurchaseStep('payments');
    };
    const continueFromPaymentsStep = () => {
        if (!items.length) {
            setNewPurchaseStep('items');
            return;
        }
        setNewPurchaseStep('review');
    };
    useEffect(() => {
        setHistoryPage(1);
    }, [historySearch, historySupplierFilter, historyStatusFilter, historyDateFrom, historyDateTo, historyAmountMin, historyAmountMax, historySort]);
    useEffect(() => {
        if (!filteredSuppliers.length) {
            setSelectedSupplierProfileId(null);
        }
        else if (!selectedSupplierProfileId || !filteredSuppliers.some((supplier) => supplier.id === selectedSupplierProfileId)) {
            setSelectedSupplierProfileId(filteredSuppliers[0].id);
        }
    }, [filteredSuppliers, selectedSupplierProfileId]);
    useEffect(() => {
        if (!filteredHistory.length) {
            setHistoryPreviewId(null);
            return;
        }
        if (!historyPreviewId || !filteredHistory.some((purchase) => purchase.id === historyPreviewId)) {
            setHistoryPreviewId(filteredHistory[0].id);
        }
    }, [filteredHistory, historyPreviewId]);
    const renderProcurementSupplierStep = () => (<div className="wk-procurement-panel-grid" data-testid="purchase-step-panel-supplier">
            <div className="space-y-4">
                <SectionCard title={editingPurchaseId ? tr('Continue editing this purchase', 'ادامه ویرایش این سند خرید') : tr('Step 1: Lock supplier and document context', 'مرحله ۱: انتخاب تأمین‌کننده و زمینه سند')} subtitle={tr('Use one search flow, confirm the right supplier, then capture the minimum document details.', 'از یک جریان جستجو استفاده کنید، تأمین‌کننده درست را تأیید نمایید و فقط جزئیات ضروری سند را ثبت کنید.')} action={<div className="flex flex-wrap gap-2">
                            {editingPurchaseId ? <ActionButton label={tr('Reset draft', 'پاکسازی پیش‌نویس')} onClick={resetPurchaseEditor} tone="ghost"/> : null}
                            <ActionButton label={tr('New supplier', 'تأمین‌کننده جدید')} onClick={() => openSupplierModal()} disabled={!canManagePurchases}/>
                        </div>}>
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(300px,0.88fr)]">
                        <div className="space-y-4">
                            <div className="rounded-3xl border border-slate-200 bg-slate-50/90 p-4">
                                <label className="block text-xs font-black text-slate-500">{tr('Search and choose supplier', 'جستجو و انتخاب تأمین‌کننده')}</label>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <input ref={supplierLookupRef} type="text" value={purchaseForm.supplierCodeLookup} onChange={(event) => setPurchaseForm((current) => ({ ...current, supplierCodeLookup: event.target.value }))} onKeyDown={(event) => {
            if (event.key === 'Enter')
                handleSelectSupplierByLookup();
        }} className="wk-input flex-1" placeholder={tr('Name, code, phone, or company', 'نام، کد، تلفن یا شرکت')}/>
                                    <ActionButton label={tr('Choose top match', 'انتخاب بهترین نتیجه')} onClick={handleSelectSupplierByLookup} tone="primary"/>
                                </div>
                                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                                    {supplierLookupMatches.map((supplier) => {
            const selected = purchaseForm.supplierId === supplier.id;
            const supplierFinance = supplierFinanceById.get(supplier.id) || getSupplierFinanceSummary(supplier, normalizedPurchases);
            return (<button key={supplier.id} type="button" onClick={() => selectSupplierForDraft(supplier)} className={classNames('min-w-[220px] rounded-2xl border px-4 py-3 text-right transition', selected
                    ? 'border-brand-200 bg-brand-50/70 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50')} data-testid={`supplier-match-${supplier.id}`}>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-sm font-black text-slate-900">{supplier.name}</span>
                                                    <StatusBadge label={supplier.status || 'active'} tone={getSupplierStatusTone(supplier.status || 'active')}/>
                                                </div>
                                                <p className="mt-2 text-xs font-semibold text-slate-500">{supplier.companyName || supplier.contactPerson || '-'}</p>
                                                <div className="mt-3 flex items-center justify-between gap-2 text-xs font-semibold text-slate-500">
                                                    <span className="wk-ltr-data">{supplier.code || supplier.phone || '-'}</span>
                                                    <span>{formatMoney(supplierFinance.openDebt)}</span>
                                                </div>
                                            </button>);
        })}
                                </div>
                            </div>

                            {selectedSupplier ? (<GlassCard className={classNames('rounded-3xl p-5', supplierIsUnknown ? 'border-warning-100 bg-warning-50/90 text-warning-900' : 'border-white/70 bg-white/78 text-slate-900')}>
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-lg font-black">{selectedSupplier.name}</p>
                                                <StatusBadge label={selectedSupplier.status || 'active'} tone={getSupplierStatusTone(selectedSupplier.status || 'active')}/>
                                                {supplierIsUnknown ? <StatusBadge label={tr('Needs confirmation', 'نیازمند تأیید')} tone="warning"/> : null}
                                            </div>
                                            <p className="mt-2 text-sm font-semibold opacity-80">{selectedSupplier.companyName || selectedSupplier.contactPerson || '-'}</p>
                                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                                <MetricCard label={tr('Open debt', 'بدهی باز')} value={formatMoney(selectedSupplierFinance.openDebt)} tone={getDebtMetricTone(selectedSupplierFinance.openDebt)}/>
                                                <MetricCard label={tr('Supplier prepayment', 'پیش‌پرداخت تامین‌کننده')} value={formatMoney(selectedSupplierFinance.supplierPrepayment)} tone={getPrepaymentMetricTone(selectedSupplierFinance.supplierPrepayment)}/>
                                                <MetricCard label={tr('Recent invoices', 'اسناد اخیر')} value={formatNumber(currentSupplierHistory.length)} tone="border-sky-200 bg-sky-50 text-sky-900"/>
                                            </div>
                                        </div>
                                        <ActionButton label={tr('Open profile', 'بازکردن پروفایل')} onClick={() => { setSelectedSupplierProfileId(selectedSupplier.id); setActiveTab('suppliers'); }} tone="ghost"/>
                                    </div>
                                </GlassCard>) : (<EmptyStateShell title={tr('No supplier locked yet', 'هنوز تأمین‌کننده‌ای تثبیت نشده است')} description={tr('Choose one supplier first so debt context, recent purchases, and review checks can become reliable.', 'ابتدا یک تأمین‌کننده را انتخاب کنید تا زمینه بدهی، خریدهای اخیر و چک‌های بازبینی قابل اعتماد شوند.')} className="wk-empty-state-shell--compact py-10"/>)}

                            {supplierIsUnknown && selectedSupplier ? (<InlineAlert tone="warning" title={tr('This supplier match needs confirmation', 'این تطبیق تأمین‌کننده نیاز به تأیید دارد')}>
                                    <label className="mt-2 flex items-start gap-3 text-sm font-semibold text-warning-700">
                                        <input type="checkbox" checked={purchaseForm.confirmUnknownSupplier} onChange={(event) => setPurchaseForm((current) => ({ ...current, confirmUnknownSupplier: event.target.checked }))} className="mt-1"/>
                                        <span>{tr('I verified that this ambiguous supplier is the correct party for this purchase.', 'بررسی کردم که این تأمین‌کننده مبهم، طرف صحیح این خرید است.')}</span>
                                    </label>
                                </InlineAlert>) : null}
                        </div>

                        <div className="space-y-4">
                            <FlatCard className="rounded-3xl border-slate-200 bg-slate-50/90 p-4">
                                <p className="text-sm font-black text-slate-900">{tr('Document essentials', 'جزئیات ضروری سند')}</p>
                                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <label className="block text-xs font-black text-slate-500">{t.invoiceNumber}</label>
                                        <input type="text" value={purchaseForm.invoiceNumber} onChange={(event) => setPurchaseForm((current) => ({ ...current, invoiceNumber: event.target.value }))} className="wk-input wk-ltr-data mt-2" placeholder={tr('Invoice no.', 'شماره فاکتور')}/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-slate-500">{t.date}</label>
                                        <input type="date" value={purchaseForm.date} onChange={(event) => setPurchaseForm((current) => ({ ...current, date: event.target.value }))} className="wk-input wk-date-input mt-2"/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-slate-500">{tr('Due date', 'تاریخ سررسید')}</label>
                                        <input type="date" value={purchaseForm.dueDate} onChange={(event) => setPurchaseForm((current) => ({ ...current, dueDate: event.target.value }))} className="wk-input wk-date-input mt-2"/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-slate-500">{tr('Workflow', 'چرخه سند')}</label>
                                        <select value={purchaseForm.workflowStatus} onChange={(event) => setPurchaseForm((current) => ({ ...current, workflowStatus: event.target.value as PurchaseWorkflowStatus }))} className="wk-select mt-2">
                                            <option value="draft">{tr('Draft', 'پیش‌نویس')}</option>
                                            <option value="approved">{tr('Approved', 'تأیید شده')}</option>
                                            <option value="received">{tr('Received', 'دریافت شده')}</option>
                                            <option value="cancelled">{tr('Cancelled', 'لغو شده')}</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-slate-500">{tr('Stock entry type', 'نوع ورود')}</label>
                                        <select value={purchaseForm.stockEntryType} onChange={(event) => setPurchaseForm((current) => ({
            ...current,
            stockEntryType: event.target.value as StockEntryType,
            partnerId: event.target.value === 'store_purchase' ? '' : current.partnerId,
        }))} className="wk-select mt-2">
                                            <option value="store_purchase">{tr('Store purchase', 'خرید عادی دکان')}</option>
                                            <option value="partner_goods_capital">{tr('Partner goods capital', 'سرمایه جنسی شریک')}</option>
                                            <option value="partner_consignment">{tr('Partner consignment', 'جنس امانی شریک')}</option>
                                            <option value="sales_return">{tr('Sales return to stock', 'برگشتی به گدام')}</option>
                                            <option value="inventory_adjustment">{tr('Inventory adjustment', 'تعدیل موجودی')}</option>
                                        </select>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-black text-slate-500">{tr('Partner owner', 'مالک شریک')}</label>
                                        <select value={purchaseForm.partnerId} onChange={(event) => setPurchaseForm((current) => ({ ...current, partnerId: event.target.value }))} className="wk-select mt-2">
                                            <option value="">{tr('Store / unassigned stock', 'موجودی فروشگاه / بدون شریک')}</option>
                                            {activePartners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
                                        </select>
                                        <p className="mt-2 text-xs font-semibold text-slate-500">{tr('Sales from these batches will be calculated under this partner automatically.', 'فروش از این batchها به‌صورت خودکار زیر حساب همین شریک محاسبه می‌شود.')}</p>
                                    </div>
                                </div>

                                <details className="wk-procurement-advanced-toggle mt-4">
                                    <summary>{tr('More details', 'جزئیات بیشتر')}</summary>
                                    <div className="mt-4">
                                        <label className="block text-xs font-black text-slate-500">{tr('Destination warehouse', 'انبار مقصد')}</label>
                                        <input type="text" value={purchaseForm.destinationWarehouse} onChange={(event) => setPurchaseForm((current) => ({ ...current, destinationWarehouse: event.target.value }))} className="wk-input mt-2" placeholder={tr('Main warehouse', 'گدام اصلی')}/>
                                    </div>
                                </details>

                                {dueDateIsOverdue ? (<InlineAlert tone="warning" title={tr('Due date is already overdue', 'تاریخ سررسید از قبل گذشته است')}>
                                        {tr('The document can still continue, but it will enter overdue monitoring right away.', 'سند هنوز می‌تواند ادامه یابد، اما بلافاصله وارد پایش سررسید گذشته می‌شود.')}
                                    </InlineAlert>) : null}
                            </FlatCard>

                            <FlatCard className="rounded-3xl border-slate-200 bg-white p-4">
                                <p className="text-sm font-black text-slate-900">{tr('Why this step matters', 'اهمیت این مرحله')}</p>
                                <p className="mt-2 text-sm font-semibold leading-7 text-slate-600">
                                    {tr('A locked supplier and the right invoice dates remove most downstream confusion in items, debt tracking, and final save.', 'تأمین‌کننده تثبیت‌شده و تاریخ‌های درست سند، بیشترین ابهام بعدی در اقلام، بدهی و ثبت نهایی را حذف می‌کند.')}
                                </p>
                            </FlatCard>
                        </div>
                    </div>
                </SectionCard>
            </div>

            <div className="wk-procurement-sticky space-y-4">
                <GlassCard className="rounded-[28px] border-white/70 bg-white/74 p-5 shadow-sm">
                    <p className="wk-procurement-label text-slate-500">{tr('Draft pulse', 'نبض پیش‌نویس')}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        {getWorkflowBadge(draftPreviewPurchase)}
                        {getPaymentBadge(draftPreviewPurchase)}
                    </div>
                    <div className="mt-4 grid gap-3">
                        <MetricCard label={tr('Supplier', 'تأمین‌کننده')} value={selectedSupplier?.name || tr('Not selected', 'انتخاب نشده')}/>
                        <MetricCard label={tr('Partner owner', 'مالک شریک')} value={selectedPartner?.name || tr('Store stock', 'موجودی فروشگاه')}/>
                        <MetricCard label={tr('Invoice', 'فاکتور')} value={purchaseForm.invoiceNumber || '-'}/>
                        <MetricCard label={tr('Final total', 'جمع نهایی')} value={formatMoney(totalAmount)} tone="border-brand-200 bg-brand-50/70 text-brand-900"/>
                    </div>
                    <div className="mt-4 grid gap-2">
                        <ActionButton label={tr('Continue to items', 'ادامه به اقلام')} onClick={continueFromSupplierStep} tone="primary" className="w-full justify-center"/>
                        {editingPurchaseId ? <ActionButton label={tr('Discard current edit', 'لغو ویرایش جاری')} onClick={resetPurchaseEditor} tone="ghost" className="w-full justify-center"/> : null}
                    </div>
                </GlassCard>

                <FlatCard className="rounded-[28px] border-slate-200 bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-black text-slate-900">{tr('Recent supplier documents', 'اسناد اخیر تأمین‌کننده')}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">{tr('See the latest documents before creating another one.', 'پیش از ساخت سند جدید، آخرین اسناد را مرور کنید.')}</p>
                        </div>
                        {selectedSupplier ? <ActionButton label={tr('Profile', 'پروفایل')} onClick={() => { setSelectedSupplierProfileId(selectedSupplier.id); setActiveTab('suppliers'); }} tone="ghost"/> : null}
                    </div>
                    <div className="mt-4 space-y-3">
                        {currentSupplierHistory.map((purchase) => (<button key={purchase.id} type="button" onClick={() => setSelectedPurchaseId(purchase.id)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right transition hover:border-brand-200 hover:bg-brand-50/40">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <span className="wk-ltr-data text-sm font-black text-slate-900">{purchase.invoiceNumber || purchase.id.slice(-6)}</span>
                                    {getPaymentBadge(purchase)}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">{getWorkflowBadge(purchase)}</div>
                                <p className="mt-2 text-xs font-semibold text-slate-500">{formatDate(purchase.date)}</p>
                            </button>))}
                        {!currentSupplierHistory.length ? (<EmptyStateShell title={tr('No recent supplier document', 'سند اخیر برای این تأمین‌کننده وجود ندارد')} description={tr('As soon as you select a supplier, recent purchases will appear here as a quick confidence check.', 'به‌محض انتخاب تأمین‌کننده، خریدهای اخیر او برای اطمینان سریع اینجا نمایش داده می‌شود.')} className="wk-empty-state-shell--compact py-8"/>) : null}
                    </div>
                </FlatCard>
            </div>
        </div>);
    const renderProcurementItemsStep = () => {
        const selectedMedicine = itemEditor.medicineId ? medicineById.get(itemEditor.medicineId) || null : null;
        const selectedMedicinePriceHistory = selectedMedicine
            ? getMedicinePurchasePriceHistory(selectedMedicine, supplierById).slice(0, 3)
            : [];
        const selectedMedicineLastRate = selectedMedicine
            ? getMedicineLastPurchaseRate(selectedMedicine, supplierById)
            : null;
        const linePreviewTotal = parseAmountInput(itemEditor.quantity) * parseAmountInput(itemEditor.purchasePrice);
        return (<div className="wk-procurement-panel-grid" data-testid="purchase-step-panel-items">
                <div className="space-y-4">
                    <SectionCard title={tr('Step 2: Quick item workbench', 'مرحله ۲: میز کار سریع اقلام')} subtitle={tr('Search, set quantity and buy price, keep batch traceability, then add the line without opening a heavy form.', 'جستجو کنید، تعداد و قیمت خرید را ثبت نمایید، رهگیری batch را نگه دارید و بدون فرم سنگین سطر را اضافه کنید.')} action={<div className="flex flex-wrap gap-2">
                                <ActionButton label={tr('Back to supplier', 'بازگشت به تأمین‌کننده')} onClick={() => setNewPurchaseStep('supplier')} tone="ghost"/>
                                <ActionButton label={tr('Fill low stock', 'پُرکردن کسری انبار')} onClick={handleAutoFillLowStock} disabled={!canManagePurchases}/>
                            </div>}>
                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)]">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-black text-slate-500">{tr('Medicine search', 'جستجوی دوا')}</label>
                                    <input ref={searchInputRef} type="text" value={itemEditor.search} onChange={(event) => setItemEditor((current) => ({ ...current, search: event.target.value, medicineId: '' }))} className="wk-input mt-2" placeholder={tr('Name, generic, barcode, or batch', 'نام، جنریک، بارکد یا batch')}/>
                                    {filteredMedicineSuggestions.length ? (<div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                            {filteredMedicineSuggestions.map((medicine) => (<button key={medicine.id} type="button" onClick={() => handleSelectMedicine(medicine)} className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-right text-sm font-semibold text-slate-700 transition hover:bg-slate-50 last:border-b-0">
                                                    <span className="min-w-0">
                                                        <span className="block truncate font-black text-slate-900">{medicine.name}</span>
                                                        <span className="text-xs text-slate-500">{medicine.genericName || medicine.manufacturer || '-'}</span>
                                                    </span>
                                                    <span className="wk-ltr-data shrink-0 text-[11px] font-black text-brand-600">{medicine.barcode || medicine.batches?.[medicine.batches.length - 1]?.batchNumber || '-'}</span>
                                                </button>))}
                                        </div>) : null}
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                    <div>
                                        <label className="block text-xs font-black text-slate-500">{tr('Quantity', 'تعداد')}</label>
                                        <input type="text" value={itemEditor.quantity} onChange={(event) => setItemEditor((current) => ({ ...current, quantity: normalizePersianNumbers(event.target.value) }))} className="wk-input wk-ltr-data mt-2 text-center" placeholder="0"/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-slate-500">{tr('Buy price', 'قیمت خرید')}</label>
                                        <input type="text" value={itemEditor.purchasePrice} onChange={(event) => setItemEditor((current) => ({ ...current, purchasePrice: normalizePersianNumbers(event.target.value) }))} className="wk-input wk-ltr-data mt-2 text-center" placeholder="0"/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-slate-500">{tr('Batch no.', 'شماره batch')}</label>
                                        <input type="text" value={itemEditor.batchNumber} onChange={(event) => setItemEditor((current) => ({ ...current, batchNumber: event.target.value }))} className="wk-input wk-ltr-data mt-2" placeholder={tr('Batch number', 'شماره batch')}/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-slate-500">{tr('Expiry', 'تاریخ انقضا')}</label>
                                        <input type="date" value={itemEditor.expiryDate} onChange={(event) => setItemEditor((current) => ({ ...current, expiryDate: event.target.value }))} className="wk-input wk-date-input mt-2"/>
                                    </div>
                                </div>

                                <details className="wk-procurement-advanced-toggle rounded-3xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                                    <summary>{tr('Advanced line fields', 'فیلدهای پیشرفته سطر')}</summary>
                                    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                        <div>
                                            <label className="block text-xs font-black text-slate-500">{tr('Barcode', 'بارکد')}</label>
                                            <input type="text" value={itemEditor.barcode} onChange={(event) => setItemEditor((current) => ({ ...current, barcode: event.target.value }))} className="wk-input wk-ltr-data mt-2"/>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black text-slate-500">{tr('Unit', 'واحد')}</label>
                                            <input type="text" value={itemEditor.unit} onChange={(event) => setItemEditor((current) => ({ ...current, unit: event.target.value }))} className="wk-input mt-2"/>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black text-slate-500">{tr('Minimum order', 'حداقل سفارش')}</label>
                                            <input type="text" value={itemEditor.minimumOrderQuantity} onChange={(event) => setItemEditor((current) => ({ ...current, minimumOrderQuantity: normalizePersianNumbers(event.target.value) }))} className="wk-input wk-ltr-data mt-2"/>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black text-slate-500">{tr('Suggested qty', 'مقدار پیشنهادی')}</label>
                                            <input type="text" value={itemEditor.suggestedQuantity} onChange={(event) => setItemEditor((current) => ({ ...current, suggestedQuantity: normalizePersianNumbers(event.target.value) }))} className="wk-input wk-ltr-data mt-2"/>
                                        </div>
                                        <div className="sm:col-span-2 xl:col-span-4">
                                            <label className="block text-xs font-black text-slate-500">{tr('Line note', 'یادداشت سطر')}</label>
                                            <textarea value={itemEditor.notes} onChange={(event) => setItemEditor((current) => ({ ...current, notes: event.target.value }))} className="wk-textarea mt-2 min-h-[110px]" placeholder={tr('Return policy, visible defect, supplier note, or any traceable context.', 'شرایط مرجوعی، عیب ظاهری، یادداشت تأمین‌کننده یا هر زمینه قابل پیگیری دیگر')}/>
                                        </div>
                                    </div>
                                </details>
                            </div>

                            <div className="wk-procurement-sticky space-y-4">
                                <GlassCard className="rounded-[28px] border-white/70 bg-white/74 p-5 shadow-sm">
                                    <p className="wk-procurement-label text-slate-500">{tr('Line preview', 'پیش‌نمایش سطر')}</p>
                                    <p className="mt-3 text-lg font-black text-slate-900">{selectedMedicine?.name || itemEditor.search || tr('No medicine selected', 'هنوز قلمی انتخاب نشده است')}</p>
                                    <p className="mt-2 text-sm font-semibold text-slate-500">{itemEditor.batchNumber || '-'} {itemEditor.expiryDate ? `| ${formatExpiryDate(itemEditor.expiryDate)}` : ''}</p>
                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        <MetricCard label={tr('Qty', 'تعداد')} value={itemEditor.quantity ? formatNumber(parseAmountInput(itemEditor.quantity)) : '-'}/>
                                        <MetricCard label={tr('Buy price', 'قیمت خرید')} value={itemEditor.purchasePrice ? formatMoney(parseAmountInput(itemEditor.purchasePrice)) : '-'}/>
                                        <MetricCard label={tr('Barcode', 'بارکد')} value={itemEditor.barcode || selectedMedicine?.barcode || '-'}/>
                                        <MetricCard label={tr('Line total', 'جمع سطر')} value={formatMoney(linePreviewTotal)} tone="border-brand-200 bg-brand-50/70 text-brand-900"/>
                                    </div>
                                    {selectedMedicine ? (<div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="wk-procurement-label text-slate-500">{tr('Price Context', 'زمینه قیمت')}</p>
                                                <NewFeatureBadge />
                                            </div>
                                            <p className="text-sm font-semibold text-slate-600">
                                                {selectedMedicineLastRate && canManagePurchases
                    ? tr(`Last purchase: ${formatMoney(selectedMedicineLastRate.purchasePrice)} from ${selectedMedicineLastRate.supplierName || 'Unknown supplier'}`, `آخرین خرید: ${formatMoney(selectedMedicineLastRate.purchasePrice)} از ${selectedMedicineLastRate.supplierName || 'شرکت نامشخص'}`)
                    : tr('No linked purchase rate found yet for this medicine.', 'هنوز نرخ خرید لینک‌شده‌ای برای این دوا پیدا نشد.')}
                                            </p>
                                            {selectedMedicinePriceHistory.length ? (<div className="space-y-1">
                                                    {selectedMedicinePriceHistory.map((entry) => (<div key={`${entry.date}-${entry.supplierId || 'none'}`} className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
                                                            <span>{entry.supplierName || tr('Unknown supplier', 'شرکت نامشخص')}</span>
                                                            <span>{formatMoney(entry.purchasePrice)}</span>
                                                        </div>))}
                                                </div>) : null}
                                        </div>) : null}
                                    <div className="mt-4 grid gap-2">
                                        <ActionButton label={editingItemIndex === null ? tr('Add line', 'افزودن سطر') : tr('Update line', 'به‌روزرسانی سطر')} onClick={handleAddOrUpdateItem} disabled={!canManagePurchases} tone="primary" className="w-full justify-center"/>
                                        {editingItemIndex !== null ? <ActionButton label={tr('Cancel edit', 'لغو ویرایش')} onClick={() => { setEditingItemIndex(null); setItemEditor(createEmptyItemEditor()); }} className="w-full justify-center"/> : null}
                                    </div>
                                </GlassCard>

                                <FlatCard className="rounded-[28px] border-slate-200 bg-white p-5">
                                    <p className="text-sm font-black text-slate-900">{tr('Invoice running total', 'خلاصه لحظه‌ای فاکتور')}</p>
                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        <MetricCard label={tr('Lines', 'سطرها')} value={formatNumber(items.length)}/>
                                        <MetricCard label={tr('Subtotal', 'جمع اقلام')} value={formatMoney(subtotalAmount)}/>
                                        <MetricCard label={tr('Final total', 'جمع نهایی')} value={formatMoney(totalAmount)} tone="border-brand-200 bg-brand-50/70 text-brand-900"/>
                                        <MetricCard label={tr('Remaining', 'مانده')} value={formatMoney(remainingAmount)} tone={remainingAmount > 0 ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}/>
                                    </div>
                                    <div className="mt-4">
                                        <ActionButton label={tr('Continue to payments', 'ادامه به پرداخت‌ها')} onClick={continueFromItemsStep} tone="primary" className="w-full justify-center"/>
                                    </div>
                                </FlatCard>
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard title={tr('Current invoice lines', 'سطرهای فعلی فاکتور')} subtitle={tr('Compact rows keep quantity, batch, and money visible while leaving actions lightweight.', 'ردیف‌های فشرده تعداد، batch و مبلغ را واضح نگه می‌دارند و عملیات را سبک‌تر می‌کنند.')}>
                        <div className="wk-procurement-table-shell">
                            <div className="wk-procurement-table-head">
                                <span>{tr('Item', 'قلم')}</span>
                                <span>{tr('Batch / meta', 'batch / اطلاعات')}</span>
                                <span>{tr('Qty', 'تعداد')}</span>
                                <span>{tr('Amount', 'مبلغ')}</span>
                                <span>{tr('Actions', 'عملیات')}</span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {items.map((item, index) => (<div key={`${item.medicineId}-${item.batchNumber}-${index}`} className="wk-procurement-table-row">
                                        <div>
                                            <p className="text-sm font-black text-slate-900">{item.medicineName || medicineById.get(item.medicineId)?.name || '-'}</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">{item.notes || tr('No note', 'بدون یادداشت')}</p>
                                        </div>
                                        <div>
                                            <p className="wk-ltr-data text-sm font-black text-slate-900">{item.batchNumber || '-'}</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">{item.expiryDate ? formatExpiryDate(item.expiryDate) : tr('No expiry', 'بدون انقضا')}</p>
                                        </div>
                                        <div className="text-sm font-black text-slate-900">{formatNumber(item.quantity)}</div>
                                        <div>
                                            <p className="text-sm font-black text-slate-900">{formatMoney(getPurchaseItemTotal(item))}</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">{formatMoney(item.purchasePrice)} / {item.unit || '-'}</p>
                                        </div>
                                        <div className="flex flex-wrap justify-end gap-2">
                                            <ActionButton label={tr('Edit', 'ویرایش')} onClick={() => editItem(index)} disabled={!canManagePurchases}/>
                                            <ActionButton label={tr('Remove', 'حذف')} onClick={() => removeItem(index)} disabled={!canManagePurchases} tone="danger"/>
                                        </div>
                                    </div>))}
                                {!items.length ? (<div className="p-4">
                                        <EmptyStateShell title={tr('No line added yet', 'هنوز سطری اضافه نشده است')} description={tr('Search a medicine, fill quantity and price, then add the first line from the preview panel.', 'یک دوا را جستجو کنید، تعداد و قیمت را وارد نمایید و نخستین سطر را از پنل پیش‌نمایش اضافه کنید.')} className="wk-empty-state-shell--compact py-8"/>
                                    </div>) : null}
                            </div>
                        </div>
                    </SectionCard>
                </div>
            </div>);
    };
    const renderProcurementPaymentsStep = () => (<div className="wk-procurement-panel-grid" data-testid="purchase-step-panel-payments">
            <div className="space-y-4">
                <SectionCard title={buildNewSectionTitle(tr('Step 3: Payments and balance stance', 'مرحله ۳: پرداخت‌ها و وضعیت مانده'), 'partial-payment-new-badge')} subtitle={tr('Keep payment entry simple by default and use advanced fields only when reference or notes matter.', 'ثبت پرداخت را به‌صورت پیش‌فرض ساده نگه دارید و فقط وقتی مرجع یا یادداشت مهم است از فیلدهای پیشرفته استفاده کنید.')} action={<ActionButton label={tr('Back to items', 'بازگشت به اقلام')} onClick={() => setNewPurchaseStep('items')} tone="ghost"/>}>
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)]">
                        <div className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-3">
                                <div>
                                    <label className="block text-xs font-black text-slate-500">{tr('Amount', 'مبلغ')}</label>
                                    <input type="text" value={paymentDraft.amount} onChange={(event) => setPaymentDraft((current) => ({ ...current, amount: normalizePersianNumbers(event.target.value) }))} className="wk-input wk-ltr-data mt-2 text-center"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-500">{tr('Method', 'روش')}</label>
                                    <select value={paymentDraft.method} onChange={(event) => setPaymentDraft((current) => ({ ...current, method: event.target.value as PurchasePaymentMethod }))} className="wk-select mt-2">
                                        <option value="cash">{tr('Cash', 'نقد')}</option>
                                        <option value="bank_transfer">{tr('Bank transfer', 'انتقال بانکی')}</option>
                                        <option value="card">{tr('Card', 'کارت')}</option>
                                        <option value="cheque">{tr('Cheque', 'چک')}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-500">{tr('Payment date', 'تاریخ پرداخت')}</label>
                                    <input type="date" value={paymentDraft.date} onChange={(event) => setPaymentDraft((current) => ({ ...current, date: event.target.value }))} className="wk-input wk-date-input mt-2"/>
                                </div>
                            </div>

                            <details className="wk-procurement-advanced-toggle rounded-3xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                                <summary>{tr('Reference and notes', 'مرجع و یادداشت')}</summary>
                                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <label className="block text-xs font-black text-slate-500">{tr('Reference', 'مرجع')}</label>
                                        <input type="text" value={paymentDraft.reference} onChange={(event) => setPaymentDraft((current) => ({ ...current, reference: event.target.value }))} className="wk-input wk-ltr-data mt-2" placeholder={tr('Transfer no. / cheque no.', 'شماره حواله / چک')}/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-slate-500">{tr('Payment note', 'یادداشت پرداخت')}</label>
                                        <textarea value={paymentDraft.note} onChange={(event) => setPaymentDraft((current) => ({ ...current, note: event.target.value }))} className="wk-textarea mt-2 min-h-[92px]" placeholder={tr('Optional context for this payment entry', 'زمینه اختیاری برای این پرداخت')}/>
                                    </div>
                                </div>
                            </details>

                            <div className="flex flex-wrap items-center gap-2">
                                <ActionButton label={tr('Add payment entry', 'افزودن پرداخت')} onClick={addPaymentDraft} disabled={!canManagePurchases} tone="primary"/>
                                <span className="text-xs font-semibold text-slate-500">{tr('Leave empty if this purchase should remain open for later settlement.', 'اگر این خرید باید برای تسویه بعدی باز بماند، می‌توانید این بخش را خالی بگذارید.')}</span>
                            </div>
                        </div>

                        <div className="wk-procurement-sticky space-y-4">
                            <GlassCard className="rounded-[28px] border-white/70 bg-white/74 p-5 shadow-sm">
                                <p className="wk-procurement-label text-slate-500">{tr('Balance view', 'نمای مانده')}</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {getPaymentBadge(draftPreviewPurchase)}
                                    {getWorkflowBadge(draftPreviewPurchase)}
                                </div>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <MetricCard label={tr('Paid', 'پرداختی')} value={formatMoney(paidAmount)} tone="border-emerald-200 bg-emerald-50 text-emerald-900"/>
                                    <MetricCard label={tr('Remaining', 'مانده')} value={formatMoney(remainingAmount)} tone={remainingAmount > 0 ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}/>
                                </div>
                                <details className="wk-procurement-advanced-toggle mt-4 rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                                    <summary>{tr('Charges and adjustments', 'هزینه‌ها و تعدیلات')}</summary>
                                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                        <div>
                                            <label className="block text-xs font-black text-slate-500">{tr('Discount', 'تخفیف')}</label>
                                            <input type="text" value={purchaseForm.discountAmount} onChange={(event) => setPurchaseForm((current) => ({ ...current, discountAmount: normalizePersianNumbers(event.target.value) }))} className="wk-input wk-ltr-data mt-2 text-center"/>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black text-slate-500">{tr('Tax / Duty', 'مالیات / عوارض')}</label>
                                            <input type="text" value={purchaseForm.taxAmount} onChange={(event) => setPurchaseForm((current) => ({ ...current, taxAmount: normalizePersianNumbers(event.target.value) }))} className="wk-input wk-ltr-data mt-2 text-center"/>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black text-slate-500">{tr('Shipping', 'حمل')}</label>
                                            <input type="text" value={purchaseForm.shippingAmount} onChange={(event) => setPurchaseForm((current) => ({ ...current, shippingAmount: normalizePersianNumbers(event.target.value) }))} className="wk-input wk-ltr-data mt-2 text-center"/>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black text-slate-500">{tr('Extra charges', 'هزینه جانبی')}</label>
                                            <input type="text" value={purchaseForm.extraChargesAmount} onChange={(event) => setPurchaseForm((current) => ({ ...current, extraChargesAmount: normalizePersianNumbers(event.target.value) }))} className="wk-input wk-ltr-data mt-2 text-center"/>
                                        </div>
                                    </div>
                                </details>
                                <div className="mt-4">
                                    <ActionButton label={tr('Continue to review', 'ادامه به بازبینی')} onClick={continueFromPaymentsStep} tone="primary" className="w-full justify-center"/>
                                </div>
                            </GlassCard>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard title={tr('Staged payments', 'پرداخت‌های مرحله‌ای')} subtitle={tr('If nothing is listed here the purchase simply remains open. Remove or replace entries as needed.', 'اگر چیزی اینجا ثبت نشده باشد خرید به‌صورت بدهی باز می‌ماند. در صورت نیاز ورودی‌ها را حذف یا جایگزین کنید.')}>
                    <div className="space-y-3">
                        {payments.map((payment) => (<div key={payment.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="wk-ltr-data text-sm font-black text-slate-900">{formatMoney(payment.amount)}</p>
                                        <p className="mt-1 text-xs font-semibold text-slate-500">{formatDate(payment.date)} | {getPaymentMethodLabel(payment.method)}</p>
                                        {payment.reference ? <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Reference', 'مرجع')}: {payment.reference}</p> : null}
                                        {payment.note ? <p className="mt-1 text-xs font-semibold text-slate-500">{payment.note}</p> : null}
                                    </div>
                                    <ActionButton label={tr('Remove', 'حذف')} onClick={() => removePaymentDraft(payment.id)} disabled={!canManagePurchases} tone="danger"/>
                                </div>
                            </div>))}
                        {!payments.length ? (<EmptyStateShell title={tr('No payment entry yet', 'هنوز پرداختی ثبت نشده است')} description={tr('This is acceptable. You can keep the invoice open or add the first payment now if part of the amount is already settled.', 'این حالت قابل قبول است. می‌توانید سند را باز بگذارید یا اگر بخشی از مبلغ قبلاً پرداخت شده، نخستین پرداخت را حالا اضافه کنید.')} className="wk-empty-state-shell--compact py-10"/>) : null}
                    </div>
                </SectionCard>
            </div>
        </div>);
    const renderProcurementReviewStep = () => (<div className="wk-procurement-panel-grid" data-testid="purchase-step-panel-review">
            <div className="space-y-4">
                <SectionCard title={buildNewSectionTitle(tr('Step 4: Review and safe save', 'مرحله ۴: بازبینی و ثبت امن'), 'purchase-receipt-new-badge')} subtitle={tr('The checklist is here to prevent hidden debt, empty invoices, or ambiguous supplier saves.', 'این چک‌لیست برای جلوگیری از بدهی پنهان، سند خالی یا ثبت تأمین‌کننده مبهم است.')} action={<ActionButton label={tr('Back to payments', 'بازگشت به پرداخت‌ها')} onClick={() => setNewPurchaseStep('payments')} tone="ghost"/>}>
                    <div className="space-y-4">
                        <NewFeatureHint title={tr('Final save now explains the new stock and finance rules', 'ثبت نهایی اکنون قانون‌های تازهٔ موجودی و مالی را واضح می‌سازد')} data-testid="purchase-receipt-guide">
                            {tr('Final save keeps purchase receipts, partial payments, and audit-ready follow-up aligned before stock is treated as official.', 'ثبت نهایی رسید خرید، پرداخت جزئی و پیگیری audit-ready را هم‌سو می‌سازد تا موجودی رسمی به‌صورت واضح ثبت شود.')}
                        </NewFeatureHint>
                        <div className="grid gap-3">
                            {reviewChecklist.map((item) => (<ReviewCheckItem key={item.id} title={item.title} description={item.description} state={item.complete ? 'pass' : 'warn'}/>))}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <MetricCard label={tr('Supplier', 'تأمین‌کننده')} value={selectedSupplier?.name || '-'}/>
                            <MetricCard label={tr('Items', 'اقلام')} value={formatNumber(items.length)}/>
                            <MetricCard label={tr('Payments', 'پرداخت‌ها')} value={formatNumber(payments.length)}/>
                            <MetricCard label={tr('Remaining', 'مانده')} value={formatMoney(remainingAmount)} tone={remainingAmount > 0 ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}/>
                        </div>

                        {dueDateIsOverdue ? (<InlineAlert tone="warning" title={tr('This document will enter overdue monitoring immediately', 'این سند بلافاصله وارد پایش سررسید گذشته می‌شود')}>
                                {tr('The due date has already passed, so the history screen will flag it as soon as it is saved.', 'تاریخ سررسید قبلاً گذشته است، بنابراین به‌محض ذخیره در تاریخچه علامت‌گذاری خواهد شد.')}
                            </InlineAlert>) : null}
                    </div>
                </SectionCard>

                <SectionCard title={tr('Notes and attachments', 'یادداشت و پیوست‌ها')} subtitle={tr('Keep the final decision explainable with a note and optional invoice files.', 'تصمیم نهایی را با یادداشت و فایل‌های اختیاری فاکتور قابل توضیح نگه دارید.')}>
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-black text-slate-900">{tr('Attachments', 'پیوست‌ها')}</p>
                                    <p className="text-xs font-semibold text-slate-500">{tr('Up to 4 files, max 2 MB each.', 'حداکثر ۴ فایل، هرکدام تا ۲ مگابایت.')}</p>
                                </div>
                                <label className="cursor-pointer rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100">
                                    {tr('Upload', 'آپلود')}
                                    <input type="file" accept={ATTACHMENT_INPUT_ACCEPT} multiple className="hidden" onChange={handleAttachmentUpload}/>
                                </label>
                            </div>
                            <div className="mt-4 space-y-3">
                                {attachments.map((attachment) => (<div key={attachment.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-black text-slate-900">{attachment.name}</p>
                                                <p className="mt-1 text-xs font-semibold text-slate-500">{formatNumber(attachment.size / 1024, { maximumFractionDigits: 1 })} KB</p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {attachment.dataUrl ? <ActionButton label={tr('Open', 'بازکردن')} onClick={() => void handleOpenAttachment(attachment)}/> : null}
                                                <ActionButton label={tr('Remove', 'حذف')} tone="danger" onClick={() => removeAttachment(attachment.id)} disabled={!canManagePurchases}/>
                                            </div>
                                        </div>
                                    </div>))}
                                {!attachments.length ? (<EmptyStateShell title={tr('No document attached yet', 'هنوز سندی ضمیمه نشده است')} description={tr('Upload invoice evidence only when it adds real follow-up value.', 'فقط زمانی سند را آپلود کنید که برای پیگیری واقعاً ارزش افزوده ایجاد می‌کند.')} className="wk-empty-state-shell--compact py-8"/>) : null}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-black text-slate-500">{tr('Invoice note', 'یادداشت فاکتور')}</label>
                            <textarea value={purchaseForm.notes} onChange={(event) => setPurchaseForm((current) => ({ ...current, notes: event.target.value }))} className="wk-textarea mt-2 min-h-[220px]" placeholder={tr('Quality issue, supplier commitment, return policy, transport problem, or any written context.', 'مسأله کیفیت، تعهد تأمین‌کننده، شرایط مرجوعی، مشکل حمل یا هر زمینه مکتوب دیگر')}/>
                        </div>
                    </div>
                </SectionCard>
            </div>

            <div className="wk-procurement-sticky space-y-4">
                <GlassCard className="rounded-[28px] border-white/70 bg-white/74 p-5 shadow-sm">
                    <p className="wk-procurement-label text-slate-500">{tr('Ready-to-save snapshot', 'خلاصه آماده ثبت')}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        {getWorkflowBadge(draftPreviewPurchase)}
                        {getPaymentBadge(draftPreviewPurchase)}
                        {supplierIsUnknown ? <StatusBadge label={tr('Needs confirmation', 'نیازمند تأیید')} tone="warning"/> : null}
                    </div>
                    <div className="mt-4 grid gap-3">
                        <MetricCard label={tr('Final total', 'جمع نهایی')} value={formatMoney(totalAmount)} tone="border-brand-200 bg-brand-50/70 text-brand-900"/>
                        <MetricCard label={tr('Paid', 'پرداختی')} value={formatMoney(paidAmount)} tone="border-emerald-200 bg-emerald-50 text-emerald-900"/>
                        <MetricCard label={tr('Remaining', 'مانده')} value={formatMoney(remainingAmount)} tone={remainingAmount > 0 ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}/>
                    </div>
                    <div className="mt-4 grid gap-2">
                        <ActionButton label={tr('Save draft', 'ذخیره پیش‌نویس')} onClick={() => submitPurchase('draft')} disabled={!canManagePurchases || isPurchaseSubmitPending} className="w-full justify-center"/>
                        <ActionButton label={editingPurchaseId ? tr('Update final invoice', 'به‌روزرسانی نهایی سند') : tr('Finalize invoice', 'ثبت نهایی سند')} onClick={() => submitPurchase('final')} disabled={!canManagePurchases || isPurchaseSubmitPending} tone="primary" className="w-full justify-center"/>
                        <ActionButton label={tr('Reset form', 'پاکسازی فرم')} onClick={resetPurchaseEditor} disabled={!canManagePurchases || isPurchaseSubmitPending} tone="ghost" className="w-full justify-center"/>
                    </div>
                </GlassCard>

                <FlatCard className="rounded-[28px] border-slate-200 bg-white p-5">
                    <p className="text-sm font-black text-slate-900">{tr('Save guidance', 'راهنمای ثبت')}</p>
                    <p className="mt-2 wk-procurement-copy">
                        {tr('Use draft when supplier, payments, or attachments still need follow-up. Use final when the checklist above looks clean.', 'زمانی از پیش‌نویس استفاده کنید که تأمین‌کننده، پرداخت‌ها یا پیوست‌ها هنوز نیاز به پیگیری دارند. وقتی چک‌لیست بالا تمیز است از ثبت نهایی استفاده کنید.')}
                    </p>
                </FlatCard>
            </div>
        </div>);
    const renderProcurementNewTab = () => (<div className="space-y-4" data-testid="purchases-new-tab">
            <GlassCard className="rounded-[30px] border-white/70 bg-white/74 p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="wk-procurement-label text-slate-500">{editingPurchaseId ? tr('Editing purchase', 'ویرایش سند خرید') : tr('New purchase', 'سند خرید جدید')}</p>
                        <h3 className="mt-2 text-2xl font-black text-slate-950">{tr('Guided purchase flow', 'جریان هدایت‌شده خرید')}</h3>
                        <p className="mt-2 max-w-3xl wk-procurement-copy">{tr('A compact stepper keeps the whole purchase easier to review: supplier first, then items, then payments, then safe save.', 'یک stepper فشرده کل خرید را ساده‌تر می‌کند: ابتدا تأمین‌کننده، سپس اقلام، سپس پرداخت‌ها و در پایان ثبت امن.')}</p>
                    </div>
                    <div className="wk-procurement-header-meta">
                        <ProcurementKpiChip label={`${tr('Supplier', 'تأمین‌کننده')}: ${selectedSupplier?.name || tr('Pending', 'در انتظار')}`} tone="info"/>
                        <ProcurementKpiChip label={`${tr('Items', 'اقلام')}: ${formatNumber(items.length)}`} tone="warning"/>
                        <ProcurementKpiChip label={`${tr('Remaining', 'مانده')}: ${formatMoney(remainingAmount)}`} tone={remainingAmount > 0 ? 'danger' : 'info'}/>
                    </div>
                </div>
                <div className="mt-5">
                    <PurchaseStepper steps={purchaseSteps} currentStep={newPurchaseStep} onSelect={goToPurchaseStep}/>
                </div>
            </GlassCard>

            {procurementDraftNotice ? (<InlineAlert tone="info" title={tr('Draft created from Add Medicine', 'پیش‌نویس از فورم افزودن دوا ساخته شد')} data-testid="purchase-draft-focus-banner">
                    <div className="space-y-3">
                        <p>
                            {tr(`${procurementDraftNotice.medicineName || 'This item'} is now inside a supplier draft. Stock will be added only after this purchase is received.`, `${procurementDraftNotice.medicineName || 'این قلم'} اکنون داخل پیش‌نویس تأمین‌کننده قرار دارد. موجودی فقط بعد از دریافت رسمی این خرید اضافه می‌شود.`)}
                        </p>
                        {focusedProcurementDraft ? (<div className="flex flex-wrap gap-2">
                                <ActionButton label={tr('Delete Draft', 'حذف پیش‌نویس')} onClick={() => setPendingDeletePurchaseId(focusedProcurementDraft.id)} disabled={!canDeletePurchases || isDraftFocusActionPending} tone="danger"/>
                                <ActionButton label={tr('Cancel Draft', 'لغو پیش‌نویس')} onClick={handleCancelFocusedDraft} disabled={!canManagePurchases || isDraftFocusActionPending}/>
                            </div>) : null}
                    </div>
                </InlineAlert>) : null}

            {newPurchaseStep === 'supplier' ? renderProcurementSupplierStep() : null}
            {newPurchaseStep === 'items' ? renderProcurementItemsStep() : null}
            {newPurchaseStep === 'payments' ? renderProcurementPaymentsStep() : null}
            {newPurchaseStep === 'review' ? renderProcurementReviewStep() : null}
        </div>);
    const renderProcurementListTab = () => (<div className="grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]" data-testid="purchases-history-tab">
            <SectionCard title={tr('Purchase history', 'تاریخچه خرید')} subtitle={tr('Compact filters and a denser list keep status, balance, and quick actions close to each other.', 'فیلترهای فشرده و فهرست متراکم، وضعیت، مانده و عملیات سریع را نزدیک هم نگه می‌دارند.')}>
                <div className="space-y-4">
                    <div className="wk-summary-grid">
                        <MetricCard label={tr('Open', 'باز')} value={formatNumber(historyStateCounts.open)} tone="border-amber-200 bg-amber-50 text-amber-900"/>
                        <MetricCard label={tr('Overdue', 'سررسید گذشته')} value={formatNumber(historyStateCounts.overdue)} tone="border-rose-200 bg-rose-50 text-rose-900"/>
                        <MetricCard label={tr('Partial', 'پرداخت جزئی')} value={formatNumber(historyStateCounts.partial)} tone="border-warning-100 bg-warning-50 text-warning-700"/>
                        <MetricCard label={tr('Paid', 'تسویه کامل')} value={formatNumber(historyStateCounts.paid)} tone="border-emerald-200 bg-emerald-50 text-emerald-900"/>
                        <MetricCard label={tr('Remaining amount', 'جمع مانده')} value={formatMoney(historyTotals.remaining)}/>
                    </div>

                    <UnifiedFilterBar dense searchSlot={<FilterSearchField label={tr('Search purchases', 'جستجوی خریدها')} value={historySearch} onChange={setHistorySearch} placeholder={tr('Supplier, invoice, medicine, or note', 'تأمین‌کننده، فاکتور، قلم یا یادداشت')}/>} filters={[
            <FilterSelectField key="supplier" label={tr('Supplier', 'تأمین‌کننده')} value={historySupplierFilter} onChange={setHistorySupplierFilter} options={[{ value: 'all', label: tr('All suppliers', 'همه تأمین‌کنندگان') }, ...activeSuppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))]}/>,
            <FilterSelectField key="status" label={tr('Status', 'وضعیت')} value={historyStatusFilter} onChange={(value) => setHistoryStatusFilter(value as HistoryStatusFilter)} options={[{ value: 'all', label: tr('Any status', 'همه وضعیت‌ها') }, { value: 'open', label: tr('Open', 'باز') }, { value: 'overdue', label: tr('Overdue', 'سررسید گذشته') }, { value: 'paid', label: tr('Paid', 'تسویه کامل') }, { value: 'partial', label: tr('Partial', 'پرداخت جزئی') }, { value: 'draft', label: tr('Draft', 'پیش‌نویس') }, { value: 'approved', label: tr('Approved', 'تأیید شده') }, { value: 'received', label: tr('Received', 'دریافت شده') }, { value: 'cancelled', label: tr('Cancelled', 'لغو شده') }]}/>,
            renderHistoryDateRangeFilter(),
            renderHistoryAmountRangeFilter(),
            <FilterSelectField key="sort" label={tr('Sort', 'ترتیب')} value={historySort} onChange={(value) => setHistorySort(value as HistorySort)} options={[{ value: 'date_desc', label: tr('Newest first', 'جدیدترین ابتدا') }, { value: 'date_asc', label: tr('Oldest first', 'قدیمی‌ترین ابتدا') }, { value: 'amount_desc', label: tr('Highest amount', 'بالاترین مبلغ') }, { value: 'amount_asc', label: tr('Lowest amount', 'کمترین مبلغ') }, { value: 'remaining_desc', label: tr('Most remaining', 'بیشترین مانده') }]}/>
        ]} actionsSlot={<div className="flex flex-wrap gap-2">
                                <ActionButton label={tr('Reset filters', 'پاک‌سازی فیلترها')} onClick={resetHistoryFilters}/>
                                <ActionButton label={tr('Export CSV', 'خروجی CSV')} onClick={exportHistoryCsv}/>
                                <ActionButton label={tr('Print / PDF', 'چاپ / PDF')} onClick={printHistory}/>
                            </div>} activeFiltersSlot={historyActiveFilters.length ? <div className="flex flex-wrap gap-2">{historyActiveFilters.map((filter) => <ActiveFilterChip key={filter} label={filter}/>)}</div> : null} resultsLabel={tr(`${formatNumber(filteredHistory.length)} document(s) in view`, `${formatNumber(filteredHistory.length)} سند در نما`)}/>

                    {historyStateCounts.overdue > 0 ? (<InlineAlert tone="warning" title={tr('Overdue purchases need attention', 'خریدهای سررسید گذشته نیاز به توجه دارند')}>
                            {tr('Use quick pay or open the supplier profile to reduce current overdue pressure.', 'از پرداخت سریع یا پروفایل تأمین‌کننده برای کاهش فشار سررسید فعلی استفاده کنید.')}
                        </InlineAlert>) : null}

                    {inventoryGapPurchases.length > 0 ? (<InlineAlert tone="warning" title={tr('Manual inventory gap report', 'گزارش دستی مغایرت موجودی')}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <span>{tr(`${formatNumber(inventoryGapPurchases.length)} received purchase(s) need manual stock review.`, `${formatNumber(inventoryGapPurchases.length)} فاکتور دریافت‌شده نیاز به بازبینی دستی موجودی دارد.`)}</span>
                                <ActionButton label={tr('Open first case', 'باز کردن اولین مورد')} onClick={() => setHistoryPreviewId(inventoryGapPurchases[0].id)}/>
                            </div>
                        </InlineAlert>) : null}

                    <div className="wk-procurement-table-shell">
                        <div className="wk-procurement-table-head">
                            <span>{tr('Document', 'سند')}</span>
                            <span>{tr('Supplier / date', 'تأمین‌کننده / تاریخ')}</span>
                            <span>{tr('Status', 'وضعیت')}</span>
                            <span>{tr('Balance', 'مانده')}</span>
                            <span>{tr('Actions', 'عملیات')}</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {pagedHistory.map((purchase) => {
            const supplier = supplierById.get(purchase.supplierId);
            const selected = historyPreviewId === purchase.id;
            const linkedReturnSummary = getLinkedReturnSummary(purchase);
            return (<div key={purchase.id} role="button" tabIndex={0} className="wk-procurement-table-row cursor-pointer text-right" data-selected={selected ? 'true' : 'false'} data-testid={`history-row-${purchase.id}`} onClick={() => setHistoryPreviewId(purchase.id)} onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setHistoryPreviewId(purchase.id);
                    }
                }}>
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="wk-ltr-data text-sm font-black text-slate-900">{purchase.invoiceNumber || purchase.id.slice(-6)}</p>
                                                {linkedReturnSummary ? <StatusBadge label={tr('Linked returns', 'مرجوعی‌های لینک‌شده')} tone="info"/> : null}
                                            </div>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">{formatMoney(purchase.totalAmount)}</p>
                                            {linkedReturnSummary ? <p className="mt-1 text-xs font-semibold text-indigo-700">{tr('Returns', 'مرجوعی‌ها')}: {formatNumber(linkedReturnSummary.count)} | {formatMoney(linkedReturnSummary.totalCreditedAmount)}</p> : null}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-slate-900">{supplier?.name || '-'}</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">{formatDate(purchase.date)}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {getWorkflowBadge(purchase)}
                                            {getPaymentBadge(purchase)}
                                            {isPurchaseOverdue(purchase) ? <StatusBadge label={tr('Overdue', 'سررسید گذشته')} tone="danger"/> : null}
                                        </div>
                                        <div>
                                            <p className={classNames('text-sm font-black', purchase.remainingAmount > 0 ? 'text-rose-700' : 'text-emerald-700')}>{formatMoney(purchase.remainingAmount)}</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">{linkedReturnSummary ? `${tr('Returned Qty', 'تعداد مرجوعی')}: ${formatNumber(linkedReturnSummary.totalReturnedQuantity)}` : (purchase.destinationWarehouse || '-')}</p>
                                        </div>
                                        <div className="flex flex-wrap justify-end gap-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                                            <ActionButton label={tr('Details', 'جزئیات')} onClick={() => setSelectedPurchaseId(purchase.id)}/>
                                            <ActionButton label={tr('Quick pay', 'پرداخت سریع')} onClick={() => { setPurchasePaymentTargetId(purchase.id); setSettlementAmount(''); setSettlementNote(''); }} disabled={!canManagePurchases || purchase.remainingAmount <= 0 || purchase.workflowStatus === 'cancelled'} tone="primary"/>
                                        </div>
                                    </div>);
        })}
                            {!pagedHistory.length ? (<div className="p-4">
                                    <EmptyStateShell title={tr('No purchase matches the current filters', 'سندی با فیلترهای فعلی پیدا نشد')} description={tr('Try clearing one or two filters to widen the history view.', 'برای گسترده‌تر شدن نمای تاریخچه، یک یا دو فیلتر را پاک کنید.')} className="wk-empty-state-shell--compact py-8"/>
                                </div>) : null}
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-500">{tr(`Page ${formatNumber(historyPage)} of ${formatNumber(historyPageCount)}`, `صفحه ${formatNumber(historyPage)} از ${formatNumber(historyPageCount)}`)}</p>
                        <div className="flex gap-2">
                            <ActionButton label={tr('Previous', 'قبلی')} onClick={() => setHistoryPage((current) => Math.max(1, current - 1))} disabled={historyPage <= 1}/>
                            <ActionButton label={tr('Next', 'بعدی')} onClick={() => setHistoryPage((current) => Math.min(historyPageCount, current + 1))} disabled={historyPage >= historyPageCount}/>
                        </div>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title={historyPreviewPurchase ? tr('Selected purchase detail', 'جزئیات سند انتخاب‌شده') : tr('Detail tray', 'پنل جزئیات')} subtitle={historyPreviewPurchase ? tr('Review this purchase without losing your place in the history list.', 'این سند را بدون از دست دادن جای خود در فهرست تاریخچه مرور کنید.') : tr('Select one history row to open a compact detail tray here.', 'برای باز شدن پنل جزئیات، یک ردیف از تاریخچه را انتخاب کنید.')} action={historyPreviewPurchase ? <ActionButton label={tr('Open full modal', 'بازکردن جزئیات کامل')} onClick={() => setSelectedPurchaseId(historyPreviewPurchase.id)}/> : null}>
                {historyPreviewPurchase ? (() => {
            const supplier = supplierById.get(historyPreviewPurchase.supplierId);
            const returnReferenceDetails = getReturnReferenceDetails(historyPreviewPurchase);
            const linkedReturnSummary = getLinkedReturnSummary(historyPreviewPurchase);
            return (<div className="space-y-4" data-testid="history-detail-panel">
                            <GlassCard className="rounded-[28px] border-white/70 bg-white/74 p-5 shadow-sm">
                                <p className="wk-ltr-data text-lg font-black text-slate-900">{historyPreviewPurchase.invoiceNumber || historyPreviewPurchase.id.slice(-6)}</p>
                                <p className="mt-1 text-sm font-semibold text-slate-500">{supplier?.name || '-'}</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {getWorkflowBadge(historyPreviewPurchase)}
                                    {getPaymentBadge(historyPreviewPurchase)}
                                    {isPurchaseOverdue(historyPreviewPurchase) ? <StatusBadge label={tr('Overdue', 'سررسید گذشته')} tone="danger"/> : null}
                                </div>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                    <MetricCard label={tr('Final total', 'جمع نهایی')} value={formatMoney(historyPreviewPurchase.totalAmount)}/>
                                    <MetricCard label={tr('Remaining', 'مانده')} value={formatMoney(historyPreviewPurchase.remainingAmount)} tone={historyPreviewPurchase.remainingAmount > 0 ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}/>
                                    <MetricCard label={tr('Paid', 'پرداختی')} value={formatMoney(historyPreviewPurchase.paidAmount)} tone="border-emerald-200 bg-emerald-50 text-emerald-900"/>
                                    <MetricCard label={returnReferenceDetails ? tr('Returned Qty', 'تعداد مرجوعی') : tr('Items', 'اقلام')} value={formatNumber(returnReferenceDetails ? returnReferenceDetails.returnedQuantity : historyPreviewPurchase.items.length)} tone="border-sky-200 bg-sky-50 text-sky-900"/>
                                </div>
                            </GlassCard>

                            {returnReferenceDetails ? (<GlassCard className="rounded-[28px] border-indigo-200 bg-indigo-50/80 p-5 shadow-sm">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-black text-slate-900">{tr('Return document detail', 'جزئیات سند مرجوعی')}</p>
                                        <StatusBadge label={tr('Warehouse return', 'مرجوعی از گدام')} tone="info"/>
                                    </div>
                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        <MetricCard label={tr('Source purchase', 'فاکتور منبع')} value={returnReferenceDetails.sourceDocumentLabel} tone="border-indigo-200 bg-white text-indigo-900"/>
                                        <MetricCard label={tr('Source batch', 'بچ منبع')} value={returnReferenceDetails.sourceBatchLabel} tone="border-indigo-200 bg-white text-indigo-900"/>
                                        <MetricCard label={tr('Resolution', 'نوع تسویه')} value={returnReferenceDetails.resolutionLabel} tone="border-indigo-200 bg-white text-indigo-900"/>
                                        <MetricCard label={tr('Credit amount', 'مبلغ اعتبار')} value={formatMoney(returnReferenceDetails.creditedAmount)} tone="border-indigo-200 bg-white text-indigo-900"/>
                                    </div>
                                    {returnReferenceDetails.returnNote ? <p className="mt-4 text-sm font-semibold text-slate-700"><span className="font-black text-slate-900">{tr('Note', 'یادداشت')}:</span> {returnReferenceDetails.returnNote}</p> : null}
                                </GlassCard>) : linkedReturnSummary ? (<GlassCard className="rounded-[28px] border-indigo-200 bg-indigo-50/80 p-5 shadow-sm">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-black text-slate-900">{tr('Recorded warehouse returns', 'مرجوعی‌های ثبت‌شده در این سند')}</p>
                                        <StatusBadge label={tr('Single document view', 'نمای یک‌سندی')} tone="info"/>
                                    </div>
                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        <MetricCard label={tr('Return docs', 'تعداد مرجوعی‌ها')} value={formatNumber(linkedReturnSummary.count)} tone="border-indigo-200 bg-white text-indigo-900"/>
                                        <MetricCard label={tr('Returned Qty', 'تعداد مرجوعی')} value={formatNumber(linkedReturnSummary.totalReturnedQuantity)} tone="border-indigo-200 bg-white text-indigo-900"/>
                                        <MetricCard label={tr('Vendor Credit', 'اعتبار مرجوعی')} value={formatMoney(linkedReturnSummary.totalCreditedAmount)} tone="border-indigo-200 bg-white text-indigo-900"/>
                                        <MetricCard label={tr('Latest Return', 'آخرین مرجوعی')} value={formatDateTime(linkedReturnSummary.latestRecordedAt)} tone="border-indigo-200 bg-white text-indigo-900"/>
                                    </div>
                                    <div className="mt-4 space-y-3">
                                        {linkedReturnSummary.entries.map((entry) => (<div key={entry.purchaseId} className="rounded-2xl border border-indigo-200 bg-white px-4 py-3">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-black text-slate-900">{entry.documentLabel}</p>
                                                        <p className="mt-1 text-xs font-semibold text-slate-500">{formatDate(entry.recordedAt)} | {tr('Batch', 'بچ')}: {entry.sourceBatchLabel}</p>
                                                        <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Resolution', 'نوع تسویه')}: {entry.resolutionLabel}</p>
                                                        {entry.returnNote ? <p className="mt-2 text-xs font-semibold text-slate-600">{entry.returnNote}</p> : null}
                                                    </div>
                                                    <div className="text-left">
                                                        <p className="text-sm font-black text-slate-900">{formatMoney(entry.creditedAmount)}</p>
                                                        <p className="mt-1 text-xs font-semibold text-slate-500">{formatNumber(entry.returnedQuantity)} {tr('qty', 'تعداد')}</p>
                                                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                                                            <ActionButton label={tr('Edit return document', 'ویرایش سند مرجوعی')} onClick={() => {
                            const referencePurchase = purchaseById.get(entry.purchaseId);
                            if (referencePurchase)
                                populatePurchaseEditor(referencePurchase);
                        }} disabled={!canManagePurchases}/>
                                                            <ActionButton label={tr('Delete return document', 'حذف سند مرجوعی')} onClick={() => setPendingDeletePurchaseId(entry.purchaseId)} disabled={!canDeletePurchases} tone="danger"/>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>))}
                                    </div>
                                </GlassCard>) : null}

                            <FlatCard className="rounded-[28px] border-slate-200 bg-white p-5">
                                <p className="text-sm font-black text-slate-900">{tr('Snapshot', 'خلاصه')}</p>
                                <div className="mt-3 space-y-2 text-sm font-semibold text-slate-600">
                                    <p><span className="font-black text-slate-900">{tr('Invoice date', 'تاریخ سند')}:</span> {formatDate(historyPreviewPurchase.date)}</p>
                                    <p><span className="font-black text-slate-900">{returnReferenceDetails ? tr('Source purchase', 'فاکتور منبع') : tr('Due date', 'تاریخ سررسید')}:</span> {returnReferenceDetails ? returnReferenceDetails.sourceDocumentLabel : formatDate(historyPreviewPurchase.dueDate)}</p>
                                    <p><span className="font-black text-slate-900">{returnReferenceDetails ? tr('Resolution', 'نوع تسویه') : tr('Warehouse', 'انبار')}:</span> {returnReferenceDetails ? returnReferenceDetails.resolutionLabel : (historyPreviewPurchase.destinationWarehouse || '-')}</p>
                                    <p><span className="font-black text-slate-900">{returnReferenceDetails ? tr('Source batch', 'بچ منبع') : tr('Payment method', 'روش پرداخت')}:</span> {returnReferenceDetails ? returnReferenceDetails.sourceBatchLabel : getPaymentMethodLabel(historyPreviewPurchase.paymentMethod)}</p>
                                </div>
                                <div className="mt-4 grid gap-2">
                                    <ActionButton label={tr('Quick pay', 'پرداخت سریع')} onClick={() => { setPurchasePaymentTargetId(historyPreviewPurchase.id); setSettlementAmount(''); setSettlementNote(''); }} disabled={!canManagePurchases || historyPreviewPurchase.remainingAmount <= 0 || historyPreviewPurchase.workflowStatus === 'cancelled'} tone="primary" className="w-full justify-center"/>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <ActionButton label={tr('Edit', 'ویرایش')} onClick={() => populatePurchaseEditor(historyPreviewPurchase)} disabled={!canManagePurchases} className="w-full justify-center"/>
                                        <ActionButton label={tr('Duplicate', 'کپی')} onClick={() => populatePurchaseEditor(historyPreviewPurchase, true)} disabled={!canManagePurchases} className="w-full justify-center"/>
                                    </div>
                                    <ActionButton label={tr('Print / PDF', 'چاپ / PDF')} onClick={() => printPurchase(historyPreviewPurchase)} className="w-full justify-center"/>
                                    <ActionButton label={tr('Delete document', 'حذف سند')} onClick={() => setPendingDeletePurchaseId(historyPreviewPurchase.id)} disabled={!canDeletePurchases} tone="danger" className="w-full justify-center"/>
                                    <details className="wk-procurement-advanced-toggle rounded-3xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                                        <summary>{tr('More actions', 'اقدامات بیشتر')}</summary>
                                        <div className="mt-3 grid gap-2">
                                            <ActionButton label={tr('Open supplier profile', 'بازکردن پروفایل تأمین‌کننده')} onClick={() => {
                    if (supplier)
                        setSelectedSupplierProfileId(supplier.id);
                    setActiveTab('suppliers');
                }} className="w-full justify-center"/>
                                        </div>
                                    </details>
                                </div>
                            </FlatCard>
                        </div>);
        })() : (<EmptyStateShell title={tr('No purchase selected', 'سندی انتخاب نشده است')} description={tr('Choose one row from the history list to inspect balance, actions, and quick payment from here.', 'یک ردیف از تاریخچه را انتخاب کنید تا مانده، عملیات و پرداخت سریع را از همین‌جا ببینید.')} className="wk-empty-state-shell--compact py-10"/>)}
            </SectionCard>
        </div>);
    const renderProcurementSuppliersTab = () => (<div className="grid gap-4 xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]" data-testid="purchases-suppliers-tab">
            <SectionCard title={tr('Supplier directory', 'فهرست تأمین‌کنندگان')} subtitle={tr('A compact directory keeps debt, last interaction, and data risk visible before opening the full profile.', 'فهرست فشرده پیش از بازکردن پروفایل کامل، بدهی، آخرین تعامل و ریسک داده را روشن نگه می‌دارد.')}>
                <UnifiedFilterBar dense searchSlot={<FilterSearchField label={tr('Search suppliers', 'جستجوی تأمین‌کنندگان')} value={supplierSearch} onChange={setSupplierSearch} placeholder={tr('Name, company, phone, or code', 'نام، شرکت، تلفن یا کد')}/>} filters={[
            <FilterSelectField key="debt" label={tr('Debt', 'بازه بدهی')} value={supplierDebtFilter} onChange={(value) => setSupplierDebtFilter(value as SupplierDebtFilter)} options={[{ value: 'all', label: tr('Any debt range', 'همه بازه‌ها') }, { value: 'with_debt', label: tr('With debt', 'دارای بدهی') }, { value: 'settled', label: tr('Settled / zero debt', 'تسویه / بدون بدهی') }, { value: 'prepaid', label: tr('Prepaid suppliers', 'تأمین‌کنندگان دارای پیش‌پرداخت') }, { value: 'high_debt', label: tr('High debt', 'بدهی بالا') }]}/>,
            <FilterSelectField key="status" label={tr('Status', 'وضعیت')} value={supplierStatusFilter} onChange={(value) => setSupplierStatusFilter(value as 'all' | 'active' | 'inactive' | 'blocked')} options={[{ value: 'all', label: tr('All statuses', 'همه وضعیت‌ها') }, { value: 'active', label: tr('Active', 'فعال') }, { value: 'inactive', label: tr('Inactive', 'غیرفعال') }, { value: 'blocked', label: tr('Blocked', 'مسدود') }]}/>,
            <FilterSelectField key="interaction" label={tr('Interaction', 'تعامل')} value={supplierInteractionFilter} onChange={(value) => setSupplierInteractionFilter(value as SupplierInteractionFilter)} options={[{ value: 'all', label: tr('Any interaction date', 'هر تاریخ تعامل') }, { value: '7d', label: tr('Last 7 days', '۷ روز اخیر') }, { value: '30d', label: tr('Last 30 days', '۳۰ روز اخیر') }, { value: '90d', label: tr('Last 90 days', '۹۰ روز اخیر') }]}/>,
            <FilterSelectField key="sort" label={tr('Sort', 'ترتیب')} value={supplierSort} onChange={(value) => setSupplierSort(value as SupplierSort)} options={[{ value: 'debt_desc', label: tr('Highest debt', 'بیشترین بدهی') }, { value: 'debt_asc', label: tr('Lowest debt', 'کمترین بدهی') }, { value: 'name_asc', label: tr('Name A-Z', 'نام A-Z') }, { value: 'name_desc', label: tr('Name Z-A', 'نام Z-A') }, { value: 'last_purchase_desc', label: tr('Last purchase', 'آخرین خرید') }, { value: 'interaction_desc', label: tr('Last interaction', 'آخرین تعامل') }]}/>
        ]} actionsSlot={<ActionButton label={tr('Reset filters', 'پاک‌سازی فیلترها')} onClick={() => { setSupplierSearch(''); setSupplierDebtFilter('all'); setSupplierStatusFilter('all'); setSupplierInteractionFilter('all'); setSupplierSort('debt_desc'); }}/>} resultsLabel={tr(`${formatNumber(filteredSuppliers.length)} supplier(s) in view`, `${formatNumber(filteredSuppliers.length)} تأمین‌کننده در نما`)}/>
                {!canManagePurchases ? <LockHint className="mt-2">{tr('Supplier records are read-only in the current workspace.', 'رکوردهای تأمین‌کننده در این فضای کاری فقط خواندنی‌اند.')}</LockHint> : null}

                <div className="mt-4 space-y-3">
                    {filteredSuppliers.map((supplier) => {
            const insight = supplierInsights[supplier.id];
            const selected = selectedSupplierProfileId === supplier.id;
            const status = supplier.status || 'active';
            const supplierFinance = getSupplierFinancePresentation(supplierFinanceById.get(supplier.id), {
                debtLabel: tr('Open debt', 'بدهی باز')
            });
            return (<button key={supplier.id} type="button" onClick={() => setSelectedSupplierProfileId(supplier.id)} className={classNames('w-full rounded-3xl border px-4 py-4 text-right transition', selected ? 'border-brand-200 bg-brand-50/55 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50')} data-testid={`supplier-directory-${supplier.id}`}>
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h4 className="text-base font-black text-slate-900">{supplier.name}</h4>
                                            <StatusBadge label={status} tone={getSupplierStatusTone(status)}/>
                                            {isUnknownSupplier(supplier) ? <StatusBadge label={tr('Data risk', 'ریسک داده')} tone="warning"/> : null}
                                        </div>
                                        <p className="mt-2 text-sm font-semibold text-slate-500">{supplier.companyName || supplier.contactPerson || '-'}</p>
                                        <p className="mt-1 text-xs font-semibold text-slate-500">{supplier.code || '-'} | {supplier.phone || '-'}</p>
                                    </div>
                                    <div className="min-w-[220px] text-left">
                                        <div className={classNames('rounded-2xl border px-4 py-3', supplierFinance.cardTone)}>
                                            <p className="wk-procurement-label opacity-70">{supplierFinance.primaryLabel}</p>
                                            <p className={classNames('mt-2 text-lg font-black', supplierFinance.textTone)}>{supplierFinance.primaryValue}</p>
                                        </div>
                                        {supplierFinance.hasMixedPosition ? (<p className="mt-2 text-xs font-semibold text-slate-500">
                                                {tr('Prepayment', 'پیش‌پرداخت')}: {formatMoney(supplierFinance.supplierPrepayment)}
                                            </p>) : null}
                                        <p className="mt-3 text-xs font-semibold text-slate-500">{tr('Last interaction', 'آخرین تعامل')}: {formatDate(insight?.lastInteractionDate)}</p>
                                    </div>
                                </div>
                            </button>);
        })}
                    {!filteredSuppliers.length ? (<EmptyStateShell title={tr('No supplier matches the current filters', 'هیچ تأمین‌کننده‌ای با فیلترهای فعلی پیدا نشد')} description={tr('Reset one or more directory filters to widen the supplier list.', 'برای گسترده‌تر شدن فهرست تأمین‌کنندگان، یک یا چند فیلتر را پاک کنید.')} className="wk-empty-state-shell--compact py-10"/>) : null}
                </div>
            </SectionCard>

            <SectionCard title={selectedSupplierProfile ? selectedSupplierProfile.name : tr('Supplier profile', 'پروفایل تأمین‌کننده')} subtitle={selectedSupplierProfile ? tr('Switch between summary, open invoices, ledger, and purchase history without leaving this panel.', 'بین خلاصه، فاکتورهای باز، ledger و تاریخچه خرید بدون ترک این پنل جابه‌جا شوید.') : tr('Select one supplier from the directory to open a richer profile here.', 'یک تأمین‌کننده را از فهرست انتخاب کنید تا پروفایل کامل‌تر او اینجا باز شود.')} action={selectedSupplierProfile ? (<div className="flex flex-wrap items-start justify-end gap-3">
                        <div className="min-w-[280px] max-w-[460px] rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-right shadow-sm" data-testid="supplier-payment-details-summary">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <p className="wk-procurement-label text-sky-700">{tr('Latest payment details', 'جزئیات آخرین پرداخت‌ها')}</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                        {selectedSupplierPaymentDetails.length
                ? tr(`${formatNumber(selectedSupplierPaymentDetails.length)} payment detail(s)`, `${formatNumber(selectedSupplierPaymentDetails.length)} جزئیات پرداخت`)
                : tr('No payment entry yet', 'هنوز پرداختی ثبت نشده است')}
                                    </p>
                                </div>
                                <button type="button" onClick={() => setShowSupplierPaymentDetails((current) => !current)} className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-[11px] font-black text-sky-700 transition hover:bg-sky-100" data-testid="toggle-supplier-payment-details">
                                    {showSupplierPaymentDetails ? tr('Hide list', 'پنهان کردن فهرست') : tr('Show list', 'نمایش فهرست')}
                                </button>
                            </div>
                            {!showSupplierPaymentDetails && selectedSupplierPaymentDetails[0] ? (<p className="mt-2 rounded-2xl border border-white/80 bg-white/82 px-3 py-2 text-xs font-semibold text-slate-600">
                                    {tr('Latest', 'آخرین')}: <span className="wk-ltr-data font-black text-slate-900">{formatMoney(selectedSupplierPaymentDetails[0].amount)}</span>
                                    {' | '}
                                    {formatDateTime(selectedSupplierPaymentDetails[0].transaction.date)}
                                </p>) : null}
                            {showSupplierPaymentDetails && selectedSupplierPaymentDetails.length ? (<div className="mt-2 space-y-2">
                                    {selectedSupplierPaymentDetails.map((entry) => {
                    const { transaction } = entry;
                    const financeNote = parseSupplierFinanceTaggedNote(transaction.note);
                    const linkedPurchase = transaction.purchaseId ? purchaseById.get(transaction.purchaseId) || null : null;
                    return (<div key={transaction.id} className="rounded-2xl border border-white/80 bg-white/82 px-3 py-2">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <p className="wk-ltr-data text-sm font-black text-slate-900">{formatMoney(entry.amount)}</p>
                                                    <p className="text-[11px] font-black text-slate-500">{formatDateTime(transaction.date)}</p>
                                                </div>
                                                <p className="mt-1 text-xs font-semibold text-slate-600">{getPaymentMethodLabel(transaction.method)} | {transaction.description || getLedgerTypeLabel(transaction.type)}</p>
                                                <p className="mt-1 text-xs font-semibold text-slate-500">
                                                    {linkedPurchase
                            ? `${tr('Invoice', 'فاکتور')}: ${linkedPurchase.invoiceNumber || linkedPurchase.id.slice(-6)}`
                            : `${tr('Reference', 'مرجع')}: ${transaction.referenceId || '-'}`}
                                                </p>
                                                <div className="mt-2 grid gap-1 rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-600">
                                                    <p>{tr('Before payment', 'قبل از پرداخت')}: <span className="font-black text-slate-900">{formatSupplierLedgerBalance(entry.balanceBefore)}</span></p>
                                                    <p>{tr('Paid amount', 'مبلغ پرداخت')}: <span className="wk-ltr-data font-black text-slate-900">{formatMoney(entry.amount)}</span></p>
                                                    <p>{tr('Debt reduced', 'کاهش بدهی')}: <span className="wk-ltr-data font-black text-emerald-700">{formatMoney(entry.debtApplied)}</span></p>
                                                    <p>{tr('Saved as prepayment', 'ثبت به‌عنوان پیش‌پرداخت')}: <span className="wk-ltr-data font-black text-sky-700">{formatMoney(entry.prepaymentCreated)}</span></p>
                                                    <p>{tr('Balance after', 'مانده بعد')}: <span className="font-black text-slate-900">{formatSupplierLedgerBalance(entry.balanceAfter)}</span></p>
                                                </div>
                                                {financeNote.displayNote ? <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Note', 'یادداشت')}: {financeNote.displayNote}</p> : null}
                                                {transaction.recordedBy ? <p className="mt-1 text-xs font-semibold text-slate-400">{tr('Recorded by', 'ثبت‌کننده')}: {transaction.recordedBy}</p> : null}
                                            </div>);
                })}
                                </div>) : showSupplierPaymentDetails ? (<p className="mt-2 text-xs font-semibold text-slate-500">{tr('No supplier payment has been recorded yet.', 'هنوز پرداختی برای این تأمین‌کننده ثبت نشده است.')}</p>) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <ActionButton label={tr('Edit profile', 'ویرایش پروفایل')} onClick={() => openSupplierModal(selectedSupplierProfile)} disabled={!canManagePurchases}/>
                            <ActionButton label={tr('Delete supplier', 'حذف تأمین‌کننده')} onClick={() => openSupplierDeleteModal(selectedSupplierProfile)} disabled={!canDeleteSuppliers} tone="danger"/>
                            <ActionButton label={tr('Record settlement', 'ثبت تسویه')} onClick={() => {
                setSupplierPaymentTargetId(selectedSupplierProfile.id);
                setSupplierPaymentMode('settlement');
                setSettlementAmount('');
                setSettlementNote('');
                setSettlementReference('');
            }} disabled={!canManagePurchases || selectedSupplierProfileFinance.openDebt <= 0} tone="primary"/>
                            <ActionButton label={tr('Record advance payment', 'ثبت پیش‌پرداخت')} onClick={() => {
                setSupplierPaymentTargetId(selectedSupplierProfile.id);
                setSupplierPaymentMode('advance');
                setSettlementAmount('');
                setSettlementNote('');
                setSettlementReference('');
            }} disabled={!canManagePurchases}/>
                        </div>
                    </div>) : null}>
                {selectedSupplierProfile ? (<div className="space-y-4">
                        <div className="wk-procurement-subtabs" role="tablist" aria-label={tr('Supplier profile sections', 'بخش‌های پروفایل تأمین‌کننده')}>
                            {[
                { id: 'summary' as const, label: tr('Summary', 'خلاصه') },
                { id: 'open' as const, label: tr('Open invoices', 'فاکتورهای باز') },
                { id: 'ledger' as const, label: tr('Ledger', 'ledger') },
                { id: 'history' as const, label: tr('History', 'تاریخچه') }
            ].map((tab) => (<button key={tab.id} type="button" className="wk-tab-strip__item" data-active={supplierProfileSection === tab.id ? 'true' : 'false'} onClick={() => setSupplierProfileSection(tab.id)} data-testid={`supplier-profile-tab-${tab.id}`}>
                                    {tab.label}
                                </button>))}
                        </div>

                        <div className="wk-summary-grid">
                            <MetricCard label={tr('Open debt', 'بدهی باز')} value={formatMoney(selectedSupplierProfileFinance.openDebt)} tone={getDebtMetricTone(selectedSupplierProfileFinance.openDebt)}/>
                            <MetricCard label={tr('Supplier prepayment', 'پیش‌پرداخت تامین‌کننده')} value={formatMoney(selectedSupplierProfileFinance.supplierPrepayment)} tone={getPrepaymentMetricTone(selectedSupplierProfileFinance.supplierPrepayment)}/>
                            <MetricCard label={tr('Net balance', 'تراز خالص')} value={formatMoney(Math.abs(selectedSupplierProfileFinance.netBalance))} tone={getNetBalanceMetricTone(getSupplierNetBalanceDisplay(selectedSupplierProfileFinance.netBalance).status)}/>
                            <MetricCard label={tr('Open invoices', 'فاکتورهای باز')} value={formatNumber(selectedSupplierProfileFinance.openInvoiceCount)} tone="border-amber-200 bg-amber-50 text-amber-900"/>
                            <MetricCard label={tr('Last interaction', 'آخرین تعامل')} value={formatDate(supplierInsights[selectedSupplierProfile.id]?.lastInteractionDate)}/>
                        </div>

                        {supplierProfileSection === 'summary' ? (<div className="grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                                <FlatCard className="rounded-[28px] border-slate-200 bg-slate-50/80 p-5">
                                    <p className="text-sm font-black text-slate-900">{tr('Contact and business context', 'اطلاعات تماس و زمینه کاری')}</p>
                                    <div className="mt-4 space-y-2 text-sm font-semibold text-slate-600">
                                        <p><span className="font-black text-slate-900">{tr('Company', 'شرکت')}:</span> {selectedSupplierProfile.companyName || '-'}</p>
                                        <p><span className="font-black text-slate-900">{tr('Representative', 'نماینده')}:</span> {selectedSupplierProfile.contactPerson || '-'}</p>
                                        <p><span className="font-black text-slate-900">{tr('Phone', 'تلفن')}:</span> {selectedSupplierProfile.phone || '-'}</p>
                                        <p><span className="font-black text-slate-900">{tr('Email', 'ایمیل')}:</span> {selectedSupplierProfile.email || '-'}</p>
                                        <p><span className="font-black text-slate-900">{tr('Address', 'آدرس')}:</span> {selectedSupplierProfile.address || '-'}</p>
                                        <p><span className="font-black text-slate-900">{tr('Payment terms', 'شرایط پرداخت')}:</span> {selectedSupplierProfile.paymentTerms || '-'}</p>
                                        <p><span className="font-black text-slate-900">{tr('Opening balance', 'تراز افتتاحیه')}:</span> {formatMoney(selectedSupplierProfile.openingBalance || 0)}</p>
                                    </div>
                                </FlatCard>

                                <FlatCard className="rounded-[28px] border-slate-200 bg-white p-5">
                                    <p className="text-sm font-black text-slate-900">{tr('Why this supplier matters now', 'چرایی اهمیت فعلی این تأمین‌کننده')}</p>
                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        <MetricCard label={tr('Open amount', 'جمع باز')} value={formatMoney(selectedSupplierProfileFinance.openDebt)} tone="border-rose-200 bg-rose-50 text-rose-900"/>
                                        <MetricCard label={tr('Open invoices', 'فاکتورهای باز')} value={formatNumber(selectedSupplierProfileFinance.openInvoiceCount)} tone="border-amber-200 bg-amber-50 text-amber-900"/>
                                        <MetricCard label={tr('Last purchase', 'آخرین خرید')} value={formatDate(supplierInsights[selectedSupplierProfile.id]?.lastPurchaseDate)}/>
                                        <MetricCard label={tr('Status', 'وضعیت')} value={selectedSupplierProfile.status || 'active'}/>
                                    </div>
                                    {selectedSupplierProfile.notes ? (<div className="wk-procurement-ghost-summary mt-4">
                                            <p className="text-sm font-black text-slate-900">{tr('Notes', 'یادداشت')}</p>
                                            <p className="mt-2 text-sm font-semibold leading-7 text-slate-600">{selectedSupplierProfile.notes}</p>
                                        </div>) : null}
                                </FlatCard>
                                <FlatCard className="rounded-[28px] border-slate-200 bg-white p-5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-black text-slate-900">{tr('Supplier Performance', 'عملکرد تأمین‌کننده')}</p>
                                        <NewFeatureBadge />
                                    </div>
                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        <MetricCard label={tr('Receipt completion', 'تکمیل دریافت')} value={`${formatNumber(supplierInsights[selectedSupplierProfile.id]?.completionRate || 0)}%`} tone="border-sky-200 bg-sky-50 text-sky-900"/>
                                        <MetricCard label={tr('Partial receipts', 'دریافت‌های جزئی')} value={formatNumber(supplierInsights[selectedSupplierProfile.id]?.partialReceiptCount || 0)} tone="border-amber-200 bg-amber-50 text-amber-900"/>
                                        <MetricCard label={tr('Vendor credits', 'اعتبارهای مرجوعی')} value={formatNumber(supplierInsights[selectedSupplierProfile.id]?.vendorCreditCount || 0)} tone="border-rose-200 bg-rose-50 text-rose-900"/>
                                        <MetricCard label={tr('Vendor credit total', 'جمع مبلغ اعتبار مرجوعی')} value={formatMoney(supplierInsights[selectedSupplierProfile.id]?.vendorCreditAmount || 0)} tone="border-brand-200 bg-brand-50 text-brand-900"/>
                                        <MetricCard label={tr('Return references', 'تعداد اسناد مرجع مرجوعی')} value={formatNumber(supplierInsights[selectedSupplierProfile.id]?.returnReferenceCount || 0)} tone="border-indigo-200 bg-indigo-50 text-indigo-900"/>
                                        <MetricCard label={tr('Avg buy rate', 'میانگین نرخ خرید')} value={supplierInsights[selectedSupplierProfile.id]?.averagePurchaseRate ? formatMoney(supplierInsights[selectedSupplierProfile.id]?.averagePurchaseRate || 0) : tr('N/A', 'ندارد')}/>
                                    </div>
                                </FlatCard>
                            </div>) : null}

                        {supplierProfileSection === 'open' ? (<div className="space-y-3">
                                {supplierProfileOutstanding.map((purchase) => (<div key={purchase.id} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-black text-slate-900">{purchase.invoiceNumber || purchase.id.slice(-6)}</p>
                                                <p className="mt-1 text-xs font-semibold text-slate-500">{formatDate(purchase.date)} {purchase.dueDate ? `| ${tr('Due', 'سررسید')}: ${formatDate(purchase.dueDate)}` : ''}</p>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {getWorkflowBadge(purchase)}
                                                    {getPaymentBadge(purchase)}
                                                    {isPurchaseOverdue(purchase) ? <StatusBadge label={tr('Overdue', 'سررسید گذشته')} tone="danger"/> : null}
                                                </div>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-black text-rose-700">{formatMoney(purchase.remainingAmount)}</p>
                                                <p className="mt-1 text-xs font-semibold text-slate-500">{formatMoney(purchase.totalAmount)} {tr('final total', 'جمع نهایی')}</p>
                                            </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <ActionButton label={tr('View', 'مشاهده')} onClick={() => setSelectedPurchaseId(purchase.id)}/>
                                            <ActionButton label={tr('Add payment', 'ثبت پرداخت')} onClick={() => { setPurchasePaymentTargetId(purchase.id); setSettlementAmount(''); setSettlementNote(''); }} disabled={!canManagePurchases || purchase.remainingAmount <= 0} tone="primary"/>
                                        </div>
                                    </div>))}
                                {!supplierProfileOutstanding.length ? (<EmptyStateShell title={tr('No open invoice for this supplier', 'برای این تأمین‌کننده فاکتور بازی وجود ندارد')} description={tr('This supplier currently has no remaining amount to follow up from here.', 'این تأمین‌کننده در حال حاضر مانده بازی برای پیگیری از اینجا ندارد.')} className="wk-empty-state-shell--compact py-10"/>) : null}
                            </div>) : null}

                        {supplierProfileSection === 'ledger' ? (<div className="wk-procurement-table-shell">
                                <div className="wk-procurement-table-head">
                                    <span>{tr('Date', 'تاریخ')}</span>
                                    <span>{tr('Type', 'نوع')}</span>
                                    <span>{tr('Amount', 'مبلغ')}</span>
                                    <span>{tr('Balance after', 'مانده بعد')}</span>
                                    <span>{tr('Description', 'شرح')}</span>
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {(selectedSupplierProfile.transactions || []).slice().reverse().map((transaction) => (<div key={transaction.id} className="wk-procurement-table-row">
                                            <div>{formatDate(transaction.date)}</div>
                                            <div className="font-black text-slate-900">{getLedgerTypeLabel(transaction.type)}</div>
                                            <div className="font-black text-slate-900">{formatMoney(transaction.amount)}</div>
                                            <div className={classNames('font-black', getNetBalanceTextTone(getSupplierNetBalanceDisplay(transaction.balanceAfter).status))}>{formatSupplierLedgerBalance(transaction.balanceAfter)}</div>
                                            <div className="text-sm font-semibold text-slate-600"><p>{transaction.description}</p>{parseSupplierFinanceTaggedNote(transaction.note).displayNote ? <p className="mt-1 text-xs text-slate-500">{parseSupplierFinanceTaggedNote(transaction.note).displayNote}</p> : null}</div>
                                        </div>))}
                                    {!selectedSupplierProfile.transactions?.length ? (<div className="p-4">
                                            <EmptyStateShell title={tr('No ledger entry recorded', 'هنوز رویدادی در ledger ثبت نشده است')} description={tr('When invoices, return references, and settlements are recorded they will appear here with their amount details.', 'وقتی فاکتور، سند مرجع مرجوعی و تسویه ثبت شوند، همراه با جزئیات مبلغ در همین‌جا دیده می‌شوند.')} className="wk-empty-state-shell--compact py-8"/>
                                        </div>) : null}
                                </div>
                            </div>) : null}

                        {supplierProfileSection === 'history' ? (<div className="space-y-3">
                                {supplierProfilePurchases.map((purchase) => (<button key={purchase.id} type="button" onClick={() => setSelectedPurchaseId(purchase.id)} className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-right transition hover:border-brand-200 hover:bg-brand-50/40">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="text-sm font-black text-slate-900">{getPurchaseDocumentLabel(purchase)}</p>
                                                    {isInventoryReturnReferencePurchase(purchase) ? <StatusBadge label={tr('Return reference', 'سند مرجع مرجوعی')} tone="info"/> : null}
                                                </div>
                                                <p className="mt-1 text-xs font-semibold text-slate-500">{formatDate(purchase.date)} | {formatNumber(purchase.items.length)} {tr('item(s)', 'قلم')}</p>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-black text-slate-900">{formatMoney(purchase.totalAmount)}</p>
                                                <p className="mt-1 text-xs font-semibold text-slate-500">{formatMoney(purchase.remainingAmount)} {tr('remaining', 'مانده')}</p>
                                            </div>
                                        </div>
                                    </button>))}
                                {!supplierProfilePurchases.length ? (<EmptyStateShell title={tr('No purchase history found', 'هنوز تاریخچه خریدی پیدا نشد')} description={tr('This supplier has no registered purchase document yet.', 'این تأمین‌کننده هنوز سند خرید ثبت‌شده ندارد.')} className="wk-empty-state-shell--compact py-10"/>) : null}
                            </div>) : null}
                    </div>) : (<EmptyStateShell title={tr('No supplier selected', 'تأمین‌کننده‌ای انتخاب نشده است')} description={tr('Choose one supplier from the directory to review summary, open invoices, ledger, and history here.', 'یک تأمین‌کننده را از فهرست انتخاب کنید تا خلاصه، فاکتورهای باز، ledger و تاریخچه او اینجا دیده شود.')} className="wk-empty-state-shell--compact py-12"/>)}
            </SectionCard>
        </div>);
    const renderSupplierModal = () => (<div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
                <div><label className="block text-xs font-black text-slate-500">{tr('Supplier Name', 'نام تأمین‌کننده')}</label><input type="text" value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:bg-white"/></div>
                <div><label className="block text-xs font-black text-slate-500">{tr('Company Name', 'نام شرکت')}</label><input type="text" value={supplierForm.companyName} onChange={(event) => setSupplierForm((current) => ({ ...current, companyName: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:bg-white"/></div>
                <div><label className="block text-xs font-black text-slate-500">{tr('Representative', 'نماینده')}</label><input type="text" value={supplierForm.contactPerson} onChange={(event) => setSupplierForm((current) => ({ ...current, contactPerson: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:bg-white"/></div>
                <div><label className="block text-xs font-black text-slate-500">{tr('Supplier Code', 'کد تأمین‌کننده')}</label><input type="text" value={supplierForm.code} onChange={(event) => setSupplierForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:bg-white"/></div>
                <div><label className="block text-xs font-black text-slate-500">{tr('Phone', 'تلفن')}</label><input type="text" value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: normalizePersianNumbers(event.target.value) }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:bg-white"/></div>
                <div><label className="block text-xs font-black text-slate-500">{tr('Email', 'ایمیل')}</label><input type="email" value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:bg-white"/></div>
                <div>
                    <label className="block text-xs font-black text-slate-500">{tr('Supplier opening account balance', 'مانده ابتدایی حساب تأمین‌کننده')}</label>
                    <select value={supplierForm.openingBalanceMode} onChange={(event) => setSupplierForm((current) => ({ ...current, openingBalanceMode: event.target.value as SupplierOpeningBalanceMode }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400">
                        <option value="debt">{tr('We owe this supplier', 'ما به تأمین‌کننده بدهکاریم')}</option>
                        <option value="credit">{tr('We have supplier credit / prepayment', 'ما نزد تأمین‌کننده پیش‌پرداخت/طلب داریم')}</option>
                        <option value="settled">{tr('No opening balance', 'بدون مانده ابتدایی')}</option>
                    </select>
                    <input type="text" inputMode="decimal" value={supplierForm.openingBalance} onChange={(event) => setSupplierForm((current) => ({ ...current, openingBalance: normalizePersianNumbers(event.target.value) }))} disabled={supplierForm.openingBalanceMode === 'settled'} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60" placeholder="0"/>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">{tr('Positive debt and supplier credit are stored separately by direction.', 'قرض سابقه و پیش‌پرداخت/طلب سابقه با جهت جداگانه ذخیره می‌شود.')}</p>
                </div>
                <div><label className="block text-xs font-black text-slate-500">{tr('Status', 'وضعیت')}</label><select value={supplierForm.status} onChange={(event) => setSupplierForm((current) => ({ ...current, status: event.target.value as SupplierFormState['status'] }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400"><option value="active">{tr('Active', 'فعال')}</option><option value="inactive">{tr('Inactive', 'غیرفعال')}</option><option value="blocked">{tr('Blocked', 'مسدود')}</option></select></div>
                <div className="md:col-span-2"><label className="block text-xs font-black text-slate-500">{tr('Address', 'آدرس')}</label><textarea value={supplierForm.address} onChange={(event) => setSupplierForm((current) => ({ ...current, address: event.target.value }))} className="mt-2 min-h-[88px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:bg-white"/></div>
                <div><label className="block text-xs font-black text-slate-500">{tr('Payment Terms', 'شرایط پرداخت')}</label><textarea value={supplierForm.paymentTerms} onChange={(event) => setSupplierForm((current) => ({ ...current, paymentTerms: event.target.value }))} className="mt-2 min-h-[88px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:bg-white"/></div>
                <div><label className="block text-xs font-black text-slate-500">{tr('Notes', 'یادداشت')}</label><textarea value={supplierForm.notes} onChange={(event) => setSupplierForm((current) => ({ ...current, notes: event.target.value }))} className="mt-2 min-h-[88px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:bg-white"/></div>
            </div>
            <div className="flex justify-end gap-3"><ActionButton label={tr('Cancel', 'انصراف')} onClick={() => setSupplierModalOpen(false)}/><ActionButton label={tr('Save Supplier', 'ذخیره تأمین‌کننده')} onClick={handleSaveSupplier} disabled={!canManagePurchases} tone="primary"/></div>
        </div>);
    const renderPurchaseDetailsModal = () => selectedPurchase ? (() => {
        const supplier = supplierById.get(selectedPurchase.supplierId);
        const relatedTransactions = (supplier?.transactions || [])
            .filter((transaction) => transaction.referenceId === selectedPurchase.id)
            .slice()
            .reverse();
        const purchasePayments = selectedPurchase.payments || [];
        const purchaseAttachments = selectedPurchase.attachments || [];
        const purchaseAuditTrail = (selectedPurchase.auditTrail || [])
            .slice()
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const receivedQuantity = getPurchaseReceivedQuantity(selectedPurchase);
        const returnedQuantity = getPurchaseReturnedQuantity(selectedPurchase.vendorCredits || []);
        const linkedBatchCount = medicines.reduce((sum, medicine) => (sum + (medicine.batches || []).filter((batch) => batch.purchaseId === selectedPurchase.id).length), 0);
        const vendorCreditCount = selectedPurchase.vendorCredits?.length || 0;
        const vendorCreditAmount = getPurchaseVendorCreditTotal(selectedPurchase.vendorCredits || []);
        const operationalStage = resolvePurchaseOperationalStage(selectedPurchase);
        const isReturnReference = isInventoryReturnReferencePurchase(selectedPurchase);
        const referenceMeta = getInventoryReturnReferenceMeta(selectedPurchase);
        const sourcePurchase = referenceMeta.sourcePurchaseId
            ? normalizedPurchases.find((purchase) => purchase.id === referenceMeta.sourcePurchaseId) || null
            : null;
        const linkedReturnSummary = getLinkedReturnSummary(selectedPurchase);
        return (<div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="wk-procurement-label text-slate-500">{tr('Invoice Snapshot', 'خلاصه فاکتور')}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <h4 className="text-xl font-black text-slate-900">{getPurchaseDocumentLabel(selectedPurchase)}</h4>
                            {isReturnReference ? <StatusBadge label={tr('Return reference', 'سند مرجع مرجوعی')} tone="info"/> : null}
                        </div>
                        <p className="mt-1 text-sm font-semibold text-slate-500">{supplier?.name || tr('Unknown supplier', 'تأمین‌کننده نامشخص')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {getWorkflowBadge(selectedPurchase)}
                        {getPaymentBadge(selectedPurchase)}
                        <StatusBadge label={`${tr('Stage', 'مرحله')}: ${operationalStage.replace(/_/g, ' ')}`} tone="info"/>
                        {isPurchaseOverdue(selectedPurchase) ? <StatusBadge label={tr('Overdue', 'سررسید گذشته')} tone="danger"/> : null}
                    </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-4">
                    <MetricCard label={tr('Final Total', 'جمع نهایی')} value={formatMoney(selectedPurchase.totalAmount)}/>
                    <MetricCard label={tr('Paid', 'پرداختی')} value={formatMoney(selectedPurchase.paidAmount)} tone="border-emerald-200 bg-emerald-50 text-emerald-900"/>
                    <MetricCard label={tr('Remaining', 'مانده')} value={formatMoney(selectedPurchase.remainingAmount)} tone="border-rose-200 bg-rose-50 text-rose-900"/>
                    <MetricCard label={tr('Credited Amount', 'مبلغ اعتبار مرجوعی')} value={formatMoney(vendorCreditAmount)} tone="border-brand-200 bg-brand-50 text-brand-900"/>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard label={tr('Received Qty', 'تعداد دریافت‌شده')} value={formatNumber(receivedQuantity)} tone="border-sky-200 bg-sky-50 text-sky-900"/>
                    <MetricCard label={tr('Returned Qty', 'تعداد مرجوعی')} value={formatNumber(returnedQuantity)} tone="border-amber-200 bg-amber-50 text-amber-900"/>
                    <MetricCard label={tr('Linked Batches', 'بچ‌های متصل')} value={formatNumber(linkedBatchCount)}/>
                    <MetricCard label={tr('Vendor Credits', 'اعتبارهای مرجوعی')} value={`${formatNumber(vendorCreditCount)} | ${formatMoney(vendorCreditAmount)}`} tone="border-brand-200 bg-brand-50 text-brand-900"/>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                    <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-700">
                                <p><span className="font-black text-slate-900">{tr('Invoice date', 'تاریخ فاکتور')}:</span> {formatDate(selectedPurchase.date)}</p>
                                <p className="mt-2"><span className="font-black text-slate-900">{tr('Due date', 'تاریخ سررسید')}:</span> {formatDate(selectedPurchase.dueDate)}</p>
                                <p className="mt-2"><span className="font-black text-slate-900">{tr('Warehouse', 'انبار مقصد')}:</span> {selectedPurchase.destinationWarehouse || '-'}</p>
                                <p className="mt-2"><span className="font-black text-slate-900">{tr('Payment method', 'روش پرداخت')}:</span> {getPaymentMethodLabel(selectedPurchase.paymentMethod)}</p>
                            </div>
                            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-700">
                                <p><span className="font-black text-slate-900">{tr('Supplier', 'تأمین‌کننده')}:</span> {supplier?.name || '-'}</p>
                                <p className="mt-2"><span className="font-black text-slate-900">{tr('Representative', 'نماینده')}:</span> {supplier?.contactPerson || '-'}</p>
                                <p className="mt-2"><span className="font-black text-slate-900">{tr('Phone', 'تلفن')}:</span> {supplier?.phone || '-'}</p>
                                <p className="mt-2"><span className="font-black text-slate-900">{tr('Payment terms', 'شرایط پرداخت')}:</span> {supplier?.paymentTerms || '-'}</p>
                            </div>
                        </div>

                        {isReturnReference ? (<div className="rounded-3xl border border-indigo-200 bg-indigo-50/80 p-5 text-sm font-semibold text-slate-700">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-black text-slate-900">{tr('Return Reference Context', 'زمینه سند مرجع مرجوعی')}</p>
                                    <NewFeatureBadge />
                                </div>
                                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    <MetricCard label={tr('Source purchase', 'فاکتور منبع')} value={sourcePurchase ? getPurchaseDocumentLabel(sourcePurchase) : (referenceMeta.sourcePurchaseId || '-')} tone="border-indigo-200 bg-white text-indigo-900"/>
                                    <MetricCard label={tr('Source batch', 'بچ منبع')} value={referenceMeta.sourceBatchNumber || '-'} tone="border-indigo-200 bg-white text-indigo-900"/>
                                    <MetricCard label={tr('Resolution', 'نوع تسویه')} value={getVendorCreditResolutionLabel(referenceMeta.resolution)} tone="border-indigo-200 bg-white text-indigo-900"/>
                                    <MetricCard label={tr('Returned Qty', 'تعداد مرجوعی')} value={formatNumber(returnedQuantity)} tone="border-indigo-200 bg-white text-indigo-900"/>
                                    <MetricCard label={tr('Recorded at', 'زمان ثبت')} value={formatDateTime((selectedPurchase.vendorCredits || [])[0]?.date || selectedPurchase.date)} tone="border-indigo-200 bg-white text-indigo-900"/>
                                    <MetricCard label={tr('Vendor credit total', 'جمع مبلغ اعتبار مرجوعی')} value={formatMoney(vendorCreditAmount)} tone="border-indigo-200 bg-white text-indigo-900"/>
                                </div>
                                {(selectedPurchase.vendorCredits || [])[0]?.note ? <p className="mt-4 text-sm font-semibold text-slate-700"><span className="font-black text-slate-900">{tr('Return note', 'یادداشت مرجوعی')}:</span> {(selectedPurchase.vendorCredits || [])[0]?.note}</p> : null}
                            </div>) : linkedReturnSummary ? (<div className="rounded-3xl border border-indigo-200 bg-indigo-50/80 p-5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-black text-slate-900">{tr('Linked Return References', 'اسناد مرجع مرجوعی مرتبط')}</p>
                                    <NewFeatureBadge />
                                </div>
                                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <MetricCard label={tr('Return docs', 'تعداد مرجوعی‌ها')} value={formatNumber(linkedReturnSummary.count)} tone="border-indigo-200 bg-white text-indigo-900"/>
                                    <MetricCard label={tr('Returned Qty', 'تعداد مرجوعی')} value={formatNumber(linkedReturnSummary.totalReturnedQuantity)} tone="border-indigo-200 bg-white text-indigo-900"/>
                                    <MetricCard label={tr('Vendor credit total', 'جمع مبلغ اعتبار مرجوعی')} value={formatMoney(linkedReturnSummary.totalCreditedAmount)} tone="border-indigo-200 bg-white text-indigo-900"/>
                                    <MetricCard label={tr('Latest return', 'آخرین مرجوعی')} value={formatDateTime(linkedReturnSummary.latestRecordedAt)} tone="border-indigo-200 bg-white text-indigo-900"/>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {linkedReturnSummary.entries.map((entry) => (<div key={entry.purchaseId} className="rounded-2xl border border-indigo-200 bg-white px-4 py-3">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="text-sm font-black text-slate-900">{entry.documentLabel}</p>
                                                        <StatusBadge label={tr('Return reference', 'سند مرجع مرجوعی')} tone="info"/>
                                                    </div>
                                                    <p className="mt-1 text-xs font-semibold text-slate-500">{formatDate(entry.recordedAt)} | {formatMoney(entry.creditedAmount)}</p>
                                                    <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Batch', 'بچ')}: {entry.sourceBatchLabel} | {tr('Resolution', 'نوع تسویه')}: {entry.resolutionLabel}</p>
                                                    <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Returned Qty', 'تعداد مرجوعی')}: {formatNumber(entry.returnedQuantity)}</p>
                                                    {entry.returnNote ? <p className="mt-2 text-xs font-semibold text-slate-600">{entry.returnNote}</p> : null}
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-sm font-black text-slate-900">{formatMoney(entry.creditedAmount)}</p>
                                                    <p className="mt-1 text-xs font-semibold text-slate-500">{formatNumber(entry.returnedQuantity)} {tr('qty', 'تعداد')}</p>
                                                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                                                        <ActionButton label={tr('Edit return document', 'ویرایش سند مرجوعی')} onClick={() => {
                        const referencePurchase = purchaseById.get(entry.purchaseId);
                        if (!referencePurchase)
                            return;
                        populatePurchaseEditor(referencePurchase);
                        setSelectedPurchaseId(null);
                    }} disabled={!canManagePurchases}/>
                                                        <ActionButton label={tr('Delete return document', 'حذف سند مرجوعی')} onClick={() => setPendingDeletePurchaseId(entry.purchaseId)} disabled={!canDeletePurchases} tone="danger"/>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>))}
                                </div>
                            </div>) : null}

                        <div className="rounded-3xl border border-slate-200">
                            <div className="border-b border-slate-100 px-5 py-4">
                                <p className="text-sm font-black text-slate-900">{tr('Invoice Items', 'اقلام فاکتور')}</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-4 py-3 text-right font-black text-slate-500">{tr('Item', 'قلم')}</th>
                                            <th className="px-4 py-3 text-right font-black text-slate-500">{tr('Batch / barcode', 'سری ساخت / بارکد')}</th>
                                            <th className="px-4 py-3 text-center font-black text-slate-500">{tr('Qty', 'تعداد')}</th>
                                            <th className="px-4 py-3 text-center font-black text-slate-500">{tr('Unit', 'واحد')}</th>
                                            <th className="px-4 py-3 text-center font-black text-slate-500">{tr('Buy Price', 'قیمت خرید')}</th>
                                            <th className="px-4 py-3 text-center font-black text-slate-500">{tr('Line Total', 'جمع سطر')}</th>
                                            <th className="px-4 py-3 text-right font-black text-slate-500">{tr('Notes', 'یادداشت')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {selectedPurchase.items.map((item, index) => (<tr key={`${item.medicineId}-${item.batchNumber}-${index}`}>
                                                <td className="px-4 py-4">
                                                    <p className="font-black text-slate-900">{item.medicineName || medicineById.get(item.medicineId)?.name || '-'}</p>
                                                    <p className="mt-1 text-xs font-semibold text-slate-500">{item.expiryDate ? `${tr('Expiry', 'انقضا')}: ${formatExpiryDate(item.expiryDate)}` : tr('No expiry', 'بدون تاریخ انقضا')}</p>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <p className="font-black text-slate-900">{item.batchNumber || '-'}</p>
                                                    <p className="mt-1 text-xs font-semibold text-slate-500">{item.barcode || '-'}</p>
                                                </td>
                                                <td className="px-4 py-4 text-center font-black text-slate-900">{formatNumber(item.quantity)}</td>
                                                <td className="px-4 py-4 text-center font-semibold text-slate-600">{item.unit || '-'}</td>
                                                <td className="px-4 py-4 text-center font-black text-slate-900">{formatMoney(item.purchasePrice)}</td>
                                                <td className="px-4 py-4 text-center font-black text-slate-900">{formatMoney(getPurchaseItemTotal(item))}</td>
                                                <td className="px-4 py-4 text-sm font-semibold text-slate-600">{item.notes || '-'}</td>
                                            </tr>))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200">
                            <div className="border-b border-slate-100 px-5 py-4">
                                <p className="text-sm font-black text-slate-900">{tr('Financial Breakdown', 'ریزمالی')}</p>
                            </div>
                            <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
                                <MetricCard label={tr('Subtotal', 'جمع اقلام')} value={formatMoney(selectedPurchase.subtotalAmount || 0)}/>
                                <MetricCard label={tr('Discount', 'تخفیف')} value={formatMoney(selectedPurchase.discountAmount || 0)} tone="border-amber-200 bg-amber-50 text-amber-900"/>
                                <MetricCard label={tr('Tax / Duty', 'مالیات / عوارض')} value={formatMoney(selectedPurchase.taxAmount || 0)} tone="border-sky-200 bg-sky-50 text-sky-900"/>
                                <MetricCard label={tr('Shipping', 'حمل')} value={formatMoney(selectedPurchase.shippingAmount || 0)}/>
                                <MetricCard label={tr('Extra Charges', 'هزینه جانبی')} value={formatMoney(selectedPurchase.extraChargesAmount || 0)}/>
                                <MetricCard label={tr('Last Payment', 'آخرین پرداخت')} value={formatDate(getPurchaseLastPaymentDate(selectedPurchase))} tone="border-emerald-200 bg-emerald-50 text-emerald-900"/>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                            <p className="text-sm font-black text-slate-900">{tr('Quick Actions', 'اقدامات سریع')}</p>
                            <div className="mt-4 grid gap-2">
                                <ActionButton label={tr('Edit Invoice', 'ویرایش فاکتور')} onClick={() => { populatePurchaseEditor(selectedPurchase); setSelectedPurchaseId(null); }} disabled={!canManagePurchases}/>
                                <ActionButton label={tr('Duplicate Invoice', 'کپی فاکتور')} onClick={() => { populatePurchaseEditor(selectedPurchase, true); setSelectedPurchaseId(null); }} disabled={!canManagePurchases}/>
                                <ActionButton label={tr('Print / PDF', 'چاپ / PDF')} onClick={() => printPurchase(selectedPurchase)}/>
                                <ActionButton label={tr('Record Receipt', 'ثبت دریافت')} onClick={() => { openPurchaseReceiptModal(selectedPurchase); setSelectedPurchaseId(null); }} disabled={!canManagePurchases || isReturnReference || !!selectedPurchase.shortClosedAt || selectedPurchase.workflowStatus === 'cancelled'} tone="primary"/>
                                <ActionButton label={tr('Record Payment', 'ثبت پرداخت')} onClick={() => { setPurchasePaymentTargetId(selectedPurchase.id); setSettlementAmount(''); setSettlementNote(''); setSelectedPurchaseId(null); }} disabled={!canManagePurchases || isReturnReference || selectedPurchase.remainingAmount <= 0 || selectedPurchase.workflowStatus === 'cancelled'} tone="primary"/>
                                <ActionButton label={tr('Open Supplier Profile', 'باز کردن پروفایل تأمین‌کننده')} onClick={() => {
                if (supplier)
                    setSelectedSupplierProfileId(supplier.id);
                setActiveTab('suppliers');
                setSelectedPurchaseId(null);
            }}/>
                                <details className="wk-procurement-advanced-toggle rounded-3xl border border-slate-200 bg-white px-4 py-3">
                                    <summary>{tr('More actions', 'اقدامات بیشتر')}</summary>
                                    <div className="mt-3 grid gap-2">
                                        {selectedPurchase.workflowStatus === 'draft' ? (<ActionButton label={tr('Finalize Draft', 'ثبت نهایی')} onClick={() => openFinalizeDraftModal(selectedPurchase)} disabled={!canManagePurchases || isReturnReference || !!selectedPurchase.shortClosedAt} tone="primary" className="w-full justify-center"/>) : null}
                                        <ActionButton label={tr('Short Close', 'بستن ناقص')} onClick={() => { setPurchaseShortCloseTargetId(selectedPurchase.id); setShortCloseReason(''); setSelectedPurchaseId(null); }} disabled={!canManagePurchases || isReturnReference || !!selectedPurchase.shortClosedAt || selectedPurchase.workflowStatus === 'cancelled'} className="w-full justify-center"/>
                                        <ActionButton label={tr('Delete Invoice', 'حذف فاکتور')} onClick={() => { setPendingDeletePurchaseId(selectedPurchase.id); setSelectedPurchaseId(null); }} disabled={!canDeletePurchases} tone="danger" className="w-full justify-center"/>
                                    </div>
                                </details>
                            </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200">
                            <div className="border-b border-slate-100 px-5 py-4">
                                <div className="inline-flex flex-wrap items-center gap-2"><p className="text-sm font-black text-slate-900">{tr('Registered Payments', 'پرداخت‌های ثبت‌شده')}</p><NewFeatureBadge /></div>
                            </div>
                            <div className="max-h-[280px] overflow-y-auto px-5 py-4">
                                <div className="space-y-3">
                                    {purchasePayments.map((payment) => (<div key={payment.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-black text-slate-900">{formatMoney(payment.amount)}</p>
                                                    <p className="mt-1 text-xs font-semibold text-slate-500">{formatDate(payment.date)} | {getPaymentMethodLabel(payment.method)}</p>
                                                    {payment.reference ? <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Reference', 'مرجع')}: {payment.reference}</p> : null}
                                                    {payment.note ? <p className="mt-1 text-xs font-semibold text-slate-500">{payment.note}</p> : null}
                                                </div>
                                                <p className="text-xs font-black text-slate-500">{payment.recordedBy || '-'}</p>
                                            </div>
                                        </div>))}
                                    {!purchasePayments.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">{tr('No payment has been recorded for this invoice yet.', 'هنوز پرداختی برای این فاکتور ثبت نشده است.')}</div> : null}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200">
                            <div className="border-b border-slate-100 px-5 py-4">
                                <div className="inline-flex flex-wrap items-center gap-2"><p className="text-sm font-black text-slate-900">{tr('Supplier Ledger Impact', 'اثر در ledger تأمین‌کننده')}</p><NewFeatureBadge /></div>
                            </div>
                            <div className="max-h-[260px] overflow-y-auto px-5 py-4">
                                <div className="space-y-3">
                                    {relatedTransactions.map((transaction) => (<div key={transaction.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-black text-slate-900">{getLedgerTypeLabel(transaction.type)} | {formatMoney(transaction.amount)}</p>
                                                    <p className={classNames('mt-1 text-xs font-semibold', getNetBalanceTextTone(getSupplierNetBalanceDisplay(transaction.balanceAfter).status))}>{formatDate(transaction.date)} | {tr('Net balance after', 'تراز خالص بعد')}: {formatSupplierLedgerBalance(transaction.balanceAfter)}</p>
                                                    <p className="mt-1 text-xs font-semibold text-slate-500">{transaction.description}</p>
                                                    {parseSupplierFinanceTaggedNote(transaction.note).displayNote ? <p className="mt-1 text-xs font-semibold text-slate-500">{parseSupplierFinanceTaggedNote(transaction.note).displayNote}</p> : null}
                                                </div>
                                                <div className="text-left text-xs font-semibold text-slate-500">
                                                    <p>{getPaymentMethodLabel(transaction.method)}</p>
                                                    {transaction.recordedBy ? <p className="mt-1">{transaction.recordedBy}</p> : null}
                                                </div>
                                            </div>
                                        </div>))}
                                    {!relatedTransactions.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">{tr('No linked ledger rows were found for this invoice.', 'برای این فاکتور ردیف ledger مرتبطی پیدا نشد.')}</div> : null}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200">
                            <div className="border-b border-slate-100 px-5 py-4">
                                <div className="inline-flex flex-wrap items-center gap-2"><p className="text-sm font-black text-slate-900">{tr('Attachments and Audit Trail', 'پیوست‌ها و ردپای عملیاتی')}</p><NewFeatureBadge data-testid="audit-trail-new-badge"/></div>
                            </div>
                            <div className="space-y-4 px-5 py-4">
                                <div className="space-y-2">
                                    {purchaseAttachments.map((attachment) => (<div key={attachment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                            <div>
                                                <p className="text-sm font-black text-slate-900">{attachment.name}</p>
                                                <p className="mt-1 text-xs font-semibold text-slate-500">{formatDateTime(attachment.uploadedAt)} | {formatNumber(attachment.size / 1024, { maximumFractionDigits: 1 })} KB</p>
                                            </div>
                                            {attachment.dataUrl ? <ActionButton label={tr('Open', 'باز کردن')} onClick={() => void handleOpenAttachment(attachment)}/> : null}
                                        </div>))}
                                    {!purchaseAttachments.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">{tr('No file is attached to this invoice.', 'برای این فاکتور فایلی ضمیمه نشده است.')}</div> : null}
                                </div>
                                <div className="space-y-3">
                                    {purchaseAuditTrail.map((entry) => (<div key={entry.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-black text-slate-900">{getAuditActionLabel(entry.action)}</p>
                                                    <p className="mt-1 text-xs font-semibold text-slate-500">{formatDateTime(entry.date)} | {entry.actorName}</p>
                                                    {entry.note ? <p className="mt-1 text-xs font-semibold text-slate-500">{entry.note}</p> : null}
                                                </div>
                                            </div>
                                        </div>))}
                                    {!purchaseAuditTrail.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">{tr('No audit trail was recorded for this invoice.', 'برای این فاکتور ردپای عملیاتی ثبت نشده است.')}</div> : null}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {selectedPurchase.notes ? <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold leading-7 text-slate-700"><span className="font-black text-slate-900">{tr('Invoice note', 'یادداشت فاکتور')}:</span> {selectedPurchase.notes}</div> : null}
            </div>);
    })() : <div />;
    const renderPurchasePaymentModal = () => purchasePaymentTarget ? (<div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-black text-slate-900">{tr('Remaining balance', 'مانده فاکتور')}: {formatMoney(purchasePaymentTarget.remainingAmount)}</p><p className="mt-1 text-xs font-semibold text-slate-500">{supplierById.get(purchasePaymentTarget.supplierId)?.name || '-'}</p></div>
            {projectedOtherPurchasePaymentTotal > 0 ? (<InlineAlert tone="info" title={tr('Extra payment will also settle other open invoices', 'پرداخت اضافی، فاکتورهای باز دیگر را هم تسویه می‌کند')}>
                    {tr(`${formatMoney(projectedOtherPurchasePaymentTotal)} after this invoice will be allocated to the supplier's other open invoices.`, `${formatMoney(projectedOtherPurchasePaymentTotal)} بعد از بستن این فاکتور، به سایر فاکتورهای باز همین تأمین‌کننده تخصیص می‌یابد.`)}
                </InlineAlert>) : null}
            {projectedPurchasePaymentAllocation && projectedPurchasePaymentAllocation.advancePaymentAmount > 0 ? (<InlineAlert tone="info" title={tr('Any remaining overflow becomes supplier prepayment', 'باقی‌ماندهٔ نهایی به پیش‌پرداخت تأمین‌کننده تبدیل می‌شود')}>
                    {tr(`${formatMoney(projectedPurchasePaymentAllocation.advancePaymentAmount)} after all open invoices are covered will be saved as supplier prepayment.`, `${formatMoney(projectedPurchasePaymentAllocation.advancePaymentAmount)} بعد از پوشش همهٔ فاکتورهای باز، به‌عنوان پیش‌پرداخت تأمین‌کننده ثبت می‌شود.`)}
                </InlineAlert>) : null}
            <div><label className="block text-xs font-black text-slate-500">{tr('Payment Amount', 'مبلغ پرداختی')}</label><input type="text" value={settlementAmount} onChange={(event) => setSettlementAmount(normalizePersianNumbers(event.target.value))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-800 outline-hidden transition focus:border-brand-400 focus:bg-white"/></div>
            <div><label className="block text-xs font-black text-slate-500">{tr('Method', 'روش')}</label><select value={settlementMethod} onChange={(event) => setSettlementMethod(event.target.value as PurchasePaymentMethod)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400"><option value="cash">{tr('Cash', 'نقد')}</option><option value="bank_transfer">{tr('Bank Transfer', 'انتقال بانکی')}</option><option value="card">{tr('Card', 'کارت')}</option><option value="cheque">{tr('Cheque', 'چک')}</option></select></div>
            <div><label className="block text-xs font-black text-slate-500">{tr('Note', 'یادداشت')}</label><textarea value={settlementNote} onChange={(event) => setSettlementNote(event.target.value)} className="mt-2 min-h-[88px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:bg-white"/></div>
            {settlementAmountValue > 0 && projectedPurchasePaymentAllocation ? (<div className="grid gap-3 sm:grid-cols-3">
                    <MetricCard label={tr('Applied to this invoice', 'روی همین فاکتور')} value={formatMoney(projectedPurchasePaymentAllocation.targetPurchaseAppliedAmount)} tone={getDebtMetricTone(projectedPurchasePaymentAllocation.targetPurchaseAppliedAmount)}/>
                    <MetricCard label={tr('Applied to other invoices', 'روی فاکتورهای دیگر')} value={formatMoney(projectedOtherPurchasePaymentTotal)} tone={getDebtMetricTone(projectedOtherPurchasePaymentTotal)}/>
                    <MetricCard label={tr('Saved as prepayment', 'ثبت به‌عنوان پیش‌پرداخت')} value={formatMoney(projectedPurchasePaymentAllocation.advancePaymentAmount)} tone={getPrepaymentMetricTone(projectedPurchasePaymentAllocation.advancePaymentAmount)}/>
                </div>) : null}
            <div className="flex justify-end gap-3"><ActionButton label={tr('Cancel', 'انصراف')} onClick={() => setPurchasePaymentTargetId(null)}/><ActionButton label={tr('Record Payment', 'ثبت پرداخت')} onClick={handleRecordPurchasePayment} tone="primary"/></div>
        </div>) : <div />;
    const renderFinalReceiptModal = () => (<div className="space-y-4" data-testid="final-receipt-modal">
            <InlineAlert tone="info" title={tr('Confirm received quantities before final save', 'پیش از ثبت نهایی مقدارهای رسیده را تأیید کنید')}>
                {tr('Set each line to the quantity that physically arrived now. Use 0 for items that have not arrived yet.', 'برای هر سطر فقط مقداری را بگذارید که واقعاً رسیده است. برای اقلامی که هنوز نرسیده‌اند ۰ وارد کنید.')}
            </InlineAlert>
            <div className="space-y-3">
                {items.map((item, index) => {
            const orderedQuantity = Math.max(0, item.baseQuantity ?? item.quantity);
            return (<div key={item.lineId || `${item.medicineId}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-black text-slate-900">{item.medicineName || medicineById.get(item.medicineId)?.name || '-'}</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Ordered', 'سفارش')}: {formatNumber(orderedQuantity)} | {item.batchNumber || '-'}</p>
                                </div>
                                <div className="w-full max-w-[180px]">
                                    <label className="block text-xs font-black text-slate-500">{tr('Received now', 'رسیده فعلی')}</label>
                                    <input type="text" inputMode="decimal" value={finalReceiptLineQuantities[index] || ''} onChange={(event) => setFinalReceiptLineQuantities((current) => ({ ...current, [index]: normalizePersianNumbers(event.target.value) }))} className="wk-input wk-ltr-data mt-2 text-center" placeholder="0"/>
                                </div>
                            </div>
                        </div>);
        })}
            </div>
            <div>
                <label className="block text-xs font-black text-slate-500">{tr('Receipt note', 'یادداشت دریافت')}</label>
                <textarea value={finalReceiptNote} onChange={(event) => setFinalReceiptNote(event.target.value)} className="wk-textarea mt-2 min-h-[88px]" placeholder={tr('Optional note about what arrived now.', 'یادداشت اختیاری درباره مقدار رسیده فعلی')}/>
            </div>
            <div className="flex justify-end gap-3">
                <ActionButton label={tr('Cancel', 'انصراف')} onClick={() => setIsFinalReceiptModalOpen(false)} disabled={isPurchaseSubmitPending}/>
                <ActionButton label={tr('Confirm final save', 'تأیید ثبت نهایی')} onClick={handleConfirmFinalReceipt} disabled={isPurchaseSubmitPending} tone="primary"/>
            </div>
        </div>);
    const renderPurchaseReceiptModal = () => purchaseReceiptTarget ? (<div className="space-y-4">
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black text-slate-900">{tr('Purchase Receipt', 'ثبت دریافت خرید')}</p>
                    <NewFeatureBadge />
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                    {purchaseReceiptTarget.shortClosedAt
            ? tr('This purchase is short closed and cannot receive more stock.', 'این خرید short close شده و دیگر دریافت جدید نمی‌گیرد.')
            : tr('Enter only the quantities that physically arrived now. Stock will be increased only for these lines.', 'فقط مقدارهایی را وارد کنید که واقعاً همین حالا رسیده‌اند. موجودی فقط برای همین سطرها زیاد می‌شود.')}
                </p>
            </div>
            <div className="space-y-3">
                {purchaseReceiptTarget.items.map((item, index) => {
            const receiptMap = buildPurchaseReceiptQuantityMap(purchaseReceiptTarget.receipts || []);
            const alreadyReceived = receiptMap.get(item.lineId ? `line:${item.lineId}` : `idx:${index}`)?.quantity || 0;
            const remaining = Math.max(0, (item.baseQuantity ?? item.quantity) - alreadyReceived);
            return (<div key={item.lineId || `${item.medicineId}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-black text-slate-900">{item.medicineName || medicineById.get(item.medicineId)?.name || '-'}</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">{item.batchNumber || '-'} {item.expiryDate ? `| ${formatExpiryDate(item.expiryDate)}` : ''}</p>
                                </div>
                                <div className="text-left text-xs font-semibold text-slate-500">
                                    <p>{tr('Ordered', 'سفارش')}: {formatNumber(item.baseQuantity ?? item.quantity)}</p>
                                    <p>{tr('Already received', 'قبلاً دریافت شده')}: {formatNumber(alreadyReceived)}</p>
                                    <p>{tr('Remaining', 'مانده')}: {formatNumber(remaining)}</p>
                                </div>
                            </div>
                            <div className="mt-3">
                                <label className="block text-xs font-black text-slate-500">{tr('Receive now', 'دریافت فعلی')}</label>
                                <input type="text" value={receiptLineQuantities[index] || ''} onChange={(event) => setReceiptLineQuantities((current) => ({ ...current, [index]: normalizePersianNumbers(event.target.value) }))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 outline-hidden transition focus:border-brand-400" placeholder={remaining > 0 ? String(remaining) : '0'} disabled={remaining <= 0 || !!purchaseReceiptTarget.shortClosedAt}/>
                            </div>
                        </div>);
        })}
            </div>
            <div><label className="block text-xs font-black text-slate-500">{tr('Receipt note', 'یادداشت دریافت')}</label><textarea value={receiptNote} onChange={(event) => setReceiptNote(event.target.value)} className="mt-2 min-h-[88px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:bg-white"/></div>
            <div className="flex justify-end gap-3"><ActionButton label={tr('Cancel', 'انصراف')} onClick={() => { setPurchaseReceiptTargetId(null); setReceiptLineQuantities({}); setReceiptNote(''); }}/><ActionButton label={tr('Record Receipt', 'ثبت دریافت')} onClick={handleRecordPurchaseReceipt} tone="primary" disabled={!!purchaseReceiptTarget.shortClosedAt}/></div>
        </div>) : <div />;
    const renderShortCloseModal = () => purchaseShortCloseTarget ? (<div className="space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                {tr('Short close stops future receipts for this purchase but keeps already received stock and existing payments intact.', 'بستن ناقص، دریافت‌های آینده این خرید را می‌بندد اما موجودی دریافت‌شده و پرداخت‌های قبلی را دست نمی‌زند.')}
            </div>
            <div><label className="block text-xs font-black text-slate-500">{tr('Reason', 'دلیل')}</label><textarea value={shortCloseReason} onChange={(event) => setShortCloseReason(event.target.value)} className="mt-2 min-h-[96px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:bg-white" placeholder={tr('Example: supplier confirmed the remaining stock will not be delivered.', 'مثال: شرکت تأیید کرد باقی‌مانده را دیگر نمی‌فرستد.')}/></div>
            <div className="flex justify-end gap-3"><ActionButton label={tr('Cancel', 'انصراف')} onClick={() => { setPurchaseShortCloseTargetId(null); setShortCloseReason(''); }}/><ActionButton label={tr('Confirm Short Close', 'تأیید بستن ناقص')} onClick={handleShortClosePurchase} tone="primary"/></div>
        </div>) : <div />;
    const renderFinalizeDraftModal = () => finalizeDraftTarget ? (() => {
        const supplier = supplierById.get(finalizeDraftTarget.supplierId) || null;
        const requiresDueDate = finalizeDraftTarget.remainingAmount > 0;
        const missingSupplierContext = !supplier?.contactPerson || !supplier?.paymentTerms;
        return (<div className="space-y-4" data-testid="finalize-draft-modal">
                <InlineAlert tone="info" title={tr('Finalize this draft into an operational purchase', 'این پیش‌نویس را به یک خرید عملیاتی تبدیل کنید')}>
                    {tr('Review supplier, document dates, item count, and final amount before confirming. Draft status will be removed after finalize.', 'پیش از تأیید، تأمین‌کننده، تاریخ‌های سند، تعداد اقلام و مبلغ نهایی را بازبینی کنید. پس از نهایی‌سازی، برچسب پیش‌نویس برداشته می‌شود.')}
                </InlineAlert>

                <div className="grid gap-3 sm:grid-cols-2">
                    <FlatCard className="rounded-2xl p-4">
                        <p className="wk-procurement-label text-slate-500">{tr('Supplier', 'تأمین‌کننده')}</p>
                        <p className="mt-2 text-base font-black text-slate-900">{supplier?.name || '-'}</p>
                        <p className="mt-2 text-sm font-semibold text-slate-600">{tr('Representative', 'نماینده')}: {supplier?.contactPerson || '-'}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">{tr('Payment terms', 'شرایط پرداخت')}: {supplier?.paymentTerms || '-'}</p>
                    </FlatCard>
                    <FlatCard className="rounded-2xl p-4">
                        <p className="wk-procurement-label text-slate-500">{tr('Document check', 'بازبینی سند')}</p>
                        <p className="mt-2 text-sm font-semibold text-slate-600">{tr('Invoice', 'فاکتور')}: {getPurchaseDocumentLabel(finalizeDraftTarget)}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">{tr('Invoice date', 'تاریخ فاکتور')}: {formatDate(finalizeDraftTarget.date)}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">{tr('Items', 'اقلام')}: {formatNumber(finalizeDraftTarget.items.length)}</p>
                        <p className="mt-1 text-sm font-black text-slate-900">{tr('Final total', 'جمع نهایی')}: {formatMoney(finalizeDraftTarget.totalAmount)}</p>
                    </FlatCard>
                </div>

                {missingSupplierContext ? (<InlineAlert tone="warning" title={tr('Some supplier context is still empty', 'بخشی از اطلاعات تأمین‌کننده هنوز خالی است')}>
                        {tr('Representative or payment terms are missing. Finalize can continue, but fill these if your process requires them.', 'نماینده یا شرایط پرداخت خالی است. نهایی‌سازی می‌تواند ادامه یابد، اما اگر روند کاری شما الزام دارد این فیلدها را تکمیل کنید.')}
                    </InlineAlert>) : null}

                <div>
                    <label className="block text-xs font-black text-slate-500">{tr('Due date', 'تاریخ سررسید')}</label>
                    <input type="date" value={finalizeDraftDueDate} onChange={(event) => setFinalizeDraftDueDate(event.target.value)} className="wk-input wk-date-input mt-2"/>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                        {requiresDueDate
                ? tr('Required because this invoice still has an open balance.', 'به دلیل داشتن مانده باز، این فیلد الزامی است.')
                : tr('Optional for fully settled invoices.', 'برای فاکتورهای کاملاً تسویه‌شده اختیاری است.')}
                    </p>
                </div>

                <div className="space-y-3">
                    <p className="text-sm font-black text-slate-900">{tr('Received quantities now', 'مقدارهای رسیده فعلی')}</p>
                    {finalizeDraftTarget.items.map((item, index) => {
                const orderedQuantity = Math.max(0, item.baseQuantity ?? item.quantity);
                return (<div key={item.lineId || `${item.medicineId}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-black text-slate-900">{item.medicineName || medicineById.get(item.medicineId)?.name || '-'}</p>
                                        <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Ordered', 'سفارش')}: {formatNumber(orderedQuantity)} | {item.batchNumber || '-'}</p>
                                    </div>
                                    <div className="w-full max-w-[180px]">
                                        <label className="block text-xs font-black text-slate-500">{tr('Received now', 'رسیده فعلی')}</label>
                                        <input type="text" inputMode="decimal" value={receiptLineQuantities[index] || ''} onChange={(event) => setReceiptLineQuantities((current) => ({ ...current, [index]: normalizePersianNumbers(event.target.value) }))} className="wk-input wk-ltr-data mt-2 text-center" placeholder="0"/>
                                    </div>
                                </div>
                            </div>);
            })}
                    <div>
                        <label className="block text-xs font-black text-slate-500">{tr('Receipt note', 'یادداشت دریافت')}</label>
                        <textarea value={receiptNote} onChange={(event) => setReceiptNote(event.target.value)} className="wk-textarea mt-2 min-h-[88px]" placeholder={tr('Optional note about what arrived now.', 'یادداشت اختیاری درباره مقدار رسیده فعلی')}/>
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <ActionButton label={tr('Cancel', 'انصراف')} onClick={() => { setFinalizeDraftTargetId(null); setFinalizeDraftDueDate(''); setReceiptLineQuantities({}); setReceiptNote(''); }} disabled={isFinalizeDraftPending}/>
                    <ActionButton label={tr('Confirm Finalize', 'تأیید نهایی‌سازی')} onClick={handleFinalizeDraft} disabled={isFinalizeDraftPending} tone="primary"/>
                </div>
            </div>);
    })() : <div />;
    const renderSupplierPaymentModal = () => supplierPaymentTarget ? (<div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard label={tr('Open debt', 'بدهی باز')} value={formatMoney(supplierPaymentTargetFinance.openDebt)} tone={getDebtMetricTone(supplierPaymentTargetFinance.openDebt)}/>
                <MetricCard label={tr('Supplier prepayment', 'پیش‌پرداخت تامین‌کننده')} value={formatMoney(supplierPaymentTargetFinance.supplierPrepayment)} tone={getPrepaymentMetricTone(supplierPaymentTargetFinance.supplierPrepayment)}/>
            </div>
            {supplierPaymentMode === 'settlement' ? (<InlineAlert tone="info" title={tr('Settlement allocates against the oldest open invoices first', 'تسویه ابتدا روی قدیمی‌ترین فاکتورهای باز تخصیص می‌یابد')}>
                    {tr('This payment first reduces finalized open invoices. If anything remains after open debt is covered, the overflow is saved as supplier prepayment.', 'این پرداخت ابتدا فاکتورهای نهایی‌شده و باز را کاهش می‌دهد. اگر بعد از پوشش بدهی باز مبلغی بماند، اضافه‌مانده به‌عنوان پیش‌پرداخت تامین‌کننده ذخیره می‌شود.')}
                </InlineAlert>) : (<InlineAlert tone="warning" title={tr('Advance payment does not reduce the current open invoices', 'پیش‌پرداخت، فاکتورهای باز فعلی را کاهش نمی‌دهد')}>
                    {tr('Use this when money is paid before an invoice, or when reusable supplier credit should be stored separately.', 'از این گزینه وقتی استفاده کنید که مبلغ پیش از فاکتور پرداخت شده باشد، یا اعتبار قابل‌استفادهٔ تامین‌کننده باید جداگانه ذخیره شود.')}
                </InlineAlert>)}
            {supplierSettlementOverflow > 0 ? (<InlineAlert tone="info" title={tr('Extra payment becomes supplier prepayment', 'پرداخت اضافی به پیش‌پرداخت تامین‌کننده تبدیل می‌شود')}>
                    {tr(`${formatMoney(supplierSettlementOverflow)} above the open debt will be saved as supplier prepayment.`, `${formatMoney(supplierSettlementOverflow)} بیشتر از بدهی باز، به‌عنوان پیش‌پرداخت تامین‌کننده ثبت می‌شود.`)}
                </InlineAlert>) : null}
            <div><label className="block text-xs font-black text-slate-500">{tr('Settlement Amount', 'مبلغ تسویه')}</label><input type="text" value={settlementAmount} onChange={(event) => setSettlementAmount(normalizePersianNumbers(event.target.value))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-800 outline-hidden transition focus:border-brand-400 focus:bg-white"/></div>
            <div><label className="block text-xs font-black text-slate-500">{tr('Method', 'روش')}</label><select value={settlementMethod} onChange={(event) => setSettlementMethod(event.target.value as PurchasePaymentMethod)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400"><option value="cash">{tr('Cash', 'نقد')}</option><option value="bank_transfer">{tr('Bank Transfer', 'انتقال بانکی')}</option><option value="card">{tr('Card', 'کارت')}</option><option value="cheque">{tr('Cheque', 'چک')}</option></select></div>
            <div><label className="block text-xs font-black text-slate-500">{tr('Reference', 'مرجع')}</label><input type="text" value={settlementReference} onChange={(event) => setSettlementReference(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:bg-white"/></div>
            <div><label className="block text-xs font-black text-slate-500">{tr('Note', 'یادداشت')}</label><textarea value={settlementNote} onChange={(event) => setSettlementNote(event.target.value)} className="mt-2 min-h-[88px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-brand-400 focus:bg-white"/></div>
            {settlementAmountValue > 0 ? (<div className="grid gap-3 sm:grid-cols-2">
                    <MetricCard label={tr('Projected open debt', 'بدهی باز پس از ثبت')} value={formatMoney(projectedSupplierSettlementFinance.openDebt)} tone={getDebtMetricTone(projectedSupplierSettlementFinance.openDebt)}/>
                    <MetricCard label={tr('Projected prepayment', 'پیش‌پرداخت پس از ثبت')} value={formatMoney(projectedSupplierSettlementFinance.supplierPrepayment)} tone={getPrepaymentMetricTone(projectedSupplierSettlementFinance.supplierPrepayment)}/>
                </div>) : null}
            <div className="flex justify-end gap-3">
                <ActionButton label={tr('Cancel', 'انصراف')} onClick={() => { setSupplierPaymentTargetId(null); setSupplierPaymentMode('settlement'); setSettlementReference(''); }}/>
                <ActionButton label={supplierPaymentMode === 'advance' ? tr('Record advance payment', 'ثبت پیش‌پرداخت') : tr('Record Settlement', 'ثبت تسویه')} onClick={handleRecordSupplierSettlement} tone="primary"/>
            </div>
        </div>) : <div />;
    const renderSupplierDeleteModal = () => pendingDeleteSupplier ? (<div className="space-y-4">
            <InlineAlert tone={pendingDeleteSupplierImpact.dependentSaleCount > 0 ? 'warning' : 'danger'} title={tr('Supplier deletion impact', 'اثر حذف تأمین‌کننده')}>
                {pendingDeleteSupplierImpact.dependentSaleCount > 0
            ? tr('Permanent deletion is locked because one or more sales used batches from this supplier.', 'حذف کامل قفل است، چون یک یا چند فروش از بچ‌های این تأمین‌کننده استفاده کرده‌اند.')
            : tr('Permanent deletion removes this supplier and its direct purchase, ledger, and stock trace data. This cannot be undone.', 'حذف کامل، تأمین‌کننده و داده‌های مستقیم خرید، دفتر حساب و ردیابی موجودی او را پاک می‌کند و قابل برگشت نیست.')}
            </InlineAlert>
            <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard label={tr('Purchase documents', 'اسناد خرید')} value={formatNumber(pendingDeleteSupplierImpact.purchaseCount)}/>
                <MetricCard label={tr('Ledger entries', 'رویدادهای دفتر حساب')} value={formatNumber(pendingDeleteSupplierImpact.transactionCount)}/>
                <MetricCard label={tr('Linked batches', 'بچ‌های لینک‌شده')} value={formatNumber(pendingDeleteSupplierImpact.batchCount)}/>
                <MetricCard label={tr('Dependent sales', 'فروش‌های وابسته')} value={formatNumber(pendingDeleteSupplierImpact.dependentSaleCount)} tone={pendingDeleteSupplierImpact.dependentSaleCount > 0 ? 'border-rose-200 bg-rose-50 text-rose-900' : undefined}/>
            </div>
            <div className="space-y-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <input type="radio" className="mt-1" checked={supplierDeleteMode === 'conditional'} onChange={() => setSupplierDeleteMode('conditional')}/>
                    <span>
                        <span className="block text-sm font-black text-slate-900">{tr('Safe / conditional delete', 'حذف امن / شرطی')}</span>
                        <span className="mt-1 block text-xs font-semibold leading-6 text-slate-500">{tr('Fully deletes only when there is no trace; otherwise archives and hides the supplier from active workflows.', 'فقط وقتی هیچ اثری ندارد کاملاً حذف می‌کند؛ در غیر آن تأمین‌کننده را آرشیف و از کارهای فعال پنهان می‌سازد.')}</span>
                    </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3">
                    <input type="radio" className="mt-1" checked={supplierDeleteMode === 'purge'} onChange={() => setSupplierDeleteMode('purge')} disabled={pendingDeleteSupplierImpact.dependentSaleCount > 0}/>
                    <span>
                        <span className="block text-sm font-black text-rose-900">{tr('Permanent full delete', 'حذف کامل دائمی')}</span>
                        <span className="mt-1 block text-xs font-semibold leading-6 text-rose-700">{tr('Deletes profile, purchases, payments, ledger entries, linked batches, and preferred-supplier links.', 'پروفایل، خریدها، پرداخت‌ها، دفتر حساب، بچ‌های لینک‌شده و لینک تأمین‌کننده ترجیحی را پاک می‌کند.')}</span>
                    </span>
                </label>
            </div>
            {supplierDeleteMode === 'purge' ? (<div>
                    <label className="block text-xs font-black text-slate-500">{tr('Type supplier name to confirm', 'نام تأمین‌کننده را برای تأیید وارد کنید')}</label>
                    <input type="text" value={supplierDeleteConfirmText} onChange={(event) => setSupplierDeleteConfirmText(event.target.value)} className="mt-2 w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-hidden transition focus:border-rose-400" placeholder={pendingDeleteSupplier.name}/>
                </div>) : null}
            <div className="flex justify-end gap-3">
                <ActionButton label={tr('Cancel', 'انصراف')} onClick={() => { setPendingDeleteSupplierId(null); setSupplierDeleteConfirmText(''); setSupplierDeleteMode('conditional'); }}/>
                <ActionButton label={supplierDeleteMode === 'purge' ? tr('Delete permanently', 'حذف کامل') : tr('Delete supplier', 'حذف تأمین‌کننده')} onClick={handleConfirmDeleteSupplier} disabled={!canDeleteSuppliers || (supplierDeleteMode === 'purge' && (pendingDeleteSupplierImpact.dependentSaleCount > 0 || supplierDeleteConfirmText.trim() !== pendingDeleteSupplier.name.trim()))} tone="danger"/>
            </div>
        </div>) : <div />;
    const renderDeleteModal = () => {
        const returnReferenceDetails = pendingDeletePurchase ? getReturnReferenceDetails(pendingDeletePurchase) : null;
        const supplier = pendingDeletePurchase ? supplierById.get(pendingDeletePurchase.supplierId) : null;
        const deleteImpactMessage = returnReferenceDetails
            ? tr('Deleting this return document rolls back its vendor credit and removes its linked return trace from the source purchase. Use this only if the return was recorded by mistake.', 'حذف این سند مرجوعی، اعتبار مرجوعی آن را برمی‌گرداند و رهگیری مرجوعی لینک‌شده را از سند منبع حذف می‌کند. فقط وقتی استفاده کنید که مرجوعی اشتباه ثبت شده باشد.')
            : tr('Deleting this purchase document rolls back linked stock batches and recalculates the supplier debt for this invoice. Use this only for mistaken or cancelled procurement records.', 'حذف این سند خرید، batch های لینک‌شده را برمی‌گرداند و بدهی تأمین‌کننده را برای همین سند دوباره محاسبه می‌کند. این گزینه را فقط برای ثبت اشتباه یا لغوشده استفاده کنید.');
        return (<div className="space-y-4">
                {pendingDeletePurchase ? (<div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-black text-slate-500">{tr('Selected document', 'سند انتخاب‌شده')}</p>
                        <p className="mt-2 wk-ltr-data text-base font-black text-slate-900">{getPurchaseDocumentLabel(pendingDeletePurchase)}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-500">{supplier?.name || '-'} | {formatDate(pendingDeletePurchase.date)}</p>
                        {returnReferenceDetails ? (<p className="mt-2 text-xs font-semibold text-slate-600">
                                {tr('Source purchase', 'فاکتور منبع')}: {returnReferenceDetails.sourceDocumentLabel} | {tr('Source batch', 'بچ منبع')}: {returnReferenceDetails.sourceBatchLabel}
                            </p>) : null}
                    </div>) : null}
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{deleteImpactMessage}</div>
                <div className="flex justify-end gap-3"><ActionButton label={tr('Cancel', 'انصراف')} onClick={() => setPendingDeletePurchaseId(null)}/><ActionButton label={tr('Delete and Roll Back', 'حذف و برگرداندن')} tone="danger" onClick={handleConfirmDeletePurchase} disabled={!canDeletePurchases}/></div>
            </div>);
    };
    const renderAutoFillModal = () => (<div className="space-y-4">
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-semibold text-indigo-900">{tr('Suggested quantities are based on current stock, low-stock threshold, and a minimum order guard. Review before adding them to the invoice.', 'مقادیر پیشنهادی بر اساس موجودی فعلی، حد هشدار و حداقل سفارش محاسبه شده‌اند. پیش از افزودن، آن‌ها را بازبینی کنید.')}</div>
            <div className="overflow-hidden rounded-3xl border border-slate-200"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50"><tr><th className="px-4 py-3 text-right font-black text-slate-500">{tr('Item', 'قلم')}</th><th className="px-4 py-3 text-center font-black text-slate-500">{tr('Suggested Qty', 'مقدار پیشنهادی')}</th><th className="px-4 py-3 text-center font-black text-slate-500">{tr('Minimum Order', 'حداقل سفارش')}</th><th className="px-4 py-3 text-center font-black text-slate-500">{tr('Buy Price', 'قیمت خرید')}</th><th className="px-4 py-3 text-right font-black text-slate-500">{tr('Logic', 'منطق پیشنهاد')}</th></tr></thead><tbody className="divide-y divide-slate-100 bg-white">{autoFillPreview.map((item, index) => <tr key={`${item.medicineId}-${index}`}><td className="px-4 py-3 font-black text-slate-900">{item.medicineName || medicineById.get(item.medicineId)?.name || '-'}</td><td className="px-4 py-3 text-center font-black text-slate-900">{formatNumber(item.quantity)}</td><td className="px-4 py-3 text-center font-black text-slate-900">{formatNumber(item.minimumOrderQuantity || 0)}</td><td className="px-4 py-3 text-center font-black text-slate-900">{formatMoney(item.purchasePrice)}</td><td className="px-4 py-3 font-semibold text-slate-600">{item.notes || '-'}</td></tr>)}</tbody></table></div></div>
            <div className="flex justify-end gap-3"><ActionButton label={tr('Close', 'بستن')} onClick={() => setAutoFillPreview([])}/><ActionButton label={tr('Add Preview Items', 'افزودن اقلام پیشنهادی')} onClick={acceptAutoFillPreview} tone="primary"/></div>
        </div>);
    return (<div className="wk-procurement-page min-h-full bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 p-4 sm:p-5">
            {readOnly ? (<div className="mb-4">
                    <InlineAlert tone="warning" title={tr('Purchase editing is locked in guest mode', 'ویرایش خرید در حالت مهمان قفل است')}>
                        {tr('You can review history and supplier balances, but write actions stay disabled until full access is available.', 'می‌توانید تاریخچه و مانده تأمین‌کنندگان را ببینید، اما عملیات ثبت و ویرایش تا زمان دسترسی کامل غیرفعال می‌ماند.')}
                    </InlineAlert>
                </div>) : null}

            <div className="mb-4">
                <PageHeader eyebrow={tr('Operations', 'عملیات')} title={tr('Purchases and Supplier Finance', 'خرید و تدارکات')} subtitle={tr('Track supplier debt, register staged payments, and control purchase quality in one workspace.', 'بدهی تأمین‌کننده را پیگیری کنید، پرداخت مرحله‌ای ثبت کنید و کیفیت داده خرید را در یک فضا کنترل نمایید.')} breadcrumbs={<div className="wk-meta-text text-slate-500">{tr('Operations / Purchases', 'عملیات / خرید و تدارکات')}</div>} density="compact" dataTestId="purchases-page-header" primaryAction={activeTab === 'suppliers'
            ? { label: tr('Add Supplier', 'افزودن تأمین‌کننده'), onClick: () => openSupplierModal(), disabled: !canManagePurchases }
            : activeTab === 'new'
                ? { label: tr('Auto-fill Low Stock', 'پُرکردن کسری انبار'), onClick: handleAutoFillLowStock, disabled: !canManagePurchases }
                : { label: t.newPurchase, onClick: () => setActiveTab('new'), disabled: !canManagePurchases }} secondaryActions={[
            activeTab !== 'list' ? { label: t.purchaseHistory, onClick: () => setActiveTab('list'), variant: 'secondary' } : { label: tr('Export Excel / CSV', 'خروجی Excel / CSV'), onClick: exportHistoryCsv, variant: 'secondary' },
            activeTab !== 'suppliers' ? { label: t.suppliers, onClick: () => setActiveTab('suppliers'), variant: 'secondary' } : { label: tr('Print / PDF', 'چاپ / PDF'), onClick: printHistory, variant: 'secondary' }
        ]} tabs={[
            { id: 'list', label: t.purchaseHistory, active: activeTab === 'list', onClick: () => setActiveTab('list') },
            { id: 'new', label: t.newPurchase, active: activeTab === 'new', onClick: () => setActiveTab('new') },
            { id: 'suppliers', label: t.suppliers, active: activeTab === 'suppliers', onClick: () => setActiveTab('suppliers') }
        ]} meta={<div className="wk-procurement-header-meta">
                            <ProcurementKpiChip label={`${tr('Open debt', 'بدهی باز')}: ${formatMoney(activeSuppliers.reduce((sum, supplier) => sum + (supplierFinanceById.get(supplier.id)?.openDebt || 0), 0))}`} tone="danger"/>
                            <ProcurementKpiChip label={`${tr('Overdue', 'سررسید گذشته')}: ${formatNumber(normalizedPurchases.filter((purchase) => isPurchaseOverdue(purchase)).length)}`} tone="warning"/>
                            <ProcurementKpiChip label={`${tr('Partial', 'جزئی')}: ${formatNumber(normalizedPurchases.filter((purchase) => purchase.paymentStatus === 'partial').length)}`} tone="info"/>
                        </div>}/>
            </div>

            {showNewFeatureMarkers ? (<div className="mb-4">
                    <NewFeatureHint title={tr('NEW procurement tools are now highlighted here', 'قابلیت‌های تازهٔ خرید و تدارکات اکنون اینجا واضح نشان داده می‌شوند')} data-testid="purchases-feature-guide">
                        {activeTab === 'suppliers'
                ? tr('Open a supplier profile to review supplier ledger, vendor credits, and linked purchase history from one place.', 'پروفایل تأمین‌کننده را باز کنید تا دفتر حساب، اعتبار مرجوعی و تاریخچه خریدِ لینک‌شده را از یک‌جا ببینید.')
                : activeTab === 'new'
                    ? tr('This guided flow now calls out batch traceability, purchase receipt-safe save, and partial payment handling before finalizing.', 'این جریان هدایت‌شده اکنون رهگیری batch، ثبت امن رسید خرید و مدیریت پرداخت جزئی را پیش از نهایی‌سازی واضح نشان می‌دهد.')
                    : tr('Open any purchase to review supplier ledger impact, partial payments, and the audit trail without leaving history.', 'هر خرید را باز کنید تا اثر بر دفتر حساب تأمین‌کننده، پرداخت‌های جزئی و ردپای عملیاتی را بدون ترک تاریخچه ببینید.')}
                    </NewFeatureHint>
                </div>) : null}

            {activeTab === 'new' ? renderProcurementNewTab() : null}
            {activeTab === 'list' ? renderProcurementListTab() : null}
            {activeTab === 'suppliers' ? renderProcurementSuppliersTab() : null}

            <Modal isOpen={supplierModalOpen} onClose={() => setSupplierModalOpen(false)} title={editingSupplierId ? tr('Edit Supplier', 'ویرایش تأمین‌کننده') : tr('Add Supplier', 'افزودن تأمین‌کننده')}>
                {renderSupplierModal()}
            </Modal>
            <Modal isOpen={!!selectedPurchase} onClose={() => setSelectedPurchaseId(null)} title={tr('Purchase Details', 'جزئیات فاکتور خرید')} maxWidthClassName="max-w-[min(1380px,96vw)]">
                {renderPurchaseDetailsModal()}
            </Modal>
            <Modal isOpen={!!purchasePaymentTarget} onClose={() => setPurchasePaymentTargetId(null)} title={tr('Record Payment', 'ثبت پرداخت')}>
                {renderPurchasePaymentModal()}
            </Modal>
            <Modal isOpen={isFinalReceiptModalOpen} onClose={() => setIsFinalReceiptModalOpen(false)} title={tr('Confirm Purchase Receipt', 'تأیید دریافت خرید')}>
                {renderFinalReceiptModal()}
            </Modal>
            <Modal isOpen={!!purchaseReceiptTarget} onClose={() => { setPurchaseReceiptTargetId(null); setReceiptLineQuantities({}); setReceiptNote(''); }} title={tr('Record Purchase Receipt', 'ثبت دریافت خرید')}>
                {renderPurchaseReceiptModal()}
            </Modal>
            <Modal isOpen={!!purchaseShortCloseTarget} onClose={() => { setPurchaseShortCloseTargetId(null); setShortCloseReason(''); }} title={tr('Short Close Purchase', 'بستن ناقص خرید')}>
                {renderShortCloseModal()}
            </Modal>
            <Modal isOpen={!!finalizeDraftTarget} onClose={() => { setFinalizeDraftTargetId(null); setFinalizeDraftDueDate(''); setReceiptLineQuantities({}); setReceiptNote(''); }} title={tr('Finalize Draft Invoice', 'نهایی‌سازی فاکتور پیش‌نویس')}>
                {renderFinalizeDraftModal()}
            </Modal>
            <Modal isOpen={!!supplierPaymentTarget} onClose={() => { setSupplierPaymentTargetId(null); setSupplierPaymentMode('settlement'); setSettlementReference(''); }} title={supplierPaymentMode === 'advance' ? tr('Record Advance Payment', 'ثبت پیش‌پرداخت') : tr('Supplier Settlement', 'تسویه حساب تأمین‌کننده')}>
                {renderSupplierPaymentModal()}
            </Modal>
            <Modal isOpen={!!pendingDeleteSupplierId} onClose={() => { setPendingDeleteSupplierId(null); setSupplierDeleteConfirmText(''); setSupplierDeleteMode('conditional'); }} title={tr('Delete Supplier', 'حذف تأمین‌کننده')}>
                {renderSupplierDeleteModal()}
            </Modal>
            <Modal isOpen={!!pendingDeletePurchaseId} onClose={() => setPendingDeletePurchaseId(null)} title={tr('Delete Purchase Invoice', 'حذف فاکتور خرید')}>
                {renderDeleteModal()}
            </Modal>
            <Modal isOpen={autoFillPreview.length > 0} onClose={() => setAutoFillPreview([])} title={tr('Low Stock Auto-Fill Preview', 'پیش‌نمایش پر کردن خودکار کسری انبار')}>
                {renderAutoFillModal()}
            </Modal>
        </div>);
};
