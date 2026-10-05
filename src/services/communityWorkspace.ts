import type { AppSettings, UserProfile } from '../types';
import { DEFAULT_SUBSCRIPTION } from "./localAccessPolicy";
export const COMMUNITY_PROFILE: UserProfile = {
    id: 'community-local',
    name: 'WareKeep Community',
    email: '',
    provider: 'local'
};
export const isLocalOnlyProfile = (profile?: UserProfile | null): boolean => true;
/** Also applied when restoring a backup from a paid or trial edition. */
export const normalizeCommunitySettings = (settings: AppSettings): AppSettings => ({
    ...settings,
    operationMode: 'offline',
    subscription: DEFAULT_SUBSCRIPTION,
    guestTrial: undefined,
    // teamMode controls local PIN access too; it is safe to preserve offline.
    teamMode: !!settings.teamMode,
    aiProviders: [],
    googleApiKey: undefined,
    googleApiKeys: [],
});
