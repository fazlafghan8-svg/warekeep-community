import type { AppSettings, MedicineUnit } from '@/types';
export const DEFAULT_MEDICINE_UNITS: MedicineUnit[] = [
    '\u0628\u0633\u062a\u0647',
    '\u0628\u0648\u062a\u0644',
    '\u0648\u0631\u0642',
    '\u062f\u0627\u0646\u0647',
    '\u06a9\u0627\u0631\u062a\u0646',
    '\u062a\u06cc\u0648\u067e',
    '\u0648\u06cc\u0627\u0644',
    '\u0642\u0648\u0637\u06cc',
    '\u0633\u062a'
];
const PACKAGE_LIKE_UNITS = new Set([
    '\u0628\u0633\u062a\u0647',
    '\u06a9\u0627\u0631\u062a\u0646',
    'pack',
    'package',
    'box',
    'carton'
]);
export const normalizeMedicineUnitName = (value: unknown): MedicineUnit => (String(value || '').trim().replace(/\s+/g, ' ') as MedicineUnit);
const normalizeUnitKey = (value: unknown) => normalizeMedicineUnitName(value).toLowerCase();
export const getUniqueMedicineUnits = (units: unknown[]): MedicineUnit[] => {
    const seen = new Set<string>();
    const result: MedicineUnit[] = [];
    units.forEach((unit) => {
        const normalized = normalizeMedicineUnitName(unit);
        if (!normalized)
            return;
        const key = normalizeUnitKey(normalized);
        if (seen.has(key))
            return;
        seen.add(key);
        result.push(normalized);
    });
    return result;
};
export const getCustomMedicineUnits = (settings?: Pick<AppSettings, 'customMedicineUnits'> | null): MedicineUnit[] => (getUniqueMedicineUnits(settings?.customMedicineUnits || []));
export const getMedicineUnitOptions = (settings?: Pick<AppSettings, 'customMedicineUnits'> | null, extraUnits: unknown[] = []): MedicineUnit[] => (getUniqueMedicineUnits([...DEFAULT_MEDICINE_UNITS, ...getCustomMedicineUnits(settings), ...extraUnits]));
export const isDefaultMedicineUnit = (unit: unknown): boolean => {
    const key = normalizeUnitKey(unit);
    return DEFAULT_MEDICINE_UNITS.some((defaultUnit) => normalizeUnitKey(defaultUnit) === key);
};
export const isPackageLikeMedicineUnit = (unit: unknown): boolean => PACKAGE_LIKE_UNITS.has(normalizeUnitKey(unit));
export const getMedicineUnitLabel = (unit: unknown, isEnglish = false): string => {
    const normalized = normalizeMedicineUnitName(unit);
    if (!isEnglish)
        return normalized;
    const map: Record<string, string> = {
        '\u0628\u0633\u062a\u0647': 'Pack',
        '\u0628\u0648\u062a\u0644': 'Bottle',
        '\u0648\u0631\u0642': 'Sheet',
        '\u062f\u0627\u0646\u0647': 'Pcs',
        '\u06a9\u0627\u0631\u062a\u0646': 'Carton',
        '\u062a\u06cc\u0648\u067e': 'Tube',
        '\u0648\u06cc\u0627\u0644': 'Vial',
        '\u0642\u0648\u0637\u06cc': 'Can',
        '\u0633\u062a': 'Set'
    };
    return map[normalized] || normalized;
};
export const withCustomMedicineUnit = <T extends Pick<AppSettings, 'customMedicineUnits'>>(settings: T, unit: unknown): T => {
    const normalized = normalizeMedicineUnitName(unit);
    if (!normalized || isDefaultMedicineUnit(normalized))
        return settings;
    const nextUnits = getUniqueMedicineUnits([...(settings.customMedicineUnits || []), normalized]);
    if (nextUnits.length === (settings.customMedicineUnits || []).length)
        return settings;
    return {
        ...settings,
        customMedicineUnits: nextUnits
    };
};
