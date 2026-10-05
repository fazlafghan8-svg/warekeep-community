import React from 'react';
import { classNames } from '@/utils/classNames';
import { Button } from './Button';
import { TabStrip } from './TabStrip';
type HeaderAction = {
    label: string;
    onClick?: () => void;
    icon?: React.ReactNode;
    disabled?: boolean;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    className?: string;
};
type HeaderTab = {
    id: string;
    label: string;
    active?: boolean;
    badge?: string | number;
    onClick?: () => void;
};
interface PageHeaderProps {
    title: string;
    subtitle?: string;
    eyebrow?: string;
    breadcrumbs?: React.ReactNode;
    primaryAction?: HeaderAction;
    secondaryActions?: HeaderAction[];
    meta?: React.ReactNode;
    tabs?: HeaderTab[];
    tabsSlot?: React.ReactNode;
    className?: string;
    density?: 'default' | 'compact';
    dataTestId?: string;
}
const hasVisibleText = (value?: string) => Boolean(value?.trim());
const renderAction = (action: HeaderAction, primary = false) => {
    if (!hasVisibleText(action.label))
        return null;
    return (<Button key={action.label} onClick={action.onClick} disabled={action.disabled} variant={action.variant || (primary ? 'primary' : 'secondary')} className={classNames('gap-2 whitespace-nowrap px-3.5', action.className)}>
      {action.icon}
      <span className="wk-btn-label">{action.label}</span>
    </Button>);
};
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, eyebrow, breadcrumbs, primaryAction, secondaryActions = [], meta, tabs = [], tabsSlot, className, density = 'default', dataTestId }) => {
    const renderableSecondaryActions = secondaryActions.filter((action) => hasVisibleText(action.label));
    const hasPrimaryAction = primaryAction ? hasVisibleText(primaryAction.label) : false;
    const hasActionSlot = hasPrimaryAction || renderableSecondaryActions.length > 0;
    return (<header className={classNames('wk-page-surface relative overflow-hidden', density === 'compact' ? 'wk-page-surface--compact p-4 md:p-5' : 'p-5 md:p-6', className)} data-density={density} data-testid={dataTestId}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-200/70 to-transparent"/>
      <div className="pointer-events-none absolute -top-24 right-6 h-36 w-36 rounded-full bg-brand-200/18 blur-3xl"/>
      <div className="pointer-events-none absolute bottom-0 left-8 h-28 w-28 rounded-full bg-emerald-200/10 blur-3xl"/>

      <div className={classNames('relative flex flex-col xl:flex-row xl:items-start xl:justify-between', density === 'compact' ? 'gap-3.5' : 'gap-4')}>
        <div className="min-w-0 flex-1">
          {breadcrumbs ? <div className="mb-2">{breadcrumbs}</div> : null}
          {hasVisibleText(eyebrow) ? (<p className="wk-meta-text inline-flex rounded-full border border-brand-100 bg-brand-50/80 px-3 py-1 text-brand-700">
              {eyebrow}
            </p>) : null}
          <h1 className={classNames('wk-page-title text-slate-950', density === 'compact' ? 'mt-2' : 'mt-3')}>{title}</h1>
          {subtitle ? <p className={classNames('wk-body-text max-w-3xl text-slate-600', density === 'compact' ? 'mt-1.5' : 'mt-2')}>{subtitle}</p> : null}
          {meta ? <div className={classNames(density === 'compact' ? 'mt-3' : 'mt-4')}>{meta}</div> : null}
        </div>

        {hasActionSlot ? (<div className={classNames('relative z-[1] flex shrink-0 flex-wrap items-center gap-2 xl:max-w-[42%] xl:justify-end', density === 'compact' && 'xl:max-w-[36%]')}>
            {renderableSecondaryActions.map((action) => renderAction(action))}
            {hasPrimaryAction && primaryAction ? renderAction(primaryAction, true) : null}
          </div>) : null}
      </div>

      {(tabsSlot || tabs.length > 0) ? (<div className={classNames('relative border-t border-slate-200/80', density === 'compact' ? 'mt-4 pt-3' : 'mt-5 pt-4')}>
          {tabsSlot || (<TabStrip ariaLabel={`${title} tabs`} items={tabs.map((tab) => ({
                    id: tab.id,
                    label: tab.label,
                    active: tab.active,
                    badge: tab.badge,
                    onClick: tab.onClick
                }))}/>)}
        </div>) : null}
    </header>);
};
