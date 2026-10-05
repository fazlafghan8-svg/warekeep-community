import type { MedicineProcurementAssistSettings } from '../types';
export interface MedicineProcurementAssistLearningState {
    manualEnableCount: number;
    learnedDefaultEnabled: boolean;
}
export const MEDICINE_PROCUREMENT_ASSIST_LEARNING_STORAGE_KEY = 'warekeep:medicine-procurement-assist-learning';
export const DEFAULT_MEDICINE_PROCUREMENT_ASSIST_SETTINGS: MedicineProcurementAssistSettings = {
    enabled: true,
    adaptiveLearning: true,
    adaptiveThreshold: 3,
};
const DEFAULT_LEARNING_STATE: MedicineProcurementAssistLearningState = {
    manualEnableCount: 0,
    learnedDefaultEnabled: false,
};
export const normalizeMedicineProcurementAssistSettings = (value?: Partial<MedicineProcurementAssistSettings> | null): MedicineProcurementAssistSettings => {
    const candidate = value || {};
    const rawThreshold = Number(candidate.adaptiveThreshold);
    const adaptiveThreshold = Number.isFinite(rawThreshold)
        ? Math.max(1, Math.trunc(rawThreshold))
        : DEFAULT_MEDICINE_PROCUREMENT_ASSIST_SETTINGS.adaptiveThreshold;
    return {
        enabled: candidate.enabled ?? DEFAULT_MEDICINE_PROCUREMENT_ASSIST_SETTINGS.enabled,
        adaptiveLearning: candidate.adaptiveLearning ?? DEFAULT_MEDICINE_PROCUREMENT_ASSIST_SETTINGS.adaptiveLearning,
        adaptiveThreshold,
    };
};
const normalizeLearningState = (value: unknown, adaptiveThreshold: number): MedicineProcurementAssistLearningState => {
    if (!value || typeof value !== 'object') {
        return DEFAULT_LEARNING_STATE;
    }
    const candidate = value as Partial<MedicineProcurementAssistLearningState>;
    const rawCount = Number(candidate.manualEnableCount);
    const manualEnableCount = Number.isFinite(rawCount) ? Math.max(0, Math.trunc(rawCount)) : 0;
    return {
        manualEnableCount,
        learnedDefaultEnabled: candidate.learnedDefaultEnabled === true || manualEnableCount >= adaptiveThreshold,
    };
};
export const readMedicineProcurementAssistLearningState = (adaptiveThreshold: number = DEFAULT_MEDICINE_PROCUREMENT_ASSIST_SETTINGS.adaptiveThreshold): MedicineProcurementAssistLearningState => {
    if (typeof window === 'undefined') {
        return DEFAULT_LEARNING_STATE;
    }
    try {
        const raw = window.localStorage.getItem(MEDICINE_PROCUREMENT_ASSIST_LEARNING_STORAGE_KEY);
        if (!raw)
            return DEFAULT_LEARNING_STATE;
        return normalizeLearningState(JSON.parse(raw), adaptiveThreshold);
    }
    catch {
        return DEFAULT_LEARNING_STATE;
    }
};
export const writeMedicineProcurementAssistLearningState = (state: MedicineProcurementAssistLearningState) => {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(MEDICINE_PROCUREMENT_ASSIST_LEARNING_STORAGE_KEY, JSON.stringify(state));
    }
    catch {
        // Keep in-memory state when storage is unavailable.
    }
};
export const resetMedicineProcurementAssistLearningState = (): MedicineProcurementAssistLearningState => {
    if (typeof window !== 'undefined') {
        try {
            window.localStorage.removeItem(MEDICINE_PROCUREMENT_ASSIST_LEARNING_STORAGE_KEY);
        }
        catch {
            // Ignore storage failures.
        }
    }
    return DEFAULT_LEARNING_STATE;
};
export const incrementMedicineProcurementAssistLearningState = (adaptiveThreshold: number = DEFAULT_MEDICINE_PROCUREMENT_ASSIST_SETTINGS.adaptiveThreshold): MedicineProcurementAssistLearningState => {
    const current = readMedicineProcurementAssistLearningState(adaptiveThreshold);
    const next: MedicineProcurementAssistLearningState = {
        manualEnableCount: current.manualEnableCount + 1,
        learnedDefaultEnabled: current.learnedDefaultEnabled || current.manualEnableCount + 1 >= adaptiveThreshold,
    };
    writeMedicineProcurementAssistLearningState(next);
    return next;
};
