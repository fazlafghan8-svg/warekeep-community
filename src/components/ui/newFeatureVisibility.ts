export const NEW_FEATURE_MARKERS_HIDE_AFTER_ISO = '2026-04-03T23:59:59.999+04:30';
const NEW_FEATURE_MARKERS_HIDE_AFTER_TS = Date.parse(NEW_FEATURE_MARKERS_HIDE_AFTER_ISO);
export const shouldShowNewFeatureMarkers = (now = Date.now()): boolean => {
    if (!Number.isFinite(NEW_FEATURE_MARKERS_HIDE_AFTER_TS))
        return false;
    return now <= NEW_FEATURE_MARKERS_HIDE_AFTER_TS;
};
