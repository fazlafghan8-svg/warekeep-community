/**
 * Frontend Logger Service
 * Bridges the gap between React code and the Electron logging system.
 * Works in both Electron (via IPC) and Web (via Console) modes.
 */
import { LogTag } from '../types';
import { appendWebLog, getWebLogSessionId } from './webLogService';
import { createUniqueId } from '../utils/localIds';
// Define the interface based on what we exposed in preload.js
interface ElectronLogger {
    info: (tag: LogTag, msg: string, meta?: any) => Promise<void>;
    warn: (tag: LogTag, msg: string, meta?: any) => Promise<void>;
    error: (tag: LogTag, msg: string, meta?: any) => Promise<void>;
    debug: (tag: LogTag, msg: string, meta?: any) => Promise<void>;
}
let cachedSessionId: string | null = null;
// Initialize Session ID
if (typeof window !== 'undefined' && window.electronAPI) {
    window.electronAPI.getSessionId().then(id => {
        cachedSessionId = id;
        console.log(`[Logger] Initialized with Session ID: ${id}`);
    }).catch(e => console.warn('Failed to get session ID', e));
}
else if (typeof window !== 'undefined') {
    cachedSessionId = getWebLogSessionId();
}
const getLogger = (): ElectronLogger | null => {
    if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.logger) {
        return window.electronAPI.logger;
    }
    return null;
};
// Safe stringify for client-side message formatting
const safeStringify = (obj: any): string => {
    const seen = new WeakSet();
    try {
        return JSON.stringify(obj, (key, value) => {
            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) {
                    return "[Circular]";
                }
                seen.add(value);
            }
            return value;
        });
    }
    catch (e) {
        return "[Unserializable Object]";
    }
};
const formatMessage = (message: any): string => {
    if (typeof message === 'string')
        return message;
    if (message instanceof Error)
        return message.message;
    return safeStringify(message);
};
const formatMeta = (meta: any, error?: any) => {
    const combined = { ...meta };
    // Add IDs
    if (cachedSessionId)
        combined.sessionId = cachedSessionId;
    if (error instanceof Error) {
        combined.stack = error.stack;
        combined.name = error.name;
    }
    // Add URL context
    if (typeof window !== 'undefined') {
        combined.url = window.location.hash || window.location.pathname;
    }
    return combined;
};
const writeWebLog = (level: 'info' | 'warn' | 'error' | 'debug', tag: LogTag, message: string, meta?: any) => {
    appendWebLog(level, tag, message, meta);
};
// Utility to generate a correlation ID for a frontend flow
export const generateCorrelationId = () => {
    return createUniqueId('req');
};
export const Logger = {
    info: (tag: LogTag, message: string, meta?: any) => {
        const logger = getLogger();
        const formattedMessage = formatMessage(message);
        const formattedMeta = formatMeta(meta);
        writeWebLog('info', tag, formattedMessage, formattedMeta);
        if (logger) {
            logger.info(tag, formattedMessage, formattedMeta);
        }
        else {
            console.info(`[${tag}] ${message}`, meta || '');
        }
    },
    warn: (tag: LogTag, message: string, meta?: any) => {
        const logger = getLogger();
        const formattedMessage = formatMessage(message);
        const formattedMeta = formatMeta(meta);
        writeWebLog('warn', tag, formattedMessage, formattedMeta);
        if (logger) {
            logger.warn(tag, formattedMessage, formattedMeta);
        }
        else {
            console.warn(`[${tag}] ${message}`, meta || '');
        }
    },
    error: (tag: LogTag, message: string, error?: any, meta?: any) => {
        const logger = getLogger();
        const formattedMessage = formatMessage(message);
        const formattedMeta = formatMeta(meta, error);
        writeWebLog('error', tag, formattedMessage, formattedMeta);
        if (logger) {
            logger.error(tag, formattedMessage, formattedMeta);
        }
        else {
            console.error(`[${tag}] ${message}`, error || '', meta || '');
        }
    },
    debug: (tag: LogTag, message: string, meta?: any) => {
        // Only log debug in dev mode or if explicitly enabled
        if (import.meta.env.DEV) {
            const logger = getLogger();
            const formattedMessage = formatMessage(message);
            const formattedMeta = formatMeta(meta);
            writeWebLog('debug', tag, formattedMessage, formattedMeta);
            if (logger) {
                logger.debug(tag, formattedMessage, formattedMeta);
            }
            else {
                console.debug(`[${tag}] ${message}`, meta || '');
            }
        }
    }
};
