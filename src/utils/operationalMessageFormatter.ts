type SyncErrorLike = {
    code?: string;
    message: string;
    source?: string;
};
const DEVICE_ONLINE_OFFLINE_STATUS_EN = 'Device is online but runtime sync status is offline.';
const DEVICE_ONLINE_OFFLINE_STATUS_FA = 'دستگاه آنلاین است اما وضعیت همگام‌سازی هنوز آفلاین است.';
const SNAPSHOT_RESTORED_EN = 'Data restored from server snapshot.';
const SNAPSHOT_RESTORED_FA = 'داده‌ها از اسنپ‌شات سرور بازیابی شد.';
export const formatSyncErrorMessage = (error: SyncErrorLike, isEnglish: boolean): string => {
    const rawMessage = (error.message || '').trim();
    if (rawMessage === 'NETWORK_TIMEOUT' ||
        (error.code === 'SYNC_LOOP_FAILED' && rawMessage === 'NETWORK_TIMEOUT') ||
        /abort(?:ed)?(?:\s+a\s+request)?/i.test(rawMessage)) {
        return isEnglish
            ? 'The sync request timed out. The server may be slow or unreachable. Automatic retry will continue.'
            : 'درخواست همگام‌سازی در زمان تعیین‌شده پاسخ نداد. ممکن است سرور کند باشد یا در دسترس نباشد. تلاش خودکار ادامه می‌یابد.';
    }
    if (error.code === 'NETWORK_OFFLINE') {
        return isEnglish
            ? 'The network or sync server is currently unavailable. Automatic retry will continue.'
            : 'شبکه یا سرور همگام‌سازی فعلاً در دسترس نیست. تلاش خودکار ادامه می‌یابد.';
    }
    if (error.code === 'SYNC_SESSION_CHECK_FAILED' || error.code === 'AUTH_CONTEXT_MISSING') {
        return isEnglish
            ? 'Your sync session is missing or expired. Please sign in again.'
            : 'نشست همگام‌سازی موجود نیست یا منقضی شده است. لطفاً دوباره وارد شوید.';
    }
    if (error.code === 'DEVICE_UNTRUSTED') {
        return isEnglish
            ? 'This device is not trusted for cloud sync.'
            : 'این دستگاه برای همگام‌سازی ابری تأیید نشده است.';
    }
    if (error.code === 'SYNC_BUSY') {
        return isEnglish
            ? 'A previous sync cycle is still running. The system will retry shortly.'
            : 'یک چرخه همگام‌سازی قبلی هنوز در حال اجرا است. سیستم به‌زودی دوباره تلاش می‌کند.';
    }
    if (rawMessage === SNAPSHOT_RESTORED_EN || rawMessage === SNAPSHOT_RESTORED_FA) {
        return isEnglish ? SNAPSHOT_RESTORED_EN : SNAPSHOT_RESTORED_FA;
    }
    return rawMessage || (isEnglish ? 'Unknown sync error.' : 'خطای نامشخص همگام‌سازی.');
};
export const localizeOperationalMessage = (message: string, isEnglish: boolean): string => {
    const normalized = (message || '').trim();
    if (!normalized)
        return normalized;
    const lastSyncErrorMatch = normalized.match(/^Last sync error \[([A-Z_]+)\] from ([^:]+):\s*(.+)$/);
    if (lastSyncErrorMatch) {
        const [, code, source, rawMessage] = lastSyncErrorMatch;
        const formatted = formatSyncErrorMessage({ code, source, message: rawMessage }, isEnglish);
        return isEnglish
            ? `Last sync error [${code}] from ${source}: ${formatted}`
            : `آخرین خطای همگام‌سازی [${code}] از ${source}: ${formatted}`;
    }
    if (normalized === DEVICE_ONLINE_OFFLINE_STATUS_EN || normalized === DEVICE_ONLINE_OFFLINE_STATUS_FA) {
        return isEnglish ? DEVICE_ONLINE_OFFLINE_STATUS_EN : DEVICE_ONLINE_OFFLINE_STATUS_FA;
    }
    if (normalized === SNAPSHOT_RESTORED_EN || normalized === SNAPSHOT_RESTORED_FA) {
        return isEnglish ? SNAPSHOT_RESTORED_EN : SNAPSHOT_RESTORED_FA;
    }
    if (normalized === 'NETWORK_TIMEOUT') {
        return formatSyncErrorMessage({ code: 'SYNC_LOOP_FAILED', message: normalized }, isEnglish);
    }
    return normalized;
};
