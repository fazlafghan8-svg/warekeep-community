import type { AiLanguage, AppSettings, Language } from '../types';
export const resolveAiLanguage = (aiLanguage?: AiLanguage, appLanguage?: Language): AiLanguage => {
    if (aiLanguage === 'fa' || aiLanguage === 'ps' || aiLanguage === 'en') {
        return aiLanguage;
    }
    return appLanguage === 'english' ? 'en' : 'fa';
};
export const withResolvedAiLanguage = <T extends Pick<AppSettings, 'language' | 'aiLanguage'>>(settings: T): T & {
    aiLanguage: AiLanguage;
} => ({
    ...settings,
    aiLanguage: resolveAiLanguage(settings.aiLanguage, settings.language)
});
