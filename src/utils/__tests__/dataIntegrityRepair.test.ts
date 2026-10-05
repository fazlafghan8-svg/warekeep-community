import { describe, expect, it } from 'vitest';
import type { Invoice, Medicine, Purchase } from '@/types';
import { runDataIntegrityAudit } from '../dataIntegrityAudit';
import { repairCriticalDataIntegritySnapshot } from '../dataIntegrityRepair';

const medicine = (): Medicine => ({
  id: 'med-1',
  name: 'Legacy Receipt Medicine',
  manufacturer: 'ACME',
  type: 'Tablet',
  unit: 'piece' as Medicine['unit'],
  batches: [{
    id: 'batch-1',
    batchNumber: 'B-1',
    quantity: 20,
    receivedQuantity: 80,
    expiryDate: '2027-01-01',
    purchasePrice: 10,
    history: [],
    availabilityStatus: 'available',
  }],
  salePrices: { retail: 20, wholesale: 18, bulk: 16 },
  lowStockThreshold: 10,
});

const invoice = (): Invoice => ({
  id: 'inv-1',
  invoiceNumber: 1001,
  customerId: 'cust-1',
  items: [{
    medicineId: 'med-1',
    batchId: 'batch-1',
    quantity: 130,
    baseQuantity: 130,
    price: 20,
    costPrice: 10,
  }],
  total: 2600,
  tax: 0,
  discount: 0,
  finalAmount: 2600,
  currency: 'AFN',
  date: '2026-06-14T08:00:00.000Z',
  paymentStatus: 'paid',
  amountPaid: 2600,
  remainingAmount: 0,
});

describe('repairCriticalDataIntegritySnapshot', () => {
  it('rebuilds undersized received quantities from active sales and current stock', () => {
    const snapshot = {
      medicines: [medicine()],
      customers: [],
      invoices: [invoice()],
      expenses: [],
      suppliers: [],
      purchases: [],
      partners: [],
      stockMovements: [],
      settings: {} as any,
    };

    const before = runDataIntegrityAudit(snapshot);
    expect(before.issues.map((issue) => issue.type)).toContain('sold_quantity_exceeds_received_quantity');

    const result = repairCriticalDataIntegritySnapshot(snapshot, '2026-06-16T16:30:00.000Z');

    expect(result.repaired).toBe(true);
    expect(result.repairedBatchCount).toBe(1);
    expect(result.data.medicines[0].batches[0].receivedQuantity).toBe(150);
    expect(result.reportAfter.summary.critical).toBe(0);
  });

  it('does not mask unrelated critical stock corruption', () => {
    const snapshot = {
      medicines: [{
        ...medicine(),
        batches: [{ ...medicine().batches[0], quantity: -1, receivedQuantity: 80 }],
      }],
      customers: [],
      invoices: [],
      expenses: [],
      suppliers: [],
      purchases: [],
      partners: [],
      stockMovements: [],
      settings: {} as any,
    };

    const result = repairCriticalDataIntegritySnapshot(snapshot);

    expect(result.repaired).toBe(false);
    expect(result.reportAfter.summary.critical).toBe(result.reportBefore.summary.critical);
    expect(result.data).toBe(snapshot);
  });

  it('audits received purchase lines that have no corresponding batch record', () => {
    const purchase: Purchase = {
      id: 'pur-b3',
      supplierId: 'sup-1',
      invoiceNumber: 'B3',
      date: '2026-06-30',
      items: [
        { lineId: 'line-1', medicineId: 'med-1', medicineName: 'Line 1', batchNumber: 'B3-1', expiryDate: '2027-01-01', quantity: 1, purchasePrice: 10 },
        { lineId: 'line-2', medicineId: 'med-2', medicineName: 'Line 2', batchNumber: 'B3-2', expiryDate: '2027-01-01', quantity: 1, purchasePrice: 10 },
      ],
      receipts: [{
        id: 'receipt-b3',
        date: '2026-06-30',
        items: [
          { lineId: 'line-1', medicineId: 'med-1', purchaseItemIndex: 0, batchNumber: 'B3-1', quantity: 1, baseQuantity: 1 },
          { lineId: 'line-2', medicineId: 'med-2', purchaseItemIndex: 1, batchNumber: 'B3-2', quantity: 1, baseQuantity: 1 },
        ],
      }],
      totalAmount: 20,
      paidAmount: 0,
      remainingAmount: 20,
      paymentStatus: 'unpaid',
      workflowStatus: 'received',
      status: 'received',
      inventoryCommitted: true,
    };
    const medOne = medicine();
    medOne.id = 'med-1';
    medOne.batches = [{
      ...medOne.batches[0],
      id: 'batch-line-1',
      batchNumber: 'B3-1',
      purchaseId: 'pur-b3',
      purchaseLineId: 'line-1',
      purchaseItemIndex: 0,
    }];
    const medTwo = { ...medicine(), id: 'med-2', name: 'Line 2', batches: [] };

    const report = runDataIntegrityAudit({
      medicines: [medOne, medTwo],
      customers: [],
      invoices: [],
      expenses: [],
      suppliers: [],
      purchases: [purchase],
      stockMovements: [],
    });

    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'received_purchase_line_missing_batch',
        entityId: 'pur-b3:line-2',
        metadata: expect.objectContaining({ invoiceNumber: 'B3', lineId: 'line-2' }),
      }),
    ]));
  });
});
