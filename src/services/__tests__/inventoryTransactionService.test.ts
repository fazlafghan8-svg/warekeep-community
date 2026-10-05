import { describe, expect, it } from 'vitest';
import type { Invoice, Medicine, Purchase, PurchaseReceipt, SalesReturn, Supplier } from '@/types';
import {
  applyInventoryTransaction,
  applyInventorySnapshotTransaction,
  buildPurchaseReceiptMedicineSnapshot,
  buildVendorReturnInventoryMutation,
  buildInvoiceDeleteMovementDrafts,
  buildInvoiceEditMovementDrafts,
  buildInvoiceSaleMovementDrafts,
  buildSalesReturnMovementDrafts,
  findConsumedPurchaseBatches,
  InventoryTransactionError,
} from '../inventoryTransactionService';

const medicine = (quantity: number): Medicine => ({
  id: 'med-1',
  name: 'Traceable Medicine',
  manufacturer: 'ACME',
  type: 'Tablet',
  unit: 'tablet',
  batches: [{
    id: 'batch-1',
    batchNumber: 'B-1',
    quantity,
    receivedQuantity: 720,
    expiryDate: '2027-01-01',
    purchasePrice: 10,
    history: [],
  }],
  salePrices: { retail: 20, wholesale: 18, bulk: 16 },
  lowStockThreshold: 10,
});

const invoice = (quantity: number, overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  invoiceNumber: 1001,
  customerId: 'cust-1',
  items: [{
    medicineId: 'med-1',
    batchId: 'batch-1',
    quantity,
    baseQuantity: quantity,
    price: 20,
    costPrice: 10,
  }],
  total: quantity * 20,
  tax: 0,
  discount: 0,
  finalAmount: quantity * 20,
  currency: 'AFN',
  date: '2026-06-14T08:00:00.000Z',
  paymentStatus: 'paid',
  amountPaid: quantity * 20,
  remainingAmount: 0,
  ...overrides,
});

const salesReturn = (quantity: number): SalesReturn => ({
  id: 'ret-1',
  invoiceId: 'inv-1',
  customerId: 'cust-1',
  date: '2026-06-14T09:00:00.000Z',
  items: [{
    medicineId: 'med-1',
    batchId: 'batch-1',
    quantity,
    baseQuantity: quantity,
    price: 20,
    costPrice: 10,
  }],
  subtotal: quantity * 20,
  taxRefund: 0,
  discountRefund: 0,
  totalRefund: quantity * 20,
  amountRefunded: 0,
  debtReduction: quantity * 20,
  sourceItemIndex: 0,
});

const purchase = (quantity = 720): Purchase => ({
  id: 'pur-1',
  supplierId: 'sup-1',
  date: '2026-06-14T07:00:00.000Z',
  items: [{
    medicineId: 'med-1',
    batchNumber: 'B-1',
    expiryDate: '2027-01-01',
    quantity,
    baseQuantity: quantity,
    purchasePrice: 10,
  }],
  subtotalAmount: quantity * 10,
  discountAmount: 0,
  taxAmount: 0,
  shippingAmount: 0,
  extraChargesAmount: 0,
  totalAmount: quantity * 10,
  paidAmount: quantity * 10,
  remainingAmount: 0,
  paymentStatus: 'paid',
  status: 'received',
  workflowStatus: 'received',
  inventoryCommitted: true,
  receiptStatus: 'received',
  payments: [],
  receipts: [],
  vendorCredits: [],
  attachments: [],
});

describe('inventoryTransactionService', () => {
  it('rejects the 720-stock / 903-sale oversell without mutating state or appending a movement', () => {
    const medicines = [medicine(720)];

    expect(() => applyInventoryTransaction({
      medicines,
      stockMovements: [],
      movements: buildInvoiceSaleMovementDrafts(invoice(903)),
      createdAt: '2026-06-14T10:00:00.000Z',
    })).toThrow(InventoryTransactionError);

    expect(medicines[0].batches[0].quantity).toBe(720);
  });

  it('applies a valid sale once and skips a replay with the same idempotency key', () => {
    const first = applyInventoryTransaction({
      medicines: [medicine(720)],
      stockMovements: [],
      movements: buildInvoiceSaleMovementDrafts(invoice(500)),
      createdAt: '2026-06-14T10:00:00.000Z',
    });

    expect(first.medicines[0].batches[0].quantity).toBe(220);
    expect(first.appendedMovements).toHaveLength(1);
    expect(first.appendedMovements[0]).toMatchObject({
      previousStock: 720,
      newStock: 220,
      quantityBaseUnit: -500,
      type: 'sale',
    });

    const replay = applyInventoryTransaction({
      medicines: first.medicines,
      stockMovements: first.stockMovements,
      movements: buildInvoiceSaleMovementDrafts(invoice(500)),
      createdAt: '2026-06-14T10:01:00.000Z',
    });

    expect(replay.medicines[0].batches[0].quantity).toBe(220);
    expect(replay.appendedMovements).toHaveLength(0);
    expect(replay.skippedIdempotencyKeys).toEqual(['invoice-sale:inv-1:0']);
  });

  it('keeps the 720-stock / 500-sale success and rejects a later 300-sale oversell atomically', () => {
    const first = applyInventoryTransaction({
      medicines: [medicine(720)],
      stockMovements: [],
      movements: buildInvoiceSaleMovementDrafts(invoice(500)),
      createdAt: '2026-06-14T10:00:00.000Z',
    });

    expect(first.medicines[0].batches[0].quantity).toBe(220);

    expect(() => applyInventoryTransaction({
      medicines: first.medicines,
      stockMovements: first.stockMovements,
      movements: buildInvoiceSaleMovementDrafts(invoice(300, { id: 'inv-2', invoiceNumber: 1002 })),
      createdAt: '2026-06-14T10:01:00.000Z',
    })).toThrow(InventoryTransactionError);

    expect(first.medicines[0].batches[0].quantity).toBe(220);
    expect(first.stockMovements).toHaveLength(1);
  });

  it('allows exact stock depletion and rejects the next unit', () => {
    const depleted = applyInventoryTransaction({
      medicines: [medicine(720)],
      stockMovements: [],
      movements: buildInvoiceSaleMovementDrafts(invoice(720)),
      createdAt: '2026-06-14T10:00:00.000Z',
    });

    expect(depleted.medicines[0].batches[0].quantity).toBe(0);
    expect(() => applyInventoryTransaction({
      medicines: depleted.medicines,
      stockMovements: depleted.stockMovements,
      movements: buildInvoiceSaleMovementDrafts(invoice(1, { id: 'inv-2', invoiceNumber: 1002 })),
      createdAt: '2026-06-14T10:01:00.000Z',
    })).toThrow(InventoryTransactionError);
  });

  it('restores only net sold stock when a returned invoice is deleted', () => {
    const sourceInvoice = invoice(100, {
      returns: [salesReturn(20)],
    });
    const sold = applyInventoryTransaction({
      medicines: [medicine(720)],
      stockMovements: [],
      movements: buildInvoiceSaleMovementDrafts(sourceInvoice),
      createdAt: '2026-06-14T10:00:00.000Z',
    });
    const returned = applyInventoryTransaction({
      medicines: sold.medicines,
      stockMovements: sold.stockMovements,
      movements: buildSalesReturnMovementDrafts(salesReturn(20), sourceInvoice),
      createdAt: '2026-06-14T10:05:00.000Z',
    });
    const deleted = applyInventoryTransaction({
      medicines: returned.medicines,
      stockMovements: returned.stockMovements,
      movements: buildInvoiceDeleteMovementDrafts(sourceInvoice),
      createdAt: '2026-06-14T10:10:00.000Z',
    });

    expect(sold.medicines[0].batches[0].quantity).toBe(620);
    expect(returned.medicines[0].batches[0].quantity).toBe(640);
    expect(deleted.medicines[0].batches[0].quantity).toBe(720);
    expect(deleted.appendedMovements[0]).toMatchObject({
      quantityBaseUnit: 80,
      previousStock: 640,
      newStock: 720,
    });
  });

  it('applies only the delta when editing a sale from 20 to 30', () => {
    const originalInvoice = invoice(20);
    const editedInvoice = invoice(30, {
      updatedAt: '2026-06-14T10:05:00.000Z',
    });
    const sold = applyInventoryTransaction({
      medicines: [medicine(720)],
      stockMovements: [],
      movements: buildInvoiceSaleMovementDrafts(originalInvoice),
      createdAt: '2026-06-14T10:00:00.000Z',
    });

    const edited = applyInventoryTransaction({
      medicines: sold.medicines,
      stockMovements: sold.stockMovements,
      movements: buildInvoiceEditMovementDrafts(originalInvoice, editedInvoice),
      createdAt: '2026-06-14T10:05:00.000Z',
    });

    expect(sold.medicines[0].batches[0].quantity).toBe(700);
    expect(edited.medicines[0].batches[0].quantity).toBe(690);
    expect(edited.appendedMovements).toHaveLength(1);
    expect(edited.appendedMovements[0]).toMatchObject({
      type: 'invoice_edit_delta',
      quantityBaseUnit: -10,
      previousStock: 700,
      newStock: 690,
    });
  });

  it('applies only the delta when editing a sale from 30 to 20', () => {
    const originalInvoice = invoice(30);
    const editedInvoice = invoice(20, {
      updatedAt: '2026-06-14T10:05:00.000Z',
    });
    const sold = applyInventoryTransaction({
      medicines: [medicine(720)],
      stockMovements: [],
      movements: buildInvoiceSaleMovementDrafts(originalInvoice),
      createdAt: '2026-06-14T10:00:00.000Z',
    });

    const edited = applyInventoryTransaction({
      medicines: sold.medicines,
      stockMovements: sold.stockMovements,
      movements: buildInvoiceEditMovementDrafts(originalInvoice, editedInvoice),
      createdAt: '2026-06-14T10:05:00.000Z',
    });

    expect(sold.medicines[0].batches[0].quantity).toBe(690);
    expect(edited.medicines[0].batches[0].quantity).toBe(700);
    expect(edited.appendedMovements).toHaveLength(1);
    expect(edited.appendedMovements[0]).toMatchObject({
      type: 'invoice_edit_delta',
      quantityBaseUnit: 10,
      previousStock: 690,
      newStock: 700,
    });
  });

  it('detects purchase batches that have been consumed before purchase edit/delete', () => {
    const medicines: Medicine[] = [{
      ...medicine(220),
      batches: [{
        ...medicine(220).batches[0],
        purchaseId: 'pur-1',
        purchaseItemIndex: 0,
        receivedQuantity: 720,
        quantity: 220,
      }],
    }];

    expect(findConsumedPurchaseBatches(purchase(), medicines)).toEqual([{
      medicineId: 'med-1',
      batchId: 'batch-1',
      batchNumber: 'B-1',
      receivedQuantity: 720,
      currentQuantity: 220,
    }]);
  });

  it('records purchase snapshot adjustments through stock movements', () => {
    const currentMedicine = {
      ...medicine(720),
      batches: [{
        ...medicine(720).batches[0],
        purchaseId: 'pur-1',
        purchaseItemIndex: 0,
      }],
    };
    const nextMedicine = {
      ...currentMedicine,
      batches: [{
        ...currentMedicine.batches[0],
        quantity: 400,
        receivedQuantity: 400,
      }],
    };

    const result = applyInventorySnapshotTransaction({
      medicines: [currentMedicine],
      stockMovements: [],
      nextMedicines: [nextMedicine],
      type: 'purchase_update_reversal',
      referenceType: 'purchase',
      referenceId: 'pur-1',
      idempotencyScope: 'purchase-update:pur-1:test',
      createdAt: '2026-06-14T11:00:00.000Z',
    });

    expect(result.medicines[0].batches[0].quantity).toBe(400);
    expect(result.medicines[0].batches[0].receivedQuantity).toBe(400);
    expect(result.appendedMovements).toHaveLength(1);
    expect(result.appendedMovements[0]).toMatchObject({
      type: 'purchase_update_reversal',
      quantityBaseUnit: -320,
      previousStock: 720,
      newStock: 400,
      referenceType: 'purchase',
    });
  });

  it('plans purchase receipt stock through the inventory transaction service', () => {
    const sourcePurchase = purchase();
    const receipt: PurchaseReceipt = {
      id: 'rec-1',
      date: '2026-06-14T11:00:00.000Z',
      recordedBy: 'Tester',
      supplierLiabilityImpact: true,
      items: [{
        medicineId: 'med-1',
        purchaseItemIndex: 0,
        batchId: 'batch-1',
        batchNumber: 'B-1',
        quantity: 100,
        baseQuantity: 100,
        purchasePrice: 10,
      }],
    };
    const currentMedicine = {
      ...medicine(220),
      batches: [{
        ...medicine(220).batches[0],
        purchaseId: sourcePurchase.id,
        purchaseItemIndex: 0,
        receivedQuantity: 500,
      }],
    };
    const plannedMedicines = buildPurchaseReceiptMedicineSnapshot({
      medicines: [currentMedicine],
      invoices: [],
      purchase: sourcePurchase,
      receipt,
      createdAt: '2026-06-14T11:00:00.000Z',
    });

    const result = applyInventorySnapshotTransaction({
      medicines: [currentMedicine],
      stockMovements: [],
      nextMedicines: plannedMedicines,
      type: 'purchase_receipt',
      referenceType: 'purchase_receipt',
      referenceId: receipt.id,
      idempotencyScope: `purchase-receipt:${sourcePurchase.id}:${receipt.id}`,
      createdAt: '2026-06-14T11:00:00.000Z',
    });

    expect(plannedMedicines[0].batches[0].quantity).toBe(320);
    expect(result.medicines[0].batches[0].quantity).toBe(320);
    expect(result.medicines[0].batches[0].receivedQuantity).toBe(600);
    expect(result.appendedMovements[0]).toMatchObject({
      type: 'purchase_receipt',
      quantityBaseUnit: 100,
      previousStock: 220,
      newStock: 320,
    });
  });

  it('plans vendor return stock decrement inside the inventory transaction service', () => {
    const currentMedicine: Medicine = {
      ...medicine(10),
      batches: [{
        ...medicine(10).batches[0],
        quantity: 10,
        receivedQuantity: 10,
        purchasePrice: 50,
        supplierId: 'sup-1',
      }],
    };
    const suppliers: Supplier[] = [{
      id: 'sup-1',
      name: 'Supplier One',
      phone: '0700000000',
      balance: 0,
      transactions: [],
    }];

    const mutation = buildVendorReturnInventoryMutation({
      medicines: [currentMedicine],
      purchases: [],
      suppliers,
      medicineId: 'med-1',
      batchId: 'batch-1',
      quantity: 2,
      description: 'Damaged packs',
      supplierId: 'sup-1',
      amount: 100,
      resolution: 'vendor_credit',
      actorName: 'Tester',
      nowIso: '2026-06-14T12:00:00.000Z',
    });
    const result = applyInventorySnapshotTransaction({
      medicines: [currentMedicine],
      stockMovements: [],
      nextMedicines: mutation.updatedMedicines,
      type: 'vendor_return',
      referenceType: 'vendor_return',
      referenceId: mutation.vendorCredit.id,
      idempotencyScope: `vendor-return:${mutation.vendorCredit.id}`,
      createdAt: '2026-06-14T12:00:00.000Z',
    });

    expect(mutation.updatedBatch.quantity).toBe(8);
    expect(result.medicines[0].batches[0].quantity).toBe(8);
    expect(result.appendedMovements[0]).toMatchObject({
      type: 'vendor_return',
      quantityBaseUnit: -2,
      previousStock: 10,
      newStock: 8,
    });
  });
});
