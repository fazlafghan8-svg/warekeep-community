import type { HealthSnapshot } from "../../services/localDiagnostics";
import type { ConnectivityState } from "../../services/localWorkspaceState";
import type { SyncStatus } from '../../types';
export type SyncDisplayState = 'stable' | 'background-sync' | 'pending' | 'offline' | 'server-unreachable' | 'error';
export type HealthDisplayState = 'healthy' | 'checking' | 'degraded' | 'error';
export type OperationalTone = 'emerald' | 'sky' | 'amber' | 'rose' | 'slate';
export interface OperationalQueueStatus {
    length: number;
    isProcessing: boolean;
    isPaused: boolean;
    nextRetry: number;
    queueLength?: number;
    deltaQueueLength?: number;
    warehouseOutboxLength?: number;
    totalPending?: number;
}
export interface OperationalDisplayInput {
    syncStatus?: SyncStatus;
    isOnline: boolean;
    connectivityState?: ConnectivityState;
    queueStatus: OperationalQueueStatus;
    healthSnapshot: HealthSnapshot;
}
interface DisplayTransitionState<TState extends string> {
    state: TState;
    stateSince: number;
    candidate: TState;
    candidateSince: number;
}
export interface OperationalDisplayStatus {
    sync: DisplayTransitionState<SyncDisplayState> & {
        tone: OperationalTone;
        pendingCount: number;
        holdUntil: number;
    };
    health: DisplayTransitionState<HealthDisplayState> & {
        tone: OperationalTone;
        hasSeenHealthy: boolean;
    };
}
const SYNC_BACKGROUND_THRESHOLD_MS = 2500;
const SYNC_BACKGROUND_HOLD_MS = 3000;
const HEALTH_DEGRADED_THRESHOLD_MS = 8000;
const HEALTH_ERROR_THRESHOLD_MS = 5000;
const HEALTH_RECOVERY_THRESHOLD_MS = 5000;
const getPendingCount = (queueStatus: OperationalQueueStatus) => (queueStatus.totalPending ??
    ((queueStatus.queueLength ?? queueStatus.length) +
        (queueStatus.deltaQueueLength ?? 0) +
        (queueStatus.warehouseOutboxLength ?? 0)));
const getSyncTone = (state: SyncDisplayState): OperationalTone => {
    if (state === 'stable')
        return 'emerald';
    if (state === 'background-sync')
        return 'sky';
    if (state === 'pending')
        return 'amber';
    return 'rose';
};
const getHealthTone = (state: HealthDisplayState): OperationalTone => {
    if (state === 'healthy')
        return 'emerald';
    if (state === 'checking')
        return 'slate';
    if (state === 'degraded')
        return 'amber';
    return 'rose';
};
const updateCandidate = <TState extends string>(previous: DisplayTransitionState<TState> | undefined, candidate: TState, now: number) => ({
    candidate,
    candidateSince: previous?.candidate === candidate ? previous.candidateSince : now
});
const resolveSyncCandidate = (input: OperationalDisplayInput, pendingCount: number, now: number): SyncDisplayState => {
    const deviceOnline = input.connectivityState?.browserOnline ?? input.isOnline;
    const effectiveOnline = input.connectivityState?.effectiveOnline ?? input.isOnline;
    const hasRetryScheduled = input.queueStatus.nextRetry > now;
    if (!deviceOnline)
        return 'offline';
    if (!effectiveOnline)
        return 'server-unreachable';
    if (input.syncStatus === 'error')
        return 'error';
    if (pendingCount > 0 || input.queueStatus.isPaused || hasRetryScheduled)
        return 'pending';
    if (input.syncStatus === 'syncing')
        return 'background-sync';
    return 'stable';
};
const resolveSyncDisplay = (input: OperationalDisplayInput, previous: OperationalDisplayStatus | undefined, now: number): OperationalDisplayStatus['sync'] => {
    const pendingCount = getPendingCount(input.queueStatus);
    const candidate = resolveSyncCandidate(input, pendingCount, now);
    const candidateMeta = updateCandidate(previous?.sync, candidate, now);
    let state: SyncDisplayState = candidate;
    let holdUntil = previous?.sync.holdUntil ?? 0;
    if (candidate === 'background-sync') {
        const hasPassedThreshold = now - candidateMeta.candidateSince >= SYNC_BACKGROUND_THRESHOLD_MS;
        if (!hasPassedThreshold && previous?.sync.state !== 'background-sync') {
            state = 'stable';
        }
        else {
            state = 'background-sync';
            holdUntil = Math.max(holdUntil, now + SYNC_BACKGROUND_HOLD_MS);
        }
    }
    else if (candidate === 'stable' && previous?.sync.state === 'background-sync' && now < holdUntil) {
        state = 'background-sync';
    }
    const stateSince = previous?.sync.state === state ? previous.sync.stateSince : now;
    return {
        state,
        stateSince,
        candidate: candidateMeta.candidate,
        candidateSince: candidateMeta.candidateSince,
        pendingCount,
        holdUntil,
        tone: getSyncTone(state)
    };
};
const resolveHealthCandidate = (input: OperationalDisplayInput, previous: OperationalDisplayStatus | undefined): HealthDisplayState => {
    const effectiveOnline = input.connectivityState?.effectiveOnline ?? input.isOnline;
    const hasSeenHealthy = previous?.health.hasSeenHealthy ?? false;
    if (!input.isOnline || !effectiveOnline)
        return 'error';
    if (input.healthSnapshot.status === 'healthy')
        return 'healthy';
    if (input.healthSnapshot.status === 'degraded')
        return 'degraded';
    if (input.healthSnapshot.status === 'error')
        return 'error';
    if (hasSeenHealthy && !input.healthSnapshot.lastIssue)
        return 'healthy';
    return 'checking';
};
const resolveHealthDisplay = (input: OperationalDisplayInput, previous: OperationalDisplayStatus | undefined, now: number): OperationalDisplayStatus['health'] => {
    const candidate = resolveHealthCandidate(input, previous);
    const candidateMeta = updateCandidate(previous?.health, candidate, now);
    let state: HealthDisplayState = candidate;
    if (previous) {
        const candidateAge = now - candidateMeta.candidateSince;
        if (candidate === 'degraded' && previous.health.state !== 'degraded') {
            state = candidateAge >= HEALTH_DEGRADED_THRESHOLD_MS ? 'degraded' : previous.health.state;
        }
        else if (candidate === 'error' && previous.health.state !== 'error') {
            const effectiveOnline = input.connectivityState?.effectiveOnline ?? input.isOnline;
            state = !effectiveOnline || candidateAge >= HEALTH_ERROR_THRESHOLD_MS ? 'error' : previous.health.state;
        }
        else if (candidate === 'healthy' && previous.health.state !== 'healthy') {
            state = candidateAge >= HEALTH_RECOVERY_THRESHOLD_MS ? 'healthy' : previous.health.state;
        }
    }
    const stateSince = previous?.health.state === state ? previous.health.stateSince : now;
    const hasSeenHealthy = (previous?.health.hasSeenHealthy ?? false) ||
        input.healthSnapshot.status === 'healthy' ||
        state === 'healthy';
    return {
        state,
        stateSince,
        candidate: candidateMeta.candidate,
        candidateSince: candidateMeta.candidateSince,
        hasSeenHealthy,
        tone: getHealthTone(state)
    };
};
export const resolveOperationalDisplayStatus = (input: OperationalDisplayInput, previous?: OperationalDisplayStatus, now = Date.now()): OperationalDisplayStatus => ({
    sync: resolveSyncDisplay(input, previous, now),
    health: resolveHealthDisplay(input, previous, now)
});
