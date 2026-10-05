import type { Batch, Medicine, Purchase, PurchaseItem, PurchaseOperationalStage, PurchasePayment, PurchasePaymentStatus, PurchaseReceipt, PurchaseReceiptStatus, PurchaseWorkflowStatus, Supplier, VendorCredit } from '../types';
const toSafeAmount = (value: unknown): number => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric))
        return 0;
    return Math.max(0, numeric);
};
const toSignedAmount = (value: unknown): number => {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
};
export const getPurchaseItemTotal = (item: Pick<PurchaseItem, 'quantity' | 'purchasePrice'>): number => {
    return toSafeAmount(item.quantity) * toSafeAmount(item.purchasePrice);
};
export const getPurchaseItemBaseQuantity = (item: Pick<PurchaseItem, 'quantity' | 'baseQuantity' | 'purchaseUnitConversionFactor'>): number => {
    const explicitBaseQuantity = toSafeAmount(item.baseQuantity);
    if (explicitBaseQuantity > 0)
        return explicitBaseQuantity;
    const conversionFactor = Math.max(1, toSafeAmount(item.purchaseUnitConversionFactor || 1));
    return toSafeAmount(item.quantity) * conversionFactor;
};
export const getPurchaseItemBaseUnitCost = (item: Pick<PurchaseItem, 'quantity' | 'baseQuantity' | 'purchaseUnitConversionFactor' | 'purchasePrice' | 'lineTotal'>): number => {
    const baseQuantity = getPurchaseItemBaseQuantity(item);
    if (baseQuantity <= 0)
        return toSafeAmount(item.purchasePrice);
    const lineTotal = item.lineTotal === undefined || item.lineTotal === null
        ? getPurchaseItemTotal(item)
        : toSafeAmount(item.lineTotal);
    return lineTotal > 0 ? lineTotal / baseQuantity : 0;
};
export const calculatePurchaseSubtotal = (items: PurchaseItem[] = []): number => {
    return items.reduce((sum, item) => sum + getPurchaseItemTotal(item), 0);
};
export const getPurchasePaymentTotal = (payments: PurchasePayment[] = []): number => {
    return payments.reduce((sum, payment) => sum + toSafeAmount(payment.amount), 0);
};
// NEW: Purchase Receipt aggregation for official stock and partial receipt math.
export const getPurchaseReceiptTotal = (receipts: PurchaseReceipt[] = []): number => {
    return receipts.reduce((sum, receipt) => (sum + (receipt.items || []).reduce((itemSum, item) => itemSum + toSafeAmount(item.baseQuantity ?? item.quantity), 0)), 0);
};
// NEW: Vendor Credit / Return aggregation for supplier balance reconciliation.
export const getPurchaseVendorCreditTotal = (vendorCredits: VendorCredit[] = []): number => {
    return vendorCredits.reduce((sum, credit) => sum + toSafeAmount(credit.amount), 0);
};
export const getPurchaseOrderedQuantity = (items: PurchaseItem[] = []): number => {
    return items.reduce((sum, item) => sum + getPurchaseItemBaseQuantity(item), 0);
};
export const getPurchaseReturnedQuantity = (vendorCredits: VendorCredit[] = []): number => {
    return vendorCredits.reduce((sum, credit) => (sum + (credit.items || []).reduce((itemSum, item) => itemSum + toSafeAmount(item.quantity), 0)), 0);
};
export const resolvePurchaseWorkflowStatus = (workflowStatus?: PurchaseWorkflowStatus, legacyStatus?: Purchase['status']): PurchaseWorkflowStatus => {
    if (workflowStatus)
        return workflowStatus;
    if (legacyStatus === 'draft' || legacyStatus === 'approved' || legacyStatus === 'received' || legacyStatus === 'cancelled') {
        return legacyStatus;
    }
    return 'received';
};
export const resolvePurchasePaymentStatus = (totalAmount: number, paidAmount: number): PurchasePaymentStatus => {
    const safeTotal = toSafeAmount(totalAmount);
    const safePaid = Math.min(toSafeAmount(paidAmount), safeTotal);
    if (safeTotal <= 0 || safePaid <= 0)
        return 'unpaid';
    if (safePaid >= safeTotal)
        return 'paid';
    return 'partial';
};
// NEW: Receipt status resolution keeps legacy purchases working while enabling partial receipt tracking.
export const resolvePurchaseReceiptStatus = (orderedQuantity: number, receivedQuantity: number): PurchaseReceiptStatus => {
    const safeOrdered = toSafeAmount(orderedQuantity);
    const safeReceived = Math.min(toSafeAmount(receivedQuantity), safeOrdered || toSafeAmount(receivedQuantity));
    if (safeOrdered <= 0 || safeReceived <= 0)
        return 'not_received';
    if (safeReceived >= safeOrdered)
        return 'received';
    return 'partial';
};
export const resolvePurchaseStatus = (workflowStatus?: PurchaseWorkflowStatus, paymentStatus?: PurchasePaymentStatus): Purchase['status'] => {
    const resolvedWorkflow = resolvePurchaseWorkflowStatus(workflowStatus);
    if (resolvedWorkflow === 'draft' || resolvedWorkflow === 'approved' || resolvedWorkflow === 'cancelled') {
        return resolvedWorkflow;
    }
    if (paymentStatus === 'paid')
        return 'paid';
    if (paymentStatus === 'partial')
        return 'partial';
    return 'credit';
};
export const SUPPLIER_FINANCE_NOTE_PREFIX = 'Supplier finance meta';
export type SupplierFinanceEntryKind = 'advance_payment' | 'opening_debt_settlement';
export type SupplierBalanceStatus = 'debt' | 'settled' | 'prepaid';
export type SupplierNetBalanceStatus = 'net_debt' | 'net_credit' | 'settled';
export type SupplierBalanceDisplay = {
    signedBalance: number;
    currentDebt: number;
    supplierPrepayment: number;
    status: SupplierBalanceStatus;
    displayAmount: number;
};
export type SupplierNetBalanceDisplay = {
    netBalance: number;
    status: SupplierNetBalanceStatus;
    displayAmount: number;
};
export type SupplierFinanceSummary = {
    openDebt: number;
    supplierPrepayment: number;
    netBalance: number;
    openInvoiceCount: number;
    primaryStatus: 'open_debt' | 'prepaid' | 'settled';
    hasMixedPosition: boolean;
    openingDebtOutstanding: number;
    openingCredit: number;
    openInvoiceDebt: number;
    advancePaymentTotal: number;
    vendorCreditPrepaymentTotal: number;
    openingDebtSettlementTotal: number;
};
export type SupplierSettlementPlan = {
    purchaseAllocations: Array<{
        purchaseId: string;
        amount: number;
    }>;
    openingDebtAllocation: number;
    advancePaymentAmount: number;
    totalAppliedToDebt: number;
};
export type PurchasePaymentAllocationPlan = {
    targetPurchaseId: string;
    targetPurchaseAppliedAmount: number;
    otherOpenPurchasesAllocations: Array<{
        purchaseId: string;
        amount: number;
    }>;
    advancePaymentAmount: number;
    totalAppliedToPurchases: number;
    totalAmount: number;
};
export type PurchaseBatchPayloadEntry = {
    medicineId: string;
    batch: Omit<Batch, 'id' | 'history'>;
};
type PurchaseTraceRef = {
    lineId?: string;
    purchaseLineId?: string;
    purchaseItemIndex?: number;
    medicineId?: string;
    batchNumber?: string;
    expiryDate?: string;
};
export type PurchaseBatchIntegrityIssue = {
    type: 'missing_batch_for_received_line' | 'duplicate_batch_for_received_line' | 'batch_count_mismatch';
    key?: string;
    lineId?: string;
    purchaseItemIndex?: number;
    medicineId?: string;
    batchNumber?: string;
    expectedBatchCount?: number;
    actualBatchCount?: number;
};
export const getPurchaseLineId = (item: Pick<PurchaseItem, 'lineId'>, purchaseId: string | undefined, index: number): string | undefined => {
    const explicit = String(item.lineId || '').trim();
    if (explicit)
        return explicit;
    const safePurchaseId = String(purchaseId || '').trim();
    return safePurchaseId ? `${safePurchaseId}-line-${index + 1}` : undefined;
};
export const getPurchaseLineTraceKey = (item: PurchaseTraceRef, fallbackIndex = 0): string => {
    const lineId = String(item.lineId || item.purchaseLineId || '').trim();
    if (lineId)
        return `line:${lineId}`;
    if (typeof item.purchaseItemIndex === 'number')
        return `idx:${Math.max(0, item.purchaseItemIndex)}`;
    return [
        'batch',
        item.medicineId || '',
        item.batchNumber || '',
        item.expiryDate || ''
    ].join(':') || `idx:${fallbackIndex}`;
};
export const getSupplierCurrentDebt = (balance: number | null | undefined): number => (Math.max(0, toSignedAmount(balance)));
export const getSupplierPrepayment = (balance: number | null | undefined): number => (Math.max(0, -toSignedAmount(balance)));
export const getSupplierBalanceStatus = (balance: number | null | undefined): SupplierBalanceStatus => {
    const signedBalance = toSignedAmount(balance);
    if (signedBalance > 0)
        return 'debt';
    if (signedBalance < 0)
        return 'prepaid';
    return 'settled';
};
export const getSupplierBalanceDisplay = (balance: number | null | undefined): SupplierBalanceDisplay => {
    const signedBalance = toSignedAmount(balance);
    const currentDebt = getSupplierCurrentDebt(signedBalance);
    const supplierPrepayment = getSupplierPrepayment(signedBalance);
    const status = getSupplierBalanceStatus(signedBalance);
    return {
        signedBalance,
        currentDebt,
        supplierPrepayment,
        status,
        displayAmount: status === 'debt' ? currentDebt : supplierPrepayment
    };
};
export const getSupplierNetBalanceDisplay = (balance: number | null | undefined): SupplierNetBalanceDisplay => {
    const netBalance = toSignedAmount(balance);
    if (netBalance > 0) {
        return {
            netBalance,
            status: 'net_debt',
            displayAmount: netBalance,
        };
    }
    if (netBalance < 0) {
        return {
            netBalance,
            status: 'net_credit',
            displayAmount: Math.abs(netBalance),
        };
    }
    return {
        netBalance,
        status: 'settled',
        displayAmount: 0,
    };
};
export const buildSupplierFinanceTaggedNote = (kind: SupplierFinanceEntryKind, note?: string | null): string => {
    const cleanNote = typeof note === 'string' ? note.trim() : '';
    const metaLine = `${SUPPLIER_FINANCE_NOTE_PREFIX} | kind=${kind}`;
    return cleanNote ? `${cleanNote}\n${metaLine}` : metaLine;
};
export const parseSupplierFinanceTaggedNote = (note?: string | null): {
    kind?: SupplierFinanceEntryKind;
    displayNote: string;
} => {
    const normalizedNote = typeof note === 'string' ? note.trim() : '';
    if (!normalizedNote) {
        return { displayNote: '' };
    }
    let kind: SupplierFinanceEntryKind | undefined;
    const displayLines = normalizedNote
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => {
        const normalizedLine = line.trim();
        if (!normalizedLine.startsWith(SUPPLIER_FINANCE_NOTE_PREFIX))
            return true;
        const kindMatch = normalizedLine.match(/kind=(advance_payment|opening_debt_settlement)\b/);
        if (kindMatch) {
            kind = kindMatch[1] as SupplierFinanceEntryKind;
        }
        return false;
    });
    return {
        kind,
        displayNote: displayLines.join('\n').trim(),
    };
};
export const getSupplierOpeningSignedBalance = (supplier: Pick<Supplier, 'openingBalance' | 'balance' | 'transactions'>): number => {
    if (typeof supplier.openingBalance === 'number' && Number.isFinite(supplier.openingBalance)) {
        return supplier.openingBalance;
    }
    const runningDelta = (supplier.transactions || []).reduce((sum, transaction) => {
        const amount = toSafeAmount(transaction.amount);
        return sum + ((transaction.type === 'purchase' || transaction.type === 'initial') ? amount : -amount);
    }, 0);
    return toSignedAmount(supplier.balance) - runningDelta;
};
const isFinalizedSupplierPurchase = (purchase: Pick<Purchase, 'supplierId' | 'workflowStatus' | 'status'>, supplierId: string) => {
    if (purchase.supplierId !== supplierId)
        return false;
    const workflowStatus = resolvePurchaseWorkflowStatus(purchase.workflowStatus, purchase.status);
    return workflowStatus !== 'draft' && workflowStatus !== 'cancelled';
};
const compareSupplierSettlementPriority = (left: Pick<Purchase, 'id' | 'date' | 'dueDate'>, right: Pick<Purchase, 'id' | 'date' | 'dueDate'>) => {
    const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.POSITIVE_INFINITY;
    if (leftDue !== rightDue)
        return leftDue - rightDue;
    const leftDate = new Date(left.date).getTime();
    const rightDate = new Date(right.date).getTime();
    if (leftDate !== rightDate)
        return leftDate - rightDate;
    return left.id.localeCompare(right.id);
};
export const getSupplierFinanceSummary = (supplier: Pick<Supplier, 'id' | 'balance' | 'openingBalance' | 'transactions'> | null | undefined, purchases: Purchase[] = []): SupplierFinanceSummary => {
    if (!supplier) {
        return {
            openDebt: 0,
            supplierPrepayment: 0,
            netBalance: 0,
            openInvoiceCount: 0,
            primaryStatus: 'settled',
            hasMixedPosition: false,
            openingDebtOutstanding: 0,
            openingCredit: 0,
            openInvoiceDebt: 0,
            advancePaymentTotal: 0,
            vendorCreditPrepaymentTotal: 0,
            openingDebtSettlementTotal: 0,
        };
    }
    const openingSignedBalance = getSupplierOpeningSignedBalance(supplier);
    const openingDebtBase = Math.max(0, openingSignedBalance);
    const openingCredit = Math.max(0, -openingSignedBalance);
    let openingDebtSettlements = 0;
    let advancePayments = 0;
    (supplier.transactions || []).forEach((transaction) => {
        if (transaction.type !== 'payment')
            return;
        if (transaction.purchaseId || transaction.referenceId || transaction.receiptId || transaction.vendorCreditId)
            return;
        const amount = toSafeAmount(transaction.amount);
        if (amount <= 0)
            return;
        const financeNote = parseSupplierFinanceTaggedNote(transaction.note);
        if (financeNote.kind === 'opening_debt_settlement') {
            openingDebtSettlements += amount;
            return;
        }
        advancePayments += amount;
    });
    const finalizedSupplierPurchases = purchases
        .filter((purchase) => isFinalizedSupplierPurchase(purchase, supplier.id))
        .map((purchase) => normalizePurchaseRecord(purchase));
    const openInvoicePurchases = finalizedSupplierPurchases.filter((purchase) => purchase.remainingAmount > 0);
    const openInvoiceDebt = openInvoicePurchases.reduce((sum, purchase) => sum + toSafeAmount(purchase.remainingAmount), 0);
    const reusableVendorCredits = finalizedSupplierPurchases.reduce((sum, purchase) => (sum + (purchase.vendorCredits || []).reduce((creditSum, credit) => (creditSum + (((credit.resolution || 'vendor_credit') === 'vendor_credit') ? toSafeAmount(credit.amount) : 0)), 0)), 0);
    const openingDebtOutstanding = Math.max(0, openingDebtBase - openingDebtSettlements);
    const openDebt = openingDebtOutstanding + openInvoiceDebt;
    const supplierPrepayment = openingCredit + advancePayments + reusableVendorCredits;
    const hasMixedPosition = openDebt > 0 && supplierPrepayment > 0;
    return {
        openDebt,
        supplierPrepayment,
        netBalance: toSignedAmount(supplier.balance),
        openInvoiceCount: openInvoicePurchases.length,
        primaryStatus: openDebt > 0 ? 'open_debt' : supplierPrepayment > 0 ? 'prepaid' : 'settled',
        hasMixedPosition,
        openingDebtOutstanding,
        openingCredit,
        openInvoiceDebt,
        advancePaymentTotal: advancePayments,
        vendorCreditPrepaymentTotal: reusableVendorCredits,
        openingDebtSettlementTotal: openingDebtSettlements,
    };
};
export const buildSupplierSettlementPlan = ({ supplier, purchases = [], amount, }: {
    supplier: Pick<Supplier, 'id' | 'balance' | 'openingBalance' | 'transactions'>;
    purchases?: Purchase[];
    amount: number;
}): SupplierSettlementPlan => {
    const normalizedAmount = toSafeAmount(amount);
    if (normalizedAmount <= 0) {
        return {
            purchaseAllocations: [],
            openingDebtAllocation: 0,
            advancePaymentAmount: 0,
            totalAppliedToDebt: 0,
        };
    }
    const financeSummary = getSupplierFinanceSummary(supplier, purchases);
    let remainingAmount = normalizedAmount;
    const purchaseAllocations = purchases
        .filter((purchase) => isFinalizedSupplierPurchase(purchase, supplier.id))
        .map((purchase) => normalizePurchaseRecord(purchase))
        .filter((purchase) => purchase.remainingAmount > 0)
        .sort(compareSupplierSettlementPriority)
        .flatMap((purchase) => {
        if (remainingAmount <= 0)
            return [];
        const allocation = Math.min(remainingAmount, toSafeAmount(purchase.remainingAmount));
        if (allocation <= 0)
            return [];
        remainingAmount -= allocation;
        return [{
                purchaseId: purchase.id,
                amount: allocation,
            }];
    });
    const openingDebtAllocation = Math.min(remainingAmount, financeSummary.openingDebtOutstanding);
    remainingAmount = Math.max(0, remainingAmount - openingDebtAllocation);
    const advancePaymentAmount = remainingAmount;
    return {
        purchaseAllocations,
        openingDebtAllocation,
        advancePaymentAmount,
        totalAppliedToDebt: normalizedAmount - advancePaymentAmount,
    };
};
export const buildPurchasePaymentAllocationPlan = ({ targetPurchase, purchases = [], amount, }: {
    targetPurchase: Pick<Purchase, 'id' | 'supplierId' | 'date' | 'dueDate' | 'remainingAmount' | 'workflowStatus' | 'status'>;
    purchases?: Purchase[];
    amount: number;
}): PurchasePaymentAllocationPlan => {
    const normalizedAmount = toSafeAmount(amount);
    const targetPurchaseId = targetPurchase.id;
    if (!targetPurchaseId || normalizedAmount <= 0) {
        return {
            targetPurchaseId,
            targetPurchaseAppliedAmount: 0,
            otherOpenPurchasesAllocations: [],
            advancePaymentAmount: 0,
            totalAppliedToPurchases: 0,
            totalAmount: normalizedAmount,
        };
    }
    let remainingAmount = normalizedAmount;
    const targetPurchaseAppliedAmount = Math.min(remainingAmount, toSafeAmount(targetPurchase.remainingAmount));
    remainingAmount = Math.max(0, remainingAmount - targetPurchaseAppliedAmount);
    const otherOpenPurchasesAllocations = purchases
        .filter((purchase) => purchase.id !== targetPurchaseId && isFinalizedSupplierPurchase(purchase, targetPurchase.supplierId))
        .map((purchase) => normalizePurchaseRecord(purchase))
        .filter((purchase) => purchase.remainingAmount > 0)
        .sort(compareSupplierSettlementPriority)
        .flatMap((purchase) => {
        if (remainingAmount <= 0)
            return [];
        const allocation = Math.min(remainingAmount, toSafeAmount(purchase.remainingAmount));
        if (allocation <= 0)
            return [];
        remainingAmount -= allocation;
        return [{
                purchaseId: purchase.id,
                amount: allocation,
            }];
    });
    return {
        targetPurchaseId,
        targetPurchaseAppliedAmount,
        otherOpenPurchasesAllocations,
        advancePaymentAmount: remainingAmount,
        totalAppliedToPurchases: normalizedAmount - remainingAmount,
        totalAmount: normalizedAmount,
    };
};
export const buildPurchaseBatchPayload = (supplierId: string, items: PurchaseItem[] = [], options?: {
    destinationWarehouse?: string;
    traceSource?: Batch['traceSource'];
    ownerPartnerId?: string;
    ownershipType?: Batch['ownershipType'];
    sourceEntryType?: Batch['sourceEntryType'];
}): PurchaseBatchPayloadEntry[] => {
    const destinationWarehouse = (options?.destinationWarehouse || '').trim() || 'گدام اصلی';
    const traceSource = options?.traceSource || 'purchase';
    const ownerPartnerId = (options?.ownerPartnerId || '').trim();
    const ownershipType = options?.ownershipType || (ownerPartnerId ? 'partner' : 'store');
    const sourceEntryType = options?.sourceEntryType || 'store_purchase';
    return items.map((item, index) => ({
        medicineId: item.medicineId,
        batch: {
            batchNumber: item.batchNumber,
            quantity: getPurchaseItemBaseQuantity(item),
            expiryDate: item.expiryDate || '',
            purchasePrice: getPurchaseItemBaseUnitCost(item),
            supplierId,
            purchaseLineId: item.lineId,
            ownershipType: item.ownershipType || ownershipType,
            ownerPartnerId: ownerPartnerId || item.ownerPartnerId || item.partnerId || undefined,
            agreedPartnerValue: item.agreedPartnerValue,
            suggestedSalePrice: item.suggestedSalePrice || item.sellPriceRetail,
            sourceEntryType: item.stockEntryType || sourceEntryType,
            sourceDocumentNumber: item.sourceDocumentNumber,
            purchaseItemIndex: index,
            traceSource,
            availabilityStatus: 'available',
            location: {
                rack: destinationWarehouse,
                shelf: '',
            },
        },
    }));
};
export const buildPurchaseReceiptBatchPayload = (supplierId: string, items: PurchaseItem[] = [], receiptItems: PurchaseReceipt['items'] = [], options?: {
    destinationWarehouse?: string;
    ownerPartnerId?: string;
    ownershipType?: Batch['ownershipType'];
    sourceEntryType?: Batch['sourceEntryType'];
    sourceReceiptId?: string;
    receivedAt?: string;
}): PurchaseBatchPayloadEntry[] => {
    const destinationWarehouse = (options?.destinationWarehouse || '').trim() || 'گدام اصلی';
    const ownerPartnerId = (options?.ownerPartnerId || '').trim();
    const ownershipType = options?.ownershipType || (ownerPartnerId ? 'partner' : 'store');
    const sourceEntryType = options?.sourceEntryType || 'store_purchase';
    return receiptItems.flatMap((receiptItem, receiptIndex) => {
        const lineId = String(receiptItem.lineId || '').trim();
        const purchaseItemIndex = typeof receiptItem.purchaseItemIndex === 'number'
            ? receiptItem.purchaseItemIndex
            : lineId
                ? items.findIndex((item) => item.lineId === lineId)
                : items.findIndex((item) => (item.medicineId === receiptItem.medicineId
                    && (receiptItem.batchNumber ? item.batchNumber === receiptItem.batchNumber : true)));
        const purchaseItem = purchaseItemIndex >= 0 ? items[purchaseItemIndex] : undefined;
        const purchaseLineId = lineId || purchaseItem?.lineId;
        const requestedQuantity = toSafeAmount(receiptItem.baseQuantity ?? receiptItem.quantity);
        const maxQuantity = purchaseItem ? getPurchaseItemBaseQuantity(purchaseItem) : requestedQuantity;
        const quantity = Math.min(requestedQuantity, maxQuantity || requestedQuantity);
        const medicineId = receiptItem.medicineId || purchaseItem?.medicineId || '';
        const batchNumber = receiptItem.batchNumber || purchaseItem?.batchNumber || '';
        if (!medicineId || !batchNumber || quantity <= 0)
            return [];
        return [{
                medicineId,
                batch: {
                    batchNumber,
                    quantity,
                    expiryDate: receiptItem.expiryDate || purchaseItem?.expiryDate || '',
                    purchasePrice: receiptItem.purchasePrice ?? (purchaseItem ? getPurchaseItemBaseUnitCost(purchaseItem) : 0),
                    supplierId: receiptItem.supplierId || supplierId,
                    purchaseLineId,
                    ownershipType: receiptItem.ownershipType || purchaseItem?.ownershipType || ownershipType,
                    ownerPartnerId: ownerPartnerId || receiptItem.ownerPartnerId || purchaseItem?.ownerPartnerId || receiptItem.partnerId || purchaseItem?.partnerId || undefined,
                    agreedPartnerValue: receiptItem.agreedPartnerValue ?? purchaseItem?.agreedPartnerValue,
                    suggestedSalePrice: receiptItem.suggestedSalePrice ?? purchaseItem?.suggestedSalePrice ?? purchaseItem?.sellPriceRetail,
                    sourceEntryType: receiptItem.stockEntryType || purchaseItem?.stockEntryType || sourceEntryType,
                    sourceDocumentNumber: receiptItem.sourceDocumentNumber || purchaseItem?.sourceDocumentNumber,
                    purchaseItemIndex: purchaseItemIndex >= 0 ? purchaseItemIndex : receiptIndex,
                    receivedQuantity: quantity,
                    receivedAt: options?.receivedAt,
                    traceSource: 'purchase_receipt',
                    sourceReceiptId: options?.sourceReceiptId,
                    availabilityStatus: 'available',
                    location: {
                        rack: destinationWarehouse,
                        shelf: '',
                    },
                },
            }];
    });
};
export const getPurchaseItemTraceKey = (item: Pick<PurchaseReceipt['items'][number], 'lineId' | 'purchaseItemIndex' | 'medicineId' | 'batchNumber' | 'expiryDate'>) => {
    return getPurchaseLineTraceKey(item);
};
export const buildPurchaseReceiptQuantityMap = (receipts: PurchaseReceipt[] = []) => {
    const quantityMap = new Map<string, {
        quantity: number;
        receiptId?: string;
        receivedAt?: string;
    }>();
    receipts.forEach((receipt) => {
        (receipt.items || []).forEach((item) => {
            const safeQuantity = toSafeAmount(item.baseQuantity ?? item.quantity);
            if (safeQuantity <= 0)
                return;
            const key = getPurchaseItemTraceKey(item);
            const current = quantityMap.get(key);
            quantityMap.set(key, {
                quantity: (current?.quantity || 0) + safeQuantity,
                receiptId: current?.receiptId || receipt.id,
                receivedAt: receipt.date || current?.receivedAt,
            });
        });
    });
    return quantityMap;
};
export const getReceivedPurchaseLineRefs = (purchase: Partial<Pick<Purchase, 'id'>> & Pick<Purchase, 'items' | 'receipts' | 'workflowStatus' | 'status' | 'inventoryCommitted'>): Array<{
    key: string;
    lineId?: string;
    purchaseItemIndex?: number;
    medicineId?: string;
    batchNumber?: string;
    quantity: number;
}> => {
    const refs = new Map<string, {
        key: string;
        lineId?: string;
        purchaseItemIndex?: number;
        medicineId?: string;
        batchNumber?: string;
        quantity: number;
    }>();
    const items = purchase.items || [];
    const addRef = (ref: PurchaseTraceRef, quantity: number) => {
        const safeQuantity = toSafeAmount(quantity);
        if (safeQuantity <= 0)
            return;
        const key = getPurchaseLineTraceKey(ref);
        const current = refs.get(key);
        refs.set(key, {
            key,
            lineId: ref.lineId || ref.purchaseLineId || current?.lineId,
            purchaseItemIndex: typeof ref.purchaseItemIndex === 'number' ? ref.purchaseItemIndex : current?.purchaseItemIndex,
            medicineId: ref.medicineId || current?.medicineId,
            batchNumber: ref.batchNumber || current?.batchNumber,
            quantity: (current?.quantity || 0) + safeQuantity,
        });
    };
    if (Array.isArray(purchase.receipts) && purchase.receipts.length > 0) {
        purchase.receipts.forEach((receipt) => {
            (receipt.items || []).forEach((item) => {
                const purchaseItem = typeof item.purchaseItemIndex === 'number'
                    ? items[item.purchaseItemIndex]
                    : item.lineId
                        ? items.find((candidate) => candidate.lineId === item.lineId)
                        : undefined;
                addRef({
                    lineId: item.lineId || purchaseItem?.lineId,
                    purchaseItemIndex: item.purchaseItemIndex,
                    medicineId: item.medicineId || purchaseItem?.medicineId,
                    batchNumber: item.batchNumber || purchaseItem?.batchNumber,
                    expiryDate: item.expiryDate || purchaseItem?.expiryDate,
                }, item.baseQuantity ?? item.quantity);
            });
        });
        return Array.from(refs.values());
    }
    if (!purchaseAffectsInventory(purchase as Purchase))
        return [];
    items.forEach((item, index) => {
        addRef({
            lineId: item.lineId,
            purchaseItemIndex: index,
            medicineId: item.medicineId,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
        }, getPurchaseItemBaseQuantity(item));
    });
    return Array.from(refs.values());
};
export const validatePurchaseBatchPayloadIntegrity = (purchase: Partial<Pick<Purchase, 'id'>> & Pick<Purchase, 'items' | 'receipts' | 'workflowStatus' | 'status' | 'inventoryCommitted'>, batchPayload: Array<{
    medicineId: string;
    batch: Partial<Batch>;
}> = []): PurchaseBatchIntegrityIssue[] => {
    const expectedRefs = getReceivedPurchaseLineRefs(purchase);
    if (expectedRefs.length === 0)
        return [];
    const actualCounts = new Map<string, number>();
    batchPayload.forEach((entry, index) => {
        const batch = entry.batch || {};
        const quantity = toSafeAmount(batch.receivedQuantity ?? batch.quantity);
        if (!entry.medicineId || !batch.batchNumber || quantity <= 0)
            return;
        const key = getPurchaseLineTraceKey({
            purchaseLineId: batch.purchaseLineId,
            purchaseItemIndex: batch.purchaseItemIndex,
            medicineId: entry.medicineId,
            batchNumber: batch.batchNumber,
            expiryDate: batch.expiryDate,
        }, index);
        actualCounts.set(key, (actualCounts.get(key) || 0) + 1);
    });
    const issues: PurchaseBatchIntegrityIssue[] = [];
    expectedRefs.forEach((ref) => {
        const count = actualCounts.get(ref.key) || 0;
        if (count === 0) {
            issues.push({
                type: 'missing_batch_for_received_line',
                key: ref.key,
                lineId: ref.lineId,
                purchaseItemIndex: ref.purchaseItemIndex,
                medicineId: ref.medicineId,
                batchNumber: ref.batchNumber,
            });
        }
        else if (count > 1) {
            issues.push({
                type: 'duplicate_batch_for_received_line',
                key: ref.key,
                lineId: ref.lineId,
                purchaseItemIndex: ref.purchaseItemIndex,
                medicineId: ref.medicineId,
                batchNumber: ref.batchNumber,
                actualBatchCount: count,
            });
        }
    });
    const actualUniqueCount = Array.from(actualCounts.values()).filter((count) => count > 0).length;
    if (actualUniqueCount !== expectedRefs.length) {
        issues.push({
            type: 'batch_count_mismatch',
            expectedBatchCount: expectedRefs.length,
            actualBatchCount: actualUniqueCount,
        });
    }
    return issues;
};
// NEW: Purchase Receipt normalization is optional-safe for legacy records.
const normalizePurchaseReceipts = (purchase: Pick<Purchase, 'date' | 'receipts'>): PurchaseReceipt[] => {
    return Array.isArray(purchase.receipts)
        ? purchase.receipts.map((receipt, index) => ({
            ...receipt,
            id: receipt.id || `receipt-${purchase.date || Date.now()}-${index}`,
            date: receipt.date || purchase.date,
            supplierLiabilityImpact: receipt.supplierLiabilityImpact !== false,
            items: Array.isArray(receipt.items)
                ? receipt.items.map((item) => ({
                    ...item,
                    quantity: toSafeAmount(item.quantity),
                    baseQuantity: toSafeAmount(item.baseQuantity ?? item.quantity),
                    purchaseUnitName: item.purchaseUnitName || item.unit,
                    purchaseUnitConversionFactor: toSafeAmount(item.purchaseUnitConversionFactor || 1) || 1,
                    baseUnit: item.baseUnit || item.unit,
                    purchasePrice: item.purchasePrice === undefined ? undefined : toSafeAmount(item.purchasePrice),
                    agreedPartnerValue: item.agreedPartnerValue === undefined ? undefined : toSafeAmount(item.agreedPartnerValue),
                    suggestedSalePrice: item.suggestedSalePrice === undefined ? undefined : toSafeAmount(item.suggestedSalePrice),
                }))
                : [],
        }))
        : [];
};
// NEW: Vendor Credit normalization is optional-safe for legacy records.
const normalizeVendorCredits = (purchase: Pick<Purchase, 'date' | 'vendorCredits'>): VendorCredit[] => {
    return Array.isArray(purchase.vendorCredits)
        ? purchase.vendorCredits.map((credit, index) => ({
            ...credit,
            id: credit.id || `vendor-credit-${purchase.date || Date.now()}-${index}`,
            date: credit.date || purchase.date,
            amount: toSafeAmount(credit.amount),
            items: Array.isArray(credit.items)
                ? credit.items.map((item) => ({
                    ...item,
                    quantity: toSafeAmount(item.quantity),
                    amount: item.amount === undefined ? undefined : toSafeAmount(item.amount),
                }))
                : [],
            resolution: credit.resolution || 'vendor_credit',
        }))
        : [];
};
// NEW: Inventory commitment is derived conservatively so manual batches do not become purchase receipts.
const resolveInventoryCommitted = (purchase: Pick<Purchase, 'workflowStatus' | 'status' | 'inventoryCommitted' | 'receipts'>) => {
    const resolvedWorkflow = resolvePurchaseWorkflowStatus(purchase.workflowStatus, purchase.status);
    if (resolvedWorkflow === 'draft' || resolvedWorkflow === 'cancelled')
        return false;
    if (typeof purchase.inventoryCommitted === 'boolean')
        return purchase.inventoryCommitted && resolvedWorkflow === 'received';
    if (resolvedWorkflow === 'received')
        return true;
    return false;
};
// NEW: Partial Receipt compatibility helper used by procurement and stock logic.
export const getPurchaseReceivedQuantity = (purchase: Pick<Purchase, 'items' | 'date' | 'receipts' | 'workflowStatus' | 'status' | 'inventoryCommitted'>): number => {
    const normalizedReceipts = normalizePurchaseReceipts({ date: purchase.date, receipts: purchase.receipts });
    const receiptTotal = getPurchaseReceiptTotal(normalizedReceipts);
    if (receiptTotal > 0)
        return receiptTotal;
    return resolveInventoryCommitted(purchase) ? getPurchaseOrderedQuantity(purchase.items || []) : 0;
};
// NEW: Purchase inventory effect gate accepts legacy workflow states and receipt-aware purchase objects.
export const purchaseAffectsInventory = (purchase: Pick<Purchase, 'items' | 'date' | 'receipts' | 'workflowStatus' | 'status' | 'inventoryCommitted'> | PurchaseWorkflowStatus | undefined): boolean => {
    if (!purchase)
        return false;
    if (typeof purchase === 'string') {
        const resolvedWorkflow = resolvePurchaseWorkflowStatus(purchase);
        return resolvedWorkflow === 'received';
    }
    const resolvedWorkflow = resolvePurchaseWorkflowStatus(purchase.workflowStatus, purchase.status);
    return resolvedWorkflow === 'received'
        && resolveInventoryCommitted(purchase)
        && getPurchaseReceivedQuantity(purchase) > 0;
};
export const purchaseAffectsSupplierLedger = (purchase: Pick<Purchase, 'workflowStatus' | 'status' | 'receipts'> | PurchaseWorkflowStatus | undefined): boolean => {
    if (!purchase)
        return false;
    if (typeof purchase === 'string') {
        const resolvedWorkflow = resolvePurchaseWorkflowStatus(purchase);
        return resolvedWorkflow === 'approved' || resolvedWorkflow === 'received';
    }
    const resolvedWorkflow = resolvePurchaseWorkflowStatus(purchase.workflowStatus, purchase.status);
    if (resolvedWorkflow === 'draft' || resolvedWorkflow === 'cancelled')
        return false;
    const receipts = normalizePurchaseReceipts({ date: '', receipts: purchase.receipts });
    return receipts.length === 0 || receipts.some((receipt) => receipt.supplierLiabilityImpact !== false);
};
export const resolvePurchaseOperationalStage = (purchase: Pick<Purchase, 'paymentStatus' | 'receiptStatus' | 'workflowStatus' | 'status' | 'shortClosedAt'>): PurchaseOperationalStage => {
    if (purchase.shortClosedAt)
        return 'short_closed';
    const workflowStatus = resolvePurchaseWorkflowStatus(purchase.workflowStatus, purchase.status);
    const receiptStatus = purchase.receiptStatus || 'not_received';
    const paymentStatus = purchase.paymentStatus || 'unpaid';
    if (paymentStatus === 'paid')
        return 'paid';
    if (receiptStatus === 'partial')
        return 'partially_received';
    if (receiptStatus === 'received')
        return 'received';
    if (workflowStatus === 'approved' || workflowStatus === 'received')
        return 'billed';
    return 'ordered';
};
export const getPurchaseLastPaymentDate = (purchase: Pick<Purchase, 'payments' | 'updatedAt' | 'date'>): string => {
    const sortedDates = (purchase.payments || [])
        .map((payment) => payment.date)
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return sortedDates[0] || purchase.updatedAt || purchase.date;
};
export const isUnknownSupplier = (supplier?: Pick<Supplier, 'name' | 'code'> | null): boolean => {
    if (!supplier)
        return true;
    const normalizedName = (supplier.name || '').trim().toLowerCase();
    return normalizedName === '' || normalizedName === 'unknown' || normalizedName === 'نامعلوم';
};
export const INVENTORY_RETURN_REFERENCE_NOTE_PREFIX = 'Inventory vendor return reference';
type InventoryReturnReferenceMeta = {
    isReference: boolean;
    sourcePurchaseId?: string;
    sourceBatchId?: string;
    sourceBatchNumber?: string;
    resolution?: string;
};
const parseInventoryReturnReferenceMetaFromText = (text?: string | null): InventoryReturnReferenceMeta => {
    const normalizedText = (text || '').trim();
    if (!normalizedText.startsWith(INVENTORY_RETURN_REFERENCE_NOTE_PREFIX)) {
        return { isReference: false };
    }
    const values = normalizedText
        .split('|')
        .map((segment) => segment.trim())
        .slice(1)
        .reduce<Record<string, string>>((acc, segment) => {
        const separatorIndex = segment.indexOf('=');
        if (separatorIndex <= 0)
            return acc;
        const key = segment.slice(0, separatorIndex).trim();
        const value = segment.slice(separatorIndex + 1).trim();
        if (!key)
            return acc;
        acc[key] = value;
        return acc;
    }, {});
    const normalizeMetaValue = (value?: string) => {
        const normalizedValue = (value || '').trim();
        if (!normalizedValue || normalizedValue === 'none')
            return undefined;
        return normalizedValue;
    };
    return {
        isReference: true,
        sourcePurchaseId: normalizeMetaValue(values.sourcePurchaseId),
        sourceBatchId: normalizeMetaValue(values.sourceBatchId),
        sourceBatchNumber: normalizeMetaValue(values.sourceBatchNumber),
        resolution: normalizeMetaValue(values.resolution),
    };
};
export const getInventoryReturnReferenceMeta = (purchase: Pick<Purchase, 'notes' | 'auditTrail'>): InventoryReturnReferenceMeta => {
    const noteMeta = parseInventoryReturnReferenceMetaFromText(purchase.notes);
    if (noteMeta.isReference)
        return noteMeta;
    const auditNote = (purchase.auditTrail || [])
        .slice()
        .reverse()
        .find((entry) => entry.action === 'auto_return_reference_created' && entry.note)?.note;
    return parseInventoryReturnReferenceMetaFromText(auditNote);
};
export const isInventoryReturnReferencePurchase = (purchase: Pick<Purchase, 'notes' | 'auditTrail'>): boolean => getInventoryReturnReferenceMeta(purchase).isReference;
// NEW: Normalization computes derived procurement fields without duplicating source-of-truth state.
export const normalizePurchaseRecord = <T extends Purchase | Omit<Purchase, 'id'>>(purchase: T): T => {
    const normalizedInvoiceNumber = typeof purchase.invoiceNumber === 'string' ? purchase.invoiceNumber.trim() : purchase.invoiceNumber;
    const purchaseId = String((purchase as Partial<Purchase>).id || '').trim() || undefined;
    const items = Array.isArray(purchase.items)
        ? purchase.items.map((item, index) => ({
            ...item,
            lineId: getPurchaseLineId(item, purchaseId, index),
            quantity: toSafeAmount(item.quantity),
            baseQuantity: getPurchaseItemBaseQuantity(item),
            purchaseUnitName: item.purchaseUnitName || item.unit,
            purchaseUnitConversionFactor: toSafeAmount(item.purchaseUnitConversionFactor || 1) || 1,
            baseUnit: item.baseUnit || item.unit,
            purchasePrice: toSafeAmount(item.purchasePrice),
            lineTotal: getPurchaseItemTotal(item),
            sourceDocumentNumber: normalizedInvoiceNumber || item.sourceDocumentNumber,
        }))
        : [];
    const computedSubtotalAmount = calculatePurchaseSubtotal(items);
    const subtotalAmount = items.length > 0
        ? computedSubtotalAmount
        : toSafeAmount(purchase.subtotalAmount ?? computedSubtotalAmount);
    const discountAmount = toSafeAmount(purchase.discountAmount);
    const taxAmount = toSafeAmount(purchase.taxAmount);
    const shippingAmount = toSafeAmount(purchase.shippingAmount);
    const extraChargesAmount = toSafeAmount(purchase.extraChargesAmount);
    const computedTotal = Math.max(0, subtotalAmount - discountAmount + taxAmount + shippingAmount + extraChargesAmount);
    const totalAmount = items.length > 0
        ? computedTotal
        : toSafeAmount(purchase.totalAmount || computedTotal);
    const receipts = normalizePurchaseReceipts({ date: purchase.date, receipts: purchase.receipts })
        .map((receipt) => ({
        ...receipt,
        items: (receipt.items || []).map((item) => {
            const lineId = String(item.lineId || '').trim()
                || (typeof item.purchaseItemIndex === 'number' ? items[item.purchaseItemIndex]?.lineId : undefined)
                || items.find((purchaseItem) => (purchaseItem.medicineId === item.medicineId
                    && (!item.batchNumber || purchaseItem.batchNumber === item.batchNumber)))?.lineId;
            return lineId ? { ...item, lineId } : item;
        }),
    }));
    const vendorCredits = normalizeVendorCredits({ date: purchase.date, vendorCredits: purchase.vendorCredits })
        .map((credit) => ({
        ...credit,
        items: (credit.items || []).map((item) => {
            const lineId = String(item.lineId || '').trim()
                || (typeof item.purchaseItemIndex === 'number' ? items[item.purchaseItemIndex]?.lineId : undefined)
                || items.find((purchaseItem) => (purchaseItem.medicineId === item.medicineId
                    && (!item.batchNumber || purchaseItem.batchNumber === item.batchNumber)))?.lineId;
            return lineId ? { ...item, lineId } : item;
        }),
    }));
    const rawPayments = Array.isArray(purchase.payments) ? purchase.payments : [];
    const fallbackPayments = rawPayments.length === 0 && toSafeAmount(purchase.paidAmount) > 0
        ? [{
                id: `legacy-payment-${purchase.date || Date.now()}`,
                date: purchase.date,
                amount: toSafeAmount(purchase.paidAmount),
                method: purchase.paymentMethod && purchase.paymentMethod !== 'credit' ? purchase.paymentMethod : 'cash',
                note: 'Imported legacy payment'
            } satisfies PurchasePayment]
        : [];
    const payments = [...rawPayments, ...fallbackPayments].map((payment, index) => ({
        ...payment,
        id: payment.id || `pay-${purchase.date || Date.now()}-${index}`,
        date: payment.date || purchase.date,
        amount: toSafeAmount(payment.amount)
    }));
    const paidAmount = Math.min(toSafeAmount(payments.length ? getPurchasePaymentTotal(payments) : purchase.paidAmount), totalAmount);
    const creditedAmount = Math.min(toSafeAmount(vendorCredits.length
        ? getPurchaseVendorCreditTotal(vendorCredits)
        : purchase.creditedAmount), totalAmount);
    const workflowStatus = resolvePurchaseWorkflowStatus(purchase.workflowStatus, purchase.status);
    const settledAmount = Math.min(totalAmount, paidAmount + creditedAmount);
    const derivedRemainingAmount = Math.max(0, totalAmount - settledAmount);
    const hasExplicitRemainingAmount = purchase.remainingAmount !== undefined && purchase.remainingAmount !== null;
    const explicitRemainingAmount = hasExplicitRemainingAmount
        ? Math.min(toSafeAmount(purchase.remainingAmount), totalAmount)
        : undefined;
    const preserveExplicitClosedBalance = explicitRemainingAmount === 0
        && (purchase.paymentStatus === 'paid' || purchase.status === 'paid');
    const remainingAmount = preserveExplicitClosedBalance ? 0 : derivedRemainingAmount;
    const paymentStatus = preserveExplicitClosedBalance
        ? 'paid'
        : (purchase.paymentStatus || resolvePurchasePaymentStatus(totalAmount, settledAmount));
    const inventoryCommitted = resolveInventoryCommitted({
        workflowStatus: purchase.workflowStatus,
        status: purchase.status,
        inventoryCommitted: purchase.inventoryCommitted,
        receipts,
    });
    const receiptStatus = resolvePurchaseReceiptStatus(getPurchaseOrderedQuantity(items), getPurchaseReceivedQuantity({
        items,
        date: purchase.date,
        receipts,
        workflowStatus,
        status: purchase.status,
        inventoryCommitted,
    }));
    const receivedAt = receipts
        .map((receipt) => receipt.date)
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
        || (inventoryCommitted ? (purchase.receivedAt || purchase.date) : purchase.receivedAt);
    const status = resolvePurchaseStatus(workflowStatus, paymentStatus);
    return {
        ...purchase,
        items,
        subtotalAmount,
        discountAmount,
        taxAmount,
        shippingAmount,
        extraChargesAmount,
        totalAmount,
        paidAmount,
        creditedAmount,
        remainingAmount,
        paymentStatus,
        workflowStatus,
        receiptStatus,
        status,
        payments,
        receipts,
        vendorCredits,
        inventoryCommitted,
        receivedAt,
    };
};
const getBatchPurchaseTimestamp = (batch: Pick<Batch, 'receivedAt' | 'lastMovementAt' | 'history'>) => {
    const candidates = [
        batch.receivedAt,
        batch.lastMovementAt,
        batch.history?.[0]?.date,
    ].filter(Boolean) as string[];
    return candidates
        .map((value) => ({ value, timestamp: new Date(value).getTime() }))
        .filter((entry) => Number.isFinite(entry.timestamp))
        .sort((left, right) => right.timestamp - left.timestamp)[0]?.timestamp || 0;
};
const isRealPurchaseBatch = (batch: Pick<Batch, 'purchaseId' | 'traceSource' | 'purchasePrice' | 'quantity'>) => {
    if (toSafeAmount(batch.purchasePrice) <= 0 && toSafeAmount(batch.quantity) <= 0)
        return false;
    return Boolean(batch.purchaseId) || batch.traceSource === 'purchase' || batch.traceSource === 'purchase_receipt';
};
export type MedicinePurchasePricePoint = {
    batchId: string;
    batchNumber: string;
    purchaseId?: string;
    supplierId?: string;
    supplierName?: string;
    purchasePrice: number;
    date?: string;
    receivedAt?: string;
    traceSource?: Batch['traceSource'];
};
// NEW: Derived price history reads from real purchase-linked batches only, so manual inventory adjustments stay out of rate guidance.
export const getMedicinePurchasePriceHistory = (medicine: Pick<Medicine, 'batches'>, supplierById?: Map<string, Pick<Supplier, 'name'>>): MedicinePurchasePricePoint[] => {
    return [...(medicine.batches || [])]
        .filter(isRealPurchaseBatch)
        .sort((left, right) => getBatchPurchaseTimestamp(right) - getBatchPurchaseTimestamp(left))
        .map((batch) => ({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        purchaseId: batch.purchaseId,
        supplierId: batch.supplierId,
        supplierName: batch.supplierId ? supplierById?.get(batch.supplierId)?.name : undefined,
        purchasePrice: toSafeAmount(batch.purchasePrice),
        date: batch.receivedAt || batch.lastMovementAt || batch.history?.[0]?.date,
        receivedAt: batch.receivedAt || batch.lastMovementAt || batch.history?.[0]?.date,
        traceSource: batch.traceSource,
    }));
};
export const getMedicineLastPurchaseRate = (medicine: Pick<Medicine, 'batches'>, supplierById?: Map<string, Pick<Supplier, 'name'>>) => {
    return getMedicinePurchasePriceHistory(medicine, supplierById)[0] || null;
};
