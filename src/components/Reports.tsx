import React from 'react';
import type { AppSettings, AppUser, Customer, Expense, Invoice, InvoiceUpdateRequest, Medicine, Purchase, Supplier } from '@/types';
import { ReportsDashboard, type ReportsFinancialOverlay } from '@/components/reports/ReportsDashboard';
export type { ReportsFinancialOverlay };
export interface ReportsProps {
    mode?: 'home' | 'advanced';
    invoices: Invoice[];
    medicines: Medicine[];
    customers?: Customer[];
    expenses?: Expense[];
    purchases?: Purchase[];
    suppliers?: Supplier[];
    settings?: AppSettings;
    activeAppUser?: AppUser | null;
    onNavigate?: (view: 'sales' | 'inventory' | 'customers' | 'expenses' | 'purchases') => void;
    onDeleteInvoices?: (ids: string[]) => void;
    canDeleteInvoices?: boolean;
    onUpdateInvoice?: (invoiceId: string, request: InvoiceUpdateRequest) => void | Promise<void | Invoice>;
    canEditInvoices?: boolean;
    onTransferInvoiceSeller?: (invoiceId: string, nextUserId: string) => void | Promise<void>;
    canTransferInvoiceSeller?: boolean;
    onAddExpense?: (expense: Omit<Expense, 'id'>) => void;
    onUpdateExpense?: (id: string, expense: Partial<Expense>) => void;
    onDeleteExpense?: (id: string) => void;
    canManageExpenses?: boolean;
    requestedFinancialOverlay?: ReportsFinancialOverlay | null;
    onRequestedFinancialOverlayApplied?: () => void;
}
export const Reports: React.FC<ReportsProps> = ({ mode = 'advanced', ...props }) => (<ReportsDashboard mode={mode} {...props}/>);
