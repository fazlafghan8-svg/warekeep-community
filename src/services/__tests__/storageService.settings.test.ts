import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareImportedFullDataForRestore, sanitizeFullData, saveToDisk } from '../storageService';

const emptySnapshot = {
  medicines: [],
  customers: [],
  invoices: [],
  expenses: [],
  suppliers: [],
  purchases: [],
  partners: [],
  auditEvents: [],
  settings: {
    language: 'english',
    storeName: 'Reset Store',
  },
};

describe('storageService settings normalization', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('derives aiLanguage from english app language when aiLanguage is missing', () => {
    const sanitized = sanitizeFullData({
      medicines: [],
      customers: [],
      invoices: [],
      expenses: [],
      suppliers: [],
      purchases: [],
      settings: {
        language: 'english',
        medicineAiDefaultInput: 'text'
      }
    });

    expect(sanitized?.settings.aiLanguage).toBe('en');
  });

  it('blocks accidental full wipes unless allowWipe is explicitly passed', async () => {
    vi.useFakeTimers();
    localStorage.setItem('warekeep_reset-user_full_backup', JSON.stringify({
      medicines: Array.from({ length: 10 }, (_, index) => ({ id: `med-${index}` })),
    }));

    try {
      await expect(saveToDisk(emptySnapshot, 'reset-user')).rejects.toThrow('PERSIST_WIPE_BLOCKED');
      await expect(saveToDisk(emptySnapshot, 'reset-user', { allowWipe: true })).resolves.toBeUndefined();
      await vi.advanceTimersByTimeAsync(900);

      const saved = JSON.parse(localStorage.getItem('warekeep_reset-user_full_backup') || '{}');
      expect(saved.medicines).toEqual([]);
      expect(saved.settings.storeName).toBe('Reset Store');
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks single-record warehouse wipes while local warehouse work is pending', async () => {
    localStorage.setItem('warekeep_offline-user_full_backup', JSON.stringify({
      medicines: [{ id: 'med-1', name: 'Offline Medicine' }],
    }));
    localStorage.setItem('warekeep_persistent_sync_state_offline-user', JSON.stringify({
      warehouseOutbox: [{ id: 'op-1', kind: 'createMedicine' }],
      warehouseDurableJournal: [],
      warehouseSnapshotPendingAt: null,
    }));

    await expect(saveToDisk(emptySnapshot, 'offline-user')).rejects.toThrow('PERSIST_PENDING_WAREHOUSE_WIPE_BLOCKED');

    const saved = JSON.parse(localStorage.getItem('warekeep_offline-user_full_backup') || '{}');
    expect(saved.medicines).toHaveLength(1);
    expect(saved.medicines[0].name).toBe('Offline Medicine');
  });

  it('converts legacy imported medicine quantities into batches', () => {
    const restored = prepareImportedFullDataForRestore({
      medicines: Array.from({ length: 55 }, (_, index) => ({
        id: `med-${index + 1}`,
        name: `Medicine ${index + 1}`,
        quantity: String(index + 1),
        purchasePrice: '12',
        expiryDate: '2028-01-01',
      })),
      customers: [],
      invoices: [],
      expenses: [],
      suppliers: [],
      purchases: [],
      partners: [],
      settings: { language: 'english' },
    }, '2026-06-01T08:00:00.000Z');

    expect(restored?.medicines).toHaveLength(55);
    expect(restored?.medicines[0].batches[0]).toMatchObject({
      quantity: 1,
      purchasePrice: 12,
      expiryDate: '2028-01-01',
    });
    expect(restored?.medicines[54].batches[0].quantity).toBe(55);
    expect(Date.parse(restored?.medicines[0].updatedAt || '')).toBeGreaterThan(
      Date.parse(restored?.settings.collectionResetAt?.medicines || '')
    );
  });
});
