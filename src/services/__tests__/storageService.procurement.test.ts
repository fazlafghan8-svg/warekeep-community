import { describe, expect, it } from 'vitest';
import { sanitizeFullData } from '../storageService';

describe('storageService procurement compatibility', () => {
  it('NEW - keeps legacy batches readable and normalizes procurement audit structures', () => {
    const sanitized = sanitizeFullData({
      medicines: [
        {
          id: 'med-1',
          name: 'Test Medicine',
          manufacturer: 'Maker',
          type: 'Tablet',
          unit: 'بسته',
          lowStockThreshold: 1,
          salePrices: { retail: 10, wholesale: 9, bulk: 8 },
          batches: [
            {
              id: 'batch-legacy',
              batchNumber: 'LEG-1',
              quantity: '6',
              expiryDate: '2027-01-01',
              purchasePrice: '12',
              history: [],
            },
          ],
        },
      ],
      customers: [],
      invoices: [],
      expenses: [],
      suppliers: [],
      purchases: [
        {
          id: 'pur-1',
          supplierId: 'sup-1',
          date: '2026-04-01',
          items: [
            {
              medicineId: 'med-1',
              batchNumber: 'LEG-1',
              expiryDate: '2027-01-01',
              quantity: '6',
              purchasePrice: '12',
            },
          ],
          totalAmount: '72',
          paidAmount: '20',
          remainingAmount: '52',
          workflowStatus: 'received',
          status: 'received',
          receipts: [
            {
              id: 'rec-1',
              date: '2026-04-01',
              items: [
                {
                  medicineId: 'med-1',
                  quantity: '6',
                },
              ],
            },
          ],
          vendorCredits: [
            {
              id: 'vc-1',
              date: '2026-04-02',
              amount: '12',
              items: [
                {
                  medicineId: 'med-1',
                  quantity: '1',
                  amount: '12',
                },
              ],
            },
          ],
        },
      ],
      auditEvents: [
        {
          id: 'audit-1',
          timestamp: '2026-04-01T10:00:00.000Z',
          actorName: 'Tester',
          action: 'purchase.created',
          entityType: 'purchase',
          entityId: 'pur-1',
        },
      ],
      settings: {
        language: 'english',
      },
    });

    expect(sanitized?.medicines[0].batches[0].supplierId).toBeUndefined();
    expect(sanitized?.medicines[0].batches[0].purchaseId).toBeUndefined();
    expect(sanitized?.purchases[0].receiptStatus).toBe('received');
    expect(sanitized?.purchases[0].creditedAmount).toBe(12);
    expect(sanitized?.auditEvents).toHaveLength(1);
  });
});
