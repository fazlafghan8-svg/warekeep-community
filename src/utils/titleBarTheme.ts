import type { TitleBarThemeName } from '../types';
interface ResolveTitleBarThemeParams {
    loading: boolean;
    hasUser: boolean;
    teamMode: boolean;
    hasActiveAppUser: boolean;
    isLocked: boolean;
}
export const resolveTitleBarTheme = ({ loading, hasUser, teamMode, hasActiveAppUser, isLocked, }: ResolveTitleBarThemeParams): TitleBarThemeName => {
    if (loading)
        return 'boot';
    if (!hasUser)
        return 'auth';
    if (teamMode && (!hasActiveAppUser || isLocked))
        return 'access';
    return 'app';
};
