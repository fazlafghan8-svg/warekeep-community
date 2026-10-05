import React, { useState, useRef, useEffect, useMemo } from 'react';
import { logTableRender } from '../utils/performanceTelemetry';
import { Customer, CustomerTransaction, AppSettings } from '../types';
import { Modal } from './ui/Modal';
import { normalizePersianNumbers } from '../utils/localization';
import { getTranslation } from '../utils/translations';
import { PageHeader } from './ui/PageHeader';
import { ActiveFilterChip, FilterSearchField, FilterSelectField, FilterTextField, LockHint, UnifiedFilterBar } from './ui/UnifiedFilterBar';
import { Button } from './ui/Button';
import { InlineAlert } from './ui/InlineAlert';
import { EmptyStateShell } from './ui/StateShell';
import { FlatCard, GlassCard, PageSurface } from './ui/Surface';
import { StatusBadge } from './ui/StatusBadge';
import { classNames } from '@/utils/classNames';
import { createUniqueId } from '@/utils/localIds';
import { formatAppDate } from '@/lib/formatters';
import { escapeHtml } from '@/utils/htmlEscape';
import { openPrintWindow } from '@/utils/printWindow';
interface CustomersProps {
    customers: Customer[];
    addCustomer: (customer: Omit<Customer, 'id'>) => void;
    updateCustomer: (id: string, data: Partial<Customer>) => void;
    deleteCustomer: (id: string) => void;
    addCustomerPayment: (customerId: string, amount: number, description: string, idempotencyKey: string) => boolean | void | Promise<boolean | void>;
    settings?: AppSettings;
    readOnly?: boolean;
    ledgerReadOnly?: boolean;
    isGuestTrial?: boolean;
}
type FilterStatus = 'all' | 'debtor' | 'creditor' | 'settled';
type SortOption = 'name' | 'highest_debt' | 'lowest_debt' | 'recent';
const CUSTOMER_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const Customers: React.FC<CustomersProps> = ({ customers, addCustomer, updateCustomer, deleteCustomer, addCustomerPayment, settings, readOnly = false, ledgerReadOnly = readOnly, isGuestTrial = false }) => {
    const t = getTranslation(settings?.language || 'dari');
    const isEnglish = settings?.language === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const showReadOnlyAlert = () => alert(tr('Settings lock is active. Customer changes are disabled.', 'قفل تنظیمات فعال است و تغییرات مشتری غیرفعال است.'));
    const showGuestTrialAlert = () => alert(tr('Guest Trial only allows add/edit customer details. Ledger and delete actions are locked.', 'در حالت مهمان فقط افزودن و ویرایش مشتری مجاز است. دفتر حساب و حذف قفل است.'));
    const ledgerLocked = ledgerReadOnly || isGuestTrial;
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLedgerOpen, setIsLedgerOpen] = useState(false);
    // Search & Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
    const [sortBy, setSortBy] = useState<SortOption>('name');
    const [addressFilter, setAddressFilter] = useState('');
    const [customerPage, setCustomerPage] = useState(1);
    const [customerPageSize, setCustomerPageSize] = useState<(typeof CUSTOMER_PAGE_SIZE_OPTIONS)[number]>(25);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({ name: '', phone: '', address: '', balance: 0 });
    const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
    // Transaction Form State
    const [transactionType, setTransactionType] = useState<'payment' | 'debt'>('payment');
    const [transactionAmount, setTransactionAmount] = useState<string>('');
    const [transactionNote, setTransactionNote] = useState('');
    const [isSubmittingTransaction, setIsSubmittingTransaction] = useState(false);
    const amountInputRef = useRef<HTMLInputElement>(null);
    const tableRenderCountRef = useRef(0);
    tableRenderCountRef.current += 1;
    const selectedCustomer = customers.find(c => c.id === selectedCustomerId) || null;
    const noPhoneLabel = tr('No phone', 'بدون شماره تماس');
    const noAddressLabel = tr('No address', 'بدون آدرس');
    const getDisplayName = (customer: Customer): string => {
        const name = (customer.name || '').trim();
        if (name)
            return name;
        const phone = (customer.phone || '').trim();
        if (phone)
            return `${tr('Customer', 'مشتری')} ${phone}`;
        return tr('Unnamed customer', 'مشتری بدون نام');
    };
    // Auto-focus amount input when ledger opens
    useEffect(() => {
        if (isLedgerOpen) {
            if (window.electronAPI?.forceFocus) {
                window.electronAPI.forceFocus().catch(() => { });
            }
            setTimeout(() => {
                amountInputRef.current?.focus();
            }, 150);
        }
    }, [isLedgerOpen, transactionType]);
    // --- ADVANCED SEARCH & FILTER LOGIC ---
    const filteredCustomers = useMemo(() => {
        let result = customers.filter(c => !c.isDeleted);
        // 1. Search (Name, Phone, Address)
        if (searchTerm) {
            const term = normalizePersianNumbers(searchTerm).toLowerCase();
            result = result.filter(c => (c.name || '').toLowerCase().includes(term) ||
                (c.phone || '').includes(term) ||
                (c.address && c.address.toLowerCase().includes(term)) ||
                c.id.toLowerCase().includes(term) ||
                (c.transactions || []).some((txn) => (txn.referenceId || '').toLowerCase().includes(term) ||
                    (txn.description || '').toLowerCase().includes(term)));
        }
        // 1.5 Address Filter (Dedicated)
        if (addressFilter.trim()) {
            const normalizedAddressFilter = normalizePersianNumbers(addressFilter).toLowerCase().trim();
            result = result.filter(c => (c.address || '').toLowerCase().includes(normalizedAddressFilter));
        }
        // 2. Filter by Status
        if (filterStatus !== 'all') {
            if (filterStatus === 'debtor')
                result = result.filter(c => c.balance > 0);
            else if (filterStatus === 'creditor')
                result = result.filter(c => c.balance < 0);
            else if (filterStatus === 'settled')
                result = result.filter(c => c.balance === 0);
        }
        // 3. Sort
        result.sort((a, b) => {
            if (sortBy === 'highest_debt')
                return b.balance - a.balance;
            if (sortBy === 'lowest_debt')
                return a.balance - b.balance;
            if (sortBy === 'recent') {
                const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                return dateB - dateA;
            }
            return (a.name || '').localeCompare(b.name || '');
        });
        return result;
    }, [customers, searchTerm, addressFilter, filterStatus, sortBy]);
    useEffect(() => {
        setCustomerPage(1);
    }, [addressFilter, customerPageSize, filterStatus, searchTerm, sortBy]);
    const customerPageCount = Math.max(1, Math.ceil(filteredCustomers.length / customerPageSize));
    const safeCustomerPage = Math.min(customerPage, customerPageCount);
    const customerPageStart = filteredCustomers.length === 0 ? 0 : (safeCustomerPage - 1) * customerPageSize + 1;
    const customerPageEnd = Math.min(filteredCustomers.length, safeCustomerPage * customerPageSize);
    const paginatedCustomers = useMemo(() => filteredCustomers.slice((safeCustomerPage - 1) * customerPageSize, safeCustomerPage * customerPageSize), [customerPageSize, filteredCustomers, safeCustomerPage]);
    useEffect(() => {
        if (customerPage !== safeCustomerPage) {
            setCustomerPage(safeCustomerPage);
        }
    }, [customerPage, safeCustomerPage]);
    useEffect(() => {
        logTableRender('customers', tableRenderCountRef.current, paginatedCustomers.length);
    }, [paginatedCustomers.length]);
    const addressSuggestions = useMemo(() => {
        const unique = new Set<string>();
        customers.forEach((customer) => {
            const normalized = (customer.address || '').trim();
            if (normalized)
                unique.add(normalized);
        });
        return Array.from(unique).sort((a, b) => a.localeCompare(b));
    }, [customers]);
    const stats = useMemo(() => {
        const totalDebt = filteredCustomers.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
        const totalCredit = filteredCustomers.reduce((sum, c) => sum + (c.balance < 0 ? Math.abs(c.balance) : 0), 0);
        return { totalDebt, totalCredit, count: filteredCustomers.length };
    }, [filteredCustomers]);
    const statusCounts = useMemo(() => {
        let debtors = 0;
        let creditors = 0;
        let settled = 0;
        filteredCustomers.forEach((customer) => {
            if (customer.balance > 0)
                debtors += 1;
            else if (customer.balance < 0)
                creditors += 1;
            else
                settled += 1;
        });
        return { debtors, creditors, settled };
    }, [filteredCustomers]);
    const hasActiveFilters = !!searchTerm.trim() ||
        !!addressFilter.trim() ||
        filterStatus !== 'all' ||
        sortBy !== 'name';
    const clearFilters = () => {
        setSearchTerm('');
        setAddressFilter('');
        setFilterStatus('all');
        setSortBy('name');
    };
    const getCustomerInitial = (customer: Customer): string => {
        const display = getDisplayName(customer).trim();
        return display.charAt(0).toUpperCase() || '?';
    };
    const getCustomerCode = (customer: Customer): string => {
        const cleaned = customer.id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        return cleaned.length > 8 ? cleaned.slice(-8) : cleaned || 'CUST';
    };
    const getLastActivity = (customer: Customer): CustomerTransaction | null => {
        const transactions = getTransactions(customer);
        return transactions.length > 0 ? transactions[0] : null;
    };
    const getOpenInvoiceEntries = (customer: Customer): CustomerTransaction[] => getTransactions(customer).filter((txn) => ['invoice', 'debt_manual', 'initial'].includes(txn.type)).slice(0, 6);
    const getCustomerNotes = (customer: Customer): CustomerTransaction[] => getTransactions(customer).filter((txn) => !!txn.description?.trim()).slice(0, 6);
    const getBalanceMeta = (balance: number) => {
        if (balance > 0) {
            return {
                toneText: 'text-rose-600',
                toneSoft: 'bg-rose-50 text-rose-600 border-rose-100',
                label: t.debtor,
                badgeTone: 'warning' as const
            };
        }
        if (balance < 0) {
            return {
                toneText: 'text-emerald-600',
                toneSoft: 'bg-emerald-50 text-emerald-600 border-emerald-100',
                label: t.creditor,
                badgeTone: 'success' as const
            };
        }
        return {
            toneText: 'text-slate-500',
            toneSoft: 'bg-slate-100 text-slate-500 border-slate-200',
            label: t.settled,
            badgeTone: 'neutral' as const
        };
    };
    const handleEditClick = (customer: Customer) => {
        if (readOnly) {
            showReadOnlyAlert();
            return;
        }
        setEditingId(customer.id);
        setFormData({
            name: customer.name || '',
            phone: customer.phone || '',
            address: customer.address || '',
            balance: customer.balance
        });
        setIsModalOpen(true);
    };
    const handleAddClick = () => {
        if (readOnly) {
            showReadOnlyAlert();
            return;
        }
        setEditingId(null);
        setFormData({ name: '', phone: '', address: '', balance: 0 });
        setIsModalOpen(true);
    };
    const handleLedgerClick = (customer: Customer) => {
        setSelectedCustomerId(customer.id);
        setTransactionType('payment'); // Reset to default
        setTransactionAmount('');
        setTransactionNote('');
        setIsLedgerOpen(true);
    };
    const handleQuickSettle = (customer: Customer) => {
        if (ledgerLocked) {
            if (isGuestTrial)
                showGuestTrialAlert();
            else
                showReadOnlyAlert();
            return;
        }
        setSelectedCustomerId(customer.id);
        setTransactionType('payment');
        setTransactionAmount(customer.balance > 0 ? String(Math.abs(customer.balance)) : '');
        setTransactionNote(tr('Quick settle', 'تصفیه سریع'));
        setIsLedgerOpen(true);
    };
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (readOnly) {
            showReadOnlyAlert();
            return;
        }
        const normalizedPhone = normalizePersianNumbers(formData.phone || '').trim();
        const normalizedAddress = (formData.address || '').trim();
        const normalizedName = (formData.name || '').trim() ||
            (normalizedPhone ? `${tr('Customer', 'مشتری')} ${normalizedPhone}` : tr('Unnamed customer', 'مشتری بدون نام'));
        const payload = {
            ...formData,
            name: normalizedName,
            phone: normalizedPhone,
            address: normalizedAddress,
            balance: Number(formData.balance) || 0
        };
        if (editingId) {
            updateCustomer(editingId, payload);
        }
        else {
            addCustomer({ ...payload, transactions: [] });
        }
        setIsModalOpen(false);
    };
    const handleDeleteTransaction = (txnId: string) => {
        if (ledgerLocked) {
            if (isGuestTrial)
                showGuestTrialAlert();
            else
                showReadOnlyAlert();
            return;
        }
        if (!selectedCustomer)
            return;
        if (!window.confirm(t.confirm))
            return;
        const transactionToDelete = selectedCustomer.transactions.find(t => t.id === txnId);
        if (!transactionToDelete)
            return;
        let newBalance = Number(selectedCustomer.balance);
        const amount = Number(transactionToDelete.amount);
        // Reverse logic
        if (transactionToDelete.type === 'payment' || transactionToDelete.type === 'return') {
            newBalance += amount; // We deleted a payment, so debt goes back up
        }
        else {
            newBalance -= amount; // We deleted a debt charge, so debt goes down
        }
        const updatedTransactions = selectedCustomer.transactions.filter(t => t.id !== txnId);
        updateCustomer(selectedCustomer.id, {
            balance: newBalance,
            transactions: updatedTransactions
        });
    };
    const handleTransactionSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmittingTransaction)
            return;
        if (ledgerLocked) {
            if (isGuestTrial)
                showGuestTrialAlert();
            else
                showReadOnlyAlert();
            return;
        }
        const amountNum = parseFloat(normalizePersianNumbers(transactionAmount));
        if (!selectedCustomer || isNaN(amountNum) || amountNum <= 0)
            return;
        setIsSubmittingTransaction(true);
        let newBalance = selectedCustomer.balance;
        let type: CustomerTransaction['type'] = 'payment';
        let description = transactionNote;
        const idempotencyKey = createUniqueId(`customer-${transactionType}`);
        if (transactionType === 'payment') {
            newBalance -= amountNum;
            type = 'payment';
            if (!description)
                description = isEnglish ? 'Cash Payment' : 'تصفیه حساب / دریافت نقد';
        }
        else {
            newBalance += amountNum;
            type = 'debt_manual';
            if (!description)
                description = isEnglish ? 'Manual Debt Record' : 'ثبت بدهکاری (قرض) دستی';
        }
        const newTxn: CustomerTransaction = {
            id: idempotencyKey,
            date: new Date().toISOString(),
            type: type,
            amount: amountNum,
            balanceAfter: newBalance,
            description: description,
            idempotencyKey
        };
        if ((selectedCustomer.transactions || []).some((txn) => txn.idempotencyKey === idempotencyKey || txn.id === idempotencyKey)) {
            setIsSubmittingTransaction(false);
            return;
        }
        try {
            if (transactionType === 'payment') {
                const result = await addCustomerPayment(selectedCustomer.id, amountNum, description, idempotencyKey);
                if (result === false)
                    return;
            }
            else {
                updateCustomer(selectedCustomer.id, {
                    balance: newBalance,
                    transactions: [...selectedCustomer.transactions, newTxn]
                });
            }
            setTransactionAmount('');
            setTransactionNote('');
            if (amountInputRef.current)
                amountInputRef.current.focus();
        }
        finally {
            setIsSubmittingTransaction(false);
        }
    };
    const getTransactions = (customer: Customer): CustomerTransaction[] => {
        const txs = customer.transactions || [];
        return [...txs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    };
    const formatCustomerDate = (value: string | Date | null | undefined) => formatAppDate(value, settings || null, 'customers');
    const printReceipt = (customer: Customer, transaction: CustomerTransaction) => {
        const printWindow = openPrintWindow('height=800,width=600');
        if (printWindow) {
            const date = formatCustomerDate(transaction.date);
            const title = transaction.type === 'payment' ? t.receiptTitlePayment : t.receiptTitleDebt;
            printWindow.document.write(`
            <html dir="${isEnglish ? 'ltr' : 'rtl'}">
              <head>
                <title>${escapeHtml(title)}</title>
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'" />
                <style>
                  body { font-family: sans-serif; padding: 20px; text-align: center; border: 1px solid #eee; max-width: 400px; margin: 0 auto; }
                  h2 { margin-bottom: 5px; color: #1e40af; }
                  .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; border-bottom: 1px solid #f9f9f9; padding-bottom: 4px; }
                  .amount { font-size: 26px; font-weight: bold; margin: 20px 0; border-top: 2px dashed #000; border-bottom: 2px dashed #000; padding: 15px 0; background: #f8fafc; }
                  .footer-note { font-size: 10px; color: #666; margin-top: 30px; }
                </style>
              </head>
              <body>
                <h2>${escapeHtml(settings?.storeName || (isEnglish ? 'Pharmacy' : 'دواخانه'))}</h2>
                <h3 style="margin-top:0;">${escapeHtml(title)}</h3>
                <div class="row"><span>${t.date}:</span><span>${escapeHtml(date)}</span></div>
                <div class="row"><span>${t.customerName}:</span><span>${escapeHtml(getDisplayName(customer))}</span></div>
                <div class="row"><span>${t.description}:</span><span>${escapeHtml(transaction.description)}</span></div>
                <div class="amount">${escapeHtml(transaction.amount.toLocaleString())} <small style="font-size:12px">AFN</small></div>
                <div class="row" style="font-weight:bold; color:#b91c1c;"><span>${t.finalBalance}:</span><span>${escapeHtml(transaction.balanceAfter.toLocaleString())}</span></div>
                <div style="display:flex; justify-content:space-between; margin-top:50px;">
                    <div style="border-top:1px solid #333; width:40%; padding-top:5px; font-size:11px;">${isEnglish ? 'Issuer Stamp & Signature' : 'مهر و امضای مرجع'}</div>
                    <div style="border-top:1px solid #333; width:40%; padding-top:5px; font-size:11px;">${isEnglish ? 'Customer Signature' : 'امضای مشتری'}</div>
                </div>
                <p class="footer-note">${isEnglish ? 'This receipt is issued for account settlement between both parties.' : 'این سند جهت تصفیه حسابات فیمابین صادر گردیده است.'}</p>
              </body>
            </html>
          `);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => {
                if (!printWindow.closed)
                    printWindow.print();
            }, 500);
        }
    };
    const handleConfirmDelete = () => {
        if (readOnly || isGuestTrial) {
            if (isGuestTrial)
                showGuestTrialAlert();
            else
                showReadOnlyAlert();
            return;
        }
        if (customerToDelete) {
            deleteCustomer(customerToDelete.id);
            setCustomerToDelete(null);
        }
    };
    const parsedTransactionAmount = parseFloat(normalizePersianNumbers(transactionAmount)) || 0;
    const projectedBalance = selectedCustomer
        ? transactionType === 'payment'
            ? selectedCustomer.balance - parsedTransactionAmount
            : selectedCustomer.balance + parsedTransactionAmount
        : 0;
    const selectedCustomerTransactions = selectedCustomer ? getTransactions(selectedCustomer) : [];
    const selectedCustomerBalanceMeta = selectedCustomer ? getBalanceMeta(selectedCustomer.balance) : null;
    const selectedCustomerOpenInvoices = selectedCustomer ? getOpenInvoiceEntries(selectedCustomer) : [];
    const selectedCustomerNotes = selectedCustomer ? getCustomerNotes(selectedCustomer) : [];
    const selectedCustomerLastActivity = selectedCustomer ? getLastActivity(selectedCustomer) : null;
    const closeCustomerPanel = () => setSelectedCustomerId(null);
    const activeFilterChips = [
        searchTerm.trim() ? { key: 'search', label: tr(`Search: ${searchTerm}`, `جستجو: ${searchTerm}`), clear: () => setSearchTerm('') } : null,
        addressFilter.trim() ? { key: 'address', label: tr(`Address: ${addressFilter}`, `آدرس: ${addressFilter}`), clear: () => setAddressFilter('') } : null,
        filterStatus !== 'all' ? { key: 'status', label: tr(`Status: ${filterStatus}`, `وضعیت: ${filterStatus}`), clear: () => setFilterStatus('all') } : null,
        sortBy !== 'name' ? { key: 'sort', label: tr(`Sort: ${sortBy}`, `ترتیب: ${sortBy}`), clear: () => setSortBy('name') } : null,
    ].filter(Boolean) as {
        key: string;
        label: string;
        clear: () => void;
    }[];
    const customerResultsLabel = filteredCustomers.length === 0
        ? tr('No customers visible', 'هیچ مشتری نمایش داده نمی‌شود')
        : tr(`${filteredCustomers.length} customer(s) visible · rows ${customerPageStart}-${customerPageEnd}`, `${filteredCustomers.length} مشتری نمایش داده می‌شود · ردیف ${customerPageStart}-${customerPageEnd}`);
    return (<PageSurface className="min-h-full p-4 sm:p-5" dir={isEnglish ? 'ltr' : 'rtl'}>
      <div className="space-y-4">
        <PageHeader eyebrow={tr('Finance', 'مالی')} title={t.manageCustomers} subtitle={tr('Search customers fast, review balances, and settle open accounts without losing context.', 'مشتری را سریع پیدا کنید، مانده حساب را ببینید و حسابات باز را بدون خروج از صفحه تصفیه کنید.')} primaryAction={{
            label: t.addNewCustomer,
            onClick: handleAddClick,
            disabled: readOnly,
        }} meta={(<div className="flex flex-wrap gap-2">
              <StatusBadge tone="neutral">{stats.count} {t.customersFound}</StatusBadge>
              <StatusBadge tone="warning">{statusCounts.debtors} {t.debtors}</StatusBadge>
              <StatusBadge tone="success">{statusCounts.creditors} {t.creditors}</StatusBadge>
            </div>)}/>

        {readOnly ? (<InlineAlert tone="warning" title={tr('Customer actions are locked', 'عملیات مشتری قفل است')}>
            {tr('You can review balances and history, but edits are currently disabled.', 'می‌توانید مانده و تاریخچه را ببینید، اما تغییرات فعلاً غیرفعال است.')}
          </InlineAlert>) : null}

        {isGuestTrial ? (<InlineAlert tone="info" title={tr('Guest mode keeps ledger actions limited', 'حالت مهمان بعضی عملیات حساب را محدود می‌کند')}>
            {tr('Add and edit customer profiles are available, but ledger posting and delete actions remain locked.', 'افزودن و ویرایش پروفایل مشتری فعال است، اما ثبت در دفتر حساب و حذف هنوز قفل است.')}
          </InlineAlert>) : null}

        <div className="wk-summary-grid">
          <FlatCard className="p-3.5">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Customers', 'مشتریان')}</p>
            <p className="wk-ltr-data mt-2 text-xl font-black text-slate-900">{stats.count}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Visible in current view', 'نمایش‌داده‌شده در این نما')}</p>
          </FlatCard>
          <FlatCard className="p-3.5">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{t.totalReceivable}</p>
            <p className="wk-ltr-data mt-2 text-xl font-black text-rose-600">{stats.totalDebt.toLocaleString()} AFN</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Open customer debt', 'بدهی باز مشتریان')}</p>
          </FlatCard>
          <FlatCard className="p-3.5">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{t.totalPayable}</p>
            <p className="wk-ltr-data mt-2 text-xl font-black text-emerald-600">{stats.totalCredit.toLocaleString()} AFN</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Customer credit balance', 'بستانکاری مشتریان')}</p>
          </FlatCard>
          <FlatCard className="p-3.5">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Settled', 'تصفیه‌شده')}</p>
            <p className="wk-ltr-data mt-2 text-xl font-black text-slate-900">{statusCounts.settled}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Accounts with zero balance', 'حسابات با مانده صفر')}</p>
          </FlatCard>
        </div>

        <UnifiedFilterBar searchSlot={<FilterSearchField label={tr('Search customers', 'جستجوی مشتریان')} placeholder={tr('Name, phone, customer code, or document number', 'نام، شماره تماس، کد مشتری یا شماره سند')} value={searchTerm} onChange={setSearchTerm} dir={isEnglish ? 'ltr' : 'rtl'}/>} filters={[
            <FilterSelectField key="status" label={tr('Account status', 'وضعیت حساب')} value={filterStatus} onChange={(value) => setFilterStatus(value as FilterStatus)} options={[
                    { value: 'all', label: t.all },
                    { value: 'debtor', label: t.debtors },
                    { value: 'creditor', label: t.creditors },
                    { value: 'settled', label: t.settled }
                ]}/>,
            <FilterTextField key="address" label={tr('Address', 'آدرس')} value={addressFilter} onChange={setAddressFilter} placeholder={tr('Filter by area or city', 'فیلتر بر اساس ساحه یا شهر')} list="customer-address-suggestions"/>,
            <FilterSelectField key="sort" label={tr('Sort by', 'ترتیب')} value={sortBy} onChange={(value) => setSortBy(value as SortOption)} options={[
                    { value: 'name', label: t.customerName },
                    { value: 'highest_debt', label: t.highestDebt },
                    { value: 'lowest_debt', label: t.lowestDebt },
                    { value: 'recent', label: t.recentActivity }
                ]}/>,
        ]} actionsSlot={hasActiveFilters ? <Button variant="secondary" onClick={clearFilters}>{tr('Clear filters', 'پاک‌سازی فیلترها')}</Button> : undefined} resultsLabel={customerResultsLabel} activeFiltersSlot={activeFilterChips.length > 0 ? activeFilterChips.map((chip) => (<ActiveFilterChip key={chip.key} label={chip.label} onClear={chip.clear}/>)) : undefined}/>
        <datalist id="customer-address-suggestions">
          {addressSuggestions.map((address) => (<option key={address} value={address}/>))}
        </datalist>
        {ledgerLocked ? <LockHint>{tr('Ledger posting stays locked until write access is available.', 'ثبت دفتر حساب تا زمانی که دسترسی نوشتن فعال نشود قفل می‌ماند.')}</LockHint> : null}

        <FlatCard className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50/70 px-5 py-3.5">
            <div>
              <h2 className="text-base font-black text-slate-900">{tr('Customer accounts', 'حسابات مشتریان')}</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {selectedCustomer
            ? tr('Select rows to review details in the side panel without leaving the table.', 'برای دیدن جزئیات، ردیف را انتخاب کنید تا panel کناری بدون خروج از جدول باز شود.')
            : tr('The table stays full width until you choose a customer.', 'جدول تا زمان انتخاب مشتری، تمام‌عرض باقی می‌ماند.')}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-2 py-1.5">
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{tr('Rows', 'ردیف')}</span>
                <select value={customerPageSize} onChange={(event) => setCustomerPageSize(Number(event.target.value) as (typeof CUSTOMER_PAGE_SIZE_OPTIONS)[number])} className="rounded-xl border border-neutral-200 bg-white px-2 py-1 text-xs font-black text-slate-700 outline-hidden" aria-label={tr('Customer rows per page', 'تعداد ردیف مشتری در هر صفحه')}>
                  {CUSTOMER_PAGE_SIZE_OPTIONS.map((size) => (<option key={size} value={size}>{size}</option>))}
                </select>
                <span className="wk-ltr-data text-xs font-black text-slate-600">{safeCustomerPage} / {customerPageCount}</span>
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setCustomerPage((current) => Math.max(1, current - 1))} disabled={safeCustomerPage <= 1} aria-label={tr('Previous customer page', 'صفحه قبلی مشتریان')}>
                  {tr('Prev', 'قبلی')}
                </Button>
                <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setCustomerPage((current) => Math.min(customerPageCount, current + 1))} disabled={safeCustomerPage >= customerPageCount} aria-label={tr('Next customer page', 'صفحه بعدی مشتریان')}>
                  {tr('Next', 'بعدی')}
                </Button>
              </div>
              {selectedCustomer ? (<StatusBadge tone={selectedCustomerBalanceMeta?.badgeTone || 'neutral'}>
                  {tr('Detail panel open', 'panel جزئیات باز است')}
                </StatusBadge>) : null}
            </div>
          </div>
 
            {filteredCustomers.length === 0 ? (<div className="p-5">
                <EmptyStateShell title={hasActiveFilters ? t.noCustomersFound : tr('No customers yet', 'هنوز مشتریی ثبت نشده است')} description={hasActiveFilters
                ? tr('Adjust the filters or search terms to find more customer records.', 'برای دیدن رکوردهای بیشتر، فیلترها یا عبارت جستجو را تغییر دهید.')
                : tr('Start by adding your first customer profile so balances and account history can be tracked here.', 'برای شروع، اولین پروفایل مشتری را اضافه کنید تا مانده و تاریخچه حساب در اینجا ثبت شود.')} action={!hasActiveFilters ? <Button variant="primary" onClick={handleAddClick} disabled={readOnly}>{t.addNewCustomer}</Button> : undefined} className="py-8"/>
              </div>) : (<div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-5 py-4 text-right text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t.customerName}</th>
                      <th className="px-5 py-4 text-right text-xs font-black uppercase tracking-[0.16em] text-slate-500">{tr('Phone / Code', 'شماره / کد')}</th>
                      <th className="px-5 py-4 text-right text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t.recentActivity}</th>
                      <th className="px-5 py-4 text-center text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t.balance}</th>
                      <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-[0.16em] text-slate-500">{t.operation}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-white">
                    {paginatedCustomers.map((customer) => {
                const balanceMeta = getBalanceMeta(customer.balance);
                const lastActivity = getLastActivity(customer);
                const isSelected = selectedCustomerId === customer.id;
                return (<tr key={customer.id} onClick={() => setSelectedCustomerId(customer.id)} className={classNames('cursor-pointer transition hover:bg-brand-50/35', isSelected && 'bg-brand-50/55')}>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-100 bg-brand-50 text-brand-700">
                                <span className="text-sm font-black">{getCustomerInitial(customer)}</span>
                              </div>
                              <div className="min-w-0">
                                <div className="truncate font-black text-slate-900">{getDisplayName(customer)}</div>
                                <div className="mt-1 truncate text-xs font-semibold text-slate-500">{customer.address || noAddressLabel}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="wk-ltr-data text-sm font-semibold text-slate-600">{customer.phone || noPhoneLabel}</div>
                            <div className="wk-ltr-data mt-1 text-[11px] font-semibold text-slate-400">{getCustomerCode(customer)}</div>
                          </td>
                          <td className="px-5 py-4">
                            {lastActivity ? (<div>
                                <div className="truncate text-xs font-bold text-slate-700">{lastActivity.description}</div>
                                <div className="wk-ltr-data mt-1 text-[11px] font-semibold text-slate-400">{formatCustomerDate(lastActivity.date)}</div>
                              </div>) : (<span className="text-xs font-semibold text-slate-400">{tr('No activity yet', 'هنوز فعالیتی ثبت نشده')}</span>)}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={classNames('wk-ltr-data text-base font-black', balanceMeta.toneText)}>
                                {Math.abs(customer.balance).toLocaleString()} AFN
                              </span>
                              <StatusBadge tone={balanceMeta.badgeTone}>{balanceMeta.label}</StatusBadge>
                            </div>
                          </td>
                          <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" className="px-3 py-2 text-xs" onClick={() => setSelectedCustomerId(customer.id)}>
                                {tr('Details', 'جزئیات')}
                              </Button>
                              {customer.balance > 0 ? (<Button variant="secondary" disabled={ledgerLocked} className="px-3 py-2 text-xs" onClick={() => handleQuickSettle(customer)}>
                                  {tr('Quick settle', 'تصفیه سریع')}
                                </Button>) : null}
                              <Button variant="ghost" disabled={readOnly} className="px-3 py-2 text-xs" onClick={() => handleEditClick(customer)}>
                                {t.edit}
                              </Button>
                            </div>
                          </td>
                        </tr>);
            })}
                  </tbody>
                </table>
              </div>)}
        </FlatCard>
      </div>

      {selectedCustomer ? (<div className="fixed inset-0 z-40" aria-hidden={false}>
          <button type="button" className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px]" onClick={closeCustomerPanel} aria-label={tr('Close customer detail panel', 'بستن panel جزئیات مشتری')}/>
          <div className={classNames('absolute inset-y-0 w-full max-w-[440px] overflow-y-auto border-neutral-200 bg-white shadow-[0_28px_60px_-32px_rgba(15,23,42,0.55)]', isEnglish ? 'right-0 border-l' : 'left-0 border-r')}>
            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900">{tr('Customer detail', 'جزئیات مشتری')}</h2>
                  <p className="wk-ltr-data mt-1 text-xs font-semibold text-slate-500">{getCustomerCode(selectedCustomer)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedCustomerBalanceMeta ? <StatusBadge tone={selectedCustomerBalanceMeta.badgeTone}>{selectedCustomerBalanceMeta.label}</StatusBadge> : null}
                  <Button variant="ghost" className="px-3 py-2 text-xs" onClick={closeCustomerPanel}>
                    {tr('Close', 'بستن')}
                  </Button>
                </div>
              </div>

              <GlassCard className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-slate-900">{getDisplayName(selectedCustomer)}</p>
                    <p className="wk-ltr-data mt-1 text-sm font-semibold text-slate-500">{selectedCustomer.phone || noPhoneLabel}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-500">{selectedCustomer.address || noAddressLabel}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{t.balance}</p>
                    <p className={classNames('wk-ltr-data mt-2 text-xl font-black', selectedCustomerBalanceMeta?.toneText)}>
                      {Math.abs(selectedCustomer.balance).toLocaleString()} AFN
                    </p>
                  </div>
                </div>
              </GlassCard>

              <FlatCard className="border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-900">{tr('Ledger snapshot', 'خلاصه دفتر حساب')}</h3>
                  <StatusBadge tone="neutral">{selectedCustomerTransactions.length} {tr('entries', 'رکورد')}</StatusBadge>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-neutral-200 bg-white px-3 py-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Last activity', 'آخرین فعالیت')}</div>
                    <div className="mt-2 text-sm font-bold text-slate-800">{selectedCustomerLastActivity?.description || tr('No activity yet', 'هنوز فعالیتی ثبت نشده')}</div>
                    <div className="wk-ltr-data mt-1 text-xs font-semibold text-slate-400">{selectedCustomerLastActivity ? formatCustomerDate(selectedCustomerLastActivity.date) : '-'}</div>
                  </div>
                  <div className="rounded-2xl border border-neutral-200 bg-white px-3 py-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{tr('Open invoices', 'اسناد باز')}</div>
                    <div className="wk-ltr-data mt-2 text-xl font-black text-slate-900">{selectedCustomerOpenInvoices.length}</div>
                    <div className="mt-1 text-xs font-semibold text-slate-400">{tr('Recent unpaid or debt entries', 'اسناد باز یا ثبت‌های بدهی اخیر')}</div>
                  </div>
                </div>
              </FlatCard>

              <FlatCard className="p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-900">{tr('Open invoices', 'اسناد باز')}</h3>
                  {selectedCustomer.balance > 0 ? <StatusBadge tone="warning">{tr('Needs follow-up', 'نیازمند پیگیری')}</StatusBadge> : null}
                </div>
                {selectedCustomerOpenInvoices.length > 0 ? (<div className="space-y-2">
                    {selectedCustomerOpenInvoices.map((txn) => (<div key={txn.id} className="rounded-2xl border border-neutral-200 bg-white px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-800">{txn.description}</p>
                            <p className="wk-ltr-data mt-1 text-[11px] font-semibold text-slate-400">{txn.referenceId || txn.id}</p>
                          </div>
                          <div className="text-right">
                            <p className="wk-ltr-data text-sm font-black text-rose-600">{txn.amount.toLocaleString()} AFN</p>
                            <p className="wk-ltr-data mt-1 text-[11px] font-semibold text-slate-400">{formatCustomerDate(txn.date)}</p>
                          </div>
                        </div>
                      </div>))}
                  </div>) : (<EmptyStateShell title={tr('No open invoices', 'سند باز وجود ندارد')} description={tr('This customer has no recent unpaid invoice or manual debt entry.', 'برای این مشتری سند پرداخت‌نشده یا بدهی دستی اخیر وجود ندارد.')} className="py-8"/>)}
              </FlatCard>

              <FlatCard className="p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-900">{tr('Notes & context', 'یادداشت‌ها و زمینه')}</h3>
                  <Button variant="ghost" className="px-3 py-2 text-xs" onClick={() => handleLedgerClick(selectedCustomer)}>
                    {t.ledger}
                  </Button>
                </div>
                {selectedCustomerNotes.length > 0 ? (<div className="space-y-2">
                    {selectedCustomerNotes.map((txn) => (<div key={txn.id} className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3">
                        <p className="text-sm font-semibold text-slate-700">{txn.description}</p>
                        <p className="wk-ltr-data mt-1 text-[11px] font-semibold text-slate-400">{formatCustomerDate(txn.date)}</p>
                      </div>))}
                  </div>) : (<p className="text-sm font-semibold text-slate-500">{tr('No notes saved for this customer yet.', 'هنوز یادداشتی برای این مشتری ثبت نشده است.')}</p>)}
              </FlatCard>

              <FlatCard className="p-4">
                <h3 className="text-sm font-black text-slate-900">{tr('Next action', 'اقدام بعدی')}</h3>
                <div className="mt-3 space-y-3">
                  {selectedCustomer.balance > 0 ? (<InlineAlert tone="warning" title={tr('Balance is still open', 'مانده حساب هنوز باز است')} action={(<Button variant="primary" disabled={ledgerLocked} onClick={() => handleQuickSettle(selectedCustomer)}>
                          {tr('Quick settle', 'تصفیه سریع')}
                        </Button>)}>
                      {tr('Collect the remaining amount directly or open the ledger for a manual entry.', 'مانده را مستقیم دریافت کنید یا برای ثبت دستی دفتر حساب را باز نمایید.')}
                    </InlineAlert>) : (<InlineAlert tone="success" title={tr('This account is currently clear', 'این حساب فعلاً صاف است')} action={<Button variant="secondary" onClick={() => handleLedgerClick(selectedCustomer)}>{tr('Open ledger', 'بازکردن دفتر')}</Button>}>
                      {tr('You can still review history, print receipts, or register a new ledger entry.', 'همچنان می‌توانید تاریخچه را ببینید، رسید چاپ کنید یا ثبت جدید انجام دهید.')}
                    </InlineAlert>)}
                </div>
              </FlatCard>
            </div>
          </div>
        </div>) : null}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? t.edit : t.addNewCustomer}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/80 via-white to-blue-50/70 p-4 shadow-sm">
              <p className="text-xs font-bold text-brand-700">
                  {editingId
            ? tr('Update customer profile and account details.', 'مشخصات پروفایل و جزئیات حساب مشتری را اصلاح کنید.')
            : tr('Create a new customer profile and initial account.', 'پروفایل مشتری جدید را همراه با تنظیمات حساب اولیه ثبت کنید.')}
              </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                  <label className="block text-sm font-black text-slate-700">
                      {t.customerName} <span className="text-xs font-semibold text-slate-400">({tr('Optional', 'اختیاری')})</span>
                  </label>
                  <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-white/90 px-3 focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-400/30">
                      <svg className="h-[18px] w-[18px] text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A8 8 0 1118.879 17.8M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                      </svg>
                      <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="h-full w-full bg-transparent px-2 text-sm font-bold text-slate-700 outline-hidden" placeholder={tr('Example: Ahmad Ahmadi', 'مثال: حاجی صاحب احمد')} disabled={readOnly}/>
                  </div>
              </div>

              <div className="space-y-1.5">
                  <label className="block text-sm font-black text-slate-700">
                      {t.phoneNumber} <span className="text-xs font-semibold text-slate-400">({tr('Optional', 'اختیاری')})</span>
                  </label>
                  <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-white/90 px-3 focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-400/30">
                      <svg className="h-[18px] w-[18px] text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.2a1 1 0 01.98.804l.74 3.7a1 1 0 01-.54 1.09l-1.95.97a16.02 16.02 0 007.2 7.2l.97-1.95a1 1 0 011.09-.54l3.7.74A1 1 0 0121 15.8V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                      </svg>
                      <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="h-full w-full bg-transparent px-2 text-left font-mono text-sm font-semibold text-slate-700 outline-hidden" dir="ltr" placeholder="07XXXXXXXX" disabled={readOnly}/>
                  </div>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                  <label className="block text-sm font-black text-slate-700">
                      {tr('Address', 'آدرس')} <span className="text-xs font-semibold text-slate-400">({tr('Optional', 'اختیاری')})</span>
                  </label>
                  <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-white/90 px-3 focus-within:border-brand-300 focus-within:ring-2 focus-within:ring-brand-400/30">
                      <svg className="h-[18px] w-[18px] text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21s7-5.5 7-10a7 7 0 10-14 0c0 4.5 7 10 7 10z"/>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12a2 2 0 100-4 2 2 0 000 4z"/>
                      </svg>
                      <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="h-full w-full bg-transparent px-2 text-sm font-semibold text-slate-700 outline-hidden" placeholder={tr('Example: Kabul, District 4', 'مثال: کابل، حوزه چهارم')} disabled={readOnly}/>
                  </div>
              </div>
          </div>

          {!editingId && (<div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                <label className="mb-1.5 block text-sm font-black text-slate-700">
                    {t.balance} ({tr('Opening balance', 'توازن اولیه')})
                </label>
                <input type="number" value={formData.balance} onChange={(e) => setFormData({ ...formData, balance: Number(e.target.value) })} className="w-full rounded-xl border border-slate-200 bg-white/90 px-4 py-2.5 text-center text-base font-black text-slate-800 outline-hidden transition focus:border-brand-300 focus:ring-2 focus:ring-brand-400/30" placeholder="0" disabled={readOnly}/>
                <p className="mt-1.5 text-[11px] font-semibold text-slate-400">
                    {tr('Positive numbers mean customer debt (payable to store).', 'اعداد مثبت به معنی بدهکاری مشتری (قرضدار به فروشگاه) است.')}
                </p>
            </div>)}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50">{t.cancel}</button>
              <button type="submit" disabled={readOnly} className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-8 py-2.5 text-sm font-black text-white shadow-lg shadow-brand-500/30 transition hover:from-brand-700 hover:to-brand-600 disabled:opacity-50 disabled:cursor-not-allowed">{t.save}</button>
          </div>
        </form>
      </Modal>

      {selectedCustomer && (<Modal isOpen={isLedgerOpen} onClose={() => { setIsLedgerOpen(false); setSelectedCustomerId(null); }} title={`${t.ledger}: ${getDisplayName(selectedCustomer)}`}>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                  <div className={`xl:col-span-5 rounded-[26px] border p-5 shadow-[0_16px_34px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl ${transactionType === 'payment' ? 'border-emerald-100 bg-gradient-to-br from-emerald-50/85 via-white to-emerald-100/45' : 'border-rose-100 bg-gradient-to-br from-rose-50/85 via-white to-rose-100/45'}`}>
                      <div className="mb-5 flex items-center justify-between gap-2">
                          <h3 className={`flex items-center gap-2 text-base font-black ${transactionType === 'payment' ? 'text-emerald-800' : 'text-rose-800'}`}>
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01M12 6v-1h4v1m-4 10v1h4v-1"/>
                              </svg>
                              {transactionType === 'payment' ? t.receivePayment : t.addManualDebt}
                          </h3>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${transactionType === 'payment' ? 'border-emerald-200 bg-emerald-100/75 text-emerald-700' : 'border-rose-200 bg-rose-100/75 text-rose-700'}`}>
                              {transactionType === 'payment' ? tr('Settlement', 'تصفیه') : tr('Debt Entry', 'ثبت بدهی')}
                          </span>
                      </div>

                      <div className="mb-5 flex rounded-2xl border border-white/70 bg-white/65 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                          <button type="button" disabled={ledgerLocked} onClick={() => setTransactionType('payment')} className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-black transition disabled:opacity-50 disabled:cursor-not-allowed ${transactionType === 'payment' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-white/70'}`}>{isEnglish ? 'Collect Cash' : 'تصفیه / وصول'}</button>
                          <button type="button" disabled={ledgerLocked} onClick={() => setTransactionType('debt')} className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-black transition disabled:opacity-50 disabled:cursor-not-allowed ${transactionType === 'debt' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-500 hover:bg-white/70'}`}>{isEnglish ? 'Add Debt' : 'افزایش بدهکاری'}</button>
                      </div>

                      <form onSubmit={handleTransactionSubmit} className="space-y-4">
                          <div className="space-y-1.5">
                              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500">{t.amount}</label>
                              <input ref={amountInputRef} type="text" inputMode="numeric" value={transactionAmount} onChange={(e) => setTransactionAmount(e.target.value)} className="w-full rounded-2xl border border-white/70 bg-white/85 px-4 py-3 text-center text-2xl font-black text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] outline-hidden transition focus:border-brand-300 focus:ring-2 focus:ring-brand-400/30" placeholder="0" disabled={ledgerLocked}/>
                          </div>

                          <div className="space-y-1.5">
                              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500">{t.description}</label>
                              <input type="text" value={transactionNote} onChange={(e) => setTransactionNote(e.target.value)} className="w-full rounded-xl border border-white/70 bg-white/85 px-4 py-3 text-sm font-bold text-slate-700 outline-hidden transition focus:border-brand-300 focus:ring-2 focus:ring-brand-400/30" placeholder={transactionType === 'payment' ? tr('Invoice settlement...', 'بابت تصفیه فاکتور...') : tr('Additional service...', 'خدمات اضافی...')} disabled={ledgerLocked}/>
                          </div>

                          <div className="space-y-2 rounded-2xl border border-white/70 bg-white/65 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                                  <span>{tr('Current Balance', 'توازن فعلی')}</span>
                                  <span>{selectedCustomer.balance.toLocaleString()} AFN</span>
                              </div>
                              <div className="flex items-center justify-between border-t border-white/70 pt-2 text-sm font-black text-slate-700">
                                  <span>{tr('Projected Balance', 'توازن نهایی')}</span>
                                  <span>{projectedBalance.toLocaleString()} AFN</span>
                              </div>
                          </div>

                          <button type="submit" disabled={!transactionAmount || ledgerLocked || isSubmittingTransaction} className={`w-full rounded-2xl py-3.5 text-sm font-black text-white shadow-xl transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${transactionType === 'payment' ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-emerald-500/25 hover:from-emerald-700 hover:to-emerald-600' : 'bg-gradient-to-r from-rose-600 to-rose-500 shadow-rose-500/25 hover:from-rose-700 hover:to-rose-600'}`}>
                              {t.save}
                          </button>
                      </form>
                  </div>

                  <div className="xl:col-span-7">
                      <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white/80 shadow-[0_16px_36px_-26px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50/80 px-4 py-3.5">
                              <span className="text-sm font-black text-slate-700">{t.recentActivity}</span>
                              <div className="flex items-center gap-2">
                                  <span className="rounded-full border border-blue-200 bg-blue-100/75 px-2.5 py-1 text-[10px] font-black text-blue-700">
                                      {tr('Count', 'تعداد')}: {selectedCustomer.transactions.length}
                                  </span>
                                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500">
                                      {tr('Customer', 'مشتری')}: {getDisplayName(selectedCustomer)}
                                  </span>
                              </div>
                          </div>

                          <div className="max-h-[560px] overflow-y-auto custom-scrollbar">
                            <table className="min-w-full divide-y divide-slate-100">
                                <thead className="sticky top-0 z-10 bg-white/90 backdrop-blur-md">
                                    <tr>
                                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">{t.date}</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">{t.description}</th>
                                        <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-wider text-slate-500">{t.amount}</th>
                                        <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-wider text-slate-500 w-28">{t.operation}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white/75">
                                    {getTransactions(selectedCustomer).map(txn => {
                const isPaymentTxn = ['payment', 'return'].includes(txn.type);
                return (<tr key={txn.id} className="group transition-colors hover:bg-brand-50/35">
                                                <td className="px-4 py-3.5 whitespace-nowrap text-[11px] font-semibold text-slate-400">{formatCustomerDate(txn.date)}</td>
                                                <td className="px-4 py-3.5 text-xs font-bold leading-relaxed text-slate-700">{txn.description}</td>
                                                <td className={`px-4 py-3.5 text-center text-xs font-black ${isPaymentTxn ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {isPaymentTxn ? '-' : '+'}{txn.amount.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3.5 text-center">
                                                    <div className="flex justify-center gap-1.5">
                                                        <button onClick={() => printReceipt(selectedCustomer, txn)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:border-brand-200 hover:text-brand-700" title={t.print}>
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                                                            </svg>
                                                        </button>
                                                        <button disabled={ledgerLocked} onClick={() => handleDeleteTransaction(txn.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-100 bg-rose-50/80 text-rose-300 transition hover:border-rose-200 hover:text-rose-700 disabled:opacity-45 disabled:cursor-not-allowed" title={t.delete}>
                                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>);
            })}
                                    {selectedCustomer.transactions.length === 0 && (<tr>
                                            <td colSpan={4} className="px-4 py-8 text-center">
                                                <p className="text-sm font-bold text-slate-400">{tr('No transaction history yet.', 'هنوز تراکنشی ثبت نشده است.')}</p>
                                            </td>
                                        </tr>)}
                                </tbody>
                            </table>
                          </div>
                      </div>
                  </div>
              </div>
          </Modal>)}

      {customerToDelete && (<Modal isOpen={true} onClose={() => setCustomerToDelete(null)} title={t.delete}>
              <div className="space-y-5">
                  <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-50/95 via-white to-rose-100/60 p-5 shadow-[0_12px_30px_-24px_rgba(225,29,72,0.5)]">
                      <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-200 bg-rose-100 text-rose-600">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 9v2m0 4h.01M10.29 3.86l-7.1 12.3A2 2 0 004.91 19h14.18a2 2 0 001.72-2.84l-7.1-12.3a2 2 0 00-3.42 0z"/>
                          </svg>
                      </div>
                      <p className="text-lg font-black text-rose-800">{isEnglish ? `Delete ${getDisplayName(customerToDelete)}?` : `آیا از حذف دایمی مشتری "${getDisplayName(customerToDelete)}" اطمینان دارید؟`}</p>
                      <p className="mt-2 text-sm font-semibold leading-relaxed text-rose-600">{isEnglish ? 'All transaction history will be lost forever.' : 'توجه: با این کار تمام سوابق مالی و تاریخچهٔ دفتر این شخص حذف شده و غیرقابل بازگشت است.'}</p>
                  </div>
                  <div className="flex justify-end gap-3 border-t border-slate-100 pt-2">
                      <button onClick={() => setCustomerToDelete(null)} className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50">{t.cancel}</button>
                      <button onClick={handleConfirmDelete} disabled={readOnly || isGuestTrial} className="rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-8 py-2.5 text-sm font-black text-white shadow-lg shadow-rose-500/30 transition hover:from-rose-700 hover:to-rose-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">{t.delete}</button>
                  </div>
              </div>
          </Modal>)}
    </PageSurface>);
};
