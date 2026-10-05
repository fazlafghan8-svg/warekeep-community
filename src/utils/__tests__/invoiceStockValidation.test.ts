import { describe, expect, it } from 'vitest';
import type { Medicine } from '../../types';
import {
  formatInvoiceStockIssue,
  getFirstInvoiceStockIssue,
  validateInvoiceStock,
} from '../invoiceStockValidation';

const medicine = (overrides?: Partial<Medicine>): Medicine => ({
  id: 'med-1',
  name: 'Panadol',
  manufacturer: 'ACME',
  type: 'Tablet',
  unit: 'دانه' as Medicine['unit'],
  batches: [
    {
      id: 'batch-1',
      batchNumber: 'B-1',
      quantity: 10,
      expiryDate: '2027-01-01',
      purchasePrice: 5,
      history: [],
      availabilityStatus: 'available',
    },
  ],
  salePrices: {
    retail: 10,
    wholesale: 9,
    bulk: 8,
  },
  lowStockThreshold: 2,
  ...overrides,
});

describe('invoiceStockValidation', () => {
  it('allows invoice demand when aggregated quantity fits the selected batch', () => {
    const result = validateInvoiceStock(
      [
        { medicineId: 'med-1', batchId: 'batch-1', quantity: 4, price: 10 },
        { medicineId: 'med-1', batchId: 'batch-1', quantity: 6, price: 10 },
      ],
      [medicine()]
    );

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('blocks overselling when repeated lines exceed one batch together', () => {
    const result = validateInvoiceStock(
      [
        { medicineId: 'med-1', batchId: 'batch-1', quantity: 6, price: 10 },
        { medicineId: 'med-1', batchId: 'batch-1', quantity: 6, price: 10 },
      ],
      [medicine()]
    );

    expect(result.ok).toBe(false);
    expect(getFirstInvoiceStockIssue(result)).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      requested: 12,
      available: 10,
    });
  });

  it('blocks quarantine and rejected batches', () => {
    const result = validateInvoiceStock(
      [{ medicineId: 'med-1', batchId: 'batch-1', quantity: 1, price: 10 }],
      [medicine({
        batches: [{
          id: 'batch-1',
          batchNumber: 'B-1',
          quantity: 10,
          expiryDate: '2027-01-01',
          purchasePrice: 5,
          history: [],
          availabilityStatus: 'quarantine',
        }],
      })]
    );

    expect(result.ok).toBe(false);
    expect(getFirstInvoiceStockIssue(result)?.code).toBe('BATCH_NOT_SELLABLE');
  });

  it('blocks expired batches even when quantity is available', () => {
    const result = validateInvoiceStock(
      [{ medicineId: 'med-1', batchId: 'batch-1', quantity: 1, price: 10 }],
      [medicine({
        batches: [{
          id: 'batch-1',
          batchNumber: 'B-1',
          quantity: 10,
          expiryDate: '2020-01-01',
          purchasePrice: 5,
          history: [],
          availabilityStatus: 'available',
        }],
      })]
    );

    expect(result.ok).toBe(false);
    expect(getFirstInvoiceStockIssue(result)?.code).toBe('BATCH_NOT_SELLABLE');
  });

  it('checks stock with base quantity when sale unit is a box', () => {
    const result = validateInvoiceStock(
      [{ medicineId: 'med-1', batchId: 'batch-1', quantity: 1, baseQuantity: 100, saleUnitName: 'box', saleUnitConversionFactor: 100, price: 1000 }],
      [medicine({
        batches: [{
          id: 'batch-1',
          batchNumber: 'B-1',
          quantity: 50,
          expiryDate: '2027-01-01',
          purchasePrice: 5,
          history: [],
          availabilityStatus: 'available',
        }],
      })]
    );

    expect(result.ok).toBe(false);
    expect(getFirstInvoiceStockIssue(result)).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      requested: 100,
      available: 50,
    });
  });

  it('checks package stock with fractional base quantity for piece sales', () => {
    const result = validateInvoiceStock(
      [
        {
          medicineId: 'med-1',
          batchId: 'batch-1',
          quantity: 10,
          baseQuantity: 0.1,
          saleUnitName: 'piece',
          saleUnitLabel: '\u062f\u0627\u0646\u0647',
          saleUnitConversionFactor: 0.01,
          baseUnit: '\u0628\u0633\u062a\u0647',
          price: 9.5,
        },
      ],
      [medicine({
        unit: '\u0628\u0633\u062a\u0647' as Medicine['unit'],
        baseUnit: '\u0628\u0633\u062a\u0647',
        itemsPerBox: 100,
        batches: [{
          id: 'batch-1',
          batchNumber: 'B-1',
          quantity: 0.05,
          expiryDate: '2027-01-01',
          purchasePrice: 950,
          history: [],
          availabilityStatus: 'available',
        }],
      })]
    );

    expect(result.ok).toBe(false);
    expect(getFirstInvoiceStockIssue(result)).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      requested: 0.1,
      available: 0.05,
    });
  });

  it('formats a readable Dari stock error', () => {
    const result = validateInvoiceStock(
      [{ medicineId: 'med-1', batchId: 'batch-1', quantity: 11, price: 10 }],
      [medicine()]
    );

    expect(formatInvoiceStockIssue(getFirstInvoiceStockIssue(result), false)).toContain('موجودی');
  });
});
