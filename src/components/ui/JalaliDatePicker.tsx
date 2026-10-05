import React, { useEffect, useMemo, useRef, useState } from 'react';
import { classNames } from '@/utils/classNames';
import { AFGHAN_SOLAR_MONTHS_FA, AFGHAN_WEEKDAYS_SHORT_FA, formatJalali, isoToJalali, jalaliMonthLength, jalaliToDate, jalaliToIso, todayJalali, toPersianDigits } from '@/utils/jalali';
interface JalaliDatePickerProps {
    /** ISO `YYYY-MM-DD` (or '') — the stored Gregorian value. */
    value: string;
    onChange: (iso: string) => void;
    /** In English mode the native Gregorian date input is kept. */
    isEnglish?: boolean;
    disabled?: boolean;
    required?: boolean;
    allowClear?: boolean;
    id?: string;
    className?: string;
    inputClassName?: string;
    ariaLabel?: string;
}
const YEAR_WINDOW = 6; // years back/forward in the year select
export const JalaliDatePicker: React.FC<JalaliDatePickerProps> = ({ value, onChange, isEnglish = false, disabled = false, required = false, allowClear = false, id, className, inputClassName, ariaLabel, }) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const selected = useMemo(() => isoToJalali(value), [value]);
    const today = useMemo(() => todayJalali(), []);
    const [viewYear, setViewYear] = useState(() => (selected || today).jy);
    const [viewMonth, setViewMonth] = useState(() => (selected || today).jm);
    useEffect(() => {
        if (!open)
            return;
        const anchor = selected || today;
        setViewYear(anchor.jy);
        setViewMonth(anchor.jm);
    }, [open, selected, today]);
    useEffect(() => {
        if (!open || typeof document === 'undefined')
            return;
        const handlePointer = (event: MouseEvent) => {
            if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
                setOpen(false);
            }
        };
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                setOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener('mousedown', handlePointer);
        document.addEventListener('keydown', handleKey, true);
        return () => {
            document.removeEventListener('mousedown', handlePointer);
            document.removeEventListener('keydown', handleKey, true);
        };
    }, [open]);
    if (isEnglish) {
        return (<div className={className}>
                <input id={id} type="date" value={value} required={required} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={classNames('wk-input wk-date-input w-full', inputClassName)} aria-label={ariaLabel}/>
            </div>);
    }
    const moveMonth = (step: number) => {
        let month = viewMonth + step;
        let year = viewYear;
        if (month < 1) {
            month = 12;
            year -= 1;
        }
        if (month > 12) {
            month = 1;
            year += 1;
        }
        setViewYear(year);
        setViewMonth(month);
    };
    const daysInMonth = jalaliMonthLength(viewYear, viewMonth);
    // Column for a week that starts on Saturday: JS getDay() 6=Sat -> 0.
    const firstWeekday = (jalaliToDate(viewYear, viewMonth, 1).getDay() + 1) % 7;
    const years = Array.from({ length: YEAR_WINDOW * 2 + 1 }, (_, i) => today.jy - YEAR_WINDOW + i);
    const pick = (day: number) => {
        onChange(jalaliToIso(viewYear, viewMonth, day));
        setOpen(false);
        triggerRef.current?.focus();
    };
    const navButtonClass = 'inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-neutral-100 hover:text-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none';
    return (<div ref={rootRef} className={classNames('relative', className)} dir="rtl">
            <button ref={triggerRef} id={id} type="button" disabled={disabled} onClick={() => setOpen((prev) => !prev)} aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel} className={classNames('wk-input flex w-full items-center justify-between gap-2 text-start disabled:cursor-not-allowed disabled:opacity-60', inputClassName)}>
                {selected ? (<bdi className="whitespace-nowrap">{formatJalali(selected)}</bdi>) : (<span className="text-slate-400">انتخاب تاریخ…</span>)}
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-slate-400">
                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                    <path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
            </button>

            {open ? (<div role="dialog" aria-label="تقویم شمسی" className="absolute inset-x-0 top-full z-40 mt-1 min-w-[272px] rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
                    <div className="flex items-center justify-between gap-1">
                        <button type="button" onClick={() => moveMonth(-1)} aria-label="ماه قبل" className={navButtonClass}>
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m9 6 6 6-6 6"/></svg>
                        </button>
                        <div className="flex items-center gap-1.5">
                            <select value={viewMonth} onChange={(event) => setViewMonth(Number(event.target.value))} aria-label="ماه" className="h-8 rounded-lg border border-neutral-200 bg-white px-1.5 text-sm font-bold text-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60">
                                {AFGHAN_SOLAR_MONTHS_FA.map((name, index) => (<option key={name} value={index + 1}>{name}</option>))}
                            </select>
                            <select value={viewYear} onChange={(event) => setViewYear(Number(event.target.value))} aria-label="سال" className="h-8 rounded-lg border border-neutral-200 bg-white px-1.5 text-sm font-bold tabular-nums text-slate-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60">
                                {years.map((year) => (<option key={year} value={year}>{toPersianDigits(year)}</option>))}
                            </select>
                        </div>
                        <button type="button" onClick={() => moveMonth(1)} aria-label="ماه بعد" className={navButtonClass}>
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m15 6-6 6 6 6"/></svg>
                        </button>
                    </div>

                    <div className="mt-2 grid grid-cols-7 gap-0.5 text-center">
                        {AFGHAN_WEEKDAYS_SHORT_FA.map((name) => (<span key={name} className="py-1 text-[11px] font-black text-slate-400">{name}</span>))}
                        {Array.from({ length: firstWeekday }).map((_, index) => <span key={`pad-${index}`}/>)}
                        {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
                const isSelected = Boolean(selected && selected.jy === viewYear && selected.jm === viewMonth && selected.jd === day);
                const isToday = today.jy === viewYear && today.jm === viewMonth && today.jd === day;
                return (<button key={day} type="button" onClick={() => pick(day)} aria-label={formatJalali({ jy: viewYear, jm: viewMonth, jd: day })} aria-pressed={isSelected} className={classNames('flex h-8 w-full items-center justify-center rounded-lg text-sm font-bold tabular-nums transition motion-reduce:transition-none', 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60', isSelected
                        ? 'bg-brand-600 text-white'
                        : isToday
                            ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200'
                            : 'text-slate-700 hover:bg-neutral-100')}>
                                    {toPersianDigits(day)}
                                </button>);
            })}
                    </div>

                    <div className="mt-2 flex items-center justify-between border-t border-neutral-100 pt-2">
                        <button type="button" onClick={() => { onChange(jalaliToIso(today.jy, today.jm, today.jd)); setOpen(false); triggerRef.current?.focus(); }} className="rounded-lg px-2.5 py-1.5 text-xs font-black text-brand-700 transition hover:bg-brand-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                            امروز
                        </button>
                        {allowClear && value ? (<button type="button" onClick={() => { onChange(''); setOpen(false); triggerRef.current?.focus(); }} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-neutral-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                                پاک کردن
                            </button>) : null}
                    </div>
                </div>) : null}
        </div>);
};
