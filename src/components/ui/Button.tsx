import React from 'react';
import { classNames } from '@/utils/classNames';
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
}
const normalizeChildren = (children: React.ReactNode): React.ReactNode => React.Children.toArray(children).map((child, index) => {
    if (typeof child === 'string' || typeof child === 'number') {
        const text = String(child);
        if (!text.trim())
            return child;
        return (<span key={`wk-btn-label-${index}`} className="wk-btn-label">
          {child}
        </span>);
    }
    return child;
});
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ variant = 'secondary', size = 'md', className, type = 'button', children, ...props }, ref) => (<button ref={ref} type={type} className={classNames('wk-btn', `wk-btn-${variant}`, `wk-btn-${size}`, className)} {...props}>
      {normalizeChildren(children)}
    </button>));
Button.displayName = 'Button';
