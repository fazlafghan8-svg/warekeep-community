import { describe, expect, it } from 'vitest';
import type { Purchase } from '../../types';
import { buildPurchasePaymentAllocationPlan, normalizePurchaseRecord } from '../purchaseUtils';

describe('purchase payment allocation plan', () => {
  it('prioritizes the selected purchase, then other open invoices, then supplier prepayment', () => {
    const targetPurchase = normalizePurchaseRecord({
      id: 'purchase-target',
      supplierId: 'sup-1',
      invoiceNumber: 'INV-TARGET',
      date: '2026-04-05',
      dueDate: '2026-04-20',
      totalAmount: 1000,
      paidAmount: 0,
      remainingAmount: 1000,
      workflowStatus: 'received',
      status: 'credit',
      items: [{ medicineId: 'med-1', batchNumber: 'B-1', expiryDate: '2027-01-01', quantity: 10, purchasePrice: 100 }],
    } as Purchase);

    const olderPurchase = normalizePurchaseRecord({
      id: 'purchase-older',
      supplierId: 'sup-1',
      invoiceNumber: 'INV-OLDER',
      date: '2026-04-01',
      dueDate: '2026-04-10',
      totalAmount: 200,
      paidAmount: 0,
      remainingAmount: 200,
      workflowStatus: 'received',
      status: 'credit',
      items: [{ medicineId: 'med-2', batchNumber: 'B-2', expiryDate: '2027-01-01', quantity: 2, purchasePrice: 100 }],
    } as Purchase);

    const newerPurchase = normalizePurchaseRecord({
      id: 'purchase-newer',
      supplierId: 'sup-1',
      invoiceNumber: 'INV-NEWER',
      date: '2026-04-03',
      dueDate: '2026-04-15',
      totalAmount: 300,
      paidAmount: 0,
      remainingAmount: 300,
      workflowStatus: 'received',
      status: 'credit',
      items: [{ medicineId: 'med-3', batchNumber: 'B-3', expiryDate: '2027-01-01', quantity: 3, purchasePrice: 100 }],
    } as Purchase);

    const plan = buildPurchasePaymentAllocationPlan({
      targetPurchase,
      purchases: [targetPurchase, newerPurchase, olderPurchase],
      amount: 1510,
    });

    expect(plan).toEqual({
      targetPurchaseId: 'purchase-target',
      targetPurchaseAppliedAmount: 1000,
      otherOpenPurchasesAllocations: [
        { purchaseId: 'purchase-older', amount: 200 },
        { purchaseId: 'purchase-newer', amount: 300 },
      ],
      advancePaymentAmount: 10,
      totalAppliedToPurchases: 1500,
      totalAmount: 1510,
    });
  });

  it('keeps the full amount as supplier prepayment when no purchase balance is open', () => {
    const targetPurchase = normalizePurchaseRecord({
      id: 'purchase-paid',
      supplierId: 'sup-1',
      date: '2026-04-05',
      totalAmount: 1000,
      paidAmount: 1000,
      remainingAmount: 0,
      workflowStatus: 'received',
      status: 'paid',
      items: [{ medicineId: 'med-1', batchNumber: 'B-1', expiryDate: '2027-01-01', quantity: 10, purchasePrice: 100 }],
    } as Purchase);

    const plan = buildPurchasePaymentAllocationPlan({
      targetPurchase,
      purchases: [targetPurchase],
      amount: 25,
    });

    expect(plan.targetPurchaseAppliedAmount).toBe(0);
    expect(plan.otherOpenPurchasesAllocations).toEqual([]);
    expect(plan.advancePaymentAmount).toBe(25);
    expect(plan.totalAppliedToPurchases).toBe(0);
  });
});
