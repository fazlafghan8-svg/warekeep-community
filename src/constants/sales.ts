import type { SalesMode } from '../types';
export const DEFAULT_SALES_MODE: SalesMode = 'wholesale';
export const isSalesMode = (value: unknown): value is SalesMode => (value === 'retail' || value === 'wholesale' || value === 'bulk');
export const resolveDefaultSalesMode = (settings?: {
    defaultSalesMode?: unknown;
} | null): SalesMode => (isSalesMode(settings?.defaultSalesMode) ? settings.defaultSalesMode : DEFAULT_SALES_MODE);
