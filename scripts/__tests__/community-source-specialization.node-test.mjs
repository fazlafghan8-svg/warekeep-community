import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { specializeCommunitySources } from '../community-source-specialization.mjs';

test('publication never replaces assertions or application calls inside test files', () => {
    const original = `import { IS_COMMUNITY_EDITION } from '../config/edition';\nimport { isLocalOnlyProfile } from '../services/communityWorkspace';\nexpect(IS_COMMUNITY_EDITION).toBe(true);\nexpect(isLocalOnlyProfile({provider:'local'})).toBe(true);\n`;
    for (const filename of ['src/__tests__/workspace.test.ts', 'scripts/__tests__/policy.node-test.mjs']) {
        assert.equal(specialize(original, {}, filename), original);
    }
});

function specialize(code, options = {}, filename = 'src/sample.ts') {
    const input = new Map([
        ['src/config/edition.ts', Buffer.from('export const IS_COMMUNITY_EDITION = import.meta.env.VITE_APP_EDITION === "community";')],
        ['src/services/communityWorkspace.ts', Buffer.from('export const isLocalOnlyProfile = (_value: unknown) => false;')],
        [filename, Buffer.from(code)],
    ]);
    const before = Buffer.from(input.get(filename));
    const output = specializeCommunitySources(input, { dropUnusedImportModules: true, ...options });
    assert.deepEqual(input.get(filename), before, 'specialization must leave its input unchanged');
    return output.get(filename).toString('utf8');
}

function execute(code, modules = {}) {
    const result = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    const exports = {};
    const require = (name) => {
        assert.ok(Object.hasOwn(modules, name), `unexpected runtime dependency: ${name}`);
        return modules[name];
    };
    new Function('require', 'exports', result.outputText)(require, exports);
    return exports;
}

test('folds the imported Community flag, aliases, nested branches and shorthand values', () => {
    const output = specialize(`
        import { IS_COMMUNITY_EDITION as community } from './config/edition';
        import { send } from './cloud';
        export const state = { community };
        export function run() {
            if (!community) { send(); return 'online'; }
            if (community && true) return community ? 'offline' : send();
            send();
        }
    `);
    assert.doesNotMatch(output, /cloud|send/);
    const api = execute(output);
    assert.deepEqual(api.state, { community: true });
    assert.equal(api.run(), 'offline');
});

test('respects shadowed bindings, member names, object keys and type names', () => {
    const output = specialize(`
        import { IS_COMMUNITY_EDITION } from './config/edition';
        export type Shape = { IS_COMMUNITY_EDITION: boolean };
        export function read(value: Shape, IS_COMMUNITY_EDITION: boolean) {
            return [value.IS_COMMUNITY_EDITION, IS_COMMUNITY_EDITION];
        }
        export function local() { return IS_COMMUNITY_EDITION; }
    `);
    assert.match(output, /IS_COMMUNITY_EDITION: boolean/);
    assert.deepEqual(execute(output).read({ IS_COMMUNITY_EDITION: false }, false), [false, false]);
    assert.equal(execute(output).local(), true);
});

test('keeps imports used by direct and aliased local re-exports', () => {
    const output = specialize(`
        import AddMedicineModal from './components/AddMedicineModal';
        import { medicine as C } from './medicine';
        export { AddMedicineModal, C as Product };
    `);
    assert.match(output, /import AddMedicineModal/);
    assert.match(output, /medicine as C/);
    const component = () => 1;
    const api = execute(output, { './components/AddMedicineModal': { default: component }, './medicine': { medicine: 7 } });
    assert.equal(api.AddMedicineModal, component);
    assert.equal(api.Product, 7);
});

test('preserves argument and condition side effects when specializing proven boolean calls', () => {
    const output = specialize(`
        export function run(trace: string[]) {
            const cloudAllowed = (_value: unknown) => true;
            if (cloudAllowed(trace.push('argument'))) trace.push('cloud');
            if (trace.push('condition') || true) trace.push('offline');
            return trace;
        }
    `, { booleanFacts: [{ file: 'src/sample.ts', localName: 'cloudAllowed', ownerName: 'run', kind: 'call', value: false }] });
    assert.deepEqual(execute(output).run([]), ['argument', 'condition', 'offline']);
});

test('removes pure unused locals while retaining calls and getter evaluation', () => {
    const output = specialize(`
        export function run(trace: string[], object: { value: number }) {
            const unused = { safe: [1, 2] };
            const effect = trace.push('call');
            const getter = object.value;
            return trace;
        }
    `);
    assert.doesNotMatch(output, /unused/);
    const trace = [];
    const object = { get value() { trace.push('getter'); return 4; } };
    assert.deepEqual(execute(output).run(trace, object), ['call', 'getter']);
});

test('preserves bare module imports and retains empty runtime imports unless explicitly approved', () => {
    const code = `import { unused } from './effect'; import './always'; export const value = 1;`;
    const output = specialize(code, { dropUnusedImportModules: false });
    assert.match(output, /import ['"]\.\/effect['"]/);
    assert.match(output, /import ['"]\.\/always['"]/);
    const dropped = specialize(code);
    assert.doesNotMatch(dropped, /\.\/effect/);
    assert.match(dropped, /\.\/always/);
});

test('preserves var and function hoisting after return and lexical temporal dead zones', () => {
    const output = specialize(`
        export function variable(trace: string[]) { return typeof hoisted; var hoisted = trace.push('unreachable'); }
        export function func() { return hoisted(); function hoisted() { return 9; } throw new Error('unreachable'); }
        export function lexical() { return typeof late; let late = 1; }
    `);
    const api = execute(output);
    const trace = [];
    assert.equal(api.variable(trace), 'undefined');
    assert.deepEqual(trace, []);
    assert.equal(api.func(), 9);
    assert.throws(api.lexical, ReferenceError);
    assert.doesNotMatch(output, /unreachable/);
});

test('preserves var bindings from a discarded constant branch', () => {
    const output = specialize(`
        import { IS_COMMUNITY_EDITION } from './config/edition';
        export function read() { if (!IS_COMMUNITY_EDITION) { var remote = 8; } return remote; }
    `);
    assert.equal(execute(output).read(), undefined);
});

test('retains values of unknown logical expressions instead of coercing them to booleans', () => {
    const output = specialize(`export function and(value: unknown) { return value && false; } export function or(value: unknown) { return value || true; }`);
    const api = execute(output);
    assert.equal(api.and(0), 0);
    assert.equal(api.and(''), '');
    const object = {};
    assert.equal(api.or(object), object);
});

test('keeps type-query imports without replacing type identifiers', () => {
    const output = specialize(`
        import { IS_COMMUNITY_EDITION } from './config/edition';
        export type Flag = typeof IS_COMMUNITY_EDITION;
        export const value = IS_COMMUNITY_EDITION;
    `);
    assert.match(output, /typeof IS_COMMUNITY_EDITION/);
    assert.match(output, /import.*IS_COMMUNITY_EDITION/);
    assert.match(output, /value = true/);
});

test('prunes proven no-op React effects and unused pure hooks, but keeps initializer effects', () => {
    const output = specialize(`
        import { useCallback, useEffect, useRef, useState } from 'react';
        import { IS_COMMUNITY_EDITION } from './config/edition';
        export function run(trace: string[]) {
            const fn = useCallback(() => trace.push('not called'), []);
            const ref = useRef(0);
            const [value, setValue] = useState(1);
            const [effect] = useState(() => trace.push('state init'));
            useEffect(() => { if (IS_COMMUNITY_EDITION) return; trace.push('remote'); }, []);
            return trace;
        }
    `);
    assert.doesNotMatch(output, /useCallback|useRef|useEffect|not called|remote|setValue/);
    const react = { useState: (initializer) => [typeof initializer === 'function' ? initializer() : initializer, () => {}] };
    assert.deepEqual(execute(output, { react }).run([]), ['state init']);
});

test('a same-named nested owner and shadowed imported fact are not rewritten', () => {
    const output = specialize(`
        import { isLocalOnlyProfile as isLocal } from './services/communityWorkspace';
        export function App() {
            const cloudAllowed = () => true;
            function App(value: boolean) { const cloudAllowed = () => value; return cloudAllowed(); }
            function nested(isLocal: (x: number) => boolean) { return isLocal(1); }
            return [cloudAllowed(), App(true), nested(() => false), isLocal({})];
        }
    `, { booleanFacts: [{ file: 'src/sample.ts', localName: 'cloudAllowed', ownerName: 'App', kind: 'call', value: false }] });
    assert.deepEqual(execute(output).App(), [false, true, false, true]);
});

test('namespace hooks are recognized but a local function named useRef keeps its effects', () => {
    const output = specialize(`
        import * as React from 'react';
        export function run(trace: string[]) {
            const dead = React.useRef(0);
            const useRef = () => trace.push('ordinary call');
            const active = useRef();
            return trace;
        }
    `);
    assert.doesNotMatch(output, /React|dead/);
    assert.deepEqual(execute(output).run([]), ['ordinary call']);
});

test('unrelated JS scripts retain their top-level global declarations', () => {
    const output = specialize('var sharedGlobal = 4; function publicFunction() { return sharedGlobal; }', {}, 'electron/global.js');
    assert.match(output, /sharedGlobal/);
    assert.match(output, /publicFunction/);
});

test('unused coercions and destructuring still evaluate custom object effects', () => {
    const output = specialize(`
        export function run(trace: string[], object: any) {
            const number = +object;
            const sum = object + 1;
            const looseEquality = object == 1;
            const map = { [object]: 1 };
            const { value } = object;
            return trace;
        }
    `);
    const trace = [];
    const object = {
        [Symbol.toPrimitive]() { trace.push('coercion'); return 1; },
        get value() { trace.push('getter'); return 1; },
    };
    assert.deepEqual(execute(output).run(trace, object), ['coercion', 'coercion', 'coercion', 'coercion', 'getter']);
});

test('folded numeric values preserve negative zero, NaN and infinity without global identifiers', () => {
    const output = specialize(`
        export function values(NaN: unknown, Infinity: unknown) { return [-0, +'invalid', +'Infinity', +'-Infinity']; }
    `);
    const values = execute(output).values(1, 2);
    assert.ok(Object.is(values[0], -0));
    assert.ok(Number.isNaN(values[1]));
    assert.equal(values[2], Infinity);
    assert.equal(values[3], -Infinity);
});

test('only the top-level edition binding is overridden and unrelated binary files survive intact', () => {
    const edition = `
        export const IS_COMMUNITY_EDITION = false;
        export const mode = IS_COMMUNITY_EDITION ? 'offline' : 'online';
        export function shadow(value: boolean) {
            return (() => { const IS_COMMUNITY_EDITION = value; return IS_COMMUNITY_EDITION; })();
        }
    `;
    const bytes = Buffer.from([0, 255, 37, 0]);
    const input = new Map([['src/config/edition.ts', Buffer.from(edition)], ['src/assets/font.woff2', bytes]]);
    const output = specializeCommunitySources(input, { dropUnusedImportModules: true });
    const api = execute(output.get('src/config/edition.ts').toString('utf8'));
    assert.equal(api.IS_COMMUNITY_EDITION, true);
    assert.equal(api.mode, 'offline');
    assert.equal(api.shadow(false), false);
    assert.deepEqual(output.get('src/assets/font.woff2'), bytes);
    assert.notEqual(output.get('src/assets/font.woff2'), bytes, 'the result must own its buffers');
    assert.deepEqual(specializeCommunitySources(output, { dropUnusedImportModules: true }), output, 'finished output is stable when specialized again');
});
