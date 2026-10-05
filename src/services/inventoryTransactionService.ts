import type { Batch, BatchOwnershipType, Invoice, Medicine, Purchase, PurchaseReceipt, SalesReturn, StockMovement, StockMovementReferenceType, StockMovementType, StockEntryType } from '@/types';
import { getInvoiceNetStockRollback } from '@/utils/inventoryLedger';
import { getInvoiceItemBaseQuantity } from '@/utils/unitConversion';
import { createUniqueId } from '@/utils/localIds';
import { hasInvoiceItemBeforeDateForBatch } from '@/utils/inventoryBatchIntegrity';
import { getPurchaseItemBaseUnitCost, purchaseAffectsInventory } from '@/utils/purchaseUtils';
import { buildInventoryVendorReturnMutation, type BuildInventoryVendorReturnMutationArgs, type InventoryVendorReturnMutation } from '@/utils/inventoryVendorReturn';
const EPSILON = 1e-6;
export class InventoryTransactionError extends Error {
    constructor(message: string, public readonly code: string, public readonly metadata?: Record<string, unknown>) {
        super(message);
        this.name = 'InventoryTransactionError';
    }
}
export interface StockMovementDraft {
    medicineId: string;
    batchId: string;
    type: StockMovementType;
    quantityBaseUnit: number;
    referenceType: StockMovementReferenceType;
    referenceId: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
    history?: {
        action: string;
        details: string;
    };
    createBatch?: Omit<Batch, 'history'> & {
        history?: Batch['history'];
    };
}
export interface InventoryTransactionInput {
    medicines: Medicine[];
    stockMovements?: StockMovement[];
    movements: StockMovementDraft[];
    createdAt?: string;
}
export interface InventoryTransactionResult {
    medicines: Medicine[];
    stockMovements: StockMovement[];
    appendedMovements: StockMovement[];
    skippedIdempotencyKeys: string[];
}
export interface InventorySnapshotTransactionInput {
    medicines: Medicine[];
    stockMovements?: StockMovement[];
    nextMedicines: Medicine[];
    type: StockMovementType;
    referenceType: StockMovementReferenceType;
    referenceId: string;
    idempotencyScope: string;
    createdAt?: string;
    includeRemovedBatches?: boolean;
    metadata?: Record<string, unknown>;
    history?: {
        action: string;
        details: string;
    };
}
export interface PurchaseReceiptMedicineSnapshotInput {
    medicines: Medicine[];
    invoices: Invoice[];
    purchase: Purchase;
    receipt: PurchaseReceipt;
    createdAt: string;
    createBatchId?: (index: number) => string;
    defaultRackName?: string;
}
export interface PurchaseApplyMedicineSnapshotInput {
    medicines: Medicine[];
    purchase: Purchase;
    incomingBatches: {
        medicineId: string;
        batch: Omit<Batch, 'id' | 'history'> & {
            id?: string;
            history?: Batch['history'];
        };
    }[];
    createdAt: string;
    createBatchId?: (index: number) => string;
}
export interface PurchaseRollbackMedicineSnapshotInput {
    medicines: Medicine[];
    purchase: Purchase;
    createdAt: string;
}
const toSafeNumber = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const roundStock = (value: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return 0;
    const factor = 10 ** 6;
    return Math.round(parsed * factor) / factor;
};
const cloneBatchWithZeroStock = (batch: StockMovementDraft['createBatch'], createdAt: string): Batch => {
    if (!batch) {
        throw new InventoryTransactionError('Batch is required.', 'BATCH_NOT_FOUND');
    }
    return {
        ...batch,
        quantity: 0,
        lastMovementAt: createdAt,
        history: Array.isArray(batch.history) ? batch.history : [],
    };
};
const stockQuantity = (batch: Pick<Batch, 'quantity'> | undefined | null): number => roundStock(toSafeNumber(batch?.quantity));
const getPurchaseReceiptItemTraceKey = (item: {
    lineId?: string;
    medicineId?: string;
    purchaseItemIndex?: number;
    batchNumber?: string;
    expiryDate?: string;
}): string => {
    if (item.lineId) {
        return `line:${item.lineId}`;
    }
    if (typeof item.purchaseItemIndex === 'number') {
        return `idx:${item.purchaseItemIndex}`;
    }
    return `batch:${item.medicineId || ''}:${item.batchNumber || ''}:${item.expiryDate || ''}`;
};
const buildPurchaseReceiptQuantityMap = (purchaseRecord: Purchase): Map<string, number> => {
    const quantityMap = new Map<string, number>();
    (purchaseRecord.receipts || []).forEach((receipt) => {
        (receipt.items || []).forEach((item) => {
            const safeQuantity = Math.max(0, toSafeNumber(item.baseQuantity ?? item.quantity));
            if (safeQuantity <= 0)
                return;
            const key = getPurchaseReceiptItemTraceKey(item);
            quantityMap.set(key, roundStock((quantityMap.get(key) || 0) + safeQuantity));
        });
    });
    return quantityMap;
};
const withoutStockRuntimeFields = (batch: Batch): Batch => ({
    ...batch,
    quantity: 0,
    history: Array.isArray(batch.history) ? [...batch.history] : [],
});
const overlayNonStockBatchMetadata = (appliedMedicines: Medicine[], targetMedicines: Medicine[], options: {
    includeRemovedBatches?: boolean;
    removedAt?: string;
} = {}): Medicine[] => {
    const targetMedicineById = new Map(targetMedicines.map((medicine) => [medicine.id, medicine]));
    return appliedMedicines.map((medicine) => {
        const targetMedicine = targetMedicineById.get(medicine.id);
        const targetBatchById = new Map((targetMedicine?.batches || []).map((batch) => [batch.id, batch]));
        return {
            ...medicine,
            batches: (medicine.batches || []).map((batch) => {
                const targetBatch = targetBatchById.get(batch.id);
                if (targetBatch) {
                    return {
                        ...targetBatch,
                        quantity: batch.quantity,
                        lastMovementAt: batch.lastMovementAt || targetBatch.lastMovementAt,
                        history: batch.history,
                    };
                }
                if (!options.includeRemovedBatches)
                    return batch;
                return {
                    ...batch,
                    receivedQuantity: 0,
                    availabilityStatus: batch.availabilityStatus || 'rejected',
                    availabilityReason: batch.availabilityReason || 'Rolled back by stock movement ledger',
                    availabilityChangedAt: batch.availabilityChangedAt || options.removedAt,
                };
            }),
            updatedAt: medicine.updatedAt,
        };
    });
};
const assertFiniteMovement = (draft: StockMovementDraft): void => {
    if (!draft.medicineId || !draft.batchId) {
        throw new InventoryTransactionError('Movement target is missing.', 'INVALID_MOVEMENT_TARGET', {
            medicineId: draft.medicineId,
            batchId: draft.batchId,
        });
    }
    if (!Number.isFinite(draft.quantityBaseUnit) || Math.abs(draft.quantityBaseUnit) <= EPSILON) {
        throw new InventoryTransactionError('Movement quantity is invalid.', 'INVALID_MOVEMENT_QUANTITY', {
            medicineId: draft.medicineId,
            batchId: draft.batchId,
            quantityBaseUnit: draft.quantityBaseUnit,
        });
    }
};
export const applyInventoryTransaction = ({ medicines, stockMovements = [], movements, createdAt = new Date().toISOString(), }: InventoryTransactionInput): InventoryTransactionResult => {
    const existingIdempotencyKeys = new Set(stockMovements
        .filter((movement) => movement.idempotencyKey && !movement.voided)
        .map((movement) => movement.idempotencyKey as string));
    const skippedIdempotencyKeys: string[] = [];
    const appendedMovements: StockMovement[] = [];
    let nextMedicines = medicines.map((medicine) => ({
        ...medicine,
        batches: (medicine.batches || []).map((batch) => ({
            ...batch,
            history: Array.isArray(batch.history) ? [...batch.history] : [],
        })),
    }));
    for (const draft of movements) {
        assertFiniteMovement(draft);
        if (draft.idempotencyKey && existingIdempotencyKeys.has(draft.idempotencyKey)) {
            skippedIdempotencyKeys.push(draft.idempotencyKey);
            continue;
        }
        const medicineIndex = nextMedicines.findIndex((medicine) => medicine.id === draft.medicineId);
        if (medicineIndex < 0) {
            throw new InventoryTransactionError('Medicine is missing for stock movement.', 'MEDICINE_NOT_FOUND', {
                medicineId: draft.medicineId,
            });
        }
        const medicine = nextMedicines[medicineIndex];
        let batchIndex = (medicine.batches || []).findIndex((batch) => batch.id === draft.batchId);
        let batches = [...(medicine.batches || [])];
        if (batchIndex < 0) {
            if (!draft.createBatch) {
                throw new InventoryTransactionError('Batch is missing for stock movement.', 'BATCH_NOT_FOUND', {
                    medicineId: draft.medicineId,
                    batchId: draft.batchId,
                });
            }
            batches.push(cloneBatchWithZeroStock(draft.createBatch, createdAt));
            batchIndex = batches.length - 1;
        }
        const batch = batches[batchIndex];
        const previousStock = roundStock(toSafeNumber(batch.quantity));
        const newStock = roundStock(previousStock + draft.quantityBaseUnit);
        if (newStock < -EPSILON) {
            throw new InventoryTransactionError('Stock movement would make batch stock negative.', 'NEGATIVE_STOCK', {
                medicineId: draft.medicineId,
                batchId: draft.batchId,
                previousStock,
                quantityBaseUnit: draft.quantityBaseUnit,
                newStock,
            });
        }
        const movement: StockMovement = {
            id: createUniqueId('stm'),
            medicineId: draft.medicineId,
            batchId: draft.batchId,
            type: draft.type,
            quantityBaseUnit: roundStock(draft.quantityBaseUnit),
            referenceType: draft.referenceType,
            referenceId: draft.referenceId,
            previousStock,
            newStock: Math.max(0, newStock),
            createdAt,
            idempotencyKey: draft.idempotencyKey,
            reversed: false,
            voided: false,
            metadata: draft.metadata,
        };
        batches[batchIndex] = {
            ...batch,
            quantity: movement.newStock,
            lastMovementAt: createdAt,
            history: [
                ...(Array.isArray(batch.history) ? batch.history : []),
                ...(draft.history ? [{ date: createdAt, action: draft.history.action, details: draft.history.details }] : []),
            ],
        };
        nextMedicines[medicineIndex] = {
            ...medicine,
            batches,
            updatedAt: createdAt,
        };
        appendedMovements.push(movement);
        if (draft.idempotencyKey)
            existingIdempotencyKeys.add(draft.idempotencyKey);
    }
    return {
        medicines: nextMedicines,
        stockMovements: [...stockMovements, ...appendedMovements],
        appendedMovements,
        skippedIdempotencyKeys,
    };
};
export const buildStockMovementDraftsFromMedicineSnapshot = ({ medicines, nextMedicines, type, referenceType, referenceId, idempotencyScope, includeRemovedBatches = false, metadata, history, }: Omit<InventorySnapshotTransactionInput, 'stockMovements' | 'createdAt'>): StockMovementDraft[] => {
    const currentMedicineById = new Map(medicines.map((medicine) => [medicine.id, medicine]));
    const currentBatchByKey = new Map<string, Batch>();
    medicines.forEach((medicine) => {
        (medicine.batches || []).forEach((batch) => {
            currentBatchByKey.set(`${medicine.id}\u0000${batch.id}`, batch);
        });
    });
    const drafts: StockMovementDraft[] = [];
    nextMedicines.forEach((nextMedicine) => {
        const currentMedicine = currentMedicineById.get(nextMedicine.id);
        (nextMedicine.batches || []).forEach((nextBatch) => {
            const currentBatch = currentBatchByKey.get(`${nextMedicine.id}\u0000${nextBatch.id}`);
            const delta = roundStock(stockQuantity(nextBatch) - stockQuantity(currentBatch));
            if (Math.abs(delta) <= EPSILON)
                return;
            drafts.push({
                medicineId: nextMedicine.id,
                batchId: nextBatch.id,
                type,
                quantityBaseUnit: delta,
                referenceType,
                referenceId,
                idempotencyKey: `${idempotencyScope}:${nextMedicine.id}:${nextBatch.id}`,
                metadata: {
                    ...(metadata || {}),
                    previousStock: stockQuantity(currentBatch),
                    nextStock: stockQuantity(nextBatch),
                    batchNumber: nextBatch.batchNumber,
                },
                history,
                createBatch: currentBatch ? undefined : withoutStockRuntimeFields(nextBatch),
            });
        });
        if (!includeRemovedBatches || !currentMedicine)
            return;
        const nextBatchIds = new Set((nextMedicine.batches || []).map((batch) => batch.id));
        (currentMedicine.batches || []).forEach((currentBatch) => {
            if (nextBatchIds.has(currentBatch.id))
                return;
            const currentQuantity = stockQuantity(currentBatch);
            if (currentQuantity <= EPSILON)
                return;
            drafts.push({
                medicineId: nextMedicine.id,
                batchId: currentBatch.id,
                type,
                quantityBaseUnit: -currentQuantity,
                referenceType,
                referenceId,
                idempotencyKey: `${idempotencyScope}:${nextMedicine.id}:${currentBatch.id}`,
                metadata: {
                    ...(metadata || {}),
                    previousStock: currentQuantity,
                    nextStock: 0,
                    removedBatch: true,
                    batchNumber: currentBatch.batchNumber,
                },
                history,
            });
        });
    });
    return drafts;
};
export const applyInventorySnapshotTransaction = (input: InventorySnapshotTransactionInput): InventoryTransactionResult => {
    const createdAt = input.createdAt || new Date().toISOString();
    const movements = buildStockMovementDraftsFromMedicineSnapshot(input);
    const transaction = movements.length
        ? applyInventoryTransaction({
            medicines: input.medicines,
            stockMovements: input.stockMovements || [],
            movements,
            createdAt,
        })
        : {
            medicines: input.medicines,
            stockMovements: input.stockMovements || [],
            appendedMovements: [],
            skippedIdempotencyKeys: [],
        };
    return {
        ...transaction,
        medicines: overlayNonStockBatchMetadata(transaction.medicines, input.nextMedicines, { includeRemovedBatches: input.includeRemovedBatches, removedAt: createdAt }),
    };
};
export const buildPurchaseReceiptMedicineSnapshot = ({ medicines, invoices, purchase, receipt, createdAt, createBatchId = (index: number) => createUniqueId(`batch-${index}`), defaultRackName = 'Main warehouse', }: PurchaseReceiptMedicineSnapshotInput): Medicine[] => (medicines.map((medicine) => {
    const relatedReceiptItems = (receipt.items || []).filter((item) => item.medicineId === medicine.id);
    if (!relatedReceiptItems.length)
        return medicine;
    const nextBatches = [...(medicine.batches || [])];
    relatedReceiptItems.forEach((receiptItem, index) => {
        const purchaseItem = typeof receiptItem.purchaseItemIndex === 'number'
            ? purchase.items[receiptItem.purchaseItemIndex]
            : undefined;
        const requestedBaseQuantity = receiptItem.baseQuantity ?? receiptItem.quantity;
        const candidateBatchIndex = nextBatches.findIndex((batch) => (batch.purchaseId === purchase.id
            && ((receiptItem.batchId && batch.id === receiptItem.batchId)
                || (receiptItem.lineId && batch.purchaseLineId === receiptItem.lineId)
                || (typeof receiptItem.purchaseItemIndex === 'number'
                    && batch.purchaseItemIndex === receiptItem.purchaseItemIndex
                    && batch.batchNumber === (receiptItem.batchNumber || purchaseItem?.batchNumber || batch.batchNumber)))));
        const matchingBatchIndex = (candidateBatchIndex >= 0
            && !hasInvoiceItemBeforeDateForBatch(nextBatches[candidateBatchIndex].id, invoices, purchase.date || receipt.date, medicine.id)) ? candidateBatchIndex : -1;
        const batchPurchasePrice = purchaseItem
            ? getPurchaseItemBaseUnitCost(purchaseItem)
            : (receiptItem.purchasePrice || 0);
        const receiptOwnerPartnerId = receiptItem.ownerPartnerId
            || purchaseItem?.ownerPartnerId
            || purchaseItem?.partnerId
            || purchase.partnerId
            || undefined;
        const rawReceiptStockEntryType = receiptItem.stockEntryType || purchaseItem?.stockEntryType || purchase.stockEntryType;
        const receiptStockEntryType: StockEntryType = receiptOwnerPartnerId
            ? (rawReceiptStockEntryType === 'partner_consignment' ? 'partner_consignment' : 'partner_goods_capital')
            : 'store_purchase';
        const receiptOwnershipType: BatchOwnershipType = receiptOwnerPartnerId
            ? (receiptStockEntryType === 'partner_consignment' ? 'consignment' : 'partner')
            : (receiptItem.ownershipType || purchaseItem?.ownershipType || purchase.ownershipType || 'store');
        const receiptAgreedPartnerValue = receiptItem.agreedPartnerValue ?? purchaseItem?.agreedPartnerValue;
        const receiptSuggestedSalePrice = receiptItem.suggestedSalePrice
            ?? purchaseItem?.suggestedSalePrice
            ?? purchaseItem?.sellPriceRetail;
        const receiptSourceDocumentNumber = receiptItem.sourceDocumentNumber || purchaseItem?.sourceDocumentNumber || purchase.invoiceNumber;
        const receiptHistory = {
            date: createdAt,
            action: 'purchase_receipt',
            details: `Received ${receiptItem.quantity} for purchase #${purchase.invoiceNumber || purchase.id.slice(-6)}`,
        };
        if (matchingBatchIndex >= 0) {
            const currentBatch = nextBatches[matchingBatchIndex];
            nextBatches[matchingBatchIndex] = {
                ...currentBatch,
                quantity: Math.max(0, currentBatch.quantity) + requestedBaseQuantity,
                purchasePrice: currentBatch.purchasePrice || batchPurchasePrice,
                receivedQuantity: Math.max(0, currentBatch.receivedQuantity || 0) + requestedBaseQuantity,
                receivedAt: receipt.date,
                supplierId: currentBatch.supplierId || purchase.supplierId,
                purchaseId: purchase.id,
                purchaseLineId: currentBatch.purchaseLineId || receiptItem.lineId || purchaseItem?.lineId,
                purchaseItemIndex: currentBatch.purchaseItemIndex ?? receiptItem.purchaseItemIndex,
                ownershipType: currentBatch.ownershipType || receiptOwnershipType,
                ownerPartnerId: currentBatch.ownerPartnerId || receiptOwnerPartnerId,
                agreedPartnerValue: currentBatch.agreedPartnerValue ?? receiptAgreedPartnerValue,
                suggestedSalePrice: currentBatch.suggestedSalePrice ?? receiptSuggestedSalePrice,
                sourceEntryType: currentBatch.sourceEntryType || receiptStockEntryType,
                sourceDocumentNumber: currentBatch.sourceDocumentNumber || receiptSourceDocumentNumber,
                sourceReceiptId: receipt.id,
                traceSource: 'purchase_receipt',
                availabilityStatus: currentBatch.availabilityStatus || 'available',
                lastMovementAt: createdAt,
                history: [
                    ...(currentBatch.history || []),
                    receiptHistory,
                ],
            };
            return;
        }
        const requestedBatchIdExists = Boolean(receiptItem.batchId && nextBatches.some((batch) => batch.id === receiptItem.batchId));
        nextBatches.push({
            id: receiptItem.batchId && !requestedBatchIdExists ? receiptItem.batchId : createBatchId(index),
            batchNumber: receiptItem.batchNumber || purchaseItem?.batchNumber || `REC-${Date.now().toString().slice(-5)}`,
            quantity: requestedBaseQuantity,
            expiryDate: receiptItem.expiryDate || purchaseItem?.expiryDate || '',
            purchasePrice: batchPurchasePrice,
            supplierId: receiptItem.supplierId || purchase.supplierId,
            purchaseId: purchase.id,
            purchaseLineId: receiptItem.lineId || purchaseItem?.lineId,
            purchaseItemIndex: receiptItem.purchaseItemIndex,
            ownershipType: receiptOwnershipType,
            ownerPartnerId: receiptOwnerPartnerId,
            agreedPartnerValue: receiptAgreedPartnerValue,
            suggestedSalePrice: receiptSuggestedSalePrice,
            sourceEntryType: receiptStockEntryType,
            sourceDocumentNumber: receiptSourceDocumentNumber,
            receivedQuantity: requestedBaseQuantity,
            receivedAt: receipt.date,
            traceSource: 'purchase_receipt',
            sourceReceiptId: receipt.id,
            lastMovementAt: createdAt,
            availabilityStatus: 'available',
            location: {
                rack: purchase.destinationWarehouse || defaultRackName,
                shelf: '',
            },
            history: [receiptHistory],
        });
    });
    return {
        ...medicine,
        batches: nextBatches,
        updatedAt: createdAt,
    };
}));
export const buildPurchaseApplyMedicineSnapshot = ({ medicines, purchase, incomingBatches, createdAt, createBatchId = () => createUniqueId('batch'), }: PurchaseApplyMedicineSnapshotInput): Medicine[] => {
    if (!purchaseAffectsInventory(purchase))
        return medicines;
    const receiptQuantityMap = buildPurchaseReceiptQuantityMap(purchase);
    return medicines.map((medicine) => {
        const relatedBatches = incomingBatches.filter((entry) => entry.medicineId === medicine.id);
        if (relatedBatches.length === 0)
            return medicine;
        const addedBatches = relatedBatches.flatMap((entry, index) => {
            const entryBatch = entry.batch as Partial<Batch>;
            const indexedKey = typeof entryBatch.purchaseItemIndex === 'number'
                ? `idx:${entryBatch.purchaseItemIndex}`
                : `batch:${entry.medicineId}:${entry.batch.batchNumber || ''}:${entry.batch.expiryDate || ''}`;
            const traceKey = entryBatch.purchaseLineId ? `line:${entryBatch.purchaseLineId}` : indexedKey;
            const receivedQuantity = receiptQuantityMap.size > 0
                ? Math.max(0, receiptQuantityMap.get(traceKey) ?? receiptQuantityMap.get(indexedKey) ?? 0)
                : Math.max(0, toSafeNumber(entry.batch.quantity));
            if (receivedQuantity <= 0)
                return [];
            return [{
                    ...entry.batch,
                    id: entryBatch.id || createBatchId(index),
                    quantity: receivedQuantity,
                    receivedQuantity,
                    receivedAt: purchase.receivedAt || createdAt,
                    purchaseId: purchase.id,
                    supplierId: entry.batch.supplierId || purchase.supplierId,
                    sourceDocumentNumber: purchase.invoiceNumber || entry.batch.sourceDocumentNumber,
                    traceSource: purchase.receipts?.length ? 'purchase_receipt' : 'purchase',
                    sourceReceiptId: purchase.receipts?.[0]?.id,
                    lastMovementAt: createdAt,
                    history: [{
                            date: createdAt,
                            action: purchase.receipts?.length ? 'purchase_receipt' : 'purchase_apply',
                            details: `Purchase #${purchase.invoiceNumber || purchase.id.slice(-6)} applied`,
                        }],
                } as Batch];
        });
        if (addedBatches.length === 0)
            return medicine;
        return {
            ...medicine,
            batches: [...(medicine.batches || []), ...addedBatches],
            updatedAt: createdAt,
        };
    });
};
export const buildPurchaseRollbackMedicineSnapshot = ({ medicines, purchase, createdAt, }: PurchaseRollbackMedicineSnapshotInput): Medicine[] => {
    if (!purchaseAffectsInventory(purchase))
        return medicines;
    return medicines.map((medicine) => {
        const hasLinkedBatch = (medicine.batches || []).some((batch) => batch.purchaseId === purchase.id);
        return {
            ...medicine,
            batches: (medicine.batches || []).filter((batch) => batch.purchaseId !== purchase.id),
            updatedAt: hasLinkedBatch ? createdAt : medicine.updatedAt,
        };
    });
};
export const buildVendorReturnInventoryMutation = (args: BuildInventoryVendorReturnMutationArgs): InventoryVendorReturnMutation => {
    const mutation = buildInventoryVendorReturnMutation(args);
    const safeQuantity = Math.max(0, Math.trunc(toSafeNumber(args.quantity)));
    const nextQuantity = roundStock(stockQuantity(mutation.previousBatch) - safeQuantity);
    if (nextQuantity < -EPSILON) {
        throw new InventoryTransactionError('Stock movement would make batch stock negative.', 'NEGATIVE_STOCK', {
            medicineId: args.medicineId,
            batchId: args.batchId,
            previousStock: stockQuantity(mutation.previousBatch),
            quantityBaseUnit: -safeQuantity,
            newStock: nextQuantity,
        });
    }
    const updatedBatch: Batch = {
        ...mutation.updatedBatch,
        quantity: Math.max(0, nextQuantity),
    };
    const updatedMedicines = mutation.updatedMedicines.map((medicine) => (medicine.id === args.medicineId
        ? {
            ...medicine,
            batches: (medicine.batches || []).map((batch) => (batch.id === args.batchId ? updatedBatch : batch)),
        }
        : medicine));
    return {
        ...mutation,
        updatedBatch,
        updatedMedicines,
    };
};
export const buildInvoiceSaleMovementDrafts = (invoice: Invoice): StockMovementDraft[] => ((invoice.items || []).map((item, index) => ({
    medicineId: item.medicineId,
    batchId: item.batchId,
    type: 'sale',
    quantityBaseUnit: -Math.abs(getInvoiceItemBaseQuantity(item)),
    referenceType: 'invoice',
    referenceId: invoice.id,
    idempotencyKey: `invoice-sale:${invoice.id}:${index}`,
    metadata: {
        invoiceNumber: invoice.invoiceNumber,
        itemIndex: index,
        saleQuantity: item.quantity,
        saleUnitName: item.saleUnitName,
    },
    history: {
        action: 'sale',
        details: `Invoice #${invoice.invoiceNumber || invoice.id.slice(-6)}`,
    },
})));
export const buildSalesReturnMovementDrafts = (salesReturn: SalesReturn, invoice: Invoice): StockMovementDraft[] => ((salesReturn.items || []).map((item, index) => ({
    medicineId: item.medicineId,
    batchId: item.batchId,
    type: 'sale_return',
    quantityBaseUnit: Math.abs(toSafeNumber(item.baseQuantity, item.quantity)),
    referenceType: 'invoice_return',
    referenceId: salesReturn.id,
    idempotencyKey: `invoice-return:${salesReturn.id}:${index}`,
    metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        itemIndex: salesReturn.sourceItemIndex ?? index,
        returnQuantity: item.quantity,
        reason: salesReturn.reason,
    },
    history: {
        action: 'sale_return',
        details: `Return for invoice #${invoice.invoiceNumber || invoice.id.slice(-6)}`,
    },
})));
export const buildInvoiceDeleteMovementDrafts = (invoice: Invoice): StockMovementDraft[] => {
    const drafts: StockMovementDraft[] = [];
    getInvoiceNetStockRollback(invoice).forEach((batchMap, medicineId) => {
        batchMap.forEach((quantity, batchId) => {
            if (quantity <= 0)
                return;
            drafts.push({
                medicineId,
                batchId,
                type: 'invoice_delete_reversal',
                quantityBaseUnit: Math.abs(quantity),
                referenceType: 'invoice_delete',
                referenceId: invoice.id,
                idempotencyKey: `invoice-delete:${invoice.id}:${medicineId}:${batchId}`,
                metadata: {
                    invoiceNumber: invoice.invoiceNumber,
                },
                history: {
                    action: 'invoice_delete_reversal',
                    details: `Deleted invoice #${invoice.invoiceNumber || invoice.id.slice(-6)}`,
                },
            });
        });
    });
    return drafts;
};
const collectInvoiceNetSoldByBatch = (invoice: Invoice): Map<string, {
    medicineId: string;
    batchId: string;
    quantity: number;
}> => {
    const collected = new Map<string, {
        medicineId: string;
        batchId: string;
        quantity: number;
    }>();
    getInvoiceNetStockRollback(invoice).forEach((batchMap, medicineId) => {
        batchMap.forEach((quantity, batchId) => {
            collected.set(`${medicineId}\u0000${batchId}`, {
                medicineId,
                batchId,
                quantity: Math.max(0, roundStock(quantity)),
            });
        });
    });
    return collected;
};
const buildInvoiceEditIdempotencyScope = (previousInvoice: Invoice, nextInvoice: Invoice): string => {
    const itemSignature = (invoice: Invoice) => (invoice.items || [])
        .map((item) => [
        item.medicineId,
        item.batchId,
        getInvoiceItemBaseQuantity(item),
    ].join(':'))
        .join('|');
    return [
        nextInvoice.id,
        previousInvoice.updatedAt || previousInvoice.date || 'previous',
        nextInvoice.updatedAt || nextInvoice.date || 'next',
        itemSignature(previousInvoice),
        itemSignature(nextInvoice),
    ].join(':');
};
export const buildInvoiceEditMovementDrafts = (previousInvoice: Invoice, nextInvoice: Invoice, options: {
    idempotencyScope?: string;
} = {}): StockMovementDraft[] => {
    const previousNetSold = collectInvoiceNetSoldByBatch(previousInvoice);
    const nextNetSold = collectInvoiceNetSoldByBatch(nextInvoice);
    const keys = new Set([...previousNetSold.keys(), ...nextNetSold.keys()]);
    const idempotencyScope = options.idempotencyScope || buildInvoiceEditIdempotencyScope(previousInvoice, nextInvoice);
    const drafts: StockMovementDraft[] = [];
    keys.forEach((key) => {
        const previous = previousNetSold.get(key);
        const next = nextNetSold.get(key);
        const medicineId = next?.medicineId || previous?.medicineId;
        const batchId = next?.batchId || previous?.batchId;
        if (!medicineId || !batchId)
            return;
        const previousQuantity = previous?.quantity || 0;
        const nextQuantity = next?.quantity || 0;
        const delta = roundStock(previousQuantity - nextQuantity);
        if (Math.abs(delta) <= EPSILON)
            return;
        drafts.push({
            medicineId,
            batchId,
            type: 'invoice_edit_delta',
            quantityBaseUnit: delta,
            referenceType: 'invoice',
            referenceId: nextInvoice.id,
            idempotencyKey: `invoice-edit:${idempotencyScope}:${medicineId}:${batchId}`,
            metadata: {
                previousInvoiceNumber: previousInvoice.invoiceNumber,
                nextInvoiceNumber: nextInvoice.invoiceNumber,
                previousNetSold: previousQuantity,
                nextNetSold: nextQuantity,
            },
            history: {
                action: 'invoice_edit_delta',
                details: `Edited invoice #${nextInvoice.invoiceNumber || nextInvoice.id.slice(-6)}`,
            },
        });
    });
    return drafts;
};
export const findConsumedPurchaseBatches = (purchase: Purchase, medicines: Medicine[]): Array<{
    medicineId: string;
    batchId: string;
    batchNumber?: string;
    receivedQuantity: number;
    currentQuantity: number;
}> => {
    const consumed: Array<{
        medicineId: string;
        batchId: string;
        batchNumber?: string;
        receivedQuantity: number;
        currentQuantity: number;
    }> = [];
    medicines.forEach((medicine) => {
        (medicine.batches || []).forEach((batch) => {
            if (batch.purchaseId !== purchase.id)
                return;
            const receivedQuantity = Math.max(0, toSafeNumber(batch.receivedQuantity, batch.quantity));
            const currentQuantity = Math.max(0, toSafeNumber(batch.quantity));
            if (receivedQuantity - currentQuantity > EPSILON) {
                consumed.push({
                    medicineId: medicine.id,
                    batchId: batch.id,
                    batchNumber: batch.batchNumber,
                    receivedQuantity,
                    currentQuantity,
                });
            }
        });
    });
    return consumed;
};
