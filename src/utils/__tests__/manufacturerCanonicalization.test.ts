import { describe, expect, it } from 'vitest';
import type { Medicine } from '../../types';
import {
  buildManufacturerDirectory,
  buildManufacturerDirectoryFromNames,
  canonicalizeManufacturerName,
  canonicalizeMedicineManufacturers,
  matchesManufacturerSearch
} from '../manufacturerCanonicalization';

const makeMedicine = (overrides: Partial<Medicine> = {}): Medicine => ({
  id: 'med-1',
  name: 'Test Medicine',
  genericName: '',
  manufacturer: 'Bless Bee Pharmaceuticals',
  type: 'Tablet',
  unit: 'بسته' as any,
  batches: [],
  salePrices: {
    retail: 10,
    wholesale: 9,
    bulk: 8
  },
  lowStockThreshold: 1,
  ...overrides
});

describe('manufacturer canonicalization', () => {
  it('collapses case, punctuation and spacing variants to one canonical display name', () => {
    const directory = buildManufacturerDirectoryFromNames([
      'Bless Bee Pharmaceuticals',
      ' bless   bee pharmaceuticals ',
      'BLESSBEE',
      '.Bless Bee Pharmaceuticals Ltd'
    ]);

    expect(directory.canonicalNames).toContain('Bless Bee Pharmaceuticals Ltd');
    expect(canonicalizeManufacturerName('BLESSBEE', directory).displayName).toBe('Bless Bee Pharmaceuticals Ltd');
    expect(canonicalizeManufacturerName('.Bless Bee Pharmaceuticals Ltd', directory).displayName).toBe('Bless Bee Pharmaceuticals Ltd');
  });

  it('normalizes pharma/pharmaceutical tokens and keeps search working for legacy variants', () => {
    const directory = buildManufacturerDirectoryFromNames([
      'Alpha Star Pharmaceutical Co Ltd',
      'Alpha Star Pharma'
    ]);

    expect(canonicalizeManufacturerName('alpha star pharma', directory).displayName).toBe('Alpha Star Pharmaceutical Co Ltd');
    expect(matchesManufacturerSearch('Alpha Star Pharmaceutical Co Ltd', 'alpha star pharma', directory)).toBe(true);
  });

  it('does not merge distinct companies that only look similar', () => {
    const directory = buildManufacturerDirectoryFromNames([
      'Indofarma',
      'Indofarm'
    ]);

    expect(directory.canonicalNames).toHaveLength(2);
    expect(canonicalizeManufacturerName('Indofarm', directory).displayName).toBe('Indofarm');
  });

  it('does not snap weak generic company labels to an existing canonical manufacturer', () => {
    const directory = buildManufacturerDirectoryFromNames([
      'Alpha Star Pharmaceutical Co Ltd',
      'Beta Health Distribution Company'
    ]);

    expect(canonicalizeManufacturerName('company', directory).displayName).toBe('company');
    expect(canonicalizeManufacturerName('شرکت', directory).displayName).toBe('شرکت');
  });

  it('canonicalizes medicine arrays and reports how many rows changed', () => {
    const normalized = canonicalizeMedicineManufacturers([
      makeMedicine({ id: 'med-1', manufacturer: 'Bless Bee Pharmaceuticals' }),
      makeMedicine({ id: 'med-2', manufacturer: 'BLESSBEE' }),
      makeMedicine({ id: 'med-3', manufacturer: '.Bless Bee Pharmaceuticals Ltd' })
    ]);

    expect(normalized.changedCount).toBe(3);
    expect(normalized.medicines.map((medicine) => medicine.manufacturer)).toEqual([
      'Bless Bee Pharmaceuticals Ltd',
      'Bless Bee Pharmaceuticals Ltd',
      'Bless Bee Pharmaceuticals Ltd'
    ]);
  });

  it('ignores malformed medicine manufacturer values when building directories', () => {
    const directory = buildManufacturerDirectory([
      makeMedicine({ manufacturer: 'Example Pharma Ltd' }),
      { manufacturer: undefined as unknown as string },
      null,
      undefined
    ]);

    expect(directory.canonicalNames).toEqual(['Example Pharma Ltd']);
    expect(canonicalizeMedicineManufacturers([
      makeMedicine({ id: 'med-1', manufacturer: 'Example Pharma Ltd' }),
      { ...makeMedicine({ id: 'med-2' }), manufacturer: undefined as unknown as string }
    ]).changedCount).toBe(0);
  });
});
