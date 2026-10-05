import React from 'react';
import { classNames } from '@/utils/classNames';
interface KpiCardProps {
    label: string;
    value: string;
    hint?: string;
    tone?: 'default' | 'warning' | 'muted';
    onClick?: () => void;
    active?: boolean;
}
export const KpiCard: React.FC<KpiCardProps> = ({ label, value, hint, tone = 'default', onClick, active = false }) => {
    const interactive = Boolean(onClick);
    const Component: React.ElementType = interactive ? 'button' : 'div';
    return (<Component type={interactive ? 'button' : undefined} onClick={onClick} aria-pressed={interactive ? active : undefined} className={classNames('min-w-0 rounded-xl border bg-white px-4 py-3 text-start shadow-sm', active ? 'border-brand-300 ring-1 ring-brand-200' : 'border-neutral-200', interactive && 'cursor-pointer transition motion-reduce:transition-none hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-400/60')}>
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-slate-600">
                {tone === 'warning' ? <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning-500"/> : null}
                <span className="truncate">{label}</span>
            </p>
            <p className={classNames('mt-1.5 truncate text-2xl font-black leading-8 tabular-nums', tone === 'muted' ? 'text-slate-400' : tone === 'warning' ? 'text-warning-700' : 'text-slate-900')}>
                <bdi>{value}</bdi>
            </p>
            {hint ? <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{hint}</p> : null}
        </Component>);
};
