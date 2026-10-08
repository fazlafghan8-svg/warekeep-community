import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const evidence = path.resolve(process.argv[4]);
const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(path.join(project, 'package.json'));
const { _electron: electron, expect } = require('@playwright/test');
const { getGuestDemoData } = await import(pathToFileURL(path.join(project, 'src/fixtures/guestDemoData.ts')));
const executablePath = path.resolve(process.argv[2]);
const label = process.argv[3] || 'unpacked';
assert.match(label, /^[a-z-]+$/);
const testRoots = [];
let application;
const key = 'warekeep_community-local_full_backup';
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const expectedExeHash = '4d6e6ae3208443812bb1628258a2bb276f9d60d1ff88a68118573d4da6e821b9';
let serverHits = 0;
const server = http.createServer((_request, response) => { serverHits++; response.setHeader('Access-Control-Allow-Origin', '*'); response.end('reachable-control'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const controlUrl = `http://127.0.0.1:${server.address().port}/probe`;
assert.equal(await (await fetch(controlUrl)).text(), 'reachable-control');
serverHits = 0;
const freshRoot = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), `warekeep-current-${label}-`)); testRoots.push(root); return root; };
const externalRequests = [];
const rendererErrors = [];
const launch = async root => {
  application = await electron.launch({ executablePath, env: { ...process.env, NODE_ENV: 'test', WAREKEEP_COMMUNITY_TEST_DATA_DIR: root }, timeout: 120000 });
  const page = await application.firstWindow();
  page.setDefaultTimeout(30000);
  const identity = await application.evaluate(({ app, BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.hide();
    return { name: app.getName(), packaged: app.isPackaged, userData: app.getPath('userData'), sessionData: app.getPath('sessionData'), version: app.getVersion(), executable: process.execPath };
  });
  assert.equal(identity.name, 'WareKeep Community');
  assert.equal(identity.packaged, true);
  assert.equal(path.resolve(identity.userData), root);
  assert.equal(path.resolve(identity.sessionData), root);
  assert.equal(hash(identity.executable), expectedExeHash);
  page.on('request', request => { if (/^https?:/i.test(request.url())) externalRequests.push(request.url()); });
  page.on('pageerror', error => rendererErrors.push(error.message));
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  return { page, identity };
};
const maintenance = async page => {
  await page.getByTestId('app-sidebar-nav-settings').click();
  await page.getByRole('tab', { name: /Maintenance/ }).click();
};
const state = page => page.evaluate(key => {
  const data = JSON.parse(localStorage.getItem(key) || '{}');
  return { quantity: data.medicines?.[0]?.batches?.[0]?.quantity, invoices: data.invoices?.length };
}, key);
const diskState = page => page.evaluate(async () => {
  const { data } = await window.electronAPI.loadData('community-local');
  return { quantity: data?.medicines?.[0]?.batches?.[0]?.quantity, invoices: data?.invoices?.length };
});
try {
  const root = freshRoot();
  let { page, identity } = await launch(root);
  await expect(page.getByText('Community · Offline workspace')).toBeVisible();
  assert.ok(!(await page.locator('body').innerText()).includes('Startup Error'));
  await expect.poll(() => state(page)).toEqual({ quantity: undefined, invoices: 0 });
  const blocked = await page.evaluate(async url => { try { await fetch(url); return false; } catch { return true; } }, controlUrl);
  assert.equal(blocked, true);
  assert.equal(serverHits, 0, 'A reachable control server must receive no renderer request.');
  await application.context().setOffline(true);
  const demo = getGuestDemoData('english');
  const medicine = demo.medicines[0];
  medicine.id = 'offline-test-medicine'; medicine.name = 'Offline Test Medicine';
  medicine.batches = [{ ...medicine.batches[0], id: 'offline-test-batch', quantity: 10, expiryDate: '2028-01-01', ownerPartnerId: undefined, purchaseId: undefined, purchaseLineId: undefined, purchaseItemIndex: undefined }];
  const seed = { ...demo, medicines: [medicine], customers: [{ ...demo.customers[0], name: 'Synthetic Test Customer' }], invoices: [], purchases: [], suppliers: [], partners: [], expenses: [], settings: { ...demo.settings, storeName: 'Test Pharmacy', language: 'english', operationMode: 'offline', teamMode: false } };
  const dialogs = [];
  page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.accept(); });
  await maintenance(page);
  await page.locator('input[type="file"][accept=".json"]').setInputFiles({ name: 'synthetic-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await expect.poll(() => state(page)).toEqual({ quantity: 10, invoices: 0 });
  await expect.poll(() => diskState(page)).toEqual({ quantity: 10, invoices: 0 });
  await page.getByRole('button', { name: /Sales \/ POS|Sales/i }).first().click();
  await page.getByPlaceholder('Medicine name or barcode').fill('Offline Test Medicine');
  await page.getByRole('button', { name: /Offline Test Medicine/ }).last().click();
  const quantityInput = page.locator('label').filter({ hasText: /^Qty$/ }).locator('..').locator('input').filter({ visible: true });
  await quantityInput.fill('2');
  await expect(quantityInput).toHaveValue('2');
  await page.getByRole('button', { name: 'Add line', exact: true }).click();
  await page.getByPlaceholder('Name or phone number').fill('Synthetic Test Customer');
  await page.getByRole('button', { name: /Synthetic Test Customer/ }).last().click();
  await page.getByRole('button', { name: /Print|Save/i }).last().click();
  await expect.poll(() => state(page)).toEqual({ quantity: 8, invoices: 1 });
  await expect.poll(() => diskState(page)).toEqual({ quantity: 8, invoices: 1 });
  await application.close(); application = undefined;
  ({ page } = await launch(root));
  await application.context().setOffline(true);
  await expect.poll(() => state(page)).toEqual({ quantity: 8, invoices: 1 });
  await expect.poll(() => diskState(page)).toEqual({ quantity: 8, invoices: 1 });
  await maintenance(page);
  const backupPath = path.join(evidence, `${label}-synthetic-backup.json`);
  if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
  await application.evaluate(({ app, session }, destination) => {
    app.__warekeepTestDownload = { state: 'waiting' };
    session.defaultSession.once('will-download', (_event, item) => {
      item.setSavePath(destination);
      app.__warekeepTestDownload = { state: 'started', name: item.getFilename() };
      item.once('done', (_event, state) => { app.__warekeepTestDownload.state = state; });
    });
  }, backupPath);
  await page.getByRole('button', { name: /Export Data/ }).click();
  await expect.poll(() => application.evaluate(({ app }) => app.__warekeepTestDownload?.state), { timeout: 30000 }).toBe('completed');
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  assert.equal(backup.medicines[0].batches[0].quantity, 8);
  assert.equal(backup.invoices.length, 1);
  await application.close(); application = undefined;
  const restoreRoot = freshRoot();
  ({ page } = await launch(restoreRoot));
  await application.context().setOffline(true);
  await expect.poll(() => state(page)).toEqual({ quantity: undefined, invoices: 0 });
  page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.accept(); });
  await maintenance(page);
  await page.locator('input[type="file"][accept=".json"]').setInputFiles(backupPath);
  await expect.poll(() => state(page)).toEqual({ quantity: 8, invoices: 1 });
  await expect.poll(() => diskState(page)).toEqual({ quantity: 8, invoices: 1 });
  await application.close(); application = undefined;
  ({ page } = await launch(restoreRoot));
  await expect.poll(() => state(page)).toEqual({ quantity: 8, invoices: 1 });
  assert.deepEqual(externalRequests, []);
  assert.deepEqual(rendererErrors, []);
  const result = { label, sourceCommit: '05dbd9449016c5beb61a3122e71ddcaa94e0e1dc', testedExecutable: executablePath, inputExecutableSha256: hash(executablePath), runtimeExecutableSha256: expectedExeHash, version: identity.version, syntheticDataOnly: true, isolatedUserData: true, isolatedSessionData: true, freshDefaultEnglish: true, reachableNetworkControlBlocked: true, offlineSale: { initialQuantity: 10, sold: 2, remaining: 8, invoices: 1 }, diskSaveVerified: true, closeAndRestartPersistence: true, uiBackupExport: true, uiRestoreIntoFreshWorkspace: true, restoredRestartPersistence: true, rendererErrors, externalRequests, dialogs };
  fs.writeFileSync(path.join(evidence, `${label}-UI_RESULT.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  if (application) {
    const pages = application.windows();
    if (pages[0]) await pages[0].screenshot({ path: path.join(evidence, `${label}-FAILURE.png`) }).catch(() => {});
  }
  throw error;
} finally {
  if (application) await application.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
  for (const root of testRoots) {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith(`warekeep-current-${label}-`));
    fs.rmSync(root, { recursive: true, force: true });
  }
}
