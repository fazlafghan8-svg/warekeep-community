import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareImportedFullDataForRestore, sanitizeFullData, saveToDisk } from '../storageService';

const baseSnapshot = {
  customers: [],
  invoices: [],
  expenses: [],
  suppliers: [],
  purchases: [],
  partners: [],
  auditEvents: [],
  settings: { language: 'english' },
};

describe('storageService stock integrity guards', () => {
  beforeEach(() => {
    localStorage.clear();
    (window as any).electronAPI.saveData = vi.fn(async () => ({ success: true }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects invalid stock quantity instead of normalizing it to zero', () => {
    expect(() => sanitizeFullData({
      ...baseSnapshot,
      medicines: [{
        id: 'med-1',
        name: 'Guarded Medicine',
        batches: [{
          id: 'batch-1',
          batchNumber: 'B-1',
          quantity: 'not-a-number',
          expiryDate: '2027-01-01',
          purchasePrice: 1,
          history: [],
        }],
      }],
    })).toThrow('Integrity Fail: medicines[0].batches[0].quantity invalid');
  });

  it('rejects negative received quantity before sanitize can clamp it', () => {
    expect(() => sanitizeFullData({
      ...baseSnapshot,
      medicines: [{
        id: 'med-1',
        name: 'Guarded Medicine',
        batches: [{
          id: 'batch-1',
          batchNumber: 'B-1',
          quantity: '10',
          receivedQuantity: '-1',
          expiryDate: '2027-01-01',
          purchasePrice: 1,
          history: [],
        }],
      }],
    })).toThrow('Integrity Fail: medicines[0].batches[0].receivedQuantity cannot be negative');
  });

  it('rejects stock movement arithmetic mismatches during restore preparation', () => {
    expect(() => prepareImportedFullDataForRestore({
      ...baseSnapshot,
      medicines: [],
      stockMovements: [{
        id: 'mov-1',
        medicineId: 'med-1',
        batchId: 'batch-1',
        type: 'sale',
        quantityBaseUnit: '-5',
        previousStock: '10',
        newStock: '7',
        referenceType: 'invoice',
        referenceId: 'inv-1',
        createdAt: '2026-06-15T00:00:00.000Z',
      }],
    })).toThrow('Integrity Fail: stockMovements[0].previousStock + quantityBaseUnit must equal newStock');
  });

  it('rejects invalid invoice money instead of normalizing it during sanitize', () => {
    expect(() => sanitizeFullData({
      ...baseSnapshot,
      medicines: [],
      invoices: [{
        id: 'inv-1',
        customerId: 'cust-1',
        items: [],
        total: '100',
        tax: '0',
        discount: '0',
        finalAmount: '100',
        amountPaid: 'not-money',
        remainingAmount: '0',
        date: '2026-06-15T00:00:00.000Z',
      }],
    })).toThrow('Integrity Fail: invoices[0].amountPaid invalid');
  });

  it('rejects invoice payment mismatches before storage can persist them', () => {
    expect(() => sanitizeFullData({
      ...baseSnapshot,
      medicines: [],
      invoices: [{
        id: 'inv-1',
        customerId: 'cust-1',
        items: [],
        total: '100',
        tax: '0',
        discount: '0',
        finalAmount: '100',
        amountPaid: '40',
        remainingAmount: '40',
        date: '2026-06-15T00:00:00.000Z',
      }],
    })).toThrow('Integrity Fail: invoices[0].amountPaid + remainingAmount must equal finalAmount');
  });

  it('rejects purchase payment mismatches before restore preparation', () => {
    expect(() => prepareImportedFullDataForRestore({
      ...baseSnapshot,
      medicines: [],
      purchases: [{
        id: 'pur-1',
        supplierId: 'sup-1',
        date: '2026-06-15T00:00:00.000Z',
        items: [],
        totalAmount: '720',
        paidAmount: '500',
        remainingAmount: '300',
      }],
    })).toThrow('Integrity Fail: purchases[0].paidAmount + creditedAmount + remainingAmount must equal totalAmount');
  });

  it('repairs legacy undersized received quantities before persisting to disk', async () => {
    await saveToDisk({
      ...baseSnapshot,
      medicines: [{
        id: 'med-1',
        name: 'Legacy Receipt Medicine',
        manufacturer: 'ACME',
        type: 'Tablet',
        unit: 'piece',
        batches: [{
          id: 'batch-1',
          batchNumber: 'B-1',
          quantity: '20',
          receivedQuantity: '80',
          expiryDate: '2027-01-01',
          purchasePrice: 1,
          history: [],
        }],
        salePrices: { retail: 20, wholesale: 18, bulk: 16 },
        lowStockThreshold: 10,
      }],
      invoices: [{
        id: 'inv-1',
        invoiceNumber: 1001,
        customerId: 'cust-1',
        items: [{
          medicineId: 'med-1',
          batchId: 'batch-1',
          quantity: 130,
          baseQuantity: 130,
          price: 20,
          costPrice: 1,
        }],
        total: 2600,
        tax: 0,
        discount: 0,
        finalAmount: 2600,
        amountPaid: 2600,
        remainingAmount: 0,
        paymentStatus: 'paid',
        date: '2026-06-15T00:00:00.000Z',
      }],
    }, 'repair-before-save-user');

    const [[payload]] = (window as any).electronAPI.saveData.mock.calls;
    expect(payload.medicines[0].batches[0].receivedQuantity).toBe(150);
  });
});
