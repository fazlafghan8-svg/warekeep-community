import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './Modal';
import { CategoryIconChip, getCategoryColorHex } from './CategoryIconChip';
import { getCategoryIconComponent } from '../icons/lucideRegistry';
import { ICON_DICTIONARY, ICON_COLOR_PALETTE, ALL_CATEGORY_ICONS, type CategoryIconColor, type IconTheme } from '../../utils/iconDictionary';
import { normalizeFa } from '../../utils/textNormalizer';
import { classNames } from '../../utils/classNames';
const RECENT_ICONS_KEY = 'warekeep_recent_category_icons';
const RECENT_ICONS_LIMIT = 12;
const readRecentIcons = (): string[] => {
    try {
        const raw = localStorage.getItem(RECENT_ICONS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    }
    catch {
        return [];
    }
};
const pushRecentIcon = (icon: string): void => {
    try {
        const next = [icon, ...readRecentIcons().filter((item) => item !== icon)].slice(0, RECENT_ICONS_LIMIT);
        localStorage.setItem(RECENT_ICONS_KEY, JSON.stringify(next));
    }
    catch {
        // best-effort
    }
};
interface ThemeTab {
    id: IconTheme;
    en: string;
    fa: string;
}
const THEME_TABS: ThemeTab[] = [
    { id: 'financial', en: 'Financial', fa: 'مالی' },
    { id: 'construction', en: 'Building', fa: 'ساختمان' },
    { id: 'transport', en: 'Transport', fa: 'ترانسپورت' },
    { id: 'food', en: 'Food', fa: 'خوراک' },
    { id: 'office', en: 'Office', fa: 'اداری' },
    { id: 'misc', en: 'Misc', fa: 'متفرقه' }
];
// Search corpus: every icon with its keywords (fa + en + icon name) pre-normalized.
const SEARCH_CORPUS: Array<{
    icon: string;
    haystack: string[];
}> = (() => {
    const byIcon = new Map<string, Set<string>>();
    for (const entry of ICON_DICTIONARY) {
        const bucket = byIcon.get(entry.icon) || new Set<string>();
        bucket.add(normalizeFa(entry.icon.replace(/-/g, ' ')));
        for (const keyword of [...entry.fa, ...entry.en])
            bucket.add(normalizeFa(keyword));
        byIcon.set(entry.icon, bucket);
    }
    return ALL_CATEGORY_ICONS.map((icon) => ({ icon, haystack: Array.from(byIcon.get(icon) || []) }));
})();
const ICONS_BY_THEME: Record<IconTheme, string[]> = (() => {
    const map: Record<IconTheme, string[]> = {
        financial: [], construction: [], transport: [], food: [], office: [], misc: []
    };
    const seen = new Set<string>();
    for (const entry of ICON_DICTIONARY) {
        if (seen.has(entry.icon))
            continue;
        seen.add(entry.icon);
        map[entry.theme].push(entry.icon);
    }
    return map;
})();
interface IconPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (selection: {
        icon: string;
        color: CategoryIconColor;
    }) => void;
    initialIcon?: string;
    initialColor?: string;
    language?: 'dari' | 'english';
}
/**
 * RTL-first icon picker: search (normalizeFa-powered), theme tabs, a
 * recently-used row, an 8-column icon grid and a separate color palette.
 */
export const IconPickerModal: React.FC<IconPickerModalProps> = ({ isOpen, onClose, onSelect, initialIcon, initialColor, language = 'dari' }) => {
    const isEnglish = language === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTheme, setActiveTheme] = useState<IconTheme>('financial');
    const [selectedColor, setSelectedColor] = useState<CategoryIconColor>('slate');
    const [recentIcons, setRecentIcons] = useState<string[]>([]);
    // Reset only on the closed→open transition; live prop updates while the
    // picker is open (e.g. an AI answer landing) must not wipe in-progress state.
    const wasOpenRef = useRef(false);
    useEffect(() => {
        const justOpened = isOpen && !wasOpenRef.current;
        wasOpenRef.current = isOpen;
        if (!justOpened)
            return;
        setSearchTerm('');
        setRecentIcons(readRecentIcons());
        setSelectedColor((initialColor && ICON_COLOR_PALETTE.includes(initialColor as CategoryIconColor)
            ? initialColor
            : 'slate') as CategoryIconColor);
        if (initialIcon) {
            const owningEntry = ICON_DICTIONARY.find((entry) => entry.icon === initialIcon);
            if (owningEntry)
                setActiveTheme(owningEntry.theme);
        }
    }, [isOpen, initialIcon, initialColor]);
    const normalizedSearch = normalizeFa(searchTerm);
    const visibleIcons = useMemo(() => {
        if (normalizedSearch) {
            return SEARCH_CORPUS
                .filter(({ haystack }) => haystack.some((keyword) => keyword.includes(normalizedSearch)))
                .map(({ icon }) => icon);
        }
        return ICONS_BY_THEME[activeTheme];
    }, [normalizedSearch, activeTheme]);
    const handlePick = (icon: string) => {
        pushRecentIcon(icon);
        onSelect({ icon, color: selectedColor });
        onClose();
    };
    const renderIconButton = (icon: string) => {
        const IconComponent = getCategoryIconComponent(icon);
        const palette = getCategoryColorHex(selectedColor);
        const isCurrent = icon === initialIcon;
        return (<button key={icon} type="button" onClick={() => handlePick(icon)} title={icon} className={classNames('flex items-center justify-center rounded-xl border p-2 transition hover:scale-105 hover:border-brand-300 hover:bg-brand-50', isCurrent ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-200' : 'border-slate-200 bg-white')} style={{ color: palette.icon }}>
                <IconComponent size={20} strokeWidth={1.75}/>
            </button>);
    };
    return (<Modal isOpen={isOpen} onClose={onClose} title={tr('Choose Icon & Color', 'انتخاب آیکون و رنگ')} maxWidthClassName="max-w-2xl">
            <div className="space-y-5" dir={isEnglish ? 'ltr' : 'rtl'}>
                <div className="flex items-center gap-3">
                    <CategoryIconChip icon={initialIcon || 'tag'} color={selectedColor} size="lg" animateKey={`${initialIcon}-${selectedColor}`}/>
                    <input type="text" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="wk-input flex-1" placeholder={tr('Search icons… (e.g. fuel, electricity, rent)', 'جستجوی آیکون… (مثلاً برق، کرایه، fuel)')} autoFocus/>
                </div>

                <div>
                    <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{tr('Color', 'رنگ')}</p>
                    <div className="flex flex-wrap gap-2">
                        {ICON_COLOR_PALETTE.map((color) => {
            const hex = getCategoryColorHex(color);
            const isActive = color === selectedColor;
            return (<button key={color} type="button" title={color} onClick={() => setSelectedColor(color)} className={classNames('h-7 w-7 rounded-full border-2 transition', isActive ? 'scale-110 border-slate-700 shadow-sm' : 'border-transparent hover:scale-105')} style={{ backgroundColor: hex.base }} aria-pressed={isActive} aria-label={color}/>);
        })}
                    </div>
                </div>

                {!normalizedSearch && recentIcons.length > 0 && (<div>
                        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{tr('Recently Used', 'اخیراً استفاده‌شده')}</p>
                        <div className="grid grid-cols-8 gap-2">
                            {recentIcons.map(renderIconButton)}
                        </div>
                    </div>)}

                {!normalizedSearch && (<div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
                        {THEME_TABS.map((tab) => (<button key={tab.id} type="button" onClick={() => setActiveTheme(tab.id)} className={classNames('rounded-full px-3.5 py-1.5 text-xs font-bold transition', activeTheme === tab.id
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                                {tr(tab.en, tab.fa)}
                            </button>))}
                    </div>)}

                <div className="max-h-72 overflow-y-auto custom-scrollbar">
                    {visibleIcons.length === 0 ? (<p className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
                            {tr('No icon matches this search.', 'هیچ آیکونی با این جستجو پیدا نشد.')}
                        </p>) : (<div className="grid grid-cols-8 gap-2">
                            {visibleIcons.map(renderIconButton)}
                        </div>)}
                </div>
            </div>
        </Modal>);
};
