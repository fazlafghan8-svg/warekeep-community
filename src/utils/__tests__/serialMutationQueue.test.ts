import { describe, expect, it } from 'vitest';
import type { Invoice, Medicine, StockMovement } from '@/types';
import {
  applyInventoryTransaction,
  buildInvoiceSaleMovementDrafts,
  InventoryTransactionError,
} from '@/services/inventoryTransactionService';
import { enqueueSerialMutation, type SerialMutationQueueRef } from '../serialMutationQueue';

const medicine = (quantity: number): Medicine => ({
  id: 'med-1',
  name: 'Queued Medicine',
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

const invoice = (id: string, quantity: number): Invoice => ({
  id,
  invoiceNumber: id === 'inv-1' ? 1001 : 1002,
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
  date: '2026-06-15T08:00:00.000Z',
  paymentStatus: 'paid',
  amountPaid: quantity * 20,
  remainingAmount: 0,
});

describe('serial mutation queue', () => {
  it('runs local invoice-like commits one at a time in call order', async () => {
    const queueRef: SerialMutationQueueRef = { current: Promise.resolve() };
    const events: string[] = [];
    let releaseFirst: () => void = () => undefined;

    const first = enqueueSerialMutation(queueRef, async () => {
      events.push('first:start');
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      events.push('first:end');
      return 'first';
    });
    const second = enqueueSerialMutation(queueRef, async () => {
      events.push('second:start');
      events.push('second:end');
      return 'second';
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(['first:start']);

    releaseFirst();
    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('prevents two queued invoice saves from overselling when the second reads fresh stock', async () => {
    const queueRef: SerialMutationQueueRef = { current: Promise.resolve() };
    let medicines = [medicine(720)];
    let stockMovements: StockMovement[] = [];

    const saveInvoice = (invoiceId: string, quantity: number) => enqueueSerialMutation(queueRef, async () => {
      const result = applyInventoryTransaction({
        medicines,
        stockMovements,
        movements: buildInvoiceSaleMovementDrafts(invoice(invoiceId, quantity)),
        createdAt: `2026-06-15T08:0${invoiceId === 'inv-1' ? '0' : '1'}:00.000Z`,
      });
      medicines = result.medicines;
      stockMovements = result.stockMovements;
      return result;
    });

    const first = saveInvoice('inv-1', 500);
    const second = saveInvoice('inv-2', 300);

    await expect(first).resolves.toMatchObject({
      appendedMovements: [expect.objectContaining({ quantityBaseUnit: -500 })],
    });
    await expect(second).rejects.toThrow(InventoryTransactionError);
    expect(medicines[0].batches[0].quantity).toBe(220);
    expect(stockMovements).toHaveLength(1);
  });
});
