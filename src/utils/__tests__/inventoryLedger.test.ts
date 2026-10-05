import { describe, expect, it } from 'vitest';
import type { Invoice, Medicine } from '@/types';
import { runDataIntegrityAudit } from '../dataIntegrityAudit';
import {
  flattenStockQuantityByBatch,
  getInvoiceCustomerBalanceImpact,
  getInvoiceNetStockRollback,
} from '../inventoryLedger';
import { validateInvoiceStock } from '../invoiceStockValidation';

const medicine = (quantity: number, receivedQuantity = quantity): Medicine => ({
  id: 'med-1',
  name: 'Bottle Medicine',
  manufacturer: 'ACME',
  type: 'Tablet',
  unit: 'bottle' as Medicine['unit'],
  batches: [{
    id: 'batch-1',
    batchNumber: 'B-720',
    quantity,
    receivedQuantity,
    expiryDate: '2027-01-01',
    purchasePrice: 10,
    history: [],
    availabilityStatus: 'available',
  }],
  salePrices: { retail: 20, wholesale: 18, bulk: 16 },
  lowStockThreshold: 10,
});

const invoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  invoiceNumber: 1001,
  customerId: 'cust-1',
  items: [{
    lineId: 'line-a',
    medicineId: 'med-1',
    batchId: 'batch-1',
    quantity: 100,
    baseQuantity: 100,
    price: 20,
    costPrice: 10,
  }],
  total: 2000,
  tax: 0,
  discount: 0,
  finalAmount: 2000,
  currency: 'AFN',
  date: '2026-06-14T08:00:00.000Z',
  paymentStatus: 'partial',
  amountPaid: 500,
  remainingAmount: 1500,
  ...overrides,
});

describe('inventory ledger safety helpers', () => {
  it('blocks the 720-stock / 903-sale oversell scenario before persistence', () => {
    const result = validateInvoiceStock(
      [{ medicineId: 'med-1', batchId: 'batch-1', quantity: 903, baseQuantity: 903, price: 20 }],
      [medicine(720)]
    );

    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      requested: 903,
      available: 720,
    });
  });

  it('restores only net sold stock when a returned invoice is deleted', () => {
    const returnedInvoice = invoice({
      returns: [{
        id: 'ret-1',
        invoiceId: 'inv-1',
        customerId: 'cust-1',
        date: '2026-06-14T09:00:00.000Z',
        items: [{
          lineId: 'line-a',
          medicineId: 'med-1',
          batchId: 'batch-1',
          quantity: 20,
          baseQuantity: 20,
          price: 20,
          costPrice: 10,
        }],
        subtotal: 400,
        taxRefund: 0,
        discountRefund: 0,
        totalRefund: 400,
        amountRefunded: 100,
        debtReduction: 300,
        sourceLineId: 'line-a',
        sourceItemIndex: 0,
      }],
    });

    const rollback = flattenStockQuantityByBatch(getInvoiceNetStockRollback(returnedInvoice));

    expect(rollback['med-1\u0000batch-1']).toBe(80);
    expect(getInvoiceCustomerBalanceImpact(returnedInvoice)).toBe(1200);
  });

  it('uses lineId instead of stale return index when rolling back edited invoices', () => {
    const returnedInvoice = invoice({
      items: [
        {
          lineId: 'line-a',
          medicineId: 'med-1',
          batchId: 'batch-1',
          quantity: 100,
          baseQuantity: 100,
          price: 20,
          costPrice: 10,
        },
        {
          lineId: 'line-b',
          medicineId: 'med-1',
          batchId: 'batch-2',
          quantity: 10,
          baseQuantity: 10,
          price: 25,
          costPrice: 12,
        },
      ],
      returns: [{
        id: 'ret-1',
        invoiceId: 'inv-1',
        customerId: 'cust-1',
        date: '2026-06-14T09:00:00.000Z',
        sourceLineId: 'line-a',
        sourceItemIndex: 1,
        items: [{
          lineId: 'line-a',
          medicineId: 'med-1',
          batchId: 'batch-1',
          quantity: 20,
          baseQuantity: 20,
          price: 20,
          costPrice: 10,
        }],
        subtotal: 400,
        taxRefund: 0,
        discountRefund: 0,
        totalRefund: 400,
        amountRefunded: 100,
        debtReduction: 300,
      }],
    });

    const rollback = flattenStockQuantityByBatch(getInvoiceNetStockRollback(returnedInvoice));

    expect(rollback['med-1\u0000batch-1']).toBe(80);
    expect(rollback['med-1\u0000batch-2']).toBe(10);
  });

  it('ignores logically voided returns in stock and customer balance impact', () => {
    const returnedInvoice = invoice({
      returns: [{
        id: 'ret-voided',
        invoiceId: 'inv-1',
        customerId: 'cust-1',
        date: '2026-06-14T09:00:00.000Z',
        sourceLineId: 'line-a',
        sourceItemIndex: 0,
        isVoided: true,
        items: [{
          lineId: 'line-a',
          medicineId: 'med-1',
          batchId: 'batch-1',
          quantity: 20,
          baseQuantity: 20,
          price: 20,
          costPrice: 10,
        }],
        subtotal: 400,
        taxRefund: 0,
        discountRefund: 0,
        totalRefund: 400,
        amountRefunded: 100,
        debtReduction: 300,
      }],
    });

    const rollback = flattenStockQuantityByBatch(getInvoiceNetStockRollback(returnedInvoice));

    expect(rollback['med-1\u0000batch-1']).toBe(100);
    expect(getInvoiceCustomerBalanceImpact(returnedInvoice)).toBe(1500);
  });

  it('reports hidden historical oversell and negative batch quantities', () => {
    const report = runDataIntegrityAudit({
      medicines: [medicine(-183, 720)],
      invoices: [invoice({
        items: [{
          medicineId: 'med-1',
          batchId: 'batch-1',
          quantity: 903,
          baseQuantity: 903,
          price: 20,
          costPrice: 10,
        }],
        total: 18060,
        finalAmount: 18060,
        amountPaid: 18060,
        remainingAmount: 0,
      })],
      customers: [],
      suppliers: [],
      purchases: [],
    });

    expect(report.summary.critical).toBeGreaterThanOrEqual(2);
    expect(report.issues.map((issue) => issue.type)).toContain('negative_batch_stock');
    expect(report.issues.map((issue) => issue.type)).toContain('sold_quantity_exceeds_received_quantity');
  });

  it('reports stock movement ledger arithmetic and stored-stock mismatches', () => {
    const report = runDataIntegrityAudit({
      medicines: [medicine(220, 720)],
      invoices: [],
      customers: [],
      suppliers: [],
      purchases: [],
      stockMovements: [{
        id: 'stm-1',
        medicineId: 'med-1',
        batchId: 'batch-1',
        type: 'sale',
        quantityBaseUnit: -500,
        referenceType: 'invoice',
        referenceId: 'inv-1',
        previousStock: 720,
        newStock: 219,
        createdAt: '2026-06-14T10:00:00.000Z',
      }],
    });

    expect(report.issues.map((issue) => issue.type)).toContain('stock_movement_arithmetic_mismatch');
    expect(report.issues.map((issue) => issue.type)).toContain('stock_movement_ledger_mismatch');
  });

  it('accepts stored stock when invoice math and latest stock movement agree', () => {
    const report = runDataIntegrityAudit({
      medicines: [medicine(220, 720)],
      invoices: [invoice({
        items: [{
          medicineId: 'med-1',
          batchId: 'batch-1',
          quantity: 500,
          baseQuantity: 500,
          price: 20,
          costPrice: 10,
        }],
        total: 10000,
        finalAmount: 10000,
        amountPaid: 10000,
        remainingAmount: 0,
        paymentStatus: 'paid',
      })],
      customers: [],
      suppliers: [],
      purchases: [],
      stockMovements: [{
        id: 'stm-1',
        medicineId: 'med-1',
        batchId: 'batch-1',
        type: 'sale',
        quantityBaseUnit: -500,
        referenceType: 'invoice',
        referenceId: 'inv-1',
        previousStock: 720,
        newStock: 220,
        createdAt: '2026-06-14T10:00:00.000Z',
      }],
    });

    expect(report.issues.map((issue) => issue.type)).not.toContain('stock_movement_ledger_mismatch');
    expect(report.issues.map((issue) => issue.type)).not.toContain('stored_stock_differs_from_ledger');
    expect(report.issues.map((issue) => issue.type)).not.toContain('sold_quantity_exceeds_received_quantity');
    expect(report.summary.critical).toBe(0);
  });
});
