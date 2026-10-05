import { useState, type ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Purchases } from '@/components/Purchases';
import { getGuestDemoData } from '@/fixtures/guestDemoData';
import type { Invoice, Medicine, Purchase, Supplier } from '@/types';
import { NEW_FEATURE_MARKERS_HIDE_AFTER_ISO } from '@/components/ui/newFeatureVisibility';
import { buildSupplierFinanceTaggedNote, INVENTORY_RETURN_REFERENCE_NOTE_PREFIX } from '@/utils/purchaseUtils';

declare global {
  interface Array<T> {
    at(index: number): T | undefined;
  }
}

type PurchasesOverrides = Partial<ComponentProps<typeof Purchases>>;

const createPurchasesProps = (
  overrides: PurchasesOverrides = {}
): ComponentProps<typeof Purchases> => {
  const demo = getGuestDemoData('english');

  return {
    suppliers: demo.suppliers,
    purchases: demo.purchases,
    medicines: demo.medicines,
    settings: demo.settings,
    onAddSupplier: vi.fn(),
    onUpdateSupplier: vi.fn(),
    onAddPurchase: vi.fn(),
    onUpdatePurchase: vi.fn(),
    onDeletePurchase: vi.fn(),
    onRecordPurchasePayment: vi.fn(),
    onRecordPurchaseReceipt: vi.fn(),
    onShortClosePurchase: vi.fn(),
    onAddSupplierPayment: vi.fn(),
    onRecordSupplierSettlement: vi.fn(),
    ...overrides,
  };
};

const renderPurchases = (overrides: PurchasesOverrides = {}) => {
  const props = createPurchasesProps(overrides);
  return {
    ...render(<Purchases {...props} />),
    props,
  };
};

const createPrintWindowMock = () => {
  const documentOpen = vi.fn();
  const documentWrite = vi.fn();
  const documentClose = vi.fn();
  const focus = vi.fn();
  const print = vi.fn();

  const mockWindow = {
    document: {
      open: documentOpen,
      write: documentWrite,
      close: documentClose,
    },
    focus,
    print,
    onload: null as null | (() => void),
  };

  return {
    mockWindow,
    documentOpen,
    documentWrite,
    documentClose,
    focus,
    print,
  };
};

const createReturnReferencePurchase = (demo: ReturnType<typeof getGuestDemoData>): Purchase => ({
  ...demo.purchases[0],
  id: 'demo-return-purchase-1',
  invoiceNumber: 'RET-0001',
  date: '2026-03-03',
  totalAmount: 140,
  paidAmount: 0,
  creditedAmount: 140,
  remainingAmount: 0,
  paymentMethod: 'credit',
  paymentStatus: 'paid',
  workflowStatus: 'received',
  receiptStatus: 'not_received',
  inventoryCommitted: false,
  destinationWarehouse: 'Main Warehouse',
  notes: `${INVENTORY_RETURN_REFERENCE_NOTE_PREFIX} | sourcePurchaseId=demo-purchase-1 | sourceBatchId=demo-batch-1 | sourceBatchNumber=PCM-2401 | resolution=vendor_credit | detail=Damaged cartons`,
  items: [
    {
      ...demo.purchases[0].items[0],
      quantity: 7,
      purchasePrice: 20,
      notes: 'Damaged cartons',
    },
  ],
  payments: [],
  receipts: [],
  vendorCredits: [
    {
      id: 'demo-credit-1',
      date: '2026-03-03',
      amount: 140,
      note: 'Damaged cartons',
      resolution: 'vendor_credit',
      supplierId: 'demo-sup-1',
      purchaseId: 'demo-return-purchase-1',
      batchId: 'demo-batch-1',
      items: [
        {
          medicineId: 'demo-med-1',
          purchaseItemIndex: 0,
          batchId: 'demo-batch-1',
          batchNumber: 'PCM-2401',
          quantity: 7,
          amount: 140,
        },
      ],
    },
  ],
});

const createFinalizeDraftScenario = (): {
  demo: ReturnType<typeof getGuestDemoData>;
  blessbeeSupplier: Supplier;
  draftPurchase: Purchase;
} => {
  const demo = getGuestDemoData('english');
  const blessbeeSupplier: Supplier = {
    ...demo.suppliers[0],
    id: 'demo-sup-blessbee',
    name: 'blessbee',
    companyName: 'Blessbee Supply',
    contactPerson: '',
    paymentTerms: '',
    balance: 2500,
  };
  const draftPurchase: Purchase = {
    ...demo.purchases[0],
    id: 'demo-purchase-draft',
    supplierId: blessbeeSupplier.id,
    invoiceNumber: 'PI-BLESS-2500',
    totalAmount: 2500,
    paidAmount: 0,
    remainingAmount: 2500,
    workflowStatus: 'draft' as const,
    status: 'draft' as const,
    dueDate: '',
    items: [
      {
        ...demo.purchases[0].items[0],
        quantity: 100,
        purchasePrice: 25,
      },
    ],
  };

  return { demo, blessbeeSupplier, draftPurchase };
};

const getFieldControl = (scope: HTMLElement, label: string) => {
  const labelNode = Array.from(scope.querySelectorAll('label')).find(
    (node) => node.textContent?.trim() === label
  );
  if (!labelNode) {
    throw new Error(`No label found for: ${label}`);
  }
  const field = labelNode.parentElement?.querySelector('input, textarea, select');
  if (!field) {
    throw new Error(`No field found for label: ${label}`);
  }
  return field as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
};

const getFieldGroup = (scope: HTMLElement, label: string) => {
  const labelNode = Array.from(scope.querySelectorAll('label')).find(
    (node) => node.textContent?.trim() === label
  );
  if (!labelNode?.parentElement) {
    throw new Error(`No field group found for: ${label}`);
  }
  return labelNode.parentElement;
};

const moveNewPurchaseToItemsStep = (options?: { invoiceNumber?: string }) => {
  fireEvent.click(screen.getByRole('tab', { name: 'New Purchase Invoice' }));
  fireEvent.click(screen.getByTestId('supplier-match-demo-sup-1'));
  if (options?.invoiceNumber) {
    fireEvent.change(screen.getByPlaceholderText('Invoice no.'), {
      target: { value: options.invoiceNumber },
    });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Continue to items' }));
  return screen.getByTestId('purchase-step-panel-items');
};

const addPurchaseLine = (itemsPanel: HTMLElement) => {
  fireEvent.change(getFieldControl(itemsPanel, 'Medicine search'), {
    target: { value: 'Paracetamol' },
  });
  const suggestionButton = within(itemsPanel)
    .getAllByText('Paracetamol 500mg')
    .map((node) => node.closest('button'))
    .find((node): node is HTMLButtonElement => !!node);
  if (!suggestionButton) {
    throw new Error('Paracetamol suggestion button was not found');
  }
  fireEvent.click(suggestionButton);
  fireEvent.change(getFieldControl(itemsPanel, 'Quantity'), {
    target: { value: '12' },
  });
  fireEvent.change(getFieldControl(itemsPanel, 'Buy price'), {
    target: { value: '19' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add line' }));
};

const addPurchaseLines = (itemsPanel: HTMLElement, count: number) => {
  for (let index = 0; index < count; index += 1) {
    addPurchaseLine(itemsPanel);
  }
};

const moveNewPurchaseToReviewStep = (options?: { addPayment?: boolean }) => {
  const itemsPanel = moveNewPurchaseToItemsStep();
  addPurchaseLine(itemsPanel);

  fireEvent.click(screen.getByRole('button', { name: 'Continue to payments' }));
  const paymentsPanel = screen.getByTestId('purchase-step-panel-payments');

  if (options?.addPayment) {
    fireEvent.change(getFieldControl(paymentsPanel, 'Amount'), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add payment entry' }));
  }

  fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
  return screen.getByTestId('purchase-step-panel-review');
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Purchases premium procurement flow', () => {
  it('shows visible NEW guidance for procurement additions without breaking tabs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-03T12:00:00+04:30'));
    renderPurchases();

    expect(screen.getByTestId('purchases-feature-guide')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'New Purchase Invoice' }));
    expect(screen.getByText(/batch traceability/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Suppliers' }));

    expect(screen.getAllByText(/vendor credits/i).length).toBeGreaterThan(0);
  });

  it('hides NEW guidance after the expiry date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T00:00:00+04:30'));

    renderPurchases();

    expect(screen.queryByTestId('purchases-feature-guide')).not.toBeInTheDocument();
    expect(screen.queryByText('NEW')).not.toBeInTheDocument();
    expect(NEW_FEATURE_MARKERS_HIDE_AFTER_ISO).toBe('2026-04-03T23:59:59.999+04:30');
  });

  it('switches between top-level tabs and keeps the selected history detail when returning', () => {
    const demo = getGuestDemoData('english');
    const secondPurchase = {
      ...demo.purchases[0],
      id: 'demo-purchase-2',
      invoiceNumber: 'PI-990',
      date: '2026-02-25',
      totalAmount: 4200,
      paidAmount: 1200,
      remainingAmount: 3000,
      notes: 'Second purchase snapshot',
    };

    renderPurchases({
      purchases: [demo.purchases[0], secondPurchase],
    });

    fireEvent.click(screen.getByTestId('history-row-demo-purchase-2'));
    expect(within(screen.getByTestId('history-detail-panel')).getByText('PI-990')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Suppliers' }));
    expect(screen.getByTestId('purchases-suppliers-tab')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Purchase History' }));
    expect(within(screen.getByTestId('history-detail-panel')).getByText('PI-990')).toBeInTheDocument();
  });

  it('preserves decimal quantity and price values in purchase invoice details', () => {
    const demo = getGuestDemoData('english');
    const decimalPurchase: Purchase = {
      ...demo.purchases[0],
      id: 'purchase-decimal-values',
      invoiceNumber: 'DEC-1',
      subtotalAmount: 21213.25,
      totalAmount: 21213.25,
      paidAmount: 0,
      remainingAmount: 21213.25,
      items: [
        {
          ...demo.purchases[0].items[0],
          quantity: 800.5,
          baseQuantity: 800.5,
          purchasePrice: 26.5,
          lineTotal: 21213.25,
        },
      ],
    };

    renderPurchases({
      purchases: [decimalPurchase],
    });

    fireEvent.click(screen.getByTestId('history-row-purchase-decimal-values'));
    fireEvent.click(screen.getByRole('button', { name: 'Open full modal' }));

    expect(screen.getAllByText('800.5').length).toBeGreaterThan(0);
    expect(screen.getAllByText('26.5 AFN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('21,213.25 AFN').length).toBeGreaterThan(0);
  });

  it('blocks ambiguous supplier progress until confirmation, then advances to items', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const demo = getGuestDemoData('english');
    const unknownSupplier = {
      ...demo.suppliers[0],
      id: 'demo-sup-unknown',
      name: 'Unknown',
      code: '',
      balance: 650,
      companyName: 'Unverified Supplier',
    };

    renderPurchases({
      suppliers: [unknownSupplier, ...demo.suppliers],
    });

    fireEvent.click(screen.getByRole('tab', { name: 'New Purchase Invoice' }));
    fireEvent.click(screen.getByTestId('supplier-match-demo-sup-unknown'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to items' }));

    expect(alertSpy).toHaveBeenCalled();
    expect(screen.queryByTestId('purchase-step-panel-items')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to items' }));

    expect(screen.getByTestId('purchase-step-panel-items')).toBeInTheDocument();
  });

  it('adds an item, stays on items, stages a payment, and reaches review', () => {
    renderPurchases();

    const itemsPanel = moveNewPurchaseToItemsStep();
    addPurchaseLine(itemsPanel);

    expect(screen.getByTestId('purchase-step-panel-items')).toBeInTheDocument();
    expect(screen.getByText('Current invoice lines')).toBeInTheDocument();
    expect(screen.getByText('Paracetamol 500mg')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue to payments' }));
    const paymentsPanel = screen.getByTestId('purchase-step-panel-payments');
    fireEvent.change(getFieldControl(paymentsPanel, 'Amount'), {
      target: { value: '100' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add payment entry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));

    const reviewPanel = screen.getByTestId('purchase-step-panel-review');
    expect(reviewPanel).toBeInTheDocument();
    expect(within(reviewPanel).getByText('Invoice lines are ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
  });

  it('keeps the review state intact when saving a draft fails', async () => {
    const onAddPurchase = vi.fn().mockResolvedValue(false);
    renderPurchases({ onAddPurchase });

    const reviewPanel = moveNewPurchaseToReviewStep();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(onAddPurchase).toHaveBeenCalledTimes(1));
    expect(reviewPanel).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to payments' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to items' }));

    expect(screen.getByTestId('purchase-step-panel-items')).toBeInTheDocument();
    expect(screen.getAllByText('Paracetamol 500mg').length).toBeGreaterThan(0);
  });

  it('keeps the review state intact when final save fails', async () => {
    const onAddPurchase = vi.fn().mockResolvedValue(false);
    renderPurchases({ onAddPurchase });

    const reviewPanel = moveNewPurchaseToReviewStep();
    fireEvent.click(screen.getByRole('button', { name: 'Finalize invoice' }));
    expect(screen.getByTestId('final-receipt-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm final save' }));

    await waitFor(() => expect(onAddPurchase).toHaveBeenCalledTimes(1));
    expect(reviewPanel).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to payments' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to items' }));

    expect(screen.getByTestId('purchase-step-panel-items')).toBeInTheDocument();
    expect(screen.getAllByText('Paracetamol 500mg').length).toBeGreaterThan(0);
  });

  it('final save records only the partial quantity received into batch payload', async () => {
    const onAddPurchase = vi.fn().mockResolvedValue(true);
    renderPurchases({ onAddPurchase });

    moveNewPurchaseToReviewStep();
    fireEvent.click(screen.getByRole('button', { name: 'Finalize invoice' }));
    const receiptModal = screen.getByTestId('final-receipt-modal');
    fireEvent.change(getFieldControl(receiptModal, 'Received now'), {
      target: { value: '5' },
    });
    fireEvent.click(within(receiptModal).getByRole('button', { name: 'Confirm final save' }));

    await waitFor(() => expect(onAddPurchase).toHaveBeenCalledTimes(1));
    const [payload, batchPayload] = onAddPurchase.mock.calls[0];

    expect(payload).toEqual(expect.objectContaining({
      workflowStatus: 'received',
      receiptStatus: 'partial',
      inventoryCommitted: true,
    }));
    expect(payload.receipts).toHaveLength(1);
    expect(payload.receipts?.[0].items[0]).toEqual(expect.objectContaining({
      medicineId: 'demo-med-1',
      purchaseItemIndex: 0,
      quantity: 5,
      baseQuantity: 5,
    }));
    expect(batchPayload).toHaveLength(1);
    expect(batchPayload[0].batch).toEqual(expect.objectContaining({
      quantity: 5,
      receivedQuantity: 5,
      traceSource: 'purchase_receipt',
      sourceReceiptId: payload.receipts?.[0].id,
    }));
  });

  it('saves one B3 purchase with five item lines as five line-linked batch payloads', async () => {
    const onAddPurchase = vi.fn().mockResolvedValue(true);
    renderPurchases({ onAddPurchase, purchases: [] });

    const itemsPanel = moveNewPurchaseToItemsStep({ invoiceNumber: 'B3' });
    addPurchaseLines(itemsPanel, 5);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payments' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalize invoice' }));
    fireEvent.click(within(screen.getByTestId('final-receipt-modal')).getByRole('button', { name: 'Confirm final save' }));

    await waitFor(() => expect(onAddPurchase).toHaveBeenCalledTimes(1));
    const [payload, batchPayload] = onAddPurchase.mock.calls[0];

    expect(payload.invoiceNumber).toBe('B3');
    expect(payload.items).toHaveLength(5);
    expect(payload.receipts?.[0].items).toHaveLength(5);
    expect(batchPayload).toHaveLength(5);
    expect(new Set(payload.items.map((item: any) => item.lineId)).size).toBe(5);
    expect(batchPayload.map((entry: any) => entry.batch.purchaseLineId)).toEqual(
      payload.items.map((item: any) => item.lineId)
    );
  });

  it('does not create a second B3 block when an active B3 purchase already exists for the supplier', async () => {
    const demo = getGuestDemoData('english');
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const onAddPurchase = vi.fn().mockResolvedValue(true);
    const existingB3: Purchase = {
      ...demo.purchases[0],
      id: 'purchase-b3-existing',
      supplierId: 'demo-sup-1',
      invoiceNumber: 'B3',
      workflowStatus: 'received',
      status: 'received',
      isDeleted: false,
    };
    renderPurchases({ onAddPurchase, purchases: [existingB3] });

    const itemsPanel = moveNewPurchaseToItemsStep({ invoiceNumber: 'B3' });
    addPurchaseLine(itemsPanel);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payments' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalize invoice' }));
    fireEvent.click(within(screen.getByTestId('final-receipt-modal')).getByRole('button', { name: 'Confirm final save' }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(onAddPurchase).not.toHaveBeenCalled();
  });

  it('final save can keep stock at zero when nothing has arrived yet', async () => {
    const onAddPurchase = vi.fn().mockResolvedValue(true);
    renderPurchases({ onAddPurchase });

    moveNewPurchaseToReviewStep();
    fireEvent.click(screen.getByRole('button', { name: 'Finalize invoice' }));
    const receiptModal = screen.getByTestId('final-receipt-modal');
    fireEvent.change(getFieldControl(receiptModal, 'Received now'), {
      target: { value: '0' },
    });
    fireEvent.click(within(receiptModal).getByRole('button', { name: 'Confirm final save' }));

    await waitFor(() => expect(onAddPurchase).toHaveBeenCalledTimes(1));
    const [payload, batchPayload] = onAddPurchase.mock.calls[0];

    expect(payload).toEqual(expect.objectContaining({
      workflowStatus: 'approved',
      receiptStatus: 'not_received',
      inventoryCommitted: false,
    }));
    expect(payload.receipts).toEqual([]);
    expect(batchPayload).toEqual([]);
  });

  it('switches supplier profile subsections without losing the selected supplier', () => {
    renderPurchases();

    fireEvent.click(screen.getByRole('tab', { name: 'Suppliers' }));

    expect(screen.getByTestId('supplier-profile-tab-summary')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('supplier-profile-tab-history'));
    expect(screen.getByText('PI-882')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('supplier-profile-tab-ledger'));
    expect(screen.getByText('Purchase invoice PI-882')).toBeInTheDocument();
  });

  it('hides deleted suppliers from the directory and purchase lookup', () => {
    const demo = getGuestDemoData('english');
    const deletedSupplier: Supplier = {
      ...demo.suppliers[0],
      id: 'supplier-deleted',
      name: 'Archived Supplier',
      code: 'ARCH',
      isDeleted: true,
    };

    renderPurchases({
      suppliers: [deletedSupplier, ...demo.suppliers],
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Suppliers' }));
    expect(screen.queryByTestId('supplier-directory-supplier-deleted')).not.toBeInTheDocument();
    expect(screen.queryByText('Archived Supplier')).not.toBeInTheDocument();
    expect(screen.getByTestId('supplier-directory-demo-sup-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'New Purchase Invoice' }));
    fireEvent.change(getFieldControl(document.body as HTMLElement, 'Search and choose supplier'), {
      target: { value: 'Archived Supplier' },
    });

    expect(screen.queryByTestId('supplier-match-supplier-deleted')).not.toBeInTheDocument();
  });

  it('stores supplier opening credit as a negative opening balance', () => {
    const onAddSupplier = vi.fn();

    renderPurchases({ onAddSupplier });

    fireEvent.click(screen.getByRole('tab', { name: 'Suppliers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Supplier' }));
    fireEvent.change(getFieldControl(document.body as HTMLElement, 'Supplier Name'), {
      target: { value: 'Opening Credit Supplier' },
    });

    const openingGroup = getFieldGroup(document.body as HTMLElement, 'Supplier opening account balance');
    fireEvent.change(openingGroup.querySelector('select') as HTMLSelectElement, {
      target: { value: 'credit' },
    });
    fireEvent.change(openingGroup.querySelector('input') as HTMLInputElement, {
      target: { value: '450' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Supplier' }));

    expect(onAddSupplier).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Opening Credit Supplier',
      openingBalance: -450,
      balance: -450,
    }));
  });

  it('requires exact supplier name before permanent supplier deletion', () => {
    const demo = getGuestDemoData('english');
    const deletableSupplier: Supplier = {
      ...demo.suppliers[0],
      id: 'supplier-purge',
      name: 'Purge Supplier',
      balance: 0,
      openingBalance: 0,
      transactions: [],
    };
    const onDeleteSupplier = vi.fn();

    renderPurchases({
      suppliers: [deletableSupplier],
      purchases: [],
      onDeleteSupplier,
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Suppliers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete supplier' }));
    fireEvent.click(screen.getByText('Permanent full delete').closest('label') as HTMLElement);

    expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeDisabled();

    fireEvent.change(getFieldControl(document.body as HTMLElement, 'Type supplier name to confirm'), {
      target: { value: 'Purge Supplier' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }));

    expect(onDeleteSupplier).toHaveBeenCalledWith('supplier-purge', 'purge');
  });

  it('locks permanent supplier deletion when linked batches were used in sales', () => {
    const demo = getGuestDemoData('english');
    const supplier: Supplier = {
      ...demo.suppliers[0],
      id: 'supplier-dependent-sales',
      name: 'Dependent Sales Supplier',
    };
    const medicine: Medicine = {
      ...demo.medicines[0],
      id: 'medicine-dependent-sales',
      preferredSupplierId: supplier.id,
      batches: [
        {
          ...demo.medicines[0].batches[0],
          id: 'batch-dependent-sales',
          supplierId: supplier.id,
          purchaseId: 'purchase-dependent-sales',
        },
      ],
    };
    const purchase: Purchase = {
      ...demo.purchases[0],
      id: 'purchase-dependent-sales',
      supplierId: supplier.id,
    };
    const invoice: Invoice = {
      ...demo.invoices[0],
      id: 'invoice-dependent-sales',
      isDeleted: false,
      items: [
        {
          ...demo.invoices[0].items[0],
          medicineId: medicine.id,
          batchId: 'batch-dependent-sales',
        },
      ],
    };
    const onDeleteSupplier = vi.fn();

    renderPurchases({
      suppliers: [supplier],
      medicines: [medicine],
      purchases: [purchase],
      invoices: [invoice],
      onDeleteSupplier,
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Suppliers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete supplier' }));

    expect(screen.getByText('Permanent deletion is locked because one or more sales used batches from this supplier.')).toBeInTheDocument();
    expect((screen.getByText('Permanent full delete').closest('label') as HTMLElement).querySelector('input')).toBeDisabled();
  });

  it('shows latest supplier payment details beside settlement actions', () => {
    const demo = getGuestDemoData('english');
    const paymentSupplier: Supplier = {
      ...demo.suppliers[0],
      id: 'sup-payment-details',
      name: 'Payment Detail Supplier',
      balance: 75,
      transactions: [
        {
          id: 'txn-payment-details',
          date: '2026-03-05T08:30:00.000Z',
          type: 'payment',
          amount: 125.5,
          balanceAfter: 75,
          description: 'Supplier settlement',
          method: 'bank_transfer',
          referenceId: 'PAY-REF-1',
          note: buildSupplierFinanceTaggedNote('advance_payment', 'Wire transfer note'),
          recordedBy: 'Fazl',
        },
      ],
    };

    renderPurchases({
      suppliers: [paymentSupplier],
      purchases: [],
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Suppliers' }));

    const summary = screen.getByTestId('supplier-payment-details-summary');
    expect(summary).toHaveTextContent('Latest payment details');
    expect(summary).toHaveTextContent('125.5 AFN');
    expect(summary).toHaveTextContent('Bank Transfer');
    expect(summary).toHaveTextContent('PAY-REF-1');
    expect(summary).toHaveTextContent('Net debt: 200.5 AFN');
    expect(summary).toHaveTextContent('Debt reduced');
    expect(summary).toHaveTextContent('Saved as prepayment');
    expect(summary).toHaveTextContent('Net debt: 75 AFN');
    expect(summary).toHaveTextContent('Wire transfer note');
    expect(summary).toHaveTextContent('Fazl');

    fireEvent.click(within(summary).getByTestId('toggle-supplier-payment-details'));
    expect(summary).toHaveTextContent('Show list');
    expect(summary).not.toHaveTextContent('Wire transfer note');

    fireEvent.click(within(summary).getByTestId('toggle-supplier-payment-details'));
    expect(summary).toHaveTextContent('Hide list');
    expect(summary).toHaveTextContent('Wire transfer note');
  });

  it('shows open debt as the primary supplier state when a supplier also has real prepayment', () => {
    const demo = getGuestDemoData('english');
    const mixedSupplier: Supplier = {
      ...demo.suppliers[0],
      id: 'sup-mixed',
      name: 'Mixed Position Supplier',
      balance: 100,
      transactions: [
        {
          id: 'sup-mixed-purchase',
          date: '2026-03-01T08:00:00.000Z',
          type: 'purchase',
          amount: 300,
          balanceAfter: 300,
          description: 'Purchase invoice MIX-1',
          purchaseId: 'purchase-mixed-1',
        },
        {
          id: 'sup-mixed-advance',
          date: '2026-03-02T09:00:00.000Z',
          type: 'payment',
          amount: 200,
          balanceAfter: 100,
          description: 'Advance payment',
          note: buildSupplierFinanceTaggedNote('advance_payment', 'Advance kept for future invoice'),
        },
      ],
    };
    const prepaidSupplier: Supplier = {
      ...demo.suppliers[1],
      id: 'sup-prepaid',
      name: 'Prepaid Supplier',
      balance: -150,
      transactions: [
        {
          id: 'sup-prepaid-advance',
          date: '2026-03-02T09:00:00.000Z',
          type: 'payment',
          amount: 150,
          balanceAfter: -150,
          description: 'Advance payment',
          note: buildSupplierFinanceTaggedNote('advance_payment', 'Advance'),
        },
      ],
    };
    const settledSupplier: Supplier = {
      ...demo.suppliers[0],
      id: 'sup-settled',
      name: 'Settled Supplier',
      balance: 0,
      transactions: [],
    };
    const mixedPurchase: Purchase = {
      ...demo.purchases[0],
      id: 'purchase-mixed-1',
      supplierId: mixedSupplier.id,
      invoiceNumber: 'MIX-1',
      items: [{
        ...demo.purchases[0].items[0],
        quantity: 10,
        baseQuantity: 10,
        purchasePrice: 30,
        lineTotal: 300,
      }],
      totalAmount: 300,
      paidAmount: 0,
      remainingAmount: 300,
      workflowStatus: 'received',
      status: 'credit',
      payments: [],
      vendorCredits: [],
    };

    renderPurchases({
      suppliers: [mixedSupplier, prepaidSupplier, settledSupplier],
      purchases: [mixedPurchase],
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Suppliers' }));

    expect(within(screen.getByTestId('supplier-directory-sup-mixed')).getByText('Open debt')).toBeInTheDocument();
    expect(within(screen.getByTestId('supplier-directory-sup-mixed')).getByText('300 AFN')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record settlement' })).toBeEnabled();
    expect(screen.getAllByText('Supplier prepayment').length).toBeGreaterThan(0);
    expect(screen.getAllByText('200 AFN').length).toBeGreaterThan(0);

    const suppliersTab = screen.getByTestId('purchases-suppliers-tab');
    const debtFilter = within(suppliersTab).getAllByRole('combobox')[0] as HTMLSelectElement;

    fireEvent.change(debtFilter, {
      target: { value: 'prepaid' },
    });

    expect(screen.getByTestId('supplier-directory-sup-prepaid')).toBeInTheDocument();
    expect(screen.queryByTestId('supplier-directory-sup-mixed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('supplier-directory-sup-settled')).not.toBeInTheDocument();

    fireEvent.change(debtFilter, {
      target: { value: 'settled' },
    });

    expect(screen.getByTestId('supplier-directory-sup-settled')).toBeInTheDocument();
    expect(screen.queryByTestId('supplier-directory-sup-prepaid')).not.toBeInTheDocument();
  });

  it('records supplier settlement through the settlement callback and previews overflow as prepayment', () => {
    const demo = getGuestDemoData('english');
    const settlementSupplier: Supplier = {
      ...demo.suppliers[0],
      id: 'sup-settlement',
      name: 'Settlement Supplier',
      balance: 300,
      transactions: [
        {
          id: 'sup-settlement-purchase',
          date: '2026-03-01T08:00:00.000Z',
          type: 'purchase',
          amount: 300,
          balanceAfter: 300,
          description: 'Purchase invoice SET-1',
          purchaseId: 'purchase-settlement-1',
        },
      ],
    };
    const purchase: Purchase = {
      ...demo.purchases[0],
      id: 'purchase-settlement-1',
      supplierId: settlementSupplier.id,
      invoiceNumber: 'SET-1',
      items: [{
        ...demo.purchases[0].items[0],
        quantity: 10,
        baseQuantity: 10,
        purchasePrice: 30,
        lineTotal: 300,
      }],
      totalAmount: 300,
      paidAmount: 0,
      remainingAmount: 300,
      workflowStatus: 'received',
      status: 'credit',
      payments: [],
      vendorCredits: [],
    };
    const onRecordSupplierSettlement = vi.fn();
    const onAddSupplierPayment = vi.fn();

    renderPurchases({
      suppliers: [settlementSupplier],
      purchases: [purchase],
      onRecordSupplierSettlement,
      onAddSupplierPayment,
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Suppliers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record settlement' }));
    fireEvent.change(getFieldControl(document.body as HTMLElement, 'Settlement Amount'), {
      target: { value: '500' },
    });

    expect(screen.getByText('Extra payment becomes supplier prepayment')).toBeInTheDocument();
    expect(screen.getByText('Projected prepayment')).toBeInTheDocument();
    expect(screen.getAllByText('200 AFN').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Record Settlement' }));

    expect(onAddSupplierPayment).not.toHaveBeenCalled();
    expect(onRecordSupplierSettlement).toHaveBeenCalledWith(
      'sup-settlement',
      expect.objectContaining({
        amount: 500,
        method: 'bank_transfer',
        reference: '',
        note: '',
        description: 'Supplier settlement',
        settlementId: expect.any(String),
      })
    );
  });

  it('records explicit advance payment separately from settlement', () => {
    const demo = getGuestDemoData('english');
    const advanceSupplier: Supplier = {
      ...demo.suppliers[0],
      id: 'sup-advance',
      name: 'Advance Supplier',
      balance: 300,
      transactions: [
        {
          id: 'sup-advance-purchase',
          date: '2026-03-01T08:00:00.000Z',
          type: 'purchase',
          amount: 300,
          balanceAfter: 300,
          description: 'Purchase invoice ADV-1',
          purchaseId: 'purchase-advance-1',
        },
      ],
    };
    const purchase: Purchase = {
      ...demo.purchases[0],
      id: 'purchase-advance-1',
      supplierId: advanceSupplier.id,
      invoiceNumber: 'ADV-1',
      totalAmount: 300,
      paidAmount: 0,
      remainingAmount: 300,
      workflowStatus: 'received',
      status: 'credit',
      payments: [],
      vendorCredits: [],
    };
    const onAddSupplierPayment = vi.fn();
    const onRecordSupplierSettlement = vi.fn();

    renderPurchases({
      suppliers: [advanceSupplier],
      purchases: [purchase],
      onAddSupplierPayment,
      onRecordSupplierSettlement,
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Suppliers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record advance payment' }));

    expect(screen.getByText('Advance payment does not reduce the current open invoices')).toBeInTheDocument();
    fireEvent.change(getFieldControl(document.body as HTMLElement, 'Settlement Amount'), {
      target: { value: '200' },
    });
    expect(screen.getByText('Projected open debt')).toBeInTheDocument();
    expect(screen.getAllByText('300 AFN').length).toBeGreaterThan(0);

    const advancePaymentPanel = screen
      .getByText('Advance payment does not reduce the current open invoices')
      .closest('.wk-page-surface');
    expect(advancePaymentPanel).not.toBeNull();

    fireEvent.click(
      within(advancePaymentPanel as HTMLElement).getByRole('button', { name: 'Record advance payment' })
    );

    expect(onRecordSupplierSettlement).not.toHaveBeenCalled();
    expect(onAddSupplierPayment).toHaveBeenCalledWith(
      'sup-advance',
      expect.objectContaining({
        amount: 200,
        method: 'bank_transfer',
        reference: '',
        note: '',
        description: 'Supplier advance payment',
      })
    );
  });

  it('NEW - prefills purchase context conservatively from inventory receipt entry', () => {
    const onRequestedPurchaseContextApplied = vi.fn();

    renderPurchases({
      requestedTab: 'new',
      requestedPurchaseContext: {
        medicineId: 'demo-med-1',
        medicineName: 'Paracetamol 500mg',
        preferredSupplierId: 'demo-sup-1',
      },
      onRequestedPurchaseContextApplied,
    });

    expect(screen.getByTestId('purchase-step-panel-items')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Paracetamol 500mg')).toBeInTheDocument();
    expect(onRequestedPurchaseContextApplied).toHaveBeenCalledTimes(1);
  });

  it('opens the requested supplier draft in the editor and shows the medicine-entry banner', () => {
    const onRequestedPurchaseDraftFocusApplied = vi.fn();

    renderPurchases({
      requestedPurchaseDraftFocus: {
        purchaseId: 'demo-purchase-1',
        medicineName: 'Paracetamol 500mg',
        source: 'medicine_entry',
      },
      onRequestedPurchaseDraftFocusApplied,
    });

    expect(screen.getByTestId('purchases-new-tab')).toBeInTheDocument();
    expect(screen.getByTestId('purchase-draft-focus-banner')).toHaveTextContent('Paracetamol 500mg');
    expect(screen.getByText('Editing purchase')).toBeInTheDocument();
    expect(onRequestedPurchaseDraftFocusApplied).toHaveBeenCalledTimes(1);
  });

  it('opens a requested purchase editor without the medicine-entry banner for generic invoice edits', () => {
    const onRequestedPurchaseDraftFocusApplied = vi.fn();

    renderPurchases({
      requestedPurchaseDraftFocus: {
        purchaseId: 'demo-purchase-1',
      },
      onRequestedPurchaseDraftFocusApplied,
    });

    expect(screen.getByTestId('purchases-new-tab')).toBeInTheDocument();
    expect(screen.getByText('Editing purchase')).toBeInTheDocument();
    expect(screen.queryByTestId('purchase-draft-focus-banner')).not.toBeInTheDocument();
    expect(onRequestedPurchaseDraftFocusApplied).toHaveBeenCalledTimes(1);
  });

  it('offers a direct cancel action for the medicine-entry draft banner', async () => {
    const onUpdatePurchase = vi.fn(async () => true);
    const { demo, blessbeeSupplier, draftPurchase } = createFinalizeDraftScenario();
    const committedDraft: Purchase = {
      ...draftPurchase,
      inventoryCommitted: true,
      receivedAt: '2026-04-03T09:15:00.000Z',
    };

    renderPurchases({
      suppliers: [blessbeeSupplier, ...demo.suppliers],
      purchases: [committedDraft],
      onUpdatePurchase,
      requestedPurchaseDraftFocus: {
        purchaseId: committedDraft.id,
        medicineName: 'Paracetamol 500mg',
        source: 'medicine_entry',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Draft' }));

    await waitFor(() => expect(onUpdatePurchase).toHaveBeenCalledTimes(1));
    expect(onUpdatePurchase).toHaveBeenCalledWith(
      committedDraft.id,
      expect.objectContaining({
        workflowStatus: 'cancelled',
        status: 'cancelled',
        inventoryCommitted: false,
      }),
      []
    );
  });

  it('NEW - records a partial purchase receipt without changing the existing history flow', () => {
    const onRecordPurchaseReceipt = vi.fn();
    renderPurchases({ onRecordPurchaseReceipt });

    fireEvent.click(screen.getByTestId('history-row-demo-purchase-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Open full modal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record Receipt' }));

    fireEvent.change(getFieldControl(document.body as HTMLElement, 'Receive now'), {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record Receipt' }));

    expect(onRecordPurchaseReceipt).toHaveBeenCalledWith(
      'demo-purchase-1',
      expect.objectContaining({
        supplierLiabilityImpact: true,
        items: [
          expect.objectContaining({
            medicineId: 'demo-med-1',
            purchaseItemIndex: 0,
            quantity: 10,
          }),
        ],
      })
    );
  });

  it('NEW - short closes a purchase with an explicit reason', () => {
    const onShortClosePurchase = vi.fn();
    renderPurchases({ onShortClosePurchase });

    fireEvent.click(screen.getByTestId('history-row-demo-purchase-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Open full modal' }));
    const moreActionsButtons = screen.getAllByText('More actions');
    fireEvent.click(moreActionsButtons[moreActionsButtons.length - 1] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Short Close' }));
    fireEvent.change(getFieldControl(document.body as HTMLElement, 'Reason'), {
      target: { value: 'Supplier confirmed the remaining cartons will not arrive.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Short Close' }));

    expect(onShortClosePurchase).toHaveBeenCalledWith(
      'demo-purchase-1',
      'Supplier confirmed the remaining cartons will not arrive.'
    );
  });

  it('requires due date before finalizing a draft purchase with remaining balance', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const onUpdatePurchase = vi.fn();
    const { demo, blessbeeSupplier, draftPurchase } = createFinalizeDraftScenario();

    renderPurchases({
      suppliers: [blessbeeSupplier, ...demo.suppliers],
      purchases: [draftPurchase],
      onUpdatePurchase,
    });

    fireEvent.click(screen.getByTestId('history-row-demo-purchase-draft'));
    fireEvent.click(screen.getByRole('button', { name: 'Open full modal' }));
    const moreActionsButtons = screen.getAllByText('More actions');
    fireEvent.click(moreActionsButtons[moreActionsButtons.length - 1] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Finalize Draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Finalize' }));

    expect(alertSpy).toHaveBeenCalledWith('Set a due date before finalizing a draft with remaining balance.');
    expect(onUpdatePurchase).not.toHaveBeenCalled();
  });

  it('keeps the finalize draft modal open when finalizing the draft fails', async () => {
    const onUpdatePurchase = vi.fn().mockResolvedValue(false);
    const { demo, blessbeeSupplier, draftPurchase } = createFinalizeDraftScenario();

    renderPurchases({
      suppliers: [blessbeeSupplier, ...demo.suppliers],
      purchases: [draftPurchase],
      onUpdatePurchase,
    });

    fireEvent.click(screen.getByTestId('history-row-demo-purchase-draft'));
    fireEvent.click(screen.getByRole('button', { name: 'Open full modal' }));
    const moreActionsButtons = screen.getAllByText('More actions');
    fireEvent.click(moreActionsButtons[moreActionsButtons.length - 1] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Finalize Draft' }));

    fireEvent.change(getFieldControl(document.body as HTMLElement, 'Due date'), {
      target: { value: '2026-04-10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Finalize' }));

    await waitFor(() => expect(onUpdatePurchase).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('finalize-draft-modal')).toBeInTheDocument();
    expect(getFieldControl(document.body as HTMLElement, 'Due date')).toHaveValue('2026-04-10');
  });

  it('finalizes a draft purchase from more actions and removes the draft status badge', async () => {
    const { blessbeeSupplier, draftPurchase } = createFinalizeDraftScenario();

    const Harness = () => {
      const [purchases, setPurchases] = useState<Purchase[]>([draftPurchase]);

      return (
        <Purchases
          {...createPurchasesProps({
            suppliers: [blessbeeSupplier],
            purchases,
          })}
          suppliers={[blessbeeSupplier]}
          purchases={purchases}
          onUpdatePurchase={(purchaseId, purchase) => {
            setPurchases((current) =>
              current.map((entry) => (entry.id === purchaseId ? { id: purchaseId, ...purchase } : entry))
            );
          }}
        />
      );
    };

    render(<Harness />);

    fireEvent.click(screen.getByTestId('history-row-demo-purchase-draft'));
    fireEvent.click(screen.getByRole('button', { name: 'Open full modal' }));
    const moreActionsButtons = screen.getAllByText('More actions');
    fireEvent.click(moreActionsButtons[moreActionsButtons.length - 1] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Finalize Draft' }));

    expect(screen.getByTestId('finalize-draft-modal')).toHaveTextContent('blessbee');

    fireEvent.change(getFieldControl(document.body as HTMLElement, 'Due date'), {
      target: { value: '2026-04-10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Finalize' }));

    await waitFor(() => {
      const row = screen.getByTestId('history-row-demo-purchase-draft');
      expect(row).toHaveTextContent('Received');
      expect(row).not.toHaveTextContent('Draft');
    });
  });

  it('keeps each warehouse return inside the source procurement document instead of listing it separately', () => {
    const demo = getGuestDemoData('english');
    const returnReferencePurchase = createReturnReferencePurchase(demo);

    renderPurchases({
      purchases: [returnReferencePurchase, ...demo.purchases],
    });

    expect(screen.queryByTestId('history-row-demo-return-purchase-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('history-row-demo-purchase-1'));

    const detailPanel = screen.getByTestId('history-detail-panel');
    expect(within(detailPanel).getByText('Recorded warehouse returns')).toBeInTheDocument();
    expect(within(detailPanel).getByText('Single document view')).toBeInTheDocument();
    expect(within(detailPanel).getAllByText('RET-0001').length).toBeGreaterThan(0);
    expect(within(detailPanel).getByText((content) => content.includes('PCM-2401'))).toBeInTheDocument();
    expect(within(detailPanel).getAllByText('Vendor Credit').length).toBeGreaterThan(0);
    expect(within(detailPanel).getByText('Damaged cartons')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open full modal' }));
    expect(screen.getByText('Linked Return References')).toBeInTheDocument();
    expect(screen.getByText('Vendor credit total')).toBeInTheDocument();
    expect(screen.queryByText('Return Reference Context')).not.toBeInTheDocument();
    expect(screen.getAllByText('Damaged cartons').length).toBeGreaterThan(0);
  });

  it('allows editing a linked warehouse return from the single-document detail view', () => {
    const demo = getGuestDemoData('english');
    const returnReferencePurchase = createReturnReferencePurchase(demo);

    renderPurchases({
      purchases: [returnReferencePurchase, ...demo.purchases],
    });

    fireEvent.click(screen.getByTestId('history-row-demo-purchase-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit return document' }));

    expect(screen.getByTestId('purchase-step-panel-items')).toBeInTheDocument();
    expect(screen.getByText('Editing purchase')).toBeInTheDocument();
  });

  it('allows deleting a linked warehouse return from the single-document detail view', () => {
    const demo = getGuestDemoData('english');
    const returnReferencePurchase = createReturnReferencePurchase(demo);
    const onDeletePurchase = vi.fn();

    renderPurchases({
      purchases: [returnReferencePurchase, ...demo.purchases],
      onDeletePurchase,
    });

    fireEvent.click(screen.getByTestId('history-row-demo-purchase-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete return document' }));
    expect(
      screen.getByText(
        'Deleting this return document rolls back its vendor credit and removes its linked return trace from the source purchase. Use this only if the return was recorded by mistake.'
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete and Roll Back' }));

    expect(onDeletePurchase).toHaveBeenCalledWith('demo-return-purchase-1');
  });

  it('shows direct delete in the history detail panel for a selected purchase and confirms the right record', () => {
    const onDeletePurchase = vi.fn();

    renderPurchases({ onDeletePurchase });

    fireEvent.click(screen.getByTestId('history-row-demo-purchase-1'));

    const detailPanel = screen.getByTestId('history-detail-panel');
    fireEvent.click(within(detailPanel).getByRole('button', { name: 'Delete document' }));

    expect(
      screen.getByText(
        'Deleting this purchase document rolls back linked stock batches and recalculates the supplier debt for this invoice. Use this only for mistaken or cancelled procurement records.'
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText('PI-882').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Delete and Roll Back' }));

    expect(onDeletePurchase).toHaveBeenCalledWith('demo-purchase-1');
  });

  it('keeps the direct delete button disabled when purchase deletion is not allowed', () => {
    renderPurchases({ readOnly: true });

    fireEvent.click(screen.getByTestId('history-row-demo-purchase-1'));

    expect(
      within(screen.getByTestId('history-detail-panel')).getByRole('button', { name: 'Delete document' })
    ).toBeDisabled();
  });

  it('prints purchase history with utf-8 markup and readable Dari labels', () => {
    vi.useFakeTimers();
    const { mockWindow, documentWrite, print } = createPrintWindowMock();
    vi.spyOn(window, 'open').mockReturnValue(mockWindow as any);
    const dariDemo = getGuestDemoData('dari');

    renderPurchases({ settings: dariDemo.settings });

    fireEvent.click(screen.getAllByRole('button', { name: 'چاپ / PDF' })[0]);

    expect(documentWrite).toHaveBeenCalledTimes(1);
    const markup = documentWrite.mock.calls[0][0] as string;
    expect(markup).toContain('<meta charset="utf-8"');
    expect(markup).toContain('گزارش تاریخچه خرید');
    expect(markup).toContain('تأمین‌کننده');
    expect(markup).toContain('جمع خرید فیلترشده');

    mockWindow.onload?.();
    vi.runAllTimers();

    expect(print).toHaveBeenCalled();
  });

  it('prints purchase invoice with utf-8 markup and readable Dari labels', () => {
    vi.useFakeTimers();
    const { mockWindow, documentWrite, print } = createPrintWindowMock();
    vi.spyOn(window, 'open').mockReturnValue(mockWindow as any);
    const dariDemo = getGuestDemoData('dari');

    renderPurchases({ settings: dariDemo.settings });

    fireEvent.click(screen.getByTestId('history-row-demo-purchase-1'));
    fireEvent.click(screen.getByRole('button', { name: 'بازکردن جزئیات کامل' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'چاپ / PDF' }).at(-1) as HTMLElement);

    expect(documentWrite).toHaveBeenCalledTimes(1);
    const markup = documentWrite.mock.calls[0][0] as string;
    expect(markup).toContain('<meta charset="utf-8"');
    expect(markup).toContain('فاکتور خرید');
    expect(markup).toContain('جمع نهایی');
    expect(markup).toContain('قیمت خرید');

    mockWindow.onload?.();
    vi.runAllTimers();

    expect(print).toHaveBeenCalled();
  });

  it('exports purchase history csv with utf-8 bom and readable Dari headers', async () => {
    const dariDemo = getGuestDemoData('dari');
    let capturedBlob: Blob | null = null;
    let capturedBlobParts: BlobPart[] = [];

    const NativeBlob = Blob;
    class CapturedBlob extends NativeBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        capturedBlobParts = parts ? [...parts] : [];
        super(parts ?? [], options);
      }
    }

    vi.stubGlobal('Blob', CapturedBlob);

    if (!('createObjectURL' in URL)) {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: vi.fn(),
      });
    }

    if (!('revokeObjectURL' in URL)) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: vi.fn(),
      });
    }

    vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
      capturedBlob = obj instanceof Blob ? obj : null;
      return 'blob:mock';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderPurchases({ settings: dariDemo.settings });

    fireEvent.click(screen.getByRole('button', { name: 'خروجی CSV' }));

    expect(capturedBlob).not.toBeNull();
    const csvText = String(capturedBlobParts[0] ?? '');

    expect(csvText.startsWith('\ufeff')).toBe(true);
    expect(csvText).toContain('تاریخ,تأمین‌کننده,شماره فاکتور');
    expect(csvText).toContain('وضعیت چرخه');
    expect(csvText).toContain('وضعیت پرداخت');
  });
});
