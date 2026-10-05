import { bufferAction } from './offlineBuffer';
import { appendWebLog } from './webLogService';
import { createUniqueId } from '../utils/localIds';
export type AuditSeverity = 'TRACE' | 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export interface AuditEntry {
    timestamp: string;
    severity: AuditSeverity;
    category: 'SYNC' | 'CONFLICT' | 'SECURITY' | 'DATA_LOSS' | 'REPORTING';
    message: string;
    details?: any;
}
class AuditService {
    /**
     * Logs a sync event. Uses the offlineBuffer to ensure it's written to disk/electron logs.
     */
    public async log(severity: AuditSeverity, category: AuditEntry['category'], message: string, details?: any) {
        const entry: AuditEntry = {
            timestamp: new Date().toISOString(),
            severity,
            category,
            message,
            details
        };
        const level = severity === 'CRITICAL' || severity === 'ERROR'
            ? 'error'
            : severity === 'WARNING'
                ? 'warn'
                : 'info';
        // Console output is restricted in production to keep logs high-signal.
        const isProd = import.meta.env.PROD;
        const shouldConsoleLog = !isProd || severity === 'WARNING' || severity === 'ERROR' || severity === 'CRITICAL';
        if (shouldConsoleLog) {
            const logMethod = severity === 'ERROR' || severity === 'CRITICAL'
                ? console.error
                : (severity === 'WARNING' ? console.warn : console.log);
            const safeDetails = isProd ? '' : (details || '');
            logMethod(`[AUDIT][${category}] ${message}`, safeDetails);
        }
        appendWebLog(level, category === 'REPORTING' ? 'UI' : 'SYNC', `[AUDIT][${category}] ${message}`, details);
        // Persist via existing offline buffer (Entity: SYSTEM)
        await bufferAction('SYSTEM', 'SYNC_QUEUE', entry, createUniqueId('audit'));
    }
    public async logConflict(entityId: string, localVersion: number, remoteVersion: number, resolution: 'LOCAL_WIN' | 'REMOTE_WIN') {
        await this.log('WARNING', 'CONFLICT', `Version Mismatch for ${entityId}`, {
            local: localVersion,
            remote: remoteVersion,
            resolution
        });
    }
    public async logSecurityEvent(action: string, reason: string) {
        await this.log('CRITICAL', 'SECURITY', `Security Block: ${action}`, { reason });
    }
}
export const auditService = new AuditService();
