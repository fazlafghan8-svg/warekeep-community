import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const evidence = path.resolve(process.argv[3]);
const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(path.join(project, 'package.json'));
const { chromium, expect } = require('@playwright/test');
const portable = path.resolve(process.argv[2]);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'warekeep-portable-launch-'));
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const freePort = async () => { const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port; await new Promise(r => server.close(r)); return port; };
const cdpPort = await freePort();
const inspectorPort = await freePort();
const processHandle = spawn(portable, [`--remote-debugging-port=${cdpPort}`, `--inspect=${inspectorPort}`], { env: { ...process.env, NODE_ENV: 'test', WAREKEEP_COMMUNITY_TEST_DATA_DIR: root }, windowsHide: true, stdio: 'ignore' });
let browser;
let socket;
let sequence = 0;
const pending = new Map();
const inspector = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async expression => { const result = await inspector('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
const waitJson = async url => {
  const end = Date.now() + 90000;
  while (Date.now() < end) {
    if (processHandle.exitCode !== null) throw new Error(`Portable exited before opening (${processHandle.exitCode}).`);
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1000) }); if (response.ok) return await response.json(); } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Portable did not expose its test-only local inspection endpoint.');
};
try {
  const targets = await waitJson(`http://127.0.0.1:${inspectorPort}/json/list`);
  socket = new WebSocket(targets[0].webSocketDebuggerUrl);
  socket.addEventListener('message', event => { const msg = JSON.parse(event.data); const slot = pending.get(msg.id); if (!slot) return; pending.delete(msg.id); if (msg.error) slot.reject(new Error(JSON.stringify(msg.error))); else slot.resolve(msg.result); });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  await waitJson(`http://127.0.0.1:${cdpPort}/json/version`);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.waitForEvent('page');
  await expect(page.locator('main')).toBeVisible({ timeout: 30000 });
  const identity = await evaluate(`(() => { const electron = process.getBuiltinModule('module').createRequire(process.execPath)('electron'); for (const window of electron.BrowserWindow.getAllWindows()) window.hide(); return { name: electron.app.getName(), version: electron.app.getVersion(), packaged: electron.app.isPackaged, userData: electron.app.getPath('userData'), sessionData: electron.app.getPath('sessionData'), executable: process.execPath }; })()`);
  assert.equal(identity.name, 'WareKeep Community');
  assert.equal(identity.packaged, true);
  assert.equal(path.resolve(identity.userData), root);
  assert.equal(path.resolve(identity.sessionData), root);
  assert.equal(hash(identity.executable), '4d6e6ae3208443812bb1628258a2bb276f9d60d1ff88a68118573d4da6e821b9');
  const portableAsar = path.join(path.dirname(identity.executable), 'resources/app.asar');
  assert.equal(hash(portableAsar), '21fa2510b38da57e5a105ab7ef40d734eccf2b56698f46b03f25b3754b9bc6e2');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText('Community · Offline workspace')).toBeVisible();
  const saved = await page.evaluate(async () => {
    const value = { medicines: [], customers: [], invoices: [], expenses: [], settings: {}, portableLaunchFixture: 1 };
    const saved = await window.electronAPI.saveData(value, 'portable-launch-fixture');
    const loaded = await window.electronAPI.loadData('portable-launch-fixture');
    return saved.success && loaded.success && loaded.data.portableLaunchFixture === 1;
  });
  assert.equal(saved, true);
  const result = { sourceCommit: '05dbd9449016c5beb61a3122e71ddcaa94e0e1dc', version: identity.version, portableSha256: hash(portable), realPortableWrapperLaunched: true, defaultEnglish: true, offlineReload: true, isolatedUserData: true, isolatedSessionData: true, runtimeExeAndAsarMatchUiTestedBuild: true, syntheticDiskSaveLoad: true, fullSaleAndUiBackupCoveredSeparately: 'installed-UI_RESULT.json' };
  fs.writeFileSync(path.join(evidence, 'PORTABLE_RESULT.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    // Schedule quitting after the inspector has returned its acknowledgement.
    await evaluate(`setTimeout(() => process.getBuiltinModule('module').createRequire(process.execPath)('electron').app.quit(), 100); true`).catch(() => {});
    socket.close();
  }
  if (browser) await browser.close().catch(() => {});
  if (processHandle.exitCode === null) {
    await Promise.race([new Promise(r => processHandle.once('exit', r)), new Promise(r => setTimeout(r, 10000))]);
  }
  if (processHandle.exitCode === null) spawnSync('taskkill', ['/PID', String(processHandle.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('warekeep-portable-launch-'));
  fs.rmSync(root, { recursive: true, force: true });
}
