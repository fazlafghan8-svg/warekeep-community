import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// Robustly load electron-log with Safe Fallback
let log;
try {
    // Try specific path first (Standard for v5)
    log = require('electron-log/main');
}
catch (e) {
    try {
        // Fallback to root package
        log = require('electron-log');
    }
    catch (e2) {
        console.error("CRITICAL: Could not load electron-log. Switching to console fallback.", e2);
        // Minimal fallback to prevent application crash
        log = {
            initialize: () => { },
            transports: { file: {}, console: {} },
            variables: {},
            hooks: [],
            errorHandler: { startCatching: () => { } },
            info: console.log,
            warn: console.warn,
            error: console.error,
            debug: console.debug,
        };
    }
}
// 1. Initialize internal logger
if (log && log.initialize) {
    try {
        log.initialize();
    }
    catch (e) {
        console.error("Logger init failed", e);
    }
}
// --- CONTEXT MANAGEMENT (AsyncLocalStorage) ---
const logContext = new AsyncLocalStorage();
let globalSessionId = 'unknown-session';
// 2. Configure Log Path
const userDataPath = app.getPath('userData');
const logsDir = path.join(userDataPath, 'logs');
if (!fs.existsSync(logsDir)) {
    try {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    catch (e) {
        console.error("CRITICAL: Failed to create logs directory.", e);
    }
}
// Startup retention sweep: keep the logs directory bounded.
const LOG_RETENTION_DAYS = 14;
try {
    const retentionCutoffMs = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const entryName of fs.readdirSync(logsDir)) {
        if (!/^app-.*\.log$/.test(entryName))
            continue;
        const entryPath = path.join(logsDir, entryName);
        try {
            const stats = fs.statSync(entryPath);
            if (stats.isFile() && stats.mtimeMs < retentionCutoffMs) {
                fs.unlinkSync(entryPath);
            }
        }
        catch (e) {
            // Per-file failures (locked/in-use) must not block startup.
        }
    }
}
catch (e) {
    console.error("Log retention sweep failed.", e);
}
// Check Environment
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
// Ensure log objects exist before accessing properties
if (log && log.transports) {
    // 3. Register Custom Variables
    if (log.variables) {
        Object.defineProperties(log.variables, {
            sessionId: {
                enumerable: true,
                configurable: true,
                get: () => globalSessionId,
            },
            correlationId: {
                enumerable: true,
                configurable: true,
                get: () => {
                    const store = logContext.getStore();
                    return store?.correlationId || 'N/A';
                },
            },
            tag: {
                enumerable: true,
                configurable: true,
                get: () => {
                    const store = logContext.getStore();
                    return store?.tag || 'APP';
                },
            },
            processType: {
                enumerable: true,
                configurable: true,
                get: () => process.type === 'renderer' ? 'RENDERER' : 'MAIN',
            },
        });
    }
    // 4. File Transport Configuration
    if (log.transports.file) {
        log.transports.file.resolvePathFn = () => {
            const date = new Date().toISOString().split('T')[0];
            return path.join(logsDir, `app-${date}.log`);
        };
        log.transports.file.level = isDev ? 'debug' : 'info';
        log.transports.file.maxSize = 10 * 1024 * 1024;
        log.transports.file.sync = false;
        // Non-clobbering rotation: the default .old archive silently overwrites
        // the previous rollover on a second same-day rotation.
        log.transports.file.archiveLogFn = (oldFile) => {
            try {
                const sourcePath = typeof oldFile === 'string'
                    ? oldFile
                    : (oldFile?.path || String(oldFile || ''));
                if (!sourcePath || !fs.existsSync(sourcePath))
                    return;
                const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                const parsed = path.parse(sourcePath);
                fs.renameSync(sourcePath, path.join(parsed.dir, `${parsed.name}.${stamp}.log`));
            }
            catch (e) {
                console.error("Log archive rotation failed.", e);
            }
        };
        log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [{processType}] [{tag}] [SID:{sessionId}] [CID:{correlationId}] {text}';
    }
    // 5. Console Transport
    if (log.transports.console) {
        log.transports.console.level = isDev ? 'debug' : 'info';
        log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] [{processType}] [{tag}] {text}';
    }
    // 6. Hook to inject metadata
    if (log.hooks) {
        log.hooks.push((message, _transport) => {
            const store = logContext.getStore() || {};
            let metaIndex = message.data.findIndex(arg => typeof arg === 'object' && arg !== null && !Array.isArray(arg) && !(arg instanceof Error));
            if (metaIndex === -1) {
                metaIndex = message.data.length;
                message.data.push({});
            }
            const meta = message.data[metaIndex];
            meta.sessionId = globalSessionId;
            meta.correlationId = store.correlationId || meta.correlationId;
            meta.tag = store.tag || meta.tag || 'APP';
            const errorArg = message.data.find(arg => arg instanceof Error);
            if (errorArg) {
                meta.stack = errorArg.stack;
                meta.errorType = errorArg.name;
                meta.errorMessage = errorArg.message;
            }
            return message;
        });
    }
    // 7. Error Handling
    if (log.errorHandler && log.errorHandler.startCatching) {
        log.errorHandler.startCatching({
            showDialog: false,
            onError: ({ createIssue: _createIssue, error, processType: _processType, versions: _versions }) => {
                console.error('CRITICAL LOGGER FAILURE:', error);
                try {
                    fs.appendFileSync(path.join(userDataPath, 'panic.log'), `${new Date().toISOString()} [LOGGER FAIL] ${error?.stack}\n`);
                }
                catch (e) {
                    console.error('FAILED TO WRITE PANIC LOG');
                }
            }
        });
    }
}
// 8. Public API
export const setSessionId = (id) => {
    globalSessionId = id;
};
export const runWithContext = (context, callback) => {
    return logContext.run(context, callback);
};
export default {
    info: (msg, meta) => log && log.info ? log.info(msg, meta || {}) : console.info(msg),
    warn: (msg, meta) => log && log.warn ? log.warn(msg, meta || {}) : console.warn(msg),
    error: (msg, meta) => log && log.error ? log.error(msg, meta || {}) : console.error(msg),
    debug: (msg, meta) => log && log.debug ? log.debug(msg, meta || {}) : console.debug(msg),
    raw: log,
    runWithContext
};
