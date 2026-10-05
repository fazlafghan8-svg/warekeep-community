import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  importData,
  loadFromDisk,
  prepareImportedFullDataForRestore,
  sanitizeFullData,
  saveToDisk,
} from '../storageService';

vi.mock('../medicineTextSanitization', () => ({ sanitizeMedicineClinicalSummary: (value: any) => value }));

const snapshot = () => ({
  medicines: [{
    id: 'med-1', name: 'Existing medicine', batches: [],
    salePrices: { retail: 10, wholesale: 9, bulk: 8 },
  }],
  invoices: [{
    id: 'inv-1', items: [], total: 100, tax: 0, discount: 0,
    finalAmount: 100, amountPaid: 100, remainingAmount: 0,
    date: '2026-10-03T00:00:00.000Z',
  }],
  customers: [], expenses: [], suppliers: [], purchases: [], partners: [],
  auditEvents: [], stockMovements: [],
  settings: { language: 'dari' }, version: 1,
});

describe('malformed backup collections cannot erase existing data', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as any).electronAPI;
  });

  it.each(['medicines', 'invoices'])(
    'rejects a malformed %s backup before restore and leaves reload unchanged', async (collection) => {
      const userId = 'community-local';
      const storageKey = `warekeep_${userId}_full_backup`;
      await saveToDisk(snapshot(), userId);
      const before = localStorage.getItem(storageKey);
      const beforeReload = await loadFromDisk(userId);

      for (const malformed of [{ invalid: 'collection' }, null, [null], [42], [[]]]) {
        // The file reader accepts backups with settings; restore preparation must
        // reject this shape before allowWipe could persist an authoritative reset.
        const imported = await importData(new File(
          [JSON.stringify({ ...snapshot(), [collection]: malformed })],
          'malformed-backup.json', { type: 'application/json' }
        ));
        expect(() => prepareImportedFullDataForRestore(imported)).toThrow(/Integrity Fail/);
        await expect(saveToDisk(imported, userId, { allowWipe: true })).rejects.toThrow(/Integrity Fail/);
        expect(localStorage.getItem(storageKey)).toBe(before);
        expect(await loadFromDisk(userId)).toEqual(beforeReload);
      }
    }
  );

  it.each([
    'customers', 'expenses', 'suppliers', 'purchases', 'partners',
    'auditEvents', 'stockMovements',
    'treasuryTransactions', 'treasuryCashCounts', 'treasuryAccounts',
  ])('rejects a present malformed %s collection before normalization', (collection) => {
    for (const malformed of [{}, null, [null], [42], [[]]]) {
      expect(() => sanitizeFullData({ ...snapshot(), [collection]: malformed })).toThrow(/Integrity Fail/);
    }
  });

  it('restores an older backup whose newer collections are absent', async () => {
    const legacy = {
      medicines: snapshot().medicines,
      settings: { language: 'dari', storeName: 'Legacy pharmacy' },
    };
    const restored: any = prepareImportedFullDataForRestore(legacy);
    expect(restored.medicines.map((medicine: any) => medicine.id)).toEqual(['med-1']);
    expect(restored.invoices).toEqual([]);
    expect(restored.auditEvents).toEqual([]);
    expect(restored.stockMovements).toEqual([]);
    expect(restored).not.toHaveProperty('treasuryTransactions');
    expect(restored).not.toHaveProperty('treasuryCashCounts');
    expect(restored).not.toHaveProperty('treasuryAccounts');

    await saveToDisk(restored, 'community-local', { allowWipe: true });
    expect((await loadFromDisk('community-local'))?.medicines).toEqual(restored.medicines);
  });
});
