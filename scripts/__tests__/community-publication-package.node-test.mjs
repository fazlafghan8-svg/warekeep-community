import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { prepareCommunityPublicationPackage, resolveLockedDependency } from '../community-publication-package.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sdk = '@supabase/supabase-js';
const nodePath = name => `node_modules/${name}`;
const locked = (overrides = {}) => ({ version: '1.2.3', resolved: 'https://registry.example.invalid/package.tgz', integrity: 'sha512-fixture', ...overrides });
const fixture = (metadata, packages) => ({ metadata, lock: { name: 'fixture', lockfileVersion: 3, requires: true, packages: { '': structuredClone(metadata), ...packages } } });
const bundleIntegrity = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;
const bundlePath = name => `node_modules/native/node_modules/${name}`;
function bundleFixture() {
  return fixture({ dependencies: { native: '^1' } }, {
    [nodePath('native')]: locked({ integrity: bundleIntegrity, cpu: ['wasm32'], os: ['linux'], bundleDependencies: ['@native/runtime'], dependencies: { '@native/runtime': '^1' } }),
    [bundlePath('@native/runtime')]: { version: '1.0.0', inBundle: true, license: 'MIT', dependencies: { leaf: '^1' }, peerDependencies: { helper: '^1' }, peerDependenciesMeta: { helper: { optional: true } } },
    [bundlePath('leaf')]: { version: '1.0.1', inBundle: true, license: 'MIT' },
    [bundlePath('helper')]: { version: '1.0.2', inBundle: true, license: 'MIT', optional: true, peer: true },
  });
}

test('removes the cloud root and its orphan tree while retaining shared dependencies, exact pins and hash-wasm', () => {
  const { metadata, lock } = fixture({ dependencies: { [sdk]: '^1', local: '^1', 'hash-wasm': '^1' } }, {
    [nodePath(sdk)]: locked({ dependencies: { 'cloud-auth': '^1', shared: '^1' } }),
    [nodePath('cloud-auth')]: locked({ dependencies: { 'cloud-only': '^1' } }),
    [nodePath('cloud-only')]: locked(),
    [nodePath('local')]: locked({ dependencies: { shared: '^1' } }),
    [nodePath('shared')]: locked(),
    [nodePath('hash-wasm')]: locked(),
  });
  const originalMetadata = structuredClone(metadata), originalLock = structuredClone(lock);
  const result = prepareCommunityPublicationPackage(metadata, lock);
  assert.equal(result.packageJson.dependencies[sdk], undefined);
  assert.equal(result.packageLock.packages[''].dependencies[sdk], undefined);
  assert.deepEqual(result.removedDependencies, [sdk]);
  assert.deepEqual(result.removedPackages, [nodePath(sdk), nodePath('cloud-auth'), nodePath('cloud-only')].sort());
  for (const name of ['local', 'shared', 'hash-wasm']) assert.deepEqual(result.packageLock.packages[nodePath(name)], lock.packages[nodePath(name)]);
  assert.deepEqual(metadata, originalMetadata);
  assert.deepEqual(lock, originalLock);
});

test('nested resolution retains the nearest locked copy and drops an orphan hoisted copy', () => {
  const { metadata, lock } = fixture({ dependencies: { [sdk]: '^1', '@local/application': '^1' } }, {
    [nodePath(sdk)]: locked({ dependencies: { shared: '^1' } }),
    [nodePath('shared')]: locked({ version: '1.0.0' }),
    [nodePath('@local/application')]: locked({ dependencies: { child: '^1' } }),
    'node_modules/@local/application/node_modules/child': locked({ dependencies: { shared: '^2' } }),
    'node_modules/@local/application/node_modules/shared': locked({ version: '2.0.0' }),
  });
  assert.equal(resolveLockedDependency(lock.packages, 'node_modules/@local/application/node_modules/child', 'shared'), 'node_modules/@local/application/node_modules/shared');
  const result = prepareCommunityPublicationPackage(metadata, lock);
  assert.equal(result.packageLock.packages[nodePath('shared')], undefined);
  assert.equal(result.packageLock.packages['node_modules/@local/application/node_modules/shared'].version, '2.0.0');
});

test('keeps required peers and optional platform dependencies while absent optional peers are allowed', () => {
  const { metadata, lock } = fixture({ dependencies: { [sdk]: '^1', ui: '^1' } }, {
    [nodePath(sdk)]: locked(),
    [nodePath('ui')]: locked({ peerDependencies: { react: '^1', 'optional-peer': '^1' }, peerDependenciesMeta: { 'optional-peer': { optional: true } }, optionalDependencies: { 'platform-native': '^1', 'unavailable-platform': '^1' } }),
    [nodePath('react')]: locked(),
    [nodePath('platform-native')]: locked({ os: ['linux'], cpu: ['arm64'], optional: true }),
  });
  const result = prepareCommunityPublicationPackage(metadata, lock);
  assert.equal(result.packageLock.packages[nodePath('react')].peer, true);
  assert.equal(result.packageLock.packages[nodePath('react')].dev, undefined);
  assert.equal(result.packageLock.packages[nodePath('platform-native')].optional, true);
  assert.deepEqual(result.packageLock.packages[nodePath('platform-native')].os, ['linux']);
});

test('reclassifies shared development packages and preserves the development/optional overlap', () => {
  const { metadata, lock } = fixture({ dependencies: { [sdk]: '^1' }, devDependencies: { build: '^1' }, optionalDependencies: { native: '^1' } }, {
    [nodePath(sdk)]: locked({ dependencies: { shared: '^1' } }),
    [nodePath('build')]: locked({ dev: true, dependencies: { shared: '^1', overlap: '^1' } }),
    [nodePath('native')]: locked({ optional: true, dependencies: { overlap: '^1' } }),
    [nodePath('shared')]: locked(),
    [nodePath('overlap')]: locked({ dependencies: { 'overlap-child': '^1' } }),
    [nodePath('overlap-child')]: locked(),
  });
  const result = prepareCommunityPublicationPackage(metadata, lock);
  assert.equal(result.packageLock.packages[nodePath('shared')].dev, true);
  for (const name of ['overlap', 'overlap-child']) {
    const entry = result.packageLock.packages[nodePath(name)];
    assert.equal(entry.dev, undefined);
    assert.equal(entry.optional, undefined);
    assert.equal(entry.devOptional, true);
  }
});

test('optional peers alone do not retain an orphan package and dependency cycles terminate', () => {
  const { metadata, lock } = fixture({ dependencies: { [sdk]: '^1', a: '^1' } }, {
    [nodePath(sdk)]: locked(),
    [nodePath('a')]: locked({ dependencies: { b: '^1' }, peerDependencies: { orphan: '^1' }, peerDependenciesMeta: { orphan: { optional: true } } }),
    [nodePath('b')]: locked({ dependencies: { a: '^1' } }),
    [nodePath('orphan')]: locked(),
  });
  const result = prepareCommunityPublicationPackage(metadata, lock);
  assert.ok(result.packageLock.packages[nodePath('a')]);
  assert.ok(result.packageLock.packages[nodePath('b')]);
  assert.equal(result.packageLock.packages[nodePath('orphan')], undefined);
});

test('fails clearly for missing required edges and a cloud SDK still needed by a retained package', () => {
  const missing = fixture({ dependencies: { local: '^1' } }, { [nodePath('local')]: locked({ peerDependencies: { missing: '^1' } }) });
  assert.throws(() => prepareCommunityPublicationPackage(missing.metadata, missing.lock), /REQUIRED_DEPENDENCY_MISSING.*missing/);
  const required = fixture({ dependencies: { [sdk]: '^1', local: '^1' } }, { [nodePath(sdk)]: locked(), [nodePath('local')]: locked({ dependencies: { [sdk]: '^1' } }) });
  assert.throws(() => prepareCommunityPublicationPackage(required.metadata, required.lock), /CLOUD_DEPENDENCY_STILL_REQUIRED/);
});

test('rejects unsupported workspace, linked and legacy locks instead of guessing a valid install', () => {
  for (const entry of [
    { path: 'packages/workspace', value: locked() },
    { path: 'node_modules/local', value: locked({ link: true, resolved: '../local' }) },
    { path: 'node_modules/local/unknown-directory', value: locked() },
    { path: 'node_modules/local/node_modules/../outside', value: locked() },
    { path: 'node_modules/local', value: locked({ workspaces: ['packages/*'] }) },
  ]) {
    const input = fixture({}, { [entry.path]: entry.value });
    assert.throws(() => prepareCommunityPublicationPackage(input.metadata, input.lock), /UNSUPPORTED/);
  }
  const input = fixture({}, {});
  assert.throws(() => prepareCommunityPublicationPackage(input.metadata, { ...input.lock, lockfileVersion: 2 }), /REQUIRES_LOCK_V3/);
  assert.throws(() => prepareCommunityPublicationPackage(input.metadata, { ...input.lock, dependencies: {} }), /UNSUPPORTED_LEGACY/);
});

test('retains a verified tarball and its declared and transitive bundled graph without changing originals or platform restrictions', () => {
  const { metadata, lock } = bundleFixture();
  const originalMetadata = structuredClone(metadata), originalLock = structuredClone(lock);
  const result = prepareCommunityPublicationPackage(metadata, lock);
  assert.deepEqual(result.removedPackages, []);
  assert.deepEqual(result.packageLock.packages[nodePath('native')], lock.packages[nodePath('native')]);
  for (const name of ['@native/runtime', 'leaf', 'helper']) {
    const child = result.packageLock.packages[bundlePath(name)];
    assert.equal(child.inBundle, true);
    assert.equal(child.version, lock.packages[bundlePath(name)].version);
    assert.equal(child.resolved, undefined);
    assert.equal(child.integrity, undefined);
  }
  // An optional peer is physically in the tarball, so its entry must survive.
  assert.equal(result.packageLock.packages[bundlePath('helper')].optional, true);
  assert.equal(result.packageLock.packages[bundlePath('helper')].peer, true);
  assert.deepEqual(metadata, originalMetadata);
  assert.deepEqual(lock, originalLock);
});

test('a nested bundle uses the outer verified tarball rather than inventing integrity for bundled children', () => {
  const { metadata, lock } = bundleFixture();
  lock.packages[bundlePath('@native/runtime')].bundledDependencies = ['leaf'];
  const nestedLeaf = `${bundlePath('@native/runtime')}/node_modules/leaf`;
  lock.packages[nestedLeaf] = lock.packages[bundlePath('leaf')];
  delete lock.packages[bundlePath('leaf')];
  const result = prepareCommunityPublicationPackage(metadata, lock);
  assert.deepEqual(result.packageLock.packages[bundlePath('@native/runtime')].bundledDependencies, ['leaf']);
  assert.equal(result.packageLock.packages[nestedLeaf].inBundle, true);
  assert.equal(result.packageLock.packages[nodePath('native')].integrity, bundleIntegrity);
});

test('removing a cloud bundle drops its entire bundled tree while keeping a separate local bundle', () => {
  const { metadata, lock } = bundleFixture();
  metadata.dependencies[sdk] = '^1';
  lock.packages[''].dependencies[sdk] = '^1';
  lock.packages[nodePath(sdk)] = locked({ integrity: bundleIntegrity, bundleDependencies: ['cloud-child'], dependencies: { 'cloud-child': '^1' } });
  const cloudChild = `${nodePath(sdk)}/node_modules/cloud-child`;
  const cloudLeaf = `${cloudChild}/node_modules/cloud-leaf`;
  lock.packages[cloudChild] = { version: '1.0.0', inBundle: true, dependencies: { 'cloud-leaf': '^1' } };
  lock.packages[cloudLeaf] = { version: '1.0.0', inBundle: true };
  const originalLock = structuredClone(lock);
  const result = prepareCommunityPublicationPackage(metadata, lock);
  assert.deepEqual(result.removedPackages, [nodePath(sdk), cloudChild, cloudLeaf].sort());
  assert.ok(result.packageLock.packages[bundlePath('@native/runtime')]);
  assert.ok(result.packageLock.packages[bundlePath('leaf')]);
  assert.deepEqual(lock, originalLock);
});

test('rejects orphan or undeclared bundled children even when their containing directory looks valid', () => {
  const orphan = fixture({}, { [nodePath('orphan')]: { version: '1.0.0', inBundle: true } });
  assert.throws(() => prepareCommunityPublicationPackage(orphan.metadata, orphan.lock), /ORPHAN_BUNDLED_DEPENDENCY/);
  const unlisted = bundleFixture();
  unlisted.lock.packages[bundlePath('unlisted')] = { version: '1.0.0', inBundle: true };
  assert.throws(() => prepareCommunityPublicationPackage(unlisted.metadata, unlisted.lock), /ORPHAN_BUNDLED_DEPENDENCY/);
  const noDeclaration = bundleFixture();
  delete noDeclaration.lock.packages[nodePath('native')].bundleDependencies;
  assert.throws(() => prepareCommunityPublicationPackage(noDeclaration.metadata, noDeclaration.lock), /ORPHAN_BUNDLED_DEPENDENCY/);
});

test('rejects malformed bundle lists, missing direct children and children outside the declared dependency graph', () => {
  for (const value of [true, false, 'runtime', {}, ['../escape'], ['@native/runtime', '@native/runtime']]) {
    const input = bundleFixture();
    input.lock.packages[nodePath('native')].bundleDependencies = value;
    assert.throws(() => prepareCommunityPublicationPackage(input.metadata, input.lock), /INVALID_BUNDLE_DECLARATION/);
  }
  for (const mutate of [
    input => { delete input.lock.packages[bundlePath('@native/runtime')]; },
    input => { delete input.lock.packages[bundlePath('@native/runtime')].inBundle; },
    input => { delete input.lock.packages[nodePath('native')].dependencies; },
    input => { input.lock.packages[bundlePath('@native/runtime')].inBundle = 'true'; },
  ]) {
    const input = bundleFixture();
    mutate(input);
    assert.throws(() => prepareCommunityPublicationPackage(input.metadata, input.lock), /INVALID_BUNDLE_CONTENT/);
  }
  const conflicting = bundleFixture();
  conflicting.lock.packages[nodePath('native')].bundledDependencies = ['leaf'];
  assert.throws(() => prepareCommunityPublicationPackage(conflicting.metadata, conflicting.lock), /INVALID_BUNDLE_DECLARATION/);
});

test('rejects bundled content without a pinned tarball and a well-formed strong integrity anchor', () => {
  for (const [field, value] of [
    ['resolved', undefined], ['resolved', 'file:local.tgz'], ['resolved', 'https://'],
    ['version', undefined], ['version', ''], ['version', '^1.2.3'], ['version', '~1.2.3'],
    ['integrity', undefined], ['integrity', 'sha512-fixture'], ['integrity', 'sha1-weak'],
  ]) {
    const input = bundleFixture();
    input.lock.packages[nodePath('native')][field] = value;
    assert.throws(() => prepareCommunityPublicationPackage(input.metadata, input.lock), /INVALID_BUNDLE_ANCHOR/);
  }
});

test('rejects dependency names that could escape bundle or package boundaries in either metadata input', () => {
  for (const mutate of [
    input => { input.lock.packages[nodePath('native')].dependencies['../escape'] = '^1'; },
    input => { input.metadata.dependencies['../escape'] = '^1'; },
  ]) {
    const input = bundleFixture();
    mutate(input);
    assert.throws(() => prepareCommunityPublicationPackage(input.metadata, input.lock), /INVALID_DEPENDENCY_NAME/);
  }
});

test('the repository lock loses every Supabase SDK package, keeps hash-wasm, and never changes retained pins', () => {
  const metadata = JSON.parse(fs.readFileSync(path.join(repository, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(repository, 'package-lock.json'), 'utf8'));
  const result = prepareCommunityPublicationPackage(metadata, lock);
  assert.ok(result.packageLock.packages[nodePath('hash-wasm')]);
  assert.ok(!Object.keys(result.packageLock.packages).some(filename => /(?:^|\/)node_modules\/@supabase\//.test(filename)));
  for (const [filename, entry] of Object.entries(result.packageLock.packages)) {
    if (!filename) continue;
    const original = structuredClone(lock.packages[filename]);
    const retained = structuredClone(entry);
    for (const flag of ['dev', 'optional', 'devOptional', 'peer', 'extraneous']) { delete original[flag]; delete retained[flag]; }
    assert.deepEqual(retained, original, `${filename}: pins, sources, integrity, bundles and platform restrictions`);
  }
  for (const filename of [nodePath('ws'), nodePath('tslib')]) {
    if (result.packageLock.packages[filename]) assert.equal(result.packageLock.packages[filename].dev, true, filename);
  }
});
