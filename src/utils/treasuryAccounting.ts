import type { Invoice } from '@/types';
const toSafeNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
export const getInvoiceReturnRefundedAmount = (invoice: Invoice): number => ((invoice.returns || [])
    .filter((entry) => !entry.isDeleted)
    .reduce((sum, entry) => sum + Math.max(0, toSafeNumber(entry.amountRefunded)), 0));
export const getInvoiceNetCollectedAmount = (invoice: Invoice): number => (Math.max(0, toSafeNumber(invoice.amountPaid) - getInvoiceReturnRefundedAmount(invoice)));
export const getInvoiceRemainingReceivable = (invoice: Invoice): number => {
    const debtReduction = (invoice.returns || [])
        .filter((entry) => !entry.isDeleted)
        .reduce((sum, entry) => sum + Math.max(0, toSafeNumber(entry.debtReduction)), 0);
    return Math.max(0, toSafeNumber(invoice.remainingAmount) - debtReduction);
};
