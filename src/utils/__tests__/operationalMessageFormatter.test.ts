import { describe, expect, it } from 'vitest';
import { formatSyncErrorMessage, localizeOperationalMessage } from '../operationalMessageFormatter';

describe('operationalMessageFormatter', () => {
  it('formats sync timeout into a readable English message', () => {
    expect(
      formatSyncErrorMessage(
        { code: 'SYNC_LOOP_FAILED', message: 'NETWORK_TIMEOUT', source: 'hybridSync.triggerPull' },
        true
      )
    ).toContain('timed out');
  });

  it('localizes server snapshot restore message for Persian UI', () => {
    expect(localizeOperationalMessage('Data restored from server snapshot.', false)).toBe(
      'داده‌ها از اسنپ‌شات سرور بازیابی شد.'
    );
  });

  it('localizes diagnostic last sync timeout message for Persian UI', () => {
    expect(
      localizeOperationalMessage(
        'Last sync error [SYNC_LOOP_FAILED] from hybridSync.triggerPull: The sync request timed out. The server may be slow or unreachable. Automatic retry will continue.',
        false
      )
    ).toContain('آخرین خطای همگام‌سازی');
  });
});
