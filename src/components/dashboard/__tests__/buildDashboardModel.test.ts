import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, Customer, Expense, Invoice, Medicine } from '@/types';
import { createAppFormatters } from '@/lib/formatters';
import { buildDashboardModel } from '../buildDashboardModel';

const settings = {
  language: 'english',
  defaultSalesMode: 'retail',
} as AppSettings;

const medicines: Medicine[] = [
  {
    id: 'med-1',
    name: 'Test Medicine',
    manufacturer: 'Maker',
    type: 'Tablet',
    unit: 'بسته',
    batches: [
      {
        id: 'batch-1',
        batchNumber: 'B-1',
        quantity: 100,
        expiryDate: '2027-01-01',
        purchasePrice: 5,
        history: [],
      },
    ],
    salePrices: {
      retail: 10,
      wholesale: 9,
      bulk: 8,
    },
    lowStockThreshold: 5,
  },
];

const customers: Customer[] = [
  { id: 'cust-1', name: 'Alice', phone: '0700', balance: 0, transactions: [] },
  { id: 'cust-2', name: 'Bilal', phone: '0701', balance: 0, transactions: [] },
  { id: 'cust-3', name: 'Chaman', phone: '0702', balance: 0, transactions: [] },
];

const expenses: Expense[] = [];

const createInvoice = (
  id: string,
  customerId: string,
  date: string,
  finalAmount: number,
): Invoice => ({
  id,
  invoiceNumber: Number(id.replace(/\D/g, '')) || 1,
  customerId,
  items: [
    {
      medicineId: 'med-1',
      batchId: 'batch-1',
      quantity: 1,
      price: finalAmount,
      costPrice: 5,
    },
  ],
  total: finalAmount,
  tax: 0,
  discount: 0,
  finalAmount,
  date,
  paymentStatus: 'paid',
  amountPaid: finalAmount,
  remainingAmount: 0,
});

describe('buildDashboardModel repeat customer rate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-30T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses only the selected period customer set and their prior purchase history', () => {
    const invoices: Invoice[] = [
      createInvoice('inv-1', 'cust-1', '2026-02-20', 100),
      createInvoice('inv-2', 'cust-1', '2026-03-28', 120),
      createInvoice('inv-3', 'cust-2', '2026-03-29', 90),
      createInvoice('inv-4', 'cust-3', '2026-03-15', 80),
    ];
    const formatters = createAppFormatters('english');

    const model7 = buildDashboardModel({
      medicines,
      invoices,
      customers,
      expenses,
      settings,
      formatters,
      periodDays: 7,
    });
    const model30 = buildDashboardModel({
      medicines,
      invoices,
      customers,
      expenses,
      settings,
      formatters,
      periodDays: 30,
    });

    expect(model7.periodUniqueCustomers).toBe(2);
    expect(model7.repeatCustomerRate).toBe(50);
    expect(model30.periodUniqueCustomers).toBe(3);
    expect(model30.repeatCustomerRate).toBeCloseTo(100 / 3, 5);
  });
});
