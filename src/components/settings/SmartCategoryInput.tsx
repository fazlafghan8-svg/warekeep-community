import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CategoryIconMeta } from '../../types';
import { matchCategoryIcon, type IconResult } from '../../utils/iconMatcher';
import { CategoryIconChip } from '../ui/CategoryIconChip';
import { IconPickerModal } from '../ui/IconPickerModal';
import type { CategoryIconColor } from '../../utils/iconDictionary';
const DEBOUNCE_MS = 150;
interface SmartCategoryInputProps {
    value: string;
    onChange: (value: string) => void;
    /** Called on Enter/Add with the manual icon pick, if any. Return false to
     *  signal the add was rejected (duplicate/read-only) so the field keeps
     *  its preview and any manual pick instead of resetting. */
    onAdd: (manualIcon?: CategoryIconMeta) => boolean | void;
    language?: 'dari' | 'english';
    placeholder?: string;
    addLabel?: string;
}
/**
 * The "افزودن دسته جدید" field with a live offline icon preview (150ms
 * debounce, zero network traffic), a spelling-correction hint and a manual
 * Icon Picker reachable by clicking the preview chip. Manual picks are
 * final — the matcher never overrides them.
 */
export const SmartCategoryInput: React.FC<SmartCategoryInputProps> = ({ value, onChange, onAdd, language = 'dari', placeholder, addLabel }) => {
    const isEnglish = language === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const [preview, setPreview] = useState<IconResult | null>(null);
    const [manualPick, setManualPick] = useState<CategoryIconMeta | null>(null);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const debounceRef = useRef<number | undefined>(undefined);
    // Live preview with debounce — the whole offline chain runs in <10ms and
    // never issues a network request while typing.
    useEffect(() => {
        const trimmed = value.trim();
        if (!trimmed) {
            setPreview(null);
            setManualPick(null);
            return;
        }
        debounceRef.current = window.setTimeout(() => {
            setPreview(matchCategoryIcon(trimmed));
        }, DEBOUNCE_MS);
        return () => window.clearTimeout(debounceRef.current);
    }, [value]);
    const effectiveChip: CategoryIconMeta | null = useMemo(() => {
        if (manualPick)
            return manualPick;
        if (preview)
            return { icon: preview.icon, color: preview.color, source: preview.source };
        return null;
    }, [manualPick, preview]);
    // The spelling hint concerns the category NAME, so a manual icon pick must
    // not suppress it.
    const suggestion = preview?.suggestedWord && preview.suggestedWord !== value.trim()
        ? preview.suggestedWord
        : null;
    const handleAdd = () => {
        const accepted = onAdd(manualPick || undefined);
        if (accepted === false)
            return;
        setManualPick(null);
        setPreview(null);
    };
    const handleManualSelect = (selection: {
        icon: string;
        color: CategoryIconColor;
    }) => {
        setManualPick({ icon: selection.icon, color: selection.color, source: 'manual' });
    };
    return (<div>
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <input type="text" value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                handleAdd();
            }
        }} className="w-full px-3.5 py-2.5 pe-14 border border-slate-200 rounded-xl bg-white text-slate-800 shadow-sm focus:outline-hidden focus:ring-2 focus:ring-brand-400 focus:border-brand-300 transition" placeholder={placeholder ?? tr('e.g. Marketing, Internet, Security', 'مثال: مارکیتینگ، انترنت، امنیت')}/>
                    <button type="button" onClick={() => setIsPickerOpen(true)} className="absolute end-2 top-1/2 -translate-y-1/2 rounded-xl transition hover:scale-105 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300" title={tr('Choose icon manually', 'انتخاب دستی آیکون')} aria-label={tr('Choose icon manually', 'انتخاب دستی آیکون')}>
                        {effectiveChip ? (<CategoryIconChip icon={effectiveChip.icon} color={effectiveChip.color} source={effectiveChip.source} size="lg" animateKey={`${effectiveChip.icon}-${effectiveChip.color}`} smartBadgeTitle={tr('Smart suggestion', 'پیشنهاد هوشمند')}/>) : (<CategoryIconChip empty size="lg"/>)}
                    </button>
                </div>
                <button onClick={handleAdd} className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold transition whitespace-nowrap">
                    {addLabel ?? tr('Add', 'افزودن')}
                </button>
            </div>

            {suggestion && (<div className="mt-2 flex items-center gap-2 text-xs text-amber-700 animate-fade-in">
                    <span>
                        {isEnglish
                ? <>Did you mean <span className="font-black">"{suggestion}"</span>?</>
                : <>شاید منظور شما <span className="font-black">«{suggestion}»</span> است</>}
                    </span>
                    <button type="button" onClick={() => onChange(suggestion)} className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 font-bold text-amber-800 transition hover:bg-amber-100">
                        {tr('Fix name', 'اصلاح نام')}
                    </button>
                </div>)}

            <IconPickerModal isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} onSelect={handleManualSelect} initialIcon={effectiveChip?.icon} initialColor={effectiveChip?.color} language={language}/>
        </div>);
};
