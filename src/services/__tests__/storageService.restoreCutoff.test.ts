import { describe, it, expect } from 'vitest';
import { prepareImportedFullDataForRestore } from '../storageService';
import { performSmartMerge } from '../../utils/syncLogic';

// Stage 13 / carried Sev finding 4b-1.
//
// `prepareImportedFullDataForRestore` stamps a reset cutoff and lifts the restored
// records above it by re-stamping updatedAt. It used to lift only 7 of the 9
// AUTHORITATIVE_RESTORE_COLLECTIONS: auditEvents and stockMovements were passed
// through untouched (storageService.ts:1009-1010).
//
// The two are NOT the same case, and the difference is the whole finding:
//
//   stockMovements -> merged by `mergeLists` WITH resetCutoff('stockMovements').
//                     Untouched => historical createdAt <= cutoff => DESTROYED.
//                     This was a real Sev-1, verbatim the 12F treasury mechanism.
//   auditEvents    -> merged by `mergeAuditEvents`, a pure union that never reads
//                     a cutoff. Untouched => harmless. Pinned here so that if the
//                     merge policy ever changes to a cutoff-aware one, this fails
//                     instead of silently destroying the audit trail.
//
// These assert through the REAL merge (performSmartMerge), not by inspecting
// updatedAt: what matters is whether the rows survive, not how they were marked.

const RESET_AT = '2026-07-16T12:00:00.000Z';
const HISTORICAL = '2026-01-05T08:30:00.000Z'; // well below the restore cutoff

const backup = () => ({
  medicines: [{ id: 'med-1', name: 'Amoxicillin', updatedAt: HISTORICAL }],
  customers: [],
  invoices: [],
  expenses: [],
  suppliers: [],
  purchases: [],
  partners: [],
  auditEvents: [
    { id: 'ae-1', timestamp: HISTORICAL, action: 'create', entityType: 'medicine', entityId: 'med-1' },
    { id: 'ae-2', timestamp: HISTORICAL, action: 'update', entityType: 'medicine', entityId: 'med-1' },
  ],
  stockMovements: [
    {
      id: 'sm-1',
      medicineId: 'med-1',
      batchId: 'batch-1',
      type: 'purchase',
      quantityBaseUnit: 10,
      previousStock: 0,
      newStock: 10,
      referenceType: 'purchase',
      referenceId: 'pur-1',
      createdAt: HISTORICAL,
    },
    {
      id: 'sm-2',
      medicineId: 'med-1',
      batchId: 'batch-1',
      type: 'sale',
      quantityBaseUnit: -4,
      previousStock: 10,
      newStock: 6,
      referenceType: 'invoice',
      referenceId: 'inv-1',
      createdAt: HISTORICAL,
    },
  ],
  settings: { storeName: 'Test Pharmacy' },
});

// The restored snapshot is what lands locally; the next sync merges it against the
// cloud copy. An empty cloud side is the honest worst case: nothing to resurrect
// the rows if the restore itself dropped them.
const mergeAfterRestore = (restored: any) => performSmartMerge(restored as any, {
  medicines: [],
  customers: [],
  invoices: [],
  expenses: [],
  suppliers: [],
  purchases: [],
  partners: [],
  auditEvents: [],
  stockMovements: [],
  settings: {},
}).data;

describe('prepareImportedFullDataForRestore — restored history survives the reset cutoff it stamps', () => {
  it('keeps restored stockMovements through the next merge (the 4b-1 Sev-1)', () => {
    const restored = prepareImportedFullDataForRestore(backup(), RESET_AT);
    expect(restored).not.toBeNull();

    const merged = mergeAfterRestore(restored);

    expect((merged.stockMovements || []).map((m: any) => m.id).sort()).toEqual(['sm-1', 'sm-2']);
  });

  it('keeps restored auditEvents through the next merge', () => {
    const restored = prepareImportedFullDataForRestore(backup(), RESET_AT);
    const merged = mergeAfterRestore(restored);

    expect((merged.auditEvents || []).map((e: any) => e.id).sort()).toEqual(['ae-1', 'ae-2']);
  });

  it('lifts restored stockMovements above the cutoff it stamps for them', () => {
    const restored: any = prepareImportedFullDataForRestore(backup(), RESET_AT);

    const cutoffMs = Date.parse(restored.settings.collectionResetAt.stockMovements);
    // The marker is stamped (that is what made the pass-through fatal)...
    expect(Number.isFinite(cutoffMs)).toBe(true);
    // ...so every restored movement must sit strictly above it.
    for (const movement of restored.stockMovements) {
      expect(Date.parse(movement.updatedAt)).toBeGreaterThan(cutoffMs);
    }
  });

  // CONTROL 1 — distinguishes the fix from a harness that keeps everything.
  // A genuine per-collection reset must still drop pre-cutoff movements, or the
  // test above would pass even with the cutoff mechanism entirely broken.
  it('CONTROL: a real stockMovements reset still drops pre-cutoff movements', () => {
    const local: any = {
      ...backup(),
      settings: {
        storeName: 'Test Pharmacy',
        collectionResetAt: { stockMovements: RESET_AT },
      },
    };

    const merged = mergeAfterRestore(local);

    expect(merged.stockMovements || []).toEqual([]);
  });

  // CONTROL 2 — the sibling collections must keep working exactly as before.
  it('CONTROL: restored medicines still survive (unchanged sibling behaviour)', () => {
    const restored = prepareImportedFullDataForRestore(backup(), RESET_AT);
    const merged = mergeAfterRestore(restored);

    expect((merged.medicines || []).map((m: any) => m.id)).toEqual(['med-1']);
  });

  // Records the reason auditEvents is safe to pass through untouched. If the merge
  // policy for auditEvents ever becomes cutoff-aware, this fails and points at the
  // pass-through above — rather than the audit trail quietly disappearing.
  //
  // Note the latent trap this documents: getRecordUpdatedAt() reads
  // updatedAt/deletedAt/createdAt/date — a DomainAuditEntry has NONE of those (it
  // carries `timestamp`), so it would score 0 and ALL audit events would be dropped
  // by any cutoff, not merely the historical ones.
  it('pins WHY auditEvents may be passed through: its merge ignores reset cutoffs entirely', () => {
    const local: any = {
      ...backup(),
      settings: {
        storeName: 'Test Pharmacy',
        // A cutoff far in the future would drop everything IF it were consulted.
        collectionResetAt: { auditEvents: '2099-01-01T00:00:00.000Z' },
        dataResetAt: '2099-01-01T00:00:00.000Z',
      },
    };

    const merged = mergeAfterRestore(local);

    expect((merged.auditEvents || []).map((e: any) => e.id).sort()).toEqual(['ae-1', 'ae-2']);
  });
});
