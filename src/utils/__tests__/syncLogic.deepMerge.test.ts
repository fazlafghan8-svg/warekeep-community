import { describe, expect, it } from 'vitest';
import { mergeRemoteSnapshotForLocalState, performSmartMerge, validateSnapshot } from '../syncLogic';

describe('syncLogic deepMerge safety', () => {
  const baseData = {
    medicines: [],
    customers: [],
    invoices: [],
    expenses: [],
    suppliers: [],
    purchases: [],
    auditEvents: [],
    settings: { storeName: 'Test', updatedAt: '2026-01-01T00:00:00.000Z' },
    version: 1,
  } as any;

  it('survives circular references in settings without stack overflow', () => {
    const circularSettings: any = { storeName: 'Circular', nested: {} };
    circularSettings.nested.parent = circularSettings; // circular!

    const cloudData = {
      ...baseData,
      settings: circularSettings,
      version: 2,
    };

    // Should NOT throw "Maximum call stack size exceeded"
    expect(() => performSmartMerge(baseData, cloudData)).not.toThrow();
  });

  it('survives deeply nested objects beyond 20 levels', () => {
    let deepObj: any = { value: 'leaf' };
    for (let i = 0; i < 30; i++) {
      deepObj = { child: deepObj };
    }

    const cloudData = {
      ...baseData,
      settings: { storeName: 'Deep', deep: deepObj, updatedAt: '2026-01-02T00:00:00.000Z' },
      version: 2,
    };

    expect(() => performSmartMerge(baseData, cloudData)).not.toThrow();
    const result = performSmartMerge(baseData, cloudData);
    expect(result.data.settings.storeName).toBe('Deep');
  });

  it('merges flat settings correctly without data loss', () => {
    const localData = {
      ...baseData,
      settings: {
        storeName: 'Local Store',
        language: 'dari',
        theme: 'dark',
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
    };

    const cloudData = {
      ...baseData,
      settings: {
        storeName: 'Cloud Store',
        language: 'dari',
        currency: 'AFN',
        updatedAt: '2026-01-02T00:00:00.000Z'
      },
      version: 2,
    };

    const result = performSmartMerge(localData, cloudData);
    // Remote wins on conflict: storeName should be cloud value
    expect(result.data.settings.storeName).toBe('Cloud Store');
    // Local-only key preserved
    expect((result.data.settings as any).theme).toBe('dark');
    // Remote-only key added
    expect((result.data.settings as any).currency).toBe('AFN');
  });

  it('merges lists by updatedAt timestamp correctly', () => {
    const localData = {
      ...baseData,
      medicines: [
        { id: 'med-1', name: 'OldName', quantity: 5, updatedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'med-2', name: 'LocalOnly', quantity: 3, updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
    };

    const cloudData = {
      ...baseData,
      medicines: [
        { id: 'med-1', name: 'NewName', quantity: 10, updatedAt: '2026-01-02T00:00:00.000Z' },
        { id: 'med-3', name: 'CloudOnly', quantity: 7, updatedAt: '2026-01-02T00:00:00.000Z' },
      ],
      version: 2,
    };

    const result = performSmartMerge(localData, cloudData);
    expect(result.data.medicines).toHaveLength(3);

    const med1 = result.data.medicines.find((m: any) => m.id === 'med-1');
    expect(med1!.name).toBe('NewName'); // cloud is newer
    expect((med1 as any).quantity).toBe(10);

    const med2 = result.data.medicines.find((m: any) => m.id === 'med-2');
    expect(med2).toBeDefined(); // local-only preserved

    const med3 = result.data.medicines.find((m: any) => m.id === 'med-3');
    expect(med3).toBeDefined(); // cloud-only added
  });

  it('handles null/undefined cloudData gracefully', () => {
    const result = performSmartMerge(baseData, null);
    expect(result.data).toEqual(baseData);
    expect(result.conflicts).toEqual([]);
  });

  it('handles empty cloud arrays without data loss', () => {
    const localData = {
      ...baseData,
      medicines: [
        { id: 'med-1', name: 'Keep', quantity: 5, updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
    };

    const cloudData = {
      ...baseData,
      medicines: [],
      version: 2,
    };

    const result = performSmartMerge(localData, cloudData);
    // Local medicine should be preserved since cloud has empty array
    expect(result.data.medicines).toHaveLength(1);
    expect(result.data.medicines[0].id).toBe('med-1');
  });

  it('does not merge warehouse domain snapshots while domain events are pending', () => {
    const localData = {
      ...baseData,
      medicines: [{ id: 'med-1', batches: [{ id: 'batch-1', quantity: 4 }], updatedAt: '2026-01-02T00:00:00.000Z' }],
      customers: [{ id: 'cust-1', balance: 100, updatedAt: '2026-01-02T00:00:00.000Z' }],
      invoices: [{ id: 'inv-1', finalAmount: 100, updatedAt: '2026-01-02T00:00:00.000Z' }],
      suppliers: [{ id: 'sup-1', balance: 50, updatedAt: '2026-01-02T00:00:00.000Z' }],
      purchases: [{ id: 'pur-1', remainingAmount: 50, updatedAt: '2026-01-02T00:00:00.000Z' }],
      expenses: [{ id: 'exp-1', amount: 7, updatedAt: '2026-01-02T00:00:00.000Z' }],
    } as any;

    const cloudData = {
      ...baseData,
      medicines: [{ id: 'med-1', batches: [{ id: 'batch-1', quantity: 10 }], updatedAt: '2026-01-03T00:00:00.000Z' }],
      customers: [{ id: 'cust-1', balance: 0, updatedAt: '2026-01-03T00:00:00.000Z' }],
      invoices: [{ id: 'inv-1', finalAmount: 200, updatedAt: '2026-01-03T00:00:00.000Z' }],
      suppliers: [{ id: 'sup-1', balance: 0, updatedAt: '2026-01-03T00:00:00.000Z' }],
      purchases: [{ id: 'pur-1', remainingAmount: 0, updatedAt: '2026-01-03T00:00:00.000Z' }],
      expenses: [{ id: 'exp-1', amount: 12, updatedAt: '2026-01-03T00:00:00.000Z' }],
      version: 2,
    };

    const result = mergeRemoteSnapshotForLocalState(localData, cloudData, { hasPendingLocalWork: true });

    expect((result.medicines[0] as any).batches[0].quantity).toBe(4);
    expect((result.customers[0] as any).balance).toBe(100);
    expect((result.invoices[0] as any).finalAmount).toBe(100);
    expect((result.suppliers[0] as any).balance).toBe(50);
    expect((result.purchases[0] as any).remainingAmount).toBe(50);
    expect((result.expenses[0] as any).amount).toBe(7);
  });

  it('does not resurrect cloud records older than a collection reset marker', () => {
    const resetAt = '2026-05-25T08:00:00.000Z';
    const localData = {
      ...baseData,
      medicines: [],
      settings: {
        ...baseData.settings,
        collectionResetAt: { medicines: resetAt },
        updatedAt: resetAt,
      },
      version: 100,
    };

    const cloudData = {
      ...baseData,
      medicines: [
        { id: 'med-old-cloud', name: 'Old Cloud', quantity: 5, updatedAt: '2026-05-24T08:00:00.000Z' },
      ],
      version: 90,
    };

    const result = performSmartMerge(localData, cloudData);
    expect(result.data.medicines).toHaveLength(0);
  });

  it('keeps the newest local reset marker when the cloud has older settings', () => {
    const resetAt = '2026-06-01T08:00:00.000Z';
    const restoredAt = '2026-06-01T08:00:00.001Z';
    const localData = {
      ...baseData,
      medicines: [
        { id: 'med-restored', name: 'Restored', quantity: 55, updatedAt: restoredAt },
      ],
      settings: {
        ...baseData.settings,
        storeName: 'Restored Store',
        collectionResetAt: { medicines: resetAt },
        dataResetAt: resetAt,
        updatedAt: restoredAt,
      },
      version: 200,
    };

    const cloudData = {
      ...baseData,
      medicines: [
        { id: 'med-old-cloud', name: 'Old Cloud', quantity: 2, updatedAt: '2026-05-01T08:00:00.000Z' },
      ],
      settings: {
        ...baseData.settings,
        storeName: 'Old Cloud Store',
        collectionResetAt: { medicines: '2026-05-01T08:00:00.000Z' },
        dataResetAt: '2026-05-01T08:00:00.000Z',
      },
      version: 190,
    };

    const result = performSmartMerge(localData, cloudData);
    expect(result.data.medicines.map((medicine: any) => medicine.id)).toEqual(['med-restored']);
    expect(result.data.settings.storeName).toBe('Restored Store');
    expect(result.data.settings.collectionResetAt?.medicines).toBe(resetAt);
    expect(result.data.settings.dataResetAt).toBe(resetAt);
  });

  it('keeps records created after a collection reset marker', () => {
    const resetAt = '2026-05-25T08:00:00.000Z';
    const localData = {
      ...baseData,
      medicines: [],
      settings: {
        ...baseData.settings,
        collectionResetAt: { medicines: resetAt },
        updatedAt: resetAt,
      },
      version: 100,
    };

    const cloudData = {
      ...baseData,
      medicines: [
        { id: 'med-new-cloud', name: 'New Cloud', quantity: 5, updatedAt: '2026-05-25T09:00:00.000Z' },
      ],
      version: 101,
    };

    const result = performSmartMerge(localData, cloudData);
    expect(result.data.medicines.map((medicine: any) => medicine.id)).toContain('med-new-cloud');
  });

  it('does not let an authoritative remote snapshot remove pending local medicines', () => {
    const localData = {
      ...baseData,
      medicines: [
        { id: 'med-pending-1', name: 'WK-OFFLINE-SYNC-TESTA3', quantity: 1, updatedAt: '2026-05-10T08:00:00.000Z' }
      ],
    };

    const remoteData = {
      ...baseData,
      medicines: [],
      version: 20,
      _warekeepWarehouseAuthoritative: true
    };

    const result = mergeRemoteSnapshotForLocalState(localData, remoteData, {
      hasPendingLocalWork: true,
      remoteAuthoritative: true
    });

    expect(result.medicines.map((medicine: any) => medicine.name)).toContain('WK-OFFLINE-SYNC-TESTA3');
  });

  it('ignores remote reset cutoffs while local warehouse work is still pending', () => {
    const localData = {
      ...baseData,
      medicines: [
        { id: 'med-pending-reset', name: 'WK-OFFLINE-SYNC-RESET', quantity: 1, updatedAt: '2026-05-31T10:00:00.000Z' }
      ],
      settings: { ...baseData.settings, dataResetAt: undefined },
    };

    const remoteData = {
      ...baseData,
      medicines: [],
      settings: {
        ...baseData.settings,
        dataResetAt: '2026-05-31T10:05:00.000Z',
      },
      version: 20,
      _warekeepWarehouseAuthoritative: true
    };

    const result = mergeRemoteSnapshotForLocalState(localData, remoteData, {
      hasPendingLocalWork: true,
      remoteAuthoritative: true
    });

    expect(result.medicines.map((medicine: any) => medicine.name)).toContain('WK-OFFLINE-SYNC-RESET');
  });

  it('does not let an older authoritative remote snapshot remove locally saved restart data', () => {
    const localData = {
      ...baseData,
      medicines: [
        { id: 'med-after-restart', name: 'a5a111', quantity: 1, updatedAt: '2026-05-16T12:18:00.000Z' }
      ],
      version: 1778923080000,
      updatedAt: '2026-05-16T12:18:00.000Z',
      settings: { ...baseData.settings, updatedAt: '2026-05-16T12:18:00.000Z' }
    };

    const remoteData = {
      ...baseData,
      medicines: [],
      version: 1778922000000,
      updatedAt: '2026-05-16T12:00:00.000Z',
      settings: { ...baseData.settings, updatedAt: '2026-05-16T12:00:00.000Z' },
      _warekeepWarehouseAuthoritative: true
    };

    const result = mergeRemoteSnapshotForLocalState(localData, remoteData, {
      hasPendingLocalWork: false,
      remoteAuthoritative: true
    });

    expect(result.medicines.map((medicine: any) => medicine.name)).toContain('a5a111');
  });

  it('allows a newer authoritative remote snapshot to replace stale local data', () => {
    const localData = {
      ...baseData,
      medicines: [
        { id: 'med-stale-local', name: 'Stale Local', quantity: 1, updatedAt: '2026-05-16T12:00:00.000Z' }
      ],
      version: 1778922000000,
      updatedAt: '2026-05-16T12:00:00.000Z',
      settings: { ...baseData.settings, updatedAt: '2026-05-16T12:00:00.000Z' }
    };

    const remoteData = {
      ...baseData,
      medicines: [],
      version: 1778923080000,
      updatedAt: '2026-05-16T12:18:00.000Z',
      settings: { ...baseData.settings, updatedAt: '2026-05-16T12:18:00.000Z' },
      _warekeepWarehouseAuthoritative: true
    };

    const result = mergeRemoteSnapshotForLocalState(localData, remoteData, {
      hasPendingLocalWork: false,
      remoteAuthoritative: true
    });

    expect(result.medicines).toHaveLength(0);
  });

  it('does not resurrect a locally deleted medicine from a newer remote snapshot with an older active record', () => {
    const localData = {
      ...baseData,
      medicines: [
        {
          id: 'med-deleted-local',
          name: 'Deleted Local',
          isDeleted: true,
          updatedAt: '2026-06-01T10:00:00.000Z'
        }
      ],
      version: 100,
      updatedAt: '2026-06-01T10:00:00.000Z',
      settings: { ...baseData.settings, updatedAt: '2026-06-01T10:00:00.000Z' }
    };

    const remoteData = {
      ...baseData,
      medicines: [
        {
          id: 'med-deleted-local',
          name: 'Old Active Remote',
          isDeleted: false,
          updatedAt: '2026-05-31T10:00:00.000Z'
        }
      ],
      version: 200,
      updatedAt: '2026-06-01T10:05:00.000Z',
      settings: { ...baseData.settings, updatedAt: '2026-06-01T10:05:00.000Z' },
      _warekeepWarehouseAuthoritative: true
    };

    const result = mergeRemoteSnapshotForLocalState(localData, remoteData, {
      hasPendingLocalWork: false,
      remoteAuthoritative: true
    });

    expect(result.medicines).toHaveLength(1);
    expect(result.medicines[0]).toMatchObject({
      id: 'med-deleted-local',
      isDeleted: true
    });
  });

  it('keeps a purged archived medicine out of local state with a per-record tombstone', () => {
    const purgedAt = '2026-06-01T10:00:00.000Z';
    const localData = {
      ...baseData,
      medicines: [],
      version: 100,
      updatedAt: purgedAt,
      settings: {
        ...baseData.settings,
        deletedRecordTombstones: {
          medicines: {
            'med-purged-local': purgedAt
          }
        },
        updatedAt: purgedAt
      }
    };

    const remoteData = {
      ...baseData,
      medicines: [
        {
          id: 'med-purged-local',
          name: 'Archived Remote Copy',
          isDeleted: true,
          updatedAt: '2026-06-01T10:10:00.000Z'
        },
        {
          id: 'med-active-remote',
          name: 'Keep Remote',
          updatedAt: '2026-06-01T10:10:00.000Z'
        }
      ],
      version: 200,
      updatedAt: '2026-06-01T10:10:00.000Z',
      settings: { ...baseData.settings, updatedAt: '2026-06-01T10:10:00.000Z' },
      _warekeepWarehouseAuthoritative: true
    };

    const result = mergeRemoteSnapshotForLocalState(localData, remoteData, {
      hasPendingLocalWork: false,
      remoteAuthoritative: true
    });

    expect(result.medicines.map((medicine: any) => medicine.id)).toEqual(['med-active-remote']);
    expect(result.settings.deletedRecordTombstones?.medicines?.['med-purged-local']).toBe(purgedAt);
  });

  it('keeps reset markers authoritative when a newer remote snapshot contains older records', () => {
    const resetAt = '2026-06-01T10:00:00.000Z';
    const localData = {
      ...baseData,
      medicines: [],
      version: 100,
      updatedAt: resetAt,
      settings: {
        ...baseData.settings,
        dataResetAt: resetAt,
        collectionResetAt: { medicines: resetAt },
        updatedAt: resetAt
      }
    };

    const remoteData = {
      ...baseData,
      medicines: [
        {
          id: 'med-old-remote',
          name: 'Old Remote',
          updatedAt: '2026-05-31T10:00:00.000Z'
        }
      ],
      version: 200,
      updatedAt: '2026-06-01T10:05:00.000Z',
      settings: { ...baseData.settings, updatedAt: '2026-06-01T10:05:00.000Z' },
      _warekeepWarehouseAuthoritative: true
    };

    const result = mergeRemoteSnapshotForLocalState(localData, remoteData, {
      hasPendingLocalWork: false,
      remoteAuthoritative: true
    });

    expect(result.medicines).toHaveLength(0);
    expect(result.settings.dataResetAt).toBe(resetAt);
    expect(result.settings.collectionResetAt?.medicines).toBe(resetAt);
  });

  it('increments version to max of local and cloud + 1', () => {
    const localData = { ...baseData, version: 5 };
    const cloudData = { ...baseData, version: 10 };

    const result = performSmartMerge(localData, cloudData);
    expect(result.data.version).toBe(11);
  });

  it('rejects synced received purchases when a purchase line has no matching batch', () => {
    const invalidSnapshot = {
      ...baseData,
      medicines: [{
        id: 'med-1',
        name: 'Synced Medicine',
        batches: [],
      }],
      purchases: [{
        id: 'pur-b3',
        supplierId: 'sup-1',
        invoiceNumber: 'B3',
        date: '2026-06-30',
        items: [{
          lineId: 'line-1',
          medicineId: 'med-1',
          batchNumber: 'B3-1',
          expiryDate: '2027-01-01',
          quantity: 1,
          purchasePrice: 10,
        }],
        receipts: [{
          id: 'receipt-b3',
          date: '2026-06-30',
          items: [{
            lineId: 'line-1',
            medicineId: 'med-1',
            purchaseItemIndex: 0,
            batchNumber: 'B3-1',
            quantity: 1,
            baseQuantity: 1,
          }],
        }],
        totalAmount: 10,
        paidAmount: 0,
        remainingAmount: 10,
        workflowStatus: 'received',
        status: 'received',
        inventoryCommitted: true,
      }],
      version: 2,
    } as any;

    expect(() => validateSnapshot(invalidSnapshot)).toThrow('received line missing batch');
  });
});
