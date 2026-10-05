import { app, BrowserWindow, screen, ipcMain, dialog, shell, session } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { parseSafeAttachmentPreview } from './attachmentPolicy.js';
import { COMMUNITY_APP_ID, COMMUNITY_APP_NAME, COMMUNITY_DEV_URL, isCommunityRequestAllowed } from './communityPolicy.js';
import { sanitizeLogMessage, sanitizeLogMeta, sanitizeLogTag } from './sanitizer.js';
import os from 'os';
import { createRequire } from 'module'; // Needed for CommonJS libs in Module
const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_USER_MODEL_ID = COMMUNITY_APP_ID;
// Community has its own local profile; the test override is accepted only in test mode.
const testDataPath = process.env.NODE_ENV === 'test' ? process.env.WAREKEEP_COMMUNITY_TEST_DATA_DIR : '';
const communityDataPath = testDataPath && path.isAbsolute(testDataPath)
    ? testDataPath
    : path.join(app.getPath('appData'), COMMUNITY_APP_NAME);
fs.mkdirSync(communityDataPath, { recursive: true });
app.setName(COMMUNITY_APP_NAME);
app.setPath('userData', communityDataPath);
app.setPath('sessionData', communityDataPath);
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
// The logger resolves its files on import, so identity isolation must come first.
const { default: logger, setSessionId, runWithContext } = await import('./logger.js');
const MAIN_WINDOW_REVEAL_TIMEOUT_MS = 1500;
const DESKTOP_USER_AGENT_PRODUCT = 'WareKeepDesktop';
// --- SESSION ID GENERATION ---
const SESSION_ID = crypto.randomUUID();
setSessionId(SESSION_ID);
// --- SYSTEM SNAPSHOT HELPER ---
const getCrashSnapshot = () => {
    const mem = process.memoryUsage();
    return {
        appVersion: app.getVersion(),
        electronVersion: process.versions.electron,
        os: `${os.type()} ${os.release()} (${os.arch()})`,
        totalMem: Math.round(os.totalmem() / 1024 / 1024) + 'MB',
        freeMem: Math.round(os.freemem() / 1024 / 1024) + 'MB',
        processMemory: {
            rss: Math.round(mem.rss / 1024 / 1024) + 'MB',
            heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB'
        },
        uptime: Math.round(process.uptime()) + 's'
    };
};
// --- GLOBAL ERROR HANDLERS ---
process.on('uncaughtException', (error) => {
    runWithContext({ tag: 'CRASH' }, () => {
        logger.error('CRITICAL: Main Process Uncaught Exception', {
            stack: error.stack,
            message: error.message,
            name: error.name,
            snapshot: getCrashSnapshot()
        });
    });
});
process.on('unhandledRejection', (reason) => {
    runWithContext({ tag: 'CRASH' }, () => {
        logger.error('CRITICAL: Main Process Unhandled Rejection', {
            reason: reason instanceof Error ? reason.stack : reason,
            snapshot: getCrashSnapshot()
        });
    });
});
// --- PERFORMANCE LOGGING ---
const startupTime = Date.now();
// Wrapped in context
runWithContext({ tag: 'APP' }, () => {
    logger.info('App Starting...', { version: app.getVersion(), platform: process.platform });
});
if (process.platform === 'win32') {
    app.setAppUserModelId(APP_USER_MODEL_ID);
}
// --- SECURITY & PERFORMANCE ---
const shouldDisableHardwareAcceleration = process.env.WAREKEEP_DISABLE_HARDWARE_ACCELERATION === '1' ||
    process.argv.includes('--disable-hardware-acceleration') ||
    process.argv.includes('--disable-gpu');
if (shouldDisableHardwareAcceleration) {
    app.disableHardwareAcceleration();
}
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
runWithContext({ tag: 'APP' }, () => {
    logger.info('Hardware acceleration configuration', {
        enabled: !shouldDisableHardwareAcceleration,
        overrideActive: shouldDisableHardwareAcceleration
    });
});
const userDataPath = app.getPath('userData');
const backupDir = path.join(userDataPath, 'backups');
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}
const getDesktopUserAgent = () => {
    const version = String(app.getVersion() || '0.0.0').replace(/[^\x20-\x7e]/g, '').trim() || '0.0.0';
    const platform = String(process.platform || 'desktop').replace(/[^A-Za-z0-9._-]/g, '');
    const arch = String(process.arch || 'unknown').replace(/[^A-Za-z0-9._-]/g, '');
    return `${DESKTOP_USER_AGENT_PRODUCT}/${version} (${platform}; ${arch})`;
};
const applyDesktopUserAgent = () => {
    const safeUserAgent = getDesktopUserAgent();
    try {
        app.userAgentFallback = safeUserAgent;
    }
    catch {
        // Older Electron builds may expose this as read-only; the session override below is enough.
    }
    try {
        session.defaultSession.setUserAgent(safeUserAgent);
        runWithContext({ tag: 'APP' }, () => {
            logger.info('Applied desktop user agent for Electron session', {
                userAgent: safeUserAgent
            });
        });
    }
    catch (error) {
        runWithContext({ tag: 'APP' }, () => {
            logger.warn('Failed to apply desktop user agent for Electron session', {
                error: error?.message || String(error)
            });
        });
    }
};
// --- OPTION A: ROBUST MUTEX & ATOMIC WRITE SYSTEM ---
/**
 * MutexQueue ensures that operations on a specific key (file path)
 * are executed sequentially (serialized), preventing race conditions.
 */
class MutexQueue {
    constructor() {
        this.locks = new Map();
    }
    /**
     * Enqueues a task for a specific key.
     * @param {string} key - Usually the file path.
     * @param {function} task - Async function to execute.
     */
    enqueue(key, task) {
        // Get the current promise chain for this key, or start a new one
        const previousTask = this.locks.get(key) || Promise.resolve();
        // Chain the new task
        const currentTask = previousTask.then(async () => {
            try {
                return await task();
            }
            catch (err) {
                runWithContext({ tag: 'STORAGE' }, () => {
                    logger.error(`Mutex Queue Error [${path.basename(key)}]`, { error: err.message });
                });
                throw err;
            }
        }).finally(() => {
            // Memory Management: If this task is the last one in the chain, remove the key
            if (this.locks.get(key) === currentTask) {
                this.locks.delete(key);
            }
        });
        this.locks.set(key, currentTask);
        return currentTask;
    }
    getPendingPromises() {
        return Array.from(this.locks.values());
    }
    async drain(timeoutMs = 15000) {
        const start = Date.now();
        while (this.locks.size > 0) {
            const pending = this.getPendingPromises();
            if (pending.length === 0)
                break;
            const remaining = timeoutMs - (Date.now() - start);
            if (remaining <= 0) {
                runWithContext({ tag: 'STORAGE' }, () => {
                    logger.warn('Timed out draining pending file writes before quit', { pendingCount: pending.length });
                });
                break;
            }
            await Promise.race([
                Promise.allSettled(pending),
                new Promise(resolve => setTimeout(resolve, remaining)),
            ]);
        }
    }
}
const fileMutex = new MutexQueue();
const DATA_PATCH_KEYS = new Set([
    'medicines',
    'customers',
    'invoices',
    'expenses',
    'settings',
    'suppliers',
    'purchases',
    'partners',
    'auditEvents',
    'stockMovements'
]);
const recentDataMutationIds = new Map();
const MAX_RECENT_DATA_MUTATIONS = 500;
const rememberDataMutation = (mutationId) => {
    if (!mutationId)
        return;
    recentDataMutationIds.set(mutationId, Date.now());
    if (recentDataMutationIds.size <= MAX_RECENT_DATA_MUTATIONS)
        return;
    const oldest = Array.from(recentDataMutationIds.entries())
        .sort((left, right) => left[1] - right[1])
        .slice(0, recentDataMutationIds.size - MAX_RECENT_DATA_MUTATIONS);
    oldest.forEach(([id]) => recentDataMutationIds.delete(id));
};
/**
 * Performs a safe atomic write using temp file + rename + fsync.
 * Ensures data durability against power loss.
 */
const writeAtomic = async (filePath, content) => {
    const start = performance.now();
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const name = path.basename(filePath, ext);
    const tempPath = path.join(dir, `.${name}.${crypto.randomUUID()}.tmp`);
    let fileHandle = null;
    try {
        // 1. Open temp file for writing
        fileHandle = await fs.promises.open(tempPath, 'w');
        // 2. Write data
        if (Buffer.isBuffer(content)) {
            await fileHandle.writeFile(content);
        }
        else {
            await fileHandle.writeFile(content, 'utf-8');
        }
        // 3. Sync to physical disk (Critical for durability)
        await fileHandle.sync();
        // 4. Close handle
        await fileHandle.close();
        fileHandle = null;
        // 5. Atomic Rename
        await fs.promises.rename(tempPath, filePath);
    }
    catch (error) {
        // Cleanup temp file on failure
        if (fileHandle)
            await fileHandle.close();
        try {
            await fs.promises.unlink(tempPath);
        }
        catch (cleanupError) {
            // Best-effort cleanup; keep the original write error.
        }
        throw error;
    }
    finally {
        const duration = performance.now() - start;
        if (duration > 1000) {
            runWithContext({ tag: 'PERFORMANCE' }, () => {
                logger.warn(`SLOW DISK WRITE: ${path.basename(filePath)}`, { duration: Math.round(duration) });
            });
        }
    }
};
const isValidId = (id) => /^[a-zA-Z0-9_-]+$/.test(id);
const ALLOWED_LOG_FILES = { 'JOURNAL': 'offline_journal.json', 'OPS': 'pending_operations.log' };
const getLogPath = (logKey) => {
    const filename = ALLOWED_LOG_FILES[logKey];
    if (!filename)
        throw new Error("Unauthorized log file access");
    return path.join(userDataPath, filename);
};
const sanitizeFilename = (name) => {
    if (!name || typeof name !== 'string')
        return `generated-${Date.now()}.txt`;
    return path.basename(name);
};
const ATTACHMENT_PREVIEW_DIR = path.join(userDataPath, 'attachment-previews');
const openAttachmentDataUrl = async (payload) => {
    const { buffer, stem, extension } = parseSafeAttachmentPreview(payload);
    await fs.promises.mkdir(ATTACHMENT_PREVIEW_DIR, { recursive: true });
    const filePath = path.join(ATTACHMENT_PREVIEW_DIR, `${stem}-${Date.now()}-${crypto.randomUUID()}${extension}`);
    await fileMutex.enqueue(filePath, () => writeAtomic(filePath, buffer));
    const openError = await shell.openPath(filePath);
    if (openError) {
        throw new Error(openError || 'ATTACHMENT_OPEN_FAILED');
    }
    return {
        success: true,
        filePath,
    };
};
// --- IPC WRAPPER FOR CORRELATION ID & PERFORMANCE ---
const isDevRuntime = process.env.NODE_ENV === 'development' || !app.isPackaged;
// Local operations that legitimately take long (dialogs, PDF rendering)
// get higher slow-IPC thresholds than the 500ms default.
const SLOW_IPC_DEFAULT_THRESHOLD_MS = 500;
const SLOW_IPC_THRESHOLDS_MS = {
    'save-invoice-html': 5000,
    'generate-report-pdf': 15000,
    'export-logs': 10000,
    'backup-data': 10000,
};
const SLOW_IPC_LOG_WINDOW_MS = 60000;
const slowIpcLogState = new Map();
// First over-threshold call per channel per window warns immediately; repeats
// accumulate and flush as one aggregated warn when the next window opens.
const reportSlowIpc = (channel, durationMs) => {
    const now = Date.now();
    const state = slowIpcLogState.get(channel);
    if (!state || now - state.windowStartAt >= SLOW_IPC_LOG_WINDOW_MS) {
        if (state && state.count > 0) {
            logger.warn(`SLOW IPC: ${channel}`, {
                occurrences: state.count,
                maxMs: Math.round(state.maxMs),
            });
        }
        slowIpcLogState.set(channel, { count: 0, maxMs: 0, windowStartAt: now });
        logger.warn(`SLOW IPC: ${channel}`, { duration: Math.round(durationMs) });
        return;
    }
    state.count += 1;
    state.maxMs = Math.max(state.maxMs, durationMs);
};
// Wraps every handler to ensure it runs within a logger context and measures time
const safeHandle = (channel, handler, tag = 'IPC') => {
    ipcMain.handle(channel, async (event, ...args) => {
        // Generate a unique ID for this specific IPC call
        const correlationId = crypto.randomUUID();
        return runWithContext({ correlationId, tag }, async () => {
            const start = performance.now();
            try {
                return await handler(event, ...args);
            }
            catch (err) {
                logger.error(`IPC Handler Failed: ${channel}`, { error: err.message, stack: err.stack });
                throw err;
            }
            finally {
                const duration = performance.now() - start;
                if (isDevRuntime && (channel === 'save-data' || channel === 'save-data-patch' || channel === 'load-data')) {
                    logger.info(`[PERF] ${channel}`, { durationMs: Math.round(duration) });
                }
                const slowThresholdMs = SLOW_IPC_THRESHOLDS_MS[channel] ?? SLOW_IPC_DEFAULT_THRESHOLD_MS;
                if (duration > slowThresholdMs) {
                    reportSlowIpc(channel, duration);
                }
            }
        });
    });
};
let mainWindow = null;
const focusMainWindowSafely = () => {
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    try {
        if (mainWindow.isMinimized())
            mainWindow.restore();
        if (!mainWindow.isDestroyed()) {
            mainWindow.focus();
        }
    }
    catch (error) {
        runWithContext({ tag: 'APP' }, () => {
            logger.warn('Skipped focusing a destroyed main window.', {
                message: error instanceof Error ? error.message : String(error || 'Unknown error')
            });
        });
    }
};
const applyCommunitySessionPolicy = (targetSession) => {
    targetSession.webRequest.onBeforeRequest((details, callback) => {
        callback({ cancel: !isCommunityRequestAllowed(details.url, !app.isPackaged) });
    });
    targetSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
};
app.on('session-created', applyCommunitySessionPolicy);
app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
        if (!isCommunityRequestAllowed(url, !app.isPackaged))
            event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url }) => ({
        action: isCommunityRequestAllowed(url, !app.isPackaged) ? 'allow' : 'deny',
    }));
});
app.whenReady().then(() => applyCommunitySessionPolicy(session.defaultSession));
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}
else {
    app.on('second-instance', () => focusMainWindowSafely());
    app.whenReady().then(() => {
        applyDesktopUserAgent();
        createWindow();
        const duration = Date.now() - startupTime;
        runWithContext({ tag: 'PERFORMANCE' }, () => {
            logger.info('App Ready', { startupDurationMs: duration });
        });
    });
}
function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const isDev = !app.isPackaged;
    const useNativeWindowControls = process.platform === 'win32';
    const TITLEBAR_HEIGHT = 36;
    const TITLEBAR_THEMES = {
        boot: {
            backgroundColor: '#1a1a1a',
            overlayColor: '#00000000',
            symbolColor: '#e2e8f0'
        },
        auth: {
            backgroundColor: '#eaf2fb',
            overlayColor: '#00000000',
            symbolColor: '#0f172a'
        },
        access: {
            backgroundColor: '#1e3a8a',
            overlayColor: '#00000000',
            symbolColor: '#e6efff'
        },
        app: {
            backgroundColor: '#020617',
            overlayColor: '#00000000',
            symbolColor: '#334155'
        }
    };
    let currentTitlebarTheme = 'boot';
    const initialTheme = TITLEBAR_THEMES[currentTitlebarTheme] || TITLEBAR_THEMES.boot;
    mainWindow = new BrowserWindow({
        width, height,
        minWidth: 900, minHeight: 620,
        show: false,
        backgroundColor: initialTheme.backgroundColor,
        frame: useNativeWindowControls,
        titleBarStyle: 'hidden',
        titleBarOverlay: useNativeWindowControls
            ? {
                color: initialTheme.overlayColor,
                symbolColor: initialTheme.symbolColor,
                height: TITLEBAR_HEIGHT
            }
            : false,
        minimizable: true,
        maximizable: true,
        resizable: true,
        title: COMMUNITY_APP_NAME,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            preload: path.join(__dirname, 'preload.cjs'),
            devTools: isDev,
            zoomFactor: 1.0
        },
        autoHideMenuBar: true,
    });
    try {
        mainWindow.webContents.setUserAgent(getDesktopUserAgent());
    }
    catch (error) {
        runWithContext({ tag: 'APP' }, () => {
            logger.warn('Failed to apply desktop user agent on main webContents', {
                error: error?.message || String(error)
            });
        });
    }
    const loadMainWindowTarget = () => {
        if (!mainWindow || mainWindow.isDestroyed())
            return;
        if (isDev) {
            mainWindow.loadURL(COMMUNITY_DEV_URL);
        }
        else {
            mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
        }
    };
    loadMainWindowTarget();
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }
    let hasRevealedMainWindow = false;
    let revealWindowFallbackTimer = null;
    const revealMainWindow = (reason) => {
        if (!mainWindow || mainWindow.isDestroyed() || hasRevealedMainWindow)
            return;
        hasRevealedMainWindow = true;
        if (revealWindowFallbackTimer) {
            clearTimeout(revealWindowFallbackTimer);
            revealWindowFallbackTimer = null;
        }
        mainWindow.show();
        mainWindow.focus();
        if (reason === 'dom-ready') {
            // Normal pre-paint reveal path; not a fallback.
            runWithContext({ tag: 'UI' }, () => {
                logger.info('Main window revealed on dom-ready', { reason });
            });
        }
        else if (reason !== 'ready-to-show') {
            runWithContext({ tag: 'UI' }, () => {
                logger.warn('Main window revealed via fallback path', { reason });
            });
        }
    };
    mainWindow.once('ready-to-show', () => {
        revealMainWindow('ready-to-show');
    });
    mainWindow.webContents.once('dom-ready', () => {
        revealMainWindow('dom-ready');
    });
    revealWindowFallbackTimer = setTimeout(() => {
        revealMainWindow('show-timeout');
    }, MAIN_WINDOW_REVEAL_TIMEOUT_MS);
    mainWindow.once('closed', () => {
        if (revealWindowFallbackTimer) {
            clearTimeout(revealWindowFallbackTimer);
            revealWindowFallbackTimer = null;
        }
    });
    const applyTitlebarTheme = (themeName) => {
        if (!mainWindow || mainWindow.isDestroyed() || !useNativeWindowControls)
            return false;
        const nextTheme = TITLEBAR_THEMES[themeName] || TITLEBAR_THEMES.app;
        try {
            mainWindow.setBackgroundColor(nextTheme.backgroundColor);
            mainWindow.setTitleBarOverlay({
                color: nextTheme.overlayColor,
                symbolColor: nextTheme.symbolColor,
                height: TITLEBAR_HEIGHT
            });
            currentTitlebarTheme = Object.prototype.hasOwnProperty.call(TITLEBAR_THEMES, themeName) ? themeName : 'app';
            return true;
        }
        catch (error) {
            runWithContext({ tag: 'UI' }, () => {
                logger.warn('Failed to apply titlebar overlay theme', {
                    themeName,
                    error: error?.message || String(error)
                });
            });
            return false;
        }
    };
    const emitWindowState = () => {
        if (!mainWindow || mainWindow.isDestroyed())
            return;
        mainWindow.webContents.send('window-maximized-state', mainWindow.isMaximized());
    };
    mainWindow.on('maximize', emitWindowState);
    mainWindow.on('unmaximize', emitWindowState);
    mainWindow.on('enter-full-screen', emitWindowState);
    mainWindow.on('leave-full-screen', emitWindowState);
    let rendererCrashReloadAttempts = 0;
    const reloadMainWindowAfterRendererCrash = () => {
        if (!mainWindow || mainWindow.isDestroyed())
            return;
        if (rendererCrashReloadAttempts >= 2) {
            revealMainWindow('renderer-crash');
            return;
        }
        rendererCrashReloadAttempts += 1;
        setTimeout(() => {
            if (!mainWindow || mainWindow.isDestroyed())
                return;
            loadMainWindowTarget();
            revealMainWindow('renderer-crash-reload');
        }, 500);
    };
    let mainFrameLoadRetryAttempts = 0;
    const MAX_MAIN_FRAME_LOAD_RETRIES = 3;
    mainWindow.webContents.on('did-finish-load', () => {
        rendererCrashReloadAttempts = 0;
        mainFrameLoadRetryAttempts = 0;
        emitWindowState();
    });
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        // Subframe teardown aborts (ERR_ABORTED on about:srcdoc iframes) are benign.
        if (!isMainFrame || errorCode === -3) {
            runWithContext({ tag: 'UI' }, () => {
                logger.debug('Ignored benign frame load abort', {
                    errorCode,
                    errorDescription,
                    validatedURL,
                    isMainFrame
                });
            });
            return;
        }
        if (mainFrameLoadRetryAttempts < MAX_MAIN_FRAME_LOAD_RETRIES) {
            mainFrameLoadRetryAttempts += 1;
            runWithContext({ tag: 'CRASH' }, () => {
                logger.warn('Main window failed to load content; retrying', {
                    errorCode,
                    errorDescription,
                    validatedURL,
                    attempt: mainFrameLoadRetryAttempts,
                    maxAttempts: MAX_MAIN_FRAME_LOAD_RETRIES
                });
            });
            setTimeout(() => {
                loadMainWindowTarget();
            }, 1000);
            return;
        }
        runWithContext({ tag: 'CRASH' }, () => {
            logger.error('Main window failed to load content after retries', {
                errorCode,
                errorDescription,
                validatedURL,
                attempts: mainFrameLoadRetryAttempts
            });
        });
        revealMainWindow('did-fail-load');
    });
    mainWindow.webContents.on('render-process-gone', (event, details) => {
        let currentUrl = null;
        try {
            currentUrl = mainWindow?.webContents?.getURL?.() || null;
        }
        catch {
            currentUrl = null;
        }
        runWithContext({ tag: 'CRASH' }, () => {
            logger.error('Renderer Process Gone', {
                reason: details.reason,
                exitCode: details.exitCode,
                ...(details.serviceName ? { serviceName: details.serviceName } : {}),
                url: currentUrl,
                snapshot: getCrashSnapshot()
            });
        });
        if (details.reason !== 'clean-exit' && details.reason !== 'killed') {
            reloadMainWindowAfterRendererCrash();
        }
    });
    // --- SECURE IPC HANDLERS ---
    // 0. Session Info
    ipcMain.handle('get-session-id', () => SESSION_ID);
    // 1. Logger Bridge (Supports explicit correlationId from Renderer)
    ipcMain.handle('log-message', async (event, level, tag, message, meta) => {
        const validLevels = ['info', 'warn', 'error', 'debug'];
        if (!validLevels.includes(level))
            return;
        // --- POLICY ENFORCEMENT ---
        // In Production: Allow info/warn/error. Disable debug.
        const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
        if (level === 'debug' && !isDev) {
            return; // Silently drop debug logs in production to save processing
        }
        // --- SANITIZATION STEP ---
        const safeTag = sanitizeLogTag(tag);
        const safeMessage = sanitizeLogMessage(message);
        const safeMeta = sanitizeLogMeta(meta);
        // AUTO-ATTACH SNAPSHOT FOR CRASHES
        if (safeTag === 'CRASH') {
            safeMeta.snapshot = getCrashSnapshot();
        }
        // Use the Renderer's correlation ID if provided, otherwise generate one for this log entry
        const correlationId = safeMeta.correlationId || crypto.randomUUID();
        const context = { correlationId, tag: safeTag };
        runWithContext(context, () => {
            logger[level](safeMessage, { ...safeMeta, source: 'Renderer' });
        });
    });
    safeHandle('force-focus', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.focus();
        }
    }, 'UI');
    safeHandle('window-minimize', () => mainWindow?.minimize(), 'UI');
    safeHandle('window-maximize', () => {
        if (!mainWindow)
            return;
        mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    }, 'UI');
    safeHandle('window-is-maximized', () => {
        if (!mainWindow)
            return false;
        return mainWindow.isMaximized() || mainWindow.isFullScreen();
    }, 'UI');
    safeHandle('window-has-native-controls', () => {
        return useNativeWindowControls;
    }, 'UI');
    safeHandle('window-set-titlebar-overlay-theme', (_event, themeName) => {
        if (!useNativeWindowControls)
            return false;
        return applyTitlebarTheme(typeof themeName === 'string' ? themeName : currentTitlebarTheme);
    }, 'UI');
    safeHandle('window-close', () => app.quit(), 'UI');
    safeHandle('open-attachment-data-url', async (_event, payload) => {
        return await openAttachmentDataUrl(payload);
    }, 'UI');
    safeHandle('get-app-version', async () => {
        return app.getVersion();
    }, 'APP');
    safeHandle('get-platform-info', async () => {
        return {
            platform: process.platform === 'win32' ? 'desktop-win' : `desktop-${process.platform}`,
            arch: process.arch,
            isPackaged: app.isPackaged
        };
    }, 'APP');
    // 1. SAFE SAVE DATA (With Mutex & Atomic Write)
    safeHandle('save-data', async (event, data, userId) => {
        logger.info('Save Data Requested', { userId });
        const safeId = (!userId || userId === 'guest') ? 'guest' : userId;
        if (!isValidId(safeId))
            throw new Error("Invalid User ID format");
        const filename = `local-db-${safeId}.json`;
        const filePath = path.join(userDataPath, filename);
        const prevPath = path.join(userDataPath, `local-db-${safeId}.prev.json`);
        const jsonStr = JSON.stringify(data, null, 2);
        // Enqueue in Mutex to prevent race conditions
        await fileMutex.enqueue(filePath, async () => {
            // Keep a previous known-good copy for crash/corruption recovery
            try {
                if (fs.existsSync(filePath)) {
                    await fs.promises.copyFile(filePath, prevPath);
                }
            }
            catch (e) {
                logger.warn('Failed to create prev backup before save', { userId: safeId, error: e?.message });
            }
            await writeAtomic(filePath, jsonStr);
            // Verify write can be read + parsed (guards against corruption)
            try {
                const verifyRaw = await fs.promises.readFile(filePath, 'utf-8');
                JSON.parse(verifyRaw);
            }
            catch (e) {
                logger.error('Write verification failed; attempting recovery from prev', { userId: safeId, error: e?.message });
                try {
                    if (fs.existsSync(prevPath)) {
                        const prevRaw = await fs.promises.readFile(prevPath, 'utf-8');
                        JSON.parse(prevRaw); // Ensure prev is valid before restore
                        await writeAtomic(filePath, prevRaw);
                    }
                }
                catch (restoreErr) {
                    logger.error('Recovery from prev failed', { userId: safeId, error: restoreErr?.message });
                }
                throw new Error("WRITE_VERIFY_FAILED");
            }
        });
        return { success: true };
    }, 'STORAGE');
    // Incremental renderer-to-main persistence. The file on disk intentionally
    // remains the same full JSON snapshot so every previous release can read it.
    safeHandle('save-data-patch', async (event, patchEnvelope, userId) => {
        const safeId = (!userId || userId === 'guest') ? 'guest' : userId;
        if (!isValidId(safeId))
            throw new Error('Invalid User ID format');
        if (!patchEnvelope || typeof patchEnvelope !== 'object' || !patchEnvelope.slices || typeof patchEnvelope.slices !== 'object') {
            throw new Error('INVALID_DATA_PATCH');
        }
        const mutationId = typeof patchEnvelope.mutationId === 'string' ? patchEnvelope.mutationId : '';
        const filename = `local-db-${safeId}.json`;
        const filePath = path.join(userDataPath, filename);
        const prevPath = path.join(userDataPath, `local-db-${safeId}.prev.json`);
        let deduplicated = false;
        await fileMutex.enqueue(filePath, async () => {
            if (mutationId && recentDataMutationIds.has(mutationId)) {
                deduplicated = true;
                return;
            }
            let currentData = null;
            try {
                if (fs.existsSync(filePath)) {
                    currentData = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));
                }
                else if (fs.existsSync(prevPath)) {
                    currentData = JSON.parse(await fs.promises.readFile(prevPath, 'utf-8'));
                }
            }
            catch (error) {
                logger.warn('Patch base is unreadable; full-save fallback is required', {
                    userId: safeId,
                    error: error?.message
                });
            }
            if (!currentData || typeof currentData !== 'object' || Array.isArray(currentData)) {
                throw new Error('PATCH_BASE_MISSING');
            }
            const nextData = { ...currentData };
            Object.entries(patchEnvelope.slices).forEach(([key, value]) => {
                if (DATA_PATCH_KEYS.has(key))
                    nextData[key] = value;
            });
            if (Number.isFinite(patchEnvelope.version))
                nextData.version = patchEnvelope.version;
            if (typeof patchEnvelope.updatedAt === 'string' && patchEnvelope.updatedAt)
                nextData.updatedAt = patchEnvelope.updatedAt;
            const jsonStr = JSON.stringify(nextData, null, 2);
            try {
                if (fs.existsSync(filePath))
                    await fs.promises.copyFile(filePath, prevPath);
            }
            catch (error) {
                logger.warn('Failed to create prev backup before patch save', { userId: safeId, error: error?.message });
            }
            await writeAtomic(filePath, jsonStr);
            const verifyRaw = await fs.promises.readFile(filePath, 'utf-8');
            JSON.parse(verifyRaw);
            rememberDataMutation(mutationId);
        });
        return { success: true, deduplicated };
    }, 'STORAGE');
    // 2. LOAD DATA (Read via Mutex to ensure we don't read partial writes)
    safeHandle('load-data', async (event, userId) => {
        const safeId = (!userId || userId === 'guest') ? 'guest' : userId;
        if (!isValidId(safeId))
            throw new Error("Invalid User ID format");
        const filePath = path.join(userDataPath, `local-db-${safeId}.json`);
        const prevPath = path.join(userDataPath, `local-db-${safeId}.prev.json`);
        return await fileMutex.enqueue(filePath, async () => {
            if (fs.existsSync(filePath)) {
                const raw = await fs.promises.readFile(filePath, 'utf-8');
                try {
                    return { success: true, data: JSON.parse(raw) };
                }
                catch (e) {
                    logger.error('Local DB file corrupted; attempting recovery from prev', { userId: safeId, error: e?.message });
                    try {
                        if (fs.existsSync(prevPath)) {
                            const prevRaw = await fs.promises.readFile(prevPath, 'utf-8');
                            const recovered = JSON.parse(prevRaw);
                            // Restore main file so future loads succeed
                            await writeAtomic(filePath, prevRaw);
                            return { success: true, data: recovered, recoveredFrom: 'prev' };
                        }
                    }
                    catch (restoreErr) {
                        logger.error('Prev recovery failed', { userId: safeId, error: restoreErr?.message });
                    }
                    return { success: false, data: null, error: 'CORRUPT_LOCAL_DATA' };
                }
            }
            return { success: true, data: null };
        });
    }, 'STORAGE');
    // 3. SAFE LOGGING (App Audit Logs)
    safeHandle('append-log', async (event, logType, content) => {
        const logPath = getLogPath(logType);
        const safeContent = typeof content === 'string' ? content : JSON.stringify(content);
        await fileMutex.enqueue(logPath, async () => {
            await fs.promises.appendFile(logPath, safeContent, 'utf-8');
        });
        return { success: true };
    }, 'STORAGE');
    safeHandle('read-log', async (event, logType) => {
        const logPath = getLogPath(logType);
        return await fileMutex.enqueue(logPath, async () => {
            if (fs.existsSync(logPath)) {
                const content = await fs.promises.readFile(logPath, 'utf-8');
                return { success: true, content };
            }
            return { success: true, content: '' };
        });
    }, 'STORAGE');
    safeHandle('archive-log', async (event, logType) => {
        const logPath = getLogPath(logType);
        return await fileMutex.enqueue(logPath, async () => {
            if (fs.existsSync(logPath)) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const safeBasename = path.basename(ALLOWED_LOG_FILES[logType]);
                const archiveDir = path.join(userDataPath, 'logs_archive');
                const archivePath = path.join(archiveDir, `${safeBasename}.${timestamp}.bak`);
                if (!fs.existsSync(archiveDir))
                    await fs.promises.mkdir(archiveDir);
                await fs.promises.rename(logPath, archivePath);
            }
            return { success: true };
        });
    }, 'STORAGE');
    // 4. BACKUP
    safeHandle('backup-data', async (event, data) => {
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `auto-backup-${timestamp}.json`);
        const backupEnvelope = {
            metadata: {
                app: 'WareKeep',
                kind: 'local-data-backup',
                createdAt: now.toISOString(),
                schemaVersion: 1
            },
            data
        };
        const jsonStr = JSON.stringify(backupEnvelope, null, 2);
        await fileMutex.enqueue(backupPath, async () => {
            await writeAtomic(backupPath, jsonStr);
        });
        return { success: true, path: backupPath };
    }, 'STORAGE');
    // 5. FILE SELECTION
    safeHandle('select-folder', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: 'Select Folder',
            properties: ['openDirectory']
        });
        if (canceled || filePaths.length === 0)
            return null;
        return filePaths[0];
    }, 'UI');
    // 6. EXPORT LOGS (SECURE ZIP)
    safeHandle('export-logs', async () => {
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'Export Logs',
            defaultPath: `warekeep-logs-${new Date().toISOString().slice(0, 10)}.zip`,
            filters: [{ name: 'ZIP Files', extensions: ['zip'] }]
        });
        if (canceled || !filePath)
            return { success: false, canceled: true };
        const zip = new AdmZip();
        let totalFiles = 0;
        // Add main logs folder
        const logsDir = path.join(userDataPath, 'logs');
        if (fs.existsSync(logsDir)) {
            zip.addLocalFolder(logsDir, "system_logs");
            totalFiles++;
        }
        // Add offline journal
        const journalPath = path.join(userDataPath, 'offline_journal.json');
        if (fs.existsSync(journalPath)) {
            zip.addLocalFile(journalPath);
            totalFiles++;
        }
        // Add pending operations queue
        const opsPath = path.join(userDataPath, 'pending_operations.log');
        if (fs.existsSync(opsPath)) {
            zip.addLocalFile(opsPath);
            totalFiles++;
        }
        // Add persisted local-first state files
        const persistedStateFiles = fs.existsSync(userDataPath)
            ? fs.readdirSync(userDataPath, { withFileTypes: true })
                .filter((entry) => entry.isFile())
                .map((entry) => entry.name)
                .filter((name) => (name.startsWith('local-db-')
                || name === 'offline_journal.json.prev'))
            : [];
        persistedStateFiles.forEach((fileName) => {
            zip.addLocalFile(path.join(userDataPath, fileName), 'local_state');
            totalFiles++;
        });
        if (totalFiles === 0) {
            return { success: false, error: "No logs found to export." };
        }
        // Write zip to disk using atomic write
        await writeAtomic(filePath, zip.toBuffer());
        // Log this action for audit
        runWithContext({ tag: 'PERFORMANCE' }, () => {
            logger.info('Logs Exported', { destination: filePath, filesCount: totalFiles });
        });
        return { success: true, filePath };
    }, 'STORAGE');
    // 7. SAVE HTML
    safeHandle('save-invoice-html', async (event, content, suggestedFilename, userConfiguredPath, subFolder) => {
        const safeFilename = sanitizeFilename(suggestedFilename);
        let finalDir = app.getPath('downloads');
        if (userConfiguredPath && typeof userConfiguredPath === 'string') {
            try {
                const stats = await fs.promises.stat(userConfiguredPath);
                if (stats.isDirectory())
                    finalDir = userConfiguredPath;
            }
            catch (statError) {
                // Ignore invalid custom path and fall back to the default downloads directory.
            }
        }
        if (subFolder && typeof subFolder === 'string') {
            const safeSub = subFolder.split(/[/\\]/).map(sanitizeFilename).join(path.sep);
            finalDir = path.join(finalDir, safeSub);
        }
        if (!fs.existsSync(finalDir)) {
            await fs.promises.mkdir(finalDir, { recursive: true });
        }
        let filePath;
        if (!userConfiguredPath && !subFolder) {
            const { canceled, filePath: dialogPath } = await dialog.showSaveDialog({
                title: 'Save Invoice',
                defaultPath: safeFilename,
                filters: [{ name: 'HTML Files', extensions: ['html'] }]
            });
            if (canceled || !dialogPath)
                return { success: false, canceled: true };
            filePath = dialogPath;
        }
        else {
            filePath = path.join(finalDir, safeFilename);
        }
        await fileMutex.enqueue(filePath, () => writeAtomic(filePath, content));
        return { success: true, filePath };
    }, 'STORAGE');
    safeHandle('generate-report-pdf', async (_event, content, suggestedFilename) => {
        const baseName = sanitizeFilename(suggestedFilename || `report-${Date.now()}.pdf`).replace(/\.html$/i, '.pdf');
        const safeFilename = baseName.toLowerCase().endsWith('.pdf') ? baseName : `${baseName}.pdf`;
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'Save Report PDF',
            defaultPath: safeFilename,
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });
        if (canceled || !filePath)
            return { success: false, canceled: true };
        const pdfWindow = new BrowserWindow({
            show: false,
            width: 1280,
            height: 900,
            webPreferences: {
                sandbox: true,
                contextIsolation: true
            }
        });
        try {
            await pdfWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(String(content || ''))}`);
            await pdfWindow.webContents.executeJavaScript("document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : Promise.resolve(true)");
            const pdfBuffer = await pdfWindow.webContents.printToPDF({
                printBackground: true,
                preferCSSPageSize: true
            });
            await fileMutex.enqueue(filePath, () => writeAtomic(filePath, pdfBuffer));
            return { success: true, filePath };
        }
        finally {
            if (!pdfWindow.isDestroyed()) {
                pdfWindow.destroy();
            }
        }
    }, 'STORAGE');
}
let isQuitting = false;
app.on('before-quit', (event) => {
    if (isQuitting)
        return;
    const pending = fileMutex.getPendingPromises();
    if (pending.length === 0)
        return;
    event.preventDefault();
    isQuitting = true;
    runWithContext({ tag: 'STORAGE' }, () => {
        logger.info('Draining pending file writes before quit', { pendingCount: pending.length });
    });
    fileMutex.drain().finally(() => app.quit());
});
app.on('window-all-closed', () => app.quit());
