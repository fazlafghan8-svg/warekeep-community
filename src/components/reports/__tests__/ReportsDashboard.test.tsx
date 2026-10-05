import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsDashboard } from '@/components/reports/ReportsDashboard';
import { getGuestDemoData } from '@/fixtures/guestDemoData';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 960, height: 420 }}>{children}</div>
    )
  };
});

vi.mock('@/services/auditService', () => ({
  auditService: {
    log: vi.fn().mockResolvedValue(undefined)
  }
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const renderDashboard = async () => {
  const demo = getGuestDemoData('dari');

  render(
    <ReportsDashboard
      mode="advanced"
      invoices={demo.invoices}
      medicines={demo.medicines}
      customers={demo.customers}
      expenses={demo.expenses}
      purchases={demo.purchases}
      suppliers={demo.suppliers}
      settings={demo.settings}
    />
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
};

describe('ReportsDashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-28T12:00:00.000Z'));
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders the advanced workspace header together with overview and detail sections', async () => {
    await renderDashboard();

    expect(screen.getByRole('heading', { level: 1, name: 'راپور پیشرفته' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'بازه' })).toHaveDisplayValue('این سال');
    expect(screen.getByRole('tablist', { name: 'بخش‌های راپور پیشرفته' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'خروجی' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'چاپ' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: 'فروش و پول' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'موجودی و هشدارها' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /جزئیات بیشتر/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps overview visible when switching tabs and starts extra details collapsed', async () => {
    await renderDashboard();

    const header = screen.getByRole('heading', { level: 1, name: 'راپور پیشرفته' });
    const salesTab = screen.getByRole('tab', { name: 'فروش و پول' });
    const inventoryTab = screen.getByRole('tab', { name: 'موجودی و هشدارها' });
    fireEvent.click(inventoryTab);

    expect(header).toBeInTheDocument();
    expect(inventoryTab).toHaveAttribute('aria-selected', 'true');
    expect(salesTab).toHaveAttribute('aria-selected', 'false');

    const detailsButton = screen.getByRole('button', { name: /جزئیات بیشتر/i });
    expect(detailsButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('button', { name: 'خروجی' }).length).toBeGreaterThan(0);
  });
});
