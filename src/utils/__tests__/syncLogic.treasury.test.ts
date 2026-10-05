import { describe, expect, it } from 'vitest';
import { performSmartMerge, mergeRemoteSnapshotForLocalState } from '../syncLogic';
import type { FullData } from '../syncLogic';
import type { TreasuryTransaction, TreasuryCashCount, TreasuryAccount } from '../../types';

// The bug these tests exist to prevent: SILENT DESTRUCTION OF THE CASH LEDGER.
//
// performSmartMerge builds its result from an explicit 11-key allowlist rather than a spread, and
// mergeRemoteSnapshotForLocalState can return a remote snapshot wholesale. Both predate treasury
// living in FullData, so both would drop the treasury slices on the floor — on EVERY merge, in the
// default (legacy) sync mode, with no error anywhere.

const tx = (id: string, over: Partial<TreasuryTransaction> = {}): TreasuryTransaction => ({
  id,
  date: '2026-07-01T09:00:00.000Z',
  type: 'external_income',
  direction: 'in',
  amount: 250.5,
  currency: 'AFN',
  description: `movement ${id}`,
  updatedAt: '2026-07-01T09:00:00.000Z',
  ...over,
});

const cashCount = (id: string, over: Partial<TreasuryCashCount> = {}): TreasuryCashCount => ({
  id,
  date: '2026-07-01T18:00:00.000Z',
  expectedBalance: 250.5,
  actualBalance: 250,
  difference: -0.5,
  currency: 'AFN',
  updatedAt: '2026-07-01T18:00:00.000Z',
  ...over,
});

const account = (id: string, over: Partial<TreasuryAccount> = {}): TreasuryAccount => ({
  id,
  name: 'General Treasury',
  accountType: 'cash',
  currency: 'AFN',
  isDefault: true,
  isSystem: true,
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...over,
});

const baseSnapshot = (over: Partial<FullData> = {}): FullData => ({
  medicines: [],
  customers: [],
  invoices: [],
  expenses: [],
  suppliers: [],
  purchases: [],
  settings: { storeName: 'Local' } as FullData['settings'],
  ...over,
});

describe('syncLogic treasury merge — the cash ledger survives every merge path', () => {
  it('performSmartMerge carries treasury through the allowlist instead of dropping it', () => {
    const local = baseSnapshot({
      treasuryTransactions: [tx('tt-local-1')],
      treasuryCashCounts: [cashCount('tcc-local-1')],
      treasuryAccounts: [account('tra-general-1')],
      settings: { storeName: 'Local', updatedAt: '2026-07-01T10:00:00.000Z' } as FullData['settings'],
      version: 1,
    });
    const cloud = baseSnapshot({
      treasuryTransactions: [tx('tt-cloud-1', { updatedAt: '2026-07-01T11:00:00.000Z' })],
      treasuryCashCounts: [cashCount('tcc-cloud-1', { updatedAt: '2026-07-01T11:00:00.000Z' })],
      treasuryAccounts: [account('tra-general-1')],
      settings: { storeName: 'Cloud', updatedAt: '2026-07-01T11:00:00.000Z' } as FullData['settings'],
      version: 2,
    });

    const merged = performSmartMerge(local, cloud).data;

    // Union of both sides — a local movement is never lost to a merge, and a remote one is picked up.
    expect(merged.treasuryTransactions?.map((t) => t.id)).toEqual(['tt-local-1', 'tt-cloud-1']);
    expect(merged.treasuryCashCounts?.map((c) => c.id)).toEqual(['tcc-local-1', 'tcc-cloud-1']);
    expect(merged.treasuryAccounts?.map((a) => a.id)).toEqual(['tra-general-1']);
    // Money stays a number in the client's in-memory shape (the string contract is wire-only).
    expect(merged.treasuryTransactions?.[0].amount).toBe(250.5);
  });

  it('performSmartMerge round-trips: merging a merged snapshot again keeps the ledger', () => {
    const local = baseSnapshot({ treasuryTransactions: [tx('tt-1')], version: 1 });
    const cloud = baseSnapshot({ treasuryTransactions: [tx('tt-2')], version: 2 });

    const once = performSmartMerge(local, cloud).data;
    const twice = performSmartMerge(once, cloud).data;

    expect(twice.treasuryTransactions?.map((t) => t.id)).toEqual(['tt-1', 'tt-2']);
  });

  it('preserves local treasury when an authoritative remote snapshot has no treasury slice at all', () => {
    // Every snapshot written before treasury joined FullData looks exactly like this remote one.
    const local = baseSnapshot({
      medicines: [{ id: 'med-local' }] as unknown as FullData['medicines'],
      treasuryTransactions: [tx('tt-local-1'), tx('tt-local-2')],
      treasuryCashCounts: [cashCount('tcc-local-1')],
      treasuryAccounts: [account('tra-general-1')],
      settings: { storeName: 'Local', updatedAt: '2026-07-01T10:00:00.000Z' } as FullData['settings'],
      version: 1,
    });
    const remote = {
      ...baseSnapshot({ medicines: [{ id: 'med-remote' }] as unknown as FullData['medicines'] }),
      settings: { storeName: 'Cloud', updatedAt: '2026-07-01T12:00:00.000Z' },
      version: 5,
    };

    const merged = mergeRemoteSnapshotForLocalState(local, remote, {
      remoteAuthoritative: true,
      hasPendingLocalWork: false,
    });

    // Guard: prove we actually took the WHOLESALE-REPLACE branch (remote wins for medicines).
    expect(merged.medicines.map((m) => m.id)).toEqual(['med-remote']);
    // ...and that treasury was carved out of that replace.
    expect(merged.treasuryTransactions?.map((t) => t.id)).toEqual(['tt-local-1', 'tt-local-2']);
    expect(merged.treasuryCashCounts?.map((c) => c.id)).toEqual(['tcc-local-1']);
    expect(merged.treasuryAccounts?.map((a) => a.id)).toEqual(['tra-general-1']);
  });

  it('unions rather than replaces when an authoritative remote snapshot does carry treasury', () => {
    const local = baseSnapshot({
      treasuryTransactions: [tx('tt-local-only')],
      settings: { storeName: 'Local', updatedAt: '2026-07-01T10:00:00.000Z' } as FullData['settings'],
      version: 1,
    });
    const remote = {
      ...baseSnapshot(),
      treasuryTransactions: [tx('tt-remote-only')],
      settings: { storeName: 'Cloud', updatedAt: '2026-07-01T12:00:00.000Z' },
      version: 5,
    };

    const merged = mergeRemoteSnapshotForLocalState(local, remote, {
      remoteAuthoritative: true,
      hasPendingLocalWork: false,
    });

    expect(merged.treasuryTransactions?.map((t) => t.id).sort()).toEqual(['tt-local-only', 'tt-remote-only']);
  });

  it('keeps the slice absent when neither side has treasury (legacy snapshots round-trip unchanged)', () => {
    const local = baseSnapshot({ version: 1 });
    const remote = { ...baseSnapshot(), settings: { storeName: 'Cloud', updatedAt: '2026-07-01T12:00:00.000Z' }, version: 5 };

    const merged = mergeRemoteSnapshotForLocalState(local, remote, {
      remoteAuthoritative: true,
      hasPendingLocalWork: false,
    });

    expect(merged.treasuryTransactions).toBeUndefined();
  });

  it('keeps the merged (union) treasury when local work is pending, not a local-only override', () => {
    const local = baseSnapshot({
      treasuryTransactions: [tx('tt-local-pending')],
      settings: { storeName: 'Local', updatedAt: '2026-07-01T10:00:00.000Z' } as FullData['settings'],
      version: 3,
    });
    const remote = {
      ...baseSnapshot(),
      treasuryTransactions: [tx('tt-remote-1')],
      settings: { storeName: 'Cloud', updatedAt: '2026-07-01T12:00:00.000Z' },
      version: 5,
    };

    const merged = mergeRemoteSnapshotForLocalState(local, remote, {
      remoteAuthoritative: true,
      hasPendingLocalWork: true,
    });

    // The unsynced local movement survives AND the remote one is not discarded.
    expect(merged.treasuryTransactions?.map((t) => t.id).sort()).toEqual(['tt-local-pending', 'tt-remote-1']);
  });

  it('still honours an explicit treasury reset marker (a reset is not resurrected by another device)', () => {
    // The reason treasury uses mergeLists (like stockMovements) and not the pure-union
    // mergeAuditEvents policy: systemReset({ treasury: true }) must not be undone on the next sync.
    const local = baseSnapshot({
      treasuryTransactions: [],
      settings: {
        storeName: 'Local',
        updatedAt: '2026-07-10T00:00:00.000Z',
        collectionResetAt: { treasuryTransactions: '2026-07-10T00:00:00.000Z' },
      } as unknown as FullData['settings'],
      version: 2,
    });
    const cloud = baseSnapshot({
      treasuryTransactions: [
        tx('tt-before-reset', { date: '2026-07-01T09:00:00.000Z', updatedAt: '2026-07-01T09:00:00.000Z' }),
        tx('tt-after-reset', { date: '2026-07-12T09:00:00.000Z', updatedAt: '2026-07-12T09:00:00.000Z' }),
      ],
      settings: { storeName: 'Cloud', updatedAt: '2026-07-01T09:00:00.000Z' } as FullData['settings'],
      version: 1,
    });

    const merged = performSmartMerge(local, cloud).data;

    // Pre-reset movement stays deleted; a movement recorded AFTER the reset is still adopted.
    expect(merged.treasuryTransactions?.map((t) => t.id)).toEqual(['tt-after-reset']);
  });
});

// ---------------------------------------------------------------------------------------------
// REGRESSION: the global `dataResetAt` must never reach treasury.
//
// Found by adversarial review, and a regression THIS change set created: before treasury lived in
// FullData nothing merged it, so no cutoff could touch it. The logic was exactly inverted —
//   * systemReset({treasury:true})  -> records NO treasury cutoff (treasury is not in
//                                      RESETTABLE_DATA_COLLECTIONS) -> ledger correctly survives...
//   * reset everything EXCEPT treasury -> resetAllCloudCollections is true (CLOUD_SYNC_COLLECTIONS
//                                      excludes treasury) -> stamps the GLOBAL dataResetAt ->
//                                      ledger silently DESTROYED on the next merge.
// i.e. the reset that should clear treasury kept it, and the reset that should keep treasury cleared
// it. Both merge entry points are reachable in the DEFAULT supabase_hybrid mode.
// ---------------------------------------------------------------------------------------------

describe('treasury vs the global dataResetAt cutoff', () => {
  // Every treasury row here predates the cutoff, so an inherited global cutoff drops all of them.
  const dated = (id: string) => tx(id, { date: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  const resetAt = '2026-07-15T00:00:00.000Z';

  it('performSmartMerge KEEPS treasury when the owner reset every OTHER collection', () => {
    // The exact reachable UI path: tick all 8 cloud collections, deliberately leave Treasury unticked.
    const settings = { storeName: 'Local', dataResetAt: resetAt } as FullData['settings'];
    const local = baseSnapshot({ settings, treasuryTransactions: [dated('tt-keep-1'), dated('tt-keep-2')] });
    const cloud = baseSnapshot({ settings });

    const { data } = performSmartMerge(local, cloud);

    expect(data.treasuryTransactions?.map(t => t.id)).toEqual(['tt-keep-1', 'tt-keep-2']);
  });

  it('mergeRemoteSnapshotForLocalState KEEPS treasury under the same global cutoff', () => {
    const settings = { storeName: 'Local', dataResetAt: resetAt } as FullData['settings'];
    const local = baseSnapshot({ settings, treasuryTransactions: [dated('tt-keep-1')] });
    const remote = baseSnapshot({ settings });

    const merged = mergeRemoteSnapshotForLocalState(local, remote);

    expect(merged.treasuryTransactions?.map(t => t.id)).toEqual(['tt-keep-1']);
  });

  it('a restored backup survives the next merge (restore stamps dataResetAt globally)', () => {
    // storageService.prepareImportedFullDataForRestore sets settings.dataResetAt = restore time and
    // lifts only AUTHORITATIVE_RESTORE_COLLECTIONS above it via touchRestoredRecords. Treasury is not
    // in that list, so a restored ledger keeps its ORIGINAL timestamps — below its own cutoff.
    const settings = { storeName: 'Local', dataResetAt: resetAt } as FullData['settings'];
    const restored = baseSnapshot({ settings, treasuryTransactions: [dated('tt-restored')] });

    const { data } = performSmartMerge(restored, baseSnapshot({ settings }));

    expect(data.treasuryTransactions?.map(t => t.id)).toEqual(['tt-restored']);
  });

  it('a PER-COLLECTION treasury cutoff is still honoured — only the global is refused', () => {
    // The fix must not disable the mechanism wholesale: if a treasury reset ever records its own
    // cutoff, it must still drop rows below it.
    const settings = { storeName: 'Local', collectionResetAt: { treasuryTransactions: resetAt } } as unknown as FullData['settings'];
    const local = baseSnapshot({ settings, treasuryTransactions: [dated('tt-old')] });

    const { data } = performSmartMerge(local, baseSnapshot({ settings }));

    expect(data.treasuryTransactions ?? []).toEqual([]);
  });

  it('non-treasury collections STILL inherit the global cutoff (the fix is treasury-scoped)', () => {
    // Control: proves the fix did not simply neuter dataResetAt for everyone.
    const settings = { storeName: 'Local', dataResetAt: resetAt } as FullData['settings'];
    const local = baseSnapshot({
      settings,
      medicines: [{ id: 'med-old', name: 'Old', updatedAt: '2026-01-01T00:00:00.000Z' }] as any,
    });

    const { data } = performSmartMerge(local, baseSnapshot({ settings }));

    expect(data.medicines ?? []).toEqual([]);
  });
});
