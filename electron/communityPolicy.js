// Pure policy shared by the Community desktop runtime and its regression tests.
export const COMMUNITY_APP_ID = 'com.warekeep.community';
export const COMMUNITY_APP_NAME = 'WareKeep Community';
export const COMMUNITY_DEV_URL = 'http://127.0.0.1:5175';
export const isCommunityRequestAllowed = (rawUrl, isDevelopment = false) => {
    try {
        const url = new URL(rawUrl);
        if (url.protocol === 'file:')
            return !url.hostname || url.hostname === 'localhost';
        if (['data:', 'blob:', 'about:'].includes(url.protocol))
            return true;
        return isDevelopment
            && ['http:', 'ws:'].includes(url.protocol)
            && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
            && url.port === '5175'
            && !url.username
            && !url.password;
    }
    catch {
        return false;
    }
};
export const COMMUNITY_DISABLED_IPC_CHANNELS = new Set([
    'backend-request',
    'probe-backend',
    'download-and-open-installer',
    'ensure-auth-protocol',
    'open-external-url',
]);
