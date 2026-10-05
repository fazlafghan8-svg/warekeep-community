import type { InvoiceItem, Medicine, ProductSaleUnit } from '@/types';
import { getMedicineUnitLabel } from '@/constants/medicineUnits';
const DEFAULT_BASE_UNIT = 'piece';
const DARI_PACKAGE_UNIT = '\u0628\u0633\u062a\u0647';
const DARI_CARTON_UNIT = '\u06a9\u0627\u0631\u062a\u0646';
const DARI_PIECE_UNIT = '\u062f\u0627\u0646\u0647';
const DARI_TABLET_UNIT = '\u0642\u0631\u0635';
const DARI_STRIP_UNIT = '\u0648\u0631\u0642';
const toSafePositive = (value: unknown, fallback = 1) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const normalizeUnitName = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeUnitKey = (value: unknown) => normalizeUnitName(value).replace(/\s+/g, ' ');
const PACKAGE_UNIT_KEYS = new Set([
    'pack',
    'package',
    'box',
    'carton',
    DARI_PACKAGE_UNIT,
    DARI_CARTON_UNIT,
    '\u0628\u0627\u06a9\u0633',
]);
const PIECE_UNIT_KEYS = new Set([
    'piece',
    'pc',
    'pcs',
    'tablet',
    'tab',
    DARI_PIECE_UNIT,
    DARI_TABLET_UNIT,
]);
const STRIP_UNIT_KEYS = new Set([
    'strip',
    'blister',
    DARI_STRIP_UNIT,
]);
const isPackageUnitName = (value: unknown) => PACKAGE_UNIT_KEYS.has(normalizeUnitKey(value));
const isPieceUnitName = (value: unknown) => PIECE_UNIT_KEYS.has(normalizeUnitKey(value));
const isStripUnitName = (value: unknown) => STRIP_UNIT_KEYS.has(normalizeUnitKey(value));
// Dari display labels for well-known English unit names, matching the Dari
// labels this module already assigns to derived units (piece/strip/box).
const UNIT_DISPLAY_LABELS: Record<string, string> = {
    piece: DARI_PIECE_UNIT,
    pc: DARI_PIECE_UNIT,
    pcs: DARI_PIECE_UNIT,
    tablet: DARI_TABLET_UNIT,
    tab: DARI_TABLET_UNIT,
    strip: DARI_STRIP_UNIT,
    blister: DARI_STRIP_UNIT,
    box: DARI_PACKAGE_UNIT,
    pack: DARI_PACKAGE_UNIT,
    package: DARI_PACKAGE_UNIT,
    carton: DARI_CARTON_UNIT,
    bottle: 'بوتل',
    ml: 'ملی‌لیتر',
};
const toUnitDisplayLabel = (unitName: string): string => UNIT_DISPLAY_LABELS[normalizeUnitKey(unitName)] || unitName;
const isPackageBackedMedicine = (medicine?: Pick<Medicine, 'baseUnit' | 'unit' | 'itemsPerBox'> | null): boolean => {
    const itemsPerBox = toSafePositive(medicine?.itemsPerBox, 0);
    return itemsPerBox > 1 && (isPackageUnitName(medicine?.baseUnit) || isPackageUnitName(medicine?.unit));
};
const QUANTITY_DECIMALS = 6;
export const roundBaseQuantity = (value: unknown): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
        return 0;
    const factor = 10 ** QUANTITY_DECIMALS;
    return Math.round(Math.max(0, parsed) * factor + Number.EPSILON) / factor;
};
export const getMedicineBaseUnit = (medicine?: Pick<Medicine, 'baseUnit' | 'unit'> | null): string => (String(medicine?.baseUnit || medicine?.unit || DEFAULT_BASE_UNIT).trim() || DEFAULT_BASE_UNIT);
export const normalizeSaleUnits = (medicine?: Pick<Medicine, 'baseUnit' | 'unit' | 'itemsPerBox' | 'saleUnits'> | null): ProductSaleUnit[] => {
    const baseUnit = getMedicineBaseUnit(medicine);
    const packageBacked = isPackageBackedMedicine(medicine);
    const seen = new Set<string>();
    const units: ProductSaleUnit[] = [];
    const addUnit = (unit: Partial<ProductSaleUnit>) => {
        const unitName = String(unit.unitName || unit.label || '').trim();
        if (!unitName)
            return;
        const key = normalizeUnitName(unitName);
        if (seen.has(key))
            return;
        seen.add(key);
        units.push({
            unitName,
            label: unit.label || unitName,
            conversionFactor: toSafePositive(unit.conversionFactor),
            barcode: unit.barcode,
            isDefault: Boolean(unit.isDefault)
        });
    };
    addUnit({ unitName: baseUnit, label: toUnitDisplayLabel(baseUnit), conversionFactor: 1, isDefault: true });
    if (medicine?.unit && normalizeUnitName(medicine.unit) !== normalizeUnitName(baseUnit)) {
        addUnit({ unitName: medicine.unit, label: toUnitDisplayLabel(medicine.unit), conversionFactor: 1 });
    }
    const itemsPerBox = toSafePositive(medicine?.itemsPerBox, 0);
    if (packageBacked) {
        addUnit({ unitName: 'piece', label: DARI_PIECE_UNIT, conversionFactor: 1 / itemsPerBox });
        if (itemsPerBox >= 10) {
            addUnit({ unitName: 'strip', label: DARI_STRIP_UNIT, conversionFactor: 10 / itemsPerBox });
        }
    }
    (medicine?.saleUnits || []).forEach((unit) => {
        if (packageBacked
            && (isPackageUnitName(unit.unitName || unit.label) || isPieceUnitName(unit.unitName || unit.label) || isStripUnitName(unit.unitName || unit.label))) {
            return;
        }
        addUnit(unit);
    });
    if (!packageBacked && itemsPerBox > 1) {
        addUnit({ unitName: 'box', label: DARI_PACKAGE_UNIT, conversionFactor: itemsPerBox });
        if (itemsPerBox >= 10) {
            addUnit({ unitName: 'strip', label: DARI_STRIP_UNIT, conversionFactor: 10 });
        }
    }
    return units.sort((left, right) => {
        if (left.isDefault && !right.isDefault)
            return -1;
        if (!left.isDefault && right.isDefault)
            return 1;
        return left.conversionFactor - right.conversionFactor;
    });
};
export const resolveSaleUnit = (medicine: Pick<Medicine, 'baseUnit' | 'unit' | 'itemsPerBox' | 'saleUnits'> | null | undefined, unitName?: string): ProductSaleUnit => {
    const units = normalizeSaleUnits(medicine);
    const requested = normalizeUnitName(unitName);
    return units.find((unit) => normalizeUnitName(unit.unitName) === requested)
        || units.find((unit) => unit.isDefault)
        || units[0]
        || { unitName: getMedicineBaseUnit(medicine), label: getMedicineBaseUnit(medicine), conversionFactor: 1, isDefault: true };
};
export const toBaseQuantity = (quantity: unknown, saleUnit?: Pick<ProductSaleUnit, 'conversionFactor'>): number => {
    const parsed = Number(quantity);
    const safeQuantity = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    return roundBaseQuantity(safeQuantity * toSafePositive(saleUnit?.conversionFactor));
};
export const getInvoiceItemBaseQuantity = (item: Pick<InvoiceItem, 'quantity' | 'baseQuantity' | 'saleUnitConversionFactor'>): number => {
    const explicitBase = Number(item.baseQuantity);
    if (Number.isFinite(explicitBase) && explicitBase > 0)
        return roundBaseQuantity(explicitBase);
    return toBaseQuantity(item.quantity, { conversionFactor: item.saleUnitConversionFactor || 1 });
};
/** Translate built-in display labels while leaving custom unit names intact. */
export const getSaleUnitDisplayLabel = (label: string, isEnglish = false): string => {
    if (!isEnglish) return label;
    const extraLabels: Record<string, string> = { 'قرص': 'Tablet', 'ملی‌لیتر': 'mL', 'باکس': 'Box' };
    return extraLabels[label] || getMedicineUnitLabel(label, true);
};
export const describeInvoiceItemUnit = (item: Pick<InvoiceItem, 'saleUnitLabel' | 'saleUnitName' | 'baseUnit' | 'saleUnitConversionFactor'>, isEnglish = false): string => {
    const unit = getSaleUnitDisplayLabel(item.saleUnitLabel || item.saleUnitName || item.baseUnit || DEFAULT_BASE_UNIT, isEnglish);
    const factor = toSafePositive(item.saleUnitConversionFactor);
    return factor > 1 ? `${unit} x${factor}` : unit;
};
