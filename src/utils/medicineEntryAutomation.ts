import type { MedicineEntryAutomationSettings } from '../types';
export interface MedicineEntryAutomationLearningState {
    manualScrollCount: number;
    learnedAutoScroll: boolean;
}
export const MEDICINE_ENTRY_AUTOMATION_LEARNING_STORAGE_KEY = 'warekeep:medicine-entry-automation-learning';
export const DEFAULT_MEDICINE_ENTRY_AUTOMATION_SETTINGS: MedicineEntryAutomationSettings = {
    enabled: false,
    manualScrollUserConfigured: false,
    trigger: 'typing',
    aiFillScroll: true,
    adaptiveLearning: true,
    adaptiveThreshold: 5,
};
const DEFAULT_LEARNING_STATE: MedicineEntryAutomationLearningState = {
    manualScrollCount: 0,
    learnedAutoScroll: false,
};
export const normalizeMedicineEntryAutomationSettings = (value?: Partial<MedicineEntryAutomationSettings> | null): MedicineEntryAutomationSettings => {
    const candidate = value || {};
    const trigger = candidate.trigger === 'focus' || candidate.trigger === 'blur' || candidate.trigger === 'typing'
        ? candidate.trigger
        : DEFAULT_MEDICINE_ENTRY_AUTOMATION_SETTINGS.trigger;
    const rawThreshold = Number(candidate.adaptiveThreshold);
    const adaptiveThreshold = Number.isFinite(rawThreshold)
        ? Math.max(1, Math.trunc(rawThreshold))
        : DEFAULT_MEDICINE_ENTRY_AUTOMATION_SETTINGS.adaptiveThreshold;
    return {
        enabled: candidate.enabled ?? DEFAULT_MEDICINE_ENTRY_AUTOMATION_SETTINGS.enabled,
        manualScrollUserConfigured: candidate.manualScrollUserConfigured === true
            ? true
            : DEFAULT_MEDICINE_ENTRY_AUTOMATION_SETTINGS.manualScrollUserConfigured,
        trigger,
        aiFillScroll: candidate.aiFillScroll ?? DEFAULT_MEDICINE_ENTRY_AUTOMATION_SETTINGS.aiFillScroll,
        adaptiveLearning: candidate.adaptiveLearning ?? DEFAULT_MEDICINE_ENTRY_AUTOMATION_SETTINGS.adaptiveLearning,
        adaptiveThreshold,
    };
};
export const isManualMedicineEntryAutoScrollEnabled = (settings: MedicineEntryAutomationSettings, learningState: MedicineEntryAutomationLearningState): boolean => {
    if (settings.manualScrollUserConfigured === true) {
        return settings.enabled;
    }
    return learningState.learnedAutoScroll;
};
const normalizeLearningState = (value: unknown, adaptiveThreshold: number): MedicineEntryAutomationLearningState => {
    if (!value || typeof value !== 'object') {
        return DEFAULT_LEARNING_STATE;
    }
    const candidate = value as Partial<MedicineEntryAutomationLearningState>;
    const rawCount = Number(candidate.manualScrollCount);
    const manualScrollCount = Number.isFinite(rawCount) ? Math.max(0, Math.trunc(rawCount)) : 0;
    return {
        manualScrollCount,
        learnedAutoScroll: candidate.learnedAutoScroll === true || manualScrollCount >= adaptiveThreshold,
    };
};
export const readMedicineEntryAutomationLearningState = (adaptiveThreshold: number = DEFAULT_MEDICINE_ENTRY_AUTOMATION_SETTINGS.adaptiveThreshold): MedicineEntryAutomationLearningState => {
    if (typeof window === 'undefined') {
        return DEFAULT_LEARNING_STATE;
    }
    try {
        const raw = window.localStorage.getItem(MEDICINE_ENTRY_AUTOMATION_LEARNING_STORAGE_KEY);
        if (!raw)
            return DEFAULT_LEARNING_STATE;
        return normalizeLearningState(JSON.parse(raw), adaptiveThreshold);
    }
    catch {
        return DEFAULT_LEARNING_STATE;
    }
};
export const writeMedicineEntryAutomationLearningState = (state: MedicineEntryAutomationLearningState) => {
    if (typeof window === 'undefined') {
        return;
    }
    try {
        window.localStorage.setItem(MEDICINE_ENTRY_AUTOMATION_LEARNING_STORAGE_KEY, JSON.stringify(state));
    }
    catch {
        // Keep the in-memory state only when persistence is unavailable.
    }
};
export const resetMedicineEntryAutomationLearningState = (): MedicineEntryAutomationLearningState => {
    if (typeof window !== 'undefined') {
        try {
            window.localStorage.removeItem(MEDICINE_ENTRY_AUTOMATION_LEARNING_STORAGE_KEY);
        }
        catch {
            // Ignore storage failures.
        }
    }
    return DEFAULT_LEARNING_STATE;
};
export const incrementMedicineEntryAutomationLearningState = (adaptiveThreshold: number = DEFAULT_MEDICINE_ENTRY_AUTOMATION_SETTINGS.adaptiveThreshold): MedicineEntryAutomationLearningState => {
    const current = readMedicineEntryAutomationLearningState(adaptiveThreshold);
    const next: MedicineEntryAutomationLearningState = {
        manualScrollCount: current.manualScrollCount + 1,
        learnedAutoScroll: current.learnedAutoScroll || current.manualScrollCount + 1 >= adaptiveThreshold,
    };
    writeMedicineEntryAutomationLearningState(next);
    return next;
};
