import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFromDisk, saveToDisk } from '../storageService';

const snapshot = {
  medicines: [],
  customers: [{ id: 'cust-1', name: 'Customer', phone: '', address: '', balance: 0, transactions: [] }],
  invoices: [],
  expenses: [],
  suppliers: [],
  purchases: [],
  partners: [],
  auditEvents: [],
  stockMovements: [],
  settings: { language: 'english' },
  version: 10,
  updatedAt: '2026-06-28T00:00:00.000Z'
};

describe('storageService incremental persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    (window as any).electronAPI.saveData = vi.fn(async () => ({ success: true }));
    (window as any).electronAPI.saveDataPatch = vi.fn(async () => ({ success: true }));
    (window as any).electronAPI.loadData = vi.fn(async () => ({ success: true, data: snapshot }));
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends only declared root slices while preserving full-snapshot compatibility', async () => {
    await saveToDisk(snapshot, 'incremental-user', {
      changedSlices: ['customers', 'invoices'],
      mutationId: 'mutation-1'
    });

    expect((window as any).electronAPI.saveData).not.toHaveBeenCalled();
    expect((window as any).electronAPI.saveDataPatch).toHaveBeenCalledTimes(1);
    const [envelope, userId] = (window as any).electronAPI.saveDataPatch.mock.calls[0];
    expect(userId).toBe('incremental-user');
    expect(Object.keys(envelope.slices).sort()).toEqual(['customers', 'invoices']);
    expect(envelope.mutationId).toBe('mutation-1');
  });

  it('falls back to the legacy full save when no patch base exists', async () => {
    (window as any).electronAPI.saveDataPatch = vi.fn(async () => ({ success: false, error: 'PATCH_BASE_MISSING' }));

    await saveToDisk(snapshot, 'first-save-user', {
      changedSlices: ['customers'],
      mutationId: 'mutation-first'
    });

    expect((window as any).electronAPI.saveData).toHaveBeenCalledTimes(1);
    expect((window as any).electronAPI.saveData.mock.calls[0][0].customers).toHaveLength(1);
  });

  it('continues to read the previous full JSON shape unchanged', async () => {
    const loaded = await loadFromDisk('legacy-user');
    expect(loaded.customers[0].id).toBe('cust-1');
    expect(loaded.version).toBe(10);
  });
});
