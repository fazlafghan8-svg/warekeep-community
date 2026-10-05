import type { AppSettings, AppUser, Currency, Customer, Expense, Invoice, Language, Medicine, Purchase, Supplier } from '@/types';
import { calculateInvoiceLineDiscount, calculateInvoiceLineTotal, calculateItemProfit } from '@/utils/calculations';
import { getMedicineTypeLabel, normalizePersianNumbers } from '@/utils/localization';
import { formatAppDate, formatAppDateTime } from '@/lib/formatters';
import { getInvoiceItemBaseQuantity } from '@/utils/unitConversion';
export type ReportPreset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'lastQuarter' | 'thisYear' | 'lastYear' | 'custom';
export type ReportTab = 'financial' | 'inventory' | 'customers' | 'employees';
export type ReportTone = 'positive' | 'negative' | 'warning' | 'info' | 'neutral';
export type ReportTrend = 'up' | 'down' | 'flat' | 'none';
export interface ReportFilters {
    preset: ReportPreset;
    startDate?: string;
    endDate?: string;
    query?: string;
    compareWithPrevious?: boolean;
    userId?: string;
    customerId?: string;
    productType?: string;
    manufacturer?: string;
    supplierId?: string;
    paymentStatus?: string;
    salesMode?: string;
    warehouse?: string;
    branch?: string;
}
export interface ReportOption {
    value: string;
    label: string;
    count?: number;
    disabled?: boolean;
}
export interface ReportFilterOptionSet {
    users: ReportOption[];
    customers: ReportOption[];
    productTypes: ReportOption[];
    manufacturers: ReportOption[];
    suppliers: ReportOption[];
    paymentStatuses: ReportOption[];
    salesModes: ReportOption[];
    warehouses: ReportOption[];
    branches: ReportOption[];
}
export interface AppliedFilterChip {
    key: string;
    label: string;
    value: string;
}
export interface ReportMetricDefinition {
    key: string;
    label: string;
    formula: string;
    description: string;
    source: string;
}
export interface ReportMetricCard {
    key: string;
    label: string;
    value: number;
    formattedValue: string;
    changePct: number | null;
    changeLabel: string;
    trend: ReportTrend;
    trendLabel: string;
    tone: ReportTone;
    formula: string;
    source: string;
    detailTableId: string;
    note?: string;
    displayTier?: 'overview' | 'advanced';
}
export interface ReportChartPoint {
    id: string;
    label: string;
    value: number;
    secondaryValue?: number;
    tertiaryValue?: number;
    tone?: ReportTone;
    note?: string;
}
export interface ReportChartSeries {
    id: string;
    title: string;
    description: string;
    kind: 'area' | 'bar' | 'stackedBar' | 'donut' | 'waterfall';
    data: ReportChartPoint[];
    emptyTitle: string;
    emptyDescription: string;
    suggestion?: string;
}
export interface ReportTableColumn {
    key: string;
    label: string;
    type?: 'text' | 'money' | 'number' | 'percent' | 'date' | 'status';
    align?: 'start' | 'center' | 'end';
}
export interface ReportTableRow {
    id: string;
    [key: string]: string | number | null | undefined;
}
export interface ReportTable {
    id: string;
    title: string;
    description: string;
    columns: ReportTableColumn[];
    rows: ReportTableRow[];
    emptyTitle: string;
    emptyDescription: string;
    cta?: {
        view: 'sales' | 'inventory' | 'customers' | 'expenses' | 'purchases';
        label: string;
    };
}
export interface ReportInsight {
    id: string;
    tone: ReportTone;
    title: string;
    description: string;
    actionLabel?: string;
    tab?: ReportTab;
    tableId?: string;
    priority: number;
    surface: 'overview' | 'advanced' | 'all';
}
export interface ReportSection {
    id: ReportTab;
    title: string;
    subtitle: string;
    navigationLabel: string;
    kpis: ReportMetricCard[];
    charts: ReportChartSeries[];
    tables: ReportTable[];
    primaryTableId: string;
    heroMetricKeys: string[];
    secondaryMetricKeys: string[];
    primaryChartId: string;
    secondaryTableIds: string[];
    notes: string[];
}
export interface ReportRange {
    preset: ReportPreset;
    startIso: string;
    endIso: string;
    previousStartIso: string;
    previousEndIso: string;
    label: string;
    previousLabel: string;
    granularity: 'day' | 'week' | 'month';
}
export interface ReportSummaryCard {
    key: string;
    label: string;
    value: string;
    tone: ReportTone;
}
export interface ReportOverview {
    primaryMetrics: ReportMetricCard[];
    topInsights: ReportInsight[];
    focusChart: ReportChartSeries;
    attentionTable: ReportTable;
}
export interface ReportBundle {
    reportId: string;
    language: Language;
    currencyCode: Currency;
    currencyLabel: string;
    dateTimeSettings?: AppSettings['dateTimeSettings'];
    title: string;
    subtitle: string;
    state: 'ready' | 'empty' | 'filteredOut';
    stateTitle: string;
    stateDescription: string;
    generatedAt: string;
    lastDataSync: string | null;
    range: ReportRange;
    appliedFilters: AppliedFilterChip[];
    options: ReportFilterOptionSet;
    formulas: ReportMetricDefinition[];
    summaryCards: ReportSummaryCard[];
    insights: ReportInsight[];
    overview: ReportOverview;
    sections: Record<ReportTab, ReportSection>;
    tablesById: Record<string, ReportTable>;
    metadata: {
        storeName: string;
        generatedBy: string;
        branchLabel: string;
        warehouseLabel: string;
        comparisonEnabled: boolean;
        currentInvoiceCount: number;
        allInvoiceCount: number;
    };
}
export interface BuildReportBundleArgs {
    invoices?: Invoice[];
    medicines?: Medicine[];
    customers?: Customer[];
    expenses?: Expense[];
    purchases?: Purchase[];
    suppliers?: Supplier[];
    settings?: AppSettings;
    activeAppUser?: AppUser | null;
    filters: ReportFilters;
    language?: Language;
    now?: Date;
}
type Translator = (key: keyof typeof REPORT_TEXT.english) => string;
interface NormalizedInvoiceItem {
    medicineId: string;
    medicineName: string;
    productType: string;
    manufacturer: string;
    supplierId: string;
    quantity: number;
    baseQuantity: number;
    unitPrice: number;
    revenueGross: number;
    netRevenue: number;
    cost: number;
    profit: number;
    marginPct: number;
}
interface NormalizedInvoice {
    id: string;
    invoiceNumber: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    userId: string;
    userName: string;
    dateIso: string;
    dueDateIso: string | null;
    grossSales: number;
    discount: number;
    returns: number;
    netSales: number;
    tax: number;
    finalAmount: number;
    collected: number;
    receivable: number;
    paymentStatus: string;
    salesMode: string;
    cogs: number;
    grossProfit: number;
    profitMargin: number;
    items: NormalizedInvoiceItem[];
}
interface PeriodFinancialMetrics {
    grossSales: number;
    netSales: number;
    discounts: number;
    returns: number;
    cogs: number;
    grossProfit: number;
    grossMargin: number;
    operatingExpenses: number;
    operatingProfit: number;
    netProfit: number;
    profitMargin: number;
    invoiceCount: number;
    averageInvoiceValue: number;
    collected: number;
    receivable: number;
    itemsSold: number;
}
interface InventorySnapshot {
    medicineId: string;
    medicineName: string;
    productType: string;
    manufacturer: string;
    supplierId: string;
    supplierName: string;
    stockQty: number;
    reorderPoint: number;
    stockValue: number;
    soldQtyCurrent: number;
    soldQtyPrevious: number;
    soldValueCurrent: number;
    cogsCurrent: number;
    purchaseValueCurrent: number;
    turnover: number;
    averageInventoryValue: number;
    expiredBatchCount: number;
    expiring30Count: number;
    expiring60Count: number;
    expiring90Count: number;
    marginPct: number;
    lastSoldAt: string | null;
}
const ALL_VALUE = 'all';
const MAIN_BRANCH = 'main';
const MAIN_WAREHOUSE = 'main-warehouse';
const REPORT_TEXT = {
    english: {
        title: 'Reports & Business Intelligence',
        subtitle: 'Managerial reporting, operational trends, export-ready analysis, and bilingual executive reporting.',
        today: 'Today',
        yesterday: 'Yesterday',
        thisWeek: 'This Week',
        lastWeek: 'Last Week',
        thisMonth: 'This Month',
        lastMonth: 'Last Month',
        thisQuarter: 'This Quarter',
        lastQuarter: 'Last Quarter',
        thisYear: 'This Year',
        lastYear: 'Last Year',
        customRange: 'Custom Range',
        allUsers: 'All salespeople',
        allCustomers: 'All customers',
        allProductTypes: 'All product types',
        allManufacturers: 'All brands',
        allSuppliers: 'All suppliers',
        allPaymentStatuses: 'All payment statuses',
        allSalesModes: 'All sales modes',
        allWarehouses: 'All warehouses',
        allBranches: 'All branches',
        singleBranch: 'Main branch',
        singleWarehouse: 'Main warehouse',
        comparisonDisabled: 'Comparison is off',
        comparisonPrevious: 'Compared with previous period',
        emptyTitle: 'No source data available',
        emptyDescription: 'Add sales, expenses, inventory movements, or customer activity to unlock reporting.',
        filteredTitle: 'No rows match the active filters',
        filteredDescription: 'Try clearing search or broadening the date range to see a fuller trend.',
        financial: 'Financial Performance',
        inventory: 'Product & Inventory Intelligence',
        customers: 'Customers',
        employees: 'Employees',
        salesAndMoney: 'Sales & Money',
        stockAndAlerts: 'Inventory & Alerts',
        customersAndDebts: 'Customers & Receivables',
        teamPerformance: 'Team Performance',
        executiveSummary: 'Executive Summary',
        formulaAppendix: 'Metric Definitions & Formulas',
        attentionRequired: 'Items that need attention',
        attentionArea: 'Area',
        attentionItem: 'Item',
        attentionReason: 'Reason',
        actionHint: 'Action',
        noUrgentItems: 'No urgent operational issue is visible in this range.',
        salesOverview: 'Sales',
        collectedOverview: 'Collected',
        receivableOverview: 'Open Receivables',
        inventoryAlertsOverview: 'Inventory Alerts',
        trendSales: 'Sales trend',
        trendCollected: 'Collection trend',
        trendReceivable: 'Receivable trend',
        higherThanPrevious: 'Higher than previous period',
        lowerThanPrevious: 'Lower than previous period',
        noChangeTrend: 'No change from previous period',
        firstSeenTrend: 'Recorded for the first time',
        dataQuality: 'Data Quality',
        topTransactions: 'Top transactions',
        receivables: 'Receivables detail',
        expenses: 'Operating expenses',
        reorderItems: 'Reorder candidates',
        expiryItems: 'Expiry watchlist',
        inventoryDetail: 'Inventory detail',
        customerSummary: 'Customer summary',
        customerAging: 'Receivable aging',
        customerQuality: 'Customer data quality',
        employeeSummary: 'Employee performance',
        employeeTransactions: 'Employee-linked transactions',
        grossSales: 'Gross Sales',
        netSales: 'Net Sales',
        discounts: 'Discounts',
        returns: 'Returns',
        cogs: 'COGS',
        grossProfit: 'Gross Profit',
        operatingExpenses: 'Operating Expenses',
        operatingProfit: 'Operating Profit',
        netProfit: 'Net Profit',
        profitMargin: 'Profit Margin',
        invoiceCount: 'Invoice Count',
        averageInvoice: 'Average Invoice Value',
        collected: 'Collected',
        receivable: 'Receivables',
        inventoryValue: 'Inventory Value',
        turnover: 'Inventory Turnover',
        stagnant: 'Stagnant Items',
        slowMoving: 'Slow Movers',
        fastMoving: 'Fast Movers',
        expired: 'Expired Items',
        expiring30: 'Near Expiry 30d',
        expiring60: 'Near Expiry 60d',
        expiring90: 'Near Expiry 90d',
        reorderNeeded: 'Reorder Needed',
        lowMargin: 'Low Margin SKUs',
        highMargin: 'High Margin SKUs',
        activeCustomers: 'Active Customers',
        newCustomers: 'New Customers',
        inactiveCustomers: 'Inactive Customers',
        returnRate: 'Customer Return Rate',
        openInvoices: 'Open Invoices',
        averagePurchase: 'Average Purchase',
        overCreditLimit: 'Over Credit Limit',
        activeEmployees: 'Active Employees',
        totalEmployeeSales: 'Total Sales',
        totalEmployeeProfit: 'Generated Profit',
        employeeAvgInvoice: 'Average Invoice',
        employeeDiscounts: 'Discount Granted',
        employeeCollected: 'Collected',
        topSellerShare: 'Top Seller Share',
        salesTrend: 'Sales Trend',
        paymentMix: 'Payment Mix',
        categoryMix: 'Product Category Mix',
        userMix: 'Sales by Seller',
        profitBreakdown: 'Profit Breakdown',
        expenseBreakdown: 'Expense Breakdown',
        topProducts: 'Best-Selling Products',
        bottomProducts: 'Slowest-Selling Products',
        stockComposition: 'Inventory by Brand',
        expiryRisk: 'Expiry Exposure',
        agingBuckets: 'Aging Buckets',
        topCustomersBySales: 'Top Customers by Sales',
        topCustomersByProfit: 'Top Customers by Profit',
        debtors: 'Top Debtors',
        employeeRanking: 'Employee Ranking',
        employeeProfitChart: 'Profit by Employee',
        qualityIssues: 'Quality Issues',
        searchBiggerRange: 'Expand the range to reveal a meaningful trend.',
        noExpenseData: 'No expenses were recorded in this period. Register expenses to improve profit visibility.',
        noTrendData: 'Not enough points to draw a reliable trend yet.',
        noProductSales: 'Product-level sales are too limited for a stable ranking.',
        dataSourceInvoices: 'Source: sales invoices',
        dataSourceExpenses: 'Source: expense register',
        dataSourceInventory: 'Source: live stock snapshot and purchase receipts',
        dataSourceCustomers: 'Source: customer ledger and invoice balances',
        dataSourceEmployees: 'Source: invoice owner / salesperson field',
        generatedBySystem: 'System',
        registerExpense: 'Register expense',
        openSales: 'Open sales',
        openInventory: 'Open inventory',
        openCustomers: 'Open customers',
        openPurchases: 'Open purchases',
        phoneInvalid: 'Invalid phone format',
        nameSuspicious: 'Suspicious customer name',
        addressMissing: 'Address missing',
        currentRange: 'Current Range',
        previousRange: 'Previous Range',
        generatedAt: 'Generated At',
        lastUpdated: 'Last Updated',
        filtersApplied: 'Filters Applied',
        confidential: 'Confidential / Internal Use Only',
        reportId: 'Report ID',
        store: 'Store',
        branch: 'Branch',
        warehouse: 'Warehouse',
        salesperson: 'Salesperson',
        customer: 'Customer',
        productType: 'Product Type',
        brand: 'Brand',
        supplier: 'Supplier',
        payment: 'Payment',
        salesMode: 'Sales Mode',
        search: 'Search',
        current: 'Current',
        previous: 'Previous',
        stable: 'Stable',
        newTrend: 'New',
        dataGapNote: 'Returns and multi-branch segmentation are not tracked in the current dataset, so those metrics remain zero or single-branch.',
        agingUsesDueDate: 'Aging buckets use invoice due date when available, otherwise invoice date.',
        qualityUsesValidation: 'Phone, name, and address quality checks are rule-based.',
        mainBranchLabel: 'Main branch only',
        mainWarehouseLabel: 'Main warehouse only',
        employeeRole: 'Role',
        status: 'Status',
        date: 'Date',
        amount: 'Amount',
        seller: 'Seller',
        invoice: 'Invoice',
        customerName: 'Customer',
        phone: 'Phone',
        outstanding: 'Outstanding',
        visits: 'Visits',
        lastPurchase: 'Last Purchase',
        lastPayment: 'Last Payment',
        margin: 'Margin',
        qty: 'Qty',
        stock: 'Stock',
        reorderPoint: 'Reorder Point',
        turnoverShort: 'Turnover',
        expiryLabel: 'Nearest Expiry',
        note: 'Note',
        revenue: 'Revenue',
        profit: 'Profit',
        collectedAmount: 'Collected',
        averageInvoiceShort: 'Avg. Invoice',
        discountShort: 'Discount',
        roleAdmin: 'Admin',
        roleStaff: 'Staff',
        paid: 'Paid',
        partial: 'Partial',
        credit: 'Credit',
        cash: 'Cash',
        overdue: 'Overdue'
    },
    dari: {
        title: 'راپورها و احصائیه',
        subtitle: 'راپور مدیریتی، تحلیل عملیاتی، خروجی حرفه‌ای، و گزارش دوزبانه برای تصمیم‌گیری دقیق.',
        today: 'امروز',
        yesterday: 'دیروز',
        thisWeek: 'هفته جاری',
        lastWeek: 'هفته قبل',
        thisMonth: 'ماه جاری',
        lastMonth: 'ماه قبل',
        thisQuarter: 'ربع جاری',
        lastQuarter: 'ربع قبل',
        thisYear: 'سال جاری',
        lastYear: 'سال قبل',
        customRange: 'بازه دلخواه',
        allUsers: 'همه فروشنده‌ها',
        allCustomers: 'همه مشتریان',
        allProductTypes: 'همه نوع‌های کالا',
        allManufacturers: 'همه برندها',
        allSuppliers: 'همه تأمین‌کننده‌ها',
        allPaymentStatuses: 'همه وضعیت‌های پرداخت',
        allSalesModes: 'همه نوع‌های فروش',
        allWarehouses: 'همه انبارها',
        allBranches: 'همه شعبه‌ها',
        singleBranch: 'شعبه اصلی',
        singleWarehouse: 'انبار اصلی',
        comparisonDisabled: 'مقایسه غیرفعال است',
        comparisonPrevious: 'مقایسه با دوره قبل',
        emptyTitle: 'داده منبع برای راپور موجود نیست',
        emptyDescription: 'برای فعال شدن گزارش‌ها، فروش، مصرف، حرکت انبار یا فعالیت مشتری ثبت کنید.',
        filteredTitle: 'هیچ رکوردی با فیلترهای فعلی هم‌خوانی ندارد',
        filteredDescription: 'جستجو را پاک کنید یا بازه زمانی را وسیع‌تر سازید تا روند واضح‌تر دیده شود.',
        financial: 'عملکرد مالی',
        inventory: 'تحلیل کالا و انبار',
        customers: 'مشتریان',
        employees: 'کارمندان',
        salesAndMoney: 'فروش و پول',
        stockAndAlerts: 'موجودی و هشدارها',
        customersAndDebts: 'مشتریان و مطالبات',
        teamPerformance: 'عملکرد تیم',
        executiveSummary: 'خلاصه مدیریتی',
        formulaAppendix: 'تعریف شاخص‌ها و فورمول‌ها',
        attentionRequired: 'موارد نیازمند توجه',
        attentionArea: 'بخش',
        attentionItem: 'مورد',
        attentionReason: 'علت',
        actionHint: 'اقدام',
        noUrgentItems: 'در این بازه زمانی مورد عاجل عملیاتی دیده نمی‌شود.',
        salesOverview: 'فروش',
        collectedOverview: 'وصول‌شده',
        receivableOverview: 'مطالبات باز',
        inventoryAlertsOverview: 'هشدارهای موجودی',
        trendSales: 'روند فروش',
        trendCollected: 'روند وصول',
        trendReceivable: 'روند مطالبات',
        higherThanPrevious: 'بیشتر از دوره قبل',
        lowerThanPrevious: 'کمتر از دوره قبل',
        noChangeTrend: 'بدون تغییر',
        firstSeenTrend: 'برای نخستین بار ثبت شده',
        dataQuality: 'کیفیت داده',
        topTransactions: 'معاملات برتر',
        receivables: 'جزئیات مطالبات',
        expenses: 'مصارف عملیاتی',
        reorderItems: 'اقلام نیازمند سفارش',
        expiryItems: 'فهرست نزدیک به انقضا',
        inventoryDetail: 'جزئیات انبار',
        customerSummary: 'خلاصه مشتریان',
        customerAging: 'سن مطالبات',
        customerQuality: 'کیفیت داده مشتریان',
        employeeSummary: 'عملکرد کارمندان',
        employeeTransactions: 'تراکنش‌های وابسته به کارمند',
        grossSales: 'فروش ناخالص',
        netSales: 'فروش خالص',
        discounts: 'تخفیف‌ها',
        returns: 'مرجوعی‌ها',
        cogs: 'بهای تمام‌شده',
        grossProfit: 'مفاد ناخالص',
        operatingExpenses: 'مصارف عملیاتی',
        operatingProfit: 'مفاد عملیاتی',
        netProfit: 'مفاد خالص',
        profitMargin: 'حاشیهٔ مفاد',
        invoiceCount: 'تعداد فاکتورها',
        averageInvoice: 'میانگین ارزش فاکتور',
        collected: 'وصول‌شده',
        receivable: 'مطالبات',
        inventoryValue: 'ارزش موجودی',
        turnover: 'گردش موجودی',
        stagnant: 'کالاهای راکد',
        slowMoving: 'کالاهای کندفروش',
        fastMoving: 'کالاهای تندفروش',
        expired: 'کالاهای منقضی‌شده',
        expiring30: 'نزدیک به انقضا ۳۰ روز',
        expiring60: 'نزدیک به انقضا ۶۰ روز',
        expiring90: 'نزدیک به انقضا ۹۰ روز',
        reorderNeeded: 'نیازمند سفارش',
        lowMargin: 'حاشیهٔ مفاد پایین',
        highMargin: 'حاشیهٔ مفاد بالا',
        activeCustomers: 'مشتریان فعال',
        newCustomers: 'مشتریان جدید',
        inactiveCustomers: 'مشتریان غیرفعال',
        returnRate: 'نرخ بازگشت مشتری',
        openInvoices: 'فاکتورهای باز',
        averagePurchase: 'میانگین خرید',
        overCreditLimit: 'عبور از حد اعتباری',
        activeEmployees: 'کارمندان فعال',
        totalEmployeeSales: 'مجموع فروش',
        totalEmployeeProfit: 'مفاد ایجادشده',
        employeeAvgInvoice: 'میانگین فاکتور',
        employeeDiscounts: 'تخفیف اعطاشده',
        employeeCollected: 'وصول مطالبات',
        topSellerShare: 'سهم فروشنده اول',
        salesTrend: 'روند فروش',
        paymentMix: 'ترکیب پرداخت',
        categoryMix: 'ترکیب دسته کالا',
        userMix: 'فروش بر اساس کاربر',
        profitBreakdown: 'شکست مفاد',
        expenseBreakdown: 'شکست مصارف',
        topProducts: 'محصولات پرفروش',
        bottomProducts: 'محصولات کم‌فروش',
        stockComposition: 'ترکیب موجودی بر اساس برند',
        expiryRisk: 'ریسک انقضا',
        agingBuckets: 'باکت‌های سنی',
        topCustomersBySales: 'مشتریان برتر بر اساس فروش',
        topCustomersByProfit: 'مشتریان برتر بر اساس مفاد',
        debtors: 'بدهکارترین مشتریان',
        employeeRanking: 'رتبه‌بندی کارمندان',
        employeeProfitChart: 'مفاد بر اساس کارمند',
        qualityIssues: 'ایرادهای کیفیت داده',
        searchBiggerRange: 'برای دیدن روند معتبر، بازه زمانی را بزرگ‌تر انتخاب کنید.',
        noExpenseData: 'در این بازه مصرفی ثبت نشده است. برای شفاف شدن مفاد، مصارف را ثبت کنید.',
        noTrendData: 'برای رسم روند معتبر هنوز نقطه کافی وجود ندارد.',
        noProductSales: 'فروش کالایی برای رتبه‌بندی پایدار هنوز کافی نیست.',
        dataSourceInvoices: 'منبع: فاکتورهای فروش',
        dataSourceExpenses: 'منبع: ثبت مصارف',
        dataSourceInventory: 'منبع: اسنپ‌شات موجودی و رسیدهای خرید',
        dataSourceCustomers: 'منبع: لجر مشتری و مانده فاکتورها',
        dataSourceEmployees: 'منبع: کاربر ثبت‌کننده یا فروشنده فاکتور',
        generatedBySystem: 'سیستم',
        registerExpense: 'ثبت مصرف',
        openSales: 'بازکردن فروش',
        openInventory: 'بازکردن انبار',
        openCustomers: 'بازکردن مشتریان',
        openPurchases: 'بازکردن خریدها',
        phoneInvalid: 'شماره تماس نامعتبر',
        nameSuspicious: 'نام مشتری مشکوک',
        addressMissing: 'آدرس ثبت نشده',
        currentRange: 'بازه فعلی',
        previousRange: 'بازه قبلی',
        generatedAt: 'زمان تولید',
        lastUpdated: 'آخرین به‌روزرسانی',
        filtersApplied: 'فیلترهای اعمال‌شده',
        confidential: 'محرمانه / فقط برای استفاده داخلی',
        reportId: 'شناسه راپور',
        store: 'فروشگاه',
        branch: 'شعبه',
        warehouse: 'انبار',
        salesperson: 'فروشنده',
        customer: 'مشتری',
        productType: 'نوع کالا',
        brand: 'برند',
        supplier: 'تأمین‌کننده',
        payment: 'پرداخت',
        salesMode: 'نوع فروش',
        search: 'جستجو',
        current: 'فعلی',
        previous: 'قبلی',
        stable: 'ثابت',
        newTrend: 'جدید',
        dataGapNote: 'مرجوعی و تفکیک چندشعبه‌ای در داده فعلی ثبت نشده است؛ بنابراین این شاخص‌ها صفر یا تک‌شعبه‌ای هستند.',
        agingUsesDueDate: 'باکت‌بندی سن مطالبات بر اساس سررسید فاکتور و در نبود آن بر اساس تاریخ فاکتور انجام می‌شود.',
        qualityUsesValidation: 'کنترل کیفیت شماره، نام و آدرس به‌صورت rule-based انجام می‌شود.',
        mainBranchLabel: 'فقط شعبه اصلی',
        mainWarehouseLabel: 'فقط انبار اصلی',
        employeeRole: 'نقش',
        status: 'وضعیت',
        date: 'تاریخ',
        amount: 'مبلغ',
        seller: 'فروشنده',
        invoice: 'فاکتور',
        customerName: 'مشتری',
        phone: 'شماره تماس',
        outstanding: 'مانده',
        visits: 'مراجعه',
        lastPurchase: 'آخرین خرید',
        lastPayment: 'آخرین پرداخت',
        margin: 'حاشیه',
        qty: 'تعداد',
        stock: 'موجودی',
        reorderPoint: 'نقطه سفارش',
        turnoverShort: 'گردش',
        expiryLabel: 'نزدیک‌ترین انقضا',
        note: 'یادداشت',
        revenue: 'فروش',
        profit: 'مفاد',
        collectedAmount: 'وصول‌شده',
        averageInvoiceShort: 'میانگین فاکتور',
        discountShort: 'تخفیف',
        roleAdmin: 'ادمین',
        roleStaff: 'کارمند',
        paid: 'پرداخت‌شده',
        partial: 'قسمی',
        credit: 'نسیه',
        cash: 'نقد',
        overdue: 'سررسید گذشته'
    }
} as const;
const createTranslator = (language: Language): Translator => {
    const dictionary = REPORT_TEXT[language] || REPORT_TEXT.dari;
    return (key) => dictionary[key] || REPORT_TEXT.english[key];
};
const safeArray = <T,>(value: T[] | undefined | null): T[] => (Array.isArray(value) ? value : []);
const toSafeNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const startOfDay = (date: Date) => {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
};
const endOfDay = (date: Date) => {
    const next = new Date(date);
    next.setHours(23, 59, 59, 999);
    return next;
};
const addDays = (date: Date, amount: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
};
const startOfWeek = (date: Date) => {
    const next = startOfDay(date);
    const day = next.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    return addDays(next, diff);
};
const endOfWeek = (date: Date) => endOfDay(addDays(startOfWeek(date), 6));
const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date: Date) => endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
const startOfQuarter = (date: Date) => new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
const endOfQuarter = (date: Date) => endOfDay(new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3 + 3, 0));
const startOfYear = (date: Date) => new Date(date.getFullYear(), 0, 1);
const endOfYear = (date: Date) => endOfDay(new Date(date.getFullYear(), 11, 31));
const toIsoDate = (date: Date) => date.toISOString();
const toInputDate = (date: Date) => date.toISOString().slice(0, 10);
const isWithinRange = (dateIso: string, start: Date, end: Date) => {
    const value = new Date(dateIso);
    if (Number.isNaN(value.getTime()))
        return false;
    return value >= start && value <= end;
};
const getLocale = (language: Language) => (language === 'english' ? 'en-US' : 'fa-AF');
const formatNumber = (value: number, language: Language, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(getLocale(language), { maximumFractionDigits: 0, ...options }).format(toSafeNumber(value));
const getCurrencyLabel = (currencyCode: Currency, language: Language) => {
    if (currencyCode === 'AFN') {
        return language === 'english' ? 'AFN' : 'افغانی';
    }
    return currencyCode;
};
export const formatReportMoney = (value: number, language: Language, currencyCode: Currency) => {
    const formatted = formatNumber(value, language, {
        minimumFractionDigits: 0,
        maximumFractionDigits: currencyCode === 'IRR' ? 0 : 2
    });
    const label = getCurrencyLabel(currencyCode, language);
    return language === 'english' ? `${label} ${formatted}` : `${formatted} ${label}`;
};
export const formatReportPercent = (value: number, language: Language, digits = 1) => {
    const safe = Number.isFinite(value) ? value : 0;
    return new Intl.NumberFormat(getLocale(language), {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    }).format(safe) + '%';
};
export const formatReportDate = (value: string | null | undefined, language: Language, settings?: Pick<AppSettings, 'dateTimeSettings'> | null) => {
    if (!value)
        return '-';
    return formatAppDate(value, { language, dateTimeSettings: settings?.dateTimeSettings } as AppSettings, 'reports');
};
const formatDateTime = (value: string, language: Language, settings?: Pick<AppSettings, 'dateTimeSettings'> | null) => {
    return formatAppDateTime(value, { language, dateTimeSettings: settings?.dateTimeSettings } as AppSettings, 'reports');
};
const normalizeSearch = (value: string | undefined) => normalizePersianNumbers((value || '').trim().toLowerCase());
const mapPaymentStatus = (paymentStatus: string | undefined, t: Translator) => {
    const normalized = (paymentStatus || '').toLowerCase();
    if (normalized === 'paid' || normalized === 'cash')
        return { key: 'paid', label: normalized === 'cash' ? t('cash') : t('paid') };
    if (normalized === 'card')
        return { key: 'card', label: 'Card' };
    if (normalized === 'mixed')
        return { key: 'mixed', label: 'Mixed' };
    if (normalized === 'partial')
        return { key: 'partial', label: t('partial') };
    return { key: 'credit', label: t('credit') };
};
const getSalesModeLabel = (salesMode: string | undefined, language: Language) => {
    const normalized = (salesMode || 'retail').toLowerCase();
    if (language === 'english') {
        if (normalized === 'wholesale')
            return 'Wholesale';
        if (normalized === 'bulk')
            return 'Bulk';
        return 'Retail';
    }
    if (normalized === 'wholesale')
        return 'عمده';
    if (normalized === 'bulk')
        return 'کارتنی';
    return 'پرچون';
};
const getUserName = (userId: string | undefined, users: AppUser[], language: Language) => {
    const normalized = userId || 'admin';
    const found = users.find((user) => user.id === normalized);
    if (found)
        return found.name;
    return language === 'english' ? 'System Admin' : 'مدیر سیستم';
};
const getCustomerPhoneQuality = (phone: string) => {
    const digits = (phone || '').replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 14;
};
const getCustomerNameQuality = (name: string) => {
    const clean = (name || '').trim();
    return clean.length >= 3 && !/\d/.test(clean);
};
const sortByValueDesc = <T extends {
    value: number;
}>(rows: T[]) => [...rows].sort((a, b) => b.value - a.value);
const addToGroupedValue = (target: Record<string, {
    label: string;
    value: number;
}>, key: string, label: string, amount: number) => {
    if (!target[key]) {
        target[key] = { label, value: 0 };
    }
    target[key].value += amount;
};
const createMetricDefinitions = (t: Translator): ReportMetricDefinition[] => [
    {
        key: 'grossSales',
        label: t('grossSales'),
        formula: 'Gross Sales = sum(invoice.total)',
        description: 'Sales before discount, returns, and other deductions.',
        source: t('dataSourceInvoices')
    },
    {
        key: 'netSales',
        label: t('netSales'),
        formula: 'Net Sales = Gross Sales - Discounts - Returns',
        description: 'Commercial sales after direct deductions.',
        source: t('dataSourceInvoices')
    },
    {
        key: 'cogs',
        label: t('cogs'),
        formula: 'COGS = sum(item cost price × quantity sold)',
        description: 'Cost of goods sold derived from sold batches and item cost price.',
        source: t('dataSourceInventory')
    },
    {
        key: 'grossProfit',
        label: t('grossProfit'),
        formula: 'Gross Profit = Net Sales - COGS',
        description: 'Profit before operating expenses.',
        source: t('dataSourceInvoices')
    },
    {
        key: 'operatingProfit',
        label: t('operatingProfit'),
        formula: 'Operating Profit = Gross Profit - Operating Expenses',
        description: 'Operating result after direct expenses.',
        source: `${t('dataSourceInvoices')} + ${t('dataSourceExpenses')}`
    },
    {
        key: 'netProfit',
        label: t('netProfit'),
        formula: 'Net Profit = Gross Profit - Operating Expenses - Stock Loss expenses - Payroll expenses',
        description: 'Final profit after operating costs recorded in the expense ledger, including stock loss and payroll expense categories.',
        source: `${t('dataSourceInvoices')} + ${t('dataSourceExpenses')}`
    },
    {
        key: 'profitMargin',
        label: t('profitMargin'),
        formula: 'Profit Margin = Net Profit / Net Sales',
        description: 'Measures how much profit remains from each unit of net sales.',
        source: t('dataSourceInvoices')
    },
    {
        key: 'averageInvoiceValue',
        label: t('averageInvoice'),
        formula: 'Average Invoice Value = Net Sales / Invoice Count',
        description: 'Average commercial value per invoice.',
        source: t('dataSourceInvoices')
    },
    {
        key: 'turnover',
        label: t('turnover'),
        formula: 'Inventory Turnover = COGS / Average Inventory Value',
        description: 'Average inventory value is estimated from opening and closing stock value in the selected range.',
        source: t('dataSourceInventory')
    },
    {
        key: 'reorderNeeded',
        label: t('reorderNeeded'),
        formula: 'Reorder Needed = Current Stock <= Reorder Point',
        description: 'Reorder point uses the medicine low stock threshold.',
        source: t('dataSourceInventory')
    },
    {
        key: 'inventoryAlerts',
        label: t('inventoryAlertsOverview'),
        formula: 'Inventory Alerts = Reorder Needed + Near Expiry 30d + Expired Items',
        description: 'Highlights stock that needs action soon or immediately.',
        source: t('dataSourceInventory')
    },
    {
        key: 'customerAging',
        label: t('agingBuckets'),
        formula: 'Unpaid invoices grouped by due date age bucket',
        description: t('agingUsesDueDate'),
        source: t('dataSourceCustomers')
    },
    {
        key: 'employeePerformance',
        label: t('employeeSummary'),
        formula: 'Employee Performance = sales, profit, invoice count, discount, and collection by invoice owner',
        description: 'Employee attribution follows the invoice salesperson / owner field.',
        source: t('dataSourceEmployees')
    }
];
const findFormula = (definitions: ReportMetricDefinition[], key: string) => definitions.find((item) => item.key === key) || definitions[0];
const getChangePct = (current: number, previous: number) => {
    if (!Number.isFinite(current) || !Number.isFinite(previous))
        return null;
    if (previous === 0 && current === 0)
        return 0;
    if (previous === 0 && current !== 0)
        return 100;
    return ((current - previous) / Math.abs(previous)) * 100;
};
const getTrend = (changePct: number | null): ReportTrend => {
    if (changePct === null)
        return 'none';
    if (Math.abs(changePct) < 0.1)
        return 'flat';
    return changePct > 0 ? 'up' : 'down';
};
const getTrendLabel = (language: Language, trend: ReportTrend, changePct: number | null, current: number, previous: number) => {
    if (trend === 'none')
        return REPORT_TEXT[language].comparisonDisabled;
    if (previous === 0 && current !== 0)
        return REPORT_TEXT[language].firstSeenTrend;
    if (trend === 'up')
        return REPORT_TEXT[language].higherThanPrevious;
    if (trend === 'down')
        return REPORT_TEXT[language].lowerThanPrevious;
    if (changePct === 0 || trend === 'flat')
        return REPORT_TEXT[language].noChangeTrend;
    return REPORT_TEXT[language].comparisonDisabled;
};
const getToneForGoal = (goal: 'higher' | 'lower' | 'neutral', changePct: number | null): ReportTone => {
    if (goal === 'neutral' || changePct === null)
        return 'info';
    if (Math.abs(changePct) < 0.1)
        return 'neutral';
    const positive = goal === 'higher' ? changePct > 0 : changePct < 0;
    return positive ? 'positive' : 'negative';
};
const createMetricCard = (args: {
    key: string;
    label: string;
    current: number;
    previous: number;
    language: Language;
    currencyCode: Currency;
    detailTableId: string;
    definitions: ReportMetricDefinition[];
    format?: 'money' | 'number' | 'percent';
    goal?: 'higher' | 'lower' | 'neutral';
    note?: string;
    displayTier?: 'overview' | 'advanced';
}) => {
    const changePct = getChangePct(args.current, args.previous);
    const trend = getTrend(changePct);
    const tone = getToneForGoal(args.goal || 'higher', changePct);
    const formula = findFormula(args.definitions, args.key);
    const formattedValue = args.format === 'number'
        ? formatNumber(args.current, args.language)
        : args.format === 'percent'
            ? formatReportPercent(args.current, args.language)
            : formatReportMoney(args.current, args.language, args.currencyCode);
    const changeLabel = trend === 'none'
        ? REPORT_TEXT[args.language].comparisonDisabled
        : changePct === 100 && args.previous === 0 && args.current !== 0
            ? REPORT_TEXT[args.language].newTrend
            : `${changePct! >= 0 ? '+' : ''}${formatReportPercent(changePct || 0, args.language)}`;
    const trendLabel = getTrendLabel(args.language, trend, changePct, args.current, args.previous);
    return {
        key: args.key,
        label: args.label,
        value: args.current,
        formattedValue,
        changePct,
        changeLabel,
        trend,
        trendLabel,
        tone,
        formula: formula.formula,
        source: formula.source,
        detailTableId: args.detailTableId,
        note: args.note,
        displayTier: args.displayTier
    } satisfies ReportMetricCard;
};
const createAllOption = (label: string): ReportOption => ({ value: ALL_VALUE, label });
const buildGroupedOptions = (values: {
    key: string;
    label: string;
}[], allLabel: string) => {
    const grouped = values.reduce<Record<string, ReportOption>>((acc, item) => {
        if (!item.key || acc[item.key])
            return acc;
        acc[item.key] = { value: item.key, label: item.label };
        return acc;
    }, {});
    return [
        createAllOption(allLabel),
        ...Object.values(grouped).sort((a, b) => a.label.localeCompare(b.label))
    ];
};
const applyOrAll = (filterValue: string | undefined, candidate: string) => !filterValue || filterValue === ALL_VALUE || filterValue === candidate;
const getDaysSince = (dateIso: string | null, now: Date) => {
    if (!dateIso)
        return Number.POSITIVE_INFINITY;
    const date = new Date(dateIso);
    if (Number.isNaN(date.getTime()))
        return Number.POSITIVE_INFINITY;
    return Math.floor((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86400000);
};
const buildDateRange = (filters: ReportFilters, language: Language, now: Date, t: Translator, settings?: Pick<AppSettings, 'dateTimeSettings'> | null): ReportRange => {
    let start = startOfMonth(now);
    let end = endOfDay(now);
    switch (filters.preset) {
        case 'today':
            start = startOfDay(now);
            end = endOfDay(now);
            break;
        case 'yesterday':
            start = startOfDay(addDays(now, -1));
            end = endOfDay(addDays(now, -1));
            break;
        case 'thisWeek':
            start = startOfWeek(now);
            end = endOfDay(now);
            break;
        case 'lastWeek': {
            const anchor = addDays(startOfWeek(now), -1);
            start = startOfWeek(anchor);
            end = endOfWeek(anchor);
            break;
        }
        case 'thisMonth':
            start = startOfMonth(now);
            end = endOfDay(now);
            break;
        case 'lastMonth': {
            const anchor = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            start = startOfMonth(anchor);
            end = endOfMonth(anchor);
            break;
        }
        case 'thisQuarter':
            start = startOfQuarter(now);
            end = endOfDay(now);
            break;
        case 'lastQuarter': {
            const anchor = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            start = startOfQuarter(anchor);
            end = endOfQuarter(anchor);
            break;
        }
        case 'thisYear':
            start = startOfYear(now);
            end = endOfDay(now);
            break;
        case 'lastYear': {
            const anchor = new Date(now.getFullYear() - 1, 0, 1);
            start = startOfYear(anchor);
            end = endOfYear(anchor);
            break;
        }
        case 'custom': {
            if (!filters.startDate || !filters.endDate) {
                throw new Error(language === 'english' ? 'Custom range requires start and end dates.' : 'بازه دلخواه به تاریخ شروع و ختم نیاز دارد.');
            }
            start = startOfDay(new Date(filters.startDate));
            end = endOfDay(new Date(filters.endDate));
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
                throw new Error(language === 'english' ? 'Custom range is invalid.' : 'بازه دلخواه نامعتبر است.');
            }
            break;
        }
        default:
            break;
    }
    const rangeMs = end.getTime() - start.getTime();
    const rangeDays = Math.max(1, Math.ceil(rangeMs / 86400000) + 1);
    const previousEnd = endOfDay(addDays(start, -1));
    const previousStart = startOfDay(addDays(previousEnd, -rangeDays + 1));
    const formatRangeLabel = (from: Date, to: Date) => {
        const fromLabel = formatReportDate(from.toISOString(), language, settings);
        const toLabel = formatReportDate(to.toISOString(), language, settings);
        return `${fromLabel} ${language === 'english' ? 'to' : 'تا'} ${toLabel}`;
    };
    const labelByPreset: Record<ReportPreset, string> = {
        today: t('today'),
        yesterday: t('yesterday'),
        thisWeek: t('thisWeek'),
        lastWeek: t('lastWeek'),
        thisMonth: t('thisMonth'),
        lastMonth: t('lastMonth'),
        thisQuarter: t('thisQuarter'),
        lastQuarter: t('lastQuarter'),
        thisYear: t('thisYear'),
        lastYear: t('lastYear'),
        custom: t('customRange')
    };
    const granularity = rangeDays <= 45 ? 'day' : rangeDays <= 180 ? 'week' : 'month';
    return {
        preset: filters.preset,
        startIso: toIsoDate(start),
        endIso: toIsoDate(end),
        previousStartIso: toIsoDate(previousStart),
        previousEndIso: toIsoDate(previousEnd),
        label: `${labelByPreset[filters.preset]} · ${formatRangeLabel(start, end)}`,
        previousLabel: formatRangeLabel(previousStart, previousEnd),
        granularity
    };
};
const buildNormalizedInvoices = (args: {
    invoices: Invoice[];
    medicines: Medicine[];
    customers: Customer[];
    users: AppUser[];
    language: Language;
}) => {
    const medicineById = new Map(args.medicines.filter((item) => !item.isDeleted).map((item) => [item.id, item]));
    const customerById = new Map(args.customers.filter((item) => !item.isDeleted).map((item) => [item.id, item]));
    const translator = createTranslator(args.language);
    return args.invoices
        .filter((invoice) => !invoice.isDeleted)
        .map<NormalizedInvoice>((invoice) => {
        const customer = customerById.get(invoice.customerId);
        const customerName = customer?.name || (args.language === 'english' ? 'Walk-in customer' : 'مشتری متفرقه');
        const customerPhone = customer?.phone || '';
        const items = safeArray(invoice.items).map<NormalizedInvoiceItem>((item) => {
            const medicine = medicineById.get(item.medicineId);
            const batch = medicine?.batches?.find((entry) => entry.id === item.batchId) || medicine?.batches?.[0];
            const productType = args.language === 'english' ? (medicine?.type || 'Other') : getMedicineTypeLabel(medicine?.type || 'Other');
            const manufacturer = medicine?.manufacturer || (args.language === 'english' ? 'Unknown' : 'نامشخص');
            const supplierId = batch?.supplierId || '';
            const quantity = toSafeNumber(item.quantity);
            const baseQuantity = getInvoiceItemBaseQuantity(item);
            const unitPrice = toSafeNumber(item.price);
            const revenueGross = quantity * unitPrice;
            const invoiceCurrency = invoice.currency || 'AFN';
            const lineDiscount = calculateInvoiceLineDiscount(item, invoiceCurrency);
            const netRevenue = calculateInvoiceLineTotal(item, invoiceCurrency);
            const cost = Math.max(0, toSafeNumber(item.costPrice || batch?.purchasePrice)) * baseQuantity;
            const profit = calculateItemProfit(item, args.medicines, invoiceCurrency);
            const marginPct = netRevenue > 0 ? (profit / netRevenue) * 100 : 0;
            return {
                medicineId: item.medicineId,
                medicineName: medicine?.name || (args.language === 'english' ? 'Unknown item' : 'قلم نامشخص'),
                productType,
                manufacturer,
                supplierId,
                quantity,
                baseQuantity,
                unitPrice,
                revenueGross,
                netRevenue,
                cost,
                profit,
                marginPct
            };
        });
        const grossSales = toSafeNumber(invoice.total);
        const computedLineDiscount = items.reduce((sum, item) => sum + Math.max(0, item.revenueGross - item.netRevenue), 0);
        const lineDiscount = clamp(toSafeNumber(invoice.lineDiscountTotal ?? computedLineDiscount), 0, grossSales);
        const discount = clamp(toSafeNumber(invoice.discount) + lineDiscount, 0, grossSales);
        const activeReturns = safeArray(invoice.returns).filter((entry) => !entry?.isDeleted);
        const returns = activeReturns.reduce((sum, entry) => sum + toSafeNumber(entry?.subtotal ?? entry?.totalRefund), 0);
        const returnTax = activeReturns.reduce((sum, entry) => sum + toSafeNumber(entry?.taxRefund), 0);
        const returnRefunded = activeReturns.reduce((sum, entry) => sum + toSafeNumber(entry?.amountRefunded), 0);
        const returnDebtReduction = activeReturns.reduce((sum, entry) => sum + toSafeNumber(entry?.debtReduction), 0);
        const returnCogs = activeReturns.reduce((returnSum, entry) => (returnSum + safeArray(entry?.items).reduce((itemSum, returnItem) => {
            const sourceItem = safeArray(invoice.items).find((item) => (item.medicineId === returnItem.medicineId && item.batchId === returnItem.batchId));
            const medicine = medicineById.get(returnItem.medicineId);
            const batch = medicine?.batches?.find((batchEntry) => batchEntry.id === returnItem.batchId);
            const unitCost = Math.max(0, toSafeNumber(returnItem.costPrice ?? sourceItem?.costPrice ?? batch?.purchasePrice));
            return itemSum + (unitCost * getInvoiceItemBaseQuantity(returnItem));
        }, 0)), 0);
        const netSales = Math.max(0, grossSales - discount - returns);
        const cogs = Math.max(0, items.reduce((sum, item) => sum + item.cost, 0) - returnCogs);
        const grossProfit = netSales - cogs;
        const profitMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0;
        const mappedPayment = mapPaymentStatus(invoice.paymentStatus, translator);
        return {
            id: invoice.id,
            invoiceNumber: String(invoice.invoiceNumber || invoice.id.slice(-6)),
            customerId: invoice.customerId,
            customerName,
            customerPhone,
            userId: invoice.userId || 'admin',
            userName: getUserName(invoice.userId, args.users, args.language),
            dateIso: invoice.date,
            dueDateIso: invoice.dueDate || null,
            grossSales,
            discount,
            returns,
            netSales,
            tax: Math.max(0, toSafeNumber(invoice.tax) - returnTax),
            finalAmount: Math.max(0, toSafeNumber(invoice.finalAmount) - activeReturns.reduce((sum, entry) => sum + toSafeNumber(entry?.totalRefund), 0)),
            collected: Math.max(0, toSafeNumber(invoice.amountPaid) - returnRefunded),
            receivable: Math.max(0, toSafeNumber(invoice.remainingAmount) - returnDebtReduction),
            paymentStatus: mappedPayment.key,
            salesMode: (invoice.salesMode || 'retail').toLowerCase(),
            cogs,
            grossProfit,
            profitMargin,
            items
        };
    })
        .sort((a, b) => new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime());
};
const buildPeriodMetrics = (invoices: NormalizedInvoice[], expenses: Expense[]) => {
    const grossSales = invoices.reduce((sum, invoice) => sum + invoice.grossSales, 0);
    const netSales = invoices.reduce((sum, invoice) => sum + invoice.netSales, 0);
    const discounts = invoices.reduce((sum, invoice) => sum + invoice.discount, 0);
    const returns = invoices.reduce((sum, invoice) => sum + invoice.returns, 0);
    const cogs = invoices.reduce((sum, invoice) => sum + invoice.cogs, 0);
    const grossProfit = invoices.reduce((sum, invoice) => sum + invoice.grossProfit, 0);
    const grossMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0;
    const operatingExpenses = expenses.reduce((sum, expense) => sum + toSafeNumber(expense.amount), 0);
    const operatingProfit = grossProfit - operatingExpenses;
    const netProfit = operatingProfit;
    const invoiceCount = invoices.length;
    const averageInvoiceValue = invoiceCount > 0 ? netSales / invoiceCount : 0;
    const collected = invoices.reduce((sum, invoice) => sum + invoice.collected, 0);
    const receivable = invoices.reduce((sum, invoice) => sum + invoice.receivable, 0);
    const itemsSold = invoices.reduce((sum, invoice) => sum + invoice.items.reduce((lineSum, item) => lineSum + item.baseQuantity, 0), 0);
    return {
        grossSales,
        netSales,
        discounts,
        returns,
        cogs,
        grossProfit,
        grossMargin,
        operatingExpenses,
        operatingProfit,
        netProfit,
        profitMargin: netSales > 0 ? (netProfit / netSales) * 100 : 0,
        invoiceCount,
        averageInvoiceValue,
        collected,
        receivable,
        itemsSold
    } satisfies PeriodFinancialMetrics;
};
const buildTrendSeries = (invoices: NormalizedInvoice[], range: ReportRange, language: Language, settings?: Pick<AppSettings, 'dateTimeSettings'> | null): ReportChartPoint[] => {
    const bucketMap = new Map<string, {
        label: string;
        value: number;
        secondaryValue: number;
        tertiaryValue: number;
    }>();
    const formatBucketLabel = (date: Date) => {
        if (range.granularity === 'day') {
            return formatReportDate(date.toISOString(), language, settings);
        }
        if (range.granularity === 'week') {
            const weekStart = startOfWeek(date);
            const weekEnd = endOfWeek(date);
            return `${formatReportDate(weekStart.toISOString(), language, settings)} - ${formatReportDate(weekEnd.toISOString(), language, settings)}`;
        }
        return formatAppDate(date.toISOString(), { language, dateTimeSettings: settings?.dateTimeSettings } as AppSettings, 'reports', { month: 'short', year: 'numeric' });
    };
    const makeKey = (date: Date) => {
        if (range.granularity === 'day')
            return toInputDate(startOfDay(date));
        if (range.granularity === 'week')
            return toInputDate(startOfWeek(date));
        return `${date.getFullYear()}-${date.getMonth()}`;
    };
    invoices.forEach((invoice) => {
        const date = new Date(invoice.dateIso);
        if (Number.isNaN(date.getTime()))
            return;
        const key = makeKey(date);
        const label = formatBucketLabel(date);
        const current = bucketMap.get(key) || { label, value: 0, secondaryValue: 0, tertiaryValue: 0 };
        current.value += invoice.netSales;
        current.secondaryValue += invoice.collected;
        current.tertiaryValue += invoice.receivable;
        bucketMap.set(key, current);
    });
    return Array.from(bucketMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, value]) => ({
        id: key,
        label: value.label,
        value: value.value,
        secondaryValue: value.secondaryValue,
        tertiaryValue: value.tertiaryValue
    }));
};
const buildInventorySnapshots = (args: {
    medicines: Medicine[];
    suppliers: Supplier[];
    currentInvoices: NormalizedInvoice[];
    previousInvoices: NormalizedInvoice[];
    currentPurchases: Purchase[];
    now: Date;
    language: Language;
}) => {
    const supplierById = new Map(args.suppliers.filter((item) => !item.isDeleted).map((item) => [item.id, item]));
    const soldByMedicineCurrent: Record<string, {
        qty: number;
        revenue: number;
        cogs: number;
        lastSoldAt: string | null;
        profit: number;
    }> = {};
    const soldByMedicinePrevious: Record<string, {
        qty: number;
    }> = {};
    const purchaseValueCurrent: Record<string, number> = {};
    args.currentInvoices.forEach((invoice) => {
        invoice.items.forEach((item) => {
            const bucket = soldByMedicineCurrent[item.medicineId] || { qty: 0, revenue: 0, cogs: 0, lastSoldAt: null, profit: 0 };
            bucket.qty += item.baseQuantity;
            bucket.revenue += item.netRevenue;
            bucket.cogs += item.cost;
            bucket.profit += item.profit;
            bucket.lastSoldAt = !bucket.lastSoldAt || new Date(invoice.dateIso) > new Date(bucket.lastSoldAt) ? invoice.dateIso : bucket.lastSoldAt;
            soldByMedicineCurrent[item.medicineId] = bucket;
        });
    });
    args.previousInvoices.forEach((invoice) => {
        invoice.items.forEach((item) => {
            const bucket = soldByMedicinePrevious[item.medicineId] || { qty: 0 };
            bucket.qty += item.baseQuantity;
            soldByMedicinePrevious[item.medicineId] = bucket;
        });
    });
    args.currentPurchases.filter((purchase) => !purchase.isDeleted).forEach((purchase) => {
        safeArray(purchase.items).forEach((item) => {
            purchaseValueCurrent[item.medicineId] = (purchaseValueCurrent[item.medicineId] || 0) + toSafeNumber(item.quantity) * toSafeNumber(item.purchasePrice);
        });
    });
    return args.medicines
        .filter((medicine) => !medicine.isDeleted)
        .map<InventorySnapshot>((medicine) => {
        const stockQty = safeArray(medicine.batches).reduce((sum, batch) => sum + toSafeNumber(batch.quantity), 0);
        const stockValue = safeArray(medicine.batches).reduce((sum, batch) => sum + toSafeNumber(batch.quantity) * toSafeNumber(batch.purchasePrice), 0);
        const soldCurrent = soldByMedicineCurrent[medicine.id] || { qty: 0, revenue: 0, cogs: 0, lastSoldAt: null, profit: 0 };
        const soldPrevious = soldByMedicinePrevious[medicine.id] || { qty: 0 };
        const purchaseValue = purchaseValueCurrent[medicine.id] || 0;
        const openingValueEstimate = Math.max(0, stockValue - purchaseValue + soldCurrent.cogs);
        const averageInventoryValue = openingValueEstimate > 0 ? (openingValueEstimate + stockValue) / 2 : stockValue;
        const turnover = averageInventoryValue > 0 ? soldCurrent.cogs / averageInventoryValue : 0;
        const nowTime = args.now.getTime();
        const expiryBuckets = safeArray(medicine.batches).reduce((acc, batch) => {
            const expiry = new Date(batch.expiryDate);
            if (Number.isNaN(expiry.getTime()))
                return acc;
            const diffDays = Math.floor((expiry.getTime() - nowTime) / 86400000);
            if (diffDays < 0)
                acc.expired += 1;
            if (diffDays >= 0 && diffDays <= 30)
                acc.expiring30 += 1;
            if (diffDays >= 0 && diffDays <= 60)
                acc.expiring60 += 1;
            if (diffDays >= 0 && diffDays <= 90)
                acc.expiring90 += 1;
            return acc;
        }, { expired: 0, expiring30: 0, expiring60: 0, expiring90: 0 });
        const supplierId = safeArray(medicine.batches).find((batch) => !!batch.supplierId)?.supplierId || '';
        const supplierName = supplierId
            ? supplierById.get(supplierId)?.name || (args.language === 'english' ? 'Unknown supplier' : 'تأمین‌کننده نامشخص')
            : (args.language === 'english' ? 'Unknown supplier' : 'تأمین‌کننده نامشخص');
        const marginPct = soldCurrent.revenue > 0 ? (soldCurrent.profit / soldCurrent.revenue) * 100 : 0;
        return {
            medicineId: medicine.id,
            medicineName: medicine.name,
            productType: args.language === 'english' ? (medicine.type || 'Other') : getMedicineTypeLabel(medicine.type || 'Other'),
            manufacturer: medicine.manufacturer || (args.language === 'english' ? 'Unknown' : 'نامشخص'),
            supplierId,
            supplierName,
            stockQty,
            reorderPoint: Math.max(0, toSafeNumber(medicine.lowStockThreshold)),
            stockValue,
            soldQtyCurrent: soldCurrent.qty,
            soldQtyPrevious: soldPrevious.qty,
            soldValueCurrent: soldCurrent.revenue,
            cogsCurrent: soldCurrent.cogs,
            purchaseValueCurrent: purchaseValue,
            turnover,
            averageInventoryValue,
            expiredBatchCount: expiryBuckets.expired,
            expiring30Count: expiryBuckets.expiring30,
            expiring60Count: expiryBuckets.expiring60,
            expiring90Count: expiryBuckets.expiring90,
            marginPct,
            lastSoldAt: soldCurrent.lastSoldAt
        };
    });
};
const buildFilterOptions = (args: {
    customers: Customer[];
    users: AppUser[];
    medicines: Medicine[];
    suppliers: Supplier[];
    language: Language;
    t: Translator;
}): ReportFilterOptionSet => {
    const users = buildGroupedOptions(args.users.map((user) => ({ key: user.id, label: user.name })), args.t('allUsers'));
    const customers = buildGroupedOptions(args.customers.filter((item) => !item.isDeleted).map((customer) => ({ key: customer.id, label: customer.name })), args.t('allCustomers'));
    const productTypes = buildGroupedOptions(args.medicines.filter((item) => !item.isDeleted).map((medicine) => ({
        key: medicine.type || 'Other',
        label: args.language === 'english' ? medicine.type || 'Other' : getMedicineTypeLabel(medicine.type || 'Other')
    })), args.t('allProductTypes'));
    const manufacturers = buildGroupedOptions(args.medicines.filter((item) => !item.isDeleted).map((medicine) => ({ key: medicine.manufacturer || 'unknown', label: medicine.manufacturer || '-' })), args.t('allManufacturers'));
    const suppliers = buildGroupedOptions(args.suppliers.filter((item) => !item.isDeleted).map((supplier) => ({ key: supplier.id, label: supplier.name })), args.t('allSuppliers'));
    const paymentStatuses = [
        createAllOption(args.t('allPaymentStatuses')),
        { value: 'paid', label: args.t('paid') },
        { value: 'partial', label: args.t('partial') },
        { value: 'credit', label: args.t('credit') }
    ];
    const salesModes = [
        createAllOption(args.t('allSalesModes')),
        { value: 'retail', label: getSalesModeLabel('retail', args.language) },
        { value: 'wholesale', label: getSalesModeLabel('wholesale', args.language) },
        { value: 'bulk', label: getSalesModeLabel('bulk', args.language) }
    ];
    const warehouses = [
        createAllOption(args.t('allWarehouses')),
        { value: MAIN_WAREHOUSE, label: args.t('singleWarehouse'), disabled: true }
    ];
    const branches = [
        createAllOption(args.t('allBranches')),
        { value: MAIN_BRANCH, label: args.t('singleBranch'), disabled: true }
    ];
    return { users, customers, productTypes, manufacturers, suppliers, paymentStatuses, salesModes, warehouses, branches };
};
const matchesInvoiceFilters = (invoice: NormalizedInvoice, filters: ReportFilters, dateStart: Date, dateEnd: Date, query: string) => {
    const productTypeFilter = filters.productType;
    if (!isWithinRange(invoice.dateIso, dateStart, dateEnd))
        return false;
    if (!applyOrAll(filters.userId, invoice.userId))
        return false;
    if (!applyOrAll(filters.customerId, invoice.customerId))
        return false;
    if (!applyOrAll(filters.paymentStatus, invoice.paymentStatus))
        return false;
    if (!applyOrAll(filters.salesMode, invoice.salesMode))
        return false;
    if (productTypeFilter && productTypeFilter !== ALL_VALUE && !invoice.items.some((item) => item.productType === productTypeFilter || item.productType === getMedicineTypeLabel(productTypeFilter)))
        return false;
    if (filters.manufacturer && filters.manufacturer !== ALL_VALUE && !invoice.items.some((item) => item.manufacturer === filters.manufacturer))
        return false;
    if (filters.supplierId && filters.supplierId !== ALL_VALUE && !invoice.items.some((item) => item.supplierId === filters.supplierId))
        return false;
    if (!query)
        return true;
    const haystack = [
        invoice.invoiceNumber,
        invoice.customerName,
        invoice.customerPhone,
        invoice.userName,
        invoice.netSales,
        invoice.grossProfit,
        invoice.paymentStatus,
        invoice.items.map((item) => item.medicineName).join(' '),
        invoice.items.map((item) => item.manufacturer).join(' ')
    ]
        .join(' ')
        .toLowerCase();
    return haystack.includes(query);
};
const matchesExpenseQuery = (expense: Expense, query: string) => {
    if (!query)
        return true;
    const haystack = [expense.title, expense.category, expense.description, expense.amount].join(' ').toLowerCase();
    return haystack.includes(query);
};
const hasValidActivityDate = (dateIso?: string | null) => !!dateIso && !Number.isNaN(new Date(dateIso).getTime());
const matchesPurchaseFilters = (purchase: Purchase, filters: ReportFilters, dateStart: Date, dateEnd: Date, query: string, medicineById: Map<string, Medicine>, supplierById: Map<string, Supplier>) => {
    if (!purchase.date || !isWithinRange(purchase.date, dateStart, dateEnd))
        return false;
    if (!applyOrAll(filters.supplierId, purchase.supplierId))
        return false;
    const productTypeFilter = filters.productType;
    const manufacturerFilter = filters.manufacturer;
    const hasScopedItemFilters = (!!productTypeFilter && productTypeFilter !== ALL_VALUE) ||
        (!!manufacturerFilter && manufacturerFilter !== ALL_VALUE);
    const matchingItems = safeArray(purchase.items).filter((item) => {
        const medicine = medicineById.get(item.medicineId);
        const productTypeKey = medicine?.type || 'Other';
        const productTypeLabel = getMedicineTypeLabel(productTypeKey);
        const manufacturer = medicine?.manufacturer || '';
        if (productTypeFilter &&
            productTypeFilter !== ALL_VALUE &&
            productTypeFilter !== productTypeKey &&
            productTypeFilter !== productTypeLabel) {
            return false;
        }
        if (manufacturerFilter && manufacturerFilter !== ALL_VALUE && manufacturer !== manufacturerFilter) {
            return false;
        }
        return true;
    });
    if (hasScopedItemFilters && matchingItems.length === 0)
        return false;
    if (!query)
        return true;
    const supplierName = supplierById.get(purchase.supplierId)?.name || '';
    const itemsForSearch = matchingItems.length > 0 ? matchingItems : safeArray(purchase.items);
    const haystack = normalizeSearch([
        purchase.invoiceNumber,
        purchase.notes,
        supplierName,
        itemsForSearch
            .map((item) => {
            const medicine = medicineById.get(item.medicineId);
            return [
                item.medicineName,
                medicine?.name,
                medicine?.manufacturer,
                item.batchNumber
            ].join(' ');
        })
            .join(' ')
    ].join(' '));
    return haystack.includes(query);
};
const buildAgingBuckets = (rows: Array<{
    amount: number;
    dueDateIso: string | null;
    invoiceDateIso: string;
}>, now: Date) => {
    const buckets = { current: 0, bucket31: 0, bucket61: 0, bucket91: 0 };
    rows.forEach((row) => {
        const anchor = new Date(row.dueDateIso || row.invoiceDateIso);
        if (Number.isNaN(anchor.getTime()))
            return;
        const age = Math.max(0, Math.floor((endOfDay(now).getTime() - endOfDay(anchor).getTime()) / 86400000));
        if (age <= 30)
            buckets.current += row.amount;
        else if (age <= 60)
            buckets.bucket31 += row.amount;
        else if (age <= 90)
            buckets.bucket61 += row.amount;
        else
            buckets.bucket91 += row.amount;
    });
    return buckets;
};
const getLatestTimestamp = (args: {
    invoices: Invoice[];
    medicines: Medicine[];
    customers: Customer[];
    expenses: Expense[];
    purchases: Purchase[];
    suppliers: Supplier[];
    settings?: AppSettings;
}) => {
    const candidates = [
        ...args.invoices.map((item) => item.updatedAt || item.date),
        ...args.medicines.map((item) => item.updatedAt),
        ...args.customers.map((item) => item.updatedAt),
        ...args.expenses.map((item) => item.updatedAt || item.date),
        ...args.purchases.map((item) => item.updatedAt || item.date),
        ...args.suppliers.map((item) => item.updatedAt || item.lastPurchaseDate || item.lastInteractionDate),
        args.settings?.updatedAt
    ].filter(Boolean) as string[];
    if (!candidates.length)
        return null;
    return candidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null;
};
export const buildReportBundle = ({ invoices = [], medicines = [], customers = [], expenses = [], purchases = [], suppliers = [], settings, activeAppUser, filters, language = settings?.language || 'dari', now = new Date() }: BuildReportBundleArgs): ReportBundle => {
    const t = createTranslator(language);
    const currencyCode = settings?.currencySettings?.baseCurrency || 'AFN';
    const storeName = settings?.storeName || (language === 'english' ? 'My Store' : 'فروشگاه من');
    const users = safeArray(settings?.users).filter((user) => !user.isDeleted);
    const medicineById = new Map(safeArray(medicines).filter((item) => !item.isDeleted).map((item) => [item.id, item]));
    const supplierById = new Map(safeArray(suppliers).filter((item) => !item.isDeleted).map((item) => [item.id, item]));
    const normalizedInvoices = buildNormalizedInvoices({
        invoices: safeArray(invoices),
        medicines: safeArray(medicines),
        customers: safeArray(customers),
        users,
        language
    });
    const options = buildFilterOptions({
        customers: safeArray(customers),
        users,
        medicines: safeArray(medicines),
        suppliers: safeArray(suppliers),
        language,
        t
    });
    const reportDateSettings = settings ? { dateTimeSettings: settings.dateTimeSettings } : null;
    const range = buildDateRange(filters, language, now, t, reportDateSettings);
    const currentStart = new Date(range.startIso);
    const currentEnd = new Date(range.endIso);
    const previousStart = new Date(range.previousStartIso);
    const previousEnd = new Date(range.previousEndIso);
    const query = normalizeSearch(filters.query);
    const filteredInvoicesCurrent = normalizedInvoices.filter((invoice) => matchesInvoiceFilters(invoice, filters, currentStart, currentEnd, query));
    const filteredInvoicesPrevious = normalizedInvoices.filter((invoice) => matchesInvoiceFilters(invoice, filters, previousStart, previousEnd, query));
    const filteredExpensesCurrent = safeArray(expenses).filter((expense) => !expense.isDeleted && isWithinRange(expense.date, currentStart, currentEnd) && matchesExpenseQuery(expense, query));
    const filteredExpensesPrevious = safeArray(expenses).filter((expense) => !expense.isDeleted && isWithinRange(expense.date, previousStart, previousEnd) && matchesExpenseQuery(expense, query));
    const filteredPurchasesCurrent = safeArray(purchases).filter((purchase) => !purchase.isDeleted &&
        matchesPurchaseFilters(purchase, filters, currentStart, currentEnd, query, medicineById, supplierById));
    const formulas = createMetricDefinitions(t);
    const financialCurrent = buildPeriodMetrics(filteredInvoicesCurrent, filteredExpensesCurrent);
    const financialPrevious = buildPeriodMetrics(filteredInvoicesPrevious, filteredExpensesPrevious);
    const latestTimestamp = getLatestTimestamp({
        invoices: safeArray(invoices),
        medicines: safeArray(medicines),
        customers: safeArray(customers),
        expenses: safeArray(expenses),
        purchases: safeArray(purchases),
        suppliers: safeArray(suppliers),
        settings
    });
    const inventoryRows = buildInventorySnapshots({
        medicines: safeArray(medicines),
        suppliers: safeArray(suppliers),
        currentInvoices: filteredInvoicesCurrent,
        previousInvoices: filteredInvoicesPrevious,
        currentPurchases: filteredPurchasesCurrent,
        now,
        language
    }).filter((item) => {
        if (!applyOrAll(filters.productType, item.productType) && !applyOrAll(filters.productType, getMedicineTypeLabel(filters.productType || '')))
            return false;
        if (!applyOrAll(filters.manufacturer, item.manufacturer))
            return false;
        if (!applyOrAll(filters.supplierId, item.supplierId))
            return false;
        if (!query)
            return true;
        return [item.medicineName, item.productType, item.manufacturer, item.supplierName].join(' ').toLowerCase().includes(query);
    });
    const inventoryKpisCurrent = {
        inventoryValue: inventoryRows.reduce((sum, item) => sum + item.stockValue, 0),
        turnover: inventoryRows.reduce((sum, item) => sum + item.turnover, 0),
        stagnant: inventoryRows.filter((item) => item.stockQty > 0 && getDaysSince(item.lastSoldAt, now) > 90).length,
        slowMoving: inventoryRows.filter((item) => item.stockQty > 0 && item.soldQtyCurrent > 0 && item.soldQtyCurrent <= 2).length,
        fastMoving: inventoryRows.filter((item) => item.soldQtyCurrent >= 5).length,
        expired: inventoryRows.filter((item) => item.expiredBatchCount > 0).length,
        expiring30: inventoryRows.filter((item) => item.expiring30Count > 0).length,
        expiring60: inventoryRows.filter((item) => item.expiring60Count > 0).length,
        expiring90: inventoryRows.filter((item) => item.expiring90Count > 0).length,
        reorderNeeded: inventoryRows.filter((item) => item.stockQty <= item.reorderPoint).length,
        lowMargin: inventoryRows.filter((item) => item.soldQtyCurrent > 0 && item.marginPct > 0 && item.marginPct < 12).length,
        highMargin: inventoryRows.filter((item) => item.soldQtyCurrent > 0 && item.marginPct >= 25).length
    };
    const inventoryKpisPrevious = {
        inventoryValue: inventoryRows.reduce((sum, item) => sum + Math.max(0, item.stockValue - item.purchaseValueCurrent + item.cogsCurrent), 0),
        turnover: inventoryRows.reduce((sum, item) => sum + (item.averageInventoryValue > 0 ? (item.cogsCurrent - item.purchaseValueCurrent) / item.averageInventoryValue : 0), 0),
        stagnant: 0,
        slowMoving: inventoryRows.filter((item) => item.soldQtyPrevious > 0 && item.soldQtyPrevious <= 2).length,
        fastMoving: inventoryRows.filter((item) => item.soldQtyPrevious >= 5).length,
        expired: 0,
        expiring30: 0,
        expiring60: 0,
        expiring90: 0,
        reorderNeeded: 0,
        lowMargin: 0,
        highMargin: 0
    };
    const inventoryAlertsCurrent = inventoryKpisCurrent.reorderNeeded + inventoryKpisCurrent.expiring30 + inventoryKpisCurrent.expired;
    const inventoryAlertsPrevious = inventoryKpisPrevious.reorderNeeded + inventoryKpisPrevious.expiring30 + inventoryKpisPrevious.expired;
    const customerBase = safeArray(customers).filter((customer) => !customer.isDeleted);
    const customerSummaries = customerBase.map((customer) => {
        const currentInvoices = filteredInvoicesCurrent.filter((invoice) => invoice.customerId === customer.id);
        const allInvoices = normalizedInvoices.filter((invoice) => invoice.customerId === customer.id);
        const sales = currentInvoices.reduce((sum, invoice) => sum + invoice.netSales, 0);
        const profit = currentInvoices.reduce((sum, invoice) => sum + invoice.grossProfit, 0);
        const openInvoices = currentInvoices.filter((invoice) => invoice.receivable > 0).length;
        const lastPurchase = allInvoices[0]?.dateIso || null;
        const lastPayment = safeArray(customer.transactions)
            .filter((transaction) => transaction.type === 'payment')
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date || null;
        const visits = currentInvoices.length;
        const averagePurchase = visits > 0 ? sales / visits : 0;
        const firstPurchase = allInvoices.length ? allInvoices[allInvoices.length - 1].dateIso : null;
        return {
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            address: customer.address || '',
            sales,
            profit,
            balance: Math.max(0, toSafeNumber(customer.balance)),
            openInvoices,
            lastPurchase,
            lastPayment,
            visits,
            averagePurchase,
            firstPurchase,
            creditLimit: 0
        };
    }).filter((customer) => {
        if (!applyOrAll(filters.customerId, customer.id))
            return false;
        if (!query)
            return true;
        return [customer.name, customer.phone, customer.address].join(' ').toLowerCase().includes(query);
    });
    const aging = buildAgingBuckets(filteredInvoicesCurrent
        .filter((invoice) => invoice.receivable > 0)
        .map((invoice) => ({ amount: invoice.receivable, dueDateIso: invoice.dueDateIso, invoiceDateIso: invoice.dateIso })), now);
    const currentCustomerActive = customerSummaries.filter((customer) => customer.sales > 0);
    const newCustomers = customerSummaries.filter((customer) => customer.firstPurchase && isWithinRange(customer.firstPurchase, currentStart, currentEnd)).length;
    const inactiveCustomers = customerSummaries.filter((customer) => getDaysSince(customer.lastPurchase, now) > 60).length;
    const returnRate = currentCustomerActive.length > 0
        ? (currentCustomerActive.filter((customer) => customer.visits > 1).length / currentCustomerActive.length) * 100
        : 0;
    const userSummaries = users.length
        ? users.map((user) => {
            const currentInvoices = filteredInvoicesCurrent.filter((invoice) => invoice.userId === user.id);
            const sales = currentInvoices.reduce((sum, invoice) => sum + invoice.netSales, 0);
            const profit = currentInvoices.reduce((sum, invoice) => sum + invoice.grossProfit, 0);
            const invoiceCount = currentInvoices.length;
            const averageInvoice = invoiceCount > 0 ? sales / invoiceCount : 0;
            const discounts = currentInvoices.reduce((sum, invoice) => sum + invoice.discount, 0);
            const collected = currentInvoices.reduce((sum, invoice) => sum + invoice.collected, 0);
            return {
                id: user.id,
                name: user.name,
                role: user.role === 'admin' ? t('roleAdmin') : t('roleStaff'),
                sales,
                profit,
                invoiceCount,
                averageInvoice,
                discounts,
                collected
            };
        })
        : [];
    const sortedUsers = [...userSummaries].sort((a, b) => b.sales - a.sales);
    const topSellerShare = financialCurrent.netSales > 0 && sortedUsers.length ? (sortedUsers[0].sales / financialCurrent.netSales) * 100 : 0;
    const qualityIssues = customerSummaries.flatMap((customer) => {
        const rows: ReportTableRow[] = [];
        if (!getCustomerPhoneQuality(customer.phone)) {
            rows.push({ id: `${customer.id}-phone`, customer: customer.name, issue: t('phoneInvalid'), note: customer.phone || '-' });
        }
        if (!getCustomerNameQuality(customer.name)) {
            rows.push({ id: `${customer.id}-name`, customer: customer.name, issue: t('nameSuspicious'), note: customer.name });
        }
        if (!customer.address) {
            rows.push({ id: `${customer.id}-address`, customer: customer.name, issue: t('addressMissing'), note: '-' });
        }
        return rows;
    });
    const financialTables: ReportTable[] = [
        {
            id: 'financial-transactions',
            title: t('topTransactions'),
            description: t('dataSourceInvoices'),
            columns: [
                { key: 'date', label: t('date'), type: 'date' },
                { key: 'invoice', label: t('invoice') },
                { key: 'customer', label: t('customerName') },
                { key: 'seller', label: t('seller') },
                { key: 'netSales', label: t('netSales'), type: 'money', align: 'end' },
                { key: 'profit', label: t('profit'), type: 'money', align: 'end' },
                { key: 'collected', label: t('collectedAmount'), type: 'money', align: 'end' },
                { key: 'status', label: t('status'), type: 'status', align: 'center' }
            ],
            rows: [...filteredInvoicesCurrent]
                .sort((a, b) => b.netSales - a.netSales)
                .slice(0, 25)
                .map((invoice) => ({
                id: invoice.id,
                date: invoice.dateIso,
                invoice: invoice.invoiceNumber,
                customer: invoice.customerName,
                seller: invoice.userName,
                netSales: invoice.netSales,
                profit: invoice.grossProfit,
                collected: invoice.collected,
                status: invoice.paymentStatus
            })),
            emptyTitle: t('emptyTitle'),
            emptyDescription: t('filteredDescription'),
            cta: { view: 'sales', label: t('openSales') }
        },
        {
            id: 'financial-receivables',
            title: t('receivables'),
            description: t('dataSourceCustomers'),
            columns: [
                { key: 'customer', label: t('customerName') },
                { key: 'invoice', label: t('invoice') },
                { key: 'date', label: t('date'), type: 'date' },
                { key: 'dueDate', label: t('previousRange'), type: 'date' },
                { key: 'outstanding', label: t('outstanding'), type: 'money', align: 'end' },
                { key: 'status', label: t('status'), type: 'status', align: 'center' }
            ],
            rows: filteredInvoicesCurrent
                .filter((invoice) => invoice.receivable > 0)
                .sort((a, b) => b.receivable - a.receivable)
                .map((invoice) => ({
                id: `${invoice.id}-receivable`,
                customer: invoice.customerName,
                invoice: invoice.invoiceNumber,
                date: invoice.dateIso,
                dueDate: invoice.dueDateIso || invoice.dateIso,
                outstanding: invoice.receivable,
                status: invoice.paymentStatus
            })),
            emptyTitle: t('emptyTitle'),
            emptyDescription: t('filteredDescription'),
            cta: { view: 'customers', label: t('openCustomers') }
        },
        {
            id: 'financial-expenses',
            title: t('expenses'),
            description: t('dataSourceExpenses'),
            columns: [
                { key: 'date', label: t('date'), type: 'date' },
                { key: 'title', label: t('note') },
                { key: 'category', label: t('productType') },
                { key: 'amount', label: t('amount'), type: 'money', align: 'end' }
            ],
            rows: filteredExpensesCurrent
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((expense) => ({
                id: expense.id,
                date: expense.date,
                title: expense.title,
                category: expense.category,
                amount: toSafeNumber(expense.amount)
            })),
            emptyTitle: t('emptyTitle'),
            emptyDescription: t('noExpenseData'),
            cta: { view: 'expenses', label: t('registerExpense') }
        }
    ];
    const inventoryTables: ReportTable[] = [
        {
            id: 'inventory-reorder',
            title: t('reorderItems'),
            description: t('dataSourceInventory'),
            columns: [
                { key: 'medicine', label: t('productType') },
                { key: 'stock', label: t('stock'), type: 'number', align: 'end' },
                { key: 'reorderPoint', label: t('reorderPoint'), type: 'number', align: 'end' },
                { key: 'supplier', label: t('supplier') },
                { key: 'note', label: t('note') }
            ],
            rows: inventoryRows
                .filter((item) => item.stockQty <= item.reorderPoint)
                .sort((a, b) => a.stockQty - b.stockQty)
                .map((item) => ({
                id: `${item.medicineId}-reorder`,
                medicine: item.medicineName,
                stock: item.stockQty,
                reorderPoint: item.reorderPoint,
                supplier: item.supplierName,
                note: item.stockQty === 0 ? (language === 'english' ? 'Out of stock' : 'ناموجود') : (language === 'english' ? 'Below threshold' : 'کمتر از حداقل')
            })),
            emptyTitle: t('emptyTitle'),
            emptyDescription: t('filteredDescription'),
            cta: { view: 'purchases', label: t('openPurchases') }
        },
        {
            id: 'inventory-expiry',
            title: t('expiryItems'),
            description: t('dataSourceInventory'),
            columns: [
                { key: 'medicine', label: t('productType') },
                { key: 'stock', label: t('stock'), type: 'number', align: 'end' },
                { key: 'expired', label: t('expired'), type: 'number', align: 'end' },
                { key: 'expiring30', label: t('expiring30'), type: 'number', align: 'end' },
                { key: 'expiring60', label: t('expiring60'), type: 'number', align: 'end' }
            ],
            rows: inventoryRows
                .filter((item) => item.expiredBatchCount > 0 || item.expiring60Count > 0)
                .sort((a, b) => (b.expiredBatchCount + b.expiring30Count) - (a.expiredBatchCount + a.expiring30Count))
                .map((item) => ({
                id: `${item.medicineId}-expiry`,
                medicine: item.medicineName,
                stock: item.stockQty,
                expired: item.expiredBatchCount,
                expiring30: item.expiring30Count,
                expiring60: item.expiring60Count
            })),
            emptyTitle: t('emptyTitle'),
            emptyDescription: t('filteredDescription'),
            cta: { view: 'inventory', label: t('openInventory') }
        },
        {
            id: 'inventory-detail',
            title: t('inventoryDetail'),
            description: t('dataSourceInventory'),
            columns: [
                { key: 'medicine', label: t('productType') },
                { key: 'brand', label: t('brand') },
                { key: 'stock', label: t('stock'), type: 'number', align: 'end' },
                { key: 'value', label: t('inventoryValue'), type: 'money', align: 'end' },
                { key: 'turnover', label: t('turnoverShort'), type: 'number', align: 'end' },
                { key: 'margin', label: t('margin'), type: 'percent', align: 'end' }
            ],
            rows: inventoryRows
                .sort((a, b) => b.stockValue - a.stockValue)
                .map((item) => ({
                id: `${item.medicineId}-detail`,
                medicine: item.medicineName,
                brand: item.manufacturer,
                stock: item.stockQty,
                value: item.stockValue,
                turnover: item.turnover,
                margin: item.marginPct
            })),
            emptyTitle: t('emptyTitle'),
            emptyDescription: t('filteredDescription'),
            cta: { view: 'inventory', label: t('openInventory') }
        }
    ];
    const customerTables: ReportTable[] = [
        {
            id: 'customers-summary',
            title: t('customerSummary'),
            description: t('dataSourceCustomers'),
            columns: [
                { key: 'customer', label: t('customerName') },
                { key: 'sales', label: t('revenue'), type: 'money', align: 'end' },
                { key: 'profit', label: t('profit'), type: 'money', align: 'end' },
                { key: 'balance', label: t('outstanding'), type: 'money', align: 'end' },
                { key: 'visits', label: t('visits'), type: 'number', align: 'end' },
                { key: 'lastPurchase', label: t('lastPurchase'), type: 'date' }
            ],
            rows: [...customerSummaries]
                .sort((a, b) => b.sales - a.sales)
                .map((customer) => ({
                id: customer.id,
                customer: customer.name,
                sales: customer.sales,
                profit: customer.profit,
                balance: customer.balance,
                visits: customer.visits,
                lastPurchase: customer.lastPurchase
            })),
            emptyTitle: t('emptyTitle'),
            emptyDescription: t('filteredDescription'),
            cta: { view: 'customers', label: t('openCustomers') }
        },
        {
            id: 'customers-aging',
            title: t('customerAging'),
            description: t('agingUsesDueDate'),
            columns: [
                { key: 'bucket', label: t('status') },
                { key: 'amount', label: t('amount'), type: 'money', align: 'end' }
            ],
            rows: [
                { id: 'aging-0-30', bucket: '0-30', amount: aging.current },
                { id: 'aging-31-60', bucket: '31-60', amount: aging.bucket31 },
                { id: 'aging-61-90', bucket: '61-90', amount: aging.bucket61 },
                { id: 'aging-90+', bucket: '90+', amount: aging.bucket91 }
            ],
            emptyTitle: t('emptyTitle'),
            emptyDescription: t('filteredDescription'),
            cta: { view: 'customers', label: t('openCustomers') }
        },
        {
            id: 'customers-quality',
            title: t('customerQuality'),
            description: t('qualityUsesValidation'),
            columns: [
                { key: 'customer', label: t('customerName') },
                { key: 'issue', label: t('qualityIssues') },
                { key: 'note', label: t('note') }
            ],
            rows: qualityIssues,
            emptyTitle: t('emptyTitle'),
            emptyDescription: t('filteredDescription'),
            cta: { view: 'customers', label: t('openCustomers') }
        }
    ];
    const employeeTables: ReportTable[] = [
        {
            id: 'employees-summary',
            title: t('employeeSummary'),
            description: t('dataSourceEmployees'),
            columns: [
                { key: 'employee', label: t('seller') },
                { key: 'role', label: t('employeeRole') },
                { key: 'sales', label: t('revenue'), type: 'money', align: 'end' },
                { key: 'profit', label: t('profit'), type: 'money', align: 'end' },
                { key: 'invoiceCount', label: t('invoiceCount'), type: 'number', align: 'end' },
                { key: 'averageInvoice', label: t('averageInvoiceShort'), type: 'money', align: 'end' },
                { key: 'collected', label: t('collectedAmount'), type: 'money', align: 'end' }
            ],
            rows: sortedUsers.map((user) => ({
                id: user.id,
                employee: user.name,
                role: user.role,
                sales: user.sales,
                profit: user.profit,
                invoiceCount: user.invoiceCount,
                averageInvoice: user.averageInvoice,
                collected: user.collected
            })),
            emptyTitle: t('emptyTitle'),
            emptyDescription: t('filteredDescription'),
            cta: { view: 'sales', label: t('openSales') }
        },
        {
            id: 'employees-transactions',
            title: t('employeeTransactions'),
            description: t('dataSourceEmployees'),
            columns: [
                { key: 'employee', label: t('seller') },
                { key: 'invoice', label: t('invoice') },
                { key: 'date', label: t('date'), type: 'date' },
                { key: 'sales', label: t('revenue'), type: 'money', align: 'end' },
                { key: 'profit', label: t('profit'), type: 'money', align: 'end' }
            ],
            rows: filteredInvoicesCurrent.map((invoice) => ({
                id: `${invoice.id}-employee`,
                employee: invoice.userName,
                invoice: invoice.invoiceNumber,
                date: invoice.dateIso,
                sales: invoice.netSales,
                profit: invoice.grossProfit
            })),
            emptyTitle: t('emptyTitle'),
            emptyDescription: t('filteredDescription'),
            cta: { view: 'sales', label: t('openSales') }
        }
    ];
    const paymentMixMap: Record<string, {
        label: string;
        value: number;
    }> = {};
    const categoryMixMap: Record<string, {
        label: string;
        value: number;
    }> = {};
    const expenseBreakdownMap: Record<string, {
        label: string;
        value: number;
    }> = {};
    const userMixMap: Record<string, {
        label: string;
        value: number;
    }> = {};
    const productSalesMap: Record<string, {
        label: string;
        value: number;
        margin: number;
    }> = {};
    filteredInvoicesCurrent.forEach((invoice) => {
        addToGroupedValue(paymentMixMap, invoice.paymentStatus, mapPaymentStatus(invoice.paymentStatus, t).label, invoice.netSales);
        addToGroupedValue(userMixMap, invoice.userId, invoice.userName, invoice.netSales);
        invoice.items.forEach((item) => {
            addToGroupedValue(categoryMixMap, item.productType, item.productType, item.netRevenue);
            if (!productSalesMap[item.medicineId]) {
                productSalesMap[item.medicineId] = { label: item.medicineName, value: 0, margin: 0 };
            }
            productSalesMap[item.medicineId].value += item.baseQuantity;
            productSalesMap[item.medicineId].margin += item.marginPct;
        });
    });
    filteredExpensesCurrent.forEach((expense) => {
        addToGroupedValue(expenseBreakdownMap, expense.category || 'Other', expense.category || 'Other', toSafeNumber(expense.amount));
    });
    const chartify = (source: Record<string, {
        label: string;
        value: number;
    }>, top = 8): ReportChartPoint[] => sortByValueDesc(Object.entries(source).map(([key, entry]) => ({ id: key, label: entry.label, value: entry.value }))).slice(0, top);
    const topProducts = sortByValueDesc(Object.entries(productSalesMap).map(([key, entry]) => ({
        id: key,
        label: entry.label,
        value: entry.value,
        secondaryValue: entry.margin
    })));
    const financialCharts: ReportChartSeries[] = [
        { id: 'financial-sales-trend', title: t('salesTrend'), description: t('dataSourceInvoices'), kind: 'area', data: buildTrendSeries(filteredInvoicesCurrent, range, language, reportDateSettings), emptyTitle: t('emptyTitle'), emptyDescription: t('noTrendData'), suggestion: t('searchBiggerRange') },
        { id: 'financial-payment-mix', title: t('paymentMix'), description: t('dataSourceInvoices'), kind: 'donut', data: chartify(paymentMixMap, 6), emptyTitle: t('emptyTitle'), emptyDescription: t('filteredDescription') },
        { id: 'financial-category-mix', title: t('categoryMix'), description: t('dataSourceInvoices'), kind: 'bar', data: chartify(categoryMixMap, 8), emptyTitle: t('emptyTitle'), emptyDescription: t('filteredDescription') },
        { id: 'financial-user-mix', title: t('userMix'), description: t('dataSourceEmployees'), kind: 'bar', data: chartify(userMixMap, 8), emptyTitle: t('emptyTitle'), emptyDescription: t('filteredDescription') },
        {
            id: 'financial-profit-breakdown',
            title: t('profitBreakdown'),
            description: `${t('dataSourceInvoices')} + ${t('dataSourceExpenses')}`,
            kind: 'stackedBar',
            data: [
                { id: 'netSales', label: t('netSales'), value: financialCurrent.netSales },
                { id: 'cogs', label: t('cogs'), value: financialCurrent.cogs },
                { id: 'expenses', label: t('operatingExpenses'), value: financialCurrent.operatingExpenses },
                { id: 'netProfit', label: t('netProfit'), value: financialCurrent.netProfit }
            ],
            emptyTitle: t('emptyTitle'),
            emptyDescription: t('filteredDescription')
        },
        { id: 'financial-expense-breakdown', title: t('expenseBreakdown'), description: t('dataSourceExpenses'), kind: 'donut', data: chartify(expenseBreakdownMap, 8), emptyTitle: t('emptyTitle'), emptyDescription: t('noExpenseData') }
    ];
    const inventoryCharts: ReportChartSeries[] = [
        { id: 'inventory-top-products', title: t('topProducts'), description: t('dataSourceInvoices'), kind: 'bar', data: topProducts.slice(0, 10), emptyTitle: t('emptyTitle'), emptyDescription: t('noProductSales'), suggestion: t('searchBiggerRange') },
        { id: 'inventory-bottom-products', title: t('bottomProducts'), description: t('dataSourceInvoices'), kind: 'bar', data: [...topProducts].reverse().slice(0, 10), emptyTitle: t('emptyTitle'), emptyDescription: t('noProductSales'), suggestion: t('searchBiggerRange') },
        {
            id: 'inventory-stock-composition',
            title: t('stockComposition'),
            description: t('dataSourceInventory'),
            kind: 'donut',
            data: chartify(inventoryRows.reduce<Record<string, {
                label: string;
                value: number;
            }>>((acc, item) => {
                addToGroupedValue(acc, item.manufacturer, item.manufacturer, item.stockValue);
                return acc;
            }, {}), 8),
            emptyTitle: t('emptyTitle'),
            emptyDescription: t('filteredDescription')
        },
        {
            id: 'inventory-expiry-risk',
            title: t('expiryRisk'),
            description: t('dataSourceInventory'),
            kind: 'stackedBar',
            data: [
                { id: 'expired', label: t('expired'), value: inventoryKpisCurrent.expired },
                { id: '30', label: t('expiring30'), value: inventoryKpisCurrent.expiring30 },
                { id: '60', label: t('expiring60'), value: inventoryKpisCurrent.expiring60 },
                { id: '90', label: t('expiring90'), value: inventoryKpisCurrent.expiring90 }
            ],
            emptyTitle: t('emptyTitle'),
            emptyDescription: t('filteredDescription')
        }
    ];
    const customerCharts: ReportChartSeries[] = [
        { id: 'customers-top-sales', title: t('topCustomersBySales'), description: t('dataSourceCustomers'), kind: 'bar', data: sortByValueDesc(customerSummaries.map((customer) => ({ id: customer.id, label: customer.name, value: customer.sales }))).slice(0, 10), emptyTitle: t('emptyTitle'), emptyDescription: t('filteredDescription') },
        { id: 'customers-top-profit', title: t('topCustomersByProfit'), description: t('dataSourceCustomers'), kind: 'bar', data: sortByValueDesc(customerSummaries.map((customer) => ({ id: customer.id, label: customer.name, value: customer.profit }))).slice(0, 10), emptyTitle: t('emptyTitle'), emptyDescription: t('filteredDescription') },
        { id: 'customers-debtors', title: t('debtors'), description: t('dataSourceCustomers'), kind: 'bar', data: sortByValueDesc(customerSummaries.map((customer) => ({ id: customer.id, label: customer.name, value: customer.balance }))).slice(0, 10), emptyTitle: t('emptyTitle'), emptyDescription: t('filteredDescription') },
        {
            id: 'customers-aging-buckets',
            title: t('agingBuckets'),
            description: t('agingUsesDueDate'),
            kind: 'stackedBar',
            data: [
                { id: '0-30', label: '0-30', value: aging.current },
                { id: '31-60', label: '31-60', value: aging.bucket31 },
                { id: '61-90', label: '61-90', value: aging.bucket61 },
                { id: '90+', label: '90+', value: aging.bucket91 }
            ],
            emptyTitle: t('emptyTitle'),
            emptyDescription: t('filteredDescription')
        }
    ];
    const employeeCharts: ReportChartSeries[] = [
        { id: 'employees-ranking', title: t('employeeRanking'), description: t('dataSourceEmployees'), kind: 'bar', data: sortedUsers.map((user) => ({ id: user.id, label: user.name, value: user.sales })).slice(0, 10), emptyTitle: t('emptyTitle'), emptyDescription: t('filteredDescription') },
        { id: 'employees-profit', title: t('employeeProfitChart'), description: t('dataSourceEmployees'), kind: 'bar', data: sortedUsers.map((user) => ({ id: `${user.id}-profit`, label: user.name, value: user.profit })).slice(0, 10), emptyTitle: t('emptyTitle'), emptyDescription: t('filteredDescription') }
    ];
    const financialSection: ReportSection = {
        id: 'financial',
        title: t('salesAndMoney'),
        subtitle: t('comparisonPrevious'),
        navigationLabel: t('salesAndMoney'),
        kpis: [
            createMetricCard({ key: 'grossSales', label: t('grossSales'), current: financialCurrent.grossSales, previous: financialPrevious.grossSales, language, currencyCode, detailTableId: 'financial-transactions', definitions: formulas, displayTier: 'advanced' }),
            createMetricCard({ key: 'netSales', label: t('salesOverview'), current: financialCurrent.netSales, previous: financialPrevious.netSales, language, currencyCode, detailTableId: 'financial-transactions', definitions: formulas, displayTier: 'overview' }),
            createMetricCard({ key: 'discounts', label: t('discounts'), current: financialCurrent.discounts, previous: financialPrevious.discounts, language, currencyCode, detailTableId: 'financial-transactions', definitions: formulas, goal: 'lower' }),
            createMetricCard({ key: 'returns', label: t('returns'), current: financialCurrent.returns, previous: financialPrevious.returns, language, currencyCode, detailTableId: 'financial-transactions', definitions: formulas, goal: 'lower', note: t('dataGapNote') }),
            createMetricCard({ key: 'cogs', label: t('cogs'), current: financialCurrent.cogs, previous: financialPrevious.cogs, language, currencyCode, detailTableId: 'financial-transactions', definitions: formulas, goal: 'lower' }),
            createMetricCard({ key: 'grossProfit', label: t('grossProfit'), current: financialCurrent.grossProfit, previous: financialPrevious.grossProfit, language, currencyCode, detailTableId: 'financial-transactions', definitions: formulas }),
            createMetricCard({ key: 'operatingExpenses', label: t('operatingExpenses'), current: financialCurrent.operatingExpenses, previous: financialPrevious.operatingExpenses, language, currencyCode, detailTableId: 'financial-expenses', definitions: formulas, goal: 'lower' }),
            createMetricCard({ key: 'operatingProfit', label: t('operatingProfit'), current: financialCurrent.operatingProfit, previous: financialPrevious.operatingProfit, language, currencyCode, detailTableId: 'financial-transactions', definitions: formulas }),
            createMetricCard({ key: 'netProfit', label: t('netProfit'), current: financialCurrent.netProfit, previous: financialPrevious.netProfit, language, currencyCode, detailTableId: 'financial-transactions', definitions: formulas }),
            createMetricCard({ key: 'profitMargin', label: t('profitMargin'), current: financialCurrent.profitMargin, previous: financialPrevious.profitMargin, language, currencyCode, detailTableId: 'financial-transactions', definitions: formulas, format: 'percent' }),
            createMetricCard({ key: 'invoiceCount', label: t('invoiceCount'), current: financialCurrent.invoiceCount, previous: financialPrevious.invoiceCount, language, currencyCode, detailTableId: 'financial-transactions', definitions: formulas, format: 'number' }),
            createMetricCard({ key: 'averageInvoiceValue', label: t('averageInvoice'), current: financialCurrent.averageInvoiceValue, previous: financialPrevious.averageInvoiceValue, language, currencyCode, detailTableId: 'financial-transactions', definitions: formulas }),
            createMetricCard({ key: 'collected', label: t('collectedOverview'), current: financialCurrent.collected, previous: financialPrevious.collected, language, currencyCode, detailTableId: 'financial-transactions', definitions: formulas, displayTier: 'overview' }),
            createMetricCard({ key: 'receivable', label: t('receivableOverview'), current: financialCurrent.receivable, previous: financialPrevious.receivable, language, currencyCode, detailTableId: 'financial-receivables', definitions: formulas, goal: 'lower', displayTier: 'overview' })
        ],
        charts: financialCharts,
        tables: financialTables,
        primaryTableId: 'financial-transactions',
        heroMetricKeys: ['netSales', 'collected', 'netProfit'],
        secondaryMetricKeys: ['grossSales', 'discounts', 'cogs', 'grossProfit', 'operatingExpenses', 'operatingProfit', 'profitMargin', 'invoiceCount', 'averageInvoiceValue', 'receivable'],
        primaryChartId: 'financial-sales-trend',
        secondaryTableIds: ['financial-receivables', 'financial-expenses'],
        notes: [t('dataGapNote')]
    };
    const inventorySection: ReportSection = {
        id: 'inventory',
        title: t('stockAndAlerts'),
        subtitle: t('dataSourceInventory'),
        navigationLabel: t('stockAndAlerts'),
        kpis: [
            createMetricCard({ key: 'inventoryValue', label: t('inventoryValue'), current: inventoryKpisCurrent.inventoryValue, previous: inventoryKpisPrevious.inventoryValue, language, currencyCode, detailTableId: 'inventory-detail', definitions: formulas }),
            createMetricCard({ key: 'turnover', label: t('turnover'), current: inventoryKpisCurrent.turnover, previous: inventoryKpisPrevious.turnover, language, currencyCode, detailTableId: 'inventory-detail', definitions: formulas, format: 'number' }),
            createMetricCard({ key: 'stagnant', label: t('stagnant'), current: inventoryKpisCurrent.stagnant, previous: inventoryKpisPrevious.stagnant, language, currencyCode, detailTableId: 'inventory-detail', definitions: formulas, format: 'number', goal: 'lower' }),
            createMetricCard({ key: 'slowMoving', label: t('slowMoving'), current: inventoryKpisCurrent.slowMoving, previous: inventoryKpisPrevious.slowMoving, language, currencyCode, detailTableId: 'inventory-detail', definitions: formulas, format: 'number', goal: 'lower' }),
            createMetricCard({ key: 'fastMoving', label: t('fastMoving'), current: inventoryKpisCurrent.fastMoving, previous: inventoryKpisPrevious.fastMoving, language, currencyCode, detailTableId: 'inventory-top-products', definitions: formulas, format: 'number' }),
            createMetricCard({ key: 'expired', label: t('expired'), current: inventoryKpisCurrent.expired, previous: inventoryKpisPrevious.expired, language, currencyCode, detailTableId: 'inventory-expiry', definitions: formulas, format: 'number', goal: 'lower' }),
            createMetricCard({ key: 'expiring30', label: t('expiring30'), current: inventoryKpisCurrent.expiring30, previous: inventoryKpisPrevious.expiring30, language, currencyCode, detailTableId: 'inventory-expiry', definitions: formulas, format: 'number', goal: 'lower' }),
            createMetricCard({ key: 'expiring60', label: t('expiring60'), current: inventoryKpisCurrent.expiring60, previous: inventoryKpisPrevious.expiring60, language, currencyCode, detailTableId: 'inventory-expiry', definitions: formulas, format: 'number', goal: 'lower' }),
            createMetricCard({ key: 'expiring90', label: t('expiring90'), current: inventoryKpisCurrent.expiring90, previous: inventoryKpisPrevious.expiring90, language, currencyCode, detailTableId: 'inventory-expiry', definitions: formulas, format: 'number', goal: 'lower' }),
            createMetricCard({ key: 'reorderNeeded', label: t('reorderNeeded'), current: inventoryKpisCurrent.reorderNeeded, previous: inventoryKpisPrevious.reorderNeeded, language, currencyCode, detailTableId: 'inventory-reorder', definitions: formulas, format: 'number', goal: 'lower' }),
            createMetricCard({ key: 'lowMargin', label: t('lowMargin'), current: inventoryKpisCurrent.lowMargin, previous: inventoryKpisPrevious.lowMargin, language, currencyCode, detailTableId: 'inventory-detail', definitions: formulas, format: 'number', goal: 'lower' }),
            createMetricCard({ key: 'highMargin', label: t('highMargin'), current: inventoryKpisCurrent.highMargin, previous: inventoryKpisPrevious.highMargin, language, currencyCode, detailTableId: 'inventory-detail', definitions: formulas, format: 'number' })
        ],
        charts: inventoryCharts,
        tables: inventoryTables,
        primaryTableId: 'inventory-detail',
        heroMetricKeys: ['inventoryValue', 'reorderNeeded', 'expiring30'],
        secondaryMetricKeys: ['turnover', 'stagnant', 'slowMoving', 'fastMoving', 'expired', 'expiring60', 'expiring90', 'lowMargin', 'highMargin'],
        primaryChartId: 'inventory-top-products',
        secondaryTableIds: ['inventory-reorder', 'inventory-expiry'],
        notes: [t('mainWarehouseLabel')]
    };
    const customerSection: ReportSection = {
        id: 'customers',
        title: t('customersAndDebts'),
        subtitle: t('dataSourceCustomers'),
        navigationLabel: t('customersAndDebts'),
        kpis: [
            createMetricCard({ key: 'activeCustomers', label: t('activeCustomers'), current: currentCustomerActive.length, previous: 0, language, currencyCode, detailTableId: 'customers-summary', definitions: formulas, format: 'number' }),
            createMetricCard({ key: 'newCustomers', label: t('newCustomers'), current: newCustomers, previous: 0, language, currencyCode, detailTableId: 'customers-summary', definitions: formulas, format: 'number' }),
            createMetricCard({ key: 'inactiveCustomers', label: t('inactiveCustomers'), current: inactiveCustomers, previous: 0, language, currencyCode, detailTableId: 'customers-summary', definitions: formulas, format: 'number', goal: 'lower' }),
            createMetricCard({ key: 'returnRate', label: t('returnRate'), current: returnRate, previous: 0, language, currencyCode, detailTableId: 'customers-summary', definitions: formulas, format: 'percent' }),
            createMetricCard({ key: 'receivable', label: t('receivable'), current: customerSummaries.reduce((sum, customer) => sum + customer.balance, 0), previous: 0, language, currencyCode, detailTableId: 'customers-summary', definitions: formulas, goal: 'lower' }),
            createMetricCard({ key: 'overCreditLimit', label: t('overCreditLimit'), current: customerSummaries.filter((customer) => customer.creditLimit > 0 && customer.balance > customer.creditLimit).length, previous: 0, language, currencyCode, detailTableId: 'customers-summary', definitions: formulas, format: 'number', goal: 'lower', note: t('dataGapNote') }),
            createMetricCard({ key: 'openInvoices', label: t('openInvoices'), current: customerSummaries.reduce((sum, customer) => sum + customer.openInvoices, 0), previous: 0, language, currencyCode, detailTableId: 'customers-summary', definitions: formulas, format: 'number', goal: 'lower' }),
            createMetricCard({ key: 'averagePurchase', label: t('averagePurchase'), current: currentCustomerActive.length ? currentCustomerActive.reduce((sum, customer) => sum + customer.averagePurchase, 0) / currentCustomerActive.length : 0, previous: 0, language, currencyCode, detailTableId: 'customers-summary', definitions: formulas })
        ],
        charts: customerCharts,
        tables: customerTables,
        primaryTableId: 'customers-summary',
        heroMetricKeys: ['receivable', 'openInvoices', 'activeCustomers'],
        secondaryMetricKeys: ['newCustomers', 'inactiveCustomers', 'returnRate', 'overCreditLimit', 'averagePurchase'],
        primaryChartId: 'customers-aging-buckets',
        secondaryTableIds: ['customers-aging', 'customers-quality'],
        notes: [t('agingUsesDueDate'), t('qualityUsesValidation')]
    };
    const employeeSection: ReportSection = {
        id: 'employees',
        title: t('teamPerformance'),
        subtitle: t('dataSourceEmployees'),
        navigationLabel: t('teamPerformance'),
        kpis: [
            createMetricCard({ key: 'activeEmployees', label: t('activeEmployees'), current: userSummaries.filter((user) => user.sales > 0).length, previous: 0, language, currencyCode, detailTableId: 'employees-summary', definitions: formulas, format: 'number' }),
            createMetricCard({ key: 'totalEmployeeSales', label: t('totalEmployeeSales'), current: userSummaries.reduce((sum, user) => sum + user.sales, 0), previous: 0, language, currencyCode, detailTableId: 'employees-summary', definitions: formulas }),
            createMetricCard({ key: 'totalEmployeeProfit', label: t('totalEmployeeProfit'), current: userSummaries.reduce((sum, user) => sum + user.profit, 0), previous: 0, language, currencyCode, detailTableId: 'employees-summary', definitions: formulas }),
            createMetricCard({ key: 'employeeAvgInvoice', label: t('employeeAvgInvoice'), current: sortedUsers.length ? sortedUsers.reduce((sum, user) => sum + user.averageInvoice, 0) / sortedUsers.length : 0, previous: 0, language, currencyCode, detailTableId: 'employees-summary', definitions: formulas }),
            createMetricCard({ key: 'employeeDiscounts', label: t('employeeDiscounts'), current: userSummaries.reduce((sum, user) => sum + user.discounts, 0), previous: 0, language, currencyCode, detailTableId: 'employees-summary', definitions: formulas, goal: 'lower' }),
            createMetricCard({ key: 'employeeCollected', label: t('employeeCollected'), current: userSummaries.reduce((sum, user) => sum + user.collected, 0), previous: 0, language, currencyCode, detailTableId: 'employees-summary', definitions: formulas }),
            createMetricCard({ key: 'topSellerShare', label: t('topSellerShare'), current: topSellerShare, previous: 0, language, currencyCode, detailTableId: 'employees-summary', definitions: formulas, format: 'percent' })
        ],
        charts: employeeCharts,
        tables: employeeTables,
        primaryTableId: 'employees-summary',
        heroMetricKeys: ['totalEmployeeSales', 'employeeCollected', 'topSellerShare'],
        secondaryMetricKeys: ['activeEmployees', 'totalEmployeeProfit', 'employeeAvgInvoice', 'employeeDiscounts'],
        primaryChartId: 'employees-ranking',
        secondaryTableIds: ['employees-transactions'],
        notes: [t('mainBranchLabel')]
    };
    const tableMap = [...financialTables, ...inventoryTables, ...customerTables, ...employeeTables].reduce<Record<string, ReportTable>>((acc, table) => {
        acc[table.id] = table;
        return acc;
    }, {});
    const insights: ReportInsight[] = [];
    const salesChange = getChangePct(financialCurrent.netSales, financialPrevious.netSales);
    if (salesChange !== null && salesChange <= -10) {
        insights.push({
            id: 'sales-down',
            tone: 'negative',
            title: language === 'english' ? 'Sales are down against the previous period' : 'فروش نسبت به دوره قبل کاهش یافته است',
            description: language === 'english'
                ? `${formatReportPercent(Math.abs(salesChange), language)} drop in net sales was detected.`
                : `${formatReportPercent(Math.abs(salesChange), language)} کاهش در فروش خالص دیده می‌شود.`,
            tab: 'financial',
            tableId: 'financial-transactions',
            priority: 10,
            surface: 'overview'
        });
    }
    if (inventoryKpisCurrent.reorderNeeded > 0) {
        insights.push({
            id: 'reorder-needed',
            tone: 'warning',
            title: language === 'english' ? 'Products need reorder attention' : 'برخی اقلام نیاز به سفارش مجدد دارند',
            description: language === 'english'
                ? `${formatNumber(inventoryKpisCurrent.reorderNeeded, language)} item(s) are already at or below reorder point.`
                : `${formatNumber(inventoryKpisCurrent.reorderNeeded, language)} قلم در سطح سفارش مجدد یا پایین‌تر قرار دارد.`,
            actionLabel: t('openPurchases'),
            tab: 'inventory',
            tableId: 'inventory-reorder',
            priority: 20,
            surface: 'overview'
        });
    }
    if (aging.bucket61 + aging.bucket91 > 0) {
        insights.push({
            id: 'aging-risk',
            tone: 'warning',
            title: language === 'english' ? 'Receivables are aging beyond 60 days' : 'مطالبات بیش از ۶۰ روز معطل مانده‌اند',
            description: language === 'english'
                ? `Outstanding balance older than 60 days equals ${formatReportMoney(aging.bucket61 + aging.bucket91, language, currencyCode)}.`
                : `مانده بیشتر از ۶۰ روز برابر است با ${formatReportMoney(aging.bucket61 + aging.bucket91, language, currencyCode)}.`,
            actionLabel: t('openCustomers'),
            tab: 'customers',
            tableId: 'customers-aging',
            priority: 30,
            surface: 'overview'
        });
    }
    if (salesChange !== null && salesChange > 0) {
        const profitChange = getChangePct(financialCurrent.netProfit, financialPrevious.netProfit);
        if (profitChange !== null && profitChange < 0) {
            insights.push({
                id: 'margin-erosion',
                tone: 'warning',
                title: language === 'english' ? 'Profit is shrinking despite higher sales' : 'با وجود رشد فروش، مفاد کاهش یافته است',
                description: language === 'english'
                    ? 'Margin pressure is visible. Review discounts, COGS, and low-margin products.'
                    : 'فشار بر حاشیهٔ مفاد دیده می‌شود. تخفیف، بهای تمام‌شده و کالاهای کم‌حاشیه را بازبینی کنید.',
                tab: 'financial',
                tableId: 'inventory-detail',
                priority: 40,
                surface: 'advanced'
            });
        }
    }
    if (sortedUsers.length && topSellerShare >= 40) {
        insights.push({
            id: 'top-seller-share',
            tone: 'info',
            title: language === 'english' ? 'One salesperson drives a large share of sales' : 'یک فروشنده سهم بزرگی از فروش را در اختیار دارد',
            description: language === 'english'
                ? `${sortedUsers[0].name} generated ${formatReportPercent(topSellerShare, language)} of net sales.`
                : `${sortedUsers[0].name} ${formatReportPercent(topSellerShare, language)} از فروش خالص را ایجاد کرده است.`,
            tab: 'employees',
            tableId: 'employees-summary',
            priority: 50,
            surface: 'overview'
        });
    }
    if (qualityIssues.length > 0) {
        insights.push({
            id: 'customer-quality',
            tone: 'warning',
            title: language === 'english' ? 'Customer master data needs cleanup' : 'داده‌های پایه مشتریان نیاز به پاک‌سازی دارد',
            description: language === 'english'
                ? `${formatNumber(qualityIssues.length, language)} data quality issue(s) can affect follow-up and collections.`
                : `${formatNumber(qualityIssues.length, language)} ایراد کیفیت داده می‌تواند پیگیری و وصول را آسیب بزند.`,
            actionLabel: t('openCustomers'),
            tab: 'customers',
            tableId: 'customers-quality',
            priority: 60,
            surface: 'advanced'
        });
    }
    if (filteredExpensesCurrent.length === 0) {
        insights.push({
            id: 'no-expenses',
            tone: 'info',
            title: language === 'english' ? 'Expense visibility is incomplete for this period' : 'دید مصارف در این بازه کامل نیست',
            description: t('noExpenseData'),
            actionLabel: t('registerExpense'),
            tab: 'financial',
            tableId: 'financial-expenses',
            priority: 70,
            surface: 'advanced'
        });
    }
    const sortedInsights = [...insights].sort((left, right) => left.priority - right.priority || left.title.localeCompare(right.title, language === 'english' ? 'en' : 'fa'));
    const attentionRows = [
        ...filteredInvoicesCurrent
            .filter((invoice) => invoice.receivable > 0)
            .sort((a, b) => b.receivable - a.receivable)
            .slice(0, 2)
            .map((invoice, index) => ({
            id: `attention-receivable-${invoice.id}`,
            area: t('salesAndMoney'),
            item: `${invoice.customerName} · #${invoice.invoiceNumber}`,
            reason: index === 0 ? t('receivableOverview') : t('openInvoices'),
            note: formatReportMoney(invoice.receivable, language, currencyCode),
            priority: 10 + index,
            sourceTableId: 'financial-receivables'
        })),
        ...inventoryRows
            .filter((item) => item.stockQty <= item.reorderPoint)
            .sort((a, b) => a.stockQty - b.stockQty)
            .slice(0, 2)
            .map((item, index) => ({
            id: `attention-reorder-${item.medicineId}`,
            area: t('stockAndAlerts'),
            item: item.medicineName,
            reason: t('reorderNeeded'),
            note: `${formatNumber(item.stockQty, language)} / ${formatNumber(item.reorderPoint, language)}`,
            priority: 20 + index,
            sourceTableId: 'inventory-reorder'
        })),
        ...inventoryRows
            .filter((item) => item.expiredBatchCount > 0 || item.expiring30Count > 0)
            .sort((a, b) => (b.expiredBatchCount + b.expiring30Count) - (a.expiredBatchCount + a.expiring30Count))
            .slice(0, 2)
            .map((item, index) => ({
            id: `attention-expiry-${item.medicineId}`,
            area: t('stockAndAlerts'),
            item: item.medicineName,
            reason: item.expiredBatchCount > 0 ? t('expired') : t('expiring30'),
            note: formatNumber(item.expiredBatchCount > 0 ? item.expiredBatchCount : item.expiring30Count, language),
            priority: 30 + index,
            sourceTableId: 'inventory-expiry'
        })),
        ...customerSummaries
            .filter((customer) => customer.balance > 0)
            .sort((a, b) => b.balance - a.balance)
            .slice(0, 2)
            .map((customer, index) => ({
            id: `attention-customer-${customer.id}`,
            area: t('customersAndDebts'),
            item: customer.name,
            reason: t('receivableOverview'),
            note: formatReportMoney(customer.balance, language, currencyCode),
            priority: 40 + index,
            sourceTableId: 'customers-summary'
        })),
        ...sortedUsers
            .filter((user) => user.invoiceCount === 0)
            .slice(0, 2)
            .map((user, index) => ({
            id: `attention-employee-${user.id}`,
            area: t('teamPerformance'),
            item: user.name,
            reason: t('activeEmployees'),
            note: language === 'english' ? 'No invoice activity in this range' : 'در این بازه فاکتوری ثبت نشده است',
            priority: 50 + index,
            sourceTableId: 'employees-summary'
        }))
    ]
        .sort((left, right) => left.priority - right.priority)
        .slice(0, 8)
        .map(({ priority, ...row }) => row);
    const attentionTable: ReportTable = {
        id: 'overview-attention',
        title: t('attentionRequired'),
        description: attentionRows.length ? t('comparisonPrevious') : t('noUrgentItems'),
        columns: [
            { key: 'area', label: t('attentionArea') },
            { key: 'item', label: t('attentionItem') },
            { key: 'reason', label: t('attentionReason') },
            { key: 'note', label: t('note') }
        ],
        rows: attentionRows,
        emptyTitle: t('attentionRequired'),
        emptyDescription: t('noUrgentItems')
    };
    tableMap[attentionTable.id] = attentionTable;
    const appliedFilters: AppliedFilterChip[] = [
        { key: 'range', label: t('currentRange'), value: range.label },
        filters.userId && filters.userId !== ALL_VALUE ? { key: 'userId', label: t('salesperson'), value: options.users.find((item) => item.value === filters.userId)?.label || filters.userId } : null,
        filters.customerId && filters.customerId !== ALL_VALUE ? { key: 'customerId', label: t('customer'), value: options.customers.find((item) => item.value === filters.customerId)?.label || filters.customerId } : null,
        filters.productType && filters.productType !== ALL_VALUE ? { key: 'productType', label: t('productType'), value: options.productTypes.find((item) => item.value === filters.productType)?.label || filters.productType } : null,
        filters.manufacturer && filters.manufacturer !== ALL_VALUE ? { key: 'manufacturer', label: t('brand'), value: filters.manufacturer } : null,
        filters.supplierId && filters.supplierId !== ALL_VALUE ? { key: 'supplierId', label: t('supplier'), value: options.suppliers.find((item) => item.value === filters.supplierId)?.label || filters.supplierId } : null,
        filters.paymentStatus && filters.paymentStatus !== ALL_VALUE ? { key: 'paymentStatus', label: t('payment'), value: options.paymentStatuses.find((item) => item.value === filters.paymentStatus)?.label || filters.paymentStatus } : null,
        filters.salesMode && filters.salesMode !== ALL_VALUE ? { key: 'salesMode', label: t('salesMode'), value: options.salesModes.find((item) => item.value === filters.salesMode)?.label || filters.salesMode } : null,
        query ? { key: 'query', label: t('search'), value: filters.query || '' } : null
    ].filter(Boolean) as AppliedFilterChip[];
    const allInvoicesCount = normalizedInvoices.length;
    const allActivityCount = normalizedInvoices.filter((invoice) => hasValidActivityDate(invoice.dateIso)).length +
        safeArray(expenses).filter((expense) => !expense.isDeleted && hasValidActivityDate(expense.date)).length +
        safeArray(purchases).filter((purchase) => !purchase.isDeleted && hasValidActivityDate(purchase.date)).length;
    const currentInvoiceCount = filteredInvoicesCurrent.length;
    const currentActivityCount = currentInvoiceCount + filteredExpensesCurrent.length + filteredPurchasesCurrent.length;
    const state = allActivityCount === 0 ? 'empty' : currentActivityCount === 0 ? 'filteredOut' : 'ready';
    const findMetric = (section: ReportSection, key: string) => section.kpis.find((metric) => metric.key === key);
    const overviewMetrics = [
        findMetric(financialSection, 'netSales'),
        findMetric(financialSection, 'collected'),
        findMetric(financialSection, 'receivable'),
        createMetricCard({
            key: 'inventoryAlerts',
            label: t('inventoryAlertsOverview'),
            current: inventoryAlertsCurrent,
            previous: inventoryAlertsPrevious,
            language,
            currencyCode,
            detailTableId: 'overview-attention',
            definitions: formulas,
            format: 'number',
            goal: 'lower',
            displayTier: 'overview'
        })
    ].filter(Boolean) as ReportMetricCard[];
    const overviewInsights = sortedInsights
        .filter((insight) => insight.surface !== 'advanced')
        .concat(sortedInsights.filter((insight) => insight.surface === 'advanced'))
        .filter((insight, index, collection) => collection.findIndex((candidate) => candidate.id === insight.id) === index)
        .slice(0, 3);
    const overviewFallbackInsights: ReportInsight[] = [];
    const overviewSalesMetric = overviewMetrics.find((metric) => metric.key === 'netSales');
    const overviewReceivableMetric = overviewMetrics.find((metric) => metric.key === 'receivable');
    if (!overviewInsights.some((insight) => insight.id === 'overview-sales-activity') && overviewSalesMetric) {
        overviewFallbackInsights.push({
            id: 'overview-sales-activity',
            tone: overviewSalesMetric.value > 0 ? 'info' : 'warning',
            title: language === 'english' ? 'Sales activity is visible for this range' : 'فعالیت فروش در این بازه ثبت شده است',
            description: overviewSalesMetric.value > 0
                ? language === 'english'
                    ? `${overviewSalesMetric.formattedValue} of sales was recorded in the selected period.`
                    : `${overviewSalesMetric.formattedValue} فروش در بازه انتخاب‌شده ثبت شده است.`
                : language === 'english'
                    ? 'No sales have been recorded in the selected period yet.'
                    : 'در بازه انتخاب‌شده هنوز فروشی ثبت نشده است.',
            tab: 'financial',
            tableId: 'financial-transactions',
            priority: 80,
            surface: 'overview'
        });
    }
    if (!overviewInsights.some((insight) => insight.id === 'overview-receivable-status') && overviewReceivableMetric) {
        overviewFallbackInsights.push({
            id: 'overview-receivable-status',
            tone: overviewReceivableMetric.value > 0 ? 'warning' : 'positive',
            title: language === 'english' ? 'Receivable balance needs monitoring' : 'مانده مطالبات نیاز به پیگیری دارد',
            description: overviewReceivableMetric.value > 0
                ? language === 'english'
                    ? `${overviewReceivableMetric.formattedValue} remains unpaid in the current range.`
                    : `${overviewReceivableMetric.formattedValue} از مطالبات این بازه هنوز وصول نشده است.`
                : language === 'english'
                    ? 'All receivables in the current range are settled.'
                    : 'مطالبات این بازه به‌طور کامل تسویه شده است.',
            tab: 'customers',
            tableId: 'customers-summary',
            priority: 90,
            surface: 'overview'
        });
    }
    if (!overviewInsights.some((insight) => insight.id === 'overview-inventory-status')) {
        overviewFallbackInsights.push({
            id: 'overview-inventory-status',
            tone: inventoryAlertsCurrent > 0 ? 'warning' : 'positive',
            title: language === 'english' ? 'Inventory alerts are under review' : 'هشدارهای موجودی در حال پیگیری است',
            description: inventoryAlertsCurrent > 0
                ? language === 'english'
                    ? `${inventoryAlertsCurrent} inventory alerts need action in the current range.`
                    : `${inventoryAlertsCurrent} هشدار موجودی در بازه فعلی نیاز به اقدام دارد.`
                : language === 'english'
                    ? 'No urgent inventory alert is open in the current range.'
                    : 'در بازه فعلی هشدار فوری موجودی ثبت نشده است.',
            tab: 'inventory',
            tableId: 'inventory-detail',
            priority: 100,
            surface: 'overview'
        });
    }
    const overview: ReportOverview = {
        primaryMetrics: overviewMetrics,
        topInsights: overviewInsights.concat(overviewFallbackInsights).slice(0, 3),
        focusChart: {
            ...financialCharts[0],
            id: 'overview-focus-chart',
            title: t('trendSales')
        },
        attentionTable
    };
    const summaryCards: ReportSummaryCard[] = overview.primaryMetrics.map((metric) => ({
        key: metric.key,
        label: metric.label,
        value: metric.formattedValue,
        tone: metric.tone
    }));
    return {
        reportId: globalThis.crypto?.randomUUID?.() || `report-${Date.now()}`,
        language,
        currencyCode,
        currencyLabel: getCurrencyLabel(currencyCode, language),
        dateTimeSettings: settings?.dateTimeSettings,
        title: t('title'),
        subtitle: t('subtitle'),
        state,
        stateTitle: state === 'empty' ? t('emptyTitle') : state === 'filteredOut' ? t('filteredTitle') : t('executiveSummary'),
        stateDescription: state === 'empty' ? t('emptyDescription') : state === 'filteredOut' ? t('filteredDescription') : t('comparisonPrevious'),
        generatedAt: now.toISOString(),
        lastDataSync: latestTimestamp,
        range,
        appliedFilters,
        options,
        formulas,
        summaryCards,
        insights: sortedInsights,
        overview,
        sections: {
            financial: financialSection,
            inventory: inventorySection,
            customers: customerSection,
            employees: employeeSection
        },
        tablesById: tableMap,
        metadata: {
            storeName,
            generatedBy: activeAppUser?.name || t('generatedBySystem'),
            branchLabel: t('singleBranch'),
            warehouseLabel: t('singleWarehouse'),
            comparisonEnabled: !!filters.compareWithPrevious,
            currentInvoiceCount,
            allInvoiceCount: allInvoicesCount
        }
    };
};
export const getReportTranslator = createTranslator;
export const getReportLabel = (language: Language, key: keyof typeof REPORT_TEXT.english) => createTranslator(language)(key);
export const formatReportDateTime = formatDateTime;
