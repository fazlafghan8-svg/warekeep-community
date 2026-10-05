// Compatibility metadata for shared local views. No remote probe or queue exists.
export type ConnectivityFailureReason = 'browser_offline' | 'supabase_unreachable' | 'backend_unreachable';
export interface ConnectivityState {
    browserOnline: boolean;
    supabaseReachable: boolean;
    backendReachable: boolean;
    effectiveOnline: boolean;
    reason: ConnectivityFailureReason | 'online';
    lastCheckedAt: string;
}
export type PendingSyncRecoveryResult = {
    online: boolean;
    remainingLocalWork: boolean;
};
export const createConnectivityState = (_overrides: Partial<ConnectivityState> = {}): ConnectivityState => ({
    browserOnline: false,
    supabaseReachable: false,
    backendReachable: false,
    effectiveOnline: false,
    reason: 'browser_offline',
    lastCheckedAt: new Date().toISOString(),
});
