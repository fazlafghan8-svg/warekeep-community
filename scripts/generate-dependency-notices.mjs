import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
// Produce a reviewable inventory from the locked production dependency graph.
// This command never fetches licenses at generation time. Run `npm ci` first.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = path.join(root, 'package-lock.json');
const outputPath = path.join(root, 'THIRD_PARTY_DEPENDENCIES.md');
const licenseNamePattern = /^(?:LICENSE|LICENCE|COPYING)(?:\.[A-Za-z0-9_-]+)?$/i;
const noticeNamePattern = /^NOTICE(?:\.[A-Za-z0-9_-]+)?$/i;
function readText(filename) {
    return fs.readFileSync(filename, 'utf8').replace(/\r\n?/g, '\n').replace(/\n*$/, '\n');
}
function fenced(text) {
    const runs = [...text.matchAll(/`+/g)].map((match) => match[0].length);
    const fence = '`'.repeat(Math.max(4, ...runs.map((length) => length + 1)));
    return `${fence}text\n${text}${fence}\n`;
}
function packageIdentity(packagePath, metadata) {
    const name = metadata.name;
    const version = metadata.version;
    if (typeof name !== 'string' || typeof version !== 'string')
        throw new Error(`Package name or version is missing: ${packagePath}`);
    return `${name}@${version}`;
}
function installedPackage(packagePath, lockEntry) {
    if (!/^node_modules\/(?:@[^/]+\/)?[^/]+(?:\/node_modules\/(?:@[^/]+\/)?[^/]+)*$/.test(packagePath)) {
        throw new Error(`Unexpected package-lock path: ${packagePath}`);
    }
    const packageDir = path.join(root, ...packagePath.split('/'));
    if (!fs.existsSync(packageDir) || fs.lstatSync(packageDir).isSymbolicLink())
        throw new Error(`Package is not installed or is a symlink: ${packagePath}`);
    const metadata = JSON.parse(readText(path.join(packageDir, 'package.json')));
    const identity = packageIdentity(packagePath, metadata);
    if (metadata.version !== lockEntry.version)
        throw new Error(`Installed version differs from package-lock: ${identity}`);
    if (lockEntry.license && metadata.license && lockEntry.license !== metadata.license)
        throw new Error(`License metadata differs from package-lock: ${identity}`);
    const names = fs.readdirSync(packageDir).filter((name) => fs.statSync(path.join(packageDir, name)).isFile()).sort();
    const licenseNames = names.filter((name) => licenseNamePattern.test(name));
    const noticeNames = names.filter((name) => noticeNamePattern.test(name));
    const files = [...licenseNames, ...noticeNames].map((name) => ({
        source: `${packagePath}/${name}`,
        text: readText(path.join(packageDir, name)),
    }));
    let sourceNote = 'npm package';
    if (metadata.name?.startsWith('@supabase/') && metadata.name !== '@supabase/auth-js' && licenseNames.length === 0) {
        const sibling = path.join(root, 'node_modules', '@supabase', 'auth-js', 'LICENSE');
        files.push({ source: 'node_modules/@supabase/auth-js/LICENSE (same upstream monorepo)', text: readText(sibling) });
        sourceNote = 'Supabase monorepo license';
    }
    if (metadata.name === 'victory-vendor' && licenseNames.length === 0) {
        const upstreamLicense = path.join(root, 'scripts', 'third-party-license-overrides', 'victory-vendor-LICENSE.txt');
        files.push({ source: 'https://github.com/FormidableLabs/victory/blob/v36.9.2/LICENSE.txt', text: readText(upstreamLicense) });
        const vendorRoot = path.join(packageDir, 'lib-vendor');
        for (const item of fs.readdirSync(vendorRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
            const vendorDir = path.join(vendorRoot, item.name);
            for (const name of fs.readdirSync(vendorDir).filter((entry) => licenseNamePattern.test(entry)).sort()) {
                files.push({ source: `${packagePath}/lib-vendor/${item.name}/${name}`, text: readText(path.join(vendorDir, name)) });
            }
        }
        sourceNote = 'upstream release + vendored D3 licenses';
    }
    return {
        identity,
        license: metadata.license || lockEntry.license || 'unverified',
        packagePath,
        sourceNote,
        files,
    };
}
export function generateNotices() {
    const lock = JSON.parse(readText(lockPath));
    if (lock.lockfileVersion !== 3 || !lock.packages)
        throw new Error('Expected package-lock v3.');
    const packages = Object.entries(lock.packages)
        .filter(([packagePath, entry]) => packagePath && entry && !entry.dev)
        .map(([packagePath, entry]) => installedPackage(packagePath, entry))
        .sort((a, b) => a.identity.localeCompare(b.identity, 'en') || a.packagePath.localeCompare(b.packagePath, 'en'));
    const foundMissing = packages.filter((item) => item.files.length === 0);
    if (foundMissing.length)
        throw new Error(`Dependency lacks license text: ${foundMissing.map((item) => item.identity).join(', ')}`);
    const lines = [
        '# Third-party npm dependency notices', '',
        'Generated from `package-lock.json` and the installed packages after `npm ci` by `node scripts/generate-dependency-notices.mjs`.',
        'Use `node scripts/generate-dependency-notices.mjs --check` to verify that this file matches the lockfile and installed notices.', '',
        `The lockfile currently has ${packages.length} non-development package entries. This is a conservative dependency inventory; bundling and tree shaking can change which code appears in a particular executable.`,
        'This file reproduces available package license and copyright texts for every listed package. It is not a legal opinion.',
        'Build tools marked `dev` in the lockfile are downloaded by contributors but are not shipped as npm packages in the desktop runtime; this inventory does not reproduce their notices.',
        'Electron and Chromium notices are separate: verify that `LICENSE.electron.txt` and `LICENSES.chromium.html` accompany the packaged Electron application. The Vazirmatn font notice is in `THIRD_PARTY_NOTICES.md`.', '',
        '## Inventory', '',
        '| Package | Declared license | Notice source |',
        '| --- | --- | --- |',
    ];
    for (const item of packages) {
        lines.push(`| \`${item.identity}\` | ${item.license} | ${item.sourceNote} |`);
    }
    lines.push('', '## License and copyright texts', '');
    for (const item of packages) {
        if (item.files.length === 0)
            continue;
        lines.push(`### ${item.identity}`, '');
        for (const file of item.files) {
            const sha256 = createHash('sha256').update(file.text).digest('hex');
            lines.push(`Source: \`${file.source}\` (normalized text SHA-256: \`${sha256}\`).`, '', fenced(file.text), '');
        }
    }
    return lines.join('\n').replace(/\n+$/, '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const mode = process.argv[2];
    if (process.argv.length > 3 || (mode && mode !== '--check')) {
        console.error('Usage: node scripts/generate-dependency-notices.mjs [--check]');
        process.exitCode = 2;
    }
    else {
        try {
            const content = generateNotices();
            if (mode === '--check') {
                if (!fs.existsSync(outputPath) || readText(outputPath) !== content)
                    throw new Error('THIRD_PARTY_DEPENDENCIES.md is missing or stale. Regenerate it after npm ci.');
                console.log('Third-party npm dependency notices are current.');
            }
            else {
                fs.writeFileSync(outputPath, content, 'utf8');
                console.log('Wrote THIRD_PARTY_DEPENDENCIES.md.');
            }
        }
        catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    }
}
