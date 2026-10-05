import type { InvoiceItem, PaymentStatus } from '../types';
export type InvoicePaymentType = 'cash' | 'card' | 'credit' | 'partial' | 'mixed';
const toFiniteNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const toSafeNonNegativeNumber = (value: unknown) => Math.max(0, toFiniteNumber(value, 0));
export interface ResolvedInvoicePayment {
    amountPaid: number;
    remainingAmount: number;
    paymentStatus: PaymentStatus;
    paymentBreakdown: {
        cash: number;
        card: number;
        credit: number;
        method: InvoicePaymentType;
    };
}
export interface ResolveInvoicePaymentOptions {
    cashAmountInput?: number;
    cardAmountInput?: number;
}
export const resolveInvoicePayment = (finalAmount: number, paymentType: InvoicePaymentType, amountPaidInput = 0, options: ResolveInvoicePaymentOptions = {}): ResolvedInvoicePayment => {
    const safeFinalAmount = toSafeNonNegativeNumber(finalAmount);
    let cash = 0;
    let card = 0;
    if (paymentType === 'cash') {
        cash = safeFinalAmount;
    }
    else if (paymentType === 'card') {
        card = safeFinalAmount;
    }
    else if (paymentType === 'credit') {
        cash = 0;
        card = 0;
    }
    else if (paymentType === 'mixed') {
        cash = toSafeNonNegativeNumber(options.cashAmountInput);
        card = toSafeNonNegativeNumber(options.cardAmountInput);
    }
    else {
        cash = toSafeNonNegativeNumber(amountPaidInput);
    }
    const rawPaid = cash + card;
    const amountPaid = Math.min(rawPaid, safeFinalAmount);
    if (rawPaid > safeFinalAmount && rawPaid > 0) {
        const scale = safeFinalAmount / rawPaid;
        cash *= scale;
        card *= scale;
    }
    const remainingAmount = Math.max(0, safeFinalAmount - amountPaid);
    let paymentStatus: PaymentStatus;
    if (safeFinalAmount <= 0) {
        paymentStatus = 'paid';
    }
    else if (remainingAmount > 0 && amountPaid > 0) {
        paymentStatus = 'partial';
    }
    else if (remainingAmount > 0) {
        paymentStatus = 'credit';
    }
    else if (paymentType === 'card') {
        paymentStatus = 'card';
    }
    else if (paymentType === 'mixed') {
        paymentStatus = cash > 0 && card > 0 ? 'mixed' : card > 0 ? 'card' : 'cash';
    }
    else if (paymentType === 'partial') {
        paymentStatus = 'paid';
    }
    else {
        paymentStatus = paymentType;
    }
    return {
        amountPaid,
        remainingAmount,
        paymentStatus,
        paymentBreakdown: {
            cash,
            card,
            credit: remainingAmount,
            method: paymentType,
        },
    };
};
export const getInvalidInvoiceFinancialLineIndex = (items: InvoiceItem[]) => {
    if (!Array.isArray(items))
        return 0;
    return items.findIndex((item) => (toSafeNonNegativeNumber(item?.quantity) <= 0 ||
        toSafeNonNegativeNumber(item?.price) <= 0));
};
