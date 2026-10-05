import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ActiveFilterChip,
  FilterRangeField,
  FilterSearchField,
  FilterSelectField,
  UnifiedFilterBar,
} from '@/components/ui/UnifiedFilterBar';

describe('UnifiedFilterBar', () => {
  it('renders shared search, range, actions, and footer slots in the default layout', () => {
    const { container } = render(
      <UnifiedFilterBar
        searchSlot={
          <FilterSearchField
            label="Search purchases"
            value=""
            onChange={() => {}}
            placeholder="Search records"
          />
        }
        filters={[
          <FilterSelectField
            key="status"
            label="Status"
            value="all"
            onChange={() => {}}
            options={[
              { value: 'all', label: 'All' },
              { value: 'open', label: 'Open' },
            ]}
          />,
          <FilterRangeField
            key="date-range"
            label="Date range"
            startLabel="From"
            endLabel="To"
            startControl={<input type="date" aria-label="From date" className="wk-input wk-date-input" />}
            endControl={<input type="date" aria-label="To date" className="wk-input wk-date-input" />}
          />,
        ]}
        actionsSlot={<button type="button">Reset filters</button>}
        resultsLabel="12 results"
        activeFiltersSlot={
          <div>
            <ActiveFilterChip label="Status: Open" />
          </div>
        }
      />
    );

    const filterBar = container.querySelector('.wk-filter-bar');
    expect(filterBar).toHaveAttribute('data-density', 'default');
    expect(filterBar?.querySelector('.wk-filter-bar__search')).not.toBeNull();
    expect(filterBar?.querySelector('.wk-filter-bar__grid')).not.toBeNull();
    expect(filterBar?.querySelector('.wk-filter-bar__actions')).not.toBeNull();
    expect(filterBar?.querySelector('.wk-filter-bar__footer')).not.toBeNull();

    expect(screen.getByRole('textbox', { name: 'Search purchases' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset filters' })).toBeInTheDocument();

    const dateRange = screen.getByRole('group', { name: 'Date range' });
    expect(within(dateRange).getByLabelText('From date')).toBeInTheDocument();
    expect(within(dateRange).getByLabelText('To date')).toBeInTheDocument();
    expect(screen.getByText('12 results')).toBeInTheDocument();
    expect(screen.getByText('Status: Open')).toBeInTheDocument();
  });

  it('keeps dense mode and custom layout hooks without breaking the shared structure', () => {
    const { container } = render(
      <UnifiedFilterBar
        dense
        filtersClassName="test-filter-grid"
        actionsClassName="test-filter-actions"
        searchSlot={<FilterSearchField label="Search suppliers" value="" onChange={() => {}} />}
        filters={[
          <FilterSelectField
            key="sort"
            label="Sort"
            value="name"
            onChange={() => {}}
            options={[{ value: 'name', label: 'Name' }]}
          />,
        ]}
        actionsSlot={<button type="button">Export</button>}
      />
    );

    const filterBar = container.querySelector('.wk-filter-bar');
    expect(filterBar).toHaveAttribute('data-density', 'dense');
    expect(filterBar?.className).toContain('wk-filter-bar--dense');
    expect(container.querySelector('.test-filter-grid')).not.toBeNull();
    expect(container.querySelector('.test-filter-actions')).not.toBeNull();
    expect(container.querySelector('.wk-filter-field--search')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('anchors search icons to the visual left edge so RTL search text stays clear', () => {
    const { container, rerender } = render(
      <FilterSearchField
        label="Search inventory"
        value=""
        onChange={() => {}}
        dir="rtl"
        icon={<span aria-hidden="true">S</span>}
      />
    );

    expect(container.querySelector('.wk-control-affix--inline-left')).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Search inventory' }).className).toContain(
      'wk-input--with-inline-left-affix'
    );

    rerender(
      <FilterSearchField
        label="Search inventory"
        value=""
        onChange={() => {}}
        dir="ltr"
        icon={<span aria-hidden="true">S</span>}
      />
    );

    expect(container.querySelector('.wk-control-affix--inline-left')).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Search inventory' }).className).toContain(
      'wk-input--ltr'
    );
  });
});
