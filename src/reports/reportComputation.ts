import type { AppSettings } from '@/types';
import { buildReportBundle, type BuildReportBundleArgs, type ReportBundle, type ReportFilters, type ReportPreset } from './reporting';
export type ReportSurfaceMode = 'home' | 'advanced';
export type SuggestedPresetArgs = Omit<BuildReportBundleArgs, 'filters' | 'now'> & {
    language: AppSettings['language'];
};
const HOME_PRESET_FALLBACK_ORDER: ReportPreset[] = [
    'today',
    'thisWeek',
    'thisMonth',
    'lastMonth',
    'thisQuarter',
    'lastQuarter',
    'thisYear',
    'lastYear'
];
export const defaultReportFilters = (mode: ReportSurfaceMode = 'advanced', presetOverride?: ReportPreset): ReportFilters => ({
    preset: presetOverride ?? (mode === 'home' ? 'thisMonth' : 'thisYear'),
    compareWithPrevious: true,
    query: '',
    userId: 'all',
    customerId: 'all',
    productType: 'all',
    manufacturer: 'all',
    supplierId: 'all',
    paymentStatus: 'all',
    salesMode: 'all',
    warehouse: 'all',
    branch: 'all'
});
export const resolveSuggestedHomePreset = (args: SuggestedPresetArgs): ReportPreset => {
    const now = new Date();
    const baseArgs = { ...args, now };
    if (buildReportBundle({ ...baseArgs, filters: defaultReportFilters('home', 'thisMonth') }).state === 'ready') {
        return 'thisMonth';
    }
    for (const preset of HOME_PRESET_FALLBACK_ORDER) {
        if (preset === 'thisMonth')
            continue;
        if (buildReportBundle({ ...baseArgs, filters: defaultReportFilters('home', preset) }).state === 'ready') {
            return preset;
        }
    }
    return 'thisMonth';
};
export const buildReportComputation = (args: BuildReportBundleArgs): ReportBundle => buildReportBundle(args);
