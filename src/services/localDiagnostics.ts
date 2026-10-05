/** Compatibility shape for an idle local UI; no server health checks are run. */
export interface HealthSnapshot {
    running: boolean;
    inFlight: boolean;
    lastCheckedAt: string | null;
    lastRecoveryAt: string | null;
    status: 'idle' | 'healthy' | 'degraded' | 'error';
    consecutiveUnhealthy: number;
    lastIssue: string | null;
}
