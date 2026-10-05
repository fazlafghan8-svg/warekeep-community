import { describe, expect, it } from 'vitest';
import type { AppSettings, Customer, Invoice, Medicine } from '../../types';


import { generateInvoiceHTML } from '../invoiceGenerator';

const invoice = {
  id: 'offline-invoice', invoiceNumber: 1, customerId: 'offline-customer', items: [],
  total: 0, tax: 0, discount: 0, finalAmount: 0, date: '2026-10-01T00:00:00Z',
  paymentStatus: 'paid', amountPaid: 0, remainingAmount: 0, salesMode: 'wholesale',
} as Invoice;
const customer = { id: 'offline-customer', name: 'مشتری ساختگی', phone: '', balance: 0, transactions: [] } as Customer;
const medicines: Medicine[] = [];
const settings = (templateId: 'legacy' | 'modern' | 'clean', paperSize: 'A4' | 'Thermal' = 'A4') => ({
  storeName: 'فروشگاه ساختگی', storePhone: '', storeAddress: '', taxRate: 0,
  language: 'dari', invoiceDesign: { templateId, paperSize },
} as AppSettings);

describe('Community invoice documents', () => {
  it.each([
    ['legacy', 'A4'], ['modern', 'A4'], ['clean', 'A4'], ['legacy', 'Thermal'],
  ] as const)('prints built-in units in English in %s/%s without changing invoice amounts', (templateId, paperSize) => {
    const englishSettings = { ...settings(templateId, paperSize), storeName: 'My Store', language: 'english' as const };
    const medicine = { id: 'm1', name: 'English medicine' } as Medicine;
    const sale = { ...invoice, total: 10, finalAmount: 10, items: [{ medicineId: 'm1', batchId: 'b1', quantity: 2,
      price: 5, baseUnit: 'بسته', saleUnitName: 'piece', saleUnitLabel: 'دانه', saleUnitConversionFactor: 0.01 }] } as Invoice;
    const html = generateInvoiceHTML(sale, { ...customer, name: 'Customer' }, [medicine], englishSettings);
    expect(html).toContain('2 Pcs');
    expect(html).not.toContain('دانه');
    expect(html).toContain('English medicine');
    expect(sale.finalAmount).toBe(10);
    expect(sale.items[0].saleUnitLabel).toBe('دانه');
  });
  it.each([
    ['legacy', 'A4'], ['modern', 'A4'], ['clean', 'A4'], ['legacy', 'Thermal'],
  ] as const)('embeds an offline font and blocks remote resources in %s/%s', (templateId, paperSize) => {
    const html = generateInvoiceHTML(invoice, customer, medicines, settings(templateId, paperSize));
    expect(html).toMatch(/src: url\('data:[^;]+;base64,[A-Za-z0-9+/=]+'\) format\('woff2'\)/);
    expect(html).toContain("font-family: 'Vazirmatn'");
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html.slice(0, 1024)).toContain('<meta charset="UTF-8">');
    expect(html).toContain("font-src data:");
    expect(html).not.toContain('@import');
    expect(html).not.toContain('fonts.googleapis.com');
  });

  it('keeps embedded images while omitting remote and local-file images from a portable invoice', () => {
    const embedded = 'data:image/png;base64,aW1hZ2U=';
    const localSettings = settings('modern');
    localSettings.invoiceDesign = { ...localSettings.invoiceDesign, logo: embedded, signature: 'https://example.test/signature.png' };
    let html = generateInvoiceHTML(invoice, customer, medicines, localSettings);
    expect(html).toContain(embedded);
    expect(html).not.toContain('https://example.test/signature.png');
    localSettings.invoiceDesign = { ...localSettings.invoiceDesign, logo: 'file:///private/logo.png' };
    html = generateInvoiceHTML(invoice, customer, medicines, localSettings);
    expect(html).not.toContain('file:///private/logo.png');
  });

});
