import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { TrFn } from './helpers';
import { TrashIcon, XIcon } from './icons';
interface BulkActionBarProps {
    count: number;
    fmtNum: (value: number) => string;
    categories: string[];
    onApplyCategory: (category: string) => void;
    onDelete: () => void;
    onClear: () => void;
    readOnly: boolean;
    canEdit: boolean;
    tr: TrFn;
    isEnglish: boolean;
}
export const BulkActionBar: React.FC<BulkActionBarProps> = ({ count, fmtNum, categories, onApplyCategory, onDelete, onClear, readOnly, canEdit, tr, isEnglish, }) => {
    const [category, setCategory] = useState('');
    if (count === 0 || typeof document === 'undefined')
        return null;
    const node = (<div className="pointer-events-none fixed inset-x-0 bottom-4 z-[105] flex justify-center px-4" dir={isEnglish ? 'ltr' : 'rtl'}>
            <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 shadow-lg motion-safe:animate-[wkBulkBarIn_180ms_ease-out]">
                <p className="text-sm font-black text-slate-800">
                    <bdi>{fmtNum(count)}</bdi> {tr('selected', 'مورد انتخاب شد')}
                </p>
                <span aria-hidden="true" className="h-5 w-px bg-neutral-200"/>
                <div className="flex items-center gap-1.5">
                    <label className="sr-only" htmlFor="wk-bulk-category">{tr('Set category', 'تغییر دسته')}</label>
                    <select id="wk-bulk-category" value={category} onChange={(event) => setCategory(event.target.value)} disabled={readOnly || !canEdit} className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-xs font-bold text-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 disabled:opacity-45">
                        <option value="">{tr('Set category…', 'تغییر دسته…')}</option>
                        {categories.map((item) => (<option key={item} value={item}>{item}</option>))}
                    </select>
                    <button type="button" disabled={!category || readOnly || !canEdit} onClick={() => {
            if (category) {
                onApplyCategory(category);
                setCategory('');
            }
        }} className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-black text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                        {tr('Apply', 'اعمال')}
                    </button>
                </div>
                <button type="button" disabled={readOnly} onClick={onDelete} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-black text-danger-700 transition hover:bg-danger-50 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-danger-500/50 motion-reduce:transition-none">
                    <TrashIcon className="h-3.5 w-3.5"/>
                    {tr('Delete', 'حذف')}
                </button>
                <button type="button" onClick={onClear} aria-label={tr('Clear selection', 'لغو انتخاب')} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-neutral-100 hover:text-slate-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60 motion-reduce:transition-none">
                    <XIcon className="h-4 w-4"/>
                </button>
            </div>
        </div>);
    return createPortal(node, document.body);
};
