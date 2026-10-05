import type { SyncStatus } from '../types';
type ManagedSyncStatus = 'syncing' | 'ok' | 'offline';
type SyncStatusListener = (status: ManagedSyncStatus) => void;
type SyncErrorCode = 'UNKNOWN' | 'NETWORK_OFFLINE' | 'SYNC_BUSY' | 'SYNC_NOT_READY' | 'SYNC_SESSION_CHECK_FAILED' | 'DEVICE_UNTRUSTED' | 'SYNC_LOOP_FAILED' | 'SYNC_NOW_FAILED' | 'QUEUE_RETRY_PENDING' | 'AUTH_CONTEXT_MISSING' | 'SYNC_HANDLER_MISSING' | 'HOST_FIRST_SNAPSHOT_TOO_LARGE' | 'HOST_FIRST_SYNC_OP_TOO_LARGE';
export interface SyncErrorState {
    code: SyncErrorCode;
    message: string;
    source: string;
    at: string;
}
const TRANSIENT_SYNC_ERROR_CODES = new Set<SyncErrorCode>([
    'NETWORK_OFFLINE',
    'SYNC_BUSY',
    'SYNC_NOT_READY',
    'QUEUE_RETRY_PENDING'
]);
const TRANSIENT_SYNC_ERROR_MESSAGE_RE = /(network(?:[_\s-]?timeout)?|timed?\s*out|failed to fetch|fetch failed|network request failed|load failed|aborterror|abort(?:ed)?(?:\s+a\s+request)?)/i;
let currentSyncStatus: ManagedSyncStatus = 'offline';
let syncingStartedAt: number = 0;
let hasPushedSnapshot = false;
const listeners = new Set<SyncStatusListener>();
let lastSyncError: SyncErrorState | null = null;
function emitSyncStatus(status: ManagedSyncStatus) {
    for (const listener of listeners) {
        listener(status);
    }
}
function commitSyncStatus(nextStatus: ManagedSyncStatus) {
    if (currentSyncStatus === nextStatus)
        return;
    if (nextStatus === 'syncing') {
        syncingStartedAt = Date.now();
    }
    else {
        syncingStartedAt = 0;
    }
    currentSyncStatus = nextStatus;
    console.log('[SYNC STATE]', nextStatus);
    emitSyncStatus(nextStatus);
}
export function setSyncStatus(nextStatus: Exclude<ManagedSyncStatus, 'ok'>) {
    commitSyncStatus(nextStatus);
}
export function getSyncingSinceMs(): number {
    if (currentSyncStatus !== 'syncing' || syncingStartedAt <= 0)
        return 0;
    return Date.now() - syncingStartedAt;
}
function publishReadyStatus() {
    clearSyncError();
    commitSyncStatus('ok');
}
// Publish healthy/idle-ready state after a successful sync cycle.
export function setSyncStatusReady() {
    publishReadyStatus();
}
// Restore an "online and ready" state without clearing the last error yet.
// This is used when a background sync hits a transient timeout but the app
// should not regress to a hard offline state.
export function restoreSyncStatusOk() {
    commitSyncStatus('ok');
}
// Backward-compatible alias used by DB write success paths.
export function setSyncStatusFromDbWriteSuccess() {
    publishReadyStatus();
}
export function getSyncStatus(): SyncStatus {
    return currentSyncStatus;
}
export function setSyncError(message: string, options?: {
    code?: SyncErrorCode;
    source?: string;
}) {
    const nextCode = options?.code || 'UNKNOWN';
    const nextSource = options?.source || 'sync';
    const nextMessage = message || 'Unknown sync error';
    if (lastSyncError &&
        lastSyncError.code === nextCode &&
        lastSyncError.source === nextSource &&
        lastSyncError.message === nextMessage) {
        return;
    }
    lastSyncError = {
        code: nextCode,
        source: nextSource,
        message: nextMessage,
        at: new Date().toISOString()
    };
}
export function clearSyncError() {
    lastSyncError = null;
}
export function getSyncError(): SyncErrorState | null {
    return lastSyncError;
}
export function isTransientSyncErrorState(error: SyncErrorState | null | undefined): boolean {
    if (!error)
        return false;
    if (TRANSIENT_SYNC_ERROR_CODES.has(error.code))
        return true;
    return ((error.code === 'SYNC_LOOP_FAILED' ||
        error.code === 'SYNC_SESSION_CHECK_FAILED' ||
        error.code === 'SYNC_NOW_FAILED') &&
        TRANSIENT_SYNC_ERROR_MESSAGE_RE.test(error.message || ''));
}
export function reconcileSyncStatus(options: {
    online: boolean;
    queueLength: number;
    isProcessing?: boolean;
    isPaused?: boolean;
    hasActiveSync?: boolean;
    localVersion: number;
    remoteVersion: number;
    error?: SyncErrorState | null;
}): boolean {
    const error = options.error ?? lastSyncError;
    if (!options.online)
        return false;
    if (options.queueLength > 0 || options.isProcessing || options.isPaused)
        return false;
    if (options.remoteVersion <= 0 || options.localVersion !== options.remoteVersion)
        return false;
    if (currentSyncStatus === 'offline') {
        if (!isTransientSyncErrorState(error))
            return false;
        clearSyncError();
        commitSyncStatus('ok');
        return true;
    }
    if (currentSyncStatus === 'syncing') {
        if (options.hasActiveSync) {
            // Even if active, if it has been syncing for over 3 minutes,
            // it is likely stuck — allow reconciliation.
            const stuckThreshold = 3 * 60000;
            if (getSyncingSinceMs() < stuckThreshold)
                return false;
        }
        if (error && !isTransientSyncErrorState(error))
            return false;
        clearSyncError();
        commitSyncStatus('ok');
        return true;
    }
    return false;
}
export function subscribeSyncStatus(listener: SyncStatusListener) {
    listeners.add(listener);
    listener(currentSyncStatus);
    return () => {
        listeners.delete(listener);
    };
}
export function markSnapshotPushed() {
    hasPushedSnapshot = true;
}
export function canPushSnapshot() {
    return !hasPushedSnapshot;
}
