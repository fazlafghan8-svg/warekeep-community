import { InvoiceItem, CommissionTier, Medicine, Currency, CalculationSafetyMode } from '../types';
import { getInvoiceItemBaseQuantity } from './unitConversion';
const QUANTITY_SCALE = 1000;
const MAX_STAGE_DELAY_MS = 60 * 60 * 1000;
const MAX_CHUNK_SIZE = 2000;
const MAX_VERIFICATION_PASSES = 24;
type InvoiceCalculationStage = 'sanitize' | 'subtotal' | 'tax' | 'verify' | 'done';
export interface InvoiceCalculationProgress {
    stage: InvoiceCalculationStage;
    progress: number;
    detail?: string;
}
export interface StagedInvoiceCalculationOptions {
    mode?: CalculationSafetyMode;
    stageDelayMs?: number;
    chunkSize?: number;
    verificationPasses?: number;
    signal?: AbortSignal;
    onProgress?: (progress: InvoiceCalculationProgress) => void;
}
interface NormalizedStagedOptions {
    mode: CalculationSafetyMode;
    stageDelayMs: number;
    chunkSize: number;
    verificationPasses: number;
    signal?: AbortSignal;
    onProgress?: (progress: InvoiceCalculationProgress) => void;
}
interface SafeInvoiceItem {
    price: number;
    quantity: number;
    discountAmount: number;
    discountPercent: number;
}
interface InvoiceTotalsMinor {
    totalMinor: number;
    lineDiscountTotalMinor: number;
    totalAfterLineDiscountMinor: number;
    totalAfterDiscountMinor: number;
    taxMinor: number;
    finalAmountMinor: number;
}
const getCurrencyDecimals = (currency?: Currency) => {
    switch (currency) {
        case 'IRR':
            return 0;
        case 'AFN':
        case 'USD':
        case 'EUR':
        case 'PKR':
        case 'INR':
        default:
            return 2;
    }
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const toFiniteNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const toSafeNonNegativeNumber = (value: unknown) => Math.max(0, toFiniteNumber(value, 0));
const toMinorUnits = (value: number, currency?: Currency) => {
    const safeValue = toFiniteNumber(value, 0);
    const factor = Math.pow(10, getCurrencyDecimals(currency));
    return Math.round((safeValue + Number.EPSILON) * factor);
};
const fromMinorUnits = (valueMinor: number, currency?: Currency) => {
    const factor = Math.pow(10, getCurrencyDecimals(currency));
    return toFiniteNumber(valueMinor, 0) / factor;
};
const roundMoney = (value: number, currency?: Currency) => {
    return fromMinorUnits(toMinorUnits(value, currency), currency);
};
const getScaledQuantity = (quantity: number) => Math.round(toSafeNonNegativeNumber(quantity) * QUANTITY_SCALE);
const calculateLineTotalMinor = (price: number, quantity: number, currency?: Currency) => {
    const unitPriceMinor = toMinorUnits(price, currency);
    const quantityScaled = getScaledQuantity(quantity);
    return Math.round((unitPriceMinor * quantityScaled) / QUANTITY_SCALE);
};
const calculateLineDiscountMinor = (item: Pick<InvoiceItem, 'price' | 'quantity' | 'discountAmount' | 'discountPercent'>, currency?: Currency) => {
    const grossMinor = calculateLineTotalMinor(item.price, item.quantity, currency);
    const percentDiscountMinor = Math.round((grossMinor * toSafeNonNegativeNumber(item.discountPercent)) / 100);
    const amountDiscountMinor = toMinorUnits(toSafeNonNegativeNumber(item.discountAmount), currency);
    return Math.min(grossMinor, percentDiscountMinor + amountDiscountMinor);
};
export const calculateInvoiceLineTotal = (item: Pick<InvoiceItem, 'price' | 'quantity' | 'discountAmount' | 'discountPercent'>, currency?: Currency) => {
    const grossMinor = calculateLineTotalMinor(item.price, item.quantity, currency);
    return fromMinorUnits(Math.max(0, grossMinor - calculateLineDiscountMinor(item, currency)), currency);
};
export const calculateInvoiceLineGrossTotal = (item: Pick<InvoiceItem, 'price' | 'quantity'>, currency?: Currency) => fromMinorUnits(calculateLineTotalMinor(item.price, item.quantity, currency), currency);
export const calculateInvoiceLineDiscount = (item: Pick<InvoiceItem, 'price' | 'quantity' | 'discountAmount' | 'discountPercent'>, currency?: Currency) => fromMinorUnits(calculateLineDiscountMinor(item, currency), currency);
const sanitizeInvoiceItems = (items: InvoiceItem[]) => {
    if (!Array.isArray(items))
        return [];
    const safeItems: SafeInvoiceItem[] = [];
    for (const item of items) {
        const price = toSafeNonNegativeNumber(item?.price);
        const quantity = toSafeNonNegativeNumber(item?.quantity);
        if (price === 0 || quantity === 0)
            continue;
        safeItems.push({
            price,
            quantity,
            discountAmount: toSafeNonNegativeNumber(item?.discountAmount),
            discountPercent: toSafeNonNegativeNumber(item?.discountPercent)
        });
    }
    return safeItems;
};
const emitProgress = (options: Pick<NormalizedStagedOptions, 'onProgress'>, stage: InvoiceCalculationStage, progress: number, detail?: string) => {
    if (!options.onProgress)
        return;
    options.onProgress({
        stage,
        progress: clamp(toFiniteNumber(progress, 0), 0, 1),
        detail
    });
};
const throwIfAborted = (signal?: AbortSignal) => {
    if (signal?.aborted) {
        throw new Error('Calculation aborted');
    }
};
const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
    throwIfAborted(signal);
    const safeMs = Math.max(0, Math.round(ms));
    let resolved = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
        if (resolved)
            return;
        cleanup();
        reject(new Error('Calculation aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
        if (resolved)
            return;
        resolved = true;
        cleanup();
        resolve();
    }, safeMs);
});
const getModeDefaults = (mode: CalculationSafetyMode) => {
    if (mode === 'extreme') {
        return {
            stageDelayMs: 250,
            chunkSize: 20,
            verificationPasses: 4
        };
    }
    if (mode === 'high') {
        return {
            stageDelayMs: 30,
            chunkSize: 80,
            verificationPasses: 2
        };
    }
    return {
        stageDelayMs: 0,
        chunkSize: 250,
        verificationPasses: 1
    };
};
const normalizeStagedOptions = (options?: StagedInvoiceCalculationOptions): NormalizedStagedOptions => {
    const mode = options?.mode || 'high';
    const defaults = getModeDefaults(mode);
    return {
        mode,
        stageDelayMs: clamp(Math.round(toSafeNonNegativeNumber(options?.stageDelayMs ?? defaults.stageDelayMs)), 0, MAX_STAGE_DELAY_MS),
        chunkSize: clamp(Math.round(toSafeNonNegativeNumber(options?.chunkSize ?? defaults.chunkSize)), 1, MAX_CHUNK_SIZE),
        verificationPasses: clamp(Math.round(toSafeNonNegativeNumber(options?.verificationPasses ?? defaults.verificationPasses)), 1, MAX_VERIFICATION_PASSES),
        signal: options?.signal,
        onProgress: options?.onProgress
    };
};
const calculateInvoiceTotalsMinor = (safeItems: SafeInvoiceItem[], discount: number, taxRate: number, currency?: Currency): InvoiceTotalsMinor => {
    const totalMinor = safeItems.reduce((sum, item) => sum + calculateLineTotalMinor(item.price, item.quantity, currency), 0);
    const lineDiscountTotalMinor = safeItems.reduce((sum, item) => sum + calculateLineDiscountMinor(item, currency), 0);
    const totalAfterLineDiscountMinor = Math.max(0, totalMinor - lineDiscountTotalMinor);
    const discountMinor = toMinorUnits(toSafeNonNegativeNumber(discount), currency);
    const boundedDiscountMinor = Math.min(discountMinor, totalAfterLineDiscountMinor);
    const totalAfterDiscountMinor = Math.max(0, totalAfterLineDiscountMinor - boundedDiscountMinor);
    const safeTaxRate = toSafeNonNegativeNumber(taxRate);
    const taxMinor = Math.round((totalAfterDiscountMinor * safeTaxRate) / 100);
    const finalAmountMinor = totalAfterDiscountMinor + taxMinor;
    return {
        totalMinor,
        lineDiscountTotalMinor,
        totalAfterLineDiscountMinor,
        totalAfterDiscountMinor,
        taxMinor,
        finalAmountMinor
    };
};
const toInvoiceTotalsResult = (totalsMinor: InvoiceTotalsMinor, currency?: Currency) => ({
    total: fromMinorUnits(totalsMinor.totalMinor, currency),
    lineDiscountTotal: fromMinorUnits(totalsMinor.lineDiscountTotalMinor, currency),
    totalAfterLineDiscount: fromMinorUnits(totalsMinor.totalAfterLineDiscountMinor, currency),
    totalAfterDiscount: fromMinorUnits(totalsMinor.totalAfterDiscountMinor, currency),
    tax: fromMinorUnits(totalsMinor.taxMinor, currency),
    finalAmount: fromMinorUnits(totalsMinor.finalAmountMinor, currency)
});
const recomputeSubtotalMinorInChunks = async (safeItems: SafeInvoiceItem[], chunkSize: number, currency: Currency | undefined, options: Pick<NormalizedStagedOptions, 'stageDelayMs' | 'signal' | 'onProgress'>, stage: InvoiceCalculationStage) => {
    if (safeItems.length === 0) {
        emitProgress(options, stage, 1);
        if (options.stageDelayMs > 0)
            await wait(options.stageDelayMs, options.signal);
        return 0;
    }
    let subtotalMinor = 0;
    for (let i = 0; i < safeItems.length; i += chunkSize) {
        throwIfAborted(options.signal);
        const chunk = safeItems.slice(i, i + chunkSize);
        for (const item of chunk) {
            subtotalMinor += calculateLineTotalMinor(item.price, item.quantity, currency);
        }
        const processed = i + chunk.length;
        emitProgress(options, stage, processed / safeItems.length, `${processed}/${safeItems.length}`);
        await wait(options.stageDelayMs > 0 ? options.stageDelayMs : 0, options.signal);
    }
    return subtotalMinor;
};
export const calculateInvoiceTotals = (items: InvoiceItem[], discount: number, taxRate: number, currency?: Currency) => {
    const safeItems = sanitizeInvoiceItems(items);
    const totalsMinor = calculateInvoiceTotalsMinor(safeItems, discount, taxRate, currency);
    return toInvoiceTotalsResult(totalsMinor, currency);
};
export const calculateInvoiceTotalsStaged = async (items: InvoiceItem[], discount: number, taxRate: number, currency?: Currency, options?: StagedInvoiceCalculationOptions) => {
    const normalizedOptions = normalizeStagedOptions(options);
    throwIfAborted(normalizedOptions.signal);
    emitProgress(normalizedOptions, 'sanitize', 0);
    const safeItems = sanitizeInvoiceItems(items);
    emitProgress(normalizedOptions, 'sanitize', 1, `${safeItems.length} safe line(s)`);
    await wait(normalizedOptions.stageDelayMs > 0 ? normalizedOptions.stageDelayMs : 0, normalizedOptions.signal);
    const subtotalMinor = await recomputeSubtotalMinorInChunks(safeItems, normalizedOptions.chunkSize, currency, normalizedOptions, 'subtotal');
    emitProgress(normalizedOptions, 'tax', 0);
    const totalsMinor = calculateInvoiceTotalsMinor(safeItems, discount, taxRate, currency);
    if (totalsMinor.totalMinor !== subtotalMinor) {
        throw new Error('Invoice subtotal mismatch during staged calculation.');
    }
    emitProgress(normalizedOptions, 'tax', 1);
    await wait(normalizedOptions.stageDelayMs > 0 ? normalizedOptions.stageDelayMs : 0, normalizedOptions.signal);
    for (let pass = 1; pass <= normalizedOptions.verificationPasses; pass += 1) {
        throwIfAborted(normalizedOptions.signal);
        const verifiedSubtotal = await recomputeSubtotalMinorInChunks(safeItems, normalizedOptions.chunkSize, currency, normalizedOptions, 'verify');
        if (verifiedSubtotal !== subtotalMinor) {
            throw new Error(`Verification failed at pass ${pass}.`);
        }
        emitProgress(normalizedOptions, 'verify', pass / normalizedOptions.verificationPasses, `pass ${pass}`);
        await wait(normalizedOptions.stageDelayMs > 0 ? normalizedOptions.stageDelayMs : 0, normalizedOptions.signal);
    }
    emitProgress(normalizedOptions, 'done', 1);
    return toInvoiceTotalsResult(totalsMinor, currency);
};
export const calculateItemProfit = (item: InvoiceItem, medicines: Medicine[], currency?: Currency): number => {
    const medicine = medicines.find((m) => m.id === item.medicineId);
    if (!medicine)
        return 0;
    const batch = medicine.batches?.find((b) => b.id === item.batchId) || medicine.batches?.[0];
    const purchasePrice = toSafeNonNegativeNumber(typeof item.costPrice === 'number' ? item.costPrice : (batch ? batch.purchasePrice : 0));
    const quantity = toSafeNonNegativeNumber(getInvoiceItemBaseQuantity(item));
    const netRevenue = calculateInvoiceLineTotal(item, currency);
    const profitRaw = netRevenue - (purchasePrice * quantity);
    return toFiniteNumber(profitRaw, 0);
};
export const calculatePayrollForUser = (userTotalSales: number, userGeneratedProfit: number, baseSalary: number, baseCommissionRate: number, tiers: CommissionTier[] = []) => {
    const safeTotalSales = toSafeNonNegativeNumber(userTotalSales);
    const safeGeneratedProfit = toSafeNonNegativeNumber(userGeneratedProfit);
    const safeBaseSalary = toSafeNonNegativeNumber(baseSalary);
    const safeBaseCommissionRate = toSafeNonNegativeNumber(baseCommissionRate);
    let effectiveRate = safeBaseCommissionRate;
    let tierName = 'Base';
    if (tiers.length > 0) {
        const sortedTiers = [...tiers]
            .map((tier) => ({
            threshold: toSafeNonNegativeNumber(tier.threshold),
            rate: toSafeNonNegativeNumber(tier.rate)
        }))
            .sort((a, b) => b.threshold - a.threshold);
        for (const tier of sortedTiers) {
            if (safeTotalSales >= tier.threshold) {
                effectiveRate = tier.rate;
                tierName = `Tier (> ${tier.threshold.toLocaleString()})`;
                break;
            }
        }
    }
    const commissionAmount = roundMoney((safeGeneratedProfit * effectiveRate) / 100);
    const totalDue = Math.round(commissionAmount + safeBaseSalary);
    return {
        effectiveRate,
        tierName,
        commissionAmount,
        totalDue
    };
};
