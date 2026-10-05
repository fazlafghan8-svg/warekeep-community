import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { prepareCommunityMedicineSources } from '../community-medicine-publication.mjs';
import { prepareCommunitySharedSources } from '../community-publication-scope.mjs';
import { specializeCommunitySources } from '../community-source-specialization.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const medicineFile = 'src/components/AddMedicineModal.tsx';
const generalFile = 'src/components/settings/GeneralSettings.tsx';
const bufferMap = (files) => new Map(Object.entries(files).map(([name, data]) => [name, Buffer.from(data)]));
const asText = (files, name) => files.get(name).toString('utf8');
const parse = (filename, source) => ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);

test('legacy camera settings and Alt input shortcuts cannot request camera access, while manual save and Ctrl+Enter work', async () => {
  const input = bufferMap({ [medicineFile]: `
    import React, { useState, useCallback, useEffect } from 'react';
    export function AddMedicineModal({ settings, onAddMedicine, onAddMedicineWithProcurementDraft, next }) {
      const [aiInputMode, setAiInputMode] = useState(settings.medicineAiDefaultInput || 'upload');
      const [name] = useState('Test medicine');
      const [quantity] = useState(1.25);
      const [allowFractionalQuantity] = useState(true);
      const currentStep = 1, isOpen = true;
      const handleNextStep = () => next();
      const startCamera = useCallback(async () => {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setAiInputMode('camera');
      }, []);
      const stopCamera = useCallback(() => window.stopCamera(), []);
      const switchAiInputMode = useCallback(mode => { setAiInputMode(mode); if (mode === 'camera') startCamera(); }, [startCamera]);
      const handleAiIdentify = async () => fetch('https://example.invalid/remote');
      const captureFrameForAi = async () => startCamera();
      const handlePaste = event => handleAiIdentify(event.clipboardData);
      useEffect(() => { if (aiInputMode === 'camera') void startCamera(); }, [aiInputMode, startCamera]);
      useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = event => {
          if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && event.key === 'Enter') {
            if (currentStep !== 1) return;
            event.preventDefault(); handleNextStep(); return;
          }
          if (!event.altKey) return;
          if (event.key === '1') { event.preventDefault(); switchAiInputMode('upload'); }
          else if (event.key === '2') { event.preventDefault(); switchAiInputMode('text'); }
          else if (event.key === '3') { event.preventDefault(); switchAiInputMode('camera'); }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
      }, [currentStep, handleNextStep, isOpen, switchAiInputMode]);
      const handleSubmit = () => onAddMedicine({ name, quantity, allowFractionalQuantity, batchNumber: 'B1' });
      const handleProcurement = () => onAddMedicineWithProcurementDraft({ medicine: { name, quantity }, purchaseLine: { quantity, supplierId: 'S1' } });
      return <form onSubmit={handleSubmit} onPaste={handlePaste}>
        <section data-testid="add-medicine-smart-assist"><button onClick={startCamera}>Camera</button></section>
        <input name="medicine-name" value={name}/><input name="stock" value={quantity}/>
        <input name="fractional" checked={allowFractionalQuantity}/>
        <button data-testid="procurement" onClick={handleProcurement}>Procurement</button>
        <button type="submit">Save</button>
      </form>;
    }
  ` });
  const original = asText(input, medicineFile);
  const prepared = prepareCommunityMedicineSources(input);
  const source = asText(prepared, medicineFile);
  assert.doesNotMatch(source, /getUserMedia|startCamera|captureFrameForAi|switchAiInputMode|onPaste|medicineAiDefaultInput|example\.invalid/);
  assert.equal(parse(medicineFile, source).parseDiagnostics.length, 0);
  const effects = [], listeners = new Map(), saves = [], procurements = [];
  let permissions = 0, advances = 0, prevented = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: value => [typeof value === 'function' ? value() : value, () => {}],
    useCallback: callback => callback,
    useEffect: callback => effects.push(callback),
  };
  const sandbox = {
    exports: {}, require: name => { assert.equal(name, 'react'); return react; },
    window: {
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name); },
      stopCamera: () => { throw new Error('A removed camera helper must not run'); },
    },
    navigator: { mediaDevices: { getUserMedia: async () => { permissions += 1; throw new Error('Camera must never be requested'); } } },
    fetch: () => { throw new Error('Remote medicine assistance must never run'); },
  };
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(compiled, sandbox, { filename: 'community-manual-medicine.js' });
  const form = sandbox.exports.AddMedicineModal({
    settings: { medicineAiDefaultInput: 'camera' },
    onAddMedicine: payload => saves.push(payload),
    onAddMedicineWithProcurementDraft: payload => procurements.push(payload),
    next: () => { advances += 1; },
  });
  const cleanups = effects.map(callback => callback()).filter(value => typeof value === 'function');
  const keydown = listeners.get('keydown');
  assert.equal(typeof keydown, 'function', 'manual step navigation must stay registered');
  for (const key of ['1', '2', '3']) keydown({ altKey: true, key, preventDefault: () => { prevented += 1; } });
  assert.equal(prevented, 0, 'removed input mode shortcuts must not intercept keys');
  keydown({ ctrlKey: true, altKey: false, metaKey: false, shiftKey: false, key: 'Enter', preventDefault: () => { prevented += 1; } });
  assert.equal(advances, 1);
  form.props.onSubmit();
  const procurementButton = form.props.children.find(child => child?.props?.['data-testid'] === 'procurement');
  procurementButton.props.onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(saves)), [{ name: 'Test medicine', quantity: 1.25, allowFractionalQuantity: true, batchNumber: 'B1' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(procurements)), [{ medicine: { name: 'Test medicine', quantity: 1.25 }, purchaseLine: { quantity: 1.25, supplierId: 'S1' } }]);
  await Promise.resolve();
  assert.equal(permissions, 0);
  cleanups.forEach(callback => callback());
  assert.equal(listeners.size, 0);
  assert.equal(asText(input, medicineFile), original);
});

function declarations(filename, source) {
  const parsed = parse(filename, source), found = new Map();
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) found.set(node.name.text, printer.printNode(ts.EmitHint.Unspecified, node, parsed));
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return found;
}

test('the actual medicine component keeps manual stock, procurement and fractional-unit logic exactly', () => {
  const original = fs.readFileSync(path.join(root, medicineFile), 'utf8');
  const prepared = prepareCommunityMedicineSources(bufferMap({ [medicineFile]: original }));
  const source = asText(prepared, medicineFile);
  assert.equal(parse(medicineFile, source).parseDiagnostics.length, 0);
  assert.doesNotMatch(source, /getUserMedia|BarcodeDetector|import\(['"]@zxing\/library|startCamera|captureFrameForAi|medicineAiDefaultInput/);
  const before = declarations(medicineFile, original), after = declarations(medicineFile, source);
  for (const name of ['buildCurrentDraftSnapshot', 'submitMedicineDraft', 'handleSubmitForm', 'handleNumericInput', 'handleDecimalInput', 'handleSignedPercentInput', 'findExactDuplicateMedicine', 'handleProcurementAssistToggle', 'handleNextStep', 'handleMonthChange', 'handleYearChange']) {
    assert.ok(before.has(name), `the real manual helper ${name} must exist`);
    assert.equal(after.get(name), before.get(name), `manual logic ${name} must not change`);
  }
  for (const marker of ['add-medicine-core-details', 'add-medicine-final-save', 'add-medicine-procurement-assist-toggle', 'allowFractionalQuantity', 'toBaseQuantity', 'resolveSalesModePrice', 'partnerStockEnabled']) assert.ok(source.includes(marker), marker);
  const specialized = specializeCommunitySources(prepareCommunitySharedSources(prepared), { dropUnusedImportModules: true, assumePropertyReadsPure: true });
  assert.equal(parse(medicineFile, asText(specialized, medicineFile)).parseDiagnostics.length, 0);
  assert.doesNotMatch(asText(specialized, medicineFile), /getUserMedia|startCamera|captureFrameForAi|switchAiInputMode|identifyMedicine|generateMedicineDescriptionBundle|@zxing\/library/);
  assert.match(asText(specialized, medicineFile), /onAddMedicineWithProcurementDraft/);
});

test('general settings retain manual flow and procurement controls without AI input or AI scroll controls', () => {
  const original = fs.readFileSync(path.join(root, generalFile), 'utf8');
  const untouched = Buffer.from('export const commercial = true;');
  const input = new Map([[generalFile, Buffer.from(original)], ['src/other.ts', untouched]]);
  const prepared = prepareCommunityMedicineSources(input), source = asText(prepared, generalFile);
  assert.equal(parse(generalFile, source).parseDiagnostics.length, 0);
  assert.doesNotMatch(source, /medicineAiDefaultInput|Default AI input|Live Camera Scanner|Scroll after AI fill/);
  for (const marker of ['defaultSalesMode', 'Manual auto-scroll', 'Supplier procurement assist', 'general-settings-procurement-assist-learned-badge', 'general-settings-medicine-entry-advanced-trigger']) assert.ok(source.includes(marker), marker);
  assert.equal(prepared.get('src/other.ts'), untouched);
  assert.equal(asText(input, generalFile), original);
});
