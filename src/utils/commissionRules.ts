import { AppSettings, CommissionRuleMode, CommissionRuleSource, InvoiceItem, Medicine, MedicineCommissionRule, ProductCommissionAdjustmentRule } from '../types';
export type ResolvedCommissionAdjustment = {
    adjustmentPercent: number;
    overridePercent?: number;
    mode: CommissionRuleMode;
    source: CommissionRuleSource;
    label: string;
};
export type CommissionRuleContext = {
    supplierId?: string | null;
    supplierName?: string | null;
};
const COMMISSION_ADJUSTMENT_MIN = -100;
const COMMISSION_ADJUSTMENT_MAX = 100;
const normalizeText = (value: unknown) => String(value || '').trim();
const normalizeLookupText = (value: unknown) => normalizeText(value).toLowerCase();
const toFiniteNumber = (value: unknown, fallback = 0) => {
    const numeric = typeof value === 'string' ? Number(value.trim()) : Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};
export const clampCommissionRate = (value: unknown) => {
    const numeric = toFiniteNumber(value, 0);
    return Math.min(100, Math.max(0, numeric));
};
export const normalizeCommissionAdjustmentPercent = (value: unknown) => {
    const numeric = toFiniteNumber(value, 0);
    return Math.min(COMMISSION_ADJUSTMENT_MAX, Math.max(COMMISSION_ADJUSTMENT_MIN, numeric));
};
export const calculateAdjustedCommissionRate = (baseRate: unknown, adjustmentPercent: unknown) => clampCommissionRate(toFiniteNumber(baseRate, 0) + normalizeCommissionAdjustmentPercent(adjustmentPercent));
export const getInvoiceItemCommissionAdjustment = (item?: Pick<InvoiceItem, 'commissionAdjustmentPercent'> | null) => normalizeCommissionAdjustmentPercent(item?.commissionAdjustmentPercent ?? 0);
export const getInvoiceItemCommissionOverride = (item?: Pick<InvoiceItem, 'commissionOverridePercent'> | null) => {
    if (item?.commissionOverridePercent === undefined || item.commissionOverridePercent === null)
        return undefined;
    return clampCommissionRate(item.commissionOverridePercent);
};
export const getInvoiceItemCommissionRuleMode = (item?: Pick<InvoiceItem, 'commissionRuleMode' | 'commissionOverridePercent'> | null): CommissionRuleMode => item?.commissionRuleMode === 'override' && getInvoiceItemCommissionOverride(item) !== undefined ? 'override' : 'adjustment';
export const calculateInvoiceItemCommissionRate = (baseRate: unknown, item?: Pick<InvoiceItem, 'commissionAdjustmentPercent' | 'commissionOverridePercent' | 'commissionRuleMode'> | null) => {
    const overridePercent = getInvoiceItemCommissionOverride(item);
    if (getInvoiceItemCommissionRuleMode(item) === 'override' && overridePercent !== undefined) {
        return overridePercent;
    }
    return calculateAdjustedCommissionRate(baseRate, getInvoiceItemCommissionAdjustment(item));
};
export const normalizeMedicineCommissionRules = (rules: unknown): MedicineCommissionRule[] => {
    if (!Array.isArray(rules))
        return [];
    return rules
        .map((rule, index): MedicineCommissionRule | null => {
        if (!rule || typeof rule !== 'object')
            return null;
        const candidate = rule as Partial<MedicineCommissionRule>;
        const adjustmentPercent = normalizeCommissionAdjustmentPercent(candidate.adjustmentPercent);
        if (adjustmentPercent === 0)
            return null;
        return {
            id: normalizeText(candidate.id) || `medicine-commission-${index + 1}`,
            userId: normalizeText(candidate.userId) || undefined,
            adjustmentPercent,
            enabled: candidate.enabled === false ? false : true,
            note: normalizeText(candidate.note) || undefined,
            updatedAt: normalizeText(candidate.updatedAt) || undefined,
        };
    })
        .filter((rule): rule is MedicineCommissionRule => !!rule);
};
export const normalizeProductCommissionAdjustmentRules = (rules: unknown): ProductCommissionAdjustmentRule[] => {
    if (!Array.isArray(rules))
        return [];
    return rules
        .map((rule, index): ProductCommissionAdjustmentRule | null => {
        if (!rule || typeof rule !== 'object')
            return null;
        const candidate = rule as Partial<ProductCommissionAdjustmentRule>;
        const target = candidate.target === 'supplier'
            ? 'supplier'
            : candidate.target === 'manufacturer'
                ? 'manufacturer'
                : candidate.target === 'medicineType'
                    ? 'medicineType'
                    : null;
        const targetValue = normalizeText(candidate.targetValue);
        const mode: CommissionRuleMode = candidate.mode === 'override' ? 'override' : 'adjustment';
        const adjustmentPercent = mode === 'override'
            ? clampCommissionRate(candidate.adjustmentPercent)
            : normalizeCommissionAdjustmentPercent(candidate.adjustmentPercent);
        if (!target || !targetValue || (mode === 'adjustment' && adjustmentPercent === 0))
            return null;
        return {
            id: normalizeText(candidate.id) || `product-commission-${index + 1}`,
            target,
            targetValue,
            targetLabel: normalizeText(candidate.targetLabel) || undefined,
            userId: normalizeText(candidate.userId) || undefined,
            adjustmentPercent,
            mode,
            enabled: candidate.enabled === false ? false : true,
            note: normalizeText(candidate.note) || undefined,
            updatedAt: normalizeText(candidate.updatedAt) || undefined,
        };
    })
        .filter((rule): rule is ProductCommissionAdjustmentRule => !!rule);
};
const findMedicineRule = (medicineRules: MedicineCommissionRule[], userId: string | undefined, userSpecific: boolean) => medicineRules.find((rule) => {
    if (rule.enabled === false)
        return false;
    const ruleUserId = normalizeText(rule.userId);
    return userSpecific ? !!userId && ruleUserId === userId : !ruleUserId;
});
const findGroupRule = (rules: ProductCommissionAdjustmentRule[], target: ProductCommissionAdjustmentRule['target'], targetValue: unknown | unknown[], userId: string | undefined, userSpecific: boolean) => {
    const normalizedTargetValues = (Array.isArray(targetValue) ? targetValue : [targetValue])
        .map(normalizeLookupText)
        .filter(Boolean);
    if (!normalizedTargetValues.length)
        return undefined;
    return rules.find((rule) => {
        if (rule.enabled === false || rule.target !== target)
            return false;
        const normalizedRuleValue = normalizeLookupText(rule.targetValue);
        const normalizedRuleLabel = normalizeLookupText(rule.targetLabel);
        if (!normalizedTargetValues.includes(normalizedRuleValue) && (!normalizedRuleLabel || !normalizedTargetValues.includes(normalizedRuleLabel)))
            return false;
        const ruleUserId = normalizeText(rule.userId);
        return userSpecific ? !!userId && ruleUserId === userId : !ruleUserId;
    });
};
const buildLabel = (source: CommissionRuleSource, rule: {
    note?: string;
    targetValue?: string;
    targetLabel?: string;
    mode?: CommissionRuleMode;
    adjustmentPercent?: number;
}, medicine?: Medicine) => {
    const note = normalizeText(rule.note);
    if (note)
        return note;
    const targetLabel = normalizeText(rule.targetLabel) || normalizeText(rule.targetValue);
    const suffix = rule.mode === 'override'
        ? `final ${clampCommissionRate(rule.adjustmentPercent)}%`
        : 'adjustment';
    switch (source) {
        case 'medicine-user':
            return `Medicine rule for ${medicine?.name || 'item'} and staff`;
        case 'medicine':
            return `Medicine rule for ${medicine?.name || 'item'}`;
        case 'supplier-user':
            return `Supplier rule for ${targetLabel || 'supplier'} and staff (${suffix})`;
        case 'supplier':
            return `Supplier rule for ${targetLabel || 'supplier'} (${suffix})`;
        case 'manufacturer-user':
            return `Manufacturer rule for ${targetLabel || medicine?.manufacturer || 'item'} and staff (${suffix})`;
        case 'manufacturer':
            return `Manufacturer rule for ${targetLabel || medicine?.manufacturer || 'item'} (${suffix})`;
        case 'medicine-type-user':
            return `Medicine type rule for ${targetLabel || medicine?.type || 'item'} and staff (${suffix})`;
        case 'medicine-type':
            return `Medicine type rule for ${targetLabel || medicine?.type || 'item'} (${suffix})`;
        default:
            return 'No medicine commission adjustment';
    }
};
const resolved = (source: CommissionRuleSource, rule: MedicineCommissionRule | ProductCommissionAdjustmentRule | null, medicine?: Medicine): ResolvedCommissionAdjustment => ({
    adjustmentPercent: rule && 'mode' in rule && rule.mode === 'override' ? 0 : normalizeCommissionAdjustmentPercent(rule?.adjustmentPercent ?? 0),
    overridePercent: rule && 'mode' in rule && rule.mode === 'override' ? clampCommissionRate(rule.adjustmentPercent) : undefined,
    mode: rule && 'mode' in rule && rule.mode === 'override' ? 'override' : 'adjustment',
    source,
    label: rule ? buildLabel(source, rule, medicine) : buildLabel('none', {}, medicine),
});
export const resolveCommissionAdjustmentForItem = (medicine: Medicine | null | undefined, settings: Pick<AppSettings, 'commissionRules'> | null | undefined, userId?: string | null, context: CommissionRuleContext = {}): ResolvedCommissionAdjustment => {
    if (!medicine)
        return resolved('none', null);
    const normalizedUserId = normalizeText(userId) || undefined;
    const medicineRules = normalizeMedicineCommissionRules(medicine.commissionRules);
    const groupRules = normalizeProductCommissionAdjustmentRules(settings?.commissionRules);
    const supplierTargets = [
        context.supplierId,
        context.supplierName,
        medicine.preferredSupplierId,
    ].map(normalizeText).filter(Boolean);
    const medicineUserRule = findMedicineRule(medicineRules, normalizedUserId, true);
    if (medicineUserRule)
        return resolved('medicine-user', medicineUserRule, medicine);
    const medicineRule = findMedicineRule(medicineRules, normalizedUserId, false);
    if (medicineRule)
        return resolved('medicine', medicineRule, medicine);
    const supplierUserRule = findGroupRule(groupRules, 'supplier', supplierTargets, normalizedUserId, true);
    if (supplierUserRule)
        return resolved('supplier-user', supplierUserRule, medicine);
    const supplierRule = findGroupRule(groupRules, 'supplier', supplierTargets, normalizedUserId, false);
    if (supplierRule)
        return resolved('supplier', supplierRule, medicine);
    const manufacturerUserRule = findGroupRule(groupRules, 'manufacturer', medicine.manufacturer, normalizedUserId, true);
    if (manufacturerUserRule)
        return resolved('manufacturer-user', manufacturerUserRule, medicine);
    const manufacturerRule = findGroupRule(groupRules, 'manufacturer', medicine.manufacturer, normalizedUserId, false);
    if (manufacturerRule)
        return resolved('manufacturer', manufacturerRule, medicine);
    const typeUserRule = findGroupRule(groupRules, 'medicineType', medicine.type, normalizedUserId, true);
    if (typeUserRule)
        return resolved('medicine-type-user', typeUserRule, medicine);
    const typeRule = findGroupRule(groupRules, 'medicineType', medicine.type, normalizedUserId, false);
    if (typeRule)
        return resolved('medicine-type', typeRule, medicine);
    return resolved('none', null, medicine);
};
export const buildInvoiceItemCommissionSnapshot = (medicine: Medicine | null | undefined, settings: Pick<AppSettings, 'commissionRules'> | null | undefined, userId?: string | null, context: CommissionRuleContext = {}) => {
    const rule = resolveCommissionAdjustmentForItem(medicine, settings, userId, context);
    return {
        commissionAdjustmentPercent: rule.adjustmentPercent,
        commissionOverridePercent: rule.overridePercent,
        commissionRuleMode: rule.mode,
        commissionRuleSource: rule.source,
        commissionRuleLabel: rule.label,
    };
};
