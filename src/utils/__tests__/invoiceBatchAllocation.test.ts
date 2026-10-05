import { describe, expect, it } from 'vitest';
import type { InvoiceItem, Medicine } from '../../types';
import { calculateInvoiceTotals, calculateItemProfit } from '../calculations';
import {
  allocateSaleAcrossBatches,
  getInvoiceDisplayLineTotal,
  getInvoiceDisplayLines,
} from '../invoiceBatchAllocation';
import { validateInvoiceStock } from '../invoiceStockValidation';

const medicine = (overrides?: Partial<Medicine>): Medicine => ({
  id: 'med-1',
  name: 'Bromox DS',
  manufacturer: 'ACME',
  type: 'Suspension',
  unit: 'bottle',
  batches: [
    {
      id: 'batch-1',
      batchNumber: 'AUTO-8111-A',
      quantity: 16,
      expiryDate: '2027-11-30',
      purchasePrice: 98,
      availabilityStatus: 'available',
      history: [],
    },
    {
      id: 'batch-2',
      batchNumber: 'AUTO-8111-B',
      quantity: 336,
      expiryDate: '2027-12-30',
      purchasePrice: 97,
      availabilityStatus: 'available',
      history: [],
    },
  ],
  salePrices: { retail: 100, wholesale: 100, bulk: 100 },
  lowStockThreshold: 10,
  ...overrides,
});

const toItems = (
  allocations: ReturnType<typeof allocateSaleAcrossBatches>['allocations'],
  groupId = 'group-1',
  extra?: Partial<InvoiceItem>
): InvoiceItem[] => allocations.map((allocation) => ({
  medicineId: 'med-1',
  batchId: allocation.batch.id,
  quantity: allocation.quantity,
  baseQuantity: allocation.baseQuantity,
  saleUnitName: 'bottle',
  saleUnitConversionFactor: 1,
  baseUnit: 'bottle',
  price: 100,
  discountAmount: allocation.discountAmount,
  discountPercent: extra?.discountPercent,
  costPrice: allocation.batch.purchasePrice,
  displayGroupId: groupId,
  isAutoBatchSplit: allocations.length > 1,
  ...extra,
}));

describe('invoiceBatchAllocation', () => {
  it('splits a sale across FEFO batches when the first batch is not enough', () => {
    const allocation = allocateSaleAcrossBatches({
      medicine: medicine(),
      existingItems: [],
      requestedQuantity: 20,
      requestedBaseQuantity: 20,
      saleUnitConversionFactor: 1,
      price: 100,
      currency: 'AFN',
    });

    expect(allocation.ok).toBe(true);
    expect(allocation.allocations.map((entry) => [entry.batch.id, entry.baseQuantity])).toEqual([
      ['batch-1', 16],
      ['batch-2', 4],
    ]);

    const items = toItems(allocation.allocations);
    expect(validateInvoiceStock(items, [medicine()]).ok).toBe(true);
  });

  it('keeps profit tied to each consumed batch purchase price', () => {
    const allocation = allocateSaleAcrossBatches({
      medicine: medicine(),
      existingItems: [],
      requestedQuantity: 20,
      requestedBaseQuantity: 20,
      saleUnitConversionFactor: 1,
      price: 100,
      currency: 'AFN',
    });
    const items = toItems(allocation.allocations);

    const profit = items.reduce((sum, item) => sum + calculateItemProfit(item, [medicine()], 'AFN'), 0);

    expect(profit).toBe(44);
  });

  it('preserves invoice totals when amount and percent discounts are split proportionally', () => {
    const allocation = allocateSaleAcrossBatches({
      medicine: medicine(),
      existingItems: [],
      requestedQuantity: 20,
      requestedBaseQuantity: 20,
      saleUnitConversionFactor: 1,
      price: 100,
      discountAmount: 20,
      currency: 'AFN',
    });
    const splitItems = toItems(allocation.allocations, 'group-discount', { discountPercent: 10 });
    const singleItem: InvoiceItem = {
      medicineId: 'med-1',
      batchId: 'batch-1',
      quantity: 20,
      baseQuantity: 20,
      saleUnitConversionFactor: 1,
      price: 100,
      discountAmount: 20,
      discountPercent: 10,
    };

    expect(calculateInvoiceTotals(splitItems, 0, 0, 'AFN').finalAmount).toBe(
      calculateInvoiceTotals([singleItem], 0, 0, 'AFN').finalAmount
    );
  });

  it('summarizes split invoice items for cart and invoice display while keeping source indexes', () => {
    const allocation = allocateSaleAcrossBatches({
      medicine: medicine(),
      existingItems: [],
      requestedQuantity: 20,
      requestedBaseQuantity: 20,
      saleUnitConversionFactor: 1,
      price: 100,
      currency: 'AFN',
    });
    const items = toItems(allocation.allocations, 'group-display');

    const displayLines = getInvoiceDisplayLines(items);

    expect(displayLines).toHaveLength(1);
    expect(displayLines[0].item.quantity).toBe(20);
    expect(displayLines[0].sourceIndexes).toEqual([0, 1]);
    expect(getInvoiceDisplayLineTotal(displayLines[0], 'AFN')).toBe(2000);

    const indexesToRemove = new Set(displayLines[0].sourceIndexes);
    expect(items.filter((_, index) => !indexesToRemove.has(index))).toEqual([]);
  });
});
