import { describe, expect, it } from 'vitest';
import { getFefoSortedBatches, isBatchSellable, selectBatchByFefo } from '../batchUtils';

describe('batchUtils FEFO ordering', () => {
  it('NEW - prioritizes the earliest valid expiry date', () => {
    const selected = selectBatchByFefo([
      {
        id: 'batch-a',
        batchNumber: 'A',
        quantity: 5,
        expiryDate: '2028-12-01',
        purchasePrice: 10,
        history: [],
      },
      {
        id: 'batch-b',
        batchNumber: 'B',
        quantity: 5,
        expiryDate: '2028-05-01',
        purchasePrice: 10,
        history: [],
      },
    ]);

    expect(selected?.id).toBe('batch-b');
  });

  it('NEW - falls back to receivedAt when expiry dates are missing or equal', () => {
    const sorted = getFefoSortedBatches([
      {
        id: 'batch-late',
        batchNumber: 'LATE',
        quantity: 4,
        expiryDate: '',
        receivedAt: '2026-04-05T00:00:00.000Z',
        purchasePrice: 10,
        history: [],
      },
      {
        id: 'batch-early',
        batchNumber: 'EARLY',
        quantity: 4,
        expiryDate: '',
        receivedAt: '2026-04-01T00:00:00.000Z',
        purchasePrice: 10,
        history: [],
      },
    ]);

    expect(sorted.map((batch) => batch.id)).toEqual(['batch-early', 'batch-late']);
  });

  it('NEW - ignores quarantine and rejected batches during FEFO selection', () => {
    const selected = selectBatchByFefo([
      {
        id: 'batch-quarantine',
        batchNumber: 'Q1',
        quantity: 8,
        expiryDate: '2028-05-01',
        purchasePrice: 10,
        availabilityStatus: 'quarantine',
        history: [],
      },
      {
        id: 'batch-available',
        batchNumber: 'A1',
        quantity: 6,
        expiryDate: '2028-06-01',
        purchasePrice: 10,
        availabilityStatus: 'available',
        history: [],
      },
      {
        id: 'batch-rejected',
        batchNumber: 'R1',
        quantity: 4,
        expiryDate: '2028-04-01',
        purchasePrice: 10,
        availabilityStatus: 'rejected',
        history: [],
      },
    ]);

    expect(selected?.id).toBe('batch-available');
  });

  it('blocks expired batches using date-only comparison', () => {
    expect(isBatchSellable({
      id: 'expired',
      batchNumber: 'OLD',
      quantity: 3,
      expiryDate: '2026-05-30T23:59:59.000Z',
      purchasePrice: 10,
      availabilityStatus: 'available',
      history: [],
    }, new Date('2026-05-31T00:30:00+04:30'))).toBe(false);

    expect(isBatchSellable({
      id: 'today',
      batchNumber: 'TODAY',
      quantity: 3,
      expiryDate: '2026-05-31T00:00:00.000Z',
      purchasePrice: 10,
      availabilityStatus: 'available',
      history: [],
    }, new Date('2026-05-31T23:30:00+04:30'))).toBe(true);
  });
});
