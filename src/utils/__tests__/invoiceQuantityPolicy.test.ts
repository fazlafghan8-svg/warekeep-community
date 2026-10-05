import { describe, expect, it } from 'vitest';
import type { InvoiceItem, Medicine } from '@/types';
import { validateInvoiceQuantityPolicy } from '../invoiceQuantityPolicy';

const item = (quantity: number): InvoiceItem => ({
  medicineId: 'med-1',
  batchId: 'batch-1',
  quantity,
  price: 10,
});

const medicine = (allowFractionalQuantity = false): Medicine => ({
  id: 'med-1',
  name: 'Item',
  manufacturer: 'Maker',
  type: 'Tablet',
  unit: 'دانه' as Medicine['unit'],
  allowFractionalQuantity,
  batches: [{
    id: 'batch-1',
    batchNumber: 'B-1',
    quantity: 10,
    expiryDate: '2027-01-01',
    purchasePrice: 5,
    history: [],
  }],
  salePrices: { retail: 10, wholesale: 9, bulk: 8 },
  lowStockThreshold: 1,
});

describe('invoice quantity policy', () => {
  it('blocks fractional quantities by default', () => {
    const result = validateInvoiceQuantityPolicy([item(1.5)], [medicine(false)]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].code).toBe('FRACTIONAL_QUANTITY_NOT_ALLOWED');
      expect(result.issues[0].medicineName).toBe('Item');
    }
  });

  it('allows fractional quantities only for explicitly enabled medicines', () => {
    expect(validateInvoiceQuantityPolicy([item(1.5)], [medicine(true)]).ok).toBe(true);
    expect(validateInvoiceQuantityPolicy([item(2)], [medicine(false)]).ok).toBe(true);
  });
});
