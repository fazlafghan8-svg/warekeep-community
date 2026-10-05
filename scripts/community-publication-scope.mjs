import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
export const COMMUNITY_OVERRIDE_ROOT = 'community-publication/overrides';
// A reachable import must never silently restore a commercial implementation.
// Shared backup contracts and local accounting helpers remain publishable.
const PRIVATE_RUNTIME_PATHS = /^(?:src\/components\/(?:Login|Assistant|WebsiteOrders)\.|src\/components\/settings\/(?:SubscriptionSettings|DeviceManagement|AiProviderSettings|UpdatesSettings)\.|src\/constants\/subscriptionPlans\.|src\/services\/(?:subscriptionService|deviceService|authLockService|fastspringService|startupAuthResolver|startupSubscriptionResolver|supabaseClient|supabaseService|backendConfig|backendTransport|controlPlaneService|aiService|aiOrchestrator|aiBusinessDataPrivacy|geminiService|medicineAiService|medicineWebResearchService|nodeApiService|fileStorageV2|queueManager|deltaSyncQueue|persistentSyncState|hybridSync|syncClientV2[^/]*|syncManager|syncService|syncRecoveryService|syncConfig|syncDiagnosticsService|guestMigrationService|guestPolicy|warehouseDomainService|warehouseDurableJournal|warehouseReconcileService|hostStorageService|hostFirstConfigService)\.|src\/monitoring\/systemHealthMonitor\.)/;
export function forbiddenPublicPaths(contents) {
    return [...contents.keys()].filter((filename) => PRIVATE_RUNTIME_PATHS.test(filename)).sort();
}
// Local data cleaning and local access must not import a remote service just to
// use a shared helper. Rewrite only actual module specifiers in the snapshot.
export function prepareCommunitySharedSources(contents) {
    const result = new Map(contents);
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    const uiFacts = {
        'src/components/Settings.tsx': { canUseCloudSync: false },
        'src/components/MedicineDetailsModal.tsx': { canRegenerateDescription: false },
    };
    const featureHandlers = {
        'src/components/AddMedicineModal.tsx': new Set(['handleAiIdentify', 'handleSuggestPricing']),
        'src/components/MedicineDetailsModal.tsx': new Set(['regenerateDescription']),
        'src/components/Inventory.tsx': new Set(['handleQuickAnalysis']),
        'src/components/ui/NotificationCenter.tsx': new Set(['onRetryServerSync']),
    };
    const unavailableAppCallbacks = new Set([
        'hasImmediateCloudSyncWork', 'shouldCheckBackendReachability', 'checkBackendReachability',
        'markSyncReadyIfIdle', 'removeExistingSubscription', 'applyWarehouseSnapshot',
        'applyWarehouseMutationSnapshot', 'reapplyPendingMedicineDeletesToLocalState',
        'syncWarehouseDomainOutbox', 'runWarehouseStartupAudit', 'handleRetryServerSyncFromCenter',
    ]);
    const parseStatements = (text) => {
        const parsed = ts.createSourceFile('community-local.ts', text, ts.ScriptTarget.Latest, true);
        function synthesize(node) {
            ts.setTextRange(node, { pos: -1, end: -1 });
            ts.forEachChild(node, synthesize);
        }
        for (const statement of parsed.statements)
            synthesize(statement);
        return [...parsed.statements];
    };
    for (const [filename, data] of contents) {
        if (!filename.startsWith('src/') || !/\.(?:tsx?|jsx?)$/.test(filename) || /\.test\./.test(filename))
            continue;
        const file = ts.createSourceFile(filename, data.toString('utf8'), ts.ScriptTarget.Latest, true);
        const facts = uiFacts[filename] || {};
        const handlers = featureHandlers[filename] || new Set();
        const transformed = ts.transform(file, [(context) => {
                function removeFeatureJsx(node) {
                    if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node))
                        return false;
                    const opening = ts.isJsxElement(node) ? node.openingElement : node;
                    const tag = opening.tagName.getText(file);
                    if (['Login', 'Assistant', 'WebsiteOrders', 'QuickAnalysisModal'].includes(tag))
                        return true;
                    for (const attribute of opening.attributes.properties) {
                        if (!ts.isJsxAttribute(attribute) || !attribute.initializer)
                            continue;
                        const name = attribute.name.getText(file);
                        if (name === 'data-testid' && ts.isStringLiteral(attribute.initializer) && ['add-medicine-smart-assist', 'regenerate-description-button'].includes(attribute.initializer.text))
                            return true;
                        if (name === 'onClick' && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression && ts.isIdentifier(attribute.initializer.expression) && handlers.has(attribute.initializer.expression.text))
                            return true;
                    }
                    return false;
                }
                function visitor(node) {
                    if (filename === 'src/App.tsx' && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['useEffect', 'useCallback'].includes(node.expression.text) && node.arguments.length === 2 && ts.isArrayLiteralExpression(node.arguments[1]) && node.arguments[1].elements.some((element) => ts.isIdentifier(element) && unavailableAppCallbacks.has(element.text))) {
                        const dependencies = ts.factory.updateArrayLiteralExpression(node.arguments[1], node.arguments[1].elements.filter((element) => !ts.isIdentifier(element) || !unavailableAppCallbacks.has(element.text)));
                        return ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [ts.visitNode(node.arguments[0], visitor), ts.visitNode(dependencies, visitor)]);
                    }
                    if (filename === 'src/App.tsx' && ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'useEffect' && node.getText(file).includes('const removeExistingSubscription'))
                        return undefined;
                    if (filename === 'src/App.tsx' && ts.isJsxAttribute(node) && node.name.getText(file) === 'onRetryServerSync')
                        return undefined;
                    if (filename === 'src/components/ui/NotificationCenter.tsx' && ((ts.isPropertySignature(node) && node.name.getText(file) === 'onRetryServerSync') || (ts.isBindingElement(node) && ts.isIdentifier(node.name) && node.name.text === 'onRetryServerSync')))
                        return undefined;
                    if (filename === 'src/components/settings/MaintenanceSettings.tsx' && ts.isVariableStatement(node) && node.declarationList.declarations.every((declaration) => ts.isIdentifier(declaration.name) && ['statusBadge', 'statusDetailText'].includes(declaration.name.text)))
                        return undefined;
                    if (filename === 'src/components/settings/MaintenanceSettings.tsx' && ts.isJsxExpression(node) && node.expression && ts.isBinaryExpression(node.expression) && node.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && ts.isIdentifier(node.expression.left) && ['syncDiagnostics', 'syncMetrics'].includes(node.expression.left.text))
                        return ts.factory.createJsxExpression(undefined, ts.factory.createNull());
                    if (filename === 'src/components/settings/MaintenanceSettings.tsx' && ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'useEffect' && node.getText(file).includes('syncManager.getMetrics')) {
                        return parseStatements(`useEffect(() => {
            if (!window.electronAPI) setWebLogStats(getWebLogStats());
            const timer = setInterval(() => {
              if (!window.electronAPI) setWebLogStats(getWebLogStats());
            }, 3000);
            return () => clearInterval(timer);
          }, []);`)[0];
                    }
                    if (filename === 'src/components/settings/MaintenanceSettings.tsx' && ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && ts.isBindingElement(node.name.elements[0]) && ts.isIdentifier(node.name.elements[0].name)) {
                        const name = node.name.elements[0].name.text;
                        const localValues = { syncDiagnostics: null, syncMetrics: null, checkingDb: false, cloudDbStatus: 'offline', autoHealthEnabled: false };
                        if (Object.hasOwn(localValues, name)) {
                            const value = localValues[name];
                            const initializer = value === null ? ts.factory.createNull() : value === false ? ts.factory.createFalse() : ts.factory.createStringLiteral(value);
                            return ts.factory.updateVariableDeclaration(node, ts.factory.createIdentifier(name), node.exclamationToken, undefined, initializer);
                        }
                    }
                    if (filename === 'src/App.tsx' && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'ensureWritable' && node.initializer && ts.isCallExpression(node.initializer) && ts.isArrowFunction(node.initializer.arguments[0])) {
                        const callback = node.initializer.arguments[0];
                        const parameters = callback.parameters.map((parameter) => ts.factory.updateParameterDeclaration(parameter, parameter.modifiers, parameter.dotDotDotToken, parameter.name, parameter.questionToken, ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword), parameter.initializer));
                        const arrow = ts.factory.updateArrowFunction(callback, callback.modifiers, callback.typeParameters, parameters, callback.type, callback.equalsGreaterThanToken, ts.visitNode(callback.body, visitor));
                        return ts.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, ts.factory.updateCallExpression(node.initializer, node.initializer.expression, node.initializer.typeArguments, [arrow, ...node.initializer.arguments.slice(1)]));
                    }
                    if (filename === 'src/App.tsx' && ts.isVariableStatement(node) && node.declarationList.declarations.every((declaration) => ts.isIdentifier(declaration.name) && ['Assistant', 'WebsiteOrders'].includes(declaration.name.text)))
                        return undefined;
                    if (filename === 'src/App.tsx' && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && unavailableAppCallbacks.has(node.name.text)) {
                        const replaceCallback = (callback) => {
                            const body = ts.factory.createBlock([ts.factory.createThrowStatement(ts.factory.createNewExpression(ts.factory.createIdentifier('Error'), undefined, [ts.factory.createStringLiteral('COMMUNITY_ONLINE_DISABLED')]))], true);
                            if (ts.isArrowFunction(callback))
                                return ts.factory.updateArrowFunction(callback, callback.modifiers, callback.typeParameters, callback.parameters, callback.type, callback.equalsGreaterThanToken, body);
                            return callback;
                        };
                        let initializer = node.initializer;
                        if (initializer && ts.isArrowFunction(initializer))
                            initializer = replaceCallback(initializer);
                        else if (initializer && ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression) && initializer.expression.text === 'useCallback')
                            initializer = ts.factory.updateCallExpression(initializer, initializer.expression, initializer.typeArguments, [replaceCallback(initializer.arguments[0]), ts.factory.createArrayLiteralExpression()]);
                        return ts.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, initializer);
                    }
                    if (filename === 'src/App.tsx' && ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression) && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.expression.left) && ts.isIdentifier(node.expression.left.expression) && ['syncWarehouseDomainOutboxRef', 'reconcileWarehouseStartupRef'].includes(node.expression.left.expression.text))
                        return undefined;
                    if (filename === 'src/App.tsx' && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'applyPendingMedicineDeletesToSnapshot')
                        return ts.visitNode(node.arguments[0], visitor);
                    if (filename === 'src/App.tsx' && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'warehouseDomainService') {
                        if (['hasPendingOutbox', 'isConfigured'].includes(node.expression.name.text))
                            return ts.factory.createFalse();
                        if (['discardMedicineDeleteOperations', 'discardMedicineOperations'].includes(node.expression.name.text))
                            return ts.factory.createNumericLiteral(0);
                    }
                    if (filename === 'src/App.tsx' && ts.isImportDeclaration(node) && node.moduleSpecifier.text === '@supabase/supabase-js')
                        return parseStatements('type RealtimeChannel = object;')[0];
                    if (filename === 'src/App.tsx' && ts.isPropertyAssignment(node) && node.name.getText(file) === 'guestTrial')
                        return ts.factory.updatePropertyAssignment(node, node.name, ts.factory.createIdentifier('undefined'));
                    if (filename === 'src/App.tsx' && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'authResolution') {
                        return ts.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, parseStatements('const resolution = { profile: { ...COMMUNITY_PROFILE }, clearCachedProfile: false };')[0].declarationList.declarations[0].initializer);
                    }
                    if (filename === 'src/App.tsx' && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ['pendingGuestMigration', 'isGuestSession'].includes(node.name.text)) {
                        return ts.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, node.name.text === 'isGuestSession' ? ts.factory.createFalse() : ts.factory.createNull());
                    }
                    if (removeFeatureJsx(node)) {
                        return ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)
                            ? ts.factory.createJsxExpression(undefined, ts.factory.createNull())
                            : ts.factory.createNull();
                    }
                    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
                        let specifier = node.moduleSpecifier.text;
                        if (specifier.endsWith('/subscriptionService'))
                            specifier = specifier.replace(/subscriptionService$/, 'localAccessPolicy');
                        if (specifier.endsWith('/aiService'))
                            specifier = specifier.replace(/aiService$/, 'medicineTextSanitization');
                        if (specifier.endsWith('/deviceService'))
                            specifier = specifier.replace(/deviceService$/, 'localDeviceIdentity');
                        if (specifier.endsWith('/monitoring/systemHealthMonitor'))
                            specifier = specifier.replace(/monitoring\/systemHealthMonitor$/, 'services/localDiagnostics');
                        if (specifier.endsWith('/syncRecoveryService'))
                            specifier = specifier.replace(/syncRecoveryService$/, 'localWorkspaceState');
                        if (specifier.endsWith('/warehouseDomainService'))
                            specifier = specifier.replace(/warehouseDomainService$/, 'localMutationTypes');
                        if (specifier !== node.moduleSpecifier.text) {
                            if (ts.isImportDeclaration(node))
                                return ts.factory.updateImportDeclaration(node, node.modifiers, node.importClause, ts.factory.createStringLiteral(specifier), node.attributes);
                            return ts.factory.updateExportDeclaration(node, node.modifiers, node.isTypeOnly, node.exportClause, ts.factory.createStringLiteral(specifier), node.attributes);
                        }
                    }
                    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && Object.hasOwn(facts, node.name.text)) {
                        return ts.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, facts[node.name.text] ? ts.factory.createTrue() : ts.factory.createFalse());
                    }
                    if (filename === 'src/App.tsx' && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'persistData' && ts.isArrowFunction(node.initializer) && ts.isBlock(node.initializer.body)) {
                        const statements = node.initializer.body.statements.map((statement) => {
                            if (!ts.isIfStatement(statement) || !ts.isIdentifier(statement.expression) || statement.expression.text !== 'user')
                                return statement;
                            const replacement = parseStatements(`if (user) {
              try {
                const changedSliceKeys = Array.from(new Set([
                  ...Object.keys(updatedData || {}), 'settings',
                  ...(shouldUpdateMedicinesState ? ['medicines'] : [])
                ]));
                await saveToDisk(sanitized, user.id, {
                  allowWipe: options?.allowWipe === true,
                  alreadySanitized: true,
                  changedSlices: changedSliceKeys,
                  mutationId: createUniqueId('local')
                });
              } catch (error) {
                handlePersistError(error);
                return false;
              }
            }`);
                            return replacement[0];
                        });
                        const arrow = ts.factory.updateArrowFunction(node.initializer, node.initializer.modifiers, node.initializer.typeParameters, node.initializer.parameters, node.initializer.type, node.initializer.equalsGreaterThanToken, ts.factory.updateBlock(node.initializer.body, statements));
                        return ts.visitEachChild(ts.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, arrow), visitor, context);
                    }
                    if (filename === 'src/App.tsx' && ts.isTypeAliasDeclaration(node) && node.name.text === 'CombinedQueueStatus') {
                        return parseStatements('type CombinedQueueStatus = { length: number; isProcessing: boolean; isPaused: boolean; nextRetry: number; queueLength: number; deltaQueueLength: number; warehouseOutboxLength: number; warehouseJournalLength: number; totalPending: number };')[0];
                    }
                    if (filename === 'src/App.tsx' && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'getCombinedQueueStatus') {
                        return parseStatements('const getCombinedQueueStatus = (): CombinedQueueStatus => ({ length: 0, isProcessing: false, isPaused: false, nextRetry: 0, queueLength: 0, deltaQueueLength: 0, warehouseOutboxLength: 0, warehouseJournalLength: 0, totalPending: 0 });')[0].declarationList.declarations[0];
                    }
                    if (filename === 'src/App.tsx' && ts.isExpressionStatement(node)) {
                        let expression = node.expression;
                        if (ts.isAwaitExpression(expression) || (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.VoidKeyword) || ts.isVoidExpression(expression))
                            expression = expression.expression || expression.operand;
                        if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression) && ts.isIdentifier(expression.expression.expression) && ['persistentSyncState', 'queueManager', 'deltaQueue', 'realtimeManager', 'systemHealthMonitor', 'supabase'].includes(expression.expression.expression.text))
                            return undefined;
                        if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === 'clearPendingGuestMigrationIntent')
                            return undefined;
                    }
                    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'systemHealthMonitor') {
                        if (node.expression.name.text === 'getSnapshot')
                            return parseStatements("const snapshot = { running: false, inFlight: false, lastCheckedAt: null as string | null, lastRecoveryAt: null as string | null, status: 'idle' as 'idle' | 'healthy' | 'degraded' | 'error', consecutiveUnhealthy: 0, lastIssue: null as string | null };")[0].declarationList.declarations[0].initializer;
                        return ts.factory.createVoidZero();
                    }
                    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && handlers.has(node.name.text)) {
                        // UI controls for this remote feature were removed above. The temporary
                        // local callback lets normal unused-binding pruning remove reset effects.
                        return ts.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, ts.factory.createArrowFunction([ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)], undefined, [], undefined, ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken), ts.factory.createBlock([])));
                    }
                    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && handlers.has(node.expression.text))
                        return ts.factory.createVoidZero();
                    return ts.visitEachChild(node, visitor, context);
                }
                return (node) => ts.visitNode(node, visitor);
            }]);
        result.set(filename, Buffer.from(printer.printFile(transformed.transformed[0])));
        transformed.dispose();
    }
    return result;
}
// The commercial checkout stays intact. These files only exist in a public snapshot.
export function applyCommunityOverrides(root, contents) {
    const result = new Map(contents);
    const overrideRoot = path.join(root, COMMUNITY_OVERRIDE_ROOT);
    if (!fs.existsSync(overrideRoot))
        return result;
    function walk(directory, prefix = '') {
        if (fs.lstatSync(directory).isSymbolicLink())
            throw new Error('Unsafe Community override directory.');
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, entry.name);
            const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isSymbolicLink())
                throw new Error('Unsafe Community override file.');
            if (entry.isDirectory())
                walk(absolute, relative);
            else if (entry.isFile())
                result.set(relative, fs.readFileSync(absolute));
        }
    }
    walk(overrideRoot);
    return result;
}
export function sourceImports(filename, data) {
    if (!/\.(?:[cm]?js|jsx|tsx?)$/.test(filename))
        return [];
    const file = ts.createSourceFile(filename, data.toString('utf8'), ts.ScriptTarget.Latest, true);
    const imports = new Set();
    function visit(node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
            imports.add(node.moduleSpecifier.text);
        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL' && node.arguments?.length === 2 && ts.isStringLiteral(node.arguments[0]) && ts.isPropertyAccessExpression(node.arguments[1]) && ts.isMetaProperty(node.arguments[1].expression) && node.arguments[1].name.text === 'url')
            imports.add(node.arguments[0].text);
        if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteral(node.arguments[0]) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && ['require'].includes(node.expression.text)) ||
            (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && ['vi', 'jest'].includes(node.expression.expression.text) && ['mock', 'doMock', 'importActual'].includes(node.expression.name.text))))
            imports.add(node.arguments[0].text);
        ts.forEachChild(node, visit);
    }
    visit(file);
    return [...imports];
}
export function resolveSourceImport(contents, filename, imported) {
    const specifier = imported.split('?')[0];
    if (!specifier.startsWith('.') && !specifier.startsWith('@/'))
        return null;
    const normalized = specifier.startsWith('@/') ? `src/${specifier.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(filename), specifier));
    return [normalized, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '/index.ts', '/index.tsx', '/index.js'].map((extension) => normalized + extension)].find((candidate) => contents.has(candidate)) || normalized;
}
export function selectCommunityDependencies(contents, rootFiles) {
    const included = new Set(rootFiles.filter((filename) => contents.has(filename)));
    const queue = [...included, 'src/index.community.tsx', 'src/vite-env.d.ts', 'src/index.css',
        'electron/main.js', 'electron/preload.cjs', 'electron/communityPolicy.test.js', 'electron/attachmentPolicy.test.js'];
    const visited = new Set();
    while (queue.length) {
        const filename = queue.shift();
        if (visited.has(filename) || !contents.has(filename))
            continue;
        visited.add(filename);
        included.add(filename);
        for (const specifier of sourceImports(filename, contents.get(filename))) {
            const resolved = resolveSourceImport(contents, filename, specifier);
            if (resolved)
                queue.push(resolved);
        }
    }
    // Keep local tests only when their application imports are all in this graph.
    // Tests of a removed commercial module cannot bring that module back into publication.
    const excludedTests = [];
    for (const [filename, data] of contents) {
        if (!/^src\/.*\.test\.[tj]sx?$/.test(filename))
            continue;
        const resolved = sourceImports(filename, data).map((specifier) => resolveSourceImport(contents, filename, specifier)).filter(Boolean);
        if (resolved.every((dependency) => included.has(dependency) || dependency.startsWith('src/test/'))) {
            included.add(filename);
            for (const dependency of resolved.filter((value) => value.startsWith('src/test/')))
                included.add(dependency);
        }
        else
            excludedTests.push(filename);
    }
    for (const filename of ['src/test/setup.ts'])
        if (contents.has(filename))
            included.add(filename);
    const selected = new Map([...contents].filter(([filename]) => included.has(filename)));
    return { contents: selected, excluded: [...contents.keys()].filter((filename) => !included.has(filename)).sort(), excludedTests };
}
