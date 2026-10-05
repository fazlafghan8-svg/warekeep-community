import React, { lazy, Suspense, useCallback, useState, useEffect, useMemo, useRef, useTransition } from 'react';
import { COMMUNITY_PROFILE, normalizeCommunitySettings } from './services/communityWorkspace';
import { logPerformanceEvent } from './utils/performanceTelemetry';
type RealtimeChannel = object;
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import type { InventoryFilter } from './components/Inventory';
import type { ReportsFinancialOverlay } from './components/Reports';
import type { SettingsTab } from './components/Settings';
import { LockScreen } from './components/ui/LockScreen';
import { Modal } from './components/ui/Modal';
import type { PurchasesProps } from './components/Purchases';
import { WarehouseLoader } from './components/ui/WarehouseLoader';
import { ToastContainer, ToastMessage } from './components/ui/Toast';
import { AppTopBar } from './components/ui/AppTopBar';
import { CommandPalette, type CommandPaletteItem } from './components/ui/CommandPalette';
import { NotificationCenter, type NotificationCenterItem, type NotificationSource } from './components/ui/NotificationCenter';
const Inventory = lazy(() => import('./components/Inventory').then((module) => ({ default: module.Inventory })));
const Sales = lazy(() => import('./components/Sales').then((module) => ({ default: module.Sales })));
const Customers = lazy(() => import('./components/Customers').then((module) => ({ default: module.Customers })));
const Expenses = lazy(() => import('./components/Expenses').then((module) => ({ default: module.Expenses })));
const Reports = lazy(() => import('./components/Reports').then((module) => ({ default: module.Reports })));
const Settings = lazy(() => import('./components/Settings').then((module) => ({ default: module.Settings })));
const Payroll = lazy(() => import('./components/Payroll').then((module) => ({ default: module.Payroll })));
const Purchases = lazy(() => import('./components/Purchases').then((module) => ({ default: module.Purchases })));
const Treasury = lazy(() => import('./components/Treasury').then((module) => ({ default: module.Treasury })));
const Partnerships = lazy(() => import('./components/Partnerships').then((module) => ({ default: module.Partnerships })));
import { AppView, UserProfile, Medicine, Customer, Invoice, AppSettings, AppUser, Expense, Supplier, Purchase, Batch, SalesDraft, SyncStatus, CustomerTransaction, Permission, GuestTrialState, GuestMigrationChoice, PurchasePayment, PurchaseReceipt, ControlBootstrapResponse, RuntimeHealthStatus, DomainAuditEntry, StockMovement, VendorCreditResolution, MedicineProcurementDraftRequest, RequestedPurchaseDraftFocus, TreasuryTransaction, TreasuryCashCount, UpdateInstallerProgress, Partner, PartnerLedgerEntry, BatchOwnershipType, StockEntryType, InventoryLinkedSyncTargets, SupplierDeleteMode, InvoiceItem, InvoiceUpdateRequest, SalesReturn } from './types';
import { loadFromDisk, prepareImportedFullDataForRestore, saveToDisk, sanitizeFullData } from './services/storageService';
import { withResolvedAiLanguage } from './utils/aiLanguage';
import { DEFAULT_DATE_TIME_SETTINGS } from './lib/formatters';
import { DEFAULT_SUBSCRIPTION, normalizeOperationMode } from "./services/localAccessPolicy";
import { getDeviceId } from "./services/localDeviceIdentity";
import { readLegacyTreasuryBlob, recordLegacyTreasuryDecision, shouldPromptForLegacyTreasuryAdoption, summarizeLegacyTreasuryBlob, type LegacyTreasurySummary, type TreasuryScope } from './services/treasuryLocal';
import { createUniqueId } from './utils/localIds';
import { normalizePersianNumbers } from './utils/localization';
import { canonicalizeMedicineManufacturers } from './utils/manufacturerCanonicalization';
import { DEFAULT_MEDICINE_ENTRY_AUTOMATION_SETTINGS } from './utils/medicineEntryAutomation';
import { DEFAULT_MEDICINE_PROCUREMENT_ASSIST_SETTINGS } from './utils/medicineProcurementAssist';
import { DEFAULT_INVENTORY_LINKED_SYNC_SETTINGS, DEFAULT_INVENTORY_LINKED_SYNC_TARGETS, resolveInventoryLinkedSyncTargets } from './utils/inventoryLinkedSync';
import { formatSyncErrorMessage, localizeOperationalMessage } from './utils/operationalMessageFormatter';
import { resolveTitleBarTheme } from './utils/titleBarTheme';
import { archiveMedicineCollection, purgeArchivedMedicineCollection, restoreArchivedMedicineCollection } from './utils/warehouseMedicineMutations';
import { formatInvoiceStockIssue, getFirstInvoiceStockIssue, validateInvoiceStock } from './utils/invoiceStockValidation';
import { formatInvoiceQuantityPolicyIssue, validateInvoiceQuantityPolicy } from './utils/invoiceQuantityPolicy';
import { getInvalidInvoiceFinancialLineIndex } from './utils/invoiceAccounting';
import { buildSalesReturn } from './utils/salesReturnAccounting';
import { getInvoiceCustomerBalanceImpact } from './utils/inventoryLedger';
import { hasInvoiceItemBeforeDateForBatch } from './utils/inventoryBatchIntegrity';
import { enqueueSerialMutation } from './utils/serialMutationQueue';
import { buildPurchaseBatchPayload, buildPurchasePaymentAllocationPlan, buildSupplierFinanceTaggedNote, buildSupplierSettlementPlan, calculatePurchaseSubtotal, buildPurchaseReceiptQuantityMap, getPurchaseOrderedQuantity, getPurchaseReceivedQuantity, normalizePurchaseRecord, purchaseAffectsInventory, purchaseAffectsSupplierLedger, resolvePurchasePaymentStatus, resolvePurchaseStatus, resolvePurchaseWorkflowStatus, validatePurchaseBatchPayloadIntegrity } from './utils/purchaseUtils';
import { runDataIntegrityAudit, type DataIntegrityAuditReport } from './utils/dataIntegrityAudit';
import { repairCriticalDataIntegritySnapshot } from './utils/dataIntegrityRepair';
import { applyInventoryTransaction, applyInventorySnapshotTransaction, buildInvoiceDeleteMovementDrafts, buildInvoiceEditMovementDrafts, buildPurchaseApplyMedicineSnapshot, buildPurchaseReceiptMedicineSnapshot, buildPurchaseRollbackMedicineSnapshot, buildInvoiceSaleMovementDrafts, buildSalesReturnMovementDrafts, buildVendorReturnInventoryMutation, findConsumedPurchaseBatches, InventoryTransactionError, type StockMovementDraft } from './services/inventoryTransactionService';
import { calculateInvoiceTotals } from './utils/calculations';
import { enforceInvoiceDesignPolicy } from './utils/invoiceDesignPolicy';
import { setSyncError, getSyncError, getSyncStatus, isTransientSyncErrorState, setSyncStatus, subscribeSyncStatus } from '@/state/syncState';
import { type FullData } from './utils/syncLogic';
import { DEFAULT_SALES_MODE, resolveDefaultSalesMode } from './constants/sales';
import { Logger } from './services/loggerService';
import { createConnectivityState, type ConnectivityFailureReason, type ConnectivityState } from "./services/localWorkspaceState";
import { type WarehouseOutboxKind } from "./services/localMutationTypes";
type RecordPurchasePaymentHandler = PurchasesProps['onRecordPurchasePayment'];
type RecordPurchaseReceiptHandler = PurchasesProps['onRecordPurchaseReceipt'];
type ShortClosePurchaseHandler = PurchasesProps['onShortClosePurchase'];
type AddSupplierPaymentHandler = PurchasesProps['onAddSupplierPayment'];
type RecordSupplierSettlementHandler = PurchasesProps['onRecordSupplierSettlement'];
type CombinedQueueStatus = {
    length: number;
    isProcessing: boolean;
    isPaused: boolean;
    nextRetry: number;
    queueLength: number;
    deltaQueueLength: number;
    warehouseOutboxLength: number;
    warehouseJournalLength: number;
    totalPending: number;
};
const getCombinedQueueStatus = (): CombinedQueueStatus => ({ length: 0, isProcessing: false, isPaused: false, nextRetry: 0, queueLength: 0, deltaQueueLength: 0, warehouseOutboxLength: 0, warehouseJournalLength: 0, totalPending: 0 });
const USER_CACHE_KEY = 'warekeep_community_profile';
const MAX_NOTIFICATION_CENTER_ITEMS = 200;
const MAX_VISIBLE_TOASTS = 3;
const isAppDocumentHidden = () => typeof document !== 'undefined' && document.visibilityState !== 'visible';
const hiddenAwareDelay = (visibleDelayMs: number, hiddenDelayMs: number) => isAppDocumentHidden() ? Math.max(visibleDelayMs, hiddenDelayMs) : visibleDelayMs;
const CONNECTION_EVENT_STABILITY_MS = 15000;
const SYNC_STATUS_STABILITY_MS = 12000;
const HEALTH_STATUS_STABILITY_MS = 20000;
const SYSTEM_NOTIFICATION_COOLDOWN_MS = 120000;
const NOTIFICATION_DUPLICATE_SUPPRESSION_MS = 10 * 60000;
type AdminMessageRecord = {
    id: string;
    content: string;
    type: 'info' | 'warning' | 'error';
    target_email: string | null;
    is_active: boolean;
    created_at: string;
};
const resolveRuntimeHealthStatus = (status: string | null | undefined): RuntimeHealthStatus => {
    if (status === 'healthy')
        return 'healthy';
    if (status === 'degraded')
        return 'degraded';
    if (status === 'error')
        return 'critical';
    return 'unknown';
};
const enforceOperationModePolicy = (settings: AppSettings): {
    settings: AppSettings;
    message?: string;
} => {
    return { settings: normalizeCommunitySettings(settings) };
};
const INITIAL_SETTINGS: AppSettings = withResolvedAiLanguage({
    storeName: 'My Store',
    storePhone: '',
    storeAddress: '',
    taxRate: 0,
    defaultSalesMode: DEFAULT_SALES_MODE,
    operationMode: 'offline',
    language: 'english',
    dateTimeSettings: {
        ...DEFAULT_DATE_TIME_SETTINGS,
        globalCalendar: 'gregorian',
        sectionCalendars: Object.fromEntries(Object.keys(DEFAULT_DATE_TIME_SETTINGS.sectionCalendars || {}).map(section => [section, 'gregorian'])),
        timeZone: 'local',
    },
    medicineAiDefaultInput: 'upload',
    medicineEntryAutomation: { ...DEFAULT_MEDICINE_ENTRY_AUTOMATION_SETTINGS },
    medicineProcurementAssist: { ...DEFAULT_MEDICINE_PROCUREMENT_ASSIST_SETTINGS },
    inventoryLinkedSyncSettings: { ...DEFAULT_INVENTORY_LINKED_SYNC_SETTINGS },
    users: [],
    expenseCategories: ['Rent', 'Electricity', 'Water', 'Food', 'Salary', 'Transport', 'Other'],
    // Backfilled via the offline icon matcher (all seven resolve on the exact layer).
    expenseCategoryIcons: {
        Rent: { icon: 'house', color: 'violet', source: 'exact' },
        Electricity: { icon: 'zap', color: 'amber', source: 'exact' },
        Water: { icon: 'droplets', color: 'blue', source: 'exact' },
        Food: { icon: 'utensils', color: 'red', source: 'exact' },
        Salary: { icon: 'wallet', color: 'green', source: 'exact' },
        Transport: { icon: 'truck', color: 'sky', source: 'exact' },
        Other: { icon: 'tag', color: 'slate', source: 'exact' }
    }
});
const createEmptyGuestWorkspace = (language: AppSettings['language'] = 'english') => {
    const nowIso = new Date().toISOString();
    const guestSettings: AppSettings = withResolvedAiLanguage({
        ...INITIAL_SETTINGS,
        language,
        operationMode: 'offline',
        teamMode: false,
        subscription: DEFAULT_SUBSCRIPTION,
        guestTrial: undefined,
        updatedAt: nowIso
    });
    return {
        medicines: [] as Medicine[],
        customers: [] as Customer[],
        invoices: [] as Invoice[],
        expenses: [] as Expense[],
        suppliers: [] as Supplier[],
        purchases: [] as Purchase[],
        partners: [] as Partner[],
        auditEvents: [] as DomainAuditEntry[],
        stockMovements: [] as StockMovement[],
        treasuryTransactions: [] as TreasuryTransaction[],
        treasuryCashCounts: [] as TreasuryCashCount[],
        settings: guestSettings,
        version: Date.now(),
        updatedAt: nowIso
    };
};
type ResettableDataCollection = 'medicines' | 'customers' | 'invoices' | 'expenses' | 'suppliers' | 'purchases' | 'partners' | 'auditEvents' | 'stockMovements';
const RESETTABLE_DATA_COLLECTIONS: ResettableDataCollection[] = [
    'medicines',
    'customers',
    'invoices',
    'expenses',
    'suppliers',
    'purchases',
    'partners',
    'auditEvents',
    'stockMovements'
];
const CLOUD_SYNC_COLLECTIONS: ResettableDataCollection[] = [
    'medicines',
    'customers',
    'invoices',
    'expenses',
    'suppliers',
    'purchases',
    'partners',
    'stockMovements'
];
const WAREHOUSE_SYNC_ENTITIES = new Set([
    'medicine',
    'customer',
    'invoice',
    'expense',
    'supplier',
    'purchase',
    'partner'
]);
const createInitialDraft = (appSettings?: AppSettings): SalesDraft => ({
    items: [],
    customerId: '',
    customerSearchTerm: '',
    discount: 0,
    paymentType: 'cash',
    amountPaidInput: 0,
    cashAmountInput: 0,
    cardAmountInput: 0,
    salesMode: resolveDefaultSalesMode(appSettings),
    partnerId: undefined
});
const toSafeNumber = (value: unknown, fallback = 0): number => {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    return fallback;
};
const toTrimmedText = (value: unknown): string => {
    return typeof value === 'string' ? value.trim() : '';
};
const getInventoryTransactionMessage = (error: unknown, isEnglish: boolean): string => {
    if (error instanceof InventoryTransactionError) {
        if (error.code === 'NEGATIVE_STOCK') {
            return isEnglish
                ? 'Stock changed while saving. Please review available quantity and try again.'
                : 'موجودی هنگام ذخیره تغییر کرد. مقدار موجود را بررسی کنید و دوباره تلاش کنید.';
        }
        if (error.code === 'BATCH_NOT_FOUND') {
            return isEnglish
                ? 'The selected batch was not found. Inventory was not changed.'
                : 'بچ انتخاب‌شده پیدا نشد. موجودی تغییر نکرد.';
        }
        if (error.code === 'MEDICINE_NOT_FOUND') {
            return isEnglish
                ? 'The selected medicine was not found. Inventory was not changed.'
                : 'داروی انتخاب‌شده پیدا نشد. موجودی تغییر نکرد.';
        }
        if (error.code === 'INVALID_MOVEMENT_QUANTITY') {
            return isEnglish
                ? 'Inventory quantity is invalid.'
                : 'مقدار واردشده برای موجودی معتبر نیست.';
        }
    }
    return error instanceof Error ? error.message : (isEnglish ? 'Inventory update failed.' : 'به‌روزرسانی موجودی ناموفق بود.');
};
const getFallbackCustomerName = (phone: string, isEnglish: boolean): string => {
    return isEnglish ? (phone ? `Customer ${phone}` : 'Unnamed customer') : (phone ? `مشتری ${phone}` : 'مشتری بدون نام');
};
const getManufacturerNormalizationMessage = (count: number, language: AppSettings['language'] = 'dari'): string => {
    return language === 'english'
        ? `Standardized manufacturer names in ${count} medicine record(s).`
        : `نام تولیدکننده در ${count} رکورد دوا یک‌دست شد.`;
};
const compareReleaseVersions = (left: string, right: string): number => {
    const leftParts = String(left || '')
        .split(/[.-]/)
        .map((part) => Number.parseInt(part, 10))
        .map((part) => (Number.isFinite(part) ? part : 0));
    const rightParts = String(right || '')
        .split(/[.-]/)
        .map((part) => Number.parseInt(part, 10))
        .map((part) => (Number.isFinite(part) ? part : 0));
    const maxLen = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < maxLen; index += 1) {
        const leftValue = leftParts[index] || 0;
        const rightValue = rightParts[index] || 0;
        if (leftValue > rightValue)
            return 1;
        if (leftValue < rightValue)
            return -1;
    }
    return 0;
};
const hasNewerPublishedRelease = (publishedVersion?: string | null, runtimeVersion?: string | null): boolean => compareReleaseVersions(String(publishedVersion || ''), String(runtimeVersion || '')) > 0;
const getLocalizedReleaseChannelLabel = (channel: string | undefined, isEnglish: boolean): string => {
    switch (String(channel || '').toLowerCase()) {
        case 'candidate':
            return isEnglish ? 'Candidate' : 'آزمایشی';
        case 'internal':
            return isEnglish ? 'Internal' : 'داخلی';
        default:
            return isEnglish ? 'Stable' : 'پایدار';
    }
};
const clampUpdateProgressPercent = (value: number | undefined): number => {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return 0;
    return Math.min(100, Math.max(0, value || 0));
};
const formatUpdateTransferBytes = (value: number | undefined, isEnglish: boolean): string => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return isEnglish ? 'Waiting' : 'در انتظار';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = value || 0;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    return `${size.toLocaleString(isEnglish ? 'en-US' : 'fa-AF', {
        maximumFractionDigits: unitIndex === 0 ? 0 : size >= 100 ? 0 : size >= 10 ? 1 : 2
    })} ${units[unitIndex]}`;
};
const formatUpdateTransferSpeed = (value: number | undefined, isEnglish: boolean): string => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return isEnglish ? 'Calculating' : 'در حال محاسبه';
    }
    return `${formatUpdateTransferBytes(value, isEnglish)}/s`;
};
const formatUpdateTransferEta = (value: number | undefined, isEnglish: boolean): string => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return isEnglish ? 'Calculating' : 'در حال محاسبه';
    }
    const seconds = Math.max(0, Math.round(value));
    if (seconds < 60)
        return isEnglish ? `${seconds}s` : `${seconds.toLocaleString('fa-AF')} ثانیه`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return isEnglish
        ? `${minutes}m ${remainingSeconds}s`
        : `${minutes.toLocaleString('fa-AF')} دقیقه ${remainingSeconds.toLocaleString('fa-AF')} ثانیه`;
};
const getUpdateProgressPhaseLabel = (phase: UpdateInstallerProgress['phase'], isEnglish: boolean): string => {
    switch (phase) {
        case 'starting':
            return isEnglish ? 'Starting download' : 'شروع دانلود';
        case 'downloading':
            return isEnglish ? 'Downloading installer' : 'در حال دانلود نصاب';
        case 'verifying-checksum':
            return isEnglish ? 'Verifying checksum' : 'بررسی صحت فایل';
        case 'saving':
            return isEnglish ? 'Saving file' : 'در حال ذخیره فایل';
        case 'verifying-signature':
            return isEnglish ? 'Checking signature' : 'بررسی امضای دیجیتال';
        case 'launching':
            return isEnglish ? 'Launching installer' : 'در حال اجرای نصاب';
        case 'completed':
            return isEnglish ? 'Installer opened' : 'نصاب باز شد';
        case 'error':
            return isEnglish ? 'Update failed' : 'به‌روزرسانی ناموفق بود';
        default:
            return isEnglish ? 'Ready' : 'آماده';
    }
};
const buildReleasePromptKey = (release: ControlBootstrapResponse['appRelease'], lockdownMode?: ControlBootstrapResponse['lockdownMode'], minimumVersion?: string | null): string | null => {
    if (!release && lockdownMode !== 'force_update')
        return null;
    return [
        release?.id || 'control-release',
        release?.version || minimumVersion || 'unknown',
        lockdownMode || 'normal',
    ].join(':');
};
const sanitizeCustomerCore = (source: Partial<Customer>, fallbackTransactions: CustomerTransaction[] = [], isEnglish = true): Pick<Customer, 'name' | 'phone' | 'address' | 'balance' | 'transactions'> => {
    const phone = normalizePersianNumbers(toTrimmedText(source.phone));
    const name = toTrimmedText(source.name) || getFallbackCustomerName(phone, isEnglish);
    const address = toTrimmedText(source.address);
    const balance = toSafeNumber(source.balance, 0);
    const transactions = Array.isArray(source.transactions) ? source.transactions : fallbackTransactions;
    return { name, phone, address, balance, transactions };
};
const getCustomerTransactionDelta = (transaction: CustomerTransaction): number => {
    const amount = toSafeNumber(transaction.amount);
    if (transaction.type === 'payment' || transaction.type === 'return')
        return -amount;
    return amount;
};
const normalizeCustomerTransactions = (transactions: CustomerTransaction[], finalBalance: number): CustomerTransaction[] => {
    if (!Array.isArray(transactions) || transactions.length === 0)
        return [];
    const sorted = [...transactions].sort((a, b) => {
        const firstDate = new Date(a.date).getTime();
        const secondDate = new Date(b.date).getTime();
        if (firstDate !== secondDate)
            return firstDate - secondDate;
        return a.id.localeCompare(b.id);
    });
    const totalDelta = sorted.reduce((sum, txn) => sum + getCustomerTransactionDelta(txn), 0);
    let runningBalance = finalBalance - totalDelta;
    const balancesById = new Map<string, number>();
    sorted.forEach((txn) => {
        runningBalance += getCustomerTransactionDelta(txn);
        balancesById.set(txn.id, runningBalance);
    });
    return transactions.map((txn) => ({
        ...txn,
        balanceAfter: balancesById.get(txn.id) ?? txn.balanceAfter
    }));
};
const getActiveInvoiceReturns = (returns?: SalesReturn[]): SalesReturn[] => (Array.isArray(returns) ? returns.filter((entry) => !entry.isDeleted && !entry.isVoided) : []);
const getInvoiceReturnSourceIndex = (invoice: Invoice, salesReturn: SalesReturn): number => {
    const returnItem = salesReturn.items?.[0];
    const sourceLineId = salesReturn.sourceLineId || returnItem?.lineId;
    if (sourceLineId) {
        const lineIndex = invoice.items.findIndex((item) => item.lineId === sourceLineId);
        if (lineIndex >= 0)
            return lineIndex;
    }
    if (typeof salesReturn.sourceItemIndex === 'number' && salesReturn.sourceItemIndex >= 0 && salesReturn.sourceItemIndex < invoice.items.length) {
        return salesReturn.sourceItemIndex;
    }
    if (!returnItem)
        return -1;
    return invoice.items.findIndex((item) => item.medicineId === returnItem.medicineId && item.batchId === returnItem.batchId);
};
const getSalesReturnQuantity = (salesReturn: SalesReturn): number => ((salesReturn.items || []).reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0));
const ensureInvoiceLineIds = (invoice: Invoice, previousInvoice?: Invoice): Invoice => ({
    ...invoice,
    items: (invoice.items || []).map((item, index) => ({
        ...item,
        lineId: item.lineId || previousInvoice?.items?.[index]?.lineId || `${invoice.id || previousInvoice?.id || 'invoice'}-line-${index + 1}`
    }))
});
const rebuildInvoiceReturnsForLocalEdit = (previousInvoice: Invoice, nextInvoice: Invoice, allowReturnedLineReassignment = false): SalesReturn[] => {
    const rebuiltReturns: SalesReturn[] = [];
    getActiveInvoiceReturns(previousInvoice.returns).forEach((previousReturn) => {
        const sourceIndex = getInvoiceReturnSourceIndex(previousInvoice, previousReturn);
        const previousItem = sourceIndex >= 0 ? previousInvoice.items[sourceIndex] : undefined;
        const returnItem = previousReturn.items?.[0];
        const sourceLineId = previousReturn.sourceLineId || returnItem?.lineId || previousItem?.lineId;
        const nextSourceIndex = sourceLineId
            ? nextInvoice.items.findIndex((item) => item.lineId === sourceLineId)
            : sourceIndex;
        const nextItem = nextSourceIndex >= 0 ? nextInvoice.items[nextSourceIndex] : undefined;
        if (!previousItem || !nextItem) {
            throw new Error('INVOICE_EDIT_RETURNED_LINE_REQUIRED');
        }
        const returnQuantity = getSalesReturnQuantity(previousReturn);
        if (returnQuantity <= 0)
            return;
        if (Math.max(0, Number(nextItem.quantity) || 0) + 1e-9 < returnQuantity) {
            throw new Error('INVOICE_EDIT_RETURN_QUANTITY_CONFLICT');
        }
        const lineReassigned = previousItem.medicineId !== nextItem.medicineId || previousItem.batchId !== nextItem.batchId;
        if (lineReassigned && !allowReturnedLineReassignment) {
            throw new Error('INVOICE_EDIT_RETURNED_LINE_REASSIGNMENT_REQUIRED');
        }
        const rebuilt = buildSalesReturn({
            invoice: {
                ...nextInvoice,
                returns: rebuiltReturns
            },
            itemIndex: nextSourceIndex,
            quantity: returnQuantity,
            reason: previousReturn.reason,
            paymentMethod: previousReturn.paymentMethod,
            date: previousReturn.date,
            id: previousReturn.id
        });
        rebuiltReturns.push({
            ...rebuilt,
            updatedAt: new Date().toISOString(),
            supersededBy: previousReturn.supersededBy
        });
    });
    return rebuiltReturns;
};
type DesktopShellDensity = 'spacious' | 'comfortable' | 'compact';
const DESKTOP_SHELL_DENSITY_COMPACT_THRESHOLD = 1100;
const DESKTOP_SHELL_DENSITY_COMFORTABLE_THRESHOLD = 1260;
const DESKTOP_SHELL_DENSITY_HYSTERESIS = 56;
const DESKTOP_SHELL_MOBILE_BREAKPOINT = 1024;
const DESKTOP_SHELL_EXPANDED_SIDEBAR_RESERVE = 276;
const DESKTOP_SHELL_COLLAPSED_SIDEBAR_RESERVE = 88;
const resolveDesktopShellDensity = (mainContentWidth: number): DesktopShellDensity => {
    if (mainContentWidth <= 0)
        return 'spacious';
    if (mainContentWidth < DESKTOP_SHELL_DENSITY_COMPACT_THRESHOLD)
        return 'compact';
    if (mainContentWidth < DESKTOP_SHELL_DENSITY_COMFORTABLE_THRESHOLD)
        return 'comfortable';
    return 'spacious';
};
const resolveDesktopShellAvailableWidth = ({ shellWidth, windowWidth, isZenMode, isSidebarCollapsed }: {
    shellWidth: number;
    windowWidth: number;
    isZenMode: boolean;
    isSidebarCollapsed: boolean;
}): number => {
    const stableShellWidth = shellWidth > 0 ? shellWidth : windowWidth;
    if (stableShellWidth <= 0)
        return stableShellWidth;
    if (isZenMode || windowWidth < DESKTOP_SHELL_MOBILE_BREAKPOINT)
        return stableShellWidth;
    const sidebarReserve = isSidebarCollapsed
        ? DESKTOP_SHELL_COLLAPSED_SIDEBAR_RESERVE
        : DESKTOP_SHELL_EXPANDED_SIDEBAR_RESERVE;
    return Math.max(0, stableShellWidth - sidebarReserve);
};
const resolveDesktopShellDensityWithHysteresis = (mainContentWidth: number, currentDensity: DesktopShellDensity): DesktopShellDensity => {
    const targetDensity = resolveDesktopShellDensity(mainContentWidth);
    if (targetDensity === currentDensity || mainContentWidth <= 0)
        return currentDensity;
    if (currentDensity === 'compact') {
        if (mainContentWidth >= DESKTOP_SHELL_DENSITY_COMFORTABLE_THRESHOLD + DESKTOP_SHELL_DENSITY_HYSTERESIS) {
            return 'spacious';
        }
        if (mainContentWidth >= DESKTOP_SHELL_DENSITY_COMPACT_THRESHOLD + DESKTOP_SHELL_DENSITY_HYSTERESIS) {
            return 'comfortable';
        }
        return 'compact';
    }
    if (currentDensity === 'comfortable') {
        if (mainContentWidth <= DESKTOP_SHELL_DENSITY_COMPACT_THRESHOLD - DESKTOP_SHELL_DENSITY_HYSTERESIS) {
            return 'compact';
        }
        if (mainContentWidth >= DESKTOP_SHELL_DENSITY_COMFORTABLE_THRESHOLD + DESKTOP_SHELL_DENSITY_HYSTERESIS) {
            return 'spacious';
        }
        return 'comfortable';
    }
    if (mainContentWidth <= DESKTOP_SHELL_DENSITY_COMPACT_THRESHOLD - DESKTOP_SHELL_DENSITY_HYSTERESIS) {
        return 'compact';
    }
    if (mainContentWidth <= DESKTOP_SHELL_DENSITY_COMFORTABLE_THRESHOLD - DESKTOP_SHELL_DENSITY_HYSTERESIS) {
        return 'comfortable';
    }
    return 'spacious';
};
const getUpdateInstallerErrorMessage = (error: unknown, language: AppSettings['language']): string => {
    const rawMessage = error instanceof Error ? error.message : String(error || '');
    const isEnglish = language === 'english';
    if (/UPDATE_DOWNLOAD_FAILED_500/i.test(rawMessage)) {
        return isEnglish
            ? 'The update server could not deliver the installer. Re-upload it to the host release storage or publish an external HTTPS installer link.'
            : 'سرور به‌روزرسانی نتوانست فایل نصاب را ارسال کند. فایل را دوباره در مخزن انتشار آپلود کنید یا لینک مستقیم HTTPS منتشر کنید.';
    }
    if (/UPDATE_DOWNLOAD_FAILED_404/i.test(rawMessage)) {
        return isEnglish
            ? 'The published installer file was not found on the update server.'
            : 'فایل نصاب منتشرشده روی سرور به‌روزرسانی پیدا نشد.';
    }
    if (/UPDATE_DOWNLOAD_FAILED_409|RELEASE_ASSET_LOCAL/i.test(rawMessage)) {
        return isEnglish
            ? 'The published installer is stored only on a local backend and is not reachable from this app.'
            : 'فایل نصاب منتشرشده فقط روی بک‌اند محلی ذخیره شده و از این برنامه قابل دسترسی نیست.';
    }
    if (/UPDATE_CHECKSUM_MISMATCH/i.test(rawMessage)) {
        return isEnglish
            ? 'The downloaded installer did not match the published checksum.'
            : 'فایل نصاب دانلودشده با کد صحت منتشرشده مطابقت نداشت.';
    }
    if (/UPDATE_SIGNATURE/i.test(rawMessage)) {
        return isEnglish
            ? 'The installer signature could not be verified.'
            : 'امضای دیجیتال فایل نصاب تأیید نشد.';
    }
    return isEnglish
        ? 'Could not start the update setup.'
        : 'راه‌اندازی نصب به‌روزرسانی ممکن نشد.';
};
const getAppSnapshotFreshnessMs = (snapshot: {
    version?: unknown;
    updatedAt?: unknown;
} | null | undefined): number => {
    if (!snapshot)
        return 0;
    const versionMs = typeof snapshot.version === 'number'
        ? snapshot.version
        : Number(snapshot.version || 0);
    const updatedAtMs = typeof snapshot.updatedAt === 'string'
        ? Date.parse(snapshot.updatedAt)
        : 0;
    return Math.max(Number.isFinite(versionMs) ? versionMs : 0, Number.isFinite(updatedAtMs) ? updatedAtMs : 0);
};
export const App: React.FC = () => {
    const [loading, setLoading] = useState(true); // Acts as 'isHydrating'
    const [hydrationError, setHydrationError] = useState<string | null>(null); // PHASE 3
    const [user, setUser] = useState<UserProfile | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [isZenMode, setIsZenMode] = useState(false);
    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
    const [view, setViewState] = useState<AppView>('dashboard');
    const [isViewPending, startViewTransition] = useTransition();
    const [isLocked, setIsLocked] = useState(false);
    const [activeAppUser, setActiveAppUser] = useState<AppUser | null>(null);
    // Data State
    const [medicines, setMedicines] = useState<Medicine[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);
    const tr = (en: string, fa: string) => settings.language === 'english' ? en : fa;
    useEffect(() => {
        const isEnglish = settings.language === 'english';
        document.documentElement.lang = isEnglish ? 'en' : 'fa-AF';
        document.documentElement.dir = isEnglish ? 'ltr' : 'rtl';
        document.body.dir = isEnglish ? 'ltr' : 'rtl';
    }, [settings.language]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [auditEvents, setAuditEvents] = useState<DomainAuditEntry[]>([]);
    const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
    const [criticalDataIntegrityReport, setCriticalDataIntegrityReport] = useState<DataIntegrityAuditReport | null>(null);
    const [treasuryTransactions, setTreasuryTransactions] = useState<TreasuryTransaction[]>([]);
    const [treasuryCashCounts, setTreasuryCashCounts] = useState<TreasuryCashCount[]>([]);
    /** Non-null only while the owner is being asked to claim a legacy unscoped treasury blob. */
    const [legacyTreasuryPrompt, setLegacyTreasuryPrompt] = useState<LegacyTreasurySummary | null>(null);
    const [salesDraft, setSalesDraft] = useState<SalesDraft>(() => createInitialDraft(INITIAL_SETTINGS));
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const [syncStatus, setUiSyncStatus] = useState<SyncStatus>(getSyncStatus());
    const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
    const [notificationItems, setNotificationItems] = useState<NotificationCenterItem[]>([]);
    const [isUpdatePromptOpen, setIsUpdatePromptOpen] = useState(false);
    const [dismissedUpdatePromptKey, setDismissedUpdatePromptKey] = useState<string | null>(null);
    const [isRefreshingUpdates, setIsRefreshingUpdates] = useState(false);
    const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
    const [updateInstallProgress, setUpdateInstallProgress] = useState<UpdateInstallerProgress | null>(null);
    const [connectivityState, setConnectivityState] = useState<ConnectivityState>(() => createConnectivityState({
        browserOnline: typeof navigator === 'undefined' ? true : navigator.onLine
    }));
    const [isNetworkOnline, setIsNetworkOnline] = useState(() => connectivityState.effectiveOnline);
    const [queueStatus, setQueueStatus] = useState<CombinedQueueStatus>(() => getCombinedQueueStatus());
    const [healthSnapshot, setHealthSnapshot] = useState(() => ({ running: false, inFlight: false, lastCheckedAt: null as string | null, lastRecoveryAt: null as string | null, status: "idle" as "idle" | "healthy" | "degraded" | "error", consecutiveUnhealthy: 0, lastIssue: null as string | null }));
    const [requestedSettingsTab, setRequestedSettingsTab] = useState<SettingsTab | null>(null);
    const [requestedInventoryFilter, setRequestedInventoryFilter] = useState<InventoryFilter | null>(null);
    const [requestedPurchasesTab, setRequestedPurchasesTab] = useState<'new' | 'list' | 'suppliers' | null>(null);
    const [requestedReportsOverlay, setRequestedReportsOverlay] = useState<ReportsFinancialOverlay | null>(null);
    const [requestedPurchaseContext, setRequestedPurchaseContext] = useState<{
        medicineId: string;
        medicineName: string;
        preferredSupplierId?: string;
    } | null>(null);
    const [requestedPurchaseDraftFocus, setRequestedPurchaseDraftFocus] = useState<RequestedPurchaseDraftFocus | null>(null);
    const [isGuestUpgradePromptOpen, setIsGuestUpgradePromptOpen] = useState(false);
    const [isGuestUpgradeAuthOpen, setIsGuestUpgradeAuthOpen] = useState(false);
    const [guestUpgradeChoice, setGuestUpgradeChoice] = useState<GuestMigrationChoice | null>(null);
    const [controlPlaneState, setControlPlaneState] = useState<ControlBootstrapResponse | null>(null);
    const [controlPlaneFetchError, setControlPlaneFetchError] = useState<string | null>(null);
    const [runtimeVersion, setRuntimeVersion] = useState<string>(() => (import.meta.env.VITE_APP_VERSION || '1.0.6'));
    const [runtimePlatform, setRuntimePlatform] = useState<string>(() => (typeof window !== 'undefined' && window.electronAPI ? 'desktop-win' : 'web'));
    const [desktopShellDensity, setDesktopShellDensity] = useState<DesktopShellDensity>('spacious');
    const isDesktopShell = typeof window !== 'undefined' && !!window.electronAPI;
    useEffect(() => {
        if (typeof document === 'undefined')
            return undefined;
        const targets = [document.documentElement, document.body].filter(Boolean);
        targets.forEach((target) => {
            target.classList.toggle('wk-desktop-performance', isDesktopShell);
        });
        return () => {
            targets.forEach((target) => {
                target.classList.remove('wk-desktop-performance');
            });
        };
    }, [isDesktopShell]);
    const activeTeamUsers = useMemo(() => (settings.users || []).filter((appUser) => !appUser.isDeleted), [settings.users]);
    const shellViewportRef = useRef<HTMLDivElement | null>(null);
    const toastStateRef = useRef<ToastMessage[]>([]);
    const controlEventsCursorRef = useRef<string | null>(null);
    const connectivityStateRef = useRef(connectivityState);
    const setView = useCallback((nextView: AppView) => {
        startViewTransition(() => {
            setViewState(nextView);
        });
    }, [startViewTransition]);
    const handleSidebarToggle = useCallback(() => {
        if (window.innerWidth < 1024) {
            setIsSidebarOpen(true);
            return;
        }
        setIsSidebarCollapsed((prev) => !prev);
    }, []);
    const handleOpenMedicineArchive = useCallback(() => {
        setRequestedSettingsTab(null);
        setRequestedInventoryFilter('ARCHIVED');
        setView('inventory');
    }, [setView]);
    const lastSyncErrorKeyRef = useRef<string>('');
    const lastSyncStatusRef = useRef<SyncStatus>(getSyncStatus());
    const lastHealthStatusRef = useRef(healthSnapshot.status);
    const lastOnlineStateRef = useRef(isNetworkOnline);
    const lastConnectivityReasonRef = useRef(connectivityState.reason);
    const adminMessageSeenIdsRef = useRef<Set<string>>(new Set());
    const adminMessageSubscriptionRef = useRef<RealtimeChannel | null>(null);
    const systemNotificationCooldownRef = useRef<Map<string, number>>(new Map());
    const recentNotificationFingerprintRef = useRef<Map<string, number>>(new Map());
    const lastReleaseNotificationKeyRef = useRef<string>('');
    const networkNotificationTimerRef = useRef<number | null>(null);
    const heartbeatPayloadRef = useRef<{
        syncStatus: SyncStatus;
        healthStatus: RuntimeHealthStatus;
        queueLength: number;
        lastSyncError: string | null;
    }>({
        syncStatus: getSyncStatus(),
        healthStatus: resolveRuntimeHealthStatus(healthSnapshot.status),
        queueLength: getCombinedQueueStatus().length,
        lastSyncError: getSyncError()?.message || null
    });
    useEffect(() => {
        toastStateRef.current = toasts;
    }, [toasts]);
    useEffect(() => {
        const defaultSalesMode = resolveDefaultSalesMode(settings);
        setSalesDraft((previousDraft) => {
            if (previousDraft.salesMode === defaultSalesMode || previousDraft.items.length > 0) {
                return previousDraft;
            }
            return {
                ...previousDraft,
                salesMode: defaultSalesMode
            };
        });
    }, [settings.defaultSalesMode]);
    useEffect(() => {
        if (!window.electronAPI?.onInstallerDownloadProgress)
            return undefined;
        return window.electronAPI.onInstallerDownloadProgress((progress) => {
            setUpdateInstallProgress(progress);
        });
    }, []);
    useEffect(() => {
        if (typeof ResizeObserver === 'undefined')
            return undefined;
        const updateDensity = () => {
            const mainContentWidth = resolveDesktopShellAvailableWidth({
                shellWidth: shellViewportRef.current?.clientWidth || 0,
                windowWidth: window.innerWidth,
                isZenMode,
                isSidebarCollapsed
            });
            setDesktopShellDensity((currentDensity) => resolveDesktopShellDensityWithHysteresis(mainContentWidth, currentDensity));
        };
        const observer = new ResizeObserver(() => {
            updateDensity();
        });
        if (shellViewportRef.current)
            observer.observe(shellViewportRef.current);
        window.addEventListener('resize', updateDensity);
        updateDensity();
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateDensity);
        };
    }, [hydrationError, isSidebarCollapsed, isZenMode, loading, user]);
    const syncStatusNotificationTimerRef = useRef<number | null>(null);
    const healthStatusNotificationTimerRef = useRef<number | null>(null);
    const hasSyncOfflineAlertRef = useRef(false);
    const hasHealthIssueAlertRef = useRef(false);
    const previousSubscriptionRefreshOnlineRef = useRef(isNetworkOnline);
    const previousAuthRefreshOnlineRef = useRef(isNetworkOnline);
    const browserLocalFirstWarningShownRef = useRef(false);
    const invoiceCommitQueueRef = useRef<Promise<unknown>>(Promise.resolve());
    const treasuryCommitQueueRef = useRef<Promise<unknown>>(Promise.resolve());
    const subscriptionAutoRefreshTimersRef = useRef<number[]>([]);
    // Keep a "latest state" ref to avoid stale closures in sync callbacks.
    const latestDataRef = useRef({
        medicines: [] as Medicine[],
        customers: [] as Customer[],
        invoices: [] as Invoice[],
        expenses: [] as Expense[],
        settings: INITIAL_SETTINGS as AppSettings,
        suppliers: [] as Supplier[],
        purchases: [] as Purchase[],
        partners: [] as Partner[],
        auditEvents: [] as DomainAuditEntry[],
        stockMovements: [] as StockMovement[],
        treasuryTransactions: [] as TreasuryTransaction[],
        treasuryCashCounts: [] as TreasuryCashCount[],
        version: 0,
        updatedAt: undefined as string | undefined
    });
    useEffect(() => {
        return () => {
            if (networkNotificationTimerRef.current) {
                window.clearTimeout(networkNotificationTimerRef.current);
            }
            if (syncStatusNotificationTimerRef.current) {
                window.clearTimeout(syncStatusNotificationTimerRef.current);
            }
            if (healthStatusNotificationTimerRef.current) {
                window.clearTimeout(healthStatusNotificationTimerRef.current);
            }
        };
    }, []);
    useEffect(() => {
        latestDataRef.current = {
            ...latestDataRef.current,
            medicines,
            customers,
            invoices,
            expenses,
            settings,
            suppliers,
            purchases,
            partners,
            auditEvents,
            stockMovements,
            treasuryTransactions,
            treasuryCashCounts
        };
    }, [medicines, customers, invoices, expenses, settings, suppliers, purchases, partners, auditEvents, stockMovements, treasuryTransactions, treasuryCashCounts]);
    useEffect(() => {
        connectivityStateRef.current = connectivityState;
    }, [connectivityState]);
    useEffect(() => {
        heartbeatPayloadRef.current = {
            syncStatus,
            healthStatus: resolveRuntimeHealthStatus(healthSnapshot.status),
            queueLength: queueStatus.length,
            lastSyncError: getSyncError()?.message || null
        };
    }, [syncStatus, healthSnapshot.status, queueStatus.length]);
    const guestTrialState = useMemo<GuestTrialState | null>(() => {
        return null;
    }, [false, settings.guestTrial, medicines, invoices]);
    const guestTrialDaysRemaining = useMemo(() => {
        if (!guestTrialState?.meta?.expiresAt)
            return null;
        const diffMs = new Date(guestTrialState.meta.expiresAt).getTime() - Date.now();
        return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
    }, [guestTrialState?.meta?.expiresAt]);
    useEffect(() => {
        return subscribeSyncStatus((status) => {
            setUiSyncStatus(status);
        });
    }, []);
    useEffect(() => {
        if (!isZenMode)
            return;
        setIsSidebarOpen(false);
    }, [isZenMode]);
    const titleBarThemeName = resolveTitleBarTheme({
        loading,
        hasUser: !!user,
        teamMode: !!settings.teamMode,
        hasActiveAppUser: !!activeAppUser,
        isLocked: !!settings.teamMode && (!!isLocked || !activeAppUser)
    });
    useEffect(() => {
        void window.electronAPI?.setTitleBarTheme?.(titleBarThemeName);
    }, [titleBarThemeName]);
    useEffect(() => {
        if (!settings.teamMode) {
            if (activeAppUser)
                setActiveAppUser(null);
            if (isLocked)
                setIsLocked(false);
            return;
        }
        if (!activeAppUser)
            return;
        const refreshedActiveUser = activeTeamUsers.find((appUser) => appUser.id === activeAppUser.id) || null;
        if (!refreshedActiveUser) {
            setActiveAppUser(null);
            setIsLocked(false);
            return;
        }
        if (refreshedActiveUser !== activeAppUser) {
            setActiveAppUser(refreshedActiveUser);
        }
    }, [activeAppUser, activeTeamUsers, isLocked, settings.teamMode]);
    useEffect(() => {
        let cancelled = false;
        const loadRuntimeInfo = async () => {
            try {
                const [appVersion, platformInfo] = await Promise.all([
                    window.electronAPI?.getAppVersion?.(),
                    window.electronAPI?.getPlatformInfo?.()
                ]);
                if (cancelled)
                    return;
                if (typeof appVersion === 'string' && appVersion.trim()) {
                    setRuntimeVersion(appVersion.trim());
                }
                if (platformInfo?.platform) {
                    setRuntimePlatform(platformInfo.platform);
                }
            }
            catch {
                // Keep fallback values.
            }
        };
        void loadRuntimeInfo();
        return () => {
            cancelled = true;
        };
    }, []);
    const isCloudSyncAllowed = useCallback((candidateSettings?: AppSettings): boolean => {
        return false;
    }, [false, settings, controlPlaneState?.syncPaused]);
    const isBrowserOnline = useCallback((): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine), []);
    const markEffectiveOffline = useCallback((reason: ConnectivityFailureReason | 'pending_work_remaining', source: string) => {
        const nextConnectivity = reason === 'pending_work_remaining'
            ? createConnectivityState({
                browserOnline: isBrowserOnline(),
                supabaseReachable: true,
                backendReachable: true
            })
            : createConnectivityState({
                browserOnline: reason !== 'browser_offline',
                supabaseReachable: reason !== 'browser_offline' && reason !== 'supabase_unreachable',
                backendReachable: reason !== 'browser_offline' && reason !== 'backend_unreachable',
                reason
            });
        connectivityStateRef.current = nextConnectivity;
        setConnectivityState(nextConnectivity);
        setIsNetworkOnline(reason === 'pending_work_remaining' ? nextConnectivity.effectiveOnline : false);
        setSyncError(reason === 'browser_offline'
            ? 'Device is offline.'
            : reason === 'supabase_unreachable'
                ? 'Supabase is unreachable.'
                : reason === 'backend_unreachable'
                    ? 'Backend is unreachable.'
                    : 'Pending local work is waiting for retry.', {
            code: reason === 'browser_offline'
                ? 'NETWORK_OFFLINE'
                : reason === 'pending_work_remaining'
                    ? 'QUEUE_RETRY_PENDING'
                    : 'NETWORK_OFFLINE',
            source
        });
        setSyncStatus('offline');
    }, [isBrowserOnline]);
    useEffect(() => {
        const handleOffline = () => {
            markEffectiveOffline('browser_offline', 'App.network.offline');
        };
        const handleOnline = () => {
            {
                markEffectiveOffline('browser_offline', 'App.community');
                return;
            }
        };
        if (isBrowserOnline()) {
            handleOnline();
        }
        else {
            handleOffline();
        }
        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);
        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
        };
    }, [isBrowserOnline, isCloudSyncAllowed, loading, markEffectiveOffline, user]);
    useEffect(() => {
        const handleWarehouseOutboxUpdated = () => {
            return;
        };
        window.addEventListener('warekeep:warehouse-outbox-updated', handleWarehouseOutboxUpdated as EventListener);
        return () => {
            window.removeEventListener('warekeep:warehouse-outbox-updated', handleWarehouseOutboxUpdated as EventListener);
        };
    }, [isBrowserOnline, loading, user]);
    useEffect(() => {
        const handleVisibilityReturn = () => {
            if (document.visibilityState !== 'visible')
                return;
            return;
        };
        document.addEventListener('visibilitychange', handleVisibilityReturn);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityReturn);
        };
    }, [isBrowserOnline, loading, user]);
    useEffect(() => {
        if (loading)
            return;
        return;
    }, [connectivityState.effectiveOnline, loading, user, isCloudSyncAllowed]);
    useEffect(() => {
        const shouldRunHealthCheck = !loading &&
            !!user && false && false && false;
        if (!shouldRunHealthCheck) {
            return;
        }
        return () => {
        };
    }, [loading, user, isCloudSyncAllowed]);
    useEffect(() => {
        if (controlPlaneState?.syncPaused) {
            return;
        }
    }, [controlPlaneState?.syncPaused]);
    const fetchControlBootstrap = useCallback(async () => {
        return;
    }, [user, runtimeVersion, runtimePlatform, settings.subscription?.tier]);
    useEffect(() => {
        {
            setControlPlaneState(null);
            setControlPlaneFetchError(null);
            controlEventsCursorRef.current = null;
            return;
        }
    }, [user, fetchControlBootstrap, controlPlaneState?.pollIntervals?.bootstrapMs]);
    useEffect(() => {
        {
            {
                controlEventsCursorRef.current = null;
            }
            return;
        }
    }, [user, fetchControlBootstrap, controlPlaneState]);
    const localizeToastMessage = (message: string): string => {
        const localizedOperationalMessage = localizeOperationalMessage(message, settings.language === 'english');
        if (localizedOperationalMessage !== message)
            return localizedOperationalMessage;
        if (settings.language !== 'english')
            return message;
        if (message.startsWith('خطا در ساختار معلومات:')) {
            return `Data structure error:${message.replace('خطا در ساختار معلومات:', '')}`;
        }
        const directMap: Record<string, string> = {
            'خطا در یکپارچگی داده‌ها (Integrity). لطف?اً لاگ‌ها را ارسال کنید.': 'Data integrity check failed. Please send logs.',
            'برای جلوگیری از حذف? ناخواسته، ذخیره‌سازی دادهٔ خالی متوقف? شد. لطف?اً برنامه را نبندید و گزارش لاگ را ارسال کنید.': 'Empty-data save was blocked to prevent accidental data wipe. Do not close the app and send logs.',
            'خطای جدی در ذخیره‌سازی (تأیید نوشتن). برنامه تلاش کرد بازیابی کند. لطف?اً لاگ را ارسال کنید.': 'Critical save verification failure occurred. Recovery was attempted. Please send logs.',
            'ارتباط داخلی برنامه (IPC) مشکل دارد. لطف?اً برنامه را ری‌استارت کنید و در صورت تکرار، لاگ را ارسال کنید.': 'Internal app IPC communication failed. Restart the app and send logs if it repeats.',
            'خطا در ذخیره‌سازی معلومات. لطف?اً دوباره تلاش کنید و برنامه را ف?وری نبندید.': 'Failed to save data. Please retry and do not close the app immediately.',
            'اسنپ‌شات سرور خالی بود؛ برای جلوگیری از حذف? داده‌ها اعمال نشد.': 'Server snapshot was empty and was not applied to prevent data loss.',
            'داده‌ها از سرور دریاف?ت و اعمال شد.': 'Data was fetched from the server and applied.',
            'این دستگاه تأیید نشده است. همگام‌سازی غیرف?عال شد.': 'This device is not trusted. Sync has been disabled.',
            'سیستم ذخیره‌سازی در حالت اضطراری است. لطف?اً برنامه را ری‌استارت کنید و در صورت تکرار، لاگ را ارسال کنید.': 'Storage system is in emergency mode. Restart the app and send logs if it repeats.',
            'نام دوا اجباری است.': 'Medicine name is required.',
            'دوای جدید اضاف?ه شد': 'New medicine added.',
            'سری ساخت جدید اضاف?ه شد': 'New batch added.',
            'دوا حذف? شد (بایگانی)': 'Medicine archived.',
            'ف?اکتور با موف?قیت ثبت شد': 'Invoice saved successfully.',
            'ف?اکتور انتخاب‌شده از قبل حذف? شده است.': 'Selected invoice was already deleted.',
            'مشتری جدید اضاف?ه شد': 'New customer added.',
            'مشتری حذف? شد': 'Customer deleted.',
            'هزینه ثبت شد': 'Expense recorded.',
            'ف?اکتور خرید ثبت شد و موجودی گدام به‌روز شد': 'Purchase invoice saved and warehouse stock updated.',
            'پرداخت به تأمین‌کننده ثبت شد': 'Supplier payment recorded.',
            'تنظیمات ذخیره شد': 'Settings saved.',
            'بازگردانی انجام شد': 'Restore completed.',
            'ریست سیستم تکمیل شد.': 'System reset completed.',
            'هیچ گزینه‌ای برای ریست انتخاب نشده است.': 'No reset option was selected.',
            'تأمین‌کننده انتخاب‌شده برای ساخت پیش‌نویس خرید پیدا نشد': 'The supplier selected for the purchase draft was not found.',
            'مقدار ضایعات معتبر نیست یا موجودی کاف?ی وجود ندارد.': 'The waste quantity is invalid or there is not enough stock.',
            'ف?اکتور انتخاب‌شده پیدا نشد یا قبلاً حذف? شده است.': 'The selected invoice was not found or was already deleted.',
            'برگشتی ف?روش ثبت شد و حساب مشتری/موجودی اصلاح گردید.': 'The sales return was saved and the customer balance and stock were updated.',
            'هزینه بروزرسانی شد': 'Expense updated.',
            'هزینه‌ها بروزرسانی شد': 'Expenses updated.',
            'هزینه‌ها حذف شد': 'Expenses deleted.',
            'این تأمین‌کننده در ف?روش‌های ثبت‌شده استف?اده شده است. اول ف?روش‌های وابسته را حذف? یا برگشت بزنید، بعد حذف? کامل را اجرا کنید.': 'This supplier is used in saved sales. Delete or return the related sales before permanently deleting the supplier.',
            'ذخیره خرید متوقف شد: تعداد سطرهای دریافت‌شده با batchهای ساخته‌شده برابر نیست': 'The purchase could not be saved because the received lines do not match the stock batches.',
            'ذخیره تغییرات خرید متوقف شد: سطر دریافت‌شده بدون batch معتبر پیدا شد': 'Purchase changes could not be saved because a received line has no valid stock batch.',
            'ف?اکتور خرید ویرایش شد': 'Purchase invoice updated.',
            'این خرید بسته ناقص شده و دریاف?ت جدید نمی‌گیرد': 'This purchase was closed with a shortfall and cannot receive more stock.',
            'برای دریاف?ت خرید، حداقل یک مقدار معتبر لازم است': 'Enter at least one valid quantity to receive this purchase.',
            'رسید خرید ثبت شد': 'Purchase receipt saved.',
            'خرید به‌صورت ناقص بسته شد': 'Purchase closed with a shortfall.',
            'ف?اکتور خرید حذف? شد': 'Purchase invoice deleted.',
            'پیش‌پرداخت تأمین‌کننده ثبت شد': 'Supplier advance payment saved.',
            'تسویه تأمین‌کننده ثبت شد': 'Supplier settlement saved.',
            'تعداد مرجوعی باید بیشتر از صف?ر باشد.': 'The return quantity must be greater than zero.',
            'ف?ایل پشتیبان نامعتبر است.': 'Invalid backup file.',
        };
        if (directMap[message])
            return directMap[message];
        const partialRollbackMatch = message.match(/^(\d+)\s+.+replacement batches\.$/);
        if (partialRollbackMatch) {
            return `${partialRollbackMatch[1]} invoices were deleted. Some returned stock was applied to replacement batches.`;
        }
        const fullRollbackMatch = message.match(/^(\d+)\s+.+inventory\/customer balances.+$/);
        if (fullRollbackMatch) {
            return `${fullRollbackMatch[1]} invoices were deleted and inventory/customer balances were corrected.`;
        }
        return message;
    };
    const sanitizeToastMessage = (message: string, type: ToastMessage['type']): string => {
        const localizedMessage = localizeToastMessage(message).trim();
        const isEnglish = settings.language === 'english';
        if (!localizedMessage)
            return localizedMessage;
        if (/[a-z]+\[\d+\]\.[a-z0-9_]+\s+invalid/i.test(localizedMessage)) {
            Logger.warn('UI', 'Sanitized validation toast for end-user', {
                originalMessage: message,
                localizedMessage
            });
            return isEnglish
                ? 'Some entered information is incomplete. Review the required fields and try again.'
                : 'بخشی از اطلاعات واردشده ناقص است. فیلدهای ضروری را بررسی کنید و دوباره تلاش کنید.';
        }
        if (/CRITICAL:/i.test(localizedMessage) ||
            /Persist Blocked/i.test(localizedMessage) ||
            /Integrity Check Failed/i.test(localizedMessage) ||
            /\bIPC\b/i.test(localizedMessage) ||
            /verification failed/i.test(localizedMessage)) {
            Logger.error('UI', 'Sanitized technical toast for end-user', undefined, {
                originalMessage: message,
                localizedMessage,
                type
            });
            return isEnglish
                ? 'The request could not be completed safely. Please try again. If the issue repeats, send the support log.'
                : 'این درخواست به‌صورت ایمن کامل نشد. دوباره تلاش کنید و اگر مشکل تکرار شد، لاگ پشتیبانی را بفرستید.';
        }
        return localizedMessage;
    };
    const pushNotification = useCallback((item: Omit<NotificationCenterItem, 'id' | 'createdAt' | 'read'> & {
        read?: boolean;
        createdAt?: string;
    }) => {
        const fingerprint = [
            item.source,
            item.level,
            item.title.trim(),
            item.message.trim()
        ].join('::');
        const now = Date.now();
        const lastSeen = recentNotificationFingerprintRef.current.get(fingerprint) || 0;
        if (now - lastSeen < NOTIFICATION_DUPLICATE_SUPPRESSION_MS) {
            return;
        }
        recentNotificationFingerprintRef.current.set(fingerprint, now);
        recentNotificationFingerprintRef.current.forEach((timestamp, key) => {
            if (now - timestamp > NOTIFICATION_DUPLICATE_SUPPRESSION_MS) {
                recentNotificationFingerprintRef.current.delete(key);
            }
        });
        const id = createUniqueId('ntf');
        const createdAt = item.createdAt || new Date().toISOString();
        setNotificationItems((prev) => {
            const next: NotificationCenterItem = {
                id,
                title: item.title,
                message: item.message,
                level: item.level,
                source: item.source,
                createdAt,
                read: item.read ?? false
            };
            return [next, ...prev].slice(0, MAX_NOTIFICATION_CENTER_ITEMS);
        });
    }, []);
    const canEmitSystemNotification = useCallback((key: string, cooldownMs = SYSTEM_NOTIFICATION_COOLDOWN_MS) => {
        const now = Date.now();
        const last = systemNotificationCooldownRef.current.get(key) || 0;
        if (now - last < cooldownMs)
            return false;
        systemNotificationCooldownRef.current.set(key, now);
        return true;
    }, []);
    const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', options?: {
        addToCenter?: boolean;
        source?: NotificationSource;
        title?: string;
    }) => {
        const id = createUniqueId('toast');
        const userMessage = sanitizeToastMessage(message, type);
        const hasBlockingErrorToast = toastStateRef.current.some((toast) => toast.type === 'error');
        const suppressVisualToast = type === 'success' && hasBlockingErrorToast;
        if (!suppressVisualToast) {
            setToasts((prev) => {
                const withoutDuplicateMessage = prev.filter((toast) => toast.message !== userMessage);
                const withoutConflicts = type === 'error'
                    ? withoutDuplicateMessage.filter((toast) => toast.type !== 'success')
                    : withoutDuplicateMessage;
                const next = [...withoutConflicts, { id, message: userMessage, type }].slice(-MAX_VISIBLE_TOASTS);
                toastStateRef.current = next;
                return next;
            });
        }
        else {
            Logger.info('UI', 'Suppressed success toast because an error toast is active', {
                message,
                localizedMessage: userMessage
            });
        }
        if (options?.addToCenter === false)
            return;
        const defaultTitle = settings.language === 'english'
            ? (type === 'error' ? 'Error' :
                type === 'warning' ? 'Warning' :
                    type === 'success' ? 'Success' :
                        'Info')
            : (type === 'error' ? 'خطا' :
                type === 'warning' ? 'هشدار' :
                    type === 'success' ? 'موف?قیت' :
                        'اطلاعیه');
        pushNotification({
            title: options?.title || defaultTitle,
            message: userMessage,
            level: type,
            source: options?.source || 'activity'
        });
    }, [pushNotification, settings.language]);
    const evaluateDataIntegrity = useCallback((snapshot: Partial<FullData>, source: string, options?: {
        silentWhenClean?: boolean;
    }): DataIntegrityAuditReport => {
        const report = runDataIntegrityAudit({
            medicines: snapshot.medicines || [],
            customers: snapshot.customers || [],
            invoices: snapshot.invoices || [],
            suppliers: snapshot.suppliers || [],
            purchases: snapshot.purchases || [],
            stockMovements: snapshot.stockMovements || []
        });
        if (report.summary.critical > 0) {
            setCriticalDataIntegrityReport(report);
            addToast(settings.language === 'english'
                ? `Critical data integrity issue detected during ${source}. New stock/accounting writes are blocked until repaired or restored.`
                : `Critical data integrity issue detected during ${source}. New stock/accounting writes are blocked until repaired or restored.`, 'error', { source: 'system', addToCenter: true });
        }
        else {
            setCriticalDataIntegrityReport(null);
            if (!options?.silentWhenClean) {
                Logger.info('APP', 'Data integrity audit passed', {
                    source,
                    warnings: report.summary.warning,
                    info: report.summary.info
                });
            }
        }
        return report;
    }, [addToast, settings.language]);
    const removeToast = (id: string) => {
        setToasts((prev) => {
            const next = prev.filter((toast) => toast.id !== id);
            toastStateRef.current = next;
            return next;
        });
    };
    useEffect(() => {
        if (loading || hydrationError)
            return;
        return;
    }, [addToast, hydrationError, loading, runtimeVersion, settings.language]);
    const notifyGuestBlocked = useCallback((message?: string, action?: string) => {
        return;
    }, [false]);
    const ensureWritable = useCallback((action?: string): boolean => {
        if (controlPlaneState?.lockdownMode === 'force_update') {
            addToast(settings.language === 'english'
                ? 'A required update is waiting. Install the new version before editing data.'
                : 'یک به‌روزرسانی اجباری در انتظار است. پیش از ویرایش داده‌ها نسخه جدید را نصب کنید.', 'warning', { source: 'server', addToCenter: true });
            return false;
        }
        if (controlPlaneState?.lockdownMode === 'safe_read_only') {
            addToast(settings.language === 'english'
                ? 'The system is temporarily in read-only safe mode.'
                : 'سیستم موقتاً در حالت امنِ فقط‌خواندنی است.', 'warning', { source: 'server', addToCenter: true });
            return false;
        }
        if (criticalDataIntegrityReport?.summary.critical) {
            const actionKey = action || '';
            const allowedDuringIntegrityRepair = new Set([
                'restoreData',
                'systemReset',
                'saveSettings',
                'retryServerSync'
            ]);
            if (!allowedDuringIntegrityRepair.has(actionKey)) {
                addToast(settings.language === 'english'
                    ? `Critical data integrity issues are active (${criticalDataIntegrityReport.summary.critical}). Repair, restore, or reset data before creating new stock/accounting records.`
                    : `مشکلات بحرانی صحت داده فعال است (${criticalDataIntegrityReport.summary.critical}). پیش از ثبت رکورد جدید موجودی/حسابداری، داده‌ها را ترمیم، بازیابی یا ریست کنید.`, 'error', { source: 'system', addToCenter: true });
                return false;
            }
        }
        return true;
    }, [controlPlaneState?.lockdownMode, criticalDataIntegrityReport, false, guestTrialState, settings.language, notifyGuestBlocked, addToast]);
    const refreshRuntimeSubscriptionFromServer = useCallback(async () => {
        if (loading)
            return;
        return;
    }, [loading, user, addToast, connectivityState.effectiveOnline]);
    useEffect(() => {
        const previous = previousSubscriptionRefreshOnlineRef.current;
        previousSubscriptionRefreshOnlineRef.current = isNetworkOnline;
        if (previous === isNetworkOnline)
            return;
        if (!isNetworkOnline)
            return;
        void refreshRuntimeSubscriptionFromServer();
    }, [isNetworkOnline, refreshRuntimeSubscriptionFromServer]);
    useEffect(() => {
        subscriptionAutoRefreshTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
        subscriptionAutoRefreshTimersRef.current = [];
        if (loading)
            return undefined;
        return undefined;
    }, [isNetworkOnline, loading, refreshRuntimeSubscriptionFromServer, user?.email, user?.id, user?.provider]);
    const canStartGuestAiRequest = useCallback((): boolean => {
        return true;
    }, [false, guestTrialState, settings.language, notifyGuestBlocked]);
    const buildCurrentGuestWorkspace = useCallback((): FullData => {
        const nowIso = new Date().toISOString();
        const snapshot = sanitizeFullData({
            medicines,
            customers,
            invoices,
            expenses,
            suppliers,
            purchases,
            partners,
            auditEvents,
            stockMovements,
            settings: {
                ...settings,
                operationMode: 'offline',
                teamMode: false,
                subscription: DEFAULT_SUBSCRIPTION,
                guestTrial: undefined,
                updatedAt: nowIso
            },
            version: Date.now()
        }) as FullData | null;
        if (!snapshot) {
            throw new Error('GUEST_SNAPSHOT_INVALID');
        }
        return snapshot;
    }, [auditEvents, customers, expenses, invoices, medicines, partners, purchases, settings, stockMovements, suppliers]);
    const markAllNotificationsRead = useCallback(() => {
        setNotificationItems((prev) => prev.map((item) => (item.read ? item : { ...item, read: true })));
    }, []);
    const markNotificationRead = useCallback((id: string) => {
        setNotificationItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
    }, []);
    const clearNotificationCenter = useCallback(() => {
        setNotificationItems([]);
    }, []);
    useEffect(() => {
        let cancelled = false;
        let timerId: number | null = null;
        const resolveQueueStatusDelay = (status: CombinedQueueStatus) => {
            const hasActiveWork = status.totalPending > 0 || status.isProcessing || status.isPaused;
            if (isAppDocumentHidden())
                return hasActiveWork ? 8000 : 20000;
            return hasActiveWork ? 2000 : 8000;
        };
        const pollQueueStatus = () => {
            if (cancelled)
                return;
            logPerformanceEvent('sync-interval:queue-status', {}, 30000);
            const nextStatus = getCombinedQueueStatus();
            setQueueStatus(nextStatus);
            timerId = window.setTimeout(pollQueueStatus, resolveQueueStatusDelay(nextStatus));
        };
        pollQueueStatus();
        return () => {
            cancelled = true;
            if (timerId !== null)
                window.clearTimeout(timerId);
        };
    }, []);
    useEffect(() => {
        return void 0;
    }, []);
    useEffect(() => {
        const previous = lastSyncStatusRef.current;
        if (previous === syncStatus)
            return;
        lastSyncStatusRef.current = syncStatus;
        if (syncStatusNotificationTimerRef.current) {
            window.clearTimeout(syncStatusNotificationTimerRef.current);
        }
        const isEnglish = settings.language === 'english';
        syncStatusNotificationTimerRef.current = window.setTimeout(() => {
            if (syncStatus === 'syncing')
                return;
            if (syncStatus === 'ok') {
                if (!hasSyncOfflineAlertRef.current)
                    return;
                hasSyncOfflineAlertRef.current = false;
                if (!canEmitSystemNotification('sync-recovered', 60000))
                    return;
                pushNotification({
                    title: isEnglish ? 'Server Sync Recovered' : 'همگام‌سازی برقرار شد',
                    message: isEnglish ? 'Sync status is stable now.' : 'وضعیت همگام‌سازی اکنون پایدار است.',
                    level: 'success',
                    source: 'sync',
                    read: true
                });
                return;
            }
            if (!isNetworkOnline)
                return;
            if (!canEmitSystemNotification('sync-offline', SYSTEM_NOTIFICATION_COOLDOWN_MS))
                return;
            hasSyncOfflineAlertRef.current = true;
            pushNotification({
                title: isEnglish ? 'Sync Delay Detected' : 'تأخیر در همگام‌سازی',
                message: isEnglish
                    ? 'Sync is currently delayed. System will retry automatically.'
                    : 'همگام‌سازی فعلاً با تأخیر انجام می‌شود. سیستم به‌صورت خودکار دوباره تلاش می‌کند.',
                level: 'warning',
                source: 'sync'
            });
        }, SYNC_STATUS_STABILITY_MS);
        return () => {
            if (syncStatusNotificationTimerRef.current) {
                window.clearTimeout(syncStatusNotificationTimerRef.current);
            }
        };
    }, [syncStatus, isNetworkOnline, settings.language, pushNotification, canEmitSystemNotification]);
    useEffect(() => {
        let cancelled = false;
        let timerId: number | null = null;
        const scheduleErrorPoll = (delayMs = hiddenAwareDelay(10000, 30000)) => {
            timerId = window.setTimeout(pollSyncErrorState, delayMs);
        };
        const pollSyncErrorState = () => {
            if (cancelled)
                return;
            logPerformanceEvent('sync-interval:error-state', {}, 30000);
            const lastError = getSyncError();
            if (!lastError) {
                scheduleErrorPoll();
                return;
            }
            if (isTransientSyncErrorState(lastError)) {
                scheduleErrorPoll();
                return;
            }
            const errorKey = `${lastError.code}::${lastError.at}`;
            if (lastSyncErrorKeyRef.current === errorKey) {
                scheduleErrorPoll();
                return;
            }
            lastSyncErrorKeyRef.current = errorKey;
            const cooldown = lastError.code === 'DEVICE_UNTRUSTED' ? 45000 : SYSTEM_NOTIFICATION_COOLDOWN_MS;
            const throttleKey = `sync-error:${lastError.code}`;
            if (!canEmitSystemNotification(throttleKey, cooldown)) {
                scheduleErrorPoll();
                return;
            }
            const isEnglish = settings.language === 'english';
            pushNotification({
                title: isEnglish ? 'Server Alert' : 'هشدار سرور',
                message: `[${lastError.code}] ${formatSyncErrorMessage(lastError, isEnglish)}`,
                level: lastError.code === 'DEVICE_UNTRUSTED' ? 'error' : 'warning',
                source: lastError.code === 'DEVICE_UNTRUSTED' ? 'security' : 'sync'
            });
            scheduleErrorPoll();
        };
        scheduleErrorPoll(2500);
        return () => {
            cancelled = true;
            if (timerId !== null)
                window.clearTimeout(timerId);
        };
    }, [settings.language, pushNotification, canEmitSystemNotification]);
    useEffect(() => {
        const previous = lastHealthStatusRef.current;
        if (previous === healthSnapshot.status)
            return;
        lastHealthStatusRef.current = healthSnapshot.status;
        if (healthSnapshot.status === 'idle')
            return;
        if (healthStatusNotificationTimerRef.current) {
            window.clearTimeout(healthStatusNotificationTimerRef.current);
        }
        const isEnglish = settings.language === 'english';
        const level = healthSnapshot.status === 'healthy'
            ? 'success'
            : healthSnapshot.status === 'degraded'
                ? 'warning'
                : 'error';
        healthStatusNotificationTimerRef.current = window.setTimeout(() => {
            const isUnhealthy = healthSnapshot.status === 'degraded' || healthSnapshot.status === 'error';
            if (isUnhealthy) {
                if (!canEmitSystemNotification(`health-${healthSnapshot.status}`, SYSTEM_NOTIFICATION_COOLDOWN_MS))
                    return;
                hasHealthIssueAlertRef.current = true;
                const statusLabelFa = healthSnapshot.status === 'degraded' ? 'ضعیف' : 'خطا';
                pushNotification({
                    title: isEnglish ? 'Server Health Monitor' : 'مانیتور سلامت سرور',
                    message: healthSnapshot.lastIssue
                        ? localizeOperationalMessage(healthSnapshot.lastIssue, isEnglish)
                        : (isEnglish ? `Health status changed to ${healthSnapshot.status}.` : `وضعیت سلامت سرور به «${statusLabelFa}» تغییر کرد.`),
                    level,
                    source: 'system'
                });
                return;
            }
            if (!hasHealthIssueAlertRef.current)
                return;
            hasHealthIssueAlertRef.current = false;
            if (!canEmitSystemNotification('health-recovered', 60000))
                return;
            pushNotification({
                title: isEnglish ? 'Server Health Monitor' : 'مانیتور سلامت سرور',
                message: isEnglish ? 'Server health is stable now.' : 'سلامت سرور اکنون پایدار است.',
                level: 'success',
                source: 'system',
                read: true
            });
        }, HEALTH_STATUS_STABILITY_MS);
        return () => {
            if (healthStatusNotificationTimerRef.current) {
                window.clearTimeout(healthStatusNotificationTimerRef.current);
            }
        };
    }, [healthSnapshot.status, healthSnapshot.lastIssue, settings.language, pushNotification, canEmitSystemNotification]);
    useEffect(() => {
        const previous = lastOnlineStateRef.current;
        const previousReason = lastConnectivityReasonRef.current;
        lastOnlineStateRef.current = isNetworkOnline;
        lastConnectivityReasonRef.current = connectivityState.reason;
        if (previous === isNetworkOnline && previousReason === connectivityState.reason)
            return;
        if (networkNotificationTimerRef.current) {
            window.clearTimeout(networkNotificationTimerRef.current);
        }
        const isEnglish = settings.language === 'english';
        networkNotificationTimerRef.current = window.setTimeout(() => {
            if (isNetworkOnline) {
                if (!canEmitSystemNotification('network-online', 90000))
                    return;
                pushNotification({
                    title: isEnglish ? 'Network Restored' : 'اتصال برقرار شد',
                    message: isEnglish ? 'Connection restored. Sync continues automatically.' : 'اتصال شبکه برقرار شد. همگام‌سازی به‌صورت خودکار ادامه می‌یابد.',
                    level: 'success',
                    source: 'server',
                    read: true
                });
                return;
            }
            if (!canEmitSystemNotification('network-offline', SYSTEM_NOTIFICATION_COOLDOWN_MS))
                return;
            const offlineTitle = connectivityState.reason === 'browser_offline'
                ? (isEnglish ? 'Device Offline' : 'دستگاه آف?لاین است')
                : connectivityState.reason === 'backend_unreachable'
                    ? (isEnglish ? 'Backend Unreachable' : 'Backend در دسترس نیست')
                    : (isEnglish ? 'Server Unreachable' : 'سرور در دسترس نیست');
            const offlineMessage = connectivityState.reason === 'browser_offline'
                ? (isEnglish
                    ? 'This device is offline. Local changes stay pending.'
                    : 'این دستگاه آف?لاین است. تغییرات محلی در انتظار همگام‌سازی می‌مانند.')
                : connectivityState.reason === 'backend_unreachable'
                    ? (isEnglish
                        ? 'Backend is unreachable. App will keep local work queued.'
                        : 'Backend در دسترس نیست. کارهای محلی در صف? باقی می‌مانند.')
                    : (isEnglish
                        ? 'Supabase is unreachable. App will retry automatically.'
                        : 'Supabase در دسترس نیست. برنامه خودکار دوباره تلاش می‌کند.');
            pushNotification({
                title: offlineTitle,
                message: offlineMessage,
                level: connectivityState.reason === 'browser_offline' ? 'info' : 'warning',
                source: 'server',
                read: true
            });
        }, CONNECTION_EVENT_STABILITY_MS);
        return () => {
            if (networkNotificationTimerRef.current) {
                window.clearTimeout(networkNotificationTimerRef.current);
            }
        };
    }, [connectivityState.reason, isNetworkOnline, settings.language, pushNotification, canEmitSystemNotification]);
    useEffect(() => {
        const release = controlPlaneState?.appRelease || null;
        const isEnglish = settings.language === 'english';
        const isForcedUpdate = controlPlaneState?.lockdownMode === 'force_update';
        const isNewerRelease = Boolean(release && hasNewerPublishedRelease(release.version, runtimeVersion));
        if (!isForcedUpdate && !isNewerRelease) {
            lastReleaseNotificationKeyRef.current = '';
            return;
        }
        const notificationKey = [
            release?.id || 'control-release',
            release?.version || controlPlaneState?.minimumVersion || 'unknown',
            controlPlaneState?.lockdownMode || 'normal',
            runtimeVersion,
        ].join(':');
        if (lastReleaseNotificationKeyRef.current === notificationKey) {
            return;
        }
        lastReleaseNotificationKeyRef.current = notificationKey;
        const localizedChannel = getLocalizedReleaseChannelLabel(release?.channel, isEnglish);
        pushNotification({
            title: isForcedUpdate
                ? (isEnglish ? 'Required Update Available' : 'به‌روزرسانی اجباری موجود است')
                : (isEnglish ? 'New Version Published' : 'نسخه جدید منتشر شد'),
            message: isForcedUpdate
                ? (release
                    ? (isEnglish
                        ? `Version ${release.version} (${localizedChannel}) is required for this device. Install it from the update banner before continuing.`
                        : `نسخه ${release.version} (${localizedChannel}) برای این دستگاه اجباری شده است. پیش از ادامه کار، آن را از نوار بروزرسانی بالای برنامه نصب کنید.`)
                    : (isEnglish
                        ? `A required update is active. Install at least version ${controlPlaneState?.minimumVersion || 'latest'} before continuing.`
                        : `بروزرسانی اجباری ف?عال است. پیش از ادامه کار، دست‌کم نسخه ${controlPlaneState?.minimumVersion || 'جدید'} را نصب کنید.`))
                : (isEnglish
                    ? `Version ${release?.version} (${localizedChannel}) was published and is newer than your current version ${runtimeVersion}. Open the update banner to install it.`
                    : `نسخه ${release?.version} (${localizedChannel}) منتشر شده و از نسخه ف?علی شما ${runtimeVersion} جدیدتر است. برای نصب، نوار بروزرسانی بالای برنامه را باز کنید.`),
            level: isForcedUpdate ? 'warning' : 'info',
            source: 'server',
        });
        if (isForcedUpdate) {
            setIsNotificationCenterOpen(true);
        }
    }, [
        controlPlaneState?.appRelease,
        controlPlaneState?.lockdownMode,
        controlPlaneState?.minimumVersion,
        runtimeVersion,
        settings.language,
        pushNotification,
    ]);
    useEffect(() => {
        const release = controlPlaneState?.appRelease || null;
        const shouldExposeRelease = Boolean(release &&
            (controlPlaneState?.lockdownMode === 'force_update' || hasNewerPublishedRelease(release.version, runtimeVersion)));
        const promptKey = shouldExposeRelease || controlPlaneState?.lockdownMode === 'force_update'
            ? buildReleasePromptKey(release, controlPlaneState?.lockdownMode, controlPlaneState?.minimumVersion)
            : null;
        if (!promptKey) {
            setIsUpdatePromptOpen(false);
            setDismissedUpdatePromptKey(null);
            return;
        }
        if (controlPlaneState?.lockdownMode === 'force_update') {
            setDismissedUpdatePromptKey(null);
            setIsUpdatePromptOpen(true);
            return;
        }
        if (dismissedUpdatePromptKey === promptKey) {
            return;
        }
        setIsUpdatePromptOpen(true);
    }, [
        controlPlaneState?.appRelease,
        controlPlaneState?.lockdownMode,
        controlPlaneState?.minimumVersion,
        runtimeVersion,
        dismissedUpdatePromptKey,
    ]);
    const handlePersistError = useCallback((error: any) => {
        console.error("Save failed:", error);
        const msg = typeof error?.message === 'string' ? error.message : '';
        if (msg.includes('Integrity Fail')) {
            addToast(`خطا در ساختار معلومات: ${msg.replace('Integrity Fail:', '').trim()}`, "error");
            return;
        }
        if (msg.startsWith('CRITICAL: Persist Blocked. Integrity Check Failed:')) {
            addToast("خطا در یکپارچگی داده‌ها (Integrity). لطف?اً لاگ‌ها را ارسال کنید.", "error");
            return;
        }
        if (msg === 'PERSIST_WIPE_BLOCKED') {
            addToast("برای جلوگیری از حذف? ناخواسته، ذخیره‌سازی دادهٔ خالی متوقف? شد. لطف?اً برنامه را نبندید و گزارش لاگ را ارسال کنید.", "error");
            return;
        }
        if (msg === 'WRITE_VERIFY_FAILED') {
            addToast("خطای جدی در ذخیره‌سازی (تأیید نوشتن). برنامه تلاش کرد بازیابی کند. لطف?اً لاگ را ارسال کنید.", "error");
            return;
        }
        if (msg === 'IPC_INVALID_RESPONSE') {
            addToast("ارتباط داخلی برنامه (IPC) مشکل دارد. لطف?اً برنامه را ری‌استارت کنید و در صورت تکرار، لاگ را ارسال کنید.", "error");
            return;
        }
        if (msg === 'SYNC_STATE_NOT_HYDRATED') {
            addToast("Sync state is not ready yet. Please try again after the app finishes loading.", "error");
            return;
        }
        addToast("خطا در ذخیره‌سازی معلومات. لطف?اً دوباره تلاش کنید و برنامه را ف?وری نبندید.", "error");
    }, [addToast]);
    // --- Persistence Helper ---
    const persistData = async (updatedData: Partial<{
        medicines: Medicine[];
        customers: Customer[];
        invoices: Invoice[];
        expenses: Expense[];
        settings: AppSettings;
        suppliers: Supplier[];
        purchases: Purchase[];
        partners: Partner[];
        auditEvents: DomainAuditEntry[];
        stockMovements: StockMovement[];
        treasuryTransactions: TreasuryTransaction[];
        treasuryCashCounts: TreasuryCashCount[];
    }> = {}, options?: {
        guestAiIncrement?: boolean;
        forceSettingsStateUpdate?: boolean;
        warehouseOutbox?: {
            kind: WarehouseOutboxKind;
            payload: Record<string, unknown>;
        };
        allowWipe?: boolean;
        dropPendingSync?: boolean;
        forceCloudSync?: boolean;
        replaceCloudSnapshot?: boolean;
        deferWarehouseOutboxSync?: boolean;
    }): Promise<boolean> => {
        // PHASE 3: HYDRATION GUARD
        if (loading || hydrationError) {
            console.warn("Persist blocked: Hydration in progress or failed.");
            return false;
        }
        const isGuestSession = false;
        let previousSnapshot: FullData;
        try {
            previousSnapshot = sanitizeFullData({
                medicines: latestDataRef.current.medicines || [],
                customers: latestDataRef.current.customers || [],
                invoices: latestDataRef.current.invoices || [],
                expenses: latestDataRef.current.expenses || [],
                settings: latestDataRef.current.settings || INITIAL_SETTINGS,
                suppliers: latestDataRef.current.suppliers || [],
                purchases: latestDataRef.current.purchases || [],
                partners: latestDataRef.current.partners || [],
                auditEvents: latestDataRef.current.auditEvents || [],
                stockMovements: latestDataRef.current.stockMovements || [],
                treasuryTransactions: latestDataRef.current.treasuryTransactions || [],
                treasuryCashCounts: latestDataRef.current.treasuryCashCounts || [],
                version: Date.now(),
                updatedAt: new Date().toISOString()
            }) as FullData;
        }
        catch (error) {
            handlePersistError(error);
            return false;
        }
        const nowIso = new Date().toISOString();
        const nextVersion = Date.now();
        const baseSettings = (updatedData.settings || settings) as AppSettings;
        const policySettings = normalizeCommunitySettings({ ...baseSettings, updatedAt: nowIso });
        const currentData = latestDataRef.current;
        const currentMedicines = currentData.medicines || medicines;
        const manufacturerNormalization = canonicalizeMedicineManufacturers(updatedData.medicines || currentMedicines);
        const shouldUpdateMedicinesState = !!updatedData.medicines || manufacturerNormalization.changedCount > 0;
        const newData = {
            medicines: manufacturerNormalization.medicines,
            customers: updatedData.customers || currentData.customers || customers,
            invoices: updatedData.invoices || currentData.invoices || invoices,
            expenses: updatedData.expenses || currentData.expenses || expenses,
            settings: policySettings,
            suppliers: updatedData.suppliers || currentData.suppliers || suppliers,
            purchases: updatedData.purchases || currentData.purchases || purchases,
            partners: updatedData.partners || currentData.partners || partners,
            auditEvents: updatedData.auditEvents || currentData.auditEvents || auditEvents,
            stockMovements: updatedData.stockMovements || currentData.stockMovements || stockMovements,
            treasuryTransactions: updatedData.treasuryTransactions || currentData.treasuryTransactions || treasuryTransactions,
            treasuryCashCounts: updatedData.treasuryCashCounts || currentData.treasuryCashCounts || treasuryCashCounts,
            version: nextVersion, // Always bump version on local mutation to avoid stale snapshot comparisons
            updatedAt: nowIso
        };
        let sanitized;
        try {
            sanitized = sanitizeFullData(newData) || newData;
        }
        catch (error) {
            handlePersistError(error);
            return false;
        }
        if (user) {
            try {
                const changedSliceKeys = Array.from(new Set([
                    ...Object.keys(updatedData || {}),
                    "settings",
                    ...(shouldUpdateMedicinesState ? ["medicines"] : [])
                ]));
                await saveToDisk(sanitized, user.id, {
                    allowWipe: options?.allowWipe === true,
                    alreadySanitized: true,
                    changedSlices: changedSliceKeys,
                    mutationId: createUniqueId("local")
                });
            }
            catch (error) {
                handlePersistError(error);
                return false;
            }
        }
        latestDataRef.current = {
            medicines: sanitized.medicines,
            customers: sanitized.customers,
            invoices: sanitized.invoices,
            expenses: sanitized.expenses,
            settings: sanitized.settings,
            suppliers: sanitized.suppliers,
            purchases: sanitized.purchases,
            partners: sanitized.partners || [],
            auditEvents: sanitized.auditEvents || latestDataRef.current.auditEvents || [],
            stockMovements: sanitized.stockMovements || latestDataRef.current.stockMovements || [],
            treasuryTransactions: sanitized.treasuryTransactions || latestDataRef.current.treasuryTransactions || [],
            treasuryCashCounts: sanitized.treasuryCashCounts || latestDataRef.current.treasuryCashCounts || [],
            version: sanitized.version || nextVersion,
            updatedAt: sanitized.updatedAt || nowIso
        };
        if (shouldUpdateMedicinesState)
            setMedicines(sanitized.medicines);
        if (updatedData.customers)
            setCustomers(sanitized.customers);
        if (updatedData.invoices)
            setInvoices(sanitized.invoices);
        if (updatedData.expenses)
            setExpenses(sanitized.expenses);
        if (updatedData.settings || false || options?.forceSettingsStateUpdate)
            setSettings(sanitized.settings);
        if (updatedData.suppliers)
            setSuppliers(sanitized.suppliers);
        if (updatedData.purchases)
            setPurchases(sanitized.purchases);
        if (updatedData.partners)
            setPartners(sanitized.partners || []);
        if (updatedData.auditEvents)
            setAuditEvents(sanitized.auditEvents || []);
        if (updatedData.stockMovements)
            setStockMovements(sanitized.stockMovements || []);
        if (updatedData.treasuryTransactions)
            setTreasuryTransactions(sanitized.treasuryTransactions || []);
        if (updatedData.treasuryCashCounts)
            setTreasuryCashCounts(sanitized.treasuryCashCounts || []);
        return true;
    };
    const persistWarehouseMutation = async (updatedData: Parameters<typeof persistData>[0], kind: WarehouseOutboxKind, payload: Record<string, unknown>, options?: Omit<NonNullable<Parameters<typeof persistData>[1]>, 'warehouseOutbox'>): Promise<boolean> => {
        return persistData(updatedData, {
            ...(options || {}),
            warehouseOutbox: { kind, payload }
        });
    };
    // NEW: Audit Trail sink is append-only and capped to avoid destabilizing existing persistence.
    const commitDomainAuditEvents = (entries: DomainAuditEntry[]) => {
        if (!entries.length)
            return;
        const nextAuditEvents = [
            ...(latestDataRef.current.auditEvents || []),
            ...entries
        ].slice(-1200);
        void persistData({
            auditEvents: nextAuditEvents
        });
    };
    const applyFreshFullDataSnapshot = useCallback((snapshot: FullData): FullData => {
        const sanitizedBase = sanitizeFullData(snapshot) as FullData;
        const sanitized = sanitizeFullData(sanitizedBase) as FullData;
        latestDataRef.current = {
            medicines: sanitized.medicines || [],
            customers: sanitized.customers || [],
            invoices: sanitized.invoices || [],
            expenses: sanitized.expenses || [],
            settings: sanitized.settings || INITIAL_SETTINGS,
            suppliers: sanitized.suppliers || [],
            purchases: sanitized.purchases || [],
            partners: sanitized.partners || [],
            auditEvents: sanitized.auditEvents || [],
            stockMovements: sanitized.stockMovements || [],
            treasuryTransactions: sanitized.treasuryTransactions || latestDataRef.current.treasuryTransactions || [],
            treasuryCashCounts: sanitized.treasuryCashCounts || latestDataRef.current.treasuryCashCounts || [],
            version: sanitized.version || 0,
            updatedAt: sanitized.updatedAt
        };
        setMedicines(sanitized.medicines || []);
        setCustomers(sanitized.customers || []);
        setInvoices(sanitized.invoices || []);
        setExpenses(sanitized.expenses || []);
        setSettings(sanitized.settings || INITIAL_SETTINGS);
        setSuppliers(sanitized.suppliers || []);
        setPurchases(sanitized.purchases || []);
        setPartners(sanitized.partners || []);
        setAuditEvents(sanitized.auditEvents || []);
        setStockMovements(sanitized.stockMovements || []);
        // Guarded, unlike the wholesale setters above: this applies warehouse-domain snapshots, which
        // carry no treasury slice at all. An unconditional `|| []` here would empty the cash ledger on
        // every domain refresh. Absent = "this snapshot says nothing about treasury", not "empty".
        if (sanitized.treasuryTransactions)
            setTreasuryTransactions(sanitized.treasuryTransactions);
        if (sanitized.treasuryCashCounts)
            setTreasuryCashCounts(sanitized.treasuryCashCounts);
        return sanitized;
    }, []);
    const refreshLatestDataFromDiskForStockWrite = useCallback(async (action: string): Promise<boolean> => {
        if (!user?.id)
            return true;
        try {
            const diskSnapshot = await loadFromDisk(user.id);
            if (!diskSnapshot)
                return true;
            const sanitizedDiskSnapshot = sanitizeFullData(diskSnapshot) as FullData;
            if (!sanitizedDiskSnapshot)
                return true;
            const diskFreshness = getAppSnapshotFreshnessMs(sanitizedDiskSnapshot);
            const currentFreshness = getAppSnapshotFreshnessMs(latestDataRef.current);
            if (diskFreshness > currentFreshness) {
                applyFreshFullDataSnapshot(sanitizedDiskSnapshot);
                Logger.info('STORAGE', 'Refreshed local source of truth before stock write.', {
                    action,
                    diskFreshness,
                    currentFreshness,
                });
            }
            return true;
        }
        catch (error) {
            handlePersistError(error);
            addToast('Stock change was blocked because the latest local data could not be validated.', 'error');
            Logger.error('STORAGE', 'Blocked stock write after failed source-of-truth refresh.', error, { action });
            return false;
        }
    }, [addToast, applyFreshFullDataSnapshot, handlePersistError, settings, user?.id]);
    useEffect(() => {
        {
            return undefined;
        }
    }, [controlPlaneState?.syncPaused, user]);
    const recordGuestAiSuccess = useCallback(() => {
        return;
    }, [false, settings]);
    useEffect(() => {
        if (loading)
            return undefined;
        return undefined;
    }, [isCloudSyncAllowed, loading, user]);
    const logSyncStage = (stage: 'BOOTSTRAP' | 'INITIAL_PULL_OR_PUSH' | 'SYNC_LOOP', message: string) => {
        if (import.meta.env.DEV) {
            console.log(`[SYNC][${stage}] ${message}`);
        }
    };
    const performStartupSequence = async (profile: UserProfile) => {
        setLoading(true);
        setHydrationError(null); // Reset error
        logSyncStage('BOOTSTRAP', 'started');
        try {
            if (!window.electronAPI && !browserLocalFirstWarningShownRef.current) {
                browserLocalFirstWarningShownRef.current = true;
                addToast(settings.language === 'english'
                    ? 'Reliable local-first persistence is officially guaranteed only in the desktop app. Browser localhost remains best-effort for development.'
                    : 'ذخیره‌سازی مطمئن محلی فقط در نسخه دسکتاپ تضمین می‌شود. اجرای مرورگری (localhost) فقط برای توسعه است.', 'warning');
            }
            {
                const storedGuestData = await loadFromDisk(profile.id);
                const storedGuestLanguage = storedGuestData?.settings?.language || settings.language || INITIAL_SETTINGS.language;
                const emptyGuestWorkspace = createEmptyGuestWorkspace(storedGuestLanguage);
                const storedGuestRecordCount = (storedGuestData?.medicines?.length || 0) +
                    (storedGuestData?.customers?.length || 0) +
                    (storedGuestData?.invoices?.length || 0) +
                    (storedGuestData?.expenses?.length || 0) +
                    (storedGuestData?.suppliers?.length || 0) +
                    (storedGuestData?.purchases?.length || 0);
                let guestData = storedGuestData
                    ? {
                        ...emptyGuestWorkspace,
                        ...storedGuestData,
                        settings: {
                            ...emptyGuestWorkspace.settings,
                            ...(storedGuestData.settings || {})
                        }
                    }
                    : emptyGuestWorkspace;
                const guestExpired = false;
                let guestInfoMessage: string | null = null;
                {
                    guestData.settings = normalizeCommunitySettings(guestData.settings);
                }
                const guestManufacturerNormalization = canonicalizeMedicineManufacturers(guestData.medicines || []);
                if (guestManufacturerNormalization.changedCount > 0) {
                    guestData = {
                        ...guestData,
                        medicines: guestManufacturerNormalization.medicines
                    };
                }
                const guestIntegrityRepair = repairCriticalDataIntegritySnapshot(guestData);
                if (guestIntegrityRepair.repaired) {
                    guestData = guestIntegrityRepair.data;
                    Logger.warn('APP', 'Auto-repaired guest data integrity issues', {
                        source: 'guest startup',
                        repairedBatchCount: guestIntegrityRepair.repairedBatchCount,
                        beforeCritical: guestIntegrityRepair.reportBefore.summary.critical,
                        afterCritical: guestIntegrityRepair.reportAfter.summary.critical,
                        issueTypes: guestIntegrityRepair.repairedIssueTypes
                    });
                }
                await saveToDisk(guestData, profile.id, undefined);
                latestDataRef.current = {
                    medicines: guestData.medicines || [],
                    customers: guestData.customers || [],
                    invoices: guestData.invoices || [],
                    expenses: guestData.expenses || [],
                    settings: guestData.settings || emptyGuestWorkspace.settings,
                    suppliers: guestData.suppliers || [],
                    purchases: guestData.purchases || [],
                    partners: guestData.partners || [],
                    auditEvents: guestData.auditEvents || [],
                    stockMovements: guestData.stockMovements || [],
                    // A guest workspace is its own scope and starts empty. Unconditional, like the
                    // hydration path: a guest must never see the signed-in owner's cash ledger.
                    treasuryTransactions: guestData.treasuryTransactions || [],
                    treasuryCashCounts: guestData.treasuryCashCounts || [],
                    version: guestData.version || 0,
                    updatedAt: guestData.updatedAt
                };
                setMedicines(guestData.medicines || []);
                setCustomers(guestData.customers || []);
                setInvoices(guestData.invoices || []);
                setExpenses(guestData.expenses || []);
                setSettings(guestData.settings || emptyGuestWorkspace.settings);
                setSuppliers(guestData.suppliers || []);
                setPurchases(guestData.purchases || []);
                setPartners(guestData.partners || []);
                setAuditEvents(guestData.auditEvents || []);
                setStockMovements(guestData.stockMovements || []);
                setTreasuryTransactions(guestData.treasuryTransactions || []);
                setTreasuryCashCounts(guestData.treasuryCashCounts || []);
                evaluateDataIntegrity(guestData, 'guest startup', { silentWhenClean: true });
                setSalesDraft(createInitialDraft(guestData.settings || emptyGuestWorkspace.settings));
                setActiveAppUser(null);
                setIsLocked(false);
                setSyncStatus('offline');
                setLoading(false);
                if (guestInfoMessage) {
                    addToast(guestInfoMessage, 'info');
                }
                if (guestManufacturerNormalization.changedCount > 0) {
                    addToast(getManufacturerNormalizationMessage(guestManufacturerNormalization.changedCount, guestData.settings?.language || emptyGuestWorkspace.settings.language), 'info');
                }
                return;
            }
        }
        catch (error: any) {
            console.error("Startup failed:", error);
            // PHASE 3: Error Handling
            const rawMsg = typeof error?.message === 'string' ? error.message : '';
            const tr = (en: string, fa: string) => settings.language === 'english' ? en : fa;
            let friendly = rawMsg || tr('Failed to load your data.', 'خطا در بارگذاری معلومات.');
            if (rawMsg === 'IPC_INVALID_RESPONSE') {
                friendly = tr('The storage service returned an invalid response. Please restart the app.', 'پاسخ نامعتبر از سرویس ذخیره‌سازی دریافت شد. لطفاً برنامه را ری‌استارت کنید.');
            }
            else if (rawMsg === 'CORRUPT_LOCAL_DATA') {
                friendly = tr('The local data file is damaged. Please restore a backup or export the support log.', 'فایل ذخیره‌سازی محلی خراب است و قابل بازیابی نیست. لطفاً از فایل پشتیبان/لاگ استفاده کنید.');
            }
            else if (rawMsg === 'PERSIST_WIPE_BLOCKED') {
                friendly = tr('Loading was stopped to prevent accidental data loss. Please export the support log.', 'به‌دلیل تشخیص خطر حذف ناخواسته، بارگذاری/ذخیره‌سازی متوقف شد. لطفاً لاگ را ارسال کنید.');
            }
            else if (rawMsg.includes('No handler registered')) {
                friendly = tr('The desktop storage service is unavailable. Please close and reopen the app.', 'سرویس داخلی Electron فعال نیست (IPC). لطفاً برنامه را کامل بسته و دوباره باز کنید.');
            }
            setHydrationError(friendly);
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        let isUnmounted = false;
        const bootstrap = async () => {
            const storedUser = localStorage.getItem(USER_CACHE_KEY);
            let cachedProfile: UserProfile | null = null;
            if (storedUser) {
                try {
                    cachedProfile = JSON.parse(storedUser) as UserProfile;
                }
                catch {
                    localStorage.removeItem(USER_CACHE_KEY);
                }
            }
            const pendingGuestMigration = null;
            const authResolution = { profile: { ...COMMUNITY_PROFILE }, clearCachedProfile: false };
            if (authResolution.clearCachedProfile) {
                localStorage.removeItem(USER_CACHE_KEY);
            }
            const profile = authResolution.profile;
            if (!profile) {
                setUser(null);
                setLoading(false);
                return;
            }
            if (isUnmounted)
                return;
            setUser(profile);
            setIsGuestUpgradeAuthOpen(false);
            setIsGuestUpgradePromptOpen(false);
            performStartupSequence(profile);
        };
        void bootstrap();
        return () => {
            isUnmounted = true;
        };
    }, []);
    const resetToLoggedOutState = (profile: UserProfile | null) => {
        handleCancelGuestUpgrade();
        setUser(null);
        setActiveAppUser(null);
        localStorage.removeItem(USER_CACHE_KEY);
        if (adminMessageSubscriptionRef.current) {
            adminMessageSubscriptionRef.current = null;
        }
        adminMessageSeenIdsRef.current.clear();
        setSyncStatus('offline');
        setMedicines([]);
        setCustomers([]);
        setInvoices([]);
        setExpenses([]);
        setSuppliers([]);
        setPurchases([]);
        setPartners([]);
        setAuditEvents([]);
        // Treasury: the slice this stage moved into FullData. Without this the next account to sign
        // in on the device inherits the previous one's cash ledger in memory — the leak, reopened at
        // the last step.
        setTreasuryTransactions([]);
        setTreasuryCashCounts([]);
        // stockMovements was ALSO never cleared here — an adjacent, pre-existing bug of exactly the
        // same shape, found while fixing treasury. It leaks the previous user's stock ledger into the
        // next session in memory, and (unlike treasury) it was already a persisted, user-scoped slice,
        // so the stale rows could be written back into the NEW user's snapshot by any subsequent
        // persistData. Fixed here rather than left as a known hole.
        setStockMovements([]);
        setSettings(INITIAL_SETTINGS);
        setSalesDraft(createInitialDraft(INITIAL_SETTINGS));
        setRequestedSettingsTab(null);
        setRequestedInventoryFilter(null);
        setRequestedPurchasesTab(null);
        setRequestedPurchaseContext(null);
        setRequestedPurchaseDraftFocus(null);
        setIsLocked(false);
    };
    const handleLoginSuccess = (profile: UserProfile) => {
        setIsGuestUpgradePromptOpen(false);
        setUser(profile);
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(profile));
        setActiveAppUser(null);
        setIsLocked(false);
        performStartupSequence(profile);
    };
    const handleLogout = () => {
        resetToLoggedOutState(user);
    };
    const handleAppUserUnlock = (appUser: AppUser) => {
        if (settings.teamMode) {
            setActiveAppUser(appUser);
        }
        else {
            setActiveAppUser(null);
        }
        setIsLocked(false);
    };
    const handleLocalQuickLock = () => {
        if (settings.teamMode) {
            setActiveAppUser(null);
            setIsLocked(true);
        }
    };
    const refreshRuntimeAuthFromServer = useCallback(async () => {
        if (loading)
            return;
        return;
    }, [addToast, connectivityState.effectiveOnline, loading, settings.language, user]);
    useEffect(() => {
        const previous = previousAuthRefreshOnlineRef.current;
        previousAuthRefreshOnlineRef.current = isNetworkOnline;
        if (previous === isNetworkOnline)
            return;
        if (!isNetworkOnline)
            return;
        void refreshRuntimeAuthFromServer();
    }, [isNetworkOnline, refreshRuntimeAuthFromServer]);
    // --- Action Handlers ---
    const persistMedicineRecord = async (newMed: Medicine) => {
        const currentMedicines = latestDataRef.current.medicines || [];
        const updated = [...currentMedicines, newMed];
        if (!(await persistData({ medicines: updated })))
            return false;
        addToast("دوای جدید اضاف?ه شد", "success");
        return true;
    };
    const createMedicineRecord = async (med: Omit<Medicine, 'id'>): Promise<Medicine | null> => {
        if (!ensureWritable('addMedicine'))
            return null;
        const trimmedName = typeof med.name === 'string' ? med.name.trim() : '';
        if (!trimmedName) {
            addToast("نام دوا اجباری است.", "error");
            return null;
        }
        const nowIso = new Date().toISOString();
        const newMed = {
            ...med,
            name: trimmedName,
            id: (med as Partial<Medicine>).id || createUniqueId('med'),
            updatedAt: (med as Partial<Medicine>).updatedAt || nowIso
        };
        const success = await persistMedicineRecord(newMed);
        return success ? newMed : null;
    };
    const addMedicine = async (med: Omit<Medicine, 'id'>): Promise<boolean> => {
        return Boolean(await createMedicineRecord(med));
    };
    const addMedicineWithProcurementDraft = async (payload: MedicineProcurementDraftRequest): Promise<boolean> => {
        const supplier = (latestDataRef.current.suppliers || []).find((entry) => entry.id === payload.supplierId && !entry.isDeleted);
        if (!supplier) {
            addToast("تأمین‌کننده انتخاب‌شده برای ساخت پیش‌نویس خرید پیدا نشد", "error");
            return false;
        }
        const createdMedicine = await createMedicineRecord(payload.medicine);
        if (!createdMedicine)
            return false;
        const currentPurchases = latestDataRef.current.purchases || [];
        const normalizedPurchases = currentPurchases.map((purchase) => normalizePurchaseRecord(purchase));
        const targetPurchaseMode = payload.targetPurchaseMode || 'open_supplier_draft';
        const explicitTarget = payload.targetPurchaseId
            ? normalizedPurchases.find((purchase) => (purchase.id === payload.targetPurchaseId
                && !purchase.isDeleted
                && purchase.supplierId === payload.supplierId
                && purchase.workflowStatus !== 'cancelled'
                && !purchase.shortClosedAt))
            : undefined;
        const existingDraft = targetPurchaseMode === 'new_invoice'
            ? undefined
            : explicitTarget || normalizedPurchases
                .filter((purchase) => (!purchase.isDeleted
                && purchase.supplierId === payload.supplierId
                && purchase.workflowStatus !== 'cancelled'
                && !purchase.shortClosedAt
                && (purchase.workflowStatus === 'draft'
                    || (purchase.notes || '').includes('Created from medicine entry'))))
                .sort((a, b) => new Date(b.updatedAt || b.createdAt || b.date).getTime() - new Date(a.updatedAt || a.createdAt || a.date).getTime())[0];
        const draftOwnerPartnerId = payload.purchaseLineDraft.ownerPartnerId || payload.purchaseLineDraft.partnerId || undefined;
        const draftStockEntryType: StockEntryType | undefined = draftOwnerPartnerId
            ? (payload.purchaseLineDraft.stockEntryType === 'partner_consignment' ? 'partner_consignment' : 'partner_goods_capital')
            : payload.purchaseLineDraft.stockEntryType;
        const draftOwnershipType: BatchOwnershipType | undefined = draftOwnerPartnerId
            ? (draftStockEntryType === 'partner_consignment' ? 'consignment' : 'partner')
            : payload.purchaseLineDraft.ownershipType;
        const draftLine = {
            lineId: createUniqueId('pline'),
            medicineId: createdMedicine.id,
            medicineName: createdMedicine.name,
            barcode: payload.purchaseLineDraft.barcode || createdMedicine.barcode || '',
            unit: payload.purchaseLineDraft.unit || createdMedicine.unit || '',
            baseQuantity: payload.purchaseLineDraft.baseQuantity ?? payload.purchaseLineDraft.quantity,
            purchaseUnitName: payload.purchaseLineDraft.purchaseUnitName || payload.purchaseLineDraft.unit || createdMedicine.unit || '',
            purchaseUnitConversionFactor: payload.purchaseLineDraft.purchaseUnitConversionFactor || 1,
            baseUnit: payload.purchaseLineDraft.baseUnit || createdMedicine.baseUnit || createdMedicine.unit || '',
            batchNumber: payload.purchaseLineDraft.batchNumber,
            expiryDate: payload.purchaseLineDraft.expiryDate,
            quantity: payload.purchaseLineDraft.quantity,
            purchasePrice: payload.purchaseLineDraft.purchasePrice,
            partnerId: draftOwnerPartnerId,
            ownerPartnerId: draftOwnerPartnerId,
            stockEntryType: draftStockEntryType,
            ownershipType: draftOwnershipType,
            agreedPartnerValue: payload.purchaseLineDraft.agreedPartnerValue,
            suggestedSalePrice: payload.purchaseLineDraft.suggestedSalePrice,
            sourceDocumentNumber: payload.purchaseLineDraft.sourceDocumentNumber || payload.requestedInvoiceNumber,
            notes: payload.purchaseLineDraft.notes,
            lineTotal: payload.purchaseLineDraft.quantity * payload.purchaseLineDraft.purchasePrice
        };
        const targetPurchaseId = existingDraft?.id || createUniqueId('pur');
        const nowIso = new Date().toISOString();
        const orderedBaseQuantity = Math.max(0, draftLine.baseQuantity ?? draftLine.quantity);
        const requestedReceiptQuantity = Math.max(0, payload.quickReceipt?.mode === 'all'
            ? orderedBaseQuantity
            : payload.quickReceipt?.mode === 'partial'
                ? Math.min(payload.quickReceipt.quantity || 0, orderedBaseQuantity)
                : 0);
        const buildQuickReceipt = (purchaseItemIndex: number): PurchaseReceipt | null => {
            if (requestedReceiptQuantity <= 0)
                return null;
            return {
                id: createUniqueId('receipt'),
                date: payload.quickReceipt?.date || nowIso,
                note: payload.quickReceipt?.note,
                supplierLiabilityImpact: true,
                items: [{
                        lineId: draftLine.lineId,
                        medicineId: createdMedicine.id,
                        purchaseItemIndex,
                        batchNumber: draftLine.batchNumber,
                        expiryDate: draftLine.expiryDate,
                        quantity: requestedReceiptQuantity,
                        baseQuantity: requestedReceiptQuantity,
                        purchaseUnitName: draftLine.purchaseUnitName,
                        purchaseUnitConversionFactor: draftLine.purchaseUnitConversionFactor,
                        baseUnit: draftLine.baseUnit,
                        purchasePrice: draftLine.purchasePrice,
                        partnerId: draftLine.partnerId,
                        ownerPartnerId: draftLine.ownerPartnerId,
                        stockEntryType: draftLine.stockEntryType,
                        ownershipType: draftLine.ownershipType,
                        agreedPartnerValue: draftLine.agreedPartnerValue,
                        suggestedSalePrice: draftLine.suggestedSalePrice,
                        sourceDocumentNumber: draftLine.sourceDocumentNumber,
                        supplierId: payload.supplierId
                    }]
            };
        };
        if (existingDraft) {
            const { id: _existingDraftId, ...existingDraftWithoutId } = existingDraft;
            const quickReceipt = buildQuickReceipt(existingDraft.items.length);
            const nextItems = [...existingDraft.items, draftLine];
            const subtotalAmount = calculatePurchaseSubtotal(nextItems);
            const totalAmount = Math.max(0, subtotalAmount
                - (existingDraft.discountAmount || 0)
                + (existingDraft.taxAmount || 0)
                + (existingDraft.shippingAmount || 0)
                + (existingDraft.extraChargesAmount || 0));
            const paidAmount = existingDraft.paidAmount || 0;
            const remainingAmount = Math.max(0, totalAmount - paidAmount);
            const paymentStatus = resolvePurchasePaymentStatus(totalAmount, paidAmount);
            const nextReceipts = quickReceipt ? [...(existingDraft.receipts || []), quickReceipt] : (existingDraft.receipts || []);
            const hasReceivedStock = getPurchaseReceivedQuantity({
                ...existingDraft,
                items: nextItems,
                receipts: nextReceipts,
                workflowStatus: 'received',
                inventoryCommitted: true
            }) > 0;
            const nextWorkflowStatus = hasReceivedStock ? 'received' : existingDraft.workflowStatus;
            const updated = await updatePurchase(existingDraft.id, {
                ...existingDraftWithoutId,
                supplierId: existingDraft.supplierId,
                items: nextItems,
                subtotalAmount,
                totalAmount,
                paidAmount,
                remainingAmount,
                paymentStatus,
                workflowStatus: nextWorkflowStatus,
                status: resolvePurchaseStatus(nextWorkflowStatus, paymentStatus),
                receipts: nextReceipts,
                inventoryCommitted: hasReceivedStock,
                receivedAt: quickReceipt?.date || existingDraft.receivedAt,
            }, []);
            if (updated === false) {
                return false;
            }
        }
        else {
            const subtotalAmount = calculatePurchaseSubtotal([draftLine]);
            const totalAmount = subtotalAmount;
            const quickReceipt = buildQuickReceipt(0);
            const nextWorkflowStatus = quickReceipt ? 'received' : 'draft';
            const draftPurchase = normalizePurchaseRecord({
                id: targetPurchaseId,
                supplierId: payload.supplierId,
                partnerId: draftLine.ownerPartnerId || draftLine.partnerId,
                stockEntryType: draftLine.stockEntryType,
                ownershipType: draftLine.ownershipType,
                invoiceNumber: (payload.requestedInvoiceNumber || '').trim(),
                date: nowIso.split('T')[0],
                dueDate: undefined,
                items: [draftLine],
                subtotalAmount,
                discountAmount: 0,
                taxAmount: 0,
                shippingAmount: 0,
                extraChargesAmount: 0,
                totalAmount,
                paidAmount: 0,
                remainingAmount: totalAmount,
                paymentMethod: 'credit',
                paymentStatus: 'unpaid',
                workflowStatus: nextWorkflowStatus,
                status: resolvePurchaseStatus(nextWorkflowStatus, 'unpaid'),
                destinationWarehouse: tr('Main warehouse', 'گدام اصلی'),
                notes: settings.language === 'english' ? 'Created from medicine entry' : 'ایجادشده از ثبت دارو',
                payments: [],
                receipts: quickReceipt ? [quickReceipt] : [],
                vendorCredits: [],
                inventoryCommitted: Boolean(quickReceipt),
                receivedAt: quickReceipt?.date,
            });
            const created = await addPurchase(draftPurchase as Omit<Purchase, 'id'>, []);
            if (created === false) {
                return false;
            }
        }
        addToast(requestedReceiptQuantity > 0
            ? "دوا ثبت شد، ف?اکتور تأمین‌کننده به‌روز شد و مقدار رسیده به موجودی رف?ت"
            : "دوا ثبت شد و در ف?اکتور تأمین‌کننده نگه داشته شد", "success");
        return true;
    };
    const updateMedicine = async (id: string, data: Partial<Medicine>, syncTargets?: InventoryLinkedSyncTargets) => {
        if (!ensureWritable('updateMedicine'))
            return;
        const currentMedicines = latestDataRef.current.medicines || [];
        const currentPurchases = latestDataRef.current.purchases || [];
        const effectiveSyncTargets = resolveInventoryLinkedSyncTargets(latestDataRef.current.settings || settings, syncTargets);
        const nowIso = new Date().toISOString();
        const updated = currentMedicines.map(m => m.id === id ? { ...m, ...data, updatedAt: nowIso } : m);
        const updatedMedicine = updated.find((medicine) => medicine.id === id) || null;
        const syncedPurchases = effectiveSyncTargets.purchases
            ? syncMedicineDetailsIntoPurchases(currentPurchases, updatedMedicine, nowIso)
            : currentPurchases;
        await persistData({ medicines: updated, purchases: syncedPurchases });
    };
    const updateBatch = async (medId: string, batchId: string, batchData: Partial<Batch>, syncTargets?: InventoryLinkedSyncTargets) => {
        if (!ensureWritable('updateBatch'))
            return;
        if (!(await refreshLatestDataFromDiskForStockWrite('updateBatch')))
            return;
        const currentMedicines = latestDataRef.current.medicines || [];
        const currentPurchases = latestDataRef.current.purchases || [];
        const currentSuppliers = latestDataRef.current.suppliers || [];
        const currentStockMovements = latestDataRef.current.stockMovements || [];
        const effectiveSyncTargets = resolveInventoryLinkedSyncTargets(latestDataRef.current.settings || settings, syncTargets);
        const existingBatch = currentMedicines.find((medicine) => medicine.id === medId)?.batches.find((batch) => batch.id === batchId) || null;
        const nowIso = new Date().toISOString();
        const effectiveBatchData = existingBatch?.purchaseId && batchData.quantity !== undefined && batchData.receivedQuantity === undefined
            ? { ...batchData, receivedQuantity: batchData.quantity }
            : batchData;
        const nextBatchSnapshot: Batch | null = existingBatch
            ? {
                ...existingBatch,
                ...effectiveBatchData,
                lastMovementAt: effectiveBatchData.lastMovementAt || nowIso
            }
            : null;
        const quantityAdjustmentRequested = !!existingBatch && effectiveBatchData.quantity !== undefined
            && Math.abs(toSafeNumber(effectiveBatchData.quantity) - toSafeNumber(existingBatch.quantity)) > 1e-6;
        let stockAdjustedMedicines = currentMedicines;
        let updatedStockMovements = currentStockMovements;
        if (quantityAdjustmentRequested && existingBatch) {
            const quantityDelta = toSafeNumber(effectiveBatchData.quantity) - toSafeNumber(existingBatch.quantity);
            const movementDrafts: StockMovementDraft[] = [{
                    medicineId: medId,
                    batchId,
                    type: 'manual_adjustment',
                    quantityBaseUnit: quantityDelta,
                    referenceType: 'batch_adjustment',
                    referenceId: batchId,
                    idempotencyKey: `batch-adjustment:${batchId}:${nowIso}`,
                    metadata: {
                        previousQuantity: existingBatch.quantity,
                        nextQuantity: effectiveBatchData.quantity
                    },
                    history: {
                        action: 'manual_adjustment',
                        details: `Batch quantity adjusted from ${existingBatch.quantity} to ${effectiveBatchData.quantity}`
                    }
                }];
            try {
                const stockTransaction = applyInventoryTransaction({
                    medicines: currentMedicines,
                    stockMovements: currentStockMovements,
                    movements: movementDrafts,
                    createdAt: nowIso
                });
                stockAdjustedMedicines = stockTransaction.medicines;
                updatedStockMovements = stockTransaction.stockMovements;
            }
            catch (error) {
                addToast(getInventoryTransactionMessage(error, (latestDataRef.current.settings || settings).language === 'english'), "error");
                return;
            }
        }
        const directBatchData = quantityAdjustmentRequested
            ? (({ quantity: _quantity, ...rest }) => rest)(effectiveBatchData)
            : effectiveBatchData;
        const updated = stockAdjustedMedicines.map(m => {
            if (m.id !== medId)
                return m;
            const updatedBatches = m.batches.map(b => b.id === batchId ? { ...b, ...directBatchData, lastMovementAt: effectiveBatchData.lastMovementAt || nowIso } : b);
            return { ...m, batches: updatedBatches, updatedAt: nowIso };
        });
        const stockMovementUpdate = quantityAdjustmentRequested ? { stockMovements: updatedStockMovements } : {};
        const updatedMedicine = updated.find((medicine) => medicine.id === medId) || null;
        const shouldSyncLinkedPurchases = effectiveSyncTargets.purchases || effectiveSyncTargets.partnerships;
        const syncedPurchases = shouldSyncLinkedPurchases
            ? syncBatchDetailsIntoPurchases(currentPurchases, updatedMedicine, nextBatchSnapshot, nowIso, effectiveSyncTargets)
            : currentPurchases;
        const affectedPurchaseIds = effectiveSyncTargets.purchases && nextBatchSnapshot?.purchaseId ? [nextBatchSnapshot.purchaseId] : [];
        const syncedSuppliers = affectedPurchaseIds.length
            ? rebuildSuppliersForSyncedPurchases(currentSuppliers, currentPurchases, syncedPurchases, affectedPurchaseIds, nowIso)
            : currentSuppliers;
        const auditEntry = existingBatch && nextBatchSnapshot
            ? createDomainAuditEntry({
                action: 'batch.updated',
                entityType: 'batch',
                entityId: batchId,
                beforeSummary: summarizeBatchState(existingBatch),
                afterSummary: summarizeBatchState(nextBatchSnapshot),
                note: `Batch for medicine ${medId} updated`
            })
            : null;
        const committed = await persistData({ medicines: updated, purchases: syncedPurchases, suppliers: syncedSuppliers, ...stockMovementUpdate });
        if (!committed)
            return;
        if (auditEntry)
            commitDomainAuditEvents([auditEntry]);
    };
    const recordStockWaste = async (payload: {
        medicineId: string;
        batchId: string;
        quantity: number;
        reason: 'expired' | 'damaged' | 'lost' | 'internal_use';
        description?: string;
        costPerUnit: number;
        idempotencyKey: string;
    }): Promise<boolean> => {
        if (!ensureWritable('updateBatch'))
            return false;
        if (!(await refreshLatestDataFromDiskForStockWrite('recordStockWaste')))
            return false;
        const currentMedicines = latestDataRef.current.medicines || [];
        const currentStockMovements = latestDataRef.current.stockMovements || [];
        const medicine = currentMedicines.find((entry) => entry.id === payload.medicineId);
        const batch = medicine?.batches.find((entry) => entry.id === payload.batchId);
        if (!medicine || !batch || payload.quantity <= 0 || payload.quantity > batch.quantity) {
            addToast("مقدار ضایعات معتبر نیست یا موجودی کاف?ی وجود ندارد.", "error");
            return false;
        }
        const nowIso = new Date().toISOString();
        const totalLoss = Math.max(0, payload.quantity * Math.max(0, payload.costPerUnit || batch.purchasePrice || 0));
        const movementDrafts: StockMovementDraft[] = [{
                medicineId: payload.medicineId,
                batchId: payload.batchId,
                type: 'waste',
                quantityBaseUnit: -Math.abs(payload.quantity),
                referenceType: 'waste',
                referenceId: payload.idempotencyKey,
                idempotencyKey: payload.idempotencyKey,
                metadata: {
                    reason: payload.reason,
                    description: payload.description,
                    costPerUnit: payload.costPerUnit || batch.purchasePrice || 0,
                    totalLoss
                },
                history: {
                    action: 'stock_wasted',
                    details: `${payload.reason}: ${payload.quantity}. ${payload.description || ''}`
                }
            }];
        let nextMedicines = currentMedicines;
        let nextStockMovements = currentStockMovements;
        try {
            const stockTransaction = applyInventoryTransaction({
                medicines: currentMedicines,
                stockMovements: currentStockMovements,
                movements: movementDrafts,
                createdAt: nowIso
            });
            nextMedicines = stockTransaction.medicines;
            nextStockMovements = stockTransaction.stockMovements;
        }
        catch (error) {
            addToast(getInventoryTransactionMessage(error, (latestDataRef.current.settings || settings).language === 'english'), "error");
            return false;
        }
        const adjustmentPayload = {
            id: payload.idempotencyKey,
            idempotencyKey: payload.idempotencyKey,
            medicineId: payload.medicineId,
            batchId: payload.batchId,
            quantityDelta: -Math.abs(payload.quantity),
            reason: payload.reason,
            note: payload.description || payload.reason,
            costPerUnit: payload.costPerUnit || batch.purchasePrice || 0,
            totalLoss,
            currency: settings.currencySettings?.baseCurrency || 'AFN'
        } as Record<string, unknown>;
        const committed = await persistData({ medicines: nextMedicines, stockMovements: nextStockMovements });
        if (!committed)
            return false;
        commitDomainAuditEvents([createDomainAuditEntry({
                action: 'stock.wasted',
                entityType: 'stock',
                entityId: payload.batchId,
                afterSummary: `qty=${payload.quantity} | loss=${totalLoss}`,
                note: payload.reason
            })]);
        return true;
    };
    // NEW: Manual batch creation remains an inventory adjustment, not a purchase receipt or supplier liability event.
    const addBatch = async (medId: string, newBatchData: Omit<Batch, 'id' | 'history'>) => {
        if (!ensureWritable('addBatch'))
            return;
        if (!(await refreshLatestDataFromDiskForStockWrite('addBatch')))
            return;
        const currentMedicines = latestDataRef.current.medicines || [];
        const currentStockMovements = latestDataRef.current.stockMovements || [];
        const nowIso = new Date().toISOString();
        const nextBatch: Batch = {
            ...newBatchData,
            id: (newBatchData as Partial<Batch>).id || createUniqueId('batch'),
            receivedQuantity: typeof newBatchData.receivedQuantity === 'number' ? newBatchData.receivedQuantity : newBatchData.quantity,
            receivedAt: newBatchData.receivedAt || nowIso,
            traceSource: newBatchData.traceSource || 'manual',
            lastMovementAt: newBatchData.lastMovementAt || nowIso,
            history: (newBatchData as Partial<Batch>).history || [{ date: nowIso, action: 'ایجاد', details: tr('Added manually', 'افزودن دستی') }]
        };
        const auditEntry = createDomainAuditEntry({
            action: 'batch.created',
            entityType: 'batch',
            entityId: nextBatch.id,
            afterSummary: summarizeBatchState(nextBatch),
            note: `Manual batch added for medicine ${medId}`
        });
        let stockTransaction;
        try {
            stockTransaction = applyInventoryTransaction({
                medicines: currentMedicines,
                stockMovements: currentStockMovements,
                movements: [{
                        medicineId: medId,
                        batchId: nextBatch.id,
                        type: 'manual_adjustment',
                        quantityBaseUnit: Math.max(0, toSafeNumber(nextBatch.quantity)),
                        referenceType: 'batch_adjustment',
                        referenceId: nextBatch.id,
                        idempotencyKey: `batch-create:${nextBatch.id}`,
                        createBatch: nextBatch,
                        metadata: {
                            source: 'manual_batch_creation',
                            medicineId: medId,
                        },
                        history: {
                            action: 'manual_adjustment',
                            details: `Manual batch ${nextBatch.batchNumber || nextBatch.id} created`,
                        },
                    }],
                createdAt: nowIso,
            });
        }
        catch (error) {
            addToast(getInventoryTransactionMessage(error, (latestDataRef.current.settings || settings).language === 'english'), "error");
            return;
        }
        const updatedMedicines = stockTransaction.medicines;
        const updatedStockMovements = stockTransaction.stockMovements;
        const committed = await persistData({ medicines: updatedMedicines, stockMovements: updatedStockMovements });
        if (!committed)
            return;
        commitDomainAuditEvents([auditEntry]);
        addToast("سری ساخت جدید اضاف?ه شد", "success");
    };
    const deleteMedicine = async (id: string) => {
        if (!ensureWritable('deleteMedicine'))
            return;
        const currentMedicines = latestDataRef.current.medicines || [];
        const updatedAt = new Date().toISOString();
        const updated = archiveMedicineCollection(currentMedicines, id, updatedAt);
        const persistArchivedMedicine = async (options?: {
            enqueueDelete?: boolean;
            clearStaleOutbox?: boolean;
            reason?: string;
        }): Promise<boolean> => {
            const committed = options?.enqueueDelete
                ? await persistWarehouseMutation({ medicines: updated }, 'deleteMedicine', { id } as Record<string, unknown>)
                : await persistData({ medicines: updated });
            if (!committed)
                return false;
            if (options?.clearStaleOutbox) {
                const removedPendingOperations = await 0;
                Logger.warn('SYNC', 'Archived medicine locally after backend delete fallback.', {
                    medicineId: id,
                    removedPendingOperations,
                    reason: options.reason || 'backend_missing_record',
                });
            }
            addToast("دوا حذف? شد (بایگانی)", "warning");
            return true;
        };
        await persistArchivedMedicine({ reason: 'local_only' });
    };
    const restoreArchivedMedicine = async (id: string) => {
        if (!ensureWritable('updateMedicine'))
            return;
        const currentMedicines = latestDataRef.current.medicines || [];
        const archivedMedicine = currentMedicines.find((medicine) => medicine.id === id && medicine.isDeleted);
        if (!archivedMedicine) {
            addToast("\u062f\u0648\u0627 \u062f\u0631 \u0628\u0627\u06cc\u06af\u0627\u0646\u06cc \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f.", "warning");
            return;
        }
        const updatedAt = new Date().toISOString();
        const updatedMedicines = restoreArchivedMedicineCollection(currentMedicines, id, updatedAt);
        const committed = await persistData({ medicines: updatedMedicines });
        if (!committed)
            return;
        const removedPendingOperations = await 0;
        if (removedPendingOperations > 0) {
            Logger.warn('SYNC', 'Discarded pending warehouse delete operations after restoring archived medicine.', {
                medicineId: id,
                removedPendingOperations,
            });
        }
        addToast("\u062f\u0648\u0627 \u0627\u0632 \u0628\u0627\u06cc\u06af\u0627\u0646\u06cc \u0628\u0647 \u0641\u0647\u0631\u0633\u062a \u0641\u0639\u0627\u0644 \u0628\u0631\u06af\u0634\u062a.", "success");
    };
    const purgeArchivedMedicine = async (id: string) => {
        if (!ensureWritable('deleteMedicine'))
            return;
        const currentMedicines = latestDataRef.current.medicines || [];
        const archivedMedicine = currentMedicines.find((medicine) => medicine.id === id && medicine.isDeleted);
        if (!archivedMedicine) {
            addToast("\u062f\u0648\u0627 \u062f\u0631 \u0628\u0627\u06cc\u06af\u0627\u0646\u06cc \u067e\u06cc\u062f\u0627 \u0646\u0634\u062f.", "warning");
            return;
        }
        const nowIso = new Date().toISOString();
        const currentSettings = latestDataRef.current.settings || settings || INITIAL_SETTINGS;
        const existingTombstones = currentSettings.deletedRecordTombstones || {};
        const nextSettings: AppSettings = {
            ...currentSettings,
            deletedRecordTombstones: {
                ...existingTombstones,
                medicines: {
                    ...(existingTombstones.medicines || {}),
                    [id]: nowIso
                }
            },
            updatedAt: nowIso
        };
        const updatedMedicines = purgeArchivedMedicineCollection(currentMedicines, id);
        const committed = await persistData({
            medicines: updatedMedicines,
            settings: nextSettings
        }, { forceSettingsStateUpdate: true });
        if (!committed)
            return;
        addToast("\u062f\u0648\u0627 \u06a9\u0627\u0645\u0644\u0627 \u0627\u0632 \u0628\u0627\u06cc\u06af\u0627\u0646\u06cc \u062d\u0630\u0641 \u0634\u062f.", "warning");
    };
    const enqueueInvoiceCommit = useCallback(<T,>(task: () => Promise<T>): Promise<T> => (enqueueSerialMutation(invoiceCommitQueueRef, task)), []);
    const addInvoice = async (invoiceData: Omit<Invoice, 'id'>): Promise<Invoice | void> => enqueueInvoiceCommit(async () => {
        if (!ensureWritable('addInvoice'))
            return;
        if (!(await refreshLatestDataFromDiskForStockWrite('addInvoice')))
            return;
        const nowIso = new Date().toISOString();
        const safeFinalAmount = typeof invoiceData.finalAmount === 'number' ? invoiceData.finalAmount : 0;
        const rawPaid = typeof invoiceData.amountPaid === 'number' ? invoiceData.amountPaid : 0;
        const safePaid = Math.max(0, Math.min(rawPaid, safeFinalAmount));
        const safeRemaining = Math.max(0, safeFinalAmount - safePaid);
        const currentMedicines = latestDataRef.current.medicines || [];
        const currentCustomers = latestDataRef.current.customers || [];
        const currentInvoices = latestDataRef.current.invoices || [];
        const currentSettings = latestDataRef.current.settings || settings;
        const currentStockMovements = latestDataRef.current.stockMovements || [];
        const invalidLineIndex = getInvalidInvoiceFinancialLineIndex(invoiceData.items || []);
        if (invalidLineIndex >= 0) {
            addToast(currentSettings.language === 'english'
                ? `Line ${invalidLineIndex + 1} has invalid quantity or price.`
                : `سطر ${invalidLineIndex + 1} تعداد یا قیمت معتبر ندارد.`, "error");
            return;
        }
        const stockCheck = validateInvoiceStock(invoiceData.items || [], currentMedicines);
        if (!stockCheck.ok) {
            addToast(formatInvoiceStockIssue(getFirstInvoiceStockIssue(stockCheck), currentSettings.language === 'english'), "error");
            return;
        }
        const quantityPolicyCheck = validateInvoiceQuantityPolicy(invoiceData.items || [], currentMedicines);
        if (!quantityPolicyCheck.ok) {
            addToast(formatInvoiceQuantityPolicyIssue(quantityPolicyCheck.issues[0], currentSettings.language === 'english'), "error");
            return;
        }
        if (typeof invoiceData.invoiceNumber === 'number' &&
            currentInvoices.some((invoice) => !invoice.isDeleted && invoice.invoiceNumber === invoiceData.invoiceNumber)) {
            addToast(currentSettings.language === 'english'
                ? "Invoice number already exists."
                : "شماره ف?اکتور تکراری است.", "error");
            return;
        }
        const incomingInvoiceId = toTrimmedText((invoiceData as Partial<Invoice>).id);
        if (incomingInvoiceId) {
            const existingInvoice = currentInvoices.find((invoice) => !invoice.isDeleted && invoice.id === incomingInvoiceId);
            if (existingInvoice)
                return existingInvoice;
        }
        const invoiceIdempotencyKey = toTrimmedText((invoiceData as Partial<Invoice>).idempotencyKey);
        if (invoiceIdempotencyKey) {
            const existingInvoice = currentInvoices.find((invoice) => !invoice.isDeleted && invoice.idempotencyKey === invoiceIdempotencyKey);
            if (existingInvoice)
                return existingInvoice;
        }
        const newInvoice = {
            ...invoiceData,
            amountPaid: safePaid,
            remainingAmount: safeRemaining,
            id: (invoiceData as Partial<Invoice>).id || createUniqueId('inv'),
            idempotencyKey: invoiceIdempotencyKey || (invoiceData as Partial<Invoice>).idempotencyKey,
            updatedAt: (invoiceData as Partial<Invoice>).updatedAt || nowIso
        };
        let stockTransaction;
        try {
            stockTransaction = applyInventoryTransaction({
                medicines: currentMedicines,
                stockMovements: currentStockMovements,
                movements: buildInvoiceSaleMovementDrafts(newInvoice),
                createdAt: nowIso
            });
        }
        catch (error) {
            addToast(getInventoryTransactionMessage(error, currentSettings.language === 'english'), "error");
            return;
        }
        const updatedMedicines = stockTransaction.medicines;
        const updatedStockMovements = stockTransaction.stockMovements;
        // Update Customer Balance
        const updatedCustomers = currentCustomers.map(c => {
            if (c.id === invoiceData.customerId) {
                const baseBalance = typeof c.balance === 'number' ? c.balance : 0;
                const existingTxns = Array.isArray(c.transactions) ? c.transactions : [];
                const invoiceBalanceAfter = baseBalance + safeFinalAmount;
                const paymentBalanceAfter = invoiceBalanceAfter - safePaid;
                const txns = [
                    ...existingTxns,
                    {
                        id: createUniqueId('txn'),
                        date: new Date().toISOString(),
                        type: 'invoice' as const,
                        amount: safeFinalAmount,
                        balanceAfter: invoiceBalanceAfter,
                        description: tr(`Invoice #${newInvoice.invoiceNumber || '---'}`, `فاکتور #${newInvoice.invoiceNumber || '---'}`),
                        referenceId: newInvoice.id
                    }
                ];
                if (safePaid > 0) {
                    txns.push({
                        id: createUniqueId('txn-pay'),
                        date: new Date().toISOString(),
                        type: 'payment' as const,
                        amount: safePaid,
                        balanceAfter: paymentBalanceAfter,
                        description: tr(`Payment for invoice #${newInvoice.invoiceNumber || '---'}`, `پرداخت فاکتور #${newInvoice.invoiceNumber || '---'}`),
                        referenceId: newInvoice.id
                    });
                }
                return {
                    ...c,
                    balance: baseBalance + safeRemaining,
                    transactions: txns,
                    updatedAt: new Date().toISOString()
                };
            }
            return c;
        });
        let updatedSettings = currentSettings;
        if (currentSettings.invoiceNumbering?.type === 'auto') {
            const currentNext = currentSettings.invoiceNumbering.nextNumber || 1001;
            const usedInvoiceNumber = typeof newInvoice.invoiceNumber === 'number'
                ? Math.max(1, Math.floor(newInvoice.invoiceNumber))
                : currentNext;
            updatedSettings = {
                ...currentSettings,
                invoiceNumbering: {
                    ...currentSettings.invoiceNumbering,
                    type: 'auto',
                    nextNumber: Math.max(currentNext, usedInvoiceNumber + 1)
                },
                updatedAt: new Date().toISOString()
            };
        }
        const invoiceAuditEntries: DomainAuditEntry[] = [
            createDomainAuditEntry({
                action: 'invoice.created',
                entityType: 'invoice',
                entityId: newInvoice.id,
                afterSummary: `invoice=${newInvoice.invoiceNumber || newInvoice.id} | total=${safeFinalAmount} | paid=${safePaid} | remaining=${safeRemaining}`,
                note: 'Sales invoice created'
            }),
            createDomainAuditEntry({
                action: 'stock.decremented',
                entityType: 'stock',
                entityId: newInvoice.id,
                afterSummary: `items=${newInvoice.items.length} | customer=${newInvoice.customerId}`,
                note: 'Invoice creation reduced stock'
            })
        ];
        const committed = await persistData({
            invoices: [...currentInvoices, newInvoice],
            medicines: updatedMedicines,
            customers: updatedCustomers,
            settings: updatedSettings,
            stockMovements: updatedStockMovements
        });
        if (!committed)
            return;
        commitDomainAuditEvents(invoiceAuditEntries);
        // Reset Draft
        setSalesDraft(createInitialDraft(updatedSettings));
        addToast("ف?اکتور با موف?قیت ثبت شد", "success");
        return newInvoice;
    });
    const updateInvoice = async (invoiceId: string, request: InvoiceUpdateRequest): Promise<Invoice | void> => enqueueInvoiceCommit(async () => {
        if (!ensureWritable('updateInvoice'))
            return;
        if (!(await refreshLatestDataFromDiskForStockWrite('updateInvoice')))
            return;
        const nowIso = new Date().toISOString();
        const currentInvoices = latestDataRef.current.invoices || [];
        const currentMedicines = latestDataRef.current.medicines || [];
        const currentCustomers = latestDataRef.current.customers || [];
        const currentSettings = latestDataRef.current.settings || settings;
        const currentStockMovements = latestDataRef.current.stockMovements || [];
        const previousInvoiceRaw = currentInvoices.find((invoice) => invoice.id === invoiceId && !invoice.isDeleted);
        if (!previousInvoiceRaw) {
            addToast(currentSettings.language === 'english' ? 'Selected invoice was not found.' : 'فاکتور انتخاب‌شده پیدا نشد.', 'error');
            return;
        }
        if (getActiveInvoiceReturns(previousInvoiceRaw.returns).length > 0 && !toTrimmedText(request.editReason)) {
            addToast(currentSettings.language === 'english' ? 'Edit reason is required for invoices with returns.' : 'برای ویرایش فاکتور دارای برگشتی، دلیل ویرایش الزامی است.', 'error');
            return;
        }
        const previousInvoice = ensureInvoiceLineIds(previousInvoiceRaw);
        const incomingInvoice = request.invoice || previousInvoice;
        const customerEditMode = request.customerEditMode || 'keep';
        const requestedCustomerName = toTrimmedText(request.customerName);
        let nextCustomerId = previousInvoice.customerId;
        let customerSnapshot: Customer | null = null;
        let customersWithPotentialNewCustomer = currentCustomers;
        if (customerEditMode === 'transfer_ownership') {
            const explicitCustomer = request.targetCustomerId
                ? currentCustomers.find((customer) => customer.id === request.targetCustomerId && !customer.isDeleted)
                : undefined;
            const matchedByName = !explicitCustomer && requestedCustomerName
                ? currentCustomers.find((customer) => !customer.isDeleted && customer.name.trim().toLowerCase() === requestedCustomerName.toLowerCase())
                : undefined;
            const targetCustomer = explicitCustomer || matchedByName;
            if (targetCustomer) {
                nextCustomerId = targetCustomer.id;
                customerSnapshot = targetCustomer;
            }
            else if (requestedCustomerName) {
                const newCustomer: Customer = {
                    id: createUniqueId('cust'),
                    name: requestedCustomerName,
                    phone: '',
                    address: '',
                    balance: 0,
                    transactions: [],
                    updatedAt: nowIso
                };
                customersWithPotentialNewCustomer = [...currentCustomers, newCustomer];
                nextCustomerId = newCustomer.id;
                customerSnapshot = newCustomer;
            }
            else {
                addToast(currentSettings.language === 'english' ? 'Choose or enter the new owner customer.' : 'مشتری مالک جدید را انتخاب یا وارد کنید.', 'error');
                return;
            }
        }
        else {
            customerSnapshot = currentCustomers.find((customer) => customer.id === previousInvoice.customerId) || null;
        }
        const normalizedItems: InvoiceItem[] = (incomingInvoice.items || []).map((item, index) => ({
            ...item,
            lineId: item.lineId || previousInvoice.items[index]?.lineId || `${previousInvoice.id}-line-${index + 1}`,
            quantity: Math.max(0, Number(item.quantity) || 0),
            baseQuantity: item.baseQuantity === undefined ? undefined : Math.max(0, Number(item.baseQuantity) || 0),
            price: Math.max(0, Number(item.price) || 0),
            discountAmount: Math.max(0, Number(item.discountAmount) || 0),
            discountPercent: Math.max(0, Number(item.discountPercent) || 0)
        }));
        const invalidLineIndex = getInvalidInvoiceFinancialLineIndex(normalizedItems);
        if (invalidLineIndex >= 0) {
            addToast(currentSettings.language === 'english' ? `Line ${invalidLineIndex + 1} has invalid quantity or price.` : `سطر ${invalidLineIndex + 1} تعداد یا قیمت معتبر ندارد.`, 'error');
            return;
        }
        const quantityPolicyCheck = validateInvoiceQuantityPolicy(normalizedItems, currentMedicines);
        if (!quantityPolicyCheck.ok) {
            addToast(formatInvoiceQuantityPolicyIssue(quantityPolicyCheck.issues[0], currentSettings.language === 'english'), 'error');
            return;
        }
        if (typeof incomingInvoice.invoiceNumber === 'number' &&
            currentInvoices.some((invoice) => !invoice.isDeleted && invoice.id !== invoiceId && invoice.invoiceNumber === incomingInvoice.invoiceNumber)) {
            addToast(currentSettings.language === 'english' ? 'Invoice number already exists.' : 'شماره فاکتور تکراری است.', 'error');
            return;
        }
        const taxRate = typeof incomingInvoice.taxRate === 'number'
            ? incomingInvoice.taxRate
            : (typeof previousInvoice.taxRate === 'number' ? previousInvoice.taxRate : currentSettings.taxRate || 0);
        const discount = Math.max(0, Number(incomingInvoice.discount) || 0);
        const totals = calculateInvoiceTotals(normalizedItems, discount, Math.max(0, Number(taxRate) || 0), incomingInvoice.currency || previousInvoice.currency);
        const requestedPaid = Math.max(0, Number(incomingInvoice.amountPaid) || 0);
        const safePaid = Math.min(requestedPaid, totals.finalAmount);
        const overpaymentCredit = Math.max(0, requestedPaid - safePaid);
        const safeRemaining = Math.max(0, totals.finalAmount - safePaid);
        const paymentStatus: Invoice['paymentStatus'] = safeRemaining > 0 && safePaid > 0
            ? 'partial'
            : safeRemaining > 0
                ? 'credit'
                : (incomingInvoice.paymentBreakdown?.method === 'card' ? 'card' : incomingInvoice.paymentBreakdown?.method === 'mixed' ? 'mixed' : 'cash');
        let nextInvoice: Invoice = ensureInvoiceLineIds({
            ...previousInvoice,
            ...incomingInvoice,
            id: previousInvoice.id,
            customerId: nextCustomerId,
            items: normalizedItems,
            total: totals.total,
            lineDiscountTotal: totals.lineDiscountTotal,
            discount,
            tax: totals.tax,
            taxRate: Math.max(0, Number(taxRate) || 0),
            finalAmount: totals.finalAmount,
            amountPaid: safePaid,
            remainingAmount: safeRemaining,
            paymentStatus,
            returns: [],
            updatedAt: nowIso
        }, previousInvoice);
        try {
            nextInvoice = {
                ...nextInvoice,
                returns: rebuildInvoiceReturnsForLocalEdit(previousInvoice, nextInvoice, Boolean(request.allowReturnedLineReassignment))
            };
        }
        catch (error) {
            const code = error instanceof Error ? error.message : '';
            const message = code === 'INVOICE_EDIT_RETURN_QUANTITY_CONFLICT'
                ? (currentSettings.language === 'english' ? 'Edited quantity cannot be lower than already returned quantity.' : 'تعداد جدید نمی‌تواند از تعداد برگشتی قبلی کمتر باشد.')
                : code === 'INVOICE_EDIT_RETURNED_LINE_REASSIGNMENT_REQUIRED'
                    ? (currentSettings.language === 'english' ? 'Returned line medicine or batch changed. Confirm return recalculation first.' : 'دوا یا بچ سطر برگشتی تغییر کرده است؛ ابتدا تأیید بازمحاسبه برگشتی را فعال کنید.')
                    : (currentSettings.language === 'english' ? 'Returned invoice line cannot be removed.' : 'سطر دارای برگشتی قابل حذف نیست.');
            addToast(message, 'error');
            return;
        }
        let stockTransaction;
        try {
            stockTransaction = applyInventoryTransaction({
                medicines: currentMedicines,
                stockMovements: currentStockMovements,
                movements: buildInvoiceEditMovementDrafts(previousInvoice, nextInvoice, {
                    idempotencyScope: request.idempotencyKey || `invoice-edit:${invoiceId}:${nowIso}`
                }),
                createdAt: nowIso
            });
        }
        catch (error) {
            addToast(getInventoryTransactionMessage(error, currentSettings.language === 'english'), 'error');
            return;
        }
        const updatedMedicines = stockTransaction.medicines;
        const updatedStockMovements = stockTransaction.stockMovements;
        const updateIdempotencyKey = request.idempotencyKey || `invoice-edit:${invoiceId}:${nowIso}`;
        const returnDebtTransactions: CustomerTransaction[] = getActiveInvoiceReturns(nextInvoice.returns).flatMap((salesReturn, index) => (salesReturn.debtReduction > 0
            ? [{
                    id: `${updateIdempotencyKey}:return:${index}`,
                    date: salesReturn.date || nowIso,
                    type: 'return' as const,
                    amount: salesReturn.debtReduction,
                    balanceAfter: 0,
                    description: tr(`Recalculated return for invoice #${nextInvoice.invoiceNumber || nextInvoice.id.slice(-6)}`, `برگشتی بازمحاسبه‌شده فاکتور #${nextInvoice.invoiceNumber || nextInvoice.id.slice(-6)}`),
                    referenceId: nextInvoice.id,
                    idempotencyKey: `${updateIdempotencyKey}:return:${index}`
                }]
            : []));
        const nextInvoiceTransactions: CustomerTransaction[] = [
            {
                id: `${updateIdempotencyKey}:invoice`,
                date: nextInvoice.date || nowIso,
                type: 'invoice',
                amount: nextInvoice.finalAmount,
                balanceAfter: 0,
                description: tr(`Invoice #${nextInvoice.invoiceNumber || nextInvoice.id.slice(-6)} edited`, `ویرایش فاکتور #${nextInvoice.invoiceNumber || nextInvoice.id.slice(-6)}`),
                referenceId: nextInvoice.id,
                idempotencyKey: `${updateIdempotencyKey}:invoice`
            },
            ...(nextInvoice.amountPaid > 0 ? [{
                    id: `${updateIdempotencyKey}:payment`,
                    date: nextInvoice.date || nowIso,
                    type: 'payment' as const,
                    amount: nextInvoice.amountPaid,
                    balanceAfter: 0,
                    description: tr(`Payment for edited invoice #${nextInvoice.invoiceNumber || nextInvoice.id.slice(-6)}`, `پرداخت فاکتور ویرایش‌شده #${nextInvoice.invoiceNumber || nextInvoice.id.slice(-6)}`),
                    referenceId: nextInvoice.id,
                    idempotencyKey: `${updateIdempotencyKey}:payment`
                }] : []),
            ...(overpaymentCredit > 0 ? [{
                    id: `${updateIdempotencyKey}:credit`,
                    date: nextInvoice.date || nowIso,
                    type: 'payment' as const,
                    amount: overpaymentCredit,
                    balanceAfter: 0,
                    description: tr(`Customer credit from reducing invoice #${nextInvoice.invoiceNumber || nextInvoice.id.slice(-6)}`, `اعتبار مشتری از کاهش مبلغ فاکتور #${nextInvoice.invoiceNumber || nextInvoice.id.slice(-6)}`),
                    referenceId: nextInvoice.id,
                    idempotencyKey: `${updateIdempotencyKey}:credit`
                }] : []),
            ...returnDebtTransactions
        ];
        const affectedCustomerIds = new Set([previousInvoice.customerId, nextInvoice.customerId]);
        const nextCustomers = customersWithPotentialNewCustomer.map((customer) => {
            const renamedCustomer = customerEditMode === 'rename_global' && customer.id === previousInvoice.customerId && requestedCustomerName
                ? { ...customer, name: requestedCustomerName }
                : customer;
            if (!affectedCustomerIds.has(customer.id)) {
                return renamedCustomer === customer ? customer : { ...renamedCustomer, updatedAt: nowIso };
            }
            const sourceTransactions = Array.isArray(customer.transactions) ? customer.transactions : [];
            const removedTransactions = sourceTransactions.filter((txn) => txn.referenceId === invoiceId);
            const remainingTransactions = sourceTransactions.filter((txn) => txn.referenceId !== invoiceId);
            const removedImpact = removedTransactions.reduce((sum, txn) => sum + getCustomerTransactionDelta(txn), 0);
            const additions = customer.id === nextInvoice.customerId ? nextInvoiceTransactions : [];
            const addedImpact = additions.reduce((sum, txn) => sum + getCustomerTransactionDelta(txn), 0);
            const nextBalance = toSafeNumber(customer.balance) - removedImpact + addedImpact;
            return {
                ...renamedCustomer,
                balance: nextBalance,
                transactions: normalizeCustomerTransactions([...remainingTransactions, ...additions], nextBalance),
                updatedAt: nowIso
            };
        });
        const updatedInvoices = currentInvoices.map((invoice) => invoice.id === invoiceId ? nextInvoice : invoice);
        const auditEntries: DomainAuditEntry[] = [
            createDomainAuditEntry({
                action: 'invoice.edited',
                entityType: 'invoice',
                entityId: invoiceId,
                beforeSummary: `invoice=${previousInvoice.invoiceNumber || previousInvoice.id} | total=${previousInvoice.finalAmount} | paid=${previousInvoice.amountPaid}`,
                afterSummary: `invoice=${nextInvoice.invoiceNumber || nextInvoice.id} | total=${nextInvoice.finalAmount} | paid=${nextInvoice.amountPaid} | credit=${overpaymentCredit}`,
                note: request.editReason || 'Invoice edited with full recalculation'
            }),
            createDomainAuditEntry({
                action: 'stock.invoice_edit_delta',
                entityType: 'stock',
                entityId: invoiceId,
                afterSummary: `items=${nextInvoice.items.length} | returns=${getActiveInvoiceReturns(nextInvoice.returns).length}`,
                note: 'Invoice edit delta applied to inventory'
            })
        ];
        const updatePayload: InvoiceUpdateRequest = { ...request, invoice: nextInvoice, idempotencyKey: updateIdempotencyKey };
        const persistLocalInvoiceEditWithOutbox = async (): Promise<boolean> => {
            const committed = await persistWarehouseMutation({
                invoices: updatedInvoices,
                medicines: updatedMedicines,
                customers: nextCustomers,
                stockMovements: updatedStockMovements
            }, 'updateInvoice', {
                invoiceId,
                ...updatePayload,
                customerSnapshot
            } as Record<string, unknown>, {
                deferWarehouseOutboxSync: true
            });
            if (!committed)
                return false;
            commitDomainAuditEvents(auditEntries);
            addToast(currentSettings.language === 'english'
                ? 'Invoice updated locally. Backend sync will retry in the background.'
                : 'فاکتور ذخیره شد؛ همگام‌سازی آنلاین در پس‌زمینه دوباره تلاش می‌شود.', 'success');
            return true;
        };
        const committed = await persistData({
            invoices: updatedInvoices,
            medicines: updatedMedicines,
            customers: nextCustomers,
            stockMovements: updatedStockMovements
        });
        if (!committed)
            return;
        commitDomainAuditEvents(auditEntries);
        addToast(currentSettings.language === 'english' ? 'Invoice updated successfully.' : 'فاکتور با موفقیت ویرایش شد.', 'success');
        return nextInvoice;
    });
    const deleteInvoices = async (ids: string[]): Promise<void> => enqueueInvoiceCommit(async () => {
        if (!ensureWritable('deleteInvoices'))
            return;
        const targetIds = new Set(ids.filter(Boolean));
        if (targetIds.size === 0)
            return;
        if (!(await refreshLatestDataFromDiskForStockWrite('deleteInvoices')))
            return;
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        const nowIso = new Date().toISOString();
        const currentInvoices = latestDataRef.current.invoices || [];
        const currentMedicines = latestDataRef.current.medicines || [];
        const currentCustomers = latestDataRef.current.customers || [];
        const currentStockMovements = latestDataRef.current.stockMovements || [];
        const invoicesToDelete = currentInvoices.filter((inv) => targetIds.has(inv.id) && !inv.isDeleted);
        if (invoicesToDelete.length === 0) {
            addToast("ف?اکتور انتخاب‌شده از قبل حذف? شده است.", "warning");
            return;
        }
        const rollbackByCustomer = new Map<string, number>();
        invoicesToDelete.forEach((invoice) => {
            rollbackByCustomer.set(invoice.customerId, (rollbackByCustomer.get(invoice.customerId) || 0) + getInvoiceCustomerBalanceImpact(invoice));
        });
        const updatedInvoices = currentInvoices.map((inv) => {
            if (!targetIds.has(inv.id))
                return inv;
            return { ...inv, isDeleted: true, updatedAt: nowIso };
        });
        let stockTransaction;
        try {
            stockTransaction = applyInventoryTransaction({
                medicines: currentMedicines,
                stockMovements: currentStockMovements,
                movements: invoicesToDelete.flatMap((invoice) => buildInvoiceDeleteMovementDrafts(invoice)),
                createdAt: nowIso
            });
        }
        catch (error) {
            addToast(getInventoryTransactionMessage(error, (latestDataRef.current.settings || settings).language === 'english'), "error");
            return;
        }
        const updatedMedicines = stockTransaction.medicines;
        const updatedStockMovements = stockTransaction.stockMovements;
        const updatedCustomers = currentCustomers.map((customer) => {
            const removedDebt = rollbackByCustomer.get(customer.id) || 0;
            const baseBalance = toSafeNumber(customer.balance);
            const sourceTransactions = Array.isArray(customer.transactions) ? customer.transactions : [];
            const remainingTransactions = sourceTransactions.filter((txn) => !txn.referenceId || !targetIds.has(txn.referenceId));
            const hasRemovedTransactions = remainingTransactions.length !== sourceTransactions.length;
            if (removedDebt === 0 && !hasRemovedTransactions)
                return customer;
            const nextBalance = baseBalance - removedDebt;
            const normalizedTransactions = normalizeCustomerTransactions(remainingTransactions, nextBalance);
            return {
                ...customer,
                balance: nextBalance,
                transactions: normalizedTransactions,
                updatedAt: nowIso
            };
        });
        const invoiceRollbackAuditEntries: DomainAuditEntry[] = [
            createDomainAuditEntry({
                action: 'invoice.deleted',
                entityType: 'invoice',
                entityId: Array.from(targetIds).join(','),
                afterSummary: `count=${invoicesToDelete.length}`,
                note: 'Invoice deletion requested'
            }),
            createDomainAuditEntry({
                action: 'stock.restored',
                entityType: 'stock',
                entityId: Array.from(targetIds).join(','),
                afterSummary: `count=${invoicesToDelete.length}`,
                note: 'Invoice deletion restored stock'
            })
        ];
        const committed = await persistData({
            invoices: updatedInvoices,
            medicines: updatedMedicines,
            customers: updatedCustomers,
            stockMovements: updatedStockMovements
        });
        if (!committed)
            return;
        commitDomainAuditEvents(invoiceRollbackAuditEntries);
        addToast(settings.language === 'english' ? `${invoicesToDelete.length} invoices were deleted and stock and customer balances were corrected.` : `${invoicesToDelete.length} ف?اکتور حذف? شد و محاسبات موجودی/حساب مشتری اصلاح گردید.`, "success");
    });
    const transferInvoiceSeller = async (invoiceId: string, nextUserId: string): Promise<void> => enqueueInvoiceCommit(async () => {
        if (!ensureWritable('transferInvoiceSeller'))
            return;
        const currentInvoices = latestDataRef.current.invoices || [];
        const currentSettings = latestDataRef.current.settings || settings;
        const targetInvoice = currentInvoices.find((invoice) => invoice.id === invoiceId && !invoice.isDeleted);
        if (!targetInvoice) {
            addToast(currentSettings.language === 'english'
                ? 'Selected invoice was not found.'
                : 'ف?اکتور انتخاب‌شده پیدا نشد.', 'warning');
            return;
        }
        const normalizedNextUserId = (nextUserId || '').trim();
        const activeUsers = (currentSettings.users || []).filter((user) => user && !user.isDeleted);
        const nextUser = normalizedNextUserId === 'admin'
            ? { id: 'admin', name: currentSettings.language === 'english' ? 'System Admin' : 'مدیر سیستم' }
            : activeUsers.find((user) => user.id === normalizedNextUserId);
        if (!normalizedNextUserId || !nextUser) {
            addToast(currentSettings.language === 'english'
                ? 'Please choose a valid seller.'
                : 'لطف?اً یک ف?روشنده معتبر انتخاب کنید.', 'error');
            return;
        }
        const previousUserId = targetInvoice.userId || 'admin';
        if (previousUserId === normalizedNextUserId)
            return;
        const previousUserName = previousUserId === 'admin'
            ? (currentSettings.language === 'english' ? 'System Admin' : 'مدیر سیستم')
            : activeUsers.find((user) => user.id === previousUserId)?.name || previousUserId;
        const nextUserName = nextUser.name || normalizedNextUserId;
        const nowIso = new Date().toISOString();
        const updatedInvoices = currentInvoices.map((invoice) => (invoice.id === invoiceId
            ? { ...invoice, userId: normalizedNextUserId, updatedAt: nowIso }
            : invoice));
        // Part 12D (census gap 12B-D/4). A bare persistData({ invoices }) reached the seam as a
        // slice diff and reattributed BOOKED REVENUE with a raw invoice upsert — last-writer-wins
        // would silently lose the transfer. Naming it lets the mapper emit the
        // transfer_invoice_seller intent, which carries base_version and is answered with a conflict
        // rather than a silent overwrite. supabase_hybrid keeps its original persistData exactly.
        const committed = await persistData({ invoices: updatedInvoices });
        if (!committed)
            return;
        commitDomainAuditEvents([createDomainAuditEntry({
                action: 'invoice.seller_transferred',
                entityType: 'invoice',
                entityId: invoiceId,
                beforeSummary: `seller=${previousUserId}`,
                afterSummary: `seller=${normalizedNextUserId}`,
                note: `Seller changed from ${previousUserName} to ${nextUserName}; payroll and commission reports recalculate from invoice.userId.`
            })]);
        addToast(currentSettings.language === 'english'
            ? `Invoice seller changed to ${nextUserName}. Payroll and commission calculations were reassigned.`
            : `ف?روشنده ف?اکتور به ${nextUserName} تغییر کرد و محاسبات معاش و کمیسیون به همان نام منتقل شد.`, 'success');
    });
    const returnInvoiceItem = async (invoiceId: string, itemIndex: number, options: {
        quantity: number;
        amountRefunded?: number;
        debtReduction?: number;
        reason?: string;
        paymentMethod?: 'cash' | 'card' | 'mixed' | 'credit';
    }): Promise<void> => enqueueInvoiceCommit(async () => {
        if (!ensureWritable('deleteInvoices'))
            return;
        if (!(await refreshLatestDataFromDiskForStockWrite('returnInvoiceItem')))
            return;
        const nowIso = new Date().toISOString();
        const currentInvoices = latestDataRef.current.invoices || [];
        const currentMedicines = latestDataRef.current.medicines || [];
        const currentCustomers = latestDataRef.current.customers || [];
        const currentStockMovements = latestDataRef.current.stockMovements || [];
        const invoice = currentInvoices.find((entry) => entry.id === invoiceId && !entry.isDeleted);
        if (!invoice) {
            addToast("ف?اکتور انتخاب‌شده پیدا نشد یا قبلاً حذف? شده است.", "error");
            return;
        }
        let salesReturn;
        try {
            salesReturn = buildSalesReturn({
                invoice,
                itemIndex,
                quantity: options.quantity,
                amountRefunded: options.amountRefunded,
                debtReduction: options.debtReduction,
                reason: options.reason,
                paymentMethod: options.paymentMethod || 'cash',
                date: nowIso,
                id: createUniqueId('ret')
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : '';
            const localized = message === 'RETURN_QUANTITY_EXCEEDS_REMAINING'
                ? "تعداد برگشتی از مقدار باقی‌مانده بیشتر است."
                : message === 'RETURN_SETTLEMENT_MUST_MATCH_TOTAL_REFUND'
                    ? "جمع برگشت پول و کاهش بدهی باید دقیقاً برابر مبلغ برگشتی باشد."
                    : message === 'RETURN_REFUND_EXCEEDS_PAID_AMOUNT'
                        ? "مبلغ برگشت پول از پرداخت واقعی ف?اکتور بیشتر است."
                        : message === 'RETURN_DEBT_REDUCTION_EXCEEDS_REMAINING_DEBT'
                            ? "کاهش بدهی از مانده بدهی ف?اکتور بیشتر است."
                            : "برگشتی ف?روش معتبر نیست.";
            addToast(localized, "error");
            return;
        }
        const updatedInvoices = currentInvoices.map((entry) => (entry.id === invoice.id
            ? {
                ...entry,
                returns: [...(entry.returns || []), salesReturn],
                updatedAt: nowIso
            }
            : entry));
        const returnedItem = salesReturn.items[0];
        let stockTransaction;
        try {
            stockTransaction = applyInventoryTransaction({
                medicines: currentMedicines,
                stockMovements: currentStockMovements,
                movements: buildSalesReturnMovementDrafts(salesReturn, invoice),
                createdAt: nowIso
            });
        }
        catch (error) {
            addToast(getInventoryTransactionMessage(error, (latestDataRef.current.settings || settings).language === 'english'), "error");
            return;
        }
        const updatedMedicines = stockTransaction.medicines;
        const updatedStockMovements = stockTransaction.stockMovements;
        const updatedCustomers = currentCustomers.map((customer) => {
            if (customer.id !== invoice.customerId)
                return customer;
            const baseBalance = toSafeNumber(customer.balance);
            const nextBalance = Math.max(0, baseBalance - salesReturn.debtReduction);
            const transactions = [...(Array.isArray(customer.transactions) ? customer.transactions : [])];
            if (salesReturn.debtReduction > 0) {
                transactions.push({
                    id: createUniqueId('txn-return'),
                    date: nowIso,
                    type: 'return',
                    amount: salesReturn.debtReduction,
                    balanceAfter: nextBalance,
                    description: tr(`Return from sale #${invoice.invoiceNumber || invoice.id.slice(-6)}`, `برگشت از فروش #${invoice.invoiceNumber || invoice.id.slice(-6)}`),
                    referenceId: invoice.id
                });
            }
            return {
                ...customer,
                balance: nextBalance,
                transactions: normalizeCustomerTransactions(transactions, nextBalance),
                updatedAt: nowIso
            };
        });
        const saleReturnPayload = {
            id: salesReturn.id,
            idempotencyKey: salesReturn.id,
            itemIndex,
            quantity: options.quantity,
            amountRefunded: salesReturn.amountRefunded,
            debtReduction: salesReturn.debtReduction,
            reason: salesReturn.reason,
            paymentMethod: salesReturn.paymentMethod || options.paymentMethod || 'cash'
        } as Record<string, unknown>;
        {
            const committed = await persistData({
                invoices: updatedInvoices,
                medicines: updatedMedicines,
                customers: updatedCustomers,
                stockMovements: updatedStockMovements
            });
            if (!committed)
                return;
        }
        commitDomainAuditEvents([
            createDomainAuditEntry({
                action: 'invoice.return_recorded',
                entityType: 'invoice',
                entityId: invoice.id,
                afterSummary: `return=${salesReturn.totalRefund} | refunded=${salesReturn.amountRefunded} | debtReduction=${salesReturn.debtReduction}`,
                note: salesReturn.reason || 'Sales return recorded locally'
            }),
            createDomainAuditEntry({
                action: 'stock.restored',
                entityType: 'stock',
                entityId: returnedItem.medicineId,
                afterSummary: `qty=${returnedItem.quantity}`,
                note: 'Sales return restored inventory'
            })
        ]);
        addToast("برگشتی ف?روش ثبت شد و حساب مشتری/موجودی اصلاح گردید.", "success");
    });
    const addCustomer = async (customerData: Omit<Customer, 'id'>) => {
        if (!ensureWritable('addCustomer'))
            return;
        const sanitized = sanitizeCustomerCore(customerData, [], settings.language === 'english');
        const newCustomer: Customer = {
            ...customerData,
            ...sanitized,
            id: createUniqueId('cust'),
            updatedAt: new Date().toISOString()
        };
        const committed = await persistData({ customers: [...customers, newCustomer] });
        if (!committed)
            return;
        addToast("مشتری جدید اضاف?ه شد", "success");
    };
    const updateCustomer = async (id: string, data: Partial<Customer>) => {
        if (!ensureWritable('updateCustomer'))
            return;
        const nowIso = new Date().toISOString();
        const updated = customers.map((customer) => {
            if (customer.id !== id)
                return customer;
            const merged = { ...customer, ...data };
            const sanitized = sanitizeCustomerCore(merged, customer.transactions || [], settings.language === 'english');
            return { ...merged, ...sanitized, updatedAt: nowIso };
        });
        await persistData({ customers: updated });
    };
    const addCustomerPayment = async (customerId: string, amount: number, description: string, idempotencyKey: string): Promise<boolean | void> => {
        if (!ensureWritable('updateCustomer'))
            return false;
        const safeAmount = Math.max(0, Number(amount) || 0);
        const safeIdempotencyKey = String(idempotencyKey || '').trim();
        if (safeAmount <= 0 || !safeIdempotencyKey)
            return false;
        const nowIso = new Date().toISOString();
        const currentCustomers = latestDataRef.current.customers || [];
        const customer = currentCustomers.find((entry) => entry.id === customerId && !entry.isDeleted);
        if (!customer) {
            addToast("Customer not found", "error");
            return false;
        }
        if ((customer.transactions || []).some((txn) => txn.idempotencyKey === safeIdempotencyKey || txn.id === safeIdempotencyKey)) {
            return false;
        }
        const nextBalance = toSafeNumber(customer.balance) - safeAmount;
        const transaction: CustomerTransaction = {
            id: safeIdempotencyKey,
            date: nowIso,
            type: 'payment',
            amount: safeAmount,
            balanceAfter: nextBalance,
            description: description || 'Customer payment received',
            idempotencyKey: safeIdempotencyKey
        };
        const updatedCustomers = currentCustomers.map((entry) => entry.id === customerId
            ? {
                ...entry,
                balance: nextBalance,
                transactions: normalizeCustomerTransactions([...(entry.transactions || []), transaction], nextBalance),
                updatedAt: nowIso
            }
            : entry);
        const payload = {
            amount: safeAmount,
            description: transaction.description,
            date: nowIso,
            method: 'cash',
            idempotencyKey: safeIdempotencyKey,
            paymentId: safeIdempotencyKey,
            transactionId: safeIdempotencyKey,
            currency: 'AFN'
        };
        const auditEntry = createDomainAuditEntry({
            action: 'customer.payment_recorded',
            entityType: 'customer',
            entityId: safeIdempotencyKey,
            afterSummary: `customer=${customerId} | amount=${safeAmount} | balance=${nextBalance}`,
            note: 'Customer payment recorded'
        });
        const committed = await persistData({ customers: updatedCustomers });
        if (!committed)
            return false;
        commitDomainAuditEvents([auditEntry]);
        addToast("Customer payment recorded", "success");
        return true;
    };
    const deleteCustomer = async (id: string) => {
        if (!ensureWritable('deleteCustomer'))
            return;
        const updated = customers.map(c => c.id === id ? { ...c, isDeleted: true, updatedAt: new Date().toISOString() } : c);
        const committed = await persistData({ customers: updated });
        if (!committed)
            return;
        addToast("مشتری حذف? شد", "warning");
    };
    const addExpense = async (expenseData: Omit<Expense, 'id'>) => {
        if (!ensureWritable('addExpense'))
            return;
        const nowIso = new Date().toISOString();
        const newExpense = {
            ...expenseData,
            id: (expenseData as Partial<Expense>).id || createUniqueId('exp'),
            updatedAt: (expenseData as Partial<Expense>).updatedAt || nowIso
        };
        const committed = await persistData({ expenses: [...expenses, newExpense] });
        if (!committed)
            return;
        addToast("مشتری حذف? شد", "success");
    };
    const updateExpense = async (id: string, expenseData: Partial<Expense>) => {
        if (!ensureWritable('updateExpense'))
            return;
        const updated = expenses.map((expense) => expense.id === id
            ? {
                ...expense,
                ...expenseData,
                updatedAt: new Date().toISOString()
            }
            : expense);
        const committed = await persistData({ expenses: updated });
        if (!committed)
            return;
        addToast("هزینه بروزرسانی شد", "success");
    };
    const deleteExpense = async (id: string) => {
        if (!ensureWritable('deleteExpense'))
            return;
        const updated = expenses.map((expense) => expense.id === id
            ? { ...expense, isDeleted: true, updatedAt: new Date().toISOString() }
            : expense);
        const committed = await persistData({ expenses: updated });
        if (!committed)
            return;
        addToast("مشتری حذف? شد", "warning");
    };
    const updateExpensesBulk = async (ids: string[], expenseData: Partial<Expense>) => {
        if (!ensureWritable('updateExpense'))
            return;
        const idSet = new Set(ids);
        const nowIso = new Date().toISOString();
        const updated = expenses.map((expense) => idSet.has(expense.id)
            ? { ...expense, ...expenseData, updatedAt: nowIso }
            : expense);
        const committed = await persistData({ expenses: updated });
        if (!committed)
            return;
        addToast("هزینه‌ها بروزرسانی شد", "success");
    };
    const deleteExpensesBulk = async (ids: string[]) => {
        if (!ensureWritable('deleteExpense'))
            return;
        const idSet = new Set(ids);
        const nowIso = new Date().toISOString();
        const updated = expenses.map((expense) => idSet.has(expense.id)
            ? { ...expense, isDeleted: true, updatedAt: nowIso }
            : expense);
        const committed = await persistData({ expenses: updated });
        if (!committed)
            return;
        addToast("هزینه‌ها حذف شد", "warning");
    };
    const addPartner = async (partnerData: Omit<Partner, 'id'>) => {
        if (!ensureWritable('addPartner'))
            return;
        const nowIso = new Date().toISOString();
        const newPartner: Partner = {
            ...partnerData,
            id: (partnerData as Partial<Partner>).id || createUniqueId('partner'),
            name: toTrimmedText(partnerData.name),
            phone: toTrimmedText(partnerData.phone),
            email: toTrimmedText(partnerData.email),
            address: toTrimmedText(partnerData.address),
            capitalType: partnerData.capitalType || 'cash',
            sharePercentage: toSafeNumber(partnerData.sharePercentage, 0),
            openingCapital: toSafeNumber(partnerData.openingCapital, 0),
            openingGoodsCapital: toSafeNumber(partnerData.openingGoodsCapital, 0),
            profitRule: partnerData.profitRule ? {
                ...partnerData.profitRule,
                sharePercentage: toSafeNumber(partnerData.profitRule.sharePercentage, toSafeNumber(partnerData.sharePercentage, 0)),
                storeCommissionPercent: toSafeNumber(partnerData.profitRule.storeCommissionPercent, 0),
                storeCommissionFixedAmount: toSafeNumber(partnerData.profitRule.storeCommissionFixedAmount, 0),
                customNote: toTrimmedText(partnerData.profitRule.customNote)
            } : undefined,
            settlementPeriod: partnerData.settlementPeriod || 'monthly',
            status: partnerData.status || 'active',
            notes: toTrimmedText(partnerData.notes),
            documents: Array.isArray(partnerData.documents) ? partnerData.documents : [],
            ledger: Array.isArray(partnerData.ledger) ? partnerData.ledger : [],
            createdAt: partnerData.createdAt || nowIso,
            updatedAt: nowIso
        };
        if (!newPartner.name) {
            addToast(settings.language === 'english' ? 'Partner name is required.' : 'نام شریک الزامی است.', 'error');
            return;
        }
        const currentPartners = latestDataRef.current.partners || [];
        const committed = await persistData({ partners: [...currentPartners, newPartner] });
        if (!committed)
            return;
        addToast(settings.language === 'english' ? 'Partner added.' : 'شریک اضافه شد.', 'success');
    };
    const updatePartner = async (id: string, data: Partial<Partner>) => {
        if (!ensureWritable('updatePartner'))
            return;
        const nowIso = new Date().toISOString();
        const currentPartners = latestDataRef.current.partners || [];
        const updatedPartners = currentPartners.map((partner) => {
            if (partner.id !== id)
                return partner;
            const merged = { ...partner, ...data };
            return {
                ...merged,
                name: toTrimmedText(merged.name),
                phone: toTrimmedText(merged.phone),
                email: toTrimmedText(merged.email),
                address: toTrimmedText(merged.address),
                capitalType: merged.capitalType || 'cash',
                sharePercentage: toSafeNumber(merged.sharePercentage, 0),
                openingCapital: toSafeNumber(merged.openingCapital, 0),
                openingGoodsCapital: toSafeNumber(merged.openingGoodsCapital, 0),
                profitRule: merged.profitRule ? {
                    ...merged.profitRule,
                    sharePercentage: toSafeNumber(merged.profitRule.sharePercentage, toSafeNumber(merged.sharePercentage, 0)),
                    storeCommissionPercent: toSafeNumber(merged.profitRule.storeCommissionPercent, 0),
                    storeCommissionFixedAmount: toSafeNumber(merged.profitRule.storeCommissionFixedAmount, 0),
                    customNote: toTrimmedText(merged.profitRule.customNote)
                } : undefined,
                settlementPeriod: merged.settlementPeriod || 'monthly',
                status: merged.status || 'active',
                notes: toTrimmedText(merged.notes),
                documents: Array.isArray(merged.documents) ? merged.documents : [],
                ledger: Array.isArray(merged.ledger) ? merged.ledger : [],
                updatedAt: nowIso
            };
        });
        const committed = await persistData({ partners: updatedPartners });
        if (!committed)
            return;
        addToast(settings.language === 'english' ? 'Partner updated.' : 'اطلاعات شریک به‌روزرسانی شد.', 'success');
    };
    const deletePartner = async (id: string) => {
        if (!ensureWritable('deletePartner'))
            return;
        const confirmed = window.confirm(settings.language === 'english'
            ? 'Archive this partner account? Historical purchases and sales will remain in reports.'
            : 'این حساب شریک بایگانی شود؟ خریدها و فروش‌های قبلی در گزارش‌ها باقی می‌مانند.');
        if (!confirmed)
            return;
        const currentPartners = latestDataRef.current.partners || [];
        const updatedPartners = currentPartners.map((partner) => partner.id === id
            ? { ...partner, isDeleted: true, status: 'inactive' as const, updatedAt: new Date().toISOString() }
            : partner);
        const committed = await persistData({ partners: updatedPartners });
        if (!committed)
            return;
        addToast(settings.language === 'english' ? 'Partner archived.' : 'شریک بایگانی شد.', 'warning');
    };
    const addPartnerLedgerEntry = async (partnerId: string, entry: Omit<PartnerLedgerEntry, 'id'>) => {
        if (!ensureWritable('addPartnerLedgerEntry'))
            return;
        const amount = toSafeNumber(entry.amount, 0);
        if (!partnerId || amount <= 0) {
            addToast(settings.language === 'english' ? 'Choose a partner and valid amount.' : 'یک شریک و مبلغ معتبر انتخاب کنید.', 'error');
            return;
        }
        const newEntry: PartnerLedgerEntry = {
            ...entry,
            id: createUniqueId('partner-ledger'),
            date: entry.date || new Date().toISOString().split('T')[0],
            amount,
            description: toTrimmedText(entry.description) || (settings.language === 'english' ? 'Manual partner entry' : 'ثبت دستی شریک'),
            recordedBy: entry.recordedBy || activeAppUser?.name || user?.name
        };
        const currentPartners = latestDataRef.current.partners || [];
        const updatedPartners = currentPartners.map((partner) => partner.id === partnerId
            ? {
                ...partner,
                ledger: [...(partner.ledger || []), newEntry],
                updatedAt: new Date().toISOString()
            }
            : partner);
        // Part 12D correctness fix (census finding 12C-E/2). A bare persistData({ partners }) here
        // reached the backend_v2 seam as a SLICE DIFF, which can only see "the partners array
        // changed" and so emitted a `partner` UPSERT — the whole partner row with the ledger nested
        // inside it. Under last-writer-wins two devices appending entries clobbered each other with
        // no conflict signal, so entries silently disappeared. Naming the operation lets the
        // forward-mapper emit the append-only `partner_ledger_entry` intent instead.
        //
        // supabase_hybrid is deliberately left on the original bare persistData: that path is the
        // live default for real users, it has no ledger-entry endpoint, and this Part does not change
        // its behaviour by so much as a field.
        const committed = await persistData({ partners: updatedPartners });
        if (!committed)
            return;
        addToast(settings.language === 'english' ? 'Partner ledger entry saved.' : 'سند دفتر شریک ذخیره شد.', 'success');
    };
    // ── Treasury handlers ────────────────────────────────────────────────────────────────────────
    //
    // THE SECURITY FIX. Treasury used to persist to two BARE, UNSCOPED localStorage keys
    // ('warekeep_treasury_transactions' / '..._cash_counts') written imperatively from inside a
    // setState updater, loaded once on mount with `[]` deps, and never cleared on logout. Every
    // account on the device shared one cash ledger: user B saw user A's money.
    //
    // Treasury is now an ordinary FullData slice. It persists through the ALREADY user-scoped store
    // (storageService getLocalBackupKey -> `warekeep_<userId>_full_backup` + the per-user Electron
    // disk store) and is cleared by resetToLoggedOutState like every other slice. Nothing here writes
    // the legacy keys any more — they are read-only history owned by treasuryLocal.ts.
    //
    // The backend_v2/legacy split MIRRORS addPartnerLedgerEntry above, for the same reason: a bare
    // persistData({ treasuryTransactions }) would reach the backend_v2 seam as a SLICE DIFF, and
    // mutationsForSliceDiff has no treasury case — it would return `unsupported` and the write would
    // surface as an error rather than an intent. Naming the operation lets the forward-mapper emit
    // the append-only treasury_movement intent. supabase_hybrid (the live default) stays on the bare
    // persistData: treasury has no legacy REST endpoint and never had one.
    const addTreasuryTransaction = (txData: Omit<TreasuryTransaction, 'id'>) => {
        const newTx: TreasuryTransaction = { ...txData, id: createUniqueId('ttx') };
        // Currency exchange submits two transactions, and cash reconciliation submits a
        // count plus an adjustment in one event. Read the latest snapshot only after the
        // preceding treasury commit finishes so neither write replaces its sibling.
        void enqueueSerialMutation(treasuryCommitQueueRef, async () => {
            const updated = [...(latestDataRef.current.treasuryTransactions || []), newTx];
            const committed = await persistData({ treasuryTransactions: updated });
            if (!committed)
                return;
            addToast(settings.language === 'english' ? 'Transaction recorded' : 'تراکنش ثبت شد', 'success');
        });
    };
    const addTreasuryCashCount = (ccData: Omit<TreasuryCashCount, 'id'>) => {
        const newCc: TreasuryCashCount = { ...ccData, id: createUniqueId('tcc') };
        void enqueueSerialMutation(treasuryCommitQueueRef, async () => {
            const updated = [...(latestDataRef.current.treasuryCashCounts || []), newCc];
            const committed = await persistData({ treasuryCashCounts: updated });
            if (!committed)
                return;
            addToast(settings.language === 'english' ? 'Cash count recorded' : 'شمارش نقدی ثبت شد', 'success');
        });
    };
    // ── Legacy treasury adoption (OWNER-CONFIRMED, never automatic) ──────────────────────────────
    //
    // A device that used the old build may still hold the unscoped blob. It is NOT this user's data
    // until the owner says it is: the keys carry no user or business, so adopting on sight would
    // hand one business's cash ledger to whoever signs in next — the very bug this stage closes,
    // merely relocated. So the ONLY transition is a human pressing confirm, and the only alternative
    // transition is a human pressing decline. Nothing auto-adopts and nothing auto-purges.
    const treasuryAdoptionScope = useMemo<TreasuryScope | null>(() => {
        if (!user?.id)
            return null;
        return { userId: user.id, deviceId: getDeviceId() };
    }, [user?.id]);
    const handleAdoptLegacyTreasury = async () => {
        if (!treasuryAdoptionScope || !legacyTreasuryPrompt)
            return;
        const blob = readLegacyTreasuryBlob();
        // Re-read and re-check under the same veto as the prompt: the state may have changed between
        // the prompt rendering and the owner pressing confirm (a sync could have delivered treasury).
        if ((latestDataRef.current.treasuryTransactions || []).length > 0 ||
            (latestDataRef.current.treasuryCashCounts || []).length > 0) {
            setLegacyTreasuryPrompt(null);
            addToast(settings.language === 'english'
                ? 'Treasury already has data on this account; the older device records were not imported.'
                : 'این حساب از قبل داده خزانه دارد؛ سوابق قدیمی دستگاه وارد نشد.', 'warning');
            return;
        }
        // Committed through the ordinary user-scoped path — the adopted rows are this user's from
        // here on, and in backend_v2 they forward as treasury intents like any other movement.
        const committed = await persistData({
            treasuryTransactions: blob.transactions,
            treasuryCashCounts: blob.cashCounts
        });
        if (!committed) {
            addToast(settings.language === 'english' ? 'Import failed. Nothing was changed.' : 'ورود ناموفق بود. تغییری اعمال نشد.', 'error');
            return;
        }
        // Recorded only AFTER the commit lands: a failed adopt must be re-promptable, never silently
        // marked done. The legacy blob is deliberately left in place — purging it is gated on this
        // device's own export+import, not on adoption.
        recordLegacyTreasuryDecision(treasuryAdoptionScope, 'adopted', legacyTreasuryPrompt);
        setLegacyTreasuryPrompt(null);
        addToast(settings.language === 'english'
            ? `Imported ${legacyTreasuryPrompt.transactionCount} transactions and ${legacyTreasuryPrompt.cashCountCount} cash counts.`
            : `${legacyTreasuryPrompt.transactionCount} تراکنش و ${legacyTreasuryPrompt.cashCountCount} شمارش نقدی وارد شد.`, 'success');
    };
    const handleDeclineLegacyTreasury = () => {
        if (!treasuryAdoptionScope || !legacyTreasuryPrompt)
            return;
        // Declining records a decision but destroys NOTHING: the blob stays on disk for whoever it
        // does belong to, and for the OA-1 export.
        recordLegacyTreasuryDecision(treasuryAdoptionScope, 'declined', legacyTreasuryPrompt);
        setLegacyTreasuryPrompt(null);
    };
    const resolveActorMeta = () => ({
        actorId: activeAppUser?.id || user?.id || 'system',
        actorName: activeAppUser?.name || user?.name || 'System'
    });
    const appendAuditTrail = (trail: Purchase['auditTrail'] | Supplier['auditTrail'], action: string, note?: string) => {
        const { actorId, actorName } = resolveActorMeta();
        return [
            ...(trail || []),
            {
                id: createUniqueId('audit'),
                action,
                date: new Date().toISOString(),
                actorId,
                actorName,
                note
            }
        ];
    };
    const summarizeBatchState = (batch?: Partial<Batch> | null) => {
        if (!batch)
            return 'No batch state';
        const safeQuantity = typeof batch.quantity === 'number' ? batch.quantity : 0;
        const safeReceived = typeof batch.receivedQuantity === 'number' ? batch.receivedQuantity : safeQuantity;
        return [
            `batch=${batch.batchNumber || batch.id || '-'}`,
            `qty=${safeQuantity}`,
            `received=${safeReceived}`,
            `expiry=${batch.expiryDate || '-'}`,
            `supplier=${batch.supplierId || '-'}`,
            `purchase=${batch.purchaseId || '-'}`,
            `trace=${batch.traceSource || 'legacy'}`
        ].join(' | ');
    };
    const summarizePurchaseState = (purchase?: Partial<Purchase> | null) => {
        if (!purchase)
            return 'No purchase state';
        const normalized = normalizePurchaseRecord({
            supplierId: purchase.supplierId || '',
            items: purchase.items || [],
            totalAmount: typeof purchase.totalAmount === 'number' ? purchase.totalAmount : 0,
            paidAmount: typeof purchase.paidAmount === 'number' ? purchase.paidAmount : 0,
            remainingAmount: typeof purchase.remainingAmount === 'number' ? purchase.remainingAmount : 0,
            status: purchase.status || 'draft',
            date: purchase.date || new Date().toISOString(),
            ...purchase
        } as Purchase);
        return [
            `purchase=${normalized.invoiceNumber || normalized.id || '-'}`,
            `workflow=${normalized.workflowStatus || '-'}`,
            `receipt=${normalized.receiptStatus || '-'}`,
            `total=${normalized.totalAmount}`,
            `paid=${normalized.paidAmount}`,
            `credited=${normalized.creditedAmount || 0}`,
            `remaining=${normalized.remainingAmount}`
        ].join(' | ');
    };
    // NEW: Audit Trail entry factory with actor fallback for low-risk, append-only logging.
    const createDomainAuditEntry = (entry: Omit<DomainAuditEntry, 'id' | 'timestamp' | 'actorId' | 'actorName'>): DomainAuditEntry => {
        const { actorId, actorName } = resolveActorMeta();
        return {
            ...entry,
            id: createUniqueId('domain-audit'),
            timestamp: new Date().toISOString(),
            actorId,
            actorName
        };
    };
    const getSupplierOpeningBalance = (supplier: Supplier) => {
        if (typeof supplier.openingBalance === 'number')
            return supplier.openingBalance;
        const runningDelta = (supplier.transactions || []).reduce((sum, txn) => {
            const amount = typeof txn.amount === 'number' ? txn.amount : 0;
            return sum + ((txn.type === 'purchase' || txn.type === 'initial') ? amount : -amount);
        }, 0);
        return (typeof supplier.balance === 'number' ? supplier.balance : 0) - runningDelta;
    };
    const rebuildSupplierLedger = (supplier: Supplier, transactions: Supplier['transactions'], meta?: Partial<Supplier>): Supplier => {
        const openingBalance = getSupplierOpeningBalance(supplier);
        let running = openingBalance;
        const rebuiltTransactions = (transactions || []).map((txn) => {
            const amount = typeof txn.amount === 'number' ? Math.max(0, txn.amount) : 0;
            running += (txn.type === 'purchase' || txn.type === 'initial') ? amount : -amount;
            return { ...txn, amount, balanceAfter: running };
        });
        return {
            ...supplier,
            ...meta,
            openingBalance,
            balance: running,
            transactions: rebuiltTransactions
        };
    };
    const createSupplierTransaction = (entry: Omit<Supplier['transactions'][number], 'id' | 'balanceAfter' | 'recordedBy'> & {
        id?: string;
        recordedBy?: string;
    }): Supplier['transactions'][number] => {
        const { actorName } = resolveActorMeta();
        return {
            ...entry,
            id: entry.id || createUniqueId('txn'),
            amount: typeof entry.amount === 'number' ? Math.max(0, entry.amount) : 0,
            balanceAfter: 0,
            recordedBy: entry.recordedBy || actorName
        };
    };
    // NEW: Supplier Ledger aggregation is derived from purchases, payments, and vendor credits.
    const buildPurchaseLedgerEntries = (purchaseRecord: Purchase) => {
        if (!purchaseAffectsSupplierLedger(purchaseRecord))
            return [] as Supplier['transactions'];
        const purchaseLabel = purchaseRecord.invoiceNumber || purchaseRecord.id.slice(-6);
        const baseEntries: Supplier['transactions'] = [
            createSupplierTransaction({
                date: purchaseRecord.receivedAt || purchaseRecord.date,
                type: 'purchase',
                amount: purchaseRecord.totalAmount,
                description: tr(`Purchase invoice #${purchaseLabel}`, `فاکتور خرید #${purchaseLabel}`),
                referenceId: purchaseRecord.id,
                dueDate: purchaseRecord.dueDate,
                note: purchaseRecord.notes
            })
        ];
        const paymentEntries = (purchaseRecord.payments || [])
            .filter((payment) => typeof payment.amount === 'number' && payment.amount > 0)
            .map((payment) => createSupplierTransaction({
            date: payment.date || purchaseRecord.date,
            type: 'payment',
            amount: payment.amount,
            description: tr(`Payment for purchase invoice #${purchaseLabel}`, `پرداخت فاکتور خرید #${purchaseLabel}`),
            referenceId: purchaseRecord.id,
            method: payment.method,
            dueDate: purchaseRecord.dueDate,
            note: payment.note,
            recordedBy: payment.recordedBy
        }));
        const vendorCreditEntries = (purchaseRecord.vendorCredits || [])
            .filter((credit) => typeof credit.amount === 'number' && credit.amount > 0)
            .map((credit) => createSupplierTransaction({
            date: credit.date || purchaseRecord.updatedAt || purchaseRecord.date,
            type: 'vendor_credit',
            amount: credit.amount,
            description: tr(`Purchase credit/return #${purchaseLabel}`, `اعتبار/مرجوعی خرید #${purchaseLabel}`),
            referenceId: purchaseRecord.id,
            purchaseId: purchaseRecord.id,
            vendorCreditId: credit.id,
            batchId: credit.batchId,
            note: credit.note,
            recordedBy: credit.recordedBy
        }));
        return [...baseEntries, ...paymentEntries, ...vendorCreditEntries];
    };
    const syncMedicineDetailsIntoPurchases = (purchaseList: Purchase[], medicine: Medicine | null, nowIso: string): Purchase[] => {
        if (!medicine)
            return purchaseList;
        return purchaseList.map((purchaseRecord) => {
            let changed = false;
            const items = (purchaseRecord.items || []).map((item) => {
                if (item.medicineId !== medicine.id)
                    return item;
                changed = true;
                return {
                    ...item,
                    medicineName: medicine.name,
                    barcode: medicine.barcode || undefined,
                    unit: medicine.unit || item.unit,
                    purchaseUnitName: medicine.unit || item.purchaseUnitName || item.unit,
                    baseUnit: medicine.baseUnit || medicine.unit || item.baseUnit,
                };
            });
            return changed
                ? normalizePurchaseRecord({ ...purchaseRecord, items, updatedAt: nowIso })
                : purchaseRecord;
        });
    };
    const syncBatchDetailsIntoPurchases = (purchaseList: Purchase[], medicine: Medicine | null, batch: Batch | null, nowIso: string, syncTargets: InventoryLinkedSyncTargets = DEFAULT_INVENTORY_LINKED_SYNC_TARGETS): Purchase[] => {
        if (!medicine || !batch?.purchaseId)
            return purchaseList;
        if (!syncTargets.purchases && !syncTargets.partnerships)
            return purchaseList;
        const purchaseItemIndex = typeof batch.purchaseItemIndex === 'number' ? batch.purchaseItemIndex : -1;
        const purchaseLineId = String(batch.purchaseLineId || '').trim();
        const baseQuantity = Math.max(0, typeof batch.receivedQuantity === 'number' ? batch.receivedQuantity : batch.quantity);
        const baseUnitCost = Math.max(0, batch.purchasePrice || 0);
        return purchaseList.map((purchaseRecord) => {
            if (purchaseRecord.id !== batch.purchaseId)
                return purchaseRecord;
            let matchedItem = false;
            const items = (purchaseRecord.items || []).map((item, index) => {
                const isMatch = purchaseLineId
                    ? item.lineId === purchaseLineId
                    : purchaseItemIndex >= 0
                        ? index === purchaseItemIndex
                        : item.medicineId === medicine.id && item.batchNumber === batch.batchNumber;
                if (!isMatch)
                    return item;
                matchedItem = true;
                const conversionFactor = Math.max(1, Number(item.purchaseUnitConversionFactor || 1) || 1);
                const quantity = baseQuantity / conversionFactor;
                const purchasePrice = baseUnitCost * conversionFactor;
                const ownerPartnerId = batch.ownerPartnerId || undefined;
                const nextItem = { ...item };
                if (syncTargets.purchases) {
                    Object.assign(nextItem, {
                        medicineId: medicine.id,
                        lineId: item.lineId || purchaseLineId || undefined,
                        medicineName: medicine.name,
                        barcode: medicine.barcode || undefined,
                        unit: medicine.unit || item.unit,
                        purchaseUnitName: medicine.unit || item.purchaseUnitName || item.unit,
                        purchaseUnitConversionFactor: conversionFactor,
                        baseUnit: medicine.baseUnit || medicine.unit || item.baseUnit,
                        batchNumber: batch.batchNumber,
                        expiryDate: batch.expiryDate,
                        quantity,
                        baseQuantity,
                        purchasePrice,
                        lineTotal: baseQuantity * baseUnitCost,
                        sourceDocumentNumber: batch.sourceDocumentNumber || item.sourceDocumentNumber,
                    });
                }
                if (syncTargets.partnerships) {
                    Object.assign(nextItem, {
                        partnerId: ownerPartnerId,
                        ownerPartnerId,
                        stockEntryType: batch.sourceEntryType || (ownerPartnerId ? 'partner_goods_capital' : 'store_purchase'),
                        ownershipType: batch.ownershipType || (ownerPartnerId ? 'partner' : 'store'),
                        agreedPartnerValue: ownerPartnerId ? batch.agreedPartnerValue : undefined,
                        suggestedSalePrice: ownerPartnerId ? batch.suggestedSalePrice : undefined,
                    });
                }
                return nextItem;
            });
            if (!matchedItem)
                return purchaseRecord;
            let receiptQuantityAssigned = false;
            const receipts = (purchaseRecord.receipts || []).map((receipt) => ({
                ...receipt,
                items: (receipt.items || []).map((item) => {
                    const isMatch = ((batch.sourceReceiptId && receipt.id === batch.sourceReceiptId)
                        || !batch.sourceReceiptId) && (item.batchId === batch.id
                        || (purchaseItemIndex >= 0 && item.purchaseItemIndex === purchaseItemIndex)
                        || (item.medicineId === medicine.id && (item.batchNumber || batch.batchNumber) === batch.batchNumber));
                    if (!isMatch)
                        return item;
                    const ownerPartnerId = batch.ownerPartnerId || undefined;
                    const nextReceiptItem = { ...item };
                    if (syncTargets.purchases) {
                        const nextQuantity = receiptQuantityAssigned ? 0 : baseQuantity;
                        receiptQuantityAssigned = true;
                        Object.assign(nextReceiptItem, {
                            medicineId: medicine.id,
                            lineId: item.lineId || purchaseLineId || nextReceiptItem.lineId,
                            purchaseItemIndex: purchaseItemIndex >= 0 ? purchaseItemIndex : item.purchaseItemIndex,
                            batchId: item.batchId || batch.id,
                            batchNumber: batch.batchNumber,
                            expiryDate: batch.expiryDate,
                            quantity: nextQuantity,
                            baseQuantity: nextQuantity,
                            purchasePrice: baseUnitCost,
                            supplierId: batch.supplierId || purchaseRecord.supplierId,
                            sourceDocumentNumber: batch.sourceDocumentNumber || item.sourceDocumentNumber,
                        });
                    }
                    if (syncTargets.partnerships) {
                        Object.assign(nextReceiptItem, {
                            partnerId: ownerPartnerId,
                            ownerPartnerId,
                            stockEntryType: batch.sourceEntryType,
                            ownershipType: batch.ownershipType,
                            agreedPartnerValue: ownerPartnerId ? batch.agreedPartnerValue : undefined,
                            suggestedSalePrice: ownerPartnerId ? batch.suggestedSalePrice : undefined,
                        });
                    }
                    return nextReceiptItem;
                }),
            }));
            const singleItemPurchase = (purchaseRecord.items || []).length === 1;
            return normalizePurchaseRecord({
                ...purchaseRecord,
                supplierId: syncTargets.purchases ? (batch.supplierId || purchaseRecord.supplierId) : purchaseRecord.supplierId,
                partnerId: syncTargets.partnerships && singleItemPurchase ? batch.ownerPartnerId : purchaseRecord.partnerId,
                stockEntryType: syncTargets.partnerships && singleItemPurchase ? batch.sourceEntryType : purchaseRecord.stockEntryType,
                ownershipType: syncTargets.partnerships && singleItemPurchase ? batch.ownershipType : purchaseRecord.ownershipType,
                items,
                receipts,
                updatedAt: nowIso,
            });
        });
    };
    const rebuildSuppliersForSyncedPurchases = (supplierList: Supplier[], previousPurchases: Purchase[], nextPurchases: Purchase[], purchaseIds: string[], nowIso: string): Supplier[] => {
        const affectedIds = new Set(purchaseIds.filter(Boolean));
        if (affectedIds.size === 0)
            return supplierList;
        const previousById = new Map(previousPurchases.map((purchaseRecord) => [purchaseRecord.id, purchaseRecord]));
        const nextById = new Map(nextPurchases.map((purchaseRecord) => [purchaseRecord.id, purchaseRecord]));
        const supplierIds = new Set<string>();
        affectedIds.forEach((purchaseId) => {
            const previous = previousById.get(purchaseId);
            const next = nextById.get(purchaseId);
            if (previous?.supplierId)
                supplierIds.add(previous.supplierId);
            if (next?.supplierId)
                supplierIds.add(next.supplierId);
        });
        return supplierList.map((supplier) => {
            if (!supplierIds.has(supplier.id))
                return supplier;
            const retainedTransactions = (supplier.transactions || []).filter((transaction) => {
                const referenceId = transaction.purchaseId || transaction.referenceId || '';
                return !affectedIds.has(referenceId);
            });
            const rebuiltEntries = Array.from(affectedIds).flatMap((purchaseId) => {
                const next = nextById.get(purchaseId);
                return next?.supplierId === supplier.id ? buildPurchaseLedgerEntries(next) : [];
            });
            const lastPurchase = Array.from(affectedIds).map((purchaseId) => nextById.get(purchaseId)).find(Boolean);
            return rebuildSupplierLedger(supplier, [...retainedTransactions, ...rebuiltEntries], {
                lastPurchaseDate: lastPurchase?.date || supplier.lastPurchaseDate,
                lastInteractionDate: nowIso,
                updatedAt: nowIso,
            });
        });
    };
    const findExistingPurchaseBatchForEntry = (medicineList: Medicine[], purchaseId: string, entry: {
        medicineId: string;
        batch: Partial<Batch>;
    }, index: number): Batch | undefined => {
        const entryIndex = typeof entry.batch.purchaseItemIndex === 'number' ? entry.batch.purchaseItemIndex : index;
        const entryLineId = String(entry.batch.purchaseLineId || '').trim();
        return medicineList
            .flatMap((medicine) => (medicine.batches || []).map((batch) => ({ medicineId: medicine.id, batch })))
            .find(({ medicineId, batch }) => (medicineId === entry.medicineId
            && batch.purchaseId === purchaseId
            && ((entry.batch.id && batch.id === entry.batch.id)
                || (entryLineId && batch.purchaseLineId === entryLineId)
                || (typeof batch.purchaseItemIndex === 'number' && batch.purchaseItemIndex === entryIndex)
                || (batch.batchNumber === entry.batch.batchNumber
                    && (!entry.batch.expiryDate || batch.expiryDate === entry.batch.expiryDate)))))?.batch;
    };
    // NEW: Purchase stock application is planned by InventoryTransactionService; supplier ledger stays here.
    const applyPurchaseEffects = (purchaseRecord: Purchase, incomingBatches: {
        medicineId: string;
        batch: Omit<Batch, 'id' | 'history'>;
    }[], baseMedicines: Medicine[], baseSuppliers: Supplier[], baseStockMovements: StockMovement[] = []) => {
        const nowIso = new Date().toISOString();
        const { actorName } = resolveActorMeta();
        const affectsInventory = purchaseAffectsInventory(purchaseRecord);
        const plannedMedicines = !affectsInventory
            ? baseMedicines
            : buildPurchaseApplyMedicineSnapshot({
                medicines: baseMedicines,
                purchase: purchaseRecord,
                incomingBatches,
                createdAt: nowIso,
                createBatchId: () => createUniqueId('batch'),
            });
        const stockTransaction = affectsInventory
            ? applyInventorySnapshotTransaction({
                medicines: baseMedicines,
                stockMovements: baseStockMovements,
                nextMedicines: plannedMedicines,
                type: purchaseRecord.receipts?.length ? 'purchase_receipt' : 'purchase_apply',
                referenceType: purchaseRecord.receipts?.length ? 'purchase_receipt' : 'purchase',
                referenceId: purchaseRecord.receipts?.[0]?.id || purchaseRecord.id,
                idempotencyScope: `${purchaseRecord.receipts?.length ? 'purchase-receipt' : 'purchase-apply'}:${purchaseRecord.id}:${purchaseRecord.receipts?.[0]?.id || 'initial'}`,
                createdAt: nowIso,
                metadata: {
                    purchaseId: purchaseRecord.id,
                    invoiceNumber: purchaseRecord.invoiceNumber,
                },
                history: {
                    action: purchaseRecord.receipts?.length ? 'purchase_receipt' : 'purchase_apply',
                    details: `Purchase #${purchaseRecord.invoiceNumber || purchaseRecord.id.slice(-6)} applied`,
                },
            })
            : {
                medicines: plannedMedicines,
                stockMovements: baseStockMovements,
                appendedMovements: [],
                skippedIdempotencyKeys: [],
            };
        const updatedMedicines = stockTransaction.medicines;
        const updatedSuppliers = baseSuppliers.map((supplier) => {
            if (supplier.id !== purchaseRecord.supplierId)
                return supplier;
            const ledgerEntries = buildPurchaseLedgerEntries(purchaseRecord);
            const nextSupplier = rebuildSupplierLedger(supplier, [...(supplier.transactions || []), ...ledgerEntries], {
                lastPurchaseDate: purchaseRecord.date,
                lastInteractionDate: nowIso,
                updatedAt: nowIso,
                updatedBy: actorName,
                auditTrail: appendAuditTrail(supplier.auditTrail, 'purchase_applied', `ف?اکتور ${purchaseRecord.invoiceNumber || purchaseRecord.id.slice(-6)} اعمال شد`)
            });
            return nextSupplier;
        });
        return { updatedMedicines, updatedSuppliers, updatedStockMovements: stockTransaction.stockMovements };
    };
    const rollbackPurchaseEffects = (purchaseRecord: Purchase, baseMedicines: Medicine[], baseSuppliers: Supplier[], reason: 'update' | 'delete', baseStockMovements: StockMovement[] = []) => {
        const nowIso = new Date().toISOString();
        const { actorName } = resolveActorMeta();
        const affectsInventory = purchaseAffectsInventory(purchaseRecord);
        const affectsSupplierLedger = purchaseAffectsSupplierLedger(purchaseRecord);
        const plannedMedicines = !affectsInventory
            ? baseMedicines
            : buildPurchaseRollbackMedicineSnapshot({
                medicines: baseMedicines,
                purchase: purchaseRecord,
                createdAt: nowIso,
            });
        const stockTransaction = affectsInventory
            ? applyInventorySnapshotTransaction({
                medicines: baseMedicines,
                stockMovements: baseStockMovements,
                nextMedicines: plannedMedicines,
                type: reason === 'delete' ? 'purchase_delete_reversal' : 'purchase_update_reversal',
                referenceType: reason === 'delete' ? 'purchase_delete' : 'purchase',
                referenceId: purchaseRecord.id,
                idempotencyScope: `purchase-${reason}-reversal:${purchaseRecord.id}:${nowIso}`,
                createdAt: nowIso,
                includeRemovedBatches: true,
                metadata: {
                    purchaseId: purchaseRecord.id,
                    invoiceNumber: purchaseRecord.invoiceNumber,
                    reason,
                },
                history: {
                    action: reason === 'delete' ? 'purchase_delete_reversal' : 'purchase_update_reversal',
                    details: `Purchase #${purchaseRecord.invoiceNumber || purchaseRecord.id.slice(-6)} rolled back for ${reason}`,
                },
            })
            : {
                medicines: plannedMedicines,
                stockMovements: baseStockMovements,
                appendedMovements: [],
                skippedIdempotencyKeys: [],
            };
        const updatedMedicines = stockTransaction.medicines;
        const updatedSuppliers = baseSuppliers.map((supplier) => {
            if (supplier.id !== purchaseRecord.supplierId)
                return supplier;
            const currentTransactions = supplier.transactions || [];
            const filteredTransactions = affectsSupplierLedger
                ? currentTransactions.filter((txn) => txn.referenceId !== purchaseRecord.id)
                : currentTransactions;
            const removedCount = currentTransactions.length - filteredTransactions.length;
            const fallbackTransactions = affectsSupplierLedger && removedCount === 0 && purchaseRecord.remainingAmount > 0
                ? [
                    createSupplierTransaction({
                        date: nowIso,
                        type: 'return',
                        amount: purchaseRecord.remainingAmount,
                        description: reason === 'delete'
                            ? tr(`Purchase invoice #${purchaseRecord.invoiceNumber || purchaseRecord.id.slice(-6)} canceled`, `ابطال فاکتور خرید #${purchaseRecord.invoiceNumber || purchaseRecord.id.slice(-6)}`)
                            : tr(`Reversal for editing invoice #${purchaseRecord.invoiceNumber || purchaseRecord.id.slice(-6)}`, `برگشت جهت ویرایش فاکتور #${purchaseRecord.invoiceNumber || purchaseRecord.id.slice(-6)}`),
                        referenceId: purchaseRecord.id,
                        note: reason === 'delete' ? 'Purchase deleted' : 'Purchase updated'
                    })
                ]
                : [];
            return rebuildSupplierLedger(supplier, [...filteredTransactions, ...fallbackTransactions], {
                lastInteractionDate: nowIso,
                updatedAt: nowIso,
                updatedBy: actorName,
                auditTrail: appendAuditTrail(supplier.auditTrail, reason === 'delete' ? 'purchase_deleted' : 'purchase_rolled_back', `ف?اکتور ${purchaseRecord.invoiceNumber || purchaseRecord.id.slice(-6)} ${reason === 'delete' ? 'حذف?' : 'برگشت داده'} شد`)
            });
        });
        return { updatedMedicines, updatedSuppliers, updatedStockMovements: stockTransaction.stockMovements };
    };
    const addSupplier = async (supplierData: Omit<Supplier, 'id'>) => {
        if (!ensureWritable('addSupplier'))
            return;
        const nowIso = new Date().toISOString();
        const { actorName } = resolveActorMeta();
        const openingBalance = typeof supplierData.openingBalance === 'number'
            ? supplierData.openingBalance
            : (typeof supplierData.balance === 'number' ? supplierData.balance : 0);
        const newSupplier: Supplier = {
            ...supplierData,
            id: (supplierData as Partial<Supplier>).id || createUniqueId('sup'),
            openingBalance,
            balance: openingBalance,
            status: supplierData.status || 'active',
            transactions: Array.isArray(supplierData.transactions) ? supplierData.transactions : [],
            createdAt: nowIso,
            createdBy: actorName,
            updatedAt: nowIso,
            updatedBy: actorName,
            lastInteractionDate: nowIso,
            auditTrail: appendAuditTrail(supplierData.auditTrail, 'created', `تأمین‌کننده ${supplierData.name} ایجاد شد`)
        };
        const currentSuppliers = latestDataRef.current.suppliers || [];
        const updatedSuppliers = [...currentSuppliers, newSupplier];
        await persistData({ suppliers: updatedSuppliers });
    };
    const updateSupplier = async (id: string, data: Partial<Supplier>) => {
        if (!ensureWritable('updateSupplier'))
            return;
        const nowIso = new Date().toISOString();
        const { actorName } = resolveActorMeta();
        const currentSuppliers = latestDataRef.current.suppliers || [];
        const updatedSuppliers = currentSuppliers.map((supplier) => {
            if (supplier.id !== id)
                return supplier;
            const mergedSupplier: Supplier = {
                ...supplier,
                ...data,
                updatedAt: nowIso,
                updatedBy: actorName,
                auditTrail: appendAuditTrail(supplier.auditTrail, 'updated', `اطلاعات تأمین‌کننده ${supplier.name} ویرایش شد`)
            };
            return rebuildSupplierLedger(mergedSupplier, mergedSupplier.transactions || [], mergedSupplier);
        });
        await persistData({ suppliers: updatedSuppliers });
    };
    const deleteSupplier = async (id: string, mode: SupplierDeleteMode = 'conditional') => {
        if (!ensureWritable('deleteSupplier'))
            return;
        const nowIso = new Date().toISOString();
        const { actorName } = resolveActorMeta();
        const currentSuppliers = latestDataRef.current.suppliers || [];
        const currentMedicines = latestDataRef.current.medicines || [];
        const currentPurchases = latestDataRef.current.purchases || [];
        const currentInvoices = latestDataRef.current.invoices || [];
        const supplier = currentSuppliers.find((entry) => entry.id === id);
        if (!supplier)
            return;
        const supplierPurchaseIds = new Set(currentPurchases.filter((purchase) => purchase.supplierId === id).map((purchase) => purchase.id));
        const supplierBatchIds = new Set<string>();
        currentMedicines.forEach((medicine) => {
            (medicine.batches || []).forEach((batch) => {
                if (batch.supplierId === id || (batch.purchaseId && supplierPurchaseIds.has(batch.purchaseId))) {
                    supplierBatchIds.add(batch.id);
                }
            });
        });
        const dependentSalesCount = currentInvoices.filter((invoice) => !invoice.isDeleted).reduce((count, invoice) => (count + (invoice.items || []).filter((item) => item.batchId && supplierBatchIds.has(item.batchId)).length), 0);
        if (mode === 'purge' && dependentSalesCount > 0) {
            addToast("این تأمین‌کننده در ف?روش‌های ثبت‌شده استف?اده شده است. اول ف?روش‌های وابسته را حذف? یا برگشت بزنید، بعد حذف? کامل را اجرا کنید.", "error");
            return;
        }
        const hasTrace = (supplierPurchaseIds.size > 0
            || supplierBatchIds.size > 0
            || (supplier.transactions || []).length > 0
            || (supplier.openingBalance || 0) !== 0
            || (supplier.balance || 0) !== 0
            || currentMedicines.some((medicine) => medicine.preferredSupplierId === id));
        const shouldPurge = mode === 'purge' || !hasTrace;
        const nextMedicines = currentMedicines.map((medicine) => ({
            ...medicine,
            preferredSupplierId: medicine.preferredSupplierId === id ? undefined : medicine.preferredSupplierId,
            batches: shouldPurge
                ? (medicine.batches || []).filter((batch) => !(batch.supplierId === id || (batch.purchaseId && supplierPurchaseIds.has(batch.purchaseId))))
                : (medicine.batches || [])
        }));
        const nextPurchases = shouldPurge
            ? currentPurchases.filter((purchase) => purchase.supplierId !== id)
            : currentPurchases;
        const nextSuppliers: Supplier[] = shouldPurge
            ? currentSuppliers.filter((entry) => entry.id !== id)
            : currentSuppliers.map((entry) => entry.id === id
                ? {
                    ...entry,
                    isDeleted: true,
                    status: 'inactive',
                    updatedAt: nowIso,
                    updatedBy: actorName,
                    auditTrail: appendAuditTrail(entry.auditTrail, 'archived', `تأمین‌کننده ${entry.name} آرشیف? شد`)
                }
                : entry);
        const localSnapshot = {
            medicines: nextMedicines,
            purchases: nextPurchases,
            suppliers: nextSuppliers
        };
        await persistData(localSnapshot);
    };
    // NEW: Purchase creation supports receipt-aware stock posting without changing legacy purchase drafts.
    const addPurchase = async (purchase: Omit<Purchase, 'id'>, newBatches: {
        medicineId: string;
        batch: Omit<Batch, 'id' | 'history'>;
    }[]): Promise<boolean> => {
        if (!ensureWritable('addPurchase'))
            return false;
        if (!(await refreshLatestDataFromDiskForStockWrite('addPurchase')))
            return false;
        const nowIso = new Date().toISOString();
        const { actorName } = resolveActorMeta();
        const currentMedicines = latestDataRef.current.medicines || [];
        const currentSuppliers = latestDataRef.current.suppliers || [];
        const currentPurchases = latestDataRef.current.purchases || [];
        const currentStockMovements = latestDataRef.current.stockMovements || [];
        const newPurchase = normalizePurchaseRecord({
            ...purchase,
            id: (purchase as Partial<Purchase>).id || createUniqueId('pur'),
            createdAt: nowIso,
            createdBy: actorName,
            updatedAt: nowIso,
            updatedBy: actorName,
            workflowStatus: resolvePurchaseWorkflowStatus(purchase.workflowStatus, purchase.status),
            inventoryCommitted: typeof purchase.inventoryCommitted === 'boolean'
                ? purchase.inventoryCommitted && resolvePurchaseWorkflowStatus(purchase.workflowStatus, purchase.status) === 'received'
                : (resolvePurchaseWorkflowStatus(purchase.workflowStatus, purchase.status) === 'received'),
            auditTrail: appendAuditTrail(purchase.auditTrail, 'created', 'ف?اکتور خرید ایجاد شد')
        });
        const batchSeed = newBatches.length > 0
            ? newBatches
            : buildPurchaseBatchPayload(newPurchase.supplierId, newPurchase.items, {
                destinationWarehouse: newPurchase.destinationWarehouse,
                ownerPartnerId: newPurchase.partnerId,
                ownershipType: newPurchase.ownershipType || (newPurchase.partnerId ? 'partner' : 'store'),
                sourceEntryType: newPurchase.stockEntryType || 'store_purchase',
            });
        const preparedBatches = batchSeed.map((entry, index) => ({
            medicineId: entry.medicineId,
            batch: (() => {
                const entryBatch = entry.batch as Partial<Batch>;
                return {
                    ...entry.batch,
                    id: entryBatch.id || createUniqueId('batch'),
                    purchaseLineId: entryBatch.purchaseLineId,
                    purchaseItemIndex: entryBatch.purchaseItemIndex ?? index,
                    history: entryBatch.history
                };
            })()
        }));
        const batchIntegrityIssues = validatePurchaseBatchPayloadIntegrity(newPurchase, preparedBatches);
        if (batchIntegrityIssues.length > 0) {
            addToast("ذخیره خرید متوقف شد: تعداد سطرهای دریافت‌شده با batchهای ساخته‌شده برابر نیست", "error");
            return false;
        }
        const { updatedMedicines, updatedSuppliers, updatedStockMovements } = applyPurchaseEffects(newPurchase, preparedBatches as {
            medicineId: string;
            batch: Omit<Batch, 'id' | 'history'>;
        }[], currentMedicines, currentSuppliers, currentStockMovements);
        const auditEntries: DomainAuditEntry[] = [
            createDomainAuditEntry({
                action: 'purchase.created',
                entityType: 'purchase',
                entityId: newPurchase.id,
                afterSummary: summarizePurchaseState(newPurchase),
                note: 'Purchase document created'
            })
        ];
        if (purchaseAffectsInventory(newPurchase)) {
            auditEntries.push(createDomainAuditEntry({
                action: 'purchase.receipt_applied',
                entityType: 'purchase_receipt',
                entityId: newPurchase.id,
                afterSummary: `receivedQty=${getPurchaseReceivedQuantity(newPurchase)} | orderedQty=${getPurchaseOrderedQuantity(newPurchase.items)}`,
                note: 'Purchase receipt affected official stock'
            }));
        }
        const committed = await persistData({
            purchases: [...currentPurchases, newPurchase],
            medicines: updatedMedicines,
            suppliers: updatedSuppliers,
            stockMovements: updatedStockMovements
        });
        if (!committed)
            return false;
        commitDomainAuditEvents(auditEntries);
        addToast(newPurchase.workflowStatus === 'draft'
            ? (purchaseAffectsInventory(newPurchase)
                ? "پیش‌نویس ف?اکتور خرید ذخیره شد"
                : "پیش‌نویس ف?اکتور خرید ذخیره شد")
            : "ف?اکتور خرید ثبت شد و موجودی گدام به‌روز شد", "success");
        return true;
    };
    // NEW: Purchase updates safely recompute partial receipt state and linked inventory effects.
    const updatePurchase = async (purchaseId: string, purchase: Omit<Purchase, 'id'>, newBatches: {
        medicineId: string;
        batch: Omit<Batch, 'id' | 'history'>;
    }[]): Promise<boolean> => {
        if (!ensureWritable('addPurchase'))
            return false;
        if (!(await refreshLatestDataFromDiskForStockWrite('updatePurchase')))
            return false;
        const currentMedicines = latestDataRef.current.medicines || [];
        const currentSuppliers = latestDataRef.current.suppliers || [];
        const currentPurchases = latestDataRef.current.purchases || [];
        const currentInvoices = latestDataRef.current.invoices || [];
        const currentStockMovements = latestDataRef.current.stockMovements || [];
        const existingPurchase = currentPurchases.find((entry) => entry.id === purchaseId);
        if (!existingPurchase)
            return false;
        const consumedPurchaseBatches = findConsumedPurchaseBatches(existingPurchase, currentMedicines);
        if (consumedPurchaseBatches.length > 0) {
            addToast(`Purchase cannot be edited because ${consumedPurchaseBatches.length} linked batch(es) already have consumed stock.`, "error");
            return false;
        }
        const nowIso = new Date().toISOString();
        const { actorName } = resolveActorMeta();
        const { updatedMedicines: rolledBackMedicines, updatedSuppliers: rolledBackSuppliers, updatedStockMovements: rolledBackStockMovements } = rollbackPurchaseEffects(existingPurchase, currentMedicines, currentSuppliers, 'update', currentStockMovements);
        const nextPurchase = normalizePurchaseRecord({
            ...purchase,
            id: purchaseId,
            createdAt: existingPurchase.createdAt || existingPurchase.date,
            createdBy: existingPurchase.createdBy,
            updatedAt: nowIso,
            updatedBy: actorName,
            inventoryCommitted: typeof purchase.inventoryCommitted === 'boolean'
                ? purchase.inventoryCommitted && resolvePurchaseWorkflowStatus(purchase.workflowStatus, purchase.status) === 'received'
                : (resolvePurchaseWorkflowStatus(purchase.workflowStatus, purchase.status) === 'received'),
            auditTrail: appendAuditTrail(existingPurchase.auditTrail, 'updated', 'ف?اکتور خرید ویرایش شد')
        });
        const batchSeed = newBatches.length > 0
            ? newBatches
            : buildPurchaseBatchPayload(nextPurchase.supplierId, nextPurchase.items, {
                destinationWarehouse: nextPurchase.destinationWarehouse,
                ownerPartnerId: nextPurchase.partnerId,
                ownershipType: nextPurchase.ownershipType || (nextPurchase.partnerId ? 'partner' : 'store'),
                sourceEntryType: nextPurchase.stockEntryType || 'store_purchase',
            });
        const preparedBatches = batchSeed.map((entry, index) => ({
            medicineId: entry.medicineId,
            batch: (() => {
                const entryBatch = entry.batch as Partial<Batch>;
                const existingLinkedBatch = findExistingPurchaseBatchForEntry(currentMedicines, purchaseId, { medicineId: entry.medicineId, batch: entryBatch }, index);
                const purchaseStockStart = nextPurchase.date || nextPurchase.receivedAt || nextPurchase.receipts?.[0]?.date || nowIso;
                const requestedBatchIdIsSafe = !entryBatch.id
                    || !hasInvoiceItemBeforeDateForBatch(entryBatch.id, currentInvoices, purchaseStockStart, entry.medicineId);
                const existingLinkedBatchIsSafe = !existingLinkedBatch
                    || !hasInvoiceItemBeforeDateForBatch(existingLinkedBatch.id, currentInvoices, purchaseStockStart, entry.medicineId);
                return {
                    ...entry.batch,
                    id: (entryBatch.id && requestedBatchIdIsSafe)
                        ? entryBatch.id
                        : (existingLinkedBatch && existingLinkedBatchIsSafe)
                            ? existingLinkedBatch.id
                            : createUniqueId('batch'),
                    purchaseLineId: entryBatch.purchaseLineId || existingLinkedBatch?.purchaseLineId,
                    purchaseItemIndex: entryBatch.purchaseItemIndex ?? existingLinkedBatch?.purchaseItemIndex ?? index,
                    history: entryBatch.history || (existingLinkedBatchIsSafe ? existingLinkedBatch?.history : undefined)
                };
            })()
        }));
        const batchIntegrityIssues = validatePurchaseBatchPayloadIntegrity(nextPurchase, preparedBatches);
        if (batchIntegrityIssues.length > 0) {
            addToast("ذخیره تغییرات خرید متوقف شد: سطر دریافت‌شده بدون batch معتبر پیدا شد", "error");
            return false;
        }
        const { updatedMedicines, updatedSuppliers, updatedStockMovements } = applyPurchaseEffects(nextPurchase, preparedBatches as {
            medicineId: string;
            batch: Omit<Batch, 'id' | 'history'>;
        }[], rolledBackMedicines, rolledBackSuppliers, rolledBackStockMovements);
        const auditEntries: DomainAuditEntry[] = [
            createDomainAuditEntry({
                action: 'purchase.updated',
                entityType: 'purchase',
                entityId: nextPurchase.id,
                beforeSummary: summarizePurchaseState(existingPurchase),
                afterSummary: summarizePurchaseState(nextPurchase),
                note: 'Purchase document updated'
            })
        ];
        if (purchaseAffectsInventory(nextPurchase)) {
            auditEntries.push(createDomainAuditEntry({
                action: 'purchase.receipt_rebuilt',
                entityType: 'purchase_receipt',
                entityId: nextPurchase.id,
                beforeSummary: `receivedQty=${getPurchaseReceivedQuantity(existingPurchase)} | orderedQty=${getPurchaseOrderedQuantity(existingPurchase.items)}`,
                afterSummary: `receivedQty=${getPurchaseReceivedQuantity(nextPurchase)} | orderedQty=${getPurchaseOrderedQuantity(nextPurchase.items)}`,
                note: 'Purchase receipt state was recalculated'
            }));
        }
        const committed = await persistData({
            purchases: currentPurchases.map((entry) => entry.id === purchaseId ? nextPurchase : entry),
            medicines: updatedMedicines,
            suppliers: updatedSuppliers,
            stockMovements: updatedStockMovements
        });
        if (!committed)
            return false;
        commitDomainAuditEvents(auditEntries);
        addToast("ف?اکتور خرید ویرایش شد", "success");
        return true;
    };
    const recordPurchaseReceipt: RecordPurchaseReceiptHandler = async (purchaseId, receipt) => {
        if (!ensureWritable('addPurchase'))
            return;
        if (!(await refreshLatestDataFromDiskForStockWrite('recordPurchaseReceipt')))
            return;
        const currentPurchases = latestDataRef.current.purchases || [];
        const currentMedicines = latestDataRef.current.medicines || [];
        const currentSuppliers = latestDataRef.current.suppliers || [];
        const currentInvoices = latestDataRef.current.invoices || [];
        const currentStockMovements = latestDataRef.current.stockMovements || [];
        const existingPurchase = currentPurchases.find((entry) => entry.id === purchaseId && !entry.isDeleted);
        if (!existingPurchase)
            return;
        if (existingPurchase.shortClosedAt) {
            addToast("این خرید بسته ناقص شده و دریاف?ت جدید نمی‌گیرد", "warning");
            return;
        }
        const nowIso = new Date().toISOString();
        const { actorName } = resolveActorMeta();
        const existingReceiptMap = buildPurchaseReceiptQuantityMap(existingPurchase.receipts || []);
        const normalizedReceipt: PurchaseReceipt = {
            ...receipt,
            id: (receipt as Partial<PurchaseReceipt>).id || createUniqueId('receipt'),
            date: receipt.date || nowIso,
            recordedBy: receipt.recordedBy || actorName,
            supplierLiabilityImpact: receipt.supplierLiabilityImpact !== false,
            items: (receipt.items || []).flatMap((item) => {
                const itemLineId = String(item.lineId || '').trim();
                const itemIndex = itemLineId
                    ? existingPurchase.items.findIndex((purchaseItem) => purchaseItem.lineId === itemLineId)
                    : typeof item.purchaseItemIndex === 'number' ? item.purchaseItemIndex : -1;
                const purchaseItem = itemIndex >= 0 ? existingPurchase.items[itemIndex] : undefined;
                const receiptKey = (itemLineId || purchaseItem?.lineId) ? `line:${itemLineId || purchaseItem?.lineId}` : `idx:${itemIndex}`;
                const priorReceived = itemIndex >= 0 ? existingReceiptMap.get(receiptKey)?.quantity || 0 : 0;
                const orderedBaseQuantity = purchaseItem
                    ? Math.max(0, purchaseItem.baseQuantity ?? purchaseItem.quantity)
                    : Math.max(0, item.baseQuantity ?? (item.quantity || 0));
                const requestedBaseQuantity = Math.max(0, item.baseQuantity ?? (item.quantity || 0));
                const remaining = Math.max(0, orderedBaseQuantity - priorReceived);
                const safeQuantity = Math.min(requestedBaseQuantity, remaining);
                if (safeQuantity <= 0)
                    return [];
                return [{
                        ...item,
                        lineId: itemLineId || purchaseItem?.lineId,
                        purchaseItemIndex: itemIndex >= 0 ? itemIndex : item.purchaseItemIndex,
                        baseQuantity: safeQuantity,
                        purchaseUnitName: item.purchaseUnitName || purchaseItem?.purchaseUnitName || purchaseItem?.unit,
                        purchaseUnitConversionFactor: item.purchaseUnitConversionFactor || purchaseItem?.purchaseUnitConversionFactor || 1,
                        baseUnit: item.baseUnit || purchaseItem?.baseUnit || purchaseItem?.unit,
                        purchasePrice: item.purchasePrice ?? purchaseItem?.purchasePrice,
                        batchNumber: item.batchNumber || purchaseItem?.batchNumber,
                        expiryDate: item.expiryDate || purchaseItem?.expiryDate,
                        supplierId: item.supplierId || existingPurchase.supplierId
                    }];
            })
        };
        if (!normalizedReceipt.items.length) {
            addToast("برای دریاف?ت خرید، حداقل یک مقدار معتبر لازم است", "warning");
            return;
        }
        const updatedPurchase = normalizePurchaseRecord({
            ...existingPurchase,
            workflowStatus: 'received',
            inventoryCommitted: true,
            receivedAt: normalizedReceipt.date,
            receipts: [...(existingPurchase.receipts || []), normalizedReceipt],
            updatedAt: nowIso,
            updatedBy: actorName,
            auditTrail: appendAuditTrail(existingPurchase.auditTrail, 'receipt_recorded', `رسید خرید ${normalizedReceipt.id} ثبت شد`)
        });
        const updatedMedicines = buildPurchaseReceiptMedicineSnapshot({
            medicines: currentMedicines,
            invoices: currentInvoices,
            purchase: existingPurchase,
            receipt: normalizedReceipt,
            createdAt: nowIso,
            createBatchId: (index) => createUniqueId(`batch-${index}`),
            defaultRackName: tr('Main warehouse', 'گدام اصلی')
        });
        let stockTransaction;
        try {
            stockTransaction = applyInventorySnapshotTransaction({
                medicines: currentMedicines,
                stockMovements: currentStockMovements,
                nextMedicines: updatedMedicines,
                type: 'purchase_receipt',
                referenceType: 'purchase_receipt',
                referenceId: normalizedReceipt.id,
                idempotencyScope: `purchase-receipt:${existingPurchase.id}:${normalizedReceipt.id}`,
                createdAt: nowIso,
                metadata: {
                    purchaseId: existingPurchase.id,
                    invoiceNumber: existingPurchase.invoiceNumber,
                    receiptId: normalizedReceipt.id,
                },
                history: {
                    action: 'purchase_receipt',
                    details: `Purchase receipt ${normalizedReceipt.id} recorded`,
                },
            });
        }
        catch (error) {
            addToast(getInventoryTransactionMessage(error, (latestDataRef.current.settings || settings).language === 'english'), "error");
            return;
        }
        const stockUpdatedMedicines = stockTransaction.medicines;
        const updatedStockMovements = stockTransaction.stockMovements;
        const updatedSuppliers = currentSuppliers.map((supplier) => {
            if (supplier.id !== existingPurchase.supplierId)
                return supplier;
            const filteredTransactions = (supplier.transactions || []).filter((txn) => txn.referenceId !== existingPurchase.id);
            return rebuildSupplierLedger(supplier, [...filteredTransactions, ...buildPurchaseLedgerEntries(updatedPurchase)], {
                updatedAt: nowIso,
                updatedBy: actorName,
                lastInteractionDate: nowIso,
                lastPurchaseDate: updatedPurchase.date,
                auditTrail: appendAuditTrail(supplier.auditTrail, 'receipt_recorded', `رسید خرید برای ف?اکتور ${updatedPurchase.invoiceNumber || updatedPurchase.id.slice(-6)} ثبت شد`)
            });
        });
        const auditEntries: DomainAuditEntry[] = [
            createDomainAuditEntry({
                action: 'purchase.receipt_recorded',
                entityType: 'purchase_receipt',
                entityId: normalizedReceipt.id,
                beforeSummary: summarizePurchaseState(existingPurchase),
                afterSummary: summarizePurchaseState(updatedPurchase),
                note: `Receipt ${normalizedReceipt.id} recorded`
            })
        ];
        const committed = await persistData({
            purchases: currentPurchases.map((entry) => entry.id === purchaseId ? updatedPurchase : entry),
            medicines: stockUpdatedMedicines,
            suppliers: updatedSuppliers,
            stockMovements: updatedStockMovements
        });
        if (!committed)
            return;
        commitDomainAuditEvents(auditEntries);
        addToast("رسید خرید ثبت شد", "success");
    };
    const shortClosePurchase: ShortClosePurchaseHandler = async (purchaseId, reason) => {
        if (!ensureWritable('addPurchase'))
            return;
        const currentPurchases = latestDataRef.current.purchases || [];
        const existingPurchase = currentPurchases.find((entry) => entry.id === purchaseId && !entry.isDeleted);
        if (!existingPurchase || existingPurchase.shortClosedAt)
            return;
        const nowIso = new Date().toISOString();
        const { actorName } = resolveActorMeta();
        const updatedPurchase = normalizePurchaseRecord({
            ...existingPurchase,
            shortClosedAt: nowIso,
            shortCloseReason: reason.trim(),
            updatedAt: nowIso,
            updatedBy: actorName,
            auditTrail: appendAuditTrail(existingPurchase.auditTrail, 'short_closed', reason.trim() || 'Short closed')
        });
        const auditEntries: DomainAuditEntry[] = [
            createDomainAuditEntry({
                action: 'purchase.short_closed',
                entityType: 'purchase',
                entityId: purchaseId,
                beforeSummary: summarizePurchaseState(existingPurchase),
                afterSummary: summarizePurchaseState(updatedPurchase),
                note: reason.trim() || 'Short close recorded'
            })
        ];
        const committed = await persistData({ purchases: currentPurchases.map((entry) => entry.id === purchaseId ? updatedPurchase : entry) });
        if (!committed)
            return;
        commitDomainAuditEvents(auditEntries);
        addToast("خرید به‌صورت ناقص بسته شد", "success");
    };
    // NEW: Partial Payment support appends supplier-ledger-safe payments to an existing purchase.
    const recordPurchasePayment: RecordPurchasePaymentHandler = async (purchaseId, payment) => {
        if (!ensureWritable('addSupplierPayment'))
            return;
        const currentPurchases = latestDataRef.current.purchases || [];
        const currentSuppliers = latestDataRef.current.suppliers || [];
        const existingPurchase = currentPurchases.find((entry) => entry.id === purchaseId && !entry.isDeleted);
        if (!existingPurchase)
            return;
        const requestedAmount = typeof payment.amount === 'number' ? Math.max(0, payment.amount) : 0;
        if (requestedAmount <= 0)
            return;
        const nowIso = new Date().toISOString();
        const { actorName } = resolveActorMeta();
        const rootPaymentId = (payment as Partial<PurchasePayment>).id || createUniqueId('pay');
        const paymentDate = payment.date || nowIso;
        const baseNote = (payment.note || '').trim();
        const sourcePurchaseLabel = existingPurchase.invoiceNumber || existingPurchase.id.slice(-6);
        const sourcePaymentContext = tr(`Payment source: purchase invoice #${sourcePurchaseLabel}`, `منبع پرداخت: فاکتور خرید #${sourcePurchaseLabel}`);
        const forwardedPaymentNote = [baseNote, sourcePaymentContext].filter(Boolean).join('\n').trim();
        const supplierScopedPurchases = currentPurchases.filter((entry) => (!entry.isDeleted && entry.supplierId === existingPurchase.supplierId));
        const allocationPlan = buildPurchasePaymentAllocationPlan({
            targetPurchase: existingPurchase,
            purchases: supplierScopedPurchases,
            amount: requestedAmount,
        });
        const purchasePaymentAllocations = [
            allocationPlan.targetPurchaseAppliedAmount > 0
                ? { purchaseId: existingPurchase.id, amount: allocationPlan.targetPurchaseAppliedAmount, paymentId: rootPaymentId, isTarget: true }
                : null,
            ...allocationPlan.otherOpenPurchasesAllocations.map((allocation) => ({
                purchaseId: allocation.purchaseId,
                amount: allocation.amount,
                paymentId: `spill-${rootPaymentId}-${allocation.purchaseId}`,
                isTarget: false,
            })),
        ].filter((entry): entry is {
            purchaseId: string;
            amount: number;
            paymentId: string;
            isTarget: boolean;
        } => Boolean(entry && entry.amount > 0));
        const purchaseAllocationMap = new Map(purchasePaymentAllocations.map((entry) => [entry.purchaseId, entry]));
        const purchaseSnapshotById = new Map(currentPurchases.map((entry) => [entry.id, entry]));
        const updatedPurchases = currentPurchases.map((purchase) => {
            const allocation = purchaseAllocationMap.get(purchase.id);
            if (!allocation)
                return purchase;
            const nextPayment: PurchasePayment = {
                ...payment,
                id: allocation.paymentId,
                date: paymentDate,
                amount: allocation.amount,
                note: allocation.isTarget ? baseNote : forwardedPaymentNote,
                recordedBy: payment.recordedBy || actorName
            };
            const allocationNote = allocation.isTarget
                ? `پرداخت ${allocation.amount} ثبت شد`
                : `پرداخت ${allocation.amount} از ف?اکتور ${sourcePurchaseLabel} به این ف?اکتور تخصیص یاف?ت`;
            return normalizePurchaseRecord({
                ...purchase,
                payments: [...(purchase.payments || []), nextPayment],
                updatedAt: nowIso,
                updatedBy: actorName,
                auditTrail: appendAuditTrail(purchase.auditTrail, 'payment_recorded', allocationNote)
            });
        });
        const supplierTransactions: Supplier['transactions'] = purchasePaymentAllocations.flatMap((allocation) => {
            const targetPurchase = purchaseSnapshotById.get(allocation.purchaseId);
            if (!targetPurchase || !purchaseAffectsSupplierLedger(targetPurchase))
                return [];
            const targetLabel = targetPurchase.invoiceNumber || allocation.purchaseId.slice(-6);
            return [createSupplierTransaction({
                    id: allocation.isTarget ? `paytxn-${rootPaymentId}` : `paytxn-spill-${rootPaymentId}-${allocation.purchaseId}`,
                    date: paymentDate,
                    type: 'payment',
                    amount: allocation.amount,
                    description: allocation.isTarget
                        ? tr(`Payment for purchase invoice #${targetLabel}`, `پرداخت فاکتور خرید #${targetLabel}`)
                        : tr(`Payment from invoice #${sourcePurchaseLabel} allocated to purchase invoice #${targetLabel}`, `تخصیص پرداخت فاکتور #${sourcePurchaseLabel} به فاکتور خرید #${targetLabel}`),
                    purchaseId: allocation.purchaseId,
                    referenceId: allocation.purchaseId,
                    method: payment.method,
                    dueDate: targetPurchase.dueDate,
                    note: allocation.isTarget ? baseNote : forwardedPaymentNote,
                    recordedBy: payment.recordedBy || actorName
                })];
        });
        const advancePaymentAmount = allocationPlan.advancePaymentAmount;
        if (advancePaymentAmount > 0) {
            supplierTransactions.push(createSupplierTransaction({
                id: `payadvance-${rootPaymentId}`,
                date: paymentDate,
                type: 'payment',
                amount: advancePaymentAmount,
                description: tr(`Supplier advance from payment for invoice #${sourcePurchaseLabel}`, `پیش‌پرداخت تأمین‌کننده از پرداخت فاکتور #${sourcePurchaseLabel}`),
                method: payment.method,
                note: buildSupplierFinanceTaggedNote('advance_payment', forwardedPaymentNote),
                recordedBy: payment.recordedBy || actorName,
            }));
        }
        const shouldTouchSupplierLedger = supplierTransactions.length > 0;
        const updatedSuppliers = !shouldTouchSupplierLedger
            ? currentSuppliers
            : currentSuppliers.map((supplier) => {
                if (supplier.id !== existingPurchase.supplierId)
                    return supplier;
                const supplierAuditNote = advancePaymentAmount > 0
                    ? `پرداخت برای ف?اکتور ${sourcePurchaseLabel} ثبت شد و ${advancePaymentAmount} به پیش‌پرداخت رف?ت`
                    : purchasePaymentAllocations.length > 1
                        ? `پرداخت برای ف?اکتور ${sourcePurchaseLabel} ثبت شد و به ف?اکتورهای باز دیگر تخصیص یاف?ت`
                        : `پرداخت برای ف?اکتور ${sourcePurchaseLabel} ثبت شد`;
                return rebuildSupplierLedger(supplier, [
                    ...(supplier.transactions || []),
                    ...supplierTransactions
                ], {
                    updatedAt: nowIso,
                    updatedBy: actorName,
                    lastInteractionDate: paymentDate,
                    auditTrail: appendAuditTrail(supplier.auditTrail, 'payment_recorded', supplierAuditNote)
                });
            });
        const auditEntries: DomainAuditEntry[] = purchasePaymentAllocations.map((allocation) => {
            const previousPurchase = purchaseSnapshotById.get(allocation.purchaseId) || null;
            const nextPurchase = updatedPurchases.find((entry) => entry.id === allocation.purchaseId) || null;
            const targetPurchaseLabel = previousPurchase?.invoiceNumber || allocation.purchaseId.slice(-6);
            return createDomainAuditEntry({
                action: 'purchase.payment_recorded',
                entityType: 'purchase',
                entityId: allocation.purchaseId,
                beforeSummary: summarizePurchaseState(previousPurchase),
                afterSummary: summarizePurchaseState(nextPurchase),
                note: allocation.isTarget
                    ? `Payment ${allocation.amount} recorded`
                    : `Payment ${allocation.amount} reallocated from purchase ${sourcePurchaseLabel} to ${targetPurchaseLabel}`
            });
        });
        if (shouldTouchSupplierLedger) {
            auditEntries.push(createDomainAuditEntry({
                action: 'supplier.ledger_payment',
                entityType: 'supplier_ledger',
                entityId: existingPurchase.supplierId,
                afterSummary: `purchase=${existingPurchase.id} | applied=${allocationPlan.totalAppliedToPurchases} | otherInvoices=${purchasePaymentAllocations.length - (allocationPlan.targetPurchaseAppliedAmount > 0 ? 1 : 0)} | prepayment=${advancePaymentAmount} | method=${payment.method}`,
                note: 'Supplier ledger payment entry added'
            }));
        }
        const successToast = advancePaymentAmount > 0
            ? tr('Payment saved; the remaining amount became a supplier advance.', 'پرداخت ثبت شد و باقی‌مانده به پیش‌پرداخت تأمین‌کننده رفت')
            : purchasePaymentAllocations.length > 1
                ? tr('Payment saved and allocated to other open invoices.', 'پرداخت ثبت شد و به فاکتورهای باز دیگر هم تخصیص یافت')
                : tr('Purchase invoice payment saved.', 'پرداخت فاکتور خرید ثبت شد');
        const rootPayment: PurchasePayment = {
            ...payment,
            id: rootPaymentId,
            date: paymentDate,
            amount: requestedAmount,
            note: baseNote,
            recordedBy: payment.recordedBy || actorName
        };
        const committed = await persistData({
            purchases: updatedPurchases,
            suppliers: updatedSuppliers
        });
        if (!committed)
            return;
        commitDomainAuditEvents(auditEntries);
        addToast(successToast, "success");
    };
    const deletePurchase = async (purchaseId: string) => {
        if (!ensureWritable('deletePurchase'))
            return;
        if (!(await refreshLatestDataFromDiskForStockWrite('deletePurchase')))
            return;
        const currentMedicines = latestDataRef.current.medicines || [];
        const currentSuppliers = latestDataRef.current.suppliers || [];
        const currentPurchases = latestDataRef.current.purchases || [];
        const currentStockMovements = latestDataRef.current.stockMovements || [];
        const targetPurchase = currentPurchases.find((entry) => entry.id === purchaseId && !entry.isDeleted);
        if (!targetPurchase)
            return;
        const consumedPurchaseBatches = findConsumedPurchaseBatches(targetPurchase, currentMedicines);
        if (consumedPurchaseBatches.length > 0) {
            addToast(`Purchase cannot be deleted because ${consumedPurchaseBatches.length} linked batch(es) already have consumed stock.`, "error");
            return;
        }
        const nowIso = new Date().toISOString();
        const { actorName } = resolveActorMeta();
        const { updatedMedicines, updatedSuppliers, updatedStockMovements } = rollbackPurchaseEffects(targetPurchase, currentMedicines, currentSuppliers, 'delete', currentStockMovements);
        const deletedPurchase = normalizePurchaseRecord({
            ...targetPurchase,
            isDeleted: true,
            workflowStatus: 'cancelled',
            status: 'cancelled',
            deletedAt: nowIso,
            deletedBy: actorName,
            updatedAt: nowIso,
            updatedBy: actorName,
            auditTrail: appendAuditTrail(targetPurchase.auditTrail, 'deleted', 'ف?اکتور خرید حذف? شد')
        });
        const auditEntries: DomainAuditEntry[] = [
            createDomainAuditEntry({
                action: 'purchase.deleted',
                entityType: 'purchase',
                entityId: deletedPurchase.id,
                beforeSummary: summarizePurchaseState(targetPurchase),
                afterSummary: summarizePurchaseState(deletedPurchase),
                note: 'Purchase deleted and rolled back'
            })
        ];
        const committed = await persistData({
            purchases: currentPurchases.map((entry) => entry.id === purchaseId ? deletedPurchase : entry),
            medicines: updatedMedicines,
            suppliers: updatedSuppliers,
            stockMovements: updatedStockMovements
        });
        if (!committed)
            return;
        commitDomainAuditEvents(auditEntries);
        addToast("ف?اکتور خرید حذف? شد", "warning");
    };
    // NEW: Explicit supplier advance payment stays separate from invoice settlement.
    const addSupplierPayment: AddSupplierPaymentHandler = async (supplierId, payment) => {
        if (!ensureWritable('addSupplierPayment'))
            return;
        const amount = typeof payment.amount === 'number' ? Math.max(0, payment.amount) : 0;
        if (!supplierId || amount <= 0)
            return;
        const nowIso = new Date().toISOString();
        const { actorName } = resolveActorMeta();
        const currentSuppliers = latestDataRef.current.suppliers || [];
        const transactionId = createUniqueId('txn');
        const transactionDate = payment.date || nowIso;
        const description = payment.description || tr('Supplier advance payment', 'پیش‌پرداخت تأمین‌کننده');
        const taggedNote = buildSupplierFinanceTaggedNote('advance_payment', payment.note);
        const updatedSuppliers = currentSuppliers.map((supplier) => {
            if (supplier.id !== supplierId)
                return supplier;
            return rebuildSupplierLedger(supplier, [
                ...(supplier.transactions || []),
                createSupplierTransaction({
                    id: transactionId,
                    date: transactionDate,
                    type: 'payment',
                    amount,
                    description,
                    method: payment.method,
                    note: taggedNote,
                    recordedBy: payment.recordedBy || actorName,
                })
            ], {
                updatedAt: nowIso,
                updatedBy: actorName,
                lastInteractionDate: transactionDate,
                auditTrail: appendAuditTrail(supplier.auditTrail, 'manual_payment', description || tr('Supplier advance payment saved', 'پیش‌پرداخت تأمین‌کننده ثبت شد'))
            });
        });
        const auditEntries: DomainAuditEntry[] = [
            createDomainAuditEntry({
                action: 'supplier.payment_recorded',
                entityType: 'supplier_ledger',
                entityId: supplierId,
                afterSummary: `amount=${amount} | description=${description}`,
                note: 'Supplier advance payment recorded'
            })
        ];
        const committed = await persistData({ suppliers: updatedSuppliers });
        if (!committed)
            return;
        commitDomainAuditEvents(auditEntries);
        addToast("پیش‌پرداخت تأمین‌کننده ثبت شد", "success");
    };
    const recordSupplierSettlement: RecordSupplierSettlementHandler = async (supplierId, payment) => {
        if (!ensureWritable('addSupplierPayment'))
            return;
        const amount = typeof payment.amount === 'number' ? Math.max(0, payment.amount) : 0;
        if (!supplierId || amount <= 0)
            return;
        const nowIso = new Date().toISOString();
        const { actorName } = resolveActorMeta();
        const currentSuppliers = latestDataRef.current.suppliers || [];
        const currentPurchases = latestDataRef.current.purchases || [];
        const supplier = currentSuppliers.find((entry) => entry.id === supplierId) || null;
        if (!supplier)
            return;
        const settlementId = payment.settlementId || createUniqueId('sup-settlement');
        const settlementDate = payment.date || nowIso;
        const settlementPlan = buildSupplierSettlementPlan({
            supplier,
            purchases: currentPurchases.filter((entry) => !entry.isDeleted),
            amount,
        });
        const purchaseAllocationMap = new Map(settlementPlan.purchaseAllocations.map((entry) => [entry.purchaseId, entry.amount]));
        const updatedPurchases = currentPurchases.map((purchase) => {
            const allocationAmount = purchaseAllocationMap.get(purchase.id);
            if (!allocationAmount)
                return purchase;
            const nextPayment: PurchasePayment = {
                id: `supsettle-pay-${settlementId}-${purchase.id}`,
                date: settlementDate,
                amount: allocationAmount,
                method: payment.method,
                reference: payment.reference,
                note: payment.note,
                recordedBy: payment.recordedBy || actorName,
            };
            return normalizePurchaseRecord({
                ...purchase,
                payments: [...(purchase.payments || []), nextPayment],
                updatedAt: nowIso,
                updatedBy: actorName,
                auditTrail: appendAuditTrail(purchase.auditTrail, 'payment_recorded', `تسویه تأمین‌کننده ${allocationAmount} برای ف?اکتور ${purchase.invoiceNumber || purchase.id.slice(-6)} ثبت شد`)
            });
        });
        const purchaseTransactions = settlementPlan.purchaseAllocations.flatMap((allocation) => {
            const purchase = currentPurchases.find((entry) => entry.id === allocation.purchaseId);
            if (!purchase)
                return [];
            return [createSupplierTransaction({
                    id: `supsettle-ledger-${settlementId}-${purchase.id}`,
                    date: settlementDate,
                    type: 'payment',
                    amount: allocation.amount,
                    description: tr(`Payment for purchase invoice #${purchase.invoiceNumber || purchase.id.slice(-6)}`, `پرداخت فاکتور خرید #${purchase.invoiceNumber || purchase.id.slice(-6)}`),
                    purchaseId: purchase.id,
                    referenceId: purchase.id,
                    method: payment.method,
                    dueDate: purchase.dueDate,
                    note: payment.note,
                    recordedBy: payment.recordedBy || actorName,
                })];
        });
        const extraTransactions: Supplier['transactions'] = [];
        if (settlementPlan.openingDebtAllocation > 0) {
            extraTransactions.push(createSupplierTransaction({
                id: `supsettle-opening-${settlementId}`,
                date: settlementDate,
                type: 'payment',
                amount: settlementPlan.openingDebtAllocation,
                description: payment.description || tr('Supplier opening balance settlement', 'تسویه بدهی افتتاحیه تأمین‌کننده'),
                method: payment.method,
                note: buildSupplierFinanceTaggedNote('opening_debt_settlement', payment.note),
                recordedBy: payment.recordedBy || actorName,
            }));
        }
        if (settlementPlan.advancePaymentAmount > 0) {
            extraTransactions.push(createSupplierTransaction({
                id: `supsettle-advance-${settlementId}`,
                date: settlementDate,
                type: 'payment',
                amount: settlementPlan.advancePaymentAmount,
                description: tr('Supplier advance payment', 'پیش‌پرداخت تأمین‌کننده'),
                method: payment.method,
                note: buildSupplierFinanceTaggedNote('advance_payment', payment.note),
                recordedBy: payment.recordedBy || actorName,
            }));
        }
        const updatedSuppliers = currentSuppliers.map((entry) => {
            if (entry.id !== supplierId)
                return entry;
            return rebuildSupplierLedger(entry, [
                ...(entry.transactions || []),
                ...purchaseTransactions,
                ...extraTransactions,
            ], {
                updatedAt: nowIso,
                updatedBy: actorName,
                lastInteractionDate: settlementDate,
                auditTrail: appendAuditTrail(entry.auditTrail, 'settlement_recorded', payment.reference
                    ? `تسویه تأمین‌کننده ثبت شد | ref=${payment.reference}`
                    : 'تسویه تأمین‌کننده ثبت شد')
            });
        });
        const auditEntries: DomainAuditEntry[] = [
            createDomainAuditEntry({
                action: 'supplier.settlement_recorded',
                entityType: 'supplier_ledger',
                entityId: supplierId,
                afterSummary: `amount=${amount} | debtApplied=${settlementPlan.totalAppliedToDebt} | prepayment=${settlementPlan.advancePaymentAmount}`,
                note: 'Supplier settlement recorded'
            }),
            ...settlementPlan.purchaseAllocations.map((allocation) => createDomainAuditEntry({
                action: 'purchase.payment_recorded',
                entityType: 'purchase',
                entityId: allocation.purchaseId,
                afterSummary: `amount=${allocation.amount} | settlement=${settlementId}`,
                note: 'Supplier settlement applied to purchase'
            })),
        ];
        const payload = {
            settlementId,
            amount,
            date: settlementDate,
            method: payment.method,
            reference: payment.reference,
            note: payment.note,
            description: payment.description,
            recordedBy: payment.recordedBy || actorName,
        };
        const committed = await persistData({ purchases: updatedPurchases, suppliers: updatedSuppliers });
        if (!committed)
            return;
        commitDomainAuditEvents(auditEntries);
        addToast("تسویه تأمین‌کننده ثبت شد", "success");
    };
    // NEW: Inventory-side supplier return now moves stock, vendor credit, and supplier ledger together.
    const recordVendorReturn = async (args: {
        medicineId: string;
        medicineName: string;
        batchId: string;
        quantity: number;
        reason: string;
        description: string;
        purchasePrice: number;
        amount?: number;
        supplierId?: string;
        resolution?: VendorCreditResolution;
    }) => {
        if (!ensureWritable('addPurchase'))
            return false;
        if (!(await refreshLatestDataFromDiskForStockWrite('recordVendorReturn')))
            return false;
        try {
            const safeQuantity = Math.max(0, typeof args.quantity === 'number' ? args.quantity : 0);
            if (safeQuantity <= 0) {
                addToast("تعداد مرجوعی باید بیشتر از صف?ر باشد.", "warning");
                return false;
            }
            const currentMedicines = latestDataRef.current.medicines || [];
            const currentPurchases = latestDataRef.current.purchases || [];
            const currentSuppliers = latestDataRef.current.suppliers || [];
            const currentStockMovements = latestDataRef.current.stockMovements || [];
            const nowIso = new Date().toISOString();
            const { actorId, actorName } = resolveActorMeta();
            const mutation = buildVendorReturnInventoryMutation({
                language: settings.language,
                medicines: currentMedicines,
                purchases: currentPurchases,
                suppliers: currentSuppliers,
                medicineId: args.medicineId,
                batchId: args.batchId,
                quantity: safeQuantity,
                description: args.description,
                amount: args.amount,
                supplierId: args.supplierId,
                resolution: args.resolution,
                actorId,
                actorName,
                nowIso,
            });
            const stockTransaction = applyInventorySnapshotTransaction({
                medicines: currentMedicines,
                stockMovements: currentStockMovements,
                nextMedicines: mutation.updatedMedicines,
                type: 'vendor_return',
                referenceType: 'vendor_return',
                referenceId: mutation.vendorCredit.id,
                idempotencyScope: `vendor-return:${mutation.vendorCredit.id}`,
                createdAt: nowIso,
                metadata: {
                    purchaseId: mutation.effectivePurchaseId,
                    supplierId: mutation.effectiveSupplierId,
                    vendorCreditId: mutation.vendorCredit.id,
                    amount: mutation.creditAmount,
                },
                history: {
                    action: 'vendor_return',
                    details: `Vendor return ${safeQuantity} from batch ${args.batchId}`,
                },
            });
            const stockUpdatedMedicines = stockTransaction.medicines;
            const updatedStockMovements = stockTransaction.stockMovements;
            const payload = {
                id: mutation.vendorCredit.id,
                medicineId: args.medicineId,
                medicineName: args.medicineName,
                batchId: args.batchId,
                quantity: safeQuantity,
                description: args.description,
                amount: mutation.creditAmount,
                supplierId: mutation.effectiveSupplierId,
                resolution: args.resolution || mutation.vendorCredit.resolution,
                date: mutation.vendorCredit.date,
                recordedBy: mutation.vendorCredit.recordedBy,
                items: mutation.vendorCredit.items,
            };
            const auditEntries = [
                createDomainAuditEntry({
                    action: 'purchase.created',
                    entityType: 'purchase',
                    entityId: mutation.updatedPurchase.id,
                    afterSummary: summarizePurchaseState(mutation.createdPurchase),
                    note: 'Return reference purchase created for inventory vendor return',
                }),
                createDomainAuditEntry({
                    action: 'supplier.ledger_purchase',
                    entityType: 'supplier_ledger',
                    entityId: mutation.effectiveSupplierId,
                    afterSummary: `purchase=${mutation.updatedPurchase.id} | amount=${mutation.creditAmount}`,
                    note: 'Supplier ledger purchase reference entry added',
                }),
                createDomainAuditEntry({
                    action: 'vendor_credit.created',
                    entityType: 'vendor_credit',
                    entityId: mutation.vendorCredit.id,
                    beforeSummary: summarizePurchaseState(mutation.previousPurchase),
                    afterSummary: summarizePurchaseState(mutation.updatedPurchase),
                    note: `Vendor credit ${mutation.creditAmount} recorded for batch ${args.batchId}`,
                }),
                createDomainAuditEntry({
                    action: 'supplier.ledger_vendor_credit',
                    entityType: 'supplier_ledger',
                    entityId: mutation.effectiveSupplierId,
                    afterSummary: `purchase=${mutation.effectivePurchaseId} | amount=${mutation.creditAmount} | batch=${args.batchId}`,
                    note: 'Supplier ledger vendor credit entry added',
                }),
                createDomainAuditEntry({
                    action: 'batch.updated',
                    entityType: 'batch',
                    entityId: args.batchId,
                    beforeSummary: summarizeBatchState(mutation.previousBatch),
                    afterSummary: summarizeBatchState(mutation.updatedBatch),
                    note: 'Inventory vendor return updated batch quantity and linkage',
                }),
            ];
            const committed = await persistData({
                medicines: stockUpdatedMedicines,
                purchases: mutation.updatedPurchases,
                suppliers: mutation.updatedSuppliers,
                stockMovements: updatedStockMovements,
            });
            if (!committed)
                return false;
            commitDomainAuditEvents(auditEntries);
            return true;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'ثبت مرجوعی به تأمین‌کننده ناموف?ق شد.';
            addToast(message, "error");
            return false;
        }
    };
    const handleSystemReset = async (options: {
        medicines?: boolean;
        customers?: boolean;
        invoices?: boolean;
        settings?: boolean;
        expenses?: boolean;
        partners?: boolean;
        suppliers?: boolean;
        purchases?: boolean;
        treasury?: boolean;
        auditEvents?: boolean;
        stockMovements?: boolean;
        clearTransactionsOnly?: boolean;
    }) => {
        if (!ensureWritable('systemReset'))
            return false;
        const hasAnySelection = Object.values(options || {}).some(Boolean);
        if (!hasAnySelection) {
            addToast(settings.language === 'english' ? 'No reset option was selected.' : 'هیچ گزینه‌ای برای ریست انتخاب نشده است.', "warning");
            return false;
        }
        const now = new Date().toISOString();
        const clearCustomerTransactions = !!options?.clearTransactionsOnly || !!options?.invoices;
        const resetCollections = RESETTABLE_DATA_COLLECTIONS.filter((key) => !!options?.[key]);
        const resetAllCloudCollections = CLOUD_SYNC_COLLECTIONS.every((key) => !!options?.[key]);
        const previousCloudSyncAllowed = !!user && false && false;
        const nextCollectionResetAt = {
            ...(settings.collectionResetAt || {})
        };
        resetCollections.forEach((key) => {
            nextCollectionResetAt[key] = now;
        });
        const baseNextSettings = options?.settings
            ? { ...INITIAL_SETTINGS, updatedAt: now }
            : { ...settings, updatedAt: now };
        const nextSettings: AppSettings = resetCollections.length > 0
            ? {
                ...baseNextSettings,
                collectionResetAt: nextCollectionResetAt,
                ...(resetAllCloudCollections ? { dataResetAt: now } : {})
            }
            : baseNextSettings;
        const nextCustomers = options?.customers
            ? []
            : (clearCustomerTransactions
                ? customers.map((customer) => ({
                    ...customer,
                    balance: 0,
                    transactions: [],
                    updatedAt: now
                }))
                : customers);
        const shouldReplaceCloudSnapshot = resetCollections.length > 0 || clearCustomerTransactions;
        const committed = await persistData({
            medicines: options?.medicines ? [] : medicines,
            customers: nextCustomers,
            invoices: options?.invoices ? [] : invoices,
            expenses: options?.expenses ? [] : expenses,
            suppliers: options?.suppliers ? [] : suppliers,
            purchases: options?.purchases ? [] : purchases,
            partners: options?.partners ? [] : partners,
            auditEvents: options?.auditEvents ? [] : auditEvents,
            stockMovements: options?.stockMovements ? [] : stockMovements,
            // Treasury resets with every other slice now, through the SAME user-scoped commit.
            // It used to be a separate imperative `saveTreasuryTx([])` AFTER this commit, which wrote
            // `[]` over the ONE unscoped key the whole device shared — so one user resetting their
            // own treasury destroyed the cash ledger of every other account on that machine. Routing
            // it through persistData means the wipe can only ever reach this user's own snapshot.
            //
            // backend_v2 disposition, stated rather than papered over: this is a bare persistData, so
            // the seam slice-DIFFS the emptied treasury slice, and mutationsForSliceDiff has no
            // treasury case (financial slices must travel as intents, never raw rows). The write is
            // therefore reported as UNSUPPORTED and the user sees an error — the LOCAL reset is scoped
            // and correct, but the server keeps its rows. That is deliberate: erasing a server-side
            // cash ledger needs a treasury_void per transaction carrying its own base_version, which
            // is real financial surgery and is not in this stage's server contract. A loud, visible
            // "not sent" beats a silent divergence between the device and the books.
            ...(options?.treasury ? { treasuryTransactions: [], treasuryCashCounts: [] } : {}),
            settings: nextSettings
        }, {
            allowWipe: true,
            dropPendingSync: shouldReplaceCloudSnapshot,
            forceCloudSync: previousCloudSyncAllowed,
            replaceCloudSnapshot: shouldReplaceCloudSnapshot
        });
        if (!committed)
            return false;
        if (options?.settings) {
            setActiveAppUser(null);
        }
        setSalesDraft(createInitialDraft(nextSettings));
        addToast(settings.language === 'english' ? 'System reset completed.' : 'ریست سیستم کامل شد.', "warning");
        return true;
    };
    const handleCancelGuestUpgrade = useCallback(() => {
        setGuestUpgradeChoice(null);
        setIsGuestUpgradeAuthOpen(false);
        setIsGuestUpgradePromptOpen(false);
    }, []);
    const handleBeginGuestUpgrade = useCallback(async (choice: GuestMigrationChoice) => {
        return;
    }, [addToast, buildCurrentGuestWorkspace, false, settings.language, user]);
    const handleResetGuestTrial = async () => {
        return;
    };
    const isRestrictedTeamMember = !!settings.teamMode && !!activeAppUser && activeAppUser.role !== 'admin';
    const hasAccessPermission = useCallback((...permissions: Permission[]) => (!isRestrictedTeamMember ||
        permissions.some((permission) => activeAppUser.permissions?.includes(permission))), [activeAppUser, isRestrictedTeamMember]);
    const canViewDashboard = hasAccessPermission('view_dashboard');
    const canViewSales = hasAccessPermission('create_invoice', 'view_invoices');
    const canViewInventory = hasAccessPermission('view_inventory_only', 'view_medicine_details', 'create_medicine', 'edit_medicine', 'manage_inventory', 'delete_medicine');
    const canViewCustomers = hasAccessPermission('view_customers', 'manage_customers', 'manage_debt');
    const canManageCustomerDetails = hasAccessPermission('manage_customers');
    const canManageCustomerLedger = hasAccessPermission('manage_customers', 'manage_debt');
    const canViewExpenses = hasAccessPermission('view_expenses', 'manage_expenses');
    const canManageExpenses = hasAccessPermission('manage_expenses');
    const canViewPurchases = hasAccessPermission('manage_purchases', 'manage_inventory');
    const canManagePurchases = hasAccessPermission('manage_purchases', 'manage_inventory');
    const canViewTreasury = hasAccessPermission('view_treasury', 'manage_treasury', 'manage_expenses');
    const canManageTreasury = hasAccessPermission('manage_treasury');
    /**
     * Owner gate for claiming the legacy unscoped treasury blob. `isRestrictedTeamMember` is this
     * app's existing "not the owner" signal (team mode + a non-admin app user), and canManageTreasury
     * already folds in isGuestTrial — mirroring how the Treasury view itself is gated. Adoption is
     * strictly more sensitive than recording a movement, so it takes BOTH.
     * Lives here rather than beside the treasury handlers because the permission values it depends on
     * are declared at this point in the component.
     */
    const canAdoptLegacyTreasury = !isRestrictedTeamMember && canManageTreasury;
    useEffect(() => {
        if (loading || !treasuryAdoptionScope)
            return;
        const shouldPrompt = shouldPromptForLegacyTreasuryAdoption({
            scope: treasuryAdoptionScope,
            // The LIVE scoped state, so a user who already has a ledger is never asked to merge an
            // unattributable blob into it.
            hasScopedTreasury: treasuryTransactions.length > 0 || treasuryCashCounts.length > 0,
            isOwner: canAdoptLegacyTreasury
        });
        if (!shouldPrompt)
            return;
        setLegacyTreasuryPrompt(summarizeLegacyTreasuryBlob(readLegacyTreasuryBlob()));
    }, [loading, treasuryAdoptionScope, canAdoptLegacyTreasury, treasuryTransactions.length, treasuryCashCounts.length]);
    const canViewPayroll = hasAccessPermission('view_payroll', 'manage_payroll');
    const canManagePayroll = hasAccessPermission('manage_payroll');
    const canViewPartnerships = hasAccessPermission('view_partnerships', 'manage_partnerships', 'view_reports');
    const canViewReports = hasAccessPermission('view_reports');
    const canOpenSettingsWorkspace = hasAccessPermission('manage_settings', 'manage_users');
    const canManageSettingsAccess = hasAccessPermission('manage_settings');
    const canManageUsersAccess = hasAccessPermission('manage_users');
    const canDeleteInvoices = hasAccessPermission('delete_invoice');
    const canEditInvoices = hasAccessPermission('edit_invoice');
    const canTransferInvoiceSeller = hasAccessPermission('manage_payroll', 'manage_users');
    const shouldShowTeamAccessScreen = !!settings.teamMode && !activeAppUser;
    const shouldShowLockScreen = shouldShowTeamAccessScreen;
    const canOpenAppView = useCallback((nextView: AppView): boolean => {
        if ((nextView === 'assistant' || nextView === 'website_orders'))
            return false;
        if (nextView === 'dashboard')
            return canViewDashboard;
        if (nextView === 'sales')
            return canViewSales;
        if (nextView === 'inventory')
            return canViewInventory;
        if (nextView === 'customers')
            return canViewCustomers;
        if (nextView === 'expenses')
            return canViewExpenses;
        if (nextView === 'partnerships')
            return canViewPartnerships;
        if (nextView === 'reports' || nextView === 'reports_advanced')
            return canViewReports;
        if (nextView === 'settings')
            return canOpenSettingsWorkspace;
        if (nextView === 'payroll')
            return canViewPayroll;
        if (nextView === 'purchases')
            return canViewPurchases;
        if (nextView === 'treasury')
            return canViewTreasury;
        return true;
    }, [
        canOpenSettingsWorkspace,
        canViewCustomers,
        canViewDashboard,
        canViewExpenses,
        canViewInventory,
        canViewPartnerships,
        canViewPayroll,
        canViewPurchases,
        canViewReports,
        canViewSales,
        canViewTreasury
    ]);
    const fallbackAppView = useMemo<AppView>(() => {
        const candidates: AppView[] = ['dashboard', 'sales', 'inventory', 'customers', 'expenses', 'purchases', 'reports', 'assistant'];
        return candidates.find((candidate) => canOpenAppView(candidate)) || 'assistant';
    }, [canOpenAppView]);
    const canOpenCurrentView = canOpenAppView(view);
    const lockScreenUsers = activeTeamUsers;
    const activeProfileName = activeAppUser?.name || user?.name || '';
    const activeProfileInitial = (activeProfileName.trim().charAt(0) || 'U').toUpperCase();
    const isEnglishUi = settings.language === 'english';
    const unreadNotificationCount = notificationItems.filter((item) => !item.read).length;
    const hasUnreadAlert = notificationItems.some((item) => !item.read && (item.level === 'warning' || item.level === 'error'));
    const operationModeLabel = normalizeOperationMode(settings.operationMode) === 'team'
        ? (isEnglishUi ? 'Team workspace' : 'Team workspace')
        : normalizeOperationMode(settings.operationMode) === 'hybrid'
            ? (isEnglishUi ? 'Hybrid workspace' : 'Hybrid workspace')
            : (isEnglishUi ? 'Local workspace' : 'Local workspace');
    const hasAvailablePublishedUpdate = Boolean(controlPlaneState?.appRelease &&
        hasNewerPublishedRelease(controlPlaneState.appRelease.version, runtimeVersion));
    const shouldExposePublishedRelease = Boolean(controlPlaneState?.appRelease &&
        (controlPlaneState?.lockdownMode === 'force_update' || hasAvailablePublishedUpdate));
    const hasControlBanner = Boolean(controlPlaneState?.maintenanceBanner ||
        controlPlaneState?.lockdownMode === 'force_update' ||
        shouldExposePublishedRelease);
    const isForcedUpdateActive = controlPlaneState?.lockdownMode === 'force_update';
    const activeUpdatePromptKey = buildReleasePromptKey(controlPlaneState?.appRelease || null, controlPlaneState?.lockdownMode, controlPlaneState?.minimumVersion);
    const updatePromptProgressPhase = updateInstallProgress?.phase || (isInstallingUpdate ? 'starting' : 'idle');
    const showUpdatePromptProgress = Boolean(isInstallingUpdate || updateInstallProgress);
    const updatePromptDownloadedBytes = updateInstallProgress?.loadedBytes ?? 0;
    const updatePromptTotalBytes = updateInstallProgress?.totalBytes;
    const updatePromptRemainingBytes = updateInstallProgress?.remainingBytes ??
        (typeof updatePromptTotalBytes === 'number' ? Math.max(updatePromptTotalBytes - updatePromptDownloadedBytes, 0) : undefined);
    const updatePromptProgressPercent = clampUpdateProgressPercent(updateInstallProgress?.percent ??
        (updatePromptProgressPhase === 'completed' ? 100 : updatePromptProgressPhase === 'error' ? updateInstallProgress?.percent : isInstallingUpdate ? 2 : 0));
    const updatePromptProgressLabel = `${updatePromptProgressPercent.toLocaleString(isEnglishUi ? 'en-US' : 'fa-AF', { maximumFractionDigits: updatePromptProgressPercent >= 10 ? 0 : 1 })}%`;
    const updatePromptProgressBarClass = updatePromptProgressPhase === 'error'
        ? 'bg-gradient-to-r from-rose-400 via-red-400 to-orange-300'
        : updatePromptProgressPhase === 'completed'
            ? 'bg-gradient-to-r from-emerald-300 via-teal-300 to-sky-300'
            : 'bg-gradient-to-r from-sky-300 via-indigo-300 to-emerald-300';
    useEffect(() => {
        if (loading || shouldShowLockScreen || canOpenCurrentView)
            return;
        setView(fallbackAppView);
    }, [canOpenCurrentView, fallbackAppView, loading, setView, shouldShowLockScreen]);
    const handleInstallAvailableUpdate = useCallback(async () => {
        const release = controlPlaneState?.appRelease;
        if (!release?.installerUrl || isInstallingUpdate)
            return;
        const installerFilename = `WareKeep-Setup-${release.version}.exe`;
        setUpdateInstallProgress({
            phase: 'starting',
            filename: installerFilename,
            loadedBytes: 0,
            percent: 0,
            at: new Date().toISOString(),
        });
        setIsInstallingUpdate(true);
        try {
            if (window.electronAPI?.downloadAndOpenInstaller) {
                const result = await window.electronAPI.downloadAndOpenInstaller(release.installerUrl, release.checksumSha256, installerFilename);
                if (result?.success) {
                    setUpdateInstallProgress((current) => ({
                        ...(current || {}),
                        phase: 'completed',
                        filename: current?.filename || installerFilename,
                        filePath: result.filePath,
                        percent: 100,
                        at: new Date().toISOString(),
                    }));
                    const promptKey = buildReleasePromptKey(controlPlaneState?.appRelease || null, controlPlaneState?.lockdownMode, controlPlaneState?.minimumVersion);
                    if (controlPlaneState?.lockdownMode !== 'force_update') {
                        if (promptKey) {
                            setDismissedUpdatePromptKey(promptKey);
                        }
                        setIsUpdatePromptOpen(false);
                    }
                    addToast(settings.language === 'english'
                        ? 'Setup file downloaded and opened.'
                        : 'فایل نصب دانلود و باز شد.', 'success', { source: 'server', addToCenter: true });
                    return;
                }
                throw new Error(result?.error || 'SECURE_INSTALLER_LAUNCH_FAILED');
            }
            throw new Error('SECURE_INSTALLER_BRIDGE_UNAVAILABLE');
        }
        catch (error) {
            setUpdateInstallProgress((current) => ({
                ...(current || {}),
                phase: 'error',
                filename: current?.filename || installerFilename,
                error: error instanceof Error ? error.message : String(error || 'UNKNOWN_UPDATE_INSTALL_ERROR'),
                at: new Date().toISOString(),
            }));
            addToast(getUpdateInstallerErrorMessage(error, settings.language), 'error', { source: 'server', addToCenter: true });
        }
        finally {
            setIsInstallingUpdate(false);
        }
    }, [controlPlaneState?.appRelease, controlPlaneState?.lockdownMode, controlPlaneState?.minimumVersion, settings.language, addToast, runtimeVersion, isInstallingUpdate]);
    const handleRefreshUpdateStatus = useCallback(async () => {
        if (isRefreshingUpdates)
            return;
        setIsRefreshingUpdates(true);
        try {
            await fetchControlBootstrap();
        }
        finally {
            setIsRefreshingUpdates(false);
        }
    }, [fetchControlBootstrap, isRefreshingUpdates]);
    const handleCloseUpdatePrompt = useCallback(() => {
        if (controlPlaneState?.lockdownMode === 'force_update') {
            addToast(settings.language === 'english'
                ? 'This update is required. Install the new version to continue.'
                : 'این به‌روزرسانی اجباری است. برای ادامه، نسخه جدید را نصب کنید.', 'warning', {
                source: 'server',
                addToCenter: true,
                title: settings.language === 'english' ? 'Required Update' : 'به‌روزرسانی اجباری',
            });
            return;
        }
        if (activeUpdatePromptKey) {
            setDismissedUpdatePromptKey(activeUpdatePromptKey);
        }
        setIsUpdatePromptOpen(false);
    }, [controlPlaneState?.lockdownMode, settings.language, addToast, activeUpdatePromptKey]);
    const handleOpenNotificationCenter = () => {
        setIsNotificationCenterOpen(true);
    };
    const handleOpenServerManagement = () => {
        setRequestedSettingsTab('maintenance');
        setView('settings');
        setIsNotificationCenterOpen(false);
    };
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const isEditableTarget = target instanceof HTMLInputElement
                || target instanceof HTMLTextAreaElement
                || target?.isContentEditable;
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                if (isEditableTarget)
                    return;
                event.preventDefault();
                setIsCommandPaletteOpen(true);
                return;
            }
            if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key === '.') {
                if (isEditableTarget)
                    return;
                event.preventDefault();
                setIsZenMode((prev) => !prev);
                return;
            }
            if (event.key === 'Escape' && isZenMode && !isEditableTarget && !isCommandPaletteOpen && !isNotificationCenterOpen) {
                event.preventDefault();
                setIsZenMode(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isCommandPaletteOpen, isNotificationCenterOpen, isZenMode]);
    const quickAddItems = useMemo(() => [
        {
            id: 'quick-sale',
            label: isEnglishUi ? 'New sale' : 'New sale',
            description: isEnglishUi ? 'Open the fast billing workspace.' : 'Open the fast billing workspace.',
            onClick: () => {
                setView('sales');
                addToast(isEnglishUi ? 'Switched to Sales.' : 'Switched to Sales.', 'info');
            }
        },
        {
            id: 'quick-medicine',
            label: isEnglishUi ? 'Add medicine' : 'Add medicine',
            description: isEnglishUi ? 'Go to inventory and create a new item.' : 'Go to inventory and create a new item.',
            onClick: () => {
                setView('inventory');
                addToast(isEnglishUi
                    ? 'Switched to Inventory for quick item creation.'
                    : 'Switched to Inventory for quick item creation.', 'info');
            }
        },
        {
            id: 'quick-purchase',
            label: isEnglishUi ? 'New purchase' : 'New purchase',
            description: isEnglishUi ? 'Open the procurement editor.' : 'Open the procurement editor.',
            onClick: () => {
                setView('purchases');
                addToast(isEnglishUi ? 'Switched to Purchases.' : 'Switched to Purchases.', 'info');
            }
        },
        {
            id: 'quick-expense',
            label: isEnglishUi ? 'New expense' : 'New expense',
            description: isEnglishUi ? 'Go to expense tracking.' : 'Go to expense tracking.',
            onClick: () => {
                setView('expenses');
                addToast(isEnglishUi ? 'Switched to Expenses.' : 'Switched to Expenses.', 'info');
            }
        },
        {
            id: 'quick-customer',
            label: isEnglishUi ? 'Customer account' : 'Customer account',
            description: isEnglishUi ? 'Open customer accounts and ledgers.' : 'Open customer accounts and ledgers.',
            onClick: () => {
                setView('customers');
                addToast(isEnglishUi ? 'Switched to Customers.' : 'Switched to Customers.', 'info');
            }
        }
    ].filter((item) => {
        if (item.id === 'quick-sale')
            return canViewSales;
        if (item.id === 'quick-medicine')
            return canManagePurchases || hasAccessPermission('create_medicine', 'manage_inventory');
        if (item.id === 'quick-purchase')
            return canManagePurchases;
        if (item.id === 'quick-expense')
            return canManageExpenses;
        if (item.id === 'quick-customer')
            return canViewCustomers;
        return true;
    }), [addToast, canManageExpenses, canManagePurchases, canViewCustomers, canViewSales, hasAccessPermission, isEnglishUi, setView]);
    const commandPaletteItems = useMemo<CommandPaletteItem[]>(() => [
        {
            id: 'cmd-dashboard',
            label: isEnglishUi ? 'Go to Dashboard' : 'Go to Dashboard',
            description: isEnglishUi ? 'Open the management overview.' : 'Open the management overview.',
            group: isEnglishUi ? 'Navigation' : 'Navigation',
            keywords: ['dashboard', 'overview', 'home', 'داشبورد'],
            onSelect: () => setView('dashboard')
        },
        {
            id: 'cmd-inventory',
            label: isEnglishUi ? 'Go to Inventory' : 'Go to Inventory',
            description: isEnglishUi ? 'Open medicines and stock workspace.' : 'Open medicines and stock workspace.',
            group: isEnglishUi ? 'Navigation' : 'Navigation',
            keywords: ['inventory', 'stock', 'medicine', 'انبار', 'دوا'],
            onSelect: () => setView('inventory')
        },
        {
            id: 'cmd-sales',
            label: isEnglishUi ? 'Go to Sales / POS' : 'Go to Sales / POS',
            description: isEnglishUi ? 'Open the billing and POS workspace.' : 'Open the billing and POS workspace.',
            group: isEnglishUi ? 'Navigation' : 'Navigation',
            keywords: ['sales', 'pos', 'invoice', 'ف?روش', 'بل'],
            shortcut: 'F2',
            onSelect: () => setView('sales')
        },
        {
            id: 'cmd-purchases',
            label: isEnglishUi ? 'Go to Purchases' : 'Go to Purchases',
            description: isEnglishUi ? 'Open procurement and supplier finance.' : 'Open procurement and supplier finance.',
            group: isEnglishUi ? 'Navigation' : 'Navigation',
            keywords: ['purchase', 'supplier', 'buy', 'خرید', 'تدارکات'],
            onSelect: () => setView('purchases')
        },
        {
            id: 'cmd-partnerships',
            label: isEnglishUi ? 'Go to Partnerships' : 'Go to Partnerships',
            description: isEnglishUi ? 'Open partner accounts, separate stock ownership, and sales profit.' : 'Open partner accounts, separate stock ownership, and sales profit.',
            group: isEnglishUi ? 'Navigation' : 'Navigation',
            keywords: ['partnership', 'partner', 'equity', 'شراکت', 'حسابات'],
            onSelect: () => setView('partnerships')
        },
        {
            id: 'cmd-customers',
            label: isEnglishUi ? 'Go to Customers' : 'Go to Customers',
            description: isEnglishUi ? 'Open customer balances and accounts.' : 'Open customer balances and accounts.',
            group: isEnglishUi ? 'Navigation' : 'Navigation',
            keywords: ['customers', 'accounts', 'ledger', 'مشتری', 'حسابات'],
            onSelect: () => setView('customers')
        },
        {
            id: 'cmd-reports',
            label: isEnglishUi ? 'Open Reports' : 'Open Reports',
            description: isEnglishUi ? 'Management insights and KPI views.' : 'Management insights and KPI views.',
            group: isEnglishUi ? 'Navigation' : 'Navigation',
            keywords: ['reports', 'analytics', 'راپور', 'تحلیل'],
            onSelect: () => setView('reports')
        },
        {
            id: 'cmd-reports-advanced',
            label: isEnglishUi ? 'Open Advanced Reports' : 'Open Advanced Reports',
            description: isEnglishUi ? 'Custom analysis workspace.' : 'Custom analysis workspace.',
            group: isEnglishUi ? 'Navigation' : 'Navigation',
            keywords: ['advanced reports', 'custom report', 'راپور پیشرف?ته'],
            onSelect: () => setView('reports_advanced')
        },
        {
            id: 'cmd-settings-general',
            label: isEnglishUi ? 'Open General Settings' : 'Open General Settings',
            description: isEnglishUi ? 'Store profile, defaults, and runtime options.' : 'Store profile, defaults, and runtime options.',
            group: isEnglishUi ? 'System' : 'System',
            keywords: ['settings', 'general', 'store', 'تنظیمات', 'عمومی'],
            onSelect: () => {
                setRequestedSettingsTab('general');
                setView('settings');
            }
        },
        {
            id: 'cmd-settings-updates',
            label: isEnglishUi ? 'Open Update Center' : 'Open Update Center',
            description: isEnglishUi ? 'Review runtime version and published release.' : 'Review runtime version and published release.',
            group: isEnglishUi ? 'System' : 'System',
            keywords: ['update', 'release', 'installer', 'بروزرسانی'],
            onSelect: () => {
                setRequestedSettingsTab('updates');
                setView('settings');
            }
        },
        {
            id: 'cmd-open-notifications',
            label: isEnglishUi ? 'Open Notifications' : 'Open Notifications',
            description: isEnglishUi ? 'Review admin and sync events.' : 'Review admin and sync events.',
            group: isEnglishUi ? 'Actions' : 'Actions',
            keywords: ['notifications', 'alerts', 'اعلان'],
            onSelect: handleOpenNotificationCenter
        },
        {
            id: 'cmd-toggle-zen',
            label: isZenMode ? (isEnglishUi ? 'Exit zen mode' : 'Exit zen mode') : (isEnglishUi ? 'Enter zen mode' : 'Enter zen mode'),
            description: isEnglishUi ? 'Hide or restore the sidebar shell.' : 'Hide or restore the sidebar shell.',
            group: isEnglishUi ? 'Actions' : 'Actions',
            keywords: ['zen', 'focus', 'تمرکز'],
            shortcut: isZenMode ? 'Esc' : 'Ctrl + .',
            onSelect: () => setIsZenMode((prev) => !prev)
        },
        ...quickAddItems.map((item) => ({
            id: `action-${item.id}`,
            label: item.label,
            description: item.description,
            group: isEnglishUi ? 'Quick actions' : 'Quick actions',
            keywords: [item.label, item.description || ''],
            onSelect: item.onClick
        }))
    ].filter((item) => {
        if (item.id === 'cmd-settings-updates')
            return false;
        if (item.id === 'cmd-dashboard')
            return canViewDashboard;
        if (item.id === 'cmd-inventory')
            return canViewInventory;
        if (item.id === 'cmd-sales')
            return canViewSales;
        if (item.id === 'cmd-purchases')
            return canViewPurchases;
        if (item.id === 'cmd-partnerships')
            return canViewPartnerships;
        if (item.id === 'cmd-customers')
            return canViewCustomers;
        if (item.id === 'cmd-reports' || item.id === 'cmd-reports-advanced')
            return canViewReports;
        if (item.id === 'cmd-settings-general' || item.id === 'cmd-settings-updates')
            return canOpenSettingsWorkspace;
        return true;
    }), [
        canOpenSettingsWorkspace,
        canViewCustomers,
        canViewDashboard,
        canViewInventory,
        canViewPartnerships,
        canViewPurchases,
        canViewReports,
        canViewSales,
        handleOpenNotificationCenter,
        isEnglishUi,
        isZenMode,
        quickAddItems,
        setView
    ]);
    // --- Render Logic ---
    // PHASE 3: HYDRATION ERROR UI
    if (hydrationError) {
        return (<div className="fixed inset-0 flex flex-col items-center justify-center bg-red-50 text-red-900 p-8 z-[100]" dir={settings.language === 'english' ? 'ltr' : 'rtl'}>
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg border border-red-200 text-center">
                    <h1 className="text-2xl font-black mb-4">{settings.language === 'english' ? 'Data Load Error' : 'خطا در بارگذاری داده‌ها'}</h1>
                    <p className="mb-6 text-sm">{hydrationError}</p>
                    <button onClick={() => window.location.reload()} className="bg-red-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700">
                        {settings.language === 'english' ? 'Retry' : 'تلاش دوباره'}
                    </button>
                </div>
            </div>);
    }
    if (loading)
        return <WarehouseLoader progress={50} statusText={settings.language === 'english' ? 'Loading...' : 'در حال بارگذاری…'}/>;
    if (!user && true) {
        return <div className="min-h-screen flex items-center justify-center" dir={settings.language === 'english' ? 'ltr' : 'rtl'}>
            <button type="button" className="bg-blue-600 text-white rounded-lg px-6 py-3" onClick={() => handleLoginSuccess({ ...COMMUNITY_PROFILE })}>{settings.language === 'english' ? 'Open offline workspace' : 'باز کردن برنامهٔ آفلاین'}</button>
        </div>;
    }
    if (!user) {
        return (<div className="h-dvh min-h-screen w-full bg-gray-50 flex flex-col relative">
                {null}
                <ToastContainer toasts={toasts} removeToast={removeToast}/>
            </div>);
    }
    if (shouldShowLockScreen) {
        return (<div className="h-dvh min-h-screen w-full relative">
                <LockScreen users={lockScreenUsers} onUnlock={handleAppUserUnlock} onLogout={handleLogout} language={settings.language} settings={settings}/>
            </div>);
    }
    return (<div className={`h-dvh min-h-screen w-full overflow-hidden bg-[#f6f7f9] font-sans ${isDesktopShell ? 'wk-desktop-performance' : ''}`} dir={settings.language === 'english' ? 'ltr' : 'rtl'} data-wk-shell-density={desktopShellDensity}>
            <div className="flex h-full w-full flex-col overflow-hidden bg-white">
            <AppTopBar syncStatus={syncStatus} isDeviceOnline={connectivityState.browserOnline} isConnectionOnline={connectivityState.effectiveOnline} language={settings.language} notificationCount={unreadNotificationCount} hasNotificationAlert={hasUnreadAlert} showQuickActions profileName={activeProfileName} profileInitial={activeProfileInitial} isZenMode={isZenMode} isSidebarCollapsed={isSidebarCollapsed} workspaceName={settings.storeName || 'WareKeep'} workspaceMeta={operationModeLabel} updateAvailable={shouldExposePublishedRelease} quickAddItems={quickAddItems} onToggleSidebar={handleSidebarToggle} onOpenWorkspace={canOpenSettingsWorkspace ? () => {
            setRequestedSettingsTab('general');
            setView('settings');
        } : undefined} onOpenCommandPalette={() => setIsCommandPaletteOpen(true)} onOpenAssistant={() => setView('assistant')} onOpenUpdates={canOpenSettingsWorkspace ? () => {
            setRequestedSettingsTab('updates');
            setView('settings');
        } : undefined} onToggleZenMode={() => setIsZenMode((prev) => !prev)} onOpenNotifications={handleOpenNotificationCenter} onOpenSettings={canManageSettingsAccess ? () => {
            setRequestedSettingsTab('general');
            setView('settings');
        } : undefined} onOpenProfile={canManageUsersAccess || user?.provider === 'guest' ? () => {
            setRequestedSettingsTab(user?.provider === 'guest' || !canManageUsersAccess ? 'general' : 'users');
            setView('settings');
        } : undefined}/>

            <div ref={shellViewportRef} className="flex flex-1 min-h-0 overflow-hidden bg-white">
                {!isZenMode && (<Sidebar currentView={view} setView={setView} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} googleUser={user} activeAppUser={activeAppUser} onLogout={handleLogout} onLock={handleLocalQuickLock} settings={settings} isCollapsed={isSidebarCollapsed} onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)} onOpenSubscription={() => {
                setRequestedSettingsTab('subscription');
                setView('settings');
            }}/>)}
                    
                <main className="flex-1 min-w-0 min-h-0 overflow-hidden relative flex flex-col" data-testid="app-main-shell">
                    {isViewPending && (<div className="pointer-events-none absolute inset-x-0 top-0 z-40 h-1 bg-gradient-to-r from-brand-400 via-cyan-400 to-brand-600 opacity-90"/>)}
                    <div className="flex-1 min-h-0 overflow-y-auto">
                    {(hasControlBanner || (false)) && (<div className="mx-3 mt-3 space-y-2">
                    {hasControlBanner && (<div className="wk-shell-notice wk-shell-notice--info">
                            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                                <div>
                                    <p className="text-[13px] font-black text-slate-900">
                                        {controlPlaneState?.lockdownMode === 'force_update'
                    ? (settings.language === 'english' ? 'A required update is available.' : 'یک به‌روزرسانی اجباری موجود است.')
                    : controlPlaneState?.maintenanceBanner || (settings.language === 'english' ? 'Live operations updated.' : 'وضعیت عملیات زنده به‌روزرسانی شد.')}
                                    </p>
                                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                                        {shouldExposePublishedRelease && controlPlaneState?.appRelease
                    ? (isEnglishUi
                        ? `Latest release: ${controlPlaneState.appRelease.version} (${getLocalizedReleaseChannelLabel(controlPlaneState.appRelease.channel, isEnglishUi)}).`
                        : `آخرین انتشار: ${controlPlaneState.appRelease.version} (${getLocalizedReleaseChannelLabel(controlPlaneState.appRelease.channel, isEnglishUi)}).`)
                    : controlPlaneState?.lockdownMode === 'force_update' && controlPlaneState?.minimumVersion
                        ? (isEnglishUi
                            ? `Minimum required version: ${controlPlaneState.minimumVersion}.`
                            : `حداقل نسخه موردنیاز: ${controlPlaneState.minimumVersion}.`)
                        : (controlPlaneFetchError || '')}
                                    </p>
                                    {shouldExposePublishedRelease && controlPlaneState?.appRelease?.installerUrl ? (<p className="mt-0.5 text-[10.5px] font-semibold text-slate-500">
                                            {settings.language === 'english'
                        ? `Update file: WareKeep-Setup-${controlPlaneState.appRelease.version}.exe`
                        : `ف?ایل بروزرسانی: WareKeep-Setup-${controlPlaneState.appRelease.version}.exe`}
                                        </p>) : null}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-black">
                                    {controlPlaneState?.syncPaused ? (<span className="wk-shell-notice-chip border-amber-200/60 bg-amber-50 text-amber-800">
                                            {settings.language === 'english' ? 'Sync paused for this device' : 'همگام‌سازی این دستگاه متوقف شده است'}
                                        </span>) : null}
                                    {controlPlaneState?.reauthorizeRequired ? (<span className="wk-shell-notice-chip border-rose-200/60 bg-rose-50 text-rose-700">
                                            {settings.language === 'english' ? 'Device reauthorization required' : 'نیاز به تأیید دوباره دستگاه'}
                                        </span>) : null}
                                    {shouldExposePublishedRelease && controlPlaneState?.appRelease?.installerUrl ? (<button type="button" onClick={() => void handleInstallAvailableUpdate()} disabled={isInstallingUpdate} className="wk-btn wk-btn-primary min-h-[29px] px-2.5 text-[10.5px] disabled:cursor-not-allowed disabled:opacity-60">
                                            {isInstallingUpdate
                        ? (settings.language === 'english' ? 'Preparing Update...' : 'در حال آماده‌سازی به‌روزرسانی…')
                        : (settings.language === 'english' ? 'Start Update' : 'شروع به‌روزرسانی')}
                                        </button>) : null}
                                </div>
                            </div>
                        </div>)}
                    {false}
                        </div>)}
                    <Suspense fallback={(<div className="flex min-h-[320px] items-center justify-center p-8 text-sm font-black text-slate-500" role="status">
                            {settings.language === 'english' ? 'Loading workspace…' : 'در حال بارگذاری بخش…'}
                        </div>)}>
                    {view === 'dashboard' && (<Dashboard medicines={medicines} invoices={invoices} customers={customers} expenses={expenses} purchases={purchases} suppliers={suppliers} settings={settings} setView={setView} onNotify={addToast} guestTrialState={guestTrialState} onUpgradeGuestToFree={undefined} onOpenInvoiceManager={() => {
                setRequestedReportsOverlay('invoice_manager');
                setView('reports');
            }}/>)}
                    {view === 'inventory' && (<Inventory medicines={medicines} addMedicine={addMedicine} updateMedicine={updateMedicine} deleteMedicine={deleteMedicine} restoreArchivedMedicine={restoreArchivedMedicine} purgeArchivedMedicine={purgeArchivedMedicine} updateBatch={updateBatch} addBatch={addBatch} onAddMedicineWithProcurementDraft={addMedicineWithProcurementDraft} activeAppUser={activeAppUser} invoices={invoices} customers={customers} settings={settings} addExpense={addExpense} onSaveSettings={async (newSettings) => {
                if (!ensureWritable('saveSettings'))
                    return false;
                const invoicePolicySettings = enforceInvoiceDesignPolicy(newSettings, user?.email);
                const enforced = enforceOperationModePolicy(invoicePolicySettings);
                const committed = await persistData({ settings: enforced.settings });
                if (!committed)
                    return false;
                if (enforced.message) {
                    addToast(enforced.message, "warning");
                }
                return true;
            }} suppliers={suppliers} purchases={purchases} partners={partners} requestedFilter={requestedInventoryFilter} onRequestedFilterApplied={() => setRequestedInventoryFilter(null)} onReturnItem={returnInvoiceItem} onRecordVendorReturn={recordVendorReturn} onRecordStockWaste={recordStockWaste} onGoToSuppliers={() => {
                setRequestedPurchasesTab('suppliers');
                setView('purchases');
            }} onStartPurchaseReceipt={(context) => {
                setRequestedPurchasesTab('new');
                setRequestedPurchaseContext(context);
                setView('purchases');
            }} isGuestTrial={false} canStartGuestAiRequest={canStartGuestAiRequest} onGuestAiSuccess={recordGuestAiSuccess}/>)}
                    {view === 'sales' && (<Sales customers={customers} medicines={medicines} addInvoice={addInvoice} addCustomer={addCustomer} settings={settings} activeAppUser={activeAppUser} invoices={invoices} partners={partners} suppliers={suppliers} draft={salesDraft} onUpdateDraft={(updates) => setSalesDraft((prev) => ({ ...prev, ...updates }))} guestTrialState={guestTrialState}/>)}
                    {view === 'customers' && (<Customers customers={customers} addCustomer={addCustomer} updateCustomer={updateCustomer} deleteCustomer={deleteCustomer} addCustomerPayment={addCustomerPayment} settings={settings} readOnly={!canManageCustomerDetails} ledgerReadOnly={!canManageCustomerLedger} isGuestTrial={false}/>)}
                    {view === 'expenses' && (<Expenses expenses={expenses} onAddExpense={addExpense} onUpdateExpense={updateExpense} onDeleteExpense={deleteExpense} onUpdateExpensesBulk={updateExpensesBulk} onDeleteExpensesBulk={deleteExpensesBulk} settings={settings} activeAppUser={activeAppUser} readOnly={!canManageExpenses}/>)}
                    {view === 'partnerships' && (<Partnerships partners={partners} invoices={invoices} purchases={purchases} medicines={medicines} expenses={expenses} settings={settings} activeAppUser={activeAppUser} onAddPartner={addPartner} onUpdatePartner={updatePartner} onDeletePartner={deletePartner} onAddPartnerLedgerEntry={addPartnerLedgerEntry} onOpenPurchases={() => {
                setRequestedPurchasesTab('new');
                setView('purchases');
            }} onOpenPurchaseEdit={(purchaseId) => {
                setRequestedPurchaseDraftFocus({ purchaseId });
                setView('purchases');
            }} readOnly={false}/>)}
                    {view === 'reports' && (<Reports mode="home" invoices={invoices} medicines={medicines} customers={customers} expenses={expenses} purchases={purchases} suppliers={suppliers} settings={settings} activeAppUser={activeAppUser} onNavigate={(nextView) => setView(nextView)} onDeleteInvoices={deleteInvoices} canDeleteInvoices={canDeleteInvoices} onUpdateInvoice={updateInvoice} canEditInvoices={canEditInvoices} onTransferInvoiceSeller={transferInvoiceSeller} canTransferInvoiceSeller={canTransferInvoiceSeller} onAddExpense={addExpense} onUpdateExpense={updateExpense} onDeleteExpense={deleteExpense} canManageExpenses={canManageExpenses} requestedFinancialOverlay={requestedReportsOverlay} onRequestedFinancialOverlayApplied={() => setRequestedReportsOverlay(null)}/>)}
                    {view === 'reports_advanced' && (<Reports mode="advanced" invoices={invoices} medicines={medicines} customers={customers} expenses={expenses} purchases={purchases} suppliers={suppliers} settings={settings} activeAppUser={activeAppUser} onNavigate={(nextView) => setView(nextView)} onDeleteInvoices={deleteInvoices} canDeleteInvoices={canDeleteInvoices} onUpdateInvoice={updateInvoice} canEditInvoices={canEditInvoices} onTransferInvoiceSeller={transferInvoiceSeller} canTransferInvoiceSeller={canTransferInvoiceSeller} onAddExpense={addExpense} onUpdateExpense={updateExpense} onDeleteExpense={deleteExpense} canManageExpenses={canManageExpenses}/>)}
                    {view === 'payroll' && <Payroll settings={settings} invoices={invoices} medicines={medicines} expenses={expenses} onAddExpense={addExpense} activeAppUser={activeAppUser} readOnly={!canManagePayroll}/>}
                    {view === 'settings' && (<Settings settings={settings} onSaveSettings={async (newSettings) => {
                if (!ensureWritable('saveSettings'))
                    return;
                const invoicePolicySettings = enforceInvoiceDesignPolicy(newSettings, user?.email);
                const enforced = enforceOperationModePolicy(invoicePolicySettings);
                const committed = await persistData({ settings: enforced.settings });
                if (!committed)
                    return false;
                if (enforced.message) {
                    addToast(enforced.message, "warning");
                }
                addToast("تنظیمات ذخیره شد", "success");
            }} onRestoreData={async (data) => {
                if (!ensureWritable('restoreData'))
                    return false;
                const restoredSnapshot = prepareImportedFullDataForRestore(data);
                if (!restoredSnapshot) {
                    addToast("ف?ایل پشتیبان نامعتبر است.", "error");
                    return false;
                }
                const committed = await persistData(restoredSnapshot, {
                    allowWipe: true,
                    dropPendingSync: true,
                    forceCloudSync: true,
                    replaceCloudSnapshot: true,
                    forceSettingsStateUpdate: true
                });
                if (!committed)
                    return false;
                evaluateDataIntegrity(restoredSnapshot, 'restore', { silentWhenClean: true });
                addToast("بازگردانی انجام شد", "success");
                return true;
            }} onManualBackup={async () => { }} onManualRestore={async () => { }} googleUser={user} onLogin={() => { }} onSystemReset={handleSystemReset} invoices={invoices} medicines={medicines} customers={customers} expenses={expenses} suppliers={suppliers} purchases={purchases} partners={partners} auditEvents={auditEvents} stockMovements={stockMovements} treasuryTransactions={treasuryTransactions} treasuryCashCounts={treasuryCashCounts} activeAppUser={activeAppUser} requestedTab={requestedSettingsTab} onRequestedTabApplied={() => setRequestedSettingsTab(null)} readOnly={false} guestTrialState={guestTrialState} onResetGuestTrial={handleResetGuestTrial} onUpgradeGuestToFree={undefined} runtimeVersion={runtimeVersion} controlPlaneState={controlPlaneState} controlPlaneFetchError={controlPlaneFetchError} onRefreshUpdates={handleRefreshUpdateStatus} onInstallUpdate={handleInstallAvailableUpdate} onOpenUpdatePrompt={() => setIsUpdatePromptOpen(true)} onOpenMedicineArchive={handleOpenMedicineArchive} treasuryScope={treasuryAdoptionScope} canManageLegacyTreasury={canAdoptLegacyTreasury} isRefreshingUpdates={isRefreshingUpdates} isInstallingUpdate={isInstallingUpdate} updateInstallProgress={updateInstallProgress}/>)}
                    {false}
                    {view === 'purchases' && (
        // @ts-ignore VS Code tsserver can keep a stale mismatched prop diagnostic here even when project typecheck passes.
        <Purchases suppliers={suppliers} purchases={purchases} partners={partners} medicines={medicines} invoices={invoices} onAddSupplier={addSupplier} onUpdateSupplier={updateSupplier} onDeleteSupplier={deleteSupplier} onAddPurchase={addPurchase} onUpdatePurchase={updatePurchase} onDeletePurchase={deletePurchase} onRecordPurchasePayment={((purchaseId, payment) => {
                recordPurchasePayment(purchaseId, payment);
            }) as PurchasesProps['onRecordPurchasePayment']} onRecordPurchaseReceipt={((purchaseId, receipt) => {
                recordPurchaseReceipt(purchaseId, receipt);
            }) as PurchasesProps['onRecordPurchaseReceipt']} onShortClosePurchase={((purchaseId, reason) => {
                shortClosePurchase(purchaseId, reason);
            }) as PurchasesProps['onShortClosePurchase']} onAddSupplierPayment={((supplierId, payment) => {
                addSupplierPayment(supplierId, payment);
            }) as PurchasesProps['onAddSupplierPayment']} onRecordSupplierSettlement={((supplierId, payment) => {
                recordSupplierSettlement(supplierId, payment);
            }) as PurchasesProps['onRecordSupplierSettlement']} settings={settings} activeAppUser={activeAppUser} readOnly={!canManagePurchases} requestedTab={requestedPurchasesTab} onRequestedTabApplied={() => setRequestedPurchasesTab(null)} requestedPurchaseContext={requestedPurchaseContext} onRequestedPurchaseContextApplied={() => setRequestedPurchaseContext(null)} requestedPurchaseDraftFocus={requestedPurchaseDraftFocus} onRequestedPurchaseDraftFocusApplied={() => setRequestedPurchaseDraftFocus(null)}/>)}
                    {false}
                    {view === 'treasury' && (<Treasury invoices={invoices} expenses={expenses} customers={customers} suppliers={suppliers} purchases={purchases} settings={settings} activeAppUser={activeAppUser} treasuryTransactions={treasuryTransactions} treasuryCashCounts={treasuryCashCounts} onAddTreasuryTransaction={addTreasuryTransaction} onAddCashCount={addTreasuryCashCount} readOnly={!canManageTreasury}/>)}
                    </Suspense>
                    </div>
                </main>
            </div>
            </div>
            {/* Legacy treasury adoption. Deliberately NOT dismissable by clicking away or by an X:
the two exits are Import and "Not mine", because a third "decide later by accident"
exit is how an unattributable cash ledger ends up silently adopted or silently lost. */}
            <Modal isOpen={!!legacyTreasuryPrompt} onClose={handleDeclineLegacyTreasury} title={settings.language === 'english' ? 'Treasury records found on this device' : 'سوابق خزانه در این دستگاه پیدا شد'} maxWidthClassName="max-w-2xl">
                {legacyTreasuryPrompt && (<div className="space-y-4" data-testid="legacy-treasury-prompt">
                        <p className="text-sm font-semibold text-slate-600">
                            {settings.language === 'english'
                ? 'An older version of WareKeep stored treasury records on this device without recording which account they belong to. They have NOT been imported. Confirm they belong to this business before importing them into your account.'
                : 'نسخه قدیمی‌تر ویرکیپ سوابق خزانه را در این دستگاه ذخیره کرده بود بدون اینکه ثبت کند به کدام حساب تعلق دارند. این سوابق وارد نشده‌اند. پیش از وارد کردن به حساب خود، تأیید کنید که متعلق به این کسب‌وکار هستند.'}
                        </p>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                            <p data-testid="legacy-treasury-counts">
                                {settings.language === 'english'
                ? `${legacyTreasuryPrompt.transactionCount} transactions · ${legacyTreasuryPrompt.cashCountCount} cash counts`
                : `${legacyTreasuryPrompt.transactionCount} تراکنش · ${legacyTreasuryPrompt.cashCountCount} شمارش نقدی`}
                            </p>
                            {(legacyTreasuryPrompt.earliestDate || legacyTreasuryPrompt.latestDate) && (<p className="mt-1 text-slate-500">
                                    {settings.language === 'english' ? 'Date range: ' : 'بازه تاریخ: '}
                                    {legacyTreasuryPrompt.earliestDate || '—'} → {legacyTreasuryPrompt.latestDate || '—'}
                                </p>)}
                            <ul className="mt-2 space-y-1">
                                {legacyTreasuryPrompt.currencies.map((total) => (<li key={total.currency} className="text-slate-600">
                                        {total.currency}: {settings.language === 'english' ? 'in' : 'ورودی'} {total.inTotal} · {settings.language === 'english' ? 'out' : 'خروجی'} {total.outTotal} · {settings.language === 'english' ? 'net' : 'خالص'} {total.netTotal}
                                    </li>))}
                            </ul>
                            {legacyTreasuryPrompt.overScaleTransactionIds.length > 0 && (<p className="mt-2 text-amber-700">
                                    {settings.language === 'english'
                    ? `${legacyTreasuryPrompt.overScaleTransactionIds.length} transaction(s) have amounts with more than 2 decimal places and may be rejected by the server migration.`
                    : `${legacyTreasuryPrompt.overScaleTransactionIds.length} تراکنش مبلغ با بیش از ۲ رقم اعشار دارد و ممکن است در انتقال به سرور رد شود.`}
                                </p>)}
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                            <button type="button" onClick={() => void handleAdoptLegacyTreasury()} data-testid="legacy-treasury-adopt" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-100">
                                <p className="text-base font-black text-emerald-900">
                                    {settings.language === 'english' ? 'Yes, import into this account' : 'بله، به این حساب وارد کن'}
                                </p>
                                <p className="mt-2 text-sm font-semibold text-emerald-800">
                                    {settings.language === 'english'
                ? 'These records belong to this business. They become part of this account only.'
                : 'این سوابق متعلق به این کسب‌وکار است و فقط بخشی از همین حساب می‌شود.'}
                                </p>
                            </button>
                            <button type="button" onClick={handleDeclineLegacyTreasury} data-testid="legacy-treasury-decline" className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50">
                                <p className="text-base font-black text-slate-900">
                                    {settings.language === 'english' ? 'Not mine / decide later' : 'مال من نیست / بعداً تصمیم می‌گیرم'}
                                </p>
                                <p className="mt-2 text-sm font-semibold text-slate-600">
                                    {settings.language === 'english'
                ? 'Nothing is imported and nothing is deleted. The records stay on this device and can still be exported from Settings.'
                : 'چیزی وارد و چیزی حذف نمی‌شود. سوابق در این دستگاه می‌ماند و همچنان می‌توان از تنظیمات آن را صادر کرد.'}
                                </p>
                            </button>
                        </div>
                    </div>)}
            </Modal>
            <Modal isOpen={isGuestUpgradePromptOpen && false} onClose={() => setIsGuestUpgradePromptOpen(false)} title={settings.language === 'english' ? 'Upgrade Guest Trial to Free' : 'ارتقای حالت مهمان به حساب رایگان'} maxWidthClassName="max-w-2xl">
                <div className="space-y-4">
                    <p className="text-sm font-semibold text-slate-600">
                        {settings.language === 'english'
            ? 'Choose whether Guest Trial data should move into the new free account after successful authentication.'
            : 'انتخاب کنید داده‌های حالت مهمان پس از ورود موفق، به حساب رایگان جدید منتقل شود یا نه.'}
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                        <button type="button" onClick={() => void handleBeginGuestUpgrade('keep')} data-testid="guest-upgrade-keep" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-100">
                            <p className="text-base font-black text-emerald-900">
                                {settings.language === 'english' ? 'Keep guest data' : 'حفظ داده‌های مهمان'}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-emerald-800">
                                {settings.language === 'english'
            ? 'Medicines, customers, invoices, and safe UI settings move into the new account. Guest limits are removed after auth.'
            : 'داروها، مشتریان، فاکتورها و تنظیمات امن رابط به حساب جدید منتقل می‌شوند. محدودیت‌های مهمان پس از ورود برداشته می‌شود.'}
                            </p>
                        </button>
                        <button type="button" onClick={() => void handleBeginGuestUpgrade('discard')} data-testid="guest-upgrade-discard" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300 hover:bg-slate-100">
                            <p className="text-base font-black text-slate-900">
                                {settings.language === 'english' ? 'Start clean' : 'شروع خالی'}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-slate-700">
                                {settings.language === 'english'
            ? 'The new account starts empty and Guest Trial data will be cleared from this device after confirmation.'
            : 'حساب جدید خالی شروع می‌شود و داده‌های حالت مهمان پس از تأیید، از این دستگاه پاک می‌شود.'}
                            </p>
                        </button>
                    </div>
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                        {settings.language === 'english'
            ? 'Migration stays local to this device, runs only after real account authentication, and blocks tampered or over-limit guest data.'
            : 'انتقال فقط روی همین دستگاه انجام می‌شود، تنها پس از ورود واقعی به حساب اجرا می‌شود و داده‌های دستکاری‌شده یا بیش از حد مجاز را مسدود می‌کند.'}
                    </p>
                </div>
            </Modal>
            {isGuestUpgradeAuthOpen && false && (<div className="fixed inset-0 z-[140] bg-slate-950/70 backdrop-blur-sm">
                    {null}
                </div>)}
            <Modal isOpen={isUpdatePromptOpen && (shouldExposePublishedRelease || isForcedUpdateActive)} onClose={handleCloseUpdatePrompt} title={isEnglishUi ? 'Install the new WareKeep update' : 'Install the new WareKeep update'} maxWidthClassName="max-w-none" panelClassName="h-[100dvh] w-[100vw] rounded-none border-0 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.18),_transparent_28%),linear-gradient(135deg,_#020617_0%,_#0f172a_45%,_#111827_100%)] text-white shadow-none" headerClassName="flex items-center justify-between border-b border-white/10 bg-slate-950/70 px-6 py-5 backdrop-blur-sm md:px-10" bodyClassName="min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-10 md:py-12" footerClassName="border-t border-white/10 bg-slate-950/80 px-6 py-5 backdrop-blur-sm md:px-10" overlayClassName="fixed inset-0 z-[130] flex bg-slate-950/88 backdrop-blur-md" titleClassName="text-lg font-black text-white md:text-2xl" closeButtonClassName="rounded-full border border-white/10 p-2 text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white" hideCloseButton={isForcedUpdateActive} disableClose={isForcedUpdateActive} animateClassName={false} footer={<div className="mx-auto flex w-full max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <p className="text-sm font-semibold text-slate-300">
                            {controlPlaneState?.appRelease?.installerUrl
                ? (isEnglishUi
                    ? 'The Windows installer is attached and ready to run on this device.'
                    : 'The Windows installer is attached and ready to run on this device.')
                : (isEnglishUi
                    ? 'No installer file is attached to this release yet.'
                    : 'No installer file is attached to this release yet.')}
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                            {!isForcedUpdateActive ? (<button type="button" onClick={handleCloseUpdatePrompt} className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-slate-100 transition hover:bg-white/10">
                                    {isEnglishUi ? 'Remind Me Later' : 'Remind Me Later'}
                                </button>) : null}
                            <button type="button" onClick={() => void handleInstallAvailableUpdate()} disabled={!controlPlaneState?.appRelease?.installerUrl || isInstallingUpdate} className="rounded-2xl bg-gradient-to-r from-amber-300 via-yellow-300 to-orange-300 px-6 py-3 text-sm font-black text-slate-950 shadow-[0_18px_40px_-22px_rgba(251,191,36,0.85)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40">
                                {isInstallingUpdate
                ? (isEnglishUi ? 'Preparing Installer...' : 'Preparing Installer...')
                : (isEnglishUi ? 'Install New Update Now' : 'Install New Update Now')}
                            </button>
                        </div>
                    </div>}>
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
                    <section className="grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">
                        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.85)] backdrop-blur-sm md:p-8">
                            <span className={`inline-flex rounded-full px-4 py-1 text-xs font-black ${isForcedUpdateActive ? 'border border-rose-300/30 bg-rose-500/15 text-rose-100' : 'border border-sky-300/30 bg-sky-500/15 text-sky-100'}`}>
                                {isForcedUpdateActive
            ? (isEnglishUi ? 'Required Update' : 'Required Update')
            : (isEnglishUi ? 'New Release Published' : 'New Release Published')}
                            </span>
                            <h2 className="mt-4 text-3xl font-black leading-tight text-white md:text-5xl">
                                {isForcedUpdateActive
            ? (isEnglishUi ? 'Install the new version before continuing.' : 'Install the new version before continuing.')
            : (isEnglishUi ? 'A fresh WareKeep update is ready for this device.' : 'A fresh WareKeep update is ready for this device.')}
                            </h2>
                            <p className="mt-4 max-w-3xl text-base font-semibold leading-8 text-slate-200 md:text-xl">
                                {isForcedUpdateActive
            ? (isEnglishUi
                ? 'The admin control plane marked this release as mandatory. Use the install button below to download and run the setup now.'
                : 'The admin control plane marked this release as mandatory. Use the install button below to download and run the setup now.')
            : (isEnglishUi
                ? 'A newer version has been published from the admin panel. Installing it now keeps this device aligned with the latest release.'
                : 'A newer version has been published from the admin panel. Installing it now keeps this device aligned with the latest release.')}
                            </p>

                            <div className="mt-6 grid gap-3 md:grid-cols-3">
                                <div className="rounded-2xl border border-white/10 bg-slate-900/55 p-4">
                                    <p className="text-xs font-bold text-slate-400">{isEnglishUi ? 'Installed Version' : 'Installed Version'}</p>
                                    <p className="mt-2 text-2xl font-black text-white">{runtimeVersion}</p>
                                </div>
                                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4">
                                    <p className="text-xs font-bold text-emerald-100/80">{isEnglishUi ? 'Published Version' : 'Published Version'}</p>
                                    <p className="mt-2 text-2xl font-black text-emerald-50">
                                        {controlPlaneState?.appRelease?.version || controlPlaneState?.minimumVersion || (isEnglishUi ? 'Latest' : 'Latest')}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-slate-900/55 p-4">
                                    <p className="text-xs font-bold text-slate-400">{isEnglishUi ? 'Release Channel' : 'Release Channel'}</p>
                                    <p className="mt-2 text-2xl font-black text-white">
                                        {getLocalizedReleaseChannelLabel(controlPlaneState?.appRelease?.channel, isEnglishUi)}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4">
                                <p className="text-sm font-black text-amber-100">
                                    {isEnglishUi ? 'What happens next?' : 'What happens next?'}
                                </p>
                                <p className="mt-2 text-sm font-semibold leading-7 text-amber-50/90">
                                    {isEnglishUi
            ? 'WareKeep downloads the official setup file, verifies its checksum, and launches the installer on this Windows device.'
            : 'WareKeep ف?ایل نصب رسمی را دانلود می‌کند، checksum آن را بررسی می‌کند و سپس installer را روی همین ویندوز اجرا می‌کند.'}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                                <p className="text-sm font-black text-slate-200">
                                    {isEnglishUi ? 'Installer File' : 'Installer File'}
                                </p>
                                <p className="mt-3 text-lg font-black text-white">
                                    {controlPlaneState?.appRelease?.installerUrl
            ? `WareKeep-Setup-${controlPlaneState.appRelease.version}.exe`
            : (isEnglishUi ? 'Installer link is not ready yet.' : 'Installer link is not ready yet.')}
                                </p>
                                <p className="mt-3 text-sm font-semibold leading-7 text-slate-300">
                                    {controlPlaneState?.appRelease?.installerUrl
            ? (isEnglishUi ? 'The setup file is ready. Install now to move this device onto the published release.' : 'The setup file is ready. Install now to move this device onto the published release.')
            : (isEnglishUi ? 'The release exists, but no installer link is attached yet. Upload the Windows installer from admin first.' : 'The release exists, but no installer link is attached yet. Upload the Windows installer from admin first.')}
                                </p>
                            </div>

                            {showUpdatePromptProgress ? (<div className="rounded-[28px] border border-sky-200/20 bg-white/8 p-6 shadow-[0_24px_70px_-42px_rgba(56,189,248,0.9)] backdrop-blur-sm">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-100/80">
                                                {isEnglishUi ? 'Live transfer' : 'Live transfer'}
                                            </p>
                                            <p className="mt-2 text-lg font-black text-white">
                                                {getUpdateProgressPhaseLabel(updatePromptProgressPhase, isEnglishUi)}
                                            </p>
                                            <p dir="ltr" className="mt-1 truncate text-xs font-bold text-slate-300">
                                                {updateInstallProgress?.filename || (controlPlaneState?.appRelease?.version ? `WareKeep-Setup-${controlPlaneState.appRelease.version}.exe` : 'WareKeep-Setup.exe')}
                                            </p>
                                        </div>
                                        <p dir="ltr" className="shrink-0 text-3xl font-black tabular-nums text-white">
                                            {updatePromptProgressLabel}
                                        </p>
                                    </div>

                                    <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
                                        <div className={`h-full rounded-full transition-[width] duration-300 ease-out ${updatePromptProgressBarClass}`} style={{ width: `${updatePromptProgressPercent}%` }}/>
                                    </div>

                                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                                        {[
                {
                    label: isEnglishUi ? 'Downloaded' : 'Downloaded',
                    value: formatUpdateTransferBytes(updatePromptDownloadedBytes, isEnglishUi)
                },
                {
                    label: isEnglishUi ? 'Remaining' : 'Remaining',
                    value: formatUpdateTransferBytes(updatePromptRemainingBytes, isEnglishUi)
                },
                {
                    label: isEnglishUi ? 'Speed' : 'Speed',
                    value: formatUpdateTransferSpeed(updateInstallProgress?.bytesPerSecond, isEnglishUi)
                },
                {
                    label: isEnglishUi ? 'ETA' : 'ETA',
                    value: formatUpdateTransferEta(updateInstallProgress?.estimatedSeconds, isEnglishUi)
                },
            ].map((metric) => (<div key={metric.label} className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2">
                                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">{metric.label}</p>
                                                <p className="mt-1 truncate text-sm font-black text-white" title={metric.value}>
                                                    {metric.value}
                                                </p>
                                            </div>))}
                                    </div>

                                    {updateInstallProgress?.error ? (<p className="mt-3 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm font-bold leading-7 text-rose-100">
                                            {updateInstallProgress.error}
                                        </p>) : null}
                                </div>) : null}

                            {controlPlaneState?.maintenanceBanner ? (<div className="rounded-[28px] border border-sky-300/20 bg-sky-500/10 p-6">
                                    <p className="text-sm font-black text-sky-100">
                                        {isEnglishUi ? 'Live Notice' : 'Live Notice'}
                                    </p>
                                    <p className="mt-3 text-sm font-semibold leading-7 text-sky-50/90">
                                        {controlPlaneState.maintenanceBanner}
                                    </p>
                                </div>) : null}

                            {controlPlaneState?.appRelease?.notes ? (<div className="rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                                    <p className="text-sm font-black text-slate-200">
                                        {isEnglishUi ? 'Release Notes' : 'Release Notes'}
                                    </p>
                                    <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-300">
                                        {controlPlaneState.appRelease.notes}
                                    </p>
                                </div>) : null}
                        </div>
                    </section>
                </div>
            </Modal>
            <NotificationCenter isOpen={isNotificationCenterOpen} isEnglish={settings.language === 'english'} settings={settings} isOnline={connectivityState.browserOnline} connectivityState={connectivityState} syncStatus={syncStatus} notifications={notificationItems} queueStatus={queueStatus} healthSnapshot={healthSnapshot} onClose={() => setIsNotificationCenterOpen(false)} onMarkAllRead={markAllNotificationsRead} onClearAll={clearNotificationCenter} onMarkRead={markNotificationRead} onOpenServerManagement={handleOpenServerManagement}/>
            <CommandPalette isOpen={isCommandPaletteOpen} language={settings.language} items={commandPaletteItems} onClose={() => setIsCommandPaletteOpen(false)}/>
            <ToastContainer toasts={toasts} removeToast={removeToast}/>
        </div>);
};
export default App; // Default export for index.tsx compatibility
