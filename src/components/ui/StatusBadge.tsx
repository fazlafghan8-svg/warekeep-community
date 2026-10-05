import React from 'react';
import { classNames } from '@/utils/classNames';
export type StatusBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    tone?: StatusBadgeTone;
    dot?: boolean;
}
const hasRenderableContent = (children: React.ReactNode): boolean => {
    if (children === null || children === undefined || children === false)
        return false;
    if (typeof children === 'string')
        return children.trim().length > 0;
    if (typeof children === 'number')
        return true;
    if (Array.isArray(children))
        return children.some((child) => hasRenderableContent(child));
    return true;
};
export const StatusBadge: React.FC<StatusBadgeProps> = ({ tone = 'neutral', dot = false, className, children, ...props }) => {
    if (!hasRenderableContent(children))
        return null;
    return (<span className={classNames('wk-status-badge', `wk-status-badge--${tone}`, className)} {...props}>
      {dot ? <span className="h-2 w-2 rounded-full bg-current opacity-80" aria-hidden="true"/> : null}
      <span>{children}</span>
    </span>);
};
