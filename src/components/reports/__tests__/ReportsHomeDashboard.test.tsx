import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppUser } from '@/types';
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

type HomeDashboardOverrides = Partial<ComponentProps<typeof ReportsDashboard>>;

const createRestrictedUser = (permissions: AppUser['permissions'] = []): AppUser => ({
  id: 'staff-1',
  name: 'Restricted User',
  pinCode: '1234',
  role: 'staff',
  permissions
});

const settleReports = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
};

const renderHomeDashboard = async (overrides: HomeDashboardOverrides = {}) => {
  const demo = getGuestDemoData('dari');
  const onDeleteInvoices = vi.fn();
  const onAddExpense = vi.fn();
  const onUpdateExpense = vi.fn();
  const onDeleteExpense = vi.fn();

  const props: ComponentProps<typeof ReportsDashboard> = {
    mode: "home",
    invoices: demo.invoices,
    medicines: demo.medicines,
    customers: demo.customers,
    expenses: demo.expenses,
    purchases: demo.purchases,
    suppliers: demo.suppliers,
    settings: demo.settings,
    onDeleteInvoices,
    canDeleteInvoices: true,
    onAddExpense,
    onUpdateExpense,
    onDeleteExpense,
    canManageExpenses: true,
    ...overrides
  };

  const view = render(
    <ReportsDashboard
      {...props}
    />
  );

  await settleReports();

  const rerenderHomeDashboard = (nextOverrides: HomeDashboardOverrides = {}) => {
    view.rerender(<ReportsDashboard {...props} {...nextOverrides} />);
  };

  return { demo, onDeleteInvoices, onAddExpense, onUpdateExpense, onDeleteExpense, rerenderHomeDashboard, ...view };
};

const openInvoiceActions = (invoiceLabel = '#1305') => {
  fireEvent.click(screen.getByRole('button', { name: `عملیات ${invoiceLabel}` }));
};

const getHomeSearchPanel = () => screen.getByTestId('reports-home-search-panel');

const getHomeRangeSelect = () =>
  within(getHomeSearchPanel()).getByLabelText('دوره') as HTMLSelectElement;

const getDefaultExpenseCategory = (demo: ReturnType<typeof getGuestDemoData>) =>
  demo.settings.expenseCategories?.[0] ?? 'متفرقه';

describe('ReportsDashboard home mode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-28T12:00:00.000Z'));
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders the executive reports home without advanced controls on the surface', async () => {
    await renderHomeDashboard();

    expect(screen.getAllByText('راپورها و هوش تجاری').length).toBeGreaterThan(0);
    expect(getHomeRangeSelect()).toHaveDisplayValue('ماه جاری');
    expect(screen.queryByRole('button', { name: 'خروجی' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'عملکرد مالی' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'تحلیل کالا و انبار' })).toBeInTheDocument();
    expect(screen.queryByLabelText('بازه زمانی')).not.toBeInTheDocument();
    expect(document.querySelector('.wk-reports-home-hero')).not.toBeInTheDocument();
  });

  it('places the report search before the financial overview and reports header', async () => {
    await renderHomeDashboard();

    const financialPulseHeading = screen.getByText('\u0646\u0628\u0636 \u0645\u0627\u0644\u06cc \u0648 \u0648\u0635\u0648\u0644');
    const pageHeader = screen.getByTestId('reports-home-page-header');
    const searchPanel = screen.getByTestId('reports-home-search-panel');
    const isBefore = (first: Element, second: Element) =>
      Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

    expect(isBefore(searchPanel, financialPulseHeading)).toBe(true);
    expect(isBefore(searchPanel, pageHeader)).toBe(true);
    expect(within(searchPanel).getByLabelText('\u062f\u0648\u0631\u0647')).toHaveDisplayValue('\u0645\u0627\u0647 \u062c\u0627\u0631\u06cc');
  });

  it('keeps only the compact report search bar visible while idle', async () => {
    await renderHomeDashboard();

    const panel = screen.getByTestId('reports-home-search-panel');

    expect(panel.querySelector('[data-density="compact"]')).not.toBeInTheDocument();
    expect(within(panel).queryByText('برای دیدن نتایج، نمبر فاکتور، مشتری، فروشنده، محصول یا مصرف را جستجو کنید.')).not.toBeInTheDocument();
    expect(within(panel).queryByText('نتیجه‌ای مطابق جستجو یافت نشد.')).not.toBeInTheDocument();
    expect(within(panel).queryByText('جستجوی هوشمند')).not.toBeInTheDocument();
    expect(within(panel).queryByText(/^بازه:/)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/^نتیجه‌ها:/)).not.toBeInTheDocument();
    expect(within(panel).getByLabelText('جستجوی راپورها')).toBeVisible();
    expect(within(panel).getByLabelText('دوره')).toBeVisible();
    expect(within(panel).getByLabelText('فیلتر جستجو')).toBeVisible();
    expect(within(panel).getByLabelText('وضعیت پرداخت')).toBeVisible();
    expect(within(panel).getByRole('button', { name: 'پاک‌کردن' })).toBeVisible();
    expect(within(panel).queryByTestId('reports-home-search-result')).not.toBeInTheDocument();
  });

  it('keeps the report search controls low-profile while readable and RTL aligned', async () => {
    await renderHomeDashboard();

    const panel = screen.getByTestId('reports-home-search-panel');
    const searchInput = within(panel).getByLabelText('جستجوی راپورها');
    const periodSelect = within(panel).getByLabelText('دوره');
    const filterSelect = within(panel).getByLabelText('فیلتر جستجو');
    const paymentSelect = within(panel).getByLabelText('وضعیت پرداخت');
    const clearButton = within(panel).getByRole('button', { name: 'پاک‌کردن' });

    expect(panel).toHaveClass('py-0.5');
    expect(panel).not.toHaveClass('py-1');
    expect(panel).not.toHaveClass('py-1.5');
    expect(searchInput).toHaveAttribute('dir', 'rtl');
    [searchInput, periodSelect, filterSelect, paymentSelect].forEach((control) => {
      expect(control).toHaveClass('!h-9');
      expect(control).toHaveClass('pt-[14px]');
      expect(control).toHaveClass('text-[12px]');
    });
    expect(clearButton).toHaveClass('h-9');
  });

  it('uses the compact empty result without hiding the no-match message', async () => {
    await renderHomeDashboard();

    const panel = screen.getByTestId('reports-home-search-panel');
    fireEvent.change(within(panel).getByLabelText('جستجوی راپورها'), {
      target: { value: 'zzzz-no-report-match-999' }
    });

    expect(within(panel).getByText('نتیجه‌ای مطابق جستجو یافت نشد.')).toBeVisible();
    expect(panel.querySelector('[data-density="compact"]')).toHaveClass('py-1.5');
    expect(within(panel).queryByTestId('reports-home-search-result')).not.toBeInTheDocument();
  });

  it('keeps KPI cards aligned with safe compact padding for labels, values, icons, tabs, and actions', async () => {
    await renderHomeDashboard();

    const cards = screen.getAllByTestId('reports-home-kpi-card');

    expect(cards.length).toBeGreaterThan(0);
    cards.forEach((card) => {
      const topRow = within(card).getByTestId('reports-home-kpi-top-row');
      const icon = within(card).getByTestId('reports-home-kpi-icon');
      const tabs = within(card).getByTestId('reports-home-kpi-tabs');
      const body = within(card).getByTestId('reports-home-kpi-body');
      const label = within(card).getByTestId('reports-home-kpi-label');
      const value = within(card).getByTestId('reports-home-kpi-value');
      const action = within(card).getByTestId('reports-home-kpi-action');
      const stripe = card.querySelector('.bg-gradient-to-r.h-px');

      expect(card).toHaveAttribute('dir', 'rtl');
      expect(card).toHaveClass('min-h-[158px]');
      expect(card).toHaveClass('px-3.5');
      expect(card).toHaveClass('py-3');
      expect(card.className).toContain('[overflow:visible]');
      expect(card).not.toHaveClass('focus:ring-2');
      expect(card).toHaveClass('focus-visible:ring-2');
      expect(card).toHaveClass('focus-visible:ring-brand-300/70');
      expect(topRow).toHaveClass('h-8');
      expect(topRow).toHaveClass('items-start');
      expect(icon).toHaveClass('h-8');
      expect(icon).toHaveClass('w-8');
      expect(tabs).toHaveClass('min-h-[30px]');
      expect(tabs).toHaveClass('justify-start');
      expect(tabs).toHaveClass('overflow-hidden');
      expect(tabs.children).toHaveLength(1);
      expect(body).toHaveClass('grid');
      expect(body).toHaveClass('grid-rows-[17px_31px_minmax(16px,auto)]');
      expect(label).toHaveClass('leading-[17px]');
      expect(value).toHaveAttribute('dir', 'ltr');
      expect(value).toHaveClass('font-[850]');
      expect(value).toHaveClass('leading-[1.12]');
      expect(value).toHaveClass('tracking-normal');
      expect(value).toHaveClass('text-right');
      expect(value).toHaveClass('tabular-nums');
      expect(value.className).toContain("[font-feature-settings:'tnum'_1,'lnum'_1]");
      expect(value.className).toContain('[font-variant-numeric:tabular-nums_lining-nums]');
      expect(action).toHaveClass('h-7');
      expect(action).toHaveClass('self-end');
      expect(action).toHaveClass('w-full');
      expect(stripe).toBeInstanceOf(HTMLElement);
      expect(stripe).not.toBeNull();
      const stripeElement = stripe as HTMLElement;
      expect(stripeElement).toHaveClass('h-px');
      expect(stripeElement).toHaveClass('inset-x-4');
      expect(stripeElement).toHaveClass('top-1');
      expect(stripeElement).toHaveClass('opacity-75');
      expect(stripeElement).not.toHaveClass('h-0.5');
      expect(stripeElement.className).toMatch(/300\/(35|38|40|42|45)/);
      expect(stripeElement.className).not.toMatch(/-(400|500|600)\b/);
    });
  });

  it('does not expose a hidden range selector when the current range has no visible report surface', async () => {
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));

    await renderHomeDashboard();

    expect(screen.getByText('هیچ رکوردی با فیلترهای فعلی هم‌خوانی ندارد')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بازنشانی فیلترها' })).toBeInTheDocument();
    expect(screen.queryByTestId('reports-home-search-panel')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('بازه زمانی')).not.toBeInTheDocument();
  });

  it('keeps month-boundary empty states free of legacy hidden controls', async () => {
    vi.setSystemTime(new Date('2026-03-01T12:00:00.000Z'));

    await renderHomeDashboard();

    expect(screen.getByText('هیچ رکوردی با فیلترهای فعلی هم‌خوانی ندارد')).toBeInTheDocument();
    expect(screen.queryByTestId('reports-home-search-panel')).not.toBeInTheDocument();
    expect(document.querySelector('.wk-reports-home-hero')).not.toBeInTheDocument();
  });

  it('keeps the no-data report state visible after removing the legacy fallback range capsule', async () => {
    vi.setSystemTime(new Date('2026-04-05T12:00:00.000Z'));

    await renderHomeDashboard();

    expect(screen.getByText('هیچ رکوردی با فیلترهای فعلی هم‌خوانی ندارد')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بازنشانی فیلترها' })).toBeInTheDocument();
    expect(screen.queryByLabelText('بازه زمانی')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reports-home-search-panel')).not.toBeInTheDocument();
  });

  it('renders the hero finance graph and profit mix donut on the home financial surface', async () => {
    await renderHomeDashboard();
    const profitCard = screen.getByRole('button', { name: 'مفاد خالص' });

    expect(screen.getByText('نبض مالی و وصول')).toBeInTheDocument();
    expect(screen.getByText('ترکیب مفاد و ضرر')).toBeInTheDocument();
    expect(screen.getAllByText('فروش ناخالص').length).toBeGreaterThan(0);
    expect(screen.getByText('بهای تمام‌شده')).toBeInTheDocument();
    expect(profitCard.textContent || '').toMatch(/[\d۰-۹]/);
    expect(profitCard).not.toHaveTextContent('147-');
    expect(screen.getAllByText('مفاد ناخالص').length).toBeGreaterThan(0);
    expect(screen.queryByText(/-210\.0%/)).not.toBeInTheDocument();
  });

  it('keeps the main report chart compact while preserving readable legends and chart frames', async () => {
    await renderHomeDashboard();

    const chartGrid = screen.getByTestId('reports-home-chart-grid');
    const [financialPanel, profitMixPanel] = Array.from(chartGrid.children) as HTMLElement[];
    const financialHeader = within(financialPanel).getByTestId('reports-home-panel-header');
    const financialBody = within(financialPanel).getByTestId('reports-home-panel-body');
    const profitMixHeader = within(profitMixPanel).getByTestId('reports-home-panel-header');
    const profitMixBody = within(profitMixPanel).getByTestId('reports-home-panel-body');
    const financialChartSlot = financialBody.querySelector('[dir="ltr"]') as HTMLElement;
    const financialChartLayout = financialChartSlot.firstElementChild as HTMLElement;
    const [financialLegend, financialChartFrame] = Array.from(financialChartLayout.children) as HTMLElement[];
    const profitMixChartSlot = profitMixBody.querySelector('[dir="ltr"]') as HTMLElement;
    const profitMixLayout = profitMixChartSlot.firstElementChild as HTMLElement;
    const [profitMixDonut, profitMixLabels] = Array.from(profitMixLayout.children) as HTMLElement[];
    const profitMixLabelCards = Array.from(profitMixLabels.children) as HTMLElement[];
    const firstProfitMixValueBadge = profitMixLabelCards[0].querySelector('span') as HTMLElement;

    expect(chartGrid).toHaveClass('gap-3');
    expect(financialHeader).toHaveClass('py-3');
    expect(financialHeader).toHaveClass('gap-y-1.5');
    expect(profitMixHeader).toHaveClass('py-3.5');
    expect(profitMixHeader).toHaveClass('gap-y-2');
    expect(financialBody).toHaveClass('pt-2.5');
    expect(financialBody).toHaveClass('pb-3.5');
    expect(profitMixBody).toHaveClass('pt-3');
    expect(profitMixBody).toHaveClass('pb-4');
    expect(financialChartSlot).toHaveClass('h-[304px]');
    expect(financialChartLayout).toHaveClass('min-h-0');
    expect(financialLegend).toHaveClass('mb-2');
    expect(financialLegend).toHaveClass('gap-y-1.5');
    expect(financialChartFrame).toHaveClass('flex-1');
    expect(financialChartFrame).toHaveClass('p-3');
    expect(financialChartFrame).toHaveClass('sm:p-3.5');
    expect(financialChartFrame.className).toMatch(/min-h-\[(232|238)px\]/);
    expect(profitMixChartSlot).toHaveClass('h-[304px]');
    expect(profitMixChartSlot).toHaveClass('max-[559px]:h-[308px]');
    expect(profitMixLayout).toHaveClass('gap-4');
    expect(profitMixLayout).toHaveClass('overflow-visible');
    expect(profitMixLayout).toHaveClass('py-1');
    expect(profitMixDonut).toHaveClass('min-[560px]:h-[204px]');
    expect(profitMixDonut).toHaveClass('xl:h-[184px]');
    expect(profitMixLabels).toHaveClass('space-y-3');
    expect(profitMixLabelCards[0]).toHaveClass('min-h-[48px]');
    expect(profitMixLabelCards[1]).toHaveClass('min-h-[48px]');
    expect(firstProfitMixValueBadge).toHaveClass('min-w-[42px]');
  });

  it('opens a dedicated glass overlay for each financial card', async () => {
    await renderHomeDashboard();

    fireEvent.click(screen.getByRole('button', { name: 'مجموع فروش' }));
    expect(screen.getByRole('heading', { name: 'دفتر فروش' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'بستن' }));

    fireEvent.click(screen.getByRole('button', { name: 'مفاد خالص' }));
    expect(screen.getByRole('heading', { name: 'استودیوی مفاد' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'بستن' }));

    fireEvent.click(screen.getByRole('button', { name: 'مصارف جاری' }));
    expect(screen.getByRole('heading', { name: 'مدیریت مصارف' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'بستن' }));

    fireEvent.click(screen.getByRole('button', { name: 'تعداد فاکتورها' }));
    const invoiceManagerHeading = screen.getByRole('heading', { name: 'مدیریت فاکتورها' });
    expect(invoiceManagerHeading).toBeInTheDocument();
    const invoiceManagerOverlay = invoiceManagerHeading.closest('.wk-invoice-manager-modal-overlay');
    expect(invoiceManagerOverlay).not.toBeNull();
    expect(invoiceManagerOverlay).toHaveClass('bg-slate-950/72');
    expect(invoiceManagerHeading.closest('.wk-invoice-manager-modal-panel')).toHaveClass('bg-slate-50');
  });

  it('shows only invoices from the selected home range in the invoice manager', async () => {
    await renderHomeDashboard();

    fireEvent.change(getHomeRangeSelect(), { target: { value: 'today' } });
    await settleReports();

    fireEvent.click(screen.getByRole('button', { name: 'تعداد فاکتورها' }));

    expect(screen.getByRole('heading', { name: 'مدیریت فاکتورها' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'عملیات #1305' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'عملیات #1304' })).not.toBeInTheDocument();
  });

  it('searches the home report by invoice number and opens the matched invoice', async () => {
    const { demo } = await renderHomeDashboard();
    const panel = screen.getByTestId('reports-home-search-panel');
    const searchInput = within(panel).getByLabelText('\u062c\u0633\u062a\u062c\u0648\u06cc \u0631\u0627\u067e\u0648\u0631\u0647\u0627');

    fireEvent.change(searchInput, { target: { value: '1305' } });

    const results = within(panel).getAllByTestId('reports-home-search-result');
    expect(results[0]).toHaveTextContent('#1305');
    expect(results[0]).toHaveTextContent('Shifa Pharmacy');
    expect(results[0]).not.toHaveTextContent('Cough Syrup 120ml');

    fireEvent.click(within(results[0]).getByRole('button', { name: '\u062f\u06cc\u062f\u0646 \u0641\u0627\u06a9\u062a\u0648\u0631' }));

    expect(screen.getByRole('heading', { name: '\u0645\u062f\u06cc\u0631\u06cc\u062a \u0641\u0627\u06a9\u062a\u0648\u0631\u0647\u0627' })).toBeInTheDocument();
    expect(screen.getByTestId(`invoice-row-${demo.invoices[1].id}`)).toHaveClass('bg-brand-50/80');
  });

  it('summarizes customer search results with invoice count and totals', async () => {
    await renderHomeDashboard();
    const panel = screen.getByTestId('reports-home-search-panel');

    fireEvent.change(within(panel).getByLabelText('\u062c\u0633\u062a\u062c\u0648\u06cc \u0631\u0627\u067e\u0648\u0631\u0647\u0627'), {
      target: { value: 'Shifa Pharmacy' }
    });

    const customerResult = within(panel)
      .getAllByTestId('reports-home-search-result')
      .find((result) => result.textContent?.includes('\u062e\u0644\u0627\u0635\u0647 \u0645\u0634\u062a\u0631\u06cc'));

    expect(customerResult).toBeDefined();
    expect(customerResult).toHaveTextContent('Shifa Pharmacy');
    expect(customerResult).toHaveTextContent('\u062a\u0639\u062f\u0627\u062f \u0641\u0627\u06a9\u062a\u0648\u0631');
    expect(customerResult).toHaveTextContent('۲۵۵');
  });

  it('applies suggested home report searches as active filters', async () => {
    await renderHomeDashboard();
    const panel = screen.getByTestId('reports-home-search-panel');
    const searchInput = within(panel).getByLabelText('\u062c\u0633\u062a\u062c\u0648\u06cc \u0631\u0627\u067e\u0648\u0631\u0647\u0627') as HTMLInputElement;
    const searchFilter = within(panel).getByLabelText('\u0641\u06cc\u0644\u062a\u0631 \u062c\u0633\u062a\u062c\u0648') as HTMLSelectElement;

    fireEvent.click(within(panel).getByRole('button', { name: /#1305/ }));

    expect(searchInput).toHaveValue('#1305');
    expect(searchFilter.value).toBe('invoice');
    expect(within(panel).getAllByTestId('reports-home-search-result')[0]).toHaveTextContent('#1305');
  });

  it('paginates the invoice manager so large invoice ranges do not render every row at once', async () => {
    const demo = getGuestDemoData('dari');
    const manyInvoices = Array.from({ length: 140 }, (_, index) => ({
      ...demo.invoices[index % demo.invoices.length],
      id: `bulk-invoice-${index + 1}`,
      invoiceNumber: 5000 + index,
      date: '2026-02-28T08:00:00.000Z'
    }));

    await renderHomeDashboard({ invoices: manyInvoices });

    fireEvent.click(screen.getByRole('button', { name: '\u062a\u0639\u062f\u0627\u062f \u0641\u0627\u06a9\u062a\u0648\u0631\u0647\u0627' }));

    const scrollRegion = screen.getByTestId('invoice-invoice-manager-scroll');
    const tableShell = scrollRegion.parentElement as HTMLElement;
    expect(within(tableShell).getByText(/۱-۴۰.*۱۴۰/)).toBeInTheDocument();
    expect(within(scrollRegion).getAllByRole('row')).toHaveLength(41);

    const pagerActions = within(tableShell).getByTestId('invoice-invoice-manager-pager-actions');
    expect(scrollRegion.contains(pagerActions)).toBe(false);
    expect(pagerActions).toHaveAttribute('dir', 'ltr');
    const firstPageButtons = within(pagerActions).getAllByRole('button');
    expect(firstPageButtons.map((button) => button.textContent)).toEqual(['\u0642\u0628\u0644\u06cc', '\u0628\u0639\u062f\u06cc']);
    expect(firstPageButtons[0]).toBeDisabled();
    expect(firstPageButtons[1]).toBeEnabled();

    fireEvent.click(firstPageButtons[1]);

    expect(within(tableShell).getByText(/۴۱-۸۰.*۱۴۰/)).toBeInTheDocument();
    expect(within(scrollRegion).getAllByRole('row')).toHaveLength(41);
    const secondPageButtons = within(within(tableShell).getByTestId('invoice-invoice-manager-pager-actions')).getAllByRole('button');
    expect(secondPageButtons[0]).toBeEnabled();
    expect(secondPageButtons[1]).toBeEnabled();
  }, 15_000);

  it('keeps the invoice manager mounted while the report recalculates after invoice data changes', async () => {
    const demo = getGuestDemoData('dari');
    const manyInvoices = Array.from({ length: 105 }, (_, index) => ({
      ...demo.invoices[index % demo.invoices.length],
      id: `refresh-invoice-${index + 1}`,
      invoiceNumber: 7000 + index,
      date: '2026-02-28T08:00:00.000Z',
      isDeleted: false
    }));

    const { rerenderHomeDashboard } = await renderHomeDashboard({ invoices: manyInvoices });

    fireEvent.click(screen.getByRole('button', { name: '\u062a\u0639\u062f\u0627\u062f \u0641\u0627\u06a9\u062a\u0648\u0631\u0647\u0627' }));
    expect(screen.getByRole('heading', { name: '\u0645\u062f\u06cc\u0631\u06cc\u062a \u0641\u0627\u06a9\u062a\u0648\u0631\u0647\u0627' })).toBeInTheDocument();

    rerenderHomeDashboard({
      invoices: manyInvoices.map((invoice, index) => (
        index === 0 ? { ...invoice, isDeleted: true } : invoice
      ))
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(screen.getByRole('heading', { name: '\u0645\u062f\u06cc\u0631\u06cc\u062a \u0641\u0627\u06a9\u062a\u0648\u0631\u0647\u0627' })).toBeInTheDocument();
    const scrollRegion = screen.getByTestId('invoice-invoice-manager-scroll');
    const tableShell = scrollRegion.parentElement as HTMLElement;
    expect(within(tableShell).getByText(/۱-۴۰.*۱۰۴/)).toBeInTheDocument();
  }, 15_000);

  it('supports single and bulk delete actions for invoices through the provided handler', async () => {
    const { demo, onDeleteInvoices } = await renderHomeDashboard();

    fireEvent.click(screen.getByRole('button', { name: 'تعداد فاکتورها' }));

    expect(screen.queryByRole('button', { name: 'حذف فاکتورهای انتخاب‌شده' })).not.toBeInTheDocument();

    openInvoiceActions('#1305');
    fireEvent.click(screen.getByRole('menuitem', { name: 'حذف #1305' }));
    fireEvent.click(screen.getByRole('button', { name: 'بله، حذف شود' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onDeleteInvoices).toHaveBeenCalledWith([demo.invoices[1].id]);

    fireEvent.click(screen.getByLabelText('انتخاب همه فاکتورها'));
    const bulkDeleteButton = screen.getByRole('button', { name: 'حذف فاکتورهای انتخاب‌شده' });
    expect(bulkDeleteButton).toBeEnabled();
    expect(bulkDeleteButton).toHaveClass('bg-rose-600');
    fireEvent.click(bulkDeleteButton);
    fireEvent.click(screen.getByRole('button', { name: 'بله، حذف شود' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onDeleteInvoices).toHaveBeenCalledWith(expect.arrayContaining([demo.invoices[0].id, demo.invoices[1].id]));
  });

  it('renders invoice delete confirmation above the invoice manager overlay', async () => {
    await renderHomeDashboard();

    fireEvent.click(screen.getByRole('button', { name: '\u062a\u0639\u062f\u0627\u062f \u0641\u0627\u06a9\u062a\u0648\u0631\u0647\u0627' }));

    openInvoiceActions('#1305');
    fireEvent.click(screen.getByRole('menuitem', { name: '\u062d\u0630\u0641 #1305' }));

    expect(screen.getByRole('dialog', { name: '\u062a\u0623\u06cc\u06cc\u062f \u062d\u0630\u0641 \u0641\u0627\u06a9\u062a\u0648\u0631\u0647\u0627' }).parentElement).toHaveClass('z-[260]');
  });

  it('supports transferring an invoice seller from the invoice manager', async () => {
    const demo = getGuestDemoData('dari');
    const onTransferInvoiceSeller = vi.fn();

    await renderHomeDashboard({
      settings: {
        ...demo.settings,
        users: [
          ...(demo.settings.users || []),
          {
            id: 'staff-commission',
            name: 'خلیل',
            pinCode: '2222',
            role: 'staff',
            permissions: ['create_invoice'],
            baseSalary: 6000,
            commissionRate: 12,
            commissionTiers: [{ threshold: 1000, rate: 15 }]
          }
        ]
      },
      onTransferInvoiceSeller,
      canTransferInvoiceSeller: true
    });

    fireEvent.click(screen.getByRole('button', { name: 'تعداد فاکتورها' }));

    const invoiceScrollRegion = screen.getByTestId('invoice-invoice-manager-scroll');
    let modalBody = invoiceScrollRegion.parentElement;
    while (modalBody && !modalBody.className.includes('wk-invoice-manager-modal-body')) {
      modalBody = modalBody.parentElement;
    }
    const tableShell = invoiceScrollRegion.closest('.wk-invoice-manager-table-shell');

    expect(invoiceScrollRegion.className).toContain('overflow-auto');
    expect(invoiceScrollRegion.className).toContain('wk-invoice-manager-table-scroll');
    expect(invoiceScrollRegion.className).toContain('flex-1');
    expect(tableShell).not.toBeNull();
    expect(tableShell).toHaveClass('flex');
    expect(modalBody?.className).toContain('min-h-0');
    expect(modalBody?.className).toContain('overflow-hidden');
    expect(screen.queryByLabelText('تغییر فروشنده #1305')).not.toBeInTheDocument();

    openInvoiceActions('#1305');
    fireEvent.click(screen.getByRole('menuitem', { name: 'انتقال فروشنده #1305' }));

    await act(async () => {
      fireEvent.change(screen.getByLabelText('تغییر فروشنده #1305'), {
        target: { value: 'staff-commission' }
      });
    });

    expect(onTransferInvoiceSeller).toHaveBeenCalledWith(demo.invoices[1].id, 'staff-commission');
  });

  it('keeps the invoice manager read-only when delete permission is not available', async () => {
    await renderHomeDashboard({ canDeleteInvoices: false });

    fireEvent.click(screen.getByRole('button', { name: 'تعداد فاکتورها' }));

    expect(screen.getByRole('heading', { name: 'مدیریت فاکتورها' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حذف فاکتورهای انتخاب‌شده' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حذف #1305' })).not.toBeInTheDocument();
    openInvoiceActions('#1305');
    expect(screen.queryByRole('menuitem', { name: 'حذف #1305' })).not.toBeInTheDocument();
  });

  it('shows full view and edit actions in the invoice manager when edit access is available', async () => {
    const onUpdateInvoice = vi.fn().mockResolvedValue(undefined);
    const { demo } = await renderHomeDashboard({
      onUpdateInvoice,
      canEditInvoices: true
    });

    fireEvent.click(screen.getByRole('button', { name: '\u062a\u0639\u062f\u0627\u062f \u0641\u0627\u06a9\u062a\u0648\u0631\u0647\u0627' }));

    openInvoiceActions('#1305');
    const actionMenu = screen.getByRole('menu');
    expect(actionMenu).toHaveStyle({ visibility: 'visible' });
    expect(actionMenu).toHaveClass('absolute');
    expect(actionMenu).toHaveClass('bg-white');
    expect(actionMenu).toHaveClass('z-[220]');
    expect(actionMenu).toHaveClass('shadow-[0_28px_64px_-22px_rgba(15,23,42,0.55)]');
    const activeRow = screen.getByTestId(`invoice-row-${demo.invoices[1].id}`);
    expect(activeRow).toHaveClass('bg-brand-50/80');
    expect(within(activeRow).getByRole('button', { name: 'جزئیات' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '\u062f\u06cc\u062f\u0646 #1305' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '\u0648\u06cc\u0631\u0627\u06cc\u0634 #1305' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: '\u062f\u06cc\u062f\u0646 #1305' }));
    expect(screen.getByRole('heading', { name: '\u067e\u06cc\u0634\u200c\u0646\u0645\u0627\u06cc\u0634 \u0648 \u0686\u0627\u067e \u0641\u0627\u06a9\u062a\u0648\u0631' })).toBeInTheDocument();
  });

  it('closes the invoice action menu when the table scrolls', async () => {
    await renderHomeDashboard({
      canEditInvoices: true
    });

    fireEvent.click(screen.getByRole('button', { name: '\u062a\u0639\u062f\u0627\u062f \u0641\u0627\u06a9\u062a\u0648\u0631\u0647\u0627' }));

    openInvoiceActions('#1305');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.scroll(screen.getByTestId('invoice-invoice-manager-scroll'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps invoice editing hidden when edit access is missing but still allows full view', async () => {
    const onUpdateInvoice = vi.fn().mockResolvedValue(undefined);
    await renderHomeDashboard({
      onUpdateInvoice,
      canEditInvoices: false
    });

    fireEvent.click(screen.getByRole('button', { name: '\u062a\u0639\u062f\u0627\u062f \u0641\u0627\u06a9\u062a\u0648\u0631\u0647\u0627' }));

    openInvoiceActions('#1305');
    expect(screen.getByRole('menuitem', { name: '\u062f\u06cc\u062f\u0646 #1305' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: '\u0648\u06cc\u0631\u0627\u06cc\u0634 #1305' })).not.toBeInTheDocument();
  });

  it('renders invoice editing above the invoice manager overlay', async () => {
    const onUpdateInvoice = vi.fn().mockResolvedValue(undefined);
    await renderHomeDashboard({
      onUpdateInvoice,
      canEditInvoices: true
    });

    fireEvent.click(screen.getByRole('button', { name: '\u062a\u0639\u062f\u0627\u062f \u0641\u0627\u06a9\u062a\u0648\u0631\u0647\u0627' }));
    openInvoiceActions('#1305');
    fireEvent.click(screen.getByRole('menuitem', { name: '\u0648\u06cc\u0631\u0627\u06cc\u0634 #1305' }));

    expect(screen.getByRole('dialog', { name: '\u0648\u06cc\u0631\u0627\u06cc\u0634 \u0641\u0627\u06a9\u062a\u0648\u0631' }).parentElement).toHaveClass('z-[260]');
  });

  it('submits the selected customer edit mode from the invoice edit modal', async () => {
    const onUpdateInvoice = vi.fn().mockResolvedValue(undefined);
    const { demo } = await renderHomeDashboard({
      onUpdateInvoice,
      canEditInvoices: true
    });

    fireEvent.click(screen.getByRole('button', { name: '\u062a\u0639\u062f\u0627\u062f \u0641\u0627\u06a9\u062a\u0648\u0631\u0647\u0627' }));
    openInvoiceActions('#1305');
    fireEvent.click(screen.getByRole('menuitem', { name: '\u0648\u06cc\u0631\u0627\u06cc\u0634 #1305' }));
    fireEvent.change(screen.getByLabelText('\u0646\u0648\u0639 \u062a\u063a\u06cc\u06cc\u0631 \u0645\u0634\u062a\u0631\u06cc'), {
      target: { value: 'rename_global' }
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '\u0630\u062e\u06cc\u0631\u0647 \u062a\u063a\u06cc\u06cc\u0631\u0627\u062a' }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(onUpdateInvoice).toHaveBeenCalledWith(
      demo.invoices[1].id,
      expect.objectContaining({
        customerEditMode: 'rename_global'
      })
    );
  });

  it('submits transfer ownership with the selected target customer from the invoice edit modal', async () => {
    const onUpdateInvoice = vi.fn().mockResolvedValue(undefined);
    const { demo } = await renderHomeDashboard({
      onUpdateInvoice,
      canEditInvoices: true
    });
    const targetCustomer = demo.customers.find((customer) => customer.id !== demo.invoices[1].customerId);

    expect(targetCustomer).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: '\u062a\u0639\u062f\u0627\u062f \u0641\u0627\u06a9\u062a\u0648\u0631\u0647\u0627' }));
    openInvoiceActions('#1305');
    fireEvent.click(screen.getByRole('menuitem', { name: '\u0648\u06cc\u0631\u0627\u06cc\u0634 #1305' }));
    fireEvent.change(screen.getByLabelText('\u0646\u0648\u0639 \u062a\u063a\u06cc\u06cc\u0631 \u0645\u0634\u062a\u0631\u06cc'), {
      target: { value: 'transfer_ownership' }
    });
    fireEvent.change(screen.getByLabelText('\u0645\u0634\u062a\u0631\u06cc \u0645\u0642\u0635\u062f'), {
      target: { value: targetCustomer!.id }
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '\u0630\u062e\u06cc\u0631\u0647 \u062a\u063a\u06cc\u06cc\u0631\u0627\u062a' }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(onUpdateInvoice).toHaveBeenCalledWith(
      demo.invoices[1].id,
      expect.objectContaining({
        customerEditMode: 'transfer_ownership',
        targetCustomerId: targetCustomer!.id
      })
    );
  });

  it('supports expense add, edit, and delete flows through the provided handlers', async () => {
    const { demo, onAddExpense, onUpdateExpense, onDeleteExpense } = await renderHomeDashboard();
    const defaultExpenseCategory = getDefaultExpenseCategory(demo);

    fireEvent.click(screen.getByRole('button', { name: 'مصارف جاری' }));
    expect(screen.getByRole('heading', { name: 'مدیریت مصارف' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'افزودن مصرف' }));
    fireEvent.change(screen.getByLabelText('عنوان'), { target: { value: 'هزینه آزمایشی' } });
    fireEvent.change(screen.getByLabelText('مبلغ'), { target: { value: '1550' } });
    fireEvent.change(screen.getByLabelText('توضیحات'), { target: { value: 'ثبت از تست' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت مصرف' }));

    expect(onAddExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'هزینه آزمایشی',
        amount: 1550,
        category: defaultExpenseCategory,
        description: 'ثبت از تست'
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'ویرایش Monthly Rent' }));
    fireEvent.change(screen.getByLabelText('مبلغ'), { target: { value: '14000' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }));

    expect(onUpdateExpense).toHaveBeenCalledWith(
      demo.expenses[0].id,
      expect.objectContaining({
        title: demo.expenses[0].title,
        amount: 14000
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'حذف Electricity' }));
    fireEvent.click(screen.getByRole('button', { name: 'بله، حذف شود' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onDeleteExpense).toHaveBeenCalledWith(demo.expenses[1].id);
  });

  it('keeps the expense manager read-only when expense permissions are not available', async () => {
    await renderHomeDashboard({ canManageExpenses: false });

    fireEvent.click(screen.getByRole('button', { name: 'مصارف جاری' }));

    expect(screen.getByRole('heading', { name: 'مدیریت مصارف' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'افزودن مصرف' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ویرایش Monthly Rent' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حذف Electricity' })).not.toBeInTheDocument();
  });

  it('shows a locked profit studio when the user lacks view_profit access', async () => {
    await renderHomeDashboard({ activeAppUser: createRestrictedUser([]) });

    fireEvent.click(screen.getByRole('button', { name: 'مفاد خالص' }));

    expect(screen.getByRole('heading', { name: 'استودیوی مفاد' })).toBeInTheDocument();
    expect(screen.getByText('داده‌های مفاد قفل است')).toBeInTheDocument();
    expect(screen.queryByText('فاکتورهای موثر بر مفاد')).not.toBeInTheDocument();
  });

  it('switches the profit mix donut to loss mode when expenses outweigh profit', async () => {
    const demo = getGuestDemoData('dari');
    const defaultExpenseCategory = getDefaultExpenseCategory(demo);
    await renderHomeDashboard({
      expenses: [
        ...demo.expenses,
        {
          id: 'demo-exp-loss',
          title: 'Heavy Loss',
          amount: 40000,
          category: defaultExpenseCategory,
          date: '2026-02-20',
          description: 'Stress test',
          userId: 'admin'
        }
      ]
    });

    expect(screen.getByText('ترکیب مفاد و ضرر')).toBeInTheDocument();
    expect(screen.getAllByText('ضرر').length).toBeGreaterThan(0);
    expect(screen.queryByText('ضرر خالص')).not.toBeInTheDocument();
    expect(screen.getAllByText('مفاد ناخالص').length).toBeGreaterThan(0);
  });

  it('switches to customer and employee tables with the redesigned executive layout', async () => {
    await renderHomeDashboard();

    fireEvent.click(screen.getByRole('tab', { name: 'مشتریان' }));
    expect(screen.getByText('بدهکارترین مشتریان')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'کارمندان' }));
    expect(screen.getByText('عملکرد فروش کاربران')).toBeInTheDocument();
  });
});
