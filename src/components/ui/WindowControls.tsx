import React, { useEffect, useState } from 'react';
import { useNativeWindowControls } from '../../hooks/useNativeWindowControls';
interface WindowControlsProps {
    dark?: boolean;
    className?: string;
}
export const WindowControls: React.FC<WindowControlsProps> = ({ dark = false, className = '' }) => {
    const hasNativeWindowControls = useNativeWindowControls();
    const hasElectronApi = typeof window !== 'undefined' && Boolean(window.electronAPI);
    const [isMaximized, setIsMaximized] = useState(false);
    useEffect(() => {
        if (!hasElectronApi || hasNativeWindowControls) {
            return undefined;
        }
        let alive = true;
        const syncState = async () => {
            const isMax = await window.electronAPI?.isMaximized?.();
            if (alive && typeof isMax === 'boolean') {
                setIsMaximized(isMax);
            }
        };
        const fallbackSync = () => {
            const guessed = window.outerWidth >= window.screen.availWidth && window.outerHeight >= window.screen.availHeight;
            setIsMaximized(guessed);
        };
        void syncState();
        window.addEventListener('resize', fallbackSync);
        const unsubscribe = window.electronAPI?.onWindowStateChange?.((nextState) => {
            if (alive)
                setIsMaximized(!!nextState);
        });
        return () => {
            alive = false;
            window.removeEventListener('resize', fallbackSync);
            try {
                unsubscribe?.();
            }
            catch {
                // no-op
            }
        };
    }, [hasElectronApi, hasNativeWindowControls]);
    if (!hasElectronApi || hasNativeWindowControls)
        return null;
    const toggleMaximize = async () => {
        await window.electronAPI?.maximize?.();
        const isMax = await window.electronAPI?.isMaximized?.();
        if (typeof isMax === 'boolean') {
            setIsMaximized(isMax);
        }
    };
    const iconColor = dark ? 'text-slate-200' : 'text-slate-500';
    const baseSurface = dark ? 'border-white/12 bg-white/[0.05]' : 'border-slate-200 bg-white';
    const hoverTone = dark ? 'hover:bg-white/12 hover:border-white/20' : 'hover:bg-slate-50 hover:border-slate-300 hover:text-slate-700';
    const closeHoverTone = dark ? 'hover:bg-rose-600/95 hover:border-rose-300/50' : 'hover:bg-rose-600 hover:border-rose-500';
    const btnClass = `no-drag h-7 w-7 rounded-[10px] border ${baseSurface} inline-flex items-center justify-center transition-all duration-150 active:scale-[0.97] ${iconColor} ${hoverTone} focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sky-400/70`;
    const closeBtnClass = `no-drag h-7 w-7 rounded-[10px] border ${baseSurface} inline-flex items-center justify-center transition-all duration-150 active:scale-[0.97] ${iconColor} ${closeHoverTone} hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-rose-400/70`;
    return (<div className={`flex h-7 items-center gap-1.5 ${className}`} style={{ WebkitAppRegion: 'no-drag' } as any} dir="ltr">
            <button onClick={() => window.electronAPI?.minimize?.()} className={btnClass} aria-label="Minimize" title="Minimize">
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2.8 8.9h6.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                </svg>
            </button>

            <button onClick={toggleMaximize} className={btnClass} aria-label={isMaximized ? 'Restore Down' : 'Maximize'} title={isMaximized ? 'Restore Down' : 'Maximize'}>
                {isMaximized ? (<svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <rect x="2.8" y="3.6" width="5.6" height="5.6" stroke="currentColor" strokeWidth="1.05"/>
                        <path d="M4.3 2.2h4.9v4.9" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round"/>
                    </svg>) : (<svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <rect x="2.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1.05"/>
                    </svg>)}
            </button>

            <button onClick={() => window.electronAPI?.close?.()} className={closeBtnClass} aria-label="Close" title="Close">
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M3.1 3.1l5.8 5.8" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round"/>
                    <path d="M8.9 3.1l-5.8 5.8" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round"/>
                </svg>
            </button>
        </div>);
};
