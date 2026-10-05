import { describe, expect, it } from 'vitest';
import type { Invoice } from '@/types';
import { getInvoiceNetCollectedAmount, getInvoiceRemainingReceivable, getInvoiceReturnRefundedAmount } from '../treasuryAccounting';

const invoice: Invoice = {
  id: 'inv-1',
  invoiceNumber: 1001,
  customerId: 'cust-1',
  items: [{ medicineId: 'med-1', batchId: 'batch-1', quantity: 3, price: 100, costPrice: 60 }],
  total: 300,
  discount: 30,
  tax: 27,
  finalAmount: 297,
  currency: 'AFN',
  date: '2026-05-25T08:00:00.000Z',
  paymentStatus: 'partial',
  amountPaid: 150,
  remainingAmount: 147,
  returns: [{
    id: 'ret-1',
    invoiceId: 'inv-1',
    customerId: 'cust-1',
    date: '2026-05-25T09:00:00.000Z',
    items: [{ medicineId: 'med-1', batchId: 'batch-1', quantity: 1, price: 100, costPrice: 60 }],
    subtotal: 90,
    taxRefund: 9,
    discountRefund: 10,
    totalRefund: 99,
    amountRefunded: 50,
    debtReduction: 49,
  }],
};

describe('treasury accounting helpers', () => {
  it('nets sales return refunds out of collected cash and receivable', () => {
    expect(getInvoiceReturnRefundedAmount(invoice)).toBe(50);
    expect(getInvoiceNetCollectedAmount(invoice)).toBe(100);
    expect(getInvoiceRemainingReceivable(invoice)).toBe(98);
  });
});
