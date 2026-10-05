import { describe, expect, it } from 'vitest';
import type { Medicine } from '../../types';
import {
  archiveMedicineCollection,
  getLocalizedWarehouseErrorMessage,
  looksLikeMojibake,
  pruneWarehouseDeleteOutboxForMedicine,
  purgeArchivedMedicineCollection,
  pruneWarehouseOutboxForMedicine,
  restoreArchivedMedicineCollection,
} from '../warehouseMedicineMutations';

describe('warehouseMedicineMutations', () => {
  it('archives only the selected medicine locally', () => {
    const medicines: Medicine[] = [
      {
        id: 'med-1',
        name: 'A',
        manufacturer: 'X',
        type: 'Tablet',
        unit: 'بسته',
        batches: [],
        salePrices: { retail: 1, wholesale: 1, bulk: 1 },
        lowStockThreshold: 1,
      },
      {
        id: 'med-2',
        name: 'B',
        manufacturer: 'Y',
        type: 'Tablet',
        unit: 'بسته',
        batches: [],
        salePrices: { retail: 2, wholesale: 2, bulk: 2 },
        lowStockThreshold: 2,
      },
    ];

    const archived = archiveMedicineCollection([...medicines], 'med-1', '2026-04-07T10:00:00.000Z');

    expect(archived[0].isDeleted).toBe(true);
    expect(archived[0].updatedAt).toBe('2026-04-07T10:00:00.000Z');
    expect(archived[1].isDeleted).toBeUndefined();
  });

  it('purges only archived medicine records from local storage', () => {
    const medicines: Medicine[] = [
      {
        id: 'med-1',
        name: 'Archived',
        manufacturer: 'X',
        type: 'Tablet',
        unit: 'Ø¨Ø³ØªÙ‡' as any,
        batches: [],
        salePrices: { retail: 1, wholesale: 1, bulk: 1 },
        lowStockThreshold: 1,
        isDeleted: true,
      },
      {
        id: 'med-2',
        name: 'Active',
        manufacturer: 'Y',
        type: 'Tablet',
        unit: 'Ø¨Ø³ØªÙ‡' as any,
        batches: [],
        salePrices: { retail: 2, wholesale: 2, bulk: 2 },
        lowStockThreshold: 2,
      },
    ];

    expect(purgeArchivedMedicineCollection(medicines, 'med-1').map((medicine) => medicine.id)).toEqual(['med-2']);
    expect(purgeArchivedMedicineCollection(medicines, 'med-2').map((medicine) => medicine.id)).toEqual(['med-1', 'med-2']);
  });

  it('restores only archived medicine records locally', () => {
    const medicines: Medicine[] = [
      {
        id: 'med-1',
        name: 'Archived',
        manufacturer: 'X',
        type: 'Tablet',
        unit: 'Ã˜Â¨Ã˜Â³Ã˜ÂªÃ™â€¡' as any,
        batches: [],
        salePrices: { retail: 1, wholesale: 1, bulk: 1 },
        lowStockThreshold: 1,
        isDeleted: true,
      },
      {
        id: 'med-2',
        name: 'Active',
        manufacturer: 'Y',
        type: 'Tablet',
        unit: 'Ã˜Â¨Ã˜Â³Ã˜ÂªÃ™â€¡' as any,
        batches: [],
        salePrices: { retail: 2, wholesale: 2, bulk: 2 },
        lowStockThreshold: 2,
      },
    ];

    const restored = restoreArchivedMedicineCollection(medicines, 'med-1', '2026-06-02T06:00:00.000Z');

    expect(restored[0].isDeleted).toBe(false);
    expect(restored[0].updatedAt).toBe('2026-06-02T06:00:00.000Z');
    expect(restored[1].isDeleted).toBeUndefined();
  });

  it('prunes outbox operations that still reference the archived medicine', () => {
    const operations = [
      { kind: 'createMedicine', payload: { id: 'med-1' } },
      { kind: 'updateMedicine', payload: { id: 'med-2', data: { name: 'Keep' } } },
      { kind: 'addBatch', payload: { medicineId: 'med-1', batch: { batchNumber: 'B-1' } } },
      {
        kind: 'createPurchase',
        payload: {
          purchase: {
            items: [
              { medicineId: 'med-1', quantity: 2 },
              { medicineId: 'med-3', quantity: 1 },
            ],
          },
          newBatches: [],
        },
      },
      {
        kind: 'createInvoice',
        payload: {
          invoice: {
            items: [{ medicineId: 'med-4', quantity: 1 }],
          },
        },
      },
    ];

    const result = pruneWarehouseOutboxForMedicine(operations, 'med-1');

    expect(result.removedCount).toBe(3);
    expect(result.remainingOperations).toEqual([
      { kind: 'updateMedicine', payload: { id: 'med-2', data: { name: 'Keep' } } },
      {
        kind: 'createInvoice',
        payload: {
          invoice: {
            items: [{ medicineId: 'med-4', quantity: 1 }],
          },
        },
      },
    ]);
  });

  it('prunes only pending delete operations when restoring an archived medicine', () => {
    const operations = [
      { kind: 'createMedicine', payload: { id: 'med-1' } },
      { kind: 'deleteMedicine', payload: { id: 'med-1' } },
      { kind: 'updateMedicine', payload: { id: 'med-1', data: { name: 'Keep pending edit' } } },
      { kind: 'deleteMedicine', payload: { id: 'med-2' } },
    ];

    const result = pruneWarehouseDeleteOutboxForMedicine(operations, 'med-1');

    expect(result.removedCount).toBe(1);
    expect(result.remainingOperations).toEqual([
      { kind: 'createMedicine', payload: { id: 'med-1' } },
      { kind: 'updateMedicine', payload: { id: 'med-1', data: { name: 'Keep pending edit' } } },
      { kind: 'deleteMedicine', payload: { id: 'med-2' } },
    ]);
  });

  it('localizes missing medicine backend errors for Dari users', () => {
    expect(
      getLocalizedWarehouseErrorMessage(
        {
          code: 'MEDICINE_NOT_FOUND',
          message: 'Medicine not found.',
        },
        false
      )
    ).toBe('این دوا در سرور پیدا نشد. احتمالاً قبلاً بایگانی شده است.');
  });

  it('returns a readable timeout fallback for errors without a stable code', () => {
    expect(
      getLocalizedWarehouseErrorMessage(
        {
          message: 'BACKEND_REQUEST_TIMEOUT: request timed out after 20000ms',
        },
        true
      )
    ).toBe('The backend request timed out. Please try again.');
  });

  it('falls back to a readable localized message when the backend message is mojibake', () => {
    expect(looksLikeMojibake('Ø¯Ø±Ø®ÙˆØ§Ø³Øª Ø¨Ù‡ backend Ø¨Ø§ Ø®Ø·Ø§')).toBe(true);
    expect(
      getLocalizedWarehouseErrorMessage(
        {
          message: 'Ø¯Ø±Ø®ÙˆØ§Ø³Øª Ø¨Ù‡ backend Ø¨Ø§ Ø®Ø·Ø§ÛŒ 429 Ù†Ø§Ù…ÙˆÙÙ‚ Ø´Ø¯.',
        },
        false
      )
    ).toBe('درخواست بخش انبار انجام نشد.');
  });
});
