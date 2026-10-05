import { Medicine, Customer, Invoice, AppSettings, Expense, Supplier, Purchase, Partner, ConflictLog, DomainAuditEntry, StockMovement, TreasuryTransaction, TreasuryCashCount, TreasuryAccount } from '../types';
import { getReceivedPurchaseLineRefs } from './purchaseUtils';
export interface FullData {
    medicines: Medicine[];
    customers: Customer[];
    invoices: Invoice[];
    expenses: Expense[];
    suppliers: Supplier[];
    purchases: Purchase[];
    partners?: Partner[];
    // NEW: Audit Trail snapshot payload stays optional for backward-compatible sync.
    auditEvents?: DomainAuditEntry[];
    stockMovements?: StockMovement[];
    // Treasury (cash ledger). Optional so snapshots written before treasury joined FullData still
    // parse — every merge path below treats a missing slice as "unknown", NOT as "empty", because
    // this is the cash ledger and an absent slice must never read as a deletion.
    treasuryTransactions?: TreasuryTransaction[];
    treasuryCashCounts?: TreasuryCashCount[];
    treasuryAccounts?: TreasuryAccount[];
    settings: AppSettings;
    version?: number;
    updatedAt?: string;
}
export interface MergeResult {
    data: FullData;
    conflicts: ConflictLog[];
}
// --- FIELD-LEVEL MERGE UTILITY ---
// Recursive deep merge. Remote (Server) wins on conflict, preserving local keys if missing in remote.
const MAX_MERGE_DEPTH = 20;
const deepMerge = (local: any, remote: any, _seen?: WeakSet<object>, _depth?: number): any => {
    if (typeof local !== 'object' || local === null)
        return remote !== undefined ? remote : local;
    if (typeof remote !== 'object' || remote === null)
        return local;
    const depth = _depth ?? 0;
    if (depth >= MAX_MERGE_DEPTH)
        return remote;
    const seen = _seen ?? new WeakSet();
    if (seen.has(local) || seen.has(remote))
        return remote;
    if (typeof local === 'object' && local !== null)
        seen.add(local);
    if (typeof remote === 'object' && remote !== null)
        seen.add(remote);
    const output = Array.isArray(local) ? [...local] : { ...local };
    for (const key in remote) {
        const localValue = local[key];
        const remoteValue = remote[key];
        if (Array.isArray(remoteValue)) {
            // For arrays, we assume replacement or specialized list merging logic handled elsewhere
            output[key] = remoteValue;
        }
        else if (typeof remoteValue === 'object' && remoteValue !== null) {
            output[key] = deepMerge(localValue, remoteValue, seen, depth + 1);
        }
        else {
            // Primitive: Remote wins if defined
            if (remoteValue !== undefined) {
                output[key] = remoteValue;
            }
        }
    }
    return output;
};
const parseResetTimestamp = (value: any): number => {
    if (typeof value !== 'string' || value.trim().length === 0)
        return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const isCategoryIconMetaLike = (value: any): boolean => !!value && typeof value === 'object' && !Array.isArray(value) && typeof value.icon === 'string';
/**
 * Entry-level merge of the expenseCategoryIcons map. Whole entries are taken
 * from one side (never field-mixed, so a truncated remote entry can't be
 * laundered into a hybrid), and a user's manual pick always beats an
 * automatically matched entry from the other device.
 */
export const mergeExpenseCategoryIconMaps = (preferred: any, other: any): Record<string, any> | undefined => {
    const preferredMap = preferred && typeof preferred === 'object' && !Array.isArray(preferred) ? preferred : undefined;
    const otherMap = other && typeof other === 'object' && !Array.isArray(other) ? other : undefined;
    if (!preferredMap && !otherMap)
        return undefined;
    // Null prototype so a category literally named '__proto__' stores as an
    // own property instead of mutating the prototype chain.
    const result: Record<string, any> = Object.create(null);
    const keys = new Set([
        ...(preferredMap ? Object.keys(preferredMap) : []),
        ...(otherMap ? Object.keys(otherMap) : [])
    ]);
    keys.forEach((key) => {
        const preferredEntry = preferredMap?.[key];
        const otherEntry = otherMap?.[key];
        const preferredValid = isCategoryIconMetaLike(preferredEntry);
        const otherValid = isCategoryIconMetaLike(otherEntry);
        if (preferredValid && otherValid) {
            const preferredManual = preferredEntry.source === 'manual';
            const otherManual = otherEntry.source === 'manual';
            result[key] = otherManual && !preferredManual ? otherEntry : preferredEntry;
        }
        else if (preferredValid) {
            result[key] = preferredEntry;
        }
        else if (otherValid) {
            result[key] = otherEntry;
        }
    });
    return result;
};
// Treasury slices do NOT inherit the GLOBAL `dataResetAt` cutoff, unlike every other collection.
//
// `dataResetAt` is stamped only when EVERY cloud collection is reset (App.tsx `resetAllCloudCollections`),
// and that set deliberately EXCLUDES treasury — treasury has its own independent reset checkbox. So the
// global flag means "the cloud collections were reset", which says nothing about the cash ledger.
// Letting treasury inherit it inverted the logic exactly: resetting everything EXCEPT treasury (i.e.
// deliberately KEEPING the cash ledger) stamped the global cutoff and silently dropped every treasury
// row on the next merge, while systemReset({treasury:true}) — which records no treasury cutoff at all —
// left it untouched. A backup restore hit the same edge: it stamps `dataResetAt` globally and lifts only
// the collections in storageService's AUTHORITATIVE_RESTORE_COLLECTIONS above it, which treasury is not
// in, so a restored ledger landed BELOW its own cutoff and vanished on the next merge.
//
// The cutoff mechanism exists to stop a stale CLOUD copy resurrecting locally-reset data. That hazard
// cannot arise for treasury: it is stripped from every Supabase payload unconditionally
// (hybridSync `stripSupabaseForbiddenSlices`), and under backend_v2 the server is the source of truth.
// A per-collection treasury cutoff is still honoured if one is ever recorded — only the global is refused.
const TREASURY_COLLECTION_KEYS = new Set(['treasuryTransactions', 'treasuryCashCounts', 'treasuryAccounts']);
const getCollectionResetCutoff = (settings: any, key: string): number => {
    if (!settings || typeof settings !== 'object')
        return 0;
    const collectionResetAt = settings.collectionResetAt;
    const collectionCutoff = collectionResetAt && typeof collectionResetAt === 'object'
        ? parseResetTimestamp(collectionResetAt[key])
        : 0;
    if (TREASURY_COLLECTION_KEYS.has(key))
        return collectionCutoff;
    return Math.max(collectionCutoff, parseResetTimestamp(settings.dataResetAt));
};
const getDeletedRecordTombstoneCutoff = (settings: any, key: string, id: string): number => {
    if (!settings || typeof settings !== 'object' || !id)
        return 0;
    const tombstones = settings.deletedRecordTombstones;
    const collectionTombstones = tombstones && typeof tombstones === 'object' && !Array.isArray(tombstones)
        ? tombstones[key]
        : null;
    if (!collectionTombstones || typeof collectionTombstones !== 'object' || Array.isArray(collectionTombstones)) {
        return 0;
    }
    return parseResetTimestamp(collectionTombstones[id]);
};
const getRecordUpdatedAt = (record: any): number => {
    const candidates = [
        record?.updatedAt,
        record?.deletedAt,
        record?.createdAt,
        record?.date
    ];
    for (const candidate of candidates) {
        const parsed = parseResetTimestamp(candidate);
        if (parsed > 0)
            return parsed;
    }
    return 0;
};
const SYNC_COLLECTION_KEYS = [
    'medicines',
    'customers',
    'invoices',
    'expenses',
    'suppliers',
    'purchases',
    'partners'
] as const;
const hasDeletionMarker = (record: any): boolean => (!!record &&
    typeof record === 'object' &&
    (record.isDeleted === true || parseResetTimestamp(record.deletedAt) > 0));
const hasLocalRemovalMarkers = (data: any): boolean => {
    if (!data || typeof data !== 'object')
        return false;
    const settings = data.settings || {};
    if (parseResetTimestamp(settings.dataResetAt) > 0)
        return true;
    const collectionResetAt = settings.collectionResetAt;
    if (collectionResetAt &&
        typeof collectionResetAt === 'object' &&
        !Array.isArray(collectionResetAt) &&
        Object.values(collectionResetAt).some((value) => parseResetTimestamp(value) > 0)) {
        return true;
    }
    const deletedRecordTombstones = settings.deletedRecordTombstones;
    if (deletedRecordTombstones &&
        typeof deletedRecordTombstones === 'object' &&
        !Array.isArray(deletedRecordTombstones) &&
        Object.values(deletedRecordTombstones).some((collection) => (collection &&
            typeof collection === 'object' &&
            !Array.isArray(collection) &&
            Object.values(collection).some((value) => parseResetTimestamp(value) > 0)))) {
        return true;
    }
    return SYNC_COLLECTION_KEYS.some((key) => (Array.isArray(data[key]) && data[key].some(hasDeletionMarker)));
};
const shouldDropForRemovalMarker = (record: any, resetCutoffMs: number, tombstoneCutoffMs = 0): boolean => {
    if (tombstoneCutoffMs > 0)
        return true;
    const cutoffMs = Math.max(resetCutoffMs || 0, tombstoneCutoffMs || 0);
    if (!cutoffMs || cutoffMs <= 0)
        return false;
    const recordUpdatedAt = getRecordUpdatedAt(record);
    return recordUpdatedAt <= cutoffMs;
};
const getResetMarkerMap = (settings: any): Record<string, string> => {
    const markers = settings?.collectionResetAt;
    if (!markers || typeof markers !== 'object' || Array.isArray(markers))
        return {};
    return Object.entries(markers).reduce<Record<string, string>>((acc, [key, value]) => {
        if (typeof value === 'string' && parseResetTimestamp(value) > 0) {
            acc[key] = value;
        }
        return acc;
    }, {});
};
const getDeletedRecordTombstoneMap = (settings: any): Record<string, Record<string, string>> => {
    const markers = settings?.deletedRecordTombstones;
    if (!markers || typeof markers !== 'object' || Array.isArray(markers))
        return {};
    return Object.entries(markers).reduce<Record<string, Record<string, string>>>((acc, [collectionKey, collectionValue]) => {
        if (!collectionValue || typeof collectionValue !== 'object' || Array.isArray(collectionValue))
            return acc;
        const normalizedCollection = Object.entries(collectionValue).reduce<Record<string, string>>((collectionAcc, [id, value]) => {
            if (id && typeof value === 'string' && parseResetTimestamp(value) > 0) {
                collectionAcc[id] = value;
            }
            return collectionAcc;
        }, {});
        if (Object.keys(normalizedCollection).length > 0) {
            acc[collectionKey] = normalizedCollection;
        }
        return acc;
    }, {});
};
const mergeSettingsPreservingResetMarkers = (localSettings: any = {}, cloudSettings: any = {}) => {
    const localDataReset = parseResetTimestamp(localSettings?.dataResetAt);
    const cloudDataReset = parseResetTimestamp(cloudSettings?.dataResetAt);
    const localMarkers = getResetMarkerMap(localSettings);
    const cloudMarkers = getResetMarkerMap(cloudSettings);
    const localReset = Math.max(localDataReset, ...Object.values(localMarkers).map((value) => parseResetTimestamp(value)));
    const cloudFreshness = Math.max(parseResetTimestamp(cloudSettings?.updatedAt), cloudDataReset, ...Object.values(cloudMarkers).map((value) => parseResetTimestamp(value)));
    const localWins = localReset > cloudFreshness;
    const merged = localWins
        ? deepMerge(cloudSettings || {}, localSettings || {})
        : deepMerge(localSettings || {}, cloudSettings || {});
    // Category icon metadata merges entry-by-entry (manual picks win) instead
    // of the field-mixing deepMerge above.
    const mergedCategoryIcons = mergeExpenseCategoryIconMaps(localWins ? localSettings?.expenseCategoryIcons : cloudSettings?.expenseCategoryIcons, localWins ? cloudSettings?.expenseCategoryIcons : localSettings?.expenseCategoryIcons);
    if (mergedCategoryIcons) {
        merged.expenseCategoryIcons = mergedCategoryIcons;
    }
    if (localDataReset > cloudDataReset) {
        merged.dataResetAt = localSettings.dataResetAt;
    }
    const markerKeys = new Set([...Object.keys(localMarkers), ...Object.keys(cloudMarkers)]);
    if (markerKeys.size > 0) {
        const collectionResetAt: Record<string, string> = {
            ...(merged.collectionResetAt && typeof merged.collectionResetAt === 'object' && !Array.isArray(merged.collectionResetAt)
                ? merged.collectionResetAt
                : {})
        };
        markerKeys.forEach((key) => {
            const localMarker = localMarkers[key];
            const cloudMarker = cloudMarkers[key];
            collectionResetAt[key] =
                parseResetTimestamp(localMarker) > parseResetTimestamp(cloudMarker)
                    ? localMarker
                    : cloudMarker;
        });
        merged.collectionResetAt = collectionResetAt;
    }
    const localTombstones = getDeletedRecordTombstoneMap(localSettings);
    const cloudTombstones = getDeletedRecordTombstoneMap(cloudSettings);
    const tombstoneCollectionKeys = new Set([...Object.keys(localTombstones), ...Object.keys(cloudTombstones)]);
    if (tombstoneCollectionKeys.size > 0) {
        const deletedRecordTombstones: Record<string, Record<string, string>> = {
            ...(merged.deletedRecordTombstones &&
                typeof merged.deletedRecordTombstones === 'object' &&
                !Array.isArray(merged.deletedRecordTombstones)
                ? merged.deletedRecordTombstones
                : {})
        };
        tombstoneCollectionKeys.forEach((collectionKey) => {
            const localCollection = localTombstones[collectionKey] || {};
            const cloudCollection = cloudTombstones[collectionKey] || {};
            const ids = new Set([...Object.keys(localCollection), ...Object.keys(cloudCollection)]);
            const mergedCollection: Record<string, string> = {
                ...(deletedRecordTombstones[collectionKey] &&
                    typeof deletedRecordTombstones[collectionKey] === 'object' &&
                    !Array.isArray(deletedRecordTombstones[collectionKey])
                    ? deletedRecordTombstones[collectionKey]
                    : {})
            };
            ids.forEach((id) => {
                const localMarker = localCollection[id];
                const cloudMarker = cloudCollection[id];
                mergedCollection[id] =
                    parseResetTimestamp(localMarker) > parseResetTimestamp(cloudMarker)
                        ? localMarker
                        : cloudMarker;
            });
            deletedRecordTombstones[collectionKey] = mergedCollection;
        });
        merged.deletedRecordTombstones = deletedRecordTombstones;
    }
    return merged;
};
// Smart Merge: Compares 'updatedAt' timestamps.
const mergeLists = <T extends {
    id: string;
    updatedAt?: string;
}>(localList: T[], cloudList: T[], resetCutoffMs = 0, settings: any = {}, collectionKey = ''): T[] => {
    const mergedMap = new Map<string, T>();
    const getTombstoneCutoff = (record: T) => getDeletedRecordTombstoneCutoff(settings, collectionKey, record?.id);
    localList.forEach(item => {
        if (!item?.id || shouldDropForRemovalMarker(item, resetCutoffMs, getTombstoneCutoff(item)))
            return;
        mergedMap.set(item.id, item);
    });
    cloudList.forEach(cloudItem => {
        if (!cloudItem?.id || shouldDropForRemovalMarker(cloudItem, resetCutoffMs, getTombstoneCutoff(cloudItem)))
            return;
        const localItem = mergedMap.get(cloudItem.id);
        if (localItem) {
            const localTime = localItem.updatedAt ? new Date(localItem.updatedAt).getTime() : 0;
            const cloudTime = cloudItem.updatedAt ? new Date(cloudItem.updatedAt).getTime() : 0;
            if (cloudTime > localTime) {
                // If cloud is strictly newer, take it. 
                // Could apply deepMerge here for finer granularity if needed.
                mergedMap.set(cloudItem.id, cloudItem);
            }
            else if (Math.abs(cloudTime - localTime) < 1000) {
                // Collision/Same time: Merge fields to be safe
                mergedMap.set(cloudItem.id, deepMerge(localItem, cloudItem));
            }
        }
        else {
            mergedMap.set(cloudItem.id, cloudItem);
        }
    });
    return Array.from(mergedMap.values());
};
const mergeAuditEvents = (localEvents: DomainAuditEntry[] = [], cloudEvents: DomainAuditEntry[] = []): DomainAuditEntry[] => {
    const mergedMap = new Map<string, DomainAuditEntry>();
    [...localEvents, ...cloudEvents].forEach((event) => {
        if (!event?.id)
            return;
        const existing = mergedMap.get(event.id);
        if (!existing) {
            mergedMap.set(event.id, event);
            return;
        }
        const existingTime = existing.timestamp ? new Date(existing.timestamp).getTime() : 0;
        const nextTime = event.timestamp ? new Date(event.timestamp).getTime() : 0;
        mergedMap.set(event.id, nextTime >= existingTime ? deepMerge(existing, event) : deepMerge(event, existing));
    });
    return Array.from(mergedMap.values()).sort((left, right) => {
        const leftTime = left.timestamp ? new Date(left.timestamp).getTime() : 0;
        const rightTime = right.timestamp ? new Date(right.timestamp).getTime() : 0;
        return leftTime - rightTime;
    });
};
export const performSmartMerge = (localData: FullData, cloudData: any): MergeResult => {
    if (!cloudData)
        return { data: localData, conflicts: [] };
    // Decrypting wrapper usually happens before this function, 
    // here we assume cloudData is already decrypted JSON object.
    const mergedSettings = mergeSettingsPreservingResetMarkers(localData.settings || {}, cloudData.settings || {});
    const resetCutoff = (key: string) => getCollectionResetCutoff(mergedSettings, key);
    const mergedMedicines = mergeLists(localData.medicines || [], cloudData.medicines || [], resetCutoff('medicines'), mergedSettings, 'medicines');
    const mergedCustomers = mergeLists(localData.customers || [], cloudData.customers || [], resetCutoff('customers'), mergedSettings, 'customers');
    const mergedInvoices = mergeLists(localData.invoices || [], cloudData.invoices || [], resetCutoff('invoices'), mergedSettings, 'invoices');
    const mergedExpenses = mergeLists(localData.expenses || [], cloudData.expenses || [], resetCutoff('expenses'), mergedSettings, 'expenses');
    const mergedSuppliers = mergeLists(localData.suppliers || [], cloudData.suppliers || [], resetCutoff('suppliers'), mergedSettings, 'suppliers');
    const mergedPurchases = mergeLists(localData.purchases || [], cloudData.purchases || [], resetCutoff('purchases'), mergedSettings, 'purchases');
    const mergedPartners = mergeLists(localData.partners || [], cloudData.partners || [], resetCutoff('partners'), mergedSettings, 'partners');
    const mergedAuditEvents = mergeAuditEvents(localData.auditEvents || [], cloudData.auditEvents || []);
    const mergedStockMovements = mergeLists(localData.stockMovements || [], cloudData.stockMovements || [], resetCutoff('stockMovements'), mergedSettings, 'stockMovements');
    // Treasury merges with mergeLists — the same policy as stockMovements, its nearest neighbour
    // (financial, append-only in practice, and resettable). mergeLists is an id-keyed UNION: every
    // local row survives, cloud-only rows are added, and last-writer-wins applies ONLY when the same
    // id exists on both sides. Crucially, shouldDropForRemovalMarker drops nothing unless an EXPLICIT
    // reset cutoff or per-record tombstone says so, which is what "never silently drop a cash entry"
    // requires.
    // NOT mergeAuditEvents (pure union): that ignores reset markers, so a user's treasury reset on one
    // device would be resurrected by any other device still holding the old ledger. Treasury IS
    // resettable (systemReset({ treasury: true })), so it must honour the same cutoffs every other
    // resettable collection does.
    // NOTE: these three keys MUST stay in the literal below. It is an explicit allowlist, not a
    // spread — a key that is merged but not listed here is silently destroyed on every merge.
    const mergedTreasuryTransactions = mergeLists(localData.treasuryTransactions || [], cloudData.treasuryTransactions || [], resetCutoff('treasuryTransactions'), mergedSettings, 'treasuryTransactions');
    const mergedTreasuryCashCounts = mergeLists(localData.treasuryCashCounts || [], cloudData.treasuryCashCounts || [], resetCutoff('treasuryCashCounts'), mergedSettings, 'treasuryCashCounts');
    const mergedTreasuryAccounts = mergeLists(localData.treasuryAccounts || [], cloudData.treasuryAccounts || [], resetCutoff('treasuryAccounts'), mergedSettings, 'treasuryAccounts');
    // Update Version
    const newVersion = Math.max(localData.version || 0, cloudData.version || 0) + 1;
    const mergedData = {
        medicines: mergedMedicines,
        customers: mergedCustomers,
        invoices: mergedInvoices,
        expenses: mergedExpenses,
        suppliers: mergedSuppliers,
        purchases: mergedPurchases,
        partners: mergedPartners,
        auditEvents: mergedAuditEvents,
        stockMovements: mergedStockMovements,
        treasuryTransactions: mergedTreasuryTransactions,
        treasuryCashCounts: mergedTreasuryCashCounts,
        treasuryAccounts: mergedTreasuryAccounts,
        settings: mergedSettings,
        version: newVersion
    };
    return {
        data: mergedData,
        conflicts: []
    };
};
/**
 * Union the treasury slices of `localData` back into a snapshot that is about to REPLACE local state
 * wholesale.
 *
 * Every remote snapshot written before treasury joined FullData carries no treasury slice at all, so
 * a bare `return remoteData` silently destroys the cash ledger. The union uses the same policy
 * performSmartMerge does (id-keyed, LWW per id, honouring the EFFECTIVE snapshot's reset cutoffs and
 * tombstones), so a legitimate remote reset still applies while a merely absent slice degrades to
 * "keep local" instead of "delete everything". A union can only ever be a superset, which is the
 * conservative direction for money; soft-deletes still propagate, because a remote row carrying
 * isDeleted wins on updatedAt for its id.
 */
const withPreservedTreasury = (replacement: FullData, localData: FullData): FullData => {
    const settings: any = replacement?.settings || {};
    const union = <T extends {
        id: string;
        updatedAt?: string;
    }>(local: T[] | undefined, remote: T[] | undefined, collectionKey: string): T[] | undefined => {
        // Neither side has the slice — keep it absent rather than inventing an empty array, so a
        // legacy snapshot round-trips unchanged.
        if (!local?.length && !remote?.length)
            return remote ?? local;
        return mergeLists(local || [], remote || [], getCollectionResetCutoff(settings, collectionKey), settings, collectionKey);
    };
    return {
        ...replacement,
        treasuryTransactions: union(localData?.treasuryTransactions, replacement?.treasuryTransactions, 'treasuryTransactions'),
        treasuryCashCounts: union(localData?.treasuryCashCounts, replacement?.treasuryCashCounts, 'treasuryCashCounts'),
        treasuryAccounts: union(localData?.treasuryAccounts, replacement?.treasuryAccounts, 'treasuryAccounts'),
    };
};
export const mergeRemoteSnapshotForLocalState = (localData: FullData, remoteData: any, options: {
    hasPendingLocalWork?: boolean;
    remoteAuthoritative?: boolean;
} = {}): FullData => {
    if (options.remoteAuthoritative && !options.hasPendingLocalWork) {
        const localVersion = typeof localData.version === 'number' ? localData.version : 0;
        const remoteVersion = typeof remoteData?.version === 'number' ? remoteData.version : 0;
        const localUpdatedAt = new Date(localData.updatedAt || localData.settings?.updatedAt || 0).getTime() || 0;
        const remoteUpdatedAt = new Date(remoteData?.updatedAt || remoteData?.settings?.updatedAt || 0).getTime() || 0;
        const localIsNewer = localVersion > remoteVersion ||
            (localVersion === remoteVersion && localUpdatedAt > remoteUpdatedAt);
        if (!localIsNewer && !hasLocalRemovalMarkers(localData)) {
            // Wholesale replace — but NOT for treasury. `remoteData` is authoritative for the
            // collections it actually carries; a snapshot that predates treasury carries none, and
            // "absent" must not read as "deleted" for the cash ledger.
            return withPreservedTreasury(remoteData as FullData, localData);
        }
    }
    if (options.hasPendingLocalWork) {
        const { dataResetAt: _remoteDataResetAt, collectionResetAt: _remoteCollectionResetAt, ...remoteSettingsWithoutResetCutoffs } = remoteData?.settings || {};
        const merged = performSmartMerge(localData, {
            ...remoteData,
            settings: {
                ...remoteSettingsWithoutResetCutoffs,
                dataResetAt: localData.settings?.dataResetAt,
                collectionResetAt: localData.settings?.collectionResetAt,
            },
        }).data;
        // Local wins outright for the editable business collections while local work is pending.
        // Treasury is deliberately NOT listed: like auditEvents/stockMovements it keeps the MERGED
        // (union) value from performSmartMerge above, which already contains every local row. Pinning
        // it to localData here would discard treasury rows that exist only on the remote.
        return {
            ...merged,
            medicines: localData.medicines || [],
            customers: localData.customers || [],
            invoices: localData.invoices || [],
            expenses: localData.expenses || [],
            suppliers: localData.suppliers || [],
            purchases: localData.purchases || [],
            partners: localData.partners || [],
        };
    }
    return performSmartMerge(localData, remoteData).data;
};
const assert = (condition: boolean, message: string) => {
    if (!condition)
        throw new Error(message);
};
const isFiniteNumber = (value: any) => typeof value === 'number' && Number.isFinite(value);
const isNonEmptyString = (value: any) => typeof value === 'string' && value.trim().length > 0;
const isNonNegativeFiniteNumber = (value: any) => isFiniteNumber(value) && value >= 0;
const isPositiveFiniteNumber = (value: any) => isFiniteNumber(value) && value > 0;
const amountsMatch = (left: number, right: number, tolerance = 0.02) => Math.abs(left - right) <= tolerance;
export const validateIntegrity = (data: any): boolean => {
    assert(!!data && typeof data === 'object', "Integrity Fail: Root invalid");
    const { medicines, customers, invoices, expenses, suppliers, purchases, settings } = data;
    const partners = Array.isArray(data.partners) ? data.partners : [];
    assert(Array.isArray(medicines), "Integrity Fail: medicines must be array");
    assert(Array.isArray(customers), "Integrity Fail: customers must be array");
    assert(Array.isArray(invoices), "Integrity Fail: invoices must be array");
    assert(Array.isArray(expenses), "Integrity Fail: expenses must be array");
    assert(Array.isArray(suppliers), "Integrity Fail: suppliers must be array");
    assert(Array.isArray(purchases), "Integrity Fail: purchases must be array");
    if (data.partners !== undefined) {
        assert(Array.isArray(data.partners), "Integrity Fail: partners must be array");
    }
    // NEW: Optional integrity checks for Audit Trail and procurement receipt/credit structures.
    if ((data as FullData).auditEvents !== undefined) {
        assert(Array.isArray((data as FullData).auditEvents), "Integrity Fail: auditEvents must be array when provided");
    }
    if ((data as FullData).stockMovements !== undefined) {
        assert(Array.isArray((data as FullData).stockMovements), "Integrity Fail: stockMovements must be array when provided");
    }
    assert(!!settings && typeof settings === 'object', "Integrity Fail: settings invalid");
    const purchaseBatchKeys = new Set<string>();
    medicines.forEach((m: any, idx: number) => {
        assert(m && typeof m === 'object', `Integrity Fail: medicines[${idx}] invalid`);
        assert(isNonEmptyString(m.id), `Integrity Fail: medicines[${idx}].id invalid`);
        assert(isNonEmptyString(m.name), `Integrity Fail: medicines[${idx}].name invalid`);
        assert(Array.isArray(m.batches), `Integrity Fail: medicines[${idx}].batches invalid`);
        m.batches.forEach((b: any, bIdx: number) => {
            assert(b && typeof b === 'object', `Integrity Fail: medicines[${idx}].batches[${bIdx}] invalid`);
            assert(isNonEmptyString(b.id), `Integrity Fail: batches[${bIdx}].id invalid`);
            assert(isFiniteNumber(b.quantity), `Integrity Fail: batches[${bIdx}].quantity invalid`);
            assert(isNonNegativeFiniteNumber(b.quantity), `Integrity Fail: batches[${bIdx}].quantity cannot be negative`);
            assert(isFiniteNumber(b.purchasePrice), `Integrity Fail: batches[${bIdx}].purchasePrice invalid`);
            assert(isNonNegativeFiniteNumber(b.purchasePrice), `Integrity Fail: batches[${bIdx}].purchasePrice cannot be negative`);
            if (b.receivedQuantity !== undefined) {
                assert(isNonNegativeFiniteNumber(b.receivedQuantity), `Integrity Fail: batches[${bIdx}].receivedQuantity invalid`);
            }
            assert(isNonEmptyString(b.expiryDate), `Integrity Fail: batches[${bIdx}].expiryDate invalid`);
            if (isNonEmptyString(b.purchaseId)) {
                if (isNonEmptyString(b.purchaseLineId))
                    purchaseBatchKeys.add(`${b.purchaseId}|line:${b.purchaseLineId}`);
                if (typeof b.purchaseItemIndex === 'number')
                    purchaseBatchKeys.add(`${b.purchaseId}|idx:${b.purchaseItemIndex}`);
                purchaseBatchKeys.add(`${b.purchaseId}|batch:${m.id}:${b.batchNumber || ''}:${b.expiryDate || ''}`);
            }
        });
    });
    customers.forEach((c: any, idx: number) => {
        assert(c && typeof c === 'object', `Integrity Fail: customers[${idx}] invalid`);
        assert(isNonEmptyString(c.id), `Integrity Fail: customers[${idx}].id invalid`);
        assert(isNonEmptyString(c.name), `Integrity Fail: customers[${idx}].name invalid`);
        assert(isFiniteNumber(c.balance), `Integrity Fail: customers[${idx}].balance invalid`);
        if (c.transactions !== undefined) {
            assert(Array.isArray(c.transactions), `Integrity Fail: customers[${idx}].transactions invalid`);
        }
    });
    invoices.forEach((inv: any, idx: number) => {
        assert(inv && typeof inv === 'object', `Integrity Fail: invoices[${idx}] invalid`);
        assert(isNonEmptyString(inv.id), `Integrity Fail: invoices[${idx}].id invalid`);
        assert(Array.isArray(inv.items), `Integrity Fail: invoices[${idx}].items invalid`);
        assert(isFiniteNumber(inv.total), `Integrity Fail: invoices[${idx}].total invalid`);
        assert(isFiniteNumber(inv.tax), `Integrity Fail: invoices[${idx}].tax invalid`);
        if (inv.taxRate !== undefined)
            assert(isFiniteNumber(inv.taxRate), `Integrity Fail: invoices[${idx}].taxRate invalid`);
        assert(isFiniteNumber(inv.discount), `Integrity Fail: invoices[${idx}].discount invalid`);
        if (inv.lineDiscountTotal !== undefined)
            assert(isFiniteNumber(inv.lineDiscountTotal), `Integrity Fail: invoices[${idx}].lineDiscountTotal invalid`);
        assert(isFiniteNumber(inv.finalAmount), `Integrity Fail: invoices[${idx}].finalAmount invalid`);
        assert(isFiniteNumber(inv.amountPaid), `Integrity Fail: invoices[${idx}].amountPaid invalid`);
        assert(isFiniteNumber(inv.remainingAmount), `Integrity Fail: invoices[${idx}].remainingAmount invalid`);
        assert(isNonNegativeFiniteNumber(inv.total), `Integrity Fail: invoices[${idx}].total cannot be negative`);
        assert(isNonNegativeFiniteNumber(inv.tax), `Integrity Fail: invoices[${idx}].tax cannot be negative`);
        assert(isNonNegativeFiniteNumber(inv.discount), `Integrity Fail: invoices[${idx}].discount cannot be negative`);
        assert(isNonNegativeFiniteNumber(inv.finalAmount), `Integrity Fail: invoices[${idx}].finalAmount cannot be negative`);
        assert(isNonNegativeFiniteNumber(inv.amountPaid), `Integrity Fail: invoices[${idx}].amountPaid cannot be negative`);
        assert(isNonNegativeFiniteNumber(inv.remainingAmount), `Integrity Fail: invoices[${idx}].remainingAmount cannot be negative`);
        assert(amountsMatch(inv.amountPaid + inv.remainingAmount, inv.finalAmount), `Integrity Fail: invoices[${idx}].amountPaid + remainingAmount must equal finalAmount`);
        assert(isNonEmptyString(inv.date), `Integrity Fail: invoices[${idx}].date invalid`);
        inv.items.forEach((it: any, itIdx: number) => {
            assert(it && typeof it === 'object', `Integrity Fail: invoices[${idx}].items[${itIdx}] invalid`);
            assert(isNonEmptyString(it.medicineId), `Integrity Fail: invoices[${idx}].items[${itIdx}].medicineId invalid`);
            assert(isNonEmptyString(it.batchId), `Integrity Fail: invoices[${idx}].items[${itIdx}].batchId invalid`);
            assert(isFiniteNumber(it.quantity), `Integrity Fail: invoices[${idx}].items[${itIdx}].quantity invalid`);
            assert(isPositiveFiniteNumber(it.quantity), `Integrity Fail: invoices[${idx}].items[${itIdx}].quantity must be positive`);
            if (it.baseQuantity !== undefined) {
                assert(isFiniteNumber(it.baseQuantity), `Integrity Fail: invoices[${idx}].items[${itIdx}].baseQuantity invalid`);
                assert(isPositiveFiniteNumber(it.baseQuantity), `Integrity Fail: invoices[${idx}].items[${itIdx}].baseQuantity must be positive`);
            }
            assert(isFiniteNumber(it.price), `Integrity Fail: invoices[${idx}].items[${itIdx}].price invalid`);
            assert(isNonNegativeFiniteNumber(it.price), `Integrity Fail: invoices[${idx}].items[${itIdx}].price cannot be negative`);
            if (it.discountAmount !== undefined) {
                assert(isFiniteNumber(it.discountAmount), `Integrity Fail: invoices[${idx}].items[${itIdx}].discountAmount invalid`);
                assert(isNonNegativeFiniteNumber(it.discountAmount), `Integrity Fail: invoices[${idx}].items[${itIdx}].discountAmount cannot be negative`);
            }
            if (it.discountPercent !== undefined) {
                assert(isFiniteNumber(it.discountPercent), `Integrity Fail: invoices[${idx}].items[${itIdx}].discountPercent invalid`);
                assert(isNonNegativeFiniteNumber(it.discountPercent), `Integrity Fail: invoices[${idx}].items[${itIdx}].discountPercent cannot be negative`);
            }
            if (it.costPrice !== undefined) {
                assert(isFiniteNumber(it.costPrice), `Integrity Fail: invoices[${idx}].items[${itIdx}].costPrice invalid`);
                assert(isNonNegativeFiniteNumber(it.costPrice), `Integrity Fail: invoices[${idx}].items[${itIdx}].costPrice cannot be negative`);
            }
        });
    });
    expenses.forEach((e: any, idx: number) => {
        assert(e && typeof e === 'object', `Integrity Fail: expenses[${idx}] invalid`);
        assert(isNonEmptyString(e.id), `Integrity Fail: expenses[${idx}].id invalid`);
        assert(isNonEmptyString(e.title), `Integrity Fail: expenses[${idx}].title invalid`);
        assert(isFiniteNumber(e.amount), `Integrity Fail: expenses[${idx}].amount invalid`);
        assert(isNonEmptyString(e.date), `Integrity Fail: expenses[${idx}].date invalid`);
    });
    suppliers.forEach((s: any, idx: number) => {
        assert(s && typeof s === 'object', `Integrity Fail: suppliers[${idx}] invalid`);
        assert(isNonEmptyString(s.id), `Integrity Fail: suppliers[${idx}].id invalid`);
        assert(isNonEmptyString(s.name), `Integrity Fail: suppliers[${idx}].name invalid`);
        assert(isFiniteNumber(s.balance), `Integrity Fail: suppliers[${idx}].balance invalid`);
        if (s.openingBalance !== undefined) {
            assert(isFiniteNumber(s.openingBalance), `Integrity Fail: suppliers[${idx}].openingBalance invalid`);
        }
        if (s.transactions !== undefined) {
            assert(Array.isArray(s.transactions), `Integrity Fail: suppliers[${idx}].transactions invalid`);
        }
    });
    purchases.forEach((p: any, idx: number) => {
        assert(p && typeof p === 'object', `Integrity Fail: purchases[${idx}] invalid`);
        assert(isNonEmptyString(p.id), `Integrity Fail: purchases[${idx}].id invalid`);
        assert(isNonEmptyString(p.supplierId), `Integrity Fail: purchases[${idx}].supplierId invalid`);
        assert(Array.isArray(p.items), `Integrity Fail: purchases[${idx}].items invalid`);
        assert(isFiniteNumber(p.totalAmount), `Integrity Fail: purchases[${idx}].totalAmount invalid`);
        assert(isFiniteNumber(p.paidAmount), `Integrity Fail: purchases[${idx}].paidAmount invalid`);
        assert(isFiniteNumber(p.remainingAmount), `Integrity Fail: purchases[${idx}].remainingAmount invalid`);
        assert(isNonNegativeFiniteNumber(p.totalAmount), `Integrity Fail: purchases[${idx}].totalAmount cannot be negative`);
        assert(isNonNegativeFiniteNumber(p.paidAmount), `Integrity Fail: purchases[${idx}].paidAmount cannot be negative`);
        assert(isNonNegativeFiniteNumber(p.remainingAmount), `Integrity Fail: purchases[${idx}].remainingAmount cannot be negative`);
        const creditedAmount = isFiniteNumber(p.creditedAmount) ? p.creditedAmount : 0;
        assert(isNonNegativeFiniteNumber(creditedAmount), `Integrity Fail: purchases[${idx}].creditedAmount cannot be negative`);
        assert(amountsMatch(p.paidAmount + creditedAmount + p.remainingAmount, p.totalAmount), `Integrity Fail: purchases[${idx}].paidAmount + creditedAmount + remainingAmount must equal totalAmount`);
        assert(isNonEmptyString(p.date), `Integrity Fail: purchases[${idx}].date invalid`);
        if (p.subtotalAmount !== undefined)
            assert(isFiniteNumber(p.subtotalAmount), `Integrity Fail: purchases[${idx}].subtotalAmount invalid`);
        if (p.discountAmount !== undefined)
            assert(isFiniteNumber(p.discountAmount), `Integrity Fail: purchases[${idx}].discountAmount invalid`);
        if (p.taxAmount !== undefined)
            assert(isFiniteNumber(p.taxAmount), `Integrity Fail: purchases[${idx}].taxAmount invalid`);
        if (p.shippingAmount !== undefined)
            assert(isFiniteNumber(p.shippingAmount), `Integrity Fail: purchases[${idx}].shippingAmount invalid`);
        if (p.extraChargesAmount !== undefined)
            assert(isFiniteNumber(p.extraChargesAmount), `Integrity Fail: purchases[${idx}].extraChargesAmount invalid`);
        if (p.payments !== undefined)
            assert(Array.isArray(p.payments), `Integrity Fail: purchases[${idx}].payments invalid`);
        if (p.receipts !== undefined)
            assert(Array.isArray(p.receipts), `Integrity Fail: purchases[${idx}].receipts invalid`);
        if (p.vendorCredits !== undefined)
            assert(Array.isArray(p.vendorCredits), `Integrity Fail: purchases[${idx}].vendorCredits invalid`);
        if (p.attachments !== undefined)
            assert(Array.isArray(p.attachments), `Integrity Fail: purchases[${idx}].attachments invalid`);
        p.items.forEach((it: any, itIdx: number) => {
            assert(it && typeof it === 'object', `Integrity Fail: purchases[${idx}].items[${itIdx}] invalid`);
            assert(isNonEmptyString(it.medicineId), `Integrity Fail: purchases[${idx}].items[${itIdx}].medicineId invalid`);
            assert(isFiniteNumber(it.quantity), `Integrity Fail: purchases[${idx}].items[${itIdx}].quantity invalid`);
            assert(isPositiveFiniteNumber(it.quantity), `Integrity Fail: purchases[${idx}].items[${itIdx}].quantity must be positive`);
            if (it.baseQuantity !== undefined) {
                assert(isFiniteNumber(it.baseQuantity), `Integrity Fail: purchases[${idx}].items[${itIdx}].baseQuantity invalid`);
                assert(isPositiveFiniteNumber(it.baseQuantity), `Integrity Fail: purchases[${idx}].items[${itIdx}].baseQuantity must be positive`);
            }
            assert(isFiniteNumber(it.purchasePrice), `Integrity Fail: purchases[${idx}].items[${itIdx}].purchasePrice invalid`);
            assert(isNonNegativeFiniteNumber(it.purchasePrice), `Integrity Fail: purchases[${idx}].items[${itIdx}].purchasePrice cannot be negative`);
        });
        (p.payments || []).forEach((payment: any, paymentIdx: number) => {
            assert(payment && typeof payment === 'object', `Integrity Fail: purchases[${idx}].payments[${paymentIdx}] invalid`);
            assert(isFiniteNumber(payment.amount), `Integrity Fail: purchases[${idx}].payments[${paymentIdx}].amount invalid`);
            assert(isNonEmptyString(payment.date), `Integrity Fail: purchases[${idx}].payments[${paymentIdx}].date invalid`);
        });
        (p.receipts || []).forEach((receipt: any, receiptIdx: number) => {
            assert(receipt && typeof receipt === 'object', `Integrity Fail: purchases[${idx}].receipts[${receiptIdx}] invalid`);
            assert(Array.isArray(receipt.items), `Integrity Fail: purchases[${idx}].receipts[${receiptIdx}].items invalid`);
            assert(isNonEmptyString(receipt.date), `Integrity Fail: purchases[${idx}].receipts[${receiptIdx}].date invalid`);
        });
        (p.vendorCredits || []).forEach((credit: any, creditIdx: number) => {
            assert(credit && typeof credit === 'object', `Integrity Fail: purchases[${idx}].vendorCredits[${creditIdx}] invalid`);
            assert(isFiniteNumber(credit.amount), `Integrity Fail: purchases[${idx}].vendorCredits[${creditIdx}].amount invalid`);
            assert(Array.isArray(credit.items), `Integrity Fail: purchases[${idx}].vendorCredits[${creditIdx}].items invalid`);
        });
        getReceivedPurchaseLineRefs(p).forEach((ref) => {
            const item = typeof ref.purchaseItemIndex === 'number'
                ? p.items[ref.purchaseItemIndex]
                : p.items.find((candidate: any) => candidate.lineId === ref.lineId);
            const descriptiveKey = `${p.id}|batch:${ref.medicineId || item?.medicineId || ''}:${ref.batchNumber || item?.batchNumber || ''}:${item?.expiryDate || ''}`;
            const legacyIndexKey = typeof ref.purchaseItemIndex === 'number' ? `${p.id}|idx:${ref.purchaseItemIndex}` : '';
            assert(purchaseBatchKeys.has(`${p.id}|${ref.key}`)
                || (legacyIndexKey && purchaseBatchKeys.has(legacyIndexKey))
                || purchaseBatchKeys.has(descriptiveKey), `Integrity Fail: purchases[${idx}].items received line missing batch`);
        });
    });
    partners.forEach((partner: any, idx: number) => {
        assert(partner && typeof partner === 'object', `Integrity Fail: partners[${idx}] invalid`);
        assert(isNonEmptyString(partner.id), `Integrity Fail: partners[${idx}].id invalid`);
        assert(isNonEmptyString(partner.name), `Integrity Fail: partners[${idx}].name invalid`);
        assert(isFiniteNumber(partner.openingCapital), `Integrity Fail: partners[${idx}].openingCapital invalid`);
        assert(Array.isArray(partner.ledger), `Integrity Fail: partners[${idx}].ledger invalid`);
        partner.ledger.forEach((entry: any, entryIdx: number) => {
            assert(entry && typeof entry === 'object', `Integrity Fail: partners[${idx}].ledger[${entryIdx}] invalid`);
            assert(isNonEmptyString(entry.id), `Integrity Fail: partners[${idx}].ledger[${entryIdx}].id invalid`);
            assert(isNonEmptyString(entry.date), `Integrity Fail: partners[${idx}].ledger[${entryIdx}].date invalid`);
            assert(isFiniteNumber(entry.amount), `Integrity Fail: partners[${idx}].ledger[${entryIdx}].amount invalid`);
        });
    });
    (((data as FullData).auditEvents || []) as any[]).forEach((event: any, idx: number) => {
        assert(event && typeof event === 'object', `Integrity Fail: auditEvents[${idx}] invalid`);
        assert(isNonEmptyString(event.id), `Integrity Fail: auditEvents[${idx}].id invalid`);
        assert(isNonEmptyString(event.timestamp), `Integrity Fail: auditEvents[${idx}].timestamp invalid`);
        assert(isNonEmptyString(event.action), `Integrity Fail: auditEvents[${idx}].action invalid`);
        assert(isNonEmptyString(event.entityType), `Integrity Fail: auditEvents[${idx}].entityType invalid`);
        assert(isNonEmptyString(event.entityId), `Integrity Fail: auditEvents[${idx}].entityId invalid`);
    });
    (((data as FullData).stockMovements || []) as any[]).forEach((movement: any, idx: number) => {
        assert(movement && typeof movement === 'object', `Integrity Fail: stockMovements[${idx}] invalid`);
        assert(isNonEmptyString(movement.id), `Integrity Fail: stockMovements[${idx}].id invalid`);
        assert(isNonEmptyString(movement.medicineId), `Integrity Fail: stockMovements[${idx}].medicineId invalid`);
        assert(isNonEmptyString(movement.batchId), `Integrity Fail: stockMovements[${idx}].batchId invalid`);
        assert(isNonEmptyString(movement.type), `Integrity Fail: stockMovements[${idx}].type invalid`);
        assert(isFiniteNumber(movement.quantityBaseUnit), `Integrity Fail: stockMovements[${idx}].quantityBaseUnit invalid`);
        assert(isFiniteNumber(movement.previousStock), `Integrity Fail: stockMovements[${idx}].previousStock invalid`);
        assert(isFiniteNumber(movement.newStock), `Integrity Fail: stockMovements[${idx}].newStock invalid`);
        assert(isNonNegativeFiniteNumber(movement.previousStock), `Integrity Fail: stockMovements[${idx}].previousStock cannot be negative`);
        assert(isNonNegativeFiniteNumber(movement.newStock), `Integrity Fail: stockMovements[${idx}].newStock cannot be negative`);
        assert(amountsMatch(movement.previousStock + movement.quantityBaseUnit, movement.newStock), `Integrity Fail: stockMovements[${idx}].previousStock + quantityBaseUnit must equal newStock`);
        assert(isNonEmptyString(movement.referenceType), `Integrity Fail: stockMovements[${idx}].referenceType invalid`);
        assert(isNonEmptyString(movement.referenceId), `Integrity Fail: stockMovements[${idx}].referenceId invalid`);
        assert(isNonEmptyString(movement.createdAt), `Integrity Fail: stockMovements[${idx}].createdAt invalid`);
    });
    return true;
};
export const validateSnapshot = validateIntegrity;
const stableStringify = (value: any, seen = new WeakSet()): string => {
    if (value && typeof value === 'object') {
        if (seen.has(value))
            throw new Error("Integrity Fail: Cyclic reference detected");
        seen.add(value);
        if (Array.isArray(value)) {
            const items = value.map(v => stableStringify(v, seen));
            seen.delete(value);
            return `[${items.join(',')}]`;
        }
        const keys = Object.keys(value).sort();
        const props = keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k], seen)}`);
        seen.delete(value);
        return `{${props.join(',')}}`;
    }
    return JSON.stringify(value);
};
const fnv1aHash = (input: string): string => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
};
export const generateDeterministicChecksum = (data: any): string => {
    const stable = stableStringify(data);
    return fnv1aHash(stable);
};
