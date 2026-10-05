import { validateIntegrity } from "../utils/syncLogic";
import { repairCriticalDataIntegritySnapshot } from "../utils/dataIntegrityRepair";
import { normalizePersianNumbers } from "../utils/localization";
import { resolveAiLanguage } from "../utils/aiLanguage";
import { normalizeDateTimeSettings } from "../lib/formatters";
import { normalizeInventoryLinkedSyncSettings } from "../utils/inventoryLinkedSync";
import { resolveDefaultSalesMode } from "../constants/sales";
import { getUniqueMedicineUnits } from "../constants/medicineUnits";
import { normalizePurchaseRecord } from "../utils/purchaseUtils";
import { normalizeExpenseCategoryIcons } from "../utils/iconMatcher";
import { sanitizeMedicineClinicalSummary } from "./medicineTextSanitization";
import { startPerformanceSpan } from "../utils/performanceTelemetry";
import { normalizeMedicineCommissionRules, normalizeProductCommissionAdjustmentRules, normalizeCommissionAdjustmentPercent, clampCommissionRate } from "../utils/commissionRules";
type IpcResult<T> = {
    success: true;
    data?: T;
} | {
    success: false;
    error?: string;
};
const PERSISTED_SLICE_KEYS = new Set([
    'medicines',
    'customers',
    'invoices',
    'expenses',
    'settings',
    'suppliers',
    'purchases',
    'partners',
    'auditEvents',
    'stockMovements',
    // Treasury (cash ledger). Listing these here is what makes treasury USER-SCOPED: this store is
    // keyed per user (getLocalBackupKey -> `warekeep_<userId>_full_backup`, plus the per-user Electron
    // disk store), whereas treasury's legacy bare localStorage keys were shared by every account on
    // the device.
    // They must ALSO be listed for correctness, not just scoping: saveToDisk() filters `changedSlices`
    // against this set to build an Electron patch write. An unlisted slice is dropped from `slices`
    // while its siblings still write, so a mutation touching e.g. ['invoices','treasuryTransactions']
    // would patch invoices and silently leave the on-disk ledger stale.
    'treasuryTransactions',
    'treasuryCashCounts',
    'treasuryAccounts'
]);
const localSafetySnapshotTimers = new Map<string, number>();
const pendingLocalSafetySnapshots = new Map<string, unknown>();
const scheduleLocalSafetySnapshot = (storageKey: string, snapshot: unknown) => {
    pendingLocalSafetySnapshots.set(storageKey, snapshot);
    const previousTimer = localSafetySnapshotTimers.get(storageKey);
    if (previousTimer)
        window.clearTimeout(previousTimer);
    const timer = window.setTimeout(() => {
        localSafetySnapshotTimers.delete(storageKey);
        const latestSnapshot = pendingLocalSafetySnapshots.get(storageKey);
        pendingLocalSafetySnapshots.delete(storageKey);
        try {
            localStorage.setItem(storageKey, JSON.stringify(latestSnapshot));
        }
        catch {
            // Disk is authoritative in Electron. This cache remains best-effort.
        }
    }, 900);
    localSafetySnapshotTimers.set(storageKey, timer);
};
const getLocalBackupKey = (userId: string) => {
    const id = (userId && userId.trim() !== '') ? userId : 'guest';
    // Backwards compatible guest key
    if (id === 'guest')
        return 'guest_temp_full_backup';
    return `warekeep_${id}_full_backup`;
};
const isIpcResult = (value: any): value is IpcResult<any> => {
    return !!value && typeof value === 'object' && typeof value.success === 'boolean';
};
const hasElectronApi = (): boolean => {
    if (typeof window === 'undefined')
        return false;
    const api = (window as any).electronAPI;
    return !!api && typeof api === 'object';
};
const safeParseJson = (raw: string | null) => {
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch (e) {
        return null;
    }
};
const markStorageDegraded = (reason: string) => {
    try {
        localStorage.setItem('warekeep_storage_degraded', reason || '1');
    }
    catch (e) { }
};
const getRecordCount = (data: any): number => {
    if (!data || typeof data !== 'object')
        return 0;
    const getLen = (v: any) => Array.isArray(v) ? v.length : 0;
    return (getLen(data.medicines) +
        getLen(data.customers) +
        getLen(data.invoices) +
        getLen(data.expenses) +
        getLen(data.suppliers) +
        getLen(data.purchases) +
        getLen(data.partners));
};
const hasPendingWarehouseLocalWork = (userId: string): boolean => {
    if (typeof localStorage === 'undefined')
        return false;
    const id = (userId && userId.trim() !== '') ? userId : 'guest';
    const state = safeParseJson(localStorage.getItem(`warekeep_persistent_sync_state_${id}`));
    if (!state || typeof state !== 'object')
        return false;
    const warehouseOutbox = Array.isArray(state.warehouseOutbox) ? state.warehouseOutbox : [];
    const warehouseDurableJournal = Array.isArray(state.warehouseDurableJournal)
        ? state.warehouseDurableJournal
        : [];
    const warehouseSnapshotPendingAt = typeof state.warehouseSnapshotPendingAt === 'string'
        ? state.warehouseSnapshotPendingAt.trim()
        : '';
    return (warehouseOutbox.length > 0 ||
        warehouseDurableJournal.some((entry: any) => entry?.status !== 'verified') ||
        warehouseSnapshotPendingAt.length > 0);
};
const parseTimestampMs = (value: any): number => {
    if (typeof value !== 'string' || value.trim().length === 0)
        return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const getSnapshotFreshnessMs = (data: any): number => {
    if (!data || typeof data !== 'object')
        return 0;
    const version = typeof data.version === 'number' && Number.isFinite(data.version)
        ? data.version
        : 0;
    return Math.max(version, parseTimestampMs(data.updatedAt), parseTimestampMs(data.settings?.updatedAt), parseTimestampMs(data.settings?.dataResetAt));
};
const assertRawCollectionIntegrity = (data: any) => {
    if (!data || typeof data !== 'object')
        return;
    // Older backups may omit newer collections. A present but malformed
    // collection must fail before normalization can turn it into an empty
    // array and an authoritative restore can erase the owner's valid records.
    for (const key of [
        'medicines', 'customers', 'invoices', 'expenses', 'suppliers',
        'purchases', 'partners', 'auditEvents', 'stockMovements',
        'treasuryTransactions', 'treasuryCashCounts', 'treasuryAccounts'
    ]) {
        const records = data[key];
        if (records === undefined)
            continue;
        if (!Array.isArray(records))
            throw new Error(`Integrity Fail: ${key} must be an array`);
        records.forEach((record: any, index: number) => {
            if (!record || typeof record !== 'object' || Array.isArray(record)) {
                throw new Error(`Integrity Fail: ${key}[${index}] must be an object`);
            }
        });
    }
};
const normalizeFullData = (data: any) => {
    if (!data || typeof data !== 'object')
        return null;
    return {
        ...data,
        medicines: Array.isArray(data.medicines) ? data.medicines : [],
        customers: Array.isArray(data.customers) ? data.customers : [],
        invoices: Array.isArray(data.invoices) ? data.invoices : [],
        expenses: Array.isArray(data.expenses) ? data.expenses : [],
        suppliers: Array.isArray(data.suppliers) ? data.suppliers : [],
        purchases: Array.isArray(data.purchases) ? data.purchases : [],
        partners: Array.isArray(data.partners) ? data.partners : [],
        auditEvents: Array.isArray(data.auditEvents) ? data.auditEvents : [],
        stockMovements: Array.isArray(data.stockMovements) ? data.stockMovements : [],
        settings: (data.settings && typeof data.settings === 'object') ? data.settings : {},
    };
};
const toNumber = (value: any, fallback = 0): number => {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string') {
        const normalized = normalizePersianNumbers(value);
        const parsed = parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
};
const STOCK_QUANTITY_KEYS = [
    'quantity',
    'stock',
    'qty',
    'onHand',
    'availableQuantity',
    'quantityOnHand',
    'quantity_on_hand'
];
const LEGACY_MEDICINE_STOCK_KEYS = [
    'quantity',
    'stock',
    'qty',
    'onHand',
    'availableQuantity',
    'stockQuantity'
];
const isPresentNumericInput = (value: any) => value !== undefined && value !== null && value !== '';
const parseStrictNumericInput = (value: any): number | null => {
    if (!isPresentNumericInput(value))
        return null;
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : Number.NaN;
    if (typeof value === 'string') {
        const normalized = normalizePersianNumbers(value.trim());
        if (!normalized)
            return null;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : Number.NaN;
    }
    return Number.NaN;
};
const assertStrictStockNumber = (value: any, path: string, options: {
    required?: boolean;
    allowNegative?: boolean;
} = {}): number | null => {
    const parsed = parseStrictNumericInput(value);
    if (parsed === null) {
        if (options.required)
            throw new Error(`Integrity Fail: ${path} invalid`);
        return null;
    }
    if (!Number.isFinite(parsed))
        throw new Error(`Integrity Fail: ${path} invalid`);
    if (!options.allowNegative && parsed < 0)
        throw new Error(`Integrity Fail: ${path} cannot be negative`);
    return parsed;
};
const assertFirstPresentStockNumber = (source: any, keys: string[], path: string) => {
    if (!source || typeof source !== 'object')
        return;
    const key = keys.find((candidate) => isPresentNumericInput(source[candidate]));
    if (!key)
        return;
    assertStrictStockNumber(source[key], `${path}.${key}`);
};
const assertRawStockIntegrity = (data: any) => {
    if (!data || typeof data !== 'object')
        return;
    if (data.medicines !== undefined && !Array.isArray(data.medicines)) {
        throw new Error('Integrity Fail: medicines must be array when provided');
    }
    if (data.stockMovements !== undefined && !Array.isArray(data.stockMovements)) {
        throw new Error('Integrity Fail: stockMovements must be array when provided');
    }
    (Array.isArray(data.medicines) ? data.medicines : []).forEach((medicine: any, medicineIndex: number) => {
        if (!medicine || typeof medicine !== 'object')
            return;
        const batches = Array.isArray(medicine.batches) ? medicine.batches : [];
        if (batches.length === 0) {
            assertFirstPresentStockNumber(medicine, LEGACY_MEDICINE_STOCK_KEYS, `medicines[${medicineIndex}]`);
            return;
        }
        batches.forEach((batch: any, batchIndex: number) => {
            if (!batch || typeof batch !== 'object')
                return;
            assertFirstPresentStockNumber(batch, STOCK_QUANTITY_KEYS, `medicines[${medicineIndex}].batches[${batchIndex}]`);
            if (isPresentNumericInput(batch.receivedQuantity)) {
                assertStrictStockNumber(batch.receivedQuantity, `medicines[${medicineIndex}].batches[${batchIndex}].receivedQuantity`);
            }
        });
    });
    (Array.isArray(data.stockMovements) ? data.stockMovements : []).forEach((movement: any, index: number) => {
        if (!movement || typeof movement !== 'object')
            return;
        const quantityBaseUnit = assertStrictStockNumber(movement.quantityBaseUnit, `stockMovements[${index}].quantityBaseUnit`, { required: true, allowNegative: true });
        const previousStock = assertStrictStockNumber(movement.previousStock, `stockMovements[${index}].previousStock`, { required: true });
        const newStock = assertStrictStockNumber(movement.newStock, `stockMovements[${index}].newStock`, { required: true });
        if (quantityBaseUnit !== null &&
            previousStock !== null &&
            newStock !== null &&
            Math.abs(previousStock + quantityBaseUnit - newStock) > 0.02) {
            throw new Error(`Integrity Fail: stockMovements[${index}].previousStock + quantityBaseUnit must equal newStock`);
        }
    });
};
const assertStrictRawNumber = (value: any, path: string, options: {
    required?: boolean;
    allowNegative?: boolean;
    positive?: boolean;
} = {}): number | null => {
    const parsed = parseStrictNumericInput(value);
    if (parsed === null) {
        if (options.required)
            throw new Error(`Integrity Fail: ${path} invalid`);
        return null;
    }
    if (!Number.isFinite(parsed))
        throw new Error(`Integrity Fail: ${path} invalid`);
    if (!options.allowNegative && parsed < 0)
        throw new Error(`Integrity Fail: ${path} cannot be negative`);
    if (options.positive && parsed <= 0)
        throw new Error(`Integrity Fail: ${path} must be positive`);
    return parsed;
};
const assertRawNumberField = (source: any, key: string, path: string, options: {
    required?: boolean;
    allowNegative?: boolean;
    positive?: boolean;
} = {}): number | null => {
    if (!source || typeof source !== 'object')
        return null;
    return assertStrictRawNumber(source[key], `${path}.${key}`, options);
};
const amountsMatch = (left: number, right: number, tolerance = 0.02) => Math.abs(left - right) <= tolerance;
const assertRawFinancialIntegrity = (data: any) => {
    if (!data || typeof data !== 'object')
        return;
    (Array.isArray(data.customers) ? data.customers : []).forEach((customer: any, index: number) => {
        assertRawNumberField(customer, 'balance', `customers[${index}]`, { allowNegative: true });
        (Array.isArray(customer?.transactions) ? customer.transactions : []).forEach((transaction: any, transactionIndex: number) => {
            assertRawNumberField(transaction, 'amount', `customers[${index}].transactions[${transactionIndex}]`);
            assertRawNumberField(transaction, 'balanceAfter', `customers[${index}].transactions[${transactionIndex}]`, { allowNegative: true });
        });
    });
    (Array.isArray(data.suppliers) ? data.suppliers : []).forEach((supplier: any, index: number) => {
        assertRawNumberField(supplier, 'openingBalance', `suppliers[${index}]`, { allowNegative: true });
        assertRawNumberField(supplier, 'balance', `suppliers[${index}]`, { allowNegative: true });
        (Array.isArray(supplier?.transactions) ? supplier.transactions : []).forEach((transaction: any, transactionIndex: number) => {
            assertRawNumberField(transaction, 'amount', `suppliers[${index}].transactions[${transactionIndex}]`);
            assertRawNumberField(transaction, 'debit', `suppliers[${index}].transactions[${transactionIndex}]`);
            assertRawNumberField(transaction, 'credit', `suppliers[${index}].transactions[${transactionIndex}]`);
            assertRawNumberField(transaction, 'balanceAfter', `suppliers[${index}].transactions[${transactionIndex}]`, { allowNegative: true });
        });
    });
    (Array.isArray(data.invoices) ? data.invoices : []).forEach((invoice: any, index: number) => {
        const total = assertRawNumberField(invoice, 'total', `invoices[${index}]`);
        assertRawNumberField(invoice, 'tax', `invoices[${index}]`);
        assertRawNumberField(invoice, 'taxRate', `invoices[${index}]`);
        assertRawNumberField(invoice, 'discount', `invoices[${index}]`);
        assertRawNumberField(invoice, 'lineDiscountTotal', `invoices[${index}]`);
        const finalAmount = assertRawNumberField(invoice, 'finalAmount', `invoices[${index}]`);
        const amountPaid = assertRawNumberField(invoice, 'amountPaid', `invoices[${index}]`);
        const remainingAmount = assertRawNumberField(invoice, 'remainingAmount', `invoices[${index}]`);
        if (amountPaid !== null &&
            remainingAmount !== null &&
            finalAmount !== null &&
            !amountsMatch(amountPaid + remainingAmount, finalAmount)) {
            throw new Error(`Integrity Fail: invoices[${index}].amountPaid + remainingAmount must equal finalAmount`);
        }
        if (total !== null && finalAmount !== null && finalAmount > total + 0.02 && !isPresentNumericInput(invoice.tax)) {
            throw new Error(`Integrity Fail: invoices[${index}].finalAmount cannot exceed total without tax`);
        }
        (Array.isArray(invoice?.items) ? invoice.items : []).forEach((item: any, itemIndex: number) => {
            const path = `invoices[${index}].items[${itemIndex}]`;
            assertRawNumberField(item, 'quantity', path, { positive: true });
            assertRawNumberField(item, 'baseQuantity', path, { positive: true });
            assertRawNumberField(item, 'price', path);
            assertRawNumberField(item, 'discountAmount', path);
            assertRawNumberField(item, 'discountPercent', path);
            assertRawNumberField(item, 'costPrice', path);
            assertRawNumberField(item, 'partnerCostPrice', path);
            assertRawNumberField(item, 'partnerProfitShare', path, { allowNegative: true });
        });
        (Array.isArray(invoice?.returns) ? invoice.returns : []).forEach((entry: any, entryIndex: number) => {
            const path = `invoices[${index}].returns[${entryIndex}]`;
            assertRawNumberField(entry, 'subtotal', path);
            assertRawNumberField(entry, 'taxRefund', path);
            assertRawNumberField(entry, 'discountRefund', path);
            assertRawNumberField(entry, 'totalRefund', path);
            assertRawNumberField(entry, 'amountRefunded', path);
            assertRawNumberField(entry, 'debtReduction', path);
            assertRawNumberField(entry, 'lineDiscountRefund', path);
            assertRawNumberField(entry, 'invoiceDiscountRefund', path);
            (Array.isArray(entry?.items) ? entry.items : []).forEach((item: any, itemIndex: number) => {
                const itemPath = `${path}.items[${itemIndex}]`;
                assertRawNumberField(item, 'quantity', itemPath, { positive: true });
                assertRawNumberField(item, 'baseQuantity', itemPath, { positive: true });
                assertRawNumberField(item, 'price', itemPath);
                assertRawNumberField(item, 'costPrice', itemPath);
            });
        });
    });
    (Array.isArray(data.expenses) ? data.expenses : []).forEach((expense: any, index: number) => {
        assertRawNumberField(expense, 'amount', `expenses[${index}]`);
    });
    (Array.isArray(data.purchases) ? data.purchases : []).forEach((purchase: any, index: number) => {
        assertRawNumberField(purchase, 'subtotalAmount', `purchases[${index}]`);
        assertRawNumberField(purchase, 'discountAmount', `purchases[${index}]`);
        assertRawNumberField(purchase, 'taxAmount', `purchases[${index}]`);
        assertRawNumberField(purchase, 'shippingAmount', `purchases[${index}]`);
        assertRawNumberField(purchase, 'extraChargesAmount', `purchases[${index}]`);
        const totalAmount = assertRawNumberField(purchase, 'totalAmount', `purchases[${index}]`);
        const paidAmount = assertRawNumberField(purchase, 'paidAmount', `purchases[${index}]`);
        const remainingAmount = assertRawNumberField(purchase, 'remainingAmount', `purchases[${index}]`);
        const creditedAmount = assertRawNumberField(purchase, 'creditedAmount', `purchases[${index}]`) || 0;
        if (totalAmount !== null &&
            paidAmount !== null &&
            remainingAmount !== null &&
            !amountsMatch(paidAmount + creditedAmount + remainingAmount, totalAmount)) {
            throw new Error(`Integrity Fail: purchases[${index}].paidAmount + creditedAmount + remainingAmount must equal totalAmount`);
        }
        (Array.isArray(purchase?.payments) ? purchase.payments : []).forEach((payment: any, paymentIndex: number) => {
            assertRawNumberField(payment, 'amount', `purchases[${index}].payments[${paymentIndex}]`);
        });
        (Array.isArray(purchase?.items) ? purchase.items : []).forEach((item: any, itemIndex: number) => {
            const path = `purchases[${index}].items[${itemIndex}]`;
            assertRawNumberField(item, 'quantity', path, { positive: true });
            assertRawNumberField(item, 'baseQuantity', path, { positive: true });
            assertRawNumberField(item, 'purchasePrice', path);
            assertRawNumberField(item, 'agreedPartnerValue', path);
            assertRawNumberField(item, 'suggestedSalePrice', path);
            assertRawNumberField(item, 'lineTotal', path);
            assertRawNumberField(item, 'minimumOrderQuantity', path);
            assertRawNumberField(item, 'suggestedQuantity', path);
            assertRawNumberField(item, 'sellPriceRetail', path);
        });
        (Array.isArray(purchase?.vendorCredits) ? purchase.vendorCredits : []).forEach((credit: any, creditIndex: number) => {
            const path = `purchases[${index}].vendorCredits[${creditIndex}]`;
            assertRawNumberField(credit, 'amount', path);
            (Array.isArray(credit?.items) ? credit.items : []).forEach((item: any, itemIndex: number) => {
                assertRawNumberField(item, 'quantity', `${path}.items[${itemIndex}]`, { positive: true });
                assertRawNumberField(item, 'amount', `${path}.items[${itemIndex}]`);
            });
        });
    });
    (Array.isArray(data.partners) ? data.partners : []).forEach((partner: any, index: number) => {
        assertRawNumberField(partner, 'openingCapital', `partners[${index}]`);
        assertRawNumberField(partner, 'sharePercentage', `partners[${index}]`);
        (Array.isArray(partner?.ledger) ? partner.ledger : []).forEach((entry: any, entryIndex: number) => {
            assertRawNumberField(entry, 'amount', `partners[${index}].ledger[${entryIndex}]`, { allowNegative: true });
            assertRawNumberField(entry, 'debit', `partners[${index}].ledger[${entryIndex}]`);
            assertRawNumberField(entry, 'credit', `partners[${index}].ledger[${entryIndex}]`);
            assertRawNumberField(entry, 'balanceAfter', `partners[${index}].ledger[${entryIndex}]`, { allowNegative: true });
        });
    });
};
const toTrimmedString = (value: any): string => {
    return typeof value === 'string' ? value.trim() : '';
};
const toNonEmptyString = (value: any, fallback: string): string => {
    const trimmed = toTrimmedString(value);
    return trimmed ? trimmed : fallback;
};
const toNonNegativeNumber = (value: any, fallback = 0): number => {
    const parsed = toNumber(value, fallback);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
};
const toPositiveNumber = (value: any, fallback = 1): number => {
    const parsed = toNumber(value, fallback);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const normalizePartnerCapitalType = (value: any) => (value === 'goods' ||
    value === 'mixed' ||
    value === 'consignment' ||
    value === 'general_profit_share'
    ? value
    : 'cash');
const normalizePartnerProfitRuleType = (value: any) => (value === 'share_percentage' ||
    value === 'store_commission_percent' ||
    value === 'store_commission_fixed' ||
    value === 'general_profit_share' ||
    value === 'custom'
    ? value
    : 'own_goods_100');
const normalizeBatchOwnershipType = (value: any, ownerPartnerId?: string) => (value === 'partner' ||
    value === 'shared' ||
    value === 'consignment'
    ? value
    : ownerPartnerId
        ? 'partner'
        : 'store');
const normalizeStockEntryType = (value: any) => (value === 'partner_goods_capital' ||
    value === 'partner_consignment' ||
    value === 'sales_return' ||
    value === 'inventory_adjustment'
    ? value
    : 'store_purchase');
const firstUsableNumber = (values: any[], fallback = 0): number => {
    for (const value of values) {
        if (value === undefined || value === null || value === '')
            continue;
        const parsed = toNumber(value, Number.NaN);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return fallback;
};
const normalizeMedicineBatches = (medicine: any, medicineId: string, medicineIndex: number) => {
    const rawBatches = Array.isArray(medicine.batches) ? medicine.batches : [];
    const medicineFallbackExpiry = toNonEmptyString(medicine.expiryDate ?? medicine.expiry ?? medicine.expireDate ?? medicine.expirationDate, '2099-12-31');
    const medicineFallbackPurchasePrice = firstUsableNumber([
        medicine.purchasePrice,
        medicine.buyPrice,
        medicine.costPrice,
        medicine.purchase_price,
        medicine.cost
    ]);
    const normalizedBatches = rawBatches.map((b: any, batchIndex: number) => {
        const ownerPartnerId = toTrimmedString(b.ownerPartnerId ?? b.owner_partner_id);
        return ({
            ...b,
            id: toNonEmptyString(b.id, `${medicineId}-batch-${batchIndex + 1}`),
            batchNumber: toNonEmptyString(b.batchNumber ?? b.batchNo ?? b.lotNumber ?? b.lot, `LEGACY-${medicineIndex + 1}-${batchIndex + 1}`),
            quantity: toNumber(firstUsableNumber([
                b.quantity,
                b.stock,
                b.qty,
                b.onHand,
                b.availableQuantity,
                b.quantityOnHand,
                b.quantity_on_hand
            ])),
            expiryDate: toNonEmptyString(b.expiryDate ?? b.expiry ?? b.expireDate ?? b.expirationDate, medicineFallbackExpiry),
            purchasePrice: toNonNegativeNumber(firstUsableNumber([
                b.purchasePrice,
                b.buyPrice,
                b.costPrice,
                b.purchase_price,
                b.cost
            ], medicineFallbackPurchasePrice)),
            ownershipType: normalizeBatchOwnershipType(b.ownershipType ?? b.ownership_type, ownerPartnerId),
            ownerPartnerId: ownerPartnerId || undefined,
            sharedOwnerPartnerIds: Array.isArray(b.sharedOwnerPartnerIds) ? b.sharedOwnerPartnerIds.map(toTrimmedString).filter(Boolean) : undefined,
            agreedPartnerValue: b.agreedPartnerValue === undefined ? undefined : toNonNegativeNumber(b.agreedPartnerValue),
            suggestedSalePrice: b.suggestedSalePrice === undefined ? undefined : toNonNegativeNumber(b.suggestedSalePrice),
            sourceEntryType: b.sourceEntryType === undefined ? undefined : normalizeStockEntryType(b.sourceEntryType),
            sourceDocumentNumber: toTrimmedString(b.sourceDocumentNumber) || undefined,
            purchaseItemIndex: b.purchaseItemIndex === undefined ? undefined : Math.max(0, Math.floor(toNumber(b.purchaseItemIndex))),
            receivedQuantity: b.receivedQuantity === undefined ? undefined : toNonNegativeNumber(b.receivedQuantity),
            availabilityStatus: b.availabilityStatus === 'quarantine' || b.availabilityStatus === 'rejected' || b.availabilityStatus === 'available'
                ? b.availabilityStatus
                : undefined,
            availabilityReason: toTrimmedString(b.availabilityReason) || undefined,
            availabilityChangedAt: toTrimmedString(b.availabilityChangedAt) || undefined,
            history: Array.isArray(b.history) ? b.history : []
        });
    });
    if (normalizedBatches.length > 0)
        return normalizedBatches;
    const legacyQuantity = toNonNegativeNumber(firstUsableNumber([
        medicine.quantity,
        medicine.stock,
        medicine.qty,
        medicine.onHand,
        medicine.availableQuantity,
        medicine.stockQuantity,
        medicine.currentStock,
        medicine.totalQuantity,
        medicine.quantityOnHand,
        medicine.quantity_on_hand
    ]));
    if (legacyQuantity <= 0)
        return [];
    return [{
            id: `${medicineId}-legacy-batch`,
            batchNumber: toNonEmptyString(medicine.batchNumber ?? medicine.batchNo ?? medicine.lotNumber ?? medicine.lot, `LEGACY-${medicineIndex + 1}`),
            quantity: legacyQuantity,
            expiryDate: medicineFallbackExpiry,
            purchasePrice: toNonNegativeNumber(medicineFallbackPurchasePrice),
            traceSource: 'legacy',
            history: Array.isArray(medicine.history) ? medicine.history : []
        }];
};
const normalizeOptionalNumber = (value: any) => {
    if (value === undefined || value === null)
        return value;
    return toNumber(value);
};
const normalizeSettingsNumbers = (settings: any) => {
    if (!settings || typeof settings !== 'object')
        return {};
    const rates = settings.currencySettings?.rates;
    const aiInputMode = settings.medicineAiDefaultInput === 'camera' ||
        settings.medicineAiDefaultInput === 'text' ||
        settings.medicineAiDefaultInput === 'upload'
        ? settings.medicineAiDefaultInput
        : 'upload';
    return {
        ...settings,
        taxRate: toNumber(settings.taxRate),
        // De-facto migration/backfill: fills icon metadata for categories that
        // predate the smart-icon feature, repairs invalid entries and prunes
        // icons of deleted categories on every load/save.
        expenseCategoryIcons: normalizeExpenseCategoryIcons(settings.expenseCategoryIcons, settings.expenseCategories),
        defaultSalesMode: resolveDefaultSalesMode(settings),
        aiLanguage: resolveAiLanguage(settings.aiLanguage, settings.language),
        dateTimeSettings: normalizeDateTimeSettings(settings.dateTimeSettings),
        inventoryLinkedSyncSettings: normalizeInventoryLinkedSyncSettings(settings.inventoryLinkedSyncSettings),
        commissionRules: normalizeProductCommissionAdjustmentRules(settings.commissionRules),
        customMedicineUnits: getUniqueMedicineUnits(settings.customMedicineUnits || []),
        medicineAiDefaultInput: aiInputMode,
        maxStaffDiscount: normalizeOptionalNumber(settings.maxStaffDiscount),
        invoiceNumbering: settings.invoiceNumbering ? {
            ...settings.invoiceNumbering,
            nextNumber: Math.max(0, Math.floor(toNumber(settings.invoiceNumbering.nextNumber, 0)))
        } : settings.invoiceNumbering,
        currencySettings: settings.currencySettings ? {
            ...settings.currencySettings,
            rates: rates ? {
                ...rates,
                USD: toNumber(rates.USD),
                EUR: toNumber(rates.EUR),
                IRR: toNumber(rates.IRR),
                PKR: toNumber(rates.PKR),
                INR: toNumber(rates.INR),
                AFN: toNumber(rates.AFN)
            } : rates
        } : settings.currencySettings
    };
};
export const sanitizeFullData = (data: any) => {
    assertRawCollectionIntegrity(data);
    assertRawStockIntegrity(data);
    assertRawFinancialIntegrity(data);
    const normalized = normalizeFullData(data);
    if (!normalized)
        return null;
    const sanitized = {
        ...normalized,
        medicines: normalized.medicines.map((m: any, idx: number) => {
            const genericName = toTrimmedString(m.genericName);
            const medicineId = toNonEmptyString(m.id, `medicine-${idx + 1}`);
            const safeName = toNonEmptyString(m.name, genericName || `Unnamed Medicine #${idx + 1}`);
            return ({
                ...m,
                id: medicineId,
                name: safeName,
                manufacturer: toTrimmedString(m.manufacturer),
                baseUnit: toTrimmedString(m.baseUnit) || toTrimmedString(m.unit) || undefined,
                itemsPerBox: m.itemsPerBox === undefined ? undefined : toPositiveNumber(m.itemsPerBox, 1),
                saleUnits: Array.isArray(m.saleUnits) ? m.saleUnits.map((unit: any) => {
                    const unitName = toTrimmedString(unit?.unitName ?? unit?.name ?? unit?.label);
                    if (!unitName)
                        return null;
                    return {
                        unitName,
                        label: toTrimmedString(unit?.label) || unitName,
                        conversionFactor: toPositiveNumber(unit?.conversionFactor, 1),
                        barcode: toTrimmedString(unit?.barcode) || undefined,
                        isDefault: unit?.isDefault === true
                    };
                }).filter(Boolean) : [],
                preferredSupplierId: toTrimmedString(m.preferredSupplierId) || undefined,
                allowFractionalQuantity: m.allowFractionalQuantity === true,
                clinicalSummary: sanitizeMedicineClinicalSummary(m.clinicalSummary),
                lowStockThreshold: toNumber(m.lowStockThreshold),
                salePrices: {
                    retail: toNumber(m.salePrices?.retail),
                    wholesale: toNumber(m.salePrices?.wholesale),
                    bulk: toNumber(m.salePrices?.bulk)
                },
                commissionRules: normalizeMedicineCommissionRules(m.commissionRules),
                batches: normalizeMedicineBatches(m, medicineId, idx)
            });
        }),
        customers: normalized.customers.map((c: any, idx: number) => {
            const phone = normalizePersianNumbers(toTrimmedString(c.phone));
            const address = toTrimmedString(c.address);
            const isEnglish = normalized.settings?.language === 'english';
            const name = toNonEmptyString(c.name, isEnglish ? (phone ? `Customer ${phone}` : `Unnamed customer #${idx + 1}`) : (phone ? `مشتری ${phone}` : `مشتری بدون نام #${idx + 1}`));
            return ({
                ...c,
                name,
                phone,
                address,
                balance: toNumber(c.balance),
                transactions: Array.isArray(c.transactions) ? c.transactions.map((t: any) => ({
                    ...t,
                    amount: toNumber(t.amount),
                    balanceAfter: toNumber(t.balanceAfter)
                })) : []
            });
        }),
        suppliers: normalized.suppliers.map((s: any) => ({
            ...s,
            openingBalance: toNumber(s.openingBalance),
            balance: toNumber(s.balance),
            transactions: Array.isArray(s.transactions) ? s.transactions.map((t: any) => ({
                ...t,
                amount: toNumber(t.amount),
                balanceAfter: toNumber(t.balanceAfter)
            })) : []
        })),
        invoices: normalized.invoices.map((inv: any) => ({
            ...inv,
            total: toNumber(inv.total),
            tax: toNumber(inv.tax),
            taxRate: inv.taxRate === undefined ? undefined : toNumber(inv.taxRate),
            discount: toNumber(inv.discount),
            lineDiscountTotal: toNumber(inv.lineDiscountTotal),
            finalAmount: toNumber(inv.finalAmount),
            paymentBreakdown: inv.paymentBreakdown,
            returns: Array.isArray(inv.returns) ? inv.returns.map((entry: any) => ({
                ...entry,
                subtotal: toNumber(entry.subtotal),
                taxRefund: toNumber(entry.taxRefund),
                discountRefund: toNumber(entry.discountRefund),
                totalRefund: toNumber(entry.totalRefund),
                amountRefunded: toNumber(entry.amountRefunded),
                debtReduction: toNumber(entry.debtReduction),
                sourceItemIndex: entry.sourceItemIndex === undefined ? undefined : Math.max(0, Math.floor(toNumber(entry.sourceItemIndex))),
                lineDiscountRefund: entry.lineDiscountRefund === undefined ? undefined : toNumber(entry.lineDiscountRefund),
                invoiceDiscountRefund: entry.invoiceDiscountRefund === undefined ? undefined : toNumber(entry.invoiceDiscountRefund),
                paymentMethod: entry.paymentMethod === 'card' || entry.paymentMethod === 'mixed' || entry.paymentMethod === 'credit' ? entry.paymentMethod : (entry.paymentMethod === 'cash' ? 'cash' : undefined),
                items: Array.isArray(entry.items) ? entry.items.map((it: any) => ({
                    ...it,
                    quantity: toNumber(it.quantity),
                    baseQuantity: it.baseQuantity === undefined ? undefined : toNumber(it.baseQuantity),
                    saleUnitName: toTrimmedString(it.saleUnitName) || undefined,
                    saleUnitLabel: toTrimmedString(it.saleUnitLabel) || undefined,
                    saleUnitConversionFactor: it.saleUnitConversionFactor === undefined ? undefined : toPositiveNumber(it.saleUnitConversionFactor, 1),
                    baseUnit: toTrimmedString(it.baseUnit) || undefined,
                    price: toNumber(it.price),
                    costPrice: it.costPrice === undefined ? undefined : toNumber(it.costPrice)
                })) : []
            })) : [],
            amountPaid: toNumber(inv.amountPaid),
            remainingAmount: toNumber(inv.remainingAmount),
            items: Array.isArray(inv.items) ? inv.items.map((it: any) => ({
                ...it,
                partnerId: toTrimmedString(it.partnerId) || undefined,
                batchOwnershipType: it.batchOwnershipType === undefined ? undefined : normalizeBatchOwnershipType(it.batchOwnershipType, it.partnerId),
                quantity: toNumber(it.quantity),
                baseQuantity: it.baseQuantity === undefined ? undefined : toNumber(it.baseQuantity),
                saleUnitName: toTrimmedString(it.saleUnitName) || undefined,
                saleUnitLabel: toTrimmedString(it.saleUnitLabel) || undefined,
                saleUnitConversionFactor: it.saleUnitConversionFactor === undefined ? undefined : toPositiveNumber(it.saleUnitConversionFactor, 1),
                baseUnit: toTrimmedString(it.baseUnit) || undefined,
                price: toNumber(it.price),
                discountAmount: it.discountAmount === undefined ? undefined : toNumber(it.discountAmount),
                discountPercent: it.discountPercent === undefined ? undefined : toNumber(it.discountPercent),
                costPrice: it.costPrice === undefined ? undefined : toNumber(it.costPrice),
                partnerCostPrice: it.partnerCostPrice === undefined ? undefined : toNumber(it.partnerCostPrice),
                partnerProfitShare: it.partnerProfitShare === undefined ? undefined : toNumber(it.partnerProfitShare),
                commissionAdjustmentPercent: normalizeCommissionAdjustmentPercent(it.commissionAdjustmentPercent),
                commissionOverridePercent: it.commissionOverridePercent === undefined ? undefined : clampCommissionRate(it.commissionOverridePercent),
                commissionRuleMode: it.commissionRuleMode === 'override' ? 'override' : it.commissionRuleMode === 'adjustment' ? 'adjustment' : undefined,
                commissionRuleSource: toTrimmedString(it.commissionRuleSource) || undefined,
                commissionRuleLabel: toTrimmedString(it.commissionRuleLabel) || undefined
            })) : []
        })),
        expenses: normalized.expenses.map((e: any) => ({
            ...e,
            amount: toNumber(e.amount)
        })),
        partners: normalized.partners.map((partner: any, index: number) => ({
            ...partner,
            id: toNonEmptyString(partner.id, `partner-${index + 1}`),
            name: toNonEmptyString(partner.name, `Partner #${index + 1}`),
            phone: toTrimmedString(partner.phone),
            email: toTrimmedString(partner.email),
            address: toTrimmedString(partner.address),
            capitalType: normalizePartnerCapitalType(partner.capitalType),
            sharePercentage: partner.sharePercentage === undefined ? undefined : toNumber(partner.sharePercentage),
            openingGoodsCapital: toNonNegativeNumber(partner.openingGoodsCapital),
            openingCapital: toNumber(partner.openingCapital),
            profitRule: partner.profitRule && typeof partner.profitRule === 'object'
                ? {
                    ...partner.profitRule,
                    type: normalizePartnerProfitRuleType(partner.profitRule.type),
                    sharePercentage: partner.profitRule.sharePercentage === undefined ? undefined : toNumber(partner.profitRule.sharePercentage),
                    storeCommissionPercent: partner.profitRule.storeCommissionPercent === undefined ? undefined : toNumber(partner.profitRule.storeCommissionPercent),
                    storeCommissionFixedAmount: partner.profitRule.storeCommissionFixedAmount === undefined ? undefined : toNumber(partner.profitRule.storeCommissionFixedAmount),
                    customNote: toTrimmedString(partner.profitRule.customNote)
                }
                : undefined,
            settlementPeriod: partner.settlementPeriod === 'daily' || partner.settlementPeriod === 'weekly' || partner.settlementPeriod === 'custom'
                ? partner.settlementPeriod
                : 'monthly',
            status: partner.status === 'inactive' || partner.status === 'settled' ? partner.status : 'active',
            notes: toTrimmedString(partner.notes),
            documents: Array.isArray(partner.documents) ? partner.documents.map((document: any, documentIndex: number) => ({
                ...document,
                id: toNonEmptyString(document.id, `partner-doc-${index + 1}-${documentIndex + 1}`),
                name: toNonEmptyString(document.name, 'Partner document'),
                type: toTrimmedString(document.type) || undefined,
                url: toTrimmedString(document.url) || undefined,
                uploadedAt: toTrimmedString(document.uploadedAt) || undefined
            })) : [],
            ledger: Array.isArray(partner.ledger) ? partner.ledger.map((entry: any, entryIndex: number) => ({
                ...entry,
                id: toNonEmptyString(entry.id, `partner-ledger-${index + 1}-${entryIndex + 1}`),
                date: toNonEmptyString(entry.date, new Date().toISOString().split('T')[0]),
                type: [
                    'capital_in',
                    'goods_capital',
                    'goods_received',
                    'sale_revenue',
                    'cost_of_goods_sold',
                    'gross_profit',
                    'partner_profit_share',
                    'store_profit_share',
                    'payment',
                    'withdrawal',
                    'expense_share',
                    'profit_share',
                    'sales_return',
                    'waste',
                    'expired_stock',
                    'adjustment',
                    'settlement'
                ].includes(entry.type) ? entry.type : 'capital_in',
                direction: entry.direction === 'out' ? 'out' : 'in',
                amount: toNumber(entry.amount),
                debit: entry.debit === undefined ? undefined : toNumber(entry.debit),
                credit: entry.credit === undefined ? undefined : toNumber(entry.credit),
                balanceAfter: entry.balanceAfter === undefined ? undefined : toNumber(entry.balanceAfter),
                source: ['partner', 'purchase', 'sale', 'return', 'adjustment', 'settlement', 'expense', 'system'].includes(entry.source) ? entry.source : undefined,
                description: toNonEmptyString(entry.description, 'Partner ledger entry'),
                referenceId: toTrimmedString(entry.referenceId) || undefined,
                referenceItemId: toTrimmedString(entry.referenceItemId) || undefined,
                recordedBy: toTrimmedString(entry.recordedBy),
                metadata: entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : undefined
            })) : []
        })),
        purchases: normalized.purchases.map((p: any) => normalizePurchaseRecord({
            ...p,
            partnerId: toTrimmedString(p.partnerId) || undefined,
            stockEntryType: p.stockEntryType === undefined ? undefined : normalizeStockEntryType(p.stockEntryType),
            ownershipType: p.ownershipType === undefined ? undefined : normalizeBatchOwnershipType(p.ownershipType, p.partnerId),
            subtotalAmount: toNumber(p.subtotalAmount),
            discountAmount: toNumber(p.discountAmount),
            taxAmount: toNumber(p.taxAmount),
            shippingAmount: toNumber(p.shippingAmount),
            extraChargesAmount: toNumber(p.extraChargesAmount),
            totalAmount: toNumber(p.totalAmount),
            paidAmount: toNumber(p.paidAmount),
            remainingAmount: toNumber(p.remainingAmount),
            creditedAmount: p.creditedAmount === undefined ? undefined : toNumber(p.creditedAmount),
            shortClosedAt: toTrimmedString(p.shortClosedAt) || undefined,
            shortCloseReason: toTrimmedString(p.shortCloseReason) || undefined,
            // NEW: Purchase Receipt and Vendor Credit structures are normalized without destructive migration.
            payments: Array.isArray(p.payments) ? p.payments.map((payment: any) => ({
                ...payment,
                amount: toNumber(payment.amount)
            })) : [],
            receipts: Array.isArray(p.receipts) ? p.receipts.map((receipt: any) => ({
                ...receipt,
                items: Array.isArray(receipt.items) ? receipt.items.map((item: any) => ({
                    ...item,
                    partnerId: toTrimmedString(item.partnerId) || undefined,
                    ownerPartnerId: toTrimmedString(item.ownerPartnerId) || undefined,
                    stockEntryType: item.stockEntryType === undefined ? undefined : normalizeStockEntryType(item.stockEntryType),
                    ownershipType: item.ownershipType === undefined ? undefined : normalizeBatchOwnershipType(item.ownershipType, item.ownerPartnerId || item.partnerId),
                    quantity: toNumber(item.quantity),
                    baseQuantity: item.baseQuantity === undefined ? undefined : toNumber(item.baseQuantity),
                    purchasePrice: item.purchasePrice === undefined ? undefined : toNumber(item.purchasePrice),
                    agreedPartnerValue: item.agreedPartnerValue === undefined ? undefined : toNumber(item.agreedPartnerValue),
                    suggestedSalePrice: item.suggestedSalePrice === undefined ? undefined : toNumber(item.suggestedSalePrice),
                    sourceDocumentNumber: toTrimmedString(item.sourceDocumentNumber) || undefined
                })) : []
            })) : [],
            vendorCredits: Array.isArray(p.vendorCredits) ? p.vendorCredits.map((credit: any) => ({
                ...credit,
                amount: toNumber(credit.amount),
                items: Array.isArray(credit.items) ? credit.items.map((item: any) => ({
                    ...item,
                    quantity: toNumber(item.quantity),
                    amount: item.amount === undefined ? undefined : toNumber(item.amount)
                })) : []
            })) : [],
            attachments: Array.isArray(p.attachments) ? p.attachments.map((attachment: any) => ({
                ...attachment,
                size: toNumber(attachment.size)
            })) : [],
            items: Array.isArray(p.items) ? p.items.map((it: any) => ({
                ...it,
                partnerId: toTrimmedString(it.partnerId) || undefined,
                ownerPartnerId: toTrimmedString(it.ownerPartnerId) || undefined,
                stockEntryType: it.stockEntryType === undefined ? undefined : normalizeStockEntryType(it.stockEntryType),
                ownershipType: it.ownershipType === undefined ? undefined : normalizeBatchOwnershipType(it.ownershipType, it.ownerPartnerId || it.partnerId),
                quantity: toNumber(it.quantity),
                purchasePrice: toNumber(it.purchasePrice),
                agreedPartnerValue: it.agreedPartnerValue === undefined ? undefined : toNumber(it.agreedPartnerValue),
                lineTotal: toNumber(it.lineTotal),
                minimumOrderQuantity: it.minimumOrderQuantity === undefined ? undefined : toNumber(it.minimumOrderQuantity),
                suggestedQuantity: it.suggestedQuantity === undefined ? undefined : toNumber(it.suggestedQuantity),
                sellPriceRetail: it.sellPriceRetail === undefined ? undefined : toNumber(it.sellPriceRetail),
                suggestedSalePrice: it.suggestedSalePrice === undefined ? undefined : toNumber(it.suggestedSalePrice),
                sourceDocumentNumber: toTrimmedString(it.sourceDocumentNumber) || undefined
            })) : []
        })),
        // NEW: Audit Trail persistence remains additive and does not alter older backups.
        auditEvents: normalized.auditEvents.map((event: any, index: number) => ({
            ...event,
            id: toNonEmptyString(event.id, `audit-event-${index + 1}`),
            actorName: toNonEmptyString(event.actorName, 'System'),
            action: toNonEmptyString(event.action, 'unknown'),
            entityType: toNonEmptyString(event.entityType, 'stock'),
            entityId: toNonEmptyString(event.entityId, `entity-${index + 1}`),
            timestamp: toNonEmptyString(event.timestamp, new Date().toISOString()),
            metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : undefined
        })),
        stockMovements: normalized.stockMovements.map((movement: any, index: number) => ({
            ...movement,
            id: toNonEmptyString(movement.id, `stock-movement-${index + 1}`),
            medicineId: toNonEmptyString(movement.medicineId, `medicine-${index + 1}`),
            batchId: toNonEmptyString(movement.batchId, `batch-${index + 1}`),
            type: toNonEmptyString(movement.type, 'reconciliation'),
            quantityBaseUnit: toNumber(movement.quantityBaseUnit),
            referenceType: toNonEmptyString(movement.referenceType, 'system'),
            referenceId: toNonEmptyString(movement.referenceId, `reference-${index + 1}`),
            previousStock: toNumber(movement.previousStock),
            newStock: toNumber(movement.newStock),
            createdAt: toNonEmptyString(movement.createdAt, new Date().toISOString()),
            idempotencyKey: toTrimmedString(movement.idempotencyKey) || undefined,
            reversed: movement.reversed === true,
            voided: movement.voided === true,
            metadata: movement.metadata && typeof movement.metadata === 'object' ? movement.metadata : undefined
        })),
        settings: normalizeSettingsNumbers(normalized.settings)
    };
    return sanitized;
};
const AUTHORITATIVE_RESTORE_COLLECTIONS = [
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
const touchRestoredRecords = (records: any[], restoredAt: string) => (records.map((record) => (record && typeof record === 'object'
    ? { ...record, updatedAt: restoredAt }
    : record)));
export const prepareImportedFullDataForRestore = (data: any, resetAt: string = new Date().toISOString()) => {
    const sanitized = sanitizeFullData(data);
    if (!sanitized)
        return null;
    const resetMs = parseTimestampMs(resetAt) || Date.now();
    const normalizedResetAt = new Date(resetMs).toISOString();
    const restoredAt = new Date(resetMs + 1).toISOString();
    const existingCollectionResetAt = sanitized.settings?.collectionResetAt && typeof sanitized.settings.collectionResetAt === 'object'
        ? sanitized.settings.collectionResetAt
        : {};
    const collectionResetAt = AUTHORITATIVE_RESTORE_COLLECTIONS.reduce((markers, key) => ({
        ...markers,
        [key]: normalizedResetAt
    }), { ...existingCollectionResetAt });
    return sanitizeFullData({
        ...sanitized,
        medicines: touchRestoredRecords(sanitized.medicines || [], restoredAt),
        customers: touchRestoredRecords(sanitized.customers || [], restoredAt),
        invoices: touchRestoredRecords(sanitized.invoices || [], restoredAt),
        expenses: touchRestoredRecords(sanitized.expenses || [], restoredAt),
        suppliers: touchRestoredRecords(sanitized.suppliers || [], restoredAt),
        purchases: touchRestoredRecords(sanitized.purchases || [], restoredAt),
        partners: touchRestoredRecords(sanitized.partners || [], restoredAt),
        // auditEvents is deliberately NOT touched, and this is safe rather than an
        // oversight: performSmartMerge routes it through `mergeAuditEvents`
        // (syncLogic.ts), a pure id-keyed UNION that never consults a reset cutoff.
        // So the collectionResetAt.auditEvents marker stamped below is inert for it,
        // and a restored audit trail cannot be dropped. Pinned by
        // storageService.restoreCutoff.test.ts so a future change to that merge
        // policy fails loudly instead of silently destroying the audit trail.
        auditEvents: sanitized.auditEvents || [],
        // stockMovements MUST be lifted above the cutoff like its siblings above.
        // It is merged by `mergeLists` WITH resetCutoff('stockMovements'), which
        // drops any record whose timestamp is <= the cutoff. A restored movement
        // carries its original historical createdAt (getRecordUpdatedAt falls back
        // to createdAt), which is by definition below the restore cutoff stamped
        // below — so passing it through untouched destroyed the entire restored
        // stock ledger on the next merge. That is verbatim the mechanism that
        // destroyed treasury in 12F. 12F's fix does not cover this case: that one
        // exempts treasury from the GLOBAL dataResetAt, but the reduce below stamps
        // a PER-COLLECTION marker for stockMovements, which is honoured regardless.
        stockMovements: touchRestoredRecords(sanitized.stockMovements || [], restoredAt),
        settings: {
            ...(sanitized.settings || {}),
            dataResetAt: normalizedResetAt,
            collectionResetAt,
            updatedAt: restoredAt
        },
        version: Date.now(),
        updatedAt: restoredAt
    });
};
export const saveToDisk = async (data: any, userId: string = 'guest', options?: {
    allowWipe?: boolean;
    alreadySanitized?: boolean;
    changedSlices?: string[];
    mutationId?: string;
}) => {
    const finishSave = startPerformanceSpan('storage-save', {
        userId,
        recordCount: getRecordCount(data),
        runtime: hasElectronApi() ? 'electron' : 'web'
    });
    try {
        // --- ABSOLUTE DISK WRITE GUARD ---
        // Perform integrity check BEFORE sending to IPC to prevent corrupt data entering the queue.
        if (!data) {
            console.error("❌ Disk Write Aborted: Data object is null or undefined.");
            throw new Error("Cannot save null data to disk.");
        }
        const storageKey = getLocalBackupKey(userId);
        const allowWipe = options?.allowWipe === true;
        // Guard: prevent accidental full-wipe overwriting an existing dataset
        const previous = safeParseJson(localStorage.getItem(storageKey));
        const previousCount = getRecordCount(previous);
        let normalized = options?.alreadySanitized ? data : sanitizeFullData(data);
        if (!normalized)
            throw new Error("Invalid data shape.");
        const storageIntegrityRepair = repairCriticalDataIntegritySnapshot(normalized);
        if (storageIntegrityRepair.repaired) {
            normalized = storageIntegrityRepair.data;
            console.warn("Auto-repaired data integrity before disk persistence.", {
                repairedBatchCount: storageIntegrityRepair.repairedBatchCount,
                beforeCritical: storageIntegrityRepair.reportBefore.summary.critical,
                afterCritical: storageIntegrityRepair.reportAfter.summary.critical,
                issueTypes: storageIntegrityRepair.repairedIssueTypes
            });
        }
        const nextCount = getRecordCount(normalized);
        if (!allowWipe && previousCount >= 10 && nextCount === 0) {
            throw new Error("PERSIST_WIPE_BLOCKED");
        }
        if (!allowWipe && previousCount > 0 && nextCount === 0 && hasPendingWarehouseLocalWork(userId)) {
            throw new Error("PERSIST_PENDING_WAREHOUSE_WIPE_BLOCKED");
        }
        try {
            validateIntegrity(normalized);
        }
        catch (e: any) {
            const errorMsg = `CRITICAL: Persist Blocked. Integrity Check Failed: ${e.message}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }
        if (hasElectronApi() && typeof (window as any).electronAPI.saveData === 'function') {
            try {
                const changedSlices = Array.from(new Set(options?.changedSlices || []))
                    .filter((key) => PERSISTED_SLICE_KEYS.has(key));
                const canPatch = changedSlices.length > 0 &&
                    typeof (window as any).electronAPI.saveDataPatch === 'function';
                const slices = canPatch
                    ? Object.fromEntries(changedSlices.map((key) => [key, normalized[key]]))
                    : null;
                let result = canPatch
                    ? await (window as any).electronAPI.saveDataPatch({
                        slices,
                        version: normalized.version,
                        updatedAt: normalized.updatedAt,
                        mutationId: options?.mutationId
                    }, userId)
                    : await (window as any).electronAPI.saveData(normalized, userId);
                // A first save or a damaged patch base safely falls back to the legacy
                // full-snapshot channel. The on-disk format is identical either way.
                if (!result?.success && canPatch && result?.error === 'PATCH_BASE_MISSING') {
                    result = await (window as any).electronAPI.saveData(normalized, userId);
                }
                if (!isIpcResult(result))
                    throw new Error("IPC_INVALID_RESPONSE");
                if (!result.success) {
                    console.error("Disk save failed (Main Process):", result.error);
                    // Emergency fallback to prevent silent data loss if disk write fails.
                    try {
                        localStorage.setItem(storageKey, JSON.stringify(normalized));
                    }
                    catch (e) { }
                    throw new Error(result.error || "DISK_SAVE_FAILED");
                }
                scheduleLocalSafetySnapshot(storageKey, normalized);
                // Trigger auto-backup (non-blocking)
                if (Math.random() > 0.8) {
                    (window as any).electronAPI.backupData?.(normalized).catch((e: any) => console.warn("Auto-backup failed", e));
                }
            }
            catch (e) {
                console.error("IPC Communication Error:", e);
                // Emergency fallback so user doesn't lose work if preload/IPC is broken.
                try {
                    localStorage.setItem(storageKey, JSON.stringify(normalized));
                }
                catch (e2) { }
                throw e;
            }
        }
        else {
            // Web mode (or preload missing): persist to localStorage
            try {
                localStorage.setItem(storageKey, JSON.stringify(normalized));
            }
            catch (e) {
                console.error("Web Storage Error", e);
                throw e;
            }
        }
    }
    finally {
        finishSave();
    }
};
export const loadFromDisk = async (userId: string = 'guest') => {
    const storageKey = getLocalBackupKey(userId);
    const finishLoad = startPerformanceSpan('storage-load', {
        userId,
        runtime: hasElectronApi() ? 'electron' : 'web'
    });
    try {
        if (hasElectronApi() && typeof (window as any).electronAPI.loadData === 'function') {
            try {
                const result = await (window as any).electronAPI.loadData(userId);
                if (!isIpcResult(result))
                    throw new Error("IPC_INVALID_RESPONSE");
                // If result.data is null, it implies file missing (Fresh User).
                // If result.data is object, it is the loaded data.
                if (result.success && result.data) {
                    const diskData = sanitizeFullData(result.data);
                    const localData = sanitizeFullData(safeParseJson(localStorage.getItem(storageKey)));
                    // Prefer the local safety snapshot only when it is newer than a valid
                    // empty disk snapshot. Otherwise a real reset can be resurrected by
                    // stale localStorage data.
                    const diskCount = getRecordCount(diskData);
                    const localCount = getRecordCount(localData);
                    if (diskCount === 0 &&
                        localCount > 0 &&
                        getSnapshotFreshnessMs(localData) > getSnapshotFreshnessMs(diskData)) {
                        return localData;
                    }
                    return diskData;
                }
                // Disk missing or failed: try localStorage fallback (e.g. emergency fallback from a previous crash)
                const local = sanitizeFullData(safeParseJson(localStorage.getItem(storageKey)));
                if (local)
                    return local;
                if (!result.success) {
                    markStorageDegraded(result.error || "IPC_ERROR");
                    return null;
                }
                return null;
            }
            catch (e: any) {
                console.error("CRITICAL: IPC Error loading data:", e);
                // Attempt localStorage fallback before failing hard.
                const local = sanitizeFullData(safeParseJson(localStorage.getItem(storageKey)));
                if (local)
                    return local;
                // If IPC is broken and no local cache exists, continue with empty state
                // but mark degraded mode to warn the user.
                const msg = (e && typeof e.message === 'string') ? e.message : 'IPC_ERROR';
                markStorageDegraded(msg);
                return null;
            }
        }
        // Web mode fallback
        return sanitizeFullData(safeParseJson(localStorage.getItem(storageKey)));
    }
    finally {
        finishLoad();
    }
};
export const exportData = (data: any) => {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `Pharma_Backup_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    if (document.body.contains(link)) {
        document.body.removeChild(link);
    }
    URL.revokeObjectURL(url);
};
export const importData = (file: File): Promise<any> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                const payload = json?.metadata?.kind === 'local-data-backup' && json.data
                    ? json.data
                    : json;
                if (payload.medicines || payload.settings)
                    resolve(payload);
                else
                    reject(new Error("Format invalid."));
            }
            catch (error) {
                reject(new Error("File read error."));
            }
        };
        reader.onerror = () => reject(new Error("File read error."));
        reader.readAsText(file);
    });
};
