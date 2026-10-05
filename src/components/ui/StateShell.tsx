import React from 'react';
import { classNames } from '@/utils/classNames';
interface EmptyStateShellProps extends React.HTMLAttributes<HTMLDivElement> {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
}
export const EmptyStateShell: React.FC<EmptyStateShellProps> = ({ icon, title, description, action, className, ...props }) => (<div className={classNames('wk-empty-state-shell', className)} {...props}>
    {icon ? <div className="mb-3 text-brand-600">{icon}</div> : null}
    <h3 className="wk-section-title">{title}</h3>
    {description ? <p className="wk-body-text mt-1.5 max-w-xl">{description}</p> : null}
    {action ? <div className="mt-4">{action}</div> : null}
  </div>);
interface LoadingSkeletonShellProps extends React.HTMLAttributes<HTMLDivElement> {
    lines?: number;
}
export const LoadingSkeletonShell: React.FC<LoadingSkeletonShellProps> = ({ lines = 4, className, ...props }) => (<div className={classNames('wk-loading-shell', className)} {...props}>
    <div className="space-y-2.5">
      {Array.from({ length: lines }).map((_, index) => (<div key={index} className="wk-skeleton-line" style={{ width: `${Math.max(42, 100 - index * 8)}%` }}/>))}
    </div>
  </div>);
