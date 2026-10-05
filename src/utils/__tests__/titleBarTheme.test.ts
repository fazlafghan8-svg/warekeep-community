import { describe, expect, it } from 'vitest';
import { resolveTitleBarTheme } from '../titleBarTheme';

describe('resolveTitleBarTheme', () => {
    it('returns boot while hydration is still running', () => {
        expect(resolveTitleBarTheme({
            loading: true,
            hasUser: false,
            teamMode: false,
            hasActiveAppUser: false,
            isLocked: false,
        })).toBe('boot');
    });

    it('returns auth after loading when there is no signed-in user', () => {
        expect(resolveTitleBarTheme({
            loading: false,
            hasUser: false,
            teamMode: false,
            hasActiveAppUser: false,
            isLocked: false,
        })).toBe('auth');
    });

    it('returns access for the unlocked team user selection screen', () => {
        expect(resolveTitleBarTheme({
            loading: false,
            hasUser: true,
            teamMode: true,
            hasActiveAppUser: false,
            isLocked: false,
        })).toBe('access');
    });

    it('returns app for the normal authenticated workspace', () => {
        expect(resolveTitleBarTheme({
            loading: false,
            hasUser: true,
            teamMode: false,
            hasActiveAppUser: true,
            isLocked: false,
        })).toBe('app');
    });

    it('ignores stale lock state outside team mode', () => {
        expect(resolveTitleBarTheme({
            loading: false,
            hasUser: true,
            teamMode: false,
            hasActiveAppUser: false,
            isLocked: true,
        })).toBe('app');
    });
});
