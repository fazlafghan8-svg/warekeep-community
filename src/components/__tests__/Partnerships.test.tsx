import type { ComponentProps } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Partnerships } from '@/components/Partnerships';
import { getGuestDemoData } from '@/fixtures/guestDemoData';
import type { Batch, Medicine } from '@/types';

const createLinkedPartnerBatch = (batch: Batch, purchaseId: string): Batch => ({
  ...batch,
  purchaseId,
  purchaseItemIndex: 0,
  ownershipType: 'partner',
  sourceEntryType: 'partner_goods_capital',
});

const renderPartnerships = (overrides: Partial<ComponentProps<typeof Partnerships>> = {}) => {
  const demo = getGuestDemoData('english');
  const linkedMedicine: Medicine = {
    ...demo.medicines[0],
    batches: [createLinkedPartnerBatch(demo.medicines[0].batches[0], demo.purchases[0].id)],
  };

  const props: ComponentProps<typeof Partnerships> = {
    partners: demo.partners,
    invoices: demo.invoices,
    purchases: demo.purchases,
    medicines: [linkedMedicine],
    expenses: demo.expenses,
    settings: demo.settings,
    onAddPartner: vi.fn(),
    onUpdatePartner: vi.fn(),
    onDeletePartner: vi.fn(),
    onAddPartnerLedgerEntry: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<Partnerships {...props} />),
    demo,
    props,
  };
};

describe('Partnerships purchase invoice editing', () => {
  it('opens the linked purchase invoice editor from partner goods', () => {
    const onOpenPurchaseEdit = vi.fn();

    renderPartnerships({ onOpenPurchaseEdit });

    fireEvent.click(screen.getByRole('tab', { name: 'Goods' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit invoice' }));

    expect(onOpenPurchaseEdit).toHaveBeenCalledTimes(1);
    expect(onOpenPurchaseEdit).toHaveBeenCalledWith('demo-purchase-1');
  });

  it('does not offer an active invoice editor for manual partner batches without a purchase', () => {
    const demo = getGuestDemoData('english');
    const onOpenPurchaseEdit = vi.fn();
    const manualBatch: Batch = {
      ...demo.medicines[0].batches[0],
      id: 'manual-partner-batch-1',
      batchNumber: 'MANUAL-PARTNER',
      purchaseId: undefined,
      purchaseItemIndex: undefined,
      ownershipType: 'partner',
      sourceEntryType: 'partner_goods_capital',
    };
    const medicineWithManualBatch: Medicine = {
      ...demo.medicines[0],
      batches: [
        createLinkedPartnerBatch(demo.medicines[0].batches[0], demo.purchases[0].id),
        manualBatch,
      ],
    };

    renderPartnerships({
      onOpenPurchaseEdit,
      medicines: [medicineWithManualBatch],
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Goods' }));
    const manualRow = screen.getByText('MANUAL-PARTNER').closest('tr');

    expect(manualRow).not.toBeNull();
    expect(within(manualRow as HTMLTableRowElement).getByRole('button', { name: 'Edit invoice' })).toBeDisabled();
  });
});
