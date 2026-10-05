import { spawn, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configuration = require('./electron-builder.community.cjs');
// Do not load commercial .env files or stage a backend in the Community package.
// Vite additionally disables all automatic environment exposure for this edition.
const buildEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:VITE_|SUPABASE_|GROQ_|NEOKENS_|DATABASE_URL$|DB_|JWT_|FASTSPRING_|CONTROL_)/i.test(key)));
buildEnvironment.VITE_APP_EDITION = 'community';
buildEnvironment.WAREKEEP_BUILD_TARGET = 'app';
buildEnvironment.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
// Fetch-based Electron downloads no longer consume Got's request timeout.
// Bound each whole build step, including the builder's child processes.
export const runNode = (script, args = [], { timeoutMs = 20 * 60 * 1000 } = {}) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
        cwd: projectRoot,
        env: buildEnvironment,
        stdio: 'inherit',
        windowsHide: true,
    });
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        if (process.platform === 'win32' && Number.isInteger(child.pid) && child.pid > 0) {
            execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {
                if (child.exitCode === null)
                    child.kill();
            });
        }
        else {
            child.kill('SIGKILL');
        }
    }, timeoutMs);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => {
        clearTimeout(timer);
        if (timedOut)
            reject(new Error(`Community build step timed out after ${timeoutMs} ms.`));
        else if (code === 0)
            resolve();
        else
            reject(new Error(`Community build step failed (${code}).`));
    });
});
const main = async () => {
    if (process.argv.includes('--print-config')) {
        console.info(JSON.stringify({ edition: 'community', backendBundled: false, bootstrapper: false, ...configuration }, null, 2));
        return;
    }
    const viteCli = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
    const builderCli = path.join(path.dirname(require.resolve('electron-builder/package.json')), 'cli.js');
    await runNode(viteCli, ['build']);
    for (const legacyAsset of ['logo.ico', 'logo.png', 'intro.mp4', 'installer']) {
        if (existsSync(path.join(projectRoot, 'dist', legacyAsset))) {
            throw new Error(`Community output includes a legacy asset without established redistribution rights: ${legacyAsset}`);
        }
    }
    await runNode(path.join(projectRoot, 'scripts/assert-client-artifacts-clean.mjs'), ['dist']);
    const args = ['--win', '--x64', '--config', 'scripts/electron-builder.community.cjs', '--publish', 'never'];
    if (process.argv.includes('--dir'))
        args.push('--dir');
    if (process.argv.includes('--signed'))
        args.push('-c.forceCodeSigning=true', '-c.win.signAndEditExecutable=true');
    await runNode(builderCli, args);
};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(`[community-build] ${error.message}`);
        process.exitCode = 1;
    });
}
