import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';
const executablePath = path.resolve('release/community/win-unpacked/WareKeep Community.exe');
const expectedElectronVersion = JSON.parse(fs.readFileSync(path.resolve('node_modules/electron/package.json'), 'utf8')).version;
assert.ok(fs.existsSync(executablePath), 'Build the unpacked Community app before running this smoke check.');
const resourcesPath = path.join(path.dirname(executablePath), 'resources');
assert.match(fs.readFileSync(path.join(resourcesPath, 'LICENSE'), 'utf8'), /Apache License[\s\S]*Version 2\.0/);
assert.match(fs.readFileSync(path.join(resourcesPath, 'THIRD_PARTY_NOTICES.md'), 'utf8'), /Vazirmatn|SIL OPEN FONT LICENSE/i);
assert.match(fs.readFileSync(path.join(resourcesPath, 'THIRD_PARTY_DEPENDENCIES.md'), 'utf8'), /dependenc(?:y|ies)|وابستگی/i);
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'warekeep-community-smoke-'));
const testUserId = 'community-smoke-fixture';
const firstSnapshot = { medicines: [], customers: [], invoices: [], expenses: [], settings: {}, smokeRevision: 1 };
const launch = () => electron.launch({
    executablePath,
    env: { ...process.env, NODE_ENV: 'test', WAREKEEP_COMMUNITY_TEST_DATA_DIR: testRoot },
    timeout: 60000,
});
let application;
try {
    application = await launch();
    const page = await application.firstWindow();
    await page.waitForFunction(() => Boolean(window.electronAPI));
    const identity = await application.evaluate(({ app, BrowserWindow }) => {
        for (const window of BrowserWindow.getAllWindows())
            window.hide();
        return { name: app.getName(), userData: app.getPath('userData'), packaged: app.isPackaged, electronVersion: process.versions.electron };
    });
    assert.equal(identity.name, 'WareKeep Community');
    assert.equal(path.resolve(identity.userData), testRoot);
    assert.equal(identity.packaged, true);
    assert.equal(identity.electronVersion, expectedElectronVersion);
    assert.ok(page.url().startsWith('file:'));
    await page.waitForFunction(() => document.getElementById('root')?.childElementCount > 0);
    assert.ok(!(await page.locator('body').innerText()).includes('Startup Error'));
    const scriptPolicy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    assert.ok(scriptPolicy?.includes("script-src 'self' 'unsafe-inline' blob:"));
    assert.ok(!scriptPolicy.includes('unsafe-eval'));
    await page.evaluate(() => document.fonts.ready);
    const offlinePreview = await page.evaluate(async () => (await fetch('data:text/plain,offline-preview')).text());
    assert.equal(offlinePreview, 'offline-preview');
    const remoteFetchBlocked = await page.evaluate(async () => {
        try {
            await fetch('https://community-smoke.invalid/probe');
            return false;
        }
        catch {
            return true;
        }
    });
    assert.equal(remoteFetchBlocked, true);
    const cloudBridgeAbsent = await page.evaluate(() => !('backendRequest' in window.electronAPI) && !('updateInstaller' in window.electronAPI));
    assert.equal(cloudBridgeAbsent, true);
    const write = await page.evaluate(({ data, userId }) => window.electronAPI.saveData(data, userId), { data: firstSnapshot, userId: testUserId });
    assert.equal(write.success, true);
    const loaded = await page.evaluate((userId) => window.electronAPI.loadData(userId), testUserId);
    assert.deepEqual(loaded.data, firstSnapshot);
    const backedUp = await page.evaluate((data) => window.electronAPI.backupData(data), firstSnapshot);
    assert.equal(backedUp.success, true);
    assert.ok(path.resolve(backedUp.path).startsWith(testRoot + path.sep));
    const backupEnvelope = JSON.parse(fs.readFileSync(backedUp.path, 'utf8'));
    assert.deepEqual(backupEnvelope.data, firstSnapshot);
    await page.evaluate(({ data, userId }) => window.electronAPI.saveData({ ...data, smokeRevision: 2 }, userId), { data: firstSnapshot, userId: testUserId });
    fs.writeFileSync(path.join(testRoot, `local-db-${testUserId}.json`), '{simulated-corruption', 'utf8');
    const recovered = await page.evaluate((userId) => window.electronAPI.loadData(userId), testUserId);
    assert.equal(recovered.recoveredFrom, 'prev');
    assert.deepEqual(recovered.data, firstSnapshot);
    await application.close();
    application = await launch();
    const restartedPage = await application.firstWindow();
    await restartedPage.waitForFunction(() => Boolean(window.electronAPI));
    await application.evaluate(({ BrowserWindow }) => {
        for (const window of BrowserWindow.getAllWindows())
            window.hide();
    });
    const afterRestart = await restartedPage.evaluate((userId) => window.electronAPI.loadData(userId), testUserId);
    assert.deepEqual(afterRestart.data, firstSnapshot);
    const restore = await restartedPage.evaluate(({ data, userId }) => window.electronAPI.saveData(data, userId), { data: backupEnvelope.data, userId: testUserId });
    assert.equal(restore.success, true);
    console.info(JSON.stringify({ electronVersion: identity.electronVersion, packagedOfflineLaunch: true, isolatedUserData: true, cloudBridgeBlocked: true, remoteFetchBlocked: true, productionCspWithoutUnsafeEval: true, legalNoticesBundled: true, dataPreview: true, localSaveLoad: true, backupRestore: true, corruptionRecovery: true, restartPersistence: true }));
}
finally {
    if (application)
        await application.close().catch(() => { });
    const expectedParent = path.resolve(os.tmpdir()) + path.sep;
    if (!path.resolve(testRoot).startsWith(expectedParent) || !path.basename(testRoot).startsWith('warekeep-community-smoke-')) {
        throw new Error('Refusing to clean a path outside the smoke-test temporary directory.');
    }
    fs.rmSync(testRoot, { recursive: true, force: true });
}
