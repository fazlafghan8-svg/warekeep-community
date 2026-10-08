import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { applyCommunityOverrides, prepareCommunitySharedSources, selectCommunityDependencies, sourceImports, forbiddenPublicPaths } from './community-publication-scope.mjs';
import { specializeCommunitySources } from './community-source-specialization.mjs';
import { prepareCommunityPublicationPackage } from './community-publication-package.mjs';
import { prepareCommunityMedicineSources } from './community-medicine-publication.mjs';
// This is a source snapshot, not a Git export. Never traverse repository history.
// Keep the allowlist explicit; newly added runtime assets need a reviewed entry.
export const ROOT_FILES = Object.freeze([
    'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'THIRD_PARTY_DEPENDENCIES.md', 'index.html',
    'package.json', 'package-lock.json', 'vite.config.ts', 'vitest.config.ts',
    'playwright.community.config.ts', 'e2e/community-offline.spec.ts',
    'tsconfig.json', 'tsconfig.node.json', 'postcss.config.js', 'tailwind.config.js',
    'tailwind.legacy-theme.mjs', 'TAILWIND_LEGACY_THEME_LICENSE.txt',
    '.editorconfig', '.eslintrc.cjs', '.eslintignore',
    '.github/workflows/community-ci.yml',
    'docs/OPEN_SOURCE_STEPS.md', 'docs/FIRST_STEPS.md',
    'docs/COMMUNITY_LICENSE.md', 'docs/OPEN_SOURCE_SCOPE.md',
    'docs/WINDOWS_INSTALL.md',
    'docs/images/dashboard.png', 'docs/images/inventory.png',
    'scripts/export-community-source.mjs',
    'scripts/community-publication-scope.mjs',
    'scripts/community-source-specialization.mjs',
    'scripts/community-medicine-publication.mjs',
    'scripts/__tests__/community-medicine-publication.node-test.mjs',
    'scripts/community-publication-package.mjs',
    'scripts/__tests__/community-publication-package.node-test.mjs',
    'scripts/__tests__/community-source-specialization.node-test.mjs',
    'scripts/__tests__/community-publication-scope.node-test.mjs',
    'scripts/generate-dependency-notices.mjs',
    'scripts/third-party-license-overrides/victory-vendor-LICENSE.txt',
    'scripts/build-community-desktop.mjs', 'scripts/electron-builder.community.cjs',
    'scripts/__tests__/buildDeadline.test.mjs',
    'scripts/tailwind-v3-cascade.mjs', 'scripts/__tests__/tailwindCascade.test.mjs',
    'scripts/smoke-community-desktop.mjs',
    'scripts/assert-client-artifacts-clean.mjs',
    'scripts/__tests__/communityBuild.test.mjs',
    'scripts/__tests__/export-community-source.node-test.mjs',
    'public-community/favicon.svg',
    'public-community/fonts/Vazirmatn-variable.woff2',
]);
const COMMUNITY_LICENSE_SOURCE = 'community-publication/LICENSE';
const OPTIONAL_LEGAL_FILES = ['NOTICE', 'THIRD_PARTY_NOTICES.md'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.svg', '.woff', '.woff2']);
const BLOCKED_SEGMENTS = new Set([
    '.git', '.hg', '.svn', 'node_modules', 'bin', 'obj', 'dist', 'dist-admin',
    'artifacts', 'exports', 'runtime', 'customer-data', 'customer_data', 'backups',
    'storage', 'logs', 'deploy', 'release', 'audit', 'audits', 'chat-archives',
    'admin', 'installer',
]);
const EXCLUDED_TESTS = new Set([
    'src/__tests__/runElectronBuild.test.ts',
    'src/__tests__/verifyReleaseBackendConfig.test.ts',
    'src/services/__tests__/adminDiagnosticsService.test.ts',
    'src/services/__tests__/frontendRuntime.guard.test.ts',
    'src/services/__tests__/controlPlaneService.guard.test.ts',
    'src/services/__tests__/syncClientV2.coverage.test.ts',
]);
const EXCLUDED_SOURCE_FILES = new Set([
    'src/AdminApp.tsx',
    'src/index.tsx',
    'src/services/adminDiagnosticsService.ts',
]);
const SECRET_SHAPES = [
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
    /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}|gsk_[A-Za-z0-9]{24,}|sb_secret_[A-Za-z0-9_-]{16,})\b/,
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AIza[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16})\b/,
    /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{12,}\b/,
    /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?):\/\/[^\s"'<>/:]+:[^\s"'<>@]+@/i,
    /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|jwt[_-]?secret)\s*["']?\s*[:=]\s*["'][A-Za-z0-9_+/=.-]{24,}["']/i,
];
const BINARY_EXTENSIONS = new Set(['.png', '.ico', '.mp4', '.woff', '.woff2']);
const PUBLIC_SCRIPTS = {
    dev: 'cross-env VITE_APP_EDITION=community vite',
    'dev:frontend': 'npm run dev',
    build: 'cross-env VITE_APP_EDITION=community vite build',
    preview: 'vite preview',
    lint: 'eslint --ext .ts,.tsx,.js src electron e2e vite.config.ts vitest.config.ts playwright.community.config.ts',
    typecheck: 'tsc --noEmit',
    'test:unit': 'vitest run --config vitest.config.ts',
    'test:community:build': 'vitest run --config vitest.config.ts electron/communityPolicy.test.js scripts/__tests__/communityBuild.test.mjs',
    'test:community:desktop': 'node scripts/smoke-community-desktop.mjs',
    'test:source-export': 'node --test scripts/__tests__/export-community-source.node-test.mjs scripts/__tests__/community-source-specialization.node-test.mjs scripts/__tests__/community-publication-scope.node-test.mjs scripts/__tests__/community-publication-package.node-test.mjs scripts/__tests__/community-medicine-publication.node-test.mjs',
    'verify:dependency-notices': 'node scripts/generate-dependency-notices.mjs --check',
    'test:e2e:community': 'playwright test --config playwright.community.config.ts',
    'verify:artifacts': 'node scripts/assert-client-artifacts-clean.mjs',
    'electron:dev': 'concurrently -k "npm run dev" "npm run electron:start"',
    'electron:start': 'wait-on http://127.0.0.1:5175 && electron .',
    'electron:build': 'node scripts/build-community-desktop.mjs',
    'electron:build:dir': 'node scripts/build-community-desktop.mjs --dir',
    'source:export': 'node scripts/export-community-source.mjs',
};
const PUBLIC_IGNORE = [
    'node_modules/', 'dist/', 'dist-admin/', 'release/', 'artifacts/', 'coverage/',
    'test-results/', 'playwright-report/', '*.log', '.env', '.env.*', '*.local',
    '*.key', '*.pem', '*.p12', '*.pfx', '*.zip', '**/bin/', '**/obj/',
    'backups/', 'exports/', 'runtime/', 'customer-data/', '.DS_Store', '.idea/', '.vscode/',
].join('\n') + '\n';
const slash = (value) => value.split(path.sep).join('/');
const serialize = (value) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const isInside = (root, target) => {
    const relative = path.relative(root, target);
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};
function safePath(root, relative, { optional = false } = {}) {
    const target = path.resolve(root, relative);
    if (!isInside(root, target) || path.isAbsolute(relative))
        throw new Error('Unsafe source path.');
    let current = root;
    for (const segment of relative.split(/[\\/]/)) {
        current = path.join(current, segment);
        if (!fs.existsSync(current)) {
            if (optional)
                return null;
            throw new Error(`Required source file is missing: ${relative}`);
        }
        if (fs.lstatSync(current).isSymbolicLink())
            throw new Error(`Symbolic link is not allowed: ${relative}`);
    }
    if (!isInside(root, fs.realpathSync(target)))
        throw new Error(`Path leaves source root: ${relative}`);
    return target;
}
function collectSources(root, relative, files, excluded) {
    const directory = safePath(root, relative);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const next = `${relative}/${entry.name}`;
        if (entry.isSymbolicLink())
            throw new Error(`Symbolic link is not allowed: ${next}`);
        if (BLOCKED_SEGMENTS.has(entry.name.toLowerCase()) || entry.name.toLowerCase().startsWith('.env') || EXCLUDED_TESTS.has(next) || EXCLUDED_SOURCE_FILES.has(next)) {
            excluded.push(next);
            continue;
        }
        if (entry.isDirectory())
            collectSources(root, next, files, excluded);
        else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
            files.add(next);
        else
            excluded.push(next);
    }
}
export function scanSource(contents) {
    return SECRET_SHAPES.some((rule) => rule.test(contents));
}
function publicPackage(contents, licensePresent) {
    const original = JSON.parse(contents);
    return {
        name: 'warekeep-community', private: true, version: original.version,
        type: 'module', main: 'electron/main.js', warekeepEdition: 'community',
        description: 'Offline inventory, sales, purchases, and local accounts for pharmacies and small businesses.',
        ...(licensePresent ? { license: 'Apache-2.0' } : {}),
        ...(Object.hasOwn(original, 'engines') ? { engines: original.engines } : {}),
        ...(Object.hasOwn(original, 'overrides') ? { overrides: original.overrides } : {}),
        scripts: PUBLIC_SCRIPTS,
        build: { extends: './scripts/electron-builder.community.cjs' },
        dependencies: original.dependencies,
        devDependencies: original.devDependencies,
    };
}
// Check static relative imports before copying. Asset paths and dynamic filesystem
// reads still require a build and manual verification from the exported source.
function missingImports(contents) {
    const missing = new Set();
    for (const [filename, data] of contents) {
        if (!/\.(?:[cm]?js|jsx|tsx?)$/.test(filename))
            continue;
        const sourceFile = ts.createSourceFile(filename, data.toString('utf8'), ts.ScriptTarget.Latest, true);
        const specifiers = new Set();
        const collect = (node) => {
            if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
                specifiers.add(node.moduleSpecifier.text);
            }
            else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) {
                specifiers.add(node.moduleReference.expression.text);
            }
            else if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
                specifiers.add(node.arguments[0].text);
            }
            ts.forEachChild(node, collect);
        };
        collect(sourceFile);
        for (const specifier of sourceImports(filename, data))
            specifiers.add(specifier);
        for (const imported of specifiers) {
            const specifier = imported.split('?')[0];
            if (!specifier.startsWith('.') && !specifier.startsWith('@/'))
                continue;
            const normalized = specifier.startsWith('@/') ? `src/${specifier.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(filename), specifier));
            const candidates = [normalized, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '/index.ts', '/index.tsx', '/index.js'].map((extension) => normalized + extension)];
            if (!candidates.some((candidate) => contents.has(candidate)))
                missing.add(filename);
        }
    }
    return [...missing].sort();
}
function newOutputDirectory(root) {
    let current = root;
    for (const segment of ['artifacts', 'source-export']) {
        current = path.join(current, segment);
        if (!fs.existsSync(current))
            fs.mkdirSync(current);
        if (!fs.lstatSync(current).isDirectory() || fs.lstatSync(current).isSymbolicLink() || !isInside(root, fs.realpathSync(current))) {
            throw new Error('Unsafe output directory.');
        }
    }
    const output = path.join(current, `community-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
    fs.mkdirSync(output); // No recursive creation or overwrite of an existing snapshot.
    return output;
}
export function exportCommunitySource(projectRoot) {
    const root = fs.realpathSync(projectRoot);
    const candidates = new Set(ROOT_FILES);
    const excluded = [...EXCLUDED_TESTS];
    let communityLicense = safePath(root, COMMUNITY_LICENSE_SOURCE, { optional: true });
    for (const legalFile of OPTIONAL_LEGAL_FILES)
        if (safePath(root, legalFile, { optional: true }))
            candidates.add(legalFile);
    collectSources(root, 'src', candidates, excluded);
    collectSources(root, 'electron', candidates, excluded);
    let contents = new Map();
    for (const filename of [...candidates].sort()) {
        const source = safePath(root, filename);
        if (!fs.statSync(source).isFile())
            throw new Error(`Expected a source file: ${filename}`);
        contents.set(filename, fs.readFileSync(source));
    }
    contents = applyCommunityOverrides(root, contents);
    contents = prepareCommunityMedicineSources(contents);
    contents = prepareCommunitySharedSources(contents);
    contents = specializeCommunitySources(contents, { dropUnusedImportModules: true, assumePropertyReadsPure: true });
    const publicGraph = selectCommunityDependencies(contents, [...ROOT_FILES, ...OPTIONAL_LEGAL_FILES]);
    contents = publicGraph.contents;
    excluded.push(...publicGraph.excluded);
    const html = contents.get('index.html').toString('utf8');
    if (!html.includes('src="/src/index.tsx"') && !html.includes('src="/src/index.community.tsx"')) {
        throw new Error('Expected Community HTML entry marker.');
    }
    contents.set('index.html', Buffer.from(html.replace('src="/src/index.tsx"', 'src="/src/index.community.tsx"')));
    // A published snapshot has its license at the root. Preserve it when exporting
    // again, while refusing to inherit the mixed checkout's commercial license.
    if (!communityLicense && JSON.parse(contents.get('package.json').toString('utf8')).license === 'Apache-2.0') {
        const publicationLicense = safePath(root, 'LICENSE', { optional: true });
        if (publicationLicense && /Apache License\s+Version 2\.0/i.test(fs.readFileSync(publicationLicense, 'utf8'))) {
            communityLicense = publicationLicense;
        }
    }
    if (communityLicense) {
        const licenseText = fs.readFileSync(communityLicense);
        if (!/Apache License\s+Version 2\.0/i.test(licenseText.toString('utf8')))
            throw new Error('Expected Apache-2.0 community license text.');
        contents.set('LICENSE', licenseText);
    }
    const metadata = publicPackage(contents.get('package.json').toString('utf8'), contents.has('LICENSE'));
    const lock = JSON.parse(contents.get('package-lock.json').toString('utf8'));
    if (lock.lockfileVersion !== 3 || !lock.packages?.[''])
        throw new Error('Expected a v3 package lock.');
    lock.name = metadata.name;
    lock.version = metadata.version;
    lock.packages[''] = {
        name: metadata.name, version: metadata.version,
        ...(metadata.license ? { license: metadata.license } : {}),
        ...(Object.hasOwn(metadata, 'engines') ? { engines: metadata.engines } : {}),
        dependencies: metadata.dependencies, devDependencies: metadata.devDependencies,
    };
    const publicationPackage = prepareCommunityPublicationPackage(metadata, lock);
    contents.set('package.json', serialize(publicationPackage.packageJson));
    contents.set('package-lock.json', serialize(publicationPackage.packageLock));
    contents.set('.gitignore', Buffer.from(PUBLIC_IGNORE));
    const sensitivePaths = [];
    const binaryReviewPaths = [];
    const externalReferencePaths = [];
    for (const [filename, data] of contents) {
        if (BINARY_EXTENSIONS.has(path.extname(filename).toLowerCase())) {
            binaryReviewPaths.push(filename);
            continue;
        }
        const text = data.toString('utf8');
        if (scanSource(text))
            sensitivePaths.push(filename);
        if (/https?:\/\//i.test(text))
            externalReferencePaths.push(filename);
    }
    const missingImportPaths = missingImports(contents);
    const forbiddenPaths = forbiddenPublicPaths(contents);
    const blocked = sensitivePaths.length > 0 || missingImportPaths.length > 0 || forbiddenPaths.length > 0;
    const output = newOutputDirectory(root);
    const manifest = [...contents].sort(([a], [b]) => a.localeCompare(b)).map(([filename, data]) => ({
        path: filename, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'),
    }));
    const report = {
        schemaVersion: 1,
        status: blocked ? 'blocked' : 'manual_review_required',
        sourceWritten: !blocked,
        licensePresent: contents.has('LICENSE'),
        sensitivePaths, missingImportPaths, forbiddenPublicPaths: forbiddenPaths, binaryReviewPaths, externalReferencePaths,
        excludedPathsInsideAllowedTrees: [...new Set(excluded)].sort(),
        scope: 'Community overrides and reachable offline source only. Git history and excluded directories were not read.',
        limitations: ['Pattern scan is not proof of absence of sensitive data.', 'Binary contents require manual review.', 'Builds and application tests have not been run by this exporter.', 'Legal and publication review remain required.'],
    };
    fs.writeFileSync(path.join(output, 'SCAN_REPORT.json'), serialize(report), { flag: 'wx' });
    fs.writeFileSync(path.join(output, 'EXPORT_MANIFEST.json'), serialize({ schemaVersion: 1, files: manifest }), { flag: 'wx' });
    if (!blocked) {
        const sourceOutput = path.join(output, 'source');
        fs.mkdirSync(sourceOutput);
        for (const [filename, data] of contents) {
            const target = path.join(sourceOutput, filename);
            if (!isInside(sourceOutput, target))
                throw new Error('Unsafe export path.');
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, data, { flag: 'wx' });
        }
    }
    return { output, report, manifest };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        if (process.argv.length > 2)
            throw new Error('This command does not accept an output path or other arguments.');
        const result = exportCommunitySource(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
        console.info(`[source-export] ${result.report.status}`);
        console.info(slash(result.output));
        // Only paths, never source snippets, secret values, or scan matches.
        for (const filename of new Set([...result.report.sensitivePaths, ...result.report.missingImportPaths, ...result.report.forbiddenPublicPaths]))
            console.error(filename);
        if (result.report.status === 'blocked')
            process.exitCode = 1;
    }
    catch (error) {
        // Do not dump stack traces or third-party parser errors containing source text.
        console.error('[source-export] Failed before a complete source snapshot was written.');
        if (error instanceof Error && /^(?:Unsafe |Required source file is missing: |Symbolic link is not allowed: |Path leaves source root: |Expected |This command )/.test(error.message))
            console.error(error.message);
        process.exitCode = 1;
    }
}
