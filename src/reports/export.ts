import type { Language } from '@/types';
import { buildReportBundle, formatReportDate, formatReportDateTime, formatReportMoney, formatReportPercent, getReportLabel, type ReportBundle, type ReportSection, type ReportTable, type ReportTab } from '@/reports/reporting';
export type ReportExportMode = 'summary' | 'detailed' | 'full';
export type ReportExportLanguage = Language | 'bilingual';
export interface BuildReportDocumentArgs {
    primary: ReportBundle;
    secondary?: ReportBundle | null;
    mode: ReportExportMode;
    scope: 'currentTab' | 'fullBook';
    tab?: ReportTab;
    tabs?: ReportTab[];
    managerNote?: string;
    confidentiality?: string;
}
export interface ReportExportAccess {
    allowedTabs?: ReportTab[];
    canViewProfit?: boolean;
}
const ALL_REPORT_TABS: ReportTab[] = ['financial', 'inventory', 'customers', 'employees'];
const PROFIT_METRIC_KEYS = new Set([
    'cogs',
    'grossProfit',
    'operatingProfit',
    'netProfit',
    'profitMargin',
    'lowMargin',
    'highMargin',
    'totalEmployeeProfit'
]);
const PROFIT_SUMMARY_KEYS = new Set(['netProfit']);
const PROFIT_FORMULA_KEYS = new Set(['cogs', 'grossProfit', 'operatingProfit', 'netProfit', 'profitMargin']);
const PROFIT_CHART_IDS = new Set(['financial-profit-breakdown', 'customers-top-profit', 'employees-profit']);
const PROFIT_INSIGHT_IDS = new Set(['margin-erosion']);
const PROFIT_TABLE_COLUMN_KEYS = new Set(['profit', 'margin']);
const SUMMARY_CARD_TABS: Partial<Record<string, ReportTab>> = {
    inventoryValue: 'inventory',
    inventoryAlerts: 'inventory',
    reorderNeeded: 'inventory',
    activeCustomers: 'customers'
};
const FORMULA_TABS: Partial<Record<string, ReportTab>> = {
    turnover: 'inventory',
    inventoryAlerts: 'inventory',
    reorderNeeded: 'inventory',
    customerAging: 'customers',
    employeePerformance: 'employees'
};
const resolveTabForTableId = (tableId?: string): ReportTab | null => {
    if (!tableId)
        return null;
    if (tableId.startsWith('financial'))
        return 'financial';
    if (tableId.startsWith('inventory'))
        return 'inventory';
    if (tableId.startsWith('customers'))
        return 'customers';
    if (tableId.startsWith('employees'))
        return 'employees';
    return null;
};
const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const toneColor = (tone: string) => {
    if (tone === 'positive')
        return '#0f9d58';
    if (tone === 'negative')
        return '#d93025';
    if (tone === 'warning')
        return '#b7791f';
    return '#1d4ed8';
};
const getTableRowLimit = (mode: ReportExportMode) => {
    if (mode === 'summary')
        return 8;
    if (mode === 'detailed')
        return 20;
    return Number.POSITIVE_INFINITY;
};
const sanitizeTableForAccess = (table: ReportTable, canViewProfit: boolean): ReportTable => {
    const columns = canViewProfit
        ? table.columns
        : table.columns.filter((column) => !PROFIT_TABLE_COLUMN_KEYS.has(column.key));
    const rows = table.rows.map((row) => columns.reduce<ReportTable['rows'][number]>((acc, column) => {
        acc[column.key] = row[column.key];
        return acc;
    }, { id: row.id }));
    return {
        ...table,
        columns,
        rows
    };
};
export const sanitizeReportBundleForAccess = (bundle: ReportBundle, access: ReportExportAccess = {}): ReportBundle => {
    const canViewProfit = access.canViewProfit !== false;
    const allowedTabs = new Set(access.allowedTabs?.length ? access.allowedTabs : ALL_REPORT_TABS);
    const sections = ALL_REPORT_TABS.reduce<Record<ReportTab, ReportBundle['sections'][ReportTab]>>((acc, tab) => {
        const section = bundle.sections[tab];
        if (!allowedTabs.has(tab)) {
            acc[tab] = {
                ...section,
                navigationLabel: section.navigationLabel,
                kpis: [],
                charts: [],
                tables: [],
                primaryTableId: '',
                heroMetricKeys: section.heroMetricKeys,
                secondaryMetricKeys: section.secondaryMetricKeys,
                primaryChartId: section.primaryChartId,
                secondaryTableIds: section.secondaryTableIds,
                notes: section.notes
            };
            return acc;
        }
        const tables = section.tables.map((table) => sanitizeTableForAccess(table, canViewProfit));
        acc[tab] = {
            ...section,
            kpis: canViewProfit ? section.kpis : section.kpis.filter((metric) => !PROFIT_METRIC_KEYS.has(metric.key)),
            charts: canViewProfit ? section.charts : section.charts.filter((chart) => !PROFIT_CHART_IDS.has(chart.id)),
            tables,
            primaryTableId: tables.find((table) => table.id === section.primaryTableId)?.id || tables[0]?.id || ''
        };
        return acc;
    }, {} as Record<ReportTab, ReportBundle['sections'][ReportTab]>);
    const tablesById = ALL_REPORT_TABS.flatMap((tab) => sections[tab].tables).reduce<ReportBundle['tablesById']>((acc, table) => {
        acc[table.id] = table;
        return acc;
    }, {});
    const sanitizedInsights = bundle.insights.filter((insight) => (!insight.tab || allowedTabs.has(insight.tab)) && (canViewProfit || !PROFIT_INSIGHT_IDS.has(insight.id)));
    const sanitizedOverviewMetrics = bundle.overview.primaryMetrics.filter((metric) => {
        const requiredTab = SUMMARY_CARD_TABS[metric.key];
        if (requiredTab && !allowedTabs.has(requiredTab))
            return false;
        return canViewProfit || !PROFIT_METRIC_KEYS.has(metric.key);
    });
    const sanitizedAttentionTable = sanitizeTableForAccess({
        ...bundle.overview.attentionTable,
        rows: bundle.overview.attentionTable.rows.filter((row) => {
            const requiredTab = resolveTabForTableId(typeof row.sourceTableId === 'string' ? row.sourceTableId : undefined);
            return !requiredTab || allowedTabs.has(requiredTab);
        })
    }, canViewProfit);
    return {
        ...bundle,
        summaryCards: bundle.summaryCards.filter((card) => {
            const requiredTab = SUMMARY_CARD_TABS[card.key];
            if (requiredTab && !allowedTabs.has(requiredTab))
                return false;
            return canViewProfit || !PROFIT_SUMMARY_KEYS.has(card.key);
        }),
        formulas: bundle.formulas.filter((formula) => {
            const requiredTab = FORMULA_TABS[formula.key];
            if (requiredTab && !allowedTabs.has(requiredTab))
                return false;
            return canViewProfit || !PROFIT_FORMULA_KEYS.has(formula.key);
        }),
        insights: sanitizedInsights,
        overview: {
            primaryMetrics: sanitizedOverviewMetrics,
            topInsights: bundle.overview.topInsights.filter((insight) => sanitizedInsights.some((candidate) => candidate.id === insight.id)),
            focusChart: bundle.overview.focusChart,
            attentionTable: sanitizedAttentionTable
        },
        sections,
        tablesById
    };
};
const formatCell = (bundle: ReportBundle, column: ReportTable['columns'][number], value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '')
        return '-';
    if (column.type === 'money')
        return formatReportMoney(Number(value), bundle.language, bundle.currencyCode);
    if (column.type === 'percent')
        return formatReportPercent(Number(value), bundle.language);
    if (column.type === 'number')
        return new Intl.NumberFormat(bundle.language === 'english' ? 'en-US' : 'fa-AF').format(Number(value));
    if (column.type === 'date')
        return formatReportDate(String(value), bundle.language, bundle);
    if (column.type === 'status') {
        return escapeHtml(value === 'paid'
            ? getReportLabel(bundle.language, 'paid')
            : value === 'partial'
                ? getReportLabel(bundle.language, 'partial')
                : value === 'credit'
                    ? getReportLabel(bundle.language, 'credit')
                    : String(value));
    }
    return escapeHtml(String(value));
};
const renderBarChartSvg = (title: string, points: {
    label: string;
    value: number;
}[]) => {
    if (!points.length)
        return '';
    const max = Math.max(...points.map((point) => point.value), 1);
    const barWidth = 460 / Math.max(points.length, 1);
    const bars = points
        .map((point, index) => {
        const height = Math.max(12, (point.value / max) * 140);
        const x = 24 + index * barWidth;
        const y = 160 - height;
        return `
        <g>
          <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(18, barWidth - 18).toFixed(2)}" height="${height.toFixed(2)}" rx="8" fill="#1d4ed8" opacity="0.88" />
          <text x="${(x + Math.max(18, barWidth - 18) / 2).toFixed(2)}" y="178" text-anchor="middle" font-size="10" fill="#475569">${escapeHtml(point.label.slice(0, 18))}</text>
        </g>
      `;
    })
        .join('');
    return `
    <svg viewBox="0 0 520 190" width="100%" height="190" role="img" aria-label="${escapeHtml(title)}">
      <rect x="0" y="0" width="520" height="190" rx="18" fill="#f8fafc" />
      <line x1="24" y1="160" x2="496" y2="160" stroke="#cbd5e1" stroke-width="1" />
      ${bars}
    </svg>
  `;
};
const renderLineChartSvg = (title: string, points: {
    label: string;
    value: number;
}[]) => {
    if (!points.length)
        return '';
    const max = Math.max(...points.map((point) => point.value), 1);
    const step = points.length === 1 ? 0 : 440 / (points.length - 1);
    const coordinates = points
        .map((point, index) => {
        const x = 40 + index * step;
        const y = 160 - (point.value / max) * 120;
        return { x, y, point };
    });
    const polyline = coordinates.map((item) => `${item.x.toFixed(2)},${item.y.toFixed(2)}`).join(' ');
    const labels = coordinates
        .map((item) => `<text x="${item.x.toFixed(2)}" y="182" text-anchor="middle" font-size="10" fill="#475569">${escapeHtml(item.point.label.slice(0, 14))}</text>`)
        .join('');
    const dots = coordinates
        .map((item) => `<circle cx="${item.x.toFixed(2)}" cy="${item.y.toFixed(2)}" r="4.5" fill="#1d4ed8" stroke="#ffffff" stroke-width="2" />`)
        .join('');
    return `
    <svg viewBox="0 0 520 190" width="100%" height="190" role="img" aria-label="${escapeHtml(title)}">
      <rect x="0" y="0" width="520" height="190" rx="18" fill="#f8fafc" />
      <path d="M40 160 L480 160" stroke="#cbd5e1" stroke-width="1" fill="none" />
      <polyline fill="none" stroke="#1d4ed8" stroke-width="3" points="${polyline}" />
      ${dots}
      ${labels}
    </svg>
  `;
};
const renderChart = (section: ReportSection, index: number) => {
    const series = section.charts[index];
    if (!series)
        return '';
    const points = series.data.slice(0, 8).map((point) => ({ label: point.label, value: point.value }));
    const visual = series.kind === 'area' ? renderLineChartSvg(series.title, points) : renderBarChartSvg(series.title, points);
    const description = series.data.length
        ? escapeHtml(series.description)
        : `<p class="empty-note">${escapeHtml(series.emptyDescription)}</p>`;
    return `
    <div class="chart-card">
      <div class="section-subtitle">${escapeHtml(series.title)}</div>
      ${visual || `<div class="empty-note">${escapeHtml(series.emptyDescription)}</div>`}
      <p class="chart-note">${description}</p>
    </div>
  `;
};
const renderTable = (bundle: ReportBundle, table: ReportTable, mode: ReportExportMode) => {
    const rows = table.rows.slice(0, getTableRowLimit(mode));
    const head = table.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
    const body = rows.length
        ? rows
            .map((row) => {
            const cells = table.columns
                .map((column) => `<td>${formatCell(bundle, column, row[column.key])}</td>`)
                .join('');
            return `<tr>${cells}</tr>`;
        })
            .join('')
        : `<tr><td colspan="${table.columns.length}" class="empty-row">${escapeHtml(table.emptyDescription)}</td></tr>`;
    return `
    <div class="table-card">
      <div class="section-subtitle">${escapeHtml(table.title)}</div>
      <p class="chart-note">${escapeHtml(table.description)}</p>
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
};
const paired = (primary: string, secondary?: string | null) => secondary && secondary !== primary ? `${escapeHtml(primary)} / ${escapeHtml(secondary)}` : escapeHtml(primary);
const renderMetricGrid = (metrics: ReportSection['kpis'], secondaryMetrics: ReportSection['kpis'] | undefined, showFormula: boolean) => `
  <div class="metric-grid">
    ${metrics.map((metric) => {
    const secondaryMetric = secondaryMetrics?.find((item) => item.key === metric.key);
    return `
        <div class="metric-card">
          <div class="metric-label">${paired(metric.label, secondaryMetric?.label)}</div>
          <div class="metric-value">${escapeHtml(metric.formattedValue)}</div>
          <div class="metric-change" style="color:${toneColor(metric.tone)}">${escapeHtml(metric.changeLabel)}</div>
          ${showFormula ? `<div class="metric-formula">${escapeHtml(metric.formula)}</div>` : ''}
        </div>
      `;
}).join('')}
  </div>
`;
const renderInsightCards = (insights: ReportBundle['insights'], primaryLanguage: ReportBundle['language'], secondaryLanguage?: ReportBundle['language']) => {
    if (!insights.length)
        return '';
    return `
    <section class="page-block">
      <div class="section-title">${paired(getReportLabel(primaryLanguage, 'executiveSummary'), secondaryLanguage ? getReportLabel(secondaryLanguage, 'executiveSummary') : null)}</div>
      <div class="insight-list">
        ${insights.map((insight) => `
          <div class="insight-card">
            <div class="insight-title" style="color:${toneColor(insight.tone)}">${escapeHtml(insight.title)}</div>
            <p class="chart-note">${escapeHtml(insight.description)}</p>
          </div>
        `).join('')}
      </div>
    </section>
  `;
};
const renderSection = (primary: ReportBundle, secondary: ReportBundle | null | undefined, section: ReportSection, mode: ReportExportMode) => {
    const secondarySection = secondary?.sections[section.id];
    return `
    <section class="page-block">
      <div class="section-title">${paired(section.title, secondarySection?.title)}</div>
      <p class="section-note">${paired(section.subtitle, secondarySection?.subtitle)}</p>
      ${renderMetricGrid(section.kpis.slice(0, 8), secondarySection?.kpis, true)}
      <div class="chart-grid">
        ${renderChart(section, 0)}
        ${renderChart(section, 1)}
      </div>
      ${section.tables.slice(0, mode === 'full' ? 2 : 1).map((table) => renderTable(primary, table, mode)).join('')}
    </section>
  `;
};
const renderSummarySection = (primary: ReportBundle, secondary: ReportBundle | null | undefined, section: ReportSection) => {
    const secondarySection = secondary?.sections[section.id];
    const heroMetrics = section.heroMetricKeys.map((key) => section.kpis.find((metric) => metric.key === key)).filter(Boolean) as ReportSection['kpis'];
    const heroSecondaryMetrics = secondarySection?.heroMetricKeys.map((key) => secondarySection.kpis.find((metric) => metric.key === key)).filter(Boolean) as ReportSection['kpis'] | undefined;
    const primaryChart = section.charts.find((chart) => chart.id === section.primaryChartId) || section.charts[0];
    const primaryTable = section.tables.find((table) => table.id === section.primaryTableId) || section.tables[0];
    const sectionInsights = primary.insights.filter((insight) => insight.tab === section.id).slice(0, 3);
    return `
    <section class="page-block">
      <div class="section-title">${paired(section.navigationLabel, secondarySection?.navigationLabel)}</div>
      <p class="section-note">${paired(section.subtitle, secondarySection?.subtitle)}</p>
      ${renderMetricGrid(heroMetrics, heroSecondaryMetrics, false)}
      ${sectionInsights.length ? `<div class="insight-list">${sectionInsights.map((insight) => `
        <div class="insight-card">
          <div class="insight-title" style="color:${toneColor(insight.tone)}">${escapeHtml(insight.title)}</div>
          <p class="chart-note">${escapeHtml(insight.description)}</p>
        </div>
      `).join('')}</div>` : ''}
      <div class="chart-grid">
        ${primaryChart ? renderChart({ ...section, charts: [primaryChart] }, 0) : ''}
      </div>
      ${primaryTable ? renderTable(primary, primaryTable, 'summary') : ''}
    </section>
  `;
};
const renderOverviewSummary = (primary: ReportBundle, secondary: ReportBundle | null | undefined) => `
  <section class="page-block">
    <div class="section-title">${paired(getReportLabel(primary.language, 'executiveSummary'), secondary?.language ? getReportLabel(secondary.language, 'executiveSummary') : null)}</div>
    ${renderMetricGrid(primary.overview.primaryMetrics, secondary?.overview.primaryMetrics, false)}
    <div class="insight-list">
      ${primary.overview.topInsights.map((insight) => `
        <div class="insight-card">
          <div class="insight-title" style="color:${toneColor(insight.tone)}">${escapeHtml(insight.title)}</div>
          <p class="chart-note">${escapeHtml(insight.description)}</p>
        </div>
      `).join('')}
    </div>
    <div class="chart-grid">
      <div>${renderChart({ ...primary.sections.financial, charts: [primary.overview.focusChart] }, 0)}</div>
      <div>${renderTable(primary, primary.overview.attentionTable, 'summary')}</div>
    </div>
  </section>
`;
const renderDetailedSection = (primary: ReportBundle, secondary: ReportBundle | null | undefined, section: ReportSection) => {
    const secondarySection = secondary?.sections[section.id];
    const heroMetrics = section.heroMetricKeys.map((key) => section.kpis.find((metric) => metric.key === key)).filter(Boolean) as ReportSection['kpis'];
    const heroSecondaryMetrics = secondarySection?.heroMetricKeys.map((key) => secondarySection.kpis.find((metric) => metric.key === key)).filter(Boolean) as ReportSection['kpis'] | undefined;
    const primaryChart = section.charts.find((chart) => chart.id === section.primaryChartId) || section.charts[0];
    const primaryTable = section.tables.find((table) => table.id === section.primaryTableId) || section.tables[0];
    return `
    <section class="page-block">
      <div class="section-title">${paired(section.navigationLabel, secondarySection?.navigationLabel)}</div>
      <p class="section-note">${paired(section.subtitle, secondarySection?.subtitle)}</p>
      ${renderMetricGrid(heroMetrics, heroSecondaryMetrics, true)}
      <div class="chart-grid">
        ${primaryChart ? renderChart({ ...section, charts: [primaryChart] }, 0) : ''}
      </div>
      ${primaryTable ? renderTable(primary, primaryTable, 'detailed') : ''}
      ${section.notes.length ? `<div class="table-card"><div class="section-subtitle">${paired(getReportLabel(primary.language, 'note'), secondary?.language ? getReportLabel(secondary.language, 'note') : null)}</div><p class="chart-note">${section.notes.map((note) => escapeHtml(note)).join('<br />')}</p></div>` : ''}
    </section>
  `;
};
const getSectionsForScope = (bundle: ReportBundle, scope: 'currentTab' | 'fullBook', tab?: ReportTab, tabs?: ReportTab[]) => {
    const selectedTabs = scope === 'currentTab' && tab ? [tab] : tabs?.length ? tabs : ALL_REPORT_TABS;
    return selectedTabs
        .map((selectedTab) => bundle.sections[selectedTab])
        .filter((section) => section && (section.kpis.length > 0 || section.charts.length > 0 || section.tables.length > 0));
};
export const buildReportHtml = ({ primary, secondary, mode, scope, tab, tabs, managerNote, confidentiality }: BuildReportDocumentArgs) => {
    const sections = getSectionsForScope(primary, scope, tab, tabs);
    const appendixMetricKeys = mode === 'summary'
        ? primary.overview.primaryMetrics.map((metric) => metric.key)
        : mode === 'detailed' && tab
            ? Array.from(new Set([...(primary.sections[tab]?.heroMetricKeys || []), ...(primary.sections[tab]?.secondaryMetricKeys || [])]))
            : primary.formulas.map((formula) => formula.key);
    const summaryDefinitionText = primary.language === 'english'
        ? 'See detailed report for the full calculation.'
        : 'محاسبه کامل در راپور تفصیلی قابل مشاهده است.';
    const appendix = primary.formulas
        .filter((formula) => appendixMetricKeys.includes(formula.key))
        .map((formula) => `<tr><td>${escapeHtml(formula.label)}</td><td>${escapeHtml(mode === 'summary' ? summaryDefinitionText : formula.formula)}</td><td>${escapeHtml(formula.source)}</td></tr>`)
        .join('');
    const content = mode === 'summary'
        ? scope === 'currentTab' && tab
            ? renderSummarySection(primary, secondary, primary.sections[tab])
            : renderOverviewSummary(primary, secondary)
        : mode === 'detailed'
            ? sections.map((section) => renderDetailedSection(primary, secondary, section)).join('')
            : `${renderInsightCards(primary.insights.slice(0, 6), primary.language, secondary?.language)}${sections.map((section) => renderSection(primary, secondary, section, mode)).join('')}`;
    return `<!DOCTYPE html>
  <html lang="${primary.language}" dir="${primary.language === 'english' ? 'ltr' : 'rtl'}">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(primary.title)}</title>
      <style>
        @page { size: A4; margin: 16mm 12mm 18mm; }
        * { box-sizing: border-box; }
        body { font-family: "Segoe UI", Tahoma, "Noto Naskh Arabic", sans-serif; margin: 0; color: #0f172a; background: #ffffff; }
        .cover { padding: 18px 8px 10px; border-bottom: 1px solid #dbeafe; }
        .cover h1 { margin: 0; font-size: 26px; }
        .cover p { margin: 6px 0 0; color: #475569; font-size: 12px; }
        .meta-grid, .metric-grid, .chart-grid, .insight-list { display: grid; gap: 12px; }
        .meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 16px; }
        .metric-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: 14px; }
        .chart-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 14px; }
        .insight-list { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 14px; }
        .meta-card, .metric-card, .chart-card, .table-card, .insight-card { border: 1px solid #e2e8f0; border-radius: 18px; padding: 12px 14px; background: #ffffff; }
        .metric-label, .meta-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; font-weight: 700; }
        .metric-value { font-size: 22px; font-weight: 800; margin-top: 8px; }
        .metric-change { font-size: 12px; font-weight: 700; margin-top: 6px; }
        .metric-formula, .chart-note, .section-note { font-size: 11px; line-height: 1.6; color: #64748b; }
        .section-title { font-size: 18px; font-weight: 800; margin-top: 28px; }
        .section-subtitle { font-size: 14px; font-weight: 700; margin-bottom: 8px; }
        .page-block { page-break-before: always; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
        th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; text-align: ${primary.language === 'english' ? 'left' : 'right'}; vertical-align: top; }
        th { background: #f8fafc; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
        .empty-row, .empty-note { text-align: center; color: #94a3b8; padding: 18px 8px; }
        .footer { margin-top: 16px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #64748b; display: flex; justify-content: space-between; gap: 12px; }
      </style>
    </head>
    <body>
      <section class="cover">
        <h1>${paired(primary.title, secondary?.title)}</h1>
        <p>${paired(primary.subtitle, secondary?.subtitle)}</p>
        <div class="meta-grid">
          <div class="meta-card"><div class="meta-label">${paired(getReportLabel(primary.language, 'store'), secondary?.language ? getReportLabel(secondary.language, 'store') : null)}</div><div>${escapeHtml(primary.metadata.storeName)}</div></div>
          <div class="meta-card"><div class="meta-label">${paired(getReportLabel(primary.language, 'generatedAt'), secondary?.language ? getReportLabel(secondary.language, 'generatedAt') : null)}</div><div>${escapeHtml(formatReportDateTime(primary.generatedAt, primary.language, primary))}</div></div>
          <div class="meta-card"><div class="meta-label">${paired(getReportLabel(primary.language, 'currentRange'), secondary?.language ? getReportLabel(secondary.language, 'currentRange') : null)}</div><div>${escapeHtml(primary.range.label)}</div></div>
          <div class="meta-card"><div class="meta-label">${paired(getReportLabel(primary.language, 'lastUpdated'), secondary?.language ? getReportLabel(secondary.language, 'lastUpdated') : null)}</div><div>${escapeHtml(primary.lastDataSync ? formatReportDateTime(primary.lastDataSync, primary.language, primary) : '-')}</div></div>
        </div>
        <div class="metric-grid">
          ${primary.summaryCards.map((card) => `
            <div class="metric-card">
              <div class="metric-label">${escapeHtml(card.label)}</div>
              <div class="metric-value">${escapeHtml(card.value)}</div>
            </div>
          `).join('')}
        </div>
        ${managerNote ? `<div class="table-card" style="margin-top:14px"><div class="section-subtitle">${paired(getReportLabel(primary.language, 'note'), secondary?.language ? getReportLabel(secondary.language, 'note') : null)}</div><p class="chart-note">${escapeHtml(managerNote)}</p></div>` : ''}
      </section>
      ${content}
      <section class="page-block">
        <div class="section-title">${paired(getReportLabel(primary.language, 'formulaAppendix'), secondary?.language ? getReportLabel(secondary.language, 'formulaAppendix') : null)}</div>
        <table>
          <thead><tr><th>Metric</th><th>Formula</th><th>Source</th></tr></thead>
          <tbody>${appendix}</tbody>
        </table>
        <div class="footer">
          <span>${escapeHtml(confidentiality || getReportLabel(primary.language, 'confidential'))}</span>
          <span>${escapeHtml(getReportLabel(primary.language, 'reportId'))}: ${escapeHtml(primary.reportId)}</span>
        </div>
      </section>
    </body>
  </html>`;
};
export const buildReportCsv = (bundle: ReportBundle, tab: ReportTab) => {
    const table = bundle.sections[tab].tables[0];
    if (!table)
        return '';
    const head = table.columns.map((column) => `"${column.label.replace(/"/g, '""')}"`).join(',');
    const rows = table.rows.map((row) => table.columns.map((column) => `"${String(formatCell(bundle, column, row[column.key])).replace(/"/g, '""')}"`).join(','));
    return [head, ...rows].join('\n');
};
export const buildShareText = (bundle: ReportBundle) => {
    const firstInsight = bundle.overview.topInsights[0]?.description || bundle.stateDescription;
    return [
        bundle.title,
        bundle.range.label,
        bundle.overview.primaryMetrics.map((metric) => `${metric.label}: ${metric.formattedValue}`).join(' | '),
        firstInsight
    ].join('\n');
};
export const buildReportFileName = (bundle: ReportBundle, format: 'pdf' | 'html' | 'csv', tab?: ReportTab) => {
    const prefix = bundle.language === 'english' ? 'report' : 'raapor';
    const scope = tab || 'full';
    return `${prefix}-${scope}-${bundle.generatedAt.slice(0, 10)}.${format}`;
};
export const buildBilingualBundlePair = (args: Parameters<typeof buildReportBundle>[0]) => ({
    primary: buildReportBundle({ ...args, language: 'english' }),
    secondary: buildReportBundle({ ...args, language: 'dari' })
});
