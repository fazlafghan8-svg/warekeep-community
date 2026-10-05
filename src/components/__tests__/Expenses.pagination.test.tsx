import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Expenses } from '../Expenses';
import type { Expense } from '@/types';

const buildExpense = (index: number): Expense => ({
  id: `expense-${String(index).padStart(2, '0')}`,
  title: `Expense ${String(index).padStart(2, '0')}`,
  amount: index * 10,
  category: 'Rent',
  date: `2026-01-${String(31 - index).padStart(2, '0')}`,
  description: `Expense note ${index}`
});

const renderExpenses = (expenses: Expense[]) =>
  render(
    <Expenses
      expenses={expenses}
      onAddExpense={vi.fn()}
      onDeleteExpense={vi.fn()}
      settings={{
        language: 'english',
        expenseCategories: ['Rent'],
        currencySettings: { baseCurrency: 'AFN' }
      } as any}
    />
  );

describe('Expenses pagination', () => {
  it('renders only the current expense page and moves to the next page on demand', () => {
    renderExpenses(Array.from({ length: 30 }, (_, index) => buildExpense(index + 1)));

    expect(within(screen.getByRole('table')).getByText('Expense 01')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).queryByText('Expense 26')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next expense page' }));

    expect(within(screen.getByRole('table')).getByText('Expense 26')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).queryByText('Expense 01')).not.toBeInTheDocument();
  });
});
