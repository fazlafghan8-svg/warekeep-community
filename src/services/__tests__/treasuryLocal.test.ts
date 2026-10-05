// The legacy unscoped treasury blob: adoption and purge are OWNER decisions, never inferred.
//
// The blob ('warekeep_treasury_transactions' / '..._cash_counts') records no user and no business,
// so the two ways to get this wrong are symmetric and both unrecoverable:
//   - adopt it automatically  -> one business's cash ledger silently lands in another's books;
//   - purge it automatically  -> a device that never exported loses the only copy of that ledger.
// Every test here pins one of those two doors shut.
import { beforeEach, describe, expect, it } from 'vitest';
import {
    LEGACY_TREASURY_CC_KEY,
    LEGACY_TREASURY_TX_KEY,
    buildLegacyTreasuryExport,
    canPurgeLegacyTreasury,
    confirmLegacyTreasuryImported,
    getLegacyTreasuryDecision,
    getLegacyTreasuryPurgeStage,
    hasLegacyTreasuryBlob,
    markLegacyTreasuryExported,
    purgeLegacyTreasuryBlob,
    readLegacyTreasuryBlob,
    recordLegacyTreasuryDecision,
    shouldPromptForLegacyTreasuryAdoption,
    summarizeLegacyTreasuryBlob,
    type TreasuryScope
} from '../treasuryLocal';

const OWNER_A: TreasuryScope = { userId: 'user-a', deviceId: 'device-1' };
const OWNER_B: TreasuryScope = { userId: 'user-b', deviceId: 'device-1' };
const OWNER_A_OTHER_DEVICE: TreasuryScope = { userId: 'user-a', deviceId: 'device-2' };

const seedBlob = () => {
    localStorage.setItem(LEGACY_TREASURY_TX_KEY, JSON.stringify([
        { id: 'ttx-1', date: '2026-03-02', type: 'external_income', direction: 'in', amount: 1500.5, currency: 'AFN', description: 'grant', userId: 'whoever', userName: 'Whoever' },
        { id: 'ttx-2', date: '2026-01-14', type: 'petty_cash', direction: 'out', amount: 250.25, currency: 'AFN', description: 'tea' },
        { id: 'ttx-3', date: '2026-02-08', type: 'external_income', direction: 'in', amount: 40, currency: 'USD', description: 'fx' }
    ]));
    localStorage.setItem(LEGACY_TREASURY_CC_KEY, JSON.stringify([
        { id: 'tcc-1', date: '2026-03-03', expectedBalance: 1250.25, actualBalance: 1250.25, difference: 0, currency: 'AFN' }
    ]));
};

beforeEach(() => {
    localStorage.clear();
});

describe('reading the legacy blob', () => {
    it('reads both unscoped keys verbatim', () => {
        seedBlob();
        const blob = readLegacyTreasuryBlob();
        expect(blob.transactions).toHaveLength(3);
        expect(blob.cashCounts).toHaveLength(1);
        expect(hasLegacyTreasuryBlob()).toBe(true);
    });

    it('treats a missing or corrupt blob as empty rather than throwing', () => {
        expect(hasLegacyTreasuryBlob()).toBe(false);
        localStorage.setItem(LEGACY_TREASURY_TX_KEY, '{not json');
        localStorage.setItem(LEGACY_TREASURY_CC_KEY, '{"not":"an array"}');
        expect(readLegacyTreasuryBlob()).toEqual({ transactions: [], cashCounts: [] });
        expect(hasLegacyTreasuryBlob()).toBe(false);
    });
});

describe('summary shown to the owner before they decide', () => {
    it('reports counts, per-currency in/out/net and the date range', () => {
        seedBlob();
        const summary = summarizeLegacyTreasuryBlob(readLegacyTreasuryBlob());

        expect(summary.transactionCount).toBe(3);
        expect(summary.cashCountCount).toBe(1);
        expect(summary.earliestDate).toBe('2026-01-14');
        expect(summary.latestDate).toBe('2026-03-03');
        expect(summary.currencies).toEqual([
            { currency: 'AFN', transactionCount: 2, inTotal: '1500.50', outTotal: '250.25', netTotal: '1250.25' },
            { currency: 'USD', transactionCount: 1, inTotal: '40.00', outTotal: '0.00', netTotal: '40.00' }
        ]);
    });

    it('flags over-scale amounts instead of rounding them into a total that reconciles', () => {
        // The legacy store is JS floats. The migration tool REJECTS >2dp money per-row, so an owner
        // must see the bad rows BEFORE adopting, not discover them as a hole in the books after.
        localStorage.setItem(LEGACY_TREASURY_TX_KEY, JSON.stringify([
            { id: 'ok', date: '2026-01-01', direction: 'in', amount: 10.25, currency: 'AFN' },
            { id: 'bad', date: '2026-01-02', direction: 'in', amount: 10.123, currency: 'AFN' }
        ]));
        const summary = summarizeLegacyTreasuryBlob(readLegacyTreasuryBlob());
        expect(summary.overScaleTransactionIds).toEqual(['bad']);
    });
});

describe('adoption is never automatic', () => {
    it('prompts an owner with no treasury of their own when a blob exists', () => {
        seedBlob();
        expect(shouldPromptForLegacyTreasuryAdoption({ scope: OWNER_A, hasScopedTreasury: false, isOwner: true })).toBe(true);
    });

    it('does NOT adopt anything merely by being asked — the prompt reads nothing into the user scope', () => {
        seedBlob();
        shouldPromptForLegacyTreasuryAdoption({ scope: OWNER_A, hasScopedTreasury: false, isOwner: true });
        // No decision recorded, blob untouched: asking is not deciding.
        expect(getLegacyTreasuryDecision(OWNER_A)).toBeNull();
        expect(readLegacyTreasuryBlob().transactions).toHaveLength(3);
    });

    it('never prompts a non-owner', () => {
        seedBlob();
        expect(shouldPromptForLegacyTreasuryAdoption({ scope: OWNER_A, hasScopedTreasury: false, isOwner: false })).toBe(false);
    });

    it('never prompts a user who already has treasury (no merging into a populated ledger)', () => {
        seedBlob();
        expect(shouldPromptForLegacyTreasuryAdoption({ scope: OWNER_A, hasScopedTreasury: true, isOwner: true })).toBe(false);
    });

    it('never prompts when there is no blob', () => {
        expect(shouldPromptForLegacyTreasuryAdoption({ scope: OWNER_A, hasScopedTreasury: false, isOwner: true })).toBe(false);
    });

    it('stops prompting once the owner has decided — either way', () => {
        seedBlob();
        const summary = summarizeLegacyTreasuryBlob(readLegacyTreasuryBlob());

        recordLegacyTreasuryDecision(OWNER_A, 'adopted', summary);
        expect(getLegacyTreasuryDecision(OWNER_A)).toBe('adopted');
        expect(shouldPromptForLegacyTreasuryAdoption({ scope: OWNER_A, hasScopedTreasury: false, isOwner: true })).toBe(false);

        recordLegacyTreasuryDecision(OWNER_B, 'declined', summary);
        expect(getLegacyTreasuryDecision(OWNER_B)).toBe('declined');
        expect(shouldPromptForLegacyTreasuryAdoption({ scope: OWNER_B, hasScopedTreasury: false, isOwner: true })).toBe(false);
    });

    it('declining destroys nothing — the blob survives for whoever it does belong to', () => {
        seedBlob();
        recordLegacyTreasuryDecision(OWNER_A, 'declined', summarizeLegacyTreasuryBlob(readLegacyTreasuryBlob()));
        expect(readLegacyTreasuryBlob().transactions).toHaveLength(3);
        expect(readLegacyTreasuryBlob().cashCounts).toHaveLength(1);
    });

    it('scopes the decision per USER and per DEVICE — one user deciding does not answer for another', () => {
        seedBlob();
        recordLegacyTreasuryDecision(OWNER_A, 'declined', summarizeLegacyTreasuryBlob(readLegacyTreasuryBlob()));

        // A different user on the same device is still asked.
        expect(getLegacyTreasuryDecision(OWNER_B)).toBeNull();
        expect(shouldPromptForLegacyTreasuryAdoption({ scope: OWNER_B, hasScopedTreasury: false, isOwner: true })).toBe(true);
        // The same user on a different device is asked about THAT device's blob.
        expect(getLegacyTreasuryDecision(OWNER_A_OTHER_DEVICE)).toBeNull();
    });
});

describe('purge is gated on THIS device having exported AND had that export imported', () => {
    it('refuses to purge a device that never exported', () => {
        seedBlob();
        expect(getLegacyTreasuryPurgeStage()).toBe('retained');
        expect(canPurgeLegacyTreasury()).toBe(false);

        const result = purgeLegacyTreasuryBlob();

        expect(result).toEqual({ purged: false, reason: 'purge_blocked:retained' });
        expect(readLegacyTreasuryBlob().transactions).toHaveLength(3);
        expect(localStorage.getItem(LEGACY_TREASURY_TX_KEY)).not.toBeNull();
    });

    it('refuses to purge after export while the import is NOT confirmed — the headline purge rule', () => {
        seedBlob();
        markLegacyTreasuryExported(OWNER_A, summarizeLegacyTreasuryBlob(readLegacyTreasuryBlob()));

        expect(getLegacyTreasuryPurgeStage()).toBe('exported');
        expect(canPurgeLegacyTreasury()).toBe(false);

        const result = purgeLegacyTreasuryBlob();

        expect(result).toEqual({ purged: false, reason: 'purge_blocked:exported' });
        expect(readLegacyTreasuryBlob().transactions).toHaveLength(3);
    });

    it('refuses to confirm an import that no export preceded — no attesting to a file that never existed', () => {
        seedBlob();
        expect(confirmLegacyTreasuryImported(OWNER_A)).toBe(false);
        expect(getLegacyTreasuryPurgeStage()).toBe('retained');
        expect(canPurgeLegacyTreasury()).toBe(false);
    });

    it('allows the purge only after export AND import-confirm, and only when explicitly called', () => {
        seedBlob();
        markLegacyTreasuryExported(OWNER_A, summarizeLegacyTreasuryBlob(readLegacyTreasuryBlob()));
        expect(confirmLegacyTreasuryImported(OWNER_A)).toBe(true);

        expect(getLegacyTreasuryPurgeStage()).toBe('import_confirmed');
        expect(canPurgeLegacyTreasury()).toBe(true);
        // CONTROL: reaching import_confirmed does NOT itself delete anything. If this ever fails, the
        // gate has become an auto-purge and every un-exported device is one state transition from
        // losing its ledger.
        expect(readLegacyTreasuryBlob().transactions).toHaveLength(3);

        expect(purgeLegacyTreasuryBlob()).toEqual({ purged: true });
        expect(localStorage.getItem(LEGACY_TREASURY_TX_KEY)).toBeNull();
        expect(localStorage.getItem(LEGACY_TREASURY_CC_KEY)).toBeNull();
        expect(getLegacyTreasuryPurgeStage()).toBe('purged');
        expect(canPurgeLegacyTreasury()).toBe(false);
    });

    it('gates on the DEVICE record, so another device reaching import_confirmed cannot unlock this one', () => {
        // The migration record is per-device localStorage. This test states the invariant the storage
        // choice encodes: nothing outside this device's own progress can flip canPurge to true.
        seedBlob();
        markLegacyTreasuryExported(OWNER_A, summarizeLegacyTreasuryBlob(readLegacyTreasuryBlob()));
        confirmLegacyTreasuryImported(OWNER_A);
        expect(canPurgeLegacyTreasury()).toBe(true);

        // Simulate a fresh device: same blob, no migration record of its own.
        localStorage.removeItem('warekeep_treasury_legacy_migration_v1');
        expect(canPurgeLegacyTreasury()).toBe(false);
        expect(purgeLegacyTreasuryBlob().purged).toBe(false);
        expect(readLegacyTreasuryBlob().transactions).toHaveLength(3);
    });

    it('adoption does NOT unlock the purge — the two state machines are independent', () => {
        seedBlob();
        recordLegacyTreasuryDecision(OWNER_A, 'adopted', summarizeLegacyTreasuryBlob(readLegacyTreasuryBlob()));
        expect(canPurgeLegacyTreasury()).toBe(false);
        expect(purgeLegacyTreasuryBlob().purged).toBe(false);
        expect(readLegacyTreasuryBlob().transactions).toHaveLength(3);
    });
});

describe('OA-1 export', () => {
    it('emits the exact shape tools/migrate/transform.js reads, with rows VERBATIM', () => {
        seedBlob();
        const payload = buildLegacyTreasuryExport(OWNER_A);

        // transform.js: `tre.transactions || tre.treasuryTransactions` / `tre.cashCounts || ...`
        expect(Array.isArray(payload.transactions)).toBe(true);
        expect(Array.isArray(payload.cashCounts)).toBe(true);
        // Client camelCase preserved untouched — the import mapper is what translates userId to
        // employee_id. Re-keying here would break that contract silently.
        expect(payload.transactions[0]).toEqual(readLegacyTreasuryBlob().transactions[0]);
        expect(payload.transactions[0]).toMatchObject({ id: 'ttx-1', userId: 'whoever', userName: 'Whoever' });
        expect(payload.cashCounts[0]).toEqual(readLegacyTreasuryBlob().cashCounts[0]);
    });

    it('does not round over-scale money — the import must be able to reject it', () => {
        localStorage.setItem(LEGACY_TREASURY_TX_KEY, JSON.stringify([
            { id: 'bad', date: '2026-01-02', direction: 'in', amount: 10.123, currency: 'AFN' }
        ]));
        const payload = buildLegacyTreasuryExport(OWNER_A);
        expect(payload.transactions[0].amount).toBe(10.123);
        expect(payload.export_meta.over_scale_transaction_ids).toEqual(['bad']);
    });

    it('carries device/export metadata allowing reconciliation by COUNT and per-row', () => {
        seedBlob();
        const payload = buildLegacyTreasuryExport(OWNER_A);

        expect(payload.export_meta).toMatchObject({
            kind: 'warekeep-oa1-treasury-export',
            version: 1,
            device_id: 'device-1',
            exported_by_user_id: 'user-a',
            transaction_count: 3,
            cash_count_count: 1,
            earliest_date: '2026-01-14',
            latest_date: '2026-03-03'
        });
        expect(payload.export_meta.exported_at).toEqual(expect.any(String));
        expect(payload.export_meta.currency_totals).toEqual([
            { currency: 'AFN', transactionCount: 2, inTotal: '1500.50', outTotal: '250.25', netTotal: '1250.25' },
            { currency: 'USD', transactionCount: 1, inTotal: '40.00', outTotal: '0.00', netTotal: '40.00' }
        ]);
        // The counts are an INDEPENDENT basis: they must match the rows actually shipped.
        expect(payload.export_meta.transaction_count).toBe(payload.transactions.length);
        expect(payload.export_meta.cash_count_count).toBe(payload.cashCounts.length);
    });

    it('states no tenant at the top level, where transform.js sniffs for one', () => {
        // transform.js flags top-level business_id/userId/account_id/... as "ignored on principle":
        // the tenant is the operator's to state via --business-id. Our own metadata must not sit
        // there pretending to be scope.
        seedBlob();
        const payload = buildLegacyTreasuryExport(OWNER_A) as unknown as Record<string, unknown>;
        for (const key of ['business_id', 'businessId', 'user_id', 'userId', 'account_id', 'accountId', 'workspace_id', 'workspaceId']) {
            expect(payload[key]).toBeUndefined();
        }
    });

    it('still exports after adoption — adoption is not a substitute for the migration file', () => {
        seedBlob();
        recordLegacyTreasuryDecision(OWNER_A, 'adopted', summarizeLegacyTreasuryBlob(readLegacyTreasuryBlob()));
        expect(buildLegacyTreasuryExport(OWNER_A).transactions).toHaveLength(3);
    });
});
