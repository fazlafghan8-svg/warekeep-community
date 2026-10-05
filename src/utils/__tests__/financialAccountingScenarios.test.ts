import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, Customer, Invoice, InvoiceItem, Medicine } from '@/types';
import { buildReportBundle } from '@/reports/reporting';
import { buildDashboardModel } from '@/components/dashboard/buildDashboardModel';
import { createAppFormatters } from '@/lib/formatters';
import { calculateInvoiceLineTotal, calculateInvoiceTotals, calculateItemProfit } from '../calculations';
import { resolveInvoicePayment, type InvoicePaymentType } from '../invoiceAccounting';
import { validateInvoiceStock } from '../invoiceStockValidation';

const buildFilters = () => ({
  preset: 'thisMonth' as const,
  compareWithPrevious: false,
  query: '',
  userId: 'all',
  customerId: 'all',
  productType: 'all',
  manufacturer: 'all',
  supplierId: 'all',
  paymentStatus: 'all',
  salesMode: 'all',
  warehouse: 'all',
  branch: 'all',
});

const expectMoney = (actual: number, expected: number) => {
  expect(actual).toBeCloseTo(expected, 6);
};

const line = (
  medicineId: string,
  batchId: string,
  quantity: number,
  price: number,
  costPrice: number
): InvoiceItem => ({
  medicineId,
  batchId,
  quantity,
  price,
  costPrice,
});

const medicines: Medicine[] = [
  {
    id: 'med-a',
    name: 'Item A',
    manufacturer: 'Maker',
    type: 'Tablet',
    unit: 'دانه' as any,
    batches: [{
      id: 'batch-a',
      batchNumber: 'A-1',
      quantity: 10,
      expiryDate: '2027-01-01',
      purchasePrice: 60,
      history: [],
    }],
    salePrices: { retail: 100, wholesale: 90, bulk: 80 },
    lowStockThreshold: 1,
  },
  {
    id: 'med-b',
    name: 'Item B',
    manufacturer: 'Maker',
    type: 'Tablet',
    unit: 'دانه' as any,
    batches: [{
      id: 'batch-b',
      batchNumber: 'B-1',
      quantity: 10,
      expiryDate: '2027-01-01',
      purchasePrice: 30,
      history: [],
    }],
    salePrices: { retail: 50, wholesale: 45, bulk: 40 },
    lowStockThreshold: 1,
  },
];

describe('financial accounting scenarios', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-25T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches manual sales totals, payment, debt, profit, and stock expectations', () => {
    const scenarios: Array<{
      name: string;
      currency: 'AFN' | 'USD';
      items: InvoiceItem[];
      discount: number;
      taxRate: number;
      paymentType: InvoicePaymentType;
      amountPaidInput: number;
      cashAmountInput?: number;
      cardAmountInput?: number;
      expected: {
        total: number;
        tax: number;
        finalAmount: number;
        amountPaid: number;
        remainingAmount: number;
        paymentStatus: string;
        netSales: number;
        cogs: number;
        grossProfit: number;
        stockDemand: number;
      };
    }> = [
      {
        name: 'single item, full cash payment',
        currency: 'AFN',
        items: [line('med-a', 'batch-a', 2, 100, 60)],
        discount: 0,
        taxRate: 0,
        paymentType: 'cash',
        amountPaidInput: 0,
        expected: {
          total: 200,
          tax: 0,
          finalAmount: 200,
          amountPaid: 200,
          remainingAmount: 0,
          paymentStatus: 'cash',
          netSales: 200,
          cogs: 120,
          grossProfit: 80,
          stockDemand: 2,
        },
      },
      {
        name: 'line-item discount, invoice discount, tax after both discounts, mixed payment',
        currency: 'AFN',
        items: [{
          ...line('med-a', 'batch-a', 3, 100, 60),
          discountPercent: 10,
          discountAmount: 5,
        }],
        discount: 20,
        taxRate: 10,
        paymentType: 'mixed',
        amountPaidInput: 0,
        cashAmountInput: 100,
        cardAmountInput: 161,
        expected: {
          total: 300,
          tax: 24.5,
          finalAmount: 269.5,
          amountPaid: 261,
          remainingAmount: 8.5,
          paymentStatus: 'partial',
          netSales: 245,
          cogs: 180,
          grossProfit: 65,
          stockDemand: 3,
        },
      },
      {
        name: 'multi item, invoice discount, tax after discount, partial payment',
        currency: 'AFN',
        items: [
          line('med-a', 'batch-a', 2, 100, 60),
          line('med-b', 'batch-b', 3, 50, 30),
        ],
        discount: 25,
        taxRate: 10,
        paymentType: 'partial',
        amountPaidInput: 150,
        expected: {
          total: 350,
          tax: 32.5,
          finalAmount: 357.5,
          amountPaid: 150,
          remainingAmount: 207.5,
          paymentStatus: 'partial',
          netSales: 325,
          cogs: 210,
          grossProfit: 115,
          stockDemand: 5,
        },
      },
      {
        name: 'overpayment is clamped to invoice total',
        currency: 'AFN',
        items: [line('med-a', 'batch-a', 1, 100, 60)],
        discount: 0,
        taxRate: 0,
        paymentType: 'partial',
        amountPaidInput: 150,
        expected: {
          total: 100,
          tax: 0,
          finalAmount: 100,
          amountPaid: 100,
          remainingAmount: 0,
          paymentStatus: 'paid',
          netSales: 100,
          cogs: 60,
          grossProfit: 40,
          stockDemand: 1,
        },
      },
      {
        name: 'AFN decimal price keeps two currency decimals',
        currency: 'AFN',
        items: [line('med-a', 'batch-a', 1, 10.49, 6)],
        discount: 0,
        taxRate: 0,
        paymentType: 'cash',
        amountPaidInput: 0,
        expected: {
          total: 10.49,
          tax: 0,
          finalAmount: 10.49,
          amountPaid: 10.49,
          remainingAmount: 0,
          paymentStatus: 'cash',
          netSales: 10.49,
          cogs: 6,
          grossProfit: 4.49,
          stockDemand: 1,
        },
      },
      {
        name: 'USD decimal price and fractional quantity uses cents and 3-decimal quantity scale',
        currency: 'USD',
        items: [line('med-a', 'batch-a', 2.5, 10.235, 4)],
        discount: 0.33,
        taxRate: 7.5,
        paymentType: 'partial',
        amountPaidInput: 15,
        expected: {
          total: 25.6,
          tax: 1.9,
          finalAmount: 27.17,
          amountPaid: 15,
          remainingAmount: 12.17,
          paymentStatus: 'partial',
          netSales: 25.27,
          cogs: 10,
          grossProfit: 15.27,
          stockDemand: 2.5,
        },
      },
      {
        name: 'zero and negative lines are ignored, discount cannot make totals negative',
        currency: 'AFN',
        items: [
          line('med-a', 'batch-a', 0, 100, 60),
          line('med-a', 'batch-a', -2, 100, 60),
          line('med-a', 'batch-a', 1, -5, 60),
          line('med-a', 'batch-a', 1, 50, 60),
        ],
        discount: 100,
        taxRate: 10,
        paymentType: 'credit',
        amountPaidInput: 0,
        expected: {
          total: 50,
          tax: 0,
          finalAmount: 0,
          amountPaid: 0,
          remainingAmount: 0,
          paymentStatus: 'paid',
          netSales: 0,
          cogs: 60,
          grossProfit: -60,
          stockDemand: 1,
        },
      },
    ];

    for (const scenario of scenarios) {
      const totals = calculateInvoiceTotals(scenario.items, scenario.discount, scenario.taxRate, scenario.currency);
      const payment = resolveInvoicePayment(totals.finalAmount, scenario.paymentType, scenario.amountPaidInput, {
        cashAmountInput: scenario.cashAmountInput,
        cardAmountInput: scenario.cardAmountInput,
      });
      const netSales = totals.totalAfterDiscount;
      const cogs = scenario.items.reduce((sum, item) => (
        item.quantity > 0 && item.price > 0 ? sum + item.quantity * (item.costPrice || 0) : sum
      ), 0);
      const grossProfit = netSales - cogs;
      const stockDemand = scenario.items.reduce((sum, item) => (
        item.quantity > 0 && item.price > 0 ? sum + item.quantity : sum
      ), 0);

      expectMoney(totals.total, scenario.expected.total);
      expectMoney(totals.tax, scenario.expected.tax);
      expectMoney(totals.finalAmount, scenario.expected.finalAmount);
      expectMoney(payment.amountPaid, scenario.expected.amountPaid);
      expectMoney(payment.remainingAmount, scenario.expected.remainingAmount);
      expect(payment.paymentStatus).toBe(scenario.expected.paymentStatus);
      expectMoney(netSales, scenario.expected.netSales);
      expectMoney(cogs, scenario.expected.cogs);
      expectMoney(grossProfit, scenario.expected.grossProfit);
      expectMoney(stockDemand, scenario.expected.stockDemand);
    }
  });

  it('uses the same decimal line total for calculation and printable invoice rows', () => {
    const item = line('med-a', 'batch-a', 1, 10.49, 6);
    const totals = calculateInvoiceTotals([item], 0, 0, 'AFN');

    expect(calculateInvoiceLineTotal(item, 'AFN')).toBe(10.49);
    expect(totals.total).toBe(10.49);
  });

  it('uses invoice currency rounding when calculating item profit', () => {
    const item = line('med-a', 'batch-a', 1, 10.49, 6);

    expect(calculateItemProfit(item, medicines, 'AFN')).toBe(4.49);
    expect(calculateItemProfit(item, medicines, 'USD')).toBe(4.49);
  });

  it('blocks insufficient stock before a failed invoice can affect reports or inventory', () => {
    const result = validateInvoiceStock([
      line('med-a', 'batch-a', 8, 100, 60),
      line('med-a', 'batch-a', 3, 100, 60),
    ], medicines);

    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('INSUFFICIENT_STOCK');
  });

  it('keeps duplicate, deleted, and rollback-style invoices out of financial reports', () => {
    const customers: Customer[] = [
      { id: 'cust-1', name: 'Customer', phone: '0700', balance: 208, transactions: [] },
    ];
    const activeInvoice: Invoice = {
      id: 'inv-active',
      invoiceNumber: 1001,
      customerId: 'cust-1',
      items: [
        line('med-a', 'batch-a', 2, 100, 60),
        line('med-b', 'batch-b', 3, 50, 30),
      ],
      total: 350,
      tax: 33,
      discount: 25,
      finalAmount: 358,
      currency: 'AFN',
      date: '2026-05-25T08:00:00.000Z',
      paymentStatus: 'partial',
      amountPaid: 150,
      remainingAmount: 208,
    };
    const deletedDuplicate: Invoice = {
      ...activeInvoice,
      id: 'inv-deleted',
      invoiceNumber: 1001,
      finalAmount: 999,
      total: 999,
      amountPaid: 999,
      remainingAmount: 0,
      isDeleted: true,
    };

    const bundle = buildReportBundle({
      invoices: [activeInvoice, deletedDuplicate],
      medicines,
      customers,
      expenses: [],
      purchases: [],
      suppliers: [],
      settings: {
        language: 'english',
        storeName: 'Store',
        storePhone: '',
        storeAddress: '',
        taxRate: 10,
        currencySettings: { baseCurrency: 'AFN' },
      } as AppSettings,
      language: 'english',
      now: new Date('2026-05-25T12:00:00.000Z'),
      filters: buildFilters(),
    });

    const metric = (key: string) => bundle.sections.financial.kpis.find((entry) => entry.key === key)?.value;

    expect(metric('grossSales')).toBe(350);
    expect(metric('discounts')).toBe(25);
    expect(metric('netSales')).toBe(325);
    expect(metric('cogs')).toBe(210);
    expect(metric('grossProfit')).toBe(115);
    expect(metric('collected')).toBe(150);
    expect(metric('receivable')).toBe(208);
    expect(metric('invoiceCount')).toBe(1);
  });

  it('subtracts partial sales returns from net sales, collection, receivable, and profit reports', () => {
    const customers: Customer[] = [
      { id: 'cust-1', name: 'Customer', phone: '0700', balance: 0, transactions: [] },
    ];
    const invoice: Invoice = {
      id: 'inv-returned',
      invoiceNumber: 1003,
      customerId: 'cust-1',
      items: [line('med-a', 'batch-a', 3, 100, 60)],
      total: 300,
      tax: 27,
      taxRate: 10,
      discount: 30,
      lineDiscountTotal: 0,
      finalAmount: 297,
      currency: 'AFN',
      date: '2026-05-25T08:00:00.000Z',
      paymentStatus: 'partial',
      amountPaid: 150,
      remainingAmount: 147,
      returns: [{
        id: 'ret-1',
        invoiceId: 'inv-returned',
        customerId: 'cust-1',
        date: '2026-05-25T09:00:00.000Z',
        items: [line('med-a', 'batch-a', 1, 100, 60)],
        subtotal: 90,
        discountRefund: 10,
        taxRefund: 9,
        totalRefund: 99,
        amountRefunded: 50,
        debtReduction: 49,
      }],
    };

    const bundle = buildReportBundle({
      invoices: [invoice],
      medicines,
      customers,
      expenses: [],
      purchases: [],
      suppliers: [],
      settings: {
        language: 'english',
        storeName: 'Store',
        storePhone: '',
        storeAddress: '',
        taxRate: 10,
        currencySettings: { baseCurrency: 'AFN' },
      } as AppSettings,
      language: 'english',
      now: new Date('2026-05-25T12:00:00.000Z'),
      filters: buildFilters(),
    });
    const metric = (key: string) => bundle.sections.financial.kpis.find((entry) => entry.key === key)?.value;

    expect(metric('grossSales')).toBe(300);
    expect(metric('discounts')).toBe(30);
    expect(metric('returns')).toBe(90);
    expect(metric('netSales')).toBe(180);
    expect(metric('cogs')).toBe(120);
    expect(metric('grossProfit')).toBe(60);
    expect(metric('collected')).toBe(100);
    expect(metric('receivable')).toBe(98);
  });

  it('reports unit-converted sales using base quantities for inventory movement analytics', () => {
    const convertedMedicine: Medicine = {
      id: 'med-box',
      name: 'Boxed tablets',
      manufacturer: 'Maker',
      type: 'Tablet',
      unit: 'tablet' as any,
      baseUnit: 'tablet',
      saleUnits: [
        { unitName: 'tablet', conversionFactor: 1 },
        { unitName: 'box', conversionFactor: 100 },
      ],
      batches: [{
        id: 'batch-box',
        batchNumber: 'BX-1',
        quantity: 200,
        expiryDate: '2027-01-01',
        purchasePrice: 5,
        history: [],
      }],
      salePrices: { retail: 5, wholesale: 4.5, bulk: 4 },
      lowStockThreshold: 20,
    };
    const invoice: Invoice = {
      id: 'inv-box',
      invoiceNumber: 2001,
      customerId: 'cust-1',
      items: [{
        medicineId: 'med-box',
        batchId: 'batch-box',
        quantity: 1,
        baseQuantity: 100,
        saleUnitName: 'box',
        saleUnitConversionFactor: 100,
        baseUnit: 'tablet',
        price: 500,
        costPrice: 5,
      }],
      total: 500,
      tax: 0,
      discount: 0,
      finalAmount: 500,
      currency: 'AFN',
      date: '2026-05-25T08:00:00.000Z',
      paymentStatus: 'cash',
      amountPaid: 500,
      remainingAmount: 0,
    };

    const bundle = buildReportBundle({
      invoices: [invoice],
      medicines: [convertedMedicine],
      customers: [{ id: 'cust-1', name: 'Customer', phone: '', balance: 0, transactions: [] }],
      expenses: [],
      purchases: [],
      suppliers: [],
      settings: {
        language: 'english',
        storeName: 'Store',
        storePhone: '',
        storeAddress: '',
        taxRate: 0,
        currencySettings: { baseCurrency: 'AFN' },
      } as AppSettings,
      language: 'english',
      now: new Date('2026-05-25T12:00:00.000Z'),
      filters: buildFilters(),
    });

    const topProducts = bundle.sections.inventory.charts.find((chart) => chart.id === 'inventory-top-products');
    const metric = (key: string) => bundle.sections.financial.kpis.find((entry) => entry.key === key)?.value;

    expect(metric('cogs')).toBe(500);
    expect(topProducts?.data.find((point) => point.id === 'med-box')?.value).toBe(100);
  });

  it('excludes tax from dashboard gross profit to stay aligned with financial reports', () => {
    const invoice: Invoice = {
      id: 'inv-taxed',
      invoiceNumber: 1002,
      customerId: 'cust-1',
      items: [line('med-a', 'batch-a', 1, 100, 60)],
      total: 100,
      discount: 10,
      tax: 9,
      finalAmount: 99,
      currency: 'AFN',
      date: '2026-05-25T08:00:00.000Z',
      paymentStatus: 'cash',
      amountPaid: 99,
      remainingAmount: 0,
    };

    const model = buildDashboardModel({
      medicines,
      invoices: [invoice],
      customers: [{ id: 'cust-1', name: 'Customer', phone: '', balance: 0, transactions: [] }],
      expenses: [],
      settings: {
        language: 'english',
        storeName: 'Store',
        storePhone: '',
        storeAddress: '',
        taxRate: 10,
        defaultSalesMode: 'retail',
        currencySettings: { baseCurrency: 'AFN' },
      } as AppSettings,
      formatters: createAppFormatters('english'),
      periodDays: 30,
    });

    expect(model.periodSales).toBe(90);
    expect(model.periodCOGS).toBe(60);
    expect(model.periodGrossProfit).toBe(30);
  });
});
