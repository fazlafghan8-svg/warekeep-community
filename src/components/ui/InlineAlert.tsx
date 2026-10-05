import React from 'react';
import { classNames } from '@/utils/classNames';
type InlineAlertTone = 'info' | 'success' | 'warning' | 'danger';
interface InlineAlertProps extends React.HTMLAttributes<HTMLDivElement> {
    tone?: InlineAlertTone;
    title?: string;
    action?: React.ReactNode;
    icon?: React.ReactNode;
}
const toneIcon: Record<InlineAlertTone, React.ReactNode> = {
    info: (<svg className="h-5 w-5 text-info-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>),
    success: (<svg className="h-5 w-5 text-success-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
    </svg>),
    warning: (<svg className="h-5 w-5 text-warning-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
    </svg>),
    danger: (<svg className="h-5 w-5 text-danger-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z"/>
    </svg>),
};
export const InlineAlert: React.FC<InlineAlertProps> = ({ tone = 'info', title, action, icon, className, children, ...props }) => (<div className={classNames('wk-inline-alert', `wk-inline-alert--${tone}`, className)} {...props}>
    <div className="mt-0.5 shrink-0">{icon || toneIcon[tone]}</div>
    <div className="min-w-0 flex-1">
      {title ? <p className="wk-section-title text-base">{title}</p> : null}
      {children ? <div className={classNames(title && 'mt-1', 'wk-body-text')}>{children}</div> : null}
    </div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </div>);
