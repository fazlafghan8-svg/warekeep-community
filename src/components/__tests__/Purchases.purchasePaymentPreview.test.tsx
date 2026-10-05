import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Purchases } from '@/components/Purchases';
import { getGuestDemoData } from '@/fixtures/guestDemoData';
import type { Purchase, PurchaseItem, Supplier } from '@/types';

type PurchasesProps = ComponentProps<typeof Purchases>;

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

const createPurchaseItem = (medicineId: string, amount: number): PurchaseItem => ({
  medicineId,
  medicineName: medicineId,
  batchNumber: `B-${medicineId}`,
  expiryDate: '2027-01-01',
  quantity: 1,
  purchasePrice: amount,
});

const createProps = (): PurchasesProps => {
  const demo = getGuestDemoData('english');
  const supplier: Supplier = {
    ...demo.suppliers[0],
    id: 'sup-preview',
    name: 'Preview Supplier',
    balance: 1500,
  };
  const targetPurchase: Purchase = {
    ...demo.purchases[0],
    id: 'purchase-target',
    supplierId: supplier.id,
    invoiceNumber: 'INV-TARGET',
    date: '2026-04-05',
    dueDate: '2026-04-20',
    totalAmount: 1000,
    paidAmount: 0,
    remainingAmount: 1000,
    subtotalAmount: 1000,
    workflowStatus: 'received',
    status: 'credit',
    items: [createPurchaseItem('med-target', 1000)],
    payments: [],
    vendorCredits: [],
  };
  const olderPurchase: Purchase = {
    ...demo.purchases[0],
    id: 'purchase-older',
    supplierId: supplier.id,
    invoiceNumber: 'INV-OLDER',
    date: '2026-04-01',
    dueDate: '2026-04-10',
    totalAmount: 200,
    paidAmount: 0,
    remainingAmount: 200,
    subtotalAmount: 200,
    workflowStatus: 'received',
    status: 'credit',
    items: [createPurchaseItem('med-older', 200)],
    payments: [],
    vendorCredits: [],
  };
  const newerPurchase: Purchase = {
    ...demo.purchases[0],
    id: 'purchase-newer',
    supplierId: supplier.id,
    invoiceNumber: 'INV-NEWER',
    date: '2026-04-03',
    dueDate: '2026-04-15',
    totalAmount: 300,
    paidAmount: 0,
    remainingAmount: 300,
    subtotalAmount: 300,
    workflowStatus: 'received',
    status: 'credit',
    items: [createPurchaseItem('med-newer', 300)],
    payments: [],
    vendorCredits: [],
  };

  return {
    suppliers: [supplier],
    purchases: [targetPurchase, newerPurchase, olderPurchase],
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
  };
};

describe('purchase payment preview modal', () => {
  it('shows target invoice, other invoices, and supplier prepayment breakdown for overpayment', async () => {
    render(<Purchases {...createProps()} />);

    const targetRow = screen.getByTestId('history-row-purchase-target');
    fireEvent.click(within(targetRow).getByRole('button', { name: 'Quick pay' }));
    fireEvent.change(getFieldControl(document.body, 'Payment Amount'), {
      target: { value: '1510' },
    });

    await waitFor(() => {
      expect(screen.getByText('Extra payment will also settle other open invoices')).toBeInTheDocument();
    });
    expect(screen.getByText('Any remaining overflow becomes supplier prepayment')).toBeInTheDocument();
    expect(screen.getByText('Applied to this invoice')).toBeInTheDocument();
    expect(screen.getByText('Applied to other invoices')).toBeInTheDocument();
    expect(screen.getByText('Saved as prepayment')).toBeInTheDocument();
    expect(screen.getAllByText(/1,?000 AFN/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/500 AFN/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/10 AFN/).length).toBeGreaterThan(0);
  });
});
