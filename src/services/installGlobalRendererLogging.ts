import { Logger } from './loggerService';
import { initializeWebLogging } from './webLogService';
let installed = false;
export const installGlobalRendererLogging = (entryName: string): void => {
    if (installed || typeof window === 'undefined')
        return;
    installed = true;
    initializeWebLogging();
    if (typeof document !== 'undefined' && window.electronAPI) {
        document.documentElement.classList.add('wk-electron-runtime');
    }
    window.addEventListener('error', (event) => {
        Logger.error('CRASH', `Global Window Error (${entryName})`, event.error, {
            message: event.message,
            source: event.filename,
            line: event.lineno,
            col: event.colno,
        });
    });
    window.addEventListener('unhandledrejection', (event) => {
        Logger.error('CRASH', `Unhandled Promise Rejection (${entryName})`, event.reason);
    });
    Logger.info('APP', `${entryName} mounting`, {
        path: window.location.pathname,
        href: window.location.href,
    });
};
