import type { Currency, Invoice, SalesReturn } from '@/types';
import { calculateInvoiceLineDiscount, calculateInvoiceLineGrossTotal, calculateInvoiceLineTotal } from './calculations';
import { getInvoiceItemBaseQuantity, roundBaseQuantity } from './unitConversion';
const EPSILON = 1e-9;
const currencyDecimals = (currency?: Currency) => (currency === 'AFN' || currency === 'IRR' ? 0 : 2);
const roundMoney = (value: number, currency?: Currency): number => {
    const factor = 10 ** currencyDecimals(currency);
    return Math.round((Number.isFinite(value) ? value : 0) * factor + Number.EPSILON) / factor;
};
const toSafeNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export interface BuildSalesReturnInput {
    invoice: Invoice;
    itemIndex: number;
    quantity: number;
    amountRefunded?: number;
    debtReduction?: number;
    reason?: string;
    date?: string;
    id?: string;
    paymentMethod?: SalesReturn['paymentMethod'];
}
export interface SalesReturnPreview {
    sourceLineId?: string;
    sourceItemIndex: number;
    remainingQuantity: number;
    returnQuantity: number;
    lineGrossRefund: number;
    lineDiscountRefund: number;
    invoiceDiscountRefund: number;
    subtotal: number;
    taxRefund: number;
    totalRefund: number;
    maxAmountRefunded: number;
    maxDebtReduction: number;
}
export const getReturnedQuantityForInvoiceItem = (invoice: Invoice, itemIndex: number): number => {
    const sourceItem = invoice.items[itemIndex];
    if (!sourceItem)
        return 0;
    return (invoice.returns || [])
        .filter((entry) => !entry.isDeleted && !entry.isVoided)
        .reduce((sum, entry) => {
        const sourceLineId = entry.sourceLineId || entry.items.find((returnItem) => returnItem.lineId)?.lineId;
        const itemMatches = sourceLineId
            ? sourceLineId === sourceItem.lineId
            : entry.sourceItemIndex === itemIndex || entry.items.some((returnItem) => (returnItem.medicineId === sourceItem.medicineId
                && returnItem.batchId === sourceItem.batchId));
        if (!itemMatches)
            return sum;
        return sum + entry.items.reduce((itemSum, returnItem) => {
            if (sourceLineId) {
                if ((returnItem.lineId || sourceLineId) !== sourceItem.lineId)
                    return itemSum;
            }
            else if (returnItem.medicineId !== sourceItem.medicineId || returnItem.batchId !== sourceItem.batchId) {
                return itemSum;
            }
            return itemSum + Math.max(0, toSafeNumber(returnItem.quantity));
        }, 0);
    }, 0);
};
export const previewSalesReturn = (invoice: Invoice, itemIndex: number, quantity: number): SalesReturnPreview => {
    const sourceItem = invoice.items[itemIndex];
    if (!sourceItem) {
        throw new Error('RETURN_ITEM_NOT_FOUND');
    }
    const currency = invoice.currency || 'AFN';
    const soldQuantity = Math.max(0, toSafeNumber(sourceItem.quantity));
    const requestedQuantity = Math.max(0, toSafeNumber(quantity));
    const alreadyReturned = getReturnedQuantityForInvoiceItem(invoice, itemIndex);
    const remainingQuantity = Math.max(0, soldQuantity - alreadyReturned);
    if (requestedQuantity <= 0) {
        throw new Error('RETURN_QUANTITY_MUST_BE_POSITIVE');
    }
    if (requestedQuantity - remainingQuantity > EPSILON) {
        throw new Error('RETURN_QUANTITY_EXCEEDS_REMAINING');
    }
    const ratio = soldQuantity > 0 ? requestedQuantity / soldQuantity : 0;
    const fullLineGross = calculateInvoiceLineGrossTotal(sourceItem, currency);
    const fullLineDiscount = calculateInvoiceLineDiscount(sourceItem, currency);
    const fullLineNet = calculateInvoiceLineTotal(sourceItem, currency);
    const invoiceLineNetTotal = invoice.items.reduce((sum, item) => sum + calculateInvoiceLineTotal(item, currency), 0);
    const lineGrossRefund = roundMoney(fullLineGross * ratio, currency);
    const lineDiscountRefund = roundMoney(fullLineDiscount * ratio, currency);
    const returnedLineNet = roundMoney(fullLineNet * ratio, currency);
    const invoiceDiscountRefund = roundMoney(invoiceLineNetTotal > 0
        ? clamp(toSafeNumber(invoice.discount) * (returnedLineNet / invoiceLineNetTotal), 0, returnedLineNet)
        : 0, currency);
    const subtotal = roundMoney(Math.max(0, returnedLineNet - invoiceDiscountRefund), currency);
    const taxableBase = Math.max(0, invoiceLineNetTotal - toSafeNumber(invoice.discount));
    const taxRate = toSafeNumber(invoice.taxRate, NaN);
    const taxRefund = roundMoney(Number.isFinite(taxRate)
        ? (subtotal * Math.max(0, taxRate)) / 100
        : (taxableBase > 0 ? toSafeNumber(invoice.tax) * (subtotal / taxableBase) : 0), currency);
    const totalRefund = roundMoney(subtotal + taxRefund, currency);
    const activeReturns = (invoice.returns || []).filter((entry) => !entry.isDeleted && !entry.isVoided);
    const previousRefunded = activeReturns.reduce((sum, entry) => sum + Math.max(0, toSafeNumber(entry.amountRefunded)), 0);
    const previousDebtReduction = activeReturns.reduce((sum, entry) => sum + Math.max(0, toSafeNumber(entry.debtReduction)), 0);
    return {
        sourceLineId: sourceItem.lineId,
        sourceItemIndex: itemIndex,
        remainingQuantity,
        returnQuantity: requestedQuantity,
        lineGrossRefund,
        lineDiscountRefund,
        invoiceDiscountRefund,
        subtotal,
        taxRefund,
        totalRefund,
        maxAmountRefunded: Math.max(0, toSafeNumber(invoice.amountPaid) - previousRefunded),
        maxDebtReduction: Math.max(0, toSafeNumber(invoice.remainingAmount) - previousDebtReduction)
    };
};
export const buildSalesReturn = (input: BuildSalesReturnInput): SalesReturn => {
    const preview = previewSalesReturn(input.invoice, input.itemIndex, input.quantity);
    const currency = input.invoice.currency || 'AFN';
    const sourceItem = input.invoice.items[input.itemIndex];
    const sourceBaseQuantity = getInvoiceItemBaseQuantity(sourceItem);
    const returnBaseQuantity = sourceBaseQuantity > 0
        ? roundBaseQuantity(sourceBaseQuantity * (preview.returnQuantity / Math.max(1, toSafeNumber(sourceItem.quantity))))
        : preview.returnQuantity;
    const requestedRefund = input.amountRefunded === undefined
        ? undefined
        : roundMoney(Math.max(0, toSafeNumber(input.amountRefunded)), currency);
    const requestedDebtReduction = input.debtReduction === undefined
        ? undefined
        : roundMoney(Math.max(0, toSafeNumber(input.debtReduction)), currency);
    let amountRefunded = requestedRefund ?? 0;
    let debtReduction = requestedDebtReduction ?? 0;
    if (requestedRefund === undefined && requestedDebtReduction === undefined) {
        debtReduction = Math.min(preview.maxDebtReduction, preview.totalRefund);
        amountRefunded = Math.min(preview.maxAmountRefunded, roundMoney(preview.totalRefund - debtReduction, currency));
    }
    else if (requestedRefund === undefined) {
        amountRefunded = Math.min(preview.maxAmountRefunded, roundMoney(preview.totalRefund - debtReduction, currency));
    }
    else if (requestedDebtReduction === undefined) {
        debtReduction = Math.min(preview.maxDebtReduction, roundMoney(preview.totalRefund - amountRefunded, currency));
    }
    amountRefunded = roundMoney(amountRefunded, currency);
    debtReduction = roundMoney(debtReduction, currency);
    if (amountRefunded - preview.maxAmountRefunded > EPSILON) {
        throw new Error('RETURN_REFUND_EXCEEDS_PAID_AMOUNT');
    }
    if (debtReduction - preview.maxDebtReduction > EPSILON) {
        throw new Error('RETURN_DEBT_REDUCTION_EXCEEDS_REMAINING_DEBT');
    }
    if (Math.abs(roundMoney(amountRefunded + debtReduction - preview.totalRefund, currency)) > EPSILON) {
        throw new Error('RETURN_SETTLEMENT_MUST_MATCH_TOTAL_REFUND');
    }
    return {
        id: input.id || `ret-${Date.now()}`,
        invoiceId: input.invoice.id,
        customerId: input.invoice.customerId,
        date: input.date || new Date().toISOString(),
        items: [{
                lineId: sourceItem.lineId,
                medicineId: sourceItem.medicineId,
                batchId: sourceItem.batchId,
                quantity: preview.returnQuantity,
                baseQuantity: returnBaseQuantity,
                saleUnitName: sourceItem.saleUnitName,
                saleUnitLabel: sourceItem.saleUnitLabel,
                saleUnitConversionFactor: sourceItem.saleUnitConversionFactor,
                baseUnit: sourceItem.baseUnit,
                price: sourceItem.price,
                costPrice: sourceItem.costPrice
            }],
        subtotal: preview.subtotal,
        taxRefund: preview.taxRefund,
        discountRefund: roundMoney(preview.lineDiscountRefund + preview.invoiceDiscountRefund, currency),
        totalRefund: preview.totalRefund,
        amountRefunded,
        debtReduction,
        sourceLineId: sourceItem.lineId,
        sourceItemIndex: input.itemIndex,
        lineDiscountRefund: preview.lineDiscountRefund,
        invoiceDiscountRefund: preview.invoiceDiscountRefund,
        paymentMethod: input.paymentMethod,
        reason: input.reason?.trim() || undefined,
        updatedAt: input.date || new Date().toISOString()
    };
};
