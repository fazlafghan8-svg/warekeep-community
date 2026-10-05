import type { MedicineClinicalSummary } from '../types';
export type IdentifyScanProfile = 'fast' | 'balanced' | 'accurate';
// Local text cleanup for inventory notes; no generation or network requests.
const cleanJsonCandidate = (raw: string): string => {
    const cleaned = (raw || '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
    if (!cleaned)
        return cleaned;
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        return cleaned.slice(firstBrace, lastBrace + 1);
    }
    return cleaned;
};
const normalizeJsonQuotes = (value: string): string => value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
const removeTrailingJsonCommas = (value: string): string => value.replace(/,\s*([}\]])/g, '$1');
const findSafeJsonCommaPositions = (value: string): number[] => {
    const commaPositions: number[] = [];
    const stack: string[] = [];
    let inString = false;
    let escape = false;
    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (escape) {
            escape = false;
            continue;
        }
        if (inString) {
            if (character === '\\') {
                escape = true;
            }
            else if (character === '"') {
                inString = false;
            }
            continue;
        }
        if (character === '"') {
            inString = true;
            continue;
        }
        if (character === '{') {
            stack.push('}');
            continue;
        }
        if (character === '[') {
            stack.push(']');
            continue;
        }
        if (character === '}' || character === ']') {
            if (stack[stack.length - 1] === character) {
                stack.pop();
            }
            continue;
        }
        if (character === ',' && stack.length > 0) {
            commaPositions.push(index);
        }
    }
    return commaPositions;
};
const closeTruncatedJsonCandidate = (value: string): string => {
    let working = value.trimEnd();
    const stack: string[] = [];
    let inString = false;
    let escape = false;
    for (let index = 0; index < working.length; index += 1) {
        const character = working[index];
        if (escape) {
            escape = false;
            continue;
        }
        if (inString) {
            if (character === '\\') {
                escape = true;
            }
            else if (character === '"') {
                inString = false;
            }
            continue;
        }
        if (character === '"') {
            inString = true;
            continue;
        }
        if (character === '{') {
            stack.push('}');
        }
        else if (character === '[') {
            stack.push(']');
        }
        else if ((character === '}' || character === ']') && stack[stack.length - 1] === character) {
            stack.pop();
        }
    }
    while (/[,:]\s*$/.test(working)) {
        const commaPositions = findSafeJsonCommaPositions(working);
        if (!commaPositions.length) {
            working = working.replace(/[,:]\s*$/g, '').trimEnd();
            break;
        }
        working = working.slice(0, commaPositions[commaPositions.length - 1]).trimEnd();
    }
    if (inString) {
        if (working.endsWith('\\')) {
            working += '\\';
        }
        working += '"';
    }
    working = removeTrailingJsonCommas(working).replace(/,\s*$/g, '');
    for (let index = stack.length - 1; index >= 0; index -= 1) {
        working += stack[index];
    }
    return removeTrailingJsonCommas(working);
};
const buildJsonRepairCandidates = (raw: string): string[] => {
    const cleaned = cleanJsonCandidate(raw);
    const normalized = normalizeJsonQuotes(cleaned);
    const baseCandidates = Array.from(new Set([cleaned, normalized].filter(Boolean)));
    const repairCandidates: string[] = [];
    const pushCandidate = (candidate: string) => {
        const trimmed = candidate.trim();
        if (!trimmed || repairCandidates.includes(trimmed))
            return;
        repairCandidates.push(trimmed);
    };
    for (const candidate of baseCandidates) {
        pushCandidate(candidate);
        pushCandidate(removeTrailingJsonCommas(candidate));
        pushCandidate(closeTruncatedJsonCandidate(candidate));
        pushCandidate(closeTruncatedJsonCandidate(removeTrailingJsonCommas(candidate)));
        let truncated = candidate;
        for (let attempt = 0; attempt < 4; attempt += 1) {
            const commaPositions = findSafeJsonCommaPositions(truncated);
            if (!commaPositions.length)
                break;
            truncated = truncated.slice(0, commaPositions[commaPositions.length - 1]).trimEnd();
            pushCandidate(closeTruncatedJsonCandidate(truncated));
        }
    }
    return repairCandidates;
};
const parseJsonLoose = (raw: string): any => {
    const candidates = buildJsonRepairCandidates(raw);
    let lastError: unknown = null;
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        }
        catch (error) {
            lastError = error;
        }
    }
    throw lastError instanceof Error ? lastError : new SyntaxError('Unexpected end of JSON input');
};
const cleanSingleLineText = (value: string): string => {
    return (value || '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/^["'`\s]+|["'`\s]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};
const DESCRIPTION_MAX_WORDS = 340;
const DESCRIPTION_MAX_SENTENCES = 10;
const CLINICAL_SUMMARY_FIELD_MAX_WORDS = 56;
const CLINICAL_SUMMARY_FIELD_MAX_SENTENCES = 3;
const CLINICAL_SUMMARY_USE_MAX_WORDS = 85;
const CLINICAL_SUMMARY_USE_MAX_SENTENCES = 4;
const trimToWordLimit = (value: string, maxWords: number): string => {
    const words = cleanSingleLineText(value).split(' ').filter(Boolean);
    if (words.length <= maxWords)
        return words.join(' ');
    return words.slice(0, maxWords).join(' ');
};
const limitToSentenceCount = (value: string, maxSentences: number): string => {
    const sentences = value
        .match(/[^.!?؟]+[.!?؟]?/g)
        ?.map((sentence) => sentence.trim())
        .filter(Boolean) || [];
    if (!sentences.length)
        return value.trim();
    return sentences.slice(0, maxSentences).join(' ').trim();
};
const extractDescriptionLikeValue = (raw: string): string => {
    const trimmed = (raw || '').trim();
    if (!trimmed)
        return '';
    const candidate = cleanJsonCandidate(trimmed);
    if ((candidate.startsWith('{') && candidate.endsWith('}')) ||
        (candidate.startsWith('[') && candidate.endsWith(']'))) {
        try {
            const parsed = JSON.parse(candidate);
            if (typeof parsed === 'string')
                return parsed;
            if (parsed && typeof parsed === 'object') {
                if (typeof parsed.description === 'string')
                    return parsed.description;
                if (typeof parsed.summary === 'string')
                    return parsed.summary;
                if (typeof parsed.note === 'string')
                    return parsed.note;
                if (Array.isArray(parsed)) {
                    const firstText = parsed.find((item) => typeof item === 'string');
                    if (typeof firstText === 'string')
                        return firstText;
                }
            }
        }
        catch {
            // Fall through to regex extraction.
        }
    }
    const descriptionMatch = candidate.match(/["'`]?description["'`]?\s*:\s*("([^"]+)"|'([^']+)'|`([^`]+)`|([^,}\]]+))/i);
    if (descriptionMatch) {
        return (descriptionMatch[2] ||
            descriptionMatch[3] ||
            descriptionMatch[4] ||
            descriptionMatch[5] ||
            '');
    }
    return trimmed;
};
export const sanitizeMedicineDescription = (value: unknown, options?: {
    maxSentences?: number;
    maxWords?: number;
}): string => {
    if (typeof value !== 'string')
        return '';
    const maxSentences = options?.maxSentences ?? DESCRIPTION_MAX_SENTENCES;
    const maxWords = options?.maxWords ?? DESCRIPTION_MAX_WORDS;
    let normalized = extractDescriptionLikeValue(value)
        .replace(/```(?:json|text|markdown)?/gi, ' ')
        .replace(/```/g, ' ')
        .replace(/^[\s"'`([{]+|[\s"'`)\]}]+$/g, ' ')
        .replace(/^\s*(description|medicine description|summary|note|تفصیلات|توضیحات|خلاصه|شرح)\s*[:：-]\s*/i, '')
        .replace(/(?:^|\s)[-*•]+\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized)
        return '';
    normalized = cleanSingleLineText(normalized);
    normalized = limitToSentenceCount(normalized, maxSentences);
    normalized = trimToWordLimit(normalized, maxWords)
        .replace(/\s+([.!?؟,:;،])/g, '$1')
        .replace(/[,:;،\s]+$/g, '')
        .trim();
    return normalized;
};
const sanitizeClinicalSummaryField = (value: unknown, field?: keyof MedicineClinicalSummary): string => {
    if (typeof value !== 'string')
        return '';
    return sanitizeMedicineDescription(value, {
        maxSentences: field === 'use' ? CLINICAL_SUMMARY_USE_MAX_SENTENCES : CLINICAL_SUMMARY_FIELD_MAX_SENTENCES,
        maxWords: field === 'use' ? CLINICAL_SUMMARY_USE_MAX_WORDS : CLINICAL_SUMMARY_FIELD_MAX_WORDS
    });
};
export const sanitizeMedicineClinicalSummary = (value: unknown): MedicineClinicalSummary | undefined => {
    let candidate: any = value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed)
            return undefined;
        try {
            candidate = parseJsonLoose(trimmed);
        }
        catch {
            return undefined;
        }
    }
    if (!candidate || typeof candidate !== 'object')
        return undefined;
    const rawSummary = candidate.clinicalSummary && typeof candidate.clinicalSummary === 'object'
        ? candidate.clinicalSummary
        : candidate;
    const summary: MedicineClinicalSummary = {
        composition: sanitizeClinicalSummaryField(rawSummary.composition, 'composition'),
        use: sanitizeClinicalSummaryField(rawSummary.use, 'use'),
        dose: sanitizeClinicalSummaryField(rawSummary.dose, 'dose'),
        mechanism: sanitizeClinicalSummaryField(rawSummary.mechanism, 'mechanism'),
        sideEffects: sanitizeClinicalSummaryField(rawSummary.sideEffects || rawSummary.side_effects || rawSummary.adverseEffects || rawSummary.adverse_effects, 'sideEffects'),
        caution: sanitizeClinicalSummaryField(rawSummary.caution, 'caution')
    };
    const hasContent = Object.values(summary).some((item) => item.trim().length > 0);
    if (!hasContent)
        return undefined;
    const generatedAt = typeof rawSummary.generatedAt === 'string' ? rawSummary.generatedAt.trim() : '';
    return generatedAt ? { ...summary, generatedAt } : summary;
};
