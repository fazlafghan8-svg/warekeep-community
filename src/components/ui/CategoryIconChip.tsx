import React from 'react';
import type { CategoryIconSource } from '../../types';
import type { CategoryIconColor } from '../../utils/iconDictionary';
import { getCategoryIconComponent } from '../icons/lucideRegistry';
import { classNames } from '../../utils/classNames';
// Tailwind 500/600 hex pairs for the category palette. Inline styles keep the
// 12%-alpha soft-pastel look independent from the JIT class scanner.
const COLOR_HEX: Record<CategoryIconColor, {
    base: string;
    icon: string;
}> = {
    red: { base: '#ef4444', icon: '#dc2626' },
    orange: { base: '#f97316', icon: '#ea580c' },
    amber: { base: '#f59e0b', icon: '#d97706' },
    yellow: { base: '#eab308', icon: '#ca8a04' },
    lime: { base: '#84cc16', icon: '#65a30d' },
    green: { base: '#22c55e', icon: '#16a34a' },
    emerald: { base: '#10b981', icon: '#059669' },
    teal: { base: '#14b8a6', icon: '#0d9488' },
    cyan: { base: '#06b6d4', icon: '#0891b2' },
    sky: { base: '#0ea5e9', icon: '#0284c7' },
    blue: { base: '#3b82f6', icon: '#2563eb' },
    indigo: { base: '#6366f1', icon: '#4f46e5' },
    violet: { base: '#8b5cf6', icon: '#7c3aed' },
    purple: { base: '#a855f7', icon: '#9333ea' },
    fuchsia: { base: '#d946ef', icon: '#c026d3' },
    pink: { base: '#ec4899', icon: '#db2777' },
    rose: { base: '#f43f5e', icon: '#e11d48' },
    slate: { base: '#64748b', icon: '#475569' }
};
const FALLBACK_COLOR = COLOR_HEX.slate;
export const getCategoryColorHex = (color: string): {
    base: string;
    icon: string;
} => COLOR_HEX[color as CategoryIconColor] || FALLBACK_COLOR;
const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
export type CategoryChipSize = 'lg' | 'md' | 'sm';
const SIZE_STYLES: Record<CategoryChipSize, {
    box: number;
    icon: number;
}> = {
    lg: { box: 40, icon: 22 },
    md: { box: 36, icon: 20 },
    sm: { box: 24, icon: 14 }
};
interface CategoryIconChipProps {
    icon?: string;
    color?: string;
    source?: CategoryIconSource;
    size?: CategoryChipSize;
    /** Dashed neutral placeholder (used while the add-category field is empty). */
    empty?: boolean;
    /** Remounts the pop animation when the icon/color changes. */
    animateKey?: string;
    smartBadgeTitle?: string;
    className?: string;
}
/**
 * Rounded-square category icon chip (Lucide, strokeWidth 1.75), soft pastel
 * background at 12% alpha. Shows a small ✨ badge for smart (fuzzy/AI) picks.
 */
export const CategoryIconChip: React.FC<CategoryIconChipProps> = ({ icon = 'tag', color = 'slate', source, size = 'md', empty = false, animateKey, smartBadgeTitle = 'پیشنهاد هوشمند', className }) => {
    const { box, icon: iconSize } = SIZE_STYLES[size];
    const isSmart = source === 'fuzzy' || source === 'ai';
    if (empty) {
        const EmptyIcon = getCategoryIconComponent('tag');
        return (<span className={classNames('inline-flex shrink-0 items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-slate-400', className)} style={{ width: box, height: box, borderRadius: 12 }} aria-hidden="true">
                <EmptyIcon size={iconSize} strokeWidth={1.75}/>
            </span>);
    }
    const palette = getCategoryColorHex(color);
    const IconComponent = getCategoryIconComponent(icon);
    return (<span key={animateKey} className={classNames('wk-chip-pop relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: box, height: box, borderRadius: 12, backgroundColor: hexToRgba(palette.base, 0.12), color: palette.icon }} aria-hidden="true">
            <IconComponent size={iconSize} strokeWidth={1.75}/>
            {isSmart && (<span title={smartBadgeTitle} className="absolute -top-1.5 -end-1.5 flex items-center justify-center rounded-full bg-white text-[9px] leading-none shadow-sm border border-slate-200" style={{ width: 14, height: 14 }}>
                    ✨
                </span>)}
        </span>);
};
