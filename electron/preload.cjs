const { contextBridge, ipcRenderer } = require('electron');
const safeInvoke = async (channel, ...args) => {
    try {
        const result = await ipcRenderer.invoke(channel, ...args);
        if (!result || typeof result.success !== 'boolean') {
            return { success: false, error: 'IPC_INVALID_RESPONSE' };
        }
        return result;
    }
    catch (e) {
        return { success: false, error: e?.message || 'IPC_ERROR' };
    }
};
const safeInvokeRaw = async (channel, ...args) => {
    try {
        return await ipcRenderer.invoke(channel, ...args);
    }
    catch (e) {
        return null;
    }
};
/**
 * @typedef {'boot' | 'auth' | 'access' | 'app'} TitleBarThemeName
 */
contextBridge.exposeInMainWorld('electronAPI', {
    // Existing APIs
    saveData: (data, userId) => safeInvoke('save-data', data, userId),
    saveDataPatch: (patch, userId) => safeInvoke('save-data-patch', patch, userId),
    loadData: (userId) => safeInvoke('load-data', userId),
    appendLog: (logType, content) => safeInvoke('append-log', logType, content),
    readLog: (logType) => safeInvoke('read-log', logType),
    archiveLog: (logType) => safeInvoke('archive-log', logType),
    exportLogs: () => safeInvoke('export-logs'),
    backupData: (data) => safeInvoke('backup-data', data),
    selectFolder: () => safeInvokeRaw('select-folder'),
    saveInvoiceHtml: (content, filename, folderPath, subFolder) => safeInvoke('save-invoice-html', content, filename, folderPath, subFolder),
    generateReportPdf: (content, filename) => safeInvoke('generate-report-pdf', content, filename),
    minimize: () => safeInvokeRaw('window-minimize'),
    maximize: () => safeInvokeRaw('window-maximize'),
    isMaximized: () => safeInvokeRaw('window-is-maximized'),
    hasNativeWindowControls: process.platform === 'win32',
    resolveNativeWindowControls: () => safeInvokeRaw('window-has-native-controls'),
    /** @param {TitleBarThemeName} themeName */
    setTitleBarTheme: (themeName) => safeInvokeRaw('window-set-titlebar-overlay-theme', themeName),
    close: () => safeInvokeRaw('window-close'),
    forceFocus: () => safeInvokeRaw('force-focus'),
    openAttachmentDataUrl: (payload) => safeInvoke('open-attachment-data-url', payload),
    getAppVersion: () => safeInvokeRaw('get-app-version'),
    getPlatformInfo: () => safeInvokeRaw('get-platform-info'),
    onWindowStateChange: (callback) => {
        if (typeof callback !== 'function')
            return () => { };
        const listener = (_event, isMaximized) => callback(!!isMaximized);
        ipcRenderer.on('window-maximized-state', listener);
        return () => ipcRenderer.removeListener('window-maximized-state', listener);
    },
    // --- Logger API ---
    getSessionId: () => safeInvokeRaw('get-session-id'),
    logger: {
        info: (tag, message, meta) => safeInvokeRaw('log-message', 'info', tag, message, meta),
        warn: (tag, message, meta) => safeInvokeRaw('log-message', 'warn', tag, message, meta),
        error: (tag, message, meta) => safeInvokeRaw('log-message', 'error', tag, message, meta),
        debug: (tag, message, meta) => safeInvokeRaw('log-message', 'debug', tag, message, meta),
    }
});
