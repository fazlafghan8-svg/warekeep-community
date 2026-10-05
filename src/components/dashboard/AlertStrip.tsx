import React from 'react';
import { classNames } from '@/utils/classNames';
type AlertTone = 'info' | 'success' | 'warning' | 'danger';
type AlertStripMode = 'visible' | 'hidden';
interface AlertStripProps {
    mode: AlertStripMode;
    tone: AlertTone;
    title: string;
    assistiveDescription?: string;
    summary: string;
    actionLabel: string;
    onAction: () => void;
    dismissLabel: string;
    onDismiss: () => void;
    restoreLabel: string;
    onRestore: () => void;
}
const toneClass: Record<AlertTone, string> = {
    info: 'border-sky-200/90 bg-[linear-gradient(135deg,rgba(244,250,255,0.98),rgba(255,255,255,0.98))] text-sky-950',
    success: 'border-emerald-200/90 bg-[linear-gradient(135deg,rgba(242,252,247,0.98),rgba(255,255,255,0.98))] text-emerald-950',
    warning: 'border-amber-200/90 bg-[linear-gradient(135deg,rgba(255,250,240,0.98),rgba(255,255,255,0.98))] text-amber-950',
    danger: 'border-rose-200/95 bg-[linear-gradient(135deg,rgba(255,245,246,0.98),rgba(255,255,255,0.98))] text-rose-950',
};
const iconToneClass: Record<AlertTone, string> = {
    info: 'bg-sky-100 text-sky-700',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-rose-100 text-rose-800 ring-1 ring-rose-200/90',
};
const actionToneClass: Record<AlertTone, string> = {
    info: 'border-sky-200/80 text-sky-800 hover:border-sky-300 hover:bg-sky-50',
    success: 'border-emerald-200/80 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-50',
    warning: 'border-amber-200/80 text-amber-800 hover:border-amber-300 hover:bg-amber-50',
    danger: 'border-rose-200/80 text-rose-800 hover:border-rose-300 hover:bg-rose-50',
};
const dismissToneClass: Record<AlertTone, string> = {
    info: 'border-sky-200/80 text-sky-700 hover:border-sky-300 hover:bg-sky-50',
    success: 'border-emerald-200/80 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50',
    warning: 'border-amber-200/80 text-amber-700 hover:border-amber-300 hover:bg-amber-50',
    danger: 'border-rose-200/80 text-rose-700 hover:border-rose-300 hover:bg-rose-50',
};
const AlertIcon = () => (<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M12 8v4" strokeLinecap="round"/>
    <path d="M12 16h.01" strokeLinecap="round"/>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>);
const CloseIcon = () => (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M6 6l12 12" strokeLinecap="round"/>
    <path d="M18 6 6 18" strokeLinecap="round"/>
  </svg>);
export const AlertStrip: React.FC<AlertStripProps> = ({ mode, tone, title, assistiveDescription, summary, actionLabel, onAction, dismissLabel, onDismiss, restoreLabel, onRestore, }) => {
    if (mode === 'hidden') {
        return (<section data-testid="dashboard-operational-alert" data-mode="hidden" className={classNames('flex max-w-max w-fit rounded-[22px] border p-1.5 shadow-[var(--wk-shadow-soft)]', toneClass[tone])}>
        <button type="button" data-testid="dashboard-operational-alert-restore" title={restoreLabel} aria-label={restoreLabel} onClick={onRestore} className={classNames('wk-focus-ring inline-flex h-9 w-9 items-center justify-center rounded-[16px] border bg-white/80 transition', dismissToneClass[tone])}>
          <span className={classNames('flex h-7 w-7 items-center justify-center rounded-[12px]', iconToneClass[tone])}>
            <AlertIcon />
          </span>
        </button>
      </section>);
    }
    return (<section data-testid="dashboard-operational-alert" data-mode="visible" className={classNames('rounded-[24px] border px-4 py-2 md:px-5 md:py-2 shadow-[var(--wk-shadow-soft)]', toneClass[tone])} role={tone === 'danger' ? 'alert' : 'status'} aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className={classNames('flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[14px]', iconToneClass[tone])}>
            <AlertIcon />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[14px] font-extrabold tracking-tight">{title}</h2>
            {assistiveDescription ? <span className="sr-only">{assistiveDescription}</span> : null}
            <p data-testid="dashboard-operational-alert-summary" className="mt-0.5 truncate text-[11px] font-semibold leading-4 text-slate-600">
              {summary}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button type="button" data-testid="dashboard-operational-alert-action" aria-label={actionLabel} onClick={onAction} className={classNames('wk-focus-ring inline-flex min-h-[30px] items-center rounded-[14px] border bg-white/80 px-2.5 text-[11px] font-bold transition', actionToneClass[tone])}>
            {actionLabel}
          </button>

          <button type="button" data-testid="dashboard-operational-alert-dismiss" title={dismissLabel} aria-label={dismissLabel} onClick={onDismiss} className={classNames('wk-focus-ring inline-flex h-[30px] w-[30px] items-center justify-center rounded-[14px] border bg-white/80 transition', dismissToneClass[tone])}>
            <CloseIcon />
          </button>
        </div>
      </div>
    </section>);
};
