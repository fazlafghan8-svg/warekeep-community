import React from 'react';
import { classNames } from '@/utils/classNames';
import { shouldShowNewFeatureMarkers } from './newFeatureVisibility';
interface NewFeatureBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    label?: string;
}
export const NewFeatureBadge: React.FC<NewFeatureBadgeProps> = ({ label = 'NEW', className, ...props }) => {
    if (!shouldShowNewFeatureMarkers())
        return null;
    return (<span className={classNames('inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-sky-700', className)} {...props}>
      {label}
    </span>);
};
