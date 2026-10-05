import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Expense, PurchaseAttachment } from '@/types';
import { classNames } from '@/utils/classNames';
import { ATTACHMENT_INPUT_ACCEPT } from '@/utils/attachmentTypePolicy';
import { StatusBadge } from '../ui/StatusBadge';
import { InlineAlert } from '../ui/InlineAlert';
import { JalaliDatePicker } from '../ui/JalaliDatePicker';
import { CategoryTag } from './CategoryTag';
import { DrawerFocus, ExpenseFormatters, TrFn, getFriendlyAttachmentName, getReviewMeta, hasAttachment, hasNote, isRecurringExpense, needsReview } from './helpers';
import { CheckIcon, PaperclipIcon, PencilIcon, PlusIcon, RepeatIcon, TrashIcon, XIcon } from './icons';
interface ExpenseDrawerProps {
    expense: Expense | null;
    isOpen: boolean;
    onClose: () => void;
    focusRequest: DrawerFocus;
    onFocusHandled: () => void;
    readOnly: boolean;
    canEdit: boolean;
    onEdit: (expense: Expense) => void;
    onUpdate?: (id: string, patch: Partial<Expense>) => void;
    onDelete: (expense: Expense) => void;
    onUseTemplate: (expense: Expense) => void;
    onOpenAttachment: (attachment: PurchaseAttachment) => void;
    onPickAttachments: (expense: Expense, files: FileList | null) => void;
    fmt: ExpenseFormatters;
    tr: TrFn;
    isEnglish: boolean;
    suspendEscape: boolean;
}
const sectionClass = 'rounded-xl border border-neutral-200 bg-white p-4';
const sectionTitleClass = 'text-sm font-black text-slate-900';
const ChecklistCircle: React.FC<{
    done: boolean;
}> = ({ done }) => (<span aria-hidden="true" className={classNames('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 motion-reduce:transition-none', done ? 'scale-100 border-success-500 bg-success-500 text-white' : 'border-dashed border-slate-300 bg-white text-transparent')}>
        <CheckIcon className="h-3 w-3" strokeWidth={3}/>
    </span>);
export const ExpenseDrawer: React.FC<ExpenseDrawerProps> = ({ expense, isOpen, onClose, focusRequest, onFocusHandled, readOnly, canEdit, onEdit, onUpdate, onDelete, onUseTemplate, onOpenAttachment, onPickAttachments, fmt, tr, isEnglish, suspendEscape, }) => {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const noteAreaRef = useRef<HTMLTextAreaElement | null>(null);
    const attachSectionRef = useRef<HTMLDivElement | null>(null);
    const recurrenceSectionRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [entered, setEntered] = useState(false);
    const [noteEditing, setNoteEditing] = useState(false);
    const [noteDraft, setNoteDraft] = useState('');
    const editable = canEdit && !readOnly && Boolean(onUpdate);
    useEffect(() => {
        if (!isOpen) {
            setEntered(false);
            setNoteEditing(false);
            return;
        }
        const frame = requestAnimationFrame(() => setEntered(true));
        return () => cancelAnimationFrame(frame);
    }, [isOpen]);
    useEffect(() => {
        if (!isOpen || typeof document === 'undefined')
            return;
        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const timer = window.setTimeout(() => panelRef.current?.focus({ preventScroll: true }), 0);
        const { body } = document;
        const prevOverflow = body.style.overflow;
        body.style.overflow = 'hidden';
        return () => {
            window.clearTimeout(timer);
            body.style.overflow = prevOverflow;
            if (previouslyFocused && document.contains(previouslyFocused))
                previouslyFocused.focus({ preventScroll: true });
        };
    }, [isOpen]);
    useEffect(() => {
        if (!isOpen || suspendEscape || typeof window === 'undefined')
            return;
        const handleKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape')
                return;
            // First Escape while typing a note only cancels editing; the draft
            // must not silently vanish together with the drawer.
            if (noteEditing) {
                event.stopPropagation();
                setNoteEditing(false);
                panelRef.current?.focus({ preventScroll: true });
                return;
            }
            onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, suspendEscape, onClose, noteEditing]);
    // Tab containment, mirroring ui/Modal.tsx: aria-modal without a focus trap
    // would let keyboard focus escape into the obscured page.
    useEffect(() => {
        if (!isOpen || suspendEscape || typeof document === 'undefined')
            return;
        const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const handleTab = (event: KeyboardEvent) => {
            if (event.key !== 'Tab')
                return;
            const panel = panelRef.current;
            if (!panel)
                return;
            const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
                .filter((element) => element.offsetParent !== null || element === document.activeElement);
            if (!focusable.length) {
                event.preventDefault();
                panel.focus({ preventScroll: true });
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const inside = active ? panel.contains(active) : false;
            if (event.shiftKey) {
                if (!inside || active === first) {
                    event.preventDefault();
                    last.focus({ preventScroll: true });
                }
                return;
            }
            if (!inside || active === last) {
                event.preventDefault();
                first.focus({ preventScroll: true });
            }
        };
        document.addEventListener('keydown', handleTab);
        return () => document.removeEventListener('keydown', handleTab);
    }, [isOpen, suspendEscape]);
    useEffect(() => {
        if (!isOpen || !focusRequest || !expense)
            return;
        const timer = window.setTimeout(() => {
            if (focusRequest === 'note') {
                setNoteDraft(expense.description || '');
                setNoteEditing(true);
                window.setTimeout(() => noteAreaRef.current?.focus(), 30);
            }
            else if (focusRequest === 'attachment') {
                attachSectionRef.current?.scrollIntoView({ block: 'center' });
                fileInputRef.current?.click();
            }
            else if (focusRequest === 'recurrence') {
                recurrenceSectionRef.current?.scrollIntoView({ block: 'center' });
            }
            onFocusHandled();
        }, 60);
        return () => window.clearTimeout(timer);
    }, [isOpen, focusRequest, expense, onFocusHandled]);
    if (!isOpen || !expense || typeof document === 'undefined')
        return null;
    const review = getReviewMeta(expense, tr);
    const recurring = isRecurringExpense(expense);
    const attachments = expense.attachments || [];
    const saveNote = () => {
        if (!onUpdate)
            return;
        onUpdate(expense.id, { description: noteDraft.trim() });
        setNoteEditing(false);
    };
    const setRecurrence = (value: 'none' | 'monthly' | 'weekly') => {
        if (!onUpdate)
            return;
        onUpdate(expense.id, {
            recurrence: value,
            nextDueDate: value === 'none' ? undefined : (expense.nextDueDate || expense.date),
        });
    };
    const node = (<div className="fixed inset-0 z-[110]" role="presentation" dir={isEnglish ? 'ltr' : 'rtl'}>
            <div className={classNames('absolute inset-0 bg-slate-900/30 transition-opacity duration-200 motion-reduce:transition-none', entered ? 'opacity-100' : 'opacity-0')} onClick={onClose} aria-hidden="true"/>
            <div ref={panelRef} role="dialog" aria-modal="true" aria-label={`${tr('Expense details', 'جزئیات هزینه')}: ${expense.title}`} tabIndex={-1} className={classNames('absolute inset-y-0 end-0 flex w-full flex-col bg-neutral-50 shadow-2xl outline-hidden sm:max-w-[420px]', 'transition-transform duration-200 motion-reduce:transition-none', entered ? 'translate-x-0' : isEnglish ? 'translate-x-full' : '-translate-x-full')} onClick={(event) => event.stopPropagation()}>
                {/* Header */}
                <div className="shrink-0 border-b border-neutral-200 bg-white px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="truncate text-base font-black text-slate-900">{expense.title}</h2>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                <CategoryTag category={expense.category} className="text-xs" size="sm"/>
                                <bdi className="whitespace-nowrap font-semibold text-slate-500">{fmt.date(expense.date)}</bdi>
                                <StatusBadge tone={review.tone}>{review.label}</StatusBadge>
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <p className="whitespace-nowrap text-lg font-black tabular-nums text-slate-900">
                                <bdi>{fmt.money(expense.amount)}</bdi>
                            </p>
                            <button type="button" onClick={onClose} aria-label={tr('Close details', 'بستن جزئیات')} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-neutral-100 hover:text-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                                <XIcon className="h-5 w-5"/>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Scrollable body */}
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
                    {needsReview(expense) ? (<InlineAlert tone="warning" title={tr('This record is incomplete', 'این رکورد ناقص است')}>
                            {tr('Complete the checklist below to make it ready.', 'برای آماده شدن، چک‌لیست پایین را تکمیل کنید.')}
                        </InlineAlert>) : null}

                    {/* Review checklist */}
                    <section className={sectionClass} aria-label={tr('Review checklist', 'چک‌لیست بازبینی')}>
                        <h3 className={sectionTitleClass}>{tr('Review checklist', 'چک‌لیست بازبینی')}</h3>
                        <ul className="mt-3 space-y-3">
                            <li className="flex items-start gap-2.5">
                                <ChecklistCircle done={hasAttachment(expense)}/>
                                <div className="min-w-0 flex-1">
                                    <p className={classNames('text-sm font-bold', hasAttachment(expense) ? 'text-slate-700' : 'text-slate-500')}>
                                        {hasAttachment(expense)
            ? `${tr('File attached', 'فایل ضمیمه شد')} (${fmt.num(attachments.length)})`
            : tr('No attachment yet', 'پیوست ندارد')}
                                    </p>
                                    {!hasAttachment(expense) && editable ? (<button type="button" onClick={() => fileInputRef.current?.click()} className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-black text-brand-700 transition hover:bg-brand-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                                            <PlusIcon className="h-3.5 w-3.5"/>
                                            {tr('Add attachment', 'افزودن پیوست')}
                                        </button>) : null}
                                </div>
                            </li>
                            <li className="flex items-start gap-2.5">
                                <ChecklistCircle done={hasNote(expense)}/>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className={classNames('text-sm font-bold', hasNote(expense) ? 'text-slate-700' : 'text-slate-500')}>
                                            {hasNote(expense) ? tr('Note saved', 'یادداشت ثبت شد') : tr('No note yet', 'یادداشت ندارد')}
                                        </p>
                                        {hasNote(expense) && editable && !noteEditing ? (<button type="button" onClick={() => { setNoteDraft(expense.description || ''); setNoteEditing(true); }} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold text-slate-500 transition hover:text-brand-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                                                <PencilIcon className="h-3 w-3"/>
                                                {tr('Edit', 'ویرایش')}
                                            </button>) : null}
                                    </div>
                                    {noteEditing ? (<div className="mt-2">
                                            <textarea ref={noteAreaRef} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} rows={3} className="wk-input min-h-[84px] w-full py-2 text-sm" placeholder={tr('Why was this expense made?', 'این هزینه برای چه بود؟')}/>
                                            <div className="mt-2 flex items-center gap-2">
                                                <button type="button" onClick={saveNote} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-black text-white transition hover:bg-brand-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                                                    {tr('Save note', 'ذخیره یادداشت')}
                                                </button>
                                                <button type="button" onClick={() => setNoteEditing(false)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-neutral-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                                                    {tr('Cancel', 'انصراف')}
                                                </button>
                                            </div>
                                        </div>) : hasNote(expense) ? (<p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-600">{expense.description}</p>) : editable ? (<button type="button" onClick={() => { setNoteDraft(''); setNoteEditing(true); }} className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-black text-brand-700 transition hover:bg-brand-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                                            <PlusIcon className="h-3.5 w-3.5"/>
                                            {tr('Add note', 'افزودن یادداشت')}
                                        </button>) : null}
                                </div>
                            </li>
                        </ul>
                    </section>

                    {/* Attachments */}
                    <section ref={attachSectionRef} className={sectionClass} aria-label={tr('Attachments', 'پیوست‌ها')}>
                        <div className="flex items-center justify-between gap-2">
                            <h3 className={sectionTitleClass}>{tr('Attachments', 'پیوست‌ها')}</h3>
                            {editable ? (<button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-black text-brand-700 transition hover:bg-brand-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                                    <PlusIcon className="h-3.5 w-3.5"/>
                                    {tr('Add attachment', 'افزودن پیوست')}
                                </button>) : null}
                        </div>
                        <input ref={fileInputRef} type="file" accept={ATTACHMENT_INPUT_ACCEPT} multiple className="hidden" aria-label={tr('Upload attachment', 'آپلود پیوست')} onChange={(event) => {
            onPickAttachments(expense, event.target.files);
            event.target.value = '';
        }}/>
                        {attachments.length > 0 ? (<ul className="mt-3 space-y-2">
                                {attachments.map((attachment, index) => (<li key={attachment.id} className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50/60 p-2">
                                        {attachment.type?.startsWith('image/') && attachment.dataUrl ? (<img src={attachment.dataUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-neutral-200 object-cover"/>) : (<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-slate-400">
                                                <PaperclipIcon className="h-4 w-4"/>
                                            </span>)}
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-bold text-slate-800"><bdi>{getFriendlyAttachmentName(expense, index, tr, fmt.num)}</bdi></p>
                                            <p className="truncate text-[11px] font-semibold text-slate-400">
                                                <bdi dir="ltr">{attachment.name}</bdi>
                                                {' · '}
                                                <bdi>{fmt.num(Math.max(1, Math.round(attachment.size / 1024)))}</bdi> {tr('KB', 'کیلوبایت')}
                                            </p>
                                        </div>
                                        {attachment.dataUrl ? (<button type="button" onClick={() => onOpenAttachment(attachment)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-black text-brand-700 transition hover:bg-brand-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                                                {tr('Open', 'باز کردن')}
                                            </button>) : null}
                                    </li>))}
                            </ul>) : (<p className="mt-2 text-xs font-semibold text-slate-500">
                                {tr('Attach the receipt image or PDF of this expense.', 'تصویر رسید یا PDF این هزینه را ضمیمه کنید.')}
                            </p>)}
                    </section>

                    {/* Recurrence */}
                    <section ref={recurrenceSectionRef} className={sectionClass} aria-label={tr('Recurring', 'تکرارشونده')}>
                        <div className="flex items-center justify-between gap-2">
                            <h3 className={classNames(sectionTitleClass, 'flex items-center gap-1.5')}>
                                <RepeatIcon className="h-4 w-4 text-info-500"/>
                                {tr('Recurring', 'تکرارشونده')}
                            </h3>
                            <button type="button" role="switch" aria-checked={recurring} disabled={!editable} onClick={() => setRecurrence(recurring ? 'none' : 'monthly')} aria-label={tr('Toggle recurring', 'روشن/خاموش کردن تکرار')} className={classNames('relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none', recurring ? 'bg-brand-600' : 'bg-neutral-300')}>
                                <span aria-hidden="true" className={classNames('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 motion-reduce:transition-none', recurring ? 'start-[calc(100%-1.375rem)]' : 'start-0.5')}/>
                            </button>
                        </div>
                        {recurring ? (<div className="mt-3 space-y-2.5">
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="block">
                                        <span className="text-[11px] font-black text-slate-500">{tr('Interval', 'بازه تکرار')}</span>
                                        <select value={expense.recurrence} disabled={!editable} onChange={(event) => setRecurrence(event.target.value as 'monthly' | 'weekly')} className="wk-input mt-1 h-9 text-sm">
                                            <option value="weekly">{tr('Weekly', 'هفتگی')}</option>
                                            <option value="monthly">{tr('Monthly', 'ماهانه')}</option>
                                        </select>
                                    </label>
                                    <div>
                                        <span className="text-[11px] font-black text-slate-500">{tr('Next due', 'سررسید بعدی')}</span>
                                        <JalaliDatePicker value={(expense.nextDueDate || expense.date || '').slice(0, 10)} onChange={(iso) => onUpdate?.(expense.id, { nextDueDate: iso })} isEnglish={isEnglish} disabled={!editable} className="mt-1" inputClassName={isEnglish ? 'mt-1 h-9 text-xs' : 'h-9 text-xs'} ariaLabel={tr('Next due', 'سررسید بعدی')}/>
                                        {isEnglish ? (<p className="mt-1 text-[11px] font-semibold text-slate-500">
                                                <bdi className="whitespace-nowrap">{fmt.date(expense.nextDueDate || expense.date)}</bdi>
                                            </p>) : null}
                                    </div>
                                </div>
                                <button type="button" disabled={readOnly} onClick={() => onUseTemplate(expense)} className="w-full rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-black text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                                    {tr('Record next cycle now', 'ثبت برای دوره بعد')}
                                </button>
                            </div>) : (<div className="mt-2 space-y-2.5">
                                <p className="text-xs font-semibold text-slate-500">
                                    {tr('Turn this on if this cost repeats every week or month.', 'اگر این هزینه هر هفته یا هر ماه تکرار می‌شود، این گزینه را روشن کنید.')}
                                </p>
                                <button type="button" disabled={readOnly} onClick={() => onUseTemplate(expense)} className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                                    {tr('Use as template for a new expense', 'استفاده به‌عنوان الگو برای هزینه جدید')}
                                </button>
                            </div>)}
                    </section>

                    {/* Activity */}
                    <section className={sectionClass} aria-label={tr('Activity', 'تاریخچه فعالیت')}>
                        <h3 className={sectionTitleClass}>{tr('Activity', 'تاریخچه فعالیت')}</h3>
                        <ul className="mt-2.5 space-y-1.5 text-xs font-semibold text-slate-600">
                            <li className="flex items-center justify-between gap-2">
                                <span>{tr('Expense date', 'تاریخ هزینه')}</span>
                                <bdi className="whitespace-nowrap text-slate-500">{fmt.date(expense.date)}</bdi>
                            </li>
                            {expense.updatedAt ? (<li className="flex items-center justify-between gap-2">
                                    <span>{tr('Last edited', 'آخرین ویرایش')}</span>
                                    <bdi className="whitespace-nowrap text-slate-500">{fmt.dateTime(expense.updatedAt)}</bdi>
                                </li>) : null}
                            {expense.userId ? (<li className="flex items-center justify-between gap-2">
                                    <span>{tr('Recorded by', 'ثبت‌کننده')}</span>
                                    <bdi className="text-slate-500">{expense.userId}</bdi>
                                </li>) : null}
                        </ul>
                    </section>
                </div>

                {/* Footer actions */}
                <div className="flex shrink-0 items-center justify-between gap-2 border-t border-neutral-200 bg-white px-4 py-3">
                    <button type="button" disabled={readOnly || !canEdit} onClick={() => onEdit(expense)} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-sm font-black text-slate-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                        <PencilIcon className="h-4 w-4 text-slate-400"/>
                        {tr('Full edit', 'ویرایش کامل')}
                    </button>
                    <button type="button" disabled={readOnly} onClick={() => onDelete(expense)} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-black text-danger-700 transition hover:bg-danger-50 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-danger-500/50 motion-reduce:transition-none">
                        <TrashIcon className="h-4 w-4"/>
                        {tr('Delete', 'حذف')}
                    </button>
                </div>
            </div>
        </div>);
    return createPortal(node, document.body);
};
