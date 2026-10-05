import type { Batch, BatchOwnershipType, Expense, Invoice, InvoiceItem, Language, Medicine, Partner, PartnerCapitalType, PartnerLedgerEntry, PartnerLedgerEntryType, PartnerProfitRule, PartnerSettlement, Purchase, PurchaseItem, StockEntryType } from '../types';
import { calculateInvoiceLineTotal } from './calculations';
import { getInvoiceItemBaseQuantity } from './unitConversion';
import { getPurchaseItemBaseQuantity, getPurchaseItemBaseUnitCost, getPurchaseItemTotal } from './purchaseUtils';
const EPSILON = 1e-9;
const toNumber = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const safeMoney = (value: unknown): number => {
    const parsed = toNumber(value, 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const positiveMoney = (value: unknown): number => Math.max(0, safeMoney(value));
const roundMoney = (value: number): number => Math.round((Number.isFinite(value) ? value : 0) * 100 + Number.EPSILON) / 100;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const compactId = (prefix: string, ...parts: Array<string | number | undefined>) => [prefix, ...parts.map((part) => String(part ?? '').replace(/\s+/g, '-')).filter(Boolean)].join('-');
export type PartnerResolvedLedgerEntry = PartnerLedgerEntry & {
    partnerId: string;
    partnerName?: string;
    generated?: boolean;
    debit: number;
    credit: number;
    balanceAfter: number;
};
export type PartnerBatchReportRow = {
    partnerId: string;
    partnerName: string;
    medicineId: string;
    medicineName: string;
    batchId: string;
    batchNumber: string;
    ownershipType: BatchOwnershipType;
    quantity: number;
    expiryDate?: string;
    purchasePrice: number;
    stockValue: number;
    purchaseId?: string;
    sourceEntryType?: StockEntryType;
};
export type PartnerMedicineReportRow = PartnerBatchReportRow & {
    unit?: string;
    suggestedSalePrice?: number;
};
export type PartnerSalesReportRow = {
    partnerId: string;
    invoiceId: string;
    invoiceNumber?: number;
    date: string;
    medicineId: string;
    batchId: string;
    quantity: number;
    revenue: number;
    cost: number;
    grossProfit: number;
    partnerShare: number;
    storeShare: number;
    returnedRevenue: number;
    returnedCost: number;
    returnedProfit: number;
};
export type PartnerContributionReportRow = {
    partnerId: string;
    purchaseId: string;
    date: string;
    medicineId: string;
    medicineName?: string;
    batchNumber: string;
    quantity: number;
    unit?: string;
    purchasePrice: number;
    agreedValue: number;
    lineValue: number;
    sourceDocumentNumber?: string;
};
export type PartnerSettlementPreview = Omit<PartnerSettlement, 'id' | 'lockedAt' | 'reversedAt' | 'reversalReason' | 'createdAt' | 'createdBy'>;
export type PartnerAccountingSummary = {
    partner: Partner;
    capitalType: PartnerCapitalType;
    profitRule: PartnerProfitRule;
    cashCapital: number;
    goodsCapital: number;
    totalCapital: number;
    purchaseTotal: number;
    contributionValue: number;
    salesTotal: number;
    returnedSalesTotal: number;
    salesCost: number;
    returnedCost: number;
    grossProfit: number;
    partnerShare: number;
    storeShare: number;
    stockValue: number;
    remainingQuantity: number;
    manualCredits: number;
    manualDebits: number;
    paymentsTotal: number;
    withdrawalsTotal: number;
    expenseShare: number;
    invoiceCount: number;
    purchaseCount: number;
    batchCount: number;
    expiringSoonCount: number;
    ledgerBalance: number;
    payableAmount: number;
    receivableAmount: number;
    finalBalance: number;
};
export type PartnerAccountingTotals = {
    partnerCount: number;
    activePartnerCount: number;
    cashCapital: number;
    goodsCapital: number;
    totalCapital: number;
    salesTotal: number;
    grossProfit: number;
    partnerShare: number;
    storeShare: number;
    stockValue: number;
    ledgerBalance: number;
    payableAmount: number;
    receivableAmount: number;
};
export type PartnerAccountingModel = {
    summaries: PartnerAccountingSummary[];
    totals: PartnerAccountingTotals;
    ledgerByPartnerId: Map<string, PartnerResolvedLedgerEntry[]>;
    batchRows: PartnerBatchReportRow[];
    medicineRows: PartnerMedicineReportRow[];
    contributionRows: PartnerContributionReportRow[];
    salesRows: PartnerSalesReportRow[];
    settlementPreviews: Map<string, PartnerSettlementPreview>;
    unassigned: {
        purchaseTotal: number;
        salesTotal: number;
        stockValue: number;
        batchCount: number;
    };
};
type BatchLookupEntry = {
    batch: Batch;
    medicine: Medicine;
};
type MutablePartnerSummary = PartnerAccountingSummary & {
    ledgerDrafts: Array<Omit<PartnerResolvedLedgerEntry, 'balanceAfter'>>;
};
const isActiveRecord = <T extends {
    isDeleted?: boolean;
}>(record: T): boolean => !record.isDeleted;
export const resolvePartnerCapitalType = (partner: Partner): PartnerCapitalType => {
    if (partner.capitalType)
        return partner.capitalType;
    const cash = positiveMoney(partner.openingCapital);
    const goods = positiveMoney(partner.openingGoodsCapital);
    if (cash > 0 && goods > 0)
        return 'mixed';
    if (goods > 0)
        return 'goods';
    return 'cash';
};
export const resolvePartnerProfitRule = (partner: Partner): PartnerProfitRule => {
    if (partner.profitRule?.type) {
        return {
            ...partner.profitRule,
            sharePercentage: partner.profitRule.sharePercentage ?? partner.sharePercentage,
        };
    }
    const capitalType = resolvePartnerCapitalType(partner);
    if (capitalType === 'general_profit_share') {
        return {
            type: 'general_profit_share',
            sharePercentage: partner.sharePercentage || 0,
        };
    }
    if (partner.sharePercentage && partner.sharePercentage > 0) {
        return {
            type: 'share_percentage',
            sharePercentage: partner.sharePercentage,
        };
    }
    return { type: 'own_goods_100', sharePercentage: 100 };
};
export const calculatePartnerProfitSplit = (grossProfit: number, partner: Partner): {
    partnerShare: number;
    storeShare: number;
    rule: PartnerProfitRule;
} => {
    const rule = resolvePartnerProfitRule(partner);
    const safeProfit = roundMoney(grossProfit);
    if (Math.abs(safeProfit) <= EPSILON) {
        return { partnerShare: 0, storeShare: 0, rule };
    }
    if (rule.type === 'own_goods_100') {
        return { partnerShare: safeProfit, storeShare: 0, rule };
    }
    if (rule.type === 'store_commission_percent') {
        const rate = clamp(toNumber(rule.storeCommissionPercent, 0), 0, 100);
        const storeShare = roundMoney(safeProfit * (rate / 100));
        return { partnerShare: roundMoney(safeProfit - storeShare), storeShare, rule };
    }
    if (rule.type === 'store_commission_fixed') {
        const fixed = positiveMoney(rule.storeCommissionFixedAmount);
        const storeShare = safeProfit >= 0 ? Math.min(fixed, safeProfit) : 0;
        return { partnerShare: roundMoney(safeProfit - storeShare), storeShare: roundMoney(storeShare), rule };
    }
    const rate = clamp(toNumber(rule.sharePercentage ?? partner.sharePercentage, 0), 0, 100);
    const partnerShare = roundMoney(safeProfit * (rate / 100));
    return { partnerShare, storeShare: roundMoney(safeProfit - partnerShare), rule };
};
const createEmptySummary = (partner: Partner): MutablePartnerSummary => {
    const cashCapital = positiveMoney(partner.openingCapital);
    const goodsCapital = positiveMoney(partner.openingGoodsCapital);
    const capitalType = resolvePartnerCapitalType(partner);
    const profitRule = resolvePartnerProfitRule(partner);
    return {
        partner,
        capitalType,
        profitRule,
        cashCapital,
        goodsCapital,
        totalCapital: roundMoney(cashCapital + goodsCapital),
        purchaseTotal: 0,
        contributionValue: 0,
        salesTotal: 0,
        returnedSalesTotal: 0,
        salesCost: 0,
        returnedCost: 0,
        grossProfit: 0,
        partnerShare: 0,
        storeShare: 0,
        stockValue: 0,
        remainingQuantity: 0,
        manualCredits: 0,
        manualDebits: 0,
        paymentsTotal: 0,
        withdrawalsTotal: 0,
        expenseShare: 0,
        invoiceCount: 0,
        purchaseCount: 0,
        batchCount: 0,
        expiringSoonCount: 0,
        ledgerBalance: 0,
        payableAmount: 0,
        receivableAmount: 0,
        finalBalance: 0,
        ledgerDrafts: [],
    };
};
const getLineRevenue = (invoice: Invoice, item: InvoiceItem): number => {
    const currency = invoice.currency || 'AFN';
    const lineNetTotal = (invoice.items || []).reduce((sum, entry) => sum + calculateInvoiceLineTotal(entry, currency), 0);
    const itemNet = calculateInvoiceLineTotal(item, currency);
    const finalAmount = positiveMoney(invoice.finalAmount);
    if (lineNetTotal > 0 && finalAmount > 0) {
        return roundMoney(finalAmount * (itemNet / lineNetTotal));
    }
    return roundMoney(itemNet);
};
const getItemBaseQuantity = (item: InvoiceItem): number => Math.max(0, getInvoiceItemBaseQuantity(item));
const getItemCost = (item: InvoiceItem, batch?: Batch): number => {
    const unitCost = item.partnerCostPrice ?? item.costPrice ?? batch?.purchasePrice ?? 0;
    return roundMoney(positiveMoney(unitCost) * getItemBaseQuantity(item));
};
const getPurchaseLineValue = (item: PurchaseItem): number => {
    const agreed = positiveMoney(item.agreedPartnerValue);
    if (agreed > 0)
        return roundMoney(agreed * Math.max(0, getPurchaseItemBaseQuantity(item)));
    const lineTotal = positiveMoney(item.lineTotal);
    if (lineTotal > 0)
        return roundMoney(lineTotal);
    return roundMoney(getPurchaseItemTotal(item));
};
const getPurchaseUnitValue = (item: PurchaseItem): number => {
    const agreed = positiveMoney(item.agreedPartnerValue);
    if (agreed > 0)
        return agreed;
    return getPurchaseItemBaseUnitCost(item);
};
const createGeneratedLedgerEntry = (partner: Partner, input: {
    id: string;
    date: string;
    type: PartnerLedgerEntryType;
    amount: number;
    debit?: number;
    credit?: number;
    description: string;
    source?: PartnerResolvedLedgerEntry['source'];
    referenceId?: string;
    referenceItemId?: string;
    metadata?: Record<string, unknown>;
}): Omit<PartnerResolvedLedgerEntry, 'balanceAfter'> => {
    const debit = roundMoney(Math.max(0, input.debit ?? 0));
    const credit = roundMoney(Math.max(0, input.credit ?? 0));
    const direction = debit > credit ? 'out' : 'in';
    return {
        id: input.id,
        partnerId: partner.id,
        partnerName: partner.name,
        date: input.date,
        type: input.type,
        direction,
        amount: roundMoney(Math.max(0, input.amount)),
        debit,
        credit,
        description: input.description,
        source: input.source || 'system',
        referenceId: input.referenceId,
        referenceItemId: input.referenceItemId,
        metadata: input.metadata,
        generated: true,
    };
};
const normalizeManualLedgerEntry = (partner: Partner, entry: PartnerLedgerEntry, index: number): Omit<PartnerResolvedLedgerEntry, 'balanceAfter'> => {
    const amount = roundMoney(Math.max(0, safeMoney(entry.amount)));
    const debit = roundMoney(Math.max(0, entry.debit ?? (entry.direction === 'out' ? amount : 0)));
    const credit = roundMoney(Math.max(0, entry.credit ?? (entry.direction === 'in' ? amount : 0)));
    return {
        ...entry,
        id: entry.id || compactId('manual-ledger', partner.id, index + 1),
        partnerId: partner.id,
        partnerName: partner.name,
        amount,
        debit,
        credit,
        direction: debit > credit ? 'out' : 'in',
        source: entry.source || 'partner',
        description: entry.description || 'Partner ledger entry',
        generated: false,
    };
};
const applyLedgerBalances = (drafts: Array<Omit<PartnerResolvedLedgerEntry, 'balanceAfter'>>): PartnerResolvedLedgerEntry[] => {
    let balance = 0;
    return drafts
        .slice()
        .sort((left, right) => {
        const leftTime = Date.parse(left.date || '') || 0;
        const rightTime = Date.parse(right.date || '') || 0;
        if (leftTime !== rightTime)
            return leftTime - rightTime;
        return left.id.localeCompare(right.id);
    })
        .map((entry) => {
        balance = roundMoney(balance + entry.credit - entry.debit);
        return {
            ...entry,
            balanceAfter: balance,
        };
    });
};
const resolveBatchLookup = (medicines: Medicine[]): Map<string, BatchLookupEntry> => {
    const map = new Map<string, BatchLookupEntry>();
    medicines.filter(isActiveRecord).forEach((medicine) => {
        (medicine.batches || []).forEach((batch) => {
            map.set(batch.id, { batch, medicine });
        });
    });
    return map;
};
const findPurchasePartnerId = (purchase: Purchase, item?: PurchaseItem): string => (item?.ownerPartnerId ||
    item?.partnerId ||
    purchase.partnerId ||
    '');
const resolveInvoiceItemPartnerId = (item: InvoiceItem, batchLookup: Map<string, BatchLookupEntry>, purchasesById: Map<string, Purchase>): string => {
    if (item.partnerId)
        return item.partnerId;
    const batch = batchLookup.get(item.batchId)?.batch;
    if (batch?.ownerPartnerId)
        return batch.ownerPartnerId;
    if (batch?.purchaseId) {
        return purchasesById.get(batch.purchaseId)?.partnerId || '';
    }
    return '';
};
const getBatchOwnershipType = (batch: Batch): BatchOwnershipType => {
    if (batch.ownershipType)
        return batch.ownershipType;
    if (batch.ownerPartnerId)
        return 'partner';
    return 'store';
};
const getReturnPartnerPayload = (invoice: Invoice, returnEntry: NonNullable<Invoice['returns']>[number], batchLookup: Map<string, BatchLookupEntry>, purchasesById: Map<string, Purchase>): Array<{
    partnerId: string;
    item: InvoiceItem;
    returnedQuantity: number;
    returnedBaseQuantity: number;
    returnedRevenue: number;
    returnedCost: number;
}> => {
    const returnItems = returnEntry.items || [];
    const activeSourceItem = typeof returnEntry.sourceItemIndex === 'number'
        ? invoice.items?.[returnEntry.sourceItemIndex]
        : undefined;
    const totalReturnLineValue = returnItems.reduce((sum, returnItem) => {
        const quantity = positiveMoney(returnItem.quantity);
        return sum + roundMoney(positiveMoney(returnItem.price) * quantity);
    }, 0);
    return returnItems.flatMap((returnItem, returnIndex) => {
        const sourceItem = activeSourceItem || invoice.items.find((item) => (item.medicineId === returnItem.medicineId &&
            item.batchId === returnItem.batchId));
        if (!sourceItem)
            return [];
        const partnerId = resolveInvoiceItemPartnerId(sourceItem, batchLookup, purchasesById);
        if (!partnerId)
            return [];
        const returnedQuantity = positiveMoney(returnItem.quantity);
        const returnedBaseQuantity = positiveMoney(returnItem.baseQuantity ?? returnedQuantity);
        const lineValue = roundMoney(positiveMoney(returnItem.price) * returnedQuantity);
        const share = totalReturnLineValue > 0 ? lineValue / totalReturnLineValue : (returnItems.length === 1 ? 1 : 0);
        const returnedRevenue = roundMoney(positiveMoney(returnEntry.totalRefund) * share);
        const returnedCost = roundMoney(positiveMoney(returnItem.costPrice ?? sourceItem.costPrice) * returnedBaseQuantity);
        return [{
                partnerId,
                item: sourceItem,
                returnedQuantity,
                returnedBaseQuantity,
                returnedRevenue,
                returnedCost,
                returnIndex,
            }];
    });
};
export const buildPartnerAccountingModel = ({ partners, invoices, purchases, medicines, expenses, language = 'dari', now = new Date(), }: {
    partners: Partner[];
    invoices: Invoice[];
    purchases: Purchase[];
    medicines: Medicine[];
    expenses: Expense[];
    language?: Language;
    now?: Date;
}): PartnerAccountingModel => {
    const tr = (english: string, dari: string) => language === 'english' ? english : dari;
    const activePartners = partners.filter(isActiveRecord);
    const summaryByPartnerId = new Map<string, MutablePartnerSummary>();
    const purchasesById = new Map(purchases.filter(isActiveRecord).map((purchase) => [purchase.id, purchase]));
    const batchLookup = resolveBatchLookup(medicines);
    const batchRows: PartnerBatchReportRow[] = [];
    const medicineRows: PartnerMedicineReportRow[] = [];
    const contributionRows: PartnerContributionReportRow[] = [];
    const salesRows: PartnerSalesReportRow[] = [];
    const ledgerByPartnerId = new Map<string, PartnerResolvedLedgerEntry[]>();
    const invoiceIdsByPartnerId = new Map<string, Set<string>>();
    const purchaseIdsByPartnerId = new Map<string, Set<string>>();
    const threeMonthsFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    activePartners.forEach((partner) => {
        const summary = createEmptySummary(partner);
        if (summary.cashCapital > 0) {
            summary.ledgerDrafts.push(createGeneratedLedgerEntry(partner, {
                id: compactId('opening-cash', partner.id),
                date: partner.createdAt || new Date(0).toISOString(),
                type: 'capital_in',
                amount: summary.cashCapital,
                credit: summary.cashCapital,
                description: tr('Opening cash capital', 'سرمایه نقدی ابتدایی'),
                source: 'partner',
            }));
        }
        if (summary.goodsCapital > 0) {
            summary.ledgerDrafts.push(createGeneratedLedgerEntry(partner, {
                id: compactId('opening-goods', partner.id),
                date: partner.createdAt || new Date(0).toISOString(),
                type: 'goods_capital',
                amount: summary.goodsCapital,
                credit: summary.goodsCapital,
                description: tr('Opening goods capital', 'سرمایه جنسی ابتدایی'),
                source: 'partner',
            }));
        }
        (partner.ledger || []).forEach((entry, index) => {
            const normalized = normalizeManualLedgerEntry(partner, entry, index);
            summary.ledgerDrafts.push(normalized);
            summary.manualCredits += normalized.credit;
            summary.manualDebits += normalized.debit;
            if (normalized.type === 'withdrawal')
                summary.withdrawalsTotal += normalized.debit || normalized.amount;
            if (normalized.type === 'payment')
                summary.paymentsTotal += normalized.debit || normalized.amount;
        });
        summaryByPartnerId.set(partner.id, summary);
    });
    const unassigned = {
        purchaseTotal: 0,
        salesTotal: 0,
        stockValue: 0,
        batchCount: 0,
    };
    purchases.filter(isActiveRecord).forEach((purchase) => {
        (purchase.items || []).forEach((item, itemIndex) => {
            const partnerId = findPurchasePartnerId(purchase, item);
            const lineValue = getPurchaseLineValue(item);
            if (!partnerId || !summaryByPartnerId.has(partnerId)) {
                if (!purchase.partnerId)
                    unassigned.purchaseTotal += lineValue;
                return;
            }
            const summary = summaryByPartnerId.get(partnerId)!;
            const partner = summary.partner;
            const quantity = getPurchaseItemBaseQuantity(item);
            const unitValue = getPurchaseUnitValue(item);
            const contributionValue = roundMoney(unitValue * quantity);
            const purchaseLabel = purchase.invoiceNumber || purchase.id.slice(-6);
            summary.purchaseTotal += lineValue;
            summary.contributionValue += contributionValue;
            summary.goodsCapital += contributionValue;
            summary.totalCapital = roundMoney(summary.cashCapital + summary.goodsCapital);
            purchaseIdsByPartnerId.set(partnerId, (purchaseIdsByPartnerId.get(partnerId) || new Set()).add(purchase.id));
            contributionRows.push({
                partnerId,
                purchaseId: purchase.id,
                date: purchase.receivedAt || purchase.date,
                medicineId: item.medicineId,
                medicineName: item.medicineName,
                batchNumber: item.batchNumber,
                quantity,
                unit: item.unit || item.purchaseUnitName,
                purchasePrice: item.purchasePrice,
                agreedValue: unitValue,
                lineValue: contributionValue,
                sourceDocumentNumber: item.sourceDocumentNumber || purchase.invoiceNumber,
            });
            summary.ledgerDrafts.push(createGeneratedLedgerEntry(partner, {
                id: compactId('purchase-goods', purchase.id, itemIndex),
                date: purchase.receivedAt || purchase.date,
                type: purchase.stockEntryType === 'partner_consignment' || item.stockEntryType === 'partner_consignment'
                    ? 'goods_received'
                    : 'goods_capital',
                amount: contributionValue,
                credit: contributionValue,
                description: tr(`Partner goods purchase #${purchaseLabel}`, `ثبت دوا به نام شریک #${purchaseLabel}`),
                source: 'purchase',
                referenceId: purchase.id,
                referenceItemId: `${purchase.id}:${itemIndex}`,
                metadata: {
                    medicineId: item.medicineId,
                    batchNumber: item.batchNumber,
                    quantity,
                    stockEntryType: item.stockEntryType || purchase.stockEntryType,
                },
            }));
        });
    });
    medicines.filter(isActiveRecord).forEach((medicine) => {
        (medicine.batches || []).forEach((batch) => {
            const partnerId = batch.ownerPartnerId || '';
            const stockValue = roundMoney(positiveMoney(batch.quantity) * positiveMoney(batch.purchasePrice));
            if (!partnerId || !summaryByPartnerId.has(partnerId)) {
                if (!partnerId) {
                    unassigned.stockValue += stockValue;
                    unassigned.batchCount += 1;
                }
                return;
            }
            const summary = summaryByPartnerId.get(partnerId)!;
            const partner = summary.partner;
            const ownershipType = getBatchOwnershipType(batch);
            const expiry = batch.expiryDate ? new Date(batch.expiryDate) : null;
            const isExpiringSoon = expiry && !Number.isNaN(expiry.getTime()) && expiry > now && expiry <= threeMonthsFromNow;
            summary.stockValue += stockValue;
            summary.remainingQuantity += positiveMoney(batch.quantity);
            summary.batchCount += 1;
            if (isExpiringSoon)
                summary.expiringSoonCount += 1;
            const contributionQuantity = positiveMoney(batch.receivedQuantity ?? batch.quantity);
            const agreedValue = positiveMoney(batch.agreedPartnerValue ?? batch.purchasePrice);
            const contributionValue = roundMoney(contributionQuantity * agreedValue);
            const isManualPartnerContribution = !batch.purchaseId && contributionQuantity > 0 && contributionValue > 0 && (batch.sourceEntryType === 'partner_goods_capital'
                || batch.sourceEntryType === 'partner_consignment'
                || ownershipType === 'partner'
                || ownershipType === 'consignment');
            if (isManualPartnerContribution) {
                summary.contributionValue = roundMoney(summary.contributionValue + contributionValue);
                summary.goodsCapital = roundMoney(summary.goodsCapital + contributionValue);
                summary.totalCapital = roundMoney(summary.cashCapital + summary.goodsCapital);
                contributionRows.push({
                    partnerId,
                    purchaseId: batch.id,
                    date: batch.receivedAt || batch.lastMovementAt || now.toISOString(),
                    medicineId: medicine.id,
                    medicineName: medicine.name,
                    batchNumber: batch.batchNumber,
                    quantity: contributionQuantity,
                    unit: medicine.unit,
                    purchasePrice: positiveMoney(batch.purchasePrice),
                    agreedValue,
                    lineValue: contributionValue,
                    sourceDocumentNumber: batch.sourceDocumentNumber,
                });
                summary.ledgerDrafts.push(createGeneratedLedgerEntry(partner, {
                    id: compactId('manual-batch-goods', batch.id),
                    date: batch.receivedAt || batch.lastMovementAt || now.toISOString(),
                    type: batch.sourceEntryType === 'partner_consignment' || ownershipType === 'consignment'
                        ? 'goods_received'
                        : 'goods_capital',
                    amount: contributionValue,
                    credit: contributionValue,
                    description: tr(`Manual partner goods entry #${batch.batchNumber || batch.id.slice(-6)}`, `ثبت دستی دوا به نام شریک #${batch.batchNumber || batch.id.slice(-6)}`),
                    source: 'adjustment',
                    referenceId: batch.id,
                    metadata: {
                        medicineId: medicine.id,
                        batchNumber: batch.batchNumber,
                        quantity: contributionQuantity,
                        stockEntryType: batch.sourceEntryType,
                    },
                }));
            }
            const row: PartnerBatchReportRow = {
                partnerId,
                partnerName: partner.name,
                medicineId: medicine.id,
                medicineName: medicine.name,
                batchId: batch.id,
                batchNumber: batch.batchNumber,
                ownershipType,
                quantity: positiveMoney(batch.quantity),
                expiryDate: batch.expiryDate,
                purchasePrice: positiveMoney(batch.purchasePrice),
                stockValue,
                purchaseId: batch.purchaseId,
                sourceEntryType: batch.sourceEntryType,
            };
            batchRows.push(row);
            medicineRows.push({
                ...row,
                suggestedSalePrice: batch.suggestedSalePrice,
            });
        });
    });
    invoices.filter(isActiveRecord).forEach((invoice) => {
        const partnersTouchedInInvoice = new Set<string>();
        (invoice.items || []).forEach((item, itemIndex) => {
            const partnerId = resolveInvoiceItemPartnerId(item, batchLookup, purchasesById);
            if (!partnerId || !summaryByPartnerId.has(partnerId)) {
                unassigned.salesTotal += getLineRevenue(invoice, item);
                return;
            }
            const summary = summaryByPartnerId.get(partnerId)!;
            const partner = summary.partner;
            const batch = batchLookup.get(item.batchId)?.batch;
            const revenue = getLineRevenue(invoice, item);
            const cost = getItemCost(item, batch);
            const grossProfit = roundMoney(revenue - cost);
            const split = calculatePartnerProfitSplit(grossProfit, partner);
            partnersTouchedInInvoice.add(partnerId);
            summary.salesTotal += revenue;
            summary.salesCost += cost;
            summary.grossProfit += grossProfit;
            summary.partnerShare += split.partnerShare;
            summary.storeShare += split.storeShare;
            salesRows.push({
                partnerId,
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                date: invoice.date,
                medicineId: item.medicineId,
                batchId: item.batchId,
                quantity: getItemBaseQuantity(item),
                revenue,
                cost,
                grossProfit,
                partnerShare: split.partnerShare,
                storeShare: split.storeShare,
                returnedRevenue: 0,
                returnedCost: 0,
                returnedProfit: 0,
            });
            summary.ledgerDrafts.push(createGeneratedLedgerEntry(partner, {
                id: compactId('sale-info', invoice.id, itemIndex),
                date: invoice.date,
                type: 'sale_revenue',
                amount: revenue,
                description: tr(`Partner goods sale #${invoice.invoiceNumber || invoice.id.slice(-6)}`, `فروش جنس شریک #${invoice.invoiceNumber || invoice.id.slice(-6)}`),
                source: 'sale',
                referenceId: invoice.id,
                referenceItemId: `${invoice.id}:${itemIndex}`,
                metadata: { medicineId: item.medicineId, batchId: item.batchId, cost, grossProfit },
            }));
            if (Math.abs(split.partnerShare) > EPSILON) {
                summary.ledgerDrafts.push(createGeneratedLedgerEntry(partner, {
                    id: compactId('partner-profit', invoice.id, itemIndex),
                    date: invoice.date,
                    type: 'partner_profit_share',
                    amount: Math.abs(split.partnerShare),
                    credit: split.partnerShare > 0 ? split.partnerShare : 0,
                    debit: split.partnerShare < 0 ? Math.abs(split.partnerShare) : 0,
                    description: split.partnerShare >= 0 ? tr('Partner profit share', 'سهم مفاد شریک') : tr('Partner loss share', 'سهم ضرر شریک'),
                    source: 'sale',
                    referenceId: invoice.id,
                    referenceItemId: `${invoice.id}:${itemIndex}`,
                    metadata: { rule: split.rule.type, grossProfit, storeShare: split.storeShare },
                }));
            }
        });
        (invoice.returns || []).filter(isActiveRecord).forEach((returnEntry) => {
            getReturnPartnerPayload(invoice, returnEntry, batchLookup, purchasesById).forEach((returnPayload, returnIndex) => {
                const summary = summaryByPartnerId.get(returnPayload.partnerId);
                if (!summary)
                    return;
                const partner = summary.partner;
                const returnedProfit = roundMoney(returnPayload.returnedRevenue - returnPayload.returnedCost);
                const split = calculatePartnerProfitSplit(returnedProfit, partner);
                summary.returnedSalesTotal += returnPayload.returnedRevenue;
                summary.returnedCost += returnPayload.returnedCost;
                summary.salesTotal -= returnPayload.returnedRevenue;
                summary.salesCost -= returnPayload.returnedCost;
                summary.grossProfit -= returnedProfit;
                summary.partnerShare -= split.partnerShare;
                summary.storeShare -= split.storeShare;
                partnersTouchedInInvoice.add(returnPayload.partnerId);
                salesRows.push({
                    partnerId: returnPayload.partnerId,
                    invoiceId: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    date: returnEntry.date || invoice.date,
                    medicineId: returnPayload.item.medicineId,
                    batchId: returnPayload.item.batchId,
                    quantity: -returnPayload.returnedBaseQuantity,
                    revenue: -returnPayload.returnedRevenue,
                    cost: -returnPayload.returnedCost,
                    grossProfit: -returnedProfit,
                    partnerShare: -split.partnerShare,
                    storeShare: -split.storeShare,
                    returnedRevenue: returnPayload.returnedRevenue,
                    returnedCost: returnPayload.returnedCost,
                    returnedProfit,
                });
                if (Math.abs(split.partnerShare) > EPSILON) {
                    summary.ledgerDrafts.push(createGeneratedLedgerEntry(partner, {
                        id: compactId('sale-return', returnEntry.id, returnIndex),
                        date: returnEntry.date || invoice.date,
                        type: 'sales_return',
                        amount: Math.abs(split.partnerShare),
                        debit: split.partnerShare > 0 ? split.partnerShare : 0,
                        credit: split.partnerShare < 0 ? Math.abs(split.partnerShare) : 0,
                        description: tr('Sales return', 'برگشتی فروش'),
                        source: 'return',
                        referenceId: invoice.id,
                        referenceItemId: returnEntry.id,
                        metadata: {
                            returnId: returnEntry.id,
                            returnedRevenue: returnPayload.returnedRevenue,
                            returnedCost: returnPayload.returnedCost,
                        },
                    }));
                }
            });
        });
        partnersTouchedInInvoice.forEach((partnerId) => {
            invoiceIdsByPartnerId.set(partnerId, (invoiceIdsByPartnerId.get(partnerId) || new Set()).add(invoice.id));
        });
    });
    expenses.filter((expense) => isActiveRecord(expense) && Boolean(expense.partnerId)).forEach((expense) => {
        const partnerId = expense.partnerId || '';
        const summary = summaryByPartnerId.get(partnerId);
        if (!summary)
            return;
        const amount = positiveMoney(expense.amount);
        if (amount <= 0)
            return;
        summary.expenseShare += amount;
        summary.ledgerDrafts.push(createGeneratedLedgerEntry(summary.partner, {
            id: compactId('expense-share', expense.id),
            date: expense.date,
            type: 'expense_share',
            amount,
            debit: amount,
            description: expense.title || tr('Partner expense share', 'سهم مصرف شریک'),
            source: 'expense',
            referenceId: expense.id,
            metadata: { category: expense.category },
        }));
    });
    summaryByPartnerId.forEach((summary, partnerId) => {
        const ledger = applyLedgerBalances(summary.ledgerDrafts);
        const lastBalance = ledger[ledger.length - 1]?.balanceAfter || 0;
        summary.invoiceCount = invoiceIdsByPartnerId.get(partnerId)?.size || 0;
        summary.purchaseCount = purchaseIdsByPartnerId.get(partnerId)?.size || 0;
        summary.purchaseTotal = roundMoney(summary.purchaseTotal);
        summary.contributionValue = roundMoney(summary.contributionValue);
        summary.cashCapital = roundMoney(summary.cashCapital);
        summary.goodsCapital = roundMoney(summary.goodsCapital);
        summary.totalCapital = roundMoney(summary.cashCapital + summary.goodsCapital);
        summary.salesTotal = roundMoney(summary.salesTotal);
        summary.returnedSalesTotal = roundMoney(summary.returnedSalesTotal);
        summary.salesCost = roundMoney(summary.salesCost);
        summary.returnedCost = roundMoney(summary.returnedCost);
        summary.grossProfit = roundMoney(summary.grossProfit);
        summary.partnerShare = roundMoney(summary.partnerShare);
        summary.storeShare = roundMoney(summary.storeShare);
        summary.stockValue = roundMoney(summary.stockValue);
        summary.manualCredits = roundMoney(summary.manualCredits);
        summary.manualDebits = roundMoney(summary.manualDebits);
        summary.expenseShare = roundMoney(summary.expenseShare);
        summary.ledgerBalance = roundMoney(lastBalance);
        summary.finalBalance = summary.ledgerBalance;
        summary.payableAmount = roundMoney(Math.max(0, summary.finalBalance - summary.stockValue));
        summary.receivableAmount = roundMoney(Math.max(0, -summary.finalBalance));
        ledgerByPartnerId.set(partnerId, ledger);
    });
    const summaries = Array.from(summaryByPartnerId.values())
        .map(({ ledgerDrafts: _ledgerDrafts, ...summary }) => summary)
        .sort((left, right) => {
        if (right.finalBalance !== left.finalBalance)
            return right.finalBalance - left.finalBalance;
        return left.partner.name.localeCompare(right.partner.name);
    });
    const totals = summaries.reduce<PartnerAccountingTotals>((acc, summary) => ({
        partnerCount: acc.partnerCount + 1,
        activePartnerCount: acc.activePartnerCount + (summary.partner.status === 'active' ? 1 : 0),
        cashCapital: roundMoney(acc.cashCapital + summary.cashCapital),
        goodsCapital: roundMoney(acc.goodsCapital + summary.goodsCapital),
        totalCapital: roundMoney(acc.totalCapital + summary.totalCapital),
        salesTotal: roundMoney(acc.salesTotal + summary.salesTotal),
        grossProfit: roundMoney(acc.grossProfit + summary.grossProfit),
        partnerShare: roundMoney(acc.partnerShare + summary.partnerShare),
        storeShare: roundMoney(acc.storeShare + summary.storeShare),
        stockValue: roundMoney(acc.stockValue + summary.stockValue),
        ledgerBalance: roundMoney(acc.ledgerBalance + summary.ledgerBalance),
        payableAmount: roundMoney(acc.payableAmount + summary.payableAmount),
        receivableAmount: roundMoney(acc.receivableAmount + summary.receivableAmount),
    }), {
        partnerCount: 0,
        activePartnerCount: 0,
        cashCapital: 0,
        goodsCapital: 0,
        totalCapital: 0,
        salesTotal: 0,
        grossProfit: 0,
        partnerShare: 0,
        storeShare: 0,
        stockValue: 0,
        ledgerBalance: 0,
        payableAmount: 0,
        receivableAmount: 0,
    });
    const settlementPreviews = new Map<string, PartnerSettlementPreview>();
    summaries.forEach((summary) => {
        settlementPreviews.set(summary.partner.id, {
            partnerId: summary.partner.id,
            period: summary.partner.settlementPeriod || 'monthly',
            fromDate: summary.partner.createdAt || '',
            toDate: now.toISOString(),
            openingCapital: summary.cashCapital,
            goodsCapital: summary.goodsCapital,
            salesTotal: summary.salesTotal,
            costTotal: summary.salesCost,
            grossProfit: summary.grossProfit,
            partnerShare: summary.partnerShare,
            storeShare: summary.storeShare,
            paymentsTotal: summary.paymentsTotal,
            withdrawalsTotal: summary.withdrawalsTotal,
            lossesTotal: Math.max(0, -summary.partnerShare),
            remainingStockValue: summary.stockValue,
            payableAmount: summary.payableAmount,
            receivableAmount: summary.receivableAmount,
            finalBalance: summary.finalBalance,
        });
    });
    unassigned.purchaseTotal = roundMoney(unassigned.purchaseTotal);
    unassigned.salesTotal = roundMoney(unassigned.salesTotal);
    unassigned.stockValue = roundMoney(unassigned.stockValue);
    return {
        summaries,
        totals,
        ledgerByPartnerId,
        batchRows,
        medicineRows,
        contributionRows,
        salesRows,
        settlementPreviews,
        unassigned,
    };
};
