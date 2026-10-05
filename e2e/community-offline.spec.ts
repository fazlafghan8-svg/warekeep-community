import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { getGuestDemoData } from '../src/fixtures/guestDemoData';
import { DEFAULT_DATE_TIME_SETTINGS } from '../src/lib/formatters';
const storageKey = 'warekeep_community-local_full_backup';
test('first start opens a permanent local workspace without external requests', async ({ page }) => {
    const externalRequests: string[] = [];
    const errors: string[] = [];
    page.on('request', request => {
        const url = new URL(request.url());
        if (!['127.0.0.1', 'localhost'].includes(url.hostname))
            externalRequests.push(url.origin);
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByText('Community · Offline workspace')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    const defaults = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').settings, storageKey);
    expect(defaults.language).toBe('english');
    expect(defaults.storeName).toBe('My Store');
    expect(defaults.expenseCategories).toContain('Rent');
    expect(defaults.dateTimeSettings.globalCalendar).toBe('gregorian');
    expect(defaults.dateTimeSettings.timeZone).toBe('local');
    expect(await page.locator('body').innerText()).not.toMatch(/[\u0600-\u06ff]/);
    await expect(page.getByTestId('guest-upgrade-open')).toHaveCount(0);
    expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).not.toBeNull();
    expect(externalRequests).toEqual([]);
    expect(errors).toEqual([]);
    await page.reload();
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByText('Community · Offline workspace')).toBeVisible();
});

test('an existing Dari workspace stays intact and can switch to English from settings', async ({ page }) => {
    const demo = getGuestDemoData('dari');
    demo.settings.storeName = 'دواخانهٔ شخصی';
    const calendar = {
        ...DEFAULT_DATE_TIME_SETTINGS,
        globalCalendar: 'solar_afghan' as const,
        sectionCalendars: { ...DEFAULT_DATE_TIME_SETTINGS.sectionCalendars, sales: 'solar_afghan' as const, medicineExpiry: 'hijri' as const },
        timeFormat: '12h' as const,
        timeZone: 'Asia/Kabul',
    };
    demo.settings.dateTimeSettings = calendar;
    await page.addInitScript(({ key, data }) => {
        if (sessionStorage.getItem('community-language-seeded')) return;
        localStorage.setItem(key, JSON.stringify(data));
        sessionStorage.setItem('community-language-seeded', '1');
    }, { key: storageKey, data: demo });
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByText('نسخهٔ آزاد · فضای کاری آفلاین')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fa-AF');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const readBusiness = () => page.evaluate(key => {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        return { name: data.settings.storeName, language: data.settings.language,
            calendar: data.settings.dateTimeSettings,
            businessData: {
                medicines: data.medicines, customers: data.customers, invoices: data.invoices,
                suppliers: data.suppliers, purchases: data.purchases, expenses: data.expenses,
                treasuryTransactions: data.treasuryTransactions, treasuryCashCounts: data.treasuryCashCounts,
            } };
    }, storageKey);
    const before = await readBusiness();
    expect(before.language).toBe('dari');
    expect(before.calendar).toEqual(calendar);
    await page.reload();
    await expect(page.locator('main')).toBeVisible();
    expect(await readBusiness()).toEqual(before);
    await page.getByTestId('app-sidebar-nav-settings').click();
    await page.locator('select[name="language"]').selectOption('english');
    await page.getByRole('button', { name: 'ثبت معلومات', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await page.reload();
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByText('Community · Offline workspace')).toBeVisible();
    expect(await readBusiness()).toEqual({ ...before, language: 'english' });
    await page.getByTestId('app-sidebar-nav-settings').click();
    await page.locator('select[name="language"]').selectOption('dari');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fa-AF');
    await page.reload();
    await expect(page.locator('main')).toBeVisible();
    expect(await readBusiness()).toEqual(before);
});
for (const language of ['dari', 'english'] as const) {
    test(`cash count, automatic adjustment, and both exchange entries survive reload (${language})`, async ({ page }) => {
        const demo = getGuestDemoData(language);
        await page.addInitScript(({ key, settings }) => {
            if (sessionStorage.getItem('community-cash-count-seeded'))
                return;
            localStorage.setItem(key, JSON.stringify({
                medicines: [], customers: [], invoices: [], expenses: [], suppliers: [],
                purchases: [], partners: [], treasuryTransactions: [], treasuryCashCounts: [],
                settings: { ...settings, operationMode: 'offline', teamMode: false },
            }));
            sessionStorage.setItem('community-cash-count-seeded', '1');
        }, { key: storageKey, settings: demo.settings });
        await page.goto('/');
        await expect(page.locator('main')).toBeVisible();
        const treasuryNav = page.getByRole('button', { name: /^(Treasury & Cash|صندوق و نقدینگی)$/ });
        if (!(await treasuryNav.isVisible()))
            await page.getByRole('button', { name: /^(Finance|مالی)$/ }).click();
        await treasuryNav.click();
        await page.getByRole('button', { name: /^(Cash Count|شمارش صندوق)$/ }).first().click();
        await page.getByPlaceholder('0', { exact: true }).fill('25');
        await page.getByRole('button', { name: /^(Submit Count|ثبت شمارش)$/ }).click();
        const readTreasury = () => page.evaluate(key => {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            return {
                counts: data.treasuryCashCounts?.map((count: {
                    actualBalance: number;
                }) => count.actualBalance),
                adjustments: data.treasuryTransactions?.map((tx: {
                    amount: number;
                    type: string;
                }) => ({ amount: tx.amount, type: tx.type })),
            };
        }, storageKey);
        await expect.poll(readTreasury).toEqual({ counts: [25], adjustments: [{ amount: 25, type: 'adjustment' }] });
        await page.reload();
        await expect(page.locator('main')).toBeVisible();
        expect(await readTreasury()).toEqual({ counts: [25], adjustments: [{ amount: 25, type: 'adjustment' }] });
        if (!(await treasuryNav.isVisible()))
            await page.getByRole('button', { name: /^(Finance|مالی)$/ }).click();
        await treasuryNav.click();
        await page.getByRole('button', { name: /^(Exchange|تبدیل ارز)$/ }).click();
        await page.getByPlaceholder('0', { exact: true }).nth(0).fill('10');
        await page.getByPlaceholder('0', { exact: true }).nth(1).fill('2');
        await page.getByRole('button', { name: /^(Confirm Exchange|تایید تبدیل)$/ }).click();
        const readExchange = () => page.evaluate(key => {
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            return data.treasuryTransactions?.filter((tx: {
                type: string;
            }) => tx.type === 'currency_exchange')
                .map((tx: {
                direction: string;
                amount: number;
                currency: string;
            }) => ({ direction: tx.direction, amount: tx.amount, currency: tx.currency }));
        }, storageKey);
        const expectedExchange = [{ direction: 'out', amount: 10, currency: 'AFN' }, { direction: 'in', amount: 20, currency: 'USD' }];
        await expect.poll(readExchange).toEqual(expectedExchange);
        await page.reload();
        await expect(page.locator('main')).toBeVisible();
        expect(await readExchange()).toEqual(expectedExchange);
        expect((await readTreasury()).counts).toEqual([25]);
        await page.getByRole('button', { name: /^(Settings|تنظیمات سیستم)$/ }).click();
        await page.getByRole('tab', { name: /Maintenance|نگه‌داری|نگهداری/ }).click();
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: /Export Data|دریافت فایل پشتیبان/ }).click();
        const download = await downloadPromise;
        const backupPath = await download.path();
        expect(backupPath).toBeTruthy();
        const exported = JSON.parse(await readFile(backupPath!, 'utf8'));
        expect(exported.treasuryCashCounts).toHaveLength(1);
        expect(exported.treasuryTransactions).toHaveLength(3);
        const beforeInvalidImport = await page.evaluate(key => localStorage.getItem(key), storageKey);
        page.on('dialog', dialog => void dialog.accept());
        for (const malformed of [{ invalid: 'collection' }, null, [null]]) {
            const rejectedDialog = page.waitForEvent('dialog', {
                predicate: dialog => /Invalid backup file|فایل پشتیبان نامعتبر است/.test(dialog.message()),
            });
            await page.locator('input[type="file"][accept=".json"]').setInputFiles({
                name: 'invalid-treasury-backup.json', mimeType: 'application/json',
                buffer: Buffer.from(JSON.stringify({ ...exported, treasuryTransactions: malformed })),
            });
            await rejectedDialog;
            expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(beforeInvalidImport);
        }
        await page.reload();
        await expect(page.locator('main')).toBeVisible();
        expect(await readExchange()).toEqual(expectedExchange);
        expect((await readTreasury()).counts).toEqual([25]);
    });
}
test('an expired trial backup remains writable: sell two of ten, reload, export, and restore', async ({ page }) => {
    const demo = getGuestDemoData('english');
    const medicine = demo.medicines[0];
    medicine.id = 'offline-test-medicine';
    medicine.name = 'Offline Test Medicine';
    medicine.batches = [{
            ...medicine.batches[0], id: 'offline-test-batch', quantity: 10,
            expiryDate: '2028-01-01', ownerPartnerId: undefined,
            purchaseId: undefined, purchaseLineId: undefined, purchaseItemIndex: undefined
        }];
    const seed = {
        ...demo,
        medicines: [medicine],
        customers: [demo.customers[0]],
        invoices: [], purchases: [], suppliers: [], partners: [],
        settings: {
            ...demo.settings,
            operationMode: 'team',
            teamMode: false,
            guestTrial: { meta: { expiresAt: '2020-01-01T00:00:00.000Z' } },
            subscription: { tier: 'pro', isActive: false, expiryDate: '2020-01-01T00:00:00.000Z' }
        }
    };
    await page.addInitScript(({ key, data }) => {
        if (sessionStorage.getItem('community-e2e-seeded'))
            return;
        localStorage.setItem(key, JSON.stringify(data));
        sessionStorage.setItem('community-e2e-seeded', '1');
    }, { key: storageKey, data: seed });
    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();
    const initial = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), storageKey);
    expect(initial.medicines[0].batches[0].quantity).toBe(10);
    expect(initial.settings.guestTrial).toBeUndefined();
    expect(initial.settings.operationMode).toBe('offline');
    await page.getByRole('button', { name: /Sales \/ POS|Sales/i }).first().click();
    await page.getByPlaceholder('Medicine name or barcode').fill('Offline Test Medicine');
    await page.getByRole('button', { name: /Offline Test Medicine/ }).last().click();
    await page.locator('input[type="number"]').filter({ visible: true }).first().fill('2');
    await page.getByRole('button', { name: 'Add line', exact: true }).click();
    await page.getByPlaceholder('Name or phone number').fill(demo.customers[0].name);
    await page.getByRole('button', { name: new RegExp(demo.customers[0].name) }).last().click();
    await page.getByRole('button', { name: /Print|Save/i }).last().click();
    await expect.poll(async () => page.evaluate(key => {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        return { quantity: data.medicines?.[0]?.batches?.[0]?.quantity, invoices: data.invoices?.length };
    }, storageKey)).toEqual({ quantity: 8, invoices: 1 });
    await page.reload();
    await expect(page.locator('main')).toBeVisible();
    expect(await page.evaluate(key => {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        return { quantity: data.medicines?.[0]?.batches?.[0]?.quantity, invoices: data.invoices?.length };
    }, storageKey)).toEqual({ quantity: 8, invoices: 1 });
    await page.getByRole('button', { name: /^(Settings|تنظیمات سیستم)$/ }).click();
    await page.getByRole('tab', { name: /Maintenance|نگهداری/ }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export Data/ }).click();
    const download = await downloadPromise;
    const backupPath = await download.path();
    expect(backupPath).toBeTruthy();
    const exported = JSON.parse(await readFile(backupPath!, 'utf8'));
    expect(exported.medicines[0].batches[0].quantity).toBe(8);
    expect(exported.invoices).toHaveLength(1);
    expect(exported).toHaveProperty('treasuryTransactions');
    expect(exported).toHaveProperty('treasuryCashCounts');
    await page.evaluate(key => localStorage.removeItem(key), storageKey);
    await page.reload();
    await expect(page.locator('main')).toBeVisible();
    await page.getByRole('button', { name: /^(Settings|تنظیمات سیستم)$/ }).click();
    await page.getByRole('tab', { name: /Maintenance|نگهداری/ }).click();
    page.on('dialog', dialog => void dialog.accept());
    await page.locator('input[type="file"][accept=".json"]').setInputFiles(backupPath!);
    await expect.poll(async () => page.evaluate(key => {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        return { quantity: data.medicines?.[0]?.batches?.[0]?.quantity, invoices: data.invoices?.length };
    }, storageKey)).toEqual({ quantity: 8, invoices: 1 });
});
