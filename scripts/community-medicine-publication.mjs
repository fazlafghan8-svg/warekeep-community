import ts from 'typescript';
const MEDICINE_FILE = 'src/components/AddMedicineModal.tsx';
const GENERAL_FILE = 'src/components/settings/GeneralSettings.tsx';
// These helpers belong exclusively to the removed image/text assistant. Manual
// barcode entry, manufacturer cleanup, procurement, units and stock stay intact.
const ASSISTANT_HELPERS = new Set([
    'isAiProviderConfigurationError', 'maybeRunAiFillAutoScroll', 'appendScanHistory',
    'setScannerEngineMode', 'getLiveScanIntervalMs', 'getStableReadThreshold',
    'loadFallbackZxing', 'detectFallbackBarcode', 'loadImageElementFromFile',
    'detectLocalBarcodeFromFile', 'handleDetectedBarcode', 'stopCamera', 'startCamera',
    'switchAiInputMode', 'localizeAiRuntimeError', 'handleAiIdentify',
    'captureFrameForAi', 'handlePaste', 'handleDrop', 'handleSuggestPricing',
]);
const ASSISTANT_SETTERS = new Set([
    'setAiLoading', 'setAiStep', 'setAiError', 'setPreviewImage', 'setIsDragging',
    'setAiInputMode', 'setCameraActive', 'setCameraError', 'setCameraSupportChecked',
    'setBarcodeSupported', 'setLiveScannerHint', 'setScannerEngine',
    'setFallbackLoading', 'setBarcodeConfidence', 'setAiConfidence', 'setAiProgress',
    'setAiSources', 'setAiQueries', 'setUsedWebSearch', 'setAutoSavedByAi',
    'setAutoCaptureEnabled', 'setScanHistory', 'setAutoCaptureTick',
    'setShowAiAdvancedMenu', 'setShowAiSourcesPanel', 'setShowAssistantHelp',
]);
const EXCLUSIVE_EFFECT_BINDINGS = new Set([
    'startCamera', 'captureFrameForAi', 'setCameraSupportChecked', 'aiLoadingRef',
    'scanSpeedProfileRef', 'AI_SCAN_PROFILE_STORAGE_KEY', 'AI_CARD_DENSITY_STORAGE_KEY',
    'showAiAdvancedMenu', 'showAssistantHelp',
]);
const DISABLED_CALLS = new Set([...ASSISTANT_HELPERS, ...ASSISTANT_SETTERS]);
const CAPTURE_TYPES = new Set(['BarcodeResultLike', 'BarcodeDetectorLike', 'BarcodeDetectorCtor']);
const LOCAL_STEP_TEXT = new Map([
    ['Start with quick assist and product identity.', 'Enter the medicine identity.'],
    ['با دستیار سریع و هویت دوا شروع کنید.', 'مشخصات اصلی دوا را وارد کنید.'],
    ['Use one helper mode only when needed, then confirm the core details below.', 'Confirm the core medicine details below.'],
    ['فقط در صورت نیاز از یک حالت کمکی استفاده کنید، سپس مشخصات اصلی را تایید کنید.', 'مشخصات اصلی دوا را در پایین تایید کنید.'],
]);
function hasIdentifier(node, names) {
    if (ts.isIdentifier(node) && names.has(node.text))
        return true;
    return ts.forEachChild(node, (child) => hasIdentifier(child, names)) === true;
}
function namedJsxAttribute(opening, name, value) {
    return opening.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute)
        && attribute.name.getText() === name && attribute.initializer
        && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text === value);
}
function jsxOpening(node) {
    return ts.isJsxElement(node) ? node.openingElement
        : ts.isJsxSelfClosingElement(node) ? node : null;
}
function nullJsx(node) {
    return ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)
        ? ts.factory.createJsxExpression(undefined, ts.factory.createNull())
        : ts.factory.createNull();
}
/** Remove assistant capture/input behavior from a publication Map only. */
export function prepareCommunityMedicineSources(contents) {
    const result = new Map(contents);
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    for (const filename of [MEDICINE_FILE, GENERAL_FILE]) {
        if (!contents.has(filename))
            continue;
        const file = ts.createSourceFile(filename, contents.get(filename).toString('utf8'), ts.ScriptTarget.Latest, true);
        const medicine = filename === MEDICINE_FILE;
        const transformed = ts.transform(file, [(context) => {
                function visitor(node) {
                    const opening = jsxOpening(node);
                    if (opening) {
                        if (medicine && namedJsxAttribute(opening, 'data-testid', 'add-medicine-smart-assist'))
                            return nullJsx(node);
                        // Remove the smallest card enclosing the AI input selector, so the
                        // surrounding sales, procurement and manual scroll settings survive.
                        if (!medicine && ts.isJsxElement(node) && node.children.some((child) => {
                            const childOpening = jsxOpening(child);
                            return childOpening && namedJsxAttribute(childOpening, 'name', 'medicineAiDefaultInput');
                        }))
                            return nullJsx(node);
                        if (!medicine && opening.tagName.getText(file) === 'CompactToggleRow'
                            && opening.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute)
                                && attribute.name.getText(file) === 'checked' && attribute.initializer
                                && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression
                                && ts.isPropertyAccessExpression(attribute.initializer.expression)
                                && attribute.initializer.expression.name.text === 'aiFillScroll'))
                            return nullJsx(node);
                    }
                    if (!medicine)
                        return ts.visitEachChild(node, visitor, context);
                    if (ts.isTypeAliasDeclaration(node) && CAPTURE_TYPES.has(node.name.text))
                        return undefined;
                    if (ts.isJsxAttribute(node) && ['onPaste', 'onDrop'].includes(node.name.getText(file))
                        && node.initializer && ts.isJsxExpression(node.initializer)
                        && node.initializer.expression && ts.isIdentifier(node.initializer.expression)
                        && ASSISTANT_HELPERS.has(node.initializer.expression.text))
                        return undefined;
                    if (ts.isVariableStatement(node)) {
                        const declarations = node.declarationList.declarations.filter((declaration) => !ts.isIdentifier(declaration.name) || (!ASSISTANT_HELPERS.has(declaration.name.text)
                            && declaration.name.text !== 'barcodeDetectorRef'));
                        if (!declarations.length)
                            return undefined;
                        if (declarations.length !== node.declarationList.declarations.length) {
                            return ts.visitEachChild(ts.factory.updateVariableStatement(node, node.modifiers, ts.factory.updateVariableDeclarationList(node.declarationList, declarations)), visitor, context);
                        }
                    }
                    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
                        const call = node.expression;
                        if (ts.isIdentifier(call.expression) && call.expression.text === 'useEffect'
                            && call.arguments[0] && hasIdentifier(call.arguments[0], EXCLUSIVE_EFFECT_BINDINGS))
                            return undefined;
                        if (ts.isIdentifier(call.expression) && DISABLED_CALLS.has(call.expression.text))
                            return undefined;
                    }
                    // Keep the Ctrl+Enter branch of the shared key handler; remove its entire
                    // Alt input-mode chain before any assistant callbacks are removed.
                    if (ts.isIfStatement(node) && hasIdentifier(node, new Set(['switchAiInputMode'])))
                        return undefined;
                    if (ts.isArrayLiteralExpression(node)) {
                        const remaining = node.elements.filter((element) => !ts.isIdentifier(element) || !DISABLED_CALLS.has(element.text));
                        if (remaining.length !== node.elements.length)
                            return ts.factory.updateArrayLiteralExpression(node, ts.factory.createNodeArray(remaining.map((element) => ts.visitNode(element, visitor)), node.elements.hasTrailingComma));
                    }
                    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken
                        && ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'medicineAiDefaultInput')
                        return ts.factory.createStringLiteral('upload');
                    if (ts.isPropertyAccessExpression(node) && node.name.text === 'medicineAiDefaultInput')
                        return ts.factory.createStringLiteral('upload');
                    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
                        && DISABLED_CALLS.has(node.expression.text))
                        return ts.factory.createVoidZero();
                    if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left)
                        && ['aiInputMode', 'preferredMode'].includes(node.left.text) && ts.isStringLiteral(node.right)) {
                        const equal = node.right.text === 'upload';
                        if (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken)
                            return equal ? ts.factory.createTrue() : ts.factory.createFalse();
                        if (node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)
                            return equal ? ts.factory.createFalse() : ts.factory.createTrue();
                    }
                    if (ts.isStringLiteral(node) && LOCAL_STEP_TEXT.has(node.text))
                        return ts.factory.createStringLiteral(LOCAL_STEP_TEXT.get(node.text));
                    return ts.visitEachChild(node, visitor, context);
                }
                return (node) => ts.visitNode(node, visitor);
            }]);
        try {
            result.set(filename, Buffer.from(printer.printFile(transformed.transformed[0])));
        }
        finally {
            transformed.dispose();
        }
    }
    return result;
}
