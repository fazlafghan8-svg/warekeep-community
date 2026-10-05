import { describe, expect, it } from 'vitest';
import type { AppSettings, Medicine } from '../../types';
import {
  generatePriceListCSV,
  generatePriceListHTML,
  getDefaultPriceListFields
} from '../priceListGenerator';

const medicine: Medicine = {
  id: 'med-1',
  name: '<script>alert(1)</script>',
  genericName: 'Paracetamol',
  manufacturer: 'Safe Pharma',
  type: 'Tablet',
  unit: 'دانه' as Medicine['unit'],
  barcode: 'ABC-123',
  description: '<img src=x onerror=alert(2)>',
  batches: [
    {
      id: 'batch-1',
      batchNumber: 'B-001',
      quantity: 12,
      expiryDate: '2027-01-01',
      purchasePrice: 50,
      location: { rack: 'R1', shelf: 'S2' },
      history: []
    }
  ],
  salePrices: {
    retail: 80,
    wholesale: 70,
    bulk: 60
  },
  lowStockThreshold: 3
};

const settings: AppSettings = {
  storeName: '<b>Unsafe Store</b>',
  storePhone: '0700000000',
  storeAddress: '<iframe src=x></iframe>',
  taxRate: 0,
  language: 'english',
  aiLanguage: 'en',
  invoiceDesign: {
    logo: 'javascript:alert(9)',
    primaryColor: 'red; background:url(javascript:alert(10))',
    footerText: '<marquee>thanks</marquee>'
  },
  currencySettings: {
    baseCurrency: 'AFN',
    rates: { AFN: 1, USD: 70, EUR: 76, IRR: 0.0017, PKR: 0.25, INR: 0.84 }
  }
};

describe('priceListGenerator', () => {
  it('escapes unsafe content and rejects unsafe logo/color values', () => {
    const html = generatePriceListHTML({
      rows: [{ medicine }],
      selectedFieldKeys: ['name', 'description', 'retailPrice'],
      settings,
      canViewPurchasePrice: false,
      generatedAt: new Date('2026-06-20T00:00:00.000Z')
    });

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(html).toContain('&lt;b&gt;Unsafe Store&lt;/b&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(2)>');
    expect(html).not.toContain('javascript:alert');
    expect(html).not.toContain('red; background');
  });

  it('removes purchase-side fields without permission', () => {
    const html = generatePriceListHTML({
      rows: [{ medicine }],
      selectedFieldKeys: ['name', 'averagePurchasePrice', 'totalPurchaseValue', 'batchDetails'],
      settings,
      canViewPurchasePrice: false
    });

    expect(html).toContain('Medicine');
    expect(html).not.toContain('Avg. Purchase');
    expect(html).not.toContain('Stock Value');
    expect(html).not.toContain('Batch Details');
    expect(html).not.toContain('B-001');
  });

  it('includes internal fields when permission is granted', () => {
    const fields = getDefaultPriceListFields('internal', true);
    const html = generatePriceListHTML({
      rows: [{ medicine }],
      selectedFieldKeys: fields,
      settings,
      canViewPurchasePrice: true
    });

    expect(html).toContain('Avg. Purchase');
    expect(html).toContain('Stock Value');
    expect(html).toContain('Batch Details');
    expect(html).toContain('B-001');
  });

  it('generates CSV with the selected fields', () => {
    const csv = generatePriceListCSV({
      rows: [{ medicine }],
      selectedFieldKeys: ['name', 'retailPrice', 'stock'],
      settings,
      canViewPurchasePrice: false
    });

    expect(csv.split('\n')[0]).toBe('#,Medicine,Retail Price,Available Stock');
    expect(csv).toContain('80 AFN');
    expect(csv).toContain('12');
  });

  it('formats numbers with the selected numeral style', () => {
    const html = generatePriceListHTML({
      rows: [{ medicine }],
      selectedFieldKeys: ['name', 'retailPrice', 'stock'],
      settings,
      canViewPurchasePrice: false,
      design: { numeralStyle: 'persian' }
    });
    const csv = generatePriceListCSV({
      rows: [{ medicine }],
      selectedFieldKeys: ['name', 'retailPrice', 'stock'],
      settings,
      canViewPurchasePrice: false,
      design: { numeralStyle: 'persian' }
    });

    expect(html).toContain('۸۰ AFN');
    expect(html).toContain('۱۲');
    expect(csv).toContain('۸۰ AFN');
  });

  it('applies design options and renders the WareKeep watermark', () => {
    const html = generatePriceListHTML({
      rows: [{ medicine }],
      selectedFieldKeys: ['name'],
      settings,
      canViewPurchasePrice: false,
      design: {
        pageSize: 'A5',
        orientation: 'landscape',
        marginMm: 8,
        headerLayout: 'centered',
        tableDensity: 'compact',
        borderStyle: 'minimal',
        topNote: 'Daily offers',
        watermarkText: 'WareKeep',
        watermarkPosition: 'top-right',
        watermarkOpacity: 0.2
      }
    });

    expect(html).toContain('@page { size: A5 landscape; margin: 8mm; }');
    expect(html).toContain('header header-centered');
    expect(html).toContain('Daily offers');
    expect(html).toContain('warekeep-watermark watermark-top-right');
    expect(html).toContain('WareKeep');
  });

  it('applies section styles and editable cell overrides safely', () => {
    const html = generatePriceListHTML({
      rows: [{ medicine }],
      selectedFieldKeys: ['name', 'retailPrice'],
      settings,
      canViewPurchasePrice: false,
      design: {
        sectionStyles: {
          title: { color: '#dc2626', align: 'center', fontSize: 30 },
          logo: { offsetXmm: 12, offsetYmm: 6 },
          address: { color: '#16a34a', fontSize: 14 },
          tableHeader: { backgroundColor: '#111827', color: '#ffffff', align: 'center' }
        }
      },
      cellOverrides: {
        'med-1': {
          name: '<b>Custom Price Item</b>',
          retailPrice: '99'
        }
      }
    });
    const csv = generatePriceListCSV({
      rows: [{ medicine }],
      selectedFieldKeys: ['name', 'retailPrice'],
      settings,
      canViewPurchasePrice: false,
      cellOverrides: {
        'med-1': {
          name: 'Custom Price Item',
          retailPrice: '99'
        }
      }
    });

    expect(html).toContain('color: #dc2626');
    expect(html).toContain('font-size: 30px');
    expect(html).toContain('data-wk-edit-part="address"');
    expect(html).toContain('color: #16a34a');
    expect(html).toContain('font-size: 14px');
    expect(html).toContain('data-wk-edit-part="logo"');
    expect(html).toContain('transform: translate(12mm, 6mm)');
    expect(html).toContain('background: #111827');
    expect(html).toContain('&lt;b&gt;Custom Price Item&lt;/b&gt;');
    expect(html).toContain('99 AFN');
    expect(csv).toContain('Custom Price Item');
    expect(csv).toContain('99 AFN');
  });

  it('applies header overrides, preview selection, and clamps section movement safely', () => {
    const html = generatePriceListHTML({
      rows: [{ medicine }],
      selectedFieldKeys: ['name', 'retailPrice'],
      settings,
      canViewPurchasePrice: false,
      headerOverrides: {
        retailPrice: '<b>Offer</b>'
      },
      design: {
        sectionStyles: {
          title: { offsetXmm: 99, offsetYmm: -99, fontSize: 999 },
          tableHeader: { offsetXmm: 4, offsetYmm: 2 }
        }
      },
      previewSelection: {
        part: 'tableHeader',
        field: 'retailPrice'
      }
    });
    const csv = generatePriceListCSV({
      rows: [{ medicine }],
      selectedFieldKeys: ['name', 'retailPrice'],
      settings,
      canViewPurchasePrice: false,
      headerOverrides: {
        retailPrice: 'Offer Price'
      }
    });

    expect(html).toContain('&lt;b&gt;Offer&lt;/b&gt;');
    expect(html).toContain('wk-selected');
    expect(html).toContain('transform: translate(80mm, -80mm)');
    expect(html).toContain('font-size: 72px');
    expect(html).toContain('transform: translate(4mm, 2mm)');
    expect(html).not.toContain('<b>Offer</b>');
    expect(csv.split('\n')[0]).toBe('#,Medicine,Offer Price');
  });
});
