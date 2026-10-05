import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WasteModal } from '../WasteModal';
import type { AppSettings, Medicine, Purchase, Supplier } from '../../types';

const baseSettings: AppSettings = {
  language: 'english',
  storeName: 'Demo',
  storePhone: '',
  storeAddress: '',
  taxRate: 0,
};

const baseMedicine: Medicine = {
  id: 'med-1',
  name: 'Amoxicillin',
  manufacturer: 'ACME',
  type: 'Capsule',
  unit: 'بسته',
  batches: [
    {
      id: 'batch-1',
      batchNumber: 'B-1',
      quantity: 12,
      expiryDate: '2027-01-01',
      purchasePrice: 50,
      history: [],
    },
  ],
  salePrices: {
    retail: 70,
    wholesale: 65,
    bulk: 60,
  },
  lowStockThreshold: 2,
};

const suppliers: Supplier[] = [
  {
    id: 'sup-1',
    name: 'Supplier One',
    phone: '0700000000',
    balance: 0,
    transactions: [],
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
        batchNumber: 'B-1',
        expiryDate: '2027-01-01',
        quantity: 12,
        purchasePrice: 50,
      },
    ],
    totalAmount: 600,
    paidAmount: 100,
    remainingAmount: 500,
    workflowStatus: 'received',
    status: 'received',
    payments: [],
    receipts: [],
    vendorCredits: [],
  },
];

const getFieldControl = (label: string) => {
  const labelNode = Array.from(document.body.querySelectorAll('label')).find(
    (node) => node.textContent?.trim() === label,
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

const renderWasteModal = (overrides: Partial<React.ComponentProps<typeof WasteModal>> = {}) => {
  const props: React.ComponentProps<typeof WasteModal> = {
    isOpen: true,
    onClose: vi.fn(),
    medicine: baseMedicine,
    suppliers,
    purchases,
    onConfirm: vi.fn().mockResolvedValue(true),
    settings: baseSettings,
    ...overrides,
  };

  return {
    ...render(<WasteModal {...props} />),
    props,
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WasteModal supplier return flow', () => {
  it('requires supplier first, then auto-creates a purchase reference when no invoice exists', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const onConfirm = vi.fn().mockResolvedValue(true);
    renderWasteModal({ purchases: [], onConfirm });

    fireEvent.change(getFieldControl('Select Batch'), { target: { value: 'batch-1' } });
    fireEvent.change(getFieldControl('Quantity'), { target: { value: '2' } });
    fireEvent.change(getFieldControl('Reason'), { target: { value: 'return_vendor' } });
    fireEvent.change(getFieldControl('Notes'), { target: { value: 'Damaged blister packs' } });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(alertSpy).toHaveBeenLastCalledWith('Please select a supplier.');

    fireEvent.change(getFieldControl('Supplier'), { target: { value: 'sup-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
        batchId: 'batch-1',
        quantity: 2,
        reason: 'return_vendor',
        supplierId: 'sup-1',
        description: 'Damaged blister packs',
        addToExpenses: false,
        amount: 100,
        resolution: 'vendor_credit',
      }));
    });
  });

  it('passes supplier, purchase, and explicit amount to the confirm handler', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const onConfirm = vi.fn().mockResolvedValue(true);
    renderWasteModal({ onConfirm });

    fireEvent.change(getFieldControl('Select Batch'), { target: { value: 'batch-1' } });
    fireEvent.change(getFieldControl('Quantity'), { target: { value: '2' } });
    fireEvent.change(getFieldControl('Reason'), { target: { value: 'return_vendor' } });
    fireEvent.change(getFieldControl('Notes'), { target: { value: 'Damaged blister packs' } });
    fireEvent.change(getFieldControl('Supplier'), { target: { value: 'sup-1' } });

    fireEvent.change(getFieldControl('Return amount'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(alertSpy).toHaveBeenLastCalledWith('Return amount must be greater than zero.');

    fireEvent.change(getFieldControl('Return amount'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
        batchId: 'batch-1',
        quantity: 2,
        reason: 'return_vendor',
        supplierId: 'sup-1',
        description: 'Damaged blister packs',
        addToExpenses: false,
        amount: 150,
        resolution: 'vendor_credit',
      }));
    });
  });

  it('exposes setup shortcuts when no supplier purchase exists', async () => {
    const onClose = vi.fn();
    const onGoToSuppliers = vi.fn();
    const onStartPurchaseReceipt = vi.fn();
    renderWasteModal({
      purchases: [],
      onClose,
      onGoToSuppliers,
      onStartPurchaseReceipt,
    });

    fireEvent.change(getFieldControl('Select Batch'), { target: { value: 'batch-1' } });
    fireEvent.change(getFieldControl('Reason'), { target: { value: 'return_vendor' } });

    const openPurchasesButton = screen.getByRole('button', { name: 'Open Purchases > New' });
    expect(openPurchasesButton).toBeDisabled();

    fireEvent.change(getFieldControl('Supplier'), { target: { value: 'sup-1' } });
    await waitFor(() => expect(openPurchasesButton).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Add supplier' }));
    expect(onGoToSuppliers).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(openPurchasesButton);
    expect(onStartPurchaseReceipt).toHaveBeenCalledWith({
      medicineId: 'med-1',
      medicineName: 'Amoxicillin',
      preferredSupplierId: 'sup-1',
    });
  });

  it('falls back to auto-create when the batch purchase link is stale', async () => {
    const onConfirm = vi.fn().mockResolvedValue(true);
    renderWasteModal({
      purchases: [],
      onConfirm,
      medicine: {
        ...baseMedicine,
        batches: [
          {
            ...baseMedicine.batches[0],
            supplierId: 'sup-1',
            purchaseId: 'pur-missing',
          },
        ],
      },
    });

    fireEvent.change(getFieldControl('Select Batch'), { target: { value: 'batch-1' } });
    fireEvent.change(getFieldControl('Quantity'), { target: { value: '2' } });
    fireEvent.change(getFieldControl('Reason'), { target: { value: 'return_vendor' } });
    fireEvent.change(getFieldControl('Notes'), { target: { value: 'Stale link return' } });

    await waitFor(() => {
      expect((getFieldControl('Supplier') as HTMLSelectElement).value).toBe('sup-1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
        supplierId: 'sup-1',
        description: 'Stale link return',
        addToExpenses: false,
        amount: 100,
        resolution: 'vendor_credit',
      }));
    });
  });
});
