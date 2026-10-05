type PerfDetail = Record<string, unknown>;
const PERF_STORAGE_KEY = 'warekeep:performance-logs';
const DEFAULT_EVENT_THROTTLE_MS = 30000;
const eventTimestamps = new Map<string, number>();
const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now());
export const isPerformanceLoggingEnabled = () => {
    if (import.meta.env.DEV)
        return true;
    if (typeof window === 'undefined')
        return false;
    try {
        return window.localStorage.getItem(PERF_STORAGE_KEY) === '1';
    }
    catch {
        return false;
    }
};
export const logPerformanceEvent = (name: string, detail: PerfDetail = {}, throttleMs = DEFAULT_EVENT_THROTTLE_MS) => {
    if (!isPerformanceLoggingEnabled())
        return;
    const currentTime = Date.now();
    const previousTime = eventTimestamps.get(name) || 0;
    if (throttleMs > 0 && currentTime - previousTime < throttleMs)
        return;
    eventTimestamps.set(name, currentTime);
    console.info(`[PERF] ${name}`, detail);
};
export const startPerformanceSpan = (name: string, detail: PerfDetail = {}) => {
    const startedAt = now();
    return (completionDetail: PerfDetail = {}) => {
        const durationMs = Math.max(0, now() - startedAt);
        logPerformanceEvent(name, { ...detail, ...completionDetail, durationMs: Number(durationMs.toFixed(1)) }, 0);
        return durationMs;
    };
};
export const logTableRender = (tableName: string, renderCount: number, visibleRows: number) => {
    if (renderCount !== 1 && renderCount % 10 !== 0)
        return;
    logPerformanceEvent(`table-render:${tableName}`, { renderCount, visibleRows }, renderCount === 1 ? 0 : 5000);
};
