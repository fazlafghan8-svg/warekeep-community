import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('webLogService', () => {
    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
        delete (window as any).electronAPI;
    });

    test('collapses consecutive duplicate logs into a single entry with a duplicate count', async () => {
        const { appendWebLog, readWebLogs } = await import('../webLogService');

        appendWebLog('error', 'APP', 'Admin backend diagnostics detected an error', {
            scope: 'admin',
            path: '/api/v1/admin/control/bootstrap',
        });
        appendWebLog('error', 'APP', 'Admin backend diagnostics detected an error', {
            scope: 'admin',
            path: '/api/v1/admin/control/bootstrap',
        });

        const logs = readWebLogs();
        expect(logs).toHaveLength(1);
        expect(logs[0].meta).toEqual(expect.objectContaining({
            duplicateCount: 2,
        }));
    });
});
