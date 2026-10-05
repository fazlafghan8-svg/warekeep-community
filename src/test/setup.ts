import '@testing-library/jest-dom/vitest';
if (typeof window !== 'undefined' && !(window as any).electronAPI) {
    (window as any).electronAPI = {
        maximize: async () => { },
        minimize: async () => { },
        close: async () => { },
        isMaximized: async () => false,
        onWindowStateChange: () => () => { },
        onAuthDeepLink: () => () => { },
        saveData: async () => ({ success: true }),
        loadData: async () => ({ success: true, data: {} }),
        saveSyncState: async () => ({ success: true }),
        loadSyncState: async () => ({ success: true, data: {} }),
        appendLog: async () => ({ success: true }),
        readLog: async () => ({ success: true, content: '' }),
        archiveLog: async () => ({ success: true }),
        exportLogs: async () => ({ success: true }),
        backupData: async () => ({ success: true }),
        selectFolder: async () => null,
        saveInvoiceHtml: async () => ({ success: true }),
        generateReportPdf: async () => ({ success: true }),
        forceFocus: async () => { },
        openExternal: async () => ({ success: true }),
        ensureAuthProtocol: async () => ({ success: true }),
        getSessionId: async () => 'test-session',
        backendRequest: async () => ({ success: false, error: 'NOT_IMPLEMENTED' }),
        probeBackend: async () => ({ success: true, reachable: false, attempts: [] }),
        logger: {
            info: async () => { },
            warn: async () => { },
            error: async () => { },
            debug: async () => { }
        }
    };
}
