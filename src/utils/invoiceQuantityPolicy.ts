import type { InvoiceItem, Medicine } from '@/types';
const EPSILON = 1e-9;
export interface InvoiceQuantityPolicyIssue {
    code: 'FRACTIONAL_QUANTITY_NOT_ALLOWED';
    medicineId: string;
    medicineName: string;
    lineIndex: number;
    quantity: number;
}
export const isFractionalQuantity = (quantity: number): boolean => (Number.isFinite(quantity) && Math.abs(quantity - Math.round(quantity)) > EPSILON);
export const validateInvoiceQuantityPolicy = (items: InvoiceItem[], medicines: Medicine[]): {
    ok: true;
    issues: [
    ];
} | {
    ok: false;
    issues: InvoiceQuantityPolicyIssue[];
} => {
    const medicineById = new Map(medicines.map((medicine) => [medicine.id, medicine]));
    const issues: InvoiceQuantityPolicyIssue[] = [];
    items.forEach((item, index) => {
        const quantity = Number(item.quantity);
        if (!isFractionalQuantity(quantity))
            return;
        const medicine = medicineById.get(item.medicineId);
        if (medicine?.allowFractionalQuantity)
            return;
        issues.push({
            code: 'FRACTIONAL_QUANTITY_NOT_ALLOWED',
            medicineId: item.medicineId,
            medicineName: medicine?.name || item.medicineId,
            lineIndex: index,
            quantity
        });
    });
    return issues.length === 0 ? { ok: true, issues: [] } : { ok: false, issues };
};
export const formatInvoiceQuantityPolicyIssue = (issue: InvoiceQuantityPolicyIssue | undefined, isEnglish = false): string => {
    if (!issue) {
        return isEnglish
            ? 'Invalid invoice quantity.'
            : 'تعداد فاکتور معتبر نیست.';
    }
    return isEnglish
        ? `Fractional quantity is not enabled for ${issue.medicineName}.`
        : `تعداد اعشاری برای ${issue.medicineName} فعال نیست.`;
};
