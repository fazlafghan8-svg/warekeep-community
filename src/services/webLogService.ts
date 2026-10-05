import { LogTag } from '../types';
import { createUniqueId } from '../utils/localIds';
export type WebLogLevel = 'info' | 'warn' | 'error' | 'debug';
export interface WebLogEntry {
    id: string;
    ts: string;
    level: WebLogLevel;
    tag: LogTag;
    message: string;
    meta?: any;
    url: string;
    userAgent: string;
    sessionId: string;
}
const WEB_LOG_STORAGE_KEY = 'warekeep_web_logs_v1';
const WEB_LOG_SESSION_KEY = 'warekeep_web_log_session_id';
const MAX_WEB_LOG_ENTRIES = 3000;
const DUPLICATE_LOG_WINDOW_MS = 15000;
let initialized = false;
const safeParse = (input: string | null): WebLogEntry[] => {
    if (!input)
        return [];
    try {
        const parsed = JSON.parse(input);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
const safeStringify = (value: any): any => {
    if (value === undefined)
        return undefined;
    const seen = new WeakSet();
    try {
        return JSON.parse(JSON.stringify(value, (_key, inner) => {
            if (typeof inner === 'object' && inner !== null) {
                if (seen.has(inner))
                    return '[Circular]';
                seen.add(inner);
            }
            return inner;
        }));
    }
    catch {
        return '[Unserializable]';
    }
};
const isPlainRecord = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const buildComparableMeta = (value: any): string => {
    const comparable = safeStringify(value);
    if (!isPlainRecord(comparable)) {
        return JSON.stringify(comparable);
    }
    const normalized = { ...comparable };
    delete normalized.duplicateCount;
    delete normalized.lastDuplicateTs;
    return JSON.stringify(normalized);
};
const shouldCollapseDuplicateLog = (previous: WebLogEntry | undefined, next: WebLogEntry): boolean => {
    if (!previous)
        return false;
    const previousTs = Date.parse(previous.ts);
    const nextTs = Date.parse(next.ts);
    if (!Number.isFinite(previousTs) || !Number.isFinite(nextTs))
        return false;
    if (nextTs - previousTs > DUPLICATE_LOG_WINDOW_MS)
        return false;
    return (previous.level === next.level &&
        previous.tag === next.tag &&
        previous.message === next.message &&
        previous.url === next.url &&
        previous.sessionId === next.sessionId &&
        buildComparableMeta(previous.meta) === buildComparableMeta(next.meta));
};
const generateId = (): string => {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    }
    catch { }
    return createUniqueId('log');
};
const inWebRuntime = (): boolean => typeof window !== 'undefined' && !window.electronAPI;
export const getWebLogSessionId = (): string => {
    if (!inWebRuntime())
        return 'non-web-runtime';
    const existing = localStorage.getItem(WEB_LOG_SESSION_KEY);
    if (existing)
        return existing;
    const next = generateId();
    localStorage.setItem(WEB_LOG_SESSION_KEY, next);
    return next;
};
export const appendWebLog = (level: WebLogLevel, tag: LogTag, message: string, meta?: any): void => {
    if (!inWebRuntime())
        return;
    try {
        const logs = safeParse(localStorage.getItem(WEB_LOG_STORAGE_KEY));
        const entry: WebLogEntry = {
            id: generateId(),
            ts: new Date().toISOString(),
            level,
            tag,
            message,
            meta: safeStringify(meta),
            url: window.location.href,
            userAgent: navigator.userAgent,
            sessionId: getWebLogSessionId()
        };
        const previous = logs[logs.length - 1];
        if (shouldCollapseDuplicateLog(previous, entry) && previous) {
            const priorMeta = isPlainRecord(previous.meta) ? previous.meta : {};
            logs[logs.length - 1] = {
                ...previous,
                ts: entry.ts,
                meta: {
                    ...priorMeta,
                    duplicateCount: Number(priorMeta.duplicateCount || 1) + 1,
                    lastDuplicateTs: entry.ts
                }
            };
        }
        else {
            logs.push(entry);
        }
        const bounded = logs.length > MAX_WEB_LOG_ENTRIES
            ? logs.slice(logs.length - MAX_WEB_LOG_ENTRIES)
            : logs;
        localStorage.setItem(WEB_LOG_STORAGE_KEY, JSON.stringify(bounded));
    }
    catch {
        // Never throw from logger path.
    }
};
export const readWebLogs = (): WebLogEntry[] => {
    if (!inWebRuntime())
        return [];
    return safeParse(localStorage.getItem(WEB_LOG_STORAGE_KEY));
};
export const clearWebLogs = (): void => {
    if (!inWebRuntime())
        return;
    localStorage.removeItem(WEB_LOG_STORAGE_KEY);
};
export const getWebLogStats = (): {
    count: number;
    lastTs: string | null;
    sessionId: string;
} => {
    const logs = readWebLogs();
    return {
        count: logs.length,
        lastTs: logs.length > 0 ? logs[logs.length - 1].ts : null,
        sessionId: getWebLogSessionId()
    };
};
export const exportWebLogs = (): {
    ok: boolean;
    fileName?: string;
    reason?: string;
} => {
    if (!inWebRuntime()) {
        return { ok: false, reason: 'NOT_WEB_RUNTIME' };
    }
    const logs = readWebLogs();
    if (logs.length === 0) {
        return { ok: false, reason: 'NO_LOGS' };
    }
    let offlineJournal: any[] = [];
    let offlineQueue: any[] = [];
    let deltaQueue: any[] = [];
    try {
        const rawJournal = localStorage.getItem('warekeep_offline_journal');
        const rawQueue = localStorage.getItem('warekeep_offline_queue');
        const rawDelta = localStorage.getItem('delta_sync_queue');
        offlineJournal = rawJournal ? JSON.parse(rawJournal) : [];
        offlineQueue = rawQueue ? JSON.parse(rawQueue) : [];
        deltaQueue = rawDelta ? JSON.parse(rawDelta) : [];
    }
    catch {
        // Ignore parse errors to keep export path reliable.
    }
    const payload = {
        exportedAt: new Date().toISOString(),
        sessionId: getWebLogSessionId(),
        count: logs.length,
        logs,
        diagnostics: {
            offlineJournalCount: Array.isArray(offlineJournal) ? offlineJournal.length : 0,
            offlineQueueCount: Array.isArray(offlineQueue) ? offlineQueue.length : 0,
            deltaQueueCount: Array.isArray(deltaQueue) ? deltaQueue.length : 0
        },
        offlineJournal,
        offlineQueue,
        deltaQueue
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8'
    });
    const fileName = `warekeep-web-logs-${new Date().toISOString().slice(0, 10)}.json`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    return { ok: true, fileName };
};
export const initializeWebLogging = (): void => {
    if (!inWebRuntime() || initialized)
        return;
    initialized = true;
    appendWebLog('info', 'APP', 'Web logging initialized', {
        path: window.location.pathname
    });
    window.addEventListener('online', () => {
        appendWebLog('info', 'SYNC', 'Browser network status changed: online');
    });
    window.addEventListener('offline', () => {
        appendWebLog('warn', 'SYNC', 'Browser network status changed: offline');
    });
    document.addEventListener('visibilitychange', () => {
        appendWebLog('debug', 'UI', 'Visibility changed', {
            state: document.visibilityState
        });
    });
};
