import { describe, expect, it } from 'vitest';
import { getGuestDemoData } from '../guestDemoData';
import { runDataIntegrityAudit } from '@/utils/dataIntegrityAudit';

describe('guest demo data integrity', () => {
  it('keeps received purchase lines linked to their inventory batches', () => {
    const snapshot = getGuestDemoData('english');
    const report = runDataIntegrityAudit(snapshot);

    expect(
      report.issues.filter((issue) => issue.type === 'received_purchase_line_missing_batch')
    ).toEqual([]);
  });
});
