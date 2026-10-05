import React from 'react';
import { classNames } from '@/utils/classNames';
type SurfaceVariant = 'page' | 'flat' | 'glass' | 'section';
interface SurfaceProps extends React.HTMLAttributes<HTMLElement> {
    as?: React.ElementType;
    variant?: SurfaceVariant;
    interactive?: boolean;
}
const surfaceVariantClass: Record<SurfaceVariant, string> = {
    page: 'wk-page-surface',
    flat: 'wk-flat-card',
    glass: 'wk-glass-card',
    section: 'wk-section-shell',
};
export const Surface: React.FC<SurfaceProps> = ({ as: Component = 'div', variant = 'flat', interactive = false, className, children, ...props }) => (<Component className={classNames(surfaceVariantClass[variant], interactive && 'transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--wk-shadow-3)]', className)} {...props}>
    {children}
  </Component>);
export const PageSurface: React.FC<Omit<SurfaceProps, 'variant'>> = (props) => (<Surface variant="page" {...props}/>);
export const FlatCard: React.FC<Omit<SurfaceProps, 'variant'>> = (props) => (<Surface variant="flat" {...props}/>);
export const GlassCard: React.FC<Omit<SurfaceProps, 'variant'>> = (props) => (<Surface variant="glass" {...props}/>);
export const SectionShell: React.FC<Omit<SurfaceProps, 'variant'>> = (props) => (<Surface variant="section" {...props}/>);
