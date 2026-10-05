import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../../types';
import { DEFAULT_DATE_TIME_SETTINGS } from '../../lib/formatters';
import { DateTimeSettings } from '../settings/DateTimeSettings';

const baseSettings: AppSettings = {
  storeName: 'Test Store',
  storePhone: '',
  storeAddress: '',
  taxRate: 0,
  language: 'dari',
  aiLanguage: 'fa',
  defaultSalesMode: 'retail',
  dateTimeSettings: DEFAULT_DATE_TIME_SETTINGS,
};

const Harness: React.FC = () => {
  const [formData, setFormData] = React.useState<AppSettings>(baseSettings);

  return (
    <DateTimeSettings
      formData={formData}
      isReadOnly={false}
      onUpdateForm={(updater) => setFormData((prev) => updater(prev))}
    />
  );
};

describe('DateTimeSettings preview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T08:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the current day as 13 Jawza 1405 for Afghanistan Solar Hijri', () => {
    render(<Harness />);

    expect(screen.getByText('تاریخ و زمان')).toBeInTheDocument();
    const text = document.body.textContent || '';

    expect(text).toContain('۱۳');
    expect(text).toContain('جوزا');
    expect(text).toContain('۱۴۰۵');
    expect(text).not.toContain('خرداد');
    expect(text).not.toContain('۱۴۰۷');
  });

  it('lets a section switch month display from name to number', () => {
    render(<Harness />);

    const salesPreview = () => screen.getByText('تاریخ فاکتور فروش').closest('div')?.textContent || '';

    expect(salesPreview()).toContain('جوزا');

    fireEvent.change(screen.getByLabelText('شکل ماه - فروش و فاکتور'), {
      target: { value: 'number' },
    });

    expect(salesPreview()).toContain('۳');
    expect(salesPreview()).toContain('۱۴۰۵');
    expect(salesPreview()).not.toContain('جوزا');
    expect(salesPreview()).not.toContain('خرداد');
  });
});
