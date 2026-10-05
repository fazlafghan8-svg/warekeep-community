import type { Medicine } from '../types';
type LocalizedWarehouseMessage = {
    english: string;
    dari: string;
};
const MOJIBAKE_MARKERS = /[\u00c3\u00d8\u00d9\u00da\u00c2\ufffd]/;
export type WarehouseOutboxOperationLike = {
    kind: string;
    payload: Record<string, unknown>;
};
const WAREHOUSE_ERROR_MESSAGES: Record<string, LocalizedWarehouseMessage> = {
    MEDICINE_NOT_FOUND: {
        english: 'This medicine was not found on the server. It may already have been archived.',
        dari: 'این دوا در سرور پیدا نشد. احتمالاً قبلاً بایگانی شده است.',
    },
    BATCH_NOT_FOUND: {
        english: 'The selected batch was not found on the server.',
        dari: 'بچ انتخاب‌شده در سرور پیدا نشد.',
    },
    SUPPLIER_NOT_FOUND: {
        english: 'The selected supplier was not found on the server.',
        dari: 'تأمین‌کننده انتخاب‌شده در سرور پیدا نشد.',
    },
    PURCHASE_NOT_FOUND: {
        english: 'The selected purchase record was not found on the server.',
        dari: 'سند خرید انتخاب‌شده در سرور پیدا نشد.',
    },
    CUSTOMER_NOT_FOUND: {
        english: 'The selected customer was not found on the server.',
        dari: 'مشتری انتخاب‌شده در سرور پیدا نشد.',
    },
    NETWORK_FAILURE: {
        english: 'Connection to the backend failed. Please try again.',
        dari: 'ارتباط با بک‌اند برقرار نشد. لطفاً دوباره تلاش کنید.',
    },
    BACKEND_REQUEST_TIMEOUT: {
        english: 'The backend request timed out. Please try again.',
        dari: 'درخواست بک‌اند timeout شد. لطفاً دوباره تلاش کنید.',
    },
    AUTH_SESSION_REQUIRED: {
        english: 'Please sign in before using the backend.',
        dari: 'پیش از استفاده از بک‌اند، وارد حساب کاربری شوید.',
    },
    BACKEND_NOT_CONFIGURED: {
        english: 'The backend is not configured yet.',
        dari: 'بک‌اند هنوز تنظیم نشده است.',
    },
    INSUFFICIENT_STOCK: {
        english: 'Insufficient stock. The invoice was not saved.',
        dari: 'موجودی کافی نیست. فاکتور ذخیره نشد.',
    },
    DUPLICATE_INVOICE_NUMBER: {
        english: 'Invoice number already exists. Choose another number.',
        dari: 'شماره فاکتور تکراری است. شماره دیگری انتخاب کنید.',
    },
    INVOICE_ITEMS_REQUIRED: {
        english: 'Invoice must include at least one valid item.',
        dari: 'فاکتور باید حداقل یک قلم معتبر داشته باشد.',
    },
    WAREHOUSE_CONSTRAINT_VIOLATION: {
        english: 'A financial or inventory value is invalid.',
        dari: 'یک مقدار مالی یا موجودی نامعتبر است.',
    },
    WAREHOUSE_PERMISSION_DENIED: {
        english: 'You do not have permission to perform this warehouse action.',
        dari: 'شما اجازه انجام این عملیات انبار را ندارید.',
    },
};
const normalizeString = (value: unknown): string => String(value ?? '').trim();
export const looksLikeMojibake = (value: unknown): boolean => {
    const normalized = normalizeString(value);
    return Boolean(normalized) && MOJIBAKE_MARKERS.test(normalized);
};
const asRecord = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
};
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const hasMedicineIdInItems = (value: unknown, medicineId: string): boolean => asArray(value).some((entry) => normalizeString(asRecord(entry)?.medicineId) === medicineId);
const hasMedicineIdInBatchEntries = (value: unknown, medicineId: string): boolean => asArray(value).some((entry) => normalizeString(asRecord(entry)?.medicineId) === medicineId);
export const archiveMedicineCollection = (medicines: Medicine[], medicineId: string, updatedAt: string = new Date().toISOString()): Medicine[] => medicines.map((medicine) => medicine.id === medicineId
    ? {
        ...medicine,
        isDeleted: true,
        updatedAt,
    }
    : medicine);
export const restoreArchivedMedicineCollection = (medicines: Medicine[], medicineId: string, updatedAt: string = new Date().toISOString()): Medicine[] => medicines.map((medicine) => medicine.id === medicineId && medicine.isDeleted
    ? {
        ...medicine,
        isDeleted: false,
        updatedAt,
    }
    : medicine);
export const purgeArchivedMedicineCollection = (medicines: Medicine[], medicineId: string): Medicine[] => medicines.filter((medicine) => !(medicine.id === medicineId && medicine.isDeleted));
export const isWarehouseMedicineMissingError = (error: unknown): boolean => normalizeString(asRecord(error)?.code) === 'MEDICINE_NOT_FOUND';
export const getLocalizedWarehouseErrorMessage = (error: unknown, isEnglish: boolean): string => {
    const errorRecord = asRecord(error);
    const normalizedCode = normalizeString(errorRecord?.code);
    if (normalizedCode && WAREHOUSE_ERROR_MESSAGES[normalizedCode]) {
        return isEnglish
            ? WAREHOUSE_ERROR_MESSAGES[normalizedCode].english
            : WAREHOUSE_ERROR_MESSAGES[normalizedCode].dari;
    }
    const message = normalizeString(errorRecord?.message) ||
        (error instanceof Error ? normalizeString(error.message) : normalizeString(error));
    if (message && !looksLikeMojibake(message)) {
        if (/timeout/i.test(message)) {
            return isEnglish
                ? WAREHOUSE_ERROR_MESSAGES.BACKEND_REQUEST_TIMEOUT.english
                : WAREHOUSE_ERROR_MESSAGES.BACKEND_REQUEST_TIMEOUT.dari;
        }
        return message;
    }
    return isEnglish ? 'Warehouse request failed.' : 'درخواست بخش انبار انجام نشد.';
};
export const warehouseOutboxOperationTouchesMedicine = (operation: WarehouseOutboxOperationLike, medicineId: string): boolean => {
    const normalizedMedicineId = normalizeString(medicineId);
    if (!normalizedMedicineId)
        return false;
    const payload = asRecord(operation.payload) || {};
    switch (operation.kind) {
        case 'createMedicine':
        case 'updateMedicine':
        case 'deleteMedicine':
            return normalizeString(payload.id) === normalizedMedicineId;
        case 'addBatch':
        case 'updateBatch':
            return normalizeString(payload.medicineId) === normalizedMedicineId;
        case 'recordInventoryVendorReturn': {
            const vendorReturnPayload = asRecord(payload.data) || payload;
            return normalizeString(vendorReturnPayload.medicineId) === normalizedMedicineId;
        }
        case 'createPurchase':
        case 'updatePurchase': {
            const purchase = asRecord(payload.purchase);
            return (hasMedicineIdInItems(purchase?.items, normalizedMedicineId) ||
                hasMedicineIdInBatchEntries(payload.newBatches, normalizedMedicineId));
        }
        case 'recordPurchaseReceipt':
        case 'recordPurchaseVendorCredit': {
            const data = asRecord(payload.data);
            return hasMedicineIdInItems(data?.items, normalizedMedicineId);
        }
        case 'createInvoice': {
            const invoice = asRecord(payload.invoice);
            return hasMedicineIdInItems(invoice?.items, normalizedMedicineId);
        }
        default:
            return false;
    }
};
export const pruneWarehouseOutboxForMedicine = (operations: WarehouseOutboxOperationLike[], medicineId: string): {
    remainingOperations: WarehouseOutboxOperationLike[];
    removedCount: number;
} => {
    const normalizedMedicineId = normalizeString(medicineId);
    if (!normalizedMedicineId) {
        return {
            remainingOperations: [...operations],
            removedCount: 0,
        };
    }
    const remainingOperations = operations.filter((operation) => !warehouseOutboxOperationTouchesMedicine(operation, normalizedMedicineId));
    return {
        remainingOperations,
        removedCount: operations.length - remainingOperations.length,
    };
};
export const pruneWarehouseDeleteOutboxForMedicine = (operations: WarehouseOutboxOperationLike[], medicineId: string): {
    remainingOperations: WarehouseOutboxOperationLike[];
    removedCount: number;
} => {
    const normalizedMedicineId = normalizeString(medicineId);
    if (!normalizedMedicineId) {
        return {
            remainingOperations: [...operations],
            removedCount: 0,
        };
    }
    const remainingOperations = operations.filter((operation) => {
        if (operation.kind !== 'deleteMedicine')
            return true;
        const payload = asRecord(operation.payload) || {};
        return normalizeString(payload.id) !== normalizedMedicineId;
    });
    return {
        remainingOperations,
        removedCount: operations.length - remainingOperations.length,
    };
};
