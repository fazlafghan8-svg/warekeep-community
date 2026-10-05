import React, { useEffect, useRef, useState } from 'react';
import { classNames } from '@/utils/classNames';
import { CategoryTag } from './CategoryTag';
import { TrFn, useDismissOnOutsideOrEscape } from './helpers';
import { CheckIcon, ChevronDownIcon } from './icons';
interface CategorySelectProps {
    value: string;
    onChange: (value: string) => void;
    categories: string[];
    disabled?: boolean;
    tr: TrFn;
    className?: string;
}
export const CategorySelect: React.FC<CategorySelectProps> = ({ value, onChange, categories, disabled = false, tr, className, }) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    useDismissOnOutsideOrEscape(open, rootRef, () => setOpen(false));
    useEffect(() => {
        if (!open)
            return;
        const timer = window.setTimeout(() => {
            const selected = listRef.current?.querySelector<HTMLButtonElement>('button[data-selected="true"]');
            (selected || listRef.current?.querySelector<HTMLButtonElement>('button[role="option"]'))?.focus();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [open]);
    const moveFocus = (step: number, edge = false) => {
        const options = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[role="option"]') || []);
        if (!options.length)
            return;
        if (edge) {
            options[step > 0 ? options.length - 1 : 0].focus();
            return;
        }
        const active = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
        const index = active ? options.indexOf(active) : -1;
        options[(index + step + options.length) % options.length].focus();
    };
    const handleListKeyDown = (event: React.KeyboardEvent) => {
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
        else if (event.key === 'Tab') {
            setOpen(false);
        }
        else if (event.key === 'Escape') {
            setOpen(false);
            triggerRef.current?.focus();
        }
    };
    const select = (category: string) => {
        onChange(category);
        setOpen(false);
        triggerRef.current?.focus();
    };
    return (<div ref={rootRef} className={classNames('relative', className)}>
            <button ref={triggerRef} type="button" disabled={disabled} onClick={() => setOpen((prev) => !prev)} onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && !open) {
                event.preventDefault();
                setOpen(true);
            }
        }} aria-haspopup="listbox" aria-expanded={open} className="wk-input mt-2 flex w-full items-center justify-between gap-2 text-start disabled:cursor-not-allowed disabled:opacity-60">
                {value ? (<CategoryTag category={value} size="sm" className="min-w-0"/>) : (<span className="truncate text-slate-400">{tr('Select…', 'انتخاب کنید…')}</span>)}
                <ChevronDownIcon className={classNames('h-4 w-4 shrink-0 text-slate-400 transition-transform motion-reduce:transition-none', open && 'rotate-180')}/>
            </button>
            {open ? (<div ref={listRef} role="listbox" aria-label={tr('Category', 'دسته‌بندی')} onKeyDown={handleListKeyDown} className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg">
                    {categories.map((category) => {
                const selected = category === value;
                return (<button key={category} type="button" role="option" aria-selected={selected} data-selected={selected || undefined} onClick={() => select(category)} className={classNames('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-start transition hover:bg-neutral-50 motion-reduce:transition-none', 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400/60', selected && 'bg-brand-50/70')}>
                                <CategoryTag category={category} size="sm" className="min-w-0 flex-1"/>
                                {selected ? <CheckIcon className="h-4 w-4 shrink-0 text-brand-600"/> : null}
                            </button>);
            })}
                </div>) : null}
        </div>);
};
