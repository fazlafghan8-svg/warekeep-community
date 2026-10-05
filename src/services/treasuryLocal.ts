import { TreasuryCashCount, TreasuryTransaction } from '../types';
// ─────────────────────────────────────────────────────────────────────────────
// The LEGACY treasury blob — the Sev-1 this module exists to contain.
//
// Treasury used to persist to these two BARE, UNSCOPED localStorage keys, written imperatively from
// inside a setState updater in App.tsx and loaded once on mount with `[]` deps. Every account that
// ever signed in on the device shared them: user B saw user A's cash ledger, and
// systemReset({ treasury: true }) wrote `[]` over the ledger of EVERY user on the device.
//
// Treasury now lives in FullData and persists through the already user-scoped store
// (storageService getLocalBackupKey -> `warekeep_<userId>_full_backup` + the per-user Electron disk
// store). Nothing in the app writes these keys any more; they are READ-ONLY history from here on.
//
// They are deliberately NOT deleted on sight. The blob is unscoped, so we do not know WHICH user's
// (or which business's) money it records — see the adoption state machine below.
// ─────────────────────────────────────────────────────────────────────────────
export const LEGACY_TREASURY_TX_KEY = 'warekeep_treasury_transactions';
export const LEGACY_TREASURY_CC_KEY = 'warekeep_treasury_cash_counts';
/** Per-(user, device) adoption decisions. */
const ADOPTION_KEY = 'warekeep_treasury_legacy_adoption_v1';
/** Per-DEVICE export/import progress — the only thing that may ever unlock a purge. */
const MIGRATION_KEY = 'warekeep_treasury_legacy_migration_v1';
export interface LegacyTreasuryBlob {
    transactions: TreasuryTransaction[];
    cashCounts: TreasuryCashCount[];
}
/**
 * The client has NO business_id, by contract: business_id is derived from the authenticated session
 * server-side and is never trusted from client input. `userId` is the client's tenant scope — the
 * same key the local snapshot store is already partitioned by (getLocalBackupKey) — so it is what an
 * adoption record can honestly be keyed by here. `deviceId` is passed in rather than imported from
 * deviceService so this module stays free of the Supabase client that module pulls in.
 */
export interface TreasuryScope {
    userId: string;
    deviceId: string;
}
export type LegacyTreasuryDecision = 'adopted' | 'declined';
export interface LegacyTreasuryCurrencyTotal {
    currency: string;
    transactionCount: number;
    /** 2dp decimal strings. Diagnostics for the owner and the import — see summarize()'s note. */
    inTotal: string;
    outTotal: string;
    netTotal: string;
}
export interface LegacyTreasurySummary {
    transactionCount: number;
    cashCountCount: number;
    currencies: LegacyTreasuryCurrencyTotal[];
    earliestDate: string | null;
    latestDate: string | null;
    /**
     * Ids of rows whose amount carries more than 2 fraction digits. The legacy store is JS FLOATS,
     * and the migration tool REJECTS over-scale money per-row rather than rounding it
     * (tools/migrate/transform.js). Surfacing them here means the owner sees what will be refused
     * BEFORE adopting, instead of discovering it as a hole in a total that still reconciles.
     */
    overScaleTransactionIds: string[];
}
const safeParse = <T,>(raw: string | null, fallback: T): T => {
    if (!raw)
        return fallback;
    try {
        const parsed = JSON.parse(raw);
        return (parsed ?? fallback) as T;
    }
    catch {
        return fallback;
    }
};
const readArray = (key: string): any[] => {
    try {
        const parsed = safeParse<any>(localStorage.getItem(key), null);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
/** Reads the unscoped keys DIRECTLY. That is the point: it is the only thing that still may. */
export const readLegacyTreasuryBlob = (): LegacyTreasuryBlob => ({
    transactions: readArray(LEGACY_TREASURY_TX_KEY) as TreasuryTransaction[],
    cashCounts: readArray(LEGACY_TREASURY_CC_KEY) as TreasuryCashCount[]
});
export const hasLegacyTreasuryBlob = (): boolean => {
    const blob = readLegacyTreasuryBlob();
    return blob.transactions.length > 0 || blob.cashCounts.length > 0;
};
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
/** > 2 fraction digits in the float's own shortest representation. */
const isOverScale = (amount: unknown): boolean => {
    if (!isFiniteNumber(amount))
        return false;
    const [, fraction = ''] = String(amount).split('.');
    return fraction.length > 2;
};
const centsOf = (amount: unknown): number => isFiniteNumber(amount) ? Math.round(amount * 100) : 0;
const centsTo2dp = (cents: number): string => {
    const sign = cents < 0 ? '-' : '';
    const abs = Math.abs(cents);
    return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
};
/**
 * Counts, per-currency totals and date range for the adoption prompt and the export envelope.
 *
 * Totals are summed in integer CENTS, not floats, so the figure the owner is shown is not itself a
 * float-drift artefact. They remain DIAGNOSTICS: reconciliation after import is by COUNT and
 * per-row (the rows are exported verbatim), because an over-scale row is rejected by the migration
 * tool and would silently break a totals-only check.
 */
export const summarizeLegacyTreasuryBlob = (blob: LegacyTreasuryBlob): LegacyTreasurySummary => {
    const byCurrency = new Map<string, {
        count: number;
        inCents: number;
        outCents: number;
    }>();
    const overScaleTransactionIds: string[] = [];
    const dates: string[] = [];
    for (const tx of blob.transactions) {
        if (!tx)
            continue;
        const currency = String(tx.currency || 'AFN');
        const bucket = byCurrency.get(currency) || { count: 0, inCents: 0, outCents: 0 };
        bucket.count += 1;
        if (tx.direction === 'out')
            bucket.outCents += centsOf(tx.amount);
        else
            bucket.inCents += centsOf(tx.amount);
        byCurrency.set(currency, bucket);
        if (isOverScale(tx.amount))
            overScaleTransactionIds.push(String(tx.id));
        if (tx.date)
            dates.push(String(tx.date));
    }
    for (const cc of blob.cashCounts) {
        if (cc?.date)
            dates.push(String(cc.date));
    }
    dates.sort();
    return {
        transactionCount: blob.transactions.length,
        cashCountCount: blob.cashCounts.length,
        currencies: [...byCurrency.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([currency, bucket]) => ({
            currency,
            transactionCount: bucket.count,
            inTotal: centsTo2dp(bucket.inCents),
            outTotal: centsTo2dp(bucket.outCents),
            netTotal: centsTo2dp(bucket.inCents - bucket.outCents)
        })),
        earliestDate: dates[0] ?? null,
        latestDate: dates[dates.length - 1] ?? null,
        overScaleTransactionIds
    };
};
// ─────────────────────────────────────────────────────────────────────────────
// ADOPTION — per (user, device). NEVER automatic, in either direction.
//
//   absent ──owner confirms──> adopted    (blob copied into THIS user's scoped slices)
//     │
//     └────owner declines────> declined   (never prompted again for this user on this device)
//
// There is no transition that a timer, a sync, or a mode flag can take on the owner's behalf: the
// blob is unscoped, so only a human can say whose money it is. An un-decided scope simply keeps
// seeing the prompt, which is the safe failure mode — the alternative (guessing) either leaks one
// business's ledger into another's books or destroys it.
// ─────────────────────────────────────────────────────────────────────────────
interface AdoptionRecord {
    decision: LegacyTreasuryDecision;
    at: string;
    /** What was on the device when the decision was taken — evidence, not a trigger. */
    transactionCount: number;
    cashCountCount: number;
}
const scopeKey = (scope: TreasuryScope): string => `${scope.userId}::${scope.deviceId}`;
const readAdoptionMap = (): Record<string, AdoptionRecord> => {
    try {
        const parsed = safeParse<Record<string, AdoptionRecord>>(localStorage.getItem(ADOPTION_KEY), {});
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    }
    catch {
        return {};
    }
};
export const getLegacyTreasuryDecision = (scope: TreasuryScope): LegacyTreasuryDecision | null => {
    if (!scope.userId || !scope.deviceId)
        return null;
    const record = readAdoptionMap()[scopeKey(scope)];
    return record?.decision ?? null;
};
export const recordLegacyTreasuryDecision = (scope: TreasuryScope, decision: LegacyTreasuryDecision, summary: Pick<LegacyTreasurySummary, 'transactionCount' | 'cashCountCount'>): void => {
    if (!scope.userId || !scope.deviceId)
        return;
    try {
        const map = readAdoptionMap();
        map[scopeKey(scope)] = {
            decision,
            at: new Date().toISOString(),
            transactionCount: summary.transactionCount,
            cashCountCount: summary.cashCountCount
        };
        localStorage.setItem(ADOPTION_KEY, JSON.stringify(map));
    }
    catch {
        // A decision we cannot record just means the prompt returns next launch. That is the safe
        // direction: adopting twice is visible and reversible, adopting silently is not.
    }
};
/**
 * The ONLY predicate that may raise the adoption prompt. Every clause is a veto:
 *  - a blob must actually exist on this device;
 *  - the scope must not already hold treasury (we never merge into a populated ledger — that would
 *    make an unscoped blob indistinguishable from this user's own rows);
 *  - the owner must not have already decided for this (user, device);
 *  - the actor must be an owner (a restricted staff account cannot claim another business's money).
 */
export const shouldPromptForLegacyTreasuryAdoption = (args: {
    scope: TreasuryScope;
    hasScopedTreasury: boolean;
    isOwner: boolean;
}): boolean => {
    if (!args.isOwner)
        return false;
    if (!args.scope.userId || !args.scope.deviceId)
        return false;
    if (args.hasScopedTreasury)
        return false;
    if (getLegacyTreasuryDecision(args.scope) !== null)
        return false;
    return hasLegacyTreasuryBlob();
};
// ─────────────────────────────────────────────────────────────────────────────
// PURGE — per DEVICE, and gated on THIS device's export+import, never on a global flag.
//
//   retained ──owner exports (OA-1)──> exported ──owner confirms server import──> import_confirmed
//                                                                                      │
//                                                                            owner purges (explicit)
//                                                                                      ↓
//                                                                                   purged
//
// A device whose treasury was never exported must NEVER be purged: its blob may be the only copy of
// that ledger in existence. "The migration is done" is a statement about a SERVER; it says nothing
// about the device in front of you, which may have been offline for the whole cutover. So the gate
// is per-device evidence — this device exported, and that export was confirmed imported — and even
// then the purge is an explicit owner action, never automatic. Nothing in this module calls
// purgeLegacyTreasuryBlob() on its own.
// ─────────────────────────────────────────────────────────────────────────────
export type LegacyTreasuryPurgeStage = 'retained' | 'exported' | 'import_confirmed' | 'purged';
interface MigrationRecord {
    exportedAt?: string;
    exportedByUserId?: string;
    exportedTransactionCount?: number;
    exportedCashCountCount?: number;
    importConfirmedAt?: string;
    importConfirmedByUserId?: string;
    purgedAt?: string;
}
const readMigrationRecord = (): MigrationRecord => {
    try {
        const parsed = safeParse<MigrationRecord>(localStorage.getItem(MIGRATION_KEY), {});
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    }
    catch {
        return {};
    }
};
const writeMigrationRecord = (next: MigrationRecord): void => {
    try {
        localStorage.setItem(MIGRATION_KEY, JSON.stringify(next));
    }
    catch {
        // Failing to record progress can only ever leave the purge LOCKED, which is the safe side.
    }
};
export const getLegacyTreasuryPurgeStage = (): LegacyTreasuryPurgeStage => {
    const record = readMigrationRecord();
    if (record.purgedAt)
        return 'purged';
    if (record.importConfirmedAt)
        return 'import_confirmed';
    if (record.exportedAt)
        return 'exported';
    return 'retained';
};
export const getLegacyTreasuryMigrationRecord = (): MigrationRecord => readMigrationRecord();
export const markLegacyTreasuryExported = (scope: TreasuryScope, summary: Pick<LegacyTreasurySummary, 'transactionCount' | 'cashCountCount'>): void => {
    const record = readMigrationRecord();
    writeMigrationRecord({
        ...record,
        exportedAt: new Date().toISOString(),
        exportedByUserId: scope.userId,
        exportedTransactionCount: summary.transactionCount,
        exportedCashCountCount: summary.cashCountCount
    });
};
/**
 * The owner asserting that THIS device's export landed in the server-side import. It is a human
 * attestation, not something the client can verify: the client cannot see the import run. Requiring
 * an export first means the attestation can only ever be made about a file that exists.
 */
export const confirmLegacyTreasuryImported = (scope: TreasuryScope): boolean => {
    const record = readMigrationRecord();
    if (!record.exportedAt)
        return false;
    writeMigrationRecord({
        ...record,
        importConfirmedAt: new Date().toISOString(),
        importConfirmedByUserId: scope.userId
    });
    return true;
};
export const canPurgeLegacyTreasury = (): boolean => getLegacyTreasuryPurgeStage() === 'import_confirmed';
/** Explicit owner action only. Refuses unless THIS device reached import_confirmed. */
export const purgeLegacyTreasuryBlob = (): {
    purged: boolean;
    reason?: string;
} => {
    if (!canPurgeLegacyTreasury()) {
        return { purged: false, reason: `purge_blocked:${getLegacyTreasuryPurgeStage()}` };
    }
    try {
        localStorage.removeItem(LEGACY_TREASURY_TX_KEY);
        localStorage.removeItem(LEGACY_TREASURY_CC_KEY);
    }
    catch {
        return { purged: false, reason: 'purge_failed' };
    }
    writeMigrationRecord({ ...readMigrationRecord(), purgedAt: new Date().toISOString() });
    return { purged: true };
};
// ─────────────────────────────────────────────────────────────────────────────
// OA-1 EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export interface LegacyTreasuryExport {
    transactions: TreasuryTransaction[];
    cashCounts: TreasuryCashCount[];
    export_meta: {
        kind: 'warekeep-oa1-treasury-export';
        version: 1;
        exported_at: string;
        device_id: string;
        exported_by_user_id: string;
        transaction_count: number;
        cash_count_count: number;
        currency_totals: LegacyTreasuryCurrencyTotal[];
        earliest_date: string | null;
        latest_date: string | null;
        over_scale_transaction_ids: string[];
        note: string;
    };
}
/**
 * Build the OA-1 export payload.
 *
 * SHAPE IS A CONTRACT with tools/migrate/transform.js, which reads `transactions` / `cashCounts` as
 * the CLIENT camelCase rows (its mapper translates userId/userName -> employee_id/employee_name).
 * Rows are therefore copied VERBATIM — not normalised, not rounded, not re-keyed. An over-scale
 * amount must survive to the import so the tool can REJECT that row loudly; rounding it here would
 * launder a bad value into a total that then reconciles.
 *
 * Metadata is nested under `export_meta` rather than spread at the top level, because transform.js
 * sniffs the top level for tenancy keys (business_id/userId/account_id/...) and flags any it finds
 * as ignored-on-principle. Nesting keeps that check meaningful instead of tripping it with our own
 * bookkeeping. The tenant is the operator's to state via --business-id; nothing here implies one.
 */
export const buildLegacyTreasuryExport = (scope: TreasuryScope, blob: LegacyTreasuryBlob = readLegacyTreasuryBlob()): LegacyTreasuryExport => {
    const summary = summarizeLegacyTreasuryBlob(blob);
    return {
        transactions: blob.transactions,
        cashCounts: blob.cashCounts,
        export_meta: {
            kind: 'warekeep-oa1-treasury-export',
            version: 1,
            exported_at: new Date().toISOString(),
            device_id: scope.deviceId,
            exported_by_user_id: scope.userId,
            transaction_count: summary.transactionCount,
            cash_count_count: summary.cashCountCount,
            currency_totals: summary.currencies,
            earliest_date: summary.earliestDate,
            latest_date: summary.latestDate,
            over_scale_transaction_ids: summary.overScaleTransactionIds,
            note: 'Device-local unscoped legacy treasury blob. Reconcile by count and per-row; totals are diagnostics. Tenant is operator-stated (--business-id), never read from this file.'
        }
    };
};
