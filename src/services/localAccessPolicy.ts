import type { AppSettings, OperationMode, PlanLimits, PlanTier, Subscription } from '../types';
// Older local backups store this metadata under AppSettings.subscription.
// It describes Community access only; it is not an activation requirement.
export const DEFAULT_SUBSCRIPTION: Subscription = {
    tier: 'free',
    isActive: true,
    features: {
        maxMedicines: -1,
        maxInvoicesPerMonth: -1,
        maxUsers: -1,
        maxDevices: 1,
        aiEnabled: false,
        cloudSyncEnabled: false
    },
    billingType: 'free',
    planVersion: 'af_v2'
};
export const sanitizeSubscription = (_subscription?: Subscription | null, _expectedEmail?: string): Subscription => ({
    ...DEFAULT_SUBSCRIPTION,
    features: { ...DEFAULT_SUBSCRIPTION.features }
});
export const normalizeOperationMode = (_value: unknown): OperationMode => 'offline';
export const isSubscriptionActive = (_subscription?: Subscription | null): boolean => true;
export const isSubscriptionExpired = (_subscription?: Subscription | null): boolean => false;
export const isLegacySubscription = (_subscription?: Subscription | null): boolean => false;
export const canUseHybridMode = (_subscription?: Subscription | null): boolean => false;
export const canUseTeamMode = (_subscription?: Subscription | null): boolean => false;
// Local administrator/staff PIN protection works without an internet account.
// The legacy settings.teamMode flag controls this local protection too.
export const canUseStaffAccess = (_subscription?: Subscription | null): boolean => true;
export const canUseOperationMode = (mode: OperationMode, _subscription?: Subscription | null): boolean => mode === 'offline';
export const checkLimit = (_currentSettings: AppSettings, _limitType: keyof PlanLimits, _currentCount: number): {
    allowed: boolean;
    message?: string;
} => {
    if (_limitType === 'aiEnabled' || _limitType === 'cloudSyncEnabled') {
        return { allowed: false, message: _currentSettings.language === 'english'
                ? 'This online feature is unavailable in Community.'
                : 'این قابلیت آنلاین در نسخهٔ Community ارائه نمی‌شود.' };
    }
    return { allowed: true };
};
export const getPlanTargetMode = (_tier: PlanTier, _subscription?: Subscription | null): OperationMode => 'offline';
export const getPlanName = (_tier: PlanTier, _subscription?: Subscription | null): string => 'Community';
export const getSubscriptionDisplayName = (_subscription?: Subscription | null): string => 'Community';
export const getSubscriptionLegacyNote = (_subscription?: Subscription | null): string | undefined => undefined;
export const getPlanColor = (_tier: PlanTier, _subscription?: Subscription | null): string => 'bg-gray-500';
