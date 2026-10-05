import type { Batch } from '../types';
const MAX_DATE_RANK = Number.MAX_SAFE_INTEGER;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AFGHANISTAN_UTC_OFFSET_MINUTES = 4.5 * 60;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const toFiniteTimestamp = (value?: string) => {
    if (!value)
        return MAX_DATE_RANK;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : MAX_DATE_RANK;
};
export const toDateOnlyUtcDay = (value: string | Date) => {
    if (typeof value === 'string') {
        const match = value.match(DATE_ONLY_PATTERN);
        if (match) {
            return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / MS_PER_DAY);
        }
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()))
        return null;
    return Math.floor((date.getTime() + AFGHANISTAN_UTC_OFFSET_MINUTES * 60 * 1000) / MS_PER_DAY);
};
export const isBatchExpired = (batch: Pick<Batch, 'expiryDate'>, today: Date = new Date()) => {
    if (!batch.expiryDate)
        return false;
    const expiryDay = toDateOnlyUtcDay(batch.expiryDate);
    const currentDay = toDateOnlyUtcDay(today);
    if (expiryDay === null || currentDay === null)
        return false;
    return expiryDay < currentDay;
};
export const isBatchSellable = (batch: Batch, today: Date = new Date()) => {
    const status = batch.availabilityStatus;
    const availableQuantity = typeof batch.quantity === 'number' ? batch.quantity : 0;
    return availableQuantity > 0
        && (status === undefined || status === 'available')
        && !isBatchExpired(batch, today);
};
// NEW: FEFO selection rule for expiring inventory. Falls back safely for legacy batches.
export const compareBatchesByFefo = (left: Batch, right: Batch) => {
    const leftExpiry = toFiniteTimestamp(left.expiryDate);
    const rightExpiry = toFiniteTimestamp(right.expiryDate);
    if (leftExpiry !== rightExpiry)
        return leftExpiry - rightExpiry;
    const leftReceived = toFiniteTimestamp(left.receivedAt || left.lastMovementAt || left.history?.[0]?.date);
    const rightReceived = toFiniteTimestamp(right.receivedAt || right.lastMovementAt || right.history?.[0]?.date);
    if (leftReceived !== rightReceived)
        return leftReceived - rightReceived;
    return String(left.batchNumber || left.id || '').localeCompare(String(right.batchNumber || right.id || ''));
};
export const getFefoSortedBatches = (batches: Batch[] = []) => {
    return [...batches]
        .filter((batch) => isBatchSellable(batch))
        .sort(compareBatchesByFefo);
};
export const selectBatchByFefo = (batches: Batch[] = []) => {
    return getFefoSortedBatches(batches)[0] || null;
};
