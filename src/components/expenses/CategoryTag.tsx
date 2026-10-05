import React, { createContext, useContext } from 'react';
import { classNames } from '@/utils/classNames';
import type { CategoryIconMeta } from '@/types';
import { resolveCategoryIconMeta } from '@/utils/iconMatcher';
import { getCategoryIconComponent } from '@/components/icons/lucideRegistry';
import { getCategoryVisual } from './helpers';
/**
 * Saved per-category icon metadata (manual/AI picks from settings). Provided
 * once by ExpensesPage so every CategoryTag — table rows, drawer, the
 * CategorySelect listbox — resolves through the smart icon engine without
 * prop-drilling. Works across portals (React context follows the element tree).
 */
export const CategoryIconsContext = createContext<Record<string, CategoryIconMeta> | undefined>(undefined);
interface CategoryTagProps {
    category: string;
    className?: string;
    /** 'sm' shrinks the icon chip for tight rows (mobile cards, drawer header). */
    size?: 'md' | 'sm';
}
export const CategoryTag: React.FC<CategoryTagProps> = ({ category, className, size = 'md' }) => {
    const categoryIcons = useContext(CategoryIconsContext);
    const visual = getCategoryVisual(category);
    // Icon glyph comes from the smart matcher (dictionary/phonetic/fuzzy/AI
    // cache + manual picks); tint stays with this page's visual system so the
    // amber-is-warning-only design rule keeps holding here.
    const meta = resolveCategoryIconMeta(categoryIcons, category);
    const Icon = getCategoryIconComponent(meta.icon);
    return (<span className={classNames('inline-flex min-w-0 items-center gap-1.5 text-sm font-bold', visual.textClass, className)}>
            <span aria-hidden="true" className={classNames('flex shrink-0 items-center justify-center rounded-lg', size === 'sm' ? 'h-5 w-5' : 'h-6 w-6', visual.chipClass)}>
                <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} strokeWidth={2.25}/>
            </span>
            <span className="truncate">{category}</span>
        </span>);
};
