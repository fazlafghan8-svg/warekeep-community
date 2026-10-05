import { SyncOperation } from '../sync/types';
import { createUniqueId } from '../utils/localIds';
/**
 * Offline Safety Buffer Service
 *
 * Provides an append-only journal (Write-Ahead Log style) for critical data operations.
 * Main Process handles the file lock queue for these operations.
 */
const LOG_KEY_JOURNAL = 'JOURNAL'; // Maps to offline_journal.json
const LOG_KEY_OPS = 'OPS'; // Maps to pending_operations.log
export interface BufferAction {
    type: 'CREATE' | 'UPDATE' | 'DELETE' | 'SYNC_QUEUE' | 'RESET' | 'LOCAL_COMMIT_BEGIN' | 'LOCAL_COMMIT_DONE';
    entity: 'MEDICINE' | 'INVOICE' | 'CUSTOMER' | 'PURCHASE' | 'EXPENSE' | 'SYSTEM';
    id?: string;
    details?: any;
}
export const bufferAction = async (entity: BufferAction['entity'], type: BufferAction['type'], details: any, id?: string) => {
    const entry = {
        ts: new Date().toISOString(),
        id: id || createUniqueId('gen'),
        entity,
        type,
        details
    };
    const line = JSON.stringify(entry) + '\n';
    try {
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.appendLog) {
            // Await to ensure we respect the write queue in Main
            await window.electronAPI.appendLog(LOG_KEY_JOURNAL, line);
        }
        else {
            // Web Mode fallback
            const key = 'warekeep_offline_journal';
            const existing = localStorage.getItem(key) || '[]';
            let parsed = [];
            try {
                parsed = JSON.parse(existing);
            }
            catch (e) { }
            parsed.push(entry);
            if (parsed.length > 100)
                parsed.shift();
            localStorage.setItem(key, JSON.stringify(parsed));
        }
    }
    catch (e) {
        console.error("Critical: Failed to write to offline safety buffer.", e);
    }
};
export const bufferSyncOperation = async (op: SyncOperation) => {
    const line = JSON.stringify({
        ts: new Date().toISOString(),
        op: 'ENQUEUE',
        entity: op.entity,
        entity_id: op.entity_id,
        version: op.version
    }) + '\n';
    try {
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.appendLog) {
            await window.electronAPI.appendLog(LOG_KEY_OPS, line);
        }
    }
    catch (e) {
        // Silent fail for sync log
    }
};
export const readJournal = async (): Promise<any[]> => {
    try {
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.readLog) {
            const result = await window.electronAPI.readLog(LOG_KEY_JOURNAL);
            if (result.success && result.content) {
                const lines = result.content.trim().split('\n');
                return lines.map(line => {
                    try {
                        return JSON.parse(line);
                    }
                    catch (e) {
                        return null;
                    }
                }).filter(x => x !== null);
            }
        }
        else {
            const key = 'warekeep_offline_journal';
            const existing = localStorage.getItem(key);
            if (existing)
                return JSON.parse(existing);
        }
    }
    catch (e) {
        console.error("Failed to read journal", e);
    }
    return [];
};
export const archiveJournal = async (): Promise<void> => {
    try {
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.archiveLog) {
            await window.electronAPI.archiveLog(LOG_KEY_JOURNAL);
        }
        else {
            localStorage.removeItem('warekeep_offline_journal');
        }
    }
    catch (e) {
        console.error("Failed to archive journal", e);
    }
};
