import { AppSettings, InvoiceTemplateId } from '../types';
export const SPECIAL_INVOICE_ACCOUNT_EMAIL = String(import.meta.env.VITE_INVOICE_FREE_LAYOUT_ONLY_EMAIL || '').trim().toLowerCase();
export const isSpecialInvoiceAccount = (email?: string | null): boolean => {
    return false;
};
export const resolveInvoiceTemplateId = (settings: AppSettings): InvoiceTemplateId => {
    const templateId = settings.invoiceDesign?.templateId;
    if (templateId === 'modern' || templateId === 'clean' || templateId === 'legacy') {
        return templateId;
    }
    return 'legacy';
};
export const enforceInvoiceDesignPolicy = (settings: AppSettings, accountEmail?: string | null): AppSettings => {
    const lockedLegacy = isSpecialInvoiceAccount(accountEmail);
    const nextTemplateId: InvoiceTemplateId = lockedLegacy ? 'legacy' : resolveInvoiceTemplateId(settings);
    const currentTemplateId = settings.invoiceDesign?.templateId;
    if (currentTemplateId === nextTemplateId) {
        return settings;
    }
    return {
        ...settings,
        invoiceDesign: {
            ...(settings.invoiceDesign || {}),
            templateId: nextTemplateId
        }
    };
};
