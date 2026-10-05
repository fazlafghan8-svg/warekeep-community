import { describe, expect, it } from 'vitest';
import type { Invoice, Medicine, Partner, Purchase } from '../../types';
import { buildPartnerAccountingModel } from '../partnerAccounting';

const now = new Date('2026-06-03T08:00:00.000Z');

const makePartner = (overrides: Partial<Partner>): Partner => ({
  id: overrides.id || 'partner-1',
  name: overrides.name || 'Partner',
  openingCapital: overrides.openingCapital ?? 0,
  openingGoodsCapital: overrides.openingGoodsCapital ?? 0,
  sharePercentage: overrides.sharePercentage ?? 100,
  capitalType: overrides.capitalType || 'goods',
  profitRule: overrides.profitRule || { type: 'own_goods_100', sharePercentage: 100 },
  settlementPeriod: overrides.settlementPeriod || 'monthly',
  status: overrides.status || 'active',
  notes: overrides.notes,
  ledger: overrides.ledger || [],
  createdAt: overrides.createdAt || '2026-06-01T00:00:00.000Z',
  updatedAt: overrides.updatedAt,
  isDeleted: overrides.isDeleted,
});

const assertFiniteSummary = (summary: Record<string, unknown>) => {
  Object.entries(summary).forEach(([key, value]) => {
    if (typeof value === 'number') {
      expect(Number.isFinite(value), key).toBe(true);
    }
  });
};

describe('partnerAccounting', () => {
  it('localizes generated capital and expense entries while preserving user names and descriptions', () => {
    const customDescription = 'یادداشت شخصی';
    const partner = makePartner({ name: 'احمد', openingCapital: 100, openingGoodsCapital: 200, ledger: [{ id: 'manual-entry', type: 'payment', direction: 'out', amount: 5, date: now.toISOString(), description: customDescription }] });
    const args = { partners: [partner], purchases: [], invoices: [], medicines: [], expenses: [{ id: 'expense-1', title: '', amount: 10, category: 'Other', date: now.toISOString(), partnerId: partner.id }, { id: 'expense-2', title: customDescription, amount: 15, category: 'Other', date: now.toISOString(), partnerId: partner.id }], now };
    const original = structuredClone(args);
    const dariModel = buildPartnerAccountingModel(args);
    const englishModel = buildPartnerAccountingModel({ ...args, language: 'english' });
    const englishLedger = englishModel.ledgerByPartnerId.get(partner.id) || [];
    expect(englishLedger.map(entry => entry.description)).toEqual(expect.arrayContaining(['Opening cash capital', 'Opening goods capital', 'Partner expense share']));
    expect(englishLedger.filter(entry => entry.description === customDescription)).toHaveLength(2);
    expect(dariModel.ledgerByPartnerId.get(partner.id)?.map(entry => entry.description)).toContain('سرمایه نقدی ابتدایی');
    expect(englishModel.summaries).toEqual(dariModel.summaries);
    expect(args).toEqual(original);
  });

  it('surfaces synced medicine and purchase item details for partner goods', () => {
    const partner = makePartner({ id: 'partner-sync', name: 'Synced Partner' });
    const syncedMedicineName = 'Paracetamol Plus 500mg';
    const purchase: Purchase = {
      id: 'pur-sync',
      supplierId: 'sup-1',
      partnerId: partner.id,
      stockEntryType: 'partner_goods_capital',
      ownershipType: 'partner',
      invoiceNumber: 'SYNC-100',
      date: '2026-06-01T09:00:00.000Z',
      items: [{
        medicineId: 'med-sync',
        medicineName: syncedMedicineName,
        batchNumber: 'SYNC-B1',
        expiryDate: '2027-06-01T00:00:00.000Z',
        quantity: 20,
        baseQuantity: 20,
        purchasePrice: 50,
        lineTotal: 1000,
        partnerId: partner.id,
        ownerPartnerId: partner.id,
        stockEntryType: 'partner_goods_capital',
        ownershipType: 'partner',
        sourceDocumentNumber: 'SYNC-100',
      }],
      subtotalAmount: 1000,
      totalAmount: 1000,
      paidAmount: 0,
      remainingAmount: 1000,
      workflowStatus: 'received',
      receiptStatus: 'received',
      status: 'credit',
      inventoryCommitted: true,
      receivedAt: '2026-06-01T09:00:00.000Z',
    };
    const medicines: Medicine[] = [{
      id: 'med-sync',
      name: syncedMedicineName,
      manufacturer: 'WareKeep',
      type: 'Tablet',
      unit: 'Ø¯Ø§Ù†Ù‡' as Medicine['unit'],
      batches: [{
        id: 'batch-sync',
        batchNumber: 'SYNC-B1',
        quantity: 20,
        expiryDate: '2027-06-01T00:00:00.000Z',
        purchasePrice: 50,
        purchaseId: purchase.id,
        purchaseItemIndex: 0,
        ownershipType: 'partner',
        ownerPartnerId: partner.id,
        sourceEntryType: 'partner_goods_capital',
        sourceDocumentNumber: 'SYNC-100',
        history: [],
      }],
      salePrices: { retail: 70, wholesale: 65, bulk: 60 },
      lowStockThreshold: 5,
    }];

    const model = buildPartnerAccountingModel({
      partners: [partner],
      purchases: [purchase],
      medicines,
      invoices: [],
      expenses: [],
      now,
    });

    expect(model.medicineRows[0].medicineName).toBe(syncedMedicineName);
    expect(model.contributionRows[0].medicineName).toBe(syncedMedicineName);
    expect(model.contributionRows[0].sourceDocumentNumber).toBe('SYNC-100');
  });

  it('calculates Ahmad goods-capital stock, sale, return, profit and settlement preview', () => {
    const ahmad = makePartner({
      id: 'partner-ahmad',
      name: 'احمد',
      capitalType: 'goods',
      profitRule: { type: 'own_goods_100', sharePercentage: 100 },
    });

    const purchase: Purchase = {
      id: 'pur-ahmad-goods',
      supplierId: 'sup-1',
      partnerId: ahmad.id,
      stockEntryType: 'partner_goods_capital',
      ownershipType: 'partner',
      invoiceNumber: 'AH-100',
      date: '2026-06-01T09:00:00.000Z',
      items: [{
        medicineId: 'med-amox',
        medicineName: 'Amoxicillin',
        batchNumber: 'AH-10K',
        expiryDate: '2027-06-01T00:00:00.000Z',
        quantity: 100,
        baseQuantity: 100,
        purchasePrice: 100,
        lineTotal: 10000,
        partnerId: ahmad.id,
        ownerPartnerId: ahmad.id,
        stockEntryType: 'partner_goods_capital',
        ownershipType: 'partner',
        agreedPartnerValue: 100,
        sourceDocumentNumber: 'AH-100',
      }],
      subtotalAmount: 10000,
      totalAmount: 10000,
      paidAmount: 0,
      remainingAmount: 10000,
      workflowStatus: 'received',
      receiptStatus: 'received',
      status: 'credit',
      payments: [],
      receipts: [],
      vendorCredits: [],
      inventoryCommitted: true,
      receivedAt: '2026-06-01T09:00:00.000Z',
    };

    const medicines: Medicine[] = [{
      id: 'med-amox',
      name: 'Amoxicillin',
      manufacturer: 'WareKeep',
      type: 'Tablet',
      unit: 'دانه',
      baseUnit: 'tablet',
      saleUnits: [],
      batches: [{
        id: 'batch-ahmad',
        batchNumber: 'AH-10K',
        quantity: 75,
        expiryDate: '2027-06-01T00:00:00.000Z',
        purchasePrice: 100,
        purchaseId: purchase.id,
        ownershipType: 'partner',
        ownerPartnerId: ahmad.id,
        sourceEntryType: 'partner_goods_capital',
        sourceDocumentNumber: 'AH-100',
        history: [],
      }],
      salePrices: { retail: 150, wholesale: 145, bulk: 140 },
      lowStockThreshold: 5,
    }];

    const invoices: Invoice[] = [{
      id: 'inv-ahmad',
      invoiceNumber: 45,
      customerId: 'cust-1',
      salesMode: 'retail',
      items: [{
        medicineId: 'med-amox',
        batchId: 'batch-ahmad',
        partnerId: ahmad.id,
        batchOwnershipType: 'partner',
        quantity: 30,
        baseQuantity: 30,
        price: 150,
        costPrice: 100,
        partnerCostPrice: 100,
      }],
      total: 4500,
      tax: 0,
      discount: 0,
      lineDiscountTotal: 0,
      finalAmount: 4500,
      currency: 'AFN',
      returns: [{
        id: 'ret-ahmad',
        invoiceId: 'inv-ahmad',
        customerId: 'cust-1',
        date: '2026-06-02T10:00:00.000Z',
        sourceItemIndex: 0,
        items: [{
          medicineId: 'med-amox',
          batchId: 'batch-ahmad',
          quantity: 5,
          baseQuantity: 5,
          price: 150,
          costPrice: 100,
        }],
        subtotal: 750,
        taxRefund: 0,
        discountRefund: 0,
        totalRefund: 750,
        amountRefunded: 750,
        debtReduction: 0,
      }],
      date: '2026-06-02T09:00:00.000Z',
      paymentStatus: 'cash',
      amountPaid: 4500,
      remainingAmount: 0,
    }];

    const model = buildPartnerAccountingModel({
      partners: [ahmad],
      purchases: [purchase],
      invoices,
      medicines,
      expenses: [],
      now,
    });

    const summary = model.summaries[0];
    expect(summary.partner.id).toBe(ahmad.id);
    expect(summary.goodsCapital).toBe(10000);
    expect(summary.stockValue).toBe(7500);
    expect(summary.salesTotal).toBe(3750);
    expect(summary.salesCost).toBe(2500);
    expect(summary.returnedSalesTotal).toBe(750);
    expect(summary.grossProfit).toBe(1250);
    expect(summary.partnerShare).toBe(1250);
    expect(summary.storeShare).toBe(0);
    expect(summary.finalBalance).toBe(11250);
    expect(summary.payableAmount).toBe(3750);
    expect(model.settlementPreviews.get(ahmad.id)?.finalBalance).toBe(11250);
    expect(model.salesRows).toHaveLength(2);
    expect(model.ledgerByPartnerId.get(ahmad.id)?.some((entry) => entry.type === 'sales_return')).toBe(true);
    const englishModel = buildPartnerAccountingModel({ partners: [ahmad], purchases: [purchase], invoices, medicines, expenses: [], language: 'english', now });
    const englishLedger = englishModel.ledgerByPartnerId.get(ahmad.id) || [];
    expect(englishLedger.length).toBeGreaterThan(3);
    englishLedger.filter(entry => entry.generated).forEach(entry => expect(entry.description).not.toMatch(/[\u0600-\u06ff]/));
    expect(englishModel.summaries[0]).toEqual(summary);
    expect(englishModel.summaries[0].partner.name).toBe('احمد');
    assertFiniteSummary(summary as unknown as Record<string, unknown>);
  });

  it('supports mixed cash/goods partners with percentage profit sharing', () => {
    const partner = makePartner({
      id: 'partner-mixed',
      name: 'شریک مخلوط',
      capitalType: 'mixed',
      openingCapital: 5000,
      sharePercentage: 40,
      profitRule: { type: 'share_percentage', sharePercentage: 40 },
    });

    const purchase: Purchase = {
      id: 'pur-mixed',
      supplierId: 'sup-1',
      partnerId: partner.id,
      stockEntryType: 'partner_goods_capital',
      ownershipType: 'partner',
      date: '2026-06-01T09:00:00.000Z',
      items: [{
        medicineId: 'med-mix',
        batchNumber: 'MIX-1',
        expiryDate: '2027-06-01T00:00:00.000Z',
        quantity: 10,
        baseQuantity: 10,
        purchasePrice: 100,
        lineTotal: 1000,
        ownerPartnerId: partner.id,
        stockEntryType: 'partner_goods_capital',
        ownershipType: 'partner',
      }],
      subtotalAmount: 1000,
      totalAmount: 1000,
      paidAmount: 0,
      remainingAmount: 1000,
      workflowStatus: 'received',
      status: 'credit',
      payments: [],
      receipts: [],
      vendorCredits: [],
    };

    const medicines: Medicine[] = [{
      id: 'med-mix',
      name: 'Mixed Item',
      manufacturer: '',
      type: 'Tablet',
      unit: 'دانه',
      baseUnit: 'tablet',
      saleUnits: [],
      batches: [{
        id: 'batch-mix',
        batchNumber: 'MIX-1',
        quantity: 0,
        expiryDate: '2027-06-01T00:00:00.000Z',
        purchasePrice: 100,
        purchaseId: purchase.id,
        ownershipType: 'partner',
        ownerPartnerId: partner.id,
        history: [],
      }],
      salePrices: { retail: 130, wholesale: 125, bulk: 120 },
      lowStockThreshold: 5,
    }];

    const invoices: Invoice[] = [{
      id: 'inv-mixed',
      customerId: 'cust-1',
      items: [{
        medicineId: 'med-mix',
        batchId: 'batch-mix',
        partnerId: partner.id,
        batchOwnershipType: 'partner',
        quantity: 10,
        baseQuantity: 10,
        price: 130,
        partnerCostPrice: 100,
      }],
      total: 1300,
      tax: 0,
      discount: 0,
      finalAmount: 1300,
      currency: 'AFN',
      date: '2026-06-02T09:00:00.000Z',
      paymentStatus: 'cash',
      amountPaid: 1300,
      remainingAmount: 0,
    }];

    const summary = buildPartnerAccountingModel({
      partners: [partner],
      purchases: [purchase],
      invoices,
      medicines,
      expenses: [],
      now,
    }).summaries[0];

    expect(summary.cashCapital).toBe(5000);
    expect(summary.goodsCapital).toBe(1000);
    expect(summary.grossProfit).toBe(300);
    expect(summary.partnerShare).toBe(120);
    expect(summary.storeShare).toBe(180);
    expect(summary.finalBalance).toBe(6120);
    assertFiniteSummary(summary as unknown as Record<string, unknown>);
  });

  it('marks consignment goods and applies store commission profit rules', () => {
    const partner = makePartner({
      id: 'partner-consign',
      name: 'شریک امانی',
      capitalType: 'consignment',
      sharePercentage: 75,
      profitRule: { type: 'store_commission_percent', storeCommissionPercent: 25 },
    });

    const purchase: Purchase = {
      id: 'pur-consign',
      supplierId: 'sup-1',
      partnerId: partner.id,
      stockEntryType: 'partner_consignment',
      ownershipType: 'consignment',
      date: '2026-06-01T09:00:00.000Z',
      items: [{
        medicineId: 'med-consign',
        batchNumber: 'CON-1',
        expiryDate: '2027-06-01T00:00:00.000Z',
        quantity: 4,
        baseQuantity: 4,
        purchasePrice: 100,
        lineTotal: 400,
        partnerId: partner.id,
        ownerPartnerId: partner.id,
        stockEntryType: 'partner_consignment',
        ownershipType: 'consignment',
      }],
      subtotalAmount: 400,
      totalAmount: 400,
      paidAmount: 0,
      remainingAmount: 400,
      workflowStatus: 'received',
      status: 'credit',
      payments: [],
      receipts: [],
      vendorCredits: [],
    };

    const medicines: Medicine[] = [{
      id: 'med-consign',
      name: 'Consignment Item',
      manufacturer: '',
      type: 'Tablet',
      unit: 'دانه',
      baseUnit: 'tablet',
      saleUnits: [],
      batches: [{
        id: 'batch-consign',
        batchNumber: 'CON-1',
        quantity: 2,
        expiryDate: '2027-06-01T00:00:00.000Z',
        purchasePrice: 100,
        purchaseId: purchase.id,
        ownershipType: 'consignment',
        ownerPartnerId: partner.id,
        sourceEntryType: 'partner_consignment',
        history: [],
      }],
      salePrices: { retail: 150, wholesale: 145, bulk: 140 },
      lowStockThreshold: 5,
    }];

    const invoices: Invoice[] = [{
      id: 'inv-consign',
      customerId: 'cust-1',
      items: [{
        medicineId: 'med-consign',
        batchId: 'batch-consign',
        partnerId: partner.id,
        batchOwnershipType: 'consignment',
        quantity: 2,
        baseQuantity: 2,
        price: 150,
        partnerCostPrice: 100,
      }],
      total: 300,
      tax: 0,
      discount: 0,
      finalAmount: 300,
      currency: 'AFN',
      date: '2026-06-02T09:00:00.000Z',
      paymentStatus: 'cash',
      amountPaid: 300,
      remainingAmount: 0,
    }];

    const model = buildPartnerAccountingModel({
      partners: [partner],
      purchases: [purchase],
      invoices,
      medicines,
      expenses: [],
      now,
    });
    const summary = model.summaries[0];
    const ledger = model.ledgerByPartnerId.get(partner.id) || [];

    expect(summary.goodsCapital).toBe(400);
    expect(summary.stockValue).toBe(200);
    expect(summary.grossProfit).toBe(100);
    expect(summary.partnerShare).toBe(75);
    expect(summary.storeShare).toBe(25);
    expect(summary.payableAmount).toBe(275);
    expect(ledger.some((entry) => entry.type === 'goods_received')).toBe(true);
    assertFiniteSummary(summary as unknown as Record<string, unknown>);
  });

  it('counts manual partner-owned batches from inventory as goods capital', () => {
    const partner = makePartner({
      id: 'partner-manual',
      name: 'شریک دستی',
      capitalType: 'goods',
      profitRule: { type: 'own_goods_100', sharePercentage: 100 },
    });

    const medicines: Medicine[] = [{
      id: 'med-manual',
      name: 'Manual Partner Item',
      manufacturer: 'WareKeep',
      type: 'Tablet',
      unit: 'دانه',
      baseUnit: 'tablet',
      saleUnits: [],
      batches: [{
        id: 'batch-manual-partner',
        batchNumber: 'MAN-20',
        quantity: 12,
        receivedQuantity: 20,
        receivedAt: '2026-06-01T09:00:00.000Z',
        expiryDate: '2027-06-01T00:00:00.000Z',
        purchasePrice: 50,
        agreedPartnerValue: 50,
        ownerPartnerId: partner.id,
        ownershipType: 'partner',
        sourceEntryType: 'partner_goods_capital',
        sourceDocumentNumber: 'MANUAL-1',
        history: [],
      }],
      salePrices: { retail: 75, wholesale: 70, bulk: 65 },
      lowStockThreshold: 5,
    }];

    const model = buildPartnerAccountingModel({
      partners: [partner],
      purchases: [],
      invoices: [],
      medicines,
      expenses: [],
      now,
    });

    const summary = model.summaries[0];
    const ledger = model.ledgerByPartnerId.get(partner.id) || [];

    expect(summary.goodsCapital).toBe(1000);
    expect(summary.contributionValue).toBe(1000);
    expect(summary.stockValue).toBe(600);
    expect(summary.finalBalance).toBe(1000);
    expect(summary.payableAmount).toBe(400);
    expect(model.contributionRows).toHaveLength(1);
    expect(model.contributionRows[0].purchaseId).toBe('batch-manual-partner');
    expect(ledger.some((entry) => entry.type === 'goods_capital' && entry.referenceId === 'batch-manual-partner')).toBe(true);
    assertFiniteSummary(summary as unknown as Record<string, unknown>);
  });
});
