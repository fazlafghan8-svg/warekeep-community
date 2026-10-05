import React, { useEffect, useMemo, useRef, useState } from 'react';
import { classNames } from '@/utils/classNames';
export type CommandPaletteItem = {
    id: string;
    label: string;
    description?: string;
    group: string;
    keywords?: string[];
    shortcut?: string;
    onSelect: () => void;
};
interface CommandPaletteProps {
    isOpen: boolean;
    language?: 'dari' | 'english';
    items: CommandPaletteItem[];
    onClose: () => void;
}
export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, language = 'dari', items, onClose }) => {
    const [query, setQuery] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const isEnglish = language === 'english';
    const tr = (en: string, fa: string) => (isEnglish ? en : fa);
    useEffect(() => {
        if (!isOpen) {
            setQuery('');
            setHighlightedIndex(0);
            return;
        }
        const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
        return () => window.clearTimeout(timer);
    }, [isOpen]);
    const filteredItems = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery)
            return items;
        return items.filter((item) => {
            const haystack = [item.label, item.description || '', ...(item.keywords || [])]
                .join(' ')
                .toLowerCase();
            return haystack.includes(normalizedQuery);
        });
    }, [items, query]);
    const groupedItems = useMemo(() => {
        return filteredItems.reduce<Record<string, CommandPaletteItem[]>>((groups, item) => {
            groups[item.group] = groups[item.group] || [];
            groups[item.group].push(item);
            return groups;
        }, {});
    }, [filteredItems]);
    const flatItems = useMemo(() => Object.values(groupedItems).flat(), [groupedItems]);
    useEffect(() => {
        if (!isOpen)
            return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (!flatItems.length)
                return;
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setHighlightedIndex((current) => (current + 1) % flatItems.length);
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                setHighlightedIndex((current) => (current - 1 + flatItems.length) % flatItems.length);
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                flatItems[Math.min(highlightedIndex, flatItems.length - 1)]?.onSelect();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [flatItems, highlightedIndex, isOpen, onClose]);
    useEffect(() => {
        setHighlightedIndex(0);
    }, [query]);
    if (!isOpen)
        return null;
    let runningIndex = -1;
    return (<div className="fixed inset-0 z-[110]" dir={isEnglish ? 'ltr' : 'rtl'}>
      <button type="button" className="absolute inset-0 bg-slate-950/56 backdrop-blur-sm" aria-label={tr('Close command palette', 'بستن جستجوی فرمان')} onClick={onClose}/>

      <section className="absolute left-1/2 top-[12dvh] w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-[30px] border border-white/70 bg-[rgba(255,255,255,0.88)] shadow-[0_28px_90px_-40px_rgba(15,23,42,0.55)] backdrop-blur-2xl">
        <div className="border-b border-neutral-200/80 px-4 py-4 md:px-5">
          <div className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]">
            <svg className="h-5 w-5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
              <circle cx="11" cy="11" r="6.5"/>
              <path d="m20 20-3.5-3.5" strokeLinecap="round"/>
            </svg>
            <input ref={inputRef} type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('Search pages, actions, and tools', 'صفحه‌ها، اقدامات و ابزارها را جستجو کنید')} className="wk-input h-auto min-h-0 border-none bg-transparent px-0 py-0 shadow-none focus:ring-0"/>
            <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-black text-neutral-500">
              Ctrl + K
            </span>
          </div>
        </div>

        <div className="max-h-[62dvh] overflow-y-auto p-4 md:p-5">
          {flatItems.length === 0 ? (<div className="wk-empty-state-shell px-4 py-10 text-center">
              <p className="wk-section-title text-neutral-800">{tr('No matching command found', 'فرمان مطابقی پیدا نشد')}</p>
              <p className="wk-body-text mt-2 text-neutral-500">{tr('Try a page name, action, or keyword.', 'نام صفحه، اقدام یا کلیدواژه دیگری را امتحان کنید.')}</p>
            </div>) : (<div className="space-y-4">
              {Object.entries(groupedItems).map(([group, groupItems]) => (<div key={group}>
                  <p className="wk-meta-text px-2 text-neutral-500">{group}</p>
                  <div className="mt-2 space-y-2">
                    {groupItems.map((item) => {
                    runningIndex += 1;
                    const isActive = runningIndex === highlightedIndex;
                    return (<button key={item.id} type="button" onClick={() => {
                            item.onSelect();
                            onClose();
                        }} className={classNames('wk-focus-ring flex w-full items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-start transition', isActive
                            ? 'border-brand-200 bg-brand-50/75 text-brand-900 shadow-[0_16px_34px_-24px_rgba(99,174,227,0.55)]'
                            : 'border-white/80 bg-white/88 text-neutral-800 hover:border-brand-100 hover:bg-white')}>
                          <div className="min-w-0">
                            <p className="text-sm font-black">{item.label}</p>
                            {item.description ? <p className="mt-1 text-xs font-semibold text-neutral-500">{item.description}</p> : null}
                          </div>
                          {item.shortcut ? (<span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-black text-neutral-500">
                              {item.shortcut}
                            </span>) : null}
                        </button>);
                })}
                  </div>
                </div>))}
            </div>)}
        </div>
      </section>
    </div>);
};
