import type { AppSettings, Customer, Expense, Invoice, Medicine, Partner, Purchase, Supplier } from '../types';
// Data shapes shared with existing backups. This module contains no transport,
// remote queue, account, subscription or synchronization implementation.
export type WarehouseDomainSnapshot = {
    medicines: Medicine[];
    customers: Customer[];
    invoices: Invoice[];
    suppliers: Supplier[];
    purchases: Purchase[];
    partners?: Partner[];
    expenses?: Expense[];
    settings?: AppSettings;
    summary?: {
        medicineCount: number;
        totalQuantity: number;
        lowStockCount: number;
        expiringSoonCount: number;
    };
};
export type WarehouseOutboxKind = 'createMedicine' | 'updateMedicine' | 'deleteMedicine' | 'addBatch' | 'updateBatch' | 'recordInventoryVendorReturn' | 'createInventoryAdjustment' | 'recordCustomerPayment' | 'createSupplier' | 'updateSupplier' | 'deleteSupplier' | 'recordSupplierPayment' | 'recordSupplierSettlement' | 'createPurchase' | 'updatePurchase' | 'recordPurchaseReceipt' | 'shortClosePurchase' | 'recordPurchasePayment' | 'recordPurchaseVendorCredit' | 'deletePurchase' | 'createInvoice' | 'updateInvoice' | 'recordSaleReturn' | 'deleteInvoices' | 'addPartnerLedgerEntry' | 'transferInvoiceSeller' | 'addTreasuryTransaction' | 'addTreasuryCashCount' | 'adjustTreasuryTransaction' | 'voidTreasuryTransaction';
