// Only the public package copy is changed. Retained lock entries keep their
// exact versions, sources and integrity; npm ci must still verify the snapshot.
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const FLAGS = ['dev', 'optional', 'devOptional', 'peer'];
const DEFAULT_REMOVED_DEPENDENCIES = ['@supabase/supabase-js'];
function validPackageName(name) {
    if (typeof name !== 'string' || [...name].some(character => character.charCodeAt(0) <= 0x1f || character.charCodeAt(0) === 0x7f) || !/^(?:@[^\s/@\\:]+\/)?[^\s/@\\:]+$/.test(name))
        return false;
    return !name.split('/').some(part => part === '.' || part === '..');
}
function validPackagePath(filename) {
    if (!filename.startsWith('node_modules/') || filename.includes('\\'))
        return false;
    return filename.slice('node_modules/'.length).split('/node_modules/').every(validPackageName);
}
// Bundled children have no independent download or integrity entry. Their
// bytes are verified by npm ci against the containing tarball's strong SRI.
function validBundleIntegrity(integrity) {
    if (typeof integrity !== 'string' || !integrity.trim())
        return false;
    return integrity.trim().split(/\s+/).every(token => {
        const match = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(token);
        if (!match)
            return false;
        const digest = Buffer.from(match[2], 'base64');
        return digest.length === { sha256: 32, sha384: 48, sha512: 64 }[match[1]] && digest.toString('base64') === match[2];
    });
}
function validBundleAnchor(metadata) {
    if (typeof metadata.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(metadata.version) ||
        typeof metadata.resolved !== 'string' || !validBundleIntegrity(metadata.integrity))
        return false;
    try {
        const source = new URL(metadata.resolved);
        return ['http:', 'https:'].includes(source.protocol) && Boolean(source.hostname);
    }
    catch {
        return false;
    }
}
function dependencyEdges(metadata, isRoot) {
    const edges = new Map();
    for (const name of Object.keys(metadata.peerDependencies || {})) {
        edges.set(name, { name, peer: true, optional: metadata.peerDependenciesMeta?.[name]?.optional === true, dev: false });
    }
    if (isRoot)
        for (const name of Object.keys(metadata.devDependencies || {}))
            edges.set(name, { name, peer: false, optional: false, dev: true });
    for (const name of Object.keys(metadata.dependencies || {}))
        edges.set(name, { name, peer: false, optional: false, dev: false });
    // npm treats an optional dependency as optional even when it also appears in dependencies.
    for (const name of Object.keys(metadata.optionalDependencies || {}))
        edges.set(name, { name, peer: false, optional: true, dev: false });
    return [...edges.values()];
}
export function resolveLockedDependency(packages, packagePath, name) {
    let parent = packagePath;
    while (true) {
        const candidate = parent ? `${parent}/node_modules/${name}` : `node_modules/${name}`;
        if (Object.hasOwn(packages, candidate))
            return candidate;
        if (!parent)
            return null;
        const boundary = parent.lastIndexOf('/node_modules/');
        parent = boundary < 0 ? '' : parent.slice(0, boundary);
    }
}
function validateLock(lock) {
    if (lock?.lockfileVersion !== 3 || !lock.packages || !Object.hasOwn(lock.packages, ''))
        throw new Error('COMMUNITY_PACKAGE_REQUIRES_LOCK_V3');
    if (lock.dependencies)
        throw new Error('COMMUNITY_PACKAGE_UNSUPPORTED_LEGACY_LOCK_TREE');
    const declarations = new Map();
    for (const [filename, metadata] of Object.entries(lock.packages)) {
        if (filename && !validPackagePath(filename)) {
            throw new Error('COMMUNITY_PACKAGE_UNSUPPORTED_WORKSPACE_LOCK');
        }
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
            throw new Error('COMMUNITY_PACKAGE_INVALID_LOCK_ENTRY');
        if (metadata.link || metadata.workspaces) {
            throw new Error('COMMUNITY_PACKAGE_UNSUPPORTED_LINK_OR_BUNDLE');
        }
        if (Object.hasOwn(metadata, 'inBundle') && typeof metadata.inBundle !== 'boolean')
            throw new Error('COMMUNITY_PACKAGE_INVALID_BUNDLE_CONTENT');
        for (const field of DEPENDENCY_FIELDS) {
            if (metadata[field] && (Array.isArray(metadata[field]) || typeof metadata[field] !== 'object'))
                throw new Error('COMMUNITY_PACKAGE_INVALID_DEPENDENCY_MAP');
            if (Object.keys(metadata[field] || {}).some(name => !validPackageName(name)))
                throw new Error('COMMUNITY_PACKAGE_INVALID_DEPENDENCY_NAME');
        }
        const bundleFields = ['bundleDependencies', 'bundledDependencies'].filter(field => Object.hasOwn(metadata, field));
        if (!bundleFields.length)
            continue;
        const bundles = metadata[bundleFields[0]];
        if (!Array.isArray(bundles) || bundles.some(name => !validPackageName(name)) || new Set(bundles).size !== bundles.length ||
            (bundleFields.length === 2 && JSON.stringify(metadata.bundleDependencies) !== JSON.stringify(metadata.bundledDependencies))) {
            throw new Error('COMMUNITY_PACKAGE_INVALID_BUNDLE_DECLARATION');
        }
        if (bundles.length) {
            if (!filename)
                throw new Error('COMMUNITY_PACKAGE_INVALID_BUNDLE_ANCHOR');
            declarations.set(filename, bundles);
        }
    }
    for (const [filename, bundles] of declarations) {
        const metadata = lock.packages[filename];
        for (const name of bundles) {
            const child = lock.packages[`${filename}/node_modules/${name}`];
            if (!(Object.hasOwn(metadata.dependencies || {}, name) || Object.hasOwn(metadata.optionalDependencies || {}, name)) || child?.inBundle !== true) {
                throw new Error('COMMUNITY_PACKAGE_INVALID_BUNDLE_CONTENT');
            }
        }
    }
    const bundledChildren = new Map();
    const anchored = new Set();
    for (const [filename, bundles] of declarations) {
        const metadata = lock.packages[filename];
        if (metadata.inBundle)
            continue; // A nested bundle is covered by its outer tarball.
        if (!validBundleAnchor(metadata)) {
            throw new Error('COMMUNITY_PACKAGE_INVALID_BUNDLE_ANCHOR');
        }
        const children = new Set();
        const pending = bundles.map(name => `${filename}/node_modules/${name}`);
        while (pending.length) {
            const childPath = pending.pop();
            if (children.has(childPath))
                continue;
            children.add(childPath);
            anchored.add(childPath);
            for (const edge of dependencyEdges(lock.packages[childPath], false)) {
                const resolved = resolveLockedDependency(lock.packages, childPath, edge.name);
                if (resolved?.startsWith(`${filename}/node_modules/`) && lock.packages[resolved].inBundle === true)
                    pending.push(resolved);
            }
        }
        bundledChildren.set(filename, [...children]);
    }
    for (const [filename, metadata] of Object.entries(lock.packages)) {
        if (metadata.inBundle && !anchored.has(filename))
            throw new Error('COMMUNITY_PACKAGE_ORPHAN_BUNDLED_DEPENDENCY');
    }
    return bundledChildren;
}
// Recalculate dev/optional/peer flags as monotone reachability facts. An edge
// clears a flag when there is a path outside that class. devOptional records
// the overlap of development and optional paths, and optional peers alone
// never make a formerly unneeded package required.
function reachablePackageFlags(packages, bundledChildren) {
    const states = new Map(Object.keys(packages).map(filename => [filename, {
            extraneous: true, dev: true, optional: true, devOptional: true, peer: true,
        }]));
    states.set('', { extraneous: false, dev: false, optional: false, devOptional: false, peer: false });
    const pending = [''];
    while (pending.length) {
        const filename = pending.shift();
        const parent = states.get(filename);
        if (parent.extraneous)
            continue;
        const edges = dependencyEdges(packages[filename], filename === '');
        // All children physically travel with the verified parent tarball, even
        // when an optional peer edge alone would ordinarily be pruned. Ordinary
        // graph edges still determine their development/optional/peer flags.
        for (const resolved of bundledChildren.get(filename) || []) {
            const child = states.get(resolved);
            if (child.extraneous) {
                child.extraneous = false;
                pending.push(resolved);
            }
        }
        for (const edge of edges) {
            const resolved = resolveLockedDependency(packages, filename, edge.name);
            if (!resolved) {
                if (edge.optional)
                    continue;
                throw new Error(`COMMUNITY_PACKAGE_REQUIRED_DEPENDENCY_MISSING: ${filename || '<root>'} -> ${edge.name}`);
            }
            const child = states.get(resolved);
            let changed = false;
            const clear = (flag, condition) => {
                if (child[flag] && condition) {
                    child[flag] = false;
                    changed = true;
                }
            };
            clear('extraneous', !parent.extraneous && !(edge.peer && edge.optional));
            clear('dev', !parent.dev && !edge.dev);
            clear('optional', !parent.optional && !edge.optional);
            clear('devOptional', !parent.devOptional && !parent.dev && !parent.optional && !edge.dev && !edge.optional);
            clear('peer', !parent.peer && !edge.peer);
            if (changed)
                pending.push(resolved);
        }
    }
    for (const [filename, state] of states)
        if (filename && (state.dev || state.optional))
            state.devOptional = false;
    return states;
}
export function prepareCommunityPublicationPackage(packageJson, packageLock, { removeDependencies = DEFAULT_REMOVED_DEPENDENCIES } = {}) {
    const bundledChildren = validateLock(packageLock);
    if (!Array.isArray(removeDependencies) || removeDependencies.some(name => typeof name !== 'string' || !name))
        throw new Error('COMMUNITY_PACKAGE_INVALID_REMOVAL_LIST');
    const metadata = structuredClone(packageJson);
    const lock = structuredClone(packageLock);
    const removedNames = new Set(removeDependencies);
    const removedDependencies = [];
    for (const field of DEPENDENCY_FIELDS) {
        if (!metadata[field])
            continue;
        if (Array.isArray(metadata[field]) || typeof metadata[field] !== 'object')
            throw new Error('COMMUNITY_PACKAGE_INVALID_DEPENDENCY_MAP');
        if (Object.keys(metadata[field]).some(name => !validPackageName(name)))
            throw new Error('COMMUNITY_PACKAGE_INVALID_DEPENDENCY_NAME');
        for (const name of removedNames)
            if (Object.hasOwn(metadata[field], name)) {
                delete metadata[field][name];
                if (!removedDependencies.includes(name))
                    removedDependencies.push(name);
            }
    }
    if (metadata.peerDependenciesMeta)
        for (const name of removedNames)
            delete metadata.peerDependenciesMeta[name];
    for (const field of [...DEPENDENCY_FIELDS, 'peerDependenciesMeta']) {
        if (metadata[field])
            lock.packages[''][field] = structuredClone(metadata[field]);
        else
            delete lock.packages[''][field];
    }
    const states = reachablePackageFlags(lock.packages, bundledChildren);
    const removedPackages = [];
    for (const [filename, state] of states) {
        if (!filename)
            continue;
        if (state.extraneous) {
            delete lock.packages[filename];
            removedPackages.push(filename);
            continue;
        }
        if ([...removedNames].some(name => filename === `node_modules/${name}` || filename.endsWith(`/node_modules/${name}`))) {
            throw new Error(`COMMUNITY_CLOUD_DEPENDENCY_STILL_REQUIRED: ${filename}`);
        }
        const entry = lock.packages[filename];
        delete entry.extraneous;
        for (const flag of FLAGS) {
            if (state[flag])
                entry[flag] = true;
            else
                delete entry[flag];
        }
    }
    return {
        packageJson: metadata,
        packageLock: lock,
        removedDependencies: removedDependencies.sort(),
        removedPackages: removedPackages.sort(),
    };
}
