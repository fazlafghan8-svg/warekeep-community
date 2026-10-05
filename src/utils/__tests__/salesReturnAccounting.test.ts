import { describe, expect, it } from 'vitest';
import type { Invoice } from '@/types';
import { buildSalesReturn, getReturnedQuantityForInvoiceItem, previewSalesReturn } from '../salesReturnAccounting';

const baseInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1',
  invoiceNumber: 1001,
  customerId: 'cust-1',
  items: [{
    lineId: 'line-a',
    medicineId: 'med-1',
    batchId: 'batch-1',
    quantity: 3,
    price: 100,
    costPrice: 60,
  }],
  total: 300,
  discount: 30,
  lineDiscountTotal: 0,
  taxRate: 10,
  tax: 27,
  finalAmount: 297,
  currency: 'AFN',
  date: '2026-05-25T08:00:00.000Z',
  paymentStatus: 'partial',
  amountPaid: 150,
  remainingAmount: 147,
  ...overrides,
});

describe('sales return accounting', () => {
  it('calculates a partial return with invoice discount, tax, refund, and debt reduction', () => {
    const salesReturn = buildSalesReturn({
      invoice: baseInvoice(),
      itemIndex: 0,
      quantity: 1,
      amountRefunded: 50,
      date: '2026-05-25T09:00:00.000Z',
      id: 'ret-1',
    });

    expect(salesReturn.subtotal).toBe(90);
    expect(salesReturn.invoiceDiscountRefund).toBe(10);
    expect(salesReturn.taxRefund).toBe(9);
    expect(salesReturn.totalRefund).toBe(99);
    expect(salesReturn.amountRefunded).toBe(50);
    expect(salesReturn.debtReduction).toBe(49);
  });

  it('refunds a fully paid cash invoice without creating customer debt movement', () => {
    const salesReturn = buildSalesReturn({
      invoice: baseInvoice({
        items: [{ medicineId: 'med-1', batchId: 'batch-1', quantity: 2, price: 100, costPrice: 60 }],
        total: 200,
        discount: 0,
        tax: 0,
        taxRate: 0,
        finalAmount: 200,
        paymentStatus: 'cash',
        amountPaid: 200,
        remainingAmount: 0,
      }),
      itemIndex: 0,
      quantity: 2,
      id: 'ret-cash',
    });

    expect(salesReturn.subtotal).toBe(200);
    expect(salesReturn.totalRefund).toBe(200);
    expect(salesReturn.amountRefunded).toBe(200);
    expect(salesReturn.debtReduction).toBe(0);
  });

  it('reduces debt for an unpaid credit invoice without cash refund', () => {
    const salesReturn = buildSalesReturn({
      invoice: baseInvoice({
        paymentStatus: 'credit',
        amountPaid: 0,
        remainingAmount: 297,
      }),
      itemIndex: 0,
      quantity: 1,
      id: 'ret-credit',
    });

    expect(salesReturn.totalRefund).toBe(99);
    expect(salesReturn.amountRefunded).toBe(0);
    expect(salesReturn.debtReduction).toBe(99);
  });

  it('blocks over-return after previous returns', () => {
    const invoice = baseInvoice({
      returns: [{
        id: 'ret-old',
        invoiceId: 'inv-1',
        customerId: 'cust-1',
        date: '2026-05-25T09:00:00.000Z',
        sourceItemIndex: 0,
        items: [{ medicineId: 'med-1', batchId: 'batch-1', quantity: 2, price: 100, costPrice: 60 }],
        subtotal: 180,
        taxRefund: 18,
        discountRefund: 20,
        totalRefund: 198,
        amountRefunded: 100,
        debtReduction: 98,
      }],
    });

    expect(() => previewSalesReturn(invoice, 0, 2)).toThrow('RETURN_QUANTITY_EXCEEDS_REMAINING');
  });

  it('applies line discount before invoice discount and tax on returned quantity', () => {
    const preview = previewSalesReturn(baseInvoice({
      items: [{
        medicineId: 'med-1',
        batchId: 'batch-1',
        quantity: 3,
        price: 100,
        costPrice: 60,
        discountPercent: 10,
        discountAmount: 5,
      }],
      total: 300,
      lineDiscountTotal: 35,
      discount: 20,
      tax: 25,
      finalAmount: 270,
    }), 0, 1);

    expect(preview.lineDiscountRefund).toBe(12);
    expect(preview.invoiceDiscountRefund).toBe(7);
    expect(preview.subtotal).toBe(81);
    expect(preview.taxRefund).toBe(8);
    expect(preview.totalRefund).toBe(89);
  });

  it('stores returned base quantity for unit-converted sale lines', () => {
    const salesReturn = buildSalesReturn({
      invoice: baseInvoice({
        items: [{
          lineId: 'line-a',
          medicineId: 'med-1',
          batchId: 'batch-1',
          quantity: 2,
          baseQuantity: 20,
          saleUnitName: 'strip',
          saleUnitLabel: 'Strip',
          saleUnitConversionFactor: 10,
          baseUnit: 'tablet',
          price: 100,
          costPrice: 6,
        }],
        total: 200,
        discount: 0,
        tax: 0,
        taxRate: 0,
        finalAmount: 200,
      }),
      itemIndex: 0,
      quantity: 1,
      id: 'ret-strip',
    });

    expect(salesReturn.items[0]).toMatchObject({
      lineId: 'line-a',
      quantity: 1,
      baseQuantity: 10,
      saleUnitName: 'strip',
      saleUnitConversionFactor: 10,
      baseUnit: 'tablet',
    });
    expect(salesReturn.sourceLineId).toBe('line-a');
  });

  it('does not round fractional returned base quantities as currency', () => {
    const salesReturn = buildSalesReturn({
      invoice: baseInvoice({
        items: [{
          medicineId: 'med-liquid',
          batchId: 'batch-liquid',
          quantity: 1,
          baseQuantity: 2.5,
          saleUnitName: 'bottle',
          saleUnitLabel: 'Bottle',
          saleUnitConversionFactor: 2.5,
          baseUnit: 'ml',
          price: 100,
          costPrice: 10,
        }],
        total: 100,
        discount: 0,
        tax: 0,
        taxRate: 0,
        finalAmount: 100,
        currency: 'AFN',
      }),
      itemIndex: 0,
      quantity: 0.5,
      id: 'ret-fractional-base',
    });

    expect(salesReturn.items[0].baseQuantity).toBe(1.25);
  });

  it('uses stable lineId instead of stale sourceItemIndex for previous returns', () => {
    const invoice = baseInvoice({
      items: [
        {
          lineId: 'line-a',
          medicineId: 'med-1',
          batchId: 'batch-1',
          quantity: 3,
          price: 100,
          costPrice: 60,
        },
        {
          lineId: 'line-b',
          medicineId: 'med-2',
          batchId: 'batch-2',
          quantity: 5,
          price: 50,
          costPrice: 20,
        },
      ],
      returns: [{
        id: 'ret-old',
        invoiceId: 'inv-1',
        customerId: 'cust-1',
        date: '2026-05-25T09:00:00.000Z',
        sourceLineId: 'line-a',
        sourceItemIndex: 1,
        items: [{
          lineId: 'line-a',
          medicineId: 'med-1',
          batchId: 'batch-1',
          quantity: 2,
          price: 100,
          costPrice: 60,
        }],
        subtotal: 180,
        taxRefund: 18,
        discountRefund: 20,
        totalRefund: 198,
        amountRefunded: 100,
        debtReduction: 98,
      }],
    });

    expect(getReturnedQuantityForInvoiceItem(invoice, 0)).toBe(2);
    expect(getReturnedQuantityForInvoiceItem(invoice, 1)).toBe(0);
    expect(() => previewSalesReturn(invoice, 0, 2)).toThrow('RETURN_QUANTITY_EXCEEDS_REMAINING');
    expect(previewSalesReturn(invoice, 1, 1).remainingQuantity).toBe(5);
  });

  it('ignores logically voided returns while calculating remaining quantity', () => {
    const invoice = baseInvoice({
      returns: [{
        id: 'ret-voided',
        invoiceId: 'inv-1',
        customerId: 'cust-1',
        date: '2026-05-25T09:00:00.000Z',
        sourceLineId: 'line-a',
        sourceItemIndex: 0,
        isVoided: true,
        items: [{
          lineId: 'line-a',
          medicineId: 'med-1',
          batchId: 'batch-1',
          quantity: 3,
          price: 100,
          costPrice: 60,
        }],
        subtotal: 270,
        taxRefund: 27,
        discountRefund: 30,
        totalRefund: 297,
        amountRefunded: 150,
        debtReduction: 147,
      }],
    });

    expect(getReturnedQuantityForInvoiceItem(invoice, 0)).toBe(0);
    expect(previewSalesReturn(invoice, 0, 3).remainingQuantity).toBe(3);
  });
});
