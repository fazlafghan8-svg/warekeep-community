import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';
import {
  COMMUNITY_OVERRIDE_ROOT,
  applyCommunityOverrides,
  prepareCommunitySharedSources,
  selectCommunityDependencies,
  sourceImports,
} from '../community-publication-scope.mjs';
import { specializeCommunitySources } from '../community-source-specialization.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturesParent = path.join(repository, 'artifacts', 'source-export');
fs.mkdirSync(fixturesParent, { recursive: true });

const bufferMap = (entries) => new Map(Object.entries(entries).map(([filename, contents]) => [filename, Buffer.from(contents)]));
const asText = (contents, filename) => contents.get(filename).toString('utf8');
function write(root, filename, contents) {
  const destination = path.join(root, filename);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, contents, { flag: 'wx' });
}
const fixtureDirectory = () => fs.mkdtempSync(path.join(fixturesParent, 'scope-test-'));

test('overrides change a snapshot copy while the commercial files and input map remain intact', () => {
  const root = fixtureDirectory();
  write(root, 'electron/main.js', 'export const edition = "commercial";\n');
  write(root, `${COMMUNITY_OVERRIDE_ROOT}/electron/main.js`, 'export const edition = "community";\n');
  write(root, `${COMMUNITY_OVERRIDE_ROOT}/src/localOnly.ts`, 'export const localOnly = true;\n');
  const original = fs.readFileSync(path.join(root, 'electron/main.js'));
  const input = new Map([['electron/main.js', original]]);
  const result = applyCommunityOverrides(root, input);
  assert.notEqual(result, input);
  assert.match(asText(result, 'electron/main.js'), /"community"/);
  assert.ok(result.has('src/localOnly.ts'));
  assert.deepEqual(input.get('electron/main.js'), original);
  assert.equal(input.size, 1);
  assert.deepEqual(fs.readFileSync(path.join(root, 'electron/main.js')), original);
  const noOverrides = fixtureDirectory();
  assert.deepEqual(applyCommunityOverrides(noOverrides, input), input);
});

test('rejects override directory junctions at the root and inside the override tree', (context) => {
  for (const nested of [false, true]) {
    const root = fixtureDirectory();
    const external = fixtureDirectory();
    write(external, 'private.js', 'export const privateMarker = true;\n');
    const link = path.join(root, COMMUNITY_OVERRIDE_ROOT, ...(nested ? ['electron'] : []));
    fs.mkdirSync(path.dirname(link), { recursive: true });
    try {
      fs.symlinkSync(external, link, 'junction');
    } catch (error) {
      if (['EPERM', 'ENOTSUP', 'EACCES'].includes(error.code)) return context.skip('Directory links are unavailable on this filesystem.');
      throw error;
    }
    assert.throws(() => applyCommunityOverrides(root, new Map()), /Unsafe Community override/);
    assert.deepEqual(fs.readdirSync(external), ['private.js']);
  }
});

test('the reachable graph keeps local tests but commercial tests and mocks cannot bring removed modules back', () => {
  const input = bufferMap({
    'electron/main.js': "import './logger.js';\n",
    'electron/logger.js': 'export const logger = true;\n',
    'src/index.community.tsx': "import './App';\n",
    'src/App.tsx': "export { local } from './local';\n",
    'src/local.ts': 'export const local = true;\n',
    'src/local.test.ts': "import { local } from './local'; import './test/setup'; test('local', () => local);\n",
    'src/test/setup.ts': 'export {};\n',
    'src/commercial.ts': 'export const remote = true;\n',
    'src/commercial.test.ts': "import { remote } from './commercial'; test('remote', () => remote);\n",
    'src/commercial-mock.test.ts': "import './local'; vi.mock('./commercial');\n",
    'src/vite-env.d.ts': 'interface CommunityEnvironment {}\n',
    'src/index.css': 'body { color: black; }\n',
  });
  const result = selectCommunityDependencies(input, ['electron/main.js']);
  for (const filename of ['src/App.tsx', 'src/local.ts', 'src/local.test.ts', 'src/test/setup.ts', 'src/index.css', 'src/vite-env.d.ts', 'electron/main.js', 'electron/logger.js']) {
    assert.ok(result.contents.has(filename), filename);
  }
  assert.ok(!result.contents.has('src/commercial.ts'));
  assert.deepEqual(result.excludedTests.sort(), ['src/commercial-mock.test.ts', 'src/commercial.test.ts']);
  assert.equal(input.size, 12);
  assert.ok(input.has('src/commercial.ts'));
});

test('worker URLs relative to import.meta.url keep the worker and its local dependencies in the graph', () => {
  const input = bufferMap({
    'src/index.community.tsx': "import './workerClient';\n",
    'src/workerClient.ts': [
      "export const createWorker = () => new Worker(new URL('./workers/local.worker.ts', import.meta.url), { type: 'module' });",
      "// new URL('./missing-comment.worker.ts', import.meta.url);",
      "export const documentation = \"new URL('./missing-example.worker.ts', import.meta.url)\";",
    ].join('\n'),
    'src/workers/local.worker.ts': "import { normalize } from '../utils/normalize'; self.onmessage = event => self.postMessage(normalize(event.data));\n",
    'src/utils/normalize.ts': 'export const normalize = value => String(value).trim();\n',
    'src/workers/unrelated.worker.ts': 'export const unrelated = true;\n',
  });
  assert.deepEqual(sourceImports('src/workerClient.ts', input.get('src/workerClient.ts')), ['./workers/local.worker.ts']);
  const selected = selectCommunityDependencies(input, []);
  for (const filename of ['src/workerClient.ts', 'src/workers/local.worker.ts', 'src/utils/normalize.ts']) assert.ok(selected.contents.has(filename), filename);
  assert.ok(!selected.contents.has('src/workers/unrelated.worker.ts'));
});

test('shared imports and re-exports point to local helpers while documentation strings and test source stay unchanged', () => {
  const document = "import { helper } from '../services/aiService'";
  const input = bufferMap({
    'src/components/Local.tsx': [
      "import { sanitizeMedicineDescription } from '../services/aiService';",
      "export { isSubscriptionActive } from '../services/subscriptionService';",
      `export const documentation = ${JSON.stringify(document)};`,
      "export const local = sanitizeMedicineDescription('name');",
    ].join('\n'),
    'src/components/Local.test.tsx': "vi.mock('../services/aiService');\n",
  });
  const original = asText(input, 'src/components/Local.tsx');
  const prepared = prepareCommunitySharedSources(input);
  assert.deepEqual(sourceImports('src/components/Local.tsx', prepared.get('src/components/Local.tsx')), [
    '../services/medicineTextSanitization', '../services/localAccessPolicy',
  ]);
  const parsed = ts.createSourceFile('Local.tsx', asText(prepared, 'src/components/Local.tsx'), ts.ScriptTarget.Latest, true);
  let printedDocument;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'documentation') printedDocument = node.initializer.text;
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.equal(printedDocument, document);
  assert.equal(asText(input, 'src/components/Local.tsx'), original);
  assert.deepEqual(prepared.get('src/components/Local.test.tsx'), input.get('src/components/Local.test.tsx'));
});

test('manual medicine registration and its sanitizer remain reachable after remote assist controls are removed', () => {
  const input = bufferMap({
    'src/index.community.tsx': "import AddMedicineModal from './components/AddMedicineModal'; export { AddMedicineModal };\n",
    'src/components/AddMedicineModal.tsx': `
      import { identifyMedicine, suggestPricing, sanitizeMedicineDescription } from '../services/aiService';
      export default function AddMedicineModal({ name, price, quantity, onSave }) {
        const handleAiIdentify = async () => identifyMedicine('photo');
        const handleSuggestPricing = async () => suggestPricing(name);
        const handleSubmit = () => onSave({ name: sanitizeMedicineDescription(name), price: Number(price), quantity: Number(quantity) });
        return <form onSubmit={handleSubmit}>
          <input name="medicine-name" value={name} />
          <input name="medicine-price" value={price} />
          <input name="medicine-quantity" value={quantity} />
          <button data-testid="add-medicine-smart-assist" onClick={handleAiIdentify}>remote photo</button>
          <button onClick={handleSuggestPricing}>remote pricing</button>
          <button type="submit">ثبت دستی</button>
        </form>;
      }
    `,
    'src/services/medicineTextSanitization.ts': 'export const sanitizeMedicineDescription = text => String(text).trim();\n',
    'src/services/aiService.ts': 'export const identifyMedicine = () => fetch("https://example.invalid");\n',
  });
  const prepared = prepareCommunitySharedSources(input);
  const specialized = specializeCommunitySources(prepared, { dropUnusedImportModules: true, assumePropertyReadsPure: true });
  const selected = selectCommunityDependencies(specialized, []);
  assert.ok(selected.contents.has('src/components/AddMedicineModal.tsx'), 'the manual medicine component must remain reachable from the public entry');
  const form = asText(selected.contents, 'src/components/AddMedicineModal.tsx');
  assert.match(form, /onSubmit=\{handleSubmit\}/);
  assert.match(form, /sanitizeMedicineDescription\(name\)/);
  for (const name of ['medicine-name', 'medicine-price', 'medicine-quantity', 'ثبت دستی']) assert.ok(form.includes(name), name);
  assert.doesNotMatch(form, /add-medicine-smart-assist|identifyMedicine|suggestPricing|remote photo|remote pricing/);
  assert.ok(selected.contents.has('src/services/medicineTextSanitization.ts'));
  assert.ok(!selected.contents.has('src/services/aiService.ts'));
  assert.match(asText(input, 'src/components/AddMedicineModal.tsx'), /identifyMedicine/);
});

test('the public persistData branch writes local data and preserves options, mutation identity and failure reporting', async () => {
  const original = `
    export const persistData = async (updatedData, options) => {
      const sanitized = sanitizeAppData(updatedData);
      const shouldUpdateMedicinesState = Array.isArray(updatedData.customers) && updatedData.customers.length > 0;
      if (user) {
        await persistentSyncState.save(sanitized);
        await queueManager.enqueue(sanitized);
      }
      publish(sanitized);
      return true;
    };
  `;
  const prepared = prepareCommunitySharedSources(bufferMap({ 'src/App.tsx': original }));
  const source = asText(prepared, 'src/App.tsx');
  assert.doesNotMatch(source, /persistentSyncState|queueManager/);
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const writes = [], published = [], errors = [];
  const sandbox = {
    exports: {}, user: { id: 'community-local' },
    sanitizeAppData: data => ({ ...data, sanitized: true }),
    createUniqueId: prefix => `${prefix}-fixture`,
    saveToDisk: async (...args) => writes.push(args),
    handlePersistError: error => errors.push(error),
    publish: data => published.push(data),
    persistentSyncState: { save: () => { throw new Error('Remote state must never be used'); } },
    queueManager: { enqueue: () => { throw new Error('Remote queue must never be used'); } },
  };
  vm.runInNewContext(compiled, sandbox, { filename: 'community-local-persistence.js' });
  const payload = { medicines: [{ id: 'm1' }], settings: { local: true } };
  assert.equal(await sandbox.exports.persistData(payload, { allowWipe: true }), true);
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0])), [
    { ...payload, sanitized: true }, 'community-local',
    { allowWipe: true, alreadySanitized: true, changedSlices: ['medicines', 'settings'], mutationId: 'local-fixture' },
  ]);
  assert.equal(published.length, 1);
  const customerPayload = { customers: [{ id: 'c1' }] };
  assert.equal(await sandbox.exports.persistData(customerPayload), true);
  assert.deepEqual(JSON.parse(JSON.stringify(writes[1])), [
    { ...customerPayload, sanitized: true }, 'community-local',
    { allowWipe: false, alreadySanitized: true, changedSlices: ['customers', 'settings', 'medicines'], mutationId: 'local-fixture' },
  ]);
  assert.equal(published.length, 2);
  const failure = new Error('DISK_FULL');
  sandbox.saveToDisk = async () => { throw failure; };
  assert.equal(await sandbox.exports.persistData(payload), false);
  assert.deepEqual(errors, [failure]);
  assert.equal(published.length, 2, 'failed persistence must not publish a saved state');
  sandbox.user = null;
  assert.equal(await sandbox.exports.persistData(payload), true);
  assert.equal(published.length, 3);
});
