import type { Batch, Medicine } from '@/types';
import type { FullData } from './syncLogic';
import { runDataIntegrityAudit, type DataIntegrityAuditReport } from './dataIntegrityAudit';
import { buildStockQuantityKey } from './inventoryLedger';
import { roundBaseQuantity } from './unitConversion';
export interface DataIntegrityRepairResult<T extends Partial<FullData>> {
    data: T;
    repaired: boolean;
    reportBefore: DataIntegrityAuditReport;
    reportAfter: DataIntegrityAuditReport;
    repairedBatchCount: number;
    repairedIssueTypes: string[];
}
const toSafeNumber = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const createAuditInput = (snapshot: Partial<FullData>) => ({
    medicines: snapshot.medicines || [],
    customers: snapshot.customers || [],
    invoices: snapshot.invoices || [],
    suppliers: snapshot.suppliers || [],
    purchases: snapshot.purchases || [],
    stockMovements: snapshot.stockMovements || [],
});
const cloneMedicineBatches = (medicines: Medicine[] = []): Medicine[] => (medicines.map((medicine) => ({
    ...medicine,
    batches: (medicine.batches || []).map((batch) => ({
        ...batch,
        history: Array.isArray(batch.history) ? [...batch.history] : [],
    })),
})));
const buildBatchLookup = (medicines: Medicine[]) => {
    const lookup = new Map<string, {
        medicineIndex: number;
        batchIndex: number;
        batch: Batch;
    }>();
    medicines.forEach((medicine, medicineIndex) => {
        (medicine.batches || []).forEach((batch, batchIndex) => {
            if (!medicine.id || !batch?.id)
                return;
            lookup.set(buildStockQuantityKey(medicine.id, batch.id), {
                medicineIndex,
                batchIndex,
                batch,
            });
        });
    });
    return lookup;
};
export const repairCriticalDataIntegritySnapshot = <T extends Partial<FullData>>(snapshot: T, repairedAt = new Date().toISOString()): DataIntegrityRepairResult<T> => {
    const reportBefore = runDataIntegrityAudit(createAuditInput(snapshot));
    if (reportBefore.summary.critical === 0) {
        return {
            data: snapshot,
            repaired: false,
            reportBefore,
            reportAfter: reportBefore,
            repairedBatchCount: 0,
            repairedIssueTypes: [],
        };
    }
    const fixableIssues = reportBefore.issues.filter((issue) => (issue.severity === 'critical'
        && issue.type === 'sold_quantity_exceeds_received_quantity'));
    if (fixableIssues.length === 0) {
        return {
            data: snapshot,
            repaired: false,
            reportBefore,
            reportAfter: reportBefore,
            repairedBatchCount: 0,
            repairedIssueTypes: [],
        };
    }
    const medicines = cloneMedicineBatches(snapshot.medicines || []);
    const batchLookup = buildBatchLookup(medicines);
    const repairedBatchKeys = new Set<string>();
    fixableIssues.forEach((issue) => {
        const metadata = issue.metadata || {};
        const medicineId = String(metadata.medicineId || '').trim();
        const batchId = String(metadata.batchId || issue.entityId || '').trim();
        if (!medicineId || !batchId)
            return;
        const batchKey = buildStockQuantityKey(medicineId, batchId);
        const target = batchLookup.get(batchKey);
        if (!target)
            return;
        const netSold = toSafeNumber(metadata.netSold, Number.NaN);
        if (!Number.isFinite(netSold) || netSold < 0)
            return;
        const batch = target.batch;
        const currentQuantity = Math.max(0, toSafeNumber(batch.quantity));
        const currentReceived = Math.max(0, toSafeNumber(batch.receivedQuantity, currentQuantity));
        const repairedReceived = roundBaseQuantity(Math.max(currentReceived, netSold + currentQuantity));
        if (!Number.isFinite(repairedReceived) || repairedReceived <= currentReceived)
            return;
        const medicine = medicines[target.medicineIndex];
        const nextBatch: Batch = {
            ...batch,
            receivedQuantity: repairedReceived,
            history: [
                ...(Array.isArray(batch.history) ? batch.history : []),
                {
                    date: repairedAt,
                    action: 'received_quantity_repair',
                    details: `Rebuilt received quantity from active sales ledger: received=${repairedReceived}, netSold=${netSold}, current=${currentQuantity}`,
                },
            ],
        };
        const nextBatches = [...(medicine.batches || [])];
        nextBatches[target.batchIndex] = nextBatch;
        medicines[target.medicineIndex] = {
            ...medicine,
            batches: nextBatches,
            updatedAt: repairedAt,
        };
        repairedBatchKeys.add(batchKey);
    });
    if (repairedBatchKeys.size === 0) {
        return {
            data: snapshot,
            repaired: false,
            reportBefore,
            reportAfter: reportBefore,
            repairedBatchCount: 0,
            repairedIssueTypes: [],
        };
    }
    const repairedData = {
        ...snapshot,
        medicines,
        updatedAt: repairedAt,
        version: Date.now(),
    } as T;
    const reportAfter = runDataIntegrityAudit(createAuditInput(repairedData));
    if (reportAfter.summary.critical >= reportBefore.summary.critical) {
        return {
            data: snapshot,
            repaired: false,
            reportBefore,
            reportAfter: reportBefore,
            repairedBatchCount: 0,
            repairedIssueTypes: [],
        };
    }
    return {
        data: repairedData,
        repaired: true,
        reportBefore,
        reportAfter,
        repairedBatchCount: repairedBatchKeys.size,
        repairedIssueTypes: Array.from(new Set(fixableIssues.map((issue) => issue.type))),
    };
};
