import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Customers } from '../Customers';
import type { Customer } from '@/types';

const buildCustomer = (index: number): Customer => ({
  id: `customer-${String(index).padStart(2, '0')}`,
  name: `Customer ${String(index).padStart(2, '0')}`,
  phone: `07000000${String(index).padStart(2, '0')}`,
  address: 'Kabul',
  balance: 0,
  transactions: [],
  updatedAt: `2026-01-${String(index).padStart(2, '0')}T00:00:00.000Z`
});

const renderCustomers = (customers: Customer[]) =>
  render(
    <Customers
      customers={customers}
      addCustomer={vi.fn()}
      updateCustomer={vi.fn()}
      deleteCustomer={vi.fn()}
      addCustomerPayment={vi.fn()}
      settings={{ language: 'english' } as any}
    />
  );

describe('Customers pagination', () => {
  it('renders only the current customer page and moves to the next page on demand', () => {
    renderCustomers(Array.from({ length: 30 }, (_, index) => buildCustomer(index + 1)));

    expect(screen.getByText('Customer 01')).toBeInTheDocument();
    expect(screen.queryByText('Customer 26')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next customer page' }));

    expect(screen.getByText('Customer 26')).toBeInTheDocument();
    expect(screen.queryByText('Customer 01')).not.toBeInTheDocument();
  });
});
