import { describe, expect, it } from 'vitest';
import { performSmartMerge } from '../syncLogic';

describe('NEW - syncLogic audit trail merge', () => {
  it('NEW - keeps audit events from both local and cloud snapshots without dropping procurement logs', () => {
    const localData = {
      medicines: [],
      customers: [],
      invoices: [],
      expenses: [],
      suppliers: [],
      purchases: [],
      auditEvents: [
        {
          id: 'audit-local-1',
          timestamp: '2026-04-01T10:00:00.000Z',
          actorName: 'Local User',
          action: 'purchase.created',
          entityType: 'purchase',
          entityId: 'pur-1',
        },
      ],
      settings: { storeName: 'Local', updatedAt: '2026-04-01T10:00:00.000Z' },
      version: 1,
    } as any;

    const cloudData = {
      medicines: [],
      customers: [],
      invoices: [],
      expenses: [],
      suppliers: [],
      purchases: [],
      auditEvents: [
        {
          id: 'audit-cloud-1',
          timestamp: '2026-04-01T11:00:00.000Z',
          actorName: 'Cloud User',
          action: 'vendor_credit.created',
          entityType: 'vendor_credit',
          entityId: 'vc-1',
        },
      ],
      settings: { storeName: 'Cloud', updatedAt: '2026-04-01T11:00:00.000Z' },
      version: 2,
    };

    const result = performSmartMerge(localData, cloudData);

    expect(result.data.auditEvents).toHaveLength(2);
    expect(result.data.auditEvents?.map((entry) => entry.id)).toEqual(['audit-local-1', 'audit-cloud-1']);
  });
});
