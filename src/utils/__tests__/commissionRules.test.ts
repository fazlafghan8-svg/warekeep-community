import { describe, expect, it } from 'vitest';
import type { AppSettings, Medicine } from '../../types';
import {
  calculateAdjustedCommissionRate,
  calculateInvoiceItemCommissionRate,
  normalizeMedicineCommissionRules,
  normalizeProductCommissionAdjustmentRules,
  resolveCommissionAdjustmentForItem,
} from '../commissionRules';

const makeMedicine = (overrides: Partial<Medicine> = {}): Medicine => ({
  id: 'med-1',
  name: 'Pure-C',
  manufacturer: 'BBP',
  type: 'Powder',
  unit: 'bottle' as any,
  batches: [],
  salePrices: { retail: 100, wholesale: 90, bulk: 80 },
  lowStockThreshold: 1,
  ...overrides,
});

const settings = (commissionRules: AppSettings['commissionRules']): Pick<AppSettings, 'commissionRules'> => ({
  commissionRules,
});

describe('commissionRules', () => {
  it('resolves precedence from medicine+staff down to medicine type', () => {
    const medicine = makeMedicine({
      commissionRules: [
        { id: 'med-all', adjustmentPercent: 4, enabled: true },
        { id: 'med-staff', userId: 'u1', adjustmentPercent: 8, enabled: true },
      ],
    });
    const appSettings = settings([
      { id: 'man-staff', target: 'manufacturer', targetValue: 'BBP', userId: 'u1', adjustmentPercent: 6, enabled: true },
      { id: 'type-all', target: 'medicineType', targetValue: 'Powder', adjustmentPercent: 2, enabled: true },
    ]);

    expect(resolveCommissionAdjustmentForItem(medicine, appSettings, 'u1')).toMatchObject({
      adjustmentPercent: 8,
      source: 'medicine-user',
    });
    expect(resolveCommissionAdjustmentForItem(medicine, appSettings, 'u2')).toMatchObject({
      adjustmentPercent: 4,
      source: 'medicine',
    });
  });

  it('falls back through manufacturer and type rules without stacking them', () => {
    const medicine = makeMedicine();
    const appSettings = settings([
      { id: 'man-staff', target: 'manufacturer', targetValue: 'bbp', userId: 'u1', adjustmentPercent: 6, enabled: true },
      { id: 'man-all', target: 'manufacturer', targetValue: 'BBP', adjustmentPercent: 5, enabled: true },
      { id: 'type-staff', target: 'medicineType', targetValue: 'Powder', userId: 'u1', adjustmentPercent: 3, enabled: true },
      { id: 'type-all', target: 'medicineType', targetValue: 'Powder', adjustmentPercent: 2, enabled: true },
    ]);

    expect(resolveCommissionAdjustmentForItem(medicine, appSettings, 'u1')).toMatchObject({
      adjustmentPercent: 6,
      source: 'manufacturer-user',
    });
    expect(resolveCommissionAdjustmentForItem(medicine, appSettings, 'u2')).toMatchObject({
      adjustmentPercent: 5,
      source: 'manufacturer',
    });
  });

  it('resolves supplier rules before manufacturer and can set a fixed final rate', () => {
    const medicine = makeMedicine({ preferredSupplierId: 'sup-1' });
    const appSettings = settings([
      { id: 'supplier-staff', target: 'supplier', targetValue: 'sup-1', targetLabel: 'Green Supplier', userId: 'u1', adjustmentPercent: 15, mode: 'override', enabled: true },
      { id: 'manufacturer-all', target: 'manufacturer', targetValue: 'BBP', adjustmentPercent: 5, enabled: true },
    ]);

    const resolved = resolveCommissionAdjustmentForItem(medicine, appSettings, 'u1', {
      supplierId: 'sup-1',
      supplierName: 'Green Supplier',
    });

    expect(resolved).toMatchObject({
      adjustmentPercent: 0,
      overridePercent: 15,
      mode: 'override',
      source: 'supplier-user',
    });
    expect(calculateInvoiceItemCommissionRate(10, {
      commissionRuleMode: 'override',
      commissionOverridePercent: 15,
      commissionAdjustmentPercent: 0,
    })).toBe(15);
  });

  it('supports positive and negative adjustments and clamps final rates', () => {
    expect(calculateAdjustedCommissionRate(10, 5)).toBe(15);
    expect(calculateAdjustedCommissionRate(10, -3)).toBe(7);
    expect(calculateAdjustedCommissionRate(98, 5)).toBe(100);
    expect(calculateAdjustedCommissionRate(2, -10)).toBe(0);
  });

  it('normalizes rules and removes disabled zero-effect rows', () => {
    expect(normalizeMedicineCommissionRules([
      { id: 'keep', adjustmentPercent: '-3', enabled: true },
      { id: 'drop', adjustmentPercent: 0 },
    ])).toEqual([
      { id: 'keep', userId: undefined, adjustmentPercent: -3, enabled: true, note: undefined, updatedAt: undefined },
    ]);

    expect(normalizeProductCommissionAdjustmentRules([
      { id: 'group', target: 'manufacturer', targetValue: ' BBP ', adjustmentPercent: '+101' },
      { id: 'supplier', target: 'supplier', targetValue: 'sup-1', targetLabel: 'Green Supplier', adjustmentPercent: 0, mode: 'override' },
      { id: 'bad', target: 'manufacturer', targetValue: '', adjustmentPercent: 4 },
    ])).toMatchObject([
      { id: 'group', target: 'manufacturer', targetValue: 'BBP', adjustmentPercent: 100 },
      { id: 'supplier', target: 'supplier', targetValue: 'sup-1', targetLabel: 'Green Supplier', adjustmentPercent: 0, mode: 'override' },
    ]);
  });
});
