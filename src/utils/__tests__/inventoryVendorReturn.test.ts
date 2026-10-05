import { describe, expect, it } from 'vitest';
import type { Medicine, Purchase, Supplier } from '../../types';
import { buildInventoryVendorReturnMutation, type BuildInventoryVendorReturnMutationArgs } from '../inventoryVendorReturn';

const makeReturnArgs = (): BuildInventoryVendorReturnMutationArgs => ({
  medicines: [{ id: 'med-1', name: 'داروی شخصی', manufacturer: 'ACME', type: 'Tablet', unit: 'دانه', batches: [{ id: 'batch-1', batchNumber: 'B-1', quantity: 10, expiryDate: '2027-01-01', purchasePrice: 50, history: [{ date: '2026-04-01', action: 'یادداشت شخصی', details: 'شرح شخصی' }] }], salePrices: { retail: 80, wholesale: 75, bulk: 70 }, lowStockThreshold: 2 }],
  purchases: [],
  suppliers: [{ id: 'sup-1', name: 'نام شخصی', phone: '', balance: 0, transactions: [] }],
  medicineId: 'med-1', batchId: 'batch-1', quantity: 2, supplierId: 'sup-1', description: '', amount: 90, actorName: 'Tester', nowIso: '2026-04-02T10:00:00.000Z',
});

describe('inventory vendor return mutation', () => {
  it('writes English generated return records and keeps existing user text and financial amounts', () => {
    const args = makeReturnArgs();
    const original = structuredClone(args);
    const dariMutation = buildInventoryVendorReturnMutation(args);
    const englishMutation = buildInventoryVendorReturnMutation({ ...args, language: 'english' });
    const lastHistory = englishMutation.updatedBatch.history.at(-1);
    expect(englishMutation.createdPurchase.destinationWarehouse).toBe('Main warehouse');
    expect(englishMutation.vendorCredit.note).toBe('Supplier return');
    expect(lastHistory?.action).toBe('Supplier return');
    expect(lastHistory?.details).not.toMatch(/[\u0600-\u06ff]/);
    englishMutation.updatedSupplier.transactions.forEach(entry => expect(entry.description).not.toMatch(/[\u0600-\u06ff]/));
    expect(englishMutation.updatedSupplier.auditTrail?.at(-1)?.note).not.toMatch(/[\u0600-\u06ff]/);
    expect(englishMutation.updatedMedicines[0].name).toBe(args.medicines[0].name);
    expect(englishMutation.updatedSupplier.name).toBe(args.suppliers[0].name);
    expect(englishMutation.updatedBatch.history[0]).toEqual(args.medicines[0].batches[0].history[0]);
    expect(englishMutation.updatedSupplier.balance).toBe(dariMutation.updatedSupplier.balance);
    expect(englishMutation.creditAmount).toBe(dariMutation.creditAmount);
    expect(dariMutation.createdPurchase.destinationWarehouse).toBe('گدام اصلی');
    expect(dariMutation.vendorCredit.note).toBe('مرجوعی به تأمین‌کننده');
    const customMutation = buildInventoryVendorReturnMutation({ ...args, language: 'english', description: 'شرح شخصی' });
    expect(customMutation.vendorCredit.note).toBe('شرح شخصی');
    expect(customMutation.createdPurchase.items[0].notes).toBe('شرح شخصی');
    expect(args).toEqual(original);
  });

  it.each([
    [{ quantity: 0 }, 'Return quantity must be greater than zero.'],
    [{ medicineId: 'missing' }, 'Selected medicine was not found.'],
    [{ batchId: 'missing' }, 'Selected batch was not found.'],
    [{ quantity: 11 }, 'Return quantity exceeds the batch stock.'],
    [{ supplierId: undefined }, 'Select a supplier for this return.'],
    [{ supplierId: 'missing' }, 'Selected supplier is invalid.'],
  ] as Array<[Partial<BuildInventoryVendorReturnMutationArgs>, string]>)('reports English validation errors for %j', (overrides, message) => {
    expect(() => buildInventoryVendorReturnMutation({ ...makeReturnArgs(), ...overrides, language: 'english' })).toThrow(message);
  });

  it('reports invalid return value in English and retains the Dari default', () => {
    const args = makeReturnArgs();
    args.amount = 0;
    args.medicines[0].batches[0].purchasePrice = 0;
    expect(() => buildInventoryVendorReturnMutation({ ...args, language: 'english' })).toThrow('Return amount must be greater than zero.');
    expect(() => buildInventoryVendorReturnMutation(args)).toThrow('مبلغ مرجوعی باید بیشتر از صفر باشد.');
  });

  it('builds vendor return metadata, purchase, and supplier updates from an unlinked batch', () => {
    const medicines: Medicine[] = [
      {
        id: 'med-1',
        name: 'Amoxicillin',
        manufacturer: 'ACME',
        type: 'Capsule',
        unit: 'بسته',
        batches: [
          {
            id: 'batch-1',
            batchNumber: 'B-100',
            quantity: 10,
            expiryDate: '2027-01-01',
            purchasePrice: 50,
            history: [],
          },
        ],
        salePrices: {
          retail: 80,
          wholesale: 75,
          bulk: 70,
        },
        lowStockThreshold: 2,
      },
    ];

    const purchases: Purchase[] = [
      {
        id: 'pur-1',
        supplierId: 'sup-1',
        invoiceNumber: 'PI-100',
        date: '2026-04-01',
        items: [
          {
            medicineId: 'med-1',
            medicineName: 'Amoxicillin',
            batchNumber: 'B-100',
            expiryDate: '2027-01-01',
            quantity: 10,
            purchasePrice: 50,
          },
        ],
        totalAmount: 500,
        paidAmount: 0,
        remainingAmount: 500,
        workflowStatus: 'received',
        status: 'received',
        payments: [],
        receipts: [],
        vendorCredits: [],
      },
    ];

    const suppliers: Supplier[] = [
      {
        id: 'sup-1',
        name: 'Supplier One',
        phone: '0700000000',
        balance: 500,
        transactions: [
          {
            id: 'txn-1',
            date: '2026-04-01',
            type: 'purchase',
            amount: 500,
            balanceAfter: 500,
            description: 'Purchase invoice PI-100',
          },
        ],
      },
    ];

    const mutation = buildInventoryVendorReturnMutation({
      medicines,
      purchases,
      suppliers,
      medicineId: 'med-1',
      batchId: 'batch-1',
      quantity: 2,
      description: 'Damaged blister packs',
      supplierId: 'sup-1',
      amount: 60,
      resolution: 'refund',
      actorName: 'Tester',
      nowIso: '2026-04-02T10:00:00.000Z',
    });

    expect(mutation.updatedBatch.quantity).toBe(10);
    expect(mutation.updatedBatch.supplierId).toBeUndefined();
    expect(mutation.updatedBatch.purchaseId).toBeUndefined();
    expect(mutation.updatedBatch.linkedReturnId).toBe(mutation.vendorCredit.id);
    expect(mutation.purchaseMode).toBe('createReturnReferencePurchase');
    expect(mutation.sourcePurchaseId).toBeUndefined();

    expect(mutation.vendorCredit.amount).toBe(60);
    expect(mutation.vendorCredit.resolution).toBe('refund');
    expect(mutation.updatedPurchase.vendorCredits).toHaveLength(1);
    expect(mutation.updatedPurchase.remainingAmount).toBe(0);
    expect(mutation.updatedPurchase.creditedAmount).toBe(60);

    expect(mutation.updatedSupplier.balance).toBe(500);
    expect(mutation.updatedSupplier.transactions).toHaveLength(3);
    expect(mutation.updatedSupplier.transactions[2]).toMatchObject({
      type: 'vendor_credit',
      amount: 60,
      purchaseId: mutation.updatedPurchase.id,
      batchId: 'batch-1',
    });
  });

  it('auto-creates a purchase reference and keeps supplier balance netted to zero', () => {
    const medicines: Medicine[] = [
      {
        id: 'med-1',
        name: 'Amoxicillin',
        manufacturer: 'ACME',
        type: 'Capsule',
        unit: 'بسته',
        batches: [
          {
            id: 'batch-1',
            batchNumber: 'B-100',
            quantity: 10,
            expiryDate: '2027-01-01',
            purchasePrice: 50,
            history: [],
          },
        ],
        salePrices: {
          retail: 80,
          wholesale: 75,
          bulk: 70,
        },
        lowStockThreshold: 2,
      },
    ];

    const suppliers: Supplier[] = [
      {
        id: 'sup-1',
        name: 'Supplier One',
        phone: '0700000000',
        balance: 0,
        transactions: [],
      },
    ];

    const mutation = buildInventoryVendorReturnMutation({
      medicines,
      purchases: [],
      suppliers,
      medicineId: 'med-1',
      batchId: 'batch-1',
      quantity: 2,
      description: 'Damaged blister packs',
      supplierId: 'sup-1',
      amount: 90,
      resolution: 'vendor_credit',
      actorName: 'Tester',
      nowIso: '2026-04-02T10:00:00.000Z',
    });

    expect(mutation.purchaseMode).toBe('createReturnReferencePurchase');
    expect(mutation.createdPurchase).toBeDefined();
    expect(mutation.updatedPurchase.id).toBe(`ret-pur-${mutation.vendorCredit.id}`);
    expect(mutation.updatedPurchase.invoiceNumber).toMatch(/^RET-/);
    expect(mutation.updatedPurchase.vendorCredits).toHaveLength(1);
    expect(mutation.updatedPurchase.creditedAmount).toBe(90);
    expect(mutation.updatedPurchase.remainingAmount).toBe(0);
    expect(mutation.updatedPurchases).toHaveLength(1);
    expect(mutation.updatedBatch.purchaseId).toBeUndefined();
    expect(mutation.updatedBatch.purchaseItemIndex).toBeUndefined();
    expect(mutation.updatedSupplier.transactions).toHaveLength(2);
    expect(mutation.updatedSupplier.transactions[0]).toMatchObject({
      type: 'purchase',
      amount: 90,
      purchaseId: mutation.updatedPurchase.id,
    });
    expect(mutation.updatedSupplier.transactions[1]).toMatchObject({
      type: 'vendor_credit',
      amount: 90,
      purchaseId: mutation.updatedPurchase.id,
      vendorCreditId: mutation.vendorCredit.id,
    });
    expect(mutation.updatedSupplier.balance).toBe(0);
  });
});
