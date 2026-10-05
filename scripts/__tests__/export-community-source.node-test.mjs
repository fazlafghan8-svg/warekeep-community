import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { exportCommunitySource, ROOT_FILES } from '../export-community-source.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturesParent = path.join(repository, 'artifacts', 'source-export');
fs.mkdirSync(fixturesParent, { recursive: true });

function write(root, filename, contents) {
  const target = path.join(root, filename);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, { flag: 'wx' });
}

function fixture() {
  const root = fs.mkdtempSync(path.join(fixturesParent, 'export-test-'));
  for (const filename of ROOT_FILES) {
    const contents = filename === 'package.json'
      ? JSON.stringify({ name: 'private-app', version: '0.0.1', dependencies: {}, devDependencies: {}, scripts: { deploy: 'do-not-export' } })
      : filename === 'package-lock.json'
        ? JSON.stringify({ name: 'private-app', version: '0.0.1', lockfileVersion: 3, packages: { '': {} } })
        : filename === 'index.html'
          ? '<script type="module" src="/src/index.tsx"></script>\n'
        : '';
    write(root, filename, contents);
  }
  write(root, 'src/index.ts', 'export const sample = true;\n');
  write(root, 'src/index.community.tsx', "import './index';\n");
  write(root, 'electron/main.js', 'export const sample = true;\n');
  return root;
}

function importFixtureSource(root, filename) {
  assert.ok(filename.startsWith('src/'));
  const relative = './' + filename.slice('src/'.length);
  fs.appendFileSync(path.join(root, 'src/index.community.tsx'), `import ${JSON.stringify(relative)};\n`);
}

test('only publishes allowlisted source into distinct snapshots and preserves originals', () => {
  const root = fixture();
  for (const filename of ['.git/config', '.env', 'backend/.env', 'exports/customers.json', 'runtime/session.json', 'deploy/bundle.zip', 'docs/WAREKEEP_CHAT_ARCHIVE_FA.md', 'build/LICENSE.txt', 'src/obj/state.ts', 'src/data.json', 'src/AdminApp.tsx', 'src/index.tsx', 'src/components/admin/AdminControlPlaneApp.tsx', 'src/components/installer/WareKeepInstallerMockup.tsx', 'src/services/adminDiagnosticsService.ts', 'electron/bin/session.js']) {
    write(root, filename, 'private-fixture-marker');
  }
  const packageBefore = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  const first = exportCommunitySource(root);
  const second = exportCommunitySource(root);
  assert.equal(first.report.status, 'manual_review_required');
  assert.notEqual(first.output, second.output);
  assert.ok(first.output.startsWith(path.join(root, 'artifacts', 'source-export') + path.sep));
  const paths = first.manifest.map((file) => file.path);
  assert.ok(paths.includes('src/index.ts'));
  assert.ok(paths.includes('scripts/build-community-desktop.mjs'));
  assert.ok(paths.includes('scripts/smoke-community-desktop.mjs'));
  assert.ok(paths.includes('e2e/community-offline.spec.ts'));
  assert.ok(paths.includes('playwright.community.config.ts'));
  assert.ok(paths.includes('docs/FIRST_STEPS.md'));
  assert.ok(paths.includes('.github/workflows/community-ci.yml'));
  assert.ok(paths.includes('THIRD_PARTY_DEPENDENCIES.md'));
  assert.ok(paths.includes('scripts/generate-dependency-notices.mjs'));
  assert.ok(paths.includes('scripts/third-party-license-overrides/victory-vendor-LICENSE.txt'));
  assert.ok(paths.includes('public-community/favicon.svg'));
  assert.ok(!paths.some((file) => file.startsWith('public/')));
  assert.ok(!paths.some((file) => /^(?:\.git\/|\.env|backend\/|exports\/|runtime\/|deploy\/|build\/)/.test(file)));
  assert.ok(!paths.includes('docs/WAREKEEP_CHAT_ARCHIVE_FA.md'));
  assert.ok(!paths.includes('src/obj/state.ts'));
  assert.ok(!paths.includes('src/data.json'));
  assert.ok(!paths.includes('src/AdminApp.tsx'));
  assert.ok(!paths.includes('src/index.tsx'));
  assert.ok(!paths.includes('src/components/admin/AdminControlPlaneApp.tsx'));
  assert.ok(!paths.includes('src/components/installer/WareKeepInstallerMockup.tsx'));
  assert.ok(!paths.includes('src/services/adminDiagnosticsService.ts'));
  assert.ok(!paths.includes('electron/bin/session.js'));
  assert.equal(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), packageBefore);
  assert.equal(JSON.parse(fs.readFileSync(path.join(first.output, 'source/package.json'), 'utf8')).scripts.deploy, undefined);
  assert.equal(JSON.parse(fs.readFileSync(path.join(first.output, 'source/package.json'), 'utf8')).scripts['test:community:desktop'], 'node scripts/smoke-community-desktop.mjs');
  assert.match(fs.readFileSync(path.join(first.output, 'source/index.html'), 'utf8'), /src="\/src\/index\.community\.tsx"/);
  assert.doesNotMatch(fs.readFileSync(path.join(first.output, 'source/index.html'), 'utf8'), /src="\/src\/index\.tsx"/);
  assert.equal(fs.readFileSync(path.join(root, '.env'), 'utf8'), 'private-fixture-marker');
});

test('blocks credential-shaped source and reports paths without values', () => {
  const root = fixture();
  const synthetic = 'sk-' + 'Z'.repeat(32);
  write(root, 'src/unsafe.ts', `export const sample = '${synthetic}';\n`);
  importFixtureSource(root, 'src/unsafe.ts');
  const result = exportCommunitySource(root);
  assert.equal(result.report.status, 'blocked');
  assert.deepEqual(result.report.sensitivePaths, ['src/unsafe.ts']);
  assert.ok(!fs.existsSync(path.join(result.output, 'source')));
  assert.ok(!fs.readFileSync(path.join(result.output, 'SCAN_REPORT.json'), 'utf8').includes(synthetic));
  assert.ok(!fs.readFileSync(path.join(result.output, 'EXPORT_MANIFEST.json'), 'utf8').includes(synthetic));
});

test('preserves Node engines and a scoped security override without exposing private package metadata', () => {
  const root = fixture();
  const packagePath = path.join(root, 'package.json');
  const lockPath = path.join(root, 'package-lock.json');
  const engines = { node: '>=24.0.0', npm: '>=11.0.0' };
  const overrides = { 'app-builder-lib': { '@electron/get': '5.1.0' } };
  const metadata = {
    ...JSON.parse(fs.readFileSync(packagePath, 'utf8')),
    engines,
    overrides,
    devDependencies: { 'app-builder-lib': '26.4.0' },
    author: { name: 'Private author', email: 'private@example.test' },
    email: 'private@example.test',
    publishConfig: { registry: 'https://private.example.test' },
    scripts: { deploy: 'private-deploy', 'backend:start': 'private-backend' },
  };
  const lock = {
    ...JSON.parse(fs.readFileSync(lockPath, 'utf8')),
    packages: {
      '': { name: metadata.name, version: metadata.version, engines, author: metadata.author, devDependencies: metadata.devDependencies },
      'node_modules/app-builder-lib': { version: '26.4.0', dependencies: { '@electron/get': '^3.0.0' }, dev: true },
      'node_modules/@electron/get': { version: '5.1.0', dev: true },
    },
  };
  fs.writeFileSync(packagePath, JSON.stringify(metadata));
  fs.writeFileSync(lockPath, JSON.stringify(lock));
  const packageBefore = fs.readFileSync(packagePath, 'utf8');
  const lockBefore = fs.readFileSync(lockPath, 'utf8');
  const first = exportCommunitySource(root);
  const second = exportCommunitySource(path.join(first.output, 'source'));
  for (const result of [first, second]) {
    assert.equal(result.report.status, 'manual_review_required');
    const published = JSON.parse(fs.readFileSync(path.join(result.output, 'source/package.json'), 'utf8'));
    const publishedLock = JSON.parse(fs.readFileSync(path.join(result.output, 'source/package-lock.json'), 'utf8'));
    assert.deepEqual(published.engines, engines);
    assert.deepEqual(published.overrides, overrides);
    assert.deepEqual(publishedLock.packages[''].engines, engines);
    assert.equal(publishedLock.packages['node_modules/@electron/get'].version, '5.1.0');
    for (const field of ['author', 'email', 'publishConfig']) assert.equal(Object.hasOwn(published, field), false, field);
    assert.equal(Object.hasOwn(publishedLock.packages[''], 'author'), false);
    assert.equal(published.scripts.deploy, undefined);
    assert.equal(published.scripts['backend:start'], undefined);
    assert.equal(published.scripts['electron:build'], 'node scripts/build-community-desktop.mjs');
  }
  assert.equal(fs.readFileSync(packagePath, 'utf8'), packageBefore);
  assert.equal(fs.readFileSync(lockPath, 'utf8'), lockBefore);
});

test('copies the Community license to the publication root without copying a mixed-checkout license', () => {
  const root = fixture();
  write(root, 'community-publication/LICENSE', 'Apache License\nVersion 2.0\n');
  write(root, 'LICENSE', 'commercial-license-marker');
  const result = exportCommunitySource(root);
  assert.equal(result.report.licensePresent, true);
  assert.equal(fs.readFileSync(path.join(result.output, 'source/LICENSE'), 'utf8'), 'Apache License\nVersion 2.0\n');
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.output, 'source/package.json'), 'utf8')).license, 'Apache-2.0');
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.output, 'source/package-lock.json'), 'utf8')).packages[''].license, 'Apache-2.0');
  assert.ok(!result.manifest.some((file) => file.path === 'community-publication/LICENSE'));
});

test('re-exporting a licensed public snapshot preserves its license and metadata', () => {
  const root = fixture();
  const license = 'Apache License\nVersion 2.0\n';
  write(root, 'community-publication/LICENSE', license);
  const first = exportCommunitySource(root);
  const publicSource = path.join(first.output, 'source');
  assert.ok(!fs.existsSync(path.join(publicSource, 'community-publication/LICENSE')));
  const second = exportCommunitySource(publicSource);
  assert.equal(second.report.licensePresent, true);
  assert.equal(fs.readFileSync(path.join(second.output, 'source/LICENSE'), 'utf8'), license);
  assert.equal(JSON.parse(fs.readFileSync(path.join(second.output, 'source/package.json'), 'utf8')).license, 'Apache-2.0');
  assert.equal(JSON.parse(fs.readFileSync(path.join(second.output, 'source/package-lock.json'), 'utf8')).packages[''].license, 'Apache-2.0');
});

test('keeps optional legal notices unchanged in the original export and a public re-export', () => {
  const root = fixture();
  const notices = {
    NOTICE: 'Community copyright and attribution notice.\n',
    'THIRD_PARTY_NOTICES.md': '# Third-party notices\nLocal font attribution and license text.\n',
  };
  for (const [filename, contents] of Object.entries(notices)) write(root, filename, contents);
  const first = exportCommunitySource(root);
  assert.equal(first.report.status, 'manual_review_required');
  const second = exportCommunitySource(path.join(first.output, 'source'));
  assert.equal(second.report.status, 'manual_review_required');
  for (const [filename, contents] of Object.entries(notices)) {
    for (const result of [first, second]) {
      assert.ok(result.manifest.some(file => file.path === filename), filename);
      assert.equal(fs.readFileSync(path.join(result.output, 'source', filename), 'utf8'), contents);
    }
    assert.equal(fs.readFileSync(path.join(root, filename), 'utf8'), contents);
  }
});

test('does not inherit a root license unless both package metadata and text identify Apache-2.0', () => {
  for (const [metadataLicense, licenseText] of [
    [undefined, 'Apache License\nVersion 2.0\n'],
    ['UNLICENSED', 'commercial-license-marker'],
    ['Apache-2.0', 'commercial-license-marker'],
  ]) {
    const root = fixture();
    const packagePath = path.join(root, 'package.json');
    const metadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (metadataLicense) metadata.license = metadataLicense;
    fs.writeFileSync(packagePath, JSON.stringify(metadata));
    write(root, 'LICENSE', licenseText);
    const result = exportCommunitySource(root);
    assert.equal(result.report.licensePresent, false);
    assert.ok(!fs.existsSync(path.join(result.output, 'source/LICENSE')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(result.output, 'source/package.json'), 'utf8')).license, undefined);
    assert.equal(JSON.parse(fs.readFileSync(path.join(result.output, 'source/package-lock.json'), 'utf8')).packages[''].license, undefined);
  }
});

test('blocks source imports whose dependency is omitted from the allowlist', () => {
  const root = fixture();
  write(root, 'src/missing.ts', "import '../backend/private.js';\n");
  importFixtureSource(root, 'src/missing.ts');
  const result = exportCommunitySource(root);
  assert.equal(result.report.status, 'blocked');
  assert.deepEqual(result.report.missingImportPaths, ['src/missing.ts']);
  assert.ok(!fs.existsSync(path.join(result.output, 'source')));
});

test('blocks a missing worker referenced by a URL relative to import.meta.url', () => {
  const root = fixture();
  write(root, 'src/workerClient.ts', "export const createWorker = () => new Worker(new URL('./workers/missing.worker.ts', import.meta.url), { type: 'module' });\n");
  importFixtureSource(root, 'src/workerClient.ts');
  const result = exportCommunitySource(root);
  assert.equal(result.report.status, 'blocked');
  assert.equal(result.report.sourceWritten, false);
  assert.deepEqual(result.report.missingImportPaths, ['src/workerClient.ts']);
  assert.ok(!fs.existsSync(path.join(result.output, 'source')));
});

test('blocks a forbidden commercial runtime module that is still reachable and actually used', () => {
  const root = fixture();
  const privateFile = 'src/services/supabaseClient.ts';
  const marker = 'retained-commercial-runtime-fixture';
  write(root, privateFile, `export const commercialClient = () => ${JSON.stringify(marker)};\n`);
  fs.appendFileSync(path.join(root, 'src/index.community.tsx'), "import { commercialClient } from './services/supabaseClient'; export const usedRuntime = commercialClient();\n");
  const result = exportCommunitySource(root);
  assert.equal(result.report.status, 'blocked');
  assert.equal(result.report.sourceWritten, false);
  assert.deepEqual(result.report.forbiddenPublicPaths, [privateFile]);
  assert.deepEqual(result.report.missingImportPaths, []);
  assert.deepEqual(result.report.sensitivePaths, []);
  assert.ok(result.manifest.some(file => file.path === privateFile), 'the forbidden module must truly be retained in the candidate graph');
  assert.ok(!fs.existsSync(path.join(result.output, 'source')));
  assert.ok(!fs.readFileSync(path.join(result.output, 'SCAN_REPORT.json'), 'utf8').includes(marker));
  assert.match(fs.readFileSync(path.join(root, privateFile), 'utf8'), /retained-commercial-runtime-fixture/);
});

test('checks actual imports while ignoring examples inside strings and comments', () => {
  const root = fixture();
  write(root, 'src/examples.ts', [
    '// import "../backend/private.js";',
    'export const documentation = `import("../backend/private.js")`;',
    'export const local = import("./index.ts");',
  ].join('\n'));
  importFixtureSource(root, 'src/examples.ts');
  const result = exportCommunitySource(root);
  assert.equal(result.report.status, 'manual_review_required');
  assert.deepEqual(result.report.missingImportPaths, []);
});

test('blocks re-exports of files excluded from the source snapshot', () => {
  const root = fixture();
  write(root, 'src/reexport.ts', "export { privateValue } from '../backend/private.js';\n");
  importFixtureSource(root, 'src/reexport.ts');
  const result = exportCommunitySource(root);
  assert.equal(result.report.status, 'blocked');
  assert.deepEqual(result.report.missingImportPaths, ['src/reexport.ts']);
});

test('rejects an output directory junction before writing outside the snapshot root', (context) => {
  const root = fixture();
  const external = fs.mkdtempSync(path.join(fixturesParent, 'export-junction-target-'));
  try {
    fs.symlinkSync(external, path.join(root, 'artifacts'), 'junction');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'ENOTSUP') return context.skip('Junctions are unavailable on this filesystem.');
    throw error;
  }
  assert.throws(() => exportCommunitySource(root), /Unsafe output directory/);
  assert.deepEqual(fs.readdirSync(external), []);
});
