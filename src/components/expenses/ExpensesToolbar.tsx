import React, { useRef, useState } from 'react';
import { classNames } from '@/utils/classNames';
import { ExpenseView, TableDensity, TrFn, useDismissOnOutsideOrEscape } from './helpers';
import { ChevronDownIcon, RowsIcon, SearchIcon, XIcon } from './icons';
import { CategoryTag } from './CategoryTag';
import { JalaliDatePicker } from '../ui/JalaliDatePicker';
type DateRangePreset = 'all' | 'today' | '7d' | '30d' | 'custom';
const isoDay = (date: Date) => date.toISOString().split('T')[0];
const isoDaysAgo = (days: number) => isoDay(new Date(Date.now() - days * 86400000));
const presetRange = (preset: Exclude<DateRangePreset, 'custom'>): {
    from: string;
    to: string;
} => {
    if (preset === 'today')
        return { from: isoDay(new Date()), to: isoDay(new Date()) };
    if (preset === '7d')
        return { from: isoDaysAgo(6), to: isoDay(new Date()) };
    if (preset === '30d')
        return { from: isoDaysAgo(29), to: isoDay(new Date()) };
    return { from: '', to: '' };
};
interface ExpensesToolbarProps {
    tr: TrFn;
    isEnglish: boolean;
    view: ExpenseView;
    onViewChange: (view: ExpenseView) => void;
    counts: {
        all: number;
        review: number;
        recurring: number;
    };
    fmtNum: (value: number) => string;
    searchTerm: string;
    onSearchChange: (value: string) => void;
    categories: string[];
    selectedCategories: string[];
    onSelectedCategoriesChange: (value: string[]) => void;
    dateFrom: string;
    dateTo: string;
    onDateFromChange: (value: string) => void;
    onDateToChange: (value: string) => void;
    density: TableDensity;
    onDensityChange: (value: TableDensity) => void;
    hasActiveFilters: boolean;
    onClearFilters: () => void;
}
const tabClass = (active: boolean) => classNames('inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-bold transition motion-reduce:transition-none', 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60', active ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900');
export const ExpensesToolbar: React.FC<ExpensesToolbarProps> = ({ tr, isEnglish, view, onViewChange, counts, fmtNum, searchTerm, onSearchChange, categories, selectedCategories, onSelectedCategoriesChange, dateFrom, dateTo, onDateFromChange, onDateToChange, density, onDensityChange, hasActiveFilters, onClearFilters, }) => {
    const [categoryOpen, setCategoryOpen] = useState(false);
    const [customRangeOpen, setCustomRangeOpen] = useState(false);
    const categoryRef = useRef<HTMLDivElement | null>(null);
    useDismissOnOutsideOrEscape(categoryOpen, categoryRef, () => setCategoryOpen(false));
    // Derive the select value from the actual filter state, so external resets
    // (e.g. "clear filters") are always reflected.
    const activePreset: DateRangePreset = customRangeOpen
        ? 'custom'
        : (['all', 'today', '7d', '30d'] as const).find((preset) => {
            const range = presetRange(preset);
            return range.from === dateFrom && range.to === dateTo;
        }) || 'custom';
    const applyPreset = (preset: DateRangePreset) => {
        if (preset === 'custom') {
            setCustomRangeOpen(true);
            return;
        }
        setCustomRangeOpen(false);
        const range = presetRange(preset);
        onDateFromChange(range.from);
        onDateToChange(range.to);
    };
    const tabs: {
        id: ExpenseView;
        label: string;
        count: number;
    }[] = [
        { id: 'all', label: tr('All', 'همه'), count: counts.all },
        { id: 'review', label: tr('Needs review', 'نیازمند بازبینی'), count: counts.review },
        { id: 'recurring', label: tr('Recurring', 'تکرارشونده'), count: counts.recurring },
    ];
    const toggleCategory = (category: string) => {
        onSelectedCategoriesChange(selectedCategories.includes(category)
            ? selectedCategories.filter((item) => item !== category)
            : [...selectedCategories, category]);
    };
    const categoryButtonLabel = selectedCategories.length === 0
        ? tr('Category', 'دسته‌بندی')
        : selectedCategories.length === 1
            ? selectedCategories[0]
            : `${fmtNum(selectedCategories.length)} ${tr('categories', 'دسته')}`;
    return (<div className="flex flex-wrap items-center gap-2 rounded-t-xl border border-b-0 border-neutral-200 bg-white px-3 py-2.5">
            <div role="group" aria-label={tr('Expense views', 'نماهای هزینه')} className="flex items-center gap-0.5 rounded-xl bg-neutral-100 p-1">
                {tabs.map((tab) => (<button key={tab.id} type="button" aria-pressed={view === tab.id} onClick={() => onViewChange(tab.id)} className={tabClass(view === tab.id)}>
                        <span>{tab.label}</span>
                        <span className={classNames('tabular-nums text-xs font-black', tab.count === 0 ? 'text-slate-400' : view === tab.id ? 'text-brand-600' : 'text-slate-500')}>
                            <bdi>{fmtNum(tab.count)}</bdi>
                        </span>
                    </button>))}
            </div>

            <div className="ms-auto flex flex-wrap items-center gap-2">
                <label className="relative block">
                    <span className="sr-only">{tr('Search expenses', 'جستجوی هزینه‌ها')}</span>
                    <SearchIcon className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
                    <input type="search" value={searchTerm} onChange={(event) => onSearchChange(event.target.value)} placeholder={tr('Search title, note, file…', 'جستجو در عنوان، یادداشت، فایل…')} className="wk-input h-9 w-56 ps-8 text-sm md:w-72" dir={isEnglish ? 'ltr' : 'rtl'}/>
                </label>

                <div ref={categoryRef} className="relative">
                    <button type="button" onClick={() => setCategoryOpen((open) => !open)} aria-haspopup="listbox" aria-expanded={categoryOpen} className={classNames('inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-bold transition motion-reduce:transition-none', 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60', selectedCategories.length > 0 ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-neutral-200 bg-white text-slate-700 hover:bg-neutral-50')}>
                        <span className="max-w-[9rem] truncate">{categoryButtonLabel}</span>
                        <ChevronDownIcon className="h-3.5 w-3.5 text-slate-400"/>
                    </button>
                    {categoryOpen ? (<div className="absolute end-0 top-full z-30 mt-1 max-h-64 w-52 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg">
                            {categories.map((category) => {
                const checked = selectedCategories.includes(category);
                return (<label key={category} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-700 hover:bg-neutral-50">
                                        <input type="checkbox" checked={checked} onChange={() => toggleCategory(category)} className="h-4 w-4 accent-[rgb(var(--wk-color-brand-600))]"/>
                                        <CategoryTag category={category} className="min-w-0 flex-1 text-xs" size="sm"/>
                                    </label>);
            })}
                            {selectedCategories.length > 0 ? (<button type="button" onClick={() => onSelectedCategoriesChange([])} className="mt-1 w-full rounded-lg px-2 py-1.5 text-start text-xs font-bold text-brand-700 hover:bg-brand-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60">
                                    {tr('Clear categories', 'حذف انتخاب دسته‌ها')}
                                </button>) : null}
                        </div>) : null}
                </div>

                <div className="flex items-center gap-1">
                    <label className="sr-only" htmlFor="wk-expense-date-range">{tr('Date range', 'بازه تاریخ')}</label>
                    <select id="wk-expense-date-range" value={activePreset} onChange={(event) => applyPreset(event.target.value as DateRangePreset)} className={classNames('h-9 rounded-lg border px-2 text-sm font-bold transition motion-reduce:transition-none', 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60', activePreset === 'all' ? 'border-neutral-200 bg-white text-slate-700' : 'border-brand-300 bg-brand-50 text-brand-700')} aria-label={tr('Date range', 'بازه تاریخ')}>
                        <option value="all">{tr('All dates', 'همه تاریخ‌ها')}</option>
                        <option value="today">{tr('Today', 'امروز')}</option>
                        <option value="7d">{tr('Last 7 days', '۷ روز اخیر')}</option>
                        <option value="30d">{tr('Last 30 days', '۳۰ روز اخیر')}</option>
                        <option value="custom">{tr('Custom range…', 'بازه سفارشی…')}</option>
                    </select>
                    {activePreset === 'custom' ? (<>
                            <JalaliDatePicker id="wk-expense-date-from" value={dateFrom} onChange={onDateFromChange} isEnglish={isEnglish} allowClear className="w-40" inputClassName="h-9 w-full text-xs" ariaLabel={tr('From date', 'از تاریخ')}/>
                            <span aria-hidden="true" className="text-xs font-bold text-slate-400">–</span>
                            <JalaliDatePicker id="wk-expense-date-to" value={dateTo} onChange={onDateToChange} isEnglish={isEnglish} allowClear className="w-40" inputClassName="h-9 w-full text-xs" ariaLabel={tr('To date', 'تا تاریخ')}/>
                        </>) : null}
                </div>

                <button type="button" onClick={() => onDensityChange(density === 'compact' ? 'normal' : 'compact')} aria-pressed={density === 'compact'} aria-label={tr('Toggle compact table density', 'تغییر تراکم جدول (عادی/فشرده)')} title={density === 'compact' ? tr('Compact rows', 'ردیف‌های فشرده') : tr('Normal rows', 'ردیف‌های عادی')} className={classNames('inline-flex h-9 w-9 items-center justify-center rounded-lg border transition motion-reduce:transition-none', 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60', density === 'compact' ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-neutral-200 bg-white text-slate-500 hover:bg-neutral-50')}>
                    <RowsIcon className="h-4 w-4"/>
                </button>

                {hasActiveFilters ? (<button type="button" onClick={() => { setCustomRangeOpen(false); onClearFilters(); }} className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-slate-500 transition hover:bg-neutral-100 hover:text-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                        <XIcon className="h-3.5 w-3.5"/>
                        {tr('Clear filters', 'پاک‌سازی فیلترها')}
                    </button>) : null}
            </div>
        </div>);
};
