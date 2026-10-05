import { describe, expect, it } from 'vitest';
import type { AppSettings, Customer, Invoice, Medicine } from '../../types';
import { generateInvoiceHTML } from '../invoiceGenerator';

const invoice: Invoice = {
  id: 'inv-1',
  invoiceNumber: 1001,
  customerId: 'cust-1',
  items: [{
    medicineId: 'med-1',
    batchId: 'batch-1',
    quantity: 1,
    price: 100,
  }],
  total: 100,
  tax: 0,
  discount: 0,
  finalAmount: 100,
  date: '2026-05-25T00:00:00.000Z',
  paymentStatus: 'paid',
  amountPaid: 100,
  remainingAmount: 0,
  salesMode: 'wholesale',
};

const customer: Customer = {
  id: 'cust-1',
  name: '<img src=x onerror=alert(1)>',
  phone: '<script>alert(1)</script>',
  balance: 0,
  transactions: [],
};

const medicine: Medicine = {
  id: 'med-1',
  name: '<b>Unsafe Med</b>',
  manufacturer: 'ACME',
  type: 'Tablet',
  unit: 'دانه' as Medicine['unit'],
  batches: [],
  salePrices: {
    retail: 100,
    wholesale: 100,
    bulk: 100,
  },
  lowStockThreshold: 0,
};

describe('invoiceGenerator HTML safety', () => {
  it('escapes invoice fields and rejects unsafe asset/color values', () => {
    const settings: AppSettings = {
      storeName: '<script>store()</script>',
      storePhone: '0700000000',
      storeAddress: '<iframe src=x></iframe>',
      taxRate: 0,
      language: 'english',
      aiLanguage: 'en',
      defaultSalesMode: 'retail',
      invoiceDesign: {
        paperSize: 'A4',
        templateId: 'modern',
        logo: 'javascript:alert(1)',
        signature: 'javascript:alert(2)',
        primaryColor: 'red; background:url(javascript:alert(3))',
        footerText: '<marquee>bye</marquee>',
      },
    };

    const html = generateInvoiceHTML(invoice, customer, [medicine], settings);

    expect(html).toContain('&lt;script&gt;store()&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;b&gt;Unsafe Med&lt;/b&gt;');
    expect(html).not.toContain('<script>store()</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('javascript:alert');
  });

  it('prints discounts, tax, mixed payment status, and sales return summary safely', () => {
    const settings: AppSettings = {
      storeName: 'فروشگاه تست',
      storePhone: '0700000000',
      storeAddress: 'Kabul',
      taxRate: 10,
      language: 'dari',
      aiLanguage: 'fa',
      defaultSalesMode: 'retail',
      currencySettings: {
        baseCurrency: 'AFN',
        rates: { AFN: 1, USD: 70, EUR: 76, IRR: 0.0017, PKR: 0.25, INR: 0.84 },
      },
      invoiceDesign: { paperSize: 'A4' },
    };
    const returnedInvoice: Invoice = {
      ...invoice,
      paymentStatus: 'mixed',
      paymentBreakdown: { cash: 50, card: 50, credit: 0, method: 'mixed' },
      discount: 10,
      lineDiscountTotal: 5,
      tax: 9,
      finalAmount: 104,
      returns: [{
        id: 'ret-<script>',
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        date: '2026-05-25T01:00:00.000Z',
        items: [{ medicineId: 'med-1', batchId: 'batch-1', quantity: 1, price: 100 }],
        subtotal: 50,
        taxRefund: 5,
        discountRefund: 5,
        totalRefund: 55,
        amountRefunded: 20,
        debtReduction: 35,
        reason: '<script>alert(9)</script>',
      }],
    };

    const html = generateInvoiceHTML(returnedInvoice, customer, [medicine], settings);

    expect(html).toContain('برگشتی فروش');
    expect(html).toContain('برگشت پول');
    expect(html).toContain('کاهش بدهی');
    expect(html).toContain('پرداخت ترکیبی');
    expect(html).not.toContain('<script>alert(9)</script>');
  });
});
