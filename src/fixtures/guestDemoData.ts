import type { AppSettings, Batch, Customer, Expense, Invoice, Medicine, Partner, Purchase, Supplier } from '@/types';
export interface GuestDemoDataSnapshot {
    medicines: Medicine[];
    customers: Customer[];
    invoices: Invoice[];
    expenses: Expense[];
    suppliers: Supplier[];
    purchases: Purchase[];
    partners: Partner[];
    settings: AppSettings;
    version: number;
}
const demoUnit = 'بسته' as Medicine['unit'];
const nowIso = '2026-03-01T09:00:00.000Z';
const batch = (id: string, batchNumber: string, quantity: number, purchasePrice: number, expiryDate: string, supplierId: string): Batch => ({
    id,
    batchNumber,
    quantity,
    purchasePrice,
    expiryDate,
    supplierId,
    ownerPartnerId: 'demo-partner-1',
    history: [
        {
            date: nowIso,
            action: 'ایجاد',
            details: 'Demo seed'
        }
    ]
});
const medicines: Medicine[] = [
    {
        id: 'demo-med-1',
        name: 'Paracetamol 500mg',
        genericName: 'Acetaminophen',
        manufacturer: 'Afghan Pharma',
        type: 'Tablet',
        unit: demoUnit,
        lowStockThreshold: 40,
        batches: [
            {
                ...batch('demo-batch-1', 'PCM-2401', 160, 18, '2027-01-30', 'demo-sup-1'),
                purchaseId: 'demo-purchase-1',
                purchaseLineId: 'demo-purchase-line-1',
                purchaseItemIndex: 0
            }
        ],
        salePrices: {
            retail: 25,
            wholesale: 22,
            bulk: 20
        },
        updatedAt: nowIso
    },
    {
        id: 'demo-med-2',
        name: 'Amoxicillin 500mg',
        genericName: 'Amoxicillin',
        manufacturer: 'Herat Labs',
        type: 'Capsule',
        unit: demoUnit,
        lowStockThreshold: 30,
        batches: [
            batch('demo-batch-2', 'AMX-2312', 92, 34, '2026-11-15', 'demo-sup-2')
        ],
        salePrices: {
            retail: 48,
            wholesale: 44,
            bulk: 40
        },
        updatedAt: nowIso
    },
    {
        id: 'demo-med-3',
        name: 'Cough Syrup 120ml',
        genericName: 'Dextromethorphan',
        manufacturer: 'Kabul Med',
        type: 'Syrup',
        unit: demoUnit,
        lowStockThreshold: 20,
        batches: [
            batch('demo-batch-3', 'CSR-2402', 44, 62, '2027-03-20', 'demo-sup-1')
        ],
        salePrices: {
            retail: 85,
            wholesale: 78,
            bulk: 72
        },
        updatedAt: nowIso
    }
];
const customers: Customer[] = [
    {
        id: 'demo-cust-1',
        name: 'Rahimi Clinic',
        phone: '0700000001',
        address: 'Kabul, District 4',
        balance: 320,
        transactions: [
            {
                id: 'demo-cust-tx-1',
                date: '2026-02-27T10:00:00.000Z',
                type: 'invoice',
                amount: 560,
                balanceAfter: 560,
                description: 'Invoice #1304'
            },
            {
                id: 'demo-cust-tx-2',
                date: '2026-02-28T11:00:00.000Z',
                type: 'payment',
                amount: 240,
                balanceAfter: 320,
                description: 'Partial payment'
            }
        ],
        updatedAt: nowIso
    },
    {
        id: 'demo-cust-2',
        name: 'Shifa Pharmacy',
        phone: '0700000002',
        address: 'Kabul, Karte-Se',
        balance: 0,
        transactions: [],
        updatedAt: nowIso
    }
];
const suppliers: Supplier[] = [
    {
        id: 'demo-sup-1',
        code: 'SUP-001',
        name: 'Tolo Distributor',
        phone: '079000001',
        companyName: 'Tolo Med Supply',
        balance: 1800,
        transactions: [
            {
                id: 'demo-sup-tx-1',
                date: '2026-02-20T08:00:00.000Z',
                type: 'purchase',
                amount: 2800,
                balanceAfter: 2800,
                description: 'Purchase invoice PI-882'
            },
            {
                id: 'demo-sup-tx-2',
                date: '2026-02-24T08:00:00.000Z',
                type: 'payment',
                amount: 1000,
                balanceAfter: 1800,
                description: 'Bank transfer'
            }
        ],
        updatedAt: nowIso
    },
    {
        id: 'demo-sup-2',
        code: 'SUP-002',
        name: 'Noor Pharma',
        phone: '079000002',
        companyName: 'Noor Pharma Co.',
        balance: 0,
        transactions: [],
        updatedAt: nowIso
    }
];
const purchases: Purchase[] = [
    {
        id: 'demo-purchase-1',
        supplierId: 'demo-sup-1',
        partnerId: 'demo-partner-1',
        invoiceNumber: 'PI-882',
        date: '2026-02-20',
        items: [
            {
                lineId: 'demo-purchase-line-1',
                medicineId: 'demo-med-1',
                partnerId: 'demo-partner-1',
                batchNumber: 'PCM-2401',
                expiryDate: '2027-01-30',
                quantity: 200,
                purchasePrice: 18
            }
        ],
        totalAmount: 3600,
        paidAmount: 1800,
        remainingAmount: 1800,
        status: 'partial',
        updatedAt: nowIso
    }
];
const partners: Partner[] = [
    {
        id: 'demo-partner-1',
        name: 'Demo Partner',
        phone: '0700000099',
        sharePercentage: 50,
        openingCapital: 25000,
        status: 'active',
        ledger: [],
        updatedAt: nowIso
    }
];
const invoices: Invoice[] = [
    {
        id: 'demo-inv-1',
        invoiceNumber: 1304,
        customerId: 'demo-cust-1',
        userId: 'admin',
        salesMode: 'retail',
        items: [
            {
                medicineId: 'demo-med-1',
                batchId: 'demo-batch-1',
                partnerId: 'demo-partner-1',
                quantity: 8,
                price: 25,
                costPrice: 18
            },
            {
                medicineId: 'demo-med-2',
                batchId: 'demo-batch-2',
                partnerId: 'demo-partner-1',
                quantity: 5,
                price: 48,
                costPrice: 34
            }
        ],
        total: 440,
        tax: 0,
        discount: 0,
        finalAmount: 440,
        date: '2026-02-27T10:00:00.000Z',
        paymentStatus: 'partial',
        amountPaid: 120,
        remainingAmount: 320,
        updatedAt: nowIso
    },
    {
        id: 'demo-inv-2',
        invoiceNumber: 1305,
        customerId: 'demo-cust-2',
        userId: 'admin',
        salesMode: 'retail',
        items: [
            {
                medicineId: 'demo-med-3',
                batchId: 'demo-batch-3',
                partnerId: 'demo-partner-1',
                quantity: 3,
                price: 85,
                costPrice: 62
            }
        ],
        total: 255,
        tax: 0,
        discount: 0,
        finalAmount: 255,
        date: '2026-02-28T10:00:00.000Z',
        paymentStatus: 'paid',
        amountPaid: 255,
        remainingAmount: 0,
        updatedAt: nowIso
    }
];
const expenses: Expense[] = [
    {
        id: 'demo-exp-1',
        title: 'Monthly Rent',
        amount: 12000,
        category: 'کرایه',
        date: '2026-02-01',
        description: 'Shop rent',
        updatedAt: nowIso
    },
    {
        id: 'demo-exp-2',
        title: 'Electricity',
        amount: 2700,
        category: 'برق',
        date: '2026-02-14',
        description: 'Utility bill',
        updatedAt: nowIso
    }
];
const getSettings = (language: AppSettings['language']): AppSettings => ({
    storeName: language === 'english' ? 'WareKeep Demo Pharmacy' : 'فارمسی دیمو WareKeep',
    storePhone: '0700000000',
    storeAddress: language === 'english' ? 'Kabul, Afghanistan' : 'کابل، افغانستان',
    taxRate: 0,
    operationMode: 'offline',
    teamMode: false,
    language: language || 'dari',
    medicineAiDefaultInput: 'upload',
    users: [
        {
            id: 'admin',
            name: 'Demo Admin',
            role: 'admin',
            pinCode: '0000',
            permissions: [],
            baseSalary: 0,
            commissionRate: 0
        }
    ],
    expenseCategories: ['کرایه', 'برق', 'آب', 'غذا', 'معاش', 'حمل و نقل', 'متفرقه'],
    expenseCategoryIcons: {
        'کرایه': { icon: 'house', color: 'violet', source: 'exact' },
        'برق': { icon: 'zap', color: 'amber', source: 'exact' },
        'آب': { icon: 'droplets', color: 'blue', source: 'exact' },
        'غذا': { icon: 'utensils', color: 'red', source: 'exact' },
        'معاش': { icon: 'wallet', color: 'green', source: 'exact' },
        'حمل و نقل': { icon: 'truck', color: 'sky', source: 'exact' },
        'متفرقه': { icon: 'tag', color: 'slate', source: 'exact' }
    },
    invoiceNumbering: {
        type: 'auto',
        nextNumber: 1306
    },
    updatedAt: nowIso
});
export const getGuestDemoData = (language: AppSettings['language'] = 'dari'): GuestDemoDataSnapshot => {
    const snapshot: GuestDemoDataSnapshot = {
        medicines,
        customers,
        invoices,
        expenses,
        suppliers,
        purchases,
        partners,
        settings: getSettings(language),
        version: 1
    };
    return JSON.parse(JSON.stringify(snapshot)) as GuestDemoDataSnapshot;
};
