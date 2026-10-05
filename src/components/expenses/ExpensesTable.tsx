import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Expense } from '@/types';
import { classNames } from '@/utils/classNames';
import { StatusBadge } from '../ui/StatusBadge';
import { CategoryTag } from './CategoryTag';
import { ExpenseFormatters, ExpenseSort, ExpenseSortKey, TableDensity, TrFn, getAttachmentCount, getRecurrenceLabel, getReviewMeta, hasAttachment, hasNote, isRecurringExpense } from './helpers';
import { DotsIcon, NoteIcon, PaperclipIcon, PencilIcon, RepeatIcon, SortIcon, TrashIcon } from './icons';
interface TableLabels {
    title: string;
    category: string;
    amount: string;
    date: string;
    status: string;
    edit: string;
}
interface RowActions {
    onOpen: (expense: Expense) => void;
    onEdit: (expense: Expense) => void;
    onDelete: (expense: Expense) => void;
    onAddNote: (expense: Expense) => void;
    onAddAttachment: (expense: Expense) => void;
    onMakeRecurring: (expense: Expense) => void;
}
interface ExpensesTableProps extends RowActions {
    rows: Expense[];
    totalCount: number;
    pageStart: number;
    pageEnd: number;
    page: number;
    pageCount: number;
    pageSize: number;
    pageSizeOptions: readonly number[];
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    density: TableDensity;
    sort: ExpenseSort;
    onSortChange: (sort: ExpenseSort) => void;
    selectedIds: ReadonlySet<string>;
    onToggleSelect: (id: string) => void;
    onTogglePageSelection: (ids: string[], select: boolean) => void;
    activeId: string | null;
    canEdit: boolean;
    readOnly: boolean;
    fmt: ExpenseFormatters;
    tr: TrFn;
    isEnglish: boolean;
    labels: TableLabels;
    emptyState: React.ReactNode;
}
const MENU_WIDTH = 200;
const MENU_HEIGHT = 220;
interface RowMenuProps extends Omit<RowActions, 'onOpen'> {
    expense: Expense;
    canEdit: boolean;
    readOnly: boolean;
    tr: TrFn;
    editLabel: string;
    isEnglish: boolean;
}
const RowMenu: React.FC<RowMenuProps> = ({ expense, canEdit, readOnly, tr, editLabel, isEnglish, onEdit, onDelete, onAddNote, onAddAttachment, onMakeRecurring, }) => {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<{
        top: number;
        left: number;
    } | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const openMenu = () => {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (!rect || typeof window === 'undefined')
            return;
        const left = Math.min(Math.max(rect.right - MENU_WIDTH, 8), Math.max(8, window.innerWidth - MENU_WIDTH - 8));
        const top = rect.bottom + MENU_HEIGHT > window.innerHeight
            ? Math.max(8, rect.top - MENU_HEIGHT - 4)
            : rect.bottom + 4;
        setPosition({ top, left });
        setOpen(true);
    };
    useEffect(() => {
        if (!open || typeof document === 'undefined')
            return;
        const focusTimer = window.setTimeout(() => {
            menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus();
        }, 0);
        const moveFocus = (step: number, edge = false) => {
            const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') || []);
            if (!items.length)
                return;
            if (edge) {
                items[step > 0 ? items.length - 1 : 0].focus();
                return;
            }
            const active = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
            const index = active ? items.indexOf(active) : -1;
            items[(index + step + items.length) % items.length].focus();
        };
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' || event.key === 'Tab') {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                buttonRef.current?.focus();
                return;
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                moveFocus(1);
            }
            else if (event.key === 'ArrowUp') {
                event.preventDefault();
                moveFocus(-1);
            }
            else if (event.key === 'Home') {
                event.preventDefault();
                moveFocus(-1, true);
            }
            else if (event.key === 'End') {
                event.preventDefault();
                moveFocus(1, true);
            }
        };
        const handleScrollOrResize = () => setOpen(false);
        document.addEventListener('keydown', handleKey, true);
        window.addEventListener('scroll', handleScrollOrResize, true);
        window.addEventListener('resize', handleScrollOrResize);
        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', handleKey, true);
            window.removeEventListener('scroll', handleScrollOrResize, true);
            window.removeEventListener('resize', handleScrollOrResize);
        };
    }, [open]);
    const run = (action: (expense: Expense) => void) => {
        setOpen(false);
        action(expense);
    };
    const itemClass = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm font-semibold text-slate-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400/60 motion-reduce:transition-none';
    return (<>
            <button ref={buttonRef} type="button" onClick={(event) => {
            event.stopPropagation();
            if (open)
                setOpen(false);
            else
                openMenu();
        }} aria-haspopup="menu" aria-expanded={open} aria-label={tr('Row actions', 'عملیات ردیف')} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-neutral-100 hover:text-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                <DotsIcon className="h-[18px] w-[18px]"/>
            </button>
            {open && position && typeof document !== 'undefined' ? createPortal(<div className="fixed inset-0 z-[130]" dir={isEnglish ? 'ltr' : 'rtl'}>
                    {/* Backdrop swallows the dismissing click so it can't reach a row underneath */}
                    <div className="absolute inset-0" aria-hidden="true" onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { event.stopPropagation(); setOpen(false); }}/>
                    <div ref={menuRef} role="menu" style={{ top: position.top, left: position.left, width: MENU_WIDTH }} className="absolute rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg" onClick={(event) => event.stopPropagation()}>
                    <button type="button" role="menuitem" className={itemClass} disabled={readOnly || !canEdit} onClick={() => run(onEdit)}>
                        <PencilIcon className="h-4 w-4 text-slate-400"/>
                        {editLabel}
                    </button>
                    <button type="button" role="menuitem" className={itemClass} disabled={readOnly || !canEdit} onClick={() => run(onAddNote)}>
                        <NoteIcon className="h-4 w-4 text-slate-400"/>
                        {tr('Add note', 'افزودن یادداشت')}
                    </button>
                    <button type="button" role="menuitem" className={itemClass} disabled={readOnly || !canEdit} onClick={() => run(onAddAttachment)}>
                        <PaperclipIcon className="h-4 w-4 text-slate-400"/>
                        {tr('Add attachment', 'افزودن پیوست')}
                    </button>
                    {!isRecurringExpense(expense) ? (<button type="button" role="menuitem" className={itemClass} disabled={readOnly || !canEdit} onClick={() => run(onMakeRecurring)}>
                            <RepeatIcon className="h-4 w-4 text-slate-400"/>
                            {tr('Make recurring', 'تکرارشونده کردن')}
                        </button>) : null}
                    <div className="my-1 border-t border-neutral-100"/>
                    <button type="button" role="menuitem" className={classNames(itemClass, 'text-danger-700 hover:bg-danger-50')} disabled={readOnly} onClick={() => run(onDelete)}>
                        <TrashIcon className="h-4 w-4"/>
                        {tr('Delete', 'حذف')}
                    </button>
                    </div>
                </div>, document.body) : null}
        </>);
};
const TitleCellMeta: React.FC<{
    expense: Expense;
    tr: TrFn;
    fmt: ExpenseFormatters;
}> = ({ expense, tr, fmt }) => (<span className="inline-flex shrink-0 items-center gap-1 text-slate-400">
        {hasAttachment(expense) ? (<span className="inline-flex items-center gap-0.5" title={`${fmt.num(getAttachmentCount(expense))} ${tr('file(s)', 'فایل')}`}>
                <PaperclipIcon className="h-3.5 w-3.5"/>
                <span className="sr-only">{fmt.num(getAttachmentCount(expense))} {tr('file(s)', 'فایل')}</span>
            </span>) : null}
        {hasNote(expense) ? (<span title={tr('Has note', 'یادداشت دارد')}>
                <NoteIcon className="h-3.5 w-3.5"/>
                <span className="sr-only">{tr('Has note', 'یادداشت دارد')}</span>
            </span>) : null}
        {isRecurringExpense(expense) ? (<span className="text-info-500" title={`${tr('Recurring', 'تکرارشونده')} – ${getRecurrenceLabel(expense, tr)}`}>
                <RepeatIcon className="h-3.5 w-3.5"/>
                <span className="sr-only">{tr('Recurring', 'تکرارشونده')}</span>
            </span>) : null}
    </span>);
export const ExpensesTable: React.FC<ExpensesTableProps> = ({ rows, totalCount, pageStart, pageEnd, page, pageCount, pageSize, pageSizeOptions, onPageChange, onPageSizeChange, density, sort, onSortChange, selectedIds, onToggleSelect, onTogglePageSelection, activeId, canEdit, readOnly, fmt, tr, isEnglish, labels, emptyState, onOpen, onEdit, onDelete, onAddNote, onAddAttachment, onMakeRecurring, }) => {
    const selectAllRef = useRef<HTMLInputElement | null>(null);
    const bodyRef = useRef<HTMLTableSectionElement | null>(null);
    const pageIds = rows.map((row) => row.id);
    const selectedOnPage = pageIds.filter((id) => selectedIds.has(id)).length;
    const allSelected = rows.length > 0 && selectedOnPage === rows.length;
    const someSelected = selectedOnPage > 0 && !allSelected;
    useEffect(() => {
        if (selectAllRef.current)
            selectAllRef.current.indeterminate = someSelected;
    }, [someSelected]);
    const cellPadding = density === 'compact' ? 'py-1.5' : 'py-2.5';
    const headerButton = (key: ExpenseSortKey, label: string, align: 'start' | 'end' = 'start') => {
        const active = sort.key === key;
        return (<button type="button" onClick={() => onSortChange({ key, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' })} className={classNames('inline-flex items-center gap-1 text-xs font-black text-slate-500 transition hover:text-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 rounded motion-reduce:transition-none', align === 'end' && 'flex-row-reverse')}>
                <span>{label}</span>
                <SortIcon className={classNames('h-3 w-3', active ? 'text-brand-600' : 'text-slate-300')}/>
            </button>);
    };
    const ariaSort = (key: ExpenseSortKey): React.AriaAttributes['aria-sort'] => sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined;
    const handleRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>, expense: Expense) => {
        // Only act on keys pressed while the row itself has focus; keydown from
        // the checkbox, the row-menu button, or portal menu items bubbles here too.
        if (event.target !== event.currentTarget)
            return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen(expense);
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const rowsEls = Array.from(bodyRef.current?.querySelectorAll<HTMLTableRowElement>('tr[data-expense-row]') || []);
            const index = rowsEls.indexOf(event.currentTarget);
            const next = event.key === 'ArrowDown' ? rowsEls[index + 1] : rowsEls[index - 1];
            next?.focus();
        }
    };
    if (rows.length === 0) {
        return (<div className="rounded-b-xl border border-neutral-200 bg-white p-6">
                {emptyState}
            </div>);
    }
    const paginationFooter = (<div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 bg-white px-3 py-2">
            <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-500" htmlFor="wk-expense-page-size">{tr('Rows per page', 'ردیف در صفحه')}</label>
                <select id="wk-expense-page-size" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-xs font-black text-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60" aria-label={tr('Expense rows per page', 'تعداد ردیف هزینه در هر صفحه')}>
                    {pageSizeOptions.map((size) => (<option key={size} value={size}>{fmt.num(size)}</option>))}
                </select>
            </div>
            <p className="text-xs font-bold text-slate-600">
                <bdi>{fmt.num(pageStart)}–{fmt.num(pageEnd)}</bdi> {tr('of', 'از')} <bdi>{fmt.num(totalCount)}</bdi>
            </p>
            <div className="flex items-center gap-1">
                <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} aria-label={tr('Previous expense page', 'صفحه قبلی هزینه‌ها')} className="inline-flex h-8 items-center rounded-lg border border-neutral-200 bg-white px-2.5 text-xs font-bold text-slate-600 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                    {tr('Previous', 'قبلی')}
                </button>
                <button type="button" onClick={() => onPageChange(Math.min(pageCount, page + 1))} disabled={page >= pageCount} aria-label={tr('Next expense page', 'صفحه بعدی هزینه‌ها')} className="inline-flex h-8 items-center rounded-lg border border-neutral-200 bg-white px-2.5 text-xs font-bold text-slate-600 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                    {tr('Next', 'بعدی')}
                </button>
            </div>
        </div>);
    return (<div className="overflow-hidden rounded-b-xl border border-neutral-200 bg-white shadow-sm">
            {/* Desktop / tablet table */}
            <div className="hidden md:block">
                <div className="max-h-[calc(100dvh-var(--wk-titlebar-height,0px)-21.5rem)] min-h-[16rem] overflow-y-auto">
                    <table className="w-full table-fixed text-sm">
                        <thead>
                            <tr className="border-b border-neutral-200">
                                <th scope="col" className="sticky top-0 z-10 w-10 bg-neutral-50 px-3 py-2.5">
                                    <input ref={selectAllRef} type="checkbox" checked={allSelected} onChange={(event) => onTogglePageSelection(pageIds, event.target.checked)} aria-label={tr('Select all rows on this page', 'انتخاب همه ردیف‌های این صفحه')} className="h-4 w-4 accent-[rgb(var(--wk-color-brand-600))]"/>
                                </th>
                                <th scope="col" aria-sort={ariaSort('title')} className="sticky top-0 z-10 bg-neutral-50 px-3 py-2.5 text-start">
                                    {headerButton('title', labels.title)}
                                </th>
                                <th scope="col" aria-sort={ariaSort('category')} className="sticky top-0 z-10 w-32 bg-neutral-50 px-3 py-2.5 text-start">
                                    {headerButton('category', labels.category)}
                                </th>
                                <th scope="col" aria-sort={ariaSort('amount')} className="sticky top-0 z-10 w-28 bg-neutral-50 px-3 py-2.5 text-end">
                                    {headerButton('amount', labels.amount, 'end')}
                                </th>
                                <th scope="col" aria-sort={ariaSort('date')} className="sticky top-0 z-10 w-32 bg-neutral-50 px-3 py-2.5 text-start">
                                    {headerButton('date', labels.date)}
                                </th>
                                <th scope="col" className="sticky top-0 z-10 hidden w-36 bg-neutral-50 px-3 py-2.5 text-start text-xs font-black text-slate-500 xl:table-cell">
                                    {labels.status}
                                </th>
                                <th scope="col" className="sticky top-0 z-10 w-12 bg-neutral-50 px-3 py-2.5">
                                    <span className="sr-only">{tr('Actions', 'عملیات')}</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody ref={bodyRef} className="divide-y divide-neutral-100">
                            {rows.map((expense) => {
            const review = getReviewMeta(expense, tr);
            const isSelected = selectedIds.has(expense.id);
            const isActive = activeId === expense.id;
            return (<tr key={expense.id} data-expense-row tabIndex={0} onClick={() => onOpen(expense)} onKeyDown={(event) => handleRowKeyDown(event, expense)} data-selected={isSelected || undefined} className={classNames('cursor-pointer bg-white transition hover:bg-brand-50/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400/60 motion-reduce:transition-none', (isSelected || isActive) && 'bg-brand-50/70')}>
                                        <td className={classNames('px-3', cellPadding)} onClick={(event) => event.stopPropagation()}>
                                            <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(expense.id)} aria-label={`${tr('Select', 'انتخاب')} ${expense.title}`} className="h-4 w-4 accent-[rgb(var(--wk-color-brand-600))]"/>
                                        </td>
                                        <td className={classNames('px-3', cellPadding)}>
                                            <div className="flex items-center gap-1.5">
                                                <span className="truncate font-black text-slate-900">{expense.title}</span>
                                                <TitleCellMeta expense={expense} tr={tr} fmt={fmt}/>
                                            </div>
                                            {density === 'normal' && hasNote(expense) ? (<p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{expense.description}</p>) : null}
                                            <div className="mt-1 xl:hidden">
                                                <StatusBadge tone={review.tone}>{review.label}</StatusBadge>
                                            </div>
                                        </td>
                                        <td className={classNames('px-3', cellPadding)}>
                                            <CategoryTag category={expense.category}/>
                                        </td>
                                        <td className={classNames('whitespace-nowrap px-3 text-end font-black tabular-nums text-slate-900', cellPadding)}>
                                            <bdi>{fmt.money(expense.amount)}</bdi>
                                        </td>
                                        <td className={classNames('whitespace-nowrap px-3 text-sm font-semibold text-slate-600', cellPadding)}>
                                            <bdi className="whitespace-nowrap">{fmt.date(expense.date)}</bdi>
                                        </td>
                                        <td className={classNames('hidden px-3 xl:table-cell', cellPadding)}>
                                            <StatusBadge tone={review.tone}>{review.label}</StatusBadge>
                                        </td>
                                        <td className={classNames('px-2 text-center', cellPadding)} onClick={(event) => event.stopPropagation()}>
                                            <RowMenu expense={expense} canEdit={canEdit} readOnly={readOnly} tr={tr} isEnglish={isEnglish} editLabel={labels.edit} onEdit={onEdit} onDelete={onDelete} onAddNote={onAddNote} onAddAttachment={onAddAttachment} onMakeRecurring={onMakeRecurring}/>
                                        </td>
                                    </tr>);
        })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden">
                <ul className="divide-y divide-neutral-100">
                    {rows.map((expense) => {
            const review = getReviewMeta(expense, tr);
            return (<li key={expense.id}>
                                <button type="button" onClick={() => onOpen(expense)} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-start transition hover:bg-brand-50/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                                    <span className="min-w-0">
                                        <span className="flex items-center gap-1.5">
                                            <span className="truncate font-black text-slate-900">{expense.title}</span>
                                            <TitleCellMeta expense={expense} tr={tr} fmt={fmt}/>
                                        </span>
                                        <span className="mt-1 flex flex-wrap items-center gap-2">
                                            <CategoryTag category={expense.category} className="text-xs" size="sm"/>
                                            <bdi className="whitespace-nowrap text-xs font-semibold text-slate-500">{fmt.date(expense.date)}</bdi>
                                        </span>
                                        <span className="mt-1.5 inline-block">
                                            <StatusBadge tone={review.tone}>{review.label}</StatusBadge>
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-end font-black tabular-nums text-slate-900">
                                        <bdi>{fmt.money(expense.amount)}</bdi>
                                    </span>
                                </button>
                            </li>);
        })}
                </ul>
            </div>

            {paginationFooter}
        </div>);
};
