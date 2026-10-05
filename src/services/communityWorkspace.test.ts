import { describe, expect, it } from 'vitest';
import { COMMUNITY_PROFILE, isLocalOnlyProfile, normalizeCommunitySettings } from './communityWorkspace';
import {
    canUseHybridMode,
    canUseStaffAccess,
    checkLimit,
    DEFAULT_SUBSCRIPTION,
    normalizeOperationMode,
    sanitizeSubscription,
} from './localAccessPolicy';
import type { AppSettings } from '../types';

describe('Community workspace boundary', () => {
    it('keeps every imported profile local without requiring an online identity', () => {
        expect(COMMUNITY_PROFILE.provider).toBe('local');
        expect(COMMUNITY_PROFILE.email).toBe('');
        expect(isLocalOnlyProfile(COMMUNITY_PROFILE)).toBe(true);
        expect(isLocalOnlyProfile({ id: 'old-cloud', name: 'Old account', email: 'test@example.test', provider: 'supabase' })).toBe(true);
        expect(isLocalOnlyProfile(null)).toBe(true);
    });

    it('restores business settings and PIN access while removing trial and API credentials', () => {
        const original = {
            storeName: 'Test pharmacy', language: 'dari', operationMode: 'team', teamMode: true,
            users: [{ id: 'local-admin' }],
            guestTrial: { meta: { expiresAt: '2020-01-01' } },
            subscription: { tier: 'pro', licenseKey: 'TEST-LICENSE', expiryDate: '2020-01-01' },
            googleApiKey: 'test-only', googleApiKeys: ['test-only'], aiProviders: [{ apiKey: 'test-only' }],
        } as unknown as AppSettings;
        const restored = normalizeCommunitySettings(original);
        expect(restored.storeName).toBe('Test pharmacy');
        expect(restored.language).toBe('dari');
        expect(restored.operationMode).toBe('offline');
        expect(restored.teamMode).toBe(true);
        expect(restored.users).toEqual([{ id: 'local-admin' }]);
        expect(restored.guestTrial).toBeUndefined();
        expect(restored.subscription).toEqual(DEFAULT_SUBSCRIPTION);
        expect(restored.googleApiKey).toBeUndefined();
        expect(restored.googleApiKeys).toEqual([]);
        expect(restored.aiProviders).toEqual([]);
        expect(original.operationMode).toBe('team');
        expect(original.googleApiKey).toBe('test-only');
    });

    it('allows real local quantities beyond paid or trial limits even after an expired import', () => {
        const settings = { subscription: { tier: 'pro', isActive: false, expiryDate: '2020-01-01' } } as AppSettings;
        for (const limit of ['maxMedicines', 'maxInvoicesPerMonth', 'maxUsers'] as const) {
            expect(checkLimit(settings, limit, 100_000).allowed).toBe(true);
        }
        expect(canUseStaffAccess(settings.subscription)).toBe(true);
        expect(canUseHybridMode(settings.subscription)).toBe(false);
        expect(checkLimit(settings, 'aiEnabled', 0).allowed).toBe(false);
        expect(checkLimit(settings, 'cloudSyncEnabled', 0).allowed).toBe(false);
    });

    it('ignores imported or runtime cloud modes and restores only local capabilities', () => {
        localStorage.setItem('warekeep.runtimeBackendUrl', 'https://example.test');
        try {
            for (const mode of ['offline', 'hybrid', 'team', 'backend_v2', undefined]) {
                expect(normalizeOperationMode(mode)).toBe('offline');
            }
            const restored = normalizeCommunitySettings({
                operationMode: 'team', subscription: { tier: 'pro', isActive: false, expiryDate: '2020-01-01' },
                teamMode: false,
            } as AppSettings);
            const access = sanitizeSubscription(restored.subscription);
            expect(access.isActive).toBe(true);
            expect(access.features.cloudSyncEnabled).toBe(false);
            expect(access.features.aiEnabled).toBe(false);
            expect(restored.operationMode).toBe('offline');
            expect(restored.teamMode).toBe(false);
        } finally {
            localStorage.removeItem('warekeep.runtimeBackendUrl');
        }
    });
});
