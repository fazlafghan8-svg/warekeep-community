import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { classNames } from '@/utils/classNames';
interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    /** Explicit direction for the portaled dialog; omitted = inherit document dir (existing behavior). */
    dir?: 'ltr' | 'rtl';
    maxWidthClassName?: string;
    panelClassName?: string;
    headerClassName?: string;
    bodyClassName?: string;
    footerClassName?: string;
    overlayClassName?: string;
    titleClassName?: string;
    closeButtonClassName?: string;
    closeAriaLabel?: string;
    animateClassName?: string | false;
    lockScroll?: boolean;
    disableClose?: boolean;
    hideCloseButton?: boolean;
}
const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');
const modalStack: string[] = [];
const bringModalToTop = (modalId: string) => {
    const existingIndex = modalStack.indexOf(modalId);
    if (existingIndex >= 0) {
        modalStack.splice(existingIndex, 1);
    }
    modalStack.push(modalId);
};
const removeModalFromStack = (modalId: string) => {
    const existingIndex = modalStack.indexOf(modalId);
    if (existingIndex >= 0) {
        modalStack.splice(existingIndex, 1);
    }
};
const isTopModal = (modalId: string) => modalStack[modalStack.length - 1] === modalId;
const getFocusableElements = (container: HTMLElement | null) => {
    if (!container)
        return [];
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => element.getAttribute('aria-hidden') !== 'true' && element.tabIndex >= 0);
};
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer, dir, maxWidthClassName, panelClassName, headerClassName, bodyClassName, footerClassName, overlayClassName, titleClassName, closeButtonClassName, closeAriaLabel, animateClassName, lockScroll = true, disableClose = false, hideCloseButton = false }) => {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const titleId = useId();
    useEffect(() => {
        if (!isOpen)
            return;
        bringModalToTop(titleId);
        return () => removeModalFromStack(titleId);
    }, [isOpen, titleId]);
    useEffect(() => {
        if (!isOpen)
            return;
        const handleEsc = (event: KeyboardEvent) => {
            if (!isTopModal(titleId))
                return;
            if (event.key === 'Escape' && !disableClose) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => {
            window.removeEventListener('keydown', handleEsc);
        };
    }, [isOpen, onClose, disableClose, titleId]);
    useEffect(() => {
        if (!isOpen || typeof document === 'undefined')
            return;
        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const focusTimer = window.setTimeout(() => {
            const panel = panelRef.current;
            if (!panel)
                return;
            if (document.activeElement instanceof Node && panel.contains(document.activeElement))
                return;
            const firstFocusable = getFocusableElements(panel)[0];
            (firstFocusable || panel).focus({ preventScroll: true });
        }, 0);
        const handleFocusTrap = (event: KeyboardEvent) => {
            if (event.key !== 'Tab')
                return;
            if (!isTopModal(titleId))
                return;
            const panel = panelRef.current;
            if (!panel)
                return;
            const focusable = getFocusableElements(panel);
            if (!focusable.length) {
                event.preventDefault();
                panel.focus({ preventScroll: true });
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const activeInsidePanel = activeElement ? panel.contains(activeElement) : false;
            if (event.shiftKey) {
                if (!activeInsidePanel || activeElement === first) {
                    event.preventDefault();
                    last.focus({ preventScroll: true });
                }
                return;
            }
            if (!activeInsidePanel || activeElement === last) {
                event.preventDefault();
                first.focus({ preventScroll: true });
            }
        };
        document.addEventListener('keydown', handleFocusTrap);
        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', handleFocusTrap);
            if (previouslyFocused && document.contains(previouslyFocused)) {
                previouslyFocused.focus({ preventScroll: true });
            }
        };
    }, [isOpen, titleId]);
    useEffect(() => {
        if (!isOpen || !lockScroll || typeof document === 'undefined')
            return;
        const { body, documentElement } = document;
        const prevBodyOverflow = body.style.overflow;
        const prevBodyOverscroll = body.style.overscrollBehavior;
        const prevHtmlOverflow = documentElement.style.overflow;
        const prevHtmlOverscroll = documentElement.style.overscrollBehavior;
        body.style.overflow = 'hidden';
        body.style.overscrollBehavior = 'none';
        documentElement.style.overflow = 'hidden';
        documentElement.style.overscrollBehavior = 'none';
        return () => {
            body.style.overflow = prevBodyOverflow;
            body.style.overscrollBehavior = prevBodyOverscroll;
            documentElement.style.overflow = prevHtmlOverflow;
            documentElement.style.overscrollBehavior = prevHtmlOverscroll;
        };
    }, [isOpen, lockScroll]);
    if (!isOpen)
        return null;
    if (typeof document === 'undefined')
        return null;
    const overlayClass = overlayClassName ||
        'fixed inset-0 z-[120] flex items-center justify-center bg-[var(--wk-glass-dark-fill)] p-4 backdrop-blur-sm transition-opacity';
    const resolvedAnimateClass = animateClassName === false ? '' : animateClassName || 'animate-bounce-in';
    const panelBaseClass = `relative mx-auto flex w-full min-h-0 max-h-[calc(100dvh-12px)] flex-col ${resolvedAnimateClass} ${maxWidthClassName || 'max-w-4xl'}`;
    const panelClass = panelClassName || 'wk-page-surface overflow-hidden';
    const headerClass = headerClassName || 'flex justify-between items-center px-6 py-4 border-b border-neutral-200 shrink-0 bg-surface-subtle rounded-t-[var(--wk-radius-5)]';
    const bodyClass = bodyClassName || 'min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 custom-scrollbar';
    const footerClass = footerClassName || 'shrink-0 border-t border-neutral-200 bg-surface-canvas p-4';
    const headingClass = titleClassName || 'wk-section-title text-lg';
    const closeClass = closeButtonClassName ||
        'inline-flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white/95 p-0 text-neutral-600 shadow-sm transition hover:border-danger-100 hover:bg-danger-50 hover:text-danger-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-300/40';
    const modalNode = (<div className={overlayClass} dir={dir} onClick={() => {
            if (!disableClose) {
                onClose();
            }
        }}>
      <div className={`${panelBaseClass} ${panelClass}`} ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className={headerClass}>
          <h3 id={titleId} className={headingClass}>{title}</h3>
          {!hideCloseButton ? (<button onClick={onClose} className={classNames(closeClass, 'shrink-0')} type="button" aria-label={closeAriaLabel || `Close ${title}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>) : null}
        </div>

        <div className={bodyClass}>
            {children}
        </div>
        {footer ? (<div className={footerClass}>
            {footer}
          </div>) : null}
      </div>
    </div>);
    return createPortal(modalNode, document.body);
};
