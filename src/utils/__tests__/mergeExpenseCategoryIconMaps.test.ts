import { describe, expect, it } from 'vitest';
import { mergeExpenseCategoryIconMaps } from '../syncLogic';

const manual = { icon: 'gem', color: 'purple', source: 'manual' };
const auto = { icon: 'tag', color: 'slate', source: 'default' };
const exact = { icon: 'zap', color: 'amber', source: 'exact' };

describe('mergeExpenseCategoryIconMaps', () => {
    it('returns undefined when neither side has a map', () => {
        expect(mergeExpenseCategoryIconMaps(undefined, undefined)).toBeUndefined();
        expect(mergeExpenseCategoryIconMaps(null, 'nonsense')).toBeUndefined();
    });

    it('unions keys from both sides', () => {
        const merged = mergeExpenseCategoryIconMaps({ a: exact }, { b: auto });
        expect(merged).toEqual({ a: exact, b: auto });
    });

    it('a manual pick on the non-preferred side beats an automatic entry on the preferred side', () => {
        const merged = mergeExpenseCategoryIconMaps({ 'چای': auto }, { 'چای': manual });
        expect(merged?.['چای']).toBe(manual);
    });

    it('the preferred side wins when both entries are manual or both automatic', () => {
        const otherManual = { icon: 'coffee', color: 'teal', source: 'manual' };
        expect(mergeExpenseCategoryIconMaps({ x: manual }, { x: otherManual })?.x).toBe(manual);
        expect(mergeExpenseCategoryIconMaps({ x: exact }, { x: auto })?.x).toBe(exact);
    });

    it('takes whole entries — never field-mixes a truncated remote entry into a local one', () => {
        const truncated = { icon: 'zap' };
        const merged = mergeExpenseCategoryIconMaps(truncated ? { x: truncated } : {}, { x: manual });
        // manual (other side) wins over the non-manual truncated entry, verbatim
        expect(merged?.x).toBe(manual);
    });

    it('drops garbage entries but keeps the valid side', () => {
        const merged = mergeExpenseCategoryIconMaps({ x: 'garbage', y: exact }, { x: manual });
        expect(merged?.x).toBe(manual);
        expect(merged?.y).toBe(exact);
    });
});
