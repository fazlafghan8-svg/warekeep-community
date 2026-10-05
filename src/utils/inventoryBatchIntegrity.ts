import type { Batch, Invoice, InvoiceItem, Medicine, SalesReturnItem } from '@/types';
import { getInvoiceItemBaseQuantity, roundBaseQuantity } from './unitConversion';
export const parseInventoryDateMs = (value: unknown): number | null => {
    if (!value)
        return null;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
};
const isReceiptHistoryEntry = (entry: Batch['history'][number]) => {
    const action = String(entry?.action || '').toLowerCase();
    const details = String(entry?.details || '').toLowerCase();
    const text = `${action} ${details}`;
    return (text.includes('receipt')
        || text.includes('received')
        || text.includes('رسید')
        || text.includes('دریافت')
        || text.includes('\u00d8\u00b1\u00d8\u00b3\u00db\u0152\u00d8\u00af')
        || text.includes('\u00d8\u00af\u00d8\u00b1\u00db\u0152\u00d8\u00a7\u00d9\u0081\u00d8\u00aa'));
};
export const getBatchStockStartedAt = (batch: Batch): number | null => {
    const receiptHistoryDates = (batch.history || [])
        .filter(isReceiptHistoryEntry)
        .map((entry) => parseInventoryDateMs(entry.date))
        .filter((value): value is number => value !== null);
    if (receiptHistoryDates.length > 0) {
        return Math.min(...receiptHistoryDates);
    }
    return parseInventoryDateMs(batch.receivedAt);
};
export const hasInvoiceItemBeforeDateForBatch = (batchId: string | undefined, invoices: Invoice[] = [], date: string | number | Date | null | undefined, medicineId?: string): boolean => {
    if (!batchId)
        return false;
    const cutoffMs = typeof date === 'number' ? date : parseInventoryDateMs(date);
    if (cutoffMs === null)
        return false;
    return (invoices || []).some((invoice) => {
        const invoiceDateMs = parseInventoryDateMs(invoice.date);
        if (invoiceDateMs === null || invoiceDateMs >= cutoffMs)
            return false;
        return (invoice.items || []).some((item) => (item.batchId === batchId
            && (!medicineId || item.medicineId === medicineId)));
    });
};
export const hasInvoiceBeforeBatchStockStart = (batch: Batch, invoices: Invoice[] = [], medicineId?: string): boolean => (hasInvoiceItemBeforeDateForBatch(batch.id, invoices, getBatchStockStartedAt(batch), medicineId));
const buildLegacyPreReceiptBatchId = (batchId: string) => `${batchId}-pre-receipt`;
export const isPreReceiptRepairBatch = (batch: Batch): boolean => (batch.traceSource === 'sale_recovery' || batch.id.endsWith('-pre-receipt'));
const shouldRepairBatch = (batch: Batch): boolean => {
    if (!batch.id || batch.traceSource === 'legacy')
        return false;
    if (!batch.purchaseId && batch.traceSource !== 'purchase_receipt')
        return false;
    return getBatchStockStartedAt(batch) !== null;
};
const getReturnItemsForInvoiceItem = (invoice: Invoice, itemIndex: number): SalesReturnItem[] => {
    const sourceItem = invoice.items[itemIndex];
    if (!sourceItem)
        return [];
    return (invoice.returns || [])
        .filter((entry) => !entry.isDeleted)
        .flatMap((entry) => {
        const itemMatches = entry.sourceItemIndex === itemIndex
            || entry.items.some((returnItem) => (returnItem.medicineId === sourceItem.medicineId
                && returnItem.batchId === sourceItem.batchId));
        if (!itemMatches)
            return [];
        return entry.items.filter((returnItem) => (returnItem.medicineId === sourceItem.medicineId
            && returnItem.batchId === sourceItem.batchId));
    });
};
const getRemainingBaseQuantityForInvoiceItem = (invoice: Invoice, item: InvoiceItem, itemIndex: number): number => {
    const soldBaseQuantity = getInvoiceItemBaseQuantity(item);
    const returnedBaseQuantity = getReturnItemsForInvoiceItem(invoice, itemIndex)
        .reduce((sum, returnItem) => sum + getInvoiceItemBaseQuantity(returnItem), 0);
    return roundBaseQuantity(Math.max(0, soldBaseQuantity - returnedBaseQuantity));
};
type BatchRepairPlan = {
    medicineId: string;
    batchId: string;
    legacyBatchId: string;
    stockStartedAt: number;
    activeBaseQuantity: number;
    firstInvoiceDate?: string;
};
export type PreReceiptBatchRepairSummary = {
    repaired: boolean;
    movedInvoiceItemCount: number;
    movedBaseQuantity: number;
    createdLegacyBatchCount: number;
};
export const repairPreReceiptInvoiceBatchLinks = <T extends {
    medicines: Medicine[];
    invoices: Invoice[];
}>(data: T): {
    data: T;
    summary: PreReceiptBatchRepairSummary;
} => {
    const invoices = data.invoices || [];
    const repairPlans = new Map<string, BatchRepairPlan>();
    let movedInvoiceItemCount = 0;
    for (const medicine of data.medicines || []) {
        for (const batch of medicine.batches || []) {
            if (!shouldRepairBatch(batch))
                continue;
            const stockStartedAt = getBatchStockStartedAt(batch);
            if (stockStartedAt === null)
                continue;
            let activeBaseQuantity = 0;
            let firstInvoiceDate: string | undefined;
            let matchingItemCount = 0;
            for (const invoice of invoices) {
                const invoiceDateMs = parseInventoryDateMs(invoice.date);
                if (invoiceDateMs === null || invoiceDateMs >= stockStartedAt)
                    continue;
                (invoice.items || []).forEach((item, itemIndex) => {
                    if (item.medicineId !== medicine.id || item.batchId !== batch.id)
                        return;
                    matchingItemCount += 1;
                    if (!firstInvoiceDate || invoiceDateMs < (parseInventoryDateMs(firstInvoiceDate) ?? Number.MAX_SAFE_INTEGER)) {
                        firstInvoiceDate = invoice.date;
                    }
                    if (!invoice.isDeleted) {
                        activeBaseQuantity += getRemainingBaseQuantityForInvoiceItem(invoice, item, itemIndex);
                    }
                });
            }
            if (matchingItemCount <= 0)
                continue;
            const plan: BatchRepairPlan = {
                medicineId: medicine.id,
                batchId: batch.id,
                legacyBatchId: buildLegacyPreReceiptBatchId(batch.id),
                stockStartedAt,
                activeBaseQuantity: roundBaseQuantity(activeBaseQuantity),
                firstInvoiceDate
            };
            repairPlans.set(batch.id, plan);
            movedInvoiceItemCount += matchingItemCount;
        }
    }
    if (repairPlans.size === 0) {
        return {
            data,
            summary: {
                repaired: false,
                movedInvoiceItemCount: 0,
                movedBaseQuantity: 0,
                createdLegacyBatchCount: 0
            }
        };
    }
    let createdLegacyBatchCount = 0;
    const medicines = (data.medicines || []).map((medicine) => {
        const medicinePlans = Array.from(repairPlans.values()).filter((plan) => plan.medicineId === medicine.id);
        if (medicinePlans.length === 0)
            return medicine;
        let nextBatches = medicine.batches || [];
        for (const plan of medicinePlans) {
            const sourceBatch = nextBatches.find((batch) => batch.id === plan.batchId);
            if (!sourceBatch)
                continue;
            const existingLegacyBatch = nextBatches.find((batch) => batch.id === plan.legacyBatchId);
            const movedHistory = (sourceBatch.history || []).filter((entry) => {
                const entryMs = parseInventoryDateMs(entry.date);
                return entryMs !== null && entryMs < plan.stockStartedAt && !isReceiptHistoryEntry(entry);
            });
            nextBatches = nextBatches.map((batch) => {
                if (batch.id !== sourceBatch.id)
                    return batch;
                if (movedHistory.length === 0)
                    return batch;
                return {
                    ...batch,
                    history: (batch.history || []).filter((entry) => !movedHistory.includes(entry))
                };
            });
            if (existingLegacyBatch) {
                nextBatches = nextBatches.map((batch) => (batch.id === plan.legacyBatchId
                    ? {
                        ...batch,
                        receivedQuantity: Math.max(batch.receivedQuantity || 0, plan.activeBaseQuantity),
                        history: batch.history || []
                    }
                    : batch));
                continue;
            }
            createdLegacyBatchCount += 1;
            nextBatches = [
                ...nextBatches,
                {
                    id: plan.legacyBatchId,
                    batchNumber: `${sourceBatch.batchNumber || 'BATCH'}-PRE`,
                    quantity: 0,
                    expiryDate: sourceBatch.expiryDate || '',
                    purchasePrice: sourceBatch.purchasePrice || 0,
                    supplierId: sourceBatch.supplierId,
                    ownershipType: sourceBatch.ownershipType,
                    ownerPartnerId: sourceBatch.ownerPartnerId,
                    sharedOwnerPartnerIds: sourceBatch.sharedOwnerPartnerIds,
                    agreedPartnerValue: sourceBatch.agreedPartnerValue,
                    suggestedSalePrice: sourceBatch.suggestedSalePrice,
                    sourceEntryType: sourceBatch.sourceEntryType,
                    sourceDocumentNumber: sourceBatch.sourceDocumentNumber,
                    receivedQuantity: plan.activeBaseQuantity,
                    receivedAt: plan.firstInvoiceDate || new Date(plan.stockStartedAt - 1).toISOString(),
                    traceSource: 'sale_recovery',
                    lastMovementAt: plan.firstInvoiceDate || sourceBatch.lastMovementAt,
                    availabilityStatus: 'available',
                    location: sourceBatch.location,
                    history: [
                        ...movedHistory,
                        {
                            date: plan.firstInvoiceDate || new Date(plan.stockStartedAt - 1).toISOString(),
                            action: 'pre_receipt_batch_repair',
                            details: `Moved sales before receipt away from batch ${sourceBatch.id}`
                        }
                    ]
                }
            ];
        }
        return {
            ...medicine,
            batches: nextBatches
        };
    });
    const invoicesRepaired = invoices.map((invoice) => {
        const invoiceDateMs = parseInventoryDateMs(invoice.date);
        if (invoiceDateMs === null)
            return invoice;
        let changed = false;
        const items = (invoice.items || []).map((item) => {
            const plan = repairPlans.get(item.batchId);
            if (!plan || plan.medicineId !== item.medicineId || invoiceDateMs >= plan.stockStartedAt)
                return item;
            changed = true;
            return { ...item, batchId: plan.legacyBatchId };
        });
        const returns = (invoice.returns || []).map((entry) => {
            let returnChanged = false;
            const returnItems = (entry.items || []).map((item) => {
                const plan = repairPlans.get(item.batchId);
                if (!plan || plan.medicineId !== item.medicineId || invoiceDateMs >= plan.stockStartedAt)
                    return item;
                returnChanged = true;
                return { ...item, batchId: plan.legacyBatchId };
            });
            if (!returnChanged)
                return entry;
            changed = true;
            return { ...entry, items: returnItems };
        });
        return changed ? { ...invoice, items, returns } : invoice;
    });
    const movedBaseQuantity = roundBaseQuantity(Array.from(repairPlans.values()).reduce((sum, plan) => sum + plan.activeBaseQuantity, 0));
    return {
        data: {
            ...data,
            medicines,
            invoices: invoicesRepaired
        },
        summary: {
            repaired: true,
            movedInvoiceItemCount,
            movedBaseQuantity,
            createdLegacyBatchCount
        }
    };
};
