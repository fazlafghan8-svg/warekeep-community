import path from 'node:path';
import ts from 'typescript';
const SOURCE_PATTERN = /\.(?:[cm]?js|jsx|tsx?)$/;
const VIRTUAL_ROOT = '/__warekeep_community__/';
const slash = (value) => value.replace(/\\/g, '/');
const UNKNOWN = Symbol('unknown');
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
const F = ts.factory;
const COMMUNITY_FACTS = [
    { kind: 'call', importFrom: 'src/services/communityWorkspace.ts', exportName: 'isLocalOnlyProfile', value: true },
    { file: 'src/App.tsx', kind: 'call', importFrom: 'src/services/guestPolicy.ts', exportName: 'isGuestProfile', value: false },
    { file: 'src/App.tsx', kind: 'call', importFrom: 'src/utils/warehouseBackendPolicy.ts', exportName: 'shouldUseWarehouseBackendForProfile', value: false },
    { file: 'src/App.tsx', kind: 'call', importFrom: 'src/services/syncConfig.ts', exportName: 'isBackendV2SyncEnabled', value: false },
    { file: 'src/App.tsx', kind: 'call', importFrom: 'src/services/healthMonitorConfig.ts', exportName: 'isAutoHealthCheckEnabled', value: false },
    ...['isCloudSyncAllowed', 'shouldUseWarehouseBackend', 'shouldUseWarehouseBackendForProfile', 'shouldCaptureWarehouseMutation', 'hasImmediateCloudSyncWork', 'shouldCheckBackendReachability', 'checkBackendReachability', 'markSyncReadyIfIdle'].map((localName) => ({ file: 'src/App.tsx', kind: 'call', localName, ownerName: 'App', value: false })),
    { file: 'src/App.tsx', kind: 'call', localName: 'shouldRouteWriteLocally', ownerName: 'App', value: true },
    { file: 'src/App.tsx', kind: 'value', localName: 'isGuestTrial', ownerName: 'App', value: false },
];
const primitive = (value) => value === true ? F.createTrue()
    : value === false ? F.createFalse()
        : value === null ? F.createNull()
            : typeof value === 'number' ? !Number.isFinite(value)
                ? F.createParenthesizedExpression(F.createBinaryExpression(Number.isNaN(value) ? F.createNumericLiteral(0) : value < 0 ? F.createPrefixUnaryExpression(ts.SyntaxKind.MinusToken, F.createNumericLiteral(1)) : F.createNumericLiteral(1), ts.SyntaxKind.SlashToken, F.createNumericLiteral(0)))
                : value < 0 || Object.is(value, -0)
                    ? F.createPrefixUnaryExpression(ts.SyntaxKind.MinusToken, F.createNumericLiteral(-value))
                    : F.createNumericLiteral(value)
                : F.createStringLiteral(value);
const unwrap = (node) => {
    while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node))
        node = node.expression;
    return node;
};
const withEffects = (effects, value) => effects.reduceRight((next, effect) => F.createParenthesizedExpression(F.createBinaryExpression(effect, ts.SyntaxKind.CommaToken, next)), value);
const bindingNames = (name) => ts.isIdentifier(name) ? [name] : name.elements.flatMap((element) => ts.isOmittedExpression(element) ? [] : bindingNames(element.name));
const exported = (node) => node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword || modifier.kind === ts.SyntaxKind.DefaultKeyword);
function resolvedSource(filename, moduleName, contents) {
    if (!moduleName.startsWith('.') && !moduleName.startsWith('@/'))
        return moduleName;
    const base = moduleName.startsWith('@/') ? `src/${moduleName.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(filename), moduleName));
    return [base, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js'].map((extension) => base + extension)].find((candidate) => contents.has(candidate)) || base;
}
function virtualProgram(contents) {
    const parsed = new Map();
    for (const [filename, data] of contents) {
        if (SOURCE_PATTERN.test(filename))
            parsed.set(VIRTUAL_ROOT + filename, ts.createSourceFile(VIRTUAL_ROOT + filename, data.toString('utf8'), ts.ScriptTarget.Latest, true));
    }
    const options = { allowJs: true, noLib: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve, moduleResolution: ts.ModuleResolutionKind.Bundler };
    const host = {
        getSourceFile: (filename) => parsed.get(slash(filename)),
        getDefaultLibFileName: () => '', writeFile: () => { },
        getCurrentDirectory: () => VIRTUAL_ROOT,
        getDirectories: () => [], directoryExists: () => true,
        fileExists: (filename) => parsed.has(slash(filename)),
        readFile: (filename) => contents.get(slash(filename).replace(VIRTUAL_ROOT, ''))?.toString('utf8'),
        getCanonicalFileName: slash, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
        resolveModuleNames: (names, filename) => names.map((name) => {
            const resolved = resolvedSource(filename.slice(VIRTUAL_ROOT.length), name, contents);
            if (!contents.has(resolved) || !SOURCE_PATTERN.test(resolved))
                return undefined;
            return { resolvedFileName: VIRTUAL_ROOT + resolved, extension: resolved.endsWith('.tsx') ? ts.Extension.Tsx : resolved.endsWith('.ts') ? ts.Extension.Ts : ts.Extension.Js };
        }),
    };
    const program = ts.createProgram({ rootNames: [...parsed.keys()], options, host });
    return { program, checker: program.getTypeChecker() };
}
function isDeclarationName(node) {
    const parent = node.parent;
    if (!parent)
        return false;
    if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent) || ts.isImportEqualsDeclaration(parent))
        return true;
    if (ts.isBindingElement(parent))
        return parent.name === node || parent.propertyName === node;
    return parent.name === node && (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isClassDeclaration(parent) || ts.isClassExpression(parent) || ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent) || ts.isEnumDeclaration(parent) || ts.isModuleDeclaration(parent) || ts.isTypeParameterDeclaration(parent));
}
function isValueReference(node) {
    if (isDeclarationName(node))
        return false;
    const parent = node.parent;
    if (!parent)
        return false;
    if ((ts.isPropertyAccessExpression(parent) && parent.name === node) || (ts.isQualifiedName(parent) && parent.right === node))
        return false;
    if ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertySignature(parent) || ts.isMethodSignature(parent)) && parent.name === node)
        return false;
    if (ts.isExportSpecifier(parent) || ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent))
        return false;
    if ((ts.isJsxOpeningElement(parent) || ts.isJsxClosingElement(parent) || ts.isJsxSelfClosingElement(parent)) && parent.tagName === node)
        return false;
    for (let ancestor = parent; ancestor && !ts.isStatement(ancestor) && !ts.isSourceFile(ancestor); ancestor = ancestor.parent) {
        if (ts.isTypeNode(ancestor))
            return false;
    }
    return true;
}
function referenceSymbol(node, checker) {
    if (ts.isExportSpecifier(node.parent) && !node.parent.parent.parent.moduleSpecifier)
        return checker.getExportSpecifierLocalTargetSymbol(node.parent);
    if (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node)
        return checker.getShorthandAssignmentValueSymbol(node.parent);
    return checker.getSymbolAtLocation(node);
}
function isTopLevelOwner(node, expectedName) {
    for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
        if (!ts.isFunctionLike(ancestor))
            continue;
        if (ts.isFunctionDeclaration(ancestor))
            return ancestor.name?.text === expectedName && ts.isSourceFile(ancestor.parent);
        const declaration = ancestor.parent;
        return ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name) && declaration.name.text === expectedName && ts.isVariableDeclarationList(declaration.parent) && ts.isVariableStatement(declaration.parent.parent) && ts.isSourceFile(declaration.parent.parent.parent);
    }
    return false;
}
function factsForFile(source, filename, checker, contents, facts) {
    const values = new Map();
    const calls = new Map();
    const fileFacts = facts.filter((fact) => !fact.file || slash(fact.file) === filename);
    const add = (node, fact) => {
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol)
            (fact.kind === 'call' ? calls : values).set(symbol, !!fact.value);
    };
    const visit = (node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.importClause && !node.importClause.isTypeOnly) {
            const module = resolvedSource(filename, node.moduleSpecifier.text, contents);
            const imports = node.importClause.namedBindings;
            if (imports && ts.isNamedImports(imports))
                for (const specifier of imports.elements) {
                    if (specifier.isTypeOnly)
                        continue;
                    const imported = (specifier.propertyName || specifier.name).text;
                    if (module === 'src/config/edition.ts' && imported === 'IS_COMMUNITY_EDITION')
                        add(specifier.name, { kind: 'value', value: true });
                    for (const fact of fileFacts)
                        if (fact.importFrom && resolvedSource(filename, fact.importFrom, contents) === module && fact.exportName === imported)
                            add(specifier.name, fact);
                }
        }
        if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
            if (filename === 'src/config/edition.ts' && ts.isVariableDeclaration(node) && node.name.text === 'IS_COMMUNITY_EDITION' && ts.isVariableStatement(node.parent.parent) && ts.isSourceFile(node.parent.parent.parent)) {
                add(node.name, { kind: 'value', value: true });
            }
            else if (ts.isVariableDeclaration(node) && (node.parent.flags & ts.NodeFlags.Const) && node.initializer) {
                const constant = valueSummary(node.initializer, () => false);
                if (typeof constant.value === 'boolean' && !constant.effects.length)
                    add(node.name, { kind: 'value', value: constant.value });
            }
            for (const fact of fileFacts) {
                if (!fact.importFrom && fact.localName === node.name.text && (fact.ownerName === undefined || isTopLevelOwner(node, fact.ownerName)))
                    add(node.name, fact);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return { values, calls };
}
function importSymbols(source, checker) {
    const hooks = new Map();
    const namespaces = new Set();
    for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== 'react' || !statement.importClause)
            continue;
        if (statement.importClause.name)
            namespaces.add(checker.getSymbolAtLocation(statement.importClause.name));
        const bindings = statement.importClause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings))
            namespaces.add(checker.getSymbolAtLocation(bindings.name));
        if (bindings && ts.isNamedImports(bindings))
            for (const specifier of bindings.elements)
                hooks.set(checker.getSymbolAtLocation(specifier.name), (specifier.propertyName || specifier.name).text);
    }
    return { hooks, namespaces };
}
function hookName(node, checker, react) {
    const callee = unwrap(node.expression);
    if (ts.isIdentifier(callee))
        return react.hooks.get(checker.getSymbolAtLocation(callee));
    if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && react.namespaces.has(checker.getSymbolAtLocation(callee.expression)))
        return callee.name.text;
    return undefined;
}
function primitiveOperand(node, checker) {
    node = unwrap(node);
    if (ts.isLiteralExpression(node) || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind))
        return true;
    const type = checker.getTypeAtLocation(node);
    const safe = (candidate) => candidate.isUnion?.() ? candidate.types.every(safe) : !!(candidate.flags & (ts.TypeFlags.NumberLike | ts.TypeFlags.StringLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike | ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void));
    return safe(type);
}
function isPure(node, options, checker, react) {
    node = unwrap(node);
    if (ts.isIdentifier(node) || ts.isLiteralExpression(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node))
        return true;
    if ([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword, ts.SyntaxKind.ThisKeyword].includes(node.kind))
        return true;
    if (ts.isPrefixUnaryExpression(node))
        return ![ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator) && isPure(node.operand, options, checker, react) && (node.operator === ts.SyntaxKind.ExclamationToken || primitiveOperand(node.operand, checker));
    if (ts.isVoidExpression(node) || ts.isTypeOfExpression(node))
        return isPure(node.expression, options, checker, react);
    if (ts.isBinaryExpression(node)) {
        const operator = node.operatorToken.kind;
        const noCoercion = [ts.SyntaxKind.CommaToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(operator);
        return !(operator >= ts.SyntaxKind.FirstAssignment && operator <= ts.SyntaxKind.LastAssignment) && operator !== ts.SyntaxKind.InKeyword && operator !== ts.SyntaxKind.InstanceOfKeyword && isPure(node.left, options, checker, react) && isPure(node.right, options, checker, react) && (noCoercion || (primitiveOperand(node.left, checker) && primitiveOperand(node.right, checker)));
    }
    if (ts.isConditionalExpression(node))
        return [node.condition, node.whenTrue, node.whenFalse].every((part) => isPure(part, options, checker, react));
    if (ts.isArrayLiteralExpression(node))
        return node.elements.every((element) => !ts.isSpreadElement(element) && (ts.isOmittedExpression(element) || isPure(element, options, checker, react)));
    if (ts.isObjectLiteralExpression(node))
        return node.properties.every((property) => {
            if (ts.isShorthandPropertyAssignment(property))
                return !property.objectAssignmentInitializer;
            if (ts.isSpreadAssignment(property))
                return false;
            if (property.name && ts.isComputedPropertyName(property.name) && (!isPure(property.name.expression, options, checker, react) || !primitiveOperand(property.name.expression, checker)))
                return false;
            return ts.isPropertyAssignment(property) ? isPure(property.initializer, options, checker, react) : ts.isMethodDeclaration(property) || ts.isGetAccessorDeclaration(property) || ts.isSetAccessorDeclaration(property);
        });
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
        return !!options.assumePropertyReadsPure && isPure(node.expression, options, checker, react) && (!ts.isElementAccessExpression(node) || isPure(node.argumentExpression, options, checker, react));
    if (ts.isCallExpression(node)) {
        const hook = hookName(node, checker, react);
        if (hook === 'useCallback')
            return node.arguments.every((argument) => !ts.isSpreadElement(argument) && isPure(argument, options, checker, react));
        if (hook === 'useRef')
            return node.arguments.every((argument) => !ts.isSpreadElement(argument) && isPure(argument, options, checker, react));
        if (hook === 'useState' && node.arguments.length <= 1) {
            const argument = node.arguments[0] && unwrap(node.arguments[0]);
            if (!argument)
                return true;
            if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument))
                return pureFunctionBody(argument.body, options, checker, react);
            return isPure(argument, options, checker, react);
        }
    }
    return false;
}
function pureFunctionBody(body, options, checker, react) {
    if (!ts.isBlock(body))
        return isPure(body, options, checker, react);
    return body.statements.every((statement) => ts.isReturnStatement(statement) ? !statement.expression || isPure(statement.expression, options, checker, react) : ts.isVariableStatement(statement) && statement.declarationList.declarations.every((declaration) => ts.isIdentifier(declaration.name) && (!declaration.initializer || isPure(declaration.initializer, options, checker, react))));
}
function valueSummary(node, pure) {
    node = unwrap(node);
    if (node.kind === ts.SyntaxKind.TrueKeyword)
        return { value: true, effects: [] };
    if (node.kind === ts.SyntaxKind.FalseKeyword)
        return { value: false, effects: [] };
    if (node.kind === ts.SyntaxKind.NullKeyword)
        return { value: null, effects: [] };
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
        return { value: node.text, effects: [] };
    if (ts.isNumericLiteral(node))
        return { value: Number(node.text), effects: [] };
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.CommaToken) {
        const right = valueSummary(node.right, pure);
        if (right.value !== UNKNOWN)
            return { value: right.value, effects: [...(pure(node.left) ? [] : [node.left]), ...right.effects] };
    }
    if (ts.isPrefixUnaryExpression(node)) {
        const operand = valueSummary(node.operand, pure);
        if (operand.value !== UNKNOWN) {
            if (node.operator === ts.SyntaxKind.ExclamationToken)
                return { value: !operand.value, effects: operand.effects };
            if (node.operator === ts.SyntaxKind.PlusToken)
                return { value: +operand.value, effects: operand.effects };
            if (node.operator === ts.SyntaxKind.MinusToken)
                return { value: -operand.value, effects: operand.effects };
        }
    }
    return { value: UNKNOWN, effects: [] };
}
function truthSummary(node, pure) {
    const known = valueSummary(node, pure);
    if (known.value !== UNKNOWN)
        return { value: !!known.value, effects: known.effects };
    node = unwrap(node);
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
        const operand = truthSummary(node.operand, pure);
        if (operand.value !== UNKNOWN)
            return { value: !operand.value, effects: operand.effects };
    }
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)) {
        const left = truthSummary(node.left, pure);
        const right = truthSummary(node.right, pure);
        const and = node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken;
        if (left.value !== UNKNOWN) {
            if ((and && !left.value) || (!and && left.value))
                return left;
            if (right.value !== UNKNOWN)
                return { value: right.value, effects: [...left.effects, ...right.effects] };
        }
        if ((and && right.value === false) || (!and && right.value === true))
            return { value: right.value, effects: pure(node) ? [] : [node] };
    }
    return { value: UNKNOWN, effects: [] };
}
function hoistedVariables(nodes) {
    const names = new Set();
    const visit = (node) => {
        if (ts.isFunctionLike(node) || ts.isClassLike(node))
            return;
        if (ts.isVariableDeclarationList(node) && !(node.flags & ts.NodeFlags.BlockScoped))
            for (const declaration of node.declarations)
                for (const name of bindingNames(declaration.name))
                    names.add(name.text);
        ts.forEachChild(node, visit);
    };
    for (const node of nodes)
        visit(node);
    return names.size ? F.createVariableStatement(undefined, F.createVariableDeclarationList([...names].map((name) => F.createVariableDeclaration(name)))) : null;
}
function terminates(node) {
    if (ts.isReturnStatement(node) || ts.isThrowStatement(node))
        return true;
    if (ts.isBlock(node))
        return node.statements.some(terminates);
    return ts.isIfStatement(node) && !!node.elseStatement && terminates(node.thenStatement) && terminates(node.elseStatement);
}
function retainsLexicalBinding(statement, tail, source, checker) {
    const declarations = ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.BlockScoped)
        ? statement.declarationList.declarations.flatMap((declaration) => bindingNames(declaration.name))
        : (ts.isClassDeclaration(statement) && statement.name ? [statement.name] : []);
    if (!declarations.length)
        return false;
    const symbols = new Set(declarations.map((name) => checker.getSymbolAtLocation(name)).filter(Boolean));
    const start = tail[0].pos;
    const end = tail.at(-1).end;
    let referenced = false;
    const visit = (node) => {
        if (referenced)
            return;
        if (ts.isIdentifier(node) && !isDeclarationName(node) && (node.pos < start || node.end > end) && symbols.has(referenceSymbol(node, checker)))
            referenced = true;
        ts.forEachChild(node, visit);
    };
    visit(source);
    return referenced;
}
function foldSource(source, filename, checker, contents, options) {
    const facts = factsForFile(source, filename, checker, contents, [...COMMUNITY_FACTS, ...(options.booleanFacts || [])]);
    const react = importSymbols(source, checker);
    const pure = (node) => isPure(node, options, checker, react);
    const transformed = ts.transform(source, [(context) => {
            const visit = (original) => {
                if (ts.isShorthandPropertyAssignment(original)) {
                    const symbol = checker.getShorthandAssignmentValueSymbol(original);
                    if (facts.values.has(symbol))
                        return F.createPropertyAssignment(original.name, primitive(facts.values.get(symbol)));
                }
                if (ts.isIdentifier(original) && isValueReference(original)) {
                    const symbol = referenceSymbol(original, checker);
                    if (facts.values.has(symbol))
                        return primitive(facts.values.get(symbol));
                }
                let node = ts.visitEachChild(original, visit, context);
                if (filename === 'src/config/edition.ts' && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'IS_COMMUNITY_EDITION' && ts.isVariableStatement(original.parent.parent) && ts.isSourceFile(original.parent.parent.parent))
                    node = F.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, F.createTrue());
                if (ts.isCallExpression(original) && ts.isIdentifier(unwrap(original.expression))) {
                    const symbol = checker.getSymbolAtLocation(unwrap(original.expression));
                    if (facts.calls.has(symbol) && !node.arguments.some(ts.isSpreadElement))
                        return withEffects(node.arguments.filter((argument) => !pure(argument)), primitive(facts.calls.get(symbol)));
                }
                if (ts.isPrefixUnaryExpression(node)) {
                    const result = valueSummary(node, pure);
                    if (result.value !== UNKNOWN)
                        return withEffects(result.effects, primitive(result.value));
                }
                if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) {
                    const left = valueSummary(node.left, pure);
                    if (left.value !== UNKNOWN) {
                        const rightSelected = node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? !!left.value : node.operatorToken.kind === ts.SyntaxKind.BarBarToken ? !left.value : left.value === null;
                        return withEffects(left.effects, rightSelected ? node.right : primitive(left.value));
                    }
                }
                if (ts.isConditionalExpression(node)) {
                    const condition = truthSummary(node.condition, pure);
                    if (condition.value !== UNKNOWN)
                        return withEffects(condition.effects, condition.value ? node.whenTrue : node.whenFalse);
                }
                if (ts.isIfStatement(node)) {
                    const condition = truthSummary(node.expression, pure);
                    if (condition.value !== UNKNOWN) {
                        const discarded = condition.value ? node.elseStatement : node.thenStatement;
                        const selected = condition.value ? node.thenStatement : node.elseStatement;
                        const hoisted = discarded && hoistedVariables([discarded]);
                        const statements = [...condition.effects.map((effect) => F.createExpressionStatement(effect)), ...(hoisted ? [hoisted] : []), ...(selected ? [selected] : [])];
                        return !statements.length ? F.createEmptyStatement() : statements.length === 1 ? statements[0] : F.createBlock(statements, true);
                    }
                }
                if (ts.isBlock(node)) {
                    const statements = node.statements.filter((statement) => !ts.isEmptyStatement(statement));
                    const index = statements.findIndex(terminates);
                    if (index >= 0 && index < statements.length - 1) {
                        const tail = statements.slice(index + 1);
                        const hoisted = hoistedVariables(tail);
                        const functions = tail.filter(ts.isFunctionDeclaration);
                        const lexical = tail.filter((statement) => retainsLexicalBinding(statement, tail, source, checker));
                        return F.updateBlock(node, [...statements.slice(0, index), ...(hoisted ? [hoisted] : []), ...functions, statements[index], ...lexical]);
                    }
                    if (statements.length !== node.statements.length)
                        return F.updateBlock(node, statements);
                }
                return node;
            };
            return (node) => ts.visitNode(node, visit);
        }]);
    try {
        return printer.printFile(transformed.transformed[0]);
    }
    finally {
        transformed.dispose();
    }
}
function referenceCounts(source, checker) {
    const counts = new Map();
    const visit = (node) => {
        if (ts.isIdentifier(node) && !isDeclarationName(node)) {
            const symbol = referenceSymbol(node, checker);
            if (symbol)
                counts.set(symbol, (counts.get(symbol) || 0) + 1);
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return counts;
}
function noOpEffect(callback) {
    callback = unwrap(callback);
    if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))
        return false;
    if (callback.asteriskToken || callback.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword))
        return false;
    if (!ts.isBlock(callback.body))
        return ts.isVoidExpression(callback.body) && ts.isNumericLiteral(unwrap(callback.body.expression));
    return callback.body.statements.every((statement) => ts.isEmptyStatement(statement) || (ts.isReturnStatement(statement) && !statement.expression));
}
function pruneSource(source, filename, checker, contents, options) {
    const counts = referenceCounts(source, checker);
    const react = importSymbols(source, checker);
    const pure = (node) => isPure(node, options, checker, react);
    const used = (name) => (counts.get(checker.getSymbolAtLocation(name)) || 0) > 0;
    const transformed = ts.transform(source, [(context) => {
            const visit = (node) => {
                if (ts.isImportDeclaration(node) && node.importClause) {
                    const clause = node.importClause;
                    const name = clause.name && used(clause.name) ? clause.name : undefined;
                    let bindings = clause.namedBindings;
                    if (bindings && ts.isNamespaceImport(bindings) && !used(bindings.name))
                        bindings = undefined;
                    if (bindings && ts.isNamedImports(bindings)) {
                        const elements = bindings.elements.filter((specifier) => used(specifier.name));
                        bindings = elements.length ? F.updateNamedImports(bindings, elements) : undefined;
                    }
                    if (!name && !bindings) {
                        const drop = options.dropUnusedImportModules === true || options.dropUnusedImportModules?.includes?.(resolvedSource(filename, node.moduleSpecifier.text, contents));
                        if (clause.isTypeOnly || (clause.namedBindings && ts.isNamedImports(clause.namedBindings) && !clause.name && clause.namedBindings.elements.every((specifier) => specifier.isTypeOnly)) || drop)
                            return undefined;
                        return F.updateImportDeclaration(node, node.modifiers, undefined, node.moduleSpecifier, node.attributes);
                    }
                    return F.updateImportDeclaration(node, node.modifiers, F.updateImportClause(clause, clause.isTypeOnly, name, bindings), node.moduleSpecifier, node.attributes);
                }
                if (ts.isVariableStatement(node) && !exported(node) && !(ts.isSourceFile(node.parent) && !ts.isExternalModule(source))) {
                    const declarations = node.declarationList.declarations.filter((declaration) => {
                        // Destructuring may call getters or iterate values. React state tuples
                        // are a narrowly recognized exception; arbitrary patterns stay intact.
                        const patternSafe = ts.isIdentifier(declaration.name) || (ts.isArrayBindingPattern(declaration.name) && declaration.initializer && ts.isCallExpression(unwrap(declaration.initializer)) && hookName(unwrap(declaration.initializer), checker, react) === 'useState' && declaration.name.elements.every((element) => ts.isOmittedExpression(element) || (!element.dotDotDotToken && !element.initializer && ts.isIdentifier(element.name))));
                        return !patternSafe || bindingNames(declaration.name).some(used) || (declaration.initializer && !pure(declaration.initializer));
                    });
                    return declarations.length ? F.updateVariableStatement(node, node.modifiers, F.updateVariableDeclarationList(node.declarationList, declarations)) : undefined;
                }
                if (ts.isFunctionDeclaration(node) && node.name && !exported(node) && !used(node.name) && !(ts.isSourceFile(node.parent) && !ts.isExternalModule(source)))
                    return undefined;
                if (ts.isExpressionStatement(node) && ts.isCallExpression(unwrap(node.expression))) {
                    const call = unwrap(node.expression);
                    if (hookName(call, checker, react) === 'useEffect' && call.arguments.length >= 1 && noOpEffect(call.arguments[0]) && call.arguments.slice(1).every(pure))
                        return undefined;
                }
                return ts.visitEachChild(node, visit, context);
            };
            return (node) => ts.visitNode(node, visit);
        }]);
    try {
        return printer.printFile(transformed.transformed[0]);
    }
    finally {
        transformed.dispose();
    }
}
/**
 * Specialize a publication copy without changing the mixed commercial checkout.
 * Facts match bound symbols, not text; ownerName selects a top-level function's local
 * binding and importFrom/exportName selects a named import. No file is written.
 *
 * Empty runtime imports preserve module initialization by default. A publisher
 * may explicitly set dropUnusedImportModules=true (or a list of resolved source
 * paths) after choosing which commercial modules must leave the public edition.
 * assumePropertyReadsPure is off by default: getters can have side effects.
 */
export function specializeCommunitySources(input, options = {}) {
    let contents = new Map([...input].map(([filename, data]) => [slash(filename), Buffer.from(data)]));
    const passes = options.maxPasses ?? 16;
    if (!Number.isInteger(passes) || passes < 1 || passes > 64)
        throw new Error('maxPasses must be an integer between 1 and 64.');
    for (let pass = 0; pass < passes; pass++) {
        const { program, checker } = virtualProgram(contents);
        let changed = false;
        const folded = new Map(contents);
        for (const source of program.getSourceFiles()) {
            const filename = source.fileName.slice(VIRTUAL_ROOT.length);
            if (/\.(?:node-)?test\.(?:[cm]?js|jsx|tsx?)$/.test(filename))
                continue;
            const data = Buffer.from(foldSource(source, filename, checker, contents, options));
            if (!data.equals(contents.get(filename)))
                changed = true;
            folded.set(filename, data);
        }
        const pruner = virtualProgram(folded);
        const pruned = new Map(folded);
        for (const source of pruner.program.getSourceFiles()) {
            const filename = source.fileName.slice(VIRTUAL_ROOT.length);
            if (/\.(?:node-)?test\.(?:[cm]?js|jsx|tsx?)$/.test(filename))
                continue;
            const data = Buffer.from(pruneSource(source, filename, pruner.checker, folded, options));
            if (!data.equals(folded.get(filename)))
                changed = true;
            pruned.set(filename, data);
        }
        contents = pruned;
        if (!changed)
            return contents;
    }
    return contents;
}
