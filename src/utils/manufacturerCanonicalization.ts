import type { Medicine } from '../types';
type ManufacturerRecord = {
    cleanedName: string;
    cleanedLower: string;
    displayName: string;
    fingerprint: string;
    condensedKey: string;
    identityTokens: string[];
    aliases: string[];
    searchText: string;
};
export type ManufacturerDirectory = {
    canonicalNames: string[];
    aliasMap: Record<string, string>;
    records: Record<string, ManufacturerRecord>;
};
export type ManufacturerCanonicalizationResult = {
    input: string;
    cleanedValue: string;
    displayName: string;
    fingerprint: string;
    condensedKey: string;
    matchedCanonical: boolean;
    wasCanonicalized: boolean;
};
export type ManufacturerNormalizationSummary = {
    medicines: Medicine[];
    directory: ManufacturerDirectory;
    changedCount: number;
};
const COMPANY_NOISE_TOKENS = new Set([
    'co',
    'company',
    'companies',
    'corp',
    'corporation',
    'inc',
    'incorporated',
    'llc',
    'ltd',
    'limited',
    'pharma',
    'pharm',
    'pharmaceutical',
    'pharmaceuticals',
    'pharmaceuticalsco',
    'pharmaceuticalco',
    'manufacturer',
    'importer',
    'imports',
    'distributor',
    'distribution',
    'agent',
    'agency',
    'laboratories',
    'laboratory',
    'شرکت',
    'کمپنی',
    'کمپنى',
    'کمپاني',
    'تولیدکننده',
    'توليدکننده',
    'تولید',
    'توليد',
    'واردکننده',
    'واردکنند',
    'واردات',
    'توزیع',
    'توزيع',
    'توزیعکننده',
    'توزيعکننده',
    'نماینده',
    'نماينده',
    'لابراتوار',
    'لابراتوارها'
]);
const LOCATION_NOISE_TOKENS = new Set([
    'afghan',
    'afghanistan',
    'kabul'
]);
const tokenizeRawWords = (value: string): string[] => {
    return cleanManufacturerText(value)
        .toLowerCase()
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean);
};
const hasWeakIdentityOnly = (value: string): boolean => {
    const rawTokens = tokenizeRawWords(value);
    if (!rawTokens.length)
        return true;
    const meaningfulTokens = rawTokens.filter((token) => !COMPANY_NOISE_TOKENS.has(token) && !LOCATION_NOISE_TOKENS.has(token));
    if (!meaningfulTokens.length)
        return true;
    if (meaningfulTokens.length === 1 && meaningfulTokens[0].length <= 2)
        return true;
    return false;
};
const cleanManufacturerText = (value?: string | null): string => {
    return (value || '')
        .replace(/[\u2010-\u2015]/g, '-')
        .replace(/[()[\]{}]/g, ' ')
        .replace(/[.,_/\\]+/g, ' ')
        .replace(/\s*-\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[^A-Za-z0-9\u0600-\u06FF]+|[^A-Za-z0-9\u0600-\u06FF]+$/g, '')
        .trim();
};
const tokenizeIdentity = (value: string): string[] => {
    const cleaned = cleanManufacturerText(value).toLowerCase();
    const rawTokens = cleaned
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean);
    const tokens: string[] = [];
    rawTokens.forEach((token) => {
        if (COMPANY_NOISE_TOKENS.has(token) || LOCATION_NOISE_TOKENS.has(token))
            return;
        if (!tokens.includes(token))
            tokens.push(token);
    });
    if (tokens.length > 0)
        return tokens;
    return rawTokens;
};
const hasReadableTitleCase = (value: string) => {
    const words = cleanManufacturerText(value).split(/\s+/).filter(Boolean);
    if (!words.length)
        return false;
    return words.some((word) => /^[A-Z][a-z0-9]+/.test(word));
};
const isAllCapsSingleWord = (value: string) => {
    const cleaned = cleanManufacturerText(value);
    return cleaned.split(/\s+/).length === 1 && cleaned.length <= 8 && /[A-Z]/.test(cleaned) && cleaned === cleaned.toUpperCase();
};
const scoreDisplayName = (value: string) => {
    const cleaned = cleanManufacturerText(value);
    const identityTokens = tokenizeIdentity(cleaned);
    const normalizedTokens = cleaned
        .toLowerCase()
        .split(/\s+/);
    const locationPenalty = normalizedTokens.filter((token) => LOCATION_NOISE_TOKENS.has(token)).length;
    const punctuationPenalty = (/^[^A-Za-z0-9\u0600-\u06FF]/.test(value.trim()) ? 10 : 0) + ((value.match(/[()[\]{}.,]/g) || []).length);
    const meaningfulLength = identityTokens.join(' ').length || cleaned.length;
    return (identityTokens.length * 48 +
        meaningfulLength +
        Math.min(cleaned.length, 60) / 3 +
        (cleaned.split(/\s+/).filter(Boolean).length > 1 ? 6 : 0) +
        (hasReadableTitleCase(cleaned) ? 8 : 0) -
        (cleaned.toLowerCase() === cleaned && cleaned.split(/\s+/).length > 1 ? 6 : 0) -
        (isAllCapsSingleWord(cleaned) ? 24 : 0) -
        locationPenalty * 10 -
        punctuationPenalty);
};
const createRecord = (value: string): ManufacturerRecord => {
    const cleanedName = cleanManufacturerText(value);
    const identityTokens = tokenizeIdentity(cleanedName);
    const fingerprint = identityTokens.join(' ');
    const condensedKey = identityTokens.join('');
    return {
        cleanedName,
        cleanedLower: cleanedName.toLowerCase(),
        displayName: cleanedName,
        fingerprint,
        condensedKey,
        identityTokens,
        aliases: [],
        searchText: ''
    };
};
const registerAlias = (target: Record<string, string>, canonicalName: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed)
        target[trimmed] = canonicalName;
};
export const buildManufacturerDirectoryFromNames = (names: string[]): ManufacturerDirectory => {
    const uniqueValues = Array.from(new Set(names
        .map((name) => cleanManufacturerText(name))
        .filter(Boolean)));
    const grouped = new Map<string, string[]>();
    uniqueValues.forEach((name) => {
        const record = createRecord(name);
        const key = record.condensedKey || record.fingerprint || record.cleanedLower;
        const bucket = grouped.get(key) || [];
        bucket.push(name);
        grouped.set(key, bucket);
    });
    const aliasMap: Record<string, string> = {};
    const records: Record<string, ManufacturerRecord> = {};
    Array.from(grouped.values()).forEach((variants) => {
        const canonicalName = [...variants].sort((a, b) => scoreDisplayName(b) - scoreDisplayName(a))[0];
        const canonicalRecord = createRecord(canonicalName);
        canonicalRecord.aliases = [...variants].sort((a, b) => a.localeCompare(b));
        canonicalRecord.searchText = Array.from(new Set([
            canonicalRecord.cleanedLower,
            canonicalRecord.fingerprint,
            canonicalRecord.condensedKey,
            ...canonicalRecord.aliases.map((alias) => cleanManufacturerText(alias).toLowerCase())
        ]))
            .filter(Boolean)
            .join(' ');
        records[canonicalName] = canonicalRecord;
        canonicalRecord.aliases.forEach((alias) => {
            const aliasRecord = createRecord(alias);
            registerAlias(aliasMap, canonicalName, cleanManufacturerText(alias).toLowerCase());
            registerAlias(aliasMap, canonicalName, aliasRecord.fingerprint);
            registerAlias(aliasMap, canonicalName, aliasRecord.condensedKey);
        });
        registerAlias(aliasMap, canonicalName, canonicalRecord.cleanedLower);
        registerAlias(aliasMap, canonicalName, canonicalRecord.fingerprint);
        registerAlias(aliasMap, canonicalName, canonicalRecord.condensedKey);
    });
    const canonicalNames = Object.keys(records).sort((a, b) => a.localeCompare(b));
    return { canonicalNames, aliasMap, records };
};
export const buildManufacturerDirectory = (medicines: Array<Pick<Medicine, 'manufacturer'> | null | undefined>): ManufacturerDirectory => {
    return buildManufacturerDirectoryFromNames(medicines.map((medicine) => (typeof medicine?.manufacturer === 'string' ? medicine.manufacturer : '')));
};
export const canonicalizeManufacturerName = (value: string, directory: ManufacturerDirectory): ManufacturerCanonicalizationResult => {
    const cleanedValue = cleanManufacturerText(value);
    const record = createRecord(cleanedValue);
    const exactCanonical = directory.aliasMap[record.cleanedLower] || '';
    const allowFuzzyCanonicalMatch = !hasWeakIdentityOnly(cleanedValue);
    const canonicalName = exactCanonical ||
        (allowFuzzyCanonicalMatch ? directory.aliasMap[record.fingerprint] : '') ||
        (allowFuzzyCanonicalMatch && record.condensedKey.length >= 5 ? directory.aliasMap[record.condensedKey] : '') ||
        '';
    const displayName = canonicalName || cleanedValue;
    const matchedCanonical = !!canonicalName;
    return {
        input: value,
        cleanedValue,
        displayName,
        fingerprint: record.fingerprint,
        condensedKey: record.condensedKey,
        matchedCanonical,
        wasCanonicalized: matchedCanonical && displayName !== cleanedValue
    };
};
export const canonicalizeMedicineManufacturers = (medicines: Medicine[]): ManufacturerNormalizationSummary => {
    const directory = buildManufacturerDirectory(medicines);
    let changedCount = 0;
    const normalizedMedicines = medicines.map((medicine) => {
        if (!medicine || typeof medicine !== 'object') {
            return medicine;
        }
        const currentManufacturer = typeof medicine.manufacturer === 'string' ? medicine.manufacturer : '';
        const canonical = canonicalizeManufacturerName(currentManufacturer, directory);
        if (!canonical.displayName || canonical.displayName === currentManufacturer) {
            return medicine;
        }
        changedCount += 1;
        return {
            ...medicine,
            manufacturer: canonical.displayName
        };
    });
    return {
        medicines: normalizedMedicines,
        directory,
        changedCount
    };
};
export const matchesManufacturerSearch = (manufacturer: string, rawQuery: string, directory: ManufacturerDirectory): boolean => {
    const query = cleanManufacturerText(rawQuery).toLowerCase();
    if (!query)
        return true;
    const canonical = canonicalizeManufacturerName(manufacturer, directory);
    const canonicalRecord = directory.records[canonical.displayName];
    if (!canonicalRecord) {
        return canonical.cleanedValue.toLowerCase().includes(query) || canonical.condensedKey.includes(query.replace(/\s+/g, ''));
    }
    const normalizedQuery = createRecord(query);
    return (canonicalRecord.searchText.includes(query) ||
        (!!normalizedQuery.fingerprint && canonicalRecord.searchText.includes(normalizedQuery.fingerprint)) ||
        (!!normalizedQuery.condensedKey && canonicalRecord.searchText.includes(normalizedQuery.condensedKey)));
};
export const getManufacturerSuggestions = (rawInput: string, directory: ManufacturerDirectory, limit = 8): string[] => {
    const query = cleanManufacturerText(rawInput);
    if (!query)
        return directory.canonicalNames.slice(0, limit);
    const normalizedQuery = createRecord(query);
    return directory.canonicalNames
        .filter((name) => {
        const record = directory.records[name];
        return (record.searchText.includes(query.toLowerCase()) ||
            (!!normalizedQuery.fingerprint && record.searchText.includes(normalizedQuery.fingerprint)) ||
            (!!normalizedQuery.condensedKey && record.searchText.includes(normalizedQuery.condensedKey)));
    })
        .slice(0, limit);
};
export const shortlistKnownManufacturers = (rawInput: string, directory: ManufacturerDirectory, limit = 8): string[] => {
    const query = createRecord(rawInput);
    if (!query.cleanedName)
        return directory.canonicalNames.slice(0, limit);
    return directory.canonicalNames
        .map((name) => {
        const record = directory.records[name];
        let score = 0;
        if (record.condensedKey && record.condensedKey === query.condensedKey)
            score += 100;
        if (record.fingerprint && record.fingerprint === query.fingerprint)
            score += 90;
        if (query.cleanedLower && record.searchText.includes(query.cleanedLower))
            score += 40;
        if (query.condensedKey && record.condensedKey.includes(query.condensedKey))
            score += 30;
        score -= Math.abs(record.cleanedName.length - query.cleanedName.length);
        return { name, score };
    })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((item) => item.name);
};
