// Build gate: no server-only configuration may reach a client artifact.
//
// WHY THIS EXISTS. WareKeep-Setup-1.0.9.exe shipped `backend/.env` verbatim to
// every customer, inside resources/backend-local-runtime.zip: the live
// DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY (which bypasses every RLS policy),
// JWT_SECRET, GROQ_API_KEY and NEOKENS_API_KEY. Nothing failed, because nothing
// was looking. Reviews are not a control; this is (Stage 13).
//
// THREE INDEPENDENT CHECKS, because each misses what the others catch:
//
//   1. VALUE CANARY (the strong one). Read the real server secrets from
//      backend/.env and assert that no artifact contains any of them. This is
//      path-agnostic and name-agnostic: it catches a leak through a route nobody
//      predicted, which is exactly how 1.0.9 happened.
//   2. KEY CHECK. No shipped .env may declare a server-only key, even set to a
//      placeholder — a key present is a key someone will later fill in.
//   3. SHAPE CHECK. Credential-shaped strings (DB DSNs, service_role JWTs,
//      provider keys) in artifacts, for secrets this machine does not have and
//      so cannot canary — e.g. a CI box, or a value added after this was written.
//
// The classification comes from ARCHITECTURE.md's configuration split:
// client-safe = VITE_BACKEND_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
// VITE_APP_VERSION. The anon key is public BY DESIGN (RLS-gated), so it is not
// a finding. Everything in the server-only column is.
//
// This script NEVER prints a secret value: findings name the key and the file.
//
// Usage: node scripts/assert-client-artifacts-clean.mjs <dir-or-file>...
//        (no args => scan the default client artifact set)
import fs from 'node:fs';
import path from 'node:path';
const projectRoot = process.cwd();
// ARCHITECTURE.md server-only column + the legacy backend's own privileged keys.
const SERVER_ONLY_KEYS = [
    'DATABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_JWT_SECRET',
    'JWT_SECRET',
    'GROQ_API_KEY',
    'NEOKENS_API_KEY',
    'SUPABASE_JWKS_URL',
    'FILES_ROOT',
    'DB_PASSWORD',
    'DB_USER',
    'CONTROL_ARTIFACT_SIGNING_SECRET',
    'FASTSPRING_WEBHOOK_SIGNATURE_SECRET',
    'FASTSPRING_WEBHOOK_PASSWORD',
    'SMTP_PASS',
];
// A value shorter than this is a flag or a placeholder ('1', 'local'), not a
// secret; canarying it would match everywhere and drown the signal.
const MIN_CANARY_LENGTH = 12;
const SHAPE_RULES = [
    { name: 'PostgreSQL/MySQL connection string', re: /\b(?:postgres(?:ql)?|mysql|mariadb):\/\/[^\s"'<>]{8,}/i },
    { name: 'Groq API key', re: /\bgsk_[A-Za-z0-9]{20,}/ },
    { name: 'OpenAI-style API key', re: /\bsk-[A-Za-z0-9]{20,}/ },
    // Supabase's NEW key system: sb_secret_… is server-only; sb_publishable_… is client-safe by design
    // (it replaces the anon key), so only the secret form is a finding. Shape-matched as well as
    // value-canaried because a build machine without backend/.env has no canary to compare against.
    { name: 'Supabase secret API key (sb_secret_)', re: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
    { name: 'Supabase service_role JWT', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ },
];
const SKIP_DIRS = new Set(['node_modules', '.venv-faster-whisper', '.git']);
const MAX_SCAN_BYTES = 8 * 1024 * 1024;
const parseEnv = (raw) => {
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0)
            continue;
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        out[trimmed.slice(0, eq).trim()] = value;
    }
    return out;
};
// Decode a JWT's role claim so an anon key (client-safe by design) is not
// reported as a leak alongside a service_role key.
const jwtRole = (token) => {
    try {
        const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
        return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')).role || null;
    }
    catch {
        return null;
    }
};
const buildCanaries = () => {
    const canaries = [];
    const envPath = path.join(projectRoot, 'backend', '.env');
    if (!fs.existsSync(envPath)) {
        console.warn('[artifact-gate] backend/.env absent — value-canary check skipped (key + shape checks still run).');
        return canaries;
    }
    const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
    for (const key of SERVER_ONLY_KEYS) {
        const value = env[key];
        if (typeof value === 'string' && value.length >= MIN_CANARY_LENGTH) {
            canaries.push({ key, value });
        }
    }
    return canaries;
};
const walk = (target, files = []) => {
    let stat;
    try {
        stat = fs.statSync(target);
    }
    catch {
        return files;
    }
    if (stat.isFile()) {
        files.push(target);
        return files;
    }
    if (!stat.isDirectory())
        return files;
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
        const full = path.join(target, entry.name);
        if (entry.isDirectory()) {
            // Vendor trees are skipped for speed, but an .env inside one still ships,
            // so those are collected explicitly below.
            if (SKIP_DIRS.has(entry.name)) {
                collectEnvFiles(full, files);
                continue;
            }
            walk(full, files);
        }
        else if (entry.isFile()) {
            files.push(full);
        }
    }
    return files;
};
const collectEnvFiles = (dir, files) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory())
            collectEnvFiles(full, files);
        else if (entry.name === '.env' || entry.name.startsWith('.env.'))
            files.push(full);
    }
};
const readTextFile = (file) => {
    try {
        if (fs.statSync(file).size > MAX_SCAN_BYTES)
            return null;
        return fs.readFileSync(file, 'utf8');
    }
    catch {
        return null;
    }
};
const scan = (targets) => {
    const canaries = buildCanaries();
    const findings = [];
    let scanned = 0;
    let skippedLarge = 0;
    for (const target of targets) {
        if (!fs.existsSync(target))
            continue;
        for (const file of walk(target)) {
            const text = readTextFile(file);
            if (text === null) {
                // A file over MAX_SCAN_BYTES is a real blind spot (a secret in a big bundle would evade the
                // canary/shape pass), so surface it rather than silently skipping — the operator can then
                // widen the cap or inspect it. Unreadable files (permission/binary) are not counted.
                try {
                    if (fs.statSync(file).size > MAX_SCAN_BYTES)
                        skippedLarge += 1;
                }
                catch { /* unreadable */ }
                continue;
            }
            scanned += 1;
            const rel = path.relative(projectRoot, file) || file;
            const base = path.basename(file);
            // 1. Value canary.
            for (const { key, value } of canaries) {
                if (text.includes(value)) {
                    findings.push(`${rel}: contains the live value of ${key} (server-only)`);
                }
            }
            // 2. Key check on any shipped env file.
            if (base === '.env' || base.startsWith('.env.')) {
                const env = parseEnv(text);
                for (const key of SERVER_ONLY_KEYS) {
                    if (Object.prototype.hasOwnProperty.call(env, key)) {
                        findings.push(`${rel}: declares server-only key ${key}`);
                    }
                }
            }
            // 3. Shape check.
            for (const rule of SHAPE_RULES) {
                const match = text.match(rule.re);
                if (!match)
                    continue;
                if (rule.name.includes('JWT')) {
                    const role = jwtRole(match[0]);
                    // anon is public by design (ARCHITECTURE.md); anything else is not.
                    if (role === 'anon' || role === null)
                        continue;
                    findings.push(`${rel}: contains a Supabase JWT with role=${role} (server-only)`);
                    continue;
                }
                findings.push(`${rel}: contains a credential-shaped string (${rule.name})`);
            }
        }
    }
    return { findings: [...new Set(findings)], scanned, skippedLarge, canaryCount: canaries.length };
};
const DEFAULT_TARGETS = [
    path.join(projectRoot, 'dist'),
    path.join(projectRoot, 'dist-admin'),
    path.join(projectRoot, '.codex-tmp', 'electron-local-backend'),
];
const targets = process.argv.slice(2).map((a) => path.resolve(projectRoot, a));
const scanTargets = targets.length > 0 ? targets : DEFAULT_TARGETS;
const existing = scanTargets.filter((t) => fs.existsSync(t));
if (existing.length === 0) {
    console.error('[artifact-gate] FAIL: none of the requested artifact paths exist — nothing was verified.');
    console.error('[artifact-gate] A gate that silently passes because it found nothing to check is not a gate.');
    console.error(scanTargets.map((t) => `  - ${path.relative(projectRoot, t) || t}`).join('\n'));
    process.exit(1);
}
const { findings, scanned, skippedLarge, canaryCount } = scan(existing);
console.info(`[artifact-gate] scanned ${scanned} file(s) across ${existing.length} artifact path(s); ${canaryCount} value canaries active.`);
if (skippedLarge > 0) {
    console.warn(`[artifact-gate] WARNING: ${skippedLarge} file(s) exceeded ${MAX_SCAN_BYTES} bytes and were NOT scanned — a secret inside one would evade this gate. Widen MAX_SCAN_BYTES or inspect them.`);
}
// Anti-vacuity, second layer: the paths existed but held nothing readable to scan (e.g. an empty
// build dir). A gate that passes because it scanned zero files is not a gate — fail closed.
if (scanned === 0) {
    console.error('[artifact-gate] FAIL: the requested artifact path(s) exist but contained no scannable file — nothing was verified.');
    console.error('[artifact-gate] A gate that silently passes because it found nothing to check is not a gate.');
    process.exit(1);
}
if (findings.length > 0) {
    console.error('\n[artifact-gate] FAIL — server-only configuration found in client artifacts:\n');
    for (const finding of findings)
        console.error(`  ✗ ${finding}`);
    console.error('\nServer configuration belongs only in the server environment on the hosting');
    console.error('(cPanel app env / ~/.warekeep-api.env). Client builds receive only the values');
    console.error('ARCHITECTURE.md lists as client-safe. See scripts/run-electron-build.mjs');
    console.error('EMBEDDED_BACKEND_ENV for the allowlist the desktop bundle is built from.\n');
    process.exit(1);
}
console.info('[artifact-gate] PASS — no server-only configuration in client artifacts.');
