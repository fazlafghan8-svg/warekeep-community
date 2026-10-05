import { describe, expect, it } from 'vitest';
import { sanitizeFullData } from '../storageService';

describe('storageService commission rule fields', () => {
  it('preserves medicine, settings, and invoice item commission snapshots', () => {
    const sanitized = sanitizeFullData({
      medicines: [{
        id: 'med-1',
        name: 'Pure-C',
        manufacturer: 'BBP',
        type: 'Powder',
        unit: 'bottle',
        batches: [],
        salePrices: { retail: 100, wholesale: 90, bulk: 80 },
        lowStockThreshold: 1,
        commissionRules: [{ id: 'mcr-1', adjustmentPercent: '+5', enabled: true }],
      }],
      customers: [],
      suppliers: [],
      invoices: [{
        id: 'inv-1',
        customerId: 'cust-1',
        items: [{
          medicineId: 'med-1',
          batchId: 'batch-1',
          quantity: 1,
          price: 100,
          commissionAdjustmentPercent: -3,
          commissionOverridePercent: 15,
          commissionRuleMode: 'override',
          commissionRuleSource: 'medicine',
          commissionRuleLabel: 'Direct medicine rule',
        }],
        total: 100,
        tax: 0,
        discount: 0,
        finalAmount: 100,
        amountPaid: 100,
        remainingAmount: 0,
        date: '2026-06-09T00:00:00.000Z',
      }],
      expenses: [],
      partners: [],
      purchases: [],
      auditEvents: [],
      settings: {
        storeName: 'Test',
        storePhone: '',
        storeAddress: '',
        taxRate: 0,
        commissionRules: [
          { id: 'gcr-1', target: 'manufacturer', targetValue: 'BBP', adjustmentPercent: 4 },
          { id: 'scr-1', target: 'supplier', targetValue: 'sup-1', targetLabel: 'Green Supplier', adjustmentPercent: 15, mode: 'override' },
        ],
      },
    });

    expect(sanitized?.medicines[0].commissionRules).toMatchObject([{ id: 'mcr-1', adjustmentPercent: 5 }]);
    expect(sanitized?.settings.commissionRules?.[0]).toMatchObject({ id: 'gcr-1', target: 'manufacturer', adjustmentPercent: 4 });
    expect(sanitized?.settings.commissionRules).toContainEqual(expect.objectContaining({
      id: 'scr-1',
      target: 'supplier',
      targetLabel: 'Green Supplier',
      adjustmentPercent: 15,
      mode: 'override',
    }));
    expect(sanitized?.invoices[0].items[0]).toMatchObject({
      commissionAdjustmentPercent: -3,
      commissionOverridePercent: 15,
      commissionRuleMode: 'override',
      commissionRuleSource: 'medicine',
      commissionRuleLabel: 'Direct medicine rule',
    });
  });
});
