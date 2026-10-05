// Community regression checks use the real local store. Source guards apply
// only to the published local UI; cloud synchronization and account logout
// are intentionally absent from this edition.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadFromDisk, saveToDisk } from '../services/storageService';
import type { FullData } from '../utils/syncLogic';

const LEGACY_TX_KEY = 'warekeep_treasury_transactions';
const LEGACY_CC_KEY = 'warekeep_treasury_cash_counts';
const readSource = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const readApp = () => readSource('../App.tsx');
const stripComments = (source: string) => source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const snapshotFor = (label: string, withTreasury: boolean): FullData => ({
    medicines: [],
    customers: [{ id: `cust-${label}`, name: `Customer ${label}`, phone: '', address: '', balance: 0, transactions: [] } as any],
    invoices: [], expenses: [], suppliers: [], purchases: [], partners: [], auditEvents: [], stockMovements: [],
    treasuryTransactions: withTreasury
        ? ([{ id: `ttx-${label}`, date: '2026-05-01', type: 'external_income', direction: 'in', amount: 5000, currency: 'AFN', description: `cash of ${label}` }] as any)
        : [],
    treasuryCashCounts: withTreasury
        ? ([{ id: `tcc-${label}`, date: '2026-05-02', expectedBalance: 5000, actualBalance: 5000, difference: 0, currency: 'AFN' }] as any)
        : [],
    settings: { storeName: `Store ${label}`, storePhone: '', storeAddress: '', taxRate: 0 } as any,
    version: Date.now(), updatedAt: new Date().toISOString(),
});

beforeEach(() => {
    localStorage.clear();
    // The Electron test bridge does not persist bytes. Exercise the actual
    // browser store so the control proves that a ledger was really written.
    delete (window as any).electronAPI;
});

describe('local treasury remains scoped to its stored profile', () => {
    it('writes a real ledger for A and exposes none of it when B loads', async () => {
        await saveToDisk(snapshotFor('A', true), 'user-A');
        const a = await loadFromDisk('user-A');
        expect(a?.treasuryTransactions).toHaveLength(1);
        expect(a?.treasuryCashCounts).toHaveLength(1);
        const b = await loadFromDisk('user-B');
        expect(b?.treasuryTransactions ?? []).toHaveLength(0);
        expect(b?.treasuryCashCounts ?? []).toHaveLength(0);
        expect(JSON.stringify(b ?? {})).not.toContain('cash of A');
    });

    it('writing a second profile leaves the first ledger intact', async () => {
        await saveToDisk(snapshotFor('A', true), 'user-A');
        await saveToDisk(snapshotFor('B', true), 'user-B');
        const a = await loadFromDisk('user-A');
        const b = await loadFromDisk('user-B');
        expect(a?.treasuryTransactions?.map((row: any) => row.id)).toEqual(['ttx-A']);
        expect(b?.treasuryTransactions?.map((row: any) => row.id)).toEqual(['ttx-B']);
    });

    it('normal persistence never writes the bare legacy keys', async () => {
        await saveToDisk(snapshotFor('A', true), 'user-A');
        expect(localStorage.getItem(LEGACY_TX_KEY)).toBeNull();
        expect(localStorage.getItem(LEGACY_CC_KEY)).toBeNull();
    });

    it('does not silently adopt or destroy a device legacy blob', async () => {
        localStorage.setItem(LEGACY_TX_KEY, JSON.stringify([{ id: 'legacy-cash', amount: 999, currency: 'AFN', direction: 'in' }]));
        localStorage.setItem(LEGACY_CC_KEY, JSON.stringify([{ id: 'legacy-count', currency: 'AFN' }]));
        await saveToDisk(snapshotFor('B', false), 'user-B');
        const b = await loadFromDisk('user-B');
        expect(b?.treasuryTransactions ?? []).toHaveLength(0);
        expect(JSON.stringify(b ?? {})).not.toContain('legacy-cash');
        expect(localStorage.getItem(LEGACY_TX_KEY)).not.toBeNull();
    });

    it('an explicit reset of A cannot erase B treasury or stock movements', async () => {
        const a = { ...snapshotFor('A', true), stockMovements: [{ id: 'movement-A', medicineId: 'med-A', quantityBaseUnit: 1, previousStock: 0, newStock: 1 }] } as any;
        const b = { ...snapshotFor('B', true), stockMovements: [{ id: 'movement-B', medicineId: 'med-B', quantityBaseUnit: 2, previousStock: 0, newStock: 2 }] } as any;
        await saveToDisk(a, 'user-A');
        await saveToDisk(b, 'user-B');
        await saveToDisk({ ...a, treasuryTransactions: [], treasuryCashCounts: [], stockMovements: [] }, 'user-A', { allowWipe: true });
        const resetA = await loadFromDisk('user-A');
        const preservedB = await loadFromDisk('user-B');
        expect(resetA?.treasuryTransactions).toEqual([]);
        expect(resetA?.stockMovements).toEqual([]);
        expect(preservedB?.treasuryTransactions).toHaveLength(1);
        expect(preservedB?.treasuryCashCounts).toHaveLength(1);
        expect(preservedB?.stockMovements?.map((row: any) => row.id)).toEqual(['movement-B']);
    });
});

describe('the published App commits local treasury through the scoped store', () => {
    it('has no normal access to device-global treasury keys or imperative save helpers', () => {
        const code = stripComments(readApp());
        expect(code).toContain('const addTreasuryTransaction');
        expect(code).toContain('const addTreasuryCashCount');
        for (const forbidden of [LEGACY_TX_KEY, LEGACY_CC_KEY, 'TREASURY_TX_KEY', 'TREASURY_CC_KEY', 'const saveTreasuryTx', 'const saveTreasuryCc']) {
            expect(code).not.toContain(forbidden);
        }
        expect(code).not.toMatch(/setTreasuryTransactions\(JSON\.parse/);
        expect(code).not.toMatch(/setTreasuryCashCounts\(JSON\.parse/);
    });

    it('commits treasury edits through persistData rather than an unscoped write', () => {
        const code = stripComments(readApp());
        expect(code).toMatch(/await\s+persistData\(\{\s*treasuryTransactions:\s*updated\s*\}\)/);
        expect(code).toMatch(/await\s+persistData\(\{\s*treasuryCashCounts:\s*updated\s*\}\)/);
    });

    it('resets selected treasury slices in the local snapshot without direct legacy writes', () => {
        const code = stripComments(readApp());
        expect(code).toContain('const handleSystemReset');
        expect(code).not.toContain('saveTreasuryTx([])');
        expect(code).not.toContain('saveTreasuryCc([])');
        expect(code).toMatch(/options\?\.treasury\s*\?\s*\{\s*treasuryTransactions:\s*\[\],\s*treasuryCashCounts:\s*\[\]\s*\}/);
    });
});
