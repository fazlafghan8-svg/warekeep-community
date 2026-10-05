import type { ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Purchases } from '@/components/Purchases';
import { getGuestDemoData } from '@/fixtures/guestDemoData';

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

const renderPurchases = (overrides: PurchasesOverrides = {}) =>
  render(<Purchases {...createPurchasesProps(overrides)} />);

describe('Purchases filter layout', () => {
  it('pairs history date and amount filters under shared range cards', () => {
    renderPurchases();

    const historyTab = screen.getByTestId('purchases-history-tab');
    expect(within(historyTab).getByRole('textbox', { name: 'Search purchases' })).toBeInTheDocument();
    expect(historyTab.querySelector('.wk-filter-bar__grid')).not.toBeNull();

    const dateRange = within(historyTab).getByRole('group', { name: 'Date range' });
    expect(within(dateRange).getByLabelText('From date')).toBeInTheDocument();
    expect(within(dateRange).getByLabelText('To date')).toBeInTheDocument();

    const amountRange = within(historyTab).getByRole('group', { name: 'Amount range' });
    expect(within(amountRange).getByLabelText('Minimum amount')).toBeInTheDocument();
    expect(within(amountRange).getByLabelText('Maximum amount')).toBeInTheDocument();
  });

  it('keeps the supplier directory on the shared filter system shell', () => {
    renderPurchases();

    fireEvent.click(screen.getByRole('tab', { name: 'Suppliers' }));

    const suppliersTab = screen.getByTestId('purchases-suppliers-tab');
    const filterBar = suppliersTab.querySelector('.wk-filter-bar');

    expect(filterBar?.querySelector('.wk-filter-bar__search')).not.toBeNull();
    expect(filterBar?.querySelector('.wk-filter-bar__grid')).not.toBeNull();
    expect(filterBar?.querySelector('.wk-filter-bar__actions')).not.toBeNull();
    expect(within(suppliersTab).getByRole('textbox', { name: 'Search suppliers' })).toBeInTheDocument();
    expect(within(suppliersTab).getByRole('combobox', { name: 'Debt' })).toBeInTheDocument();
    expect(within(suppliersTab).getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
    expect(within(suppliersTab).getByRole('combobox', { name: 'Interaction' })).toBeInTheDocument();
  });
});
