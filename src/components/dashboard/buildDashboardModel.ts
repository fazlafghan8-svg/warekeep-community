import type { AppSettings, Customer, Expense, GuestTrialState, Invoice, Medicine, SalesMode } from '@/types';
import type { AppFormatters } from '@/lib/formatters';
import { formatAppDate, formatAppDateTime, formatAppTime, parseAppDate } from '@/lib/formatters';
import { calculateInvoiceLineTotal } from '@/utils/calculations';
import { resolveDefaultSalesMode } from '@/constants/sales';
import { getInvoiceItemBaseQuantity } from '@/utils/unitConversion';
const safeNumber = (value?: number) => (Number.isFinite(value) ? Number(value) : 0);
const parseDate = (value?: string) => {
    if (!value) {
        return null;
    }
    return parseAppDate(value);
};
const startOfDay = (value: Date) => {
    const next = new Date(value);
    next.setHours(0, 0, 0, 0);
    return next;
};
const diffInDays = (from: Date, to: Date) => Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
type DashboardReceivableAccount = {
    id: string;
    customerName: string | null;
    customerFallbackReference: string;
    amount: number;
    maxOverdueDays: number;
};
type DashboardRecentActivity = {
    kind: 'invoice';
    id: string;
    date: string;
    tone: 'success';
    timestampLabel: string;
    invoiceReference: string;
    customerName: string | null;
    customerFallbackReference: string;
    amount: number;
} | {
    kind: 'expense';
    id: string;
    date: string;
    tone: 'warning';
    timestampLabel: string;
    expenseTitle: string;
    category: string;
    amount: number;
};
interface BuildDashboardModelArgs {
    medicines: Medicine[];
    invoices: Invoice[];
    customers: Customer[];
    expenses: Expense[];
    settings: AppSettings;
    formatters: AppFormatters;
    guestTrialState?: GuestTrialState | null;
    periodDays?: number;
}
const hasSparseTrend = (points: Array<{
    sales: number;
    expenses: number;
    net: number;
}>) => {
    const nonZeroPointCount = points.filter((point) => point.sales > 0 || point.expenses > 0 || point.net !== 0).length;
    return nonZeroPointCount > 0 && nonZeroPointCount <= Math.min(3, Math.ceil(points.length / 4));
};
export const buildDashboardModel = ({ medicines, invoices, customers, expenses, settings, formatters, guestTrialState, periodDays = 30, }: BuildDashboardModelArgs) => {
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(currentMonthStart.getTime() - 1);
    const activeMedicines = medicines.filter((item) => !item.isDeleted);
    const activeInvoices = invoices.filter((item) => !item.isDeleted);
    const activeCustomers = customers.filter((item) => !item.isDeleted);
    const activeExpenses = expenses.filter((item) => !item.isDeleted);
    const customerMap = new Map(activeCustomers.map((customer) => [customer.id, customer]));
    const defaultSalesMode = resolveDefaultSalesMode(settings);
    const getCustomerSnapshot = (customerId: string, fallbackReference: string) => ({
        customerName: customerMap.get(customerId)?.name ?? null,
        customerFallbackReference: fallbackReference,
    });
    const inventoryRows = activeMedicines.map((medicine) => {
        const stock = medicine.batches.reduce((sum, batch) => sum + safeNumber(batch.quantity), 0);
        const inventoryValue = medicine.batches.reduce((sum, batch) => sum + safeNumber(batch.quantity) * safeNumber(batch.purchasePrice), 0);
        const threshold = Math.max(1, safeNumber(medicine.lowStockThreshold));
        const expiryDays = medicine.batches
            .filter((batch) => safeNumber(batch.quantity) > 0)
            .map((batch) => {
            const expiry = parseDate(batch.expiryDate);
            return expiry ? diffInDays(today, expiry) : Number.POSITIVE_INFINITY;
        })
            .filter((days) => Number.isFinite(days));
        return {
            medicine,
            stock,
            threshold,
            stockRatio: stock / threshold,
            inventoryValue,
            nearestExpiryDays: expiryDays.length ? Math.min(...expiryDays) : Number.POSITIVE_INFINITY,
        };
    });
    const lowStockItems = inventoryRows
        .filter((row) => row.stock <= row.threshold)
        .sort((left, right) => left.stockRatio - right.stockRatio || left.stock - right.stock);
    const criticalLowStockItems = lowStockItems.filter((row) => row.stock === 0 || row.stockRatio <= 0.35);
    const expiringSoonItems = inventoryRows
        .filter((row) => row.nearestExpiryDays <= 30)
        .sort((left, right) => left.nearestExpiryDays - right.nearestExpiryDays);
    const expiringImmediateItems = expiringSoonItems.filter((row) => row.nearestExpiryDays <= 7);
    const inventoryValue = inventoryRows.reduce((sum, row) => sum + row.inventoryValue, 0);
    const inventoryHealthScore = activeMedicines.length === 0
        ? 0
        : clamp(100 -
            ((lowStockItems.length * 1.75 +
                criticalLowStockItems.length * 2.25 +
                expiringSoonItems.length * 1.1 +
                expiringImmediateItems.length * 1.9) /
                activeMedicines.length) *
                100, 18, 98);
    const trendMap = new Map<string, {
        label: string;
        sales: number;
        expenses: number;
        net: number;
    }>();
    for (let offset = periodDays - 1; offset >= 0; offset -= 1) {
        const day = new Date(today);
        day.setDate(today.getDate() - offset);
        trendMap.set(day.toISOString().slice(0, 10), {
            label: formatAppDate(day, settings, 'dashboard', { month: 'short', day: 'numeric' }),
            sales: 0,
            expenses: 0,
            net: 0,
        });
    }
    let todaySales = 0;
    let todayCollected = 0;
    let todayExpenses = 0;
    let totalSystemCollected = 0;
    let totalSystemExpenses = 0;
    let todayInvoiceCount = 0;
    let currentMonthSales = 0;
    let currentMonthExpenses = 0;
    let previousMonthSales = 0;
    const salesModeTotals: Record<SalesMode, number> = { retail: 0, wholesale: 0, bulk: 0 };
    const periodStart = new Date(today);
    periodStart.setDate(today.getDate() - (periodDays - 1));
    const previousPeriodStart = new Date(periodStart);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - periodDays);
    let periodSales = 0;
    let previousPeriodSales = 0;
    let periodExpenses = 0;
    let previousPeriodExpenses = 0;
    let periodInvoiceCount = 0;
    let previousPeriodInvoiceCount = 0;
    let periodUnitsSold = 0;
    let previousPeriodUnitsSold = 0;
    let periodCOGS = 0;
    let previousPeriodCOGS = 0;
    let periodCollected = 0;
    let previousPeriodCollected = 0;
    const periodCustomerIds = new Set<string>();
    const previousPeriodCustomerIds = new Set<string>();
    const customersWithPurchasesBeforePeriod = new Set<string>();
    const bestSellingAgg: Record<string, {
        name: string;
        sold: number;
        revenue: number;
        costTotal: number;
    }> = {};
    const dayCounts = new Array(7).fill(0) as number[];
    const activeMedicineMap = new Map(activeMedicines.map((m) => [m.id, m]));
    // Batch lookup for COGS fallback: medicineId → batchId → purchasePrice
    const batchPriceLookup = new Map<string, Map<string, number>>();
    activeMedicines.forEach((m) => {
        const map = new Map<string, number>();
        m.batches.forEach((b) => map.set(b.id, safeNumber(b.purchasePrice)));
        batchPriceLookup.set(m.id, map);
    });
    const resolveItemCost = (item: {
        medicineId: string;
        batchId: string;
        costPrice?: number;
    }) => {
        const explicit = safeNumber(item.costPrice);
        if (explicit > 0)
            return explicit;
        return batchPriceLookup.get(item.medicineId)?.get(item.batchId) ?? 0;
    };
    const getDashboardItemBaseQuantity = (item: {
        quantity: number;
        baseQuantity?: number;
        saleUnitConversionFactor?: number;
    }) => (Math.max(0, getInvoiceItemBaseQuantity(item)));
    // --- New tracking accumulators ---
    const periodCustomerRevenue: Record<string, {
        name: string;
        revenue: number;
        invoiceCount: number;
        cogs: number;
    }> = {};
    const periodModeRevenue: Record<SalesMode, number> = { retail: 0, wholesale: 0, bulk: 0 };
    const periodModeCOGS: Record<SalesMode, number> = { retail: 0, wholesale: 0, bulk: 0 };
    const periodSoldMedicineIds = new Set<string>();
    const periodExpenseByCategory: Record<string, number> = {};
    activeInvoices.forEach((invoice) => {
        const invoiceDate = parseDate(invoice.date);
        if (!invoiceDate) {
            return;
        }
        const finalAmount = safeNumber(invoice.finalAmount);
        const grossSales = safeNumber(invoice.total);
        const lineDiscount = safeNumber(invoice.lineDiscountTotal);
        const discount = clamp(safeNumber(invoice.discount) + lineDiscount, 0, Math.max(0, grossSales));
        const salesReturns = Array.isArray(invoice.returns) ? invoice.returns.filter((entry) => !entry.isDeleted) : [];
        const returnSales = salesReturns.reduce((sum, entry) => sum + safeNumber(entry.subtotal || entry.totalRefund), 0);
        const returnRefunded = salesReturns.reduce((sum, entry) => sum + safeNumber(entry.amountRefunded), 0);
        const netSales = Math.max(0, grossSales - discount - returnSales);
        const paidAmount = Math.max(0, safeNumber(invoice.amountPaid) - returnRefunded);
        totalSystemCollected += paidAmount;
        const trendRow = trendMap.get(invoiceDate.toISOString().slice(0, 10));
        if (trendRow) {
            trendRow.sales += netSales;
        }
        if (invoiceDate >= today && invoiceDate < tomorrow) {
            todaySales += netSales;
            todayCollected += paidAmount;
            todayInvoiceCount += 1;
        }
        if (invoiceDate >= currentMonthStart) {
            currentMonthSales += netSales;
            salesModeTotals[invoice.salesMode ?? defaultSalesMode] += netSales;
        }
        else if (invoiceDate >= previousMonthStart && invoiceDate <= previousMonthEnd) {
            previousMonthSales += netSales;
        }
        const invoiceUnitsBeforeReturns = invoice.items.reduce((sum, item) => sum + getDashboardItemBaseQuantity(item), 0);
        const returnedUnits = salesReturns.reduce((returnSum, entry) => (returnSum + (entry.items || []).reduce((itemSum, returnItem) => itemSum + getDashboardItemBaseQuantity(returnItem), 0)), 0);
        const invoiceUnits = Math.max(0, invoiceUnitsBeforeReturns - returnedUnits);
        const invoiceCOGSBeforeReturns = invoice.items.reduce((sum, item) => sum + getDashboardItemBaseQuantity(item) * resolveItemCost(item), 0);
        const returnCOGS = salesReturns.reduce((returnSum, entry) => (returnSum + (entry.items || []).reduce((itemSum, returnItem) => {
            const sourceItem = invoice.items.find((item) => (item.medicineId === returnItem.medicineId && item.batchId === returnItem.batchId));
            const unitCost = safeNumber(returnItem.costPrice ?? sourceItem?.costPrice);
            return itemSum + getDashboardItemBaseQuantity(returnItem) * unitCost;
        }, 0)), 0);
        const invoiceCOGS = Math.max(0, invoiceCOGSBeforeReturns - returnCOGS);
        if (invoiceDate < periodStart && invoice.customerId) {
            customersWithPurchasesBeforePeriod.add(invoice.customerId);
        }
        const invoiceMode = invoice.salesMode ?? defaultSalesMode;
        if (invoiceDate >= periodStart) {
            periodSales += netSales;
            periodInvoiceCount += 1;
            periodUnitsSold += invoiceUnits;
            periodCOGS += invoiceCOGS;
            periodCollected += paidAmount;
            periodModeRevenue[invoiceMode] += netSales;
            periodModeCOGS[invoiceMode] += invoiceCOGS;
            if (invoice.customerId) {
                periodCustomerIds.add(invoice.customerId);
                if (!periodCustomerRevenue[invoice.customerId]) {
                    const cust = customerMap.get(invoice.customerId);
                    periodCustomerRevenue[invoice.customerId] = {
                        name: cust?.name ?? invoice.customerId.slice(-4).toUpperCase(),
                        revenue: 0,
                        invoiceCount: 0,
                        cogs: 0,
                    };
                }
                periodCustomerRevenue[invoice.customerId].revenue += netSales;
                periodCustomerRevenue[invoice.customerId].invoiceCount += 1;
                periodCustomerRevenue[invoice.customerId].cogs += invoiceCOGS;
            }
            invoice.items.forEach((item) => periodSoldMedicineIds.add(item.medicineId));
            const dayOfWeek = invoiceDate.getDay();
            dayCounts[dayOfWeek] += 1;
            invoice.items.forEach((item, itemIndex) => {
                const medicine = activeMedicineMap.get(item.medicineId);
                if (!medicine)
                    return;
                if (!bestSellingAgg[item.medicineId]) {
                    bestSellingAgg[item.medicineId] = { name: medicine.name, sold: 0, revenue: 0, costTotal: 0 };
                }
                const qty = getDashboardItemBaseQuantity(item);
                const returnedQtyForItem = salesReturns.reduce((returnSum, entry) => (returnSum + (entry.items || []).reduce((itemSum, returnItem) => {
                    const sameSource = entry.sourceItemIndex === itemIndex;
                    const sameBatch = returnItem.medicineId === item.medicineId && returnItem.batchId === item.batchId;
                    return sameSource || sameBatch ? itemSum + getDashboardItemBaseQuantity(returnItem) : itemSum;
                }, 0)), 0);
                const returnedRevenueForItem = salesReturns.reduce((returnSum, entry) => {
                    const hasMatch = (entry.items || []).some((returnItem) => ((entry.sourceItemIndex === itemIndex)
                        || (returnItem.medicineId === item.medicineId && returnItem.batchId === item.batchId)));
                    return hasMatch ? returnSum + safeNumber(entry.subtotal || entry.totalRefund) : returnSum;
                }, 0);
                const netQty = Math.max(0, qty - returnedQtyForItem);
                bestSellingAgg[item.medicineId].sold += netQty;
                bestSellingAgg[item.medicineId].revenue += Math.max(0, calculateInvoiceLineTotal(item, invoice.currency || settings.currencySettings?.baseCurrency || 'AFN') - returnedRevenueForItem);
                bestSellingAgg[item.medicineId].costTotal += netQty * resolveItemCost(item);
            });
        }
        else if (invoiceDate >= previousPeriodStart && invoiceDate < periodStart) {
            previousPeriodSales += netSales;
            previousPeriodInvoiceCount += 1;
            previousPeriodUnitsSold += invoiceUnits;
            previousPeriodCOGS += invoiceCOGS;
            previousPeriodCollected += paidAmount;
            if (invoice.customerId)
                previousPeriodCustomerIds.add(invoice.customerId);
        }
    });
    activeExpenses.forEach((expense) => {
        const expenseDate = parseDate(expense.date);
        if (!expenseDate) {
            return;
        }
        const amount = safeNumber(expense.amount);
        totalSystemExpenses += amount;
        const trendRow = trendMap.get(expenseDate.toISOString().slice(0, 10));
        if (trendRow) {
            trendRow.expenses += amount;
        }
        if (expenseDate >= today && expenseDate < tomorrow) {
            todayExpenses += amount;
        }
        if (expenseDate >= currentMonthStart) {
            currentMonthExpenses += amount;
        }
        if (expenseDate >= periodStart) {
            periodExpenses += amount;
            const cat = expense.category || 'other';
            periodExpenseByCategory[cat] = (periodExpenseByCategory[cat] || 0) + amount;
        }
        else if (expenseDate >= previousPeriodStart && expenseDate < periodStart) {
            previousPeriodExpenses += amount;
        }
    });
    const trend30 = Array.from(trendMap.values()).map((row) => ({
        ...row,
        net: row.sales - row.expenses,
    }));
    const trendDensity = {
        '7': hasSparseTrend(trend30.slice(-7)),
        '14': hasSparseTrend(trend30.slice(-14)),
        '30': hasSparseTrend(trend30),
    } as const;
    const openReceivables = activeInvoices.reduce((sum, invoice) => sum + Math.max(safeNumber(invoice.remainingAmount), 0), 0);
    const customerReceivableBalance = activeCustomers.reduce((sum, customer) => sum + Math.max(safeNumber(customer.balance), 0), 0);
    const overdueInvoices = activeInvoices.filter((invoice) => {
        const dueDate = parseDate(invoice.dueDate);
        return !!dueDate && dueDate < today && safeNumber(invoice.remainingAmount) > 0;
    });
    const overdueAmount = overdueInvoices.reduce((sum, invoice) => sum + Math.max(safeNumber(invoice.remainingAmount), 0), 0);
    const overdueRate = openReceivables > 0 ? (overdueAmount / openReceivables) * 100 : 0;
    const receivableAccounts = activeInvoices
        .filter((invoice) => safeNumber(invoice.remainingAmount) > 0)
        .reduce<DashboardReceivableAccount[]>((rows, invoice) => {
        const dueDate = parseDate(invoice.dueDate);
        const overdueDays = dueDate && dueDate < today ? diffInDays(dueDate, today) : 0;
        const existing = rows.find((row) => row.id === invoice.customerId);
        if (existing) {
            existing.amount += safeNumber(invoice.remainingAmount);
            existing.maxOverdueDays = Math.max(existing.maxOverdueDays, overdueDays);
            return rows;
        }
        const fallbackReference = String(invoice.invoiceNumber ?? invoice.id.slice(-4).toUpperCase());
        rows.push({
            id: invoice.customerId,
            amount: safeNumber(invoice.remainingAmount),
            maxOverdueDays: overdueDays,
            ...getCustomerSnapshot(invoice.customerId, fallbackReference),
        });
        return rows;
    }, [])
        .sort((left, right) => right.maxOverdueDays - left.maxOverdueDays || right.amount - left.amount)
        .slice(0, 5);
    const recentActivity = [
        ...activeInvoices.map((invoice) => ({
            kind: 'invoice' as const,
            id: `invoice-${invoice.id}`,
            date: invoice.date,
            tone: 'success' as const,
            invoiceReference: String(invoice.invoiceNumber ?? invoice.id.slice(-4).toUpperCase()),
            amount: safeNumber(invoice.finalAmount),
            ...getCustomerSnapshot(invoice.customerId, String(invoice.invoiceNumber ?? invoice.id.slice(-4).toUpperCase())),
        })),
        ...activeExpenses.map((expense) => ({
            kind: 'expense' as const,
            id: `expense-${expense.id}`,
            date: expense.date,
            tone: 'warning' as const,
            expenseTitle: expense.title,
            category: expense.category,
            amount: safeNumber(expense.amount),
        })),
    ]
        .filter((item) => parseDate(item.date))
        .sort((left, right) => (parseDate(right.date)?.getTime() || 0) - (parseDate(left.date)?.getTime() || 0))
        .slice(0, 8)
        .map((item) => ({
        ...item,
        timestampLabel: parseDate(item.date)! >= today
            ? formatAppTime(item.date, settings, 'dashboard')
            : formatAppDateTime(item.date, settings, 'dashboard'),
    })) satisfies DashboardRecentActivity[];
    const guestUsage = guestTrialState
        ? Math.max(guestTrialState.usage.medicineCount / Math.max(guestTrialState.limits.maxMedicines, 1), guestTrialState.usage.invoiceCount / Math.max(guestTrialState.limits.maxInvoices, 1)) * 100
        : 0;
    const salesMixRows = [
        { id: 'retail' as const, total: salesModeTotals.retail },
        { id: 'wholesale' as const, total: salesModeTotals.wholesale },
        { id: 'bulk' as const, total: salesModeTotals.bulk },
    ];
    const prioritizedActions = [
        ...(criticalLowStockItems.length > 0
            ? [
                {
                    id: 'critical-stock' as const,
                    tone: 'danger' as const,
                    priority: 100,
                    impact: 'sales' as const,
                    deadline: 'today' as const,
                    count: criticalLowStockItems.length,
                },
            ]
            : []),
        ...(expiringImmediateItems.length > 0
            ? [
                {
                    id: 'urgent-expiry' as const,
                    tone: 'danger' as const,
                    priority: 96,
                    impact: 'expiry' as const,
                    deadline: 'week' as const,
                    count: expiringImmediateItems.length,
                },
            ]
            : []),
        ...(overdueAmount > 0
            ? [
                {
                    id: 'overdue' as const,
                    tone: 'warning' as const,
                    priority: 80,
                    impact: 'cashflow' as const,
                    deadline: 'shift' as const,
                    amount: overdueAmount,
                },
            ]
            : []),
        ...(todaySales === 0
            ? [
                {
                    id: 'start-day' as const,
                    tone: 'info' as const,
                    priority: 32,
                    impact: 'kickoff' as const,
                    deadline: 'now' as const,
                },
            ]
            : []),
    ]
        .sort((left, right) => right.priority - left.priority)
        .slice(0, 3);
    const returningPeriodCustomerCount = Array.from(periodCustomerIds).filter((customerId) => (customersWithPurchasesBeforePeriod.has(customerId))).length;
    const repeatCustomerRate = periodCustomerIds.size > 0
        ? clamp((returningPeriodCustomerCount /
            periodCustomerIds.size) *
            100, 0, 100)
        : 0;
    // --- Best-selling products (top 5 by revenue) ---
    const bestSellingRows = Object.entries(bestSellingAgg)
        .map(([id, entry]) => ({ id, ...entry }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
    const bestSellingMaxRevenue = Math.max(...bestSellingRows.map((r) => r.revenue), 1);
    const bestSelling = bestSellingRows.map((row) => ({
        ...row,
        rating: 4 + (row.revenue / bestSellingMaxRevenue) * 0.9,
        margin: row.revenue > 0 ? ((row.revenue - row.costTotal) / row.revenue) * 100 : 0,
    }));
    // --- Day activity (invoice counts per day-of-week) ---
    const dayMaxCount = Math.max(...dayCounts, 1);
    const dayActivity = dayCounts.map((count, index) => ({
        dayIndex: index,
        count,
        isMax: count === dayMaxCount && dayMaxCount > 0,
        heightPct: Math.max(18, (count / dayMaxCount) * 96),
    }));
    // --- Customer segments by sales mode (revenue in selected period) ---
    const customerSegments = [
        { id: 'retail' as const, total: periodModeRevenue.retail },
        { id: 'wholesale' as const, total: periodModeRevenue.wholesale },
        { id: 'bulk' as const, total: periodModeRevenue.bulk },
    ];
    // --- Gross profit & margin ---
    const periodGrossProfit = periodSales - periodCOGS;
    const previousPeriodGrossProfit = previousPeriodSales - previousPeriodCOGS;
    const periodGrossMargin = periodSales > 0 ? (periodGrossProfit / periodSales) * 100 : 0;
    // --- Collection rate ---
    const collectionRate = periodSales > 0 ? clamp((periodCollected / periodSales) * 100, 0, 100) : 0;
    // --- Average invoice value ---
    const avgInvoiceValue = periodInvoiceCount > 0 ? periodSales / periodInvoiceCount : 0;
    const previousAvgInvoiceValue = previousPeriodInvoiceCount > 0 ? previousPeriodSales / previousPeriodInvoiceCount : 0;
    // ===================================================================
    // INVENTORY INTELLIGENCE
    // ===================================================================
    // --- Inventory Turnover Rate (annualized) ---
    // Measures how many times inventory is sold and replaced per year.
    const annualizedCOGS = periodCOGS * (365 / Math.max(periodDays, 1));
    const inventoryTurnover = inventoryValue > 0 ? annualizedCOGS / inventoryValue : 0;
    // --- Total stock units ---
    const totalStockUnits = inventoryRows.reduce((sum, row) => sum + row.stock, 0);
    // --- Stock Coverage Days ---
    // How many days of stock remain at the current daily sales rate.
    const dailyUnitsSold = periodUnitsSold / Math.max(periodDays, 1);
    const stockCoverageDays = dailyUnitsSold > 0 ? totalStockUnits / dailyUnitsSold : totalStockUnits > 0 ? Infinity : 0;
    // --- Expiry Risk Value ---
    // Total inventory value at risk of expiration within 30 / 90 days.
    const expiryRiskValue30 = inventoryRows
        .filter((row) => row.nearestExpiryDays <= 30 && row.nearestExpiryDays > 0)
        .reduce((sum, row) => sum + row.inventoryValue, 0);
    const expiryRiskValue90 = inventoryRows
        .filter((row) => row.nearestExpiryDays <= 90 && row.nearestExpiryDays > 0)
        .reduce((sum, row) => sum + row.inventoryValue, 0);
    const alreadyExpiredValue = inventoryRows
        .filter((row) => row.nearestExpiryDays <= 0 && row.stock > 0)
        .reduce((sum, row) => sum + row.inventoryValue, 0);
    // --- Dead Stock (no sales in the selected period) ---
    const deadStockItems = activeMedicines.filter((m) => !periodSoldMedicineIds.has(m.id) && m.batches.reduce((s, b) => s + safeNumber(b.quantity), 0) > 0);
    const deadStockCount = deadStockItems.length;
    const deadStockValue = deadStockItems.reduce((sum, m) => sum + m.batches.reduce((s, b) => s + safeNumber(b.quantity) * safeNumber(b.purchasePrice), 0), 0);
    // --- ABC Analysis (Pareto: A=80% revenue, B=next 15%, C=rest) ---
    const revenueByMedicine = Object.entries(bestSellingAgg)
        .map(([id, entry]) => ({ id, revenue: entry.revenue }))
        .sort((a, b) => b.revenue - a.revenue);
    const totalMedicineRevenue = revenueByMedicine.reduce((s, r) => s + r.revenue, 0);
    let abcCumulative = 0;
    let abcACount = 0;
    let abcBCount = 0;
    for (const row of revenueByMedicine) {
        abcCumulative += row.revenue;
        const pct = totalMedicineRevenue > 0 ? (abcCumulative / totalMedicineRevenue) * 100 : 100;
        if (pct <= 80)
            abcACount += 1;
        else if (pct <= 95)
            abcBCount += 1;
    }
    const abcCCount = Math.max(0, revenueByMedicine.length - abcACount - abcBCount);
    const abcAnalysis = {
        a: { count: abcACount, revenuePct: 80 },
        b: { count: abcBCount, revenuePct: 15 },
        c: { count: abcCCount, revenuePct: 5 },
        totalProducts: revenueByMedicine.length,
    };
    // --- Per-medicine stock coverage (top 5 shortest) ---
    const medicineUnitsSold: Record<string, number> = {};
    Object.entries(bestSellingAgg).forEach(([id, entry]) => {
        medicineUnitsSold[id] = entry.sold;
    });
    const stockAlerts = inventoryRows
        .map((row) => {
        const dailySold = (medicineUnitsSold[row.medicine.id] ?? 0) / Math.max(periodDays, 1);
        const coverageDays = dailySold > 0 ? row.stock / dailySold : row.stock > 0 ? Infinity : 0;
        return {
            id: row.medicine.id,
            name: row.medicine.name,
            stock: row.stock,
            dailySold,
            coverageDays: Number.isFinite(coverageDays) ? Math.round(coverageDays) : null,
            nearestExpiryDays: Number.isFinite(row.nearestExpiryDays) ? row.nearestExpiryDays : null,
            inventoryValue: row.inventoryValue,
        };
    })
        .filter((r) => r.coverageDays !== null && r.stock > 0)
        .sort((a, b) => (a.coverageDays ?? 999) - (b.coverageDays ?? 999))
        .slice(0, 8);
    // ===================================================================
    // FINANCIAL METRICS
    // ===================================================================
    // --- Net Profit (gross profit minus operating expenses) ---
    const periodNetProfit = periodGrossProfit - periodExpenses;
    const previousPeriodNetProfit = previousPeriodGrossProfit - previousPeriodExpenses;
    // --- Cash Flow (money actually collected minus money spent) ---
    const periodCashFlow = periodCollected - periodExpenses;
    const previousPeriodCashFlow = previousPeriodCollected - previousPeriodExpenses;
    // --- Daily Average Sales ---
    const dailyAvgSales = periodSales / Math.max(periodDays, 1);
    const previousDailyAvgSales = previousPeriodSales / Math.max(periodDays, 1);
    // --- Expense Ratio (operating expenses as % of revenue) ---
    const expenseRatio = periodSales > 0 ? (periodExpenses / periodSales) * 100 : 0;
    // --- Expense Breakdown by Category ---
    const expenseBreakdown = Object.entries(periodExpenseByCategory)
        .map(([category, amount]) => ({
        category,
        amount,
        pct: periodExpenses > 0 ? (amount / periodExpenses) * 100 : 0,
    }))
        .sort((a, b) => b.amount - a.amount);
    // --- Margin by Sales Mode ---
    const marginByMode = (['retail', 'wholesale', 'bulk'] as const).map((mode) => ({
        mode,
        revenue: periodModeRevenue[mode],
        cogs: periodModeCOGS[mode],
        grossProfit: periodModeRevenue[mode] - periodModeCOGS[mode],
        margin: periodModeRevenue[mode] > 0
            ? ((periodModeRevenue[mode] - periodModeCOGS[mode]) / periodModeRevenue[mode]) * 100
            : 0,
    }));
    // ===================================================================
    // CUSTOMER INTELLIGENCE
    // ===================================================================
    // --- Top Customers (period, by revenue) ---
    const topCustomers = Object.entries(periodCustomerRevenue)
        .map(([id, entry]) => ({
        id,
        name: entry.name,
        revenue: entry.revenue,
        invoiceCount: entry.invoiceCount,
        avgInvoice: entry.invoiceCount > 0 ? entry.revenue / entry.invoiceCount : 0,
        grossProfit: entry.revenue - entry.cogs,
    }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
    // --- Revenue Per Customer ---
    const revenuePerCustomer = periodCustomerIds.size > 0 ? periodSales / periodCustomerIds.size : 0;
    const previousRevenuePerCustomer = previousPeriodCustomerIds.size > 0
        ? previousPeriodSales / previousPeriodCustomerIds.size
        : 0;
    // ===================================================================
    // PAYMENT & RECEIVABLE HEALTH
    // ===================================================================
    // --- Invoice Payment Aging Buckets ---
    const agingBuckets = { current: 0, days30: 0, days60: 0, days90plus: 0 };
    activeInvoices.forEach((invoice) => {
        const remaining = safeNumber(invoice.remainingAmount);
        if (remaining <= 0)
            return;
        const dueDate = parseDate(invoice.dueDate ?? invoice.date);
        if (!dueDate)
            return;
        const overdueDays = diffInDays(dueDate, today);
        if (overdueDays <= 0)
            agingBuckets.current += remaining;
        else if (overdueDays <= 30)
            agingBuckets.days30 += remaining;
        else if (overdueDays <= 60)
            agingBuckets.days60 += remaining;
        else
            agingBuckets.days90plus += remaining;
    });
    return {
        activeMedicinesCount: activeMedicines.length,
        todaySales,
        todayCollected,
        todayExpenses,
        totalSystemCollected,
        totalSystemExpenses,
        todayInvoiceCount,
        inventoryValue,
        inventoryHealthScore,
        lowStockCount: lowStockItems.length,
        criticalLowStockCount: criticalLowStockItems.length,
        expiringSoonCount: expiringSoonItems.length,
        expiringImmediateCount: expiringImmediateItems.length,
        currentMonthSales,
        currentMonthExpenses,
        monthlyNet: currentMonthSales - currentMonthExpenses,
        salesGrowth: previousMonthSales > 0
            ? ((currentMonthSales - previousMonthSales) / previousMonthSales) * 100
            : currentMonthSales > 0
                ? 100
                : 0,
        openReceivables,
        customerReceivableBalance,
        overdueAmount,
        overdueRate,
        trend30,
        receivableAccounts,
        recentActivity,
        salesModeTotals,
        salesMixRows,
        prioritizedActions,
        trendDensity,
        guestUsage,
        periodSales,
        previousPeriodSales,
        periodExpenses,
        previousPeriodExpenses,
        periodNet: periodSales - periodExpenses,
        periodInvoiceCount,
        previousPeriodInvoiceCount,
        periodUnitsSold,
        previousPeriodUnitsSold,
        periodUniqueCustomers: periodCustomerIds.size,
        previousPeriodUniqueCustomers: previousPeriodCustomerIds.size,
        activeCustomerCount: activeCustomers.length,
        repeatCustomerRate,
        periodGrowth: previousPeriodSales > 0
            ? ((periodSales - previousPeriodSales) / previousPeriodSales) * 100
            : periodSales > 0
                ? 100
                : 0,
        bestSelling,
        dayActivity,
        customerSegments,
        periodCOGS,
        previousPeriodCOGS,
        periodGrossProfit,
        previousPeriodGrossProfit,
        periodGrossMargin,
        periodCollected,
        previousPeriodCollected,
        collectionRate,
        avgInvoiceValue,
        previousAvgInvoiceValue,
        // --- Inventory Intelligence ---
        totalStockUnits,
        inventoryTurnover,
        stockCoverageDays: Number.isFinite(stockCoverageDays) ? Math.round(stockCoverageDays) : null,
        expiryRiskValue30,
        expiryRiskValue90,
        alreadyExpiredValue,
        deadStockCount,
        deadStockValue,
        abcAnalysis,
        stockAlerts,
        // --- Financial Metrics ---
        periodNetProfit,
        previousPeriodNetProfit,
        periodCashFlow,
        previousPeriodCashFlow,
        dailyAvgSales,
        previousDailyAvgSales,
        expenseRatio,
        expenseBreakdown,
        marginByMode,
        // --- Customer Intelligence ---
        topCustomers,
        revenuePerCustomer,
        previousRevenuePerCustomer,
        // --- Payment & Receivable Health ---
        agingBuckets,
        isWorkspaceEmpty: activeMedicines.length === 0 &&
            activeInvoices.length === 0 &&
            activeCustomers.length === 0 &&
            activeExpenses.length === 0,
    };
};
