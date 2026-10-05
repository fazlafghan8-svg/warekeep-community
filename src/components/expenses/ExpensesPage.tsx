import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logTableRender } from '../../utils/performanceTelemetry';
import { Expense, AppSettings, AppUser, PurchaseAttachment } from '../../types';
import { Modal } from '../ui/Modal';
import { JalaliDatePicker } from '../ui/JalaliDatePicker';
import { normalizePersianNumbers } from '../../utils/localization';
import { getTranslation } from '../../utils/translations';
import { Button } from '../ui/Button';
import { InlineAlert } from '../ui/InlineAlert';
import { PageSurface } from '../ui/Surface';
import { openAttachmentPreview } from '../../services/attachmentPreviewService';
import { ATTACHMENT_INPUT_ACCEPT, isSupportedAttachmentFile } from '../../utils/attachmentTypePolicy';
import { createUniqueId } from '../../utils/localIds';
import { formatAppDate, formatAppDateTime, resolveUiLocale } from '@/lib/formatters';
import { KpiCard } from './KpiCard';
import { CategorySelect } from './CategorySelect';
import { CategoryIconsContext } from './CategoryTag';
import { ExpensesToolbar } from './ExpensesToolbar';
import { ExpensesTable } from './ExpensesTable';
import { ExpenseDrawer } from './ExpenseDrawer';
import { BulkActionBar } from './BulkActionBar';
import { EmptyState } from './EmptyState';
import { DrawerFocus, ExpenseFormatters, ExpenseSort, ExpenseView, TableDensity, bidiIsolate, compareExpenses, isRecurringExpense, needsReview, readStoredFlag, readStoredValue, writeStoredValue } from './helpers';
import { DownloadIcon, PlusIcon, XIcon } from './icons';
export interface ExpensesProps {
    expenses: Expense[];
    onAddExpense: (expense: Omit<Expense, 'id'>) => void;
    onUpdateExpense?: (id: string, expense: Partial<Expense>) => void;
    onDeleteExpense: (id: string) => void;
    /** Batch variants: one persisted write for N rows. Without them, bulk actions fall back to per-id calls. */
    onUpdateExpensesBulk?: (ids: string[], expense: Partial<Expense>) => void;
    onDeleteExpensesBulk?: (ids: string[]) => void;
    settings: AppSettings;
    activeAppUser?: AppUser | null;
    readOnly?: boolean;
    isLoading?: boolean;
}
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_SIZE = 2000000;
const EXPENSE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const INTRO_STORAGE_KEY = 'wk.expenses.introDismissed';
const DENSITY_STORAGE_KEY = 'wk.expenses.tableDensity';
const inputClass = 'wk-input mt-2';
const labelClass = 'block text-[11px] font-black uppercase tracking-[0.14em] text-slate-500';
const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
});
export const ExpensesPage: React.FC<ExpensesProps> = ({ expenses = [], onAddExpense, onUpdateExpense, onDeleteExpense, onUpdateExpensesBulk, onDeleteExpensesBulk, settings, activeAppUser, readOnly = false, isLoading = false, }) => {
    const t = getTranslation(settings.language || 'dari');
    const isEnglish = (settings.language || 'dari') === 'english';
    const tr = useCallback((en: string, fa: string) => (isEnglish ? en : fa), [isEnglish]);
    const currencyCode = settings.currencySettings?.baseCurrency || 'AFN';
    const canEdit = Boolean(onUpdateExpense);
    const locale = resolveUiLocale(settings.language);
    const fmt = useMemo<ExpenseFormatters>(() => {
        const numberFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
        const moneyFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
        const currencyLabel = isEnglish || currencyCode !== 'AFN' ? currencyCode : 'افغانی';
        return {
            num: (value: number) => numberFormatter.format(Math.round(value || 0)),
            money: (value: number) => `${moneyFormatter.format(Number.isFinite(value) ? value : 0)} ${currencyLabel}`,
            date: (value) => formatAppDate(value, settings, 'expenses'),
            dateTime: (value) => formatAppDateTime(value, settings, 'expenses'),
        };
    }, [locale, isEnglish, currencyCode, settings]);
    // View state
    const [activeView, setActiveView] = useState<ExpenseView>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [density, setDensity] = useState<TableDensity>(() => (readStoredValue(DENSITY_STORAGE_KEY) === 'compact' ? 'compact' : 'normal'));
    const [sort, setSort] = useState<ExpenseSort>({ key: 'date', dir: 'desc' });
    const [expensePage, setExpensePage] = useState(1);
    const [expensePageSize, setExpensePageSize] = useState<number>(EXPENSE_PAGE_SIZE_OPTIONS[0]);
    const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
    const [drawerId, setDrawerId] = useState<string | null>(null);
    const [drawerFocus, setDrawerFocus] = useState<DrawerFocus>(null);
    const [introDismissed, setIntroDismissed] = useState(() => readStoredFlag(INTRO_STORAGE_KEY));
    // Editor modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('');
    const [recurrence, setRecurrence] = useState<'none' | 'monthly' | 'weekly'>('none');
    const [nextDueDate, setNextDueDate] = useState('');
    const [attachments, setAttachments] = useState<PurchaseAttachment[]>([]);
    const tableRenderCountRef = useRef(0);
    tableRenderCountRef.current += 1;
    const modalFileInputRef = useRef<HTMLInputElement | null>(null);
    const drawerUploadInFlightRef = useRef(false);
    const categories = settings.expenseCategories && settings.expenseCategories.length > 0
        ? settings.expenseCategories
        : (isEnglish ? ['Rent', 'Electricity', 'Water', 'Food', 'Salary & Wages', 'Transport', 'Misc'] : ['کرایه', 'برق', 'آب', 'غذا', 'حقوق و دستمزد', 'حمل‌ونقل', 'متفرقه']);
    const activeExpenses = useMemo(() => expenses.filter((item) => !item.isDeleted), [expenses]);
    const totalThisMonth = useMemo(() => {
        const now = new Date();
        return activeExpenses
            .filter((item) => {
            const d = new Date(item.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        })
            .reduce((sum, item) => sum + item.amount, 0);
    }, [activeExpenses]);
    const totalAllTime = useMemo(() => activeExpenses.reduce((sum, item) => sum + item.amount, 0), [activeExpenses]);
    const recurringExpenses = useMemo(() => activeExpenses.filter((item) => isRecurringExpense(item)), [activeExpenses]);
    const recurringPerCycleTotal = useMemo(() => recurringExpenses.reduce((sum, item) => sum + item.amount, 0), [recurringExpenses]);
    const reviewCount = useMemo(() => activeExpenses.filter((item) => needsReview(item)).length, [activeExpenses]);
    const visibleExpenses = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        const source = activeView === 'recurring'
            ? recurringExpenses
            : activeView === 'review'
                ? activeExpenses.filter((item) => needsReview(item))
                : activeExpenses;
        return source
            .filter((item) => {
            const byCategory = selectedCategories.length === 0 || selectedCategories.includes(item.category);
            const dateKey = (item.date || '').slice(0, 10);
            const byDateFrom = !dateFrom || dateKey >= dateFrom;
            const byDateTo = !dateTo || dateKey <= dateTo;
            const byQuery = !query
                || item.title.toLowerCase().includes(query)
                || item.category.toLowerCase().includes(query)
                || (item.description || '').toLowerCase().includes(query)
                || (item.attachments || []).some((attachment) => attachment.name.toLowerCase().includes(query));
            return byCategory && byDateFrom && byDateTo && byQuery;
        })
            .sort((a, b) => compareExpenses(a, b, sort, isEnglish ? 'en' : 'fa'));
    }, [activeExpenses, activeView, dateFrom, dateTo, isEnglish, recurringExpenses, searchTerm, selectedCategories, sort]);
    useEffect(() => {
        setExpensePage(1);
    }, [activeView, expensePageSize, selectedCategories, searchTerm, dateFrom, dateTo]);
    // Keep the selection limited to rows the user can currently see, so bulk
    // actions never touch rows hidden by search/category/date filters or tabs.
    useEffect(() => {
        setSelectedIds((current) => {
            if (current.size === 0)
                return current;
            const visible = new Set(visibleExpenses.map((item) => item.id));
            const next = new Set([...current].filter((id) => visible.has(id)));
            return next.size === current.size ? current : next;
        });
    }, [visibleExpenses]);
    const expensePageCount = Math.max(1, Math.ceil(visibleExpenses.length / expensePageSize));
    const safeExpensePage = Math.min(expensePage, expensePageCount);
    const expensePageStart = visibleExpenses.length === 0 ? 0 : (safeExpensePage - 1) * expensePageSize + 1;
    const expensePageEnd = Math.min(visibleExpenses.length, safeExpensePage * expensePageSize);
    const paginatedExpenses = useMemo(() => visibleExpenses.slice((safeExpensePage - 1) * expensePageSize, safeExpensePage * expensePageSize), [expensePageSize, safeExpensePage, visibleExpenses]);
    useEffect(() => {
        if (expensePage !== safeExpensePage)
            setExpensePage(safeExpensePage);
    }, [expensePage, safeExpensePage]);
    useEffect(() => {
        logTableRender('expenses', tableRenderCountRef.current, paginatedExpenses.length);
    }, [paginatedExpenses.length]);
    const drawerExpense = drawerId ? activeExpenses.find((item) => item.id === drawerId) || null : null;
    const hasActiveFilters = searchTerm.trim().length > 0 || selectedCategories.length > 0 || Boolean(dateFrom) || Boolean(dateTo);
    const guestGuard = (message: {
        en: string;
        fa: string;
    }) => {
        if (!readOnly)
            return false;
        window.alert(tr(message.en, message.fa));
        return true;
    };
    const resetForm = () => {
        setEditingId(null);
        setTitle('');
        setAmount('');
        setCategory('');
        setDate(new Date().toISOString().split('T')[0]);
        setDescription('');
        setRecurrence('none');
        setNextDueDate('');
        setAttachments([]);
    };
    const openCreateModal = () => {
        if (guestGuard({ en: 'Guest Trial: expense creation is disabled.', fa: 'حالت مهمان: ثبت هزینه غیرفعال است.' }))
            return;
        resetForm();
        setIsModalOpen(true);
    };
    const handleEditClick = (expense: Expense) => {
        if (guestGuard({ en: 'Guest Trial: expense editing is disabled.', fa: 'حالت مهمان: ویرایش هزینه غیرفعال است.' }))
            return;
        if (!onUpdateExpense)
            return;
        setEditingId(expense.id);
        setTitle(expense.title);
        setAmount(String(expense.amount));
        setCategory(expense.category);
        setDate((expense.date || '').slice(0, 10));
        setDescription(expense.description || '');
        setRecurrence(expense.recurrence || 'none');
        setNextDueDate((expense.nextDueDate || '').slice(0, 10));
        setAttachments((expense.attachments || []).map((attachment) => ({ ...attachment })));
        setIsModalOpen(true);
    };
    const handleUseAsTemplate = (expense: Expense) => {
        if (guestGuard({ en: 'Guest Trial: expense creation is disabled.', fa: 'حالت مهمان: ثبت هزینه غیرفعال است.' }))
            return;
        setEditingId(null);
        setTitle(expense.title);
        setAmount(String(expense.amount));
        setCategory(expense.category);
        setDate(new Date().toISOString().split('T')[0]);
        setDescription(expense.description || '');
        setRecurrence(expense.recurrence || 'none');
        setNextDueDate(expense.nextDueDate || new Date().toISOString().split('T')[0]);
        setAttachments([]);
        setIsModalOpen(true);
    };
    const handleDelete = (expense: Expense) => {
        if (guestGuard({ en: 'Guest Trial: expense deletion is disabled.', fa: 'حالت مهمان: حذف هزینه غیرفعال است.' }))
            return;
        const confirmed = window.confirm(tr(`Delete expense "${bidiIsolate(expense.title)}"? This cannot be undone.`, `هزینه «${bidiIsolate(expense.title)}» حذف شود؟ این کار قابل بازگشت نیست.`));
        if (!confirmed)
            return;
        onDeleteExpense(expense.id);
        setSelectedIds((current) => {
            if (!current.has(expense.id))
                return current;
            const next = new Set(current);
            next.delete(expense.id);
            return next;
        });
        if (drawerId === expense.id)
            setDrawerId(null);
    };
    const validateFiles = (files: File[], existingCount: number): File[] | null => {
        const room = MAX_ATTACHMENTS - existingCount;
        if (room <= 0) {
            window.alert(tr('A maximum of 4 attachments is allowed per expense.', 'برای هر هزینه حداکثر ۴ پیوست مجاز است.'));
            return null;
        }
        const accepted = files.slice(0, room);
        if (accepted.some((file) => !isSupportedAttachmentFile(file))) {
            window.alert(tr('Choose a PDF, JPG, PNG, WebP, GIF, or BMP document.', 'یک فایل PDF یا تصویر JPG، PNG، WebP، GIF یا BMP انتخاب کنید.'));
            return null;
        }
        const oversize = accepted.find((file) => file.size > MAX_ATTACHMENT_SIZE);
        if (oversize) {
            window.alert(tr(`Attachment "${bidiIsolate(oversize.name)}" exceeds 2 MB. Choose a smaller file.`, `حجم فایل «${bidiIsolate(oversize.name)}» از سقف ۲ مگابایت بیشتر است. فایل کوچک‌تری انتخاب کنید.`));
            return null;
        }
        return accepted;
    };
    const buildAttachments = async (files: File[]): Promise<PurchaseAttachment[]> => Promise.all(files.map(async (file) => ({
        id: createUniqueId('expense-attachment'),
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl: await readFileAsDataUrl(file),
        uploadedAt: new Date().toISOString(),
    })));
    const handleModalAttachmentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = validateFiles(Array.from(event.target.files || []), attachments.length);
        event.target.value = '';
        if (!files || !files.length)
            return;
        const next = await buildAttachments(files);
        setAttachments((current) => [...current, ...next]);
    };
    const handleDrawerPickAttachments = async (expense: Expense, fileList: FileList | null) => {
        if (readOnly || !onUpdateExpense)
            return;
        // One pick at a time: a second pick during the FileReader await would
        // base its read-modify-write on a stale attachments snapshot.
        if (drawerUploadInFlightRef.current)
            return;
        const existing = expense.attachments || [];
        const files = validateFiles(Array.from(fileList || []), existing.length);
        if (!files || !files.length)
            return;
        drawerUploadInFlightRef.current = true;
        try {
            const next = await buildAttachments(files);
            onUpdateExpense(expense.id, { attachments: [...existing, ...next] });
        }
        finally {
            drawerUploadInFlightRef.current = false;
        }
    };
    const removeAttachment = (attachmentId: string) => {
        setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
    };
    const handleOpenAttachment = async (attachment: PurchaseAttachment) => {
        const opened = await openAttachmentPreview(attachment);
        if (!opened) {
            window.alert(tr('Could not open this attachment.', 'باز کردن این پیوست ممکن نشد.'));
        }
    };
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (guestGuard({ en: 'Guest Trial: expense editing is disabled.', fa: 'حالت مهمان: ویرایش هزینه غیرفعال است.' }))
            return;
        const parsedAmount = parseFloat(amount);
        if (!title.trim() || !category || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            window.alert(tr('Complete the title, category, and a valid amount, then save again.', 'عنوان، دسته و مبلغ معتبر را کامل کنید و دوباره ذخیره بزنید.'));
            return;
        }
        const payload: Omit<Expense, 'id'> = {
            title: title.trim(),
            amount: parsedAmount,
            category,
            date,
            description: description.trim(),
            recurrence,
            nextDueDate: recurrence !== 'none' ? (nextDueDate || date) : undefined,
            attachments,
            userId: activeAppUser?.id || 'admin'
        };
        if (editingId && onUpdateExpense)
            onUpdateExpense(editingId, payload);
        else
            onAddExpense(payload);
        resetForm();
        setIsModalOpen(false);
    };
    const handleAmountInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = normalizePersianNumbers(e.target.value);
        if (val === '' || /^\d*\.?\d*$/.test(val))
            setAmount(val);
    };
    const openDrawer = (expense: Expense, focus: DrawerFocus = null) => {
        setDrawerId(expense.id);
        setDrawerFocus(focus);
    };
    const handleBulkCategory = (nextCategory: string) => {
        if (readOnly)
            return;
        const ids = [...selectedIds];
        if (onUpdateExpensesBulk)
            onUpdateExpensesBulk(ids, { category: nextCategory });
        else if (onUpdateExpense)
            ids.forEach((id) => onUpdateExpense(id, { category: nextCategory }));
        else
            return;
        setSelectedIds(new Set());
    };
    const handleBulkDelete = () => {
        if (guestGuard({ en: 'Guest Trial: expense deletion is disabled.', fa: 'حالت مهمان: حذف هزینه غیرفعال است.' }))
            return;
        const ids = [...selectedIds];
        if (ids.length === 0)
            return;
        const confirmed = window.confirm(tr(`Delete ${ids.length} selected expense(s)? This cannot be undone.`, `${fmt.num(ids.length)} هزینه انتخاب‌شده حذف شود؟ این کار قابل بازگشت نیست.`));
        if (!confirmed)
            return;
        if (onDeleteExpensesBulk)
            onDeleteExpensesBulk(ids);
        else
            ids.forEach((id) => onDeleteExpense(id));
        setSelectedIds(new Set());
        if (drawerId && selectedIds.has(drawerId))
            setDrawerId(null);
    };
    const handleExport = () => {
        const headers = [
            tr('Title', 'عنوان'),
            tr('Category', 'دسته'),
            tr('Amount', 'مبلغ'),
            tr('Currency', 'واحد پول'),
            tr('Date (ISO)', 'تاریخ (میلادی)'),
            tr('Date', 'تاریخ نمایش'),
            tr('Status', 'وضعیت'),
            tr('Note', 'یادداشت'),
            tr('Attachments', 'تعداد پیوست'),
        ];
        const escapeCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
        const lines = visibleExpenses.map((expense) => [
            expense.title,
            expense.category,
            expense.amount,
            currencyCode,
            expense.date,
            fmt.date(expense.date),
            needsReview(expense) ? tr('Needs review', 'نیازمند بازبینی') : tr('Ready', 'آماده'),
            expense.description || '',
            expense.attachments?.length || 0,
        ].map(escapeCell).join(','));
        const utf8Bom = String.fromCharCode(0xfeff);
        const csv = utf8Bom + [headers.map(escapeCell).join(','), ...lines].join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `warekeep-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    };
    const dismissIntro = () => {
        setIntroDismissed(true);
        writeStoredValue(INTRO_STORAGE_KEY, '1');
    };
    const handleDensityChange = (value: TableDensity) => {
        setDensity(value);
        writeStoredValue(DENSITY_STORAGE_KEY, value);
    };
    const clearFilters = () => {
        setSearchTerm('');
        setSelectedCategories([]);
        setDateFrom('');
        setDateTo('');
    };
    const emptyState = (() => {
        if (activeExpenses.length === 0 && !hasActiveFilters) {
            return (<EmptyState title={tr('No expenses recorded yet', 'هنوز هزینه‌ای ثبت نشده است')} description={tr('Record your first expense to start tracking business spending.', 'اولین مصرف را ثبت کنید تا پیگیری هزینه‌های کسب‌وکار شروع شود.')} action={<Button variant="primary" onClick={openCreateModal} disabled={readOnly}><PlusIcon className="h-4 w-4"/> {tr('Record first expense', 'ثبت اولین مصرف')}</Button>}/>);
        }
        if (activeView === 'review' && !hasActiveFilters) {
            return (<EmptyState title={tr('Every record is ready', 'همه رکوردها آماده‌اند')} description={tr('No expense needs a note or attachment right now.', 'در حال حاضر هیچ هزینه‌ای به یادداشت یا پیوست نیاز ندارد.')}/>);
        }
        if (activeView === 'recurring' && !hasActiveFilters) {
            return (<EmptyState title={tr('No recurring expenses yet', 'هنوز هزینه تکرارشونده‌ای ثبت نشده است')} description={tr('Turn on “Recurring” for repeating costs so they stay visible every cycle.', 'برای هزینه‌های تکراری گزینه «تکرارشونده» را روشن کنید تا در هر دوره در دید بمانند.')}/>);
        }
        return (<EmptyState title={tr('No expenses match this filter', 'هزینه‌ای با این فیلتر پیدا نشد')} description={tr('Change the search, category, or date filters to see more records.', 'جستجو، دسته یا بازه تاریخ را تغییر دهید تا رکوردهای بیشتری ببینید.')} action={hasActiveFilters ? <Button variant="secondary" onClick={clearFilters}>{tr('Clear filters', 'پاک‌سازی فیلترها')}</Button> : undefined}/>);
    })();
    const skeleton = (<div className="space-y-4" aria-hidden="true">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (<div key={index} className="rounded-xl border border-neutral-200 bg-white p-4">
                        <div className="wk-skeleton-line" style={{ width: '55%' }}/>
                        <div className="wk-skeleton-line mt-3" style={{ width: '40%' }}/>
                    </div>))}
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
                {Array.from({ length: 6 }).map((_, index) => (<div key={index} className="wk-skeleton-line mt-3 first:mt-0" style={{ width: `${96 - index * 6}%` }}/>))}
            </div>
        </div>);
    return (<CategoryIconsContext.Provider value={settings.expenseCategoryIcons}>
        <PageSurface className="min-h-full p-4 sm:p-5" dir={isEnglish ? 'ltr' : 'rtl'}>
            <div className="space-y-4">
                {/* Compact header */}
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-xl font-black leading-7 text-slate-950">{t.expenses}</h1>
                        <p className="mt-0.5 truncate text-sm font-semibold text-slate-500">
                            {tr('Record and review business expenses.', 'ثبت و بازبینی هزینه‌های کسب‌وکار')}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Button variant="secondary" onClick={handleExport} aria-label={tr('Export expenses (Excel)', 'خروجی هزینه‌ها (اکسل)')} title={tr('Export (Excel)', 'خروجی (اکسل)')} className="gap-1.5">
                            <DownloadIcon className="h-4 w-4"/>
                            <span className="hidden md:inline">{tr('Export', 'خروجی')}</span>
                        </Button>
                        <Button variant="primary" onClick={openCreateModal} disabled={readOnly} className="gap-1.5">
                            <PlusIcon className="h-4 w-4"/>
                            {t.addExpense}
                        </Button>
                    </div>
                </header>

                {/* One-time dismissible intro */}
                {!introDismissed && !isLoading ? (<div className="flex items-center justify-between gap-3 rounded-xl border border-info-100 bg-info-50 px-3.5 py-2.5">
                        <p className="text-xs font-semibold leading-5 text-info-700">
                            {tr('Record an expense, then add its note and receipt so the record becomes ready for review.', 'هزینه را ثبت کنید و سپس یادداشت و رسید آن را ضمیمه کنید تا رکورد برای بازبینی آماده شود.')}
                        </p>
                        <button type="button" onClick={dismissIntro} aria-label={tr('Dismiss guide', 'بستن راهنما')} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-info-700 transition hover:bg-info-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                            <XIcon className="h-4 w-4"/>
                        </button>
                    </div>) : null}

                {readOnly ? (<InlineAlert tone="warning" title={tr('Expense actions are locked', 'عملیات هزینه قفل است')}>
                        {tr('You can review expense records, but create, edit, and delete are disabled in the current mode.', 'می‌توانید رکوردهای هزینه را ببینید، اما ثبت، ویرایش و حذف در وضعیت فعلی غیرفعال است.')}
                    </InlineAlert>) : null}

                {isLoading ? skeleton : (<>
                        {/* KPI row */}
                        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                            <KpiCard label={t.thisMonthExpenses} value={fmt.money(totalThisMonth)} hint={tr('current month', 'ماه جاری')} tone={totalThisMonth === 0 ? 'muted' : 'default'}/>
                            <KpiCard label={t.totalExpenses} value={fmt.money(totalAllTime)} hint={tr('all records', 'همه رکوردها')} tone={totalAllTime === 0 ? 'muted' : 'default'}/>
                            <KpiCard label={tr('Needs review', 'نیازمند بازبینی')} value={fmt.num(reviewCount)} hint={tr('to complete', 'برای تکمیل')} tone={reviewCount > 0 ? 'warning' : 'muted'} onClick={() => setActiveView(activeView === 'review' ? 'all' : 'review')} active={activeView === 'review'}/>
                            <KpiCard label={tr('Recurring cost', 'هزینه تکرارشونده')} value={fmt.money(recurringPerCycleTotal)} hint={tr('per cycle', 'جمع هر دوره')} tone={recurringExpenses.length === 0 ? 'muted' : 'default'}/>
                        </div>

                        {/* Toolbar + table */}
                        <div>
                            <ExpensesToolbar tr={tr} isEnglish={isEnglish} view={activeView} onViewChange={setActiveView} counts={{ all: activeExpenses.length, review: reviewCount, recurring: recurringExpenses.length }} fmtNum={fmt.num} searchTerm={searchTerm} onSearchChange={setSearchTerm} categories={categories} selectedCategories={selectedCategories} onSelectedCategoriesChange={setSelectedCategories} dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} density={density} onDensityChange={handleDensityChange} hasActiveFilters={hasActiveFilters} onClearFilters={clearFilters}/>
                            <ExpensesTable rows={paginatedExpenses} totalCount={visibleExpenses.length} pageStart={expensePageStart} pageEnd={expensePageEnd} page={safeExpensePage} pageCount={expensePageCount} pageSize={expensePageSize} pageSizeOptions={EXPENSE_PAGE_SIZE_OPTIONS} onPageChange={setExpensePage} onPageSizeChange={setExpensePageSize} density={density} sort={sort} onSortChange={setSort} selectedIds={selectedIds} onToggleSelect={(id) => setSelectedIds((current) => {
                const next = new Set(current);
                if (next.has(id))
                    next.delete(id);
                else
                    next.add(id);
                return next;
            })} onTogglePageSelection={(ids, select) => setSelectedIds((current) => {
                const next = new Set(current);
                ids.forEach((id) => {
                    if (select)
                        next.add(id);
                    else
                        next.delete(id);
                });
                return next;
            })} activeId={drawerId} canEdit={canEdit} readOnly={readOnly} fmt={fmt} tr={tr} isEnglish={isEnglish} labels={{
                title: t.expenseTitle,
                category: t.category,
                amount: t.amount,
                date: t.date,
                status: tr('Status', 'وضعیت'),
                edit: t.edit,
            }} emptyState={emptyState} onOpen={(expense) => openDrawer(expense)} onEdit={handleEditClick} onDelete={handleDelete} onAddNote={(expense) => openDrawer(expense, 'note')} onAddAttachment={(expense) => openDrawer(expense, 'attachment')} onMakeRecurring={(expense) => openDrawer(expense, 'recurrence')}/>
                        </div>
                    </>)}

                <ExpenseDrawer expense={drawerExpense} isOpen={Boolean(drawerExpense)} onClose={() => setDrawerId(null)} focusRequest={drawerFocus} onFocusHandled={() => setDrawerFocus(null)} readOnly={readOnly} canEdit={canEdit} onEdit={handleEditClick} onUpdate={onUpdateExpense} onDelete={handleDelete} onUseTemplate={handleUseAsTemplate} onOpenAttachment={(attachment) => void handleOpenAttachment(attachment)} onPickAttachments={(expense, files) => void handleDrawerPickAttachments(expense, files)} fmt={fmt} tr={tr} isEnglish={isEnglish} suspendEscape={isModalOpen}/>

                <BulkActionBar count={selectedIds.size} fmtNum={fmt.num} categories={categories} onApplyCategory={handleBulkCategory} onDelete={handleBulkDelete} onClear={() => setSelectedIds(new Set())} readOnly={readOnly} canEdit={canEdit} tr={tr} isEnglish={isEnglish}/>

                <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} dir={isEnglish ? 'ltr' : 'rtl'} title={editingId ? `${t.edit} ${t.expenseTitle}` : t.addExpense}>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className={labelClass}>{t.expenseTitle}</label>
                            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} disabled={readOnly}/>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label className={labelClass}>{t.amount}</label>
                                <input type="text" inputMode="decimal" required value={amount} onChange={handleAmountInput} className={`${inputClass} font-bold wk-ltr-data`} disabled={readOnly}/>
                            </div>
                            <div>
                                <label className={labelClass}>{t.category}</label>
                                <CategorySelect value={category} onChange={setCategory} categories={categories} disabled={readOnly} tr={tr}/>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label className={labelClass}>{t.date}</label>
                                <JalaliDatePicker value={date} onChange={setDate} isEnglish={isEnglish} disabled={readOnly} required className="mt-2" inputClassName={isEnglish ? 'mt-2' : undefined} ariaLabel={t.date}/>
                            </div>
                            <div>
                                <label className={labelClass}>{tr('Recurrence rule', 'قاعده تکرار')}</label>
                                <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as 'none' | 'monthly' | 'weekly')} className={inputClass} disabled={readOnly}>
                                    <option value="none">{tr('One-time', 'یک‌باره')}</option>
                                    <option value="monthly">{tr('Monthly', 'ماهانه')}</option>
                                    <option value="weekly">{tr('Weekly', 'هفتگی')}</option>
                                </select>
                            </div>
                        </div>
                        {recurrence !== 'none' ? (<div>
                                <label className={labelClass}>{tr('Next due date', 'سررسید بعدی')}</label>
                                <JalaliDatePicker value={nextDueDate} onChange={setNextDueDate} isEnglish={isEnglish} disabled={readOnly} allowClear className="mt-2" inputClassName={isEnglish ? 'mt-2' : undefined} ariaLabel={tr('Next due date', 'سررسید بعدی')}/>
                            </div>) : null}
                        <div>
                            <label className={labelClass}>{tr('Note', 'یادداشت')}</label>
                            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} min-h-[110px] py-3`} disabled={readOnly} placeholder={tr('Why was this expense made?', 'این هزینه برای چه بود؟')}/>
                        </div>
                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-black text-slate-900">{tr('Attachments', 'پیوست‌ها')}</p>
                                    <p className="text-xs font-semibold text-slate-500">{tr('Up to 4 files, max 2 MB each.', 'حداکثر ۴ فایل، هرکدام تا ۲ مگابایت.')}</p>
                                </div>
                                <button type="button" onClick={() => modalFileInputRef.current?.click()} disabled={readOnly} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                                    {tr('Upload', 'آپلود')}
                                </button>
                                <input ref={modalFileInputRef} type="file" accept={ATTACHMENT_INPUT_ACCEPT} multiple className="hidden" onChange={handleModalAttachmentUpload} aria-label={tr('Upload attachment', 'آپلود پیوست')}/>
                            </div>
                            <div className="mt-4 space-y-3">
                                {attachments.map((attachment) => (<div key={attachment.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-black text-slate-900"><bdi dir="ltr">{attachment.name}</bdi></p>
                                                <p className="mt-1 text-xs font-semibold text-slate-500"><bdi>{fmt.num(Math.max(1, Math.round(attachment.size / 1024)))}</bdi> {tr('KB', 'کیلوبایت')}</p>
                                            </div>
                                            <div className="flex gap-2">
                                                {attachment.dataUrl ? <Button variant="ghost" className="px-3 py-2 text-xs" onClick={() => void handleOpenAttachment(attachment)}>{tr('Open', 'باز کردن')}</Button> : null}
                                                <Button variant="ghost" className="px-3 py-2 text-xs text-danger-700 hover:bg-danger-50" onClick={() => removeAttachment(attachment.id)}>{tr('Remove', 'حذف')}</Button>
                                            </div>
                                        </div>
                                    </div>))}
                                {!attachments.length ? (<div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">
                                        {tr('No supporting file attached yet.', 'هنوز فایل پشتیبانی ضمیمه نشده است.')}
                                    </div>) : null}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>{t.cancel}</Button>
                            <Button type="submit" variant="primary" disabled={readOnly}>{editingId ? t.save : tr('Record expense', 'ثبت هزینه')}</Button>
                        </div>
                    </form>
                </Modal>
            </div>
        </PageSurface>
        </CategoryIconsContext.Provider>);
};
