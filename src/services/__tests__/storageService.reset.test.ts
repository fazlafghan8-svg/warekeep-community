import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFromDisk } from '../storageService';

const originalElectronApi = (window as any).electronAPI;

const emptySnapshot = (version: number, updatedAt: string) => ({
  medicines: [],
  customers: [],
  invoices: [],
  expenses: [],
  suppliers: [],
  purchases: [],
  partners: [],
  auditEvents: [],
  settings: { storeName: 'Store', updatedAt },
  version,
  updatedAt,
});

const snapshotWithMedicine = (version: number, updatedAt: string) => ({
  ...emptySnapshot(version, updatedAt),
  medicines: [
    {
      id: 'med-1',
      name: 'Cached Medicine',
      batches: [],
      salePrices: { retail: 1, wholesale: 1, bulk: 1 },
      lowStockThreshold: 0,
      updatedAt,
    },
  ],
});

describe('storageService reset loading', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    (window as any).electronAPI = originalElectronApi;
    vi.restoreAllMocks();
  });

  it('keeps a valid newer empty disk snapshot instead of resurrecting stale local cache', async () => {
    const disk = emptySnapshot(200, '2026-05-25T08:00:00.000Z');
    const staleLocal = snapshotWithMedicine(100, '2026-05-24T08:00:00.000Z');
    localStorage.setItem('warekeep_user-1_full_backup', JSON.stringify(staleLocal));
    (window as any).electronAPI = {
      ...originalElectronApi,
      loadData: vi.fn(async () => ({ success: true, data: disk })),
    };

    const result = await loadFromDisk('user-1');

    expect(result?.medicines).toHaveLength(0);
    expect(result?.version).toBe(200);
  });

  it('still uses the local safety snapshot when it is newer than an empty disk snapshot', async () => {
    const disk = emptySnapshot(100, '2026-05-24T08:00:00.000Z');
    const newerLocal = snapshotWithMedicine(200, '2026-05-25T08:00:00.000Z');
    localStorage.setItem('warekeep_user-1_full_backup', JSON.stringify(newerLocal));
    (window as any).electronAPI = {
      ...originalElectronApi,
      loadData: vi.fn(async () => ({ success: true, data: disk })),
    };

    const result = await loadFromDisk('user-1');

    expect(result?.medicines.map((medicine: any) => medicine.id)).toContain('med-1');
    expect(result?.version).toBe(200);
  });
});
