import type { Currency, Invoice, InvoiceItem, SalesReturn, SalesReturnItem } from '@/types';
import { getInvoiceItemBaseQuantity, roundBaseQuantity } from './unitConversion';
const MONEY_DECIMALS: Record<string, number> = {
    AFN: 0,
    IRR: 0,
};
const EPSILON = 1e-9;
const toSafeNumber = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const toNonNegativeNumber = (value: unknown, fallback = 0): number => Math.max(0, toSafeNumber(value, fallback));
const roundMoney = (value: number, currency?: Currency): number => {
    const decimals = MONEY_DECIMALS[currency || ''] ?? 2;
    const factor = 10 ** decimals;
    return Math.round(toSafeNumber(value) * factor + Number.EPSILON) / factor;
};
const isActiveReturn = (entry: SalesReturn | undefined | null): entry is SalesReturn => !!entry && !entry.isDeleted && !entry.isVoided;
const itemMatchesSource = (returnEntry: SalesReturn, returnItem: SalesReturnItem, sourceItem: InvoiceItem, itemIndex: number): boolean => {
    const sourceLineId = returnEntry.sourceLineId || returnItem.lineId;
    if (sourceLineId)
        return sourceLineId === sourceItem.lineId;
    if (returnEntry.sourceItemIndex !== undefined && returnEntry.sourceItemIndex !== itemIndex)
        return false;
    return returnItem.medicineId === sourceItem.medicineId && returnItem.batchId === sourceItem.batchId;
};
const getReturnItemsForInvoiceItem = (invoice: Invoice, item: InvoiceItem, itemIndex: number): SalesReturnItem[] => ((invoice.returns || [])
    .filter(isActiveReturn)
    .flatMap((returnEntry) => ((returnEntry.items || []).filter((returnItem) => itemMatchesSource(returnEntry, returnItem, item, itemIndex)))));
export const getReturnedBaseQuantityForInvoiceItem = (invoice: Invoice, item: InvoiceItem, itemIndex: number): number => roundBaseQuantity(getReturnItemsForInvoiceItem(invoice, item, itemIndex)
    .reduce((sum, returnItem) => sum + toNonNegativeNumber(getInvoiceItemBaseQuantity(returnItem)), 0));
export const getNetSoldBaseQuantityForInvoiceItem = (invoice: Invoice, item: InvoiceItem, itemIndex: number): number => {
    const soldBaseQuantity = toNonNegativeNumber(getInvoiceItemBaseQuantity(item));
    const returnedBaseQuantity = getReturnedBaseQuantityForInvoiceItem(invoice, item, itemIndex);
    return roundBaseQuantity(Math.max(0, soldBaseQuantity - returnedBaseQuantity));
};
export type StockQuantityByBatch = Map<string, Map<string, number>>;
export const buildStockQuantityKey = (medicineId: string, batchId: string): string => `${medicineId}\u0000${batchId}`;
export const addStockQuantity = (target: StockQuantityByBatch, medicineId: string, batchId: string, quantity: number): void => {
    const safeQuantity = roundBaseQuantity(quantity);
    if (!medicineId || !batchId || safeQuantity <= EPSILON)
        return;
    if (!target.has(medicineId)) {
        target.set(medicineId, new Map<string, number>());
    }
    const batchMap = target.get(medicineId)!;
    batchMap.set(batchId, roundBaseQuantity((batchMap.get(batchId) || 0) + safeQuantity));
};
export const flattenStockQuantityByBatch = (source: StockQuantityByBatch): Record<string, number> => {
    const flattened: Record<string, number> = {};
    source.forEach((batchMap, medicineId) => {
        batchMap.forEach((quantity, batchId) => {
            flattened[buildStockQuantityKey(medicineId, batchId)] = roundBaseQuantity(quantity);
        });
    });
    return flattened;
};
export const getInvoiceNetStockRollback = (invoice: Invoice): StockQuantityByBatch => {
    const rollback = new Map<string, Map<string, number>>();
    (invoice.items || []).forEach((item, itemIndex) => {
        addStockQuantity(rollback, item.medicineId, item.batchId, getNetSoldBaseQuantityForInvoiceItem(invoice, item, itemIndex));
    });
    return rollback;
};
export const getInvoiceReturnedBaseQuantityByBatch = (invoice: Invoice): StockQuantityByBatch => {
    const returned = new Map<string, Map<string, number>>();
    (invoice.items || []).forEach((item, itemIndex) => {
        addStockQuantity(returned, item.medicineId, item.batchId, getReturnedBaseQuantityForInvoiceItem(invoice, item, itemIndex));
    });
    return returned;
};
export const getInvoiceActiveReturnDebtReduction = (invoice: Invoice): number => roundMoney((invoice.returns || [])
    .filter(isActiveReturn)
    .reduce((sum, returnEntry) => sum + toNonNegativeNumber(returnEntry.debtReduction), 0), invoice.currency || 'AFN');
export const getInvoiceActiveReturnCashRefund = (invoice: Invoice): number => roundMoney((invoice.returns || [])
    .filter(isActiveReturn)
    .reduce((sum, returnEntry) => sum + toNonNegativeNumber(returnEntry.amountRefunded), 0), invoice.currency || 'AFN');
export const getInvoiceOutstandingBeforeReturns = (invoice: Invoice): number => {
    const finalAmount = toNonNegativeNumber(invoice.finalAmount);
    const paidAmount = Math.min(toNonNegativeNumber(invoice.amountPaid), finalAmount);
    const fallbackRemaining = Math.max(0, finalAmount - paidAmount);
    const storedRemaining = Number.isFinite(Number(invoice.remainingAmount))
        ? toNonNegativeNumber(invoice.remainingAmount)
        : fallbackRemaining;
    return roundMoney(storedRemaining, invoice.currency || 'AFN');
};
export const getInvoiceCustomerBalanceImpact = (invoice: Invoice): number => roundMoney(Math.max(0, getInvoiceOutstandingBeforeReturns(invoice) - getInvoiceActiveReturnDebtReduction(invoice)), invoice.currency || 'AFN');
