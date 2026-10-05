import { describe, expect, it } from 'vitest';
import { getGuestDemoData } from '@/fixtures/guestDemoData';
import { buildReportCsv, buildReportFileName, buildReportHtml, buildShareText, sanitizeReportBundleForAccess } from '@/reports/export';
import { buildReportBundle, formatReportMoney } from '@/reports/reporting';

const buildDefaultFilters = (overrides: Partial<Parameters<typeof buildReportBundle>[0]['filters']> = {}) => ({
  preset: 'thisMonth' as const,
  compareWithPrevious: true,
  query: '',
  userId: 'all',
  customerId: 'all',
  productType: 'all',
  manufacturer: 'all',
  supplierId: 'all',
  paymentStatus: 'all',
  salesMode: 'all',
  warehouse: 'all',
  branch: 'all',
  ...overrides
});

const buildDemoBundle = () => {
  const demo = getGuestDemoData('english');
  return buildReportBundle({
    ...demo,
    language: 'english',
    now: new Date('2026-02-28T12:00:00.000Z'),
    filters: buildDefaultFilters()
  });
};

describe('reporting engine', () => {
  it('computes central BI metrics from the demo snapshot', () => {
    const bundle = buildDemoBundle();
    const financial = bundle.sections.financial;

    expect(bundle.state).toBe('ready');
    expect(financial.kpis.find((metric) => metric.key === 'grossSales')?.value).toBe(695);
    expect(financial.kpis.find((metric) => metric.key === 'netSales')?.value).toBe(695);
    expect(financial.kpis.find((metric) => metric.key === 'cogs')?.value).toBe(500);
    expect(financial.kpis.find((metric) => metric.key === 'grossProfit')?.value).toBe(195);
    expect(financial.kpis.find((metric) => metric.key === 'operatingExpenses')?.value).toBe(14700);
    expect(financial.kpis.find((metric) => metric.key === 'netProfit')?.value).toBe(-14505);

    const inventory = bundle.sections.inventory;
    expect(inventory.kpis.find((metric) => metric.key === 'inventoryValue')?.value).toBe(8736);
    expect(bundle.sections.customers.kpis.find((metric) => metric.key === 'activeCustomers')?.value).toBe(2);
    expect(bundle.overview.primaryMetrics).toHaveLength(4);
    expect(bundle.overview.primaryMetrics.find((metric) => metric.key === 'netSales')?.value).toBe(
      financial.kpis.find((metric) => metric.key === 'netSales')?.value
    );
    expect(bundle.overview.primaryMetrics.find((metric) => metric.key === 'collected')?.value).toBe(
      financial.kpis.find((metric) => metric.key === 'collected')?.value
    );
  });

  it('distinguishes filtered-out state from empty source state', () => {
    const demo = getGuestDemoData('english');
    const bundle = buildReportBundle({
      ...demo,
      language: 'english',
      now: new Date('2026-02-28T12:00:00.000Z'),
      filters: buildDefaultFilters({ query: 'no-match-anywhere' })
    });

    expect(bundle.state).toBe('filteredOut');
    expect(bundle.stateTitle).toContain('No rows match');
  });

  it('treats expense-only and purchase-only datasets as reportable activity', () => {
    const demo = getGuestDemoData('english');
    const now = new Date('2026-02-28T12:00:00.000Z');

    const expenseOnlyBundle = buildReportBundle({
      ...demo,
      invoices: [],
      purchases: [],
      language: 'english',
      now,
      filters: buildDefaultFilters()
    });
    const purchaseOnlyBundle = buildReportBundle({
      ...demo,
      invoices: [],
      expenses: [],
      language: 'english',
      now,
      filters: buildDefaultFilters()
    });

    expect(expenseOnlyBundle.state).toBe('ready');
    expect(purchaseOnlyBundle.state).toBe('ready');
  });

  it('keeps gross profit positive while the final outcome turns negative when expenses outrun sales profit', () => {
    const bundle = buildDemoBundle();
    const financial = bundle.sections.financial;
    const grossProfit = financial.kpis.find((metric) => metric.key === 'grossProfit')?.value || 0;
    const finalOutcome = financial.kpis.find((metric) => metric.key === 'netProfit')?.value || 0;

    expect(grossProfit).toBeGreaterThan(0);
    expect(finalOutcome).toBeLessThan(0);
  });

  it('keeps purchase-only query misses in filtered-out state instead of empty state', () => {
    const demo = getGuestDemoData('english');
    const bundle = buildReportBundle({
      ...demo,
      invoices: [],
      expenses: [],
      language: 'english',
      now: new Date('2026-02-28T12:00:00.000Z'),
      filters: buildDefaultFilters({ query: 'no-match-anywhere' })
    });

    expect(bundle.state).toBe('filteredOut');
    expect(bundle.stateTitle).toContain('No rows match');
  });

  it('uses the same bundle values for HTML and CSV exports', () => {
    const bundle = buildDemoBundle();
    const html = buildReportHtml({
      primary: bundle,
      mode: 'summary',
      scope: 'fullBook',
      managerNote: 'Executive check',
      confidentiality: 'Internal'
    });
    const detailedHtml = buildReportHtml({
      primary: bundle,
      mode: 'full',
      scope: 'fullBook'
    });
    const csv = buildReportCsv(bundle, 'financial');
    const netSales = bundle.overview.primaryMetrics.find((metric) => metric.key === 'netSales')?.formattedValue || '';

    expect(html).toContain('Reports &amp; Business Intelligence');
    expect(html).toContain(netSales);
    expect(html).toContain('Executive check');
    expect(html).toContain('Items that need attention');
    expect(html).not.toContain('Gross Sales');
    expect(detailedHtml).toContain('Net Profit');
    expect(csv).toContain('Invoice');
    expect(csv).toContain('Profit');
    expect(csv).toContain('1305');
    expect(buildReportFileName(bundle, 'pdf', 'financial')).toMatch(/financial/);
  });

  it('builds a deterministic overview with three top insights and a short attention table', () => {
    const bundle = buildDemoBundle();

    expect(bundle.overview.topInsights).toHaveLength(3);
    expect(bundle.overview.topInsights[0]?.priority).toBeLessThan(bundle.overview.topInsights[1]?.priority || 99);
    expect(bundle.overview.attentionTable.rows.length).toBeLessThanOrEqual(8);
    expect(bundle.overview.attentionTable.emptyDescription).toContain('No urgent');
  });

  it('sanitizes restricted exports so hidden tabs and profit data do not leak', () => {
    const bundle = buildDemoBundle();
    const restricted = sanitizeReportBundleForAccess(bundle, {
      allowedTabs: ['financial', 'inventory'],
      canViewProfit: false
    });
    const html = buildReportHtml({
      primary: restricted,
      mode: 'summary',
      scope: 'fullBook',
      tabs: ['financial', 'inventory']
    });
    const shareText = buildShareText(restricted);

    expect(restricted.summaryCards.some((card) => card.key === 'netProfit')).toBe(false);
    expect(restricted.sections.financial.kpis.some((metric) => metric.key === 'netProfit')).toBe(false);
    expect(restricted.sections.financial.tables[0]?.columns.some((column) => column.key === 'profit')).toBe(false);
    expect(restricted.overview.topInsights.every((insight) => !insight.tab || ['financial', 'inventory'].includes(insight.tab))).toBe(true);
    expect(restricted.overview.attentionTable.rows.every((row) => String(row.area).includes('Sales') || String(row.area).includes('Inventory'))).toBe(true);
    expect(html).not.toContain('Customers');
    expect(html).not.toContain('Employees');
    expect(html).not.toContain('Net Profit');
    expect(shareText).not.toContain('Net Profit');
  });
});
