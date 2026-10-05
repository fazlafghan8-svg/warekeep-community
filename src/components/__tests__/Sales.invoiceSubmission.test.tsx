import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sales } from '../Sales';
import type { AppSettings, Customer, Invoice, Medicine, SalesDraft } from '../../types';

vi.mock('../InvoicePrintModal', () => ({
  InvoicePrintModal: ({ invoice }: { invoice: Invoice | null }) =>
    invoice ? <div data-testid="invoice-print-modal">{invoice.id}</div> : null,
}));

const settings: AppSettings = {
  storeName: 'Test Store',
  storePhone: '',
  storeAddress: '',
  taxRate: 0,
  language: 'english',
  aiLanguage: 'en',
  defaultSalesMode: 'retail',
  invoiceNumbering: {
    type: 'auto',
    nextNumber: 1001,
  },
  calculationSafety: {
    mode: 'normal',
    stageDelayMs: 0,
    verificationPasses: 1,
  },
};

const customers: Customer[] = [{
  id: 'cust-1',
  name: 'Alice',
  phone: '0700000000',
  balance: 0,
  transactions: [],
}];

const medicines: Medicine[] = [{
  id: 'med-1',
  name: 'Panadol',
  manufacturer: 'ACME',
  type: 'Tablet',
  unit: 'دانه' as Medicine['unit'],
  batches: [{
    id: 'batch-1',
    batchNumber: 'B-1',
    quantity: 10,
    expiryDate: '2027-01-01',
    purchasePrice: 5,
    history: [],
    availabilityStatus: 'available',
  }],
  salePrices: {
    retail: 10,
    wholesale: 9,
    bulk: 8,
  },
  lowStockThreshold: 2,
}];

const packageMedicines: Medicine[] = [{
  id: 'med-pack',
  name: 'Paracetamol',
  manufacturer: 'ACME',
  type: 'Tablet',
  unit: '\u0628\u0633\u062a\u0647' as Medicine['unit'],
  baseUnit: '\u0628\u0633\u062a\u0647',
  itemsPerBox: 100,
  batches: [{
    id: 'batch-pack',
    batchNumber: 'PK-1',
    quantity: 1,
    expiryDate: '2027-01-01',
    purchasePrice: 700,
    history: [],
    availabilityStatus: 'available',
  }],
  salePrices: {
    retail: 950,
    wholesale: 900,
    bulk: 850,
  },
  lowStockThreshold: 0.1,
}];

const buildDraft = (quantity = 2): SalesDraft => ({
  items: [{
    medicineId: 'med-1',
    batchId: 'batch-1',
    quantity,
    price: 10,
    costPrice: 5,
  }],
  customerId: 'cust-1',
  customerSearchTerm: 'Alice',
  discount: 0,
  paymentType: 'cash',
  amountPaidInput: 0,
  salesMode: 'retail',
});

const buildEmptyDraft = (): SalesDraft => ({
  items: [],
  customerId: '',
  customerSearchTerm: '',
  discount: 0,
  paymentType: 'cash',
  amountPaidInput: 0,
  salesMode: 'retail',
});

const renderSales = (overrides?: Partial<React.ComponentProps<typeof Sales>>) => {
  const addInvoice = overrides?.addInvoice ?? vi.fn(async (invoice: Omit<Invoice, 'id'>) => ({
    ...invoice,
    id: 'inv-created',
  }));
  const onUpdateDraft = overrides?.onUpdateDraft ?? vi.fn();

  render(
    <Sales
      customers={customers}
      medicines={medicines}
      addInvoice={addInvoice}
      addCustomer={vi.fn()}
      settings={settings}
      draft={buildDraft()}
      onUpdateDraft={onUpdateDraft}
      {...overrides}
    />
  );

  return { addInvoice, onUpdateDraft };
};

const getPrintButton = async () => {
  const button = await screen.findByRole('button', { name: /print \(f10\)/i });
  await waitFor(() => expect(button).not.toBeDisabled());
  return button;
};

describe('Sales invoice submission', () => {
  it('waits for addInvoice before showing the print invoice', async () => {
    let resolveInvoice: (invoice: Invoice) => void = () => undefined;
    const addInvoice = vi.fn((invoice: Omit<Invoice, 'id'>) => new Promise<Invoice>((resolve) => {
      resolveInvoice = resolve;
    }));

    renderSales({ addInvoice });

    fireEvent.click(await getPrintButton());

    expect(addInvoice).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('invoice-print-modal')).toBeNull();

    resolveInvoice({
      ...addInvoice.mock.calls[0][0],
      id: 'inv-real',
    });

    expect(await screen.findByTestId('invoice-print-modal')).toHaveTextContent('inv-real');
  });

  it('ignores a second print click while invoice save is pending', async () => {
    let resolveInvoice: (invoice: Invoice) => void = () => undefined;
    const addInvoice = vi.fn((invoice: Omit<Invoice, 'id'>) => new Promise<Invoice>((resolve) => {
      resolveInvoice = resolve;
    }));

    renderSales({ addInvoice });

    const button = await getPrintButton();
    fireEvent.click(button);
    fireEvent.click(button);

    expect(addInvoice).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button).toBeDisabled());

    resolveInvoice({
      ...addInvoice.mock.calls[0][0],
      id: 'inv-single-click',
    });

    expect(await screen.findByTestId('invoice-print-modal')).toHaveTextContent('inv-single-click');
  });

  it('keeps the cart open and does not print when the backend rejects stock', async () => {
    const stockError = Object.assign(new Error('no stock'), { code: 'INSUFFICIENT_STOCK' });
    const addInvoice = vi.fn(async () => {
      throw stockError;
    });

    renderSales({ addInvoice });

    fireEvent.click(await getPrintButton());

    expect(await screen.findByText(/Insufficient stock/i)).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-print-modal')).toBeNull();
    expect(screen.getByText(/Panadol/i)).toBeInTheDocument();
  });

  it('submits AFN decimal prices without rounding them to whole units', async () => {
    const addInvoice = vi.fn(async (invoice: Omit<Invoice, 'id'>) => ({
      ...invoice,
      id: 'inv-decimal',
    }));
    const decimalDraft: SalesDraft = {
      ...buildDraft(1),
      items: [{
        ...buildDraft(1).items[0],
        price: 255.56,
      }],
    };

    renderSales({
      addInvoice,
      settings: {
        ...settings,
        currencySettings: {
          baseCurrency: 'AFN',
          rates: { AFN: 1, USD: 0, EUR: 0, IRR: 0, PKR: 0, INR: 0 },
        },
      },
      draft: decimalDraft,
    });

    expect(await screen.findAllByText(/255\.56 AFN/i)).not.toHaveLength(0);
    fireEvent.click(await getPrintButton());

    await waitFor(() => expect(addInvoice).toHaveBeenCalledTimes(1));
    const submitted = addInvoice.mock.calls[0][0];
    expect(submitted.items[0].price).toBe(255.56);
    expect(submitted.total).toBe(255.56);
    expect(submitted.finalAmount).toBe(255.56);
    expect(submitted.amountPaid).toBe(255.56);
  });

  it('blocks local oversell before calling addInvoice', async () => {
    const addInvoice = vi.fn();

    renderSales({
      addInvoice,
      draft: buildDraft(12),
    });

    fireEvent.click(await getPrintButton());

    expect(addInvoice).not.toHaveBeenCalled();
    expect(await screen.findByText(/Insufficient stock for Panadol/i)).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-print-modal')).toBeNull();
  });

  it('submits a wholesale invoice with wholesale line price and mode metadata', async () => {
    const addInvoice = vi.fn(async (invoice: Omit<Invoice, 'id'>) => ({
      ...invoice,
      id: 'inv-wholesale',
    }));
    const wholesaleDraft: SalesDraft = {
      ...buildDraft(),
      salesMode: 'wholesale',
      items: [{
        ...buildDraft().items[0],
        price: 9,
        priceMode: 'wholesale',
      }],
    };

    renderSales({
      addInvoice,
      settings: { ...settings, defaultSalesMode: 'wholesale' },
      draft: wholesaleDraft,
    });

    fireEvent.click(await getPrintButton());

    await waitFor(() => expect(addInvoice).toHaveBeenCalledTimes(1));
    const submitted = addInvoice.mock.calls[0][0];
    expect(submitted.salesMode).toBe('wholesale');
    expect(submitted.items[0]).toEqual(expect.objectContaining({
      price: 9,
      priceMode: 'wholesale',
    }));
  });

  it('adds a package medicine line by piece with fractional package stock demand', async () => {
    const onUpdateDraft = vi.fn();

    renderSales({
      medicines: packageMedicines,
      draft: buildEmptyDraft(),
      onUpdateDraft,
    });

    fireEvent.change(screen.getByPlaceholderText(/medicine name or barcode/i), {
      target: { value: 'Para' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Paracetamol/i }));

    const saleUnitSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    expect(saleUnitSelect.textContent).not.toMatch(/[\u0600-\u06ff]/);
    fireEvent.change(saleUnitSelect, { target: { value: 'piece' } });
    await waitFor(() => expect(screen.getByDisplayValue('9.5')).toBeInTheDocument());

    const quantityInput = screen.getAllByRole('spinbutton')[0];
    fireEvent.change(quantityInput, { target: { value: '10' } });
    const addLineButton = screen.getByText('Add line').closest('button');
    expect(addLineButton).not.toBeNull();
    fireEvent.click(addLineButton!);

    await waitFor(() => expect(onUpdateDraft).toHaveBeenCalledWith(expect.objectContaining({
      items: [
        expect.objectContaining({
          medicineId: 'med-pack',
          batchId: 'batch-pack',
          quantity: 10,
          baseQuantity: 0.1,
          saleUnitName: 'piece',
          saleUnitLabel: 'Pcs',
          saleUnitConversionFactor: 0.01,
          baseUnit: '\u0628\u0633\u062a\u0647',
          price: 9.5,
        }),
      ],
    })));
  });

  it('reprices non-manual cart lines when switching to wholesale mode', () => {
    const onUpdateDraft = vi.fn();

    renderSales({
      onUpdateDraft,
      draft: {
        ...buildDraft(),
        items: [{
          ...buildDraft().items[0],
          price: 10,
          priceMode: 'retail',
          isManualPriceOverride: false,
        }],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Wholesale' }));

    expect(onUpdateDraft).toHaveBeenCalledWith(expect.objectContaining({
      salesMode: 'wholesale',
      items: [expect.objectContaining({
        price: 9,
        priceMode: 'wholesale',
      })],
    }));
  });
});
