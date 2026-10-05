// @vitest-environment node
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { resolveConfig } from 'vite';
const require = createRequire(import.meta.url);
describe('Community build isolation', () => {
    it('does not load backend settings or expose inherited client environment values', async () => {
        const original = { ...process.env };
        try {
            process.env.VITE_APP_EDITION = 'commercial';
            process.env.VITE_BACKEND_URL = 'https://do-not-use.invalid';
            process.env.VITE_SUPABASE_ANON_KEY = 'synthetic-community-test-canary';
            process.env.VITE_UNEXPECTED_SECRET = 'synthetic-community-test-canary';
            process.env.VITE_INVOICE_FREE_LAYOUT_ONLY_EMAIL = 'owner@example.test';
            process.env.VITE_COMMERCIAL_SUPPORT_PHONE = '+10000000000';
            process.env.VITE_COMMERCIAL_SUPPORT_EMAIL = 'support@example.test';
            process.env.VITE_COMMERCIAL_SUPPORT_URL = 'https://example.test/support';
            process.env.VITE_COMMERCIAL_SALES_CONTACT_URL = 'https://example.test/sales';
            const config = await resolveConfig({ configFile: resolve('vite.config.ts'), mode: 'production' }, 'build');
            expect(config.env.VITE_UNEXPECTED_SECRET).toBeUndefined();
            expect(config.env.VITE_SUPABASE_ANON_KEY).toBeUndefined();
            expect(config.define['import.meta.env.VITE_BACKEND_URL']).toBeUndefined();
            expect(config.define['import.meta.env.VITE_APP_EDITION']).toBe('"community"');
            for (const key of ['VITE_INVOICE_FREE_LAYOUT_ONLY_EMAIL', 'VITE_COMMERCIAL_SUPPORT_PHONE', 'VITE_COMMERCIAL_SUPPORT_EMAIL', 'VITE_COMMERCIAL_SUPPORT_URL', 'VITE_COMMERCIAL_SALES_CONTACT_URL']) {
                expect(config.env[key]).toBeUndefined();
                expect(config.define[`import.meta.env.${key}`]).toBeUndefined();
            }
            expect(config.envDir).toBe(false);
            expect(resolve(config.publicDir)).toBe(resolve('public-community'));
            expect(Object.keys(config.build.rollupOptions.input)).toEqual(['main']);
            expect(resolve(config.build.rollupOptions.input.main)).toBe(resolve('index.html'));
            expect(config.server.port).toBe(5175);
            expect(config.server.proxy).toBeUndefined();
            expect(config.plugins.some((plugin) => plugin.name === 'warekeep-dev-backend-autostart')).toBe(false);
            const plugin = config.plugins.find((item) => item.name === 'warekeep-community-offline-html');
            const transformed = plugin.transformIndexHtml.handler('<head><meta http-equiv="Content-Security-Policy" content="connect-src https:" /><script type="importmap">{"imports":{"react":"https://example.com/react"}}</script><title>WareKeep</title></head><body><script type="module" src="/src/index.tsx"></script></body>');
            expect(transformed).toContain('connect-src data: blob: file:');
            expect(transformed).not.toContain('unsafe-eval');
            expect(transformed).not.toContain('https://example.com');
            expect(transformed).toContain('WareKeep Community');
            expect(transformed).toContain('src="/src/index.community.tsx"');
            expect(plugin.transformIndexHtml.handler(transformed)).toContain('src="/src/index.community.tsx"');
        }
        finally {
            for (const key of Object.keys(process.env))
                if (!(key in original))
                    delete process.env[key];
            Object.assign(process.env, original);
        }
    });
    it('packages distinct standalone installers without commercial services or bootstrapper', async () => {
        const config = require('../electron-builder.community.cjs');
        const { validateConfiguration } = require('app-builder-lib/out/util/config/config.js');
        await validateConfiguration(config, { isEnabled: false });
        const result = spawnSync(process.execPath, [resolve('scripts/build-community-desktop.mjs'), '--print-config'], {
            encoding: 'utf8',
            env: { ...process.env, VITE_BACKEND_URL: 'synthetic-community-test-canary' },
        });
        expect(result.status).toBe(0);
        expect(result.stdout).not.toContain('synthetic-community-test-canary');
        expect(JSON.parse(result.stdout)).toMatchObject({ edition: 'community', backendBundled: false, bootstrapper: false });
        expect(config.appId).toBe('com.warekeep.community');
        expect(config.directories.buildResources).toBe('public-community');
        expect(config.extraMetadata.warekeepEdition).toBe('community');
        expect(config.win.target.map((target) => target.target)).toEqual(['nsis', 'portable']);
        expect(config.nsis.include).toBeUndefined();
        expect(config.nsis.license).toBeUndefined();
        expect(config.extraResources).toEqual([
            { from: existsSync(resolve('community-publication/LICENSE')) ? 'community-publication/LICENSE' : 'LICENSE', to: 'LICENSE' },
            { from: 'THIRD_PARTY_NOTICES.md', to: 'THIRD_PARTY_NOTICES.md' },
            { from: 'THIRD_PARTY_DEPENDENCIES.md', to: 'THIRD_PARTY_DEPENDENCIES.md' },
        ]);
        expect(config.win.icon).toBeUndefined();
        expect(config.protocols).toEqual([]);
        expect(config.publish).toBeNull();
    }, 20000);
    it('publishes local services and a preload bridge without cloud SDKs or remote IPC', async () => {
 const config = await resolveConfig({ configFile: resolve('vite.config.ts'), mode: 'production' }, 'build');
 expect(config.plugins.some(plugin => plugin.name === 'warekeep-community-prune-unused-installer-mockup')).toBe(false);
 const metadata = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
 expect(metadata.dependencies['@supabase/supabase-js']).toBeUndefined();
 for (const filename of ['src/services/supabaseClient.ts', 'src/services/supabaseService.ts', 'src/services/backendConfig.ts', 'src/services/backendTransport.ts', 'src/services/aiService.ts', 'src/components/Login.tsx', 'src/components/Assistant.tsx']) {
  expect(existsSync(resolve(filename)), filename).toBe(false);
 }
 let api;
 const invoke = vi.fn(async () => ({ success: true }));
 vm.runInNewContext(readFileSync(resolve('electron/preload.cjs'), 'utf8'), {
  require: name => {
   expect(name).toBe('electron');
   return { contextBridge: { exposeInMainWorld: (key, value) => { expect(key).toBe('electronAPI'); api = value; } }, ipcRenderer: { invoke, on: vi.fn(), removeListener: vi.fn() } };
  },
  process: { platform: 'win32' },
 });
 for (const name of ['backendRequest', 'probeBackend', 'downloadAndOpenInstaller', 'onInstallerDownloadProgress', 'ensureAuthProtocol', 'onAuthDeepLink', 'openExternal', 'saveSyncState', 'loadSyncState']) expect(api[name], name).toBeUndefined();
 for (const name of ['saveData', 'saveDataPatch', 'loadData', 'backupData', 'selectFolder', 'saveInvoiceHtml', 'generateReportPdf', 'openAttachmentDataUrl', 'getAppVersion', 'getPlatformInfo']) expect(typeof api[name], name).toBe('function');
 const localData = { medicines: [], invoices: [] };
 expect(await api.saveData(localData, 'community-local')).toEqual({ success: true });
 expect(invoke).toHaveBeenCalledWith('save-data', localData, 'community-local');
 const main = readFileSync(resolve('electron/main.js'), 'utf8');
 expect(main).not.toMatch(/backend-request|probe-backend|download-and-open-installer|ensure-auth-protocol|open-external-url|auth-deep-link/);
 expect(main).toContain('isCommunityRequestAllowed');
 expect(main).toContain('onBeforeRequest');
});
});
