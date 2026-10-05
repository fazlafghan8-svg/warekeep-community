import type { AppSettings, Batch, InventoryLinkedSyncSettings, InventoryLinkedSyncTargets, Purchase } from '../types';
export interface InventoryLinkage {
    purchases: boolean;
    partnerships: boolean;
    reasons: string[];
}
interface ResolveInventoryLinkageInput {
    medicineId: string;
    batch?: Partial<Batch> | null;
    batches?: Array<Partial<Batch>> | null;
    purchases?: Purchase[] | null;
}
export const DEFAULT_INVENTORY_LINKED_SYNC_TARGETS: InventoryLinkedSyncTargets = {
    purchases: true,
    partnerships: true,
};
export const DEFAULT_INVENTORY_LINKED_SYNC_SETTINGS: InventoryLinkedSyncSettings = {
    mode: 'ask',
    targets: DEFAULT_INVENTORY_LINKED_SYNC_TARGETS,
};
export const normalizeInventoryLinkedSyncTargets = (targets?: Partial<InventoryLinkedSyncTargets> | null): InventoryLinkedSyncTargets => ({
    purchases: targets?.purchases !== false,
    partnerships: targets?.partnerships !== false,
});
export const normalizeInventoryLinkedSyncSettings = (settings?: Partial<InventoryLinkedSyncSettings> | null): InventoryLinkedSyncSettings => {
    const mode = settings?.mode === 'always' || settings?.mode === 'never' || settings?.mode === 'ask'
        ? settings.mode
        : DEFAULT_INVENTORY_LINKED_SYNC_SETTINGS.mode;
    return {
        mode,
        targets: normalizeInventoryLinkedSyncTargets(settings?.targets),
    };
};
export const getInventoryLinkedSyncSettings = (settings?: AppSettings | null): InventoryLinkedSyncSettings => normalizeInventoryLinkedSyncSettings(settings?.inventoryLinkedSyncSettings);
export const resolveInventoryLinkedSyncTargets = (settings?: AppSettings | null, override?: Partial<InventoryLinkedSyncTargets> | null): InventoryLinkedSyncTargets => {
    if (override)
        return normalizeInventoryLinkedSyncTargets(override);
    const normalized = getInventoryLinkedSyncSettings(settings);
    if (normalized.mode === 'never') {
        return { purchases: false, partnerships: false };
    }
    return normalized.targets;
};
export const hasAnyInventoryLinkedSyncTarget = (targets: InventoryLinkedSyncTargets): boolean => targets.purchases || targets.partnerships;
const partnerOwnershipTypes = new Set(['partner', 'shared', 'consignment']);
const partnerStockEntryTypes = new Set(['partner_goods_capital', 'partner_consignment']);
const hasPartnerMarkers = (value: {
    partnerId?: string;
    ownerPartnerId?: string;
    ownershipType?: string;
    stockEntryType?: string;
    sourceEntryType?: string;
} | null | undefined): boolean => Boolean(value?.partnerId
    || value?.ownerPartnerId
    || partnerOwnershipTypes.has(String(value?.ownershipType || ''))
    || partnerStockEntryTypes.has(String(value?.stockEntryType || ''))
    || partnerStockEntryTypes.has(String(value?.sourceEntryType || '')));
const addReason = (reasons: Set<string>, reason: string) => {
    if (reason)
        reasons.add(reason);
};
export const resolveInventoryLinkage = ({ medicineId, batch, batches, purchases = [], }: ResolveInventoryLinkageInput): InventoryLinkage => {
    const reasons = new Set<string>();
    const batchScope = batch ? [batch] : (batches || []);
    const shouldMatchSpecificBatch = Boolean(batch);
    let purchaseLinked = false;
    let partnershipLinked = false;
    batchScope.forEach((candidate) => {
        if (candidate.purchaseId) {
            purchaseLinked = true;
            addReason(reasons, 'batch.purchaseId');
        }
        if (hasPartnerMarkers(candidate)) {
            partnershipLinked = true;
            addReason(reasons, 'batch.partnerOwnership');
        }
    });
    const matchesBatchScope = (purchase: Purchase, item: {
        medicineId?: string;
        batchNumber?: string;
    }, index?: number) => {
        if (item.medicineId && item.medicineId !== medicineId)
            return false;
        if (!shouldMatchSpecificBatch) {
            if (item.medicineId === medicineId)
                return true;
            return Boolean(item.batchNumber && batchScope.some((candidate) => candidate.batchNumber === item.batchNumber));
        }
        return batchScope.some((candidate) => ((candidate.purchaseId && purchase.id === candidate.purchaseId)
            || (typeof candidate.purchaseItemIndex === 'number' && index === candidate.purchaseItemIndex)
            || (!!candidate.batchNumber && item.batchNumber === candidate.batchNumber)));
    };
    const matchesReceiptScope = (purchase: Purchase, item: {
        medicineId?: string;
        batchId?: string;
        batchNumber?: string;
        purchaseItemIndex?: number;
    }) => {
        if (!shouldMatchSpecificBatch) {
            if (item.medicineId === medicineId)
                return true;
            return Boolean(batchScope.some((candidate) => ((!!candidate.id && item.batchId === candidate.id)
                || (!!candidate.batchNumber && item.batchNumber === candidate.batchNumber))));
        }
        return batchScope.some((candidate) => ((!item.medicineId || item.medicineId === medicineId)
            && ((candidate.purchaseId && purchase.id === candidate.purchaseId)
                || (!!candidate.id && item.batchId === candidate.id)
                || (typeof candidate.purchaseItemIndex === 'number' && item.purchaseItemIndex === candidate.purchaseItemIndex)
                || (!!candidate.batchNumber && item.batchNumber === candidate.batchNumber))));
    };
    (purchases || []).forEach((purchase) => {
        if (purchase.isDeleted)
            return;
        const purchaseHeaderHasPartner = hasPartnerMarkers(purchase);
        (purchase.items || []).forEach((item, index) => {
            if (!matchesBatchScope(purchase, item, index))
                return;
            purchaseLinked = true;
            addReason(reasons, 'purchase.items.medicine');
            if (purchaseHeaderHasPartner || hasPartnerMarkers(item)) {
                partnershipLinked = true;
                addReason(reasons, 'purchase.items.partnerOwnership');
            }
        });
        (purchase.receipts || []).forEach((receipt) => {
            (receipt.items || []).forEach((item) => {
                if (!matchesReceiptScope(purchase, item))
                    return;
                purchaseLinked = true;
                addReason(reasons, item.batchId ? 'purchase.receipts.batch' : 'purchase.receipts.medicine');
                if (purchaseHeaderHasPartner || hasPartnerMarkers(item)) {
                    partnershipLinked = true;
                    addReason(reasons, 'purchase.receipts.partnerOwnership');
                }
            });
        });
    });
    return {
        purchases: purchaseLinked,
        partnerships: partnershipLinked,
        reasons: Array.from(reasons),
    };
};
export const intersectInventorySyncTargetsWithLinkage = (targets: Partial<InventoryLinkedSyncTargets> | null | undefined, linkage: Pick<InventoryLinkage, 'purchases' | 'partnerships'>): InventoryLinkedSyncTargets => {
    const normalizedTargets = normalizeInventoryLinkedSyncTargets(targets);
    return {
        purchases: normalizedTargets.purchases && linkage.purchases,
        partnerships: normalizedTargets.partnerships && linkage.partnerships,
    };
};
