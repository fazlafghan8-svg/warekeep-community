export type LogTag = 'APP' | 'IPC' | 'SYNC' | 'STORAGE' | 'AUTH' | 'UI' | 'PERFORMANCE' | 'CRASH';
// UI Sync status (includes legacy aliases 'success'/'error')
export type SyncStatus = 'ok' | 'syncing' | 'offline' | 'success' | 'error';
export type CalendarSystem = 'gregorian' | 'solar_afghan' | 'solar_iranian' | 'hijri';
export type DateTimeSection = 'medicineExpiry' | 'sales' | 'purchases' | 'expenses' | 'customers' | 'payroll' | 'treasury' | 'reports' | 'dashboard' | 'system';
export type TimeFormat = '12h' | '24h';
export type AppTimeZone = 'local' | 'Asia/Kabul' | 'UTC';
export type DateMonthDisplay = 'name' | 'number';
export interface DateTimeSettings {
    globalCalendar: CalendarSystem;
    sectionCalendars: Partial<Record<DateTimeSection, CalendarSystem>>;
    monthDisplay: DateMonthDisplay;
    sectionMonthDisplays: Partial<Record<DateTimeSection, DateMonthDisplay>>;
    timeFormat: TimeFormat;
    timeZone: AppTimeZone;
}
export type MedicineType = 'Tablet' | 'Capsule' | 'Syrup' | 'Suspension' | 'Ampoule' | 'Injection' | 'Vial' | 'Infusion' | 'Powder' | 'Granules' | 'Sachet' | 'Oral Solution' | 'Drop' | 'Oral Drops' | 'Eye Drops' | 'Ear Drops' | 'Nasal Drops' | 'Spray' | 'Nasal Spray' | 'Inhaler' | 'Nebulizer Solution' | 'Ointment' | 'Cream' | 'Gel' | 'Lotion' | 'Foam' | 'Suppository' | 'Patch' | 'Mouthwash' | 'Gargle' | 'Serum' | 'Shampoo' | 'Soap' | 'Equipment' | 'Other';
export type MedicineUnit = 'بسته' | 'بوتل' | 'ورق' | 'دانه' | 'کارتن' | 'تیوپ' | 'ویال' | 'قوطی' | 'ست' | (string & {});
// ... (Rest of types) ...
export interface BatchHistory {
    date: string;
    action: string;
    details: string;
}
export type BatchAvailabilityStatus = 'available' | 'quarantine' | 'rejected';
export type BatchOwnershipType = 'store' | 'partner' | 'shared' | 'consignment';
export type StockEntryType = 'store_purchase' | 'partner_goods_capital' | 'partner_consignment' | 'sales_return' | 'inventory_adjustment';
// NEW: Batch + Expiry Traceability fields stay optional for legacy inventory records.
export interface Batch {
    id: string;
    batchNumber: string;
    quantity: number;
    expiryDate: string;
    purchasePrice: number;
    supplierId?: string;
    purchaseId?: string;
    purchaseLineId?: string;
    purchaseItemIndex?: number;
    ownershipType?: BatchOwnershipType;
    ownerPartnerId?: string;
    sharedOwnerPartnerIds?: string[];
    agreedPartnerValue?: number;
    suggestedSalePrice?: number;
    sourceEntryType?: StockEntryType;
    sourceDocumentNumber?: string;
    receivedQuantity?: number;
    receivedAt?: string;
    traceSource?: 'legacy' | 'manual' | 'purchase_receipt' | 'purchase' | 'inventory_adjustment' | 'vendor_return' | 'sale_recovery';
    sourceReceiptId?: string;
    linkedReturnId?: string;
    lastMovementAt?: string;
    availabilityStatus?: BatchAvailabilityStatus;
    availabilityReason?: string;
    availabilityChangedAt?: string;
    location?: {
        rack: string;
        shelf: string;
    };
    history: BatchHistory[];
}
export interface MedicineClinicalSummary {
    composition: string;
    use: string;
    dose: string;
    mechanism: string;
    sideEffects?: string;
    caution: string;
    generatedAt?: string;
}
export type ProductBaseUnit = 'piece' | 'tablet' | 'ml' | 'bottle' | string;
export interface ProductSaleUnit {
    unitName: string;
    label?: string;
    conversionFactor: number;
    barcode?: string;
    isDefault?: boolean;
}
export type CommissionRuleSource = 'none' | 'medicine-user' | 'medicine' | 'supplier-user' | 'supplier' | 'manufacturer-user' | 'manufacturer' | 'medicine-type-user' | 'medicine-type';
export type CommissionRuleMode = 'adjustment' | 'override';
export interface MedicineCommissionRule {
    id: string;
    userId?: string;
    adjustmentPercent: number;
    enabled?: boolean;
    note?: string;
    updatedAt?: string;
}
export interface ProductCommissionAdjustmentRule {
    id: string;
    target: 'medicineType' | 'manufacturer' | 'supplier';
    targetValue: string;
    targetLabel?: string;
    userId?: string;
    adjustmentPercent: number;
    mode?: CommissionRuleMode;
    enabled?: boolean;
    note?: string;
    updatedAt?: string;
}
export interface Medicine {
    id: string;
    name: string;
    genericName?: string;
    manufacturer: string;
    type: MedicineType;
    unit: MedicineUnit;
    baseUnit?: ProductBaseUnit;
    saleUnits?: ProductSaleUnit[];
    itemsPerBox?: number;
    description?: string;
    clinicalSummary?: MedicineClinicalSummary;
    barcode?: string;
    preferredSupplierId?: string;
    allowFractionalQuantity?: boolean;
    batches: Batch[];
    salePrices: {
        retail: number;
        wholesale: number;
        bulk: number;
    };
    commissionRules?: MedicineCommissionRule[];
    lowStockThreshold: number;
    isDeleted?: boolean;
    updatedAt?: string;
}
export interface CustomerTransaction {
    id: string;
    date: string;
    type: 'invoice' | 'payment' | 'return' | 'initial' | 'debt_manual';
    amount: number;
    balanceAfter: number;
    description: string;
    referenceId?: string;
    idempotencyKey?: string;
    isVoided?: boolean;
    voidedAt?: string;
    voidReason?: string;
    supersededBy?: string;
}
export interface Customer {
    id: string;
    name: string;
    phone: string;
    address?: string;
    balance: number;
    transactions: CustomerTransaction[];
    isDeleted?: boolean;
    updatedAt?: string;
}
// NEW: Supplier Ledger transaction typing now covers purchase receipts, partial payments, and vendor credits.
export type SupplierTransactionType = 'purchase' | 'payment' | 'return' | 'vendor_credit' | 'initial';
export interface SupplierTransaction {
    id: string;
    date: string;
    type: SupplierTransactionType;
    amount: number;
    balanceAfter: number;
    description: string;
    referenceId?: string;
    purchaseId?: string;
    receiptId?: string;
    vendorCreditId?: string;
    batchId?: string;
    method?: 'cash' | 'credit' | 'mixed' | 'bank_transfer' | 'card' | 'cheque';
    dueDate?: string;
    recordedBy?: string;
    note?: string;
}
export interface AuditTrailEntry {
    id: string;
    action: string;
    date: string;
    actorId?: string;
    actorName: string;
    note?: string;
}
export interface Supplier {
    id: string;
    code?: string;
    name: string;
    phone: string;
    companyName?: string;
    contactPerson?: string;
    email?: string;
    address?: string;
    paymentTerms?: string;
    notes?: string;
    openingBalance?: number;
    status?: 'active' | 'inactive' | 'blocked';
    balance: number;
    transactions: SupplierTransaction[];
    createdAt?: string;
    createdBy?: string;
    updatedAt?: string;
    updatedBy?: string;
    lastPurchaseDate?: string;
    lastInteractionDate?: string;
    auditTrail?: AuditTrailEntry[];
    isDeleted?: boolean;
}
export type SupplierDeleteMode = 'conditional' | 'purge';
export interface PurchaseItem {
    lineId?: string;
    medicineId: string;
    medicineName?: string;
    partnerId?: string;
    ownerPartnerId?: string;
    stockEntryType?: StockEntryType;
    ownershipType?: BatchOwnershipType;
    barcode?: string;
    unit?: string;
    baseQuantity?: number;
    purchaseUnitName?: string;
    purchaseUnitConversionFactor?: number;
    baseUnit?: ProductBaseUnit;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    purchasePrice: number;
    agreedPartnerValue?: number;
    purchaseType?: 'normal' | 'bonus' | 'sample';
    sellPriceRetail?: number;
    suggestedSalePrice?: number;
    sourceDocumentNumber?: string;
    notes?: string;
    lineTotal?: number;
    minimumOrderQuantity?: number;
    suggestedQuantity?: number;
}
export type PurchaseWorkflowStatus = 'draft' | 'approved' | 'received' | 'cancelled';
export type PurchasePaymentStatus = 'unpaid' | 'partial' | 'paid';
export type PurchasePaymentMethod = 'cash' | 'credit' | 'mixed' | 'bank_transfer' | 'card' | 'cheque';
// NEW: Partial Receipt support with non-breaking receipt status values.
export type PurchaseReceiptStatus = 'not_received' | 'partial' | 'received';
// NEW: Vendor Credit / Return resolution is optional so legacy purchase records remain valid.
export type VendorCreditResolution = 'vendor_credit' | 'refund' | 'replacement';
export type PurchaseOperationalStage = 'ordered' | 'partially_received' | 'received' | 'billed' | 'paid' | 'short_closed';
export interface PurchasePayment {
    id: string;
    date: string;
    amount: number;
    method: PurchasePaymentMethod;
    reference?: string;
    note?: string;
    recordedBy?: string;
}
export interface PurchaseAttachment {
    id: string;
    name: string;
    type: string;
    size: number;
    /**
     * @deprecated Stage 10 — base64 `data:` URLs are retired (no file bytes in DB rows or sync
     * payloads). Upload via `fileStorageV2.uploadFile()` and reference the returned id in `fileId`.
     * Retained only for backward-compat reads of not-yet-migrated records; new attachments must NOT
     * set this. Actual removal waits for the post-production-cutover cleanup (Stage 11+).
     */
    dataUrl?: string;
    /** Stage 10: reference to a file stored via backend-v2 (`POST /api/v1/files`). Preferred over `dataUrl`. */
    fileId?: string;
    uploadedAt: string;
}
// NEW: Purchase Receipt line-level traceability back to medicine, batch, supplier, and partial receipt quantity.
export interface PurchaseReceiptItem {
    medicineId: string;
    lineId?: string;
    purchaseItemIndex?: number;
    batchId?: string;
    partnerId?: string;
    ownerPartnerId?: string;
    stockEntryType?: StockEntryType;
    ownershipType?: BatchOwnershipType;
    batchNumber?: string;
    expiryDate?: string;
    unit?: string;
    quantity: number;
    baseQuantity?: number;
    purchaseUnitName?: string;
    purchaseUnitConversionFactor?: number;
    baseUnit?: ProductBaseUnit;
    purchasePrice?: number;
    agreedPartnerValue?: number;
    suggestedSalePrice?: number;
    sourceDocumentNumber?: string;
    supplierId?: string;
}
export interface PurchaseReceipt {
    id: string;
    date: string;
    items: PurchaseReceiptItem[];
    note?: string;
    recordedBy?: string;
    supplierLiabilityImpact?: boolean;
}
// NEW: Vendor Credit / Return keeps the stock-to-supplier link without replacing existing purchase items.
export interface VendorCreditItem {
    medicineId: string;
    lineId?: string;
    purchaseItemIndex?: number;
    batchId?: string;
    batchNumber?: string;
    quantity: number;
    amount?: number;
}
export interface VendorCredit {
    id: string;
    date: string;
    items: VendorCreditItem[];
    amount: number;
    note?: string;
    recordedBy?: string;
    supplierId?: string;
    purchaseId?: string;
    batchId?: string;
    resolution?: VendorCreditResolution;
}
// NEW: Purchase record extensions for receipts, credits, partial settlement, and safe inventory commitment.
export interface Purchase {
    id: string;
    supplierId: string;
    partnerId?: string;
    stockEntryType?: StockEntryType;
    ownershipType?: BatchOwnershipType;
    invoiceNumber?: string;
    date: string;
    dueDate?: string;
    items: PurchaseItem[];
    subtotalAmount?: number;
    discountAmount?: number;
    taxAmount?: number;
    shippingAmount?: number;
    extraChargesAmount?: number;
    totalAmount: number;
    paidAmount: number;
    creditedAmount?: number;
    remainingAmount: number;
    paymentMethod?: PurchasePaymentMethod;
    paymentStatus?: PurchasePaymentStatus;
    workflowStatus?: PurchaseWorkflowStatus;
    receiptStatus?: PurchaseReceiptStatus;
    status: 'paid' | 'partial' | 'credit' | 'draft' | 'approved' | 'received' | 'cancelled';
    destinationWarehouse?: string;
    notes?: string;
    payments?: PurchasePayment[];
    receipts?: PurchaseReceipt[];
    vendorCredits?: VendorCredit[];
    inventoryCommitted?: boolean;
    receivedAt?: string;
    shortClosedAt?: string;
    shortCloseReason?: string;
    attachments?: PurchaseAttachment[];
    createdAt?: string;
    createdBy?: string;
    updatedAt?: string;
    updatedBy?: string;
    deletedAt?: string;
    deletedBy?: string;
    auditTrail?: AuditTrailEntry[];
    isDeleted?: boolean;
}
export type StockMovementType = 'sale' | 'sale_return' | 'invoice_edit_delta' | 'invoice_delete_reversal' | 'purchase_receipt' | 'purchase_apply' | 'purchase_delete_reversal' | 'purchase_update_reversal' | 'manual_adjustment' | 'waste' | 'vendor_return' | 'reconciliation';
export type StockMovementReferenceType = 'invoice' | 'invoice_return' | 'invoice_delete' | 'purchase' | 'purchase_receipt' | 'purchase_delete' | 'batch_adjustment' | 'waste' | 'vendor_return' | 'system';
export interface StockMovement {
    id: string;
    medicineId: string;
    batchId: string;
    type: StockMovementType;
    quantityBaseUnit: number;
    referenceType: StockMovementReferenceType;
    referenceId: string;
    previousStock: number;
    newStock: number;
    createdAt: string;
    idempotencyKey?: string;
    reversed?: boolean;
    voided?: boolean;
    metadata?: Record<string, unknown>;
}
export type SalesMode = 'retail' | 'wholesale' | 'bulk';
export interface InvoiceItem {
    lineId?: string;
    medicineId: string;
    batchId: string;
    partnerId?: string;
    batchOwnershipType?: BatchOwnershipType;
    quantity: number;
    baseQuantity?: number;
    saleUnitName?: string;
    saleUnitLabel?: string;
    saleUnitConversionFactor?: number;
    baseUnit?: ProductBaseUnit;
    price: number;
    discountAmount?: number;
    discountPercent?: number;
    costPrice?: number;
    partnerCostPrice?: number;
    partnerProfitShare?: number;
    priceMode?: SalesMode;
    isManualPriceOverride?: boolean;
    commissionAdjustmentPercent?: number;
    commissionOverridePercent?: number;
    commissionRuleMode?: CommissionRuleMode;
    commissionRuleSource?: CommissionRuleSource;
    commissionRuleLabel?: string;
    displayGroupId?: string;
    isAutoBatchSplit?: boolean;
}
export type PaymentStatus = 'paid' | 'partial' | 'unpaid' | 'cash' | 'credit' | 'card' | 'mixed';
export interface InvoicePaymentBreakdown {
    cash: number;
    card: number;
    credit: number;
    method: 'cash' | 'card' | 'mixed' | 'credit' | 'partial';
}
export interface SalesReturnItem {
    lineId?: string;
    medicineId: string;
    batchId: string;
    quantity: number;
    baseQuantity?: number;
    saleUnitName?: string;
    saleUnitLabel?: string;
    saleUnitConversionFactor?: number;
    baseUnit?: ProductBaseUnit;
    price: number;
    costPrice?: number;
}
export interface SalesReturn {
    id: string;
    invoiceId: string;
    customerId: string;
    date: string;
    items: SalesReturnItem[];
    subtotal: number;
    taxRefund: number;
    discountRefund: number;
    totalRefund: number;
    amountRefunded: number;
    debtReduction: number;
    sourceLineId?: string;
    sourceItemIndex?: number;
    lineDiscountRefund?: number;
    invoiceDiscountRefund?: number;
    paymentMethod?: 'cash' | 'card' | 'mixed' | 'credit';
    reason?: string;
    isDeleted?: boolean;
    isVoided?: boolean;
    voidedAt?: string;
    voidReason?: string;
    supersededBy?: string;
    updatedAt?: string;
}
export interface Invoice {
    id: string;
    idempotencyKey?: string;
    invoiceNumber?: number;
    customerId: string;
    userId?: string;
    salesMode?: SalesMode;
    items: InvoiceItem[];
    total: number;
    tax: number;
    taxRate?: number;
    discount: number;
    lineDiscountTotal?: number;
    finalAmount: number;
    currency?: Currency;
    paymentBreakdown?: InvoicePaymentBreakdown;
    returns?: SalesReturn[];
    date: string;
    dueDate?: string;
    paymentStatus: PaymentStatus;
    amountPaid: number;
    remainingAmount: number;
    isDeleted?: boolean;
    updatedAt?: string;
}
export type InvoiceCustomerEditMode = 'keep' | 'rename_global' | 'transfer_ownership';
export interface InvoiceUpdateRequest {
    invoice: Invoice;
    customerEditMode?: InvoiceCustomerEditMode;
    customerName?: string;
    targetCustomerId?: string;
    editReason?: string;
    allowReturnedLineReassignment?: boolean;
    idempotencyKey?: string;
}
export interface Expense {
    id: string;
    title: string;
    amount: number;
    category: string;
    date: string;
    description?: string;
    recurrence?: 'none' | 'monthly' | 'weekly';
    nextDueDate?: string;
    attachments?: PurchaseAttachment[];
    userId?: string;
    partnerId?: string;
    isDeleted?: boolean;
    updatedAt?: string;
}
export type PartnerStatus = 'active' | 'inactive' | 'settled';
export type PartnerCapitalType = 'cash' | 'goods' | 'mixed' | 'consignment' | 'general_profit_share';
export type PartnerProfitRuleType = 'own_goods_100' | 'share_percentage' | 'store_commission_percent' | 'store_commission_fixed' | 'general_profit_share' | 'custom';
export type PartnerSettlementPeriod = 'daily' | 'weekly' | 'monthly' | 'custom';
export type PartnerLedgerSource = 'partner' | 'purchase' | 'sale' | 'return' | 'adjustment' | 'settlement' | 'expense' | 'system';
export type PartnerLedgerEntryType = 'capital_in' | 'goods_capital' | 'goods_received' | 'sale_revenue' | 'cost_of_goods_sold' | 'gross_profit' | 'partner_profit_share' | 'store_profit_share' | 'payment' | 'withdrawal' | 'expense_share' | 'profit_share' | 'sales_return' | 'waste' | 'expired_stock' | 'adjustment' | 'settlement';
export interface PartnerProfitRule {
    type: PartnerProfitRuleType;
    sharePercentage?: number;
    storeCommissionPercent?: number;
    storeCommissionFixedAmount?: number;
    customNote?: string;
}
export interface PartnerDocumentRef {
    id: string;
    name: string;
    type?: string;
    url?: string;
    uploadedAt?: string;
}
export interface PartnerLedgerEntry {
    id: string;
    date: string;
    type: PartnerLedgerEntryType;
    direction: 'in' | 'out';
    amount: number;
    debit?: number;
    credit?: number;
    balanceAfter?: number;
    source?: PartnerLedgerSource;
    description: string;
    referenceId?: string;
    referenceItemId?: string;
    recordedBy?: string;
    auditTrail?: AuditTrailEntry[];
    metadata?: Record<string, unknown>;
}
export interface Partner {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    capitalType?: PartnerCapitalType;
    sharePercentage?: number;
    openingGoodsCapital?: number;
    openingCapital: number;
    profitRule?: PartnerProfitRule;
    settlementPeriod?: PartnerSettlementPeriod;
    status: PartnerStatus;
    notes?: string;
    documents?: PartnerDocumentRef[];
    ledger: PartnerLedgerEntry[];
    createdAt?: string;
    updatedAt?: string;
    isDeleted?: boolean;
}
export interface PartnerContributionItem {
    id: string;
    partnerId: string;
    medicineId: string;
    medicineName?: string;
    batchId?: string;
    batchNumber: string;
    expiryDate?: string;
    quantity: number;
    unit?: string;
    purchasePrice: number;
    agreedPartnerValue: number;
    suggestedSalePrice?: number;
    stockEntryType: StockEntryType;
    sourceDocumentNumber?: string;
    notes?: string;
}
export interface PartnerContribution {
    id: string;
    partnerId: string;
    date: string;
    type: 'cash' | 'goods' | 'mixed' | 'consignment';
    cashAmount?: number;
    goodsValue?: number;
    sourceDocumentNumber?: string;
    notes?: string;
    items?: PartnerContributionItem[];
    createdAt?: string;
    recordedBy?: string;
}
export interface PartnerSettlement {
    id: string;
    partnerId: string;
    period: PartnerSettlementPeriod;
    fromDate: string;
    toDate: string;
    openingCapital: number;
    goodsCapital: number;
    salesTotal: number;
    costTotal: number;
    grossProfit: number;
    partnerShare: number;
    storeShare: number;
    paymentsTotal: number;
    withdrawalsTotal: number;
    lossesTotal: number;
    remainingStockValue: number;
    payableAmount: number;
    receivableAmount: number;
    finalBalance: number;
    lockedAt?: string;
    reversedAt?: string;
    reversalReason?: string;
    createdAt?: string;
    createdBy?: string;
}
// Treasury / Cash Register types
export type TreasuryCurrency = 'AFN' | 'USD' | 'EUR' | 'IRR' | 'PKR' | 'INR';
export type TreasuryTransactionType = 'sale_income' | 'sales_return_refund' | 'customer_payment' | 'expense_out' | 'purchase_payment' | 'payroll_out' | 'bank_deposit' | 'cash_withdrawal' | 'petty_cash' | 'external_income' | 'currency_exchange' | 'opening_balance' | 'adjustment';
/**
 * A treasury container (cash box / bank account) — backend-v2 migration 0005 `treasury_accounts`.
 * Shaped like a branch: a business-scoped parent that treasury rows point at. It deliberately
 * carries NO balance — the treasury balance is DERIVED per currency (see Treasury.tsx), never stored.
 * There is no account-selection UI at this stage: the server resolves a missing accountId to the
 * seeded default ("General Treasury"), so the current single-cash-box UX is unchanged.
 */
export interface TreasuryAccount {
    id: string;
    name: string;
    accountType: 'cash' | 'bank';
    currency: TreasuryCurrency;
    isDefault: boolean;
    isSystem: boolean;
    isDeleted?: boolean;
    updatedAt?: string;
}
export interface TreasuryTransaction {
    id: string;
    date: string;
    type: TreasuryTransactionType;
    direction: 'in' | 'out';
    amount: number;
    currency: TreasuryCurrency;
    convertedAmount?: number;
    exchangeRate?: number;
    targetCurrency?: TreasuryCurrency;
    description: string;
    referenceId?: string;
    referenceType?: 'invoice' | 'expense' | 'purchase' | 'payroll' | 'customer' | 'supplier' | 'manual';
    category?: string;
    userId?: string;
    userName?: string;
    note?: string;
    isDeleted?: boolean;
    updatedAt?: string;
    // Optional: NULL server-side means "the business default account", which the server resolves on
    // write. Rows that predate migration 0005 simply have none.
    accountId?: string;
}
export interface TreasuryCashCount {
    id: string;
    date: string;
    expectedBalance: number;
    actualBalance: number;
    difference: number;
    currency: TreasuryCurrency;
    note?: string;
    userId?: string;
    userName?: string;
    updatedAt?: string;
    // See TreasuryTransaction.accountId.
    accountId?: string;
}
export interface TreasuryExchangeRate {
    from: TreasuryCurrency;
    to: TreasuryCurrency;
    rate: number;
    updatedAt: string;
}
// NEW: Audit Trail entry model for stock-affecting procurement actions.
export interface DomainAuditEntry {
    id: string;
    timestamp: string;
    actorId?: string;
    actorName: string;
    action: string;
    entityType: 'purchase' | 'purchase_receipt' | 'supplier' | 'supplier_ledger' | 'vendor_credit' | 'batch' | 'inventory_adjustment' | 'stock' | 'invoice' | 'customer';
    entityId: string;
    beforeSummary?: string;
    afterSummary?: string;
    note?: string;
    metadata?: Record<string, unknown>;
}
export interface SalesDraft {
    items: InvoiceItem[];
    customerId: string;
    customerSearchTerm: string;
    discount: number;
    paymentType: 'cash' | 'card' | 'credit' | 'partial' | 'mixed';
    amountPaidInput: number;
    cashAmountInput?: number;
    cardAmountInput?: number;
    salesMode: SalesMode;
    manualInvoiceNumber?: number;
    dueDate?: string;
    partnerId?: string;
}
export interface WebOrder {
    id: string;
    customer_name: string;
    customer_phone: string;
    address: string;
    items: {
        medicineName: string;
        quantity: number;
        price: number;
    }[];
    total_amount: number;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
}
export interface SupabaseConfig {
    url: string;
    key: string;
    lastSyncDate?: string;
    autoSync: boolean;
}
export interface LocalAiConfig {
    enabled: boolean;
    baseUrl: string;
    modelName: string;
}
export type InvoiceTemplateId = 'legacy' | 'modern' | 'clean';
export interface InvoiceDesign {
    /** @deprecated Stage 10 — base64 logo is retired; upload via `fileStorageV2` and set `logoFileId`. Removal after cutover (Stage 11+). */
    logo?: string;
    /** @deprecated Stage 10 — base64 signature is retired; upload via `fileStorageV2` and set `signatureFileId`. Removal after cutover (Stage 11+). */
    signature?: string;
    /** Stage 10: file references (backend-v2 `files`) replacing the base64 logo/signature. */
    logoFileId?: string;
    signatureFileId?: string;
    email?: string;
    website?: string;
    terms?: string;
    footerText?: string;
    bankAccount?: string;
    customPhone?: string;
    paymentDetails?: string;
    showQrCode?: boolean;
    showStoreName?: boolean;
    primaryColor?: string;
    showWatermark?: boolean;
    paperSize?: 'A4' | 'A5' | 'Thermal';
    templateId?: InvoiceTemplateId;
}
export type Permission = 'view_inventory_only' | 'view_medicine_details' | 'create_medicine' | 'edit_medicine' | 'delete_medicine' | 'view_purchase_price' | 'create_invoice' | 'view_invoices' | 'edit_invoice' | 'delete_invoice' | 'return_sale' | 'apply_discount' | 'view_customers' | 'manage_customers' | 'manage_debt' | 'view_expenses' | 'manage_expenses' | 'view_dashboard' | 'view_reports' | 'view_profit' | 'manage_settings' | 'manage_users' | 'backup_restore' | 'view_payroll' | 'manage_payroll' | 'manage_inventory' | 'manage_purchases' | 'view_treasury' | 'manage_treasury' | 'view_partnerships' | 'manage_partnerships';
export interface CommissionTier {
    threshold: number;
    rate: number;
}
export interface AppUser {
    id: string;
    name: string;
    pinCode: string;
    role: 'admin' | 'staff';
    permissions: Permission[];
    baseSalary?: number;
    commissionRate?: number;
    commissionTiers?: CommissionTier[];
    updatedAt?: string;
    isDeleted?: boolean;
}
export interface AuthLockState {
    authLockEnabled: boolean;
    authLockedAt: string | null;
    lastUnlockedAt?: string | null;
}
export type PlanTier = 'free' | 'basic' | 'pro' | 'enterprise';
export type OperationMode = 'offline' | 'hybrid' | 'team';
export type BillingType = 'free' | 'one_time' | 'monthly' | 'yearly' | 'custom';
export type PlanVersion = 'legacy' | 'af_v2';
export interface PlanLimits {
    maxMedicines: number;
    maxInvoicesPerMonth: number;
    maxUsers: number;
    maxDevices: number;
    aiEnabled: boolean;
    cloudSyncEnabled: boolean;
}
export interface Subscription {
    tier: PlanTier;
    licenseKey?: string;
    expiryDate?: string;
    isActive: boolean;
    features: PlanLimits;
    validatedAt?: string;
    validatedEmail?: string;
    billingType?: BillingType;
    planVersion?: PlanVersion;
    supportEndsAt?: string;
}
export interface GuestLimits {
    maxMedicines: number;
    maxInvoices: number;
    maxAiRequests: number;
    retentionDays: number;
}
export interface GuestUsageState {
    medicineCount: number;
    invoiceCount: number;
    aiRequestCount: number;
}
export interface GuestWorkspaceMeta {
    createdAt: string;
    lastActiveAt: string;
    expiresAt: string;
}
export interface GuestTrialState {
    limits: GuestLimits;
    usage: GuestUsageState;
    meta: GuestWorkspaceMeta;
}
export type GuestMigrationChoice = 'keep' | 'discard';
export interface PendingGuestMigrationIntent {
    version: 1;
    choice: GuestMigrationChoice;
    sourceProfileId: string;
    sourceFingerprint: string;
    createdAt: string;
}
export type Language = 'dari' | 'english';
export type AiLanguage = 'fa' | 'ps' | 'en';
export type MedicineAiInputMode = 'upload' | 'camera' | 'text';
export interface GroundingSource {
    title: string;
    uri: string;
    hostname: string;
}
export interface GroundedAiResponse {
    text: string;
    grounded: boolean;
    providerName: string;
    groundingMetadata?: unknown;
    sources: GroundingSource[];
    queries: string[];
}
export type AiProviderType = 'google-gemini' | 'openai-compatible';
export type AiTaskType = 'vision' | 'chat' | 'analysis' | 'agent';
export interface AiProvider {
    id: string;
    name: string;
    type: AiProviderType;
    apiKey: string;
    baseUrl?: string;
    modelName: string;
    isActive: boolean;
    priority: number;
    supportedTasks: AiTaskType[];
    lastError?: string;
    status: 'healthy' | 'degraded' | 'failed';
    updatedAt: string;
}
export type Currency = 'AFN' | 'USD' | 'EUR' | 'IRR' | 'PKR' | 'INR';
export interface CurrencySettings {
    baseCurrency: Currency;
    rates: {
        USD: number;
        EUR: number;
        IRR: number;
        PKR: number;
        INR: number;
        AFN: number;
    };
    lastUpdated?: string;
}
export type CalculationSafetyMode = 'normal' | 'high' | 'extreme';
export interface CalculationSafetySettings {
    mode?: CalculationSafetyMode;
    stageDelayMs?: number;
    chunkSize?: number;
    verificationPasses?: number;
}
export type MedicineEntryAutomationTrigger = 'typing' | 'focus' | 'blur';
export interface MedicineEntryAutomationSettings {
    enabled: boolean;
    manualScrollUserConfigured?: boolean;
    trigger: MedicineEntryAutomationTrigger;
    aiFillScroll: boolean;
    adaptiveLearning: boolean;
    adaptiveThreshold: number;
}
export interface MedicineProcurementAssistSettings {
    enabled: boolean;
    adaptiveLearning: boolean;
    adaptiveThreshold: number;
}
export type InventoryLinkedSyncMode = 'ask' | 'always' | 'never';
export interface InventoryLinkedSyncTargets {
    purchases: boolean;
    partnerships: boolean;
}
export interface InventoryLinkedSyncSettings {
    mode: InventoryLinkedSyncMode;
    targets: InventoryLinkedSyncTargets;
}
export type CategoryIconSource = 'exact' | 'token' | 'phonetic' | 'fuzzy' | 'cache' | 'ai' | 'manual' | 'default';
export interface CategoryIconMeta {
    icon: string;
    color: string;
    source: CategoryIconSource;
}
export interface AppSettings {
    storeName: string;
    storePhone: string;
    storeAddress: string;
    taxRate: number;
    defaultSalesMode?: SalesMode;
    enableLocalInvoiceSave?: boolean;
    defaultInvoiceSavePath?: string;
    smartFileOrganization?: boolean;
    filenameFormat?: string;
    invoiceNumbering?: {
        type: 'auto' | 'manual';
        nextNumber: number;
    };
    currencySettings?: CurrencySettings;
    invoiceDesign?: InvoiceDesign;
    supabase?: SupabaseConfig;
    localAi?: LocalAiConfig;
    googleApiKey?: string;
    googleApiKeys?: string[];
    aiBaseUrl?: string;
    aiProviders?: AiProvider[];
    // Whether the treasury (cash) ledger may be included in the AI assistant's app-context payload.
    // DEFAULTS OFF (private): the full context is embedded verbatim in the agent prompt and relayed to
    // a third-party AI provider, so the cash ledger would otherwise leave the device on every
    // full-context question. Read via `shouldIncludeTreasuryInAiContext`, which opts in only on `=== true`.
    aiIncludeTreasury?: boolean;
    // Whether financial figures and customer/supplier/partner records may be included in the AI
    // assistant's full-context payload. DEFAULTS OFF (private): like aiIncludeTreasury, the full context
    // is embedded in the agent prompt and relayed to a third-party AI provider, so invoices, customer
    // names/phones/balances, revenue, expenses and purchases would otherwise leave the device on every
    // full-context question. Read via `isBusinessDataSharedWithAi`, which opts in only on `=== true`.
    aiShareBusinessData?: boolean;
    autoFailover?: boolean;
    teamMode?: boolean;
    users?: AppUser[];
    commissionRules?: ProductCommissionAdjustmentRule[];
    maxStaffDiscount?: number;
    subscription?: Subscription;
    guestTrial?: GuestTrialState;
    operationMode?: OperationMode;
    language?: Language;
    dateTimeSettings?: DateTimeSettings;
    aiLanguage?: AiLanguage;
    medicineAiDefaultInput?: MedicineAiInputMode;
    medicineEntryAutomation?: MedicineEntryAutomationSettings;
    medicineProcurementAssist?: MedicineProcurementAssistSettings;
    inventoryLinkedSyncSettings?: InventoryLinkedSyncSettings;
    calculationSafety?: CalculationSafetySettings;
    expenseCategories?: string[];
    /** Icon metadata keyed by the exact category name. Kept parallel to
     *  expenseCategories (a plain string[]) so cross-device set-union merges
     *  and older clients keep working. */
    expenseCategoryIcons?: Record<string, CategoryIconMeta>;
    customMedicineUnits?: MedicineUnit[];
    numberDisplayMode?: 'full' | 'compact';
    collectionResetAt?: Partial<Record<'medicines' | 'customers' | 'invoices' | 'expenses' | 'suppliers' | 'purchases' | 'partners' | 'auditEvents' | 'stockMovements', string>>;
    deletedRecordTombstones?: Partial<Record<'medicines' | 'customers' | 'invoices' | 'expenses' | 'suppliers' | 'purchases' | 'partners', Record<string, string>>>;
    dataResetAt?: string;
    updatedAt?: string;
}
export interface MedicineProcurementDraftRequest {
    medicine: Omit<Medicine, 'id'>;
    supplierId: string;
    targetPurchaseMode?: 'open_supplier_draft' | 'new_invoice';
    targetPurchaseId?: string;
    requestedInvoiceNumber?: string;
    purchaseLineDraft: Pick<PurchaseItem, 'batchNumber' | 'expiryDate' | 'quantity' | 'purchasePrice' | 'barcode' | 'unit' | 'baseQuantity' | 'purchaseUnitName' | 'purchaseUnitConversionFactor' | 'baseUnit' | 'notes' | 'partnerId' | 'ownerPartnerId' | 'stockEntryType' | 'ownershipType' | 'agreedPartnerValue' | 'suggestedSalePrice' | 'sourceDocumentNumber'>;
    quickReceipt?: {
        mode: 'all' | 'partial' | 'none';
        quantity?: number;
        date?: string;
        note?: string;
    };
}
export interface RequestedPurchaseDraftFocus {
    purchaseId: string;
    medicineName?: string;
    source?: 'medicine_entry';
}
export interface MigratableGuestPayload {
    medicines: Medicine[];
    customers: Customer[];
    invoices: Invoice[];
    expenses: Expense[];
    suppliers: Supplier[];
    purchases: Purchase[];
    partners: Partner[];
    settings: AppSettings;
    version?: number;
}
export type GuestMigrationFailureCode = 'NO_INTENT' | 'LOCKED' | 'INVALID_TARGET' | 'SOURCE_MISSING' | 'SOURCE_TAMPERED' | 'LIMIT_EXCEEDED' | 'TARGET_NOT_EMPTY' | 'SAVE_FAILED' | 'REPLAYED' | 'DISCARDED' | 'MIGRATED';
export interface GuestMigrationResult {
    status: 'noop' | 'migrated' | 'discarded' | 'blocked';
    choice: GuestMigrationChoice;
    code: GuestMigrationFailureCode;
    shouldClearGuestData: boolean;
    payload?: MigratableGuestPayload;
}
export interface UserProfile {
    id: string;
    name: string;
    email: string;
    picture?: string;
    provider: 'google' | 'supabase' | 'guest' | 'local';
}
export interface ConflictLog {
    id: string;
    entityId: string;
    entityType: string;
    fieldName: string;
    localValue: string;
    cloudValue: string;
    resolution: 'local_win' | 'cloud_win';
    timestamp: string;
}
export interface SyncMetrics {
    queueSize: number;
    lastSyncTime: number;
    syncVersion: number;
    conflictCount: number;
}
export type AppView = 'dashboard' | 'inventory' | 'sales' | 'customers' | 'expenses' | 'reports' | 'reports_advanced' | 'treasury' | 'settings' | 'payroll' | 'assistant' | 'purchases' | 'partnerships' | 'website_orders';
export type ReleaseChannel = 'stable' | 'candidate' | 'internal';
export type ReleaseStatus = 'draft' | 'published' | 'paused' | 'retired';
export type ControlRuleKind = 'maintenance' | 'kill_switch' | 'feature_flag' | 'device_action' | 'banner';
export type TargetType = 'global' | 'channel' | 'plan' | 'workspace' | 'account' | 'device';
export type TargetMatchMode = 'include' | 'exclude';
export type RuntimeHealthStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';
export type LockdownMode = 'normal' | 'safe_read_only' | 'force_update';
export interface ControlTargetRecord {
    id: string;
    targetType: TargetType;
    targetValue: string;
    matchMode: TargetMatchMode;
}
export interface AppReleaseRecord {
    id: string;
    version: string;
    buildNumber: string;
    platform: string;
    channel: ReleaseChannel;
    status: ReleaseStatus;
    installerUrl: string;
    checksumSha256: string;
    minSupportedVersion?: string | null;
    forceUpdate: boolean;
    rolloutPercentage: number;
    notes?: string;
    publishedAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    targets?: ControlTargetRecord[];
}
export interface ControlRuleRecord {
    id: string;
    kind: ControlRuleKind;
    key: string;
    valueJson: Record<string, unknown>;
    enabled: boolean;
    platform: string;
    channel: ReleaseChannel;
    priority: number;
    startsAt?: string | null;
    endsAt?: string | null;
    rolloutPercentage: number;
    createdAt?: string | null;
    updatedAt?: string | null;
    targets?: ControlTargetRecord[];
}
export interface AdminMessageRecord {
    id: string;
    content: string;
    type: 'info' | 'warning' | 'error';
    targetEmail?: string | null;
    isActive: boolean;
    createdAt?: string | null;
}
export interface AdminLicenseRecord {
    key: string;
    planTier: PlanTier;
    expiryDate?: string | null;
    isActive: boolean;
    assignedToEmail?: string | null;
    createdAt?: string | null;
    usedAt?: string | null;
    billingType?: BillingType | null;
    planVersion?: PlanVersion | null;
    supportEndsAt?: string | null;
}
export interface ClientRuntimeStatusRecord {
    deviceId: string;
    accountEmail?: string;
    workspaceId?: string;
    userId?: string;
    planTier: PlanTier;
    channel: ReleaseChannel;
    version: string;
    buildNumber?: string;
    platform: string;
    syncStatus: string;
    healthStatus: RuntimeHealthStatus | string;
    queueLength: number;
    lastSyncError?: string | null;
    deviceTrust?: 'trusted' | 'untrusted' | 'unknown' | string;
    lastSeen?: string | null;
    updatedAt?: string | null;
}
export interface AdminDeviceRecord {
    id: string;
    userId?: string;
    deviceId: string;
    deviceName: string;
    trusted: boolean;
    lastSeen?: string | null;
    accountEmail?: string | null;
    channel?: ReleaseChannel;
    version?: string;
    healthStatus?: RuntimeHealthStatus | string;
    syncStatus?: string;
}
export interface AdminAuditLogRecord {
    id: string;
    actorEmail: string;
    action: string;
    resourceType: string;
    resourceId: string;
    payload: Record<string, unknown>;
    createdAt?: string | null;
}
export interface AdminAccountRecord {
    email: string;
    displayName?: string;
    role: string;
    isActive: boolean;
    createdAt?: string | null;
    source?: string;
}
export interface ControlBootstrapResponse {
    appRelease: AppReleaseRecord | null;
    minimumVersion?: string | null;
    lockdownMode: LockdownMode;
    maintenanceBanner?: string | null;
    resolvedRules: ControlRuleRecord[];
    resolvedFlags: Record<string, unknown>;
    syncPaused: boolean;
    reauthorizeRequired: boolean;
    pollIntervals: {
        bootstrapMs: number;
        heartbeatMs: number;
        eventsMs: number;
    };
}
export interface RuntimeHeartbeatPayload {
    version: string;
    buildNumber?: string;
    platform: string;
    channel: ReleaseChannel;
    deviceId: string;
    planTier: PlanTier;
    accountEmail: string;
    workspaceId?: string;
    syncStatus: SyncStatus | string;
    healthStatus: RuntimeHealthStatus | string;
    queueLength: number;
    lastSyncError?: string | null;
    deviceTrust?: 'trusted' | 'untrusted' | 'unknown' | string;
}
export interface AdminDashboardInsight {
    id: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    value?: number | null;
}
export interface AdminControlOverview {
    totalLicenses: number;
    activeLicenses: number;
    usedLicenses: number;
    publishedReleases: number;
    enabledRules: number;
    activeRules: number;
    scheduledRules: number;
    totalClients: number;
    onlineClients: number;
    staleClients: number;
    offlineClients: number;
    healthyClients: number;
    degradedClients: number;
    criticalClients: number;
    pausedSyncClients: number;
    clientsWithSyncErrors: number;
    queueBacklogClients: number;
    totalRuntimeQueue: number;
    maxQueueDepth: number;
    trustedDevices: number;
    untrustedDevices: number;
    expiringLicenses7d: number;
    expiredLicenses: number;
    supportEndingSoon: number;
    licenseUtilizationRate: number;
    latestStableVersion?: string | null;
    releaseAdoptionRate: number;
    versionDriftClients: number;
    forceUpdateClients: number;
    policyActionClients: number;
    healthScore: number;
    actionRequiredCount: number;
    topInsights: AdminDashboardInsight[];
}
export interface AdminControlBootstrapResponse {
    adminAccount: AdminAccountRecord;
    overview: AdminControlOverview;
    licenses: AdminLicenseRecord[];
    messages: AdminMessageRecord[];
    releases: AppReleaseRecord[];
    rules: ControlRuleRecord[];
    runtimes: ClientRuntimeStatusRecord[];
    devices: AdminDeviceRecord[];
    auditLogs: AdminAuditLogRecord[];
    adminAccounts: AdminAccountRecord[];
}
export type TitleBarThemeName = 'boot' | 'auth' | 'access' | 'app';
export type UpdateInstallerProgressPhase = 'idle' | 'starting' | 'downloading' | 'verifying-checksum' | 'saving' | 'verifying-signature' | 'launching' | 'completed' | 'error';
export interface UpdateInstallerProgress {
    phase: UpdateInstallerProgressPhase;
    requestedUrl?: string;
    finalUrl?: string;
    filePath?: string;
    filename?: string;
    loadedBytes?: number;
    totalBytes?: number;
    percent?: number;
    bytesPerSecond?: number;
    remainingBytes?: number;
    estimatedSeconds?: number;
    elapsedMs?: number;
    message?: string;
    error?: string;
    at?: string;
}
export type ElectronBackendFormDataEntry = {
    name: string;
    kind: 'text';
    value: string;
} | {
    name: string;
    kind: 'file';
    filename: string;
    mimeType: string;
    dataBase64: string;
};
export type ElectronBackendRequestBody = {
    kind: 'none';
} | {
    kind: 'json';
    value: unknown;
} | {
    kind: 'text';
    value: string;
} | {
    kind: 'binary';
    filename?: string;
    mimeType?: string;
    dataBase64: string;
} | {
    kind: 'form-data';
    entries: ElectronBackendFormDataEntry[];
};
export interface ElectronBackendRequest {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    body?: ElectronBackendRequestBody;
}
export interface ElectronBackendResponse {
    success: boolean;
    ok?: boolean;
    status?: number;
    statusText?: string;
    url?: string;
    headers?: Record<string, string>;
    text?: string;
    error?: string;
    code?: string;
}
export interface ElectronBackendProbeAttempt {
    baseUrl: string;
    healthUrl: string;
    reachable: boolean;
    status?: number | null;
    latencyMs?: number | null;
    error?: string | null;
}
export interface ElectronBackendProbeResult {
    success: boolean;
    reachable?: boolean;
    baseUrl?: string;
    healthUrl?: string;
    status?: number | null;
    latencyMs?: number | null;
    attempts?: ElectronBackendProbeAttempt[];
    error?: string;
}
declare global {
    interface Window {
        electronAPI: {
            saveData: (data: any, userId: string) => Promise<{
                success: boolean;
                error?: string;
            }>;
            saveDataPatch?: (patch: {
                slices: Record<string, unknown>;
                version?: number;
                updatedAt?: string;
                mutationId?: string;
            }, userId: string) => Promise<{
                success: boolean;
                deduplicated?: boolean;
                error?: string;
            }>;
            loadData: (userId: string) => Promise<{
                success: boolean;
                data: any;
                error?: string;
            }>;
            saveSyncState: (data: any, userId: string) => Promise<{
                success: boolean;
                error?: string;
            }>;
            loadSyncState: (userId: string) => Promise<{
                success: boolean;
                data: any;
                error?: string;
            }>;
            appendLog: (filename: string, content: string) => Promise<{
                success: boolean;
                error?: string;
            }>;
            readLog: (filename: string) => Promise<{
                success: boolean;
                content?: string;
                error?: string;
            }>;
            archiveLog: (filename: string) => Promise<{
                success: boolean;
                error?: string;
            }>;
            exportLogs: () => Promise<{
                success: boolean;
                filePath?: string;
                canceled?: boolean;
                error?: string;
            }>; // Secure Log Export
            backupData: (data: any) => Promise<{
                success: boolean;
                path?: string;
                error?: string;
            }>;
            selectFolder: () => Promise<string | null>;
            saveInvoiceHtml: (content: string, filename: string, folderPath?: string, subFolder?: string) => Promise<{
                success: boolean;
                filePath?: string;
                error?: string;
            }>;
            generateReportPdf: (content: string, filename: string) => Promise<{
                success: boolean;
                filePath?: string;
                error?: string;
            }>;
            minimize: () => Promise<void>;
            maximize: () => Promise<void>;
            isMaximized: () => Promise<boolean | null>;
            hasNativeWindowControls?: boolean;
            resolveNativeWindowControls?: () => Promise<boolean | null>;
            setTitleBarTheme?: (themeName: TitleBarThemeName) => Promise<boolean | null>;
            close: () => Promise<void>;
            forceFocus: () => Promise<void>;
            openExternal: (url: string) => Promise<{
                success: boolean;
                error?: string;
            } | null>;
            openAttachmentDataUrl?: (payload: {
                dataUrl: string;
                filename?: string;
                mimeType?: string;
            }) => Promise<{
                success: boolean;
                filePath?: string;
                error?: string;
            } | null>;
            getAppVersion?: () => Promise<string | null>;
            getPlatformInfo?: () => Promise<{
                platform: string;
                arch: string;
                isPackaged: boolean;
            } | null>;
            backendRequest?: (request: ElectronBackendRequest) => Promise<ElectronBackendResponse>;
            probeBackend?: (candidates: string[]) => Promise<ElectronBackendProbeResult>;
            downloadAndOpenInstaller?: (updateUrl: string, checksumSha256: string, suggestedFilename?: string) => Promise<{
                success: boolean;
                filePath?: string;
                error?: string;
            } | null>;
            onInstallerDownloadProgress?: (callback: (progress: UpdateInstallerProgress) => void) => () => void;
            ensureAuthProtocol: () => Promise<{
                success: boolean;
                registered?: boolean;
                isDefault?: boolean;
                scheme?: string;
            } | null>;
            onWindowStateChange: (callback: (isMaximized: boolean) => void) => () => void;
            onAuthDeepLink: (callback: (url: string) => void) => () => void;
            getSessionId: () => Promise<string>;
            logger: {
                info: (tag: LogTag, message: string, meta?: any) => Promise<void>;
                warn: (tag: LogTag, message: string, meta?: any) => Promise<void>;
                error: (tag: LogTag, message: string, meta?: any) => Promise<void>;
                debug: (tag: LogTag, message: string, meta?: any) => Promise<void>;
            };
        };
    }
}
