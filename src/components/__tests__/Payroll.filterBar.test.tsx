import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Payroll } from '@/components/Payroll';
import { getGuestDemoData } from '@/fixtures/guestDemoData';

describe('Payroll shared filter bar', () => {
  it('uses the shared search/select primitives and clears through the shared action slot', () => {
    const demo = getGuestDemoData('english');
    const { container } = render(
      <Payroll
        settings={demo.settings}
        invoices={demo.invoices}
        medicines={demo.medicines}
        expenses={demo.expenses}
        onAddExpense={vi.fn()}
      />
    );

    const searchInput = screen.getByRole('textbox', { name: 'Search payroll' });
    const statusSelect = screen.getByRole('combobox', { name: 'Status' });
    const resetButton = screen.getByRole('button', { name: 'Reset filters' });
    const filterBar = container.querySelector('.wk-filter-bar');

    expect(filterBar?.querySelector('.wk-filter-field--search')).not.toBeNull();
    expect(filterBar?.querySelector('.wk-filter-bar__actions')).not.toBeNull();

    fireEvent.change(searchInput, { target: { value: 'Admin' } });
    fireEvent.change(statusSelect, { target: { value: 'partial' } });

    expect(searchInput).toHaveValue('Admin');
    expect(statusSelect).toHaveValue('partial');

    fireEvent.click(resetButton);

    expect(searchInput).toHaveValue('');
    expect(statusSelect).toHaveValue('all');
  });
});
