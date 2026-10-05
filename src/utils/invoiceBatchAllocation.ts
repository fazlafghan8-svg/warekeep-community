import type { Batch, Currency, InvoiceItem, Medicine } from '../types';
import { calculateInvoiceLineDiscount, calculateInvoiceLineTotal } from './calculations';
import { getFefoSortedBatches } from './batchUtils';
import { getInvoiceItemBaseQuantity, roundBaseQuantity } from './unitConversion';
const EPSILON = 1e-9;
const getCurrencyDecimals = (currency?: Currency) => (currency === 'IRR' ? 0 : 2);
const toMoneyMinor = (value: number, currency?: Currency) => {
    const factor = 10 ** getCurrencyDecimals(currency);
    return Math.round((Number.isFinite(value) ? Math.max(0, value) : 0) * factor + Number.EPSILON);
};
const fromMoneyMinor = (value: number, currency?: Currency) => {
    const factor = 10 ** getCurrencyDecimals(currency);
    return value / factor;
};
const toSafePositive = (value: unknown, fallback = 1) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const getReservedBaseQuantityByBatch = (medicineId: string, existingItems: InvoiceItem[]): Map<string, number> => {
    const reserved = new Map<string, number>();
    (Array.isArray(existingItems) ? existingItems : []).forEach((item) => {
        if (item.medicineId !== medicineId || !item.batchId)
            return;
        reserved.set(item.batchId, roundBaseQuantity((reserved.get(item.batchId) || 0) + getInvoiceItemBaseQuantity(item)));
    });
    return reserved;
};
export interface BatchSaleAllocation {
    batch: Batch;
    quantity: number;
    baseQuantity: number;
    discountAmount: number;
}
export type BatchSaleAllocationResult = {
    ok: true;
    allocations: BatchSaleAllocation[];
    requestedBaseQuantity: number;
    availableBaseQuantity: number;
} | {
    ok: false;
    allocations: BatchSaleAllocation[];
    requestedBaseQuantity: number;
    availableBaseQuantity: number;
    shortageBaseQuantity: number;
};
export const createInvoiceDisplayGroupId = (medicineId: string) => (`sale-${medicineId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
export const allocateSaleAcrossBatches = ({ medicine, existingItems, requestedQuantity, requestedBaseQuantity, saleUnitConversionFactor = 1, price, discountAmount = 0, currency, }: {
    medicine: Medicine;
    existingItems: InvoiceItem[];
    requestedQuantity: number;
    requestedBaseQuantity: number;
    saleUnitConversionFactor?: number;
    price: number;
    discountAmount?: number;
    currency?: Currency;
}): BatchSaleAllocationResult => {
    const safeRequestedQuantity = roundBaseQuantity(requestedQuantity);
    const safeRequestedBaseQuantity = roundBaseQuantity(requestedBaseQuantity);
    const conversionFactor = toSafePositive(saleUnitConversionFactor);
    const reservedByBatch = getReservedBaseQuantityByBatch(medicine.id, existingItems);
    const sellableBatches = getFefoSortedBatches(medicine.batches || []);
    let availableBaseQuantity = 0;
    const availability = sellableBatches.map((batch) => {
        const reserved = reservedByBatch.get(batch.id) || 0;
        const available = roundBaseQuantity(Math.max(0, (Number(batch.quantity) || 0) - reserved));
        availableBaseQuantity = roundBaseQuantity(availableBaseQuantity + available);
        return { batch, available };
    });
    let remainingBaseQuantity = safeRequestedBaseQuantity;
    let remainingSaleQuantity = safeRequestedQuantity;
    const allocations: BatchSaleAllocation[] = [];
    for (const entry of availability) {
        if (remainingBaseQuantity <= EPSILON)
            break;
        if (entry.available <= EPSILON)
            continue;
        const baseQuantity = roundBaseQuantity(Math.min(entry.available, remainingBaseQuantity));
        const isLastNeeded = roundBaseQuantity(remainingBaseQuantity - baseQuantity) <= EPSILON;
        const quantity = isLastNeeded
            ? roundBaseQuantity(remainingSaleQuantity)
            : roundBaseQuantity(baseQuantity / conversionFactor);
        allocations.push({
            batch: entry.batch,
            quantity,
            baseQuantity,
            discountAmount: 0,
        });
        remainingBaseQuantity = roundBaseQuantity(remainingBaseQuantity - baseQuantity);
        remainingSaleQuantity = roundBaseQuantity(remainingSaleQuantity - quantity);
    }
    const totalDiscountMinor = toMoneyMinor(discountAmount, currency);
    if (totalDiscountMinor > 0 && allocations.length > 0) {
        const grossWeights = allocations.map((allocation) => Math.max(0, allocation.quantity * Math.max(0, price)));
        const totalGrossWeight = grossWeights.reduce((sum, value) => sum + value, 0);
        let allocatedDiscountMinor = 0;
        allocations.forEach((allocation, index) => {
            const isLast = index === allocations.length - 1;
            const discountMinor = isLast
                ? Math.max(0, totalDiscountMinor - allocatedDiscountMinor)
                : Math.min(totalDiscountMinor - allocatedDiscountMinor, Math.round(totalDiscountMinor * ((grossWeights[index] || 0) / (totalGrossWeight || allocations.length))));
            allocatedDiscountMinor += discountMinor;
            allocation.discountAmount = fromMoneyMinor(discountMinor, currency);
        });
    }
    if (remainingBaseQuantity > EPSILON) {
        return {
            ok: false,
            allocations,
            requestedBaseQuantity: safeRequestedBaseQuantity,
            availableBaseQuantity,
            shortageBaseQuantity: roundBaseQuantity(remainingBaseQuantity),
        };
    }
    return {
        ok: true,
        allocations,
        requestedBaseQuantity: safeRequestedBaseQuantity,
        availableBaseQuantity,
    };
};
export interface InvoiceDisplayLine {
    key: string;
    item: InvoiceItem;
    sourceItems: InvoiceItem[];
    sourceIndexes: number[];
    isGrouped: boolean;
}
export const getInvoiceDisplayLines = (items: InvoiceItem[] = []): InvoiceDisplayLine[] => {
    const groups = new Map<string, InvoiceDisplayLine>();
    items.forEach((item, index) => {
        const key = item.displayGroupId || `line-${index}`;
        const existing = groups.get(key);
        if (!existing) {
            groups.set(key, {
                key,
                item: { ...item },
                sourceItems: [item],
                sourceIndexes: [index],
                isGrouped: false,
            });
            return;
        }
        existing.sourceItems.push(item);
        existing.sourceIndexes.push(index);
        existing.isGrouped = true;
    });
    return Array.from(groups.values()).map((line) => {
        if (line.sourceItems.length <= 1)
            return line;
        const first = line.sourceItems[0];
        const sameDiscountPercent = line.sourceItems.every((item) => (item.discountPercent || 0) === (first.discountPercent || 0));
        return {
            ...line,
            item: {
                ...first,
                quantity: roundBaseQuantity(line.sourceItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)),
                baseQuantity: roundBaseQuantity(line.sourceItems.reduce((sum, item) => sum + getInvoiceItemBaseQuantity(item), 0)),
                discountAmount: line.sourceItems.reduce((sum, item) => sum + (Number(item.discountAmount) || 0), 0),
                discountPercent: sameDiscountPercent ? first.discountPercent : undefined,
                isAutoBatchSplit: line.sourceItems.some((item) => item.isAutoBatchSplit),
            },
        };
    });
};
export const getInvoiceDisplayLineDiscount = (line: InvoiceDisplayLine, currency?: Currency): number => (line.sourceItems.reduce((sum, item) => sum + calculateInvoiceLineDiscount(item, currency), 0));
export const getInvoiceDisplayLineTotal = (line: InvoiceDisplayLine, currency?: Currency): number => (line.sourceItems.reduce((sum, item) => sum + calculateInvoiceLineTotal(item, currency), 0));
