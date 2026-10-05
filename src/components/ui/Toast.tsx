import React, { useEffect } from 'react';
import { classNames } from '@/utils/classNames';
export type ToastType = 'success' | 'error' | 'info' | 'warning';
export interface ToastMessage {
    id: string;
    message: string;
    type: ToastType;
}
interface ToastContainerProps {
    toasts: ToastMessage[];
    removeToast: (id: string) => void;
}
export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast }) => {
    return (<div className="pointer-events-none fixed z-[9999] flex w-[min(92vw,392px)] flex-col gap-2.5" style={{
            top: 'calc(var(--wk-titlebar-height) + 16px)',
            insetInlineStart: '16px'
        }}>
      {toasts.map((toast) => (<Toast key={toast.id} {...toast} onClose={() => removeToast(toast.id)}/>))}
    </div>);
};
const Toast: React.FC<ToastMessage & {
    onClose: () => void;
}> = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, type === 'error' || type === 'warning' ? 5000 : 3600);
        return () => clearTimeout(timer);
    }, [onClose, type]);
    const tone = {
        success: {
            bar: 'from-emerald-500 to-teal-400',
            icon: 'wk-status-badge--success'
        },
        error: {
            bar: 'from-rose-500 to-pink-500',
            icon: 'wk-status-badge--danger'
        },
        info: {
            bar: 'from-brand-500 to-cyan-400',
            icon: 'wk-status-badge--info'
        },
        warning: {
            bar: 'from-amber-500 to-orange-400',
            icon: 'wk-status-badge--warning'
        }
    };
    const icons = {
        success: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>),
        error: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>),
        info: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>),
        warning: (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>)
    };
    return (<div role={type === 'error' ? 'alert' : 'status'} className="pointer-events-none overflow-hidden rounded-[var(--wk-radius-4)] border border-white/80 bg-white/96 text-neutral-800 shadow-[0_22px_50px_-28px_rgba(15,23,42,0.42)] backdrop-blur-md">
      <div className={`h-1 w-full bg-gradient-to-r ${tone[type].bar}`}/>
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div className={classNames('wk-status-badge mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border p-0', tone[type].icon)}>
          {icons[type]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="wk-body-text text-sm">{message}</p>
        </div>
        <button onClick={onClose} aria-label="Dismiss toast" className="wk-btn wk-btn-ghost pointer-events-auto inline-flex h-8 min-h-0 w-8 shrink-0 items-center justify-center rounded-xl p-0 text-neutral-400 hover:text-neutral-700">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>);
};
