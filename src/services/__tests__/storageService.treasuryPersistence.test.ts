// Treasury persists through the USER-SCOPED local store.
//
// WHY THIS FILE EXISTS. Treasury's legacy keys ('warekeep_treasury_transactions',
// 'warekeep_treasury_cash_counts') are bare and UNSCOPED — shared by every account on the device.
// The fix is not a new scoped key, it is routing treasury through the store that is ALREADY
// user-scoped: getLocalBackupKey(userId) -> `warekeep_<userId>_full_backup`, plus the per-user
// Electron disk store. That only works if every leg of the persist path carries the new slices.
//
// The sanitize/normalize legs are passthrough spreads, so "treasury survives" LOOKS self-evident —
// which is exactly why it is asserted rather than assumed. A future allowlist added to
// normalizeFullData (the shape performSmartMerge already has, and which silently destroyed unknown
// keys for years) would break this with no other test noticing.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../medicineTextSanitization', () => ({ sanitizeMedicineClinicalSummary: (v: any) => v }));

import { sanitizeFullData, saveToDisk } from '../storageService';

const treasuryTransactions = [
  { id: 'tt1', date: '2026-07-01', type: 'external_income', amount: 12345.67, currency: 'AFN' },
];
const treasuryCashCounts = [
  { id: 'cc1', date: '2026-07-01', expectedBalance: 12345.67, actualBalance: 12345.67, currency: 'AFN' },
];
const treasuryAccounts = [
  { id: 'ta1', name: 'General Treasury', accountType: 'cash', currency: 'AFN', isDefault: true, isSystem: true },
];

const fullData = (overrides: Record<string, unknown> = {}) => ({
  medicines: [], customers: [], invoices: [], expenses: [],
  suppliers: [], purchases: [], partners: [],
  auditEvents: [], stockMovements: [],
  treasuryTransactions, treasuryCashCounts, treasuryAccounts,
  settings: {},
  version: 1,
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('sanitizeFullData carries the treasury slices', () => {
  it('preserves treasury rows verbatim', () => {
    const sanitized: any = sanitizeFullData(fullData());

    expect(sanitized.treasuryTransactions).toEqual(treasuryTransactions);
    expect(sanitized.treasuryCashCounts).toEqual(treasuryCashCounts);
    expect(sanitized.treasuryAccounts).toEqual(treasuryAccounts);
  });

  it('leaves an ABSENT treasury slice absent rather than coercing it to []', () => {
    // Load-bearing, and the reason this is not just "spread, obviously fine": every merge path in
    // syncLogic distinguishes "slice missing => unknown, keep local" from "slice empty => the user
    // deleted everything". If sanitize invented [] here the way it does for auditEvents, a snapshot
    // written before treasury joined FullData would round-trip into an authoritative empty ledger.
    const { treasuryTransactions: _a, treasuryCashCounts: _b, treasuryAccounts: _c, ...withoutTreasury } = fullData();
    const sanitized: any = sanitizeFullData(withoutTreasury);

    expect(sanitized).not.toHaveProperty('treasuryTransactions');
    expect(sanitized).not.toHaveProperty('treasuryCashCounts');
    expect(sanitized).not.toHaveProperty('treasuryAccounts');
  });
});

describe('saveToDisk persists treasury to the user-scoped store', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as any).electronAPI;
  });

  it('writes treasury under the per-user backup key (web mode)', async () => {
    await saveToDisk(fullData(), 'user-a');

    const raw = localStorage.getItem('warekeep_user-a_full_backup');
    expect(raw).toBeTruthy();
    const stored = JSON.parse(raw as string);
    expect(stored.treasuryTransactions).toEqual(treasuryTransactions);
    expect(stored.treasuryCashCounts).toEqual(treasuryCashCounts);
    expect(stored.treasuryAccounts).toEqual(treasuryAccounts);
  });

  it('scopes treasury per user — user B cannot see user A\'s ledger', async () => {
    // The whole point of the change. Under the legacy bare keys both users shared one ledger.
    await saveToDisk(fullData(), 'user-a');
    await saveToDisk(fullData({ treasuryTransactions: [], treasuryCashCounts: [], treasuryAccounts: [] }), 'user-b');

    const a = JSON.parse(localStorage.getItem('warekeep_user-a_full_backup') as string);
    const b = JSON.parse(localStorage.getItem('warekeep_user-b_full_backup') as string);

    expect(a.treasuryTransactions).toHaveLength(1);
    expect(b.treasuryTransactions).toHaveLength(0);
  });

  it('includes treasury in an Electron PATCH write instead of silently dropping it', async () => {
    // The concrete bug PERSISTED_SLICE_KEYS fixes. changedSlices is filtered against that set; an
    // unlisted slice is omitted from the patch while its siblings still write, leaving the on-disk
    // ledger stale with no error anywhere.
    const saveDataPatch = vi.fn().mockResolvedValue({ success: true });
    const saveData = vi.fn().mockResolvedValue({ success: true });
    (window as any).electronAPI = { saveDataPatch, saveData };

    await saveToDisk(fullData(), 'user-a', { changedSlices: ['invoices', 'treasuryTransactions'] });

    expect(saveDataPatch).toHaveBeenCalled();
    const [patchArg] = saveDataPatch.mock.calls[0];
    expect(Object.keys(patchArg.slices).sort()).toEqual(['invoices', 'treasuryTransactions']);
    expect(patchArg.slices.treasuryTransactions).toEqual(treasuryTransactions);
  });

  it.each(['treasuryTransactions', 'treasuryCashCounts', 'treasuryAccounts'])(
    'rejects a malformed %s collection before replacing the existing backup', async (slice) => {
      await saveToDisk(fullData(), 'user-a');
      const before = localStorage.getItem('warekeep_user-a_full_backup');
      for (const malformed of [{ invalid: 'collection' }, null, [null], [42]]) {
        await expect(saveToDisk(fullData({ [slice]: malformed }), 'user-a')).rejects.toThrow(/Integrity Fail/);
        expect(localStorage.getItem('warekeep_user-a_full_backup')).toBe(before);
      }
    }
  );
});
