import { useEffect, useState } from 'react';
const inferNativeWindowControls = (): boolean => {
    if (typeof window === 'undefined')
        return false;
    if (!window.electronAPI)
        return false;
    if (typeof window.electronAPI.hasNativeWindowControls === 'boolean') {
        return window.electronAPI.hasNativeWindowControls;
    }
    const userAgent = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
    const platform = typeof navigator !== 'undefined' ? ((navigator as any).userAgentData?.platform || navigator.platform || '') : '';
    return /win/i.test(`${platform} ${userAgent}`);
};
export const useNativeWindowControls = (): boolean => {
    const [hasNativeWindowControls, setHasNativeWindowControls] = useState<boolean>(inferNativeWindowControls);
    useEffect(() => {
        let alive = true;
        const resolveNativeState = async () => {
            const resolved = await window.electronAPI?.resolveNativeWindowControls?.();
            if (!alive)
                return;
            if (typeof resolved === 'boolean') {
                setHasNativeWindowControls(resolved);
                return;
            }
            setHasNativeWindowControls(inferNativeWindowControls());
        };
        void resolveNativeState();
        return () => {
            alive = false;
        };
    }, []);
    return hasNativeWindowControls;
};
