import { describe, expect, it } from 'vitest';
import type { Purchase } from '../../types';
import {
  buildPurchaseBatchPayload,
  buildPurchaseReceiptBatchPayload,
  buildSupplierFinanceTaggedNote,
  buildSupplierSettlementPlan,
  getPurchaseItemBaseUnitCost,
  getSupplierFinanceSummary,
  getSupplierBalanceDisplay,
  getSupplierBalanceStatus,
  getSupplierCurrentDebt,
  getPurchaseReceivedQuantity,
  getSupplierPrepayment,
  normalizePurchaseRecord,
  purchaseAffectsInventory,
  purchaseAffectsSupplierLedger,
  validatePurchaseBatchPayloadIntegrity,
} from '../purchaseUtils';

describe('purchaseUtils procurement extensions', () => {
  it('keeps approved purchases off official stock until received', () => {
    const purchase = normalizePurchaseRecord({
      id: 'pur-legacy',
      supplierId: 'sup-1',
      date: '2026-04-01',
      items: [
        {
          medicineId: 'med-1',
          batchNumber: 'LEG-01',
          expiryDate: '2027-01-01',
          quantity: 10,
          purchasePrice: 5,
        },
      ],
      totalAmount: 50,
      paidAmount: 0,
      remainingAmount: 50,
      workflowStatus: 'approved',
      status: 'approved',
    } as Purchase);

    expect(purchase.inventoryCommitted).toBe(false);
    expect(purchase.receiptStatus).toBe('not_received');
    expect(getPurchaseReceivedQuantity(purchase)).toBe(0);
    expect(purchaseAffectsInventory(purchase)).toBe(false);
  });

  it('stores purchase batch cost per base unit when buying larger units', () => {
    const item = {
      medicineId: 'med-box',
      batchNumber: 'BOX-1',
      expiryDate: '2027-01-01',
      quantity: 1,
      baseQuantity: 100,
      purchaseUnitName: 'box',
      purchaseUnitConversionFactor: 100,
      baseUnit: 'tablet',
      purchasePrice: 500,
      lineTotal: 500,
    };

    expect(getPurchaseItemBaseUnitCost(item)).toBe(5);

    const [payload] = buildPurchaseBatchPayload('sup-1', [item as any]);
    expect(payload.batch.quantity).toBe(100);
    expect(payload.batch.purchasePrice).toBe(5);
  });

  it('uses the current invoice number as the purchase item source document', () => {
    const purchase = normalizePurchaseRecord({
      id: 'pur-source-doc',
      supplierId: 'sup-1',
      invoiceNumber: 'INV-NEW',
      date: '2026-04-01',
      items: [
        {
          medicineId: 'med-1',
          batchNumber: 'SRC-01',
          expiryDate: '2027-01-01',
          quantity: 10,
          purchasePrice: 5,
          sourceDocumentNumber: 'INV-OLD',
        },
      ],
      totalAmount: 50,
      paidAmount: 0,
      remainingAmount: 50,
      workflowStatus: 'received',
      status: 'received',
    } as Purchase);

    expect(purchase.items[0].sourceDocumentNumber).toBe('INV-NEW');
    expect(buildPurchaseBatchPayload('sup-1', purchase.items)[0].batch.sourceDocumentNumber).toBe('INV-NEW');
  });

  it('builds receipt batch payloads from received quantities only', () => {
    const item = {
      medicineId: 'med-box',
      batchNumber: 'BOX-2',
      expiryDate: '2027-01-01',
      quantity: 1,
      baseQuantity: 100,
      purchaseUnitName: 'box',
      purchaseUnitConversionFactor: 100,
      baseUnit: 'tablet',
      purchasePrice: 500,
      lineTotal: 500,
    };

    const [payload] = buildPurchaseReceiptBatchPayload('sup-1', [item as any], [{
      medicineId: 'med-box',
      purchaseItemIndex: 0,
      batchNumber: 'BOX-2',
      quantity: 30,
      baseQuantity: 30,
      purchasePrice: 5,
    }], {
      sourceReceiptId: 'receipt-1',
      receivedAt: '2026-04-02T09:00:00.000Z',
    });

    expect(payload.batch.quantity).toBe(30);
    expect(payload.batch.receivedQuantity).toBe(30);
    expect(payload.batch.purchasePrice).toBe(5);
    expect(payload.batch.traceSource).toBe('purchase_receipt');
    expect(payload.batch.sourceReceiptId).toBe('receipt-1');
  });

  it('maps one received B3 purchase with five stable lines to five batch records', () => {
    const items = Array.from({ length: 5 }, (_, index) => ({
      lineId: `b3-line-${index + 1}`,
      medicineId: `med-${index + 1}`,
      medicineName: `Medicine ${index + 1}`,
      batchNumber: `B3-${index + 1}`,
      expiryDate: '2027-01-01',
      quantity: index + 1,
      baseQuantity: index + 1,
      purchasePrice: 10 + index,
      lineTotal: (index + 1) * (10 + index),
    }));
    const purchase = normalizePurchaseRecord({
      id: 'pur-b3',
      supplierId: 'sup-1',
      invoiceNumber: 'B3',
      date: '2026-06-30',
      items,
      totalAmount: 190,
      paidAmount: 0,
      remainingAmount: 190,
      workflowStatus: 'received',
      status: 'received',
      inventoryCommitted: true,
      receipts: [{
        id: 'receipt-b3',
        date: '2026-06-30',
        supplierLiabilityImpact: true,
        items: items.map((item, index) => ({
          lineId: item.lineId,
          medicineId: item.medicineId,
          purchaseItemIndex: index,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          quantity: item.baseQuantity,
          baseQuantity: item.baseQuantity,
          purchasePrice: item.purchasePrice,
        })),
      }],
    } as Purchase);

    const batchPayload = buildPurchaseReceiptBatchPayload('sup-1', purchase.items, purchase.receipts?.[0].items || [], {
      sourceReceiptId: 'receipt-b3',
      receivedAt: '2026-06-30',
    });

    expect(batchPayload).toHaveLength(5);
    expect(batchPayload.map((entry) => entry.batch.purchaseLineId)).toEqual(items.map((item) => item.lineId));
    expect(validatePurchaseBatchPayloadIntegrity(purchase, batchPayload)).toEqual([]);
  });

  it('blocks partial batch payloads for received purchase lines instead of silently saving', () => {
    const purchase = normalizePurchaseRecord({
      id: 'pur-b3-partial',
      supplierId: 'sup-1',
      invoiceNumber: 'B3',
      date: '2026-06-30',
      items: Array.from({ length: 5 }, (_, index) => ({
        lineId: `line-${index + 1}`,
        medicineId: `med-${index + 1}`,
        batchNumber: `B3-${index + 1}`,
        expiryDate: '2027-01-01',
        quantity: 1,
        purchasePrice: 10,
      })),
      receipts: [{
        id: 'receipt-b3',
        date: '2026-06-30',
        items: Array.from({ length: 5 }, (_, index) => ({
          lineId: `line-${index + 1}`,
          medicineId: `med-${index + 1}`,
          purchaseItemIndex: index,
          batchNumber: `B3-${index + 1}`,
          quantity: 1,
          baseQuantity: 1,
        })),
      }],
      totalAmount: 50,
      paidAmount: 0,
      remainingAmount: 50,
      workflowStatus: 'received',
      status: 'received',
      inventoryCommitted: true,
    } as Purchase);

    const fullPayload = buildPurchaseReceiptBatchPayload('sup-1', purchase.items, purchase.receipts?.[0].items || []);
    const issues = validatePurchaseBatchPayloadIntegrity(purchase, fullPayload.slice(0, 3));

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'missing_batch_for_received_line', lineId: 'line-4' }),
      expect.objectContaining({ type: 'missing_batch_for_received_line', lineId: 'line-5' }),
      expect.objectContaining({ type: 'batch_count_mismatch', expectedBatchCount: 5, actualBatchCount: 3 }),
    ]));
  });

  it('preserves lineId-to-batchId mapping when purchase lines are reordered during edit', () => {
    const items = [
      { lineId: 'line-a', medicineId: 'med-a', batchNumber: 'A-1', expiryDate: '2027-01-01', quantity: 2, purchasePrice: 10 },
      { lineId: 'line-b', medicineId: 'med-b', batchNumber: 'B-1', expiryDate: '2027-01-01', quantity: 3, purchasePrice: 11 },
    ] as any[];
    const reorderedItems = [items[1], items[0]];
    const [payload] = buildPurchaseReceiptBatchPayload('sup-1', reorderedItems, [{
      lineId: 'line-a',
      medicineId: 'med-a',
      batchNumber: 'A-1',
      quantity: 2,
      baseQuantity: 2,
    }]);

    expect(payload.batch.purchaseLineId).toBe('line-a');
    expect(payload.batch.purchaseItemIndex).toBe(1);
  });

  it('NEW - allows approved purchases to stay off-stock until a purchase receipt exists', () => {
    const purchase = normalizePurchaseRecord({
      id: 'pur-new',
      supplierId: 'sup-1',
      date: '2026-04-01',
      items: [
        {
          medicineId: 'med-1',
          batchNumber: 'APR-01',
          expiryDate: '2027-01-01',
          quantity: 12,
          purchasePrice: 8,
        },
      ],
      totalAmount: 96,
      paidAmount: 0,
      remainingAmount: 96,
      workflowStatus: 'approved',
      status: 'approved',
      inventoryCommitted: false,
    } as Purchase);

    expect(purchase.inventoryCommitted).toBe(false);
    expect(purchase.receiptStatus).toBe('not_received');
    expect(getPurchaseReceivedQuantity(purchase)).toBe(0);
    expect(purchaseAffectsInventory(purchase)).toBe(false);
  });

  it('never lets draft purchases affect stock even if inventoryCommitted is true', () => {
    const draftPurchase = normalizePurchaseRecord({
      id: 'pur-draft-committed',
      supplierId: 'sup-1',
      date: '2026-04-01',
      items: [
        {
          medicineId: 'med-1',
          batchNumber: 'DRAFT-01',
          expiryDate: '2027-01-01',
          quantity: 8,
          purchasePrice: 9,
        },
      ],
      totalAmount: 72,
      paidAmount: 0,
      remainingAmount: 72,
      workflowStatus: 'draft',
      status: 'draft',
      inventoryCommitted: true,
      receivedAt: '2026-04-01T10:00:00.000Z',
    } as Purchase);

    const finalizedPurchase = normalizePurchaseRecord({
      ...draftPurchase,
      workflowStatus: 'received',
      status: 'credit',
    } as Purchase);

    expect(getPurchaseReceivedQuantity(draftPurchase)).toBe(0);
    expect(draftPurchase.inventoryCommitted).toBe(false);
    expect(draftPurchase.receiptStatus).toBe('not_received');
    expect(purchaseAffectsInventory(draftPurchase)).toBe(false);
    expect(purchaseAffectsSupplierLedger(draftPurchase)).toBe(false);
    expect(purchaseAffectsSupplierLedger(finalizedPurchase)).toBe(true);
  });

  it('NEW - aggregates partial receipts, payments, and vendor credits without double counting', () => {
    const purchase = normalizePurchaseRecord({
      id: 'pur-partial',
      supplierId: 'sup-2',
      date: '2026-04-01',
      items: [
        {
          medicineId: 'med-2',
          batchNumber: 'REC-01',
          expiryDate: '2027-12-01',
          quantity: 10,
          purchasePrice: 100,
        },
      ],
      totalAmount: 1000,
      paidAmount: 0,
      remainingAmount: 1000,
      workflowStatus: 'received',
      status: 'received',
      inventoryCommitted: true,
      payments: [
        {
          id: 'pay-1',
          date: '2026-04-02',
          amount: 200,
          method: 'cash',
        },
      ],
      receipts: [
        {
          id: 'rec-1',
          date: '2026-04-02',
          items: [
            {
              medicineId: 'med-2',
              purchaseItemIndex: 0,
              quantity: 4,
            },
          ],
        },
      ],
      vendorCredits: [
        {
          id: 'vc-1',
          date: '2026-04-03',
          amount: 100,
          items: [
            {
              medicineId: 'med-2',
              quantity: 1,
              amount: 100,
            },
          ],
        },
      ],
    } as Purchase);

    expect(getPurchaseReceivedQuantity(purchase)).toBe(4);
    expect(purchase.receiptStatus).toBe('partial');
    expect(purchase.paidAmount).toBe(200);
    expect(purchase.creditedAmount).toBe(100);
    expect(purchase.remainingAmount).toBe(700);
    expect(purchase.paymentStatus).toBe('partial');
    expect(purchaseAffectsInventory(purchase)).toBe(true);
  });

  it('rebuilds invoice money from edited purchase lines instead of stale totals', () => {
    const purchase = normalizePurchaseRecord({
      id: 'pur-linked-batch-edit',
      supplierId: 'sup-2',
      date: '2026-04-01',
      items: [
        {
          medicineId: 'med-2',
          batchNumber: 'REC-EDIT',
          expiryDate: '2027-12-01',
          quantity: 7,
          purchasePrice: 80,
        },
      ],
      subtotalAmount: 1000,
      totalAmount: 1000,
      paidAmount: 200,
      remainingAmount: 800,
      workflowStatus: 'received',
      status: 'partial',
      inventoryCommitted: true,
      payments: [
        {
          id: 'pay-1',
          date: '2026-04-02',
          amount: 200,
          method: 'cash',
        },
      ],
    } as Purchase);

    expect(purchase.subtotalAmount).toBe(560);
    expect(purchase.totalAmount).toBe(560);
    expect(purchase.paidAmount).toBe(200);
    expect(purchase.remainingAmount).toBe(360);
    expect(purchase.paymentStatus).toBe('partial');
  });

  it('recomputes stale receiptStatus from actual receipt totals', () => {
    const purchase = normalizePurchaseRecord({
      id: 'pur-stale-status',
      supplierId: 'sup-2',
      date: '2026-04-01',
      items: [
        {
          medicineId: 'med-2',
          batchNumber: 'REC-02',
          expiryDate: '2027-12-01',
          quantity: 10,
          purchasePrice: 100,
        },
      ],
      totalAmount: 1000,
      paidAmount: 0,
      remainingAmount: 1000,
      workflowStatus: 'received',
      status: 'received',
      inventoryCommitted: true,
      receiptStatus: 'not_received',
      receipts: [
        {
          id: 'rec-1',
          date: '2026-04-02',
          items: [
            {
              medicineId: 'med-2',
              purchaseItemIndex: 0,
              quantity: 4,
            },
          ],
        },
      ],
    } as Purchase);

    expect(purchase.receiptStatus).toBe('partial');
  });

  it('splits signed supplier balances into debt, settled, and prepayment states', () => {
    expect(getSupplierCurrentDebt(1250)).toBe(1250);
    expect(getSupplierPrepayment(1250)).toBe(0);
    expect(getSupplierBalanceStatus(1250)).toBe('debt');
    expect(getSupplierBalanceDisplay(1250)).toMatchObject({
      currentDebt: 1250,
      supplierPrepayment: 0,
      status: 'debt',
      displayAmount: 1250,
    });

    expect(getSupplierCurrentDebt(0)).toBe(0);
    expect(getSupplierPrepayment(0)).toBe(0);
    expect(getSupplierBalanceStatus(0)).toBe('settled');
    expect(getSupplierBalanceDisplay(0)).toMatchObject({
      currentDebt: 0,
      supplierPrepayment: 0,
      status: 'settled',
      displayAmount: 0,
    });

    expect(getSupplierCurrentDebt(-480)).toBe(0);
    expect(getSupplierPrepayment(-480)).toBe(480);
    expect(getSupplierBalanceStatus(-480)).toBe('prepaid');
    expect(getSupplierBalanceDisplay(-480)).toMatchObject({
      currentDebt: 0,
      supplierPrepayment: 480,
      status: 'prepaid',
      displayAmount: 480,
    });
  });

  it('derives open debt and real supplier prepayment separately', () => {
    const purchase = normalizePurchaseRecord({
      id: 'pur-supplier-open',
      supplierId: 'sup-open',
      invoiceNumber: 'PO-1',
      date: '2026-04-01',
      totalAmount: 300,
      paidAmount: 0,
      remainingAmount: 300,
      workflowStatus: 'received',
      status: 'credit',
      items: [
        {
          medicineId: 'med-1',
          batchNumber: 'B-1',
          expiryDate: '2027-01-01',
          quantity: 10,
          purchasePrice: 30,
        },
      ],
      payments: [],
      vendorCredits: [],
    } as Purchase);

    const summary = getSupplierFinanceSummary({
      id: 'sup-open',
      balance: 100,
      openingBalance: 0,
      transactions: [
        {
          id: 'sup-open-purchase',
          date: '2026-04-01T08:00:00.000Z',
          type: 'purchase',
          amount: 300,
          balanceAfter: 300,
          description: 'Purchase invoice PO-1',
          purchaseId: purchase.id,
        },
        {
          id: 'sup-open-advance',
          date: '2026-04-02T09:00:00.000Z',
          type: 'payment',
          amount: 200,
          balanceAfter: 100,
          description: 'Advance payment',
          note: buildSupplierFinanceTaggedNote('advance_payment', 'Advance for future invoice'),
        },
      ],
    } as any, [purchase]);

    expect(summary.openDebt).toBe(300);
    expect(summary.supplierPrepayment).toBe(200);
    expect(summary.primaryStatus).toBe('open_debt');
    expect(summary.hasMixedPosition).toBe(true);
  });

  it('counts negative opening balance and reusable vendor credit as supplier prepayment', () => {
    const purchase = normalizePurchaseRecord({
      id: 'pur-credit',
      supplierId: 'sup-credit',
      date: '2026-04-01',
      totalAmount: 200,
      paidAmount: 0,
      remainingAmount: 0,
      workflowStatus: 'received',
      status: 'paid',
      items: [
        {
          medicineId: 'med-1',
          batchNumber: 'B-2',
          expiryDate: '2027-01-01',
          quantity: 4,
          purchasePrice: 50,
        },
      ],
      vendorCredits: [
        {
          id: 'vc-credit',
          date: '2026-04-02',
          amount: 60,
          resolution: 'vendor_credit',
          items: [],
        },
        {
          id: 'vc-refund',
          date: '2026-04-03',
          amount: 30,
          resolution: 'refund',
          items: [],
        },
      ],
    } as Purchase);

    const summary = getSupplierFinanceSummary({
      id: 'sup-credit',
      balance: -140,
      openingBalance: -80,
      transactions: [],
    } as any, [purchase]);

    expect(purchase.remainingAmount).toBe(0);
    expect(purchase.paymentStatus).toBe('paid');
    expect(summary.openDebt).toBe(0);
    expect(summary.supplierPrepayment).toBe(140);
    expect(summary.openingCredit).toBe(80);
    expect(summary.vendorCreditPrepaymentTotal).toBe(60);
    expect(summary.primaryStatus).toBe('prepaid');
  });

  it('allocates settlement to oldest open invoice, then opening debt, then overflow prepayment', () => {
    const plan = buildSupplierSettlementPlan({
      supplier: {
        id: 'sup-plan',
        balance: 700,
        openingBalance: 200,
        transactions: [],
      } as any,
      purchases: [
        normalizePurchaseRecord({
          id: 'purchase-newer',
          supplierId: 'sup-plan',
          date: '2026-04-02',
          dueDate: '2026-04-12',
          totalAmount: 300,
          paidAmount: 0,
          remainingAmount: 300,
          workflowStatus: 'received',
          status: 'credit',
          items: [{ medicineId: 'med-1', batchNumber: 'B-1', expiryDate: '2027-01-01', quantity: 3, purchasePrice: 100 }],
        } as Purchase),
        normalizePurchaseRecord({
          id: 'purchase-older',
          supplierId: 'sup-plan',
          date: '2026-04-01',
          dueDate: '2026-04-10',
          totalAmount: 200,
          paidAmount: 0,
          remainingAmount: 200,
          workflowStatus: 'received',
          status: 'credit',
          items: [{ medicineId: 'med-2', batchNumber: 'B-2', expiryDate: '2027-01-01', quantity: 2, purchasePrice: 100 }],
        } as Purchase),
      ],
      amount: 800,
    });

    expect(plan.purchaseAllocations).toEqual([
      { purchaseId: 'purchase-older', amount: 200 },
      { purchaseId: 'purchase-newer', amount: 300 },
    ]);
    expect(plan.openingDebtAllocation).toBe(200);
    expect(plan.advancePaymentAmount).toBe(100);
  });
});
