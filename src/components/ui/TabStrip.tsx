import React from 'react';
import { classNames } from '@/utils/classNames';
export interface TabStripItem {
    id: string;
    label: React.ReactNode;
    active?: boolean;
    badge?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
}
interface TabStripProps {
    items: TabStripItem[];
    className?: string;
    compact?: boolean;
    stretch?: boolean;
    ariaLabel?: string;
}
export const TabStrip: React.FC<TabStripProps> = ({ items, className, compact = false, stretch = false, ariaLabel }) => (<div role="tablist" aria-label={ariaLabel} className={classNames('wk-tab-list', compact && 'wk-tab-list--compact', stretch && 'wk-tab-list--stretch', className)}>
    {items.map((item) => (<button key={item.id} type="button" role="tab" aria-selected={!!item.active} aria-disabled={item.disabled || undefined} disabled={item.disabled} onClick={item.onClick} data-state={item.active ? 'active' : 'inactive'} className={classNames('wk-focus-ring wk-tab', compact && 'wk-tab--compact', stretch && 'wk-tab--stretch')}>
        <span className="truncate">{item.label}</span>
        {item.badge !== undefined ? (<span className="wk-tab-badge" data-state={item.active ? 'active' : 'inactive'}>
            {item.badge}
          </span>) : null}
      </button>))}
  </div>);
