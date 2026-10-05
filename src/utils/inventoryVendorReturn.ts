import type { AuditTrailEntry, Batch, Language, Medicine, Purchase, Supplier, SupplierTransaction, VendorCredit, VendorCreditResolution } from '@/types';
import { INVENTORY_RETURN_REFERENCE_NOTE_PREFIX, normalizePurchaseRecord } from './purchaseUtils';
import { createUniqueId } from './localIds';
const toSafeNumber = (value: unknown): number => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric))
        return 0;
    return Math.max(0, numeric);
};
const toTrimmedString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const createAuditTrailEntry = (trail: AuditTrailEntry[] | undefined, actorName: string, action: string, note: string, actorId?: string): AuditTrailEntry[] => {
    return [
        ...(trail || []),
        {
            id: createUniqueId('audit'),
            action,
            date: new Date().toISOString(),
            actorId,
            actorName,
            note,
        },
    ];
};
const createSupplierTransaction = (entry: Omit<SupplierTransaction, 'id' | 'balanceAfter' | 'recordedBy'> & {
    id?: string;
    recordedBy?: string;
}, actorName: string): SupplierTransaction => ({
    ...entry,
    id: entry.id || createUniqueId('txn'),
    amount: toSafeNumber(entry.amount),
    balanceAfter: 0,
    recordedBy: entry.recordedBy || actorName,
});
const getSupplierOpeningBalance = (supplier: Supplier) => {
    if (typeof supplier.openingBalance === 'number')
        return supplier.openingBalance;
    const runningDelta = (supplier.transactions || []).reduce((sum, transaction) => {
        const amount = toSafeNumber(transaction.amount);
        return sum + ((transaction.type === 'purchase' || transaction.type === 'initial') ? amount : -amount);
    }, 0);
    return (typeof supplier.balance === 'number' ? supplier.balance : 0) - runningDelta;
};
const rebuildSupplierLedger = (supplier: Supplier, transactions: SupplierTransaction[], meta?: Partial<Supplier>): Supplier => {
    const openingBalance = getSupplierOpeningBalance(supplier);
    let runningBalance = openingBalance;
    const rebuiltTransactions = (transactions || []).map((transaction) => {
        const amount = toSafeNumber(transaction.amount);
        runningBalance += (transaction.type === 'purchase' || transaction.type === 'initial') ? amount : -amount;
        return {
            ...transaction,
            amount,
            balanceAfter: runningBalance,
        };
    });
    return {
        ...supplier,
        ...meta,
        openingBalance,
        balance: runningBalance,
        transactions: rebuiltTransactions,
    };
};
const buildReferencePurchaseId = (returnId: string): string => `ret-pur-${returnId}`;
const buildReferenceInvoiceNumber = (returnId: string): string => {
    const compactId = returnId
        .replace(/[^a-zA-Z0-9]/g, '')
        .toUpperCase()
        .slice(-8);
    return `RET-${compactId || 'AUTO'}`;
};
const buildReferenceMetadataNote = ({ sourcePurchaseId, sourceBatchId, sourceBatchNumber, resolution, detail, }: {
    sourcePurchaseId?: string;
    sourceBatchId: string;
    sourceBatchNumber?: string;
    resolution: VendorCreditResolution;
    detail?: string;
}) => {
    const baseSegments = [
        `sourcePurchaseId=${sourcePurchaseId || 'none'}`,
        `sourceBatchId=${sourceBatchId || 'none'}`,
        `sourceBatchNumber=${sourceBatchNumber || 'none'}`,
        `resolution=${resolution || 'vendor_credit'}`,
    ];
    const normalizedDetail = toTrimmedString(detail);
    if (normalizedDetail) {
        baseSegments.push(`detail=${normalizedDetail.replace(/\|/g, '/')}`);
    }
    return `${INVENTORY_RETURN_REFERENCE_NOTE_PREFIX} | ${baseSegments.join(' | ')}`;
};
export type BuildInventoryVendorReturnMutationArgs = {
    medicines: Medicine[];
    purchases: Purchase[];
    suppliers: Supplier[];
    medicineId: string;
    batchId: string;
    quantity: number;
    description: string;
    supplierId?: string;
    resolution?: VendorCreditResolution;
    amount?: number;
    actorName: string;
    actorId?: string;
    nowIso?: string;
    language?: Language;
};
export type InventoryVendorReturnMutation = {
    previousBatch: Batch;
    updatedBatch: Batch;
    previousPurchase?: Purchase;
    updatedPurchase: Purchase;
    createdPurchase: Purchase;
    previousSupplier: Supplier;
    updatedSupplier: Supplier;
    updatedMedicines: Medicine[];
    updatedPurchases: Purchase[];
    updatedSuppliers: Supplier[];
    vendorCredit: VendorCredit;
    effectiveSupplierId: string;
    effectivePurchaseId: string;
    sourcePurchaseId?: string;
    creditAmount: number;
    purchaseMode: 'createReturnReferencePurchase';
};
const createReferencePurchase = ({ returnId, medicine, batch, supplierId, quantity, creditAmount, vendorNote, resolution, sourcePurchaseId, actorName, actorId, nowIso, language = 'dari', }: {
    returnId: string;
    medicine: Medicine;
    batch: Batch;
    supplierId: string;
    quantity: number;
    creditAmount: number;
    vendorNote: string;
    resolution: VendorCreditResolution;
    sourcePurchaseId?: string;
    actorName: string;
    actorId?: string;
    nowIso: string;
    language?: Language;
}): Purchase => {
    const purchasePrice = quantity > 0
        ? creditAmount / quantity
        : toSafeNumber(batch.purchasePrice);
    const referenceNote = buildReferenceMetadataNote({
        sourcePurchaseId,
        sourceBatchId: batch.id,
        sourceBatchNumber: batch.batchNumber,
        resolution,
        detail: vendorNote,
    });
    return normalizePurchaseRecord({
        id: buildReferencePurchaseId(returnId),
        supplierId,
        invoiceNumber: buildReferenceInvoiceNumber(returnId),
        date: nowIso,
        items: [
            {
                medicineId: medicine.id,
                medicineName: medicine.name,
                batchNumber: batch.batchNumber,
                expiryDate: batch.expiryDate,
                quantity,
                purchasePrice,
                unit: medicine.unit,
                lineTotal: creditAmount,
                notes: vendorNote || undefined,
            },
        ],
        totalAmount: creditAmount,
        paidAmount: 0,
        creditedAmount: 0,
        remainingAmount: creditAmount,
        status: 'received',
        workflowStatus: 'received',
        inventoryCommitted: false,
        receiptStatus: 'not_received',
        destinationWarehouse: language === 'english' ? 'Main warehouse' : 'گدام اصلی',
        notes: referenceNote,
        vendorCredits: [],
        payments: [],
        receipts: [],
        attachments: [],
        createdAt: nowIso,
        createdBy: actorName,
        updatedAt: nowIso,
        updatedBy: actorName,
        auditTrail: createAuditTrailEntry(undefined, actorName, 'auto_return_reference_created', referenceNote, actorId),
    });
};
export const buildInventoryVendorReturnMutation = (args: BuildInventoryVendorReturnMutationArgs): InventoryVendorReturnMutation => {
    const tr = (english: string, dari: string) => args.language === 'english' ? english : dari;
    const safeQuantity = Math.max(0, Math.trunc(toSafeNumber(args.quantity)));
    if (safeQuantity <= 0) {
        throw new Error(tr('Return quantity must be greater than zero.', 'تعداد مرجوعی باید بیشتر از صفر باشد.'));
    }
    const medicine = args.medicines.find((entry) => entry.id === args.medicineId);
    if (!medicine) {
        throw new Error(tr('Selected medicine was not found.', 'دوای انتخاب‌شده پیدا نشد.'));
    }
    const batch = medicine.batches.find((entry) => entry.id === args.batchId);
    if (!batch) {
        throw new Error(tr('Selected batch was not found.', 'بچ انتخاب‌شده پیدا نشد.'));
    }
    if (safeQuantity > toSafeNumber(batch.quantity)) {
        throw new Error(tr('Return quantity exceeds the batch stock.', 'تعداد مرجوعی از موجودی بچ بیشتر است.'));
    }
    const sourcePurchaseId = toTrimmedString(batch.purchaseId);
    const sourcePurchase = sourcePurchaseId
        ? args.purchases.find((entry) => entry.id === sourcePurchaseId && !entry.isDeleted) || null
        : null;
    const requestedSupplierId = toTrimmedString(args.supplierId);
    const effectiveSupplierId = toTrimmedString(requestedSupplierId
        || batch.supplierId
        || sourcePurchase?.supplierId);
    if (!effectiveSupplierId) {
        throw new Error(tr('Select a supplier for this return.', 'برای مرجوعی باید تأمین‌کننده انتخاب شود.'));
    }
    const supplier = args.suppliers.find((entry) => entry.id === effectiveSupplierId && !entry.isDeleted);
    if (!supplier) {
        throw new Error(tr('Selected supplier is invalid.', 'تأمین‌کننده انتخاب‌شده معتبر نیست.'));
    }
    const enteredAmount = toSafeNumber(args.amount);
    const creditAmount = enteredAmount > 0 ? enteredAmount : safeQuantity * toSafeNumber(batch.purchasePrice);
    if (creditAmount <= 0) {
        throw new Error(tr('Return amount must be greater than zero.', 'مبلغ مرجوعی باید بیشتر از صفر باشد.'));
    }
    const resolution = args.resolution || 'vendor_credit';
    const nowIso = args.nowIso || new Date().toISOString();
    const actorName = toTrimmedString(args.actorName) || 'System';
    const actorId = toTrimmedString(args.actorId) || undefined;
    const vendorNote = toTrimmedString(args.description) || tr('Supplier return', 'مرجوعی به تأمین‌کننده');
    const vendorCreditId = createUniqueId('vendor-credit');
    const createdPurchase = createReferencePurchase({
        returnId: vendorCreditId,
        medicine,
        batch,
        supplierId: effectiveSupplierId,
        quantity: safeQuantity,
        creditAmount,
        vendorNote,
        resolution,
        sourcePurchaseId: sourcePurchaseId || undefined,
        actorName,
        actorId,
        nowIso,
        language: args.language,
    });
    const purchaseLabel = createdPurchase.invoiceNumber || createdPurchase.id.slice(-6);
    const vendorCredit: VendorCredit = {
        id: vendorCreditId,
        date: nowIso,
        supplierId: effectiveSupplierId,
        purchaseId: createdPurchase.id,
        batchId: batch.id,
        amount: creditAmount,
        recordedBy: actorName,
        note: vendorNote,
        resolution,
        items: [
            {
                medicineId: medicine.id,
                purchaseItemIndex: 0,
                batchId: batch.id,
                batchNumber: batch.batchNumber,
                quantity: safeQuantity,
                amount: creditAmount,
            },
        ],
    };
    const updatedBatch: Batch = {
        ...batch,
        linkedReturnId: vendorCredit.id,
        lastMovementAt: nowIso,
        history: [
            ...(batch.history || []),
            {
                date: nowIso,
                action: tr('Supplier return', 'مرجوعی به تأمین‌کننده'),
                details: tr(`Quantity ${safeQuantity} | Amount ${creditAmount} | Reference ${purchaseLabel}`, `تعداد ${safeQuantity} | مبلغ ${creditAmount} | سند مرجع ${purchaseLabel}`) + (vendorNote ? ` | ${vendorNote}` : ''),
            },
        ],
    };
    const updatedPurchase = normalizePurchaseRecord({
        ...createdPurchase,
        vendorCredits: [...(createdPurchase.vendorCredits || []), vendorCredit],
        updatedAt: nowIso,
        updatedBy: actorName,
        auditTrail: createAuditTrailEntry(createdPurchase.auditTrail, actorName, 'vendor_credit_recorded', `Inventory vendor return credit recorded | referencePurchaseId=${createdPurchase.id} | amount=${creditAmount} | batchId=${batch.id} | resolution=${resolution}`, actorId),
    });
    const ledgerContext = [
        `reference=${purchaseLabel}`,
        `batch=${batch.batchNumber || batch.id}`,
        `qty=${safeQuantity}`,
        `resolution=${resolution}`,
        vendorNote || '',
    ].filter(Boolean).join(' | ');
    const supplierTransactions: SupplierTransaction[] = [
        createSupplierTransaction({
            id: `purchase-${createdPurchase.id}`,
            date: nowIso,
            type: 'purchase',
            amount: creditAmount,
            description: tr(`Return reference #${purchaseLabel}`, `سند مرجع مرجوعی #${purchaseLabel}`),
            referenceId: createdPurchase.id,
            purchaseId: createdPurchase.id,
            note: ledgerContext,
        }, actorName),
        createSupplierTransaction({
            id: `vendor-credit-${vendorCredit.id}`,
            date: nowIso,
            type: 'vendor_credit',
            amount: creditAmount,
            description: tr(`Supplier return credit #${purchaseLabel}`, `اعتبار مرجوعی سند #${purchaseLabel}`),
            referenceId: createdPurchase.id,
            purchaseId: createdPurchase.id,
            vendorCreditId: vendorCredit.id,
            batchId: batch.id,
            note: ledgerContext,
        }, actorName),
    ];
    const updatedSupplier = rebuildSupplierLedger(supplier, [...(supplier.transactions || []), ...supplierTransactions], {
        updatedAt: nowIso,
        updatedBy: actorName,
        lastPurchaseDate: nowIso,
        lastInteractionDate: nowIso,
        auditTrail: createAuditTrailEntry(supplier.auditTrail, actorName, 'vendor_credit_recorded', tr(`Return reference ${purchaseLabel} and credit ${creditAmount} recorded`, `سند مرجع مرجوعی ${purchaseLabel} و اعتبار ${creditAmount} ثبت شد`), actorId),
    });
    const updatedMedicines = args.medicines.map((entry) => {
        if (entry.id !== medicine.id)
            return entry;
        return {
            ...entry,
            batches: entry.batches.map((entryBatch) => (entryBatch.id === batch.id ? updatedBatch : entryBatch)),
            updatedAt: nowIso,
        };
    });
    const existingReferenceIndex = args.purchases.findIndex((entry) => entry.id === updatedPurchase.id);
    const updatedPurchases = existingReferenceIndex >= 0
        ? args.purchases.map((entry) => (entry.id === updatedPurchase.id ? updatedPurchase : entry))
        : [...args.purchases, updatedPurchase];
    const updatedSuppliers = args.suppliers.map((entry) => (entry.id === supplier.id ? updatedSupplier : entry));
    return {
        previousBatch: batch,
        updatedBatch,
        previousPurchase: createdPurchase,
        updatedPurchase,
        createdPurchase,
        previousSupplier: supplier,
        updatedSupplier,
        updatedMedicines,
        updatedPurchases,
        updatedSuppliers,
        vendorCredit,
        effectiveSupplierId,
        effectivePurchaseId: updatedPurchase.id,
        sourcePurchaseId: sourcePurchaseId || undefined,
        creditAmount,
        purchaseMode: 'createReturnReferencePurchase',
    };
};
