import { useEffect } from 'react';
import type { RefObject } from 'react';
import type { Expense } from '@/types';
export type ExpenseView = 'all' | 'review' | 'recurring';
export type TableDensity = 'normal' | 'compact';
export type ExpenseSortKey = 'title' | 'category' | 'amount' | 'date';
export type ExpenseSortDir = 'asc' | 'desc';
export type DrawerFocus = 'note' | 'attachment' | 'recurrence' | null;
export interface ExpenseSort {
    key: ExpenseSortKey;
    dir: ExpenseSortDir;
}
export interface ExpenseFormatters {
    num: (value: number) => string;
    money: (value: number) => string;
    date: (value: string | Date | null | undefined) => string;
    dateTime: (value: string | Date | null | undefined) => string;
}
export type TrFn = (en: string, fa: string) => string;
export const getAttachmentCount = (expense: Expense) => expense.attachments?.length || 0;
export const hasAttachment = (expense: Expense) => getAttachmentCount(expense) > 0;
export const hasNote = (expense: Expense) => Boolean(expense.description?.trim());
export const isRecurringExpense = (expense: Expense) => Boolean(expense.recurrence && expense.recurrence !== 'none');
export const needsReview = (expense: Expense) => !hasAttachment(expense) || !hasNote(expense);
export const getReviewMeta = (expense: Expense, tr: TrFn) => {
    if (!hasAttachment(expense))
        return { tone: 'warning' as const, label: tr('Needs attachment', 'نیازمند پیوست') };
    if (!hasNote(expense))
        return { tone: 'warning' as const, label: tr('Needs note', 'نیازمند یادداشت') };
    return { tone: 'success' as const, label: tr('Ready', 'آماده') };
};
export const getRecurrenceLabel = (expense: Expense, tr: TrFn) => {
    if (expense.recurrence === 'monthly')
        return tr('Monthly', 'ماهانه');
    if (expense.recurrence === 'weekly')
        return tr('Weekly', 'هفتگی');
    return tr('One-time', 'یک‌باره');
};
export interface CategoryVisual {
    dotClass: string;
    textClass: string;
    chipClass: string;
}
// No amber/orange here: those hues are reserved for warning state (design rule: amber = warning only).
const CATEGORY_VISUALS: CategoryVisual[] = [
    { dotClass: 'bg-emerald-500', textClass: 'text-emerald-800', chipClass: 'bg-emerald-100/80 text-emerald-600' },
    { dotClass: 'bg-teal-500', textClass: 'text-teal-800', chipClass: 'bg-teal-100/80 text-teal-600' },
    { dotClass: 'bg-violet-500', textClass: 'text-violet-800', chipClass: 'bg-violet-100/80 text-violet-600' },
    { dotClass: 'bg-sky-500', textClass: 'text-sky-800', chipClass: 'bg-sky-100/80 text-sky-600' },
    { dotClass: 'bg-cyan-500', textClass: 'text-cyan-800', chipClass: 'bg-cyan-100/80 text-cyan-600' },
    { dotClass: 'bg-rose-500', textClass: 'text-rose-800', chipClass: 'bg-rose-100/80 text-rose-600' },
    { dotClass: 'bg-slate-400', textClass: 'text-slate-600', chipClass: 'bg-slate-100 text-slate-500' },
];
const KNOWN_CATEGORY_INDEX: Record<string, number> = {
    'غذا': 0, food: 0,
    'برق': 1, electricity: 1,
    'کرایه': 2, rent: 2,
    'حمل‌ونقل': 3, 'حمل و نقل': 3, 'ترانسپورت': 3, transport: 3,
    'آب': 4, water: 4,
    'حقوق و دستمزد': 5, 'معاش': 5, 'salary & wages': 5, salary: 5,
    'متفرقه': 6, misc: 6,
};
export type CategoryIconKey = 'food' | 'naan' | 'tea' | 'electricity' | 'water' | 'rent' | 'salary' | 'transport' | 'fuel' | 'internet' | 'phone' | 'repair' | 'shopping' | 'other';
// Keyword-based so user-defined categories also get a fitting icon
// («نان چاشت» → naan, «کرایه موتر» → transport). Order matters: more
// specific groups come before broader ones (naan before food, transport
// with «موتر» before rent so «کرایه موتر» resolves to transport).
const CATEGORY_ICON_KEYWORDS: [
    CategoryIconKey,
    string[]
][] = [
    ['naan', ['نان', 'bread']],
    ['tea', ['چای', 'قهوه', 'tea', 'coffee']],
    ['food', ['غذا', 'خوراک', 'طعام', 'نوشابه', 'food', 'meal', 'lunch', 'dinner']],
    ['electricity', ['برق', 'electric', 'power']],
    ['water', ['آب', 'water']],
    ['salary', ['حقوق', 'دستمزد', 'معاش', 'salary', 'wage']],
    ['fuel', ['تیل', 'پطرول', 'گاز', 'fuel', 'petrol', 'diesel']],
    ['transport', ['حمل', 'ترانسپورت', 'موتر', 'کرایه موتر', 'transport', 'delivery']],
    ['rent', ['کرایه', 'اجاره', 'rent']],
    ['internet', ['انترنت', 'اینترنت', 'وای‌فای', 'internet', 'wifi']],
    ['phone', ['تلیفون', 'تلفن', 'موبایل', 'کریدت', 'phone', 'mobile']],
    ['repair', ['ترمیم', 'مرمت', 'repair', 'maintenance']],
    ['shopping', ['خرید', 'shopping', 'purchase']],
];
export const getCategoryIconKey = (category: string): CategoryIconKey => {
    const key = (category || '').trim().toLowerCase();
    if (!key)
        return 'other';
    for (const [icon, words] of CATEGORY_ICON_KEYWORDS) {
        if (words.some((word) => key.includes(word)))
            return icon;
    }
    return 'other';
};
// Color family per icon group, so a custom category's color always matches
// its icon («معاش» → banknote → rose). 'other' falls through to the name hash.
const ICON_COLOR_INDEX: Partial<Record<CategoryIconKey, number>> = {
    food: 0, naan: 0, tea: 0,
    electricity: 1,
    rent: 2,
    transport: 3, fuel: 3,
    water: 4, internet: 4,
    salary: 5, phone: 5,
    repair: 6, shopping: 6,
};
export const getCategoryVisual = (category: string): CategoryVisual => {
    const key = (category || '').trim().toLowerCase();
    if (!key)
        return CATEGORY_VISUALS[6];
    if (key in KNOWN_CATEGORY_INDEX)
        return CATEGORY_VISUALS[KNOWN_CATEGORY_INDEX[key]];
    const iconColor = ICON_COLOR_INDEX[getCategoryIconKey(category)];
    if (iconColor !== undefined)
        return CATEGORY_VISUALS[iconColor];
    let hash = 0;
    for (let i = 0; i < key.length; i += 1)
        hash = ((hash * 31) + key.charCodeAt(i)) | 0;
    return CATEGORY_VISUALS[Math.abs(hash) % CATEGORY_VISUALS.length];
};
export const getFriendlyAttachmentName = (expense: Expense, index: number, tr: TrFn, num: (value: number) => string) => {
    const total = getAttachmentCount(expense);
    const base = `${tr('Receipt', 'رسید')} ${expense.title}`.trim();
    return total > 1 ? `${base} (${num(index + 1)})` : base;
};
// FSI…PDI isolation for values interpolated into native alert/confirm text,
// where <bdi> is not available.
export const bidiIsolate = (value: string) => `⁨${value}⁩`;
export const compareExpenses = (a: Expense, b: Expense, sort: ExpenseSort, locale: string) => {
    const direction = sort.dir === 'asc' ? 1 : -1;
    switch (sort.key) {
        case 'amount':
            return (a.amount - b.amount) * direction;
        case 'title':
            return a.title.localeCompare(b.title, locale) * direction;
        case 'category':
            return a.category.localeCompare(b.category, locale) * direction;
        case 'date':
        default: {
            const left = new Date(a.date).getTime() || 0;
            const right = new Date(b.date).getTime() || 0;
            return (left - right) * direction;
        }
    }
};
export const useDismissOnOutsideOrEscape = (active: boolean, ref: RefObject<HTMLElement | null>, onDismiss: () => void) => {
    useEffect(() => {
        if (!active || typeof document === 'undefined')
            return;
        const handlePointer = (event: MouseEvent) => {
            if (ref.current && event.target instanceof Node && !ref.current.contains(event.target))
                onDismiss();
        };
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape')
                onDismiss();
        };
        document.addEventListener('mousedown', handlePointer);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handlePointer);
            document.removeEventListener('keydown', handleKey);
        };
    }, [active, onDismiss, ref]);
};
export const readStoredFlag = (key: string) => {
    if (typeof window === 'undefined')
        return false;
    try {
        return window.localStorage.getItem(key) === '1';
    }
    catch {
        return false;
    }
};
export const writeStoredValue = (key: string, value: string) => {
    if (typeof window === 'undefined')
        return;
    try {
        window.localStorage.setItem(key, value);
    }
    catch {
        // ignore storage failures (private mode / quota)
    }
};
export const readStoredValue = (key: string) => {
    if (typeof window === 'undefined')
        return null;
    try {
        return window.localStorage.getItem(key);
    }
    catch {
        return null;
    }
};
