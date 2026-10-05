import type { InvoiceItem, Medicine } from '../types';
import { isBatchSellable } from './batchUtils';
import { getInvoiceItemBaseQuantity } from './unitConversion';
export type InvoiceStockValidationIssueCode = 'ITEM_QUANTITY_INVALID' | 'MEDICINE_NOT_FOUND' | 'BATCH_NOT_FOUND' | 'BATCH_NOT_SELLABLE' | 'INSUFFICIENT_STOCK';
export interface InvoiceStockValidationIssue {
    code: InvoiceStockValidationIssueCode;
    medicineId: string;
    batchId?: string;
    medicineName?: string;
    batchNumber?: string;
    requested: number;
    available: number;
}
export interface InvoiceStockValidationResult {
    ok: boolean;
    issues: InvoiceStockValidationIssue[];
}
const toSafeQuantity = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};
const buildLineKey = (medicineId: string, batchId: string) => `${medicineId}\u0000${batchId}`;
export const validateInvoiceStock = (items: InvoiceItem[], medicines: Medicine[], options?: {
    allowNegativeStock?: boolean;
}): InvoiceStockValidationResult => {
    if (options?.allowNegativeStock) {
        return { ok: true, issues: [] };
    }
    const medicinesById = new Map(medicines
        .filter((medicine) => !medicine.isDeleted)
        .map((medicine) => [medicine.id, medicine]));
    const requestedByBatch = new Map<string, {
        medicineId: string;
        batchId: string;
        requested: number;
    }>();
    const issues: InvoiceStockValidationIssue[] = [];
    for (const item of Array.isArray(items) ? items : []) {
        const medicineId = String(item?.medicineId || '').trim();
        const batchId = String(item?.batchId || '').trim();
        const requested = toSafeQuantity(getInvoiceItemBaseQuantity(item));
        if (!medicineId || !batchId || requested <= 0) {
            issues.push({
                code: 'ITEM_QUANTITY_INVALID',
                medicineId,
                batchId,
                requested,
                available: 0,
            });
            continue;
        }
        const key = buildLineKey(medicineId, batchId);
        const current = requestedByBatch.get(key);
        requestedByBatch.set(key, {
            medicineId,
            batchId,
            requested: (current?.requested || 0) + requested,
        });
    }
    for (const demand of requestedByBatch.values()) {
        const medicine = medicinesById.get(demand.medicineId);
        if (!medicine) {
            issues.push({
                code: 'MEDICINE_NOT_FOUND',
                medicineId: demand.medicineId,
                batchId: demand.batchId,
                requested: demand.requested,
                available: 0,
            });
            continue;
        }
        const batch = (medicine.batches || []).find((entry) => entry.id === demand.batchId);
        if (!batch) {
            issues.push({
                code: 'BATCH_NOT_FOUND',
                medicineId: demand.medicineId,
                batchId: demand.batchId,
                medicineName: medicine.name,
                requested: demand.requested,
                available: 0,
            });
            continue;
        }
        const available = toSafeQuantity(batch.quantity);
        if (!isBatchSellable(batch)) {
            issues.push({
                code: 'BATCH_NOT_SELLABLE',
                medicineId: demand.medicineId,
                batchId: demand.batchId,
                medicineName: medicine.name,
                batchNumber: batch.batchNumber,
                requested: demand.requested,
                available,
            });
            continue;
        }
        if (available < demand.requested) {
            issues.push({
                code: 'INSUFFICIENT_STOCK',
                medicineId: demand.medicineId,
                batchId: demand.batchId,
                medicineName: medicine.name,
                batchNumber: batch.batchNumber,
                requested: demand.requested,
                available,
            });
        }
    }
    return {
        ok: issues.length === 0,
        issues,
    };
};
export const getFirstInvoiceStockIssue = (result: InvoiceStockValidationResult): InvoiceStockValidationIssue | null => result.issues[0] || null;
export const formatInvoiceStockIssue = (issue: InvoiceStockValidationIssue | null | undefined, isEnglish: boolean) => {
    if (!issue) {
        return isEnglish ? 'Stock validation failed.' : 'بررسی موجودی ناموفق بود.';
    }
    const itemName = issue.medicineName || issue.medicineId || (isEnglish ? 'Selected item' : 'قلم انتخاب‌شده');
    const batchLabel = issue.batchNumber || issue.batchId || '-';
    switch (issue.code) {
        case 'ITEM_QUANTITY_INVALID':
            return isEnglish ? 'Invoice contains an invalid quantity.' : 'در فاکتور مقدار نامعتبر وجود دارد.';
        case 'MEDICINE_NOT_FOUND':
            return isEnglish ? 'Selected medicine was not found.' : 'دوای انتخاب‌شده پیدا نشد.';
        case 'BATCH_NOT_FOUND':
            return isEnglish
                ? `Batch ${batchLabel} for ${itemName} was not found.`
                : `batch ${batchLabel} برای ${itemName} پیدا نشد.`;
        case 'BATCH_NOT_SELLABLE':
            return isEnglish
                ? `Batch ${batchLabel} for ${itemName} is not sellable.`
                : `batch ${batchLabel} برای ${itemName} قابل فروش نیست.`;
        case 'INSUFFICIENT_STOCK':
        default:
            return isEnglish
                ? `Insufficient stock for ${itemName}. Requested ${issue.requested}, available ${issue.available}.`
                : `موجودی ${itemName} کافی نیست. مقدار درخواستی ${issue.requested} و موجودی قابل فروش ${issue.available} است.`;
    }
};
