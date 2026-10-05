import React from 'react';
import { classNames } from '@/utils/classNames';
import { FlatCard, GlassCard } from '@/components/ui/Surface';
type PanelTone = 'flat' | 'glass' | 'danger';
interface SettingsPanelProps {
    title?: string;
    description?: string;
    eyebrow?: string;
    actions?: React.ReactNode;
    tone?: PanelTone;
    className?: string;
    bodyClassName?: string;
    children: React.ReactNode;
}
const panelMap = {
    flat: FlatCard,
    glass: GlassCard,
    danger: FlatCard,
} satisfies Record<PanelTone, React.ComponentType<any>>;
export const SettingsPanel: React.FC<SettingsPanelProps> = ({ title, description, eyebrow, actions, tone = 'flat', className, bodyClassName, children, }) => {
    const Panel = panelMap[tone];
    return (<Panel className={classNames('overflow-hidden', tone === 'danger' && 'border-danger-200 bg-danger-50/50', className)}>
      {(title || description || eyebrow || actions) ? (<div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            {eyebrow ? <p className="wk-meta-text text-slate-500">{eyebrow}</p> : null}
            {title ? <h3 className="wk-section-title mt-1 text-slate-900">{title}</h3> : null}
            {description ? <p className="wk-body-text mt-1 text-slate-600">{description}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>) : null}
      <div className={classNames('p-3.5', bodyClassName)}>{children}</div>
    </Panel>);
};
interface SettingsStatGridProps {
    columns?: string;
    className?: string;
    children: React.ReactNode;
}
export const SettingsStatGrid: React.FC<SettingsStatGridProps> = ({ columns = 'md:grid-cols-2 xl:grid-cols-4', className, children, }) => (<div className={classNames('grid grid-cols-1 gap-2.5', columns, className)}>
    {children}
  </div>);
interface SettingsStatProps {
    label: string;
    value: React.ReactNode;
    hint?: React.ReactNode;
    tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand';
    className?: string;
}
const statToneClass: Record<NonNullable<SettingsStatProps['tone']>, string> = {
    neutral: 'border-slate-200 bg-slate-50 text-slate-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-rose-200 bg-rose-50 text-rose-900',
    brand: 'border-brand-200 bg-brand-50 text-brand-900',
};
export const SettingsStat: React.FC<SettingsStatProps> = ({ label, value, hint, tone = 'neutral', className, }) => (<div className={classNames('rounded-2xl border px-3 py-2.5 shadow-sm', statToneClass[tone], className)}>
    <p className="text-[11px] font-black uppercase tracking-[0.16em] opacity-70">{label}</p>
    <div className="mt-1 text-sm font-black leading-6">{value}</div>
    {hint ? <div className="mt-1 text-[11px] font-semibold opacity-80">{hint}</div> : null}
  </div>);
export const SettingsDangerZone: React.FC<Omit<SettingsPanelProps, 'tone'>> = (props) => (<SettingsPanel tone="danger" {...props}/>);
