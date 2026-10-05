import { describe, expect, it } from 'vitest';
import type { Medicine } from '../../types';
import {
  getInvoiceItemBaseQuantity,
  describeInvoiceItemUnit,
  getSaleUnitDisplayLabel,
  normalizeSaleUnits,
  resolveSaleUnit,
  roundBaseQuantity,
  toBaseQuantity,
} from '../unitConversion';

const medicine = (overrides: Partial<Medicine> = {}): Medicine => ({
  id: 'med-1',
  name: 'Amoxicillin',
  manufacturer: 'ACME',
  type: 'Tablet',
  unit: 'tablet' as Medicine['unit'],
  baseUnit: 'tablet',
  itemsPerBox: 100,
  saleUnits: [
    { unitName: 'strip', label: 'Strip', conversionFactor: 10 },
    { unitName: 'box', label: 'Box', conversionFactor: 100 },
  ],
  batches: [],
  salePrices: { retail: 2, wholesale: 1.8, bulk: 1.5 },
  lowStockThreshold: 10,
  ...overrides,
});

const packageMedicine = (overrides: Partial<Medicine> = {}): Medicine => medicine({
  unit: '\u0628\u0633\u062a\u0647' as Medicine['unit'],
  baseUnit: '\u0628\u0633\u062a\u0647',
  itemsPerBox: 100,
  saleUnits: [],
  salePrices: { retail: 950, wholesale: 900, bulk: 850 },
  ...overrides,
});

describe('unitConversion', () => {
  it('shows built-in units in English without changing conversion or custom unit labels', () => {
    const item = { saleUnitLabel: 'دانه', saleUnitName: 'piece', baseUnit: 'بسته', saleUnitConversionFactor: 0.01 };
    expect(describeInvoiceItemUnit(item, true)).toBe('Pcs');
    expect(describeInvoiceItemUnit(item, false)).toBe('دانه');
    expect(getSaleUnitDisplayLabel('Custom patient pack', true)).toBe('Custom patient pack');
    expect(getSaleUnitDisplayLabel('بستهٔ مخصوص من', true)).toBe('بستهٔ مخصوص من');
    expect(item.saleUnitConversionFactor).toBe(0.01);
  });
  it('normalizes base, strip, and box units without duplicates', () => {
    const units = normalizeSaleUnits(medicine());

    expect(units.map((unit) => unit.unitName)).toEqual(['tablet', 'strip', 'box']);
    expect(units.find((unit) => unit.unitName === 'box')?.conversionFactor).toBe(100);
  });

  it('converts entered sale quantity into base stock quantity', () => {
    const box = resolveSaleUnit(medicine(), 'box');
    const strip = resolveSaleUnit(medicine(), 'strip');

    expect(toBaseQuantity(1, box)).toBe(100);
    expect(toBaseQuantity(2, strip)).toBe(20);
  });

  it('uses stored baseQuantity before falling back to sale unit factor', () => {
    expect(getInvoiceItemBaseQuantity({ quantity: 1, baseQuantity: 100, saleUnitConversionFactor: 10 })).toBe(100);
    expect(getInvoiceItemBaseQuantity({ quantity: 2, saleUnitConversionFactor: 10 })).toBe(20);
  });

  it('rounds stock quantities independently from money decimals', () => {
    expect(roundBaseQuantity(1.23456789)).toBe(1.234568);
    expect(toBaseQuantity(0.5, { conversionFactor: 2.5 })).toBe(1.25);
  });

  it('keeps package inventory as the base unit while exposing piece and strip sale units', () => {
    const units = normalizeSaleUnits(packageMedicine({
      saleUnits: [
        { unitName: 'box', label: 'Box', conversionFactor: 100 },
        { unitName: 'strip', label: 'Strip', conversionFactor: 10 },
      ],
    }));

    expect(units.map((unit) => unit.unitName)).toEqual(['\u0628\u0633\u062a\u0647', 'piece', 'strip']);
    expect(resolveSaleUnit(packageMedicine(), '\u0628\u0633\u062a\u0647').conversionFactor).toBe(1);
    expect(resolveSaleUnit(packageMedicine(), 'piece').conversionFactor).toBe(0.01);
    expect(resolveSaleUnit(packageMedicine(), 'strip').conversionFactor).toBe(0.1);
    expect(toBaseQuantity(10, resolveSaleUnit(packageMedicine(), 'piece'))).toBe(0.1);
    expect(toBaseQuantity(1, resolveSaleUnit(packageMedicine(), 'strip'))).toBe(0.1);
  });
});
