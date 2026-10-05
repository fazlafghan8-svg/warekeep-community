import type { Customer, Expense, Invoice, Medicine, Purchase, StockMovement, Supplier } from '@/types';
import { calculateInvoiceTotals } from './calculations';
import { buildStockQuantityKey, getInvoiceCustomerBalanceImpact, getInvoiceNetStockRollback, getInvoiceReturnedBaseQuantityByBatch, getNetSoldBaseQuantityForInvoiceItem, getReturnedBaseQuantityForInvoiceItem } from './inventoryLedger';
import { getInvoiceItemBaseQuantity, roundBaseQuantity } from './unitConversion';
import { getReceivedPurchaseLineRefs } from './purchaseUtils';
export type DataIntegritySeverity = 'critical' | 'warning' | 'info';
export interface DataIntegrityIssue {
    type: string;
    severity: DataIntegritySeverity;
    entityType: string;
    entityId: string;
    description: string;
    recommendation: string;
    metadata?: Record<string, unknown>;
}
export interface DataIntegrityAuditReport {
    generatedAt: string;
    summary: {
        critical: number;
        warning: number;
        info: number;
        total: number;
    };
    issues: DataIntegrityIssue[];
}
export interface DataIntegrityAuditInput {
    medicines?: Medicine[];
    customers?: Customer[];
    invoices?: Invoice[];
    expenses?: Expense[];
    suppliers?: Supplier[];
    purchases?: Purchase[];
    stockMovements?: StockMovement[];
}
const EPSILON = 1e-6;
const toSafeNumber = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const toNonNegativeNumber = (value: unknown, fallback = 0): number => Math.max(0, toSafeNumber(value, fallback));
const isActive = <T extends {
    isDeleted?: boolean;
}>(record: T | undefined | null): record is T => !!record && !record.isDeleted;
const approxEqual = (left: number, right: number, tolerance = EPSILON): boolean => Math.abs(left - right) <= tolerance;
const pushIssue = (issues: DataIntegrityIssue[], issue: DataIntegrityIssue): void => {
    issues.push(issue);
};
const countDuplicateIds = <T extends {
    id?: string;
}>(records: T[] = []): Map<string, number> => {
    const counts = new Map<string, number>();
    records.forEach((record) => {
        const id = String(record?.id || '').trim();
        if (!id)
            return;
        counts.set(id, (counts.get(id) || 0) + 1);
    });
    return new Map(Array.from(counts.entries()).filter(([, count]) => count > 1));
};
const addDuplicateIdIssues = (issues: DataIntegrityIssue[], entityType: string, duplicateIds: Map<string, number>): void => {
    duplicateIds.forEach((count, id) => {
        pushIssue(issues, {
            type: 'duplicate_id',
            severity: 'critical',
            entityType,
            entityId: id,
            description: `${entityType} id ${id} appears ${count} times.`,
            recommendation: 'Merge or re-key duplicate records before further sync/import operations.',
            metadata: { count },
        });
    });
};
const buildMedicineLookup = (medicines: Medicine[] = []) => {
    const medicineById = new Map<string, Medicine>();
    const batchByKey = new Map<string, {
        medicine: Medicine;
        batchId: string;
        quantity: number;
        receivedQuantity?: number;
        lastMovementAt?: string;
    }>();
    const purchaseBatchKeys = new Set<string>();
    medicines.forEach((medicine) => {
        if (!medicine?.id)
            return;
        medicineById.set(medicine.id, medicine);
        (medicine.batches || []).forEach((batch) => {
            if (!batch?.id)
                return;
            if (batch.purchaseId) {
                if (batch.purchaseLineId)
                    purchaseBatchKeys.add(`${batch.purchaseId}|line:${batch.purchaseLineId}`);
                if (typeof batch.purchaseItemIndex === 'number')
                    purchaseBatchKeys.add(`${batch.purchaseId}|idx:${batch.purchaseItemIndex}`);
                purchaseBatchKeys.add(`${batch.purchaseId}|batch:${medicine.id}:${batch.batchNumber || ''}:${batch.expiryDate || ''}`);
            }
            batchByKey.set(buildStockQuantityKey(medicine.id, batch.id), {
                medicine,
                batchId: batch.id,
                quantity: toSafeNumber(batch.quantity),
                receivedQuantity: batch.receivedQuantity === undefined ? undefined : toSafeNumber(batch.receivedQuantity),
                lastMovementAt: batch.lastMovementAt,
            });
        });
    });
    return { medicineById, batchByKey, purchaseBatchKeys };
};
export const runDataIntegrityAudit = (input: DataIntegrityAuditInput): DataIntegrityAuditReport => {
    const medicines = input.medicines || [];
    const invoices = input.invoices || [];
    const customers = input.customers || [];
    const suppliers = input.suppliers || [];
    const purchases = input.purchases || [];
    const stockMovements = input.stockMovements || [];
    const issues: DataIntegrityIssue[] = [];
    addDuplicateIdIssues(issues, 'medicine', countDuplicateIds(medicines));
    addDuplicateIdIssues(issues, 'invoice', countDuplicateIds(invoices));
    addDuplicateIdIssues(issues, 'customer', countDuplicateIds(customers));
    addDuplicateIdIssues(issues, 'supplier', countDuplicateIds(suppliers));
    addDuplicateIdIssues(issues, 'purchase', countDuplicateIds(purchases));
    addDuplicateIdIssues(issues, 'stock_movement', countDuplicateIds(stockMovements));
    const { medicineById, batchByKey, purchaseBatchKeys } = buildMedicineLookup(medicines);
    const netSoldByBatch = new Map<string, number>();
    const returnedByBatch = new Map<string, number>();
    const latestMovementByBatch = new Map<string, {
        movement: StockMovement;
        createdAtMs: number;
        index: number;
    }>();
    medicines.forEach((medicine) => {
        (medicine.batches || []).forEach((batch) => {
            const quantity = toSafeNumber(batch.quantity);
            if (quantity < -EPSILON) {
                pushIssue(issues, {
                    type: 'negative_batch_stock',
                    severity: 'critical',
                    entityType: 'batch',
                    entityId: batch.id,
                    description: `${medicine.name} batch ${batch.batchNumber || batch.id} has negative stock (${quantity}).`,
                    recommendation: 'Run stock reconciliation and block further sales from this batch until corrected.',
                    metadata: { medicineId: medicine.id, batchId: batch.id, quantity },
                });
            }
            const receivedQuantity = batch.receivedQuantity === undefined ? undefined : toSafeNumber(batch.receivedQuantity);
            if (receivedQuantity !== undefined && receivedQuantity < -EPSILON) {
                pushIssue(issues, {
                    type: 'negative_received_quantity',
                    severity: 'critical',
                    entityType: 'batch',
                    entityId: batch.id,
                    description: `${medicine.name} batch ${batch.batchNumber || batch.id} has negative received quantity (${receivedQuantity}).`,
                    recommendation: 'Correct the purchase/receipt source for this batch.',
                    metadata: { medicineId: medicine.id, batchId: batch.id, receivedQuantity },
                });
            }
        });
    });
    stockMovements.forEach((movement, index) => {
        const entityId = movement?.id || `stock_movement:${index}`;
        const quantityBaseUnit = toSafeNumber(movement?.quantityBaseUnit, Number.NaN);
        const previousStock = toSafeNumber(movement?.previousStock, Number.NaN);
        const newStock = toSafeNumber(movement?.newStock, Number.NaN);
        if (!movement?.id || !movement.medicineId || !movement.batchId || !movement.type || !movement.referenceType || !movement.referenceId || !movement.createdAt) {
            pushIssue(issues, {
                type: 'invalid_stock_movement_shape',
                severity: 'critical',
                entityType: 'stock_movement',
                entityId,
                description: `Stock movement ${entityId} is missing required trace fields.`,
                recommendation: 'Restore a valid movement record before relying on the inventory ledger.',
                metadata: { movement },
            });
            return;
        }
        if (!Number.isFinite(quantityBaseUnit) || !Number.isFinite(previousStock) || !Number.isFinite(newStock)) {
            pushIssue(issues, {
                type: 'invalid_stock_movement_quantity',
                severity: 'critical',
                entityType: 'stock_movement',
                entityId,
                description: `Stock movement ${entityId} has invalid numeric values.`,
                recommendation: 'Repair or void the corrupt stock movement entry.',
                metadata: { quantityBaseUnit, previousStock, newStock },
            });
            return;
        }
        if (previousStock < -EPSILON || newStock < -EPSILON) {
            pushIssue(issues, {
                type: 'negative_stock_movement_balance',
                severity: 'critical',
                entityType: 'stock_movement',
                entityId,
                description: `Stock movement ${entityId} contains a negative stock balance.`,
                recommendation: 'Repair the movement ledger and reconcile the affected batch.',
                metadata: { previousStock, newStock },
            });
        }
        if (!approxEqual(roundBaseQuantity(previousStock + quantityBaseUnit), roundBaseQuantity(newStock))) {
            pushIssue(issues, {
                type: 'stock_movement_arithmetic_mismatch',
                severity: 'critical',
                entityType: 'stock_movement',
                entityId,
                description: `Stock movement ${entityId} arithmetic does not balance.`,
                recommendation: 'Rebuild this movement from its source transaction or void it and reconcile.',
                metadata: { previousStock, quantityBaseUnit, newStock },
            });
        }
        const batchKey = buildStockQuantityKey(movement.medicineId, movement.batchId);
        if (!batchByKey.has(batchKey)) {
            pushIssue(issues, {
                type: 'orphan_stock_movement_batch',
                severity: 'critical',
                entityType: 'stock_movement',
                entityId,
                description: `Stock movement ${entityId} references missing batch ${movement.batchId}.`,
                recommendation: 'Restore the batch record or void the orphaned movement before sync/import.',
                metadata: { medicineId: movement.medicineId, batchId: movement.batchId },
            });
        }
        if (movement.voided)
            return;
        const createdAtMs = Date.parse(movement.createdAt);
        const safeCreatedAtMs = Number.isFinite(createdAtMs) ? createdAtMs : 0;
        const previousLatest = latestMovementByBatch.get(batchKey);
        if (!previousLatest || safeCreatedAtMs > previousLatest.createdAtMs || (safeCreatedAtMs === previousLatest.createdAtMs && index > previousLatest.index)) {
            latestMovementByBatch.set(batchKey, { movement, createdAtMs: safeCreatedAtMs, index });
        }
    });
    latestMovementByBatch.forEach(({ movement, createdAtMs }, key) => {
        const batch = batchByKey.get(key);
        if (!batch)
            return;
        const batchMovementMs = batch.lastMovementAt ? Date.parse(batch.lastMovementAt) : 0;
        const batchChangedAfterLatestMovement = Number.isFinite(batchMovementMs) && batchMovementMs > createdAtMs + 1000;
        if (!approxEqual(batch.quantity, toSafeNumber(movement.newStock))) {
            pushIssue(issues, {
                type: batchChangedAfterLatestMovement
                    ? 'unledgered_stock_change_after_latest_movement'
                    : 'stock_movement_ledger_mismatch',
                severity: batchChangedAfterLatestMovement ? 'warning' : 'critical',
                entityType: 'batch',
                entityId: batch.batchId,
                description: `${batch.medicine.name} batch stock is ${batch.quantity}, but latest stock movement says ${movement.newStock}.`,
                recommendation: batchChangedAfterLatestMovement
                    ? 'Move remaining stock write paths onto the stock movement service or reconcile this batch.'
                    : 'Block further stock writes for this batch until the movement ledger and stored stock are reconciled.',
                metadata: {
                    medicineId: batch.medicine.id,
                    batchId: batch.batchId,
                    movementId: movement.id,
                    stored: batch.quantity,
                    ledger: movement.newStock,
                    batchLastMovementAt: batch.lastMovementAt,
                    latestMovementAt: movement.createdAt,
                },
            });
        }
    });
    invoices.filter(isActive).forEach((invoice) => {
        const seenLineKeys = new Set<string>();
        (invoice.items || []).forEach((item, itemIndex) => {
            const lineId = `${invoice.id}:${itemIndex}`;
            const medicine = medicineById.get(item.medicineId);
            if (!medicine) {
                pushIssue(issues, {
                    type: 'orphan_invoice_item_medicine',
                    severity: 'critical',
                    entityType: 'invoice_item',
                    entityId: lineId,
                    description: `Invoice ${invoice.invoiceNumber || invoice.id} has an item with missing medicine ${item.medicineId}.`,
                    recommendation: 'Restore the medicine record or void/rebuild this invoice item.',
                    metadata: { invoiceId: invoice.id, medicineId: item.medicineId },
                });
            }
            const batchKey = buildStockQuantityKey(item.medicineId, item.batchId);
            if (!batchByKey.has(batchKey)) {
                pushIssue(issues, {
                    type: 'orphan_invoice_item_batch',
                    severity: 'critical',
                    entityType: 'invoice_item',
                    entityId: lineId,
                    description: `Invoice ${invoice.invoiceNumber || invoice.id} references missing batch ${item.batchId}.`,
                    recommendation: 'Restore the source batch or move this line to a traceable recovery batch.',
                    metadata: { invoiceId: invoice.id, medicineId: item.medicineId, batchId: item.batchId },
                });
            }
            const soldBase = toNonNegativeNumber(getInvoiceItemBaseQuantity(item));
            const returnedBase = getReturnedBaseQuantityForInvoiceItem(invoice, item, itemIndex);
            if (returnedBase - soldBase > EPSILON) {
                pushIssue(issues, {
                    type: 'return_exceeds_sale',
                    severity: 'critical',
                    entityType: 'invoice',
                    entityId: invoice.id,
                    description: `Invoice ${invoice.invoiceNumber || invoice.id} has returned quantity ${returnedBase} greater than sold quantity ${soldBase}.`,
                    recommendation: 'Review duplicate returns and mark invalid returns deleted.',
                    metadata: { invoiceId: invoice.id, itemIndex, soldBase, returnedBase },
                });
            }
            const netSold = getNetSoldBaseQuantityForInvoiceItem(invoice, item, itemIndex);
            netSoldByBatch.set(batchKey, roundBaseQuantity((netSoldByBatch.get(batchKey) || 0) + netSold));
            const lineKey = `${item.medicineId}:${item.batchId}:${item.price}:${item.quantity}`;
            if (seenLineKeys.has(lineKey)) {
                pushIssue(issues, {
                    type: 'possible_duplicate_invoice_line',
                    severity: 'warning',
                    entityType: 'invoice',
                    entityId: invoice.id,
                    description: `Invoice ${invoice.invoiceNumber || invoice.id} has repeated identical lines.`,
                    recommendation: 'Confirm this was intentional and not a double click/draft replay.',
                    metadata: { invoiceId: invoice.id, itemIndex, lineKey },
                });
            }
            seenLineKeys.add(lineKey);
        });
        getInvoiceReturnedBaseQuantityByBatch(invoice).forEach((batchMap, medicineId) => {
            batchMap.forEach((quantity, batchId) => {
                const key = buildStockQuantityKey(medicineId, batchId);
                returnedByBatch.set(key, roundBaseQuantity((returnedByBatch.get(key) || 0) + quantity));
            });
        });
        getInvoiceNetStockRollback(invoice).forEach(() => {
            // Intentionally materialized here so tests and future call sites exercise the same net-stock path.
        });
        const currency = invoice.currency || 'AFN';
        const expectedTotals = calculateInvoiceTotals(invoice.items || [], toSafeNumber(invoice.discount), toSafeNumber(invoice.taxRate), currency);
        if (!approxEqual(toSafeNumber(invoice.total), expectedTotals.total, 0.02)) {
            pushIssue(issues, {
                type: 'invoice_total_mismatch',
                severity: 'warning',
                entityType: 'invoice',
                entityId: invoice.id,
                description: `Invoice ${invoice.invoiceNumber || invoice.id} total is ${invoice.total}, expected ${expectedTotals.total}.`,
                recommendation: 'Recalculate invoice totals from line items before exporting financial reports.',
                metadata: { invoiceId: invoice.id, storedTotal: invoice.total, expectedTotal: expectedTotals.total },
            });
        }
        const paid = toNonNegativeNumber(invoice.amountPaid);
        const remaining = toNonNegativeNumber(invoice.remainingAmount);
        const finalAmount = toNonNegativeNumber(invoice.finalAmount);
        if (!approxEqual(paid + remaining, finalAmount, 0.02)) {
            pushIssue(issues, {
                type: 'invoice_payment_balance_mismatch',
                severity: 'critical',
                entityType: 'invoice',
                entityId: invoice.id,
                description: `Invoice ${invoice.invoiceNumber || invoice.id} has paid + remaining (${paid + remaining}) different from final amount (${finalAmount}).`,
                recommendation: 'Repair payment status and customer ledger before accepting new payments.',
                metadata: { invoiceId: invoice.id, paid, remaining, finalAmount },
            });
        }
    });
    netSoldByBatch.forEach((netSold, key) => {
        const batch = batchByKey.get(key);
        if (!batch)
            return;
        const received = batch.receivedQuantity;
        if (received !== undefined && netSold - received > EPSILON) {
            pushIssue(issues, {
                type: 'sold_quantity_exceeds_received_quantity',
                severity: 'critical',
                entityType: 'batch',
                entityId: batch.batchId,
                description: `${batch.medicine.name} sold ${netSold} base units from a batch that received ${received}.`,
                recommendation: 'Inspect sales for this batch and reconcile stock movement history.',
                metadata: { medicineId: batch.medicine.id, batchId: batch.batchId, netSold, received },
            });
        }
        if (received !== undefined) {
            const expectedCurrent = roundBaseQuantity(Math.max(0, received - netSold));
            if (!approxEqual(batch.quantity, expectedCurrent)) {
                pushIssue(issues, {
                    type: 'stored_stock_differs_from_ledger',
                    severity: 'warning',
                    entityType: 'batch',
                    entityId: batch.batchId,
                    description: `${batch.medicine.name} batch stock is ${batch.quantity}, expected ${expectedCurrent} from received minus net sold.`,
                    recommendation: 'Run reconciliation and review purchases, returns, waste, and manual adjustments before overwriting stock.',
                    metadata: { medicineId: batch.medicine.id, batchId: batch.batchId, stored: batch.quantity, expectedCurrent, netSold, received },
                });
            }
        }
    });
    returnedByBatch.forEach((returned, key) => {
        const sold = netSoldByBatch.get(key) || 0;
        if (returned > 0 && !batchByKey.has(key))
            return;
        if (returned < -EPSILON || sold < -EPSILON) {
            pushIssue(issues, {
                type: 'invalid_stock_movement_quantity',
                severity: 'critical',
                entityType: 'batch',
                entityId: key,
                description: `Invalid stock movement quantity detected for ${key}.`,
                recommendation: 'Inspect invoice and return records for NaN/negative values.',
                metadata: { returned, sold },
            });
        }
    });
    customers.filter(isActive).forEach((customer) => {
        const transactionBalance = (customer.transactions || []).reduce((balance, transaction) => {
            const amount = toSafeNumber(transaction.amount);
            return transaction.type === 'payment' || transaction.type === 'return'
                ? balance - amount
                : balance + amount;
        }, 0);
        const invoiceBalance = invoices
            .filter((invoice) => isActive(invoice) && invoice.customerId === customer.id)
            .reduce((sum, invoice) => sum + getInvoiceCustomerBalanceImpact(invoice), 0);
        const storedBalance = toSafeNumber(customer.balance);
        if (customer.transactions?.length && !approxEqual(storedBalance, transactionBalance, 0.02)) {
            pushIssue(issues, {
                type: 'customer_transaction_balance_mismatch',
                severity: 'warning',
                entityType: 'customer',
                entityId: customer.id,
                description: `${customer.name} balance is ${storedBalance}, but transaction ledger totals ${transactionBalance}.`,
                recommendation: 'Rebuild customer transaction balanceAfter values from ledger order.',
                metadata: { customerId: customer.id, storedBalance, transactionBalance },
            });
        }
        if (!approxEqual(storedBalance, invoiceBalance, 0.02) && invoices.some((invoice) => isActive(invoice) && invoice.customerId === customer.id)) {
            pushIssue(issues, {
                type: 'customer_invoice_balance_mismatch',
                severity: 'warning',
                entityType: 'customer',
                entityId: customer.id,
                description: `${customer.name} balance is ${storedBalance}, but active invoices/returns imply ${invoiceBalance}.`,
                recommendation: 'Review manual payments/credits, then reconcile customer balance.',
                metadata: { customerId: customer.id, storedBalance, invoiceBalance },
            });
        }
    });
    suppliers.filter(isActive).forEach((supplier) => {
        const transactionBalance = (supplier.transactions || []).reduce((balance, transaction) => {
            const amount = toSafeNumber(transaction.amount);
            return transaction.type === 'payment' || transaction.type === 'return'
                ? balance - amount
                : balance + amount;
        }, toSafeNumber(supplier.openingBalance));
        const storedBalance = toSafeNumber(supplier.balance);
        if (supplier.transactions?.length && !approxEqual(storedBalance, transactionBalance, 0.02)) {
            pushIssue(issues, {
                type: 'supplier_transaction_balance_mismatch',
                severity: 'warning',
                entityType: 'supplier',
                entityId: supplier.id,
                description: `${supplier.name} balance is ${storedBalance}, but supplier ledger totals ${transactionBalance}.`,
                recommendation: 'Reconcile supplier purchases, payments, and vendor credits.',
                metadata: { supplierId: supplier.id, storedBalance, transactionBalance },
            });
        }
    });
    purchases.filter(isActive).forEach((purchase) => {
        const receivedRefs = getReceivedPurchaseLineRefs(purchase);
        receivedRefs.forEach((ref) => {
            const lineKey = `${purchase.id}|${ref.key}`;
            const legacyBatchKey = ref.purchaseItemIndex === undefined
                ? ''
                : `${purchase.id}|idx:${ref.purchaseItemIndex}`;
            const descriptiveBatchKey = `${purchase.id}|batch:${ref.medicineId || ''}:${ref.batchNumber || ''}:${purchase.items?.[ref.purchaseItemIndex ?? -1]?.expiryDate || ''}`;
            if (purchaseBatchKeys.has(lineKey)
                || (legacyBatchKey && purchaseBatchKeys.has(legacyBatchKey))
                || purchaseBatchKeys.has(descriptiveBatchKey)) {
                return;
            }
            const purchaseItem = typeof ref.purchaseItemIndex === 'number'
                ? purchase.items?.[ref.purchaseItemIndex]
                : purchase.items?.find((item) => item.lineId === ref.lineId);
            pushIssue(issues, {
                type: 'received_purchase_line_missing_batch',
                severity: 'critical',
                entityType: 'purchase_item',
                entityId: `${purchase.id}:${ref.lineId || (ref.purchaseItemIndex ?? ref.key)}`,
                description: `Purchase ${purchase.invoiceNumber || purchase.id} has received item ${purchaseItem?.medicineName || ref.medicineId || ref.key} without a matching batch record.`,
                recommendation: 'Block further stock operations for this purchase and rebuild or reconcile the missing purchase batch before sync/export.',
                metadata: {
                    purchaseId: purchase.id,
                    invoiceNumber: purchase.invoiceNumber,
                    lineId: ref.lineId,
                    purchaseItemIndex: ref.purchaseItemIndex,
                    medicineId: ref.medicineId,
                    batchNumber: ref.batchNumber,
                    receivedQuantity: ref.quantity,
                },
            });
        });
    });
    const summary = issues.reduce((acc, issue) => {
        acc[issue.severity] += 1;
        acc.total += 1;
        return acc;
    }, { critical: 0, warning: 0, info: 0, total: 0 });
    return {
        generatedAt: new Date().toISOString(),
        summary,
        issues,
    };
};
export const dataIntegrityAuditToCsv = (report: DataIntegrityAuditReport): string => {
    const headers = ['severity', 'type', 'entityType', 'entityId', 'description', 'recommendation'];
    const escapeCell = (value: unknown) => {
        const text = String(value ?? '');
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return [
        headers.join(','),
        ...report.issues.map((issue) => headers.map((key) => escapeCell((issue as unknown as Record<string, unknown>)[key])).join(',')),
    ].join('\n');
};
