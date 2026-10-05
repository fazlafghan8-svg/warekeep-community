import React from 'react';
import { classNames } from '@/utils/classNames';
import { NewFeatureBadge } from './NewFeatureBadge';
import { shouldShowNewFeatureMarkers } from './newFeatureVisibility';
interface NewFeatureHintProps extends React.HTMLAttributes<HTMLDivElement> {
    title: string;
}
export const NewFeatureHint: React.FC<NewFeatureHintProps> = ({ title, className, children, ...props }) => {
    if (!shouldShowNewFeatureMarkers())
        return null;
    return (<div className={classNames('rounded-[24px] border border-sky-200 bg-[linear-gradient(135deg,rgba(239,246,255,0.98),rgba(219,234,254,0.9))] px-4 py-3 shadow-[0_14px_34px_-24px_rgba(14,165,233,0.55)]', className)} {...props}>
      <div className="flex flex-wrap items-start gap-3">
        <NewFeatureBadge className="shrink-0 border-slate-900 bg-slate-900 text-white"/>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-sky-950">{title}</p>
          {children ? <div className="mt-1 text-sm font-semibold leading-6 text-sky-900/80">{children}</div> : null}
        </div>
      </div>
    </div>);
};
